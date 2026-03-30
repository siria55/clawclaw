import { useEffect, useState } from "react";
import { SectionToc } from "./SectionToc";
import {
  fetchStatus,
  formatDateTime,
  formatSize,
  type StatusOverview,
  type SystemStatus,
} from "./status-data";
import styles from "./StatusView.module.css";

export function StatusView(): React.JSX.Element {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (): void => {
    setLoading(true);
    void fetchStatus().then((next) => setStatus(next)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const overview = status?.overview;
  const tocItems = [
    { id: "status-overview", label: "运行概览", hint: "指标、最近 IM 活动" },
    { id: "status-files", label: "配置文件", hint: "落盘状态、体积、摘要" },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.main}>
          <div className={styles.header}>
            <h2 className={styles.title}>系统状态</h2>
            <button className={styles.refreshBtn} onClick={load} aria-label="刷新" disabled={loading}>
              {loading ? "…" : "↺"}
            </button>
          </div>

          <OverviewSection overview={overview} />
          <ConfigFilesSection overview={overview} />
        </div>
        <SectionToc items={tocItems} />
      </div>
    </div>
  );
}

function OverviewSection(props: { overview: StatusOverview | undefined }): React.JSX.Element {
  return (
    <section id="status-overview" className={styles.section}>
      <h3 className={styles.sectionTitle}>运行概览</h3>
      <div className={styles.metricGrid}>
        {(props.overview?.metrics ?? []).map((metric) => (
          <div key={metric.key} className={styles.metricCard}>
            <span className={styles.metricLabel}>{metric.label}</span>
            <strong className={styles.metricValue}>{metric.value}</strong>
            <span className={styles.metricHint}>{metric.hint ?? ""}</span>
          </div>
        ))}
        {(props.overview?.metrics ?? []).length === 0 && <p className={styles.empty}>暂无运行概览</p>}
      </div>
      {props.overview?.lastIMEvent && <LastIMEventCard overview={props.overview} />}
    </section>
  );
}

function LastIMEventCard(props: { overview: StatusOverview }): React.JSX.Element {
  const lastEvent = props.overview.lastIMEvent;
  if (!lastEvent) return <></>;

  return (
    <div className={styles.lastEventCard}>
      <div className={styles.lastEventTop}>
        <span className={styles.lastEventTitle}>最近一条 IM 活动</span>
        <span className={styles.lastEventTime}>{formatDateTime(lastEvent.timestamp)}</span>
      </div>
      <div className={styles.lastEventMeta}>
        <span>{lastEvent.platform}</span>
        <span>会话 {formatNamedIdentity(lastEvent.chatName, lastEvent.chatId)}</span>
        <span>用户 {formatNamedIdentity(lastEvent.userName, lastEvent.userId || "-")}</span>
      </div>
      <p className={styles.lastEventText}>{lastEvent.textPreview}</p>
    </div>
  );
}

function ConfigFilesSection(props: { overview: StatusOverview | undefined }): React.JSX.Element {
  return (
    <section id="status-files" className={styles.section}>
      <h3 className={styles.sectionTitle}>配置文件</h3>
      <div className={styles.fileList}>
        {(props.overview?.configFiles ?? []).map((file) => (
          <div key={file.key} className={styles.fileCard}>
            <div className={styles.fileHeader}>
              <strong className={styles.fileTitle}>{file.label}</strong>
              <span className={`${styles.fileBadge} ${file.exists ? styles.fileExists : styles.fileMissing}`}>
                {file.exists ? "已落盘" : "未落盘"}
              </span>
            </div>
            <p className={styles.fileSummary}>{file.summary}</p>
            <div className={styles.fileMeta}>
              <span className={styles.filePath}>{file.path}</span>
              <span>{formatDateTime(file.updatedAt)}</span>
              <span>{formatSize(file.sizeBytes)}</span>
            </div>
          </div>
        ))}
        {(props.overview?.configFiles ?? []).length === 0 && <p className={styles.empty}>暂无配置文件信息</p>}
      </div>
    </section>
  );
}

function formatNamedIdentity(name: string | undefined, id: string): string {
  return name ? `${name}（${id}）` : id;
}
