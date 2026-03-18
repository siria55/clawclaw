import type { Agent } from "../core/agent.js";
import type { IMEventStorage } from "../im/storage.js";

/** Result returned by a skill after execution. */
export interface SkillResult {
  /** Absolute or relative path to the generated output file (e.g. a PNG screenshot). */
  outputPath?: string;
}

/** Runtime context passed to every skill when it executes. */
export interface SkillContext {
  /** Agent instance for LLM calls if needed. */
  agent: Agent;
  /** Optional IM event log for recording outgoing skill messages. */
  imEventStorage?: IMEventStorage;
  /** Directory where the skill should persist its output files. */
  dataDir?: string;
  /** Optional progress logger — called during execution for WebUI real-time feedback. */
  log?: (msg: string) => void;
}

/**
 * A named, reusable unit of work that can be triggered by cron or other
 * orchestrators. Skills generate content and return output file paths;
 * IM delivery is handled by the caller (e.g. CronScheduler).
 */
export interface Skill {
  /** Unique identifier — used in CronJobConfig.skillId */
  readonly id: string;
  /** Human-readable description shown in WebUI. */
  readonly description: string;
  run(ctx: SkillContext): Promise<SkillResult>;
}
