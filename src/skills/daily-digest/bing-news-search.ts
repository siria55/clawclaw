import { z } from "zod";
import type { DigestCategory, DigestCandidateLink } from "./index.js";

const BING_NEWS_SEARCH_ENDPOINT = "https://api.bing.microsoft.com/v7.0/news/search";

const BingNewsArticleSchema = z.object({
  name: z.string(),
  url: z.string(),
  description: z.string().optional(),
  datePublished: z.string().optional(),
  provider: z.array(z.object({ name: z.string() })).optional(),
});

const BingNewsResponseSchema = z.object({
  value: z.array(BingNewsArticleSchema).default([]),
});

/**
 * Build a Bing News Search v7 request URL.
 *
 * @param freshness - Brave-style freshness string (e.g. "p3d"). Mapped to
 *   Bing's Day / Week / Month values.
 */
export function buildBingNewsSearchUrl(
  query: string,
  count: number,
  hintCategory: DigestCategory,
  freshness?: string,
): string {
  const params = new URLSearchParams({ q: query, count: String(Math.min(count, 100)) });
  const mkt = hintCategory === "domestic" ? "zh-CN" : "";
  if (mkt) params.set("mkt", mkt);
  params.set("sortBy", "Date");
  params.set("safeSearch", "Moderate");
  const mapped = mapFreshnessToBing(freshness);
  if (mapped) params.set("freshness", mapped);
  return `${BING_NEWS_SEARCH_ENDPOINT}?${params.toString()}`;
}

/**
 * Fetch a Bing News Search response.
 */
export async function fetchBingNewsResponse(
  requestUrl: string,
  apiKey: string,
): Promise<unknown> {
  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bing News Search API ${response.status}: ${body.slice(0, 240)}`);
  }
  return response.json() as Promise<unknown>;
}

/**
 * Parse a Bing News Search response into candidate links.
 */
export function parseBingNewsSearchResponse(
  payload: unknown,
  hintCategory: DigestCategory,
): DigestCandidateLink[] {
  const parsed = BingNewsResponseSchema.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.value.flatMap((article) => {
    const href = article.url.trim();
    const text = article.name.trim();
    if (!href.startsWith("http") || text.length === 0) return [];
    const source = article.provider?.[0]?.name?.trim();
    const summary = article.description?.trim() ?? "";
    const publishedAt = normalizeBingDate(article.datePublished);
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
 * Map Brave-style freshness to Bing freshness values.
 * Bing only supports Day, Week, Month, or a date range YYYY-MM-DD..YYYY-MM-DD.
 */
function mapFreshnessToBing(freshness: string | undefined): string | undefined {
  if (!freshness) return undefined;
  const lower = freshness.toLowerCase();
  if (lower === "pd") return "Day";
  if (lower === "pw" || lower === "p3d") return "Week";
  if (lower === "pm") return "Month";
  // Brave date range "YYYY-MM-DDtoYYYY-MM-DD" → Bing "YYYY-MM-DD..YYYY-MM-DD"
  const rangeMatch = lower.match(/^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/);
  if (rangeMatch) return `${rangeMatch[1]}..${rangeMatch[2]}`;
  return "Week";
}

/** Normalize Bing's ISO 8601 datePublished to a readable date-time string. */
function normalizeBingDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return undefined;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return undefined;
  }
}
