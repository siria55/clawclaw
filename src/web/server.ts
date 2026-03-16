import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "../core/agent.js";
import { AnthropicProvider } from "../llm/anthropic.js";
import type { AgentConfig } from "../core/types.js";
import type { NewsStorage } from "../news/storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Cron job info exposed via /api/status */
export interface CronJobStatus {
  id: string;
  schedule: string;
  message: string;
  timezone: string;
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
  port?: number;
  /** Override static file directory (default: `<__dirname>/dist`). Used in tests. */
  staticDir?: string;
  /** Return current system status for GET /api/status. */
  getStatus?: () => SystemStatus;
  /** News storage instance for GET /api/news. */
  newsStorage?: NewsStorage;
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
  readonly #config: Required<Omit<WebServerConfig, "agentConfig" | "getStatus" | "newsStorage">> & { agentConfig: AgentConfig | undefined; getStatus: (() => SystemStatus) | undefined; newsStorage: NewsStorage | undefined };
  readonly #server: ReturnType<typeof createServer>;

  constructor(config: WebServerConfig) {
    this.#config = {
      port: 3000,
      agentConfig: undefined,
      staticDir: join(__dirname, "dist"),
      getStatus: undefined,
      newsStorage: undefined,
      ...config,
    };
    this.#server = createServer((req, res) => {
      void this.#handleRequest(req, res);
    });
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
