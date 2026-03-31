import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { z } from "zod";
import { mergeBraveSearchConfig } from "../../config/daily-digest.js";
import type { ConfigStorage } from "../../config/storage.js";
import type { BraveSearchConfig, DailyDigestConfig } from "../../config/types.js";
import { loadSkillDef } from "../loader.js";
import type { Skill, SkillContext, SkillResult } from "../types.js";
import {
  buildDailyDigestRunRequestParams,
  createDailyDigestRunRecord,
  persistDailyDigestRunRecord,
  type DailyDigestRunExtractionRecord,
  type DailyDigestRunRecord,
  type DailyDigestRunRequestRecord,
} from "./run-record.js";

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

/**
 * Mutable display fields used when normalizing digest output language.
 */
export interface DigestDisplayLanguageItem {
  index: number;
  title: string;
  summary: string;
  source: string;
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

const DigestDisplayLanguageItemSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string(),
  summary: z.string(),
  source: z.string(),
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

const TRADITIONAL_CHINESE_INDICATOR_PATTERN = /[專學體與為這來們會後從開關於發佈業產網點臺灣聯報經濟應數據醫門戶話讓還選觀讀寫實軟電腦雲處裡廣務測證遠際權聲標圖錄頁覽優勢機構續線層級國資訊華號]/u;

const TRADITIONAL_CHINESE_MEDIA_HOST_PATTERNS = [
  /(^|\.)storm\.mg$/i,
  /(^|\.)udn\.com$/i,
  /(^|\.)ettoday\.net$/i,
  /(^|\.)hk01\.com$/i,
  /(^|\.)mingpao\.com$/i,
  /(^|\.)hket\.com$/i,
  /(^|\.)stheadline\.com$/i,
  /(^|\.)cna\.com\.tw$/i,
  /(^|\.)ltn\.com\.tw$/i,
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
const DAILY_DIGEST_FOCUS = "教育 / 教育科技 / AI 教育 / 教育公司";
const DAILY_DIGEST_LANGUAGE_NORMALIZATION_BATCH_SIZE = 8;

export const DAILY_DIGEST_EXTRACTION_SYSTEM = [
  "你是一个严谨的教育科技新闻筛选器。",
  "你的任务是从候选链接中挑出真实新闻文章，并返回严格 JSON 数组。",
  "不要聊天，不要解释，不要使用 markdown，除了 JSON 数组不要输出任何别的内容。",
  "只保留新闻文章页，排除搜索页、导航页、专题页、广告页、下载页和纯视频页。",
  `优先保留 ${DAILY_DIGEST_FOCUS}、教育平台、教育政策、教育产品相关内容，同时保留与教育场景强相关的科技、创投和互联网动态。`,
  "优先原创媒体、主流媒体、官网和权威发布。",
  "不要返回百家号、搜狐号、网易号、企鹅号、头条号、一点号、大鱼号等自媒体或聚合号内容。",
  "如果同一事件同时有主流媒体、公司官网和自媒体版本，只保留主流媒体或官网版本。",
  "category 只允许 domestic 或 international。",
  "domestic 表示中国教育、教育科技、AI 教育、教育公司、教育政策、教育平台，或与中国教育场景强相关的科技/创投动态为主。",
  "international 表示海外教育、教育科技、AI 教育、教育公司、教育政策、教育平台，或与全球教育场景强相关的科技/创投动态为主。",
  "返回结果里的 title / summary / source 最终只允许简体中文或英文。",
  "如果原文是繁体中文，必须转换成简体中文；如果原文是中文和英文之外的其他语言，必须翻译成简体中文后再返回。",
  "如果字符串里出现双引号，必须转义。",
].join("\n");

const DAILY_DIGEST_LANGUAGE_NORMALIZATION_SYSTEM = [
  "你是一个日报展示语言规范器。",
  "你的任务是把新闻条目的 title、summary、source 规范成只包含简体中文或英文的展示文本。",
  "如果字段已经是英文，可保留英文。",
  "如果字段是繁体中文，必须转换成简体中文。",
  "如果字段是中文和英文之外的其他语言，必须翻译成简体中文。",
  "source 优先使用常见简体中文译名；若没有公认中文译名，可保留英文名。",
  "不要改写事实，不要扩写，不要新增字段。",
  "返回与输入相同数量、相同 index 的 JSON 数组。",
  "不要输出 JSON 数组之外的任何内容。",
].join("\n");

async function searchNewsWithBrave(
  ctx: SkillContext,
  queries: string[],
  maxCandidates: number,
  quota: DigestQuota,
  referenceDate: string,
  braveSearchApiKey: string | undefined,
  braveSearchConfig: BraveSearchConfig | undefined,
  runRecord?: DailyDigestRunRecord,
): Promise<DigestArticle[]> {
  const log = (msg: string): void => { if (ctx.log) ctx.log(msg); };
  const allLinks: DigestCandidateLink[] = [];
  const searchPlans = buildDailyDigestSearchPlans(queries);
  const apiKey = getBraveSearchApiKey(braveSearchApiKey);
  const searchConfig = mergeBraveSearchConfig(braveSearchConfig);
  const freshnessLabel = searchConfig.request.freshness || "不限";
  log(`🧭 使用 Brave Search API 搜索主题 ${queries.length} 个，扩展为 ${searchPlans.length} 条搜索请求（freshness=${freshnessLabel}）`);
  for (const plan of searchPlans) {
    log(`🌐 Brave 搜索: ${plan.searchText}（${CATEGORY_LABEL[plan.hintCategory]}，源主题 ${plan.query}）`);
    const requestUrl = buildBraveNewsSearchUrl(plan.searchText, maxCandidates, plan.hintCategory, searchConfig);
    const requestRecord: DailyDigestRunRequestRecord = {
      query: plan.query,
      searchText: plan.searchText,
      hintCategory: plan.hintCategory,
      startedAt: new Date().toISOString(),
      requestUrl,
      request: buildDailyDigestRunRequestParams(requestUrl, maxCandidates),
      responseResultCount: 0,
      parsedLinks: [],
    };
    try {
      const response = await fetchBraveNewsResponse(requestUrl, apiKey);
      requestRecord.response = response;
      requestRecord.responseResultCount = countBraveNewsResults(response);
      const links = parseBraveNewsSearchResponse(response, plan.hintCategory);
      requestRecord.parsedLinks = links.map((link) => ({ ...link }));
      requestRecord.finishedAt = new Date().toISOString();
      runRecord?.searchRequests.push(requestRecord);
      log(`🔗 获取 ${links.length} 个候选结果`);
      allLinks.push(...links);
    } catch (error) {
      requestRecord.finishedAt = new Date().toISOString();
      requestRecord.error = error instanceof Error ? error.message : String(error);
      runRecord?.searchRequests.push(requestRecord);
      throw error;
    }
  }

  if (runRecord) {
    runRecord.counts.rawLinkCount = allLinks.length;
  }

  const uniqueLinks = dedupeLinks(allLinks);
  const filteredLinks = uniqueLinks.filter((link) => !isBlockedLink(link));
  const blockedCount = uniqueLinks.length - filteredLinks.length;
  if (runRecord) {
    runRecord.counts.uniqueLinkCount = uniqueLinks.length;
    runRecord.counts.filteredLinkCount = filteredLinks.length;
    runRecord.counts.blockedLinkCount = blockedCount;
  }
  if (blockedCount > 0) {
    log(`🚫 过滤 ${blockedCount} 个自媒体 / 黑名单链接`);
  }

  if (filteredLinks.length === 0) {
    log("⚠️ 未获取到任何链接");
    return [];
  }

  const domesticLinks = filteredLinks.filter((link) => link.hintCategory === "domestic");
  const internationalLinks = filteredLinks.filter((link) => link.hintCategory === "international");
  if (runRecord) {
    runRecord.counts.domesticLinkCount = domesticLinks.length;
    runRecord.counts.internationalLinkCount = internationalLinks.length;
  }

  const domesticArticles = await extractArticlesFromLinks(
    ctx,
    domesticLinks,
    "domestic",
    getExtractionLimit("domestic", quota, maxCandidates),
    referenceDate,
    runRecord,
  );
  const internationalArticles = await extractArticlesFromLinks(
    ctx,
    internationalLinks,
    "international",
    getExtractionLimit("international", quota, maxCandidates),
    referenceDate,
    runRecord,
  );

  const articles = dedupeArticles([...domesticArticles, ...internationalArticles]);

  const domesticCount = articles.filter((article) => article.category === "domestic").length;
  const internationalCount = articles.length - domesticCount;
  if (runRecord) {
    runRecord.counts.extractedArticleCount = articles.length;
    runRecord.counts.extractedDomesticCount = domesticCount;
    runRecord.counts.extractedInternationalCount = internationalCount;
  }
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
export function renderDailyDigestMarkdown(selection: DailyDigestSelection, date: string): string {
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
    const traceDataDir = resolveDailyDigestTraceDir(ctx.dataDir, this.#configStorage);
    const braveSearchConfig = mergeBraveSearchConfig(config?.braveSearch);
    const runRecord = createDailyDigestRunRecord({
      dateKey,
      queries,
      quota: this.#quota,
      maxCandidates: this.#maxCandidates,
      braveSearchConfig,
      searchPlans: buildDailyDigestSearchPlans(queries),
    });
    let browser: Browser | undefined;
    try {
      const articles = await searchNewsWithBrave(
        ctx,
        queries,
        this.#maxCandidates,
        this.#quota,
        dateKey,
        config?.braveSearchApiKey,
        braveSearchConfig,
        runRecord,
      );
      const normalizedArticles = await this.#normalizeDigestArticles(articles, ctx);
      const invalidDisplayCount = normalizedArticles.filter((article) => !isDisplayLanguageCompliantArticle(article)).length;
      if (invalidDisplayCount > 0) {
        ctx.log?.(`⚠️ 有 ${invalidDisplayCount} 篇文章仍包含非简体中文 / 英文展示文本，已在最终入选阶段自动过滤`);
      }
      const selection = selectDigestArticles(normalizedArticles, this.#quota);
      runRecord.selection = {
        domestic: selection.domestic.map((article) => ({ ...article })),
        international: selection.international.map((article) => ({ ...article })),
        all: selection.all.map((article) => ({ ...article })),
      };
      runRecord.counts.finalCount = selection.all.length;
      runRecord.counts.finalDomesticCount = selection.domestic.length;
      runRecord.counts.finalInternationalCount = selection.international.length;
      ctx.log?.(`📊 最终入选 ${selection.all.length} 篇文章（国内 ${selection.domestic.length} / 国际 ${selection.international.length}）`);
      if (selection.domestic.length < this.#quota.domestic || selection.international.length < this.#quota.international) {
        ctx.log?.(`⚠️ 分类配额未完全满足，目标为国内 ${this.#quota.domestic} / 国际 ${this.#quota.international}`);
      }

      const dateLabel = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
      browser = await chromium.launch({ headless: true });
      const html = renderDailyDigestHtml(selection, dateLabel);
      const imageBuffer = await screenshotHtml(browser, html);

      const dataDirPath = ctx.dataDir ?? "";
      if (dataDirPath) {
        writeFileSync(join(dataDirPath, `${dateKey}.html`), html, "utf8");
        writeFileSync(join(dataDirPath, `${dateKey}.md`), renderDailyDigestMarkdown(selection, dateLabel), "utf8");
        writeFileSync(join(dataDirPath, `${dateKey}.png`), imageBuffer);
        writeFileSync(join(dataDirPath, `${dateKey}.json`), JSON.stringify(selection.all, null, 2), "utf8");
        runRecord.outputFiles = {
          html: `${dateKey}.html`,
          md: `${dateKey}.md`,
          png: `${dateKey}.png`,
          json: `${dateKey}.json`,
        };
        ctx.log?.(`💾 文件已保存到 ${dataDirPath}`);
        runRecord.status = "success";
        runRecord.finishedAt = new Date().toISOString();
        if (traceDataDir) persistDailyDigestRunRecord(traceDataDir, runRecord);
        return { outputPath: join(dataDirPath, `${dateKey}.png`) };
      }
      runRecord.status = "success";
      runRecord.finishedAt = new Date().toISOString();
      if (traceDataDir) persistDailyDigestRunRecord(traceDataDir, runRecord);
      return {};
    } catch (error) {
      runRecord.status = "error";
      runRecord.finishedAt = new Date().toISOString();
      runRecord.error = error instanceof Error ? error.message : String(error);
      if (traceDataDir) persistDailyDigestRunRecord(traceDataDir, runRecord);
      throw error;
    } finally {
      await browser?.close();
    }
  }

  async #normalizeDigestArticles(
    articles: DigestArticle[],
    ctx: SkillContext,
  ): Promise<DigestArticle[]> {
    try {
      return await normalizeDigestArticleDisplayLanguage(
        articles,
        async (items) => normalizeDigestDisplayLanguageBatch(ctx, items),
        ctx.log,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.log?.(`⚠️ 日报语言归一化失败，保留原始文本继续筛选：${message}`);
      return articles;
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
  const ranked = rankArticles(
    articles
      .filter((article) => !isBlockedArticle(article))
      .filter((article) => isDisplayLanguageCompliantArticle(article)),
  );
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

/**
 * Normalize digest display fields so the final digest only contains
 * simplified Chinese or English text.
 */
export async function normalizeDigestArticleDisplayLanguage(
  articles: DigestArticle[],
  normalizeBatch: (items: DigestDisplayLanguageItem[]) => Promise<DigestDisplayLanguageItem[] | undefined>,
  log?: (msg: string) => void,
): Promise<DigestArticle[]> {
  const items = collectDigestDisplayLanguageItems(articles);
  if (items.length === 0) return articles;

  log?.(`🌍 检测到 ${items.length} 篇文章需要做语言归一化`);
  let normalized = articles.map((article) => ({ ...article }));
  const batches = chunkDigestDisplayLanguageItems(items, DAILY_DIGEST_LANGUAGE_NORMALIZATION_BATCH_SIZE);
  for (const [index, batch] of batches.entries()) {
    const result = await safeNormalizeDigestDisplayLanguageBatch(normalizeBatch, batch, index, log);
    if (!result) {
      continue;
    }
    normalized = applyDigestDisplayLanguageItems(normalized, result);
  }
  return normalized;
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
    return [{ query, searchText: normalizeScopedSearchText(query, scope), hintCategory: scope }];
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
  const prefix = category === "domestic" ? "中国" : "国际";
  return `${prefix}${query}`.trim();
}

function normalizeScopedSearchText(query: string, category: DigestCategory): string {
  const trimmed = query.trim();
  if (category !== "domestic") return trimmed;
  return trimmed.replace(/^(国内|本土|本地)/, "中国");
}

async function extractArticlesFromLinks(
  ctx: SkillContext,
  links: DigestCandidateLink[],
  category: DigestCategory,
  maxCandidates: number,
  referenceDate: string,
  runRecord?: DailyDigestRunRecord,
): Promise<DigestArticle[]> {
  const log = (msg: string): void => { if (ctx.log) ctx.log(msg); };
  const extractionRecord: DailyDigestRunExtractionRecord = {
    category,
    startedAt: new Date().toISOString(),
    linkCount: links.length,
    maxCandidates,
    prompt: "",
    candidateLinks: [],
    parsedArticles: [],
  };
  if (links.length === 0) {
    extractionRecord.finishedAt = new Date().toISOString();
    extractionRecord.error = `${CATEGORY_LABEL[category]}候选为空`;
    runRecord?.extractions.push(extractionRecord);
    log(`⚠️ ${CATEGORY_LABEL[category]}候选为空`);
    return [];
  }

  log(`📊 ${CATEGORY_LABEL[category]}候选 ${links.length} 个链接，调用 LLM 筛选…`);
  const promptLinks = links.slice(0, 180);
  extractionRecord.candidateLinks = promptLinks.map((link) => ({ ...link }));
  const prompt = buildDailyDigestExtractionPrompt(category, promptLinks, maxCandidates);
  extractionRecord.prompt = prompt;

  try {
    const response = await ctx.agent.llm.complete({
      system: DAILY_DIGEST_EXTRACTION_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const text = extractText(response.message.content);
    extractionRecord.rawOutput = text;
    const jsonText = extractJsonArray(text);
    if (!jsonText) {
      extractionRecord.finishedAt = new Date().toISOString();
      extractionRecord.error = `${CATEGORY_LABEL[category]} LLM 未返回有效 JSON`;
      runRecord?.extractions.push(extractionRecord);
      log(`⚠️ ${CATEGORY_LABEL[category]} LLM 未返回有效 JSON`);
      if (text) log(`🪵 ${CATEGORY_LABEL[category]} LLM 原始输出: ${text.slice(0, 200)}`);
      return [];
    }

    const parsed = parseArticlesFromLLMOutput(response.message.content, buildLinkHintMap(links), referenceDate);
    if (!parsed) {
      extractionRecord.finishedAt = new Date().toISOString();
      extractionRecord.error = `${CATEGORY_LABEL[category]} JSON 解析失败`;
      runRecord?.extractions.push(extractionRecord);
      log(`⚠️ ${CATEGORY_LABEL[category]} JSON 解析失败`);
      log(`🪵 ${CATEGORY_LABEL[category]} LLM 原始输出: ${text.slice(0, 200)}`);
      return [];
    }

    const articles = parsed.map((article) => ({ ...article, category }));
    extractionRecord.finishedAt = new Date().toISOString();
    extractionRecord.parsedArticles = articles.map((article) => ({ ...article }));
    runRecord?.extractions.push(extractionRecord);
    return articles;
  } catch (error) {
    extractionRecord.finishedAt = new Date().toISOString();
    extractionRecord.error = error instanceof Error ? error.message : String(error);
    runRecord?.extractions.push(extractionRecord);
    throw error;
  }
}

export function buildDailyDigestExtractionPrompt(
  category: DigestCategory,
  links: DigestCandidateLink[],
  maxCandidates: number,
): string {
  const linkText = links
    .map((link) => formatCandidateLine(link))
    .join("\n");

  return `以下是${CATEGORY_LABEL[category]}新闻候选链接列表（格式：标题 | URL | 来源 | 时间 | 摘要）：

${linkText}

请只筛选出真正属于${CATEGORY_LABEL[category]}${DAILY_DIGEST_FOCUS}，以及与教育场景强相关的科技、创投或互联网动态的新闻正文页，满足这些要求：
- 只保留新闻正文页，不要搜索结果、专题页、导航链接、下载页、广告页
- 优先保留教育、教育科技、AI 教育、教育公司、教育平台、教育政策、教育产品相关内容
- 如果是泛科技新闻，只有在它与教育行业、教育场景、教育产品或教育公司明显相关时才保留
- 优先原创媒体、主流媒体、公司官网和权威发布
- 不要百家号、搜狐号、网易号、企鹅号、头条号、一点号、大鱼号等自媒体或聚合号内容
- 如果同一事件既有主流媒体 / 官网版本，也有自媒体版本，只保留前者
- 尽量覆盖不同主题，避免同题反复
- summary 尽量用一句中文短句概括；如果从标题无法可靠概括，可留空字符串
- title / summary / source 最终只允许简体中文或英文；繁体中文统一转换成简体中文，其他语言统一翻译成简体中文；英文内容可保留英文
- category 固定返回 ${category}

最多返回 ${maxCandidates} 篇，按质量、相关性和时效性排序。

只返回 JSON 数组，不要其他文字：
[{"title":"文章标题","url":"文章完整URL","summary":"一句话摘要","source":"来源媒体","category":"${category}"}]`;
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

function collectDigestDisplayLanguageItems(articles: DigestArticle[]): DigestDisplayLanguageItem[] {
  return articles.flatMap((article, index) => (
    needsDigestDisplayNormalization(article)
      ? [{ index, title: article.title, summary: article.summary, source: article.source }]
      : []
  ));
}

function chunkDigestDisplayLanguageItems(
  items: DigestDisplayLanguageItem[],
  size: number,
): DigestDisplayLanguageItem[][] {
  const chunks: DigestDisplayLanguageItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function applyDigestDisplayLanguageItems(
  articles: DigestArticle[],
  normalizedItems: DigestDisplayLanguageItem[],
): DigestArticle[] {
  const next = articles.map((article) => ({ ...article }));
  for (const item of normalizedItems) {
    const article = next[item.index];
    if (!article) continue;
    article.title = resolveNormalizedDigestText(item.title, article.title);
    article.summary = resolveNormalizedDigestText(item.summary, article.summary);
    article.source = resolveNormalizedDigestText(item.source, article.source);
  }
  return next;
}

function resolveNormalizedDigestText(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized || fallback;
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

async function normalizeDigestDisplayLanguageBatch(
  ctx: SkillContext,
  items: DigestDisplayLanguageItem[],
): Promise<DigestDisplayLanguageItem[] | undefined> {
  const response = await ctx.agent.llm.complete({
    system: DAILY_DIGEST_LANGUAGE_NORMALIZATION_SYSTEM,
    messages: [{ role: "user", content: buildDailyDigestLanguageNormalizationPrompt(items) }],
  });
  return parseDigestDisplayLanguageItems(response.message.content);
}

function buildDailyDigestLanguageNormalizationPrompt(items: DigestDisplayLanguageItem[]): string {
  return [
    "请把下面这些日报条目的展示文本规范为简体中文或英文。",
    "要求：繁体中文转简体中文；其他非中文/英文语言翻译成简体中文；英文保留英文。",
    "只允许修改 title、summary、source，必须保留原有 index。",
    "只返回 JSON 数组，不要其他文字。",
    JSON.stringify(items, null, 2),
  ].join("\n\n");
}

function parseDigestDisplayLanguageItems(content: unknown): DigestDisplayLanguageItem[] | undefined {
  const jsonText = extractJsonArray(extractText(content));
  if (!jsonText) return undefined;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    const result = z.array(DigestDisplayLanguageItemSchema).safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

async function safeNormalizeDigestDisplayLanguageBatch(
  normalizeBatch: (items: DigestDisplayLanguageItem[]) => Promise<DigestDisplayLanguageItem[] | undefined>,
  items: DigestDisplayLanguageItem[],
  batchIndex: number,
  log?: (msg: string) => void,
): Promise<DigestDisplayLanguageItem[] | undefined> {
  try {
    const result = await normalizeBatch(items);
    if (result) return result;
    log?.(`⚠️ 语言归一化第 ${batchIndex + 1} 批未返回有效 JSON，保留原始文本`);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.(`⚠️ 语言归一化第 ${batchIndex + 1} 批失败，保留原始文本：${message}`);
    return undefined;
  }
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

function isDisplayLanguageCompliantArticle(article: DigestArticle): boolean {
  const fields = [article.title, article.summary, article.source];
  return fields.every((text) => containsOnlySimplifiedChineseOrEnglishText(text));
}

function needsDigestDisplayNormalization(article: DigestArticle): boolean {
  const fields = [article.title, article.summary, article.source];
  if (fields.some((text) => !containsOnlySimplifiedChineseOrEnglishText(text))) return true;
  return hasTraditionalChineseSiteSignal(article.url, fields.join(" "));
}

function containsOnlySimplifiedChineseOrEnglishText(text: string): boolean {
  const normalized = text.normalize("NFKC");
  if (TRADITIONAL_CHINESE_INDICATOR_PATTERN.test(normalized)) return false;
  for (const char of normalized) {
    if (isAsciiReadableChar(char) || isCommonCjkPunctuation(char)) continue;
    if (/\p{Script=Han}/u.test(char)) continue;
    if (/\p{Letter}/u.test(char)) return false;
  }
  return true;
}

function hasTraditionalChineseSiteSignal(url: string, text: string): boolean {
  const hostname = getHostname(url);
  if (!hostname || !containsHanText(text)) return false;
  return isTraditionalChineseHostname(hostname);
}

function containsHanText(text: string): boolean {
  return /\p{Script=Han}/u.test(text.normalize("NFKC"));
}

function isTraditionalChineseHostname(hostname: string): boolean {
  return hostname.endsWith(".tw")
    || hostname.endsWith(".hk")
    || hostname.endsWith(".mo")
    || TRADITIONAL_CHINESE_MEDIA_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isAsciiReadableChar(char: string): boolean {
  return /^[\u0020-\u007e]$/u.test(char);
}

function isCommonCjkPunctuation(char: string): boolean {
  return /^[\u3000-\u303f\uff00-\uffef]$/u.test(char);
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
    SECTION_TITLE: category === "domestic" ? "国内资讯" : "国际资讯",
    SECTION_COUNT: String(articles.length).padStart(2, "0"),
    SECTION_ITEMS: items,
  });
}

function renderItem(article: DigestArticle, index: number): string {
  const summaryBlock = article.summary
    ? `<p class="summary">${escapeHtml(article.summary)}</p>`
    : "";

  return fillTemplate(ITEM_TEMPLATE, {
    INDEX: String(index).padStart(2, "0"),
    URL: escapeHtml(article.url),
    TITLE: escapeHtml(article.title),
    SUMMARY_BLOCK: summaryBlock,
    SOURCE: escapeHtml(article.source || "未知来源"),
  });
}

function renderMarkdownSection(articles: DigestArticle[], startIndex: number): string {
  if (articles.length === 0) return "_暂无符合条件的内容_";
  return articles
    .map((article, index) => {
      const lines = [
        `${startIndex + index}. **[${article.title}](${article.url})**`,
        article.summary ? `   ${article.summary}` : "",
        `   _${article.source}_`,
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

export function buildBraveNewsSearchUrl(
  query: string,
  maxCandidates: number,
  hintCategory: DigestCategory | undefined = undefined,
  braveSearchConfig: BraveSearchConfig | undefined = undefined,
): string {
  const config = mergeBraveSearchConfig(braveSearchConfig);
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(maxCandidates, config.request.count)),
    offset: String(config.request.offset),
    spellcheck: config.request.spellcheck ? "1" : "0",
  });
  if (config.request.freshness) params.set("freshness", config.request.freshness);
  if (config.request.safesearch) params.set("safesearch", config.request.safesearch);
  if (config.request.uiLang) params.set("ui_lang", config.request.uiLang);
  if (config.request.extraSnippets) params.set("extra_snippets", "true");
  for (const goggles of config.request.goggles) {
    params.append("goggles", goggles);
  }
  const scopedConfig = hintCategory === "domestic" ? config.domestic : config.international;
  if (scopedConfig.country) params.set("country", scopedConfig.country);
  if (scopedConfig.searchLang) params.set("search_lang", scopedConfig.searchLang);
  return `${BRAVE_NEWS_SEARCH_ENDPOINT}?${params.toString()}`;
}

async function fetchBraveNewsResponse(
  requestUrl: string,
  apiKey: string,
): Promise<unknown> {
  const response = await fetch(requestUrl, {
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

function countBraveNewsResults(payload: unknown): number {
  const parsed = BraveNewsResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.results.length : 0;
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

function resolveDailyDigestTraceDir(
  dataDir: string | undefined,
  configStorage: ConfigStorage<DailyDigestConfig> | undefined,
): string | undefined {
  if (dataDir) return dataDir;
  const filePath = configStorage?.filePath;
  return filePath ? dirname(filePath) : undefined;
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
