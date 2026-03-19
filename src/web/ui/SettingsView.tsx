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

interface DailyDigestFields {
  queries: string;
}

interface MountedDocFields {
  id: string;
  title: string;
  url: string;
  enabled: boolean;
  syncedAt?: string;
  excerpt?: string;
}

/** Full-page settings view. All config is saved server-side. */
export function SettingsView(): React.JSX.Element {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h2 className={styles.title}>设置</h2>
        <AgentSection />
        <MountedDocsSection />
        <DailyDigestSection />
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

const DEFAULT_ALLOWED_PATHS = "./data/skills\n./data/agent/feishu-docs";

/** Agent meta config — name and system prompt, saved to data/agent-config.json. */
function AgentSection(): React.JSX.Element {
  const [fields, setFields] = useState<AgentFields>({ name: "", systemPrompt: "", allowedPaths: DEFAULT_ALLOWED_PATHS });
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

function MountedDocsSection(): React.JSX.Element {
  const [docs, setDocs] = useState<MountedDocFields[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | "all" | undefined>(undefined);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = (type: "ok" | "err", msg: string): void => {
    setStatus({ type, msg });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 4000);
  };

  const load = (): void => {
    fetch("/api/config/feishu-docs")
      .then((r) => r.json() as Promise<{
        docs?: MountedDocFields[];
        syncedDocs?: Array<{ id: string; syncedAt?: string; excerpt?: string }>;
      }>)
      .then((data) => {
        const synced = new Map((data.syncedDocs ?? []).map((doc) => [doc.id, doc]));
        setDocs((data.docs ?? []).map((doc) => ({
          ...doc,
          syncedAt: synced.get(doc.id)?.syncedAt,
          excerpt: synced.get(doc.id)?.excerpt,
        })));
      })
      .catch(() => { /* no config yet */ });
  };

  useEffect(() => {
    load();
  }, []);

  const updateDoc = (id: string, patch: Partial<MountedDocFields>): void => {
    setDocs((items) => items.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)));
  };

  const addDoc = (): void => {
    setDocs((items) => [...items, {
      id: globalThis.crypto?.randomUUID?.() ?? `doc-${Date.now()}`,
      title: "",
      url: "",
      enabled: true,
    }]);
  };

  const removeDoc = (id: string): void => {
    setDocs((items) => items.filter((doc) => doc.id !== id));
  };

  const save = (): void => {
    setSaving(true);
    fetch("/api/config/feishu-docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docs: docs.map((doc) => ({
          id: doc.id,
          title: doc.title,
          url: doc.url,
          enabled: doc.enabled,
        })),
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text() || `HTTP ${r.status}`);
        load();
        showStatus("ok", "已保存文档挂载配置");
      })
      .catch((e: unknown) => {
        showStatus("err", e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const sync = (id?: string): void => {
    setSyncingId(id ?? "all");
    fetch("/api/config/feishu-docs/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    })
      .then((r) => r.json() as Promise<{ ok: boolean; results: Array<{ title: string; ok: boolean; error?: string }> }>)
      .then((data) => {
        load();
        const failed = data.results.filter((item) => !item.ok);
        if (failed.length === 0) {
          showStatus("ok", id ? "文档已同步" : `已同步 ${data.results.length} 篇文档`);
          return;
        }
        showStatus("err", failed.map((item) => `${item.title}: ${item.error ?? "同步失败"}`).join("；"));
      })
      .catch((e: unknown) => {
        showStatus("err", e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setSyncingId(undefined);
      });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>飞书文档资料</div>
      <div className={styles.sectionHint}>
        挂载公开可访问的飞书文档链接。服务端会用 Playwright 打开页面并提取正文，Agent 会按问题检索命中文档片段后再回答。<br />
        建议先保存，再点击同步；同步后文档缓存保存在 `data/agent/feishu-docs/`。
      </div>
      <div className={styles.docList}>
        {docs.map((doc) => (
          <div key={doc.id} className={styles.docCard}>
            <div className={styles.docHeader}>
              <strong className={styles.docTitle}>{doc.title || "未命名文档"}</strong>
              <div className={styles.docActions}>
                <label className={styles.docToggle}>
                  <input type="checkbox" checked={doc.enabled} onChange={(e) => updateDoc(doc.id, { enabled: e.target.checked })} />
                  启用
                </label>
                <button className={styles.smallBtn} onClick={() => sync(doc.id)} disabled={syncingId !== undefined}>
                  {syncingId === doc.id ? "同步中…" : "同步"}
                </button>
                <button className={styles.smallBtn} onClick={() => removeDoc(doc.id)}>删除</button>
              </div>
            </div>
            <div className={styles.fields}>
              <Field label="文档名称" placeholder="请假制度 / 客服 SOP" value={doc.title} onChange={(value) => updateDoc(doc.id, { title: value })} />
              <Field label="文档 URL" placeholder="https://xxx.feishu.cn/wiki/..." value={doc.url} onChange={(value) => updateDoc(doc.id, { url: value })} />
            </div>
            <div className={styles.docMeta}>
              <span>{doc.syncedAt ? `最近同步：${new Date(doc.syncedAt).toLocaleString("zh-CN")}` : "尚未同步"}</span>
              {doc.excerpt && <span className={styles.docExcerpt}>{doc.excerpt}</span>}
            </div>
          </div>
        ))}
        {docs.length === 0 && <div className={styles.fieldHint}>暂无挂载文档。保存并同步后，Agent 会在相关问题里自动引用这些文档内容。</div>}
      </div>
      <div className={styles.saveRow}>
        <button className={styles.clearBtn} onClick={addDoc}>+ 新增文档</button>
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存文档挂载"}
        </button>
        <button className={styles.saveBtn} onClick={() => sync()} disabled={syncingId !== undefined || docs.length === 0}>
          {syncingId === "all" ? "同步中…" : "同步全部"}
        </button>
        {status && <span className={`${styles.saveStatus} ${styles[status.type]}`}>{status.msg}</span>}
      </div>
    </div>
  );
}

/** DailyDigest skill config — browser search topics, saved to data/skills/daily-digest/config.json. */
function DailyDigestSection(): React.JSX.Element {
  const [fields, setFields] = useState<DailyDigestFields>({ queries: "" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/config/daily-digest")
      .then((r) => r.json() as Promise<{ queries?: string[] }>)
      .then((data) => {
        setFields({
          queries: data.queries?.join("\n") ?? "",
        });
      })
      .catch(() => { /* server may not have config yet */ });
  }, []);

  const save = (): void => {
    setSaving(true);
    fetch("/api/config/daily-digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: fields.queries.split("\n").map((query) => query.trim()).filter(Boolean),
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setStatus({ type: "ok", msg: "已保存，下一次运行 daily-digest 即生效" });
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
      <div className={styles.sectionTitle}>DailyDigest</div>
      <div className={styles.sectionHint}>
        配置保存在服务端 `data/skills/daily-digest/config.json`，保存后无需重启，下一次运行 skill 即生效。<br />
        每行一个搜索主题，建议同时包含国内和国际主题。
      </div>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>搜索主题（每行一个）</label>
          <textarea
            className={styles.fieldInput}
            placeholder={"国内AI科技\n中国创业投资\n中国互联网平台\n美国OpenAI\n美国英伟达AI"}
            value={fields.queries}
            onChange={(e) => setFields({ queries: e.target.value })}
            rows={8}
            autoComplete="off"
            spellCheck={false}
          />
          <span className={styles.fieldHint}>skill 会按这些主题逐个搜索，再做国内 / 国际分类筛选。</span>
        </div>
      </div>
      <div className={styles.saveRow}>
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存 DailyDigest 配置"}
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

  const canSave = !saving && !!(fields.appId && fields.appSecret && fields.verificationToken);

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
