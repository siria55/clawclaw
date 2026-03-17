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
import { ConfigStorage } from "../config/storage.js";
import { MemoryStorage } from "../memory/storage.js";
import type { LLMConfig, IMConfig, AgentMetaConfig } from "../config/types.js";
import { WebServer } from "./server.js";

mkdirSync("./data", { recursive: true });

const memoryStorage = new MemoryStorage("./data/memory.json");
const imConfigStorage = new ConfigStorage<IMConfig>("./data/im-config.json");
const llmConfigStorage = new ConfigStorage<LLMConfig>("./data/llm-config.json");
const agentConfigStorage = new ConfigStorage<AgentMetaConfig>("./data/agent-config.json");

const DEFAULT_SYSTEM = "你是一个有帮助的助手，回答简洁清晰。";

function buildLLM(): AnthropicProvider {
  const saved: LLMConfig = llmConfigStorage.read();
  return new AnthropicProvider({
    ...(saved.apiKey !== undefined && { apiKey: saved.apiKey }),
    ...(saved.baseURL !== undefined && { baseURL: saved.baseURL }),
    ...(saved.model !== undefined && { model: saved.model }),
  });
}

const llm = buildLLM();

const agentConfig = {
  name: "debug-agent",
  system: () => agentConfigStorage.read().systemPrompt ?? DEFAULT_SYSTEM,
  llm,
  compressor: undefined,
};

const agent = new Agent(agentConfig);

const server = new WebServer({
  agent,
  agentConfig,
  port: 3000,
  memoryStorage,
  imConfigStorage,
  llmConfigStorage,
  agentConfigStorage,
  onLLMConfig: (config) => {
    agent.updateLLM(new AnthropicProvider({
      ...(config.apiKey && { apiKey: config.apiKey }),
      ...(config.baseURL && { baseURL: config.baseURL }),
      ...(config.model && { model: config.model }),
    }));
  },
  onAgentConfig: (config) => {
    agent.updateSystem(() => config.systemPrompt ?? DEFAULT_SYSTEM);
  },
});
await server.start();
