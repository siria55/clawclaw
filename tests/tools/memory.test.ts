import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStorage } from "../../src/memory/storage.js";
import { createMemoryTools } from "../../src/tools/memory.js";

let dir: string;
let storage: MemoryStorage;

beforeEach(() => {
  dir = join(tmpdir(), `clawclaw-mem-tool-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  storage = new MemoryStorage(join(dir, "memory.json"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createMemoryTools", () => {
  it("returns three tools with correct names", () => {
    const tools = createMemoryTools(storage);
    const names = tools.map((t) => t.name);
    expect(names).toContain("memory_save");
    expect(names).toContain("memory_search");
    expect(names).toContain("memory_get");
  });

  describe("memory_save", () => {
    it("saves entry and returns success message with id", async () => {
      const tools = createMemoryTools(storage);
      const saveTool = tools.find((t) => t.name === "memory_save")!;
      const result = await saveTool.execute({ content: "remember this", tags: ["important"] });
      expect(result.error).toBeUndefined();
      expect(result.output).toContain("id:");
      expect(storage.all()).toHaveLength(1);
    });

    it("saves with empty tags when tags not provided", async () => {
      const tools = createMemoryTools(storage);
      const saveTool = tools.find((t) => t.name === "memory_save")!;
      await saveTool.execute({ content: "no tags" });
      expect(storage.all()[0].tags).toEqual([]);
    });
  });

  describe("memory_search", () => {
    it("returns matching entries as formatted text", async () => {
      storage.save({ content: "quantum computing breakthrough", tags: ["tech"] });
      storage.save({ content: "football results", tags: [] });

      const tools = createMemoryTools(storage);
      const searchTool = tools.find((t) => t.name === "memory_search")!;
      const result = await searchTool.execute({ q: "quantum" });
      expect(result.error).toBeUndefined();
      expect(result.output).toContain("quantum");
    });

    it("returns '未找到相关记忆' when no match", async () => {
      const tools = createMemoryTools(storage);
      const searchTool = tools.find((t) => t.name === "memory_search")!;
      const result = await searchTool.execute({ q: "zzznomatch" });
      expect(result.output).toBe("未找到相关记忆");
    });
  });

  describe("memory_get", () => {
    it("returns full content for existing id", async () => {
      const saved = storage.save({ content: "full content here", tags: [] });
      const tools = createMemoryTools(storage);
      const getTool = tools.find((t) => t.name === "memory_get")!;
      const result = await getTool.execute({ id: saved.id });
      expect(result.output).toBe("full content here");
      expect(result.error).toBeUndefined();
    });

    it("returns error for unknown id", async () => {
      const tools = createMemoryTools(storage);
      const getTool = tools.find((t) => t.name === "memory_get")!;
      const result = await getTool.execute({ id: "no-such-id" });
      expect(result.error).toBeDefined();
    });
  });
});
