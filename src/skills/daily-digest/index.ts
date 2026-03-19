import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Page, Browser } from "playwright";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { loadSkillDef } from "../loader.js";
import type { Skill, SkillContext, SkillResult } from "../types.js";

interface RawArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
}

const RawArticleSchema = z.object({
  title: z.string(),
  url: z.string(),
  summary: z.string(),
  source: z.string(),
});

interface LinkItem {
  text: string;
  href: string;
}

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));

/** Extract all anchor links from the current page using Playwright locators (zero LLM calls). */
async function extractPageLinks(page: Page): Promise<LinkItem[]> {
  const anchors = await page.locator("a[href]").all();
  const items: LinkItem[] = [];
  for (const a of anchors) {
    const text = ((await a.textContent().catch(() => "")) ?? "").trim().slice(0, 80);
    const href = (await a.getAttribute("href").catch(() => "")) ?? "";
    const absHref = href.startsWith("http") ? href : "";
    if (text.length > 3 && absHref) items.push({ text, href: absHref });
  }
  return items;
}

/**
 * Navigate each search URL with Playwright, collect all links, then make a single
 * LLM call to filter and structure results as RawArticle[].
 */
async function searchNewsWithBrowser(
  browser: Browser,
  ctx: SkillContext,
  queries: string[],
  maxArticles: number,
): Promise<RawArticle[]> {
  const log = (msg: string): void => { if (ctx.log) ctx.log(msg); };
  const allLinks: LinkItem[] = [];
  const page = await browser.newPage();
  try {
    for (const query of queries) {
      const url = `https://news.baidu.com/ns?word=${encodeURIComponent(query)}&tn=news&cl=2&rn=20&ct=1`;
      log(`🌐 搜索: ${query}`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      } catch { /* timeout — read whatever rendered */ }
      const links = await extractPageLinks(page);
      log(`🔗 获取 ${links.length} 个链接`);
      allLinks.push(...links);
    }
  } finally {
    await page.close();
  }

  const seen = new Set<string>();
  const uniqueLinks = allLinks.filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });

  if (uniqueLinks.length === 0) {
    log("⚠️ 未获取到任何链接");
    return [];
  }

  log(`📊 共收集 ${uniqueLinks.length} 个链接，调用 LLM 筛选…`);
  const linkText = uniqueLinks
    .slice(0, 200)
    .map((l) => `${l.text} | ${l.href}`)
    .join("\n");

  const prompt = `以下是从新闻搜索页面提取的链接列表（格式：标题 | URL）：

${linkText}

请从中识别并筛选出真实的新闻文章（标题有实际内容、URL 指向新闻页面，排除导航链接、广告等）。
最多返回 ${maxArticles} 篇，按相关性和时效性排序。

只返回 JSON 数组，不要其他文字：
[{"title":"文章标题","url":"文章完整URL","summary":"摘要（无则空字符串）","source":"来源媒体"}]`;

  const result = await ctx.agent.run(prompt);
  const lastMsg = [...result.messages].reverse().find((m) => m.role === "assistant");
  const text = extractText(lastMsg?.content);
  const jsonText = extractJsonArray(text);
  if (!jsonText) {
    log("⚠️ LLM 未返回有效 JSON");
    if (text) log(`🪵 LLM 原始输出: ${text.slice(0, 200)}`);
    return [];
  }
  const articles = parseArticlesFromLLMOutput(lastMsg?.content);
  if (!articles) {
    log("⚠️ JSON 解析失败");
    return [];
  }
  log(`✅ 筛选出 ${articles.length} 篇文章`);
  return articles;
}

/** Render articles as a styled HTML news digest page. */
function renderHtml(articles: RawArticle[], date: string): string {
  const rows = articles
    .map(
      (a, i) => `
    <div class="item">
      <span class="num">${i + 1}</span>
      <div class="body">
        <a class="title" href="${a.url}">${escapeHtml(a.title)}</a>
        ${a.summary ? `<p class="summary">${escapeHtml(a.summary)}</p>` : ""}
        <span class="source">${escapeHtml(a.source)}</span>
      </div>
    </div>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "PingFang SC", "Hiragino Sans GB", sans-serif; background: #f5f5f7; padding: 24px; width: 640px; }
    .header { background: #1a1a2e; color: #fff; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; }
    .header h1 { font-size: 20px; font-weight: 700; }
    .header .date { font-size: 13px; color: #aaa; margin-top: 4px; }
    .item { display: flex; gap: 14px; background: #fff; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; align-items: flex-start; }
    .num { min-width: 26px; height: 26px; border-radius: 50%; background: #e8f0fe; color: #3a7bd5; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
    .body { flex: 1; min-width: 0; }
    .title { font-size: 15px; font-weight: 600; color: #1a1a2e; text-decoration: none; display: block; line-height: 1.5; }
    .summary { font-size: 13px; color: #666; margin-top: 5px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .source { display: inline-block; margin-top: 6px; font-size: 11px; color: #888; background: #f0f0f5; padding: 2px 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📰 每日新闻日报</h1>
    <div class="date">${date}</div>
  </div>
  ${rows}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Render articles as a Markdown digest. */
function renderMarkdown(articles: RawArticle[], date: string): string {
  const rows = articles
    .map((a, i) => `${i + 1}. **[${a.title}](${a.url})**${a.summary ? `\n   ${a.summary}` : ""}\n   _${a.source}_`)
    .join("\n\n");
  return `# 每日新闻日报\n\n**${date}**\n\n${rows}\n`;
}

/** Take a screenshot of HTML content. Returns a PNG buffer. */
async function screenshotHtml(browser: Browser, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.setContent(html, { waitUntil: "networkidle" });
    const height = await page.evaluate(() => (globalThis as unknown as { document: { body: { scrollHeight: number } } }).document.body.scrollHeight);
    await page.setViewportSize({ width: 640, height: Math.max(900, height + 40) });
    const buffer = await page.screenshot({ fullPage: true });
    return Buffer.from(buffer);
  } finally {
    await page.close();
  }
}

/**
 * Daily digest skill — uses Playwright to directly scrape search result links,
 * then makes a single LLM call to filter and structure results.
 * Renders a styled HTML digest, screenshots it, and saves all output files.
 *
 * Output files per run: YYYY-MM-DD.{html,md,png,json}
 */
export class DailyDigestSkill implements Skill {
  readonly id: string;
  readonly description: string;
  readonly #queries: string[];
  readonly #maxArticles: number;

  constructor() {
    const def = loadSkillDef(SKILL_DIR);
    this.id = def.id;
    this.description = def.description;
    this.#queries = def.queries;
    this.#maxArticles = def.maxArticles;
  }

  async run(ctx: SkillContext): Promise<SkillResult> {
    const browser = await chromium.launch({ headless: true });
    try {
      const articles = await searchNewsWithBrowser(browser, ctx, this.#queries, this.#maxArticles);
      ctx.log?.(`📊 获取 ${articles.length} 篇文章`);

      const dateKey = new Date().toLocaleDateString("sv-SE");
      const dateLabel = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
      const html = renderHtml(articles, dateLabel);
      const imageBuffer = await screenshotHtml(browser, html);

      const dataDirPath = ctx.dataDir ?? "";
      if (dataDirPath) {
        writeFileSync(join(dataDirPath, `${dateKey}.html`), html, "utf8");
        writeFileSync(join(dataDirPath, `${dateKey}.md`), renderMarkdown(articles, dateLabel), "utf8");
        writeFileSync(join(dataDirPath, `${dateKey}.png`), imageBuffer);
        writeFileSync(join(dataDirPath, `${dateKey}.json`), JSON.stringify(articles, null, 2), "utf8");
        ctx.log?.(`💾 文件已保存到 ${dataDirPath}`);
        return { outputPath: join(dataDirPath, `${dateKey}.png`) };
      }
      return {};
    } finally {
      await browser.close();
    }
  }
}

export function parseArticlesFromLLMOutput(content: unknown): RawArticle[] {
  const text = extractText(content);
  const jsonText = extractJsonArray(text);
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText) as unknown[];
    return parsed.flatMap((item) => {
      const result = RawArticleSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function extractJsonArray(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf("[");
  const end = fenced.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return undefined;
  return fenced.slice(start, end + 1);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => isTextBlock(block))
    .map((block) => block.text)
    .join("");
}

function isTextBlock(value: unknown): value is { type: "text"; text: string } {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (value as { type?: unknown }).type === "text"
    && typeof (value as { text?: unknown }).text === "string";
}
