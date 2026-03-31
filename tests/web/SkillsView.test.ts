// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SkillsView } from "../../src/web/ui/SkillsView.js";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

function makeSSEBody(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

function makeStreamResponse(events: unknown[]): Response {
  return {
    ok: true,
    body: makeSSEBody(events),
  } as Response;
}

describe("SkillsView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads daily-digest config in the same card as the run button", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/skills") {
        return makeResponse({
          skills: [{ id: "daily-digest", description: "生成 AI x 教育日报" }],
        });
      }
      if (input === "/api/config/daily-digest") {
        return makeResponse({ queries: ["国内AI科技", "国际AI科技"] });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(SkillsView));

    expect(await screen.findByText("daily-digest")).toBeDefined();
    expect(screen.getByText("▶ 运行")).toBeDefined();
    const textarea = await screen.findByLabelText("搜索主题（每行一个）") as HTMLTextAreaElement;
    expect(textarea.value).toBe("国内AI科技\n国际AI科技");
    expect(textarea.placeholder).toBe("中国 教育部 AI 教育\n中国 智慧教育\n中国 高校 AI 教育\n中国 教育科技 公司\nOpenAI education");
  });

  it("saves normalized daily-digest queries from the skill card", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/skills") {
        return makeResponse({
          skills: [{ id: "daily-digest", description: "生成 AI x 教育日报" }],
        });
      }
      if (input === "/api/config/daily-digest" && !init) {
        return makeResponse({ queries: ["默认主题"] });
      }
      if (input === "/api/config/daily-digest" && init?.method === "POST") {
        return makeResponse({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(SkillsView));

    const textarea = await screen.findByLabelText("搜索主题（每行一个）");
    fireEvent.change(textarea, { target: { value: "  国内AI科技  \n国际AI科技\n\n国际AI科技 " } });
    fireEvent.click(screen.getByRole("button", { name: "保存 DailyDigest 配置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/config/daily-digest", expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }));
    });

    const saveCall = fetchMock.mock.calls.find(([input, init]) => input === "/api/config/daily-digest" && init?.method === "POST");
    expect(saveCall).toBeDefined();
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      queries: ["国内AI科技", "国际AI科技"],
    });
    expect(await screen.findByText("已保存，下一次运行 daily-digest 即生效")).toBeDefined();
  });

  it("still runs the daily-digest skill and renders logs", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/skills") {
        return makeResponse({
          skills: [{ id: "daily-digest", description: "生成 AI x 教育日报" }],
        });
      }
      if (input === "/api/config/daily-digest") {
        return makeResponse({ queries: ["国内AI科技"] });
      }
      if (input === "/api/skills/daily-digest/run" && init?.method === "POST") {
        return makeStreamResponse([
          { type: "log", text: "开始搜索新闻" },
          { type: "done", outputPath: "data/skills/daily-digest/2026-03-20.png" },
        ]);
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(SkillsView));

    fireEvent.click(await screen.findByRole("button", { name: "▶ 运行" }));

    expect(await screen.findByText("开始搜索新闻")).toBeDefined();
    expect(await screen.findByText("✓ 完成")).toBeDefined();
    expect(screen.getByAltText("skill output")).toBeDefined();
  });
});
