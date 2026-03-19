import { describe, expect, it } from "vitest";
import {
  buildDailyDigestSearchPlans,
  DAILY_DIGEST_SCREENSHOT,
  parseArticlesFromLLMOutput,
  renderDailyDigestHtml,
  resolveDailyDigestQueries,
  selectDigestArticles,
  type DailyDigestSelection,
  type DigestArticle,
} from "../../src/skills/daily-digest/index.js";

describe("parseArticlesFromLLMOutput", () => {
  it("parses anthropic text blocks and normalizes category values", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `Here is the result:
[
  {"title":"A","url":"https://example.cn/a","summary":"sa","source":"S1","category":"国内"},
  {"title":"B","url":"https://example.com/b","summary":"","source":"S2","category":"international"}
]`,
      },
    ]);

    expect(articles).toEqual([
      { title: "A", url: "https://example.cn/a", summary: "sa", source: "S1", category: "domestic" },
      { title: "B", url: "https://example.com/b", summary: "", source: "S2", category: "international" },
    ]);
  });

  it("parses fenced json blocks", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `\`\`\`json
[
  {"title":"A","url":"https://example.com/a","summary":"","source":"S1","category":"domestic"}
]
\`\`\``,
      },
    ]);

    expect(articles).toEqual([
      { title: "A", url: "https://example.com/a", summary: "", source: "S1", category: "domestic" },
    ]);
  });

  it("salvages near-json when titles contain unescaped quotes", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `\`\`\`json
[
  {"title":"AWE会场"含科量"高 AI重构未来科技生活新范式","url":"https://example.com/a","summary":"","source":"S1","category":"international"}
]
\`\`\``,
      },
    ]);

    expect(articles).toEqual([
      {
        title: 'AWE会场"含科量"高 AI重构未来科技生活新范式',
        url: "https://example.com/a",
        summary: "",
        source: "S1",
        category: "international",
      },
    ]);
  });

  it("returns undefined for invalid output", () => {
    expect(parseArticlesFromLLMOutput([{ type: "text", text: "not json" }])).toBeUndefined();
  });
});

describe("selectDigestArticles", () => {
  it("enforces domestic 10 and international 5 quotas", () => {
    const domestic = Array.from({ length: 12 }, (_, index) => createArticle(`D${index}`, "domestic"));
    const international = Array.from({ length: 7 }, (_, index) => createArticle(`I${index}`, "international"));

    const selection = selectDigestArticles([...domestic, ...international], {
      domestic: 10,
      international: 5,
    });

    expect(selection.domestic).toHaveLength(10);
    expect(selection.international).toHaveLength(5);
    expect(selection.all).toHaveLength(15);
    expect(selection.domestic.every((article) => article.category === "domestic")).toBe(true);
    expect(selection.international.every((article) => article.category === "international")).toBe(true);
  });

  it("excludes blocked Tonghuashun articles from the final selection", () => {
    const selection = selectDigestArticles([
      createArticle("blocked", "domestic", {
        url: "https://news.10jqka.com.cn/20260319/c675392020.shtml",
        source: "同花顺",
      }),
      createArticle("safe", "domestic"),
      createArticle("intl", "international"),
    ], {
      domestic: 2,
      international: 1,
    });

    expect(selection.domestic).toHaveLength(1);
    expect(selection.domestic[0]?.title).toBe("safe");
    expect(selection.all.some((article) => article.url.includes("10jqka.com.cn"))).toBe(false);
  });
});

describe("resolveDailyDigestQueries", () => {
  it("uses configured queries when present", () => {
    expect(resolveDailyDigestQueries(["  国内AI  ", "国际AI", "国内AI"], ["fallback"])).toEqual(["国内AI", "国际AI"]);
  });

  it("falls back to defaults when configured queries are empty", () => {
    expect(resolveDailyDigestQueries(["", "   "], ["fallback-a", "fallback-b"])).toEqual(["fallback-a", "fallback-b"]);
  });
});

describe("buildDailyDigestSearchPlans", () => {
  it("expands neutral queries into domestic and international searches", () => {
    expect(buildDailyDigestSearchPlans(["AI", "教育"])).toEqual([
      { query: "AI", searchText: "国内AI", hintCategory: "domestic" },
      { query: "AI", searchText: "国际AI", hintCategory: "international" },
      { query: "教育", searchText: "国内教育", hintCategory: "domestic" },
      { query: "教育", searchText: "国际教育", hintCategory: "international" },
    ]);
  });

  it("keeps explicitly scoped queries as single-category searches", () => {
    expect(buildDailyDigestSearchPlans(["国内AI", "国际AI", "OpenAI"])).toEqual([
      { query: "国内AI", searchText: "国内AI", hintCategory: "domestic" },
      { query: "国际AI", searchText: "国际AI", hintCategory: "international" },
      { query: "OpenAI", searchText: "OpenAI", hintCategory: "international" },
    ]);
  });
});

describe("renderDailyDigestHtml", () => {
  it("fills html templates with grouped article markup", () => {
    const selection: DailyDigestSelection = {
      domestic: [createArticle("A", "domestic")],
      international: [createArticle("B", "international")],
      all: [createArticle("A", "domestic"), createArticle("B", "international")],
    };

    const html = renderDailyDigestHtml(selection, "2026年3月19日");

    expect(html).toContain("<style>");
    expect(html).toContain(".news-section");
    expect(html).toContain("2026.03.19");
    expect(html).toContain("AI x 教育日报");
    expect(html).not.toContain("科技新闻");
    expect(html).toContain("真正重要的，不是更快，而是更准。");
    expect(html).toContain("国内主线");
    expect(html).toContain("国内科技");
    expect(html).toContain("国际科技");
    expect(html).toContain("国内焦点集中在A summary。");
    expect(html).toContain("国际方面重点关注B summary。");
    expect(html).toContain("https://example.com/A");
    expect(html).toContain("https://example.com/B");
    expect(html).not.toContain("Browser-searched");
    expect(html).not.toContain("LOCAL SIGNAL");
    expect(html).not.toContain("GLOBAL SIGNAL");
    expect(html).not.toContain("backdrop-filter");
    expect(html).not.toContain("filter: blur(");
    expect(html).not.toContain("{{");
  });
});

describe("DAILY_DIGEST_SCREENSHOT", () => {
  it("uses 4x device scale for high-resolution screenshots", () => {
    expect(DAILY_DIGEST_SCREENSHOT).toEqual({
      width: 1080,
      height: 1400,
      deviceScaleFactor: 4,
    });
  });
});

function createArticle(
  seed: string,
  category: DigestArticle["category"],
  overrides: Partial<DigestArticle> = {},
): DigestArticle {
  return {
    title: seed,
    url: `https://example.com/${seed}`,
    summary: `${seed} summary`,
    source: `${seed} source`,
    category,
    ...overrides,
  };
}
