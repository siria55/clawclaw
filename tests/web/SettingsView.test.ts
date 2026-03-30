// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsView } from "../../src/web/ui/SettingsView.js";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

describe("SettingsView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads Brave Search API key from daily-digest config", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/config/agent") return makeResponse({});
      if (input === "/api/config/feishu-docs") return makeResponse({ docs: [], syncedDocs: [] });
      if (input === "/api/config/daily-digest") return makeResponse({ braveSearchApiKey: "brave_key_123" });
      if (input === "/api/config/llm") return makeResponse({});
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(SettingsView));

    const input = await screen.findByLabelText("Brave Search API Key") as HTMLInputElement;
    expect(input.value).toBe("brave_key_123");
  });

  it("saves Brave Search API key through daily-digest config endpoint", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/config/agent") return makeResponse({});
      if (input === "/api/config/feishu-docs") return makeResponse({ docs: [], syncedDocs: [] });
      if (input === "/api/config/daily-digest" && !init) return makeResponse({});
      if (input === "/api/config/daily-digest" && init?.method === "POST") return makeResponse({ ok: true });
      if (input === "/api/config/llm") return makeResponse({});
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(SettingsView));

    const input = await screen.findByLabelText("Brave Search API Key");
    fireEvent.change(input, { target: { value: "brave_saved_key" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 Brave Search 配置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/config/daily-digest", expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }));
    });

    const saveCall = fetchMock.mock.calls.find(([inputValue, init]) => inputValue === "/api/config/daily-digest" && init?.method === "POST");
    expect(saveCall).toBeDefined();
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      braveSearchApiKey: "brave_saved_key",
    });
    expect(await screen.findByText("已保存 Brave Search 配置")).toBeDefined();
  });
});
