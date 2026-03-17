import { z } from "zod";
import { defineTool } from "./types.js";
import type { Tool } from "./types.js";
import type { MemoryStorage } from "../memory/storage.js";

const saveSchema = z.object({
  content: z.string(),
  tags: z.array(z.string()).optional(),
});

const searchSchema = z.object({
  q: z.string(),
  limit: z.number().optional(),
});

const getSchema = z.object({
  id: z.string(),
});

/**
 * Create the three memory tools (memory_save, memory_search, memory_get)
 * backed by the given MemoryStorage instance.
 */
export function createMemoryTools(storage: MemoryStorage): Tool[] {
  const saveTool = defineTool({
    name: "memory_save",
    description: "将重要信息保存到长期记忆库，供后续检索使用",
    schema: saveSchema,
    execute: async (input) => {
      const entry = storage.save({
        content: input.content,
        tags: input.tags ?? [],
      });
      return { output: `已保存记忆 (id: ${entry.id})` };
    },
  });

  const searchTool = defineTool({
    name: "memory_search",
    description: "在记忆库中按关键词搜索相关记忆，返回 id 和摘要列表",
    schema: searchSchema,
    execute: async (input) => {
      const results = storage.search({ q: input.q, ...(input.limit !== undefined && { limit: input.limit }) });
      if (results.length === 0) return { output: "未找到相关记忆" };
      const lines = results.map(
        (r) => `[${r.id}] ${r.snippet}${r.tags.length > 0 ? ` (tags: ${r.tags.join(", ")})` : ""} — ${r.createdAt}`,
      );
      return { output: lines.join("\n") };
    },
  });

  const getTool = defineTool({
    name: "memory_get",
    description: "按 id 取回完整的记忆内容",
    schema: getSchema,
    execute: async (input) => {
      const entry = storage.get(input.id);
      if (!entry) return { error: `记忆 "${input.id}" 不存在` };
      return { output: entry.content };
    },
  });

  return [saveTool, searchTool, getTool];
}
