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
import { FeishuPlatform } from "../platform/feishu.js";
import { ConfigStorage } from "../config/storage.js";
import { MemoryStorage } from "../memory/storage.js";
import { NewsStorage } from "../news/storage.js";
import { IMEventStorage } from "../im/storage.js";
import { createMemoryTools } from "../tools/memory.js";
import { createSaveNewsTool } from "../tools/news.js";
import type { Message } from "../llm/types.js";
import type { LLMConfig, IMConfig, AgentMetaConfig } from "../config/types.js";
import { WebServer } from "./server.js";

mkdirSync("./data", { recursive: true });

const memoryStorage = new MemoryStorage("./data/memory.json");
const newsStorage = new NewsStorage("./data/news.json");
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
  tools: [
    createSaveNewsTool(newsStorage),
    ...createMemoryTools(memoryStorage),
  ],
  getContext: async (messages: Message[]) => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || typeof lastUser.content !== "string") return [];
    const hits = memoryStorage.search({ q: lastUser.content, limit: 3 });
    if (hits.length === 0) return [];
    const snippets = hits.map((h) => `- [${h.id}] ${h.snippet}`).join("\n");
    return [{ role: "user" as const, content: `[相关记忆]\n${snippets}` }];
  },
  compressor: undefined,
};

const agent = new Agent(agentConfig);

const imEventStorage = new IMEventStorage();

function buildFeishu(): FeishuPlatform | undefined {
  const saved = imConfigStorage.read().feishu;
  if (saved?.appId && saved.appSecret && saved.verificationToken) {
    return new FeishuPlatform(saved);
  }
  return undefined;
}

let feishu = buildFeishu();

const server = new WebServer({
  agent,
  agentConfig,
  port: 3000,
  routes: feishu ? { "/feishu": { platform: feishu, agent } } : {},
  newsStorage,
  memoryStorage,
  imConfigStorage,
  imEventStorage,
  llmConfigStorage,
  agentConfigStorage,
  onIMConfig: (config) => {
    const newFeishu = config.feishu?.appId && config.feishu.appSecret && config.feishu.verificationToken
      ? new FeishuPlatform(config.feishu)
      : undefined;
    feishu = newFeishu;
    if (newFeishu) {
      server.setRoute("/feishu", { platform: newFeishu, agent });
    } else {
      server.removeRoute("/feishu");
    }
  },
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
console.log(`WebUI + IM Webhook → http://localhost:3000`);
console.log(`飞书  ${feishu ? "✓ 已连接（/feishu）" : "✗ 未配置"}`);

