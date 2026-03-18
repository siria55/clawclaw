import { useState, useEffect, useRef } from "react";
import styles from "./SettingsView.module.css";

interface LLMFields {
  apiKey: string;
  baseURL: string;
  httpsProxy: string;
  model: string;
}

interface FeishuFields {
  appId: string;
  appSecret: string;
  verificationToken: string;
  encryptKey: string;
  chatId: string;
}

/** Full-page settings view. All config is saved server-side. */
export function SettingsView(): React.JSX.Element {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h2 className={styles.title}>设置</h2>
        <AgentSection />
        <LLMSection />
        <FeishuSection />
      </div>
    </div>
  );
}

interface AgentFields {
  name: string;
  systemPrompt: string;
  allowedPaths: string;  // newline-separated
}

/** Agent meta config — name and system prompt, saved to data/agent-config.json. */
function AgentSection(): React.JSX.Element {
  const [fields, setFields] = useState<AgentFields>({ name: "", systemPrompt: "", allowedPaths: "./data/skills" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/config/agent")
      .then((r) => r.json() as Promise<{ name?: string; systemPrompt?: string; allowedPaths?: string[] }>)
      .then((data) => {
        setFields((f) => ({
          name: data.name ?? f.name,
          systemPrompt: data.systemPrompt ?? f.systemPrompt,
          allowedPaths: data.allowedPaths?.join("\n") ?? f.allowedPaths,
        }));
      })
      .catch(() => { /* no config yet */ });
  }, []);

  const setField = (key: keyof AgentFields, value: string): void => {
    setFields((f) => ({ ...f, [key]: value }));
  };

  const save = (): void => {
    setSaving(true);
    fetch("/api/config/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fields.name,
        systemPrompt: fields.systemPrompt,
        allowedPaths: fields.allowedPaths.split("\n").map((p) => p.trim()).filter(Boolean),
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setStatus({ type: "ok", msg: "已保存，下一轮对话即生效" });
      })
      .catch((e: unknown) => {
        setStatus({ type: "err", msg: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        setSaving(false);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus(null), 4000);
      });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Agent</div>
      <div className={styles.sectionHint}>
        配置保存在服务端 data/agent-config.json，保存后下一轮对话即生效，无需重启。<br />
        留空则使用默认系统提示词。
      </div>
      <div className={styles.fields}>
        <Field label="名称" placeholder="debug-agent" value={fields.name} onChange={(v) => setField("name", v)} />
        <div className={styles.field}>
          <label className={styles.fieldLabel}>系统提示词（System Prompt）</label>
          <textarea
            className={styles.fieldInput}
            placeholder="你是一个有帮助的助手，回答简洁清晰。"
            value={fields.systemPrompt}
            onChange={(e) => setField("systemPrompt", e.target.value)}
            rows={6}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>允许读取的路径（每行一个）</label>
          <textarea
            className={styles.fieldInput}
            placeholder="./data/skills"
            value={fields.allowedPaths}
            onChange={(e) => setField("allowedPaths", e.target.value)}
            rows={3}
            autoComplete="off"
            spellCheck={false}
          />
          <span className={styles.fieldHint}>agent 的 read_file 工具只能读取这些目录下的文件，默认 ./data/skills</span>
        </div>
      </div>
      <div className={styles.saveRow}>
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存 Agent 配置"}
        </button>
        {status && <span className={`${styles.saveStatus} ${styles[status.type]}`}>{status.msg}</span>}
      </div>
    </div>
  );
}

/** LLM provider configuration — saved server-side to data/im-config.json. */
function LLMSection(): React.JSX.Element {
  const [fields, setFields] = useState<LLMFields>({ apiKey: "", baseURL: "", httpsProxy: "", model: "" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/config/llm")
      .then((r) => r.json() as Promise<Partial<LLMFields>>)
      .then((data) => {
        setFields((f) => ({
          apiKey: data.apiKey ?? f.apiKey,
          baseURL: data.baseURL ?? f.baseURL,
          httpsProxy: data.httpsProxy ?? f.httpsProxy,
          model: data.model ?? f.model,
        }));
      })
      .catch(() => { /* server may not have config yet */ });
  }, []);

  const setField = (key: keyof LLMFields, value: string): void => {
    setFields((f) => ({ ...f, [key]: value }));
  };

  const save = (): void => {
    setSaving(true);
    fetch("/api/config/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: fields.apiKey,
        baseURL: fields.baseURL,
        httpsProxy: fields.httpsProxy,
        model: fields.model,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setStatus({ type: "ok", msg: "已保存，立即生效" });
      })
      .catch((e: unknown) => {
        setStatus({ type: "err", msg: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        setSaving(false);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus(null), 4000);
      });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>模型（LLM）</div>
      <div className={styles.sectionHint}>
        配置保存在服务端 data/llm-config.json，保存后立即生效，无需重启。<br />
      </div>
      <div className={styles.fields}>
        <Field label="API Key" type="password" placeholder="sk-ant-..." value={fields.apiKey} onChange={(v) => setField("apiKey", v)} />
        <Field label="Base URL" placeholder="https://api.anthropic.com" value={fields.baseURL} onChange={(v) => setField("baseURL", v)} />
        <Field label="HTTPS Proxy" placeholder="http://127.0.0.1:7890" value={fields.httpsProxy} onChange={(v) => setField("httpsProxy", v)} />
        <Field label="Model" placeholder="claude-sonnet-4-6" value={fields.model} onChange={(v) => setField("model", v)} />
      </div>
      <div className={styles.saveRow}>
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存模型配置"}
        </button>
        {status && <span className={`${styles.saveStatus} ${styles[status.type]}`}>{status.msg}</span>}
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
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.fieldRow}>
        <input
          className={styles.fieldInput}
          type={isPassword && !show ? "password" : "text"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.eyeBtn}
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            aria-label={show ? "隐藏" : "显示"}
          >
            {show ? "🙈" : "👁"}
          </button>
        )}
      </div>
    </div>
  );
}
