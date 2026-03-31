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
  startedAt: string;
  finishedAt?: string;
  linkCount: number;
  maxCandidates: number;
  prompt: string;
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
          {record.extractions.map((extraction) => (
            <details key={`${extraction.category}-${extraction.startedAt}`} className={styles.disclosure}>
              <summary className={styles.disclosureSummary}>
                <span>{extraction.category === "domestic" ? "国内" : "国际"}</span>
                <span>候选 {extraction.linkCount}</span>
                <span>返回 {extraction.parsedArticles.length}</span>
              </summary>
              <div className={styles.disclosureBody}>
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
          ))}
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
