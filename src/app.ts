/**
 * clawclaw 应用入口
 *
 * 启动方式：
 *   npm run dev          开发模式（tsx watch，自动重载）
 *   npm start            生产模式（node dist/app.js）
 *
 * 环境变量（.env 文件）：
 *   ANTHROPIC_API_KEY        必填
 *   ANTHROPIC_BASE_URL       可选，自定义 API 地址
 *   HTTPS_PROXY              可选，代理
 *   FEISHU_APP_ID            飞书 App ID（接入飞书时填写）
 *   FEISHU_APP_SECRET        飞书 App Secret
 *   FEISHU_VERIFICATION_TOKEN 飞书验证 Token
 *   FEISHU_ENCRYPT_KEY       飞书加密 Key（可选）
 *   PORT                     服务端口，默认 3000
 */

import { mkdirSync } from "node:fs";
import { Agent } from "./core/agent.js";
import { AnthropicProvider } from "./llm/anthropic.js";
import { FeishuPlatform } from "./platform/feishu.js";
import { ClawServer } from "./server/index.js";
import { WebServer } from "./web/server.js";
import { CronScheduler } from "./cron/scheduler.js";
import { MemoryStorage } from "./memory/storage.js";
import { IMEventStorage } from "./im/storage.js";
import { ConversationStorage } from "./im/conversations.js";
import { ConfigStorage } from "./config/storage.js";
import { createMemoryTools } from "./tools/memory.js";
import { createReadFileTool } from "./tools/read-file.js";
import { SkillRegistry } from "./skills/registry.js";
import { DEFAULT_DAILY_DIGEST_QUERIES, DailyDigestSkill } from "./skills/daily-digest/index.js";
import type { Message } from "./llm/types.js";
import type { CronJobConfig } from "./cron/types.js";
import type { IMConfig, LLMConfig, AgentMetaConfig, DailyDigestConfig } from "./config/types.js";

// ── 存储 ──────────────────────────────────────────────────────────────────────

mkdirSync("./data/agent", { recursive: true });
mkdirSync("./data/im", { recursive: true });
mkdirSync("./data/cron", { recursive: true });
mkdirSync("./data/skills", { recursive: true });
mkdirSync("./data/skills/daily-digest", { recursive: true });

const memoryStorage = new MemoryStorage("./data/agent/memory.json");
const imEventStorage = new IMEventStorage(200, "./data/im/im-events.json");
const conversationStorage = new ConversationStorage("./data/im/conversations.json");
const imConfigStorage = new ConfigStorage<IMConfig>("./data/im/im-config.json");
const llmConfigStorage = new ConfigStorage<LLMConfig>("./data/agent/llm-config.json");
const agentConfigStorage = new ConfigStorage<AgentMetaConfig>("./data/agent/agent-config.json");
const dailyDigestConfigStorage = new ConfigStorage<DailyDigestConfig>("./data/skills/daily-digest/config.json", {
  queries: DEFAULT_DAILY_DIGEST_QUERIES,
});
const cronStorage = new ConfigStorage<CronJobConfig[]>("./data/cron/cron-config.json", []);

const DEFAULT_SYSTEM = "你是一个高效的 AI 助手，可以搜索和保存新闻、管理长期记忆。";

// ── LLM ───────────────────────────────────────────────────────────────────────

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

// ── Agent ─────────────────────────────────────────────────────────────────────

const agent = new Agent({
  name: "clawclaw",

  // 动态 system prompt：每轮调用前注入当前日期 + 用户自定义提示词（若有）
  system: () => [
    agentConfigStorage.read().systemPrompt ?? DEFAULT_SYSTEM,
    `当前日期：${new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
  ].join("\n"),

  llm,

  tools: [
    ...createMemoryTools(memoryStorage),
    createReadFileTool(() => agentConfigStorage.read().allowedPaths ?? ["./data/skills"]),
  ],

  // getContext：每轮调用前，根据用户最新消息自动检索相关记忆
  getContext: async (messages: Message[]) => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || typeof lastUser.content !== "string") return [];
    const hits = memoryStorage.search({ q: lastUser.content, limit: 3 });
    if (hits.length === 0) return [];
    const snippets = hits.map((h) => `- [${h.id}] ${h.snippet}`).join("\n");
    return [{ role: "user" as const, content: `[相关记忆]\n${snippets}` }];
  },

  compressor: undefined,
});

// ── ClawServer（IM 接入，24/7 常驻）─────────────────────────────────────────

/**
 * Build a FeishuPlatform from the persisted IM config file (highest priority)
 * or fall back to environment variables.
 */
function buildFeishu(): FeishuPlatform | undefined {
  const saved = imConfigStorage.read().feishu;
  if (saved?.appId && saved.appSecret && saved.verificationToken) {
    return new FeishuPlatform(saved);
  }
  if (process.env["FEISHU_APP_ID"] && process.env["FEISHU_APP_SECRET"] && process.env["FEISHU_VERIFICATION_TOKEN"]) {
    return new FeishuPlatform();
  }
  return undefined;
}

let feishu = buildFeishu();

const clawServer = new ClawServer({
  port: Number(process.env["PORT"] ?? 3000),
  routes: {},
  imEventStorage,
  conversationStorage,
});

if (feishu) clawServer.setRoute("/feishu", { platform: feishu, agent });

// ── SkillRegistry ─────────────────────────────────────────────────────────────

const skillRegistry = new SkillRegistry();
skillRegistry.register(new DailyDigestSkill({ configStorage: dailyDigestConfigStorage }));

// ── CronScheduler（定时任务）─────────────────────────────────────────────────

const cron = new CronScheduler({ timezone: "Asia/Shanghai", imEventStorage, skillRegistry, skillDataRoot: "./data/skills" });

/** Register one CronJobConfig into the scheduler (if enabled and platform is available). */
function registerCronJob(cfg: CronJobConfig): void {
  const platform = cfg.platform === "feishu" ? feishu : undefined;
  if (!platform || !cfg.chatId) return;
  cron.add({ id: cfg.id, schedule: cfg.schedule, message: cfg.message, direct: cfg.direct ?? false, msgType: cfg.msgType ?? "text", ...(cfg.skillId !== undefined && { skillId: cfg.skillId }), ...(cfg.sendSkillOutput !== undefined && { sendSkillOutput: cfg.sendSkillOutput }), agent, delivery: { platform, chatId: cfg.chatId } });
}

// ── WebServer（本地调试界面）─────────────────────────────────────────────────

const webServer = new WebServer({
  agent,
  port: 3001,
  routes: feishu ? { "/feishu": { platform: feishu, agent } } : {},
  skillDataRoot: "./data/skills",
  memoryStorage,
  imConfigStorage,
  llmConfigStorage,
  imEventStorage,
  conversationStorage,
  agentConfigStorage,
  dailyDigestConfigStorage,
  onIMConfig: (config: IMConfig) => {
    const newFeishu = config.feishu?.appId && config.feishu.appSecret && config.feishu.verificationToken
      ? new FeishuPlatform(config.feishu)
      : undefined;
    feishu = newFeishu;
    if (newFeishu) {
      clawServer.setRoute("/feishu", { platform: newFeishu, agent });
      webServer.setRoute("/feishu", { platform: newFeishu, agent });
    } else {
      clawServer.removeRoute("/feishu");
      webServer.removeRoute("/feishu");
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
    agent.updateSystem(() => [
      config.systemPrompt ?? DEFAULT_SYSTEM,
      `当前日期：${new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    ].join("\n"));
  },
  getStatus: () => ({
    cronJobs: cron.list().map((j) => ({ ...j, timezone: "Asia/Shanghai" })),
    connections: [
      { platform: "feishu", label: "飞书 Bot", connected: !!feishu },
    ],
  }),
  cronStorage,
  onCronAdd: (cfg) => registerCronJob(cfg),
  onCronDelete: (id) => cron.remove(id),
  skillRegistry,
});

// Seed default daily-digest job if cron-config.json is empty
if (cronStorage.read().length === 0) {
  const chatId = imConfigStorage.read().feishu?.chatId ?? process.env["FEISHU_CHAT_ID"] ?? "";
  if (chatId) {
    cronStorage.write([{
      id: "daily-digest",
      schedule: "0 9 * * *",
      message: "请搜索今天的科技新闻头条，保存到新闻库，并生成一份简短的日报摘要。",
      chatId,
      platform: "feishu",
      enabled: true,
    }]);
  }
}

// Load persisted cron jobs
for (const cfg of cronStorage.read()) {
  if (cfg.enabled) registerCronJob(cfg);
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

await clawServer.start();
await webServer.start();
cron.start();

console.log(`ClawServer  → http://localhost:${clawServer.port}  (IM Webhook)`);
console.log(`WebServer   → http://localhost:${webServer.port}   (调试界面)`);
console.log(`飞书          ${feishu ? "✓ 已连接" : "✗ 未配置（设置 FEISHU_APP_ID / APP_SECRET / VERIFICATION_TOKEN）"}`);
console.log(`CronScheduler 已启动，${cron.jobIds.length} 个任务`);
