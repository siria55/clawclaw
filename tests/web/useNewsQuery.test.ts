// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNewsQuery } from "../../src/web/ui/useNewsQuery.js";

function makeNewsPage(articles: object[] = [], total = 0, page = 1, pageSize = 20) {
  return { articles, total, page, pageSize };
}

function mockFetch(data: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => data })),
  );
}

describe("useNewsQuery", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with empty state", () => {
    const { result } = renderHook(() => useNewsQuery());
    expect(result.current.articles).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("query() fetches and populates articles", async () => {
    const articles = [{ id: "1", title: "Test", url: "u", summary: "s", source: "S", savedAt: "2024-01-01T00:00:00Z", tags: [] }];
    mockFetch(makeNewsPage(articles, 1));

    const { result } = renderHook(() => useNewsQuery());

    await act(async () => {
      result.current.query({ page: 1 });
    });

    expect(result.current.articles).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.loading).toBe(false);
  });

  it("query() sends correct query params", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => makeNewsPage() }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useNewsQuery());

    await act(async () => {
      result.current.query({ q: "ai", tag: "tech", page: 2, pageSize: 10 });
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("q=ai");
    expect(url).toContain("tag=tech");
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=10");
  });

  it("query() omits q and tag when not provided", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => makeNewsPage() }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useNewsQuery());

    await act(async () => {
      result.current.query({ page: 1 });
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("q=");
    expect(url).not.toContain("tag=");
  });

  it("updates page from response", async () => {
    mockFetch(makeNewsPage([], 50, 3, 20));

    const { result } = renderHook(() => useNewsQuery());

    await act(async () => {
      result.current.query({ page: 3 });
    });

    expect(result.current.page).toBe(3);
    expect(result.current.total).toBe(50);
  });
});
