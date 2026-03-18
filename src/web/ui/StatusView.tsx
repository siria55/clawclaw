import { useEffect, useRef, useState } from "react";
import styles from "./StatusView.module.css";

interface CronJobStatus {
  id: string;
  schedule: string;
  message: string;
  timezone: string;
  chatId: string;
  platform: string;
}

interface ConnectionStatus {
  platform: string;
  label: string;
  connected: boolean;
}

interface SystemStatus {
  cronJobs: CronJobStatus[];
  connections: ConnectionStatus[];
}

interface IMEvent {
  id: string;
  platform: string;
  userId: string;
  chatId: string;
  text: string;
  replyText: string | undefined;
  timestamp: string;
}

interface CronJobConfig {
  id: string;
  schedule: string;
  message: string;
  chatId: string;
  platform: string;
  enabled: boolean;
  direct: boolean;
  msgType: "text" | "image";
  skillId?: string;
}

const EMPTY_FORM: CronJobConfig = { id: "", schedule: "", message: "", chatId: "", platform: "feishu", enabled: true, direct: false, msgType: "text", skillId: "" };

interface SkillInfo {
  id: string;
  description: string;
}

async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch("/api/skills");
  if (!res.ok) return [];
  const data = await res.json() as { skills: SkillInfo[] };
  return data.skills;
}

async function fetchStatus(): Promise<SystemStatus> {
  const res = await fetch("/api/status");
  if (!res.ok) return { cronJobs: [], connections: [] };
  return res.json() as Promise<SystemStatus>;
}

async function fetchCronJobs(): Promise<CronJobConfig[]> {
  const res = await fetch("/api/cron");
  if (!res.ok) return [];
  const data = await res.json() as { jobs: CronJobConfig[] };
  return data.jobs;
}

async function saveCronJob(job: CronJobConfig): Promise<void> {
  await fetch("/api/cron", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) });
}

async function deleteCronJob(id: string): Promise<void> {
  await fetch(`/api/cron/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function runSkill(id: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(id)}/run`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}


  const url = since ? `/api/im-log?since=${since}` : "/api/im-log";
  const res = await fetch(url);
  if (!res.ok) return { events: [], total: 0 };
  return res.json() as Promise<{ events: IMEvent[]; total: number }>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function SkillRow({ skill }: { skill: SkillInfo }): React.JSX.Element {
  const [state, setState] = useState<"idle" | "running" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRun = (): void => {
    setState("running");
    void runSkill(skill.id)
      .then(() => {
        setState("ok");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 3000);
      })
      .catch((e: unknown) => {
        setErrMsg(e instanceof Error ? e.message : String(e));
        setState("err");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 5000);
      });
  };

  return (
    <div className={styles.skillRow}>
      <code className={styles.skillId}>{skill.id}</code>
      <span className={styles.skillDesc}>{skill.description}</span>
      <button
        className={styles.skillRunBtn}
        onClick={handleRun}
        disabled={state === "running"}
      >
        {state === "running" ? "运行中…" : "运行"}
      </button>
      {state === "ok" && <span className={styles.skillRunOk}>✓ 完成</span>}
      {state === "err" && <span className={styles.skillRunErr}>{errMsg}</span>}
    </div>
  );
}

export function StatusView(): React.JSX.Element {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [cronJobs, setCronJobs] = useState<CronJobConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CronJobConfig>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [imEvents, setIMEvents] = useState<IMEvent[]>([]);
  const [imFilter, setIMFilter] = useState<"all" | "group" | "direct">("all");
  const lastIdRef = useRef<string | undefined>(undefined);

  const load = (): void => {
    setLoading(true);
    void fetchStatus().then((s) => setStatus(s)).finally(() => setLoading(false));
    void fetchCronJobs().then(setCronJobs);
  };

  const handleSave = (): void => {
    if (!form.id || !form.schedule || !form.message) return;
    setSaving(true);
    void saveCronJob(form).then(() => {
      setShowForm(false);
      setForm(EMPTY_FORM);
      void fetchCronJobs().then(setCronJobs);
      void fetchStatus().then((s) => setStatus(s));
    }).finally(() => setSaving(false));
  };

  const handleDelete = (id: string): void => {
    void deleteCronJob(id).then(() => {
      void fetchCronJobs().then(setCronJobs);
      void fetchStatus().then((s) => setStatus(s));
    });
  };

  const handleEdit = (job: CronJobConfig): void => {
    setForm(job);
    setShowForm(true);
  };

  useEffect(() => {
    void fetchIMLog().then(({ events }) => {
      if (events.length > 0) {
        setIMEvents(events.slice(-50));
        lastIdRef.current = events[events.length - 1]?.id;
      }
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchIMLog(lastIdRef.current).then(({ events }) => {
        if (events.length > 0) {
          setIMEvents((prev) => [...prev, ...events].slice(-50));
          lastIdRef.current = events[events.length - 1]?.id;
        }
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { load(); void fetchSkills().then(setSkills); }, []);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <h2 className={styles.title}>系统状态</h2>
          <button className={styles.refreshBtn} onClick={load} aria-label="刷新" disabled={loading}>
            {loading ? "…" : "↺"}
          </button>
        </div>

        {/* IM 连接 */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>IM 连接</h3>
          {status?.connections.length === 0 && <p className={styles.empty}>未配置 IM 平台</p>}
          {status?.connections.map((c) => (
            <div key={c.platform} className={styles.connRow}>
              <span className={`${styles.dot} ${c.connected ? styles.dotOn : styles.dotOff}`} />
              <span className={styles.connLabel}>{c.label}</span>
              <span className={styles.connStatus}>{c.connected ? "已连接" : "未连接"}</span>
            </div>
          ))}
          {!status && !loading && <p className={styles.empty}>—</p>}
        </section>

        {/* Skills */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Skills</h3>
          {skills.length === 0 && <p className={styles.empty}>无已注册 skill</p>}
          {skills.map((s) => (
            <SkillRow key={s.id} skill={s} />
          ))}
        </section>

        {/* Cron 任务 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Cron 任务</h3>
            <button className={styles.addBtn} onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}>+ 新增</button>
          </div>

          {cronJobs.length === 0 && <p className={styles.empty}>无已注册任务</p>}
          {cronJobs.map((job) => (
            <div key={job.id} className={styles.cronCard}>
              <div className={styles.cronTop}>
                <span className={styles.cronId}>{job.id}</span>
                <code className={styles.cronExpr}>{job.schedule}</code>
                <span className={`${styles.cronEnabled} ${job.enabled ? styles.cronEnabledOn : styles.cronEnabledOff}`}>
                  {job.enabled ? "启用" : "停用"}
                </span>
              </div>
              <p className={styles.cronMsg}>{job.message}</p>
              <div className={styles.cronFooter}>
                <span className={styles.cronMeta}>{job.platform} · {job.chatId || "—"}{job.chatId.startsWith("oc_") ? " 群聊" : job.chatId.startsWith("ou_") ? " 用户" : ""}</span>
                <div className={styles.cronActions}>
                  <button className={styles.cronActionBtn} onClick={() => handleEdit(job)}>编辑</button>
                  <button className={`${styles.cronActionBtn} ${styles.cronDeleteBtn}`} onClick={() => handleDelete(job.id)}>删除</button>
                </div>
              </div>
            </div>
          ))}

          {showForm && (
            <div className={styles.cronForm}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>ID</label>
                <input className={styles.formInput} value={form.id} placeholder="daily-digest" onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Schedule</label>
                <input className={styles.formInput} value={form.schedule} placeholder="0 9 * * *" onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Chat ID</label>
                <div className={styles.formInputGroup}>
                  <input className={styles.formInput} value={form.chatId} placeholder="ou_xxx（用户）/ oc_xxx（群聊）" onChange={(e) => setForm((f) => ({ ...f, chatId: e.target.value }))} />
                  <span className={styles.formHint}>{form.chatId.startsWith("oc_") ? "群聊" : form.chatId.startsWith("ou_") ? "用户" : ""}</span>
                </div>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>消息</label>
                <textarea className={styles.formTextarea} value={form.message} rows={3} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>直发</label>
                <input type="checkbox" checked={form.direct} onChange={(e) => setForm((f) => ({ ...f, direct: e.target.checked }))} />
              </div>
              {form.direct && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>类型</label>
                  <select className={styles.formInput} value={form.msgType} onChange={(e) => setForm((f) => ({ ...f, msgType: e.target.value as "text" | "image" }))}>
                    <option value="text">文本</option>
                    <option value="image">图片</option>
                  </select>
                </div>
              )}
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Skill ID</label>
                <input className={styles.formInput} value={form.skillId ?? ""} placeholder="可选，如 news-digest" onChange={(e) => setForm((f) => ({ ...f, skillId: e.target.value || undefined }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>启用</label>
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
              </div>
              <div className={styles.formActions}>
                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? "保存中…" : "保存"}</button>
                <button className={styles.cancelBtn} onClick={() => setShowForm(false)}>取消</button>
              </div>
            </div>
          )}
        </section>

        {/* IM 消息日志 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>IM 消息日志</h3>
            <div className={styles.imTabs}>
              {(["all", "group", "direct"] as const).map((f) => (
                <button key={f} className={`${styles.imTab} ${imFilter === f ? styles.imTabActive : ""}`} onClick={() => setIMFilter(f)}>
                  {f === "all" ? "全部" : f === "group" ? "群聊" : "直发"}
                </button>
              ))}
            </div>
          </div>
          {(() => {
            const filtered = [...imEvents].reverse().filter((e) => {
              if (imFilter === "group") return e.chatId.startsWith("oc_");
              if (imFilter === "direct") return e.chatId.startsWith("ou_");
              return true;
            });
            if (filtered.length === 0) return <p className={styles.empty}>暂无 IM 消息</p>;
            return filtered.map((e) => (
              <div key={e.id} className={styles.imCard}>
                <div className={styles.imMeta}>
                  <span className={styles.imPlatform}>{e.platform}</span>
                  {e.userId && <span className={styles.imId} title={`点击复制: ${e.userId}`} onClick={() => void navigator.clipboard.writeText(e.userId)}>用户 {e.userId.slice(0, 16)}</span>}
                  {e.chatId && <span className={styles.imId} title={`点击复制: ${e.chatId}`} onClick={() => void navigator.clipboard.writeText(e.chatId)}>会话 {e.chatId.slice(0, 16)}</span>}
                  <span className={styles.imTime}>{formatTime(e.timestamp)}</span>
                </div>
                <p className={styles.imText}>{e.text}</p>
                {e.replyText !== undefined && (
                  <p className={styles.imReply}>{e.replyText.slice(0, 120)}{e.replyText.length > 120 ? "…" : ""}</p>
                )}
              </div>
            ));
          })()}
        </section>
      </div>
    </div>
  );
}
