/**
 * Dev entrypoint for the Web UI debug console.
 * Usage: corepack pnpm dev:web
 *
 * LLM config is read from data/agent/llm-config.json (set via WebUI settings).
 * Falls back to `.env` 中的 LLM 配置；默认 provider 为 anthropic。
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "../core/agent.js";
import { createLLMFromConfig } from "../llm/index.js";
import { FeishuPlatform } from "../platform/feishu.js";
import { ConfigStorage } from "../config/storage.js";
import { MemoryStorage } from "../memory/storage.js";
import { IMEventStorage } from "../im/storage.js";
import { ConversationStorage } from "../im/conversations.js";
import { createDailyDigestNewsReplyHandler } from "../im/news-reply.js";
import { createFeishuOrgTools } from "../tools/feishu-org.js";
import { createMemoryTools } from "../tools/memory.js";
import { createReadFileTool } from "../tools/read-file.js";
import { SkillRegistry } from "../skills/registry.js";
import { DEFAULT_DAILY_DIGEST_QUERIES, DailyDigestSkill } from "../skills/daily-digest/index.js";
import { MountedDocLibrary } from "../docs/library.js";
import type { SkillResult } from "../skills/types.js";
import type { LLMProvider, Message } from "../llm/types.js";
import type { LLMConfig, IMConfig, AgentMetaConfig, DailyDigestConfig, MountedDocConfig } from "../config/types.js";
import { WebServer } from "./server.js";
import type { SystemStatus } from "./server.js";
import { CronScheduler } from "../cron/scheduler.js";
import { cronJobRequiresDelivery, normalizeCronChatIds } from "../cron/types.js";
import type { CronJob, CronJobConfig } from "../cron/types.js";
import { ensureDefaultDailyDigestCronJobs } from "../cron/default-jobs.js";
import { buildAgentSystemPrompt } from "../runtime/agent-system-prompt.js";

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
const cronStorage = new ConfigStorage<CronJobConfig[]>("./data/cron/cron-config.json", []);
const mountedDocLibrary = new MountedDocLibrary({
  configStorage: mountedDocConfigStorage,
  dataDir: "./data/agent/feishu-docs",
});

const DEFAULT_SYSTEM = "你是一个有帮助的助手，回答简洁清晰。";
const DEFAULT_ALLOWED_PATHS = ["./data/skills", "./data/agent/feishu-docs"];

function buildLLM(): LLMProvider {
  return createLLMFromConfig(llmConfigStorage.read());
}

const llm = buildLLM();
type FeishuRuntimeSource = "storage" | "none";

function resolveAgentSystemPrompt(config: AgentMetaConfig | undefined): string {
  return buildAgentSystemPrompt(config, {
    defaultName: "debug-agent",
    defaultSystem: DEFAULT_SYSTEM,
    currentDate: new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }),
  });
}

let feishu: FeishuPlatform | undefined;

const agentConfig = {
  name: "debug-agent",
  system: (): string => resolveAgentSystemPrompt(agentConfigStorage.read()),
  llm,
  tools: [
    ...createMemoryTools(memoryStorage),
    ...createFeishuOrgTools(() => feishu),
    createReadFileTool(() => agentConfigStorage.read().allowedPaths ?? DEFAULT_ALLOWED_PATHS),
  ],
  getContext: (messages: Message[]): Message[] => {
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
const handleNewsRequest = createDailyDigestNewsReplyHandler({
  agent,
  getPlatform: () => feishu,
  getSkill: () => skillRegistry.get("daily-digest"),
  dataRoot: "./data/skills",
  imEventStorage,
});

const cron = new CronScheduler({ timezone: "Asia/Shanghai", imEventStorage, skillRegistry, skillDataRoot: "./data/skills" });

function buildRuntimeCronJob(cfg: CronJobConfig): CronJob | undefined {
  const chatIds = normalizeCronChatIds(cfg);
  if (!cronJobRequiresDelivery(cfg)) {
    return {
      id: cfg.id,
      schedule: cfg.schedule,
      message: cfg.message,
      direct: cfg.direct ?? false,
      msgType: cfg.msgType ?? "text",
      ...(cfg.skillId !== undefined && { skillId: cfg.skillId }),
      ...(cfg.sendSkillOutput !== undefined && { sendSkillOutput: cfg.sendSkillOutput }),
      agent,
    };
  }

  const platform = cfg.platform === "feishu" ? feishu : undefined;
  if (!platform || chatIds.length === 0) return undefined;
  return {
    id: cfg.id,
    schedule: cfg.schedule,
    message: cfg.message,
    direct: cfg.direct ?? false,
    msgType: cfg.msgType ?? "text",
    ...(cfg.skillId !== undefined && { skillId: cfg.skillId }),
    ...(cfg.sendSkillOutput !== undefined && { sendSkillOutput: cfg.sendSkillOutput }),
    agent,
    delivery: { platform, chatId: chatIds[0]!, chatIds },
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
  routes: feishu ? { "/feishu": { platform: feishu, agent, onMessage: handleNewsRequest } } : {},
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
  onIMConfig: (config: IMConfig): void => {
    feishuSource = resolveFeishuSource(config);
    const newFeishu = config.feishu?.appId && config.feishu.appSecret && config.feishu.verificationToken
      ? new FeishuPlatform(config.feishu)
      : undefined;
    feishu = newFeishu;
    if (newFeishu) {
      server.setRoute("/feishu", { platform: newFeishu, agent, onMessage: handleNewsRequest });
    } else {
      server.removeRoute("/feishu");
    }
  },
  onLLMConfig: (config: LLMConfig): void => {
    agent.updateLLM(createLLMFromConfig(config));
  },
  onAgentConfig: (_config: AgentMetaConfig): void => {
    agent.updateSystem(() => resolveAgentSystemPrompt(agentConfigStorage.read()));
  },
  getStatus: (): SystemStatus => ({
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
  onCronAdd: (cfg: CronJobConfig): void => registerCronJob(cfg),
  onCronDelete: (id: string): void => cron.remove(id),
  onCronRun: async (cfg: CronJobConfig): Promise<void> => runCronJob(cfg),
  mountedDocLibrary,
  skillRegistry,
  onRunSkill: async (skillId: string, log: (msg: string) => void): Promise<SkillResult> => {
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

const defaultCronChatId = imConfigStorage.read().feishu?.chatId ?? process.env["FEISHU_CHAT_ID"] ?? "";
const ensuredCronJobs = ensureDefaultDailyDigestCronJobs(cronStorage.read(), defaultCronChatId);
if (JSON.stringify(ensuredCronJobs) !== JSON.stringify(cronStorage.read())) {
  cronStorage.write(ensuredCronJobs);
}

for (const cfg of cronStorage.read()) {
  if (cfg.enabled) registerCronJob(cfg);
}

await server.start();
cron.start();
console.log(`WebUI + IM Webhook → http://localhost:3000`);
console.log(`飞书  ${feishu ? "✓ 已连接（/feishu）" : "✗ 未配置"}`);
console.log(`CronScheduler 已启动，${cron.jobIds.length} 个任务`);
