import { useEffect, useRef, useState } from "react";
import settingsStyles from "./SettingsView.module.css";

interface FeishuFields {
  appId: string;
  appSecret: string;
  verificationToken: string;
  encryptKey: string;
  chatId: string;
}

interface FeishuStatusSnapshot {
  runtime: {
    configured: boolean;
    active: boolean;
    source: "storage" | "env" | "none";
    webhookPath: string;
  };
  appId?: string;
  chatId?: string;
  hasAppSecret: boolean;
  hasVerificationToken: boolean;
  hasEncryptKey: boolean;
  permissionsHint: string;
}

interface FeishuTargetSnapshot {
  chatId: string;
  targetType: "group" | "user" | "unknown";
  name?: string;
}

export function FeishuConfigSection(props: { id: string; title?: string; reloadToken?: number }): React.JSX.Element {
  const [fields, setFields] = useState<FeishuFields>({
    appId: "",
    appSecret: "",
    verificationToken: "",
    encryptKey: "",
    chatId: "",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [snapshot, setSnapshot] = useState<FeishuStatusSnapshot | null>(null);
  const [resolvedFieldTarget, setResolvedFieldTarget] = useState<FeishuTargetSnapshot | null>(null);
  const [resolvedRuntimeTarget, setResolvedRuntimeTarget] = useState<FeishuTargetSnapshot | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/im-config")
      .then((response) => response.json() as Promise<{ feishu?: Partial<FeishuFields> }>)
      .then((data) => {
        if (!data.feishu) return;
        setFields((prev) => ({
          appId: data.feishu?.appId ?? prev.appId,
          appSecret: data.feishu?.appSecret ?? prev.appSecret,
          verificationToken: data.feishu?.verificationToken ?? prev.verificationToken,
          encryptKey: data.feishu?.encryptKey ?? prev.encryptKey,
          chatId: data.feishu?.chatId ?? prev.chatId,
        }));
      })
      .catch(() => { /* server may not have im-config yet */ });

    fetch("/api/status")
      .then((response) => response.json() as Promise<{ overview?: { feishu?: FeishuStatusSnapshot } }>)
      .then((data) => setSnapshot(data.overview?.feishu ?? null))
      .catch(() => { /* ignore status load failure */ });
  }, [props.reloadToken]);

  useEffect(() => {
    const chatId = fields.chatId.trim();
    if (!chatId) {
      setResolvedFieldTarget(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/im-config/feishu-target?chatId=${encodeURIComponent(chatId)}`)
        .then((response) => response.ok
          ? response.json() as Promise<{ ok: boolean; target?: FeishuTargetSnapshot }>
          : Promise.resolve({ ok: false }))
        .then((data) => {
          if (!cancelled) setResolvedFieldTarget(data.ok ? data.target ?? null : null);
        })
        .catch(() => {
          if (!cancelled) setResolvedFieldTarget(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fields.chatId]);

  useEffect(() => {
    const chatId = snapshot?.chatId?.trim();
    if (!chatId) {
      setResolvedRuntimeTarget(null);
      return;
    }

    let cancelled = false;
    void fetch(`/api/im-config/feishu-target?chatId=${encodeURIComponent(chatId)}`)
      .then((response) => response.ok
        ? response.json() as Promise<{ ok: boolean; target?: FeishuTargetSnapshot }>
        : Promise.resolve({ ok: false }))
      .then((data) => {
        if (!cancelled) setResolvedRuntimeTarget(data.ok ? data.target ?? null : null);
      })
      .catch(() => {
        if (!cancelled) setResolvedRuntimeTarget(null);
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot?.chatId]);

  const setField = (key: keyof FeishuFields, value: string): void => {
    setFields((prev) => ({ ...prev, [key]: value }));
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
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setStatus({ type: "ok", msg: "已保存，飞书 Webhook 立即生效" });
      })
      .catch((error: unknown) => {
        setStatus({ type: "err", msg: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        setSaving(false);
        if (statusTimer.current) clearTimeout(statusTimer.current);
        statusTimer.current = setTimeout(() => setStatus(null), 4000);
      });
  };

  const canSave = !saving && !!(fields.appId && fields.appSecret && fields.verificationToken);

  return (
    <section id={props.id} className={settingsStyles.section}>
      <div className={settingsStyles.sectionTitle}>{props.title ?? "飞书 IM 配置"}</div>
      <div className={settingsStyles.sectionHint}>
        配置保存在服务端 `data/im/im-config.json`，保存后立即生效，无需重启。<br />
        已保存的敏感字段显示为脱敏值（如 cli_****），修改后重新保存即可更新。
      </div>
      {snapshot && (
        <div className={settingsStyles.runtimeCard}>
          <div className={settingsStyles.runtimeHeader}>
            <strong className={settingsStyles.runtimeTitle}>当前飞书运行摘要</strong>
            <span className={`${settingsStyles.runtimeBadge} ${snapshot.runtime.active ? settingsStyles.runtimeOn : settingsStyles.runtimeOff}`}>
              {snapshot.runtime.active ? "运行中" : "未运行"}
            </span>
          </div>
          <div className={settingsStyles.runtimeGrid}>
            <RuntimeItem label="配置来源" value={snapshot.runtime.source === "storage" ? "已保存配置" : snapshot.runtime.source === "env" ? "环境变量" : "未启用"} />
            <RuntimeItem label="Webhook" value={snapshot.runtime.webhookPath} mono />
            <RuntimeItem label="App ID" value={snapshot.appId ?? "-"} mono />
            <RuntimeItem label="Chat ID" value={snapshot.chatId ?? "-"} mono />
            <RuntimeItem label="目标名称" value={formatFeishuTarget(resolvedRuntimeTarget)} />
            <RuntimeItem label="App Secret" value={snapshot.hasAppSecret ? "已配置" : "未配置"} />
            <RuntimeItem label="Verification Token" value={snapshot.hasVerificationToken ? "已配置" : "未配置"} />
            <RuntimeItem label="Encrypt Key" value={snapshot.hasEncryptKey ? "已配置" : "未配置"} />
          </div>
          <div className={settingsStyles.runtimeHint}>{snapshot.permissionsHint}</div>
        </div>
      )}
      <div className={settingsStyles.fields}>
        <Field label="App ID" placeholder="cli_xxxxxxxxxx" value={fields.appId} onChange={(value) => setField("appId", value)} />
        <Field label="App Secret" type="password" placeholder="xxxxxxxxxxxxxxxx" value={fields.appSecret} onChange={(value) => setField("appSecret", value)} />
        <Field label="Verification Token" type="password" placeholder="xxxxxxxxxxxxxxxx" value={fields.verificationToken} onChange={(value) => setField("verificationToken", value)} />
        <Field label="Encrypt Key（可选）" type="password" placeholder="留空则不启用签名验证" value={fields.encryptKey} onChange={(value) => setField("encryptKey", value)} />
        <Field label="Chat ID（Cron 推送目标，可选）" placeholder="oc_xxxxxxxxxx" value={fields.chatId} onChange={(value) => setField("chatId", value)} />
        {fields.chatId.trim() && (
          <span className={settingsStyles.fieldHint}>
            {resolvedFieldTarget ? `已解析目标：${formatFeishuTarget(resolvedFieldTarget)}` : "正在解析目标名称…"}
          </span>
        )}
      </div>
      <div className={settingsStyles.saveRow}>
        <button className={settingsStyles.saveBtn} onClick={save} disabled={!canSave}>
          {saving ? "保存中…" : "保存飞书配置"}
        </button>
        {status && <span className={`${settingsStyles.saveStatus} ${settingsStyles[status.type]}`}>{status.msg}</span>}
      </div>
    </section>
  );
}

function RuntimeItem(props: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className={settingsStyles.runtimeItem}>
      <span className={settingsStyles.runtimeLabel}>{props.label}</span>
      <span className={`${settingsStyles.runtimeValue} ${props.mono ? settingsStyles.runtimeMono : ""}`}>{props.value}</span>
    </div>
  );
}

function Field(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}): React.JSX.Element {
  const [show, setShow] = useState(false);
  const isPassword = props.type === "password";

  return (
    <div className={settingsStyles.field}>
      <label className={settingsStyles.fieldLabel}>{props.label}</label>
      <div className={settingsStyles.fieldRow}>
        <input
          className={settingsStyles.fieldInput}
          type={isPassword && !show ? "password" : "text"}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {isPassword && (
          <button
            type="button"
            className={settingsStyles.eyeBtn}
            onClick={() => setShow((prev) => !prev)}
            tabIndex={-1}
            aria-label={show ? "隐藏" : "显示"}
          >
            {show ? "hide" : "show"}
          </button>
        )}
      </div>
    </div>
  );
}

function formatFeishuTarget(target: FeishuTargetSnapshot | null): string {
  if (!target) return "-";
  if (!target.name) return target.chatId;
  if (target.targetType === "group") return `${target.name}（群聊）`;
  if (target.targetType === "user") return `${target.name}（用户）`;
  return `${target.name}（${target.chatId}）`;
}
