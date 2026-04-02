import { z } from "zod";
import type { BochaFreshness, BochaSearchConfig } from "../../config/types.js";
import type { DigestCategory, DigestCandidateLink } from "./index.js";

const BOCHA_WEB_SEARCH_ENDPOINT = "https://api.bochaai.com/v1/web-search";

/** Default Bocha search config values. */
export const DEFAULT_BOCHA_SEARCH_CONFIG: Required<BochaSearchConfig> = {
  count: 20,
  freshness: "7d",
  summary: false,
};

const BochaSearchResultSchema = z.object({
  name: z.string(),
  url: z.string(),
  snippet: z.string().optional(),
  summary: z.string().optional(),
  siteName: z.string().optional(),
  datePublished: z.string().optional(),
});

const BochaSearchResponseSchema = z.object({
  data: z.object({
    webPages: z.object({
      value: z.array(BochaSearchResultSchema).default([]),
    }).optional(),
  }).optional(),
});

/**
 * Build a Bocha Web Search request body.
 */
export function buildBochaSearchRequest(
  query: string,
  maxCandidates: number,
  config?: BochaSearchConfig,
): { url: string; body: string } {
  const resolved = { ...DEFAULT_BOCHA_SEARCH_CONFIG, ...config };
  const body = JSON.stringify({
    query,
    freshness: resolved.freshness,
    summary: resolved.summary,
    count: Math.min(maxCandidates, resolved.count),
  });
  return { url: BOCHA_WEB_SEARCH_ENDPOINT, body };
}

/**
 * Fetch a Bocha Web Search response.
 */
export async function fetchBochaSearchResponse(
  requestUrl: string,
  body: string,
  apiKey: string,
): Promise<unknown> {
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bocha Search API ${response.status}: ${text.slice(0, 240)}`);
  }
  return response.json() as Promise<unknown>;
}

/**
 * Parse a Bocha Web Search response into candidate links.
 *
 * Bocha is a web search (not news search), so `freshness` controls crawl
 * recency, not publish date.  We post-filter by `datePublished` to discard
 * pages published outside the configured window.
 */
export function parseBochaSearchResponse(
  payload: unknown,
  hintCategory: DigestCategory,
  freshness?: BochaFreshness,
): DigestCandidateLink[] {
  const parsed = BochaSearchResponseSchema.safeParse(payload);
  if (!parsed.success) return [];
  const cutoff = freshnessToDateCutoff(freshness);
  const values = parsed.data.data?.webPages?.value ?? [];
  return values.flatMap((result) => {
    const href = result.url.trim();
    const text = result.name.trim();
    if (!href.startsWith("http") || text.length === 0) return [];
    if (cutoff && !isAfterCutoff(result.datePublished, cutoff)) return [];
    const source = result.siteName?.trim();
    const summary = result.snippet?.trim() || result.summary?.trim() || "";
    const publishedAt = normalizeBochaDate(result.datePublished);
    return [{
      text,
      href,
      hintCategory,
      ...(source ? { source } : {}),
      ...(summary ? { summary } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    }];
  });
}

/** Normalize Bocha's datePublished to a readable date-time string. */
function normalizeBochaDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value.trim() || undefined;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return value.trim() || undefined;
  }
}

/** Convert BochaFreshness to a Date cutoff. Returns undefined for "noLimit". */
function freshnessToDateCutoff(freshness: BochaFreshness | undefined): Date | undefined {
  const ms = freshnessToMs(freshness);
  return ms !== undefined ? new Date(Date.now() - ms) : undefined;
}

function freshnessToMs(freshness: BochaFreshness | undefined): number | undefined {
  switch (freshness) {
    case "24h": return 24 * 60 * 60 * 1000;
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
    case "oneYear": return 365 * 24 * 60 * 60 * 1000;
    default: return undefined;
  }
}

/** Check if datePublished is after the cutoff. Missing dates are rejected. */
function isAfterCutoff(datePublished: string | undefined, cutoff: Date): boolean {
  if (!datePublished) return false;
  try {
    const date = new Date(datePublished);
    return !isNaN(date.getTime()) && date >= cutoff;
  } catch {
    return false;
  }
}
