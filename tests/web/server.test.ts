import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebServer } from "../../src/web/server.js";
import type { Agent } from "../../src/core/agent.js";
import type { AgentConfig } from "../../src/core/types.js";
import type { AgentEvent } from "../../src/core/types.js";

/** Temp directory with a fake index.html for static serving tests */
let staticDir: string;

beforeAll(() => {
  staticDir = join(tmpdir(), `clawclaw-test-${Date.now()}`);
  mkdirSync(staticDir, { recursive: true });
  writeFileSync(join(staticDir, "index.html"), "<html><body>test</body></html>");
});

afterAll(() => {
  rmSync(staticDir, { recursive: true, force: true });
});

function makeMockAgent(reply = "hello"): Agent {
  return {
    name: "mock-agent",
    run: vi.fn(async () => ({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "text", text: reply }] },
      ],
      turns: 1,
    })),
    stream: vi.fn(async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "message", message: { role: "assistant", content: [{ type: "text", text: reply }] } };
      yield {
        type: "done",
        result: {
          messages: [
            { role: "user", content: "hi" },
            { role: "assistant", content: [{ type: "text", text: reply }] },
          ],
          turns: 1,
        },
      };
    }),
  } as unknown as Agent;
}

async function startWebServer(
  agent: Agent,
  agentConfig?: AgentConfig,
): Promise<{ server: WebServer; url: string }> {
  const server = new WebServer({ agent, agentConfig, port: 0, staticDir });
  await server.start();
  return { server, url: `http://localhost:${server.port}` };
}

describe("WebServer", () => {
  it("serves index.html on GET /", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent);
    const res = await fetch(`${url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    await server.stop();
  });

  it("returns 404 for unknown routes", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent);
    const res = await fetch(`${url}/unknown`);
    expect(res.status).toBe(404);
    await server.stop();
  });

  it("streams SSE events on POST /api/chat", async () => {
    const agent = makeMockAgent("world");
    const { server, url } = await startWebServer(agent);

    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const body = await res.text();
    expect(body).toContain("event: message");
    expect(body).toContain("event: done");
    await server.stop();
  });

  it("exposes bound port after start()", async () => {
    const agent = makeMockAgent();
    const { server } = await startWebServer(agent);
    expect(server.port).toBeGreaterThan(0);
    await server.stop();
  });

  it("uses default agent when no X-Claw-Config header is sent", async () => {
    const agent = makeMockAgent("default reply");
    const { server, url } = await startWebServer(agent);

    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(agent.stream)).toHaveBeenCalled();
    await server.stop();
  });

  it("uses default agent when agentConfig is not provided even with X-Claw-Config header", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent); // no agentConfig

    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Claw-Config": JSON.stringify({ model: "claude-haiku-4-5-20251001" }),
      },
      body: JSON.stringify({ message: "hi" }),
    });

    expect(res.status).toBe(200);
    // Falls back to the default agent since agentConfig is not provided
    expect(vi.mocked(agent.stream)).toHaveBeenCalled();
    await server.stop();
  });

  it("uses overridden agent when agentConfig and X-Claw-Config are both provided", async () => {
    const defaultAgent = makeMockAgent("default");
    const llmMock = {
      complete: vi.fn(async () => ({
        message: { role: "assistant" as const, content: [{ type: "text" as const, text: "overridden" }] },
      })),
    };
    const agentConfig: AgentConfig = {
      name: "base",
      system: "sys",
      llm: llmMock,
      compressor: undefined,
    };
    const { server, url } = await startWebServer(defaultAgent, agentConfig);

    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Claw-Config": JSON.stringify({ model: "claude-haiku-4-5-20251001" }),
      },
      body: JSON.stringify({ message: "hi" }),
    });

    expect(res.status).toBe(200);
    // The default agent's stream was NOT called — a new agent was constructed
    expect(vi.mocked(defaultAgent.stream)).not.toHaveBeenCalled();
    await server.stop();
  });
});
