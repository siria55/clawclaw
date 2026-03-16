import { useEffect, useRef } from "react";
import type { ChatEntry } from "./types";
import { EventBadge } from "./EventBadge";
import { ThinkingBubble } from "./ThinkingBubble";
import styles from "./ChatView.module.css";

interface Props {
  entries: ChatEntry[];
}

export function ChatView({ entries }: Props): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className={styles.container}>
      {entries.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>clawclaw debug console</p>
          <p className={styles.emptyHint}>发送消息开始对话</p>
        </div>
      )}

      {entries.map((entry) => {
        if (entry.kind === "event") {
          return <EventBadge key={entry.event.id} event={entry.event} />;
        }
        if (entry.kind === "thinking") {
          return <ThinkingBubble key={entry.id} item={entry} />;
        }
        const { message } = entry;
        return (
          <div
            key={message.id}
            className={`${styles.bubble} ${
              message.role === "user" ? styles.user : styles.assistant
            } ${message.streaming ? styles.streaming : ""}`}
          >
            {message.content}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
