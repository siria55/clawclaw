import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedBraveSearchConfig } from "../../config/daily-digest.js";
import type { DailyDigestSelection, DigestArticle, DigestCandidateLink, DigestCategory } from "./index.js";

export interface DailyDigestRunPlanRecord {
  query: string;
  searchText: string;
  hintCategory: DigestCategory;
}

export interface DailyDigestRunRequestParams {
  endpoint: string;
  q: string;
  count: number;
  offset: number;
  spellcheck: boolean;
  freshness: string;
  safesearch: string;
  uiLang: string;
  extraSnippets: boolean;
  goggles: string[];
  country: string;
  searchLang: string;
  maxCandidates: number;
}

export interface DailyDigestRunRequestRecord {
  query: string;
  searchText: string;
  hintCategory: DigestCategory;
  startedAt: string;
  finishedAt?: string;
  requestUrl: string;
  request: DailyDigestRunRequestParams;
  responseResultCount: number;
  parsedLinks: DigestCandidateLink[];
  response?: unknown;
  error?: string;
}

export interface DailyDigestRunExtractionRecord {
  category: DigestCategory;
  startedAt: string;
  finishedAt?: string;
  linkCount: number;
  maxCandidates: number;
  prompt: string;
  rawOutput?: string;
  parsedArticles: DigestArticle[];
  error?: string;
}

export interface DailyDigestRunCounts {
  rawLinkCount: number;
  uniqueLinkCount: number;
  filteredLinkCount: number;
  blockedLinkCount: number;
  domesticLinkCount: number;
  internationalLinkCount: number;
  extractedArticleCount: number;
  extractedDomesticCount: number;
  extractedInternationalCount: number;
  finalCount: number;
  finalDomesticCount: number;
  finalInternationalCount: number;
}

export interface DailyDigestRunOutputFiles {
  html?: string;
  md?: string;
  png?: string;
  json?: string;
}

export interface DailyDigestRunRecord {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  dateKey: string;
  queries: string[];
  quota: {
    domestic: number;
    international: number;
  };
  maxCandidates: number;
  braveSearchConfig: ResolvedBraveSearchConfig;
  searchPlans: DailyDigestRunPlanRecord[];
  searchRequests: DailyDigestRunRequestRecord[];
  extractions: DailyDigestRunExtractionRecord[];
  counts: DailyDigestRunCounts;
  selection?: DailyDigestSelection;
  outputFiles?: DailyDigestRunOutputFiles;
  error?: string;
}

export interface DailyDigestRunSummary {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  error?: string;
  dateKey: string;
  queryCount: number;
  searchRequestCount: number;
  rawResultCount: number;
  filteredLinkCount: number;
  finalCount: number;
  finalDomesticCount: number;
  finalInternationalCount: number;
}

export interface DailyDigestRunPage {
  runs: DailyDigestRunSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface CreateDailyDigestRunRecordInput {
  dateKey: string;
  queries: string[];
  quota: {
    domestic: number;
    international: number;
  };
  maxCandidates: number;
  braveSearchConfig: ResolvedBraveSearchConfig;
  searchPlans: DailyDigestRunPlanRecord[];
  now?: Date;
}

const EMPTY_COUNTS: DailyDigestRunCounts = {
  rawLinkCount: 0,
  uniqueLinkCount: 0,
  filteredLinkCount: 0,
  blockedLinkCount: 0,
  domesticLinkCount: 0,
  internationalLinkCount: 0,
  extractedArticleCount: 0,
  extractedDomesticCount: 0,
  extractedInternationalCount: 0,
  finalCount: 0,
  finalDomesticCount: 0,
  finalInternationalCount: 0,
};

export function createDailyDigestRunRecord(input: CreateDailyDigestRunRecordInput): DailyDigestRunRecord {
  const now = input.now ?? new Date();
  return {
    runId: createDailyDigestRunId(now),
    startedAt: now.toISOString(),
    status: "running",
    dateKey: input.dateKey,
    queries: [...input.queries],
    quota: { ...input.quota },
    maxCandidates: input.maxCandidates,
    braveSearchConfig: cloneJson(input.braveSearchConfig),
    searchPlans: input.searchPlans.map((plan) => ({ ...plan })),
    searchRequests: [],
    extractions: [],
    counts: { ...EMPTY_COUNTS },
  };
}

export function createDailyDigestRunId(now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, "");
  const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `${timestamp}-${suffix}`;
}

export function buildDailyDigestRunRequestParams(
  requestUrl: string,
  maxCandidates: number,
): DailyDigestRunRequestParams {
  const url = new URL(requestUrl);
  return {
    endpoint: `${url.origin}${url.pathname}`,
    q: url.searchParams.get("q") ?? "",
    count: parseNumber(url.searchParams.get("count")),
    offset: parseNumber(url.searchParams.get("offset")),
    spellcheck: url.searchParams.get("spellcheck") === "1",
    freshness: url.searchParams.get("freshness") ?? "",
    safesearch: url.searchParams.get("safesearch") ?? "",
    uiLang: url.searchParams.get("ui_lang") ?? "",
    extraSnippets: url.searchParams.get("extra_snippets") === "true",
    goggles: url.searchParams.getAll("goggles"),
    country: url.searchParams.get("country") ?? "",
    searchLang: url.searchParams.get("search_lang") ?? "",
    maxCandidates,
  };
}

export function persistDailyDigestRunRecord(dataDir: string, record: DailyDigestRunRecord): string {
  const filePath = getDailyDigestRunFilePath(dataDir, record.runId);
  mkdirSync(getDailyDigestRunDir(dataDir), { recursive: true });
  writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
  return filePath;
}

export function loadDailyDigestRunRecord(dataDir: string, runId: string): DailyDigestRunRecord | undefined {
  const filePath = getDailyDigestRunFilePath(dataDir, runId);
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as DailyDigestRunRecord;
  } catch {
    return undefined;
  }
}

export function listDailyDigestRunSummaries(
  dataDir: string | undefined,
  page: number,
  pageSize: number,
): DailyDigestRunPage {
  const empty = { runs: [], total: 0, page, pageSize };
  if (!dataDir) return empty;
  const runDir = getDailyDigestRunDir(dataDir);
  if (!existsSync(runDir)) return empty;

  const records = readdirSync(runDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => loadDailyDigestRunRecordFromFile(join(runDir, fileName)))
    .filter((record): record is DailyDigestRunRecord => record !== undefined)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));

  const total = records.length;
  const runs = records
    .slice((page - 1) * pageSize, page * pageSize)
    .map(summarizeDailyDigestRunRecord);

  return { runs, total, page, pageSize };
}

export function summarizeDailyDigestRunRecord(record: DailyDigestRunRecord): DailyDigestRunSummary {
  const counts = record.counts ?? EMPTY_COUNTS;
  return {
    runId: record.runId,
    startedAt: record.startedAt,
    ...(record.finishedAt ? { finishedAt: record.finishedAt } : {}),
    status: record.status,
    ...(record.error ? { error: record.error } : {}),
    dateKey: record.dateKey,
    queryCount: record.queries.length,
    searchRequestCount: record.searchRequests.length,
    rawResultCount: record.searchRequests.reduce((total, item) => total + item.responseResultCount, 0),
    filteredLinkCount: counts.filteredLinkCount,
    finalCount: counts.finalCount,
    finalDomesticCount: counts.finalDomesticCount,
    finalInternationalCount: counts.finalInternationalCount,
  };
}

function getDailyDigestRunDir(dataDir: string): string {
  return join(dataDir, "runs");
}

function getDailyDigestRunFilePath(dataDir: string, runId: string): string {
  return join(getDailyDigestRunDir(dataDir), `${runId}.json`);
}

function loadDailyDigestRunRecordFromFile(filePath: string): DailyDigestRunRecord | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as DailyDigestRunRecord;
  } catch {
    return undefined;
  }
}

function parseNumber(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
