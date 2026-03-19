// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CronView } from "../../src/web/ui/CronView.js";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

describe("CronView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and renders cron jobs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse({
      jobs: [{
        id: "daily-digest",
        schedule: "0 9 * * *",
        message: "生成日报",
        chatId: "oc_daily",
        chatIds: ["oc_daily"],
        platform: "feishu",
        enabled: true,
        direct: false,
        msgType: "text",
      }],
    })));

    render(React.createElement(CronView));

    expect(await screen.findByText("daily-digest")).toBeDefined();
    expect(screen.getByText("生成日报")).toBeDefined();
  });

  it("runs a cron job from the run button", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/cron") {
        return makeResponse({
          jobs: [{
            id: "daily-digest",
            schedule: "0 9 * * *",
            message: "生成日报",
            chatId: "oc_daily",
            chatIds: ["oc_daily"],
            platform: "feishu",
            enabled: true,
            direct: false,
            msgType: "text",
          }],
        });
      }
      if (input === "/api/cron/daily-digest/run" && init?.method === "POST") {
        return makeResponse({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(CronView));
    fireEvent.click(await screen.findByText("运行"));

    await waitFor(() => {
      expect(screen.getByText("已直接执行")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/cron/daily-digest/run", { method: "POST" });
  });

  it("shows markdown as a direct message type option", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse({ jobs: [] })));

    render(React.createElement(CronView));
    fireEvent.click(screen.getAllByText("+ 新增")[0]!);
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);

    expect(await screen.findByRole("option", { name: "Markdown（飞书渲染）" })).toBeDefined();
  });

  it("renders multiple delivery targets for one cron job", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse({
      jobs: [{
        id: "multi-target",
        schedule: "0 9 * * *",
        message: "群发日报",
        chatId: "ou_owner",
        chatIds: ["ou_owner", "oc_team"],
        platform: "feishu",
        enabled: true,
        direct: false,
        msgType: "text",
      }],
    })));

    render(React.createElement(CronView));

    expect(await screen.findByText(/共 2 个目标/)).toBeDefined();
  });
});
