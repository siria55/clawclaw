import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Page, Browser } from "playwright";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { Agent } from "../../core/agent.js";
import { defineTool } from "../../tools/types.js";
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

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));

/** Browser tools for the news sub-agent to operate a Playwright page. */
function createBrowserTools(page: Page): ReturnType<typeof defineTool>[] {
  return [
    defineTool({
      name: "browser_navigate",
      description: "导航到指定 URL，返回页面标题和可见文字（最多 4000 字符）",
      schema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
        } catch { /* timeout — read whatever rendered */ }
        const title = await page.title().catch(() => "");
        const text = ((await page.locator("body").textContent().catch(() => "")) ?? "")
          .replace(/\s+/g, " ").trim();
        return { output: `[${title}]\n${text.slice(0, 4000)}` };
      },
    }),
    defineTool({
      name: "browser_get_links",
      description: "获取当前页面所有链接（文字 + href），用于提取文章 URL",
      schema: z.object({}),
      execute: async () => {
        const els = await page.locator("a[href]").all();
        const lines: string[] = [];
        for (const el of els.slice(0, 80)) {
          const text = ((await el.textContent().catch(() => "")) ?? "").trim().slice(0, 60);
          const href = (await el.getAttribute("href").catch(() => "")) ?? "";
          if (text.length > 3 && href) lines.push(`${text} | ${href}`);
        }
        return { output: lines.join("\n") };
      },
    }),
  ];
}

/** Build the agent prompt from SKILL.md instructions, substituting variables. */
function buildPrompt(instructions: string, queries: string[], maxArticles: number): string {
  const searchUrls = queries
    .map((q) => `  - https://news.baidu.com/ns?word=${encodeURIComponent(q)}&tn=news&cl=2&rn=20&ct=1`)
    .join("\n");
  return instructions
    .replace("$SEARCH_URLS", searchUrls)
    .replace("$MAX_ARTICLES", String(maxArticles));
}

/** Run a news sub-agent that operates the browser to search and extract articles. */
async function searchNewsWithAgent(browser: Browser, ctx: SkillContext, prompt: string): Promise<RawArticle[]> {
  const page = await browser.newPage();
  const log = (msg: string): void => { if (ctx.log) ctx.log(msg); };
  try {
    const subAgent = new Agent({
      name: "news-browser",
      system: "你是新闻搜索助手，通过浏览器工具搜索并提取新闻，最终只返回 JSON 数组，不要其他文字。",
      llm: ctx.agent.llm,
      compressor: undefined,
      tools: createBrowserTools(page),
    });

    log(`🔍 启动新闻搜索…`);
    let finalText = "";
    for await (const event of subAgent.stream(prompt, { maxTurns: 12 })) {
      if (event.type === "tool_call") {
        const input = event.input as Record<string, unknown>;
        if (event.toolName === "browser_navigate") {
          const url = typeof input["url"] === "string" ? input["url"] : "";
          log(`🌐 访问 ${url}`);
        } else if (event.toolName === "browser_get_links") {
          log(`🔗 获取页面链接`);
        }
      } else if (event.type === "done") {
        const lastMsg = [...event.result.messages].reverse().find((m) => m.role === "assistant");
        finalText = typeof lastMsg?.content === "string" ? lastMsg.content : "";
      }
    }

    const match = finalText.match(/\[[\s\S]*\]/);
    if (!match) { log("⚠️ 未获取到有效 JSON"); return []; }
    const parsed = JSON.parse(match[0]) as unknown[];
    const articles = parsed.flatMap((item) => {
      const r = RawArticleSchema.safeParse(item);
      return r.success ? [r.data] : [];
    });
    log(`✅ 共获取 ${articles.length} 篇文章`);
    return articles;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`❌ 搜索失败：${msg}`);
    return [];
  } finally {
    await page.close();
  }
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
 * Daily digest skill — loads instructions from SKILL.md, runs a news sub-agent with
 * browser tools, renders a styled digest, screenshots it, and optionally sends to Feishu.
 *
 * Output files per run: YYYY-MM-DD.{html,md,png,json}
 */
export class DailyDigestSkill implements Skill {
  readonly id: string;
  readonly description: string;
  readonly #queries: string[];
  readonly #maxArticles: number;
  readonly #instructions: string;

  constructor() {
    const def = loadSkillDef(SKILL_DIR);
    this.id = def.id;
    this.description = def.description;
    this.#queries = def.queries;
    this.#maxArticles = def.maxArticles;
    this.#instructions = def.instructions;
  }

  async run(ctx: SkillContext): Promise<SkillResult> {
    const browser = await chromium.launch({ headless: true });
    try {
      const prompt = buildPrompt(this.#instructions, this.#queries, this.#maxArticles);
      const articles = await searchNewsWithAgent(browser, ctx, prompt);
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
