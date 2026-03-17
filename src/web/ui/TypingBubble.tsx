import styles from "./TypingBubble.module.css";

/** Animated three-dot waiting indicator shown on the assistant side while waiting for the first response token. */
export function TypingBubble(): React.JSX.Element {
  return (
    <div className={styles.bubble} aria-label="等待回复">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </div>
  );
}
