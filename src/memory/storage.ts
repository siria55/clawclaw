import { readFileSync, writeFileSync } from "node:fs";
import type { MemoryEntry, MemoryQuery, MemorySearchResult } from "./types.js";

const SNIPPET_LEN = 200;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * File-based memory storage backed by a JSON array.
 * Reads the full file on each operation (suitable for small-to-medium collections).
 */
export class MemoryStorage {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  /** Backing JSON file path on disk. */
  get filePath(): string {
    return this.#filePath;
  }

  /**
   * Save a new memory entry. Auto-assigns `id` and `createdAt`.
   */
  save(entry: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
    const all = this.all();
    const saved: MemoryEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry,
    };
    all.push(saved);
    writeFileSync(this.#filePath, JSON.stringify(all, null, 2));
    return saved;
  }

  /**
   * Search entries by keyword. Returns snippets sorted by createdAt descending.
   */
  search(query: MemoryQuery): MemorySearchResult[] {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const keyword = query.q.toLowerCase();
    return this.all()
      .filter((e) => e.content.toLowerCase().includes(keyword))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        snippet: e.content.slice(0, SNIPPET_LEN),
        tags: e.tags,
        createdAt: e.createdAt,
      }));
  }

  /**
   * Get a single entry by id. Returns undefined if not found.
   */
  get(id: string): MemoryEntry | undefined {
    return this.all().find((e) => e.id === id);
  }

  /**
   * Return all stored entries in insertion order.
   */
  all(): MemoryEntry[] {
    try {
      return JSON.parse(readFileSync(this.#filePath, "utf8")) as MemoryEntry[];
    } catch {
      return [];
    }
  }
}
