// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DailyDigestRunsView } from "../../src/web/ui/DailyDigestRunsView.js";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

describe("DailyDigestRunsView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads run list and renders selected run detail", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith("/api/daily-digest/runs?page=1&pageSize=20")) {
        return makeResponse({
          runs: [{
            runId: "run-new",
            startedAt: "2026-03-31T02:00:00.000Z",
            finishedAt: "2026-03-31T02:05:00.000Z",
            status: "success",
            dateKey: "2026-03-31",
            queryCount: 2,
            searchRequestCount: 4,
            rawResultCount: 23,
            filteredLinkCount: 12,
            finalCount: 6,
            finalDomesticCount: 4,
            finalInternationalCount: 2,
          }],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      }
      if (input === "/api/daily-digest/runs/run-new") {
        return makeResponse({
          runId: "run-new",
          startedAt: "2026-03-31T02:00:00.000Z",
          finishedAt: "2026-03-31T02:05:00.000Z",
          status: "success",
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
          searchPlans: [
            { query: "中国教育", searchText: "中国教育", hintCategory: "domestic" },
          ],
          searchRequests: [{
            query: "中国教育",
            searchText: "中国教育",
            hintCategory: "domestic",
            startedAt: "2026-03-31T02:00:00.000Z",
            finishedAt: "2026-03-31T02:00:10.000Z",
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
            parsedLinks: [{
              text: "教育 AI 公司发布新产品",
              href: "https://example.com/a",
              hintCategory: "domestic",
              source: "新华社",
              summary: "summary",
            }],
            response: {
              results: [{ title: "教育 AI 公司发布新产品" }],
            },
          }],
          extractions: [{
            category: "domestic",
            startedAt: "2026-03-31T02:00:20.000Z",
            finishedAt: "2026-03-31T02:00:30.000Z",
            linkCount: 9,
            maxCandidates: 20,
            prompt: "prompt text",
            candidateLinks: [
              {
                text: "教育 AI 公司发布新产品",
                href: "https://example.com/a",
                hintCategory: "domestic",
                source: "新华社",
                summary: "summary",
                publishedAt: "2026-03-31 10:00",
              },
              {
                text: "某科技公司推出新芯片",
                href: "https://example.com/b",
                hintCategory: "domestic",
                source: "Some Blog",
                summary: "AI 芯片消息，主要面向云计算基础设施。",
              },
            ],
            rawOutput: "[{\"title\":\"教育 AI 公司发布新产品\"}]",
            parsedArticles: [{
              title: "教育 AI 公司发布新产品",
              url: "https://example.com/a",
              summary: "summary",
              source: "新华社",
              category: "domestic",
            }],
          }],
          counts: {
            rawLinkCount: 23,
            uniqueLinkCount: 18,
            filteredLinkCount: 12,
            blockedLinkCount: 6,
            domesticLinkCount: 9,
            internationalLinkCount: 3,
            extractedArticleCount: 8,
            extractedDomesticCount: 5,
            extractedInternationalCount: 3,
            finalCount: 6,
            finalDomesticCount: 4,
            finalInternationalCount: 2,
          },
          selection: {
            domestic: [{
              title: "教育 AI 公司发布新产品",
              url: "https://example.com/a",
              summary: "summary",
              source: "新华社",
              category: "domestic",
            }],
            international: [],
            all: [{
              title: "教育 AI 公司发布新产品",
              url: "https://example.com/a",
              summary: "summary",
              source: "新华社",
              category: "domestic",
            }],
          },
          outputFiles: {
            html: "2026-03-31.html",
            md: "2026-03-31.md",
            png: "2026-03-31.png",
            json: "2026-03-31.json",
          },
        });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(DailyDigestRunsView));

    expect(await screen.findByText("日报检索记录")).toBeDefined();
    expect(await screen.findByText("2026-03-31")).toBeDefined();
    expect(await screen.findByText("执行概览")).toBeDefined();
    expect(screen.getByText("Run ID")).toBeDefined();
    expect(screen.getByText("run-new")).toBeDefined();
    expect(screen.getByText("请求与返回")).toBeDefined();
    expect(screen.getByText("中国教育")).toBeDefined();
    expect(screen.getByText("Brave 配置")).toBeDefined();
    expect(screen.getByText("最终入选")).toBeDefined();
    expect(screen.getByText("教育 AI 公司发布新产品")).toBeDefined();
    expect(screen.getByText("诊断提示")).toBeDefined();
    expect(screen.getByText("送入 LLM 的候选明细")).toBeDefined();
    expect(screen.getByText("通过率 50%")).toBeDefined();
    expect(screen.getByText("教育弱相关")).toBeDefined();
  });

  it("refreshes the list when clicking refresh", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith("/api/daily-digest/runs?page=1&pageSize=20")) {
        return makeResponse({
          runs: [{
            runId: "run-refresh",
            startedAt: "2026-03-31T02:00:00.000Z",
            status: "success",
            dateKey: "2026-03-31",
            queryCount: 1,
            searchRequestCount: 1,
            rawResultCount: 2,
            filteredLinkCount: 2,
            finalCount: 1,
            finalDomesticCount: 1,
            finalInternationalCount: 0,
          }],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      }
      if (input === "/api/daily-digest/runs/run-refresh") {
        return makeResponse({
          runId: "run-refresh",
          startedAt: "2026-03-31T02:00:00.000Z",
          status: "success",
          dateKey: "2026-03-31",
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
            domestic: { country: "CN", searchLang: "zh-hans" },
            international: { country: "", searchLang: "" },
          },
          searchPlans: [],
          searchRequests: [],
          extractions: [],
          counts: {
            rawLinkCount: 2,
            uniqueLinkCount: 2,
            filteredLinkCount: 2,
            blockedLinkCount: 0,
            domesticLinkCount: 2,
            internationalLinkCount: 0,
            extractedArticleCount: 1,
            extractedDomesticCount: 1,
            extractedInternationalCount: 0,
            finalCount: 1,
            finalDomesticCount: 1,
            finalInternationalCount: 0,
          },
          selection: { domestic: [], international: [], all: [] },
        });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(DailyDigestRunsView));
    await screen.findByText("run-refresh");

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/daily-digest/runs?page=1&pageSize=20"));
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
