import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebServer } from "../../src/web/server.js";
import { MemoryStorage } from "../../src/memory/storage.js";
import { ConfigStorage } from "../../src/config/storage.js";
import { ConversationStorage } from "../../src/im/conversations.js";
import { IMEventStorage } from "../../src/im/storage.js";
import { MountedDocLibrary } from "../../src/docs/library.js";
import type { IMConfig, LLMConfig, AgentMetaConfig, DailyDigestConfig, MountedDocConfig } from "../../src/config/types.js";
import type { Agent } from "../../src/core/agent.js";
import type { AgentConfig } from "../../src/core/types.js";
import type { AgentEvent } from "../../src/core/types.js";
import type { CronJobConfig } from "../../src/cron/types.js";
import type { IMPlatform } from "../../src/platform/types.js";

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

function makeMockPlatform<TExtra extends object = Record<string, never>>(
  overrides: Partial<IMPlatform> & TExtra = {} as Partial<IMPlatform> & TExtra,
): IMPlatform & TExtra {
  return {
    name: "mock",
    verify: vi.fn(async () => undefined),
    parse: vi.fn(async () => null),
    send: vi.fn(async () => undefined),
    ...overrides,
  } as IMPlatform & TExtra;
}

async function startWebServer(
  agent: Agent,
  agentConfig?: AgentConfig,
): Promise<{ server: WebServer; url: string }> {
  const server = new WebServer({ agent, agentConfig, port: 0, staticDir });
  await server.start();
  return { server, url: `http://localhost:${server.port}` };
}

function httpGetJson<T>(port: number, path: string): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          body: JSON.parse(bodyText) as T,
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

function makeFetchResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
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

  it("GET /api/status returns visual overview for configs and Feishu runtime", async () => {
    const originalFetch = global.fetch;
    const dir = mkdtempSync(join(tmpdir(), "claw-status-overview-"));
    try {
      const agent = makeMockAgent();
      const memoryStorage = new MemoryStorage(join(dir, "memory.json"));
      memoryStorage.save({ content: "记住今天要同步飞书配置", tags: ["ops"] });
      const imEventStorage = new IMEventStorage(50, join(dir, "im-events.json"));
      imEventStorage.append({
        platform: "feishu",
        userId: "ou_admin",
        chatId: "oc_demo",
        chatName: "运营群",
        eventType: "bot_added",
        text: "机器人已加入群：运营群",
        replyText: undefined,
      });
      const imConfigStorage = new ConfigStorage<IMConfig>(join(dir, "im-config.json"));
      imConfigStorage.write({
        feishu: {
          appId: "cli_demo",
          appSecret: "secret",
          verificationToken: "token",
          chatId: "oc_demo",
        },
      });
      const agentConfigStorage = new ConfigStorage<AgentMetaConfig>(join(dir, "agent-config.json"));
      agentConfigStorage.write({ name: "bot", allowedPaths: ["./data/skills"] });
      const dailyDigestConfigStorage = new ConfigStorage<DailyDigestConfig>(join(dir, "daily-digest.json"), { queries: [] });
      dailyDigestConfigStorage.write({ queries: ["国内AI", "国际AI"] });
      const cronStorage = new ConfigStorage<CronJobConfig[]>(join(dir, "cron.json"), []);
      cronStorage.write([{
        id: "daily",
        schedule: "0 9 * * *",
        message: "日报",
        chatId: "oc_demo",
        platform: "feishu",
        enabled: true,
      }]);

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(makeFetchResponse({ tenant_access_token: "tenant-token" }))
        .mockResolvedValueOnce(makeFetchResponse({
          code: 0,
          data: {
            chat: {
              name: "运营群",
            },
          },
        }))
        .mockResolvedValueOnce(makeFetchResponse({ tenant_access_token: "tenant-token" }))
        .mockResolvedValueOnce(makeFetchResponse({
          code: 0,
          data: {
            user: {
              name: "管理员",
            },
          },
        }));
      global.fetch = fetchMock as typeof fetch;

      const server = new WebServer({
        agent,
        port: 0,
        staticDir,
        memoryStorage,
        imEventStorage,
        imConfigStorage,
        agentConfigStorage,
        dailyDigestConfigStorage,
        cronStorage,
        getStatus: () => ({
          cronJobs: [],
          connections: [{ platform: "feishu", label: "飞书 Bot", connected: true }],
          runtime: {
            feishu: {
              configured: true,
              active: true,
              source: "storage",
              webhookPath: "/feishu",
            },
          },
        }),
      });
      await server.start();

      const response = await httpGetJson<{
        overview: {
          feishu: { runtime: { source: string; active: boolean }; appId?: string; chatId?: string; targetName?: string };
          metrics: Array<{ key: string; value: string }>;
          configFiles: Array<{ key: string; exists: boolean; summary: string }>;
          chats: Array<{ chatId: string; chatName?: string; lastEventType: string }>;
          lastIMEvent?: { chatName?: string; userName?: string };
        };
      }>(server.port, "/api/status");

      expect(response.status).toBe(200);
      expect(response.body.overview.feishu.runtime.source).toBe("storage");
      expect(response.body.overview.feishu.runtime.active).toBe(true);
      expect(response.body.overview.feishu.appId).toBe("cli_demo");
      expect(response.body.overview.feishu.chatId).toBe("oc_demo");
      expect(response.body.overview.feishu.targetName).toBe("运营群（群聊）");
      expect(response.body.overview.metrics.find((item) => item.key === "memory")?.value).toBe("1");
      expect(response.body.overview.metrics.find((item) => item.key === "feishu_chats")?.value).toBe("1");
      expect(response.body.overview.configFiles.find((item) => item.key === "im_config")?.exists).toBe(true);
      expect(response.body.overview.configFiles.find((item) => item.key === "cron_config")?.summary).toContain("任务 1 条");
      expect(response.body.overview.chats).toEqual([
        expect.objectContaining({
          chatId: "oc_demo",
          chatName: "运营群",
          lastEventType: "bot_added",
        }),
      ]);
      expect(response.body.overview.lastIMEvent).toEqual(expect.objectContaining({
        chatName: "运营群",
        userName: "管理员",
      }));

      await server.stop();
    } finally {
      global.fetch = originalFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("GET /api/cron enriches feishu target names", async () => {
    const originalFetch = global.fetch;
    const dir = mkdtempSync(join(tmpdir(), "claw-cron-targets-"));
    try {
      const agent = makeMockAgent();
      const cronStorage = new ConfigStorage<CronJobConfig[]>(join(dir, "cron.json"), []);
      cronStorage.write([{
        id: "daily",
        schedule: "0 9 * * *",
        message: "日报",
        chatId: "ou_owner",
        chatIds: ["ou_owner", "oc_team"],
        platform: "feishu",
        enabled: true,
      }]);

      const imConfigStorage = new ConfigStorage<IMConfig>(join(dir, "im-config.json"));
      imConfigStorage.write({
        feishu: {
          appId: "cli_demo",
          appSecret: "secret",
          verificationToken: "token",
        },
      });

      const fetchMock = vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/auth/v3/tenant_access_token/internal")) {
          return makeFetchResponse({ tenant_access_token: "tenant-token" });
        }
        if (url.includes("/contact/v3/users/ou_owner")) {
          return makeFetchResponse({
            code: 0,
            data: {
              user: {
                name: "Owner",
              },
            },
          });
        }
        if (url.includes("/im/v1/chats/oc_team")) {
          return makeFetchResponse({
            code: 0,
            data: {
              chat: {
                name: "团队群",
              },
            },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      global.fetch = fetchMock as typeof fetch;

      const server = new WebServer({ agent, port: 0, staticDir, cronStorage, imConfigStorage });
      await server.start();

      const response = await httpGetJson<{
        jobs: Array<{ resolvedTargets?: Array<{ chatId: string; name?: string }> }>;
      }>(server.port, "/api/cron");

      expect(response.status).toBe(200);
      expect(response.body.jobs[0]?.resolvedTargets).toEqual([
        expect.objectContaining({ chatId: "ou_owner", name: "Owner" }),
        expect.objectContaining({ chatId: "oc_team", name: "团队群" }),
      ]);

      await server.stop();
    } finally {
      global.fetch = originalFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("GET /api/cron keeps skill-only feishu jobs readable without delivery targets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claw-cron-skill-only-"));
    try {
      const agent = makeMockAgent();
      const cronStorage = new ConfigStorage<CronJobConfig[]>(join(dir, "cron.json"), []);
      cronStorage.write([{
        id: "daily-digest-generate",
        schedule: "0 9 * * *",
        message: "生成日报",
        skillId: "daily-digest",
        chatId: "",
        platform: "feishu",
        enabled: true,
      }]);

      const server = new WebServer({ agent, port: 0, staticDir, cronStorage });
      await server.start();

      const response = await httpGetJson<{
        jobs: Array<{ id: string; chatId: string; resolvedTargets?: Array<{ chatId: string; name?: string }> }>;
      }>(server.port, "/api/cron");

      expect(response.status).toBe(200);
      expect(response.body.jobs[0]).toEqual(expect.objectContaining({
        id: "daily-digest-generate",
        chatId: "",
        resolvedTargets: [],
      }));

      await server.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("GET /api/im-log enriches feishu user and chat names", async () => {
    const originalFetch = global.fetch;
    const dir = mkdtempSync(join(tmpdir(), "claw-im-log-"));
    try {
      const agent = makeMockAgent();
      const imEventStorage = new IMEventStorage();
      imEventStorage.append({
        platform: "feishu",
        userId: "ou_demo",
        chatId: "oc_demo",
        text: "请发今天的日报",
        replyText: undefined,
      });

      const imConfigStorage = new ConfigStorage<IMConfig>(join(dir, "im-config.json"));
      imConfigStorage.write({
        feishu: {
          appId: "cli_demo",
          appSecret: "secret",
          verificationToken: "token",
        },
      });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(makeFetchResponse({ tenant_access_token: "tenant-token" }))
        .mockResolvedValueOnce(makeFetchResponse({
          code: 0,
          data: {
            user: {
              name: "张三",
            },
          },
        }))
        .mockResolvedValueOnce(makeFetchResponse({ tenant_access_token: "tenant-token" }))
        .mockResolvedValueOnce(makeFetchResponse({
          code: 0,
          data: {
            chat: {
              name: "运营群",
            },
          },
        }));
      global.fetch = fetchMock as typeof fetch;

      const server = new WebServer({ agent, port: 0, staticDir, imEventStorage, imConfigStorage });
      await server.start();

      const response = await httpGetJson<{
        events: Array<{ chatName?: string; userName?: string }>;
        total: number;
      }>(server.port, "/api/im-log");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.events).toEqual([
        expect.objectContaining({
          chatName: "运营群",
          userName: "张三",
        }),
      ]);

      await server.stop();
    } finally {
      global.fetch = originalFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("POST /api/cron/:id/run calls onCronRun with stored config", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claw-cron-run-"));
    try {
      const cronStorage = new ConfigStorage<CronJobConfig[]>(join(dir, "cron.json"), []);
      cronStorage.write([{
        id: "daily-digest",
        schedule: "0 9 * * *",
        message: "生成日报",
        chatId: "oc_daily",
        platform: "feishu",
        enabled: true,
      }]);
      const onCronRun = vi.fn(async () => undefined);
      const agent = makeMockAgent();
      const server = new WebServer({ agent, port: 0, staticDir, cronStorage, onCronRun });
      await server.start();

      const res = await fetch(`http://localhost:${server.port}/api/cron/daily-digest/run`, { method: "POST" });
      const body = await res.json() as { ok: boolean };

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(onCronRun).toHaveBeenCalledWith(expect.objectContaining({ id: "daily-digest" }));
      await server.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("POST /api/cron/:id/run returns 404 when job does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claw-cron-missing-"));
    try {
      const cronStorage = new ConfigStorage<CronJobConfig[]>(join(dir, "cron.json"), []);
      const agent = makeMockAgent();
      const server = new WebServer({ agent, port: 0, staticDir, cronStorage, onCronRun: vi.fn(async () => undefined) });
      await server.start();

      const res = await fetch(`http://localhost:${server.port}/api/cron/missing/run`, { method: "POST" });
      const body = await res.json() as { ok: boolean; error: string };

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Cron job not found");
      await server.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("POST /api/cron/:id/run returns 500 when onCronRun throws", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claw-cron-error-"));
    try {
      const cronStorage = new ConfigStorage<CronJobConfig[]>(join(dir, "cron.json"), []);
      cronStorage.write([{
        id: "daily-digest-generate",
        schedule: "0 9 * * *",
        message: "生成日报",
        skillId: "daily-digest",
        chatId: "",
        platform: "feishu",
        enabled: true,
      }]);
      const agent = makeMockAgent();
      const server = new WebServer({
        agent,
        port: 0,
        staticDir,
        cronStorage,
        onCronRun: vi.fn(async () => { throw new Error("daily digest failed"); }),
      });
      await server.start();

      const res = await fetch(`http://localhost:${server.port}/api/cron/daily-digest-generate/run`, { method: "POST" });
      const body = await res.json() as { ok: boolean; error: string };

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("daily digest failed");
      await server.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it("uses bridged session history for IM webhook routes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claw-webhook-"));
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
      const platform = {
        name: "mock",
        verify: vi.fn(async () => {}),
        parse: vi.fn(async () => ({
          platform: "mock",
          chatId: "chat1",
          sessionId: "chat1#thread:root1",
          continuityId: "mock:chat1:user1",
          userId: "user1",
          text: "今天继续",
          raw: {},
        })),
        send: vi.fn(async () => {}),
      };

      const server = new WebServer({
        agent,
        port: 0,
        staticDir,
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

  it("GET /api/news returns empty page when no skillDataRoot", async () => {
    const agent = makeMockAgent();
    const { server, url } = await startWebServer(agent);
    const res = await fetch(`${url}/api/news`);
    expect(res.status).toBe(200);
    const body = await res.json() as { articles: unknown[]; total: number };
    expect(body.articles).toEqual([]);
    expect(body.total).toBe(0);
    await server.stop();
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

  it("uses route-level onMessage handler before invoking the agent on IM routes", async () => {
    const agent = makeMockAgent();
    const imEventStorage = new IMEventStorage();
    const onMessage = vi.fn(async () => ({ handled: true, replyText: "[日报文本] 2026-03-19" }));
    const platform = {
      name: "mock",
      verify: vi.fn(async () => undefined),
      parse: vi.fn(async () => ({
        platform: "feishu",
        chatId: "ou_user",
        sessionId: "ou_user",
        continuityId: "feishu:ou_user:ou_user",
        userId: "ou_user",
        text: "今天新闻文本版",
        raw: {},
      })),
      send: vi.fn(async () => undefined),
    };

    const server = new WebServer({
      agent,
      port: 0,
      staticDir,
      routes: { "/hook": { platform, agent, onMessage } },
      imEventStorage,
    });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onMessage).toHaveBeenCalledOnce();
    expect(vi.mocked(agent.run)).not.toHaveBeenCalled();
    expect(imEventStorage.since(undefined)[0]?.replyText).toBe("[日报文本] 2026-03-19");

    await server.stop();
  });

  it("skips feishu group messages on IM routes when the bot is not mentioned", async () => {
    const agent = makeMockAgent();
    const onMessage = vi.fn(async () => ({ handled: true, replyText: "不该触发" }));
    const platform = makeMockPlatform<{ getBotOpenId: () => Promise<string | undefined> }>({
      name: "feishu",
      getBotOpenId: vi.fn(async () => "ou_bot"),
      parse: vi.fn(async () => ({
        platform: "feishu",
        chatId: "oc_daily",
        sessionId: "oc_daily",
        continuityId: "feishu:oc_daily:ou_user",
        userId: "ou_user",
        eventType: "message",
        text: "@同事 今天新闻文本版",
        raw: {
          event: {
            message: {
              chat_type: "group",
              mentions: [{ id: { open_id: "ou_other" } }],
            },
          },
        },
      })),
    });

    const server = new WebServer({
      agent,
      port: 0,
      staticDir,
      routes: { "/hook": { platform, agent, onMessage } },
    });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/hook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onMessage).not.toHaveBeenCalled();
    expect(vi.mocked(agent.run)).not.toHaveBeenCalled();

    await server.stop();
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

  it("GET /api/im-config/feishu-target resolves configured group name", async () => {
    const originalFetch = global.fetch;
    const agent = makeMockAgent();
    const imDir = join(tmpdir(), `clawclaw-im-target-${Date.now()}`);
    mkdirSync(imDir, { recursive: true });
    const imConfigStorage = new ConfigStorage<IMConfig>(join(imDir, "im-config.json"));
    imConfigStorage.write({
      feishu: {
        appId: "cli_demo",
        appSecret: "secret",
        verificationToken: "token",
        chatId: "oc_demo",
      },
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeFetchResponse({ tenant_access_token: "tenant-token" }))
      .mockResolvedValueOnce(makeFetchResponse({
        code: 0,
        data: {
          chat: {
            name: "运营群",
          },
        },
      }));
    global.fetch = fetchMock as typeof fetch;

    const server = new WebServer({ agent, port: 0, staticDir, imConfigStorage });
    await server.start();

    const response = await httpGetJson<{
      ok: boolean;
      target: { chatId: string; targetType: string; name?: string };
    }>(server.port, "/api/im-config/feishu-target?chatId=oc_demo");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      target: {
        chatId: "oc_demo",
        targetType: "group",
        name: "运营群",
      },
    });

    await server.stop();
    global.fetch = originalFetch;
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

  it("GET /api/config/llm returns saved provider config", async () => {
    const agent = makeMockAgent();
    const llmDir = join(tmpdir(), `clawclaw-llm-get-${Date.now()}`);
    mkdirSync(llmDir, { recursive: true });
    const llmConfigStorage = new ConfigStorage<LLMConfig>(join(llmDir, "llm-config.json"));
    llmConfigStorage.write({ provider: "openai", model: "gpt-5.2-chat-latest" });

    const server = new WebServer({ agent, port: 0, staticDir, llmConfigStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/llm`);
    const body = await res.json() as LLMConfig;
    expect(body.provider).toBe("openai");
    expect(body.model).toBe("gpt-5.2-chat-latest");

    await server.stop();
    rmSync(llmDir, { recursive: true, force: true });
  });

  it("POST /api/config/llm saves provider config and calls onLLMConfig", async () => {
    const agent = makeMockAgent();
    const llmDir = join(tmpdir(), `clawclaw-llm-post-${Date.now()}`);
    mkdirSync(llmDir, { recursive: true });
    const llmConfigStorage = new ConfigStorage<LLMConfig>(join(llmDir, "llm-config.json"));
    const onLLMConfig = vi.fn();

    const server = new WebServer({ agent, port: 0, staticDir, llmConfigStorage, onLLMConfig });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        apiKey: "sk_test",
        baseURL: "https://api.openai.com/v1",
        model: "gpt-5.2-chat-latest",
      }),
    });
    expect(res.status).toBe(200);
    expect(onLLMConfig).toHaveBeenCalledWith(expect.objectContaining({
      provider: "openai",
      model: "gpt-5.2-chat-latest",
    }));
    expect(llmConfigStorage.read()).toEqual({
      provider: "openai",
      apiKey: "sk_test",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-5.2-chat-latest",
    });

    await server.stop();
    rmSync(llmDir, { recursive: true, force: true });
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

  it("GET /api/config/daily-digest returns default queries when storage exists", async () => {
    const agent = makeMockAgent();
    const configDir = join(tmpdir(), `clawclaw-daily-digest-get-${Date.now()}`);
    mkdirSync(configDir, { recursive: true });
    const dailyDigestConfigStorage = new ConfigStorage<DailyDigestConfig>(join(configDir, "config.json"), {
      queries: ["国内AI科技", "国际AI科技"],
    });

    const server = new WebServer({ agent, port: 0, staticDir, dailyDigestConfigStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/daily-digest`);
    const body = await res.json() as DailyDigestConfig;
    expect(body.queries).toEqual(["国内AI科技", "国际AI科技"]);
    expect(body.braveSearch?.request?.count).toBe(20);
    expect(body.braveSearch?.request?.freshness).toBe("pw");
    expect(body.braveSearch?.domestic?.country).toBe("CN");

    await server.stop();
    rmSync(configDir, { recursive: true, force: true });
  });

  it("GET /api/config/daily-digest returns stored Brave Search API key", async () => {
    const agent = makeMockAgent();
    const configDir = join(tmpdir(), `clawclaw-daily-digest-brave-get-${Date.now()}`);
    mkdirSync(configDir, { recursive: true });
    const dailyDigestConfigStorage = new ConfigStorage<DailyDigestConfig>(join(configDir, "config.json"), {
      queries: ["国内AI科技"],
    });
    dailyDigestConfigStorage.write({
      queries: ["国内AI科技"],
      braveSearchApiKey: "brave_test_key",
    });

    const server = new WebServer({ agent, port: 0, staticDir, dailyDigestConfigStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/daily-digest`);
    const body = await res.json() as DailyDigestConfig;
    expect(body.braveSearchApiKey).toBe("brave_test_key");

    await server.stop();
    rmSync(configDir, { recursive: true, force: true });
  });

  it("POST /api/config/daily-digest saves normalized queries", async () => {
    const agent = makeMockAgent();
    const configDir = join(tmpdir(), `clawclaw-daily-digest-post-${Date.now()}`);
    mkdirSync(configDir, { recursive: true });
    const dailyDigestConfigStorage = new ConfigStorage<DailyDigestConfig>(join(configDir, "config.json"), {
      queries: ["默认主题"],
    });

    const server = new WebServer({ agent, port: 0, staticDir, dailyDigestConfigStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/daily-digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: ["  国内AI科技  ", "国际AI科技", "", "国际AI科技"] }),
    });
    expect(res.status).toBe(200);
    expect(dailyDigestConfigStorage.read().queries).toEqual(["国内AI科技", "国际AI科技"]);

    await server.stop();
    rmSync(configDir, { recursive: true, force: true });
  });

  it("POST /api/config/daily-digest saves Brave Search API key and preserves queries", async () => {
    const agent = makeMockAgent();
    const configDir = join(tmpdir(), `clawclaw-daily-digest-brave-post-${Date.now()}`);
    mkdirSync(configDir, { recursive: true });
    const dailyDigestConfigStorage = new ConfigStorage<DailyDigestConfig>(join(configDir, "config.json"), {
      queries: ["默认主题"],
    });
    dailyDigestConfigStorage.write({ queries: ["默认主题"] });

    const server = new WebServer({ agent, port: 0, staticDir, dailyDigestConfigStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/daily-digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ braveSearchApiKey: "brave_saved_key" }),
    });
    expect(res.status).toBe(200);
    expect(dailyDigestConfigStorage.read()).toEqual({
      queries: ["默认主题"],
      braveSearchApiKey: "brave_saved_key",
      braveSearch: {
        request: {
          count: 20,
          offset: 0,
          freshness: "pw",
          spellcheck: false,
          safesearch: "strict",
          uiLang: "",
          extraSnippets: false,
          goggles: [],
        },
        domestic: {
          country: "CN",
          searchLang: "zh-hans",
        },
        international: {
          country: "",
          searchLang: "",
        },
      },
    });

    await server.stop();
    rmSync(configDir, { recursive: true, force: true });
  });

  it("POST /api/config/daily-digest deep-merges Brave Search params", async () => {
    const agent = makeMockAgent();
    const configDir = join(tmpdir(), `clawclaw-daily-digest-brave-params-${Date.now()}`);
    mkdirSync(configDir, { recursive: true });
    const dailyDigestConfigStorage = new ConfigStorage<DailyDigestConfig>(join(configDir, "config.json"), {
      queries: ["默认主题"],
    });
    dailyDigestConfigStorage.write({
      queries: ["默认主题"],
      braveSearch: {
        request: {
          count: 10,
          offset: 0,
          freshness: "pw",
          spellcheck: false,
          safesearch: "strict",
          uiLang: "",
          extraSnippets: false,
          goggles: [],
        },
        domestic: {
          country: "CN",
          searchLang: "zh-hans",
        },
        international: {
          country: "",
          searchLang: "",
        },
      },
    });

    const server = new WebServer({ agent, port: 0, staticDir, dailyDigestConfigStorage });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/daily-digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        braveSearch: {
          request: {
            count: 60,
            offset: 3,
            freshness: "",
            extraSnippets: true,
            goggles: [" https://example.com/g1 ", "https://example.com/g1"],
          },
          international: {
            country: "US",
            searchLang: "en",
          },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(dailyDigestConfigStorage.read().braveSearch).toEqual({
      request: {
        count: 50,
        offset: 3,
        freshness: "",
        spellcheck: false,
        safesearch: "strict",
        uiLang: "",
        extraSnippets: true,
        goggles: ["https://example.com/g1"],
      },
      domestic: {
        country: "CN",
        searchLang: "zh-hans",
      },
      international: {
        country: "US",
        searchLang: "en",
      },
    });

    await server.stop();
    rmSync(configDir, { recursive: true, force: true });
  });

  it("GET /api/config/feishu-docs returns mounted docs and synced snapshots", async () => {
    const agent = makeMockAgent();
    const docsDir = join(tmpdir(), `clawclaw-docs-get-${Date.now()}`);
    mkdirSync(docsDir, { recursive: true });
    const mountedDocConfigStorage = new ConfigStorage<MountedDocConfig>(join(docsDir, "config.json"), { docs: [] });
    mountedDocConfigStorage.write({
      docs: [{ id: "leave", title: "请假制度", url: "https://example.com/leave", enabled: true }],
    });
    const mountedDocLibrary = new MountedDocLibrary({
      configStorage: mountedDocConfigStorage,
      dataDir: docsDir,
      extractor: async () => ({ title: "请假制度", content: "请假正文" }),
    });
    await mountedDocLibrary.syncById("leave");

    const server = new WebServer({ agent, port: 0, staticDir, mountedDocConfigStorage, mountedDocLibrary });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/feishu-docs`);
    const body = await res.json() as {
      docs: Array<{ id: string; title: string }>;
      syncedDocs: Array<{ id: string; excerpt: string }>;
    };
    expect(body.docs[0].id).toBe("leave");
    expect(body.syncedDocs[0].id).toBe("leave");
    expect(body.syncedDocs[0].excerpt).toContain("请假正文");

    await server.stop();
    rmSync(docsDir, { recursive: true, force: true });
  });

  it("POST /api/config/feishu-docs saves mounted doc config", async () => {
    const agent = makeMockAgent();
    const docsDir = join(tmpdir(), `clawclaw-docs-post-${Date.now()}`);
    mkdirSync(docsDir, { recursive: true });
    const mountedDocConfigStorage = new ConfigStorage<MountedDocConfig>(join(docsDir, "config.json"), { docs: [] });
    const mountedDocLibrary = new MountedDocLibrary({ configStorage: mountedDocConfigStorage, dataDir: docsDir });

    const server = new WebServer({ agent, port: 0, staticDir, mountedDocConfigStorage, mountedDocLibrary });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/feishu-docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docs: [{ id: "sop", title: "客服 SOP", url: "https://example.com/sop", enabled: true }],
      }),
    });
    expect(res.status).toBe(200);
    expect(mountedDocConfigStorage.read().docs?.[0].title).toBe("客服 SOP");

    await server.stop();
    rmSync(docsDir, { recursive: true, force: true });
  });

  it("POST /api/config/feishu-docs/sync syncs mounted docs through library", async () => {
    const agent = makeMockAgent();
    const docsDir = join(tmpdir(), `clawclaw-docs-sync-${Date.now()}`);
    mkdirSync(docsDir, { recursive: true });
    const mountedDocConfigStorage = new ConfigStorage<MountedDocConfig>(join(docsDir, "config.json"), {
      docs: [{ id: "leave", title: "请假制度", url: "https://example.com/leave", enabled: true }],
    });
    const mountedDocLibrary = new MountedDocLibrary({
      configStorage: mountedDocConfigStorage,
      dataDir: docsDir,
      extractor: async () => ({ title: "请假制度", content: "病假需要医院证明。" }),
    });

    const server = new WebServer({ agent, port: 0, staticDir, mountedDocConfigStorage, mountedDocLibrary });
    await server.start();

    const res = await fetch(`http://localhost:${server.port}/api/config/feishu-docs/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "leave" }),
    });
    const body = await res.json() as { ok: boolean; results: Array<{ id: string; ok: boolean }> };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results[0]).toEqual(expect.objectContaining({ id: "leave", ok: true }));
    expect(mountedDocLibrary.search("病假", 1)).toHaveLength(1);

    await server.stop();
    rmSync(docsDir, { recursive: true, force: true });
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
