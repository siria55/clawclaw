import { useState } from "react";
import type { ToolEvent } from "./types";
import styles from "./EventBadge.module.css";

interface Props {
  event: ToolEvent;
}

export function EventBadge({ event }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

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
