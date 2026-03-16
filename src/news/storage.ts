import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { NewsArticle, NewsPage, NewsQuery } from "./types.js";

/**
 * File-based news article storage.
 *
 * Articles are persisted as a JSON array in a single file.
 * Suitable for hundreds to low-thousands of articles.
 */
export class NewsStorage {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  /**
   * Save a new article to the library.
   * Automatically assigns `id` and `savedAt`.
   */
  save(article: Omit<NewsArticle, "id" | "savedAt">): NewsArticle {
    const full: NewsArticle = {
      ...article,
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      tags: article.tags ?? [],
    };
    const articles = this.#read();
    articles.push(full);
    this.#write(articles);
    return full;
  }

  /**
   * Query articles with optional keyword, tag filter, and pagination.
   * Results are sorted by `savedAt` descending (newest first).
   */
  query(q: NewsQuery = {}): NewsPage {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const keyword = q.q?.toLowerCase();
    const tag = q.tag;

    let articles = this.#read()
      .slice()
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

    if (keyword) {
      articles = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(keyword) ||
          a.summary.toLowerCase().includes(keyword),
      );
    }

    if (tag) {
      articles = articles.filter((a) => a.tags.includes(tag));
    }

    const total = articles.length;
    const start = (page - 1) * pageSize;
    return { articles: articles.slice(start, start + pageSize), total, page, pageSize };
  }

  /** Return all articles without filtering or pagination. */
  all(): NewsArticle[] {
    return this.#read();
  }

  #read(): NewsArticle[] {
    if (!existsSync(this.#filePath)) return [];
    try {
      return JSON.parse(readFileSync(this.#filePath, "utf8")) as NewsArticle[];
    } catch {
      return [];
    }
  }

  #write(articles: NewsArticle[]): void {
    writeFileSync(this.#filePath, JSON.stringify(articles, null, 2), "utf8");
  }
}
