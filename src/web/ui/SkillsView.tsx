import { useState, useRef, useEffect } from "react";
import styles from "./SkillsView.module.css";

interface SkillInfo {
  id: string;
  description: string;
}

async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch("/api/skills");
  if (!res.ok) return [];
  const data = await res.json() as { skills: SkillInfo[] };
  return data.skills;
}

interface SSEEvent {
  type: "log" | "done" | "error";
  text?: string;
  error?: string;
}

function SkillRow({ skill }: { skill: SkillInfo }): React.JSX.Element {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<"ok" | "err" | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    return () => { readerRef.current?.cancel().catch(() => { /* ignore cancel error */ }); };
  }, []);

  const handleRun = (): void => {
    setRunning(true);
    setDone(null);
    setLogs([]);

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
              requestAnimationFrame(() => {
                if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
              });
            } else if (event.type === "done") {
              setDone("ok");
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
      {logs.length > 0 && (
        <div className={styles.logPanel} ref={logRef}>
          {logs.map((line, i) => <div key={i} className={styles.logLine}>{line}</div>)}
        </div>
      )}
    </div>
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
