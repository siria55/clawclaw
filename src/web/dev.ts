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

const agentConfig = {
  name: "debug-agent",
  system: "你是一个有帮助的助手，回答简洁清晰。",
  llm,
  compressor: undefined,
};

const agent = new Agent(agentConfig);

const server = new WebServer({ agent, agentConfig, port: 3000 });
await server.start();
