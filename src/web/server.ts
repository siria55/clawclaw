import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent } from "../core/agent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface WebServerConfig {
  agent: Agent;
  port?: number;
}

/**
 * Lightweight debug Web UI server.
 *
 * Routes:
 *   GET  /          → index.html
 *   POST /api/chat  → SSE stream of agent events
 */
export class WebServer {
  readonly #config: Required<WebServerConfig>;
  readonly #server: ReturnType<typeof createServer>;

  constructor(config: WebServerConfig) {
    this.#config = { port: 3000, ...config };
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
    const htmlPath = join(__dirname, "index.html");
    const html = readFileSync(htmlPath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  }

  async #handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const { message } = JSON.parse(body) as { message: string };

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
      for await (const event of this.#config.agent.stream(message)) {
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
