import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./MemoryView.module.css";

interface MemoryEntry {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface MemoryPage {
  entries: MemoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export function MemoryView(): React.JSX.Element {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const query = useCallback((params: { q?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    qs.set("page", String(params.page ?? 1));
    qs.set("pageSize", String(pageSize));
    setLoading(true);
    void fetch(`/api/memory?${qs.toString()}`)
      .then((r) => r.json() as Promise<MemoryPage>)
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
        setPage(data.page);
      })
      .finally(() => setLoading(false));
  }, [pageSize]);

  useEffect(() => { query({ page: 1 }); }, [query]);

  const search = (p = 1): void => { query({ q: q || undefined, page: p }); };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="搜索记忆内容或标签…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(1)}
        />
        <button className={styles.searchBtn} onClick={() => search(1)}>搜索</button>
      </div>

      <div className={styles.list}>
        {loading && <p className={styles.hint}>加载中…</p>}

        {!loading && entries.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>记忆库暂无内容</p>
            <p className={styles.emptyHint}>Agent 通过 memory_save 工具保存的记忆将显示在这里</p>
          </div>
        )}

        {entries.map((e) => <MemoryCard key={e.id} entry={e} />)}
      </div>

      {total > 0 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => search(page - 1)}>
            ‹ 上一页
          </button>
          <span className={styles.pageInfo}>第 {page} / {totalPages} 页 · 共 {total} 条</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => search(page + 1)}>
            下一页 ›
          </button>
        </div>
      )}
    </div>
  );
}

function MemoryCard({ entry }: { entry: MemoryEntry }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const date = entry.createdAt.slice(0, 10);
  const isLong = entry.content.length > 200;
  const displayContent = !expanded && isLong ? entry.content.slice(0, 200) + "…" : entry.content;

  return (
    <div className={styles.card}>
      <p className={styles.cardContent}>{displayContent}</p>
      {isLong && (
        <button className={styles.expandBtn} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "收起" : "展开全文"}
        </button>
      )}
      <div className={styles.cardMeta}>
        {entry.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
        <span className={styles.date}>存入 {date}</span>
      </div>
    </div>
  );
}
