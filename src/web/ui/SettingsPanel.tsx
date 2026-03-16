import { useEffect, useRef } from "react";
import type { ClawConfig } from "./types";
import styles from "./SettingsPanel.module.css";

interface Props {
  open: boolean;
  config: ClawConfig;
  onChange: (config: ClawConfig) => void;
  onClose: () => void;
}

export function SettingsPanel({ open, config, onChange, onClose }: Props): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const set = (key: keyof ClawConfig, value: string): void => {
    onChange({ ...config, [key]: value || undefined });
  };

  if (!open) return <></>;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <aside ref={panelRef} className={styles.panel} role="dialog" aria-label="设置">
        <div className={styles.header}>
          <h2 className={styles.title}>设置</h2>
          <button className={styles.close} onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <p className={styles.hint}>
          配置将通过请求头发送给服务端，覆盖服务端默认的 LLM 配置。<br />
          保存在 localStorage，刷新后自动恢复。
        </p>

        <div className={styles.fields}>
          <Field
            label="API Key"
            type="password"
            placeholder="sk-ant-..."
            value={config.apiKey ?? ""}
            onChange={(v) => set("apiKey", v)}
          />
          <Field
            label="Base URL"
            placeholder="https://api.anthropic.com"
            value={config.baseURL ?? ""}
            onChange={(v) => set("baseURL", v)}
          />
          <Field
            label="HTTPS Proxy"
            placeholder="http://127.0.0.1:7890"
            value={config.httpsProxy ?? ""}
            onChange={(v) => set("httpsProxy", v)}
          />
          <Field
            label="Model"
            placeholder="claude-sonnet-4-6"
            value={config.model ?? ""}
            onChange={(v) => set("model", v)}
          />
        </div>

        <div className={styles.footer}>
          <button className={styles.clearBtn} onClick={() => onChange({})}>清除配置</button>
        </div>
      </aside>
    </>
  );
}

interface FieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}

function Field({ label, placeholder, value, onChange, type = "text" }: FieldProps): React.JSX.Element {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <input
        className={styles.fieldInput}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
