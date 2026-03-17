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
import { NewsStorage } from "./news/storage.js";
import { MemoryStorage } from "./memory/storage.js";
import { IMConfigStorage } from "./config/storage.js";
import { createSaveNewsTool } from "./tools/news.js";
import { createMemoryTools } from "./tools/memory.js";
import type { Message } from "./llm/types.js";
import type { IMConfig } from "./config/types.js";

// ── 存储 ──────────────────────────────────────────────────────────────────────

mkdirSync("./data", { recursive: true });

const newsStorage = new NewsStorage("./data/news.json");
const memoryStorage = new MemoryStorage("./data/memory.json");
const imConfigStorage = new IMConfigStorage("./data/im-config.json");

// ── LLM ───────────────────────────────────────────────────────────────────────

function buildLLM(): AnthropicProvider {
  const saved = imConfigStorage.read().llm;
  return new AnthropicProvider({
    ...(saved?.apiKey && { apiKey: saved.apiKey }),
    ...(saved?.baseURL && { baseURL: saved.baseURL }),
    ...(saved?.model && { model: saved.model }),
  });
}

const llm = buildLLM();

// ── Agent ─────────────────────────────────────────────────────────────────────

const agent = new Agent({
  name: "clawclaw",

  // 动态 system prompt：每轮调用前注入当前日期
  system: () => [
    "你是一个高效的 AI 助手，可以搜索和保存新闻、管理长期记忆。",
    `当前日期：${new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
  ].join("\n"),

  llm,

  tools: [
    createSaveNewsTool(newsStorage),
    ...createMemoryTools(memoryStorage),
    // 在这里添加更多工具，如浏览器工具等
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
});

if (feishu) clawServer.setRoute("/feishu", { platform: feishu, agent });

// ── WebServer（本地调试界面）─────────────────────────────────────────────────

const webServer = new WebServer({
  agent,
  port: 3001,
  newsStorage,
  imConfigStorage,
  onIMConfig: (config: IMConfig) => {
    const newFeishu = config.feishu?.appId && config.feishu.appSecret && config.feishu.verificationToken
      ? new FeishuPlatform(config.feishu)
      : undefined;
    feishu = newFeishu;
    if (newFeishu) {
      clawServer.setRoute("/feishu", { platform: newFeishu, agent });
    } else {
      clawServer.removeRoute("/feishu");
    }
  },
  onLLMConfig: (config) => {
    agent.updateLLM(new AnthropicProvider({
      ...(config.apiKey && { apiKey: config.apiKey }),
      ...(config.baseURL && { baseURL: config.baseURL }),
      ...(config.model && { model: config.model }),
    }));
  },
  getStatus: () => ({
    cronJobs: cron.jobIds.map((id) => ({
      id,
      schedule: "—",
      message: "—",
      timezone: "Asia/Shanghai",
    })),
    connections: [
      { platform: "feishu", label: "飞书 Bot", connected: !!feishu },
    ],
  }),
});

// ── CronScheduler（定时任务）─────────────────────────────────────────────────

const cron = new CronScheduler({ timezone: "Asia/Shanghai" });

// 每天早上 9:00 发送日报（仅在飞书初始配置后启用）
if (feishu) {
  const chatId = imConfigStorage.read().feishu?.chatId ?? process.env["FEISHU_CHAT_ID"] ?? "";
  cron.add({
    id: "daily-digest",
    schedule: "0 9 * * *",
    message: "请搜索今天的科技新闻头条，保存到新闻库，并生成一份简短的日报摘要。",
    agent,
    delivery: { platform: feishu, chatId },
  });
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

await clawServer.start();
await webServer.start();
cron.start();

console.log(`ClawServer  → http://localhost:${clawServer.port}  (IM Webhook)`);
console.log(`WebServer   → http://localhost:${webServer.port}   (调试界面)`);
console.log(`飞书          ${feishu ? "✓ 已连接" : "✗ 未配置（设置 FEISHU_APP_ID / APP_SECRET / VERIFICATION_TOKEN）"}`);
console.log(`CronScheduler 已启动，${cron.jobIds.length} 个任务`);
