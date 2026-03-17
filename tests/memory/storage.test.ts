import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStorage } from "../../src/memory/storage.js";

let dir: string;
let storage: MemoryStorage;

beforeEach(() => {
  dir = join(tmpdir(), `clawclaw-mem-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  storage = new MemoryStorage(join(dir, "memory.json"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("MemoryStorage", () => {
  it("save() assigns id and createdAt automatically", () => {
    const entry = storage.save({ content: "hello world", tags: [] });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("all() returns empty array when file does not exist", () => {
    const fresh = new MemoryStorage(join(dir, "nonexistent.json"));
    expect(fresh.all()).toEqual([]);
  });

  it("all() returns all saved entries", () => {
    storage.save({ content: "entry A", tags: [] });
    storage.save({ content: "entry B", tags: [] });
    expect(storage.all()).toHaveLength(2);
  });

  it("data persists across instances", () => {
    storage.save({ content: "persisted", tags: [] });
    const another = new MemoryStorage(join(dir, "memory.json"));
    expect(another.all()[0].content).toBe("persisted");
  });

  it("search() matches keyword in content (case-insensitive)", () => {
    storage.save({ content: "Artificial Intelligence trends", tags: [] });
    storage.save({ content: "Sports news today", tags: [] });
    const results = storage.search({ q: "intelligence" });
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain("Artificial Intelligence");
  });

  it("search() returns empty array when no match", () => {
    storage.save({ content: "hello world", tags: [] });
    const results = storage.search({ q: "zzznomatch" });
    expect(results).toHaveLength(0);
  });

  it("search() respects limit", () => {
    for (let i = 0; i < 5; i++) storage.save({ content: `item ${i} keyword`, tags: [] });
    const results = storage.search({ q: "keyword", limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("search() returns snippet capped at 200 chars", () => {
    const longContent = "keyword " + "x".repeat(300);
    storage.save({ content: longContent, tags: [] });
    const results = storage.search({ q: "keyword" });
    expect(results[0].snippet.length).toBeLessThanOrEqual(200);
  });

  it("search() sorts by createdAt descending", async () => {
    storage.save({ content: "first keyword", tags: [] });
    await new Promise((r) => setTimeout(r, 5));
    storage.save({ content: "second keyword", tags: [] });
    const results = storage.search({ q: "keyword" });
    expect(results[0].snippet).toContain("second");
    expect(results[1].snippet).toContain("first");
  });

  it("get() returns entry by id", () => {
    const saved = storage.save({ content: "find me", tags: ["t1"] });
    const found = storage.get(saved.id);
    expect(found?.content).toBe("find me");
    expect(found?.tags).toEqual(["t1"]);
  });

  it("get() returns undefined for unknown id", () => {
    expect(storage.get("no-such-id")).toBeUndefined();
  });
});
