import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createReadFileTool } from "../../src/tools/read-file.js";

const TMP = join(import.meta.dirname, "__tmp_read_file__");

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, "hello.txt"), "hello world", "utf8");
  writeFileSync(join(TMP, "big.txt"), "x".repeat(70 * 1024), "utf8");
});

afterAll(() => { rmSync(TMP, { recursive: true, force: true }); });

describe("createReadFileTool", () => {
  it("reads a file within an allowed path", async () => {
    const tool = createReadFileTool(() => [TMP]);
    const result = await tool.execute({ path: join(TMP, "hello.txt") });
    expect(result.output).toBe("hello world");
  });

  it("truncates files larger than 64KB", async () => {
    const tool = createReadFileTool(() => [TMP]);
    const result = await tool.execute({ path: join(TMP, "big.txt") });
    expect(result.output).toContain("[文件过大，已截断");
  });

  it("denies access outside allowed paths", async () => {
    const tool = createReadFileTool(() => [TMP]);
    const result = await tool.execute({ path: resolve(TMP, "../package.json") });
    expect(result.output).toContain("权限不足");
  });

  it("returns error for missing file", async () => {
    const tool = createReadFileTool(() => [TMP]);
    const result = await tool.execute({ path: join(TMP, "nope.txt") });
    expect(result.output).toContain("文件不存在");
  });

  it("uses default ./data/skills when allowed list is empty", async () => {
    const tool = createReadFileTool(() => []);
    const result = await tool.execute({ path: "/etc/passwd" });
    expect(result.output).toContain("权限不足");
  });
});
