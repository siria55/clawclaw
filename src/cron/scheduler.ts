import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeCronChatIds } from "./types.js";
import type { CronJob, CronSchedulerOptions } from "./types.js";
import type { IMEventStorage } from "../im/storage.js";
import {
  buildDailyDigestImageHint,
  extractDailyDigestDateKeyFromPath,
  getDailyDigestArticleCount,
  getDailyDigestFilesByDate,
} from "../im/daily-digest.js";
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
  list(): Array<{ id: string; schedule: string; message: string; chatId: string; chatIds: string[]; platform: string }> {
    return [...this.#jobs.values()].map(({ job }) => ({
      id: job.id,
      schedule: job.schedule,
      message: job.message,
      chatId: job.delivery?.chatId ?? "",
      chatIds: getDeliveryChatIds(job.delivery),
      platform: job.delivery?.platform.name ?? "",
    }));
  }

  /** Run a job immediately, bypassing cron expression matching. */
  async runNow(job: CronJob): Promise<void> {
    await this.#fire(job, true);
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
        void this.#fire(job, false);
      }
    }
  }

  async #fire(job: CronJob, propagateError: boolean): Promise<void> {
    const targetChatIds = getDeliveryChatIds(job.delivery);
    const eventIds = this.#imEventStorage
      ? targetChatIds.map((chatId) => ({
          chatId,
          eventId: this.#imEventStorage?.append({
            platform: job.delivery?.platform.name ?? "cron",
            userId: "",
            chatId,
            eventType: "cron",
            text: `[cron:${job.id}] ${job.message}`,
            replyText: undefined,
          }),
        }))
      : [];
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
        setCronReplies(this.#imEventStorage, eventIds, `[skill:${job.skillId}]`);
        return;
      } else if (job.sendSkillOutput) {
        const delivery = requireDelivery(job);
        const pngPath = this.#skillDataRoot
          ? findLatestSkillPng(this.#skillDataRoot, job.sendSkillOutput)
          : undefined;
        if (!pngPath) throw new Error(`No output PNG found for skill: ${job.sendSkillOutput}`);
        const p = delivery.platform as unknown as FeishuPlatform;
        const digestDateKey = job.sendSkillOutput === "daily-digest"
          ? extractDailyDigestDateKeyFromPath(pngPath)
          : undefined;
        const digestCount = digestDateKey && this.#skillDataRoot
          ? getDailyDigestArticleCount(getDailyDigestFilesByDate(this.#skillDataRoot, digestDateKey).jsonPath)
          : undefined;
        for (const chatId of targetChatIds) {
          await p.sendImage(chatId, pngPath);
          if (job.sendSkillOutput === "daily-digest") {
            await delivery.platform.send(chatId, buildDailyDigestImageHint(digestCount));
          }
        }
        setCronReplies(this.#imEventStorage, eventIds, digestDateKey ? `[日报图片] ${digestDateKey}` : "[图片]");
        return;
      } else if (job.direct) {
        const delivery = requireDelivery(job);
        if (job.msgType === "image") {
          const p = delivery.platform as unknown as FeishuPlatform;
          for (const chatId of targetChatIds) {
            await p.sendImage(chatId, job.message);
          }
          setCronReplies(this.#imEventStorage, eventIds, "[图片]");
          return;
        }
        if (job.msgType === "markdown" && delivery.platform.sendMarkdown) {
          for (const chatId of targetChatIds) {
            await delivery.platform.sendMarkdown(chatId, job.message);
          }
          setCronReplies(this.#imEventStorage, eventIds, job.message);
          return;
        }
        reply = job.message;
      } else {
        const result = await job.agent.run(job.message);
        const lastMsg = result.messages.findLast((m) => m.role === "assistant");
        reply = extractText(lastMsg?.content);
      }
      setCronReplies(this.#imEventStorage, eventIds, reply);
      if (reply) {
        const delivery = requireDelivery(job);
        for (const chatId of targetChatIds) {
          await delivery.platform.send(chatId, reply);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron:${job.id}] error:`, errMsg);
      setCronReplies(this.#imEventStorage, eventIds, `[ERROR] ${errMsg}`);
      if (propagateError) throw err;
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

function getDeliveryChatIds(delivery: CronJob["delivery"] | undefined): string[] {
  if (!delivery) return [];
  const chatIds = normalizeCronChatIds(delivery);
  return chatIds.length > 0 ? chatIds : [delivery.chatId];
}

function requireDelivery(job: CronJob): NonNullable<CronJob["delivery"]> {
  if (!job.delivery) {
    throw new Error(`Cron job ${job.id} requires configured delivery target`);
  }
  return job.delivery;
}

function setCronReplies(
  storage: IMEventStorage | undefined,
  eventIds: Array<{ chatId: string; eventId: string | undefined }>,
  replyText: string,
): void {
  for (const item of eventIds) {
    if (item.eventId !== undefined) storage?.setReply(item.eventId, replyText);
  }
}
