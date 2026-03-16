import { describe, it, expect, vi } from "vitest";
import { ClawServer } from "../../src/server/index.js";
import type { IMPlatform, IMVerifyParams } from "../../src/platform/types.js";
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

async function doRequest(
  server: ClawServer,
  path: string,
  options: { method?: string; body?: string; query?: string } = {},
): Promise<{ status: number; body: string }> {
  const { method = "POST", body = "", query = "" } = options;
  const url = `http://localhost:${(server as unknown as { _config: { port: number } })._config?.port ?? 3000}${path}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? body : undefined,
  });
  return { status: response.status, body: await response.text() };
}

describe("ClawServer", () => {
  it("returns 404 for unknown routes", async () => {
    const server = new ClawServer({ port: 0, routes: {} });
    await server.start();
    const port = (server as unknown as { _server: { address(): { port: number } } })
      ._server.address().port;
    const res = await fetch(`http://localhost:${port}/unknown`, { method: "POST" });
    expect(res.status).toBe(404);
    await server.stop();
  });

  it("responds with Feishu challenge JSON", async () => {
    const platform = makeMockPlatform({
      verify: vi.fn(async () => {}),
      parse: vi.fn(async () => {
        throw new FeishuChallenge("challenge_value");
      }),
    });
    const server = new ClawServer({ port: 0, routes: { "/feishu": { platform, agent: makeMockAgent() } } });
    await server.start();
    const port = (server as unknown as { _server: { address(): { port: number } } })
      ._server.address().port;
    const res = await fetch(`http://localhost:${port}/feishu`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { challenge: string };
    expect(json.challenge).toBe("challenge_value");
    await server.stop();
  });

  it("responds with WecomEcho plain text for GET", async () => {
    const platform = makeMockPlatform({
      verify: vi.fn(async () => { throw new WecomEcho("echo_string"); }),
    });
    const server = new ClawServer({ port: 0, routes: { "/wecom": { platform, agent: makeMockAgent() } } });
    await server.start();
    const port = (server as unknown as { _server: { address(): { port: number } } })
      ._server.address().port;
    const res = await fetch(`http://localhost:${port}/wecom?msg_signature=x&timestamp=1&nonce=1&echostr=x`, {
      method: "GET",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo_string");
    await server.stop();
  });

  it("returns 401 when verify throws a generic error", async () => {
    const platform = makeMockPlatform({
      verify: vi.fn(async () => { throw new Error("bad sig"); }),
    });
    const server = new ClawServer({ port: 0, routes: { "/hook": { platform, agent: makeMockAgent() } } });
    await server.start();
    const port = (server as unknown as { _server: { address(): { port: number } } })
      ._server.address().port;
    const res = await fetch(`http://localhost:${port}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    await server.stop();
  });

  it("returns 200 and dispatches message to agent", async () => {
    const agent = makeMockAgent("hello back");
    const platform = makeMockPlatform({
      parse: vi.fn(async () => ({
        platform: "mock",
        chatId: "chat1",
        userId: "user1",
        text: "ping",
        raw: {},
      })),
    });
    const server = new ClawServer({ port: 0, routes: { "/hook": { platform, agent } } });
    await server.start();
    const port = (server as unknown as { _server: { address(): { port: number } } })
      ._server.address().port;
    const res = await fetch(`http://localhost:${port}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    // Give the async agent dispatch a moment to run
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(agent.run)).toHaveBeenCalledWith("ping");
    await server.stop();
  });
});
