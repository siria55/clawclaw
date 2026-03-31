import type { BraveSearchConfig, BraveSearchSafeSearch } from "./types.js";

const BRAVE_NEWS_SEARCH_MAX_COUNT = 50;
const BRAVE_NEWS_SEARCH_MAX_OFFSET = 9;
const ALLOWED_SAFESEARCH = new Set<BraveSearchSafeSearch>(["", "off", "moderate", "strict"]);

export interface ResolvedBraveSearchConfig {
  request: {
    count: number;
    offset: number;
    freshness: string;
    spellcheck: boolean;
    safesearch: BraveSearchSafeSearch;
    uiLang: string;
    extraSnippets: boolean;
    goggles: string[];
  };
  domestic: {
    country: string;
    searchLang: string;
  };
  international: {
    country: string;
    searchLang: string;
  };
}

export const DEFAULT_BRAVE_SEARCH_CONFIG: ResolvedBraveSearchConfig = {
  request: {
    count: 20,
    offset: 0,
    freshness: "p3d",
    spellcheck: false,
    safesearch: "strict",
    uiLang: "",
    extraSnippets: false,
    goggles: [],
  },
  domestic: {
    country: "CN",
    searchLang: "zh-hans",
  },
  international: {
    country: "",
    searchLang: "",
  },
};

export function mergeBraveSearchConfig(...layers: Array<BraveSearchConfig | undefined>): ResolvedBraveSearchConfig {
  const request = {
    count: DEFAULT_BRAVE_SEARCH_CONFIG.request.count,
    offset: DEFAULT_BRAVE_SEARCH_CONFIG.request.offset,
    freshness: DEFAULT_BRAVE_SEARCH_CONFIG.request.freshness,
    spellcheck: DEFAULT_BRAVE_SEARCH_CONFIG.request.spellcheck,
    safesearch: DEFAULT_BRAVE_SEARCH_CONFIG.request.safesearch,
    uiLang: DEFAULT_BRAVE_SEARCH_CONFIG.request.uiLang,
    extraSnippets: DEFAULT_BRAVE_SEARCH_CONFIG.request.extraSnippets,
    goggles: [...DEFAULT_BRAVE_SEARCH_CONFIG.request.goggles],
  };
  const domestic = { ...DEFAULT_BRAVE_SEARCH_CONFIG.domestic };
  const international = { ...DEFAULT_BRAVE_SEARCH_CONFIG.international };

  for (const layer of layers) {
    if (!layer) continue;
    if (layer.request) {
      request.count = normalizeCount(layer.request.count, request.count);
      request.offset = normalizeOffset(layer.request.offset, request.offset);
      request.freshness = normalizeStringField(layer.request.freshness, request.freshness);
      request.spellcheck = normalizeBooleanField(layer.request.spellcheck, request.spellcheck);
      request.safesearch = normalizeSafeSearch(layer.request.safesearch, request.safesearch);
      request.uiLang = normalizeStringField(layer.request.uiLang, request.uiLang);
      request.extraSnippets = normalizeBooleanField(layer.request.extraSnippets, request.extraSnippets);
      request.goggles = normalizeStringListField(layer.request.goggles, request.goggles);
    }
    if (layer.domestic) {
      domestic.country = normalizeStringField(layer.domestic.country, domestic.country);
      domestic.searchLang = normalizeStringField(layer.domestic.searchLang, domestic.searchLang);
    }
    if (layer.international) {
      international.country = normalizeStringField(layer.international.country, international.country);
      international.searchLang = normalizeStringField(layer.international.searchLang, international.searchLang);
    }
  }

  return { request, domestic, international };
}

function normalizeCount(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value ?? fallback);
  return Math.max(1, Math.min(BRAVE_NEWS_SEARCH_MAX_COUNT, normalized));
}

function normalizeOffset(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value ?? fallback);
  return Math.max(0, Math.min(BRAVE_NEWS_SEARCH_MAX_OFFSET, normalized));
}

function normalizeBooleanField(value: boolean | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : Boolean(value);
}

function normalizeSafeSearch(value: BraveSearchSafeSearch | undefined, fallback: BraveSearchSafeSearch): BraveSearchSafeSearch {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase() as BraveSearchSafeSearch;
  return ALLOWED_SAFESEARCH.has(normalized) ? normalized : fallback;
}

function normalizeStringField(value: string | undefined, fallback: string): string {
  return value === undefined ? fallback : value.trim();
}

function normalizeStringListField(values: string[] | undefined, fallback: string[]): string[] {
  if (values === undefined) return [...fallback];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
