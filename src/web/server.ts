import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "../core/agent.js";
import { AnthropicProvider } from "../llm/anthropic.js";
import type { AgentConfig } from "../core/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface WebServerConfig {
  agent: Agent;
  /**
   * Original AgentConfig used to create the agent.
   * When provided, the server can clone it with overridden LLM credentials
   * from the X-Claw-Config request header.
   */
  agentConfig?: AgentConfig;
  port?: number;
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
  readonly #config: Required<Omit<WebServerConfig, "agentConfig">> & { agentConfig: AgentConfig | undefined };
  readonly #server: ReturnType<typeof createServer>;

  constructor(config: WebServerConfig) {
    this.#config = { port: 3000, agentConfig: undefined, ...config };
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

    if (req.method === "GET" && path === "/") {
      this.#serveHtml(res);
      return;
    }

    if (req.method === "POST" && path === "/api/chat") {
      await this.#handleChat(req, res);
      return;
    }

    res.writeHead(404).end();
  }

  #serveHtml(res: ServerResponse): void {
    const html = readFileSync(join(__dirname, "index.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
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

    const llm = new AnthropicProvider({
      apiKey: clawConfig.apiKey,
      baseURL: clawConfig.baseURL,
      model: clawConfig.model,
    });

    return new Agent({ ...this.#config.agentConfig, llm });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
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
