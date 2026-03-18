import type { Agent } from "../core/agent.js";
import type { IMPlatform } from "../platform/types.js";
import type { IMEventStorage } from "../im/storage.js";
import type { NewsStorage } from "../news/storage.js";

/** Runtime context passed to every skill when it executes. */
export interface SkillContext {
  /** Agent instance for LLM calls if needed. */
  agent: Agent;
  /** Delivery target — where to send results. Optional for manual/dry runs. */
  delivery?: { platform: IMPlatform; chatId: string };
  /** Optional IM event log for recording outgoing skill messages. */
  imEventStorage?: IMEventStorage;
  /** Optional news storage for reading/writing articles. */
  newsStorage?: NewsStorage;
  /** Directory where the skill should persist its output files. */
  dataDir?: string;
  /** Optional progress logger — called during execution for WebUI real-time feedback. */
  log?: (msg: string) => void;
}

/**
 * A named, reusable unit of work that can be triggered by cron or other
 * orchestrators. Skills have full access to platform delivery, LLM agent,
 * and data stores via SkillContext.
 */
export interface Skill {
  /** Unique identifier — used in CronJobConfig.skillId */
  readonly id: string;
  /** Human-readable description shown in WebUI. */
  readonly description: string;
  run(ctx: SkillContext): Promise<void>;
}
