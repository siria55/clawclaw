import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import type { ConfigStorage } from "../config/storage.js";
import type { MountedDocConfig, MountedDocSource } from "../config/types.js";

export interface MountedDocSnapshot {
  id: string;
  title: string;
  url: string;
  content: string;
  excerpt: string;
  syncedAt: string;
}

export interface MountedDocSearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  syncedAt: string;
  score: number;
}

export interface MountedDocSyncResult {
  id: string;
  title: string;
  ok: boolean;
  syncedAt?: string;
  error?: string;
}

interface DocExtractorResult {
  title: string;
  content: string;
}

type DocExtractor = (source: MountedDocSource) => Promise<DocExtractorResult>;

const CONFIG_FILE_NAME = "config.json";
const EXCERPT_LEN = 180;
const MAX_CONTENT_LEN = 120_000;

/**
 * Mounted doc library backed by local JSON snapshots.
 *
 * It stores doc source config, syncs page text through Playwright, and exposes
 * simple keyword search for Agent context injection.
 */
export class MountedDocLibrary {
  readonly #configStorage: ConfigStorage<MountedDocConfig>;
  readonly #dataDir: string;
  readonly #extractor: DocExtractor;

  constructor(options: {
    configStorage: ConfigStorage<MountedDocConfig>;
    dataDir: string;
    extractor?: DocExtractor;
  }) {
    this.#configStorage = options.configStorage;
    this.#dataDir = options.dataDir;
    this.#extractor = options.extractor ?? extractMountedDoc;
    mkdirSync(this.#dataDir, { recursive: true });
  }

  /** Return normalized mounted doc sources from config. */
  listSources(): MountedDocSource[] {
    return normalizeMountedDocs(this.#configStorage.read().docs);
  }

  /** Persist the full mounted doc source list after normalization. */
  saveSources(docs: MountedDocSource[]): MountedDocSource[] {
    const normalized = normalizeMountedDocs(docs);
    this.#configStorage.write({ docs: normalized });
    return normalized;
  }

  /** Return all locally synced doc snapshots, newest first. */
  listSnapshots(): MountedDocSnapshot[] {
    const snapshots: MountedDocSnapshot[] = [];
    for (const fileName of safeReadDir(this.#dataDir)) {
      if (!fileName.endsWith(".json") || fileName === CONFIG_FILE_NAME) continue;
      try {
        const snapshot = JSON.parse(readFileSync(join(this.#dataDir, fileName), "utf8")) as MountedDocSnapshot;
        if (snapshot.id && snapshot.title && snapshot.url && snapshot.content && snapshot.syncedAt) {
          snapshots.push(snapshot);
        }
      } catch {
        // skip invalid cache file
      }
    }
    return snapshots.sort((a, b) => b.syncedAt.localeCompare(a.syncedAt));
  }

  /** Sync all enabled docs, returning per-doc success or failure. */
  async syncAll(): Promise<MountedDocSyncResult[]> {
    const results: MountedDocSyncResult[] = [];
    for (const source of this.listSources().filter((doc) => doc.enabled)) {
      results.push(await this.syncById(source.id));
    }
    return results;
  }

  /** Sync a single doc by id and write its cached snapshot to disk. */
  async syncById(id: string): Promise<MountedDocSyncResult> {
    const source = this.listSources().find((doc) => doc.id === id);
    if (!source) {
      return { id, title: id, ok: false, error: `Mounted doc not found: ${id}` };
    }
    try {
      const extracted = await this.#extractor(source);
      const content = normalizeDocText(extracted.content);
      if (!content) {
        return { id: source.id, title: source.title, ok: false, error: "未提取到正文内容" };
      }
      const snapshot: MountedDocSnapshot = {
        id: source.id,
        title: extracted.title || source.title,
        url: source.url,
        content: content.slice(0, MAX_CONTENT_LEN),
        excerpt: buildExcerpt(content),
        syncedAt: new Date().toISOString(),
      };
      writeFileSync(join(this.#dataDir, `${source.id}.json`), JSON.stringify(snapshot, null, 2), "utf8");
      return { id: snapshot.id, title: snapshot.title, ok: true, syncedAt: snapshot.syncedAt };
    } catch (error) {
      return {
        id: source.id,
        title: source.title,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Search enabled synced docs and return top matching snippets. */
  search(query: string, limit = 3): MountedDocSearchResult[] {
    const sources = new Map(this.listSources().filter((doc) => doc.enabled).map((doc) => [doc.id, doc]));
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];
    const tokens = extractSearchTokens(normalizedQuery);
    const lowerQuery = normalizedQuery.toLowerCase();
    const results = this.listSnapshots()
      .filter((snapshot) => sources.has(snapshot.id))
      .map((snapshot) => {
        const score = scoreSnapshot(snapshot, lowerQuery, tokens);
        return score > 0
          ? {
              id: snapshot.id,
              title: snapshot.title,
              url: snapshot.url,
              snippet: buildSnippet(snapshot.content, lowerQuery, tokens),
              syncedAt: snapshot.syncedAt,
              score,
            }
          : undefined;
      })
      .filter((result): result is MountedDocSearchResult => result !== undefined)
      .sort((a, b) => b.score - a.score || b.syncedAt.localeCompare(a.syncedAt));
    return results.slice(0, limit);
  }
}

async function extractMountedDoc(source: MountedDocSource): Promise<DocExtractorResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);
    const extracted = await page.evaluate(() => {
      interface BrowserNode {
        textContent: string | null;
      }
      interface BrowserDocument {
        title: string;
        body: { innerText: string } | null;
        querySelectorAll(selector: string): BrowserNode[];
      }
      const browserDocument = (globalThis as unknown as { document: BrowserDocument }).document;
      const candidates = [
        ...browserDocument.querySelectorAll("main, article"),
        ...browserDocument.querySelectorAll(".ql-editor, .wiki-content, .docs-content, .document-content"),
      ];
      const best = candidates
        .map((node) => ({
          text: (node.textContent ?? "").trim(),
          length: (node.textContent ?? "").trim().length,
        }))
        .sort((a, b) => b.length - a.length)[0];
      const fallback = (browserDocument.body?.innerText ?? "").trim();
      return {
        title: browserDocument.title.trim(),
        content: best?.length && best.length > 80 ? best.text : fallback,
      };
    }) as DocExtractorResult;
    await page.close();
    return extracted;
  } finally {
    await browser.close();
  }
}

function normalizeMountedDocs(docs: MountedDocSource[] | undefined): MountedDocSource[] {
  const normalized: MountedDocSource[] = [];
  const seen = new Set<string>();
  for (const doc of docs ?? []) {
    const title = doc.title.trim();
    const url = doc.url.trim();
    const id = (doc.id || crypto.randomUUID()).trim();
    if (!title || !url || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ id, title, url, enabled: doc.enabled !== false });
  }
  return normalized;
}

function normalizeDocText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function buildExcerpt(content: string): string {
  return content.slice(0, EXCERPT_LEN).replace(/\n/g, " ").trim();
}

function safeReadDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function extractSearchTokens(query: string): string[] {
  const tokens = new Set<string>();
  const lower = query.toLowerCase();
  for (const match of lower.matchAll(/[a-z0-9_-]{2,}/g)) {
    tokens.add(match[0]);
  }
  for (const match of query.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const text = match[0];
    tokens.add(text);
    for (let index = 0; index < text.length - 1; index++) {
      tokens.add(text.slice(index, index + 2));
    }
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

function scoreSnapshot(snapshot: MountedDocSnapshot, lowerQuery: string, tokens: string[]): number {
  const title = snapshot.title.toLowerCase();
  const content = snapshot.content.toLowerCase();
  let score = 0;
  if (title.includes(lowerQuery)) score += 40;
  if (content.includes(lowerQuery)) score += 24;
  for (const token of tokens) {
    if (title.includes(token)) score += token.length * 5;
    else if (content.includes(token)) score += token.length * 2;
  }
  return score;
}

function buildSnippet(content: string, lowerQuery: string, tokens: string[]): string {
  const lowerContent = content.toLowerCase();
  const pivot = findSnippetPivot(lowerContent, lowerQuery, tokens);
  const start = Math.max(0, pivot - 70);
  const end = Math.min(content.length, pivot + 130);
  return content.slice(start, end).replace(/\n/g, " ").trim();
}

function findSnippetPivot(lowerContent: string, lowerQuery: string, tokens: string[]): number {
  const exactIndex = lowerContent.indexOf(lowerQuery);
  if (exactIndex >= 0) return exactIndex;
  for (const token of tokens) {
    const index = lowerContent.indexOf(token);
    if (index >= 0) return index;
  }
  return 0;
}
