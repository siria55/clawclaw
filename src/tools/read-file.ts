import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, normalize } from "node:path";
import { z } from "zod";
import { defineTool } from "./types.js";
import type { Tool } from "./types.js";

const MAX_BYTES = 64 * 1024; // 64 KB limit

const readFileSchema = z.object({
  path: z.string().describe("要读取的文件路径"),
});

/**
 * Create a `read_file` tool that restricts access to a configurable set of paths.
 *
 * @param getAllowedPaths - Called at execution time to get the current allowed root dirs.
 *   Defaults to `["./data/skills"]` when the returned list is empty.
 */
export function createReadFileTool(getAllowedPaths: () => string[]): Tool {
  return defineTool({
    name: "read_file",
    description:
      "读取本地文件内容。只能读取权限列表中的目录（默认 ./data/skills）。",
    schema: readFileSchema,
    execute: async (input) => {
      const target = resolve(normalize(input.path));
      const roots = getAllowedPaths().length > 0
        ? getAllowedPaths()
        : ["./data/skills"];

      const allowed = roots.some((r) => target.startsWith(resolve(r)));
      if (!allowed) {
        return { output: `权限不足：${input.path} 不在允许的读取路径内` };
      }

      if (!existsSync(target)) {
        return { output: `文件不存在：${input.path}` };
      }

      const stat = statSync(target);
      if (!stat.isFile()) {
        return { output: `不是文件：${input.path}` };
      }

      const buf = readFileSync(target);
      const truncated = buf.byteLength > MAX_BYTES;
      const text = buf.slice(0, MAX_BYTES).toString("utf8");
      return { output: truncated ? `${text}\n\n[文件过大，已截断，原始大小 ${buf.byteLength} bytes]` : text };
    },
  });
}
