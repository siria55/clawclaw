import { useEffect, useRef, useState } from "react";
import styles from "./SearchConfigView.module.css";

interface SearchConfigFields {
  queries: string;
  braveSearchApiKey: string;
}

interface StatusMessage {
  type: "ok" | "err";
  msg: string;
}

function normalizeQueries(queries: string): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const query of queries.split("\n")) {
    const trimmed = query.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

async function fetchSearchConfig(): Promise<SearchConfigFields> {
  const res = await fetch("/api/config/daily-digest");
  if (!res.ok) return { queries: "", braveSearchApiKey: "" };
  const data = await res.json() as { queries?: string[]; braveSearchApiKey?: string };
  return {
    queries: (data.queries ?? []).join("\n"),
    braveSearchApiKey: data.braveSearchApiKey ?? "",
  };
}

async function saveSearchConfig(fields: SearchConfigFields): Promise<void> {
  const res = await fetch("/api/config/daily-digest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: normalizeQueries(fields.queries),
      braveSearchApiKey: fields.braveSearchApiKey,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function SearchConfigView(): React.JSX.Element {
  const [fields, setFields] = useState<SearchConfigFields>({ queries: "", braveSearchApiKey: "" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetchSearchConfig()
      .then(setFields)
      .catch(() => {
        setStatus({ type: "err", msg: "加载搜索配置失败" });
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showStatus = (next: StatusMessage): void => {
    setStatus(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(null), 4000);
  };

  const save = (): void => {
    setSaving(true);
    void saveSearchConfig(fields)
      .then(() => {
        showStatus({ type: "ok", msg: "已保存搜索配置" });
      })
      .catch((error: unknown) => {
        showStatus({ type: "err", msg: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h2 className={styles.title}>搜索</h2>
        <div className={styles.hint}>
          Brave 搜索相关配置统一保存在 `data/skills/daily-digest/config.json`。<br />
          这里可以直接修改 `Brave Search API Key` 和 `daily-digest` 的搜索主题；保存后下次执行就会按新配置生效。
        </div>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>Brave Search / DailyDigest</div>
          <div className={styles.sectionHint}>
            当前默认搜索范围为过去一周；国内搜索会优先按中国语境处理。
          </div>

          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="search-brave-api-key">Brave Search API Key</label>
              <input
                id="search-brave-api-key"
                className={styles.input}
                type="password"
                placeholder="BSA..."
                value={fields.braveSearchApiKey}
                onChange={(e) => setFields((value) => ({ ...value, braveSearchApiKey: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="search-daily-digest-queries">搜索主题（每行一个）</label>
              <textarea
                id="search-daily-digest-queries"
                className={styles.textarea}
                placeholder={"中国教育\nAI 教育\n教育公司\n全球教育公司\n全球科技公司"}
                value={fields.queries}
                onChange={(e) => setFields((value) => ({ ...value, queries: e.target.value }))}
                rows={8}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className={styles.meta}>
            搜索主题会在候选阶段逐个检索，再进入教育优先筛选；Brave Key 留空时会回退到环境变量 `BRAVE_SEARCH_API_KEY`。
          </div>

          <div className={styles.actions}>
            <button className={styles.saveBtn} type="button" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存搜索配置"}
            </button>
            {status && <span className={`${styles.status} ${styles[status.type]}`}>{status.msg}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
