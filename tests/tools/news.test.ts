import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NewsStorage } from "../../src/news/storage.js";
import { createSaveNewsTool } from "../../src/tools/news.js";

let dir: string;
let storage: NewsStorage;

beforeEach(() => {
  dir = join(tmpdir(), `clawclaw-tool-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  storage = new NewsStorage(join(dir, "news.json"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createSaveNewsTool", () => {
  it("returns a tool named save_news", () => {
    const tool = createSaveNewsTool(storage);
    expect(tool.name).toBe("save_news");
  });

  it("execute() saves article and returns success message", async () => {
    const tool = createSaveNewsTool(storage);
    const result = await tool.execute({
      title: "AI Weekly",
      url: "https://example.com/ai",
      summary: "Latest AI news",
      source: "TechCrunch",
      tags: ["ai", "tech"],
    });
    expect(result.output).toContain("AI Weekly");
    expect(result.error).toBeUndefined();
    expect(storage.all()).toHaveLength(1);
  });

  it("execute() works without optional fields", async () => {
    const tool = createSaveNewsTool(storage);
    const result = await tool.execute({
      title: "Simple",
      url: "https://example.com",
      summary: "summary",
      source: "Source",
    });
    expect(result.output).toBeDefined();
    const articles = storage.all();
    expect(articles[0].publishedAt).toBeUndefined();
    expect(articles[0].tags).toEqual([]);
  });

  it("execute() returns error on invalid input", async () => {
    const tool = createSaveNewsTool(storage);
    const spy = vi.spyOn(storage, "save");
    // Missing required fields
    const result = await tool.execute({ title: "only title" });
    expect(result.error).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
  });
});
