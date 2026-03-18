/**
 * Dev entrypoint for the Web UI debug console.
 * Usage: npm run dev:web
 *
 * LLM config is read from data/im-config.json (set via WebUI settings).
 * Falls back to ANTHROPIC_API_KEY env var if not configured.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "../core/agent.js";
import { AnthropicProvider } from "../llm/anthropic.js";
import { FeishuPlatform } from "../platform/feishu.js";
import { ConfigStorage } from "../config/storage.js";
import { MemoryStorage } from "../memory/storage.js";
import { IMEventStorage } from "../im/storage.js";
import { ConversationStorage } from "../im/conversations.js";
import { createMemoryTools } from "../tools/memory.js";
import { createReadFileTool } from "../tools/read-file.js";
import { SkillRegistry } from "../skills/registry.js";
import { DailyDigestSkill } from "../skills/daily-digest/index.js";
import type { Message } from "../llm/types.js";
import type { LLMConfig, IMConfig, AgentMetaConfig } from "../config/types.js";
import { WebServer } from "./server.js";
import { CronScheduler } from "../cron/scheduler.js";
import type { CronJobConfig } from "../cron/types.js";

mkdirSync("./data/agent", { recursive: true });
mkdirSync("./data/im", { recursive: true });
mkdirSync("./data/cron", { recursive: true });
mkdirSync("./data/skills", { recursive: true });

const memoryStorage = new MemoryStorage("./data/agent/memory.json");
const imConfigStorage = new ConfigStorage<IMConfig>("./data/im/im-config.json");
const llmConfigStorage = new ConfigStorage<LLMConfig>("./data/agent/llm-config.json");
const agentConfigStorage = new ConfigStorage<AgentMetaConfig>("./data/agent/agent-config.json");
const cronStorage = new ConfigStorage<import("../cron/types.js").CronJobConfig[]>("./data/cron/cron-config.json", []);

const DEFAULT_SYSTEM = "你是一个有帮助的助手，回答简洁清晰。";

function buildLLM(): AnthropicProvider {
  const saved: LLMConfig = llmConfigStorage.read();
  return new AnthropicProvider({
    ...(saved.apiKey !== undefined && { apiKey: saved.apiKey }),
    ...(saved.baseURL !== undefined && { baseURL: saved.baseURL }),
    ...(saved.httpsProxy !== undefined && { httpsProxy: saved.httpsProxy }),
    ...(saved.model !== undefined && { model: saved.model }),
  });
}

const llm = buildLLM();

const agentConfig = {
  name: "debug-agent",
  system: () => agentConfigStorage.read().systemPrompt ?? DEFAULT_SYSTEM,
  llm,
  tools: [
    ...createMemoryTools(memoryStorage),
    createReadFileTool(() => agentConfigStorage.read().allowedPaths ?? ["./data/skills"]),
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

const imEventStorage = new IMEventStorage(200, "./data/im/im-events.json");
const conversationStorage = new ConversationStorage("./data/im/conversations.json");

function buildFeishu(): FeishuPlatform | undefined {
  const saved = imConfigStorage.read().feishu;
  if (saved?.appId && saved.appSecret && saved.verificationToken) {
    return new FeishuPlatform(saved);
  }
  return undefined;
}

let feishu = buildFeishu();

const skillRegistry = new SkillRegistry();
skillRegistry.register(new DailyDigestSkill());

const cron = new CronScheduler({ timezone: "Asia/Shanghai", imEventStorage, skillRegistry, skillDataRoot: "./data/skills" });

function registerCronJob(cfg: CronJobConfig): void {
  const platform = cfg.platform === "feishu" ? feishu : undefined;
  if (!platform || !cfg.chatId) return;
  cron.add({ id: cfg.id, schedule: cfg.schedule, message: cfg.message, direct: cfg.direct ?? false, msgType: cfg.msgType ?? "text", ...(cfg.skillId !== undefined && { skillId: cfg.skillId }), ...(cfg.sendSkillOutput !== undefined && { sendSkillOutput: cfg.sendSkillOutput }), agent, delivery: { platform, chatId: cfg.chatId } });
}

const server = new WebServer({
  agent,
  agentConfig,
  port: 3000,
  routes: feishu ? { "/feishu": { platform: feishu, agent } } : {},
  skillDataRoot: "./data/skills",
  memoryStorage,
  imConfigStorage,
  imEventStorage,
  conversationStorage,
  llmConfigStorage,
  agentConfigStorage,
  cronStorage,
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
      ...(config.apiKey !== undefined && { apiKey: config.apiKey }),
      ...(config.baseURL !== undefined && { baseURL: config.baseURL }),
      ...(config.httpsProxy !== undefined && { httpsProxy: config.httpsProxy }),
      ...(config.model !== undefined && { model: config.model }),
    }));
  },
  onAgentConfig: (config) => {
    agent.updateSystem(() => config.systemPrompt ?? DEFAULT_SYSTEM);
  },
  getStatus: () => ({
    cronJobs: cron.list().map((j) => ({ ...j, timezone: "Asia/Shanghai" })),
    connections: [
      { platform: "feishu", label: "飞书 Bot", connected: !!feishu },
    ],
  }),
  onCronAdd: (cfg: CronJobConfig) => registerCronJob(cfg),
  onCronDelete: (id: string) => cron.remove(id),
  skillRegistry,
  onRunSkill: async (skillId: string, log: (msg: string) => void) => {
    const skill = skillRegistry.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    const dataDir = join("./data/skills", skillId);
    mkdirSync(dataDir, { recursive: true });
    return skill.run({
      agent,
      imEventStorage,
      dataDir,
      log,
    });
  },
});

for (const cfg of cronStorage.read()) {
  if (cfg.enabled) registerCronJob(cfg);
}

await server.start();
cron.start();
console.log(`WebUI + IM Webhook → http://localhost:3000`);
console.log(`飞书  ${feishu ? "✓ 已连接（/feishu）" : "✗ 未配置"}`);
console.log(`CronScheduler 已启动，${cron.jobIds.length} 个任务`);

