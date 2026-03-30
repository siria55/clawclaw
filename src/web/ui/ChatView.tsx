import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatEntry } from "./types";
import { EventBadge } from "./EventBadge";
import { ThinkingBubble } from "./ThinkingBubble";
import { TypingBubble } from "./TypingBubble";
import styles from "./ChatView.module.css";

interface Props {
  entries: ChatEntry[];
  streaming: boolean;
}

export function ChatView({ entries, streaming }: Props): React.JSX.Element {
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
        const isUser = message.role === "user";
        return (
          <div
            key={message.id}
            className={`${styles.bubble} ${
              isUser ? styles.user : styles.assistant
            } ${message.streaming ? styles.streaming : ""}`}
          >
            {!isUser && <CopyAssistantButton content={message.content} />}
            {isUser
              ? message.content
              : <ReactMarkdown className={styles.md}>{message.content}</ReactMarkdown>
            }
          </div>
        );
      })}
      {streaming && !entries.some(
        (e) => e.kind === "message" && e.message.role === "assistant" && e.message.streaming === true,
      ) && <TypingBubble />}
      <div ref={bottomRef} />
    </div>
  );
}

function CopyAssistantButton(props: { content: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(props.content).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      setCopied(false);
    });
  };

  return (
    <div className={styles.assistantActions}>
      <button
        type="button"
        className={styles.copyBtn}
        onClick={handleCopy}
        aria-label="复制 AI 回复"
      >
        {copied ? "已复制" : "复制"}
      </button>
    </div>
  );
}
