import type { Agent } from "../core/agent.js";
import type { IMPlatform } from "../platform/types.js";

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
  msgType: "text" | "image";
  /** Agent to run */
  agent: Agent;
  /** Where to deliver the agent's reply */
  delivery: {
    platform: IMPlatform;
    chatId: string;
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
  /** Message type for direct mode: "text" (default) or "image" (message = URL or local path) */
  msgType?: "text" | "image";
  chatId: string;
  platform: string;
  enabled: boolean;
}

export interface CronSchedulerOptions {
  /** Timezone for cron expressions. Defaults to "Asia/Shanghai". */
  timezone?: string;
  /** Storage for recording cron-fired messages (same as IM event log). */
  imEventStorage?: import("../im/storage.js").IMEventStorage;
}
