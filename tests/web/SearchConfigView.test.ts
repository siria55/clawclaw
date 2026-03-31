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
  });

  it("saves normalized queries and Brave Search API key", async () => {
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

    fireEvent.change(input, { target: { value: "new_brave_key" } });
    fireEvent.change(textarea, { target: { value: "  中国教育  \nAI 教育\n\nAI 教育 " } });
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
    });
    expect(await screen.findByText("已保存搜索配置")).toBeDefined();
  });
});
