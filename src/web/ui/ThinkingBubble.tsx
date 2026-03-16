import { useState } from "react";
import type { ThinkingItem } from "./types";
import styles from "./ThinkingBubble.module.css";

interface Props {
  item: ThinkingItem;
}

export function ThinkingBubble({ item }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`${styles.bubble} ${item.streaming ? styles.streaming : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
      aria-expanded={expanded}
    >
      <div className={styles.header}>
        <span className={styles.icon}>💭</span>
        <span className={styles.label}>思考过程</span>
        {!expanded && item.text && (
          <span className={styles.preview}>
            {item.text.length > 60 ? item.text.slice(0, 60) + "…" : item.text}
          </span>
        )}
        <span className={styles.toggle}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <p className={styles.detail}>{item.text}</p>
      )}
    </div>
  );
}
