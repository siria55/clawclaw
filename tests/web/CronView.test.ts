// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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

  afterEach(() => {
    cleanup();
  });

  it("loads and renders cron jobs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse({
      jobs: [{
        id: "daily-digest",
        schedule: "0 9 * * *",
        message: "生成日报",
        chatId: "oc_daily",
        chatIds: ["oc_daily"],
        resolvedTargets: [{ chatId: "oc_daily", targetType: "group", name: "日报群" }],
        platform: "feishu",
        enabled: true,
        direct: false,
        msgType: "text",
      }],
    })));

    render(React.createElement(CronView));

    expect(await screen.findByText("daily-digest")).toBeDefined();
    expect(screen.getByText("生成日报")).toBeDefined();
    expect(screen.getByText(/日报群（oc_daily）/)).toBeDefined();
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
            resolvedTargets: [{ chatId: "oc_daily", targetType: "group", name: "日报群" }],
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
        resolvedTargets: [
          { chatId: "ou_owner", targetType: "user", name: "Owner" },
          { chatId: "oc_team", targetType: "group", name: "团队群" },
        ],
        platform: "feishu",
        enabled: true,
        direct: false,
        msgType: "text",
      }],
    })));

    render(React.createElement(CronView));

    expect(await screen.findByText(/共 2 个目标/)).toBeDefined();
    expect(screen.getByText(/Owner（ou_owner）/)).toBeDefined();
    expect(screen.getByText(/团队群（oc_team）/)).toBeDefined();
  });

  it("allows saving a skill-only cron job without delivery targets", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/cron" && !init) {
        return makeResponse({ jobs: [] });
      }
      if (input === "/api/cron" && init?.method === "POST") {
        return makeResponse({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(CronView));

    fireEvent.click(screen.getAllByText("+ 新增")[0]!);
    const textboxes = screen.getAllByRole("textbox");
    fireEvent.change(textboxes[0]!, { target: { value: "daily-digest-generate" } });
    fireEvent.change(textboxes[1]!, { target: { value: "0 9 * * *" } });
    fireEvent.change(textboxes[3]!, { target: { value: "执行 daily-digest" } });
    fireEvent.change(textboxes[4]!, { target: { value: "daily-digest" } });
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/cron", expect.objectContaining({ method: "POST" }));
    });
  });
});
