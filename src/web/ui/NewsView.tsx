import { useEffect, useRef, useState } from "react";
import { useNewsQuery } from "./useNewsQuery";
import type { NewsArticle } from "./useNewsQuery";
import styles from "./NewsView.module.css";

export function NewsView(): React.JSX.Element {
  const { articles, total, page, pageSize, loading, query } = useNewsQuery();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load first page on mount
  useEffect(() => {
    query({ page: 1, pageSize: 20 });
  }, [query]);

  const search = (p = 1): void => {
    query({ q: q || undefined, tag: tag || undefined, page: p, pageSize });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.container}>
      {/* Search bar */}
      <div className={styles.toolbar}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          placeholder="搜索标题或摘要…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(1)}
        />
        <input
          className={styles.tagInput}
          placeholder="标签"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(1)}
        />
        <button className={styles.searchBtn} onClick={() => search(1)}>
          搜索
        </button>
      </div>

      {/* Article list */}
      <div className={styles.list}>
        {loading && <p className={styles.hint}>加载中…</p>}

        {!loading && articles.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>新闻库暂无内容</p>
            <p className={styles.emptyHint}>让 Agent 搜索新闻后，文章将自动存入这里</p>
          </div>
        )}

        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            disabled={page <= 1}
            onClick={() => search(page - 1)}
          >
            ‹ 上一页
          </button>
          <span className={styles.pageInfo}>
            第 {page} / {totalPages} 页 · 共 {total} 篇
          </span>
          <button
            className={styles.pageBtn}
            disabled={page >= totalPages}
            onClick={() => search(page + 1)}
          >
            下一页 ›
          </button>
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article }: { article: NewsArticle }): React.JSX.Element {
  const date = article.savedAt.slice(0, 10);
  const pub = article.publishedAt?.slice(0, 10);

  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.cardTitle}
        >
          {article.title}
        </a>
        <span className={styles.sourceBadge}>{article.source}</span>
      </div>
      <p className={styles.cardSummary}>{article.summary}</p>
      <div className={styles.cardMeta}>
        {article.tags.map((t) => (
          <span key={t} className={styles.tag}>{t}</span>
        ))}
        <span className={styles.date}>
          {pub ? `发布 ${pub} · ` : ""}存入 {date}
        </span>
      </div>
    </article>
  );
}
