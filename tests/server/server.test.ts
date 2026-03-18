import { describe, it, expect, vi } from "vitest";
import { ClawServer } from "../../src/server/index.js";
import type { IMPlatform } from "../../src/platform/types.js";
import type { Agent } from "../../src/core/agent.js";
import { FeishuChallenge } from "../../src/platform/feishu.js";
import { WecomEcho } from "../../src/platform/wecom.js";

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
      parse: vi.fn(async () => ({ platform: "mock", chatId: "chat1", userId: "user1", text: "ping", raw: {} })),
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

  it("returns 200 ok and skips agent when parse returns null", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startServer({ "/hook": { platform: makeMockPlatform(), agent } });
    const res = await fetch(`${url}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(vi.mocked(agent.run)).not.toHaveBeenCalled();
    await server.stop();
  });
});
