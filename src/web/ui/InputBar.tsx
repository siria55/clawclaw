import { useRef, useState } from "react";
import styles from "./InputBar.module.css";

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function InputBar({ disabled, onSend }: Props): React.JSX.Element {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = (): void => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (): void => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className={styles.bar}>
      <textarea
        ref={textareaRef}
        className={styles.input}
        rows={1}
        placeholder="发送消息… (Enter 发送, Shift+Enter 换行)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={disabled}
      />
      <button
        className={styles.send}
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="发送"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M14.5 8L2 14.5V9.5L10.5 8L2 6.5V1.5L14.5 8Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
