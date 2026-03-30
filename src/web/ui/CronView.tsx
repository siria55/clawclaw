import { useEffect, useState } from "react";
import { normalizeCronChatIds, normalizeCronJobConfig } from "../../cron/types";
import styles from "./CronView.module.css";

interface CronJobConfig {
  id: string;
  schedule: string;
  message: string;
  chatId: string;
  chatIds?: string[];
  resolvedTargets?: Array<{
    chatId: string;
    targetType: "group" | "user" | "unknown";
    name?: string;
  }>;
  platform: string;
  enabled: boolean;
  direct: boolean;
  msgType: "text" | "image" | "markdown";
  skillId?: string;
  sendSkillOutput?: string;
}

interface Notice {
  jobId?: string;
  text: string;
  type: "success" | "error";
}

const EMPTY_FORM: CronJobConfig = {
  id: "",
  schedule: "",
  message: "",
  chatId: "",
  platform: "feishu",
  enabled: true,
  direct: false,
  msgType: "text",
  skillId: "",
  sendSkillOutput: "",
};

async function fetchCronJobs(): Promise<CronJobConfig[]> {
  const res = await fetch("/api/cron");
  if (!res.ok) throw new Error(await readError(res, "加载 Cron 任务失败"));
  const data = await res.json() as { jobs: CronJobConfig[] };
  return data.jobs.map(normalizeCronJobConfig);
}

async function saveCronJob(job: CronJobConfig): Promise<void> {
  const res = await fetch("/api/cron", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });
  if (!res.ok) throw new Error(await readError(res, "保存 Cron 任务失败"));
}

async function deleteCronJob(id: string): Promise<void> {
  const res = await fetch(`/api/cron/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "删除 Cron 任务失败"));
}

async function runCronJob(id: string): Promise<void> {
  const res = await fetch(`/api/cron/${encodeURIComponent(id)}/run`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "执行 Cron 任务失败"));
}

async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  if (!text) return fallback;
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error ?? text;
  } catch {
    return text;
  }
}

function getChatHint(chatId: string): string {
  if (chatId.startsWith("oc_")) return "群聊";
  if (chatId.startsWith("ou_")) return "用户";
  return "";
}

function formatChatTargets(job: Pick<CronJobConfig, "chatId" | "chatIds">): string {
  return normalizeCronChatIds(job).join("\n");
}

function describeResolvedChatTargets(job: Pick<CronJobConfig, "chatId" | "chatIds" | "resolvedTargets">): string {
  const chatIds = normalizeCronChatIds(job);
  if (chatIds.length === 0) return "—";

  const targetMap = new Map((job.resolvedTargets ?? []).map((target) => [target.chatId, target] as const));
  const labels = chatIds.map((chatId) => formatResolvedTarget(targetMap.get(chatId), chatId));
  if (labels.length === 1) {
    return labels[0]!;
  }
  return `${labels.join(" / ")} · 共 ${labels.length} 个目标`;
}

function getCardNotice(notice: Notice | null, jobId: string): Notice | null {
  return notice?.jobId === jobId ? notice : null;
}

/** Dedicated Cron tab — manages persisted cron jobs and allows manual runs. */
export function CronView(): React.JSX.Element {
  const [cronJobs, setCronJobs] = useState<CronJobConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CronJobConfig>(EMPTY_FORM);
  const [chatTargets, setChatTargets] = useState("");
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      setCronJobs(await fetchCronJobs());
    } finally {
      setLoading(false);
    }
  };

  const showError = (error: unknown): void => {
    setNotice({ type: "error", text: error instanceof Error ? error.message : String(error) });
  };

  const resetForm = (): void => {
    setForm(EMPTY_FORM);
    setChatTargets("");
    setShowForm(false);
  };

  const handleSave = async (): Promise<void> => {
    const targetIds = normalizeCronChatIds({ chatIds: chatTargets.split("\n") });
    if (!form.id || !form.schedule || !form.message || targetIds.length === 0) return;
    const savedId = form.id;
    setSaving(true);
    setNotice(null);
    try {
      await saveCronJob(normalizeCronJobConfig({
        ...form,
        chatId: targetIds[0]!,
        chatIds: targetIds,
      }));
      await load();
      resetForm();
      setNotice({ type: "success", text: `已保存 ${savedId}` });
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setNotice(null);
    try {
      await deleteCronJob(id);
      await load();
      setNotice({ type: "success", text: `已删除 ${id}` });
    } catch (error) {
      showError(error);
    }
  };

  const handleRun = async (id: string): Promise<void> => {
    setRunningId(id);
    setNotice(null);
    try {
      await runCronJob(id);
      setNotice({ jobId: id, type: "success", text: "已直接执行" });
    } catch (error) {
      setNotice({ jobId: id, type: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setRunningId(undefined);
    }
  };

  const handleEdit = (job: CronJobConfig): void => {
    setForm(job);
    setChatTargets(formatChatTargets(job));
    setShowForm(true);
    setNotice(null);
  };

  useEffect(() => {
    void load().catch(showError);
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Cron 配置</h2>
            <p className={styles.subtitle}>独立管理定时任务，并支持直接手动执行单条任务。</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.refreshBtn} onClick={() => { setNotice(null); void load().catch(showError); }} aria-label="刷新" disabled={loading}>
              {loading ? "…" : "↺"}
            </button>
            <button className={styles.addBtn} onClick={() => { setForm(EMPTY_FORM); setChatTargets(""); setShowForm(true); setNotice(null); }}>
              + 新增
            </button>
          </div>
        </div>

        {notice && notice.jobId === undefined && (
          <p className={`${styles.notice} ${notice.type === "success" ? styles.noticeSuccess : styles.noticeError}`}>{notice.text}</p>
        )}

        <section className={styles.section}>
          {cronJobs.length === 0 && !loading && <p className={styles.empty}>无已注册任务</p>}
          {cronJobs.map((job) => {
            const cardNotice = getCardNotice(notice, job.id);
            return (
              <div key={job.id} className={styles.cronCard}>
                <div className={styles.cronTop}>
                  <span className={styles.cronId}>{job.id}</span>
                  <code className={styles.cronExpr}>{job.schedule}</code>
                  <span className={`${styles.cronEnabled} ${job.enabled ? styles.cronEnabledOn : styles.cronEnabledOff}`}>
                    {job.enabled ? "启用" : "停用"}
                  </span>
                </div>
                <p className={styles.cronMsg}>{job.message}</p>
                <div className={styles.metaList}>
                  <span className={styles.cronMeta}>{job.platform} · {describeResolvedChatTargets(job)}</span>
                  {job.skillId && <span className={styles.cronMeta}>skillId: {job.skillId}</span>}
                  {job.sendSkillOutput && <span className={styles.cronMeta}>sendSkillOutput: {job.sendSkillOutput}</span>}
                  {job.direct && <span className={styles.cronMeta}>直发 {describeMsgType(job.msgType)}</span>}
                </div>
                <div className={styles.cronFooter}>
                  <div className={styles.inlineNotice}>
                    {cardNotice && (
                      <span className={cardNotice.type === "success" ? styles.inlineNoticeSuccess : styles.inlineNoticeError}>
                        {cardNotice.text}
                      </span>
                    )}
                  </div>
                  <div className={styles.cronActions}>
                    <button className={styles.cronActionBtn} onClick={() => void handleRun(job.id)} disabled={runningId === job.id}>
                      {runningId === job.id ? "运行中…" : "运行"}
                    </button>
                    <button className={styles.cronActionBtn} onClick={() => handleEdit(job)}>编辑</button>
                    <button className={`${styles.cronActionBtn} ${styles.cronDeleteBtn}`} onClick={() => void handleDelete(job.id)}>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {showForm && (
            <div className={styles.cronForm}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>ID</label>
                <input className={styles.formInput} value={form.id} placeholder="daily-digest" onChange={(e) => setForm((value) => ({ ...value, id: e.target.value }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Schedule</label>
                <input className={styles.formInput} value={form.schedule} placeholder="0 9 * * *" onChange={(e) => setForm((value) => ({ ...value, schedule: e.target.value }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>发送目标</label>
                <div className={styles.formInputGroup}>
                  <textarea
                    className={styles.formTextarea}
                    value={chatTargets}
                    rows={3}
                    placeholder={"每行一个\nou_xxx（用户）\noc_xxx（群聊）"}
                    onChange={(e) => setChatTargets(e.target.value)}
                  />
                  <span className={styles.formHint}>{normalizeCronChatIds({ chatIds: chatTargets.split("\n") }).map(getChatHint).filter(Boolean).join(" / ") || "支持同时发给个人和群"}</span>
                </div>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>消息</label>
                <textarea className={styles.formTextarea} value={form.message} rows={3} onChange={(e) => setForm((value) => ({ ...value, message: e.target.value }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>直发</label>
                <input type="checkbox" checked={form.direct} onChange={(e) => setForm((value) => ({ ...value, direct: e.target.checked }))} />
              </div>
              {form.direct && (
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>类型</label>
                  <select className={styles.formInput} value={form.msgType} onChange={(e) => setForm((value) => ({ ...value, msgType: e.target.value as "text" | "image" | "markdown" }))}>
                    <option value="text">文本</option>
                    <option value="markdown">Markdown（飞书渲染）</option>
                    <option value="image">图片</option>
                  </select>
                </div>
              )}
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Skill ID</label>
                <input className={styles.formInput} value={form.skillId ?? ""} placeholder="可选，如 daily-digest" onChange={(e) => setForm((value) => ({ ...value, skillId: e.target.value || undefined }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>发送 Skill</label>
                <input className={styles.formInput} value={form.sendSkillOutput ?? ""} placeholder="可选，如 daily-digest" onChange={(e) => setForm((value) => ({ ...value, sendSkillOutput: e.target.value || undefined }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>启用</label>
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((value) => ({ ...value, enabled: e.target.checked }))} />
              </div>
              <div className={styles.formActions}>
                <button className={styles.saveBtn} onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中…" : "保存"}</button>
                <button className={styles.cancelBtn} onClick={resetForm}>取消</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function describeMsgType(msgType: CronJobConfig["msgType"]): string {
  if (msgType === "image") return "图片";
  if (msgType === "markdown") return "Markdown";
  return "文本";
}

function formatResolvedTarget(
  target: CronJobConfig["resolvedTargets"] extends Array<infer T> ? T | undefined : never,
  chatId: string,
): string {
  if (!target?.name) {
    return `${chatId} ${getChatHint(chatId)}`.trim();
  }
  return `${target.name}（${chatId}）`;
}
