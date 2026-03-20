import { useEffect, useRef, useState } from "react";
import { SectionToc } from "./SectionToc";
import {
  describeEventType,
  describeFeishuSource,
  fetchIMLog,
  fetchStatus,
  formatDateTime,
  formatTime,
  type IMEvent,
  type StatusOverview,
  type SystemStatus,
} from "./status-data";
import styles from "./StatusView.module.css";

type IMFilter = "all" | "group" | "direct";
type IMSubTab = "status" | "messages";

export function IMView(): React.JSX.Element {
  const [subTab, setSubTab] = useState<IMSubTab>(getInitialSubTab);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [events, setEvents] = useState<IMEvent[]>([]);
  const [filter, setFilter] = useState<IMFilter>("all");
  const [logLoading, setLogLoading] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);
  const tocItems = [
    { id: "im-status-connections", label: "平台连接", hint: "飞书 / 企业微信运行态" },
    { id: "im-status-feishu", label: "飞书运行", hint: "凭证来源、权限、Webhook" },
    { id: "im-status-chats", label: "群聊摘要", hint: "已加入群、最近事件、加入时间" },
  ];

  const loadStatus = (): void => {
    setStatusLoading(true);
    void fetchStatus().then((next) => setStatus(next)).finally(() => setStatusLoading(false));
  };

  const load = (since?: string, replace = false): void => {
    if (!since) setLogLoading(true);
    void fetchIMLog(since).then(({ events: nextEvents }) => {
      if (replace) {
        setEvents(nextEvents.slice(-50));
      } else if (nextEvents.length > 0) {
        setEvents((prev) => [...prev, ...nextEvents].slice(-50));
      }
      lastIdRef.current = nextEvents[nextEvents.length - 1]?.id;
    }).finally(() => {
      if (!since) setLogLoading(false);
    });
  };

  useEffect(() => {
    const syncSubTabFromHash = (): void => {
      if (window.location.hash === "#im-status") {
        setSubTab("status");
        return;
      }
      if (window.location.hash === "#im") {
        setSubTab("messages");
      }
    };
    window.addEventListener("hashchange", syncSubTabFromHash);
    return () => window.removeEventListener("hashchange", syncSubTabFromHash);
  }, []);

  useEffect(() => {
    if (subTab === "status" && !status && !statusLoading) {
      loadStatus();
    }
    if (subTab === "messages" && events.length === 0 && !logLoading) {
      load(undefined, true);
    }
  }, [events.length, logLoading, status, statusLoading, subTab]);

  useEffect(() => {
    if (subTab !== "messages") return;
    const timer = setInterval(() => load(lastIdRef.current), 3000);
    return () => clearInterval(timer);
  }, [subTab]);

  const refresh = (): void => {
    if (subTab === "status") {
      loadStatus();
      return;
    }
    lastIdRef.current = undefined;
    load(undefined, true);
  };
  const refreshing = subTab === "status" ? statusLoading : logLoading;

  return (
    <div className={styles.page}>
      <div className={subTab === "status" ? styles.inner : styles.innerSingle}>
        <div className={styles.main}>
          <div className={styles.header}>
            <h2 className={styles.title}>IM</h2>
            <button
              className={styles.refreshBtn}
              onClick={refresh}
              aria-label="刷新"
              disabled={refreshing}
            >
              {refreshing ? "…" : "↺"}
            </button>
          </div>
          <div className={styles.imTabs}>
            {(["status", "messages"] as IMSubTab[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.imTab} ${subTab === value ? styles.imTabActive : ""}`}
                onClick={() => setSubTab(value)}
              >
                {value === "status" ? "状态" : "消息"}
              </button>
            ))}
          </div>
          {subTab === "status" ? (
            <>
              <ConnectionsSection status={status} />
              <FeishuRuntimeSection overview={status?.overview} />
              <ChatSummarySection overview={status?.overview} />
            </>
          ) : (
            <section id="im-log" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>IM 消息日志</h3>
                <div className={styles.imTabs}>
                  {(["all", "group", "direct"] as IMFilter[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`${styles.imTab} ${filter === value ? styles.imTabActive : ""}`}
                      onClick={() => setFilter(value)}
                    >
                      {value === "all" ? "全部" : value === "group" ? "群聊" : "直发"}
                    </button>
                  ))}
                </div>
              </div>
              <IMEventList events={events} filter={filter} />
            </section>
          )}
        </div>
        {subTab === "status" ? <SectionToc items={tocItems} /> : null}
      </div>
    </div>
  );
}

function getInitialSubTab(): IMSubTab {
  return window.location.hash === "#im-status" ? "status" : "messages";
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

function IMEventList(props: { events: IMEvent[]; filter: IMFilter }): React.JSX.Element {
  const filtered = [...props.events].reverse().filter((event) => matchesFilter(event, props.filter));

  if (filtered.length === 0) {
    return <p className={styles.empty}>暂无 IM 消息</p>;
  }

  return (
    <>
      {filtered.map((event) => (
        <div key={event.id} className={styles.imCard}>
          <div className={styles.imMeta}>
            <span className={styles.imPlatform}>{event.platform}</span>
            {event.eventType && <span className={styles.imEventType}>{describeEventType(event.eventType)}</span>}
            {event.chatName && <span className={styles.imChatName}>{event.chatName}</span>}
            {event.userId && <CopyId prefix="用户" value={event.userId} />}
            {event.chatId && <CopyId prefix="会话" value={event.chatId} />}
            <span className={styles.imTime}>{formatTime(event.timestamp)}</span>
          </div>
          <p className={styles.imText}>{event.text}</p>
          {event.replyText !== undefined && (
            <p className={styles.imReply}>{event.replyText.slice(0, 120)}{event.replyText.length > 120 ? "…" : ""}</p>
          )}
        </div>
      ))}
    </>
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

function CopyId(props: { prefix: string; value: string }): React.JSX.Element {
  return (
    <span
      className={styles.imId}
      title={`点击复制: ${props.value}`}
      onClick={() => void navigator.clipboard.writeText(props.value)}
    >
      {props.prefix} {props.value.slice(0, 16)}
    </span>
  );
}

function matchesFilter(event: IMEvent, filter: IMFilter): boolean {
  if (filter === "group") return event.chatId.startsWith("oc_");
  if (filter === "direct") return event.chatId.startsWith("ou_");
  return true;
}
