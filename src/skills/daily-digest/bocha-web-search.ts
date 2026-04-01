import { z } from "zod";
import type { DigestCategory, DigestCandidateLink } from "./index.js";

const BOCHA_WEB_SEARCH_ENDPOINT = "https://api.bochaai.com/v1/web-search";

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
 *
 * @param freshness - Brave-style freshness string mapped to Bocha values.
 */
export function buildBochaSearchRequest(
  query: string,
  count: number,
  freshness?: string,
): { url: string; body: string } {
  const mapped = mapFreshnessToBocha(freshness);
  const body = JSON.stringify({
    query,
    freshness: mapped,
    summary: false,
    count: Math.min(count, 50),
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
 */
export function parseBochaSearchResponse(
  payload: unknown,
  hintCategory: DigestCategory,
): DigestCandidateLink[] {
  const parsed = BochaSearchResponseSchema.safeParse(payload);
  if (!parsed.success) return [];
  const values = parsed.data.data?.webPages?.value ?? [];
  return values.flatMap((result) => {
    const href = result.url.trim();
    const text = result.name.trim();
    if (!href.startsWith("http") || text.length === 0) return [];
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

/**
 * Map Brave-style freshness to Bocha freshness values.
 * Bocha supports: "24h", "7d", "30d", "oneYear", "noLimit".
 */
function mapFreshnessToBocha(freshness: string | undefined): string {
  if (!freshness) return "noLimit";
  const lower = freshness.toLowerCase();
  if (lower === "pd") return "24h";
  if (lower === "pw" || lower === "p3d") return "7d";
  if (lower === "pm") return "30d";
  if (lower === "py") return "oneYear";
  return "7d";
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
