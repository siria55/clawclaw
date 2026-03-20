import { useEffect, useState } from "react";
import { SectionToc } from "./SectionToc";
import {
  describeEventType,
  describeFeishuSource,
  fetchStatus,
  formatDateTime,
  type StatusOverview,
  type SystemStatus,
} from "./status-data";
import styles from "./StatusView.module.css";

export function IMStatusView(): React.JSX.Element {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const tocItems = [
    { id: "im-status-connections", label: "平台连接", hint: "飞书 / 企业微信运行态" },
    { id: "im-status-feishu", label: "飞书运行", hint: "凭证来源、权限、Webhook" },
    { id: "im-status-chats", label: "群聊摘要", hint: "已加入群、最近事件、加入时间" },
  ];

  const load = (): void => {
    setLoading(true);
    void fetchStatus().then((next) => setStatus(next)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.main}>
          <div className={styles.header}>
            <h2 className={styles.title}>IM 状态</h2>
            <button className={styles.refreshBtn} onClick={load} aria-label="刷新" disabled={loading}>
              {loading ? "…" : "↺"}
            </button>
          </div>
          <ConnectionsSection status={status} />
          <FeishuRuntimeSection overview={status?.overview} />
          <ChatSummarySection overview={status?.overview} />
        </div>
        <SectionToc items={tocItems} />
      </div>
    </div>
  );
}

function ConnectionsSection(props: { status: SystemStatus | null }): React.JSX.Element {
  return (
    <section id="im-status-connections" className={styles.section}>
      <h3 className={styles.sectionTitle}>平台连接</h3>
      {props.status?.connections.length === 0 && <p className={styles.empty}>未配置 IM 平台</p>}
      {props.status?.connections.map((connection) => (
        <div key={connection.platform} className={styles.connRow}>
          <span className={`${styles.dot} ${connection.connected ? styles.dotOn : styles.dotOff}`} />
          <span className={styles.connLabel}>{connection.label}</span>
          <span className={styles.connStatus}>{connection.connected ? "已连接" : "未连接"}</span>
        </div>
      ))}
      {!props.status && <p className={styles.empty}>—</p>}
    </section>
  );
}

function FeishuRuntimeSection(props: { overview: StatusOverview | undefined }): React.JSX.Element {
  const feishu = props.overview?.feishu;

  return (
    <section id="im-status-feishu" className={styles.section}>
      <h3 className={styles.sectionTitle}>飞书运行</h3>
      {!feishu && <p className={styles.empty}>暂无飞书运行信息</p>}
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
    </section>
  );
}

function ChatSummarySection(props: { overview: StatusOverview | undefined }): React.JSX.Element {
  const chats = props.overview?.chats ?? [];

  return (
    <section id="im-status-chats" className={styles.section}>
      <h3 className={styles.sectionTitle}>群聊摘要</h3>
      {chats.length === 0 && <p className={styles.empty}>暂无群聊记录</p>}
      {chats.length > 0 && (
        <div className={styles.chatList}>
          {chats.map((chat) => (
            <div key={chat.chatId} className={styles.chatCard}>
              <div className={styles.chatHeader}>
                <strong className={styles.chatTitle}>{chat.chatName ?? "未命名群"}</strong>
                <span className={`${styles.chatBadge} ${chat.active ? styles.chatActive : styles.chatInactive}`}>
                  {chat.active ? "已加入" : "已移出"}
                </span>
              </div>
              <div className={styles.chatMeta}>
                <span className={styles.mono}>{chat.chatId}</span>
                <span>最近事件：{describeEventType(chat.lastEventType)}</span>
                <span>最近时间：{formatDateTime(chat.lastSeen)}</span>
                <span>加入时间：{formatDateTime(chat.joinedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
