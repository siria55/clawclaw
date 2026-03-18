import type { Page, Browser } from "playwright";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Skill, SkillContext } from "../types.js";
import type { NewsArticle } from "../../news/types.js";
import type { FeishuPlatform } from "../../platform/feishu.js";

interface RawArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
}

/**
 * Crawl top articles from 36Kr homepage using Playwright locators.
 */
async function crawl36kr(page: Page): Promise<RawArticle[]> {
  await page.goto("https://36kr.com/", { waitUntil: "domcontentloaded", timeout: 30_000 });
  const anchors = await page.locator(".article-item-title a, .item-title a").all();
  const articles: RawArticle[] = [];
  const seen = new Set<string>();
  for (const anchor of anchors) {
    if (articles.length >= 10) break;
    const title = ((await anchor.textContent()) ?? "").trim();
    if (!title) continue;
    const href = (await anchor.getAttribute("href")) ?? "";
    const url = href.startsWith("http") ? href : `https://36kr.com${href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    articles.push({ title, url, summary: "", source: "36Kr" });
  }
  return articles;
}

/**
 * Render articles as a styled HTML news digest page.
 */
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

/**
 * Render articles as a Markdown digest.
 */
function renderMarkdown(articles: RawArticle[], date: string): string {
  const rows = articles
    .map((a, i) => `${i + 1}. **[${a.title}](${a.url})**${a.summary ? `\n   ${a.summary}` : ""}\n   _${a.source}_`)
    .join("\n\n");
  return `# 每日新闻日报\n\n**${date}**\n\n${rows}\n`;
}

/**
 * Take a screenshot of HTML content. Returns a PNG buffer.
 */
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
 * Daily digest skill — crawls tech news, renders a styled digest, screenshots it, and sends the image to Feishu.
 */
export class DailyDigestSkill implements Skill {
  readonly id = "daily-digest";
  readonly description = "爬取今日科技新闻，生成 HTML 日报截图并发送到飞书";

  async run(ctx: SkillContext): Promise<void> {
    const browser = await chromium.launch({ headless: true });
    try {
      const crawlPage = await browser.newPage();
      let articles: RawArticle[] = [];
      try {
        articles = await crawl36kr(crawlPage);
      } finally {
        await crawlPage.close();
      }

      if (ctx.newsStorage) {
        for (const a of articles) {
          ctx.newsStorage.save({
            title: a.title,
            url: a.url,
            summary: a.summary,
            source: a.source,
            tags: ["tech", "36kr"],
          } satisfies Omit<NewsArticle, "id" | "savedAt">);
        }
      }

      const dateKey = new Date().toLocaleDateString("sv-SE");  // YYYY-MM-DD
      const dateLabel = new Date().toLocaleDateString("zh-CN", {
        year: "numeric", month: "long", day: "numeric",
      });
      const html = renderHtml(articles, dateLabel);
      const imageBuffer = await screenshotHtml(browser, html);

      const dataDirPath = ctx.dataDir ?? "";
      if (dataDirPath) {
        writeFileSync(join(dataDirPath, `${dateKey}.html`), html, "utf8");
        writeFileSync(join(dataDirPath, `${dateKey}.png`), imageBuffer);
        writeFileSync(join(dataDirPath, `${dateKey}.md`), renderMarkdown(articles, dateLabel), "utf8");
      }

      if (ctx.delivery) {
        const platform = ctx.delivery.platform as unknown as FeishuPlatform;
        await platform.sendImageBuffer(ctx.delivery.chatId, imageBuffer);
      }
    } finally {
      await browser.close();
    }
  }
}
