import type { ClawConfig } from "./types";
import styles from "./SettingsView.module.css";

interface Props {
  config: ClawConfig;
  onChange: (config: ClawConfig) => void;
}

/** Full-page settings view (replaces SettingsPanel floating sidebar). */
export function SettingsView({ config, onChange }: Props): React.JSX.Element {
  const set = (key: keyof ClawConfig, value: string): void => {
    onChange({ ...config, [key]: value || undefined });
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h2 className={styles.title}>设置</h2>
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
      </div>
    </div>
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
