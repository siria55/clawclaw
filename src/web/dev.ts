/**
 * Dev entrypoint for the Web UI debug console.
 * Usage: npm run dev:web
 *
 * LLM config is read from data/im-config.json (set via WebUI settings).
 * Falls back to ANTHROPIC_API_KEY env var if not configured.
 */
import { mkdirSync } from "node:fs";
import { Agent } from "../core/agent.js";
import { AnthropicProvider } from "../llm/anthropic.js";
import { IMConfigStorage } from "../config/storage.js";
import type { LLMConfig } from "../config/types.js";
import { WebServer } from "./server.js";

mkdirSync("./data", { recursive: true });

const imConfigStorage = new IMConfigStorage("./data/im-config.json");

function buildLLM(): AnthropicProvider {
  const config = imConfigStorage.read();
  const llm: LLMConfig = config.llm ?? {};
  return new AnthropicProvider({
    ...(llm.apiKey !== undefined && { apiKey: llm.apiKey }),
    ...(llm.baseURL !== undefined && { baseURL: llm.baseURL }),
    ...(llm.model !== undefined && { model: llm.model }),
  });
}

const llm = buildLLM();

const agentConfig = {
  name: "debug-agent",
  system: "你是一个有帮助的助手，回答简洁清晰。",
  llm,
  compressor: undefined,
};

const agent = new Agent(agentConfig);

const server = new WebServer({
  agent,
  agentConfig,
  port: 3000,
  imConfigStorage,
  onLLMConfig: (config) => {
    agent.updateLLM(new AnthropicProvider({
      ...(config.apiKey && { apiKey: config.apiKey }),
      ...(config.baseURL && { baseURL: config.baseURL }),
      ...(config.model && { model: config.model }),
    }));
  },
});
await server.start();
