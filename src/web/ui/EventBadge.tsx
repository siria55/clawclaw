import { useEffect, useRef, useState } from "react";
import type { ToolEvent } from "./types";
import styles from "./EventBadge.module.css";

interface Props {
  event: ToolEvent;
}

export function EventBadge({ event }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCall = event.type === "tool_call";
  const isResult = event.type === "tool_result";
  const isError = event.type === "error";

  const accentClass = isCall
    ? styles.call
    : isResult
    ? styles.result
    : styles.error;

  const icon = isCall ? "⚙" : isResult ? "✓" : "✕";
  const label = isCall
    ? `tool_call  ${event.toolName ?? ""}`
    : isResult
    ? `tool_result  ${event.toolName ?? ""}`
    : "error";

  const preview = isError
    ? String(event.data)
    : typeof event.data === "object"
    ? JSON.stringify(event.data)
    : String(event.data);

  const short = preview.length > 60 ? preview.slice(0, 60) + "…" : preview;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(preview).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      setCopied(false);
    });
  };

  return (
    <div
      className={`${styles.badge} ${accentClass}`}
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
      aria-expanded={expanded}
    >
      <div className={styles.header}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.label}>{label}</span>
        {!expanded && <span className={styles.preview}>{short}</span>}
        {isError && (
          <button
            type="button"
            className={styles.copyBtn}
            aria-label="复制错误内容"
            onClick={(event) => {
              event.stopPropagation();
              handleCopy();
            }}
          >
            {copied ? "已复制" : "复制"}
          </button>
        )}
        <span className={styles.toggle}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <pre className={styles.detail}>
          {typeof event.data === "object"
            ? JSON.stringify(event.data, null, 2)
            : String(event.data)}
        </pre>
      )}
    </div>
  );
}
