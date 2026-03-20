import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Agent } from "../core/agent.js";
import type { IMMessage } from "../platform/types.js";
import type { FeishuPlatform } from "../platform/feishu.js";
import type { Skill } from "../skills/types.js";
import type { IMEventStorage } from "./storage.js";
import type { IMRouteHandleResult } from "./route.js";
import {
  buildDailyDigestImageHint,
  buildDailyDigestInvalidIndexReply,
  buildDailyDigestTextHint,
  findDailyDigestArticleByIndex,
  findRecentDailyDigestDateKey,
  getDailyDigestArticleCount,
  getDailyDigestFiles,
  getDailyDigestFilesByDate,
  readDailyDigestMarkdown,
  type DailyDigestFiles,
} from "./daily-digest.js";

type NewsReplyFormat = "image" | "text";

export interface NewsReplyIntent {
  format: NewsReplyFormat;
}

export interface DailyDigestNewsReplyOptions {
  agent: Agent;
  getPlatform: () => FeishuPlatform | undefined;
  getSkill: () => Skill | undefined;
  dataRoot: string;
  timezone?: string;
  imEventStorage?: IMEventStorage;
}

/** Parse short IM prompts like “给我今天的新闻” into a daily-digest reply intent. */
export function parseNewsReplyIntent(text: string): NewsReplyIntent | undefined {
  const normalized = normalizeText(text);
  if (!normalized) return undefined;

  const hasNewsKeyword = /(新闻|日报|简报|头条)/.test(normalized);
  const hasRequestKeyword = /(给我|发我|来一份|看看|看下|看一下|我要|想看|推送|发送)/.test(normalized);
  const hasTimeKeyword = /(今天|今日|最新|本日)/.test(normalized);
  if (!hasNewsKeyword || (!hasRequestKeyword && !hasTimeKeyword && normalized.length > 12)) {
    return undefined;
  }

  if (/(文本|文字|markdown|md|详情)/.test(normalized)) {
    return { format: "text" };
  }
  return { format: "image" };
}

/** Parse pure numeric replies like `3` / `03` into a digest item index. */
export function parseDailyDigestReplyIndex(text: string): number | undefined {
  const normalized = normalizeText(text);
  if (!/^\d{1,2}$/.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function createDailyDigestNewsReplyHandler(
  options: DailyDigestNewsReplyOptions,
): (message: IMMessage) => Promise<IMRouteHandleResult | undefined> {
  const timezone = options.timezone ?? "Asia/Shanghai";
  let generation: Promise<DailyDigestFiles> | undefined;

  return async (message: IMMessage): Promise<IMRouteHandleResult | undefined> => {
    const platform = options.getPlatform();
    const replyIndex = parseDailyDigestReplyIndex(message.text);
    if (platform && replyIndex !== undefined) {
      const dateKey = findRecentDailyDigestDateKey(message.chatId, options.imEventStorage);
      if (dateKey) {
        const resolved = findDailyDigestArticleByIndex(options.dataRoot, dateKey, replyIndex);
        if (!resolved) {
          const total = getDailyDigestArticleCount(getDailyDigestFilesByDate(options.dataRoot, dateKey).jsonPath);
          const fallback = buildDailyDigestInvalidIndexReply(total);
          await platform.send(message.chatId, fallback);
          return { handled: true, replyText: fallback };
        }
        await platform.send(message.chatId, resolved.article.url);
        return {
          handled: true,
          replyText: `[日报链接] ${dateKey}#${String(replyIndex).padStart(2, "0")}`,
        };
      }
    }

    const intent = parseNewsReplyIntent(message.text);
    if (!intent) return undefined;
    if (!platform) return undefined;

    let files = getDailyDigestFiles(options.dataRoot, timezone);
    const requiresGeneration = intent.format === "image" ? !files.pngPath : !files.markdownPath;
    if (requiresGeneration) {
      await platform.send(
        message.chatId,
        intent.format === "image"
          ? "今天的新闻图片还没准备好，我现在开始生成，稍后发你。"
          : "今天的新闻文本还没准备好，我现在开始生成，稍后发你。",
      );
      files = await ensureDailyDigestFiles(options, timezone, () => generation, (next) => {
        generation = next;
      });
    }

    if (intent.format === "text") {
      const markdown = files.markdownPath ? readDailyDigestMarkdown(files.markdownPath) : undefined;
      if (!markdown) {
        const fallback = "今天的新闻文本还没生成成功。你也可以回复“今天新闻图片”让我直接发图。";
        await platform.send(message.chatId, fallback);
        return { handled: true, replyText: fallback };
      }
      if (platform.sendMarkdown) {
        await platform.sendMarkdown(message.chatId, markdown);
      } else {
        await platform.send(message.chatId, markdown);
      }
      await platform.send(message.chatId, buildDailyDigestTextHint(getDailyDigestArticleCount(files.jsonPath)));
      return { handled: true, replyText: `[日报文本] ${files.dateKey}` };
    }

    if (!files.pngPath) {
      const fallback = "今天的新闻图片还没生成成功。你可以回复“今天新闻文本版”，我先发文字版。";
      await platform.send(message.chatId, fallback);
      return { handled: true, replyText: fallback };
    }

    await platform.sendImage(message.chatId, files.pngPath);
    await platform.send(message.chatId, buildDailyDigestImageHint(getDailyDigestArticleCount(files.jsonPath)));
    return { handled: true, replyText: `[日报图片] ${files.dateKey}` };
  };
}

async function ensureDailyDigestFiles(
  options: DailyDigestNewsReplyOptions,
  timezone: string,
  getGeneration: () => Promise<DailyDigestFiles> | undefined,
  setGeneration: (next: Promise<DailyDigestFiles> | undefined) => void,
): Promise<DailyDigestFiles> {
  const running = getGeneration();
  if (running) return running;

  const next = (async (): Promise<DailyDigestFiles> => {
    const skill = options.getSkill();
    if (!skill) {
      return getDailyDigestFiles(options.dataRoot, timezone);
    }
    const dataDir = join(options.dataRoot, skill.id);
    mkdirSync(dataDir, { recursive: true });
    await skill.run({ agent: options.agent, dataDir });
    return getDailyDigestFiles(options.dataRoot, timezone);
  })();

  setGeneration(next);
  try {
    return await next;
  } finally {
    if (getGeneration() === next) {
      setGeneration(undefined);
    }
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
