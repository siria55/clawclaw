import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NewsStorage } from "../../src/news/storage.js";

let dir: string;
let filePath: string;
let storage: NewsStorage;

beforeEach(() => {
  dir = join(tmpdir(), `clawclaw-news-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  filePath = join(dir, "news.json");
  storage = new NewsStorage(filePath);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeArticle(overrides: Partial<Parameters<NewsStorage["save"]>[0]> = {}) {
  return storage.save({
    title: "Test Article",
    url: "https://example.com",
    summary: "A test summary",
    source: "TestSource",
    tags: [],
    ...overrides,
  });
}

describe("NewsStorage", () => {
  it("save() assigns id and savedAt automatically", () => {
    const article = makeArticle();
    expect(article.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(article.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("all() returns all saved articles", () => {
    makeArticle({ title: "A" });
    makeArticle({ title: "B" });
    expect(storage.all()).toHaveLength(2);
  });

  it("all() returns empty array when file does not exist", () => {
    const fresh = new NewsStorage(join(dir, "nonexistent.json"));
    expect(fresh.all()).toEqual([]);
  });

  it("data persists across instances", () => {
    makeArticle({ title: "Persisted" });
    const another = new NewsStorage(filePath);
    expect(another.all()[0].title).toBe("Persisted");
  });

  it("query() returns articles sorted by savedAt descending", async () => {
    makeArticle({ title: "First" });
    await new Promise((r) => setTimeout(r, 5)); // ensure different savedAt
    makeArticle({ title: "Second" });
    const result = storage.query();
    expect(result.articles[0].title).toBe("Second");
    expect(result.articles[1].title).toBe("First");
  });

  it("query() filters by keyword in title", () => {
    makeArticle({ title: "AI breakthrough", summary: "boring summary" });
    makeArticle({ title: "Sports news", summary: "boring summary" });
    const result = storage.query({ q: "ai" });
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toBe("AI breakthrough");
  });

  it("query() filters by keyword in summary", () => {
    makeArticle({ title: "News", summary: "Quantum computing advances" });
    makeArticle({ title: "News", summary: "Nothing special" });
    const result = storage.query({ q: "quantum" });
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].summary).toContain("Quantum");
  });

  it("query() filters by tag", () => {
    makeArticle({ tags: ["tech", "ai"] });
    makeArticle({ tags: ["sports"] });
    const result = storage.query({ tag: "tech" });
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].tags).toContain("tech");
  });

  it("query() returns correct total and paginates", () => {
    for (let i = 0; i < 5; i++) makeArticle({ title: `Article ${i}` });
    const result = storage.query({ page: 1, pageSize: 2 });
    expect(result.total).toBe(5);
    expect(result.articles).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
  });

  it("query() second page returns correct slice", () => {
    for (let i = 0; i < 5; i++) makeArticle({ title: `Article ${i}` });
    const result = storage.query({ page: 2, pageSize: 2 });
    expect(result.articles).toHaveLength(2);
    expect(result.page).toBe(2);
  });

  it("query() last page may have fewer items", () => {
    for (let i = 0; i < 5; i++) makeArticle({ title: `Article ${i}` });
    const result = storage.query({ page: 3, pageSize: 2 });
    expect(result.articles).toHaveLength(1);
  });

  it("query() returns empty result when no match", () => {
    makeArticle({ title: "Tech news" });
    const result = storage.query({ q: "zzznomatch" });
    expect(result.articles).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
