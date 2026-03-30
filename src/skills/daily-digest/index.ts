import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { z } from "zod";
import type { ConfigStorage } from "../../config/storage.js";
import type { DailyDigestConfig } from "../../config/types.js";
import { loadSkillDef } from "../loader.js";
import type { Skill, SkillContext, SkillResult } from "../types.js";

export type DigestCategory = "domestic" | "international";

interface ArticleDraft {
  title: string;
  url: string;
  summary: string;
  source: string;
  category?: string | undefined;
}

export interface DigestArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
  publishedAt?: string;
  date?: string;
  category: DigestCategory;
}

export interface DailyDigestSelection {
  domestic: DigestArticle[];
  international: DigestArticle[];
  all: DigestArticle[];
}

export interface DigestCandidateLink {
  text: string;
  href: string;
  hintCategory: DigestCategory;
  source?: string;
  summary?: string;
  publishedAt?: string;
}

interface SearchPlan {
  query: string;
  searchText: string;
  hintCategory: DigestCategory;
}

interface DigestQuota {
  domestic: number;
  international: number;
}

interface LinkHint {
  category: DigestCategory;
  publishedAt?: string;
}

const BraveNewsResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string().optional(),
  age: z.string().optional(),
  page_age: z.string().optional(),
  meta_url: z.object({
    netloc: z.string().optional(),
    hostname: z.string().optional(),
  }).optional(),
});

const BraveNewsResponseSchema = z.object({
  results: z.array(BraveNewsResultSchema).default([]),
});

const ArticleDraftSchema = z.object({
  title: z.string(),
  url: z.string(),
  summary: z.string(),
  source: z.string(),
  category: z.string().optional(),
});

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_DEF = loadSkillDef(SKILL_DIR);
const LAYOUT_CSS = readFileSync(join(SKILL_DIR, "layout.css"), "utf8");
const PAGE_TEMPLATE = readFileSync(join(SKILL_DIR, "template.html"), "utf8");
const SECTION_TEMPLATE = readFileSync(join(SKILL_DIR, "section.html"), "utf8");
const ITEM_TEMPLATE = readFileSync(join(SKILL_DIR, "item.html"), "utf8");
export const DEFAULT_DAILY_DIGEST_QUERIES = [...DEFAULT_SKILL_DEF.queries];

const CATEGORY_LABEL: Record<DigestCategory, string> = {
  domestic: "国内",
  international: "国际",
};

const QUERY_HINT_PATTERNS: Array<{ pattern: RegExp; category: DigestCategory }> = [
  { pattern: /openai|google|meta|microsoft|apple|nvidia|amazon|tesla|anthropic|xai/i, category: "international" },
  { pattern: /国际|海外|全球|硅谷|美国|欧洲|日本|韩国|印度/i, category: "international" },
  { pattern: /国内|中国|本土|本地/i, category: "domestic" },
];

const INTERNATIONAL_PATTERNS = [
  /国际|海外|全球|硅谷|美国|欧洲|欧盟|英国|日本|韩国|印度|中东|东南亚/i,
  /openai|google|meta|microsoft|apple|nvidia|amazon|tesla|anthropic|xai|softbank|openrouter/i,
  /techcrunch|the verge|reuters|bloomberg|wsj|financial times|ft|cnbc|bbc|ap news/i,
];

const DOMESTIC_PATTERNS = [
  /国内|中国|本土|国产|央行|国务院|工信部|证监会|上交所|深交所|港股|a股/i,
  /阿里|腾讯|字节|百度|京东|美团|拼多多|华为|小米|蚂蚁|比亚迪|宁德时代|商汤|科大讯飞/i,
  /36氪|钛媒体|虎嗅|澎湃|界面|第一财经|证券时报|经济观察|人民日报|新华社|央视网|财新|IT之家/i,
];

const LOW_PRIORITY_HOSTS = new Set([
  "k.sina.com.cn",
  "www.toutiao.com",
]);

const BLOCKED_ARTICLE_HOSTS = new Set([
  "10jqka.com.cn",
  "news.10jqka.com.cn",
  "stock.10jqka.com.cn",
  "t.10jqka.com.cn",
  "baijiahao.baidu.com",
  "mbd.baidu.com",
]);

const SELF_MEDIA_SOURCE_PATTERNS = [
  /百家号/i,
  /搜狐号/i,
  /网易号/i,
  /企鹅号/i,
  /头条号/i,
  /一点号/i,
  /大鱼号/i,
  /新浪看点/i,
  /东方号/i,
  /快传号/i,
  /知乎专栏/i,
];

const PREFERRED_MEDIA_SOURCE_PATTERNS = [
  /新华社|人民日报|央视网|中国新闻网|澎湃新闻|界面新闻|第一财经|财新|证券时报|经济观察报|晚点/i,
  /36氪|钛媒体|虎嗅|IT之家|雷峰网/i,
  /Reuters|路透|Bloomberg|彭博|Financial Times|FT|华尔街日报|WSJ|BBC|CNBC|The Verge|TechCrunch|AP News|美联社/i,
  /OpenAI|Anthropic|Google|Microsoft|NVIDIA|Meta|Apple|Amazon|Tesla|字节跳动|阿里巴巴|腾讯|华为/i,
];

const PREFERRED_MEDIA_HOST_PATTERNS = [
  /(^|\.)news\.cn$/i,
  /(^|\.)people\.com\.cn$/i,
  /(^|\.)chinanews\.com\.cn$/i,
  /(^|\.)thepaper\.cn$/i,
  /(^|\.)jiemian\.com$/i,
  /(^|\.)yicai\.com$/i,
  /(^|\.)caixin\.com$/i,
  /(^|\.)stcn\.com$/i,
  /(^|\.)eeo\.com\.cn$/i,
  /(^|\.)36kr\.com$/i,
  /(^|\.)tmtpost\.com$/i,
  /(^|\.)huxiu\.com$/i,
  /(^|\.)ithome\.com$/i,
  /(^|\.)leiphone\.com$/i,
  /(^|\.)reuters\.com$/i,
  /(^|\.)bloomberg\.com$/i,
  /(^|\.)ft\.com$/i,
  /(^|\.)wsj\.com$/i,
  /(^|\.)bbc\.com$/i,
  /(^|\.)cnbc\.com$/i,
  /(^|\.)theverge\.com$/i,
  /(^|\.)techcrunch\.com$/i,
  /(^|\.)apnews\.com$/i,
  /(^|\.)openai\.com$/i,
  /(^|\.)anthropic\.com$/i,
  /(^|\.)googleblog\.com$/i,
  /(^|\.)blog\.google$/i,
  /(^|\.)microsoft\.com$/i,
  /(^|\.)nvidia\.com$/i,
  /(^|\.)about\.fb\.com$/i,
  /(^|\.)meta\.com$/i,
  /(^|\.)apple\.com$/i,
  /(^|\.)amazon\.science$/i,
  /(^|\.)aws\.amazon\.com$/i,
];

const DAILY_DECK_LINES = [
  "先看事实，再下判断。",
  "把噪音滤掉，趋势才会显形。",
  "信息越多，越要保持克制。",
  "读新闻不是囤信息，而是训练判断。",
  "在变化里找脉络，在细节里看方向。",
  "真正重要的，不是更快，而是更准。",
] as const;

export const DAILY_DIGEST_SCREENSHOT = {
  width: 1080,
  height: 1400,
  deviceScaleFactor: 4,
} as const;

const BRAVE_NEWS_SEARCH_ENDPOINT = process.env["BRAVE_SEARCH_API_URL"] ?? "https://api.search.brave.com/res/v1/news/search";
const BRAVE_NEWS_SEARCH_COUNT = 20;

const EXTRACTION_SYSTEM = [
  "你是一个严谨的科技新闻筛选器。",
  "你的任务是从候选链接中挑出真实新闻文章，并返回严格 JSON 数组。",
  "不要聊天，不要解释，不要使用 markdown，除了 JSON 数组不要输出任何别的内容。",
  "只保留新闻文章页，排除搜索页、导航页、专题页、广告页、下载页和纯视频页。",
  "优先原创媒体、主流媒体、官网和权威发布。",
  "不要返回百家号、搜狐号、网易号、企鹅号、头条号、一点号、大鱼号等自媒体或聚合号内容。",
  "如果同一事件同时有主流媒体、公司官网和自媒体版本，只保留主流媒体或官网版本。",
  "category 只允许 domestic 或 international。",
  "domestic 表示中国公司、政策、市场、机构或中国互联网/创投动态为主。",
  "international 表示海外公司、政策、市场、机构或全球科技/创投动态为主。",
  "如果字符串里出现双引号，必须转义。",
].join("\n");

async function searchNewsWithBrave(
  ctx: SkillContext,
  queries: string[],
  maxCandidates: number,
  quota: DigestQuota,
  referenceDate: string,
  braveSearchApiKey: string | undefined,
): Promise<DigestArticle[]> {
  const log = (msg: string): void => { if (ctx.log) ctx.log(msg); };
  const allLinks: DigestCandidateLink[] = [];
  const searchPlans = buildDailyDigestSearchPlans(queries);
  const apiKey = getBraveSearchApiKey(braveSearchApiKey);
  log(`🧭 使用 Brave Search API 搜索主题 ${queries.length} 个，扩展为 ${searchPlans.length} 条搜索请求`);
  for (const plan of searchPlans) {
    log(`🌐 Brave 搜索: ${plan.searchText}（${CATEGORY_LABEL[plan.hintCategory]}，源主题 ${plan.query}）`);
    const response = await fetchBraveNewsResponse(plan.searchText, apiKey, maxCandidates);
    const links = parseBraveNewsSearchResponse(response, plan.hintCategory);
    log(`🔗 获取 ${links.length} 个候选结果`);
    allLinks.push(...links);
  }

  const uniqueLinks = dedupeLinks(allLinks);
  const filteredLinks = uniqueLinks.filter((link) => !isBlockedLink(link));
  const blockedCount = uniqueLinks.length - filteredLinks.length;
  if (blockedCount > 0) {
    log(`🚫 过滤 ${blockedCount} 个自媒体 / 黑名单链接`);
  }

  if (filteredLinks.length === 0) {
    log("⚠️ 未获取到任何链接");
    return [];
  }

  const domesticLinks = filteredLinks.filter((link) => link.hintCategory === "domestic");
  const internationalLinks = filteredLinks.filter((link) => link.hintCategory === "international");

  const domesticArticles = await extractArticlesFromLinks(
    ctx,
    domesticLinks,
    "domestic",
    getExtractionLimit("domestic", quota, maxCandidates),
    referenceDate,
  );
  const internationalArticles = await extractArticlesFromLinks(
    ctx,
    internationalLinks,
    "international",
    getExtractionLimit("international", quota, maxCandidates),
    referenceDate,
  );

  const articles = dedupeArticles([...domesticArticles, ...internationalArticles]);

  const domesticCount = articles.filter((article) => article.category === "domestic").length;
  const internationalCount = articles.length - domesticCount;
  log(`✅ 筛选出 ${articles.length} 篇文章（国内 ${domesticCount} / 国际 ${internationalCount}）`);
  return articles;
}

/** Render articles as a styled HTML news digest page. */
export function renderDailyDigestHtml(selection: DailyDigestSelection, date: string): string {
  return fillTemplate(PAGE_TEMPLATE, {
    LAYOUT_CSS,
    DATE_LABEL: escapeHtml(formatIsoDate(date)),
    VOL_LABEL: String(Math.max(selection.all.length, 1)).padStart(2, "0"),
    DECK_TEXT: escapeHtml(pickDeckText(date)),
    SUMMARY_TEXT: escapeHtml(buildSummaryText(selection)),
    DOMESTIC_SECTION: renderSection("domestic", selection.domestic, 1),
    INTERNATIONAL_SECTION: renderSection("international", selection.international, selection.domestic.length + 1),
  });
}

/** Render articles as a Markdown digest. */
function renderMarkdown(selection: DailyDigestSelection, date: string): string {
  const domesticRows = renderMarkdownSection(selection.domestic, 1);
  const internationalRows = renderMarkdownSection(selection.international, selection.domestic.length + 1);
  const summary = buildSummaryText(selection);
  return [
    "# AI x 教育日报",
    "",
    `**${date}**`,
    "",
    `> ${summary}`,
    `> 回复数字获取对应新闻原文链接，例如回复“3”。`,
    "",
    `## 国内（${selection.domestic.length}）`,
    "",
    domesticRows,
    "",
    `## 国际（${selection.international.length}）`,
    "",
    internationalRows,
    "",
  ].join("\n");
}

/** Take a screenshot of HTML content. Returns a PNG buffer. */
async function screenshotHtml(browser: Browser, html: string): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: {
      width: DAILY_DIGEST_SCREENSHOT.width,
      height: DAILY_DIGEST_SCREENSHOT.height,
    },
    deviceScaleFactor: DAILY_DIGEST_SCREENSHOT.deviceScaleFactor,
  });
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    const height = await page.evaluate(() => (globalThis as unknown as { document: { body: { scrollHeight: number } } }).document.body.scrollHeight);
    await page.setViewportSize({
      width: DAILY_DIGEST_SCREENSHOT.width,
      height: Math.max(DAILY_DIGEST_SCREENSHOT.height, height + 80),
    });
    const buffer = await page.screenshot({ fullPage: true, scale: "device" });
    return Buffer.from(buffer);
  } finally {
    await context.close();
  }
}

/**
 * Daily digest skill — fetches Brave News candidates, then makes targeted LLM
 * calls to filter and structure results. Renders a templated HTML digest,
 * screenshots it, and saves all output files.
 *
 * Output files per run: YYYY-MM-DD.{html,md,png,json}
 */
interface DailyDigestSkillOptions {
  configStorage?: ConfigStorage<DailyDigestConfig>;
}

export class DailyDigestSkill implements Skill {
  readonly id: string;
  readonly description: string;
  readonly #defaultQueries: string[];
  readonly #maxCandidates: number;
  readonly #quota: DigestQuota;
  readonly #configStorage: ConfigStorage<DailyDigestConfig> | undefined;

  constructor(options: DailyDigestSkillOptions = {}) {
    const def = DEFAULT_SKILL_DEF;
    this.id = def.id;
    this.description = def.description;
    this.#defaultQueries = def.queries;
    this.#maxCandidates = def.maxCandidates;
    this.#quota = {
      domestic: def.domesticArticles,
      international: def.internationalArticles,
    };
    this.#configStorage = options.configStorage;
  }

  async run(ctx: SkillContext): Promise<SkillResult> {
    const config = this.#configStorage?.read();
    const queries = resolveDailyDigestQueries(config?.queries, this.#defaultQueries);
    ctx.log?.(`🧭 使用 ${queries.length} 个搜索主题`);
    const dateKey = new Date().toLocaleDateString("sv-SE");
    const articles = await searchNewsWithBrave(
      ctx,
      queries,
      this.#maxCandidates,
      this.#quota,
      dateKey,
      config?.braveSearchApiKey,
    );
    const selection = selectDigestArticles(articles, this.#quota);
    ctx.log?.(`📊 最终入选 ${selection.all.length} 篇文章（国内 ${selection.domestic.length} / 国际 ${selection.international.length}）`);
    if (selection.domestic.length < this.#quota.domestic || selection.international.length < this.#quota.international) {
      ctx.log?.(`⚠️ 分类配额未完全满足，目标为国内 ${this.#quota.domestic} / 国际 ${this.#quota.international}`);
    }

    const dateLabel = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    const browser = await chromium.launch({ headless: true });
    try {
      const html = renderDailyDigestHtml(selection, dateLabel);
      const imageBuffer = await screenshotHtml(browser, html);

      const dataDirPath = ctx.dataDir ?? "";
      if (dataDirPath) {
        writeFileSync(join(dataDirPath, `${dateKey}.html`), html, "utf8");
        writeFileSync(join(dataDirPath, `${dateKey}.md`), renderMarkdown(selection, dateLabel), "utf8");
        writeFileSync(join(dataDirPath, `${dateKey}.png`), imageBuffer);
        writeFileSync(join(dataDirPath, `${dateKey}.json`), JSON.stringify(selection.all, null, 2), "utf8");
        ctx.log?.(`💾 文件已保存到 ${dataDirPath}`);
        return { outputPath: join(dataDirPath, `${dateKey}.png`) };
      }
      return {};
    } finally {
      await browser.close();
    }
  }
}

export function parseArticlesFromLLMOutput(
  content: unknown,
  urlHints: ReadonlyMap<string, LinkHint> = new Map(),
  referenceDate?: string,
): DigestArticle[] | undefined {
  const text = extractText(content);
  const jsonText = extractJsonArray(text);
  if (!jsonText) return undefined;

  const drafts = parseArticleDrafts(jsonText);
  if (!drafts) return undefined;

  const articles = validateArticles(drafts, urlHints, referenceDate);
  return articles.length > 0 ? dedupeArticles(articles) : undefined;
}

export function selectDigestArticles(
  articles: DigestArticle[],
  quota: DigestQuota,
): DailyDigestSelection {
  const ranked = rankArticles(articles.filter((article) => !isBlockedArticle(article)));
  const domestic = pickArticlesByCategory(ranked, "domestic", quota.domestic);
  const used = new Set(domestic.map((article) => canonicalizeUrl(article.url)));
  const international = ranked
    .filter((article) => article.category === "international")
    .filter((article) => !used.has(canonicalizeUrl(article.url)))
    .slice(0, quota.international);

  return {
    domestic,
    international,
    all: [...domestic, ...international],
  };
}

export function resolveDailyDigestQueries(
  configured: string[] | undefined,
  fallback: string[] = DEFAULT_DAILY_DIGEST_QUERIES,
): string[] {
  const normalized = normalizeQueryList(configured);
  return normalized.length > 0 ? normalized : normalizeQueryList(fallback);
}

export function buildDailyDigestSearchPlans(queries: string[]): Array<{
  query: string;
  searchText: string;
  hintCategory: DigestCategory;
}> {
  const seen = new Set<string>();
  const plans: SearchPlan[] = [];
  for (const query of queries) {
    for (const plan of buildSearchPlansForQuery(query)) {
      const key = `${plan.hintCategory}:${plan.searchText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plans.push(plan);
    }
  }
  return plans;
}

function buildSearchPlansForQuery(query: string): SearchPlan[] {
  const scope = classifyQueryScope(query);
  if (scope === "domestic" || scope === "international") {
    return [{ query, searchText: query, hintCategory: scope }];
  }
  return [
    { query, searchText: scopeQuery(query, "domestic"), hintCategory: "domestic" },
    { query, searchText: scopeQuery(query, "international"), hintCategory: "international" },
  ];
}

function classifyQueryScope(query: string): DigestCategory | "neutral" {
  const match = QUERY_HINT_PATTERNS.find((item) => item.pattern.test(query));
  return match?.category ?? "neutral";
}

function scopeQuery(query: string, category: DigestCategory): string {
  const prefix = category === "domestic" ? "国内" : "国际";
  return `${prefix}${query}`.trim();
}

async function extractArticlesFromLinks(
  ctx: SkillContext,
  links: DigestCandidateLink[],
  category: DigestCategory,
  maxCandidates: number,
  referenceDate: string,
): Promise<DigestArticle[]> {
  const log = (msg: string): void => { if (ctx.log) ctx.log(msg); };
  if (links.length === 0) {
    log(`⚠️ ${CATEGORY_LABEL[category]}候选为空`);
    return [];
  }

  log(`📊 ${CATEGORY_LABEL[category]}候选 ${links.length} 个链接，调用 LLM 筛选…`);
  const linkText = links
    .slice(0, 180)
    .map((link) => formatCandidateLine(link))
    .join("\n");

  const prompt = `以下是${CATEGORY_LABEL[category]}科技新闻候选链接列表（格式：标题 | URL | 来源 | 时间 | 摘要）：

${linkText}

请只筛选出真正属于${CATEGORY_LABEL[category]}科技、创投或互联网动态的新闻正文页，满足这些要求：
- 只保留新闻正文页，不要搜索结果、专题页、导航链接、下载页、广告页
- 优先原创媒体、主流媒体、公司官网和权威发布
- 不要百家号、搜狐号、网易号、企鹅号、头条号、一点号、大鱼号等自媒体或聚合号内容
- 如果同一事件既有主流媒体 / 官网版本，也有自媒体版本，只保留前者
- 尽量覆盖不同主题，避免同题反复
- summary 尽量用一句中文短句概括；如果从标题无法可靠概括，可留空字符串
- category 固定返回 ${category}

最多返回 ${maxCandidates} 篇，按质量、相关性和时效性排序。

只返回 JSON 数组，不要其他文字：
[{"title":"文章标题","url":"文章完整URL","summary":"一句话摘要","source":"来源媒体","category":"${category}"}]`;

  const response = await ctx.agent.llm.complete({
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const text = extractText(response.message.content);
  const jsonText = extractJsonArray(text);
  if (!jsonText) {
    log(`⚠️ ${CATEGORY_LABEL[category]} LLM 未返回有效 JSON`);
    if (text) log(`🪵 ${CATEGORY_LABEL[category]} LLM 原始输出: ${text.slice(0, 200)}`);
    return [];
  }

  const parsed = parseArticlesFromLLMOutput(response.message.content, buildLinkHintMap(links), referenceDate);
  if (!parsed) {
    log(`⚠️ ${CATEGORY_LABEL[category]} JSON 解析失败`);
    log(`🪵 ${CATEGORY_LABEL[category]} LLM 原始输出: ${text.slice(0, 200)}`);
    return [];
  }

  return parsed.map((article) => ({ ...article, category }));
}

function dedupeLinks(links: DigestCandidateLink[]): DigestCandidateLink[] {
  const byUrl = new Map<string, DigestCandidateLink>();
  for (const link of links) {
    const key = canonicalizeUrl(link.href);
    if (!byUrl.has(key)) {
      byUrl.set(key, link);
      continue;
    }
    const previous = byUrl.get(key);
    if (!previous) continue;
    byUrl.set(key, mergeLinkItems(previous, link));
  }
  return [...byUrl.values()];
}

function mergeLinkItems(previous: DigestCandidateLink, next: DigestCandidateLink): DigestCandidateLink {
  return {
    ...previous,
    ...(previous.hintCategory === "domestic" && next.hintCategory === "international"
      ? { hintCategory: next.hintCategory }
      : {}),
    ...(!previous.source && next.source ? { source: next.source } : {}),
    ...(!previous.summary && next.summary ? { summary: next.summary } : {}),
    ...(!previous.publishedAt && next.publishedAt ? { publishedAt: next.publishedAt } : {}),
  };
}

function buildLinkHintMap(links: DigestCandidateLink[]): ReadonlyMap<string, LinkHint> {
  const hints = new Map<string, LinkHint>();
  for (const link of links) {
    const hint: LinkHint = {
      category: link.hintCategory,
      ...(link.publishedAt ? { publishedAt: link.publishedAt } : {}),
    };
    hints.set(link.href, hint);
    hints.set(canonicalizeUrl(link.href), hint);
  }
  return hints;
}

function getExtractionLimit(
  category: DigestCategory,
  quota: DigestQuota,
  maxCandidates: number,
): number {
  const target = category === "domestic" ? quota.domestic : quota.international;
  const suggested = category === "domestic"
    ? Math.max(target * 2, target + 4)
    : Math.max(target * 3, target + 6);
  return Math.min(maxCandidates, suggested);
}

function normalizeQueryList(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function parseArticleDrafts(text: string): ArticleDraft[] | undefined {
  try {
    return JSON.parse(text) as ArticleDraft[];
  } catch {
    const repaired = parseArticleDraftsLoosely(text);
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

function validateArticles(
  items: ArticleDraft[],
  urlHints: ReadonlyMap<string, LinkHint>,
  referenceDate?: string,
): DigestArticle[] {
  return items.flatMap((item) => {
    const result = ArticleDraftSchema.safeParse(item);
    if (!result.success) return [];
    const article = normalizeArticle(result.data, urlHints, referenceDate);
    return isBlockedArticle(article) ? [] : [article];
  });
}

function normalizeArticle(
  article: ArticleDraft,
  urlHints: ReadonlyMap<string, LinkHint>,
  referenceDate?: string,
): DigestArticle {
  const hint = urlHints.get(article.url) ?? urlHints.get(canonicalizeUrl(article.url));
  const publishedAt = hint?.publishedAt;
  const date = resolveDigestArticleDate(publishedAt, referenceDate);
  return {
    title: article.title.trim(),
    url: article.url.trim(),
    summary: article.summary.trim(),
    source: article.source.trim(),
    ...(publishedAt ? { publishedAt } : {}),
    ...(date ? { date } : {}),
    category: normalizeCategory(article, urlHints),
  };
}

function normalizeCategory(
  article: ArticleDraft,
  urlHints: ReadonlyMap<string, LinkHint>,
): DigestCategory {
  const normalized = normalizeCategoryValue(article.category);
  if (normalized) return normalized;

  const inferred = inferCategoryFromArticle(article);
  if (inferred) return inferred;

  const hint = urlHints.get(article.url) ?? urlHints.get(canonicalizeUrl(article.url));
  if (hint) return hint.category;

  return "domestic";
}

function normalizeCategoryValue(value: string | undefined): DigestCategory | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "domestic" || normalized === "国内") return "domestic";
  if (normalized === "international" || normalized === "国际") return "international";
  return undefined;
}

function inferCategoryFromArticle(article: ArticleDraft): DigestCategory | undefined {
  const haystack = `${article.title} ${article.source} ${article.url}`.toLowerCase();
  if (INTERNATIONAL_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return "international";
  }
  if (DOMESTIC_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return "domestic";
  }
  try {
    const hostname = new URL(article.url).hostname.toLowerCase();
    if (hostname.endsWith(".cn")) return "domestic";
    if (!/baidu\.com$/i.test(hostname)) return "international";
  } catch {
    // fall through
  }
  return undefined;
}

function parseArticleDraftsLoosely(text: string): ArticleDraft[] {
  const objects = text.match(/\{[\s\S]*?\}/g) ?? [];
  return objects.flatMap((objectText) => {
    const draft: ArticleDraft = {
      title: extractLooseField(objectText, "title", "url"),
      url: extractLooseField(objectText, "url", "summary"),
      summary: extractLooseField(objectText, "summary", "source"),
      source: extractLooseField(objectText, "source", "category"),
      category: extractLooseLastField(objectText, "category"),
    };
    const result = ArticleDraftSchema.safeParse(draft);
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

function dedupeArticles(articles: DigestArticle[]): DigestArticle[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = canonicalizeUrl(article.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankArticles(articles: DigestArticle[]): DigestArticle[] {
  return articles
    .map((article, index) => ({ article, index, score: scoreArticle(article) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.article);
}

function isBlockedArticle(article: DigestArticle): boolean {
  if (article.source.includes("同花顺") || isSelfMediaSource(article.source)) return true;
  const hostname = getHostname(article.url);
  return hostname ? isBlockedHostname(hostname) : false;
}

function scoreArticle(article: DigestArticle): number {
  let score = 0;
  if (article.summary.trim()) score += 1;
  if (article.source.trim()) score += 1;
  const hostname = getHostname(article.url);
  if (hostname && !LOW_PRIORITY_HOSTS.has(hostname)) score += 2;
  if (hostname?.endsWith(".cn")) score += article.category === "domestic" ? 1 : 0;
  if (hostname && !hostname.endsWith(".cn")) score += article.category === "international" ? 1 : 0;
  if (hostname && isPreferredMediaHost(hostname)) score += 3;
  if (isPreferredMediaSource(article.source)) score += 2;
  if (isSelfMediaSource(article.source)) score -= 4;
  return score;
}

function pickArticlesByCategory(
  articles: DigestArticle[],
  category: DigestCategory,
  limit: number,
): DigestArticle[] {
  return articles.filter((article) => article.category === category).slice(0, limit);
}

function renderSection(category: DigestCategory, articles: DigestArticle[], startIndex: number): string {
  const items = articles.length > 0
    ? articles.map((article, index) => renderItem(article, startIndex + index)).join("\n")
    : `<div class="empty-state">暂无符合条件的${CATEGORY_LABEL[category]}内容</div>`;

  return fillTemplate(SECTION_TEMPLATE, {
    SECTION_KEY: category,
    SECTION_EYEBROW: category === "domestic" ? "国内主线" : "国际主线",
    SECTION_TITLE: category === "domestic" ? "国内科技" : "国际科技",
    SECTION_COUNT: String(articles.length).padStart(2, "0"),
    SECTION_ITEMS: items,
  });
}

function renderItem(article: DigestArticle, index: number): string {
  const summaryBlock = article.summary
    ? `<p class="summary">${escapeHtml(article.summary)}</p>`
    : "";
  const publishedAtBlock = article.publishedAt
    ? `<span class="published-at">${escapeHtml(article.publishedAt)}</span>`
    : "";

  return fillTemplate(ITEM_TEMPLATE, {
    INDEX: String(index).padStart(2, "0"),
    URL: escapeHtml(article.url),
    TITLE: escapeHtml(article.title),
    SUMMARY_BLOCK: summaryBlock,
    SOURCE: escapeHtml(article.source || "未知来源"),
    PUBLISHED_AT_BLOCK: publishedAtBlock,
  });
}

function renderMarkdownSection(articles: DigestArticle[], startIndex: number): string {
  if (articles.length === 0) return "_暂无符合条件的内容_";
  return articles
    .map((article, index) => {
      const lines = [
        `${startIndex + index}. **[${article.title}](${article.url})**`,
        article.summary ? `   ${article.summary}` : "",
        `   _${article.source}${article.publishedAt ? ` · ${article.publishedAt}` : ""}_`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildSummaryText(selection: DailyDigestSelection): string {
  if (selection.all.length === 0) {
    return "今日检索已完成，但暂未筛出可展示的文章。建议调整关键词或稍后重跑。";
  }

  const parts = [
    buildCategorySummary("国内焦点集中在", selection.domestic),
    buildCategorySummary("国际方面重点关注", selection.international),
  ].filter(Boolean);
  return parts.join(" ");
}

function buildCategorySummary(prefix: string, articles: DigestArticle[]): string {
  const highlights = pickHighlights(articles, 2);
  if (highlights.length === 0) return "";
  return `${prefix}${highlights.join("；")}。`;
}

function pickHighlights(articles: DigestArticle[], limit: number): string[] {
  const seen = new Set<string>();
  const highlights: string[] = [];
  for (const article of articles) {
    const snippet = buildHighlightSnippet(article);
    if (!snippet || seen.has(snippet)) continue;
    highlights.push(snippet);
    seen.add(snippet);
    if (highlights.length >= limit) break;
  }
  return highlights;
}

function buildHighlightSnippet(article: DigestArticle): string {
  return normalizeHighlight(article.summary) || normalizeHighlight(article.title);
}

function normalizeHighlight(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const sentence = compact.split(/[。！？!?]/)[0]?.trim() ?? compact;
  return truncateText(sentence.replace(/^[，、；：:]+|[，、；：:]+$/g, ""), 34);
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(limit - 1, 1)).trimEnd()}…`;
}

function pickDeckText(date: string): string {
  const seed = [...date.replace(/\D/g, "")]
    .reduce((total, digit) => total + Number(digit), 0);
  return DAILY_DECK_LINES[seed % DAILY_DECK_LINES.length] ?? DAILY_DECK_LINES[0];
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => values[key] ?? "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveDigestArticleDate(
  publishedAt: string | undefined,
  referenceDate: string | undefined,
): string | undefined {
  if (!publishedAt || !referenceDate) return undefined;
  const normalized = publishedAt.replace(/\s+/g, " ").trim();

  const fullCn = normalized.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (fullCn) {
    const [, year, month, day] = fullCn;
    if (year && month && day) return formatDateKey(year, month, day);
  }

  const fullNumeric = normalized.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (fullNumeric) {
    const [, year, month, day] = fullNumeric;
    if (year && month && day) return formatDateKey(year, month, day);
  }

  const monthDay = normalized.match(/^(\d{1,2})月(\d{1,2})日/);
  if (monthDay) {
    const [, month, day] = monthDay;
    if (month && day) return formatDateKey(referenceDate.slice(0, 4), month, day);
  }

  if (/^(今天)\b|^今天/.test(normalized) || /^\d+\s*(分钟前|小时前)$/.test(normalized)) {
    return referenceDate;
  }
  if (/^(昨日|昨天)/.test(normalized)) return shiftDateKey(referenceDate, -1);
  if (/^前天/.test(normalized)) return shiftDateKey(referenceDate, -2);

  return undefined;
}

function isBlockedLink(link: DigestCandidateLink): boolean {
  const hostname = getHostname(link.href);
  return hostname ? isBlockedHostname(hostname) : false;
}

function formatCandidateLine(link: DigestCandidateLink): string {
  const fields = [
    link.text,
    link.href,
    link.source ? `来源: ${link.source}` : "",
    link.publishedAt ? `时间: ${link.publishedAt}` : "",
    link.summary ? `摘要: ${truncateText(link.summary, 96)}` : "",
  ].filter(Boolean);
  return fields.join(" | ");
}

function getBraveSearchApiKey(configuredKey: string | undefined): string {
  const apiKey = configuredKey?.trim() || process.env["BRAVE_SEARCH_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY is required for daily-digest");
  }
  return apiKey;
}

async function fetchBraveNewsResponse(query: string, apiKey: string, maxCandidates: number): Promise<unknown> {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(maxCandidates, BRAVE_NEWS_SEARCH_COUNT)),
    spellcheck: "0",
  });
  const response = await fetch(`${BRAVE_NEWS_SEARCH_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brave Search API ${response.status}: ${body.slice(0, 240)}`);
  }
  return response.json() as Promise<unknown>;
}

export function parseBraveNewsSearchResponse(
  payload: unknown,
  hintCategory: DigestCategory,
): DigestCandidateLink[] {
  const parsed = BraveNewsResponseSchema.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.results.flatMap((result) => {
    const href = result.url.trim();
    const text = result.title.trim();
    if (!href.startsWith("http") || text.length === 0) return [];
    const source = normalizeBraveSource(result.meta_url?.netloc, result.meta_url?.hostname, href);
    const summary = result.description?.trim() ?? "";
    const publishedAt = normalizeBravePublishedAt(result.page_age, result.age);
    return [{
      text,
      href,
      hintCategory,
      ...(source ? { source } : {}),
      ...(summary ? { summary } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    }];
  });
}

function normalizeBraveSource(netloc: string | undefined, hostname: string | undefined, href: string): string | undefined {
  const preferred = netloc?.trim() || hostname?.trim();
  if (preferred) return preferred;
  return getHostname(href);
}

function normalizeBravePublishedAt(pageAge: string | undefined, age: string | undefined): string | undefined {
  const absolute = formatBraveAbsoluteTime(pageAge);
  if (absolute) return absolute;
  return humanizeBraveAge(age);
}

function formatBraveAbsoluteTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date).replace(",", "");
}

function humanizeBraveAge(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return value.trim();
  const [, amount, unit] = match;
  const labels: Record<string, string> = {
    s: "秒前",
    sec: "秒前",
    second: "秒前",
    seconds: "秒前",
    m: "分钟前",
    min: "分钟前",
    mins: "分钟前",
    minute: "分钟前",
    minutes: "分钟前",
    h: "小时前",
    hr: "小时前",
    hrs: "小时前",
    hour: "小时前",
    hours: "小时前",
    d: "天前",
    day: "天前",
    days: "天前",
    w: "周前",
    wk: "周前",
    week: "周前",
    weeks: "周前",
    mo: "个月前",
    mon: "个月前",
    month: "个月前",
    months: "个月前",
    y: "年前",
    yr: "年前",
    year: "年前",
    years: "年前",
  };
  if (!amount || !unit) return value.trim();
  const label = labels[unit.toLowerCase()];
  return label ? `${amount}${label}` : value.trim();
}

function isBlockedHostname(hostname: string): boolean {
  return hostname === "10jqka.com.cn"
    || hostname.endsWith(".10jqka.com.cn")
    || BLOCKED_ARTICLE_HOSTS.has(hostname);
}

function isSelfMediaSource(source: string): boolean {
  return SELF_MEDIA_SOURCE_PATTERNS.some((pattern) => pattern.test(source));
}

function isPreferredMediaSource(source: string): boolean {
  return PREFERRED_MEDIA_SOURCE_PATTERNS.some((pattern) => pattern.test(source));
}

function isPreferredMediaHost(hostname: string): boolean {
  return PREFERRED_MEDIA_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function getHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "spm", "wfr", "for"]) {
      url.searchParams.delete(param);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function shiftDateKey(referenceDate: string, days: number): string | undefined {
  const match = referenceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1),
    String(date.getUTCDate()),
  );
}

function formatDateKey(year: string, month: string, day: string): string {
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatIsoDate(date: string): string {
  const match = date.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (!match) return date;
  const [, year, month, day] = match;
  return `${year}.${month?.padStart(2, "0")}.${day?.padStart(2, "0")}`;
}
