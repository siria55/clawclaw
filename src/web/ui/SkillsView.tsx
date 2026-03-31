import { useState, useRef, useEffect } from "react";
import styles from "./SkillsView.module.css";

interface SkillInfo {
  id: string;
  description: string;
}

interface DailyDigestFields {
  queries: string;
}

interface StatusMessage {
  type: "ok" | "err";
  msg: string;
}

async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch("/api/skills");
  if (!res.ok) return [];
  const data = await res.json() as { skills: SkillInfo[] };
  return data.skills;
}

async function fetchDailyDigestConfig(): Promise<DailyDigestFields> {
  const res = await fetch("/api/config/daily-digest");
  if (!res.ok) return { queries: "" };
  const data = await res.json() as { queries?: string[] };
  return { queries: (data.queries ?? []).join("\n") };
}

async function saveDailyDigestConfig(queries: string): Promise<void> {
  const res = await fetch("/api/config/daily-digest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: normalizeQueries(queries),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

interface SSEEvent {
  type: "log" | "done" | "error";
  text?: string;
  error?: string;
  outputPath?: string;
}

function SkillRow({ skill }: { skill: SkillInfo }): React.JSX.Element {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<"ok" | "err" | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    return () => { readerRef.current?.cancel().catch(() => { /* ignore cancel error */ }); };
  }, []);

  const handleRun = (): void => {
    setRunning(true);
    setDone(null);
    setLogs([]);
    setPreviewUrl(null);

    void (async () => {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(skill.id)}/run`, { method: "POST" });
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buf = "";

        for (;;) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            const event = JSON.parse(line.slice(6)) as SSEEvent;
            if (event.type === "log" && event.text) {
              setLogs((prev) => [...prev, event.text ?? ""]);
              const scrollToBottom = (): void => {
                if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
              };
              if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(scrollToBottom);
              } else {
                setTimeout(scrollToBottom, 0);
              }
            } else if (event.type === "done") {
              setDone("ok");
              setPreviewUrl(`/api/skills/${encodeURIComponent(skill.id)}/latest-image?t=${Date.now()}`);
            } else if (event.type === "error") {
              setLogs((prev) => [...prev, `✗ ${event.error ?? "未知错误"}`]);
              setDone("err");
            }
          }
        }
      } catch (e) {
        setLogs((prev) => [...prev, `✗ ${e instanceof Error ? e.message : String(e)}`]);
        setDone("err");
      } finally {
        setRunning(false);
      }
    })();
  };

  return (
    <div className={styles.skillCard}>
      <div className={styles.skillRow}>
        <div className={styles.skillInfo}>
          <code className={styles.skillId}>{skill.id}</code>
          <span className={styles.skillDesc}>{skill.description}</span>
        </div>
        <div className={styles.skillActions}>
          <button className={styles.runBtn} onClick={handleRun} disabled={running}>
            {running ? "运行中…" : "▶ 运行"}
          </button>
          {done === "ok" && <span className={styles.runOk}>✓ 完成</span>}
          {done === "err" && <span className={styles.runErr}>✗ 失败</span>}
        </div>
      </div>
      {skill.id === "daily-digest" && <DailyDigestConfigCard />}
      {logs.length > 0 && (
        <div className={styles.logPanel} ref={logRef}>
          {logs.map((line, i) => <div key={i} className={styles.logLine}>{line}</div>)}
        </div>
      )}
      {previewUrl && (
        <img
          className={styles.previewImg}
          src={previewUrl}
          alt="skill output"
          onError={() => { setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}

function DailyDigestConfigCard(): React.JSX.Element {
  const [fields, setFields] = useState<DailyDigestFields>({ queries: "" });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetchDailyDigestConfig()
      .then(setFields)
      .catch(() => {
        setStatus({ type: "err", msg: "加载 DailyDigest 配置失败" });
      })
      .finally(() => {
        setLoaded(true);
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
    void saveDailyDigestConfig(fields.queries)
      .then(() => {
        showStatus({ type: "ok", msg: "已保存，下一次运行 daily-digest 即生效" });
      })
      .catch((error: unknown) => {
        showStatus({ type: "err", msg: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <section className={styles.configCard}>
      <div className={styles.configHeader}>
        <div className={styles.configTitle}>DailyDigest 配置</div>
        <div className={styles.configHint}>
          搜索主题和手动运行放在同一张卡片里。保存后无需重启，直接点击上方「运行」即可按新配置生成。
        </div>
      </div>
      {loaded ? (
        <>
          <label className={styles.configLabel} htmlFor="daily-digest-queries">搜索主题（每行一个）</label>
          <textarea
            id="daily-digest-queries"
            className={styles.configInput}
            placeholder={"AI 教育\n生成式 AI 教育\n教育科技 AI\n教育 AI 公司\nOpenAI education"}
            value={fields.queries}
            onChange={(e) => setFields({ queries: e.target.value })}
            rows={6}
            autoComplete="off"
            spellCheck={false}
          />
          <div className={styles.configMeta}>skill 会按这些主题逐个搜索，再做国内 / 国际分类筛选。</div>
          <div className={styles.configActions}>
            <button className={styles.saveBtn} type="button" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存 DailyDigest 配置"}
            </button>
            {status && <span className={`${styles.saveStatus} ${styles[status.type]}`}>{status.msg}</span>}
          </div>
        </>
      ) : (
        <div className={styles.configMeta}>正在加载 DailyDigest 配置…</div>
      )}
    </section>
  );
}

/** Dedicated Skills tab — lists registered skills and allows manual runs with real-time log output. */
export function SkillsView(): React.JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([]);

  useEffect(() => { void fetchSkills().then(setSkills); }, []);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h2 className={styles.title}>Skills</h2>
        {skills.length === 0 && <p className={styles.empty}>无已注册 skill</p>}
        {skills.map((s) => <SkillRow key={s.id} skill={s} />)}
      </div>
    </div>
  );
}
