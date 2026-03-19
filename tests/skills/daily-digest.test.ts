import { describe, expect, it } from "vitest";
import { parseArticlesFromLLMOutput } from "../../src/skills/daily-digest/index.js";

describe("parseArticlesFromLLMOutput", () => {
  it("parses anthropic text blocks", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `Here is the result:
[
  {"title":"A","url":"https://example.com/a","summary":"sa","source":"S1"},
  {"title":"B","url":"https://example.com/b","summary":"","source":"S2"}
]`,
      },
    ]);

    expect(articles).toEqual([
      { title: "A", url: "https://example.com/a", summary: "sa", source: "S1" },
      { title: "B", url: "https://example.com/b", summary: "", source: "S2" },
    ]);
  });

  it("parses fenced json blocks", () => {
    const articles = parseArticlesFromLLMOutput([
      {
        type: "text",
        text: `\`\`\`json
[
  {"title":"A","url":"https://example.com/a","summary":"","source":"S1"}
]
\`\`\``,
      },
    ]);

    expect(articles).toEqual([
      { title: "A", url: "https://example.com/a", summary: "", source: "S1" },
    ]);
  });

  it("returns undefined for invalid output", () => {
    expect(parseArticlesFromLLMOutput([{ type: "text", text: "not json" }])).toBeUndefined();
  });
});
