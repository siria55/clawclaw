import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "../core/agent.js";
import { AnthropicProvider } from "../llm/anthropic.js";
import { FeishuChallenge } from "../platform/feishu.js";
import { WecomEcho } from "../platform/wecom.js";
import type { AgentConfig } from "../core/types.js";
import type { IMPlatform } from "../platform/types.js";
import type { IMEventStorage } from "../im/storage.js";
import type { ConversationStorage } from "../im/conversations.js";
import type { CronJobConfig } from "../cron/types.js";
import type { NewsStorage } from "../news/storage.js";
import type { MemoryStorage } from "../memory/storage.js";
import type { ConfigStorage } from "../config/storage.js";
import type { IMConfig, LLMConfig, AgentMetaConfig } from "../config/types.js";
import type { SkillRegistry } from "../skills/registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Cron job info exposed via /api/status */
export interface CronJobStatus {
  id: string;
  schedule: string;
  message: string;
  timezone: string;
  chatId: string;
  platform: string;
}

/** IM platform connection info exposed via /api/status */
export interface ConnectionStatus {
  platform: string;
  label: string;
  connected: boolean;
}

/** Payload returned by GET /api/status */
export interface SystemStatus {
  cronJobs: CronJobStatus[];
  connections: ConnectionStatus[];
}

export interface WebServerConfig {
  agent: Agent;
  /**
   * Original AgentConfig used to create the agent.
   * When provided, the server can clone it with overridden LLM credentials
   * from the X-Claw-Config request header.
   */
  agentConfig?: AgentConfig;
  /**
   * IM webhook routes — same format as ClawServer.
   * e.g. { "/feishu": { platform: feishuPlatform, agent } }
   * Requests to these paths are handled as IM webhooks (verify → parse → agent.run).
   */
  routes?: Record<string, { platform: IMPlatform; agent: Agent }>;
  port?: number;
  /** Override static file directory (default: `<__dirname>/dist`). Used in tests. */
  staticDir?: string;
  /** Return current system status for GET /api/status. */
  getStatus?: () => SystemStatus;
  /** News storage instance for GET /api/news. */
  newsStorage?: NewsStorage;
  /** Memory storage instance for GET /api/memory. */
  memoryStorage?: MemoryStorage;
  /** IM config storage for GET/POST /api/im-config. */
  imConfigStorage?: ConfigStorage<IMConfig>;
  /** Called after POST /api/im-config to hot-reload IM platform routes. */
  onIMConfig?: (config: IMConfig) => void;
  /** LLM config storage for GET/POST /api/config/llm (data/llm-config.json). */
  llmConfigStorage?: ConfigStorage<LLMConfig>;
  /** Called after POST /api/config/llm to hot-reload the LLM provider. */
  onLLMConfig?: (config: LLMConfig) => void;
  /** Agent meta config storage for GET/POST /api/config/agent (data/agent-config.json). */
  agentConfigStorage?: ConfigStorage<AgentMetaConfig>;
  /** Called after POST /api/config/agent to hot-reload agent name/system prompt. */
  onAgentConfig?: (config: AgentMetaConfig) => void;
  /** Optional storage for recording incoming IM events (used by GET /api/im-log). */
  imEventStorage?: IMEventStorage;
  /** Optional storage for per-chatId conversation history (multi-turn memory). */
  conversationStorage?: ConversationStorage;
  /** Cron job config storage for GET/POST/DELETE /api/cron. */
  cronStorage?: ConfigStorage<CronJobConfig[]>;
  /** Called after POST /api/cron to register a new job in the scheduler. */
  onCronAdd?: (config: CronJobConfig) => void;
  /** Called after DELETE /api/cron/:id to remove a job from the scheduler. */
  onCronDelete?: (id: string) => void;
  /** Skill registry for GET /api/skills. */
  skillRegistry?: SkillRegistry;
  /** Called when POST /api/skills/:id/run is triggered from WebUI. */
  onRunSkill?: (skillId: string, log: (msg: string) => void) => Promise<void>;
}

/** Config passed from browser via X-Claw-Config header */
interface ClawConfig {
  apiKey?: string;
  baseURL?: string;
  httpsProxy?: string;
  model?: string;
}

/**
 * Lightweight debug Web UI server.
 *
 * Routes:
 *   GET  /          → index.html
 *   POST /api/chat  → SSE stream of agent events
 *
 * The browser may send an `X-Claw-Config` header (JSON) to override
 * API key, base URL, proxy, and model for that request.
 */
export class WebServer {
  readonly #config: Required<Omit<WebServerConfig, "agentConfig" | "getStatus" | "newsStorage" | "memoryStorage" | "imConfigStorage" | "onIMConfig" | "llmConfigStorage" | "onLLMConfig" | "agentConfigStorage" | "onAgentConfig" | "routes" | "imEventStorage" | "conversationStorage" | "cronStorage" | "onCronAdd" | "onCronDelete" | "skillRegistry" | "onRunSkill">> & {
    agentConfig: AgentConfig | undefined;
    getStatus: (() => SystemStatus) | undefined;
    newsStorage: NewsStorage | undefined;
    memoryStorage: MemoryStorage | undefined;
    imConfigStorage: ConfigStorage<IMConfig> | undefined;
    onIMConfig: ((config: IMConfig) => void) | undefined;
    llmConfigStorage: ConfigStorage<LLMConfig> | undefined;
    onLLMConfig: ((config: LLMConfig) => void) | undefined;
    agentConfigStorage: ConfigStorage<AgentMetaConfig> | undefined;
    onAgentConfig: ((config: AgentMetaConfig) => void) | undefined;
    imEventStorage: IMEventStorage | undefined;
    conversationStorage: ConversationStorage | undefined;
    cronStorage: ConfigStorage<CronJobConfig[]> | undefined;
    onCronAdd: ((config: CronJobConfig) => void) | undefined;
    onCronDelete: ((id: string) => void) | undefined;
    skillRegistry: SkillRegistry | undefined;
    onRunSkill: ((skillId: string, log: (msg: string) => void) => Promise<void>) | undefined;
  };
  readonly #routes: Record<string, { platform: IMPlatform; agent: Agent }>;
  readonly #server: ReturnType<typeof createServer>;

  constructor(config: WebServerConfig) {
    this.#config = {
      port: 3000,
      agentConfig: undefined,
      staticDir: join(__dirname, "dist"),
      getStatus: undefined,
      newsStorage: undefined,
      memoryStorage: undefined,
      imConfigStorage: undefined,
      onIMConfig: undefined,
      llmConfigStorage: undefined,
      onLLMConfig: undefined,
      agentConfigStorage: undefined,
      onAgentConfig: undefined,
      imEventStorage: undefined,
      conversationStorage: undefined,
      cronStorage: undefined,
      onCronAdd: undefined,
      onCronDelete: undefined,
      skillRegistry: undefined,
      onRunSkill: undefined,
      ...config,
    };
    this.#routes = { ...config.routes };
    this.#server = createServer((req, res) => {
      void this.#handleRequest(req, res);
    });
  }

  /** Dynamically add or replace an IM webhook route at runtime. */
  setRoute(path: string, route: { platform: IMPlatform; agent: Agent }): void {
    this.#routes[path] = route;
  }

  /** Remove an IM webhook route at runtime. */
  removeRoute(path: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.#routes[path];
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.#server.listen(this.#config.port, resolve);
    });
    console.warn(`WebUI running at http://localhost:${this.#config.port}`);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  /** Bound port (useful when port 0 was passed). */
  get port(): number {
    const addr = this.#server.address();
    if (!addr || typeof addr === "string") throw new Error("Server not started");
    return addr.port;
  }

  async #handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url?.split("?")[0] ?? "/";

    if (req.method === "POST" && path === "/api/chat") {
      await this.#handleChat(req, res);
      return;
    }

    if (req.method === "GET" && path === "/api/status") {
      this.#handleStatus(res);
      return;
    }

    if (req.method === "GET" && path === "/api/news") {
      this.#handleNews(req, res);
      return;
    }

    if (req.method === "GET" && path === "/api/memory") {
      this.#handleMemory(req, res);
      return;
    }

    if (req.method === "GET" && path === "/api/im-log") {
      this.#handleIMLog(req, res);
      return;
    }

    if (req.method === "GET" && path === "/api/skills") {
      this.#handleGetSkills(res);
      return;
    }

    if (req.method === "POST" && path.startsWith("/api/skills/") && path.endsWith("/run")) {
      const skillId = path.slice("/api/skills/".length, -"/run".length);
      await this.#handleRunSkill(skillId, res);
      return;
    }

    if (req.method === "GET" && path === "/api/cron") {
      this.#handleGetCron(res);
      return;
    }

    if (req.method === "POST" && path === "/api/cron") {
      await this.#handlePostCron(req, res);
      return;
    }

    if (req.method === "DELETE" && path.startsWith("/api/cron/")) {
      const id = path.slice("/api/cron/".length);
      this.#handleDeleteCron(id, res);
      return;
    }

    if (req.method === "GET" && path === "/api/im-config") {
      this.#handleGetIMConfig(res);
      return;
    }

    if (req.method === "POST" && path === "/api/im-config") {
      await this.#handlePostIMConfig(req, res);
      return;
    }

    if (req.method === "GET" && path === "/api/config/llm") {
      this.#handleGetLLMConfig(res);
      return;
    }

    if (req.method === "POST" && path === "/api/config/llm") {
      await this.#handlePostLLMConfig(req, res);
      return;
    }

    if (req.method === "GET" && path === "/api/config/agent") {
      this.#handleGetAgentConfig(res);
      return;
    }

    if (req.method === "POST" && path === "/api/config/agent") {
      await this.#handlePostAgentConfig(req, res);
      return;
    }

    // IM webhook routes (e.g. /feishu)
    const imRoute = this.#routes[path];
    if (imRoute) {
      await this.#handleIMRoute(req, res, path, imRoute);
      return;
    }

    if (req.method === "GET") {
      this.#serveStatic(path, res);
      return;
    }

    res.writeHead(404).end();
  }

  #serveStatic(urlPath: string, res: ServerResponse): void {
    const distDir = this.#config.staticDir;
    // Resolve file path — default to index.html for SPA routing
    const filePath = urlPath === "/" || !extname(urlPath)
      ? join(distDir, "index.html")
      : join(distDir, urlPath);

    if (!existsSync(filePath)) {
      // SPA fallback
      const index = join(distDir, "index.html");
      if (existsSync(index)) {
        const html = readFileSync(index, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      res.writeHead(404).end("Not found");
      return;
    }

    const mime = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(readFileSync(filePath));
  }

  #handleStatus(res: ServerResponse): void {
    const status: SystemStatus = this.#config.getStatus
      ? this.#config.getStatus()
      : { cronJobs: [], connections: [] };
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(status));
  }

  #handleNews(req: IncomingMessage, res: ServerResponse): void {
    const qs = new URL(req.url ?? "/", "http://localhost").searchParams;
    const page = parseIntParam(qs.get("page"), 1);
    const pageSize = parseIntParam(qs.get("pageSize"), 20);
    const q = qs.get("q") ?? undefined;
    const tag = qs.get("tag") ?? undefined;
    const result = this.#config.newsStorage
      ? this.#config.newsStorage.query({ ...(q !== undefined && { q }), ...(tag !== undefined && { tag }), page, pageSize })
      : { articles: [], total: 0, page, pageSize };
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(result));
  }

  #handleMemory(req: IncomingMessage, res: ServerResponse): void {
    const qs = new URL(req.url ?? "/", "http://localhost").searchParams;
    const page = parseIntParam(qs.get("page"), 1);
    const pageSize = parseIntParam(qs.get("pageSize"), 20);
    const q = qs.get("q") ?? undefined;

    const all = this.#config.memoryStorage ? this.#config.memoryStorage.all() : [];
    const filtered = q
      ? all.filter((e) => e.content.toLowerCase().includes(q.toLowerCase()) || e.tags.some((t) => t.toLowerCase().includes(q.toLowerCase())))
      : all;
    const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = sorted.length;
    const entries = sorted.slice((page - 1) * pageSize, page * pageSize);

    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ entries, total, page, pageSize }));
  }

  #handleIMLog(req: IncomingMessage, res: ServerResponse): void {
    const qs = new URL(req.url ?? "/", "http://localhost").searchParams;
    const since = qs.get("since") ?? undefined;
    const storage = this.#config.imEventStorage;
    const events = storage ? storage.since(since) : [];
    const total = storage ? storage.total : 0;
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ events, total }));
  }

  #handleGetSkills(res: ServerResponse): void {
    const registry = this.#config.skillRegistry;
    const skills = registry
      ? registry.ids.map((id) => {
          const skill = registry.get(id)!;
          return { id: skill.id, description: skill.description };
        })
      : [];
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ skills }));
  }

  async #handleRunSkill(skillId: string, res: ServerResponse): Promise<void> {
    if (!this.#config.onRunSkill) {
      res.writeHead(503, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: false, error: "onRunSkill not configured" }));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    const send = (data: Record<string, unknown>): void => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    try {
      await this.#config.onRunSkill(skillId, (msg: string) => { send({ type: "log", text: msg }); });
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  }

  #handleGetCron(res: ServerResponse): void {
    const jobs = this.#config.cronStorage?.read() ?? [];
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ jobs }));
  }

  async #handlePostCron(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let incoming: CronJobConfig;
    try {
      incoming = JSON.parse(body) as CronJobConfig;
    } catch {
      res.writeHead(400).end("Invalid JSON");
      return;
    }
    if (!this.#config.cronStorage) {
      res.writeHead(503).end("Cron storage not configured");
      return;
    }
    const jobs = this.#config.cronStorage.read();
    const idx = jobs.findIndex((j) => j.id === incoming.id);
    if (idx >= 0) {
      jobs[idx] = incoming;
    } else {
      jobs.push(incoming);
    }
    this.#config.cronStorage.write(jobs);
    if (incoming.enabled) this.#config.onCronAdd?.(incoming);
    else this.#config.onCronDelete?.(incoming.id);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
  }

  #handleDeleteCron(id: string, res: ServerResponse): void {
    if (!this.#config.cronStorage) {
      res.writeHead(503).end("Cron storage not configured");
      return;
    }
    const jobs = this.#config.cronStorage.read().filter((j) => j.id !== id);
    this.#config.cronStorage.write(jobs);
    this.#config.onCronDelete?.(id);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
  }

  #handleGetIMConfig(res: ServerResponse): void {
    const config = this.#config.imConfigStorage?.read() ?? {};
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(config));
  }

  async #handlePostIMConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let incoming: IMConfig;
    try {
      incoming = JSON.parse(body) as IMConfig;
    } catch {
      res.writeHead(400).end("Invalid JSON");
      return;
    }

    if (!this.#config.imConfigStorage) {
      res.writeHead(503).end("IM config storage not configured");
      return;
    }

    // Merge with existing — skip fields that still carry the masked sentinel "****"
    const existing = this.#config.imConfigStorage.read();
    const merged = mergeIMConfig(existing, incoming);
    this.#config.imConfigStorage.write(merged);
    this.#config.onIMConfig?.(merged);

    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
  }

  #handleGetLLMConfig(res: ServerResponse): void {
    const llm = this.#config.llmConfigStorage?.read() ?? {};
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(llm));
  }

  async #handlePostLLMConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let incoming: LLMConfig;
    try {
      incoming = JSON.parse(body) as LLMConfig;
    } catch {
      res.writeHead(400).end("Invalid JSON");
      return;
    }

    if (!this.#config.llmConfigStorage) {
      res.writeHead(503).end("Config storage not configured");
      return;
    }

    const existing = this.#config.llmConfigStorage.read();
    const merged = mergeLLMConfig(existing, incoming);
    this.#config.llmConfigStorage.write(merged);
    this.#config.onLLMConfig?.(merged);

    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
  }

  #handleGetAgentConfig(res: ServerResponse): void {
    const config = this.#config.agentConfigStorage?.read() ?? {};
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(config));
  }

  async #handlePostAgentConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let incoming: AgentMetaConfig;
    try {
      incoming = JSON.parse(body) as AgentMetaConfig;
    } catch {
      res.writeHead(400).end("Invalid JSON");
      return;
    }

    if (!this.#config.agentConfigStorage) {
      res.writeHead(503).end("Agent config storage not configured");
      return;
    }

    const existing = this.#config.agentConfigStorage.read();
    // Empty string = user cleared the field → omit from storage (use default at runtime)
    const name = incoming.name !== undefined ? (incoming.name || undefined) : existing.name;
    const systemPrompt = incoming.systemPrompt !== undefined ? (incoming.systemPrompt || undefined) : existing.systemPrompt;
    const allowedPaths = incoming.allowedPaths !== undefined ? incoming.allowedPaths : existing.allowedPaths;
    const merged: AgentMetaConfig = {
      ...(name !== undefined && { name }),
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(allowedPaths !== undefined && { allowedPaths }),
    };
    this.#config.agentConfigStorage.write(merged);
    this.#config.onAgentConfig?.(merged);

    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
  }

  async #handleIMRoute(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    route: { platform: IMPlatform; agent: Agent },
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const body = req.method === "POST" ? await readBody(req) : "";
    const headers = headersToRecord(req.headers);
    const query = Object.fromEntries(url.searchParams.entries());
    const method = req.method === "POST" ? "POST" : "GET";

    try {
      await route.platform.verify({ method, headers, query, body });
    } catch (err) {
      if (err instanceof FeishuChallenge) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: err.challenge }));
        return;
      }
      if (err instanceof WecomEcho) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(err.echostr);
        return;
      }
      res.writeHead(401).end("Unauthorized");
      return;
    }

    let message;
    try {
      message = await route.platform.parse(body);
    } catch (err) {
      if (err instanceof FeishuChallenge) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: err.challenge }));
        return;
      }
      throw err;
    }
    if (!message) {
      res.writeHead(200).end("ok");
      return;
    }

    res.writeHead(200).end("ok");

    const eventId = this.#config.imEventStorage?.append({
      platform: message.platform,
      userId: message.userId,
      chatId: message.chatId,
      text: message.text,
      replyText: undefined,
    });

    const contextPrefix = `[消息来源: ${message.platform} | chatId: ${message.chatId} | userId: ${message.userId}]\n`;
    const history = this.#config.conversationStorage?.get(message.chatId) ?? [];

    route.agent
      .run(contextPrefix + message.text, { history })
      .then(async (result) => {
        const lastMsg = result.messages.findLast(
          (m: import("../llm/types.js").Message) => m.role === "assistant",
        );
        const reply = extractText(lastMsg?.content);
        this.#config.conversationStorage?.set(message.chatId, result.messages);
        if (eventId !== undefined) this.#config.imEventStorage?.setReply(eventId, reply);
        if (reply) await route.platform.send(message.chatId, reply);
      })
      .catch((err: unknown) => {
        console.error(`[${path}] Agent error:`, err);
      });
  }

  async #handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const { message } = JSON.parse(body) as { message: string };
    const agent = this.#resolveAgent(req.headers);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const event of agent.stream(message)) {
        switch (event.type) {
          case "message":
            for (const block of extractThinking(event.message.content)) {
              send("thinking", { text: block });
            }
            send("message", { content: extractText(event.message.content) });
            break;
          case "tool_call":
            send("tool_call", { toolName: event.toolName, input: event.input });
            break;
          case "tool_result":
            send("tool_result", { toolName: event.toolName, result: event.result });
            break;
          case "done":
            send("done", { turns: event.result.turns });
            break;
        }
      }
    } catch (err) {
      send("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  }

  /**
   * Build an agent for this request.
   * If X-Claw-Config header is present and agentConfig was provided,
   * override the LLM with caller-supplied credentials.
   */
  #resolveAgent(headers: IncomingMessage["headers"]): Agent {
    const configHeader = headers["x-claw-config"];
    if (!configHeader || typeof configHeader !== "string" || !this.#config.agentConfig) {
      return this.#config.agent;
    }

    let clawConfig: ClawConfig;
    try {
      clawConfig = JSON.parse(configHeader) as ClawConfig;
    } catch {
      return this.#config.agent;
    }

    const hasOverride = clawConfig.apiKey ?? clawConfig.baseURL ?? clawConfig.httpsProxy ?? clawConfig.model;
    if (!hasOverride) return this.#config.agent;

    const llmConfig: import("../llm/anthropic.js").AnthropicConfig = {};
    if (clawConfig.apiKey) llmConfig.apiKey = clawConfig.apiKey;
    if (clawConfig.baseURL) llmConfig.baseURL = clawConfig.baseURL;
    if (clawConfig.model) llmConfig.model = clawConfig.model;
    const llm = new AnthropicProvider(llmConfig);

    return new Agent({ ...this.#config.agentConfig, llm });
  }
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function headersToRecord(headers: IncomingMessage["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") result[k] = v;
    else if (Array.isArray(v)) result[k] = v.join(", ");
  }
  return result;
}

function parseIntParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: "text"; text: string } => (b as { type: string }).type === "text")
      .map((b) => b.text)
      .join("");
  }
  return "";
}

function extractThinking(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b): b is { type: "thinking"; thinking: string } => (b as { type: string }).type === "thinking")
    .map((b) => b.thinking);
}

/** Mask sensitive string: show first 4 chars + "****". */
function mask(value: string): string {
  return value.length > 4 ? value.slice(0, 4) + "****" : "****";
}

/** Returns true if the value was left as a masked sentinel (ends with "****"). */
function isMasked(value: string): boolean {
  return value.endsWith("****");
}

/** Replace sensitive fields with masked values for safe GET response. */
function maskIMConfig(config: IMConfig): IMConfig {
  if (!config.feishu) return config;
  const { feishu } = config;
  return {
    feishu: {
      appId: feishu.appId ? mask(feishu.appId) : "",
      appSecret: feishu.appSecret ? mask(feishu.appSecret) : "",
      verificationToken: feishu.verificationToken ? mask(feishu.verificationToken) : "",
      ...(feishu.encryptKey !== undefined && { encryptKey: mask(feishu.encryptKey) }),
      ...(feishu.chatId !== undefined && { chatId: feishu.chatId }),
    },
  };
}

function maskLLMConfig(config: LLMConfig): LLMConfig {
  return {
    ...(config.apiKey !== undefined && { apiKey: mask(config.apiKey) }),
    ...(config.baseURL !== undefined && { baseURL: config.baseURL }),
    ...(config.httpsProxy !== undefined && { httpsProxy: config.httpsProxy }),
    ...(config.model !== undefined && { model: config.model }),
  };
}

function mergeLLMConfig(existing: LLMConfig, incoming: LLMConfig): LLMConfig {
  // Empty string = user cleared the field
  const apiKey = incoming.apiKey !== undefined ? (incoming.apiKey || undefined) : existing.apiKey;
  const baseURL = incoming.baseURL !== undefined ? (incoming.baseURL || undefined) : existing.baseURL;
  const httpsProxy = incoming.httpsProxy !== undefined ? (incoming.httpsProxy || undefined) : existing.httpsProxy;
  const model = incoming.model !== undefined ? (incoming.model || undefined) : existing.model;
  return {
    ...(apiKey !== undefined && { apiKey }),
    ...(baseURL !== undefined && { baseURL }),
    ...(httpsProxy !== undefined && { httpsProxy }),
    ...(model !== undefined && { model }),
  };
}

/**
 * Merge incoming config into existing, preserving masked sentinel values
 * (i.e. don't overwrite an existing secret when the client sends "****").
 */
function mergeIMConfig(existing: IMConfig, incoming: IMConfig): IMConfig {
  const result: IMConfig = { ...existing };
  if (incoming.feishu) {
    const ex = existing.feishu ?? { appId: "", appSecret: "", verificationToken: "" };
    const inc = incoming.feishu;
    result.feishu = {
      appId: inc.appId || ex.appId,
      appSecret: inc.appSecret || ex.appSecret,
      verificationToken: inc.verificationToken || ex.verificationToken,
      ...(inc.encryptKey !== undefined ? (inc.encryptKey ? { encryptKey: inc.encryptKey } : {}) : ex.encryptKey !== undefined ? { encryptKey: ex.encryptKey } : {}),
      ...(inc.chatId !== undefined ? { chatId: inc.chatId } : ex.chatId !== undefined ? { chatId: ex.chatId } : {}),
    };
  }
  return result;
}
