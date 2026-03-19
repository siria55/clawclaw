import type { Agent } from "../core/agent.js";
import type { IMPlatform } from "../platform/types.js";
import type { SkillRegistry } from "../skills/registry.js";

export interface CronJob {
  /** Unique identifier */
  id: string;
  /** Cron expression, e.g. "0 9 * * 1-5" (weekdays at 9am) */
  schedule: string;
  /** Message to send to the agent (or directly to chat when direct=true) */
  message: string;
  /** When true, send message directly without running through agent */
  direct: boolean;
  /** Message type for direct mode. Defaults to "text". */
  msgType: "text" | "image" | "markdown";
  /** Skill id to execute (generate content, no IM delivery). */
  skillId?: string;
  /**
   * Skill id whose latest PNG output should be sent to IM.
   * Use in a separate Cron job after the skill-generation job.
   */
  sendSkillOutput?: string;
  /** Agent to run */
  agent: Agent;
  /** Where to deliver the agent's reply */
  delivery: {
    platform: IMPlatform;
    chatId: string;
    chatIds?: string[];
  };
}

/**
 * Serializable cron job config — persisted to data/cron-config.json.
 * Runtime objects (agent / platform) are resolved at registration time.
 */
export interface CronJobConfig {
  id: string;
  schedule: string;
  message: string;
  /** When true, send message directly without running through agent */
  direct?: boolean;
  /** Message type for direct mode: "text" (default), "markdown" or "image" (message = URL or local path) */
  msgType?: "text" | "image" | "markdown";
  /** Skill id to execute (generate content, no IM delivery). */
  skillId?: string;
  /** Skill id whose latest PNG output should be sent to IM. */
  sendSkillOutput?: string;
  chatId: string;
  /** Additional delivery targets. When set, the same message is sent to all chatIds. */
  chatIds?: string[];
  platform: string;
  enabled: boolean;
}

export interface CronSchedulerOptions {
  /** Timezone for cron expressions. Defaults to "Asia/Shanghai". */
  timezone?: string;
  /** Storage for recording cron-fired messages (same as IM event log). */
  imEventStorage?: import("../im/storage.js").IMEventStorage;
  /** Registry for named skills. */
  skillRegistry?: SkillRegistry;
  /** Root directory under which per-skill data dirs are created. */
  skillDataRoot?: string;
}

export function normalizeCronChatIds(input: { chatId?: string; chatIds?: string[] }): string[] {
  const values = [
    ...(input.chatIds ?? []),
    ...(input.chatId ? [input.chatId] : []),
  ];
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (normalized) deduped.add(normalized);
  }
  return [...deduped];
}

export function normalizeCronJobConfig(config: CronJobConfig): CronJobConfig {
  const chatIds = normalizeCronChatIds(config);
  return {
    ...config,
    chatId: chatIds[0] ?? "",
    ...(chatIds.length > 0 ? { chatIds } : {}),
  };
}
