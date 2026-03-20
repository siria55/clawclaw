import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { DigestArticle } from "../skills/daily-digest/index.js";
import type { IMEventStorage } from "./storage.js";

const DAILY_DIGEST_REPLY_RE = /^\[日报(?:图片|文本)\]\s+(\d{4}-\d{2}-\d{2})$/;
const RECENT_DIGEST_WINDOW_MS = 36 * 60 * 60 * 1000;

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
  const cutoff = Date.now() - RECENT_DIGEST_WINDOW_MS;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (Date.parse(event.timestamp) < cutoff) break;
    if (event.chatId !== chatId) continue;
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

export function buildDailyDigestTextHint(total: number | undefined): string {
  const range = total ? `回复 1-${total} 获取对应新闻原文链接` : "回复数字获取对应新闻原文链接";
  return `已发送今天的新闻文字版。${range}，例如回复“3”。`;
}

export function buildDailyDigestInvalidIndexReply(total: number | undefined): string {
  return total
    ? `这份日报共有 ${total} 条新闻，回复 1-${total} 获取对应原文链接。`
    : "这份日报暂时没有可用的编号链接。";
}

export function buildDailyDigestLinkMarkdown(index: number, article: DigestArticle): string {
  const category = article.category === "domestic" ? "国内" : "国际";
  const lines = [
    `### ${String(index).padStart(2, "0")}. ${article.title}`,
    "",
    `- 分类：${category}`,
    `- 来源：${article.source || "未知来源"}`,
    `- 原文：[点击打开](${article.url})`,
  ];
  if (article.summary) {
    lines.push("", article.summary);
  }
  return lines.join("\n");
}

export function buildDailyDigestLinkText(index: number, article: DigestArticle): string {
  const category = article.category === "domestic" ? "国内" : "国际";
  const parts = [
    `${String(index).padStart(2, "0")}. ${article.title}`,
    `分类：${category}`,
    `来源：${article.source || "未知来源"}`,
    `链接：${article.url}`,
  ];
  if (article.summary) {
    parts.push(`摘要：${article.summary}`);
  }
  return parts.join("\n");
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
