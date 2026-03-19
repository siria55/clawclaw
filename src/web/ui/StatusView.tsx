import { useEffect, useRef, useState } from "react";
import styles from "./StatusView.module.css";

interface ConnectionStatus {
  platform: string;
  label: string;
  connected: boolean;
}

interface RuntimeFeishuStatus {
  configured: boolean;
  active: boolean;
  source: "storage" | "env" | "none";
  webhookPath: string;
}

interface StatusMetric {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

interface StatusFile {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  summary: string;
  updatedAt?: string;
  sizeBytes?: number;
}

interface StatusOverview {
  feishu: {
    runtime: RuntimeFeishuStatus;
    configuredInStorage: boolean;
    appId?: string;
    chatId?: string;
    hasAppSecret: boolean;
    hasVerificationToken: boolean;
    hasEncryptKey: boolean;
    permissionsHint: string;
  };
  metrics: StatusMetric[];
  configFiles: StatusFile[];
  lastIMEvent?: {
    platform: string;
    chatId: string;
    userId: string;
    timestamp: string;
    textPreview: string;
  };
}

interface SystemStatus {
  connections: ConnectionStatus[];
  overview?: StatusOverview;
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
  if (!res.ok) return { connections: [] };
  return res.json() as Promise<SystemStatus>;
}

async function fetchIMLog(since?: string): Promise<{ events: IMEvent[]; total: number }> {
  const url = since ? `/api/im-log?since=${since}` : "/api/im-log";
  const res = await fetch(url);
  if (!res.ok) return { events: [], total: 0 };
  return res.json() as Promise<{ events: IMEvent[]; total: number }>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "未落盘";
  return new Date(iso).toLocaleString("zh-CN");
}

function formatSize(sizeBytes: number | undefined): string {
  if (sizeBytes === undefined) return "-";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`;
}

function describeFeishuSource(source: RuntimeFeishuStatus["source"]): string {
  if (source === "storage") return "来自已保存配置";
  if (source === "env") return "来自环境变量";
  return "未启用";
}

export function StatusView(): React.JSX.Element {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [imEvents, setIMEvents] = useState<IMEvent[]>([]);
  const [imFilter, setIMFilter] = useState<"all" | "group" | "direct">("all");
  const lastIdRef = useRef<string | undefined>(undefined);

  const load = (): void => {
    setLoading(true);
    void fetchStatus().then((s) => setStatus(s)).finally(() => setLoading(false));
  };

  useEffect(() => {
    void fetchIMLog().then(({ events }) => {
      if (events.length > 0) {
        setIMEvents(events.slice(-50));
        lastIdRef.current = events[events.length - 1]?.id;
      }
    });
  }, []);

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

  const overview = status?.overview;
  const feishu = overview?.feishu;

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
          <h3 className={styles.sectionTitle}>运行概览</h3>
          <div className={styles.metricGrid}>
            {(overview?.metrics ?? []).map((metric) => (
              <div key={metric.key} className={styles.metricCard}>
                <span className={styles.metricLabel}>{metric.label}</span>
                <strong className={styles.metricValue}>{metric.value}</strong>
                <span className={styles.metricHint}>{metric.hint ?? ""}</span>
              </div>
            ))}
            {(overview?.metrics ?? []).length === 0 && <p className={styles.empty}>暂无运行概览</p>}
          </div>
          {overview?.lastIMEvent && (
            <div className={styles.lastEventCard}>
              <div className={styles.lastEventTop}>
                <span className={styles.lastEventTitle}>最近一条 IM 活动</span>
                <span className={styles.lastEventTime}>{formatDateTime(overview.lastIMEvent.timestamp)}</span>
              </div>
              <div className={styles.lastEventMeta}>
                <span>{overview.lastIMEvent.platform}</span>
                <span>会话 {overview.lastIMEvent.chatId}</span>
                <span>用户 {overview.lastIMEvent.userId || "-"}</span>
              </div>
              <p className={styles.lastEventText}>{overview.lastIMEvent.textPreview}</p>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>飞书概览</h3>
          {status?.connections.length === 0 && <p className={styles.empty}>未配置 IM 平台</p>}
          {status?.connections.map((c) => (
            <div key={c.platform} className={styles.connRow}>
              <span className={`${styles.dot} ${c.connected ? styles.dotOn : styles.dotOff}`} />
              <span className={styles.connLabel}>{c.label}</span>
              <span className={styles.connStatus}>{c.connected ? "已连接" : "未连接"}</span>
            </div>
          ))}
          {feishu && (
            <div className={styles.platformCard}>
              <div className={styles.platformHeader}>
                <strong className={styles.platformTitle}>飞书运行状态</strong>
                <span className={`${styles.platformBadge} ${feishu.runtime.active ? styles.platformOn : styles.platformOff}`}>
                  {feishu.runtime.active ? "运行中" : "未运行"}
                </span>
              </div>
              <div className={styles.platformGrid}>
                <InfoItem label="配置来源" value={describeFeishuSource(feishu.runtime.source)} />
                <InfoItem label="Webhook" value={feishu.runtime.webhookPath} mono />
                <InfoItem label="App ID" value={feishu.appId ?? "-"} mono />
                <InfoItem label="Chat ID" value={feishu.chatId ?? "-"} mono />
                <InfoItem label="App Secret" value={feishu.hasAppSecret ? "已配置" : "未配置"} />
                <InfoItem label="Verification Token" value={feishu.hasVerificationToken ? "已配置" : "未配置"} />
                <InfoItem label="Encrypt Key" value={feishu.hasEncryptKey ? "已配置" : "未配置"} />
                <InfoItem label="通讯录读取前提" value="需在飞书开放平台开通相应 read 权限" />
              </div>
              <p className={styles.platformHint}>{feishu.permissionsHint}</p>
            </div>
          )}
          {!status && !loading && <p className={styles.empty}>—</p>}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>配置文件</h3>
          <div className={styles.fileList}>
            {(overview?.configFiles ?? []).map((file) => (
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
            {(overview?.configFiles ?? []).length === 0 && <p className={styles.empty}>暂无配置文件信息</p>}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>IM 消息日志</h3>
            <div className={styles.imTabs}>
              {(["all", "group", "direct"] as const).map((f) => (
                <button key={f} className={`${styles.imTab} ${imFilter === f ? styles.imTabActive : ""}`} onClick={() => setIMFilter(f)}>
                  {f === "all" ? "全部" : f === "group" ? "群聊" : "直发"}
                </button>
              ))}
            </div>
          </div>
          {(() => {
            const filtered = [...imEvents].reverse().filter((e) => {
              if (imFilter === "group") return e.chatId.startsWith("oc_");
              if (imFilter === "direct") return e.chatId.startsWith("ou_");
              return true;
            });
            if (filtered.length === 0) return <p className={styles.empty}>暂无 IM 消息</p>;
            return filtered.map((e) => (
              <div key={e.id} className={styles.imCard}>
                <div className={styles.imMeta}>
                  <span className={styles.imPlatform}>{e.platform}</span>
                  {e.userId && <span className={styles.imId} title={`点击复制: ${e.userId}`} onClick={() => void navigator.clipboard.writeText(e.userId)}>用户 {e.userId.slice(0, 16)}</span>}
                  {e.chatId && <span className={styles.imId} title={`点击复制: ${e.chatId}`} onClick={() => void navigator.clipboard.writeText(e.chatId)}>会话 {e.chatId.slice(0, 16)}</span>}
                  <span className={styles.imTime}>{formatTime(e.timestamp)}</span>
                </div>
                <p className={styles.imText}>{e.text}</p>
                {e.replyText !== undefined && (
                  <p className={styles.imReply}>{e.replyText.slice(0, 120)}{e.replyText.length > 120 ? "…" : ""}</p>
                )}
              </div>
            ));
          })()}
        </section>
      </div>
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
