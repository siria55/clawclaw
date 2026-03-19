import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Page, Browser } from "playwright";
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
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
const LAYOUT_CSS = readFileSync(join(SKILL_DIR, "layout.css"), "utf8");
const EXTRACTION_SYSTEM = [
  "你是一个严谨的新闻链接筛选器。",
  "你的任务是从候选链接中挑出真实新闻文章，并返回严格 JSON。",
  "不要聊天，不要解释，不要使用 markdown，除了 JSON 数组不要输出任何别的内容。",
  "如果字符串里出现双引号，必须转义。",
].join("\n");

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

  const response = await ctx.agent.llm.complete({
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const text = extractText(response.message.content);
  const jsonText = extractJsonArray(text);
  if (!jsonText) {
    log("⚠️ LLM 未返回有效 JSON");
    if (text) log(`🪵 LLM 原始输出: ${text.slice(0, 200)}`);
    return [];
  }
  const articles = parseArticlesFromLLMOutput(response.message.content);
  if (!articles) {
    log("⚠️ JSON 解析失败");
    log(`🪵 LLM 原始输出: ${text.slice(0, 200)}`);
    return [];
  }
  log(`✅ 筛选出 ${articles.length} 篇文章`);
  return articles;
}

/** Render articles as a styled HTML news digest page. */
export function renderDailyDigestHtml(articles: RawArticle[], date: string): string {
  const summaryText = buildSummaryText(articles);
  const rows = articles
    .map(
      (a, i) => `
    <div class="item">
      <span class="num">${i + 1}</span>
      <div class="body">
        <a class="title" href="${a.url}">${escapeHtml(a.title)}</a>
        ${a.summary ? `<p class="summary">${escapeHtml(a.summary)}</p>` : ""}
        <div class="meta-row">
          <span class="source">${escapeHtml(a.source)}</span>
          <span class="link-mark">OPEN LINK</span>
        </div>
      </div>
    </div>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <style>${LAYOUT_CSS}</style>
</head>
<body>
  <div class="page">
    <div class="page-grid"></div>
    <div class="orb orb-a"></div>
    <div class="orb orb-b"></div>
    <div class="orb orb-c"></div>
    <header class="hero">
      <div class="hero-top">
        <div class="brand">
          <div class="brand-en">AI EDUCATION</div>
          <div class="brand-sub">NEWS BRIEF</div>
        </div>
        <div class="meta">
          <div class="meta-date">${escapeHtml(formatIsoDate(date))}</div>
          <div class="meta-vol">VOL.${String(Math.max(articles.length, 1)).padStart(2, "0")}</div>
        </div>
      </div>
      <h1 class="headline">
        <span>科技新闻</span>
        <span>日报</span>
      </h1>
      <p class="deck">Daily digest of AI, venture, and internet signals gathered from browser search and filtered into a readable brief.</p>
    </header>
    <section class="summary-card">
      <div class="summary-header">
        <h2 class="summary-title">今日摘要</h2>
        <div class="summary-label">/ SUMMARY</div>
      </div>
      <p class="summary-text">${escapeHtml(summaryText)}</p>
    </section>
    <section class="news-list">
      ${rows}
    </section>
  </div>
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
    await page.setViewportSize({ width: 1080, height: 1400 });
    await page.setContent(html, { waitUntil: "networkidle" });
    const height = await page.evaluate(() => (globalThis as unknown as { document: { body: { scrollHeight: number } } }).document.body.scrollHeight);
    await page.setViewportSize({ width: 1080, height: Math.max(1400, height + 80) });
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
      const html = renderDailyDigestHtml(articles, dateLabel);
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

export function parseArticlesFromLLMOutput(content: unknown): RawArticle[] | undefined {
  const text = extractText(content);
  const jsonText = extractJsonArray(text);
  if (!jsonText) return undefined;
  try {
    const parsed = JSON.parse(jsonText) as unknown[];
    return validateArticles(parsed);
  } catch {
    const repaired = parseArticlesLoosely(jsonText);
    return repaired.length > 0 ? repaired : undefined;
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

function validateArticles(items: unknown[]): RawArticle[] {
  return items.flatMap((item) => {
    const result = RawArticleSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

function parseArticlesLoosely(text: string): RawArticle[] {
  const objects = text.match(/\{[\s\S]*?\}/g) ?? [];
  return objects.flatMap((objectText) => {
    const title = extractLooseField(objectText, "title", "url");
    const url = extractLooseField(objectText, "url", "summary");
    const summary = extractLooseField(objectText, "summary", "source");
    const source = extractLooseLastField(objectText, "source");
    const result = RawArticleSchema.safeParse({
      title,
      url,
      summary,
      source,
    });
    return result.success ? [result.data] : [];
  });
}

function extractLooseField(text: string, field: string, nextField: string): string {
  const escapedField = escapeRegExp(field);
  const escapedNextField = escapeRegExp(nextField);
  const match = text.match(new RegExp(`"${escapedField}":"([\\s\\S]*?)","${escapedNextField}":"`));
  return decodeLooseString(match?.[1] ?? "");
}

function extractLooseLastField(text: string, field: string): string {
  const escapedField = escapeRegExp(field);
  const match = text.match(new RegExp(`"${escapedField}":"([\\s\\S]*?)"\\s*\\}?\\s*$`));
  return decodeLooseString(match?.[1] ?? "");
}

function decodeLooseString(value: string): string {
  return value
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSummaryText(articles: RawArticle[]): string {
  if (articles.length === 0) {
    return "今日检索已完成，但暂未筛出可展示的文章。建议调整关键词或稍后重跑。";
  }
  const sources = summarizeSources(articles);
  return `共筛出 ${articles.length} 篇文章，重点覆盖 AI 科技、创业投资与互联网动态。来源以 ${sources} 为主，以下按筛选后的相关性顺序展开。`;
}

function summarizeSources(articles: RawArticle[]): string {
  const counts = new Map<string, number>();
  for (const article of articles) {
    counts.set(article.source, (counts.get(article.source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([source]) => source)
    .join("、");
}

function formatIsoDate(date: string): string {
  const match = date.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (!match) return date;
  const [, year, month, day] = match;
  return `${year}.${month?.padStart(2, "0")}.${day?.padStart(2, "0")}`;
}
