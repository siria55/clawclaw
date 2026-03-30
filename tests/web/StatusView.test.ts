// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IMView, type IMSubTab } from "../../src/web/ui/IMView.js";
import { StatusView } from "../../src/web/ui/StatusView.js";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

function ControlledIMView(props: { initialTab: IMSubTab }): React.JSX.Element {
  const [tab, setTab] = React.useState<IMSubTab>(props.initialTab);
  return React.createElement(IMView, { activeTab: tab, onTabChange: setTab });
}

describe("StatusView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("renders overview metrics and config files only", async () => {
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
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(StatusView));

    expect(await screen.findByText("长期记忆")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("IM 配置")).toBeDefined();
    expect(screen.getByText("./data/im/im-config.json")).toBeDefined();
    expect(screen.getByText("请查看飞书状态")).toBeDefined();
    expect(screen.queryByText("飞书运行状态")).toBeNull();
  });

  it("renders IM status when the status subtab is active", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "/api/status") {
        throw new Error(`Unexpected fetch: ${input}`);
      }
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
          metrics: [],
          configFiles: [],
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
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(ControlledIMView, { initialTab: "status" }));

    expect(await screen.findByText("飞书运行状态")).toBeDefined();
    expect(screen.getByText("cli_demo")).toBeDefined();
    expect(screen.getByText("运营群")).toBeDefined();
    expect(screen.getByText(/机器人进群/)).toBeDefined();
  });

  it("renders IM log by default and can switch to the status subtab", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith("/api/im-log")) {
        return makeResponse({
          events: [{
            id: "1",
            platform: "feishu",
            userId: "ou_demo",
            chatId: "oc_demo",
            chatName: "运营群",
            eventType: "bot_added",
            text: "机器人已加入群：运营群",
            replyText: "https://example.com/news",
            timestamp: "2026-03-19T08:00:00.000Z",
          }],
          total: 1,
        });
      }
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
            metrics: [],
            configFiles: [],
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
          },
        });
      }
      if (input === "/api/im-config") {
        return makeResponse({
          feishu: {
            appId: "cli_saved",
            appSecret: "secret_masked",
            verificationToken: "token_masked",
            encryptKey: "",
            chatId: "oc_saved",
          },
        });
      }
      if (input === "/api/im-config/feishu-target?chatId=oc_saved") {
        return makeResponse({
          ok: true,
          target: {
            chatId: "oc_saved",
            targetType: "group",
            name: "日报群",
          },
        });
      }
      if (input === "/api/im-config/feishu-target?chatId=oc_demo") {
        return makeResponse({
          ok: true,
          target: {
            chatId: "oc_demo",
            targetType: "group",
            name: "运营群",
          },
        });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(ControlledIMView, { initialTab: "messages" }));

    expect(await screen.findByText("机器人已加入群：运营群")).toBeDefined();
    expect(screen.getByText("IM 消息日志")).toBeDefined();
    expect(screen.getAllByText("运营群").length).toBeGreaterThan(0);
    expect(screen.getByText("https://example.com/news")).toBeDefined();
    expect(screen.queryByText("飞书运行状态")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "状态" }));

    expect(await screen.findByText("飞书运行状态")).toBeDefined();
    expect(screen.getByText("cli_demo")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "配置" }));

    expect(await screen.findByText("飞书 IM 配置")).toBeDefined();
    expect(screen.getByDisplayValue("cli_saved")).toBeDefined();
    expect(screen.getByDisplayValue("oc_saved")).toBeDefined();
    expect(await screen.findByText("已解析目标：日报群（群聊）")).toBeDefined();
  });
});
