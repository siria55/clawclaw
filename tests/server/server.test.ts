import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClawServer } from "../../src/server/index.js";
import type { IMPlatform } from "../../src/platform/types.js";
import type { Agent } from "../../src/core/agent.js";
import { FeishuChallenge } from "../../src/platform/feishu.js";
import { WecomEcho } from "../../src/platform/wecom.js";
import { ConversationStorage } from "../../src/im/conversations.js";
import { IMEventStorage } from "../../src/im/storage.js";
import type { ConversationStorage } from "../../src/im/conversations.js";

function makeMockPlatform(overrides: Partial<IMPlatform> = {}): IMPlatform {
  return {
    name: "mock",
    verify: vi.fn(async () => {}),
    parse: vi.fn(async () => null),
    send: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeMockAgent(reply = "pong"): Agent {
  return {
    name: "mock-agent",
    run: vi.fn(async () => ({
      messages: [
        { role: "user", content: "ping" },
        { role: "assistant", content: [{ type: "text", text: reply }] },
      ],
      turns: 1,
    })),
    stream: vi.fn(async function* () {}),
  } as unknown as Agent;
}

async function startServer(routes: ClawServerConfig["routes"]): Promise<{ server: ClawServer; url: string }> {
  const server = new ClawServer({ port: 0, routes });
  await server.start();
  return { server, url: `http://localhost:${server.port}` };
}

type ClawServerConfig = ConstructorParameters<typeof ClawServer>[0];

describe("ClawServer", () => {
  it("exposes bound port after start()", async () => {
    const { server } = await startServer({});
    expect(server.port).toBeGreaterThan(0);
    await server.stop();
  });

  it("returns 404 for unknown routes", async () => {
    const { server, url } = await startServer({});
    const res = await fetch(`${url}/unknown`, { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
    await server.stop();
  });

  it("responds with Feishu challenge JSON", async () => {
    const platform = makeMockPlatform({
      parse: vi.fn(async () => { throw new FeishuChallenge("challenge_value"); }),
    });
    const { server, url } = await startServer({ "/feishu": { platform, agent: makeMockAgent() } });
    const res = await fetch(`${url}/feishu`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect((await res.json() as { challenge: string }).challenge).toBe("challenge_value");
    await server.stop();
  });

  it("responds with WecomEcho plain text for GET", async () => {
    const platform = makeMockPlatform({
      verify: vi.fn(async () => { throw new WecomEcho("echo_string"); }),
    });
    const { server, url } = await startServer({ "/wecom": { platform, agent: makeMockAgent() } });
    const res = await fetch(`${url}/wecom?msg_signature=x&timestamp=1&nonce=1&echostr=x`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo_string");
    await server.stop();
  });

  it("returns 401 when verify throws a generic error", async () => {
    const platform = makeMockPlatform({
      verify: vi.fn(async () => { throw new Error("bad sig"); }),
    });
    const { server, url } = await startServer({ "/hook": { platform, agent: makeMockAgent() } });
    const res = await fetch(`${url}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    await server.stop();
  });

  it("returns 200 and dispatches message to agent", async () => {
    const agent = makeMockAgent("hello back");
    const platform = makeMockPlatform({
      parse: vi.fn(async () => ({
        platform: "mock",
        chatId: "chat1",
        sessionId: "chat1",
        continuityId: "mock:chat1:user1",
        userId: "user1",
        text: "ping",
        raw: {},
      })),
    });
    const { server, url } = await startServer({ "/hook": { platform, agent } });
    const res = await fetch(`${url}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(agent.run)).toHaveBeenCalledWith(
      expect.stringContaining("ping"),
      expect.objectContaining({ history: expect.any(Array) }),
    );
    await server.stop();
  });

  it("loads bridged history when a new session arrives", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claw-server-"));
    try {
      const conversationStorage = new ConversationStorage(join(dir, "conversations.json"));
      conversationStorage.set(
        "chat1",
        [
          { role: "user", content: "昨天先聊到日报" },
          { role: "assistant", content: [{ type: "text", text: "好的，我记住了。" }] },
        ],
        "mock:chat1:user1",
      );

      const agent = makeMockAgent("继续");
      const platform = makeMockPlatform({
        parse: vi.fn(async () => ({
          platform: "mock",
          chatId: "chat1",
          sessionId: "chat1#thread:root1",
          continuityId: "mock:chat1:user1",
          userId: "user1",
          text: "今天继续",
          raw: {},
        })),
      });

      const server = new ClawServer({
        port: 0,
        routes: { "/hook": { platform, agent } },
        conversationStorage,
      });
      await server.start();
      const url = `http://localhost:${server.port}`;

      const res = await fetch(`${url}/hook`, { method: "POST", body: "{}" });
      expect(res.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(vi.mocked(agent.run)).toHaveBeenCalledWith(
        expect.stringContaining("今天继续"),
        expect.objectContaining({
          history: [
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("会话切换参考"),
            }),
          ],
        }),
      );

      await server.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 200 ok and skips agent when parse returns null", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startServer({ "/hook": { platform: makeMockPlatform(), agent } });
    const res = await fetch(`${url}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(vi.mocked(agent.run)).not.toHaveBeenCalled();
    await server.stop();
  });

  it("records bot-added group events without invoking the agent", async () => {
    const agent = makeMockAgent();
    const imEventStorage = new IMEventStorage();
    const platform = makeMockPlatform({
      parse: vi.fn(async () => ({
        platform: "feishu",
        chatId: "oc_newgroup",
        chatName: "运营群",
        sessionId: "oc_newgroup",
        continuityId: "feishu:oc_newgroup:ou_admin",
        userId: "ou_admin",
        eventType: "bot_added",
        text: "机器人已加入群：运营群",
        raw: {},
      })),
    });

    const server = new ClawServer({
      port: 0,
      routes: { "/hook": { platform, agent } },
      imEventStorage,
    });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    expect(vi.mocked(agent.run)).not.toHaveBeenCalled();
    expect(imEventStorage.listChats("feishu")).toEqual([
      expect.objectContaining({
        chatId: "oc_newgroup",
        chatName: "运营群",
        active: true,
        lastEventType: "bot_added",
      }),
    ]);

    await server.stop();
  });

  it("uses route-level onMessage handler before invoking the agent", async () => {
    const agent = makeMockAgent();
    const imEventStorage = new IMEventStorage();
    const onMessage = vi.fn(async () => ({ handled: true, replyText: "[日报图片] 2026-03-19" }));
    const platform = makeMockPlatform({
      parse: vi.fn(async () => ({
        platform: "feishu",
        chatId: "oc_daily",
        sessionId: "oc_daily",
        continuityId: "feishu:oc_daily:ou_user",
        userId: "ou_user",
        text: "给我今天的新闻",
        raw: {},
      })),
    });

    const server = new ClawServer({
      port: 0,
      routes: { "/hook": { platform, agent, onMessage } },
      imEventStorage,
    });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    expect(onMessage).toHaveBeenCalledOnce();
    expect(vi.mocked(agent.run)).not.toHaveBeenCalled();
    expect(imEventStorage.since(undefined)[0]?.replyText).toBe("[日报图片] 2026-03-19");

    await server.stop();
  });
});
