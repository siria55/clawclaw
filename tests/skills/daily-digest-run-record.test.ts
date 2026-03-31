import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDailyDigestRunRequestParams,
  createDailyDigestRunRecord,
  listDailyDigestRunSummaries,
  loadDailyDigestRunRecord,
  persistDailyDigestRunRecord,
  summarizeDailyDigestRunRecord,
  type DailyDigestRunRecord,
} from "../../src/skills/daily-digest/run-record.js";

const createdDirs: string[] = [];

describe("daily-digest run record", () => {
  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("extracts Brave request parameters from request url", () => {
    const params = buildDailyDigestRunRequestParams(
      "https://api.search.brave.com/res/v1/news/search?q=%E4%B8%AD%E5%9B%BDAI&count=20&offset=3&spellcheck=1&freshness=pw&safesearch=strict&ui_lang=zh-Hans&extra_snippets=true&goggles=https%3A%2F%2Fexample.com%2Fg1&country=CN&search_lang=zh-hans",
      36,
    );

    expect(params).toEqual({
      endpoint: "https://api.search.brave.com/res/v1/news/search",
      q: "中国AI",
      count: 20,
      offset: 3,
      spellcheck: true,
      freshness: "pw",
      safesearch: "strict",
      uiLang: "zh-Hans",
      extraSnippets: true,
      goggles: ["https://example.com/g1"],
      country: "CN",
      searchLang: "zh-hans",
      maxCandidates: 36,
    });
  });

  it("persists and reloads one run record", () => {
    const dataDir = createTempDataDir("persist");
    const record = createDailyDigestRunRecord({
      dateKey: "2026-03-31",
      queries: ["中国教育", "OpenAI 教育"],
      quota: { domestic: 10, international: 5 },
      maxCandidates: 36,
      braveSearchConfig: {
        request: {
          count: 20,
          offset: 0,
          freshness: "pw",
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
      },
      searchPlans: [{ query: "中国教育", searchText: "中国教育", hintCategory: "domestic" }],
      now: new Date("2026-03-31T01:02:03.000Z"),
    });

    record.status = "success";
    record.finishedAt = "2026-03-31T01:05:00.000Z";
    record.counts.filteredLinkCount = 12;
    record.counts.finalCount = 6;
    persistDailyDigestRunRecord(dataDir, record);

    const loaded = loadDailyDigestRunRecord(dataDir, record.runId);
    expect(loaded).toEqual(record);
  });

  it("lists run summaries in reverse chronological order", () => {
    const dataDir = createTempDataDir("list");
    const older = createRecord("2026-03-31T01:00:00.000Z", "2026-03-31", 4);
    const newer = createRecord("2026-03-31T02:00:00.000Z", "2026-03-31", 7);

    persistDailyDigestRunRecord(dataDir, older);
    persistDailyDigestRunRecord(dataDir, newer);

    const page = listDailyDigestRunSummaries(dataDir, 1, 10);

    expect(page.total).toBe(2);
    expect(page.runs.map((run) => run.runId)).toEqual([newer.runId, older.runId]);
    expect(page.runs[0]).toEqual(summarizeDailyDigestRunRecord(newer));
    expect(page.runs[1]).toEqual(summarizeDailyDigestRunRecord(older));
  });
});

function createRecord(startedAt: string, dateKey: string, finalCount: number): DailyDigestRunRecord {
  const record = createDailyDigestRunRecord({
    dateKey,
    queries: ["中国教育"],
    quota: { domestic: 10, international: 5 },
    maxCandidates: 36,
    braveSearchConfig: {
      request: {
        count: 20,
        offset: 0,
        freshness: "pw",
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
    },
    searchPlans: [{ query: "中国教育", searchText: "中国教育", hintCategory: "domestic" }],
    now: new Date(startedAt),
  });

  record.status = "success";
  record.finishedAt = new Date(new Date(startedAt).getTime() + 60_000).toISOString();
  record.searchRequests.push({
    query: "中国教育",
    searchText: "中国教育",
    hintCategory: "domestic",
    startedAt,
    finishedAt: record.finishedAt,
    requestUrl: "https://api.search.brave.com/res/v1/news/search?q=%E4%B8%AD%E5%9B%BD%E6%95%99%E8%82%B2",
    request: {
      endpoint: "https://api.search.brave.com/res/v1/news/search",
      q: "中国教育",
      count: 20,
      offset: 0,
      spellcheck: false,
      freshness: "pw",
      safesearch: "strict",
      uiLang: "",
      extraSnippets: false,
      goggles: [],
      country: "CN",
      searchLang: "zh-hans",
      maxCandidates: 36,
    },
    responseResultCount: 9,
    parsedLinks: [],
  });
  record.counts.filteredLinkCount = 8;
  record.counts.finalCount = finalCount;
  record.counts.finalDomesticCount = finalCount;
  return record;
}

function createTempDataDir(seed: string): string {
  const dir = join(tmpdir(), `clawclaw-daily-digest-run-record-${seed}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}
