import { describe, expect, it } from "vitest";
import {
  buildDailyDigestSearchPlans,
  buildBraveNewsSearchUrl,
  buildDailyDigestExtractionPrompt,
  DAILY_DIGEST_SCREENSHOT,
  DAILY_DIGEST_EXTRACTION_SYSTEM,
  parseArticlesFromLLMOutput,
  parseBraveNewsSearchResponse,
  renderDailyDigestHtml,
  renderDailyDigestMarkdown,
  resolveDailyDigestQueries,
  selectDigestArticles,
  type DailyDigestSelection,
  type DigestArticle,
} from "../../src/skills/daily-digest/index.js";

describe("parseBraveNewsSearchResponse", () => {
  it("maps Brave results into digest candidate links", () => {
    const links = parseBraveNewsSearchResponse({
      results: [
        {
          title: "OpenAI 发布新模型",
          url: "https://www.reuters.com/technology/openai-model",
          description: "Reuters summary",
          age: "2h",
          meta_url: {
            netloc: "Reuters",
            hostname: "www.reuters.com",
          },
        },
      ],
    }, "international");

    expect(links).toEqual([
      {
        text: "OpenAI 发布新模型",
        href: "https://www.reuters.com/technology/openai-model",
        hintCategory: "international",
        source: "Reuters",
        summary: "Reuters summary",
        publishedAt: "2小时前",
      },
    ]);
  });

  it("prefers page_age as a normalized published time", () => {
    const links = parseBraveNewsSearchResponse({
      results: [
        {
          title: "教育 AI 新进展",
          url: "https://www.thepaper.cn/newsDetail_forward_123",
          description: "desc",
          age: "2h",
          page_age: "2026-03-30T01:12:00Z",
          meta_url: {
            netloc: "澎湃新闻",
          },
        },
      ],
    }, "domestic");

    expect(links[0]?.publishedAt).toBe("2026-03-30 09:12");
  });
});

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

  it("applies publishedAt from link hints when available", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `[
  {"title":"A","url":"https://example.com/a","summary":"","source":"S1","category":"domestic"}
]`,
      },
    ], new Map([
      ["https://example.com/a", { category: "domestic" as const, publishedAt: "2小时前" }],
    ]), "2026-03-30");

    expect(articles).toEqual([
      { title: "A", url: "https://example.com/a", summary: "", source: "S1", publishedAt: "2小时前", date: "2026-03-30", category: "domestic" },
    ]);
  });

  it("derives a normalized date from explicit day text", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `[
  {"title":"A","url":"https://example.com/a","summary":"","source":"S1","category":"domestic"}
]`,
      },
    ], new Map([
      ["https://example.com/a", { category: "domestic" as const, publishedAt: "3月30日 09:12" }],
    ]), "2026-03-31");

    expect(articles?.[0]?.date).toBe("2026-03-30");
  });

  it("derives a normalized date from relative day text", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `[
  {"title":"A","url":"https://example.com/a","summary":"","source":"S1","category":"domestic"}
]`,
      },
    ], new Map([
      ["https://example.com/a", { category: "domestic" as const, publishedAt: "昨天 09:12" }],
    ]), "2026-03-31");

    expect(articles?.[0]?.date).toBe("2026-03-30");
  });

  it("drops self-media articles during parsing", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `[
  {"title":"A","url":"https://baijiahao.baidu.com/s?id=123","summary":"","source":"某某百家号","category":"domestic"}
]`,
      },
    ], new Map(), "2026-03-31");

    expect(articles).toBeUndefined();
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

  it("excludes self-media articles from the final selection", () => {
    const selection = selectDigestArticles([
      createArticle("baijiahao", "domestic", {
        url: "https://baijiahao.baidu.com/s?id=123",
        source: "某某百家号",
      }),
      createArticle("sohuhao", "domestic", {
        url: "https://www.sohu.com/a/123456789_121124376",
        source: "科技观察搜狐号",
      }),
      createArticle("safe", "domestic", {
        url: "https://www.thepaper.cn/newsDetail_forward_12345678",
        source: "澎湃新闻",
      }),
    ], {
      domestic: 3,
      international: 0,
    });

    expect(selection.domestic).toHaveLength(1);
    expect(selection.domestic[0]?.title).toBe("safe");
    expect(selection.all.some((article) => article.source.includes("百家号"))).toBe(false);
    expect(selection.all.some((article) => article.source.includes("搜狐号"))).toBe(false);
  });

  it("prefers mainstream media over generic sites when quota is tight", () => {
    const selection = selectDigestArticles([
      createArticle("generic", "international", {
        url: "https://example.com/openai-update",
        source: "Some Blog",
      }),
      createArticle("reuters", "international", {
        url: "https://www.reuters.com/world/us/openai-update-2026-03-30/",
        source: "Reuters",
      }),
    ], {
      domestic: 0,
      international: 1,
    });

    expect(selection.international).toHaveLength(1);
    expect(selection.international[0]?.title).toBe("reuters");
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
      { query: "AI", searchText: "中国AI", hintCategory: "domestic" },
      { query: "AI", searchText: "国际AI", hintCategory: "international" },
      { query: "教育", searchText: "中国教育", hintCategory: "domestic" },
      { query: "教育", searchText: "国际教育", hintCategory: "international" },
    ]);
  });

  it("normalizes explicitly scoped domestic queries to China-focused search text", () => {
    expect(buildDailyDigestSearchPlans(["国内AI", "中国教育", "国际AI", "OpenAI"])).toEqual([
      { query: "国内AI", searchText: "中国AI", hintCategory: "domestic" },
      { query: "中国教育", searchText: "中国教育", hintCategory: "domestic" },
      { query: "国际AI", searchText: "国际AI", hintCategory: "international" },
      { query: "OpenAI", searchText: "OpenAI", hintCategory: "international" },
    ]);
  });
});

describe("buildBraveNewsSearchUrl", () => {
  it("restricts domestic Brave News Search to China and Chinese in the past week", () => {
    const url = new URL(buildBraveNewsSearchUrl("中国AI", 50, "domestic"));

    expect(url.searchParams.get("q")).toBe("中国AI");
    expect(url.searchParams.get("count")).toBe("20");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("spellcheck")).toBe("0");
    expect(url.searchParams.get("freshness")).toBe("pw");
    expect(url.searchParams.get("safesearch")).toBe("strict");
    expect(url.searchParams.get("country")).toBe("CN");
    expect(url.searchParams.get("search_lang")).toBe("zh-hans");
  });

  it("keeps international Brave News Search free of China-only filters", () => {
    const url = new URL(buildBraveNewsSearchUrl("OpenAI", 50, "international"));

    expect(url.searchParams.get("q")).toBe("OpenAI");
    expect(url.searchParams.get("freshness")).toBe("pw");
    expect(url.searchParams.get("country")).toBeNull();
    expect(url.searchParams.get("search_lang")).toBeNull();
  });

  it("applies custom Brave request parameters from config", () => {
    const url = new URL(buildBraveNewsSearchUrl("OpenAI", 80, "international", {
      request: {
        count: 80,
        offset: 5,
        freshness: "",
        spellcheck: true,
        safesearch: "moderate",
        uiLang: "en-US",
        extraSnippets: true,
        goggles: ["https://example.com/g1", "https://example.com/g2"],
      },
      international: {
        country: "US",
        searchLang: "en",
      },
    }));

    expect(url.searchParams.get("count")).toBe("50");
    expect(url.searchParams.get("offset")).toBe("5");
    expect(url.searchParams.get("spellcheck")).toBe("1");
    expect(url.searchParams.get("freshness")).toBeNull();
    expect(url.searchParams.get("safesearch")).toBe("moderate");
    expect(url.searchParams.get("ui_lang")).toBe("en-US");
    expect(url.searchParams.get("extra_snippets")).toBe("true");
    expect(url.searchParams.getAll("goggles")).toEqual(["https://example.com/g1", "https://example.com/g2"]);
    expect(url.searchParams.get("country")).toBe("US");
    expect(url.searchParams.get("search_lang")).toBe("en");
  });
});

describe("buildDailyDigestExtractionPrompt", () => {
  it("prioritizes education-focused news while keeping education-related tech", () => {
    const prompt = buildDailyDigestExtractionPrompt("domestic", [
      {
        text: "AI 教育公司发布新产品",
        href: "https://example.com/edu-ai",
        hintCategory: "domestic",
        source: "Example",
        summary: "summary",
        publishedAt: "2小时前",
      },
    ], 8);

    expect(DAILY_DIGEST_EXTRACTION_SYSTEM).toContain("教育科技新闻筛选器");
    expect(prompt).toContain("教育 / 教育科技 / AI 教育 / 教育公司");
    expect(prompt).toContain("优先保留教育、教育科技、AI 教育、教育公司、教育平台、教育政策、教育产品相关内容");
    expect(prompt).toContain("只有在它与教育行业、教育场景、教育产品或教育公司明显相关时才保留");
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
    expect(html).toContain("国内资讯");
    expect(html).toContain("国际资讯");
    expect(html).toContain("国内焦点集中在A summary。");
    expect(html).toContain("国际方面重点关注B summary。");
    expect(html).toContain("https://example.com/A");
    expect(html).toContain("https://example.com/B");
    expect(html).toContain('<span class="num">01</span>');
    expect(html).toContain('<span class="num">02</span>');
    expect(html).not.toContain("A time");
    expect(html).not.toContain("B time");
    expect(html).not.toContain("Browser-searched");
    expect(html).not.toContain("LOCAL SIGNAL");
    expect(html).not.toContain("GLOBAL SIGNAL");
    expect(html).not.toContain("backdrop-filter");
    expect(html).not.toContain("filter: blur(");
    expect(html).not.toContain("{{");
  });
});

describe("renderDailyDigestMarkdown", () => {
  it("renders source without published time", () => {
    const selection: DailyDigestSelection = {
      domestic: [createArticle("A", "domestic")],
      international: [createArticle("B", "international")],
      all: [createArticle("A", "domestic"), createArticle("B", "international")],
    };

    const markdown = renderDailyDigestMarkdown(selection, "2026年3月19日");

    expect(markdown).toContain("_A source_");
    expect(markdown).toContain("_B source_");
    expect(markdown).not.toContain("A time");
    expect(markdown).not.toContain("B time");
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
    publishedAt: `${seed} time`,
    date: "2026-03-30",
    category,
    ...overrides,
  };
}
