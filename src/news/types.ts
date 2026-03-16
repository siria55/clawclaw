/**
 * Core data types for the news library.
 */

export interface NewsArticle {
  /** Unique identifier, auto-generated on save (crypto.randomUUID). */
  id: string;
  title: string;
  url: string;
  summary: string;
  /** Publisher / source name, e.g. "Reuters", "36Kr". */
  source: string;
  /** Original publish time in ISO 8601 (optional — may not be available during search). */
  publishedAt?: string;
  /** Time the article was written to the library, ISO 8601. */
  savedAt: string;
  tags: string[];
}

export interface NewsQuery {
  /** Keyword matched against title + summary (case-insensitive). */
  q?: string;
  /** Filter by tag (exact match). */
  tag?: string;
  /** 1-based page number. Default: 1. */
  page?: number;
  /** Articles per page. Default: 20, max: 100. */
  pageSize?: number;
}

export interface NewsPage {
  articles: NewsArticle[];
  total: number;
  page: number;
  pageSize: number;
}
