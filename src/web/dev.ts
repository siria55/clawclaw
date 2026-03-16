/**
 * Dev entrypoint for the Web UI debug console.
 * Usage: npm run dev:web
 *
 * Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_BASE_URL / HTTPS_PROXY) before running.
 */
import { Agent } from "../core/agent.js";
import { AnthropicProvider } from "../llm/anthropic.js";
import { WebServer } from "./server.js";

const llm = new AnthropicProvider();

const agent = new Agent({
  name: "debug-agent",
  system: "你是一个有帮助的助手，回答简洁清晰。",
  llm,
});

const server = new WebServer({ agent, port: 3001 });
await server.start();
