export interface MemoryEntry {
  /** Auto-generated UUID */
  id: string;
  /** Memory content (plain text) */
  content: string;
  /** Optional classification tags */
  tags: string[];
  /** ISO 8601 creation timestamp */
  createdAt: string;
}

export interface MemoryQuery {
  /** Keyword to match against content (case-insensitive) */
  q: string;
  /** Max results to return. Default: 10, max: 50 */
  limit?: number;
}

export interface MemorySearchResult {
  id: string;
  /** First 200 chars of content */
  snippet: string;
  tags: string[];
  createdAt: string;
}
