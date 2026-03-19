import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CronJob, CronSchedulerOptions } from "./types.js";
import type { IMEventStorage } from "../im/storage.js";
import type { FeishuPlatform } from "../platform/feishu.js";
import type { SkillRegistry } from "../skills/registry.js";
import { findLatestSkillPng } from "../skills/loader.js";

interface ScheduledJob {
  job: CronJob;
  timer: ReturnType<typeof setInterval>;
  /** Parsed field arrays: [minute, hour, dom, month, dow] */
  fields: CronFields;
}

type CronFields = [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];

/**
 * Lightweight cron scheduler — no external deps, pure Node.js timers.
 *
 * Granularity: checks every minute (fires within ~1s of the target minute).
 */
export class CronScheduler {
  readonly #jobs = new Map<string, ScheduledJob>();
  readonly #tz: string;
  readonly #imEventStorage: IMEventStorage | undefined;
  readonly #skillRegistry: SkillRegistry | undefined;
  readonly #skillDataRoot: string | undefined;
  #pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: CronSchedulerOptions = {}) {
    this.#tz = options.timezone ?? "Asia/Shanghai";
    this.#imEventStorage = options.imEventStorage;
    this.#skillRegistry = options.skillRegistry;
    this.#skillDataRoot = options.skillDataRoot;
  }

  /** Add a job. Replaces any existing job with the same id. */
  add(job: CronJob): void {
    this.remove(job.id);
    const fields = parseCron(job.schedule);
    const scheduled: ScheduledJob = { job, fields, timer: undefined as never };
    this.#jobs.set(job.id, scheduled);
  }

  /** Remove a job by id. */
  remove(id: string): void {
    const existing = this.#jobs.get(id);
    if (existing?.timer) clearInterval(existing.timer);
    this.#jobs.delete(id);
  }

  /** Start the scheduler poll loop. */
  start(): void {
    if (this.#pollTimer) return;
    // Align to the next minute boundary, then poll every 60s
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    setTimeout(() => {
      this.#tick();
      this.#pollTimer = setInterval(() => this.#tick(), 60_000);
    }, msToNextMinute);
  }

  /** Stop all timers and clear jobs. */
  stop(): void {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = undefined;
    }
  }

  /** List all registered job ids. */
  get jobIds(): string[] {
    return [...this.#jobs.keys()];
  }

  /** Return serializable info for all registered jobs. */
  list(): Array<{ id: string; schedule: string; message: string; chatId: string; platform: string }> {
    return [...this.#jobs.values()].map(({ job }) => ({
      id: job.id,
      schedule: job.schedule,
      message: job.message,
      chatId: job.delivery.chatId,
      platform: job.delivery.platform.name,
    }));
  }

  /** Run a job immediately, bypassing cron expression matching. */
  async runNow(job: CronJob): Promise<void> {
    await this.#fire(job);
  }

  #tick(): void {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: this.#tz }));
    const [minute, hour, dom, month, dow] = [
      now.getMinutes(),
      now.getHours(),
      now.getDate(),
      now.getMonth() + 1,
      now.getDay(),
    ];

    for (const { job, fields } of this.#jobs.values()) {
      const [fMin, fHour, fDom, fMonth, fDow] = fields;
      if (
        fMin.has(minute) &&
        fHour.has(hour) &&
        fDom.has(dom) &&
        fMonth.has(month) &&
        fDow.has(dow)
      ) {
        void this.#fire(job);
      }
    }
  }

  async #fire(job: CronJob): Promise<void> {
    const eventId = this.#imEventStorage?.append({
      platform: job.delivery.platform.name,
      userId: "",
      chatId: job.delivery.chatId,
      text: `[cron:${job.id}] ${job.message}`,
      replyText: undefined,
    });
    try {
      let reply: string;
      if (job.skillId) {
        const skill = this.#skillRegistry?.get(job.skillId);
        if (!skill) throw new Error(`Skill not found: ${job.skillId}`);
        let dataDir: string | undefined;
        if (this.#skillDataRoot) {
          dataDir = join(this.#skillDataRoot, job.skillId);
          mkdirSync(dataDir, { recursive: true });
        }
        await skill.run({
          agent: job.agent,
          ...(this.#imEventStorage !== undefined && { imEventStorage: this.#imEventStorage }),
          ...(dataDir !== undefined && { dataDir }),
        });
        if (eventId !== undefined) this.#imEventStorage?.setReply(eventId, `[skill:${job.skillId}]`);
        return;
      } else if (job.sendSkillOutput) {
        const pngPath = this.#skillDataRoot
          ? findLatestSkillPng(this.#skillDataRoot, job.sendSkillOutput)
          : undefined;
        if (!pngPath) throw new Error(`No output PNG found for skill: ${job.sendSkillOutput}`);
        const p = job.delivery.platform as unknown as FeishuPlatform;
        await p.sendImage(job.delivery.chatId, pngPath);
        if (eventId !== undefined) this.#imEventStorage?.setReply(eventId, "[图片]");
        return;
      } else if (job.direct) {
        if (job.msgType === "image") {
          const p = job.delivery.platform as unknown as FeishuPlatform;
          await p.sendImage(job.delivery.chatId, job.message);
          if (eventId !== undefined) this.#imEventStorage?.setReply(eventId, "[图片]");
          return;
        }
        reply = job.message;
      } else {
        const result = await job.agent.run(job.message);
        const lastMsg = result.messages.findLast((m) => m.role === "assistant");
        reply = extractText(lastMsg?.content);
      }
      if (eventId !== undefined) this.#imEventStorage?.setReply(eventId, reply);
      if (reply) await job.delivery.platform.send(job.delivery.chatId, reply);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron:${job.id}] error:`, errMsg);
      if (eventId !== undefined) this.#imEventStorage?.setReply(eventId, `[ERROR] ${errMsg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cron parsing
// ---------------------------------------------------------------------------

function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: "${expr}"`);

  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];
  return [
    parseField(minute, 0, 59),
    parseField(hour, 0, 23),
    parseField(dom, 1, 31),
    parseField(month, 1, 12),
    parseField(dow, 0, 6),
  ];
}

function parseField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();

  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) result.add(i);
      continue;
    }

    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const [, range, stepStr] = stepMatch;
      const step = Number(stepStr);
      const [start, end] = range === "*" ? [min, max] : range!.split("-").map(Number) as [number, number];
      for (let i = start!; i <= end!; i += step) result.add(i);
      continue;
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const [, startStr, endStr] = rangeMatch;
      for (let i = Number(startStr); i <= Number(endStr); i++) result.add(i);
      continue;
    }

    const num = Number(part);
    if (!Number.isNaN(num)) {
      result.add(num);
      continue;
    }

    throw new Error(`Invalid cron field: "${part}"`);
  }

  return result;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: "text"; text: string } => (b as { type: string }).type === "text")
      .map((b) => b.text)
      .join("");
  }
  return "";
}
