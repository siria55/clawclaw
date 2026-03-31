import { useEffect, useState } from "react";
import styles from "./DailyDigestRunsView.module.css";

interface DailyDigestRunSummary {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  error?: string;
  dateKey: string;
  queryCount: number;
  searchRequestCount: number;
  rawResultCount: number;
  filteredLinkCount: number;
  finalCount: number;
  finalDomesticCount: number;
  finalInternationalCount: number;
}

interface DailyDigestRunPage {
  runs: DailyDigestRunSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface DigestArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
  publishedAt?: string;
  date?: string;
  category: "domestic" | "international";
}

interface DigestCandidateLink {
  text: string;
  href: string;
  hintCategory: "domestic" | "international";
  source?: string;
  summary?: string;
  publishedAt?: string;
}

interface DailyDigestRunRequestRecord {
  query: string;
  searchText: string;
  hintCategory: "domestic" | "international";
  startedAt: string;
  finishedAt?: string;
  requestUrl: string;
  request: {
    endpoint: string;
    q: string;
    count: number;
    offset: number;
    spellcheck: boolean;
    freshness: string;
    safesearch: string;
    uiLang: string;
    extraSnippets: boolean;
    goggles: string[];
    country: string;
    searchLang: string;
    maxCandidates: number;
  };
  responseResultCount: number;
  parsedLinks: DigestCandidateLink[];
  response?: unknown;
  error?: string;
}

interface DailyDigestRunExtractionRecord {
  category: "domestic" | "international";
  stage?: "default" | "mainland-preferred" | "fallback";
  startedAt: string;
  finishedAt?: string;
  linkCount: number;
  maxCandidates: number;
  prompt: string;
  candidateLinks?: DigestCandidateLink[];
  rawOutput?: string;
  parsedArticles: DigestArticle[];
  error?: string;
}

interface DailyDigestRunRecord {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "error";
  dateKey: string;
  queries: string[];
  quota: {
    domestic: number;
    international: number;
  };
  maxCandidates: number;
  braveSearchConfig: {
    request: {
      count: number;
      offset: number;
      freshness: string;
      spellcheck: boolean;
      safesearch: string;
      uiLang: string;
      extraSnippets: boolean;
      goggles: string[];
    };
    domestic: {
      country: string;
      searchLang: string;
    };
    international: {
      country: string;
      searchLang: string;
    };
  };
  searchPlans: Array<{
    query: string;
    searchText: string;
    hintCategory: "domestic" | "international";
  }>;
  searchRequests: DailyDigestRunRequestRecord[];
  extractions: DailyDigestRunExtractionRecord[];
  counts: {
    rawLinkCount: number;
    uniqueLinkCount: number;
    filteredLinkCount: number;
    blockedLinkCount: number;
    domesticLinkCount: number;
    domesticMainlandLinkCount?: number;
    domesticFallbackLinkCount?: number;
    internationalLinkCount: number;
    extractedArticleCount: number;
    extractedDomesticCount: number;
    extractedInternationalCount: number;
    finalCount: number;
    finalDomesticCount: number;
    finalInternationalCount: number;
  };
  selection?: {
    domestic: DigestArticle[];
    international: DigestArticle[];
    all: DigestArticle[];
  };
  outputFiles?: {
    html?: string;
    md?: string;
    png?: string;
    json?: string;
  };
  error?: string;
}

interface ExtractionCandidateViewModel {
  link: DigestCandidateLink;
  selected: boolean;
  finalSelected: boolean;
  tags: string[];
}

export function DailyDigestRunsView(): React.JSX.Element {
  const [runs, setRuns] = useState<DailyDigestRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [detail, setDetail] = useState<DailyDigestRunRecord | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadRuns();
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      return;
    }
    void loadRunDetail(selectedRunId);
  }, [selectedRunId]);

  async function loadRuns(): Promise<void> {
    setListLoading(true);
    setError("");
    try {
      const res = await fetch("/api/daily-digest/runs?page=1&pageSize=20");
      const data = await res.json() as DailyDigestRunPage;
      setRuns(data.runs);
      setSelectedRunId((current) => (current && data.runs.some((run) => run.runId === current))
        ? current
        : data.runs[0]?.runId ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setRuns([]);
      setSelectedRunId("");
    } finally {
      setListLoading(false);
    }
  }

  async function loadRunDetail(runId: string): Promise<void> {
    setDetailLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/daily-digest/runs/${encodeURIComponent(runId)}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json() as DailyDigestRunRecord;
      setDetail(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>日报检索记录</h1>
          <p className={styles.subtitle}>查看每次 daily-digest 的 Brave 请求参数、返回结果和筛选阶段数据。</p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={() => { void loadRuns(); }}>
          刷新
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span>最近执行</span>
            <span>{runs.length}</span>
          </div>
          <div className={styles.runList}>
            {listLoading && <p className={styles.hint}>加载中…</p>}
            {!listLoading && runs.length === 0 && (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>还没有检索记录</p>
                <p className={styles.emptyHint}>先手动执行一次 `daily-digest`，这里就会出现 run 记录。</p>
              </div>
            )}
            {runs.map((run) => (
              <button
                key={run.runId}
                type="button"
                className={`${styles.runCard} ${selectedRunId === run.runId ? styles.runCardActive : ""}`}
                onClick={() => setSelectedRunId(run.runId)}
              >
                <div className={styles.runTop}>
                  <span className={`${styles.status} ${styles[`status${capitalize(run.status)}`]}`}>
                    {formatStatus(run.status)}
                  </span>
                  <span className={styles.runTime}>{formatDateTime(run.startedAt)}</span>
                </div>
                <div className={styles.runTitle}>{run.dateKey}</div>
                <div className={styles.runMeta}>
                  <span>请求 {run.searchRequestCount}</span>
                  <span>原始 {run.rawResultCount}</span>
                  <span>入选 {run.finalCount}</span>
                </div>
                <div className={styles.runMeta}>
                  <span>国内 {run.finalDomesticCount}</span>
                  <span>国际 {run.finalInternationalCount}</span>
                </div>
                {run.error && <p className={styles.runError}>{run.error}</p>}
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.detail}>
          {detailLoading && <p className={styles.hint}>正在加载详情…</p>}
          {!detailLoading && !detail && runs.length > 0 && <p className={styles.hint}>请选择一条 run 记录。</p>}
          {!detailLoading && detail && <RunDetail record={detail} />}
        </section>
      </div>
    </div>
  );
}

function RunDetail(props: { record: DailyDigestRunRecord }): React.JSX.Element {
  const { record } = props;

  return (
    <div className={styles.detailBody}>
      <section className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <h2 className={styles.sectionTitle}>执行概览</h2>
          <span className={`${styles.status} ${styles[`status${capitalize(record.status)}`]}`}>
            {formatStatus(record.status)}
          </span>
        </div>
        <div className={styles.kvGrid}>
          <InfoItem label="Run ID" value={record.runId} mono />
          <InfoItem label="开始时间" value={formatDateTime(record.startedAt)} />
          <InfoItem label="结束时间" value={record.finishedAt ? formatDateTime(record.finishedAt) : "-"} />
          <InfoItem label="查询主题" value={record.queries.join(" / ")} />
          <InfoItem label="配额" value={`国内 ${record.quota.domestic} / 国际 ${record.quota.international}`} />
          <InfoItem label="候选上限" value={String(record.maxCandidates)} />
        </div>
        {record.error && <div className={styles.errorInline}>{record.error}</div>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>阶段统计</h2>
        <div className={styles.metricGrid}>
          <MetricCard label="原始候选" value={record.counts.rawLinkCount} />
          <MetricCard label="去重后" value={record.counts.uniqueLinkCount} />
          <MetricCard label="过滤后" value={record.counts.filteredLinkCount} />
          <MetricCard label="拦截数" value={record.counts.blockedLinkCount} />
          {record.counts.domesticMainlandLinkCount !== undefined && (
            <MetricCard label="国内大陆候选" value={record.counts.domesticMainlandLinkCount} />
          )}
          {record.counts.domesticFallbackLinkCount !== undefined && (
            <MetricCard label="国内回退候选" value={record.counts.domesticFallbackLinkCount} />
          )}
          <MetricCard label="抽取结果" value={record.counts.extractedArticleCount} />
          <MetricCard label="最终入选" value={record.counts.finalCount} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Brave 配置</h2>
        <pre className={styles.codeBlock}>{formatJson(record.braveSearchConfig)}</pre>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>请求与返回</h2>
        <div className={styles.stack}>
          {record.searchRequests.map((request, index) => (
            <details key={`${request.searchText}-${index}`} className={styles.disclosure} open={index === 0}>
              <summary className={styles.disclosureSummary}>
                <span>{request.searchText}</span>
                <span>{request.hintCategory === "domestic" ? "国内" : "国际"}</span>
                <span>返回 {request.responseResultCount}</span>
                <span>解析 {request.parsedLinks.length}</span>
              </summary>
              <div className={styles.disclosureBody}>
                <div className={styles.kvGrid}>
                  <InfoItem label="原始主题" value={request.query} />
                  <InfoItem label="请求时间" value={formatDateTime(request.startedAt)} />
                  <InfoItem label="完成时间" value={request.finishedAt ? formatDateTime(request.finishedAt) : "-"} />
                  <InfoItem label="请求 URL" value={request.requestUrl} mono />
                </div>
                {request.error && <div className={styles.errorInline}>{request.error}</div>}
                <details className={styles.innerDisclosure}>
                  <summary>请求参数</summary>
                  <pre className={styles.codeBlock}>{formatJson(request.request)}</pre>
                </details>
                <details className={styles.innerDisclosure}>
                  <summary>Brave 原始返回</summary>
                  <pre className={styles.codeBlock}>{formatJson(request.response ?? {})}</pre>
                </details>
                <details className={styles.innerDisclosure}>
                  <summary>解析后的候选链接</summary>
                  <pre className={styles.codeBlock}>{formatJson(request.parsedLinks)}</pre>
                </details>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>LLM 抽取</h2>
        <div className={styles.stack}>
          {record.extractions.map((extraction) => {
            const diagnostics = buildExtractionDiagnostics(record, extraction);
            return (
              <details key={`${extraction.category}-${extraction.startedAt}`} className={styles.disclosure} open>
              <summary className={styles.disclosureSummary}>
                <span>{extraction.category === "domestic" ? "国内" : "国际"}</span>
                {extraction.stage && extraction.stage !== "default" && <span>{formatExtractionStage(extraction.stage)}</span>}
                <span>候选 {diagnostics.totalCandidateCount}</span>
                <span>返回 {diagnostics.parsedCount}</span>
                <span>通过率 {diagnostics.passRateLabel}</span>
                </summary>
                <div className={styles.disclosureBody}>
                  <ExtractionDiagnostics extraction={extraction} diagnostics={diagnostics} />
                  {extraction.error && <div className={styles.errorInline}>{extraction.error}</div>}
                  <details className={styles.innerDisclosure}>
                    <summary>Prompt</summary>
                    <pre className={styles.codeBlock}>{extraction.prompt}</pre>
                  </details>
                  <details className={styles.innerDisclosure}>
                    <summary>LLM 原始输出</summary>
                    <pre className={styles.codeBlock}>{extraction.rawOutput ?? ""}</pre>
                  </details>
                  <details className={styles.innerDisclosure}>
                    <summary>解析后的文章</summary>
                    <pre className={styles.codeBlock}>{formatJson(extraction.parsedArticles)}</pre>
                  </details>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>最终入选</h2>
        {record.selection?.all.length ? (
          <div className={styles.articleList}>
            {record.selection.all.map((article) => (
              <article key={article.url} className={styles.articleCard}>
                <div className={styles.articleTop}>
                  <a href={article.url} target="_blank" rel="noreferrer" className={styles.articleTitle}>
                    {article.title}
                  </a>
                  <span className={styles.articleCategory}>
                    {article.category === "domestic" ? "国内" : "国际"}
                  </span>
                </div>
                <p className={styles.articleSummary}>{article.summary || "无摘要"}</p>
                <div className={styles.articleMeta}>
                  <span>{article.source}</span>
                  {article.date && <span>{article.date}</span>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.hint}>这次执行没有最终入选文章。</p>
        )}
      </section>
    </div>
  );
}

function MetricCard(props: { label: string; value: number }): React.JSX.Element {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricLabel}>{props.label}</span>
      <span className={styles.metricValue}>{props.value}</span>
    </div>
  );
}

function ExtractionDiagnostics(
  props: {
    extraction: DailyDigestRunExtractionRecord;
    diagnostics: ReturnType<typeof buildExtractionDiagnostics>;
  },
): React.JSX.Element {
  const { diagnostics } = props;

  return (
    <div className={styles.extractionBlock}>
      <div className={styles.metricGrid}>
        <MetricCard label="送入 LLM" value={diagnostics.promptCandidateCount} />
        <MetricCard label="原始候选" value={diagnostics.totalCandidateCount} />
        <MetricCard label="抽取返回" value={diagnostics.parsedCount} />
        <MetricCard label="最终入选" value={diagnostics.finalSelectedCount} />
        <MetricCard label="未抽取" value={diagnostics.notSelectedCount} />
        <MetricCard label="最大返回上限" value={props.extraction.maxCandidates} />
      </div>

      <div className={styles.notePanel}>
        <h3 className={styles.noteTitle}>诊断提示</h3>
        {diagnostics.approximateCandidateList && (
          <p className={styles.noteHint}>当前 run 没有持久化抽取候选明细，下面列表由搜索结果近似还原。</p>
        )}
        <ul className={styles.noteList}>
          {diagnostics.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <details className={styles.innerDisclosure}>
        <summary>送入 LLM 的候选明细</summary>
        <div className={styles.candidateList}>
          {diagnostics.candidates.map((item) => (
            <article key={item.link.href} className={styles.candidateCard}>
              <div className={styles.candidateTop}>
                <a href={item.link.href} target="_blank" rel="noreferrer" className={styles.candidateTitle}>
                  {item.link.text}
                </a>
                <div className={styles.tagRow}>
                  <span className={`${styles.pill} ${item.finalSelected ? styles.pillSuccess : item.selected ? styles.pillActive : styles.pillMuted}`}>
                    {item.finalSelected ? "最终入选" : item.selected ? "LLM 选中" : "未抽取"}
                  </span>
                  {item.tags.map((tag) => (
                    <span key={`${item.link.href}-${tag}`} className={`${styles.pill} ${styles.pillMuted}`}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className={styles.articleMeta}>
                <span>{item.link.source || "未知来源"}</span>
                {item.link.publishedAt && <span>{item.link.publishedAt}</span>}
              </div>
              {item.link.summary && <p className={styles.candidateSummary}>{item.link.summary}</p>}
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function InfoItem(props: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className={styles.infoItem}>
      <span className={styles.infoLabel}>{props.label}</span>
      <span className={`${styles.infoValue} ${props.mono ? styles.mono : ""}`}>{props.value}</span>
    </div>
  );
}

function formatStatus(status: DailyDigestRunSummary["status"]): string {
  if (status === "success") return "成功";
  if (status === "error") return "失败";
  return "执行中";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildExtractionDiagnostics(
  record: DailyDigestRunRecord,
  extraction: DailyDigestRunExtractionRecord,
): {
  candidates: ExtractionCandidateViewModel[];
  notes: string[];
  approximateCandidateList: boolean;
  totalCandidateCount: number;
  promptCandidateCount: number;
  parsedCount: number;
  finalSelectedCount: number;
  notSelectedCount: number;
  passRateLabel: string;
} {
  const candidateResult = resolveExtractionCandidates(record, extraction);
  const selectedUrls = new Set(extraction.parsedArticles.map((article) => normalizeUrl(article.url)));
  const finalSelectedUrls = new Set(
    (record.selection?.all ?? [])
      .filter((article) => article.category === extraction.category)
      .map((article) => normalizeUrl(article.url)),
  );
  const candidates = candidateResult.items.map((link) => buildExtractionCandidateViewModel(link, selectedUrls, finalSelectedUrls));
  const parsedCount = extraction.parsedArticles.length;
  const finalSelectedCount = [...selectedUrls].filter((url) => finalSelectedUrls.has(url)).length;
  const promptCandidateCount = candidates.length;
  const totalCandidateCount = Math.max(extraction.linkCount, promptCandidateCount);
  return {
    candidates,
    notes: buildExtractionNotes(extraction, candidates, candidateResult.approximate),
    approximateCandidateList: candidateResult.approximate,
    totalCandidateCount,
    promptCandidateCount,
    parsedCount,
    finalSelectedCount,
    notSelectedCount: Math.max(promptCandidateCount - parsedCount, 0),
    passRateLabel: formatRatio(parsedCount, promptCandidateCount),
  };
}

function resolveExtractionCandidates(
  record: DailyDigestRunRecord,
  extraction: DailyDigestRunExtractionRecord,
): { items: DigestCandidateLink[]; approximate: boolean } {
  if ((extraction.candidateLinks?.length ?? 0) > 0) {
    return { items: extraction.candidateLinks ?? [], approximate: false };
  }
  const items = dedupeCandidateLinks(
    record.searchRequests
      .filter((request) => request.hintCategory === extraction.category)
      .flatMap((request) => request.parsedLinks),
  );
  return { items, approximate: true };
}

function dedupeCandidateLinks(links: DigestCandidateLink[]): DigestCandidateLink[] {
  const seen = new Set<string>();
  const result: DigestCandidateLink[] = [];
  for (const link of links) {
    const key = normalizeUrl(link.href);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}

function buildExtractionCandidateViewModel(
  link: DigestCandidateLink,
  selectedUrls: ReadonlySet<string>,
  finalSelectedUrls: ReadonlySet<string>,
): ExtractionCandidateViewModel {
  const normalizedUrl = normalizeUrl(link.href);
  return {
    link,
    selected: selectedUrls.has(normalizedUrl),
    finalSelected: finalSelectedUrls.has(normalizedUrl),
    tags: buildCandidateTags(link),
  };
}

function buildExtractionNotes(
  extraction: DailyDigestRunExtractionRecord,
  candidates: ExtractionCandidateViewModel[],
  approximate: boolean,
): string[] {
  const notes: string[] = [];
  const passRate = candidates.length > 0 ? extraction.parsedArticles.length / candidates.length : 0;
  if (candidates.length === 0) notes.push("这一组没有可展示的候选明细，说明问题更可能出在搜索阶段。");
  if (passRate < 0.2 && candidates.length > 0) notes.push("LLM 通过率偏低，说明这批候选里大部分与当前日报口径不匹配。");
  if (extraction.category === "domestic" && extraction.stage === "mainland-preferred") notes.push("这一组是中国大陆来源优先候选，会先于港澳台、海外华文和其他境外来源进入抽取。");
  if (extraction.category === "domestic" && extraction.stage === "fallback") notes.push("这一组是非大陆候选回退池，只会在中国大陆来源不足时用于补位。");
  if (candidates.some((item) => item.tags.includes("疑似导航/聚合"))) notes.push("候选里混入了导航、栏目或聚合页，LLM 会把它们大量剔除。");
  if (candidates.some((item) => item.tags.includes("语言不稳"))) notes.push("候选里有不少非简体中文/英文或繁体内容，抽取阶段和最终展示阶段都会更严格。");
  if (candidates.some((item) => item.tags.includes("教育弱相关"))) notes.push("候选中有不少只是泛科技或泛教育资讯，不够贴近“教育 / 教育科技 / AI 教育 / 教育公司”的口径。");
  if (candidates.some((item) => item.tags.includes("来源偏弱"))) notes.push("候选来源里包含博客、专栏、聚合页或论坛型站点，提示词会优先剔除这类来源。");
  if (extraction.linkCount > candidates.length) notes.push(`这一组共有 ${extraction.linkCount} 个候选，但页面只展示了送入 LLM 的 ${candidates.length} 个。`);
  if (approximate) notes.push("当前候选列表由已保存的搜索结果近似还原，和当时实际 prompt 顺序可能略有差异。");
  return notes.length > 0 ? notes : ["这一组候选整体质量还可以，抽取结果少更像是当天真正满足口径的新闻就不多。"];
}

function buildCandidateTags(link: DigestCandidateLink): string[] {
  const tags: string[] = [];
  if (isLikelyMainlandChinaLink(link)) tags.push("大陆来源");
  if (link.hintCategory === "domestic" && !isLikelyMainlandChinaLink(link)) tags.push("非大陆回退");
  if (isLikelyListOrAggregation(link)) tags.push("疑似导航/聚合");
  if (isLikelyWeakSource(link)) tags.push("来源偏弱");
  if (isLikelyEducationWeak(link)) tags.push("教育弱相关");
  if (containsUnstableDisplayLanguage([link.text, link.summary ?? "", link.source ?? ""])) tags.push("语言不稳");
  return tags;
}

function isLikelyMainlandChinaLink(link: DigestCandidateLink): boolean {
  try {
    const hostname = new URL(link.href).hostname.toLowerCase();
    return hostname.endsWith(".cn")
      || /(^|\.)xinhuanet\.com$/i.test(hostname)
      || /(^|\.)news\.cn$/i.test(hostname)
      || /(^|\.)people\.com\.cn$/i.test(hostname)
      || /(^|\.)cctv\.com$/i.test(hostname)
      || /(^|\.)chinanews\.com\.cn$/i.test(hostname)
      || /(^|\.)thepaper\.cn$/i.test(hostname)
      || /(^|\.)jiemian\.com$/i.test(hostname)
      || /(^|\.)yicai\.com$/i.test(hostname)
      || /(^|\.)caixin\.com$/i.test(hostname)
      || /(^|\.)36kr\.com$/i.test(hostname)
      || /(^|\.)tmtpost\.com$/i.test(hostname)
      || /(^|\.)huxiu\.com$/i.test(hostname)
      || /(^|\.)ithome\.com$/i.test(hostname)
      || /(^|\.)leiphone\.com$/i.test(hostname);
  } catch {
    return false;
  }
}

function isLikelyListOrAggregation(link: DigestCandidateLink): boolean {
  const text = `${link.text} ${link.summary ?? ""} ${link.href}`.toLowerCase();
  return /关于我们|關於我們|新闻发布|新聞發布|会员服务|會員服務|常见问题|常見問題|订阅|訂閱|相关文章|相關文章|直播间|\.\/docs\//i.test(text)
    || /(^|\s)(专题|專題|频道|頻道|栏目|欄目)(\s|$)/i.test(text);
}

function isLikelyWeakSource(link: DigestCandidateLink): boolean {
  const source = `${link.source ?? ""} ${link.href}`.toLowerCase();
  return /note\.|yahoo\.co\.jp|stheadline|cw\.com\.tw|gvm\.com\.tw|thenewslens|businesstoday|sumitai|forum|blog|docs/i.test(source);
}

function isLikelyEducationWeak(link: DigestCandidateLink): boolean {
  const text = `${link.text} ${link.summary ?? ""}`.toLowerCase();
  const education = /教育|学校|校園|校园|大学|大學|课堂|課堂|student|school|education|edtech|teacher|classroom|campus|admission|教科書|教科书/u;
  const broadTech = /ai|人工智能|科技|半导体|半導體|投資|投资|雲端|云端|算力|quantum|chip|晶片|cloud/u;
  return !education.test(text) && broadTech.test(text);
}

function containsUnstableDisplayLanguage(values: string[]): boolean {
  const text = values.join(" ").normalize("NFKC");
  if (/[專學體與為這來們會後從開關於發佈業產網點臺灣聯報經濟應數據醫門戶話讓還選觀讀寫實軟電腦雲處裡廣務測證遠際權聲標圖錄頁覽優勢機構續線層級國資訊華號]/u.test(text)) {
    return true;
  }
  for (const char of text) {
    if (/^[\u0020-\u007e]$/u.test(char) || /^[\u3000-\u303f\uff00-\uffef]$/u.test(char)) continue;
    if (/\p{Script=Han}/u.test(char)) continue;
    if (/\p{Letter}/u.test(char)) return true;
  }
  return false;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const href = parsed.toString();
    return href.endsWith("/") ? href.slice(0, -1) : href;
  } catch {
    return url.trim();
  }
}

function formatRatio(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatExtractionStage(stage: NonNullable<DailyDigestRunExtractionRecord["stage"]>): string {
  if (stage === "mainland-preferred") return "大陆优先";
  if (stage === "fallback") return "非大陆回退";
  return "默认";
}
