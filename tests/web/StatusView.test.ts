// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusView } from "../../src/web/ui/StatusView.js";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

describe("StatusView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders overview metrics, Feishu runtime and config files", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/status") {
        return makeResponse({
          connections: [{ platform: "feishu", label: "飞书 Bot", connected: true }],
          overview: {
            feishu: {
              runtime: {
                configured: true,
                active: true,
                source: "storage",
                webhookPath: "/feishu",
              },
              appId: "cli_demo",
              chatId: "oc_demo",
              hasAppSecret: true,
              hasVerificationToken: true,
              hasEncryptKey: false,
              permissionsHint: "需要通讯录读取权限",
            },
            metrics: [
              { key: "memory", label: "长期记忆", value: "3", hint: "memory.json" },
              { key: "cron", label: "Cron", value: "1 / 2", hint: "启用 / 总数" },
            ],
            configFiles: [
              {
                key: "im_config",
                label: "IM 配置",
                path: "./data/im/im-config.json",
                exists: true,
                summary: "飞书已配置",
                updatedAt: "2026-03-19T08:00:00.000Z",
                sizeBytes: 123,
              },
            ],
            chats: [
              {
                platform: "feishu",
                chatId: "oc_demo",
                chatName: "运营群",
                active: true,
                joinedAt: "2026-03-19T07:30:00.000Z",
                lastSeen: "2026-03-19T08:00:00.000Z",
                lastEventType: "bot_added",
              },
            ],
            lastIMEvent: {
              platform: "feishu",
              chatId: "oc_demo",
              userId: "ou_demo",
              timestamp: "2026-03-19T08:00:00.000Z",
              textPreview: "请查看飞书状态",
            },
          },
        });
      }
      if (input === "/api/im-log") {
        return makeResponse({
          events: [{
            id: "1",
            platform: "feishu",
            userId: "ou_demo",
            chatId: "oc_demo",
            chatName: "运营群",
            eventType: "bot_added",
            text: "机器人已加入群：运营群",
            replyText: undefined,
            timestamp: "2026-03-19T08:00:00.000Z",
          }],
          total: 1,
        });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(StatusView));

    expect(await screen.findByText("长期记忆")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("飞书运行状态")).toBeDefined();
    expect(screen.getByText("cli_demo")).toBeDefined();
    expect(screen.getAllByText("运营群").length).toBeGreaterThan(0);
    expect(screen.getAllByText("机器人进群").length).toBeGreaterThan(0);
    expect(screen.getByText("IM 配置")).toBeDefined();
    expect(screen.getByText("./data/im/im-config.json")).toBeDefined();
    expect(screen.getByText("请查看飞书状态")).toBeDefined();
  });
});
