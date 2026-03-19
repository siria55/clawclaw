import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent } from "../core/agent.js";
import type { IMMessage } from "../platform/types.js";
import type { FeishuPlatform } from "../platform/feishu.js";
import type { Skill } from "../skills/types.js";
import type { IMRouteHandleResult } from "./route.js";

type NewsReplyFormat = "image" | "text";

export interface NewsReplyIntent {
  format: NewsReplyFormat;
}

interface DailyDigestFiles {
  dateKey: string;
  pngPath?: string;
  markdownPath?: string;
}

export interface DailyDigestNewsReplyOptions {
  agent: Agent;
  getPlatform: () => FeishuPlatform | undefined;
  getSkill: () => Skill | undefined;
  dataRoot: string;
  timezone?: string;
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

export function createDailyDigestNewsReplyHandler(
  options: DailyDigestNewsReplyOptions,
): (message: IMMessage) => Promise<IMRouteHandleResult | undefined> {
  const timezone = options.timezone ?? "Asia/Shanghai";
  let generation: Promise<DailyDigestFiles> | undefined;

  return async (message: IMMessage): Promise<IMRouteHandleResult | undefined> => {
    const intent = parseNewsReplyIntent(message.text);
    if (!intent) return undefined;

    const platform = options.getPlatform();
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
      return { handled: true, replyText: `[日报文本] ${files.dateKey}` };
    }

    if (!files.pngPath) {
      const fallback = "今天的新闻图片还没生成成功。你可以回复“今天新闻文本版”，我先发文字版。";
      await platform.send(message.chatId, fallback);
      return { handled: true, replyText: fallback };
    }

    await platform.sendImage(message.chatId, files.pngPath);
    await platform.send(
      message.chatId,
      "已发送今天的新闻图片。如需文字版，回复“今天新闻文本版”。",
    );
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

function getDailyDigestFiles(dataRoot: string, timezone: string): DailyDigestFiles {
  const dateKey = new Date().toLocaleDateString("sv-SE", { timeZone: timezone });
  const dir = join(dataRoot, "daily-digest");
  const pngPath = join(dir, `${dateKey}.png`);
  const markdownPath = join(dir, `${dateKey}.md`);
  return {
    dateKey,
    ...(existsSync(pngPath) ? { pngPath } : {}),
    ...(existsSync(markdownPath) ? { markdownPath } : {}),
  };
}

function readDailyDigestMarkdown(filePath: string): string | undefined {
  try {
    const text = readFileSync(filePath, "utf8").trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
