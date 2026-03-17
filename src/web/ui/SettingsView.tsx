import { useEffect, useRef, useState } from "react";
import type { ClawConfig } from "./types";
import styles from "./SettingsView.module.css";

interface FeishuFields {
  appId: string;
  appSecret: string;
  verificationToken: string;
  encryptKey: string;
  chatId: string;
}

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

        <FeishuSection />

        <div className={styles.footer}>
          <button className={styles.clearBtn} onClick={() => onChange({})}>清除配置</button>
        </div>
      </div>
    </div>
  );
}

/** Feishu IM configuration section — saved server-side to data/im-config.json. */
function FeishuSection(): React.JSX.Element {
  const [fields, setFields] = useState<FeishuFields>({
    appId: "",
    appSecret: "",
    verificationToken: "",
    encryptKey: "",
    chatId: "",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/im-config")
      .then((r) => r.json() as Promise<{ feishu?: Partial<FeishuFields> }>)
      .then((data) => {
        if (data.feishu) {
          setFields((f) => ({
            appId: data.feishu?.appId ?? f.appId,
            appSecret: data.feishu?.appSecret ?? f.appSecret,
            verificationToken: data.feishu?.verificationToken ?? f.verificationToken,
            encryptKey: data.feishu?.encryptKey ?? f.encryptKey,
            chatId: data.feishu?.chatId ?? f.chatId,
          }));
        }
      })
      .catch(() => { /* server may not have im-config yet */ });
  }, []);

  const setField = (key: keyof FeishuFields, value: string): void => {
    setFields((f) => ({ ...f, [key]: value }));
  };

  const save = (): void => {
    setSaving(true);
    fetch("/api/im-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feishu: {
          appId: fields.appId,
          appSecret: fields.appSecret,
          verificationToken: fields.verificationToken,
          ...(fields.encryptKey ? { encryptKey: fields.encryptKey } : {}),
          ...(fields.chatId ? { chatId: fields.chatId } : {}),
        },
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setStatus({ type: "ok", msg: "已保存，飞书 Webhook 立即生效" });
      })
      .catch((e: unknown) => {
        setStatus({ type: "err", msg: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        setSaving(false);
        if (statusTimer.current) clearTimeout(statusTimer.current);
        statusTimer.current = setTimeout(() => setStatus(null), 4000);
      });
  };

  const canSave = !saving && !!(fields.appId && fields.appSecret && fields.verificationToken)
    && !(fields.appId.endsWith("****") && fields.appSecret.endsWith("****") && fields.verificationToken.endsWith("****"));

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>飞书（Feishu）</div>
      <div className={styles.sectionHint}>
        配置保存在服务端 data/im-config.json，保存后立即生效，无需重启。<br />
        已保存的敏感字段显示为脱敏值（如 cli_****），修改后重新保存即可更新。
      </div>
      <div className={styles.fields}>
        <Field
          label="App ID"
          placeholder="cli_xxxxxxxxxx"
          value={fields.appId}
          onChange={(v) => setField("appId", v)}
        />
        <Field
          label="App Secret"
          type="password"
          placeholder="xxxxxxxxxxxxxxxx"
          value={fields.appSecret}
          onChange={(v) => setField("appSecret", v)}
        />
        <Field
          label="Verification Token"
          type="password"
          placeholder="xxxxxxxxxxxxxxxx"
          value={fields.verificationToken}
          onChange={(v) => setField("verificationToken", v)}
        />
        <Field
          label="Encrypt Key（可选）"
          type="password"
          placeholder="留空则不启用签名验证"
          value={fields.encryptKey}
          onChange={(v) => setField("encryptKey", v)}
        />
        <Field
          label="Chat ID（Cron 推送目标，可选）"
          placeholder="oc_xxxxxxxxxx"
          value={fields.chatId}
          onChange={(v) => setField("chatId", v)}
        />
      </div>
      <div className={styles.saveRow}>
        <button className={styles.saveBtn} onClick={save} disabled={!canSave}>
          {saving ? "保存中…" : "保存飞书配置"}
        </button>
        {status && (
          <span className={`${styles.saveStatus} ${styles[status.type]}`}>
            {status.msg}
          </span>
        )}
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
