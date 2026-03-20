import { useEffect, useRef, useState } from "react";
import {
  describeEventType,
  fetchIMLog,
  formatTime,
  type IMEvent,
} from "./status-data";
import styles from "./StatusView.module.css";

type IMFilter = "all" | "group" | "direct";

export function IMView(): React.JSX.Element {
  const [events, setEvents] = useState<IMEvent[]>([]);
  const [filter, setFilter] = useState<IMFilter>("all");
  const [loading, setLoading] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);

  const load = (since?: string, replace = false): void => {
    if (!since) setLoading(true);
    void fetchIMLog(since).then(({ events: nextEvents }) => {
      if (nextEvents.length === 0) return;
      setEvents((prev) => replace ? nextEvents.slice(-50) : [...prev, ...nextEvents].slice(-50));
      lastIdRef.current = nextEvents[nextEvents.length - 1]?.id;
    }).finally(() => {
      if (!since) setLoading(false);
    });
  };

  useEffect(() => { load(undefined, true); }, []);

  useEffect(() => {
    const timer = setInterval(() => load(lastIdRef.current), 3000);
    return () => clearInterval(timer);
  }, []);

  const refresh = (): void => {
    lastIdRef.current = undefined;
    load(undefined, true);
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.main}>
          <div className={styles.header}>
            <h2 className={styles.title}>IM 消息</h2>
            <button className={styles.refreshBtn} onClick={refresh} aria-label="刷新" disabled={loading}>
              {loading ? "…" : "↺"}
            </button>
          </div>
          <section id="im-log" className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>IM 消息日志</h3>
              <div className={styles.imTabs}>
                {(["all", "group", "direct"] as IMFilter[]).map((value) => (
                  <button
                    key={value}
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
        </div>
      </div>
    </div>
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
