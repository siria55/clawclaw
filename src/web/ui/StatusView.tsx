import { useEffect, useState } from "react";
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

/** Fetch system status from /api/status */
async function fetchStatus(): Promise<SystemStatus> {
  const res = await fetch("/api/status");
  return res.json() as Promise<SystemStatus>;
}

/** Full-page status view (replaces StatusPanel floating sidebar). */
export function StatusView(): React.JSX.Element {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (): void => {
    setLoading(true);
    void fetchStatus()
      .then((s) => setStatus(s))
      .finally(() => setLoading(false));
  };

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
      </div>
    </div>
  );
}
