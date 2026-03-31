// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchConfigView } from "../../src/web/ui/SearchConfigView.js";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

describe("SearchConfigView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads Brave Search config from daily-digest config endpoint", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/config/daily-digest") {
        return makeResponse({
          queries: ["中国教育", "AI 教育"],
          braveSearchApiKey: "brave_key_123",
          braveSearch: {
            request: {
              count: 30,
              offset: 2,
              freshness: "pm",
              spellcheck: true,
              safesearch: "moderate",
              uiLang: "zh-Hans",
              extraSnippets: true,
              goggles: ["https://example.com/g1"],
            },
            domestic: {
              country: "CN",
              searchLang: "zh-hans",
            },
            international: {
              country: "US",
              searchLang: "en",
            },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(SearchConfigView));

    const input = await screen.findByLabelText("Brave Search API Key") as HTMLInputElement;
    const textarea = await screen.findByLabelText("搜索主题（每行一个）") as HTMLTextAreaElement;

    expect(input.value).toBe("brave_key_123");
    expect(textarea.value).toBe("中国教育\nAI 教育");
    expect(textarea.placeholder).toBe("中国 教育部 AI 教育\n中国 智慧教育\n中国 高校 AI 教育\n中国 教育科技 公司\nOpenAI education");
    expect((await screen.findByLabelText("count") as HTMLInputElement).value).toBe("30");
    expect((await screen.findByLabelText("freshness") as HTMLInputElement).value).toBe("pm");
    expect((await screen.findByLabelText("safesearch") as HTMLSelectElement).value).toBe("moderate");
    expect((await screen.findByLabelText("国内 country") as HTMLInputElement).value).toBe("CN");
    expect((await screen.findByLabelText("国际 country") as HTMLInputElement).value).toBe("US");
  });

  it("saves normalized queries, Brave Search API key and request parameters", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/config/daily-digest" && !init) {
        return makeResponse({
          queries: ["默认主题"],
          braveSearchApiKey: "old_key",
        });
      }
      if (input === "/api/config/daily-digest" && init?.method === "POST") {
        return makeResponse({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(SearchConfigView));

    const input = await screen.findByLabelText("Brave Search API Key");
    const textarea = await screen.findByLabelText("搜索主题（每行一个）");
    const count = await screen.findByLabelText("count");
    const offset = await screen.findByLabelText("offset");
    const freshness = await screen.findByLabelText("freshness");
    const uiLang = await screen.findByLabelText("ui_lang");
    const goggles = await screen.findByLabelText("goggles（每行一个）");
    const domesticCountry = await screen.findByLabelText("国内 country");
    const internationalSearchLang = await screen.findByLabelText("国际 search_lang");
    const [spellcheck, extraSnippets] = await screen.findAllByRole("checkbox");

    fireEvent.change(input, { target: { value: "new_brave_key" } });
    fireEvent.change(textarea, { target: { value: "  中国教育  \nAI 教育\n\nAI 教育 " } });
    fireEvent.change(count, { target: { value: "50" } });
    fireEvent.change(offset, { target: { value: "3" } });
    fireEvent.change(freshness, { target: { value: "pd" } });
    fireEvent.change(uiLang, { target: { value: "zh-Hans" } });
    fireEvent.click(spellcheck);
    fireEvent.click(extraSnippets);
    fireEvent.change(goggles, { target: { value: " https://example.com/g1 \nhttps://example.com/g1\nhttps://example.com/g2 " } });
    fireEvent.change(domesticCountry, { target: { value: "CN" } });
    fireEvent.change(internationalSearchLang, { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "保存搜索配置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/config/daily-digest", expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }));
    });

    const saveCall = fetchMock.mock.calls.find(([inputValue, init]) => inputValue === "/api/config/daily-digest" && init?.method === "POST");
    expect(saveCall).toBeDefined();
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      queries: ["中国教育", "AI 教育"],
      braveSearchApiKey: "new_brave_key",
      braveSearch: {
        request: {
          count: 50,
          offset: 3,
          freshness: "pd",
          spellcheck: true,
          safesearch: "strict",
          uiLang: "zh-Hans",
          extraSnippets: true,
          goggles: ["https://example.com/g1", "https://example.com/g2"],
        },
        domestic: {
          country: "CN",
          searchLang: "zh-hans",
        },
        international: {
          country: "",
          searchLang: "en",
        },
      },
    });
    expect(await screen.findByText("已保存搜索配置")).toBeDefined();
  });
});
