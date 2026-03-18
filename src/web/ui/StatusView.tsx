import { useEffect, useRef, useState } from "react";
import styles from "./StatusView.module.css";

interface CronJobStatus {
  id: string;
  schedule: string;
  message: string;
  timezone: string;
}

interface ConnectionStatus {
  platform: string;
  label: string;
  connected: boolean;
}

interface SystemStatus {
  cronJobs: CronJobStatus[];
  connections: ConnectionStatus[];
}

interface IMEvent {
  id: string;
  platform: string;
  userId: string;
  chatId: string;
  text: string;
  replyText: string | undefined;
  timestamp: string;
}

async function fetchStatus(): Promise<SystemStatus> {
  const res = await fetch("/api/status");
  return res.json() as Promise<SystemStatus>;
}

async function fetchIMLog(since?: string): Promise<{ events: IMEvent[]; total: number }> {
  const url = since ? `/api/im-log?since=${since}` : "/api/im-log";
  const res = await fetch(url);
  return res.json() as Promise<{ events: IMEvent[]; total: number }>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function StatusView(): React.JSX.Element {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [imEvents, setIMEvents] = useState<IMEvent[]>([]);
  const lastIdRef = useRef<string | undefined>(undefined);

  const load = (): void => {
    setLoading(true);
    void fetchStatus()
      .then((s) => setStatus(s))
      .finally(() => setLoading(false));
  };

  // Initial IM log load
  useEffect(() => {
    void fetchIMLog().then(({ events }) => {
      if (events.length > 0) {
        setIMEvents(events.slice(-50));
        lastIdRef.current = events[events.length - 1]?.id;
      }
    });
  }, []);

  // Poll for new IM events every 3s
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchIMLog(lastIdRef.current).then(({ events }) => {
        if (events.length > 0) {
          setIMEvents((prev) => [...prev, ...events].slice(-50));
          lastIdRef.current = events[events.length - 1]?.id;
        }
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { load(); }, []);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <h2 className={styles.title}>系统状态</h2>
          <button className={styles.refreshBtn} onClick={load} aria-label="刷新" disabled={loading}>
            {loading ? "…" : "↺"}
          </button>
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>IM 连接</h3>
          {status?.connections.length === 0 && (
            <p className={styles.empty}>未配置 IM 平台</p>
          )}
          {status?.connections.map((c) => (
            <div key={c.platform} className={styles.connRow}>
              <span className={`${styles.dot} ${c.connected ? styles.dotOn : styles.dotOff}`} />
              <span className={styles.connLabel}>{c.label}</span>
              <span className={styles.connStatus}>{c.connected ? "已连接" : "未连接"}</span>
            </div>
          ))}
          {!status && !loading && <p className={styles.empty}>—</p>}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Cron 任务</h3>
          {status?.cronJobs.length === 0 && (
            <p className={styles.empty}>无已注册任务</p>
          )}
          {status?.cronJobs.map((job) => (
            <div key={job.id} className={styles.cronCard}>
              <div className={styles.cronTop}>
                <span className={styles.cronId}>{job.id}</span>
                <code className={styles.cronExpr}>{job.schedule}</code>
              </div>
              <p className={styles.cronMsg}>{job.message}</p>
              <p className={styles.cronTz}>{job.timezone}</p>
            </div>
          ))}
          {!status && !loading && <p className={styles.empty}>—</p>}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>IM 消息日志</h3>
          {imEvents.length === 0 && <p className={styles.empty}>暂无 IM 消息</p>}
          {[...imEvents].reverse().map((e) => (
            <div key={e.id} className={styles.imCard}>
              <div className={styles.imMeta}>
                <span className={styles.imPlatform}>{e.platform}</span>
                <span className={styles.imId} title={e.userId}>用户 {e.userId.slice(0, 12)}</span>
                <span className={styles.imId} title={e.chatId}>群 {e.chatId.slice(0, 12)}</span>
                <span className={styles.imTime}>{formatTime(e.timestamp)}</span>
              </div>
              <p className={styles.imText}>{e.text}</p>
              {e.replyText !== undefined && (
                <p className={styles.imReply}>{e.replyText.slice(0, 120)}{e.replyText.length > 120 ? "…" : ""}</p>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
