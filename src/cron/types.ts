import type { Agent } from "../core/agent.js";
import type { IMPlatform } from "../platform/types.js";

export interface CronJob {
  /** Unique identifier */
  id: string;
  /** Cron expression, e.g. "0 9 * * 1-5" (weekdays at 9am) */
  schedule: string;
  /** Message to send to the agent when the job fires */
  message: string;
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
  /** Target chat ID for delivery */
  chatId: string;
  /** Platform name, e.g. "feishu" */
  platform: string;
  enabled: boolean;
}

export interface CronSchedulerOptions {
  /** Timezone for cron expressions. Defaults to "Asia/Shanghai". */
  timezone?: string;
}
