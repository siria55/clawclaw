import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Agent } from "../core/agent.js";
import { FeishuChallenge } from "../platform/feishu.js";
import { WecomEcho } from "../platform/wecom.js";
import type { IMPlatform } from "../platform/types.js";
import type { IMEventStorage } from "../im/storage.js";
import type { ConversationStorage } from "../im/conversations.js";
import { buildIMRunContext, persistIMRunContext } from "../im/context.js";

export interface ClawServerConfig {
  port?: number;
  routes: Record<string, { platform: IMPlatform; agent: Agent }>;
  /** Optional storage for recording incoming IM events. */
  imEventStorage?: IMEventStorage;
  /** Optional storage for per-session conversation history (multi-turn memory). */
  conversationStorage?: ConversationStorage;
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
  readonly #config: Required<Omit<ClawServerConfig, "imEventStorage" | "conversationStorage">> & { imEventStorage: IMEventStorage | undefined; conversationStorage: ConversationStorage | undefined };
  readonly #routes: Record<string, { platform: IMPlatform; agent: Agent }>;
  readonly #server: ReturnType<typeof createServer>;
  #activeRequests = 0;
  #shutdownHandler: (() => void) | undefined;

  constructor(config: ClawServerConfig) {
    this.#config = { port: 3000, imEventStorage: undefined, conversationStorage: undefined, ...config };
    this.#routes = { ...config.routes };
    this.#server = createServer((req, res) => {
      void this.#handleRequest(req, res);
    });
  }

  /** Dynamically add or replace a route at runtime. */
  setRoute(path: string, route: { platform: IMPlatform; agent: Agent }): void {
    this.#routes[path] = route;
  }

  /** Remove a route at runtime. */
  removeRoute(path: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.#routes[path];
  }

  /** Start listening and register graceful shutdown handlers. */
  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.#server.listen(this.#config.port, resolve);
    });
    console.warn(`ClawServer listening on port ${this.#config.port}`);
    this.#registerShutdown();
  }

  /** The actual bound port (useful when port 0 was passed to get a random port). */
  get port(): number {
    const addr = this.#server.address();
    if (!addr || typeof addr === "string") throw new Error("Server not started");
    return addr.port;
  }

  /** Stop the server and remove signal handlers. */
  async stop(): Promise<void> {
    if (this.#shutdownHandler) {
      process.removeListener("SIGTERM", this.#shutdownHandler);
      process.removeListener("SIGINT", this.#shutdownHandler);
      this.#shutdownHandler = undefined;
    }
    await new Promise<void>((resolve, reject) => {
      this.#server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  async #handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    console.log(`[ClawServer] ${req.method} ${path}`);
    const route = this.#routes[path];

    if (!route) {
      console.log(`[ClawServer] 404 no route for ${path}, registered: ${Object.keys(this.#routes).join(", ")}`);
      res.writeHead(404).end();
      return;
    }

    const method = req.method === "GET" ? "GET" : "POST";
    if (method === "POST" && req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }

    const body = method === "POST" ? await readBody(req) : "";
    const headers = headersToRecord(req.headers);
    const query = Object.fromEntries(url.searchParams.entries());

    console.log(`[${path}] ← ${method} headers:`, JSON.stringify(headers, null, 2));
    console.log(`[${path}] ← body:`, body.slice(0, 500));

    try {
      await route.platform.verify({ method, headers, query, body });
    } catch (err) {
      if (err instanceof FeishuChallenge) {
        const resp = JSON.stringify({ challenge: err.challenge });
        console.log(`[${path}] → 200 challenge:`, resp);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(resp);
        return;
      }
      if (err instanceof WecomEcho) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(err.echostr);
        return;
      }
      console.log(`[${path}] → 401 verify error:`, err instanceof Error ? err.message : err);
      res.writeHead(401).end("Unauthorized");
      return;
    }

    let message;
    try {
      message = await route.platform.parse(body);
    } catch (err) {
      // parse() may also throw FeishuChallenge (url_verification event)
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

    // Acknowledge immediately; run agent asynchronously
    res.writeHead(200).end("ok");

    const eventId = this.#config.imEventStorage?.append({
      platform: message.platform,
      userId: message.userId,
      chatId: message.chatId,
      ...(message.chatName ? { chatName: message.chatName } : {}),
      ...(message.eventType ? { eventType: message.eventType } : {}),
      text: message.text,
      replyText: undefined,
    });

    if (message.eventType && message.eventType !== "message") {
      return;
    }

    const runContext = buildIMRunContext(message, this.#config.conversationStorage);

    this.#activeRequests++;
    route.agent
      .run(runContext.input, { history: runContext.history })
      .then(async (result) => {
        const lastMsg = result.messages.findLast(
          (m: import("../llm/types.js").Message) => m.role === "assistant",
        );
        const reply = extractText(lastMsg?.content);
        persistIMRunContext(this.#config.conversationStorage, message, result.messages);
        if (eventId !== undefined) this.#config.imEventStorage?.setReply(eventId, reply);
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
    if (this.#shutdownHandler) return; // already registered
    this.#shutdownHandler = (): void => {
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
    process.once("SIGTERM", this.#shutdownHandler);
    process.once("SIGINT", this.#shutdownHandler);
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
