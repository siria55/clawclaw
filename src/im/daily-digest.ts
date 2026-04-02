import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { DigestArticle } from "../skills/daily-digest/index.js";
import type { IMEventStorage } from "./storage.js";

const DAILY_DIGEST_REPLY_RE = /^\[日报(?:图片|文本)\]\s+(\d{4}-\d{2}-\d{2})$/;

export interface DailyDigestFiles {
  dateKey: string;
  pngPath?: string;
  markdownPath?: string;
  jsonPath?: string;
}

export function getDailyDigestFiles(dataRoot: string, timezone: string): DailyDigestFiles {
  const dateKey = new Date().toLocaleDateString("sv-SE", { timeZone: timezone });
  return getDailyDigestFilesByDate(dataRoot, dateKey);
}

export function getDailyDigestFilesByDate(dataRoot: string, dateKey: string): DailyDigestFiles {
  const dir = join(dataRoot, "daily-digest");
  const pngPath = join(dir, `${dateKey}.png`);
  const markdownPath = join(dir, `${dateKey}.md`);
  const jsonPath = join(dir, `${dateKey}.json`);
  return {
    dateKey,
    ...(existsSync(pngPath) ? { pngPath } : {}),
    ...(existsSync(markdownPath) ? { markdownPath } : {}),
    ...(existsSync(jsonPath) ? { jsonPath } : {}),
  };
}

export function readDailyDigestMarkdown(filePath: string): string | undefined {
  try {
    const text = readFileSync(filePath, "utf8").trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

export function readDailyDigestArticles(filePath: string | undefined): DigestArticle[] {
  if (!filePath) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isDigestArticle)
      : [];
  } catch {
    return [];
  }
}

export function getDailyDigestArticleCount(filePath: string | undefined): number | undefined {
  const articles = readDailyDigestArticles(filePath);
  return articles.length > 0 ? articles.length : undefined;
}

export function extractDailyDigestDateKey(replyText: string | undefined): string | undefined {
  return replyText?.match(DAILY_DIGEST_REPLY_RE)?.[1];
}

export function extractDailyDigestDateKeyFromPath(filePath: string): string | undefined {
  return basename(filePath).match(/^(\d{4}-\d{2}-\d{2})\./)?.[1];
}

export function findRecentDailyDigestDateKey(
  chatId: string,
  imEventStorage: IMEventStorage | undefined,
): string | undefined {
  if (!imEventStorage) return undefined;
  const events = imEventStorage.since(undefined);
  // First pass: find digest sent to this specific chatId.
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.chatId !== chatId) continue;
    const dateKey = extractDailyDigestDateKey(event.replyText);
    if (dateKey) return dateKey;
  }
  // Fallback: use the most recent digest dateKey from any chatId.
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    const dateKey = extractDailyDigestDateKey(event.replyText);
    if (dateKey) return dateKey;
  }
  return undefined;
}

export function findDailyDigestArticleByIndex(
  dataRoot: string,
  dateKey: string,
  replyIndex: number,
): { article: DigestArticle; total: number } | undefined {
  const articles = readDailyDigestArticles(getDailyDigestFilesByDate(dataRoot, dateKey).jsonPath);
  const article = articles[replyIndex - 1];
  return article ? { article, total: articles.length } : undefined;
}

export function buildDailyDigestImageHint(total: number | undefined): string {
  const range = total ? `回复 1-${total} 获取对应新闻原文链接` : "回复数字获取对应新闻原文链接";
  return `已发送今天的新闻图片。${range}，例如回复“3”。如需文字版，回复“今天新闻文本版”。`;
}

export function buildDailyDigestMissingTodayReply(dateKey: string): string {
  return `今日日报（${dateKey}）尚未生成成功，本次未发送旧日报。请先检查 09:00 生成任务，或手动重跑 daily-digest。`;
}

export function buildDailyDigestTextHint(total: number | undefined): string {
  const range = total ? `回复 1-${total} 获取对应新闻原文链接` : "回复数字获取对应新闻原文链接";
  return `已发送今天的新闻文字版。${range}，例如回复“3”。`;
}

export function buildDailyDigestInvalidIndexReply(total: number | undefined): string {
  return total
    ? `这份日报共有 ${total} 条新闻，回复 1-${total} 获取对应原文链接。`
    : "这份日报暂时没有可用的编号链接。";
}

function isDigestArticle(value: unknown): value is DigestArticle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const article = value as Record<string, unknown>;
  return typeof article["title"] === "string"
    && typeof article["url"] === "string"
    && typeof article["summary"] === "string"
    && typeof article["source"] === "string"
    && (article["category"] === "domestic" || article["category"] === "international");
}
