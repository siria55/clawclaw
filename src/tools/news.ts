import { z } from "zod";
import { defineTool } from "./types.js";
import type { Tool } from "./types.js";
import type { NewsStorage } from "../news/storage.js";

const saveNewsSchema = z.object({
  title: z.string(),
  url: z.string(),
  summary: z.string(),
  source: z.string(),
  publishedAt: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Create a `save_news` tool bound to the given NewsStorage instance.
 * The Agent calls this after finding a news article via browser search.
 */
export function createSaveNewsTool(storage: NewsStorage): Tool {
  return defineTool({
    name: "save_news",
    description:
      "将搜索到的新闻文章保存到本地新闻库。在浏览器中找到有价值的新闻后调用此工具。",
    schema: saveNewsSchema,
    execute: async (input) => {
      const article = storage.save({
        title: input.title,
        url: input.url,
        summary: input.summary,
        source: input.source,
        ...(input.publishedAt !== undefined && { publishedAt: input.publishedAt }),
        tags: input.tags ?? [],
      });
      return { output: `已保存：${article.title} (id: ${article.id})` };
    },
  });
}
