import type { Skill } from "./types.js";

/**
 * Registry that maps skill IDs to Skill implementations.
 * Passed to CronScheduler so it can resolve skills by id at fire time.
 */
export class SkillRegistry {
  readonly #skills = new Map<string, Skill>();

  /** Register a skill. Replaces any existing skill with the same id. */
  register(skill: Skill): void {
    this.#skills.set(skill.id, skill);
  }

  /** Look up a skill by id. Returns undefined if not found. */
  get(id: string): Skill | undefined {
    return this.#skills.get(id);
  }

  /** All registered skill ids. */
  get ids(): string[] {
    return [...this.#skills.keys()];
  }
}
