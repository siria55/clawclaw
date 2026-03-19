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
import { createFeishuOrgTools } from "../tools/feishu-org.js";
import { createMemoryTools } from "../tools/memory.js";
import { createReadFileTool } from "../tools/read-file.js";
import { SkillRegistry } from "../skills/registry.js";
import { DEFAULT_DAILY_DIGEST_QUERIES, DailyDigestSkill } from "../skills/daily-digest/index.js";
import { MountedDocLibrary } from "../docs/library.js";
import type { Message } from "../llm/types.js";
import type { LLMConfig, IMConfig, AgentMetaConfig, DailyDigestConfig, MountedDocConfig } from "../config/types.js";
import { WebServer } from "./server.js";
import { CronScheduler } from "../cron/scheduler.js";
import type { CronJob, CronJobConfig } from "../cron/types.js";

mkdirSync("./data/agent", { recursive: true });
mkdirSync("./data/agent/feishu-docs", { recursive: true });
mkdirSync("./data/im", { recursive: true });
mkdirSync("./data/cron", { recursive: true });
mkdirSync("./data/skills", { recursive: true });
mkdirSync("./data/skills/daily-digest", { recursive: true });

const memoryStorage = new MemoryStorage("./data/agent/memory.json");
const imConfigStorage = new ConfigStorage<IMConfig>("./data/im/im-config.json");
const llmConfigStorage = new ConfigStorage<LLMConfig>("./data/agent/llm-config.json");
const agentConfigStorage = new ConfigStorage<AgentMetaConfig>("./data/agent/agent-config.json");
const mountedDocConfigStorage = new ConfigStorage<MountedDocConfig>("./data/agent/feishu-docs/config.json", { docs: [] });
const dailyDigestConfigStorage = new ConfigStorage<DailyDigestConfig>("./data/skills/daily-digest/config.json", {
  queries: DEFAULT_DAILY_DIGEST_QUERIES,
});
const cronStorage = new ConfigStorage<import("../cron/types.js").CronJobConfig[]>("./data/cron/cron-config.json", []);
const mountedDocLibrary = new MountedDocLibrary({
  configStorage: mountedDocConfigStorage,
  dataDir: "./data/agent/feishu-docs",
});

const DEFAULT_SYSTEM = "你是一个有帮助的助手，回答简洁清晰。";
const DEFAULT_ALLOWED_PATHS = ["./data/skills", "./data/agent/feishu-docs"];

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
type FeishuRuntimeSource = "storage" | "none";

function buildSystemPrompt(systemPrompt: string | undefined): string {
  return [
    systemPrompt ?? DEFAULT_SYSTEM,
    "若上下文中提供了挂载文档资料，优先依据文档内容回答；文档未覆盖的细节要明确说明，不要编造。",
    "如需查询飞书部门、部门人数、直属成员等组织信息，优先调用飞书工具，不要凭空猜测。",
  ].join("\n");
}

let feishu: FeishuPlatform | undefined;

const agentConfig = {
  name: "debug-agent",
  system: (): string => buildSystemPrompt(agentConfigStorage.read().systemPrompt),
  llm,
  tools: [
    ...createMemoryTools(memoryStorage),
    ...createFeishuOrgTools(() => feishu),
    createReadFileTool(() => agentConfigStorage.read().allowedPaths ?? DEFAULT_ALLOWED_PATHS),
  ],
  getContext: (messages: Message[]) => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || typeof lastUser.content !== "string") return [];
    const sections: string[] = [];
    const hits = memoryStorage.search({ q: lastUser.content, limit: 3 });
    if (hits.length > 0) {
      const snippets = hits.map((h) => `- [${h.id}] ${h.snippet}`).join("\n");
      sections.push(`[相关记忆]\n${snippets}`);
    }
    const docHits = mountedDocLibrary.search(lastUser.content, 3);
    if (docHits.length > 0) {
      const snippets = docHits.map((hit) => `- [${hit.title}] ${hit.snippet}\n  来源: ${hit.url}`).join("\n");
      sections.push(`[挂载文档资料]\n以下内容来自已同步的飞书文档，仅在相关时使用：\n${snippets}`);
    }
    return sections.length > 0 ? [{ role: "user" as const, content: sections.join("\n\n") }] : [];
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

function resolveFeishuSource(config: IMConfig): FeishuRuntimeSource {
  return config.feishu?.appId && config.feishu.appSecret && config.feishu.verificationToken
    ? "storage"
    : "none";
}

feishu = buildFeishu();
let feishuSource: FeishuRuntimeSource = resolveFeishuSource(imConfigStorage.read());

const skillRegistry = new SkillRegistry();
skillRegistry.register(new DailyDigestSkill({ configStorage: dailyDigestConfigStorage }));

const cron = new CronScheduler({ timezone: "Asia/Shanghai", imEventStorage, skillRegistry, skillDataRoot: "./data/skills" });

function buildRuntimeCronJob(cfg: CronJobConfig): CronJob | undefined {
  const platform = cfg.platform === "feishu" ? feishu : undefined;
  if (!platform || !cfg.chatId) return undefined;
  return {
    id: cfg.id,
    schedule: cfg.schedule,
    message: cfg.message,
    direct: cfg.direct ?? false,
    msgType: cfg.msgType ?? "text",
    ...(cfg.skillId !== undefined && { skillId: cfg.skillId }),
    ...(cfg.sendSkillOutput !== undefined && { sendSkillOutput: cfg.sendSkillOutput }),
    agent,
    delivery: { platform, chatId: cfg.chatId },
  };
}

function registerCronJob(cfg: CronJobConfig): void {
  const job = buildRuntimeCronJob(cfg);
  if (!job) return;
  cron.add(job);
}

async function runCronJob(cfg: CronJobConfig): Promise<void> {
  const job = buildRuntimeCronJob(cfg);
  if (!job) throw new Error(`Cron job ${cfg.id} requires configured platform and chatId`);
  await cron.runNow(job);
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
  mountedDocConfigStorage,
  dailyDigestConfigStorage,
  cronStorage,
  onIMConfig: (config) => {
    feishuSource = resolveFeishuSource(config);
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
    agent.updateSystem(() => buildSystemPrompt(config.systemPrompt));
  },
  getStatus: () => ({
    cronJobs: cron.list().map((j) => ({ ...j, timezone: "Asia/Shanghai" })),
    connections: [
      { platform: "feishu", label: "飞书 Bot", connected: !!feishu },
    ],
    runtime: {
      feishu: {
        configured: feishuSource !== "none",
        active: !!feishu,
        source: feishuSource,
        webhookPath: "/feishu",
      },
    },
  }),
  onCronAdd: (cfg: CronJobConfig) => registerCronJob(cfg),
  onCronDelete: (id: string) => cron.remove(id),
  onCronRun: async (cfg: CronJobConfig) => runCronJob(cfg),
  mountedDocLibrary,
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
