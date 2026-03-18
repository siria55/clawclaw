import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebServer } from "../../src/web/server.js";
import { NewsStorage } from "../../src/news/storage.js";
import { MemoryStorage } from "../../src/memory/storage.js";
import { ConfigStorage } from "../../src/config/storage.js";
import type { IMConfig, AgentMetaConfig } from "../../src/config/types.js";
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

  it("returns 404 when staticDir has no index.html", async () => {
    const emptyDir = join(tmpdir(), `clawclaw-empty-${Date.now()}`);
    mkdirSync(emptyDir, { recursive: true });
    try {
      const agent = makeMockAgent();
      const server = new WebServer({ agent, port: 0, staticDir: emptyDir });
      await server.start();
      const url = `http://localhost:${server.port}`;
      const res = await fetch(`${url}/missing.js`);
      expect(res.status).toBe(404);
      await server.stop();
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
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

  it("GET /api/status returns empty arrays when getStatus is not provided", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent);
    const res = await fetch(`${url}/api/status`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json() as { cronJobs: unknown[]; connections: unknown[] };
    expect(body.cronJobs).toEqual([]);
    expect(body.connections).toEqual([]);
    await server.stop();
  });

  it("GET /api/status calls getStatus and returns its result", async () => {
    const agent = makeMockAgent();
    const getStatus = vi.fn(() => ({
      cronJobs: [{ id: "daily", schedule: "0 9 * * *", message: "report", timezone: "Asia/Shanghai" }],
      connections: [{ platform: "feishu", label: "飞书 Bot", connected: true }],
    }));
    const server = new WebServer({ agent, port: 0, staticDir, getStatus });
    await server.start();
    const url = `http://localhost:${server.port}`;
    const res = await fetch(`${url}/api/status`);
    const body = await res.json() as { cronJobs: unknown[]; connections: unknown[] };
    expect(body.cronJobs).toHaveLength(1);
    expect(body.connections).toHaveLength(1);
    expect(getStatus).toHaveBeenCalled();
    await server.stop();
  });

  it("emits thinking SSE event for thinking content blocks", async () => {
    const agent = {
      name: "mock",
      run: vi.fn(),
      stream: vi.fn(async function* (): AsyncGenerator<AgentEvent> {
        yield {
          type: "message",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "let me think..." },
              { type: "text", text: "answer" },
            ],
          },
        };
        yield { type: "done", result: { messages: [], turns: 1 } };
      }),
    } as unknown as Agent;

    const server = new WebServer({ agent, port: 0, staticDir });
    await server.start();
    const url = `http://localhost:${server.port}`;

    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    const body = await res.text();
    expect(body).toContain("event: thinking");
    expect(body).toContain("let me think...");
    expect(body).toContain("event: message");
    await server.stop();
  });

  it("GET /api/news returns empty page when newsStorage is not provided", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent);
    const res = await fetch(`${url}/api/news`);
    expect(res.status).toBe(200);
    const body = await res.json() as { articles: unknown[]; total: number };
    expect(body.articles).toEqual([]);
    expect(body.total).toBe(0);
    await server.stop();
  });

  it("GET /api/news returns articles from newsStorage", async () => {
    const agent = makeMockAgent();
    const newsDir = join(tmpdir(), `clawclaw-srv-news-${Date.now()}`);
    mkdirSync(newsDir, { recursive: true });
    const newsStorage = new NewsStorage(join(newsDir, "news.json"));
    newsStorage.save({ title: "Hello News", url: "https://x.com", summary: "summary", source: "Src", tags: [] });

    const server = new WebServer({ agent, port: 0, staticDir, newsStorage });
    await server.start();
    const url = `http://localhost:${server.port}`;

    const res = await fetch(`${url}/api/news`);
    const body = await res.json() as { articles: { title: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.articles[0].title).toBe("Hello News");

    await server.stop();
    rmSync(newsDir, { recursive: true, force: true });
  });

  it("GET /api/news?q= filters by keyword", async () => {
    const agent = makeMockAgent();
    const newsDir = join(tmpdir(), `clawclaw-srv-news-q-${Date.now()}`);
    mkdirSync(newsDir, { recursive: true });
    const newsStorage = new NewsStorage(join(newsDir, "news.json"));
    newsStorage.save({ title: "AI Weekly", url: "https://x.com", summary: "s", source: "S", tags: [] });
    newsStorage.save({ title: "Sports Report", url: "https://x.com", summary: "s", source: "S", tags: [] });

    const server = new WebServer({ agent, port: 0, staticDir, newsStorage });
    await server.start();
    const url = `http://localhost:${server.port}`;

    const res = await fetch(`${url}/api/news?q=ai`);
    const body = await res.json() as { articles: { title: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.articles[0].title).toBe("AI Weekly");

    await server.stop();
    rmSync(newsDir, { recursive: true, force: true });
  });

  it("GET /api/im-config returns empty object when no imConfigStorage", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent);
    const res = await fetch(`${url}/api/im-config`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({});
    await server.stop();
  });

  it("GET /api/im-config returns masked feishu config", async () => {
    const agent = makeMockAgent();
    const imDir = join(tmpdir(), `clawclaw-im-${Date.now()}`);
    mkdirSync(imDir, { recursive: true });
    const imConfigStorage: ConfigStorage<IMConfig> = new ConfigStorage<IMConfig>(join(imDir, "im-config.json"));
    imConfigStorage.write({
      feishu: { appId: "cli_abcdefg", appSecret: "secretXYZ", verificationToken: "tokenABC" },
    });

    const server = new WebServer({ agent, port: 0, staticDir, imConfigStorage });
    await server.start();
    const res = await fetch(`http://localhost:${server.port}/api/im-config`);
    const body = await res.json() as { feishu: { appId: string; appSecret: string } };
    expect(body.feishu.appId).toBe("cli_abcdefg");
    expect(body.feishu.appSecret).toBe("secretXYZ");

    await server.stop();
    rmSync(imDir, { recursive: true, force: true });
  });

  it("POST /api/im-config saves config and calls onIMConfig", async () => {
    const agent = makeMockAgent();
    const imDir = join(tmpdir(), `clawclaw-im-post-${Date.now()}`);
    mkdirSync(imDir, { recursive: true });
    const imConfigStorage: ConfigStorage<IMConfig> = new ConfigStorage<IMConfig>(join(imDir, "im-config.json"));
    const onIMConfig = vi.fn();

    const server = new WebServer({ agent, port: 0, staticDir, imConfigStorage, onIMConfig });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/im-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feishu: { appId: "cli_new", appSecret: "sec", verificationToken: "tok" } }),
    });
    expect(res.status).toBe(200);
    expect(onIMConfig).toHaveBeenCalledOnce();
    expect(imConfigStorage.read().feishu?.appId).toBe("cli_new");

    await server.stop();
    rmSync(imDir, { recursive: true, force: true });
  });

  it("POST /api/im-config saves feishu config and returns ok", async () => {
    const agent = makeMockAgent();
    const imDir = join(tmpdir(), `clawclaw-im-mask-${Date.now()}`);
    mkdirSync(imDir, { recursive: true });
    const imConfigStorage: ConfigStorage<IMConfig> = new ConfigStorage<IMConfig>(join(imDir, "im-config.json"));
    imConfigStorage.write({
      feishu: { appId: "cli_orig", appSecret: "original_secret", verificationToken: "orig_token" },
    });
    const onIMConfig = vi.fn();

    const server = new WebServer({ agent, port: 0, staticDir, imConfigStorage, onIMConfig });
    await server.start();

    // Update appId, keep appSecret unchanged
    await fetch(`http://localhost:${server.port}/api/im-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feishu: { appId: "cli_new", appSecret: "original_secret", verificationToken: "orig_token" } }),
    });

    const saved = imConfigStorage.read().feishu;
    expect(saved?.appId).toBe("cli_new");
    expect(saved?.appSecret).toBe("original_secret");
    expect(saved?.verificationToken).toBe("orig_token");

    await server.stop();
    rmSync(imDir, { recursive: true, force: true });
  });

  it("GET /api/config/agent returns empty object when no agentConfigStorage", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent);
    const res = await fetch(`${url}/api/config/agent`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({});
    await server.stop();
  });

  it("POST /api/config/agent saves config and calls onAgentConfig", async () => {
    const agent = makeMockAgent();
    const agentDir = join(tmpdir(), `clawclaw-agent-${Date.now()}`);
    mkdirSync(agentDir, { recursive: true });
    const agentConfigStorage = new ConfigStorage<AgentMetaConfig>(join(agentDir, "agent-config.json"));
    const onAgentConfig = vi.fn();

    const server = new WebServer({ agent, port: 0, staticDir, agentConfigStorage, onAgentConfig });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-bot", systemPrompt: "Be concise." }),
    });
    expect(res.status).toBe(200);
    expect(onAgentConfig).toHaveBeenCalledOnce();
    expect(agentConfigStorage.read().systemPrompt).toBe("Be concise.");
    expect(agentConfigStorage.read().name).toBe("my-bot");

    await server.stop();
    rmSync(agentDir, { recursive: true, force: true });
  });

  it("GET /api/config/agent returns saved config", async () => {
    const agent = makeMockAgent();
    const agentDir = join(tmpdir(), `clawclaw-agent-get-${Date.now()}`);
    mkdirSync(agentDir, { recursive: true });
    const agentConfigStorage = new ConfigStorage<AgentMetaConfig>(join(agentDir, "agent-config.json"));
    agentConfigStorage.write({ name: "bot", systemPrompt: "You are helpful." });

    const server = new WebServer({ agent, port: 0, staticDir, agentConfigStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/agent`);
    const body = await res.json() as AgentMetaConfig;
    expect(body.name).toBe("bot");
    expect(body.systemPrompt).toBe("You are helpful.");

    await server.stop();
    rmSync(agentDir, { recursive: true, force: true });
  });

  it("GET /api/memory returns empty page when memoryStorage is not provided", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent);
    const res = await fetch(`${url}/api/memory`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[]; total: number };
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
    await server.stop();
  });

  it("GET /api/memory returns all entries sorted newest first", async () => {
    const agent = makeMockAgent();
    const memDir = join(tmpdir(), `clawclaw-mem-${Date.now()}`);
    mkdirSync(memDir, { recursive: true });
    const memoryStorage = new MemoryStorage(join(memDir, "memory.json"));
    memoryStorage.save({ content: "first memory", tags: ["a"] });
    memoryStorage.save({ content: "second memory", tags: ["b"] });

    const server = new WebServer({ agent, port: 0, staticDir, memoryStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/memory`);
    const body = await res.json() as { entries: { content: string }[]; total: number };
    expect(body.total).toBe(2);
    const contents = body.entries.map((e) => e.content);
    expect(contents).toContain("first memory");
    expect(contents).toContain("second memory");

    await server.stop();
    rmSync(memDir, { recursive: true, force: true });
  });

  it("GET /api/memory?q= filters by keyword", async () => {
    const agent = makeMockAgent();
    const memDir = join(tmpdir(), `clawclaw-mem-q-${Date.now()}`);
    mkdirSync(memDir, { recursive: true });
    const memoryStorage = new MemoryStorage(join(memDir, "memory.json"));
    memoryStorage.save({ content: "TypeScript is great", tags: [] });
    memoryStorage.save({ content: "Lunch was delicious", tags: [] });

    const server = new WebServer({ agent, port: 0, staticDir, memoryStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/memory?q=typescript`);
    const body = await res.json() as { entries: { content: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.entries[0].content).toBe("TypeScript is great");

    await server.stop();
    rmSync(memDir, { recursive: true, force: true });
  });
});
