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

export interface CronSchedulerOptions {
  /** Timezone for cron expressions. Defaults to "Asia/Shanghai". */
  timezone?: string;
}
