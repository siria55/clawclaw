import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Agent } from "../core/agent.js";
import { FeishuChallenge } from "../platform/feishu.js";
import type { IMPlatform } from "../platform/types.js";

export interface ClawServerConfig {
  port?: number;
  /**
   * Routes: map of URL path → { platform, agent }
   * e.g. { "/feishu": { platform: feishuPlatform, agent: myAgent } }
   */
  routes: Record<string, { platform: IMPlatform; agent: Agent }>;
}

/**
 * 24/7 HTTP server that receives IM Webhook events and dispatches them to agents.
 *
 * @example
 * ```ts
 * const server = new ClawServer({
 *   port: 3000,
 *   routes: { "/feishu": { platform: new FeishuPlatform(), agent } },
 * });
 * await server.start();
 * ```
 */
export class ClawServer {
  readonly #config: Required<ClawServerConfig>;
  readonly #server: ReturnType<typeof createServer>;
  #activeRequests = 0;

  constructor(config: ClawServerConfig) {
    this.#config = { port: 3000, ...config };
    this.#server = createServer((req, res) => {
      void this.#handleRequest(req, res);
    });
  }

  /** Start listening and register graceful shutdown handlers. */
  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.#server.listen(this.#config.port, resolve);
    });
    console.warn(`ClawServer listening on port ${this.#config.port}`);
    this.#registerShutdown();
  }

  /** Stop the server, waiting for active requests to finish. */
  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  async #handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url?.split("?")[0] ?? "/";
    const route = this.#config.routes[path];

    if (!route || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }

    const body = await readBody(req);
    const headers = headersToRecord(req.headers);

    try {
      await route.platform.verify(headers, body);
    } catch (err) {
      if (err instanceof FeishuChallenge) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: err.challenge }));
        return;
      }
      res.writeHead(401).end("Unauthorized");
      return;
    }

    const message = await route.platform.parse(body);
    if (!message) {
      res.writeHead(200).end("ok");
      return;
    }

    // Acknowledge immediately; run agent asynchronously.
    res.writeHead(200).end("ok");

    this.#activeRequests++;
    route.agent
      .run(message.text)
      .then(async (result) => {
        const lastMessage = result.messages.findLast((m: import("../llm/types.js").Message) => m.role === "assistant");
        const reply = extractText(lastMessage?.content);
        if (reply) await route.platform.send(message.chatId, reply);
      })
      .catch((err: unknown) => {
        console.error(`[${route.platform.name}] Agent error:`, err);
      })
      .finally(() => {
        this.#activeRequests--;
      });
  }

  #registerShutdown(): void {
    const shutdown = (): void => {
      console.warn("ClawServer shutting down...");
      const poll = (): void => {
        if (this.#activeRequests === 0) {
          void this.stop().then(() => process.exit(0));
        } else {
          setTimeout(poll, 200);
        }
      };
      poll();
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
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

function headersToRecord(headers: IncomingMessage["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") result[k] = v;
    else if (Array.isArray(v)) result[k] = v.join(", ");
  }
  return result;
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
