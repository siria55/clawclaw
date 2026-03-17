/**
 * Dev entrypoint for the Web UI debug console.
 * Usage: npm run dev:web
 *
 * Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_BASE_URL / HTTPS_PROXY) before running.
 */
import { mkdirSync } from "node:fs";
import { Agent } from "../core/agent.js";
import { AnthropicProvider } from "../llm/anthropic.js";
import { IMConfigStorage } from "../config/storage.js";
import { WebServer } from "./server.js";

mkdirSync("./data", { recursive: true });

const llm = new AnthropicProvider();

const agentConfig = {
  name: "debug-agent",
  system: "你是一个有帮助的助手，回答简洁清晰。",
  llm,
  compressor: undefined,
};

const agent = new Agent(agentConfig);
const imConfigStorage = new IMConfigStorage("./data/im-config.json");

const server = new WebServer({ agent, agentConfig, port: 3000, imConfigStorage });
await server.start();
