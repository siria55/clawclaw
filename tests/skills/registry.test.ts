import { describe, it, expect, vi } from "vitest";
import { SkillRegistry } from "../../src/skills/registry.js";
import type { Skill, SkillContext } from "../../src/skills/types.js";

function makeSkill(id: string): Skill {
  return { id, description: `skill ${id}`, run: vi.fn<[SkillContext], Promise<void>>() };
}

describe("SkillRegistry", () => {
  it("registers and retrieves a skill by id", () => {
    const registry = new SkillRegistry();
    const skill = makeSkill("foo");
    registry.register(skill);
    expect(registry.get("foo")).toBe(skill);
  });

  it("returns undefined for unknown id", () => {
    const registry = new SkillRegistry();
    expect(registry.get("missing")).toBeUndefined();
  });

  it("replaces existing skill with same id", () => {
    const registry = new SkillRegistry();
    const first = makeSkill("bar");
    const second = makeSkill("bar");
    registry.register(first);
    registry.register(second);
    expect(registry.get("bar")).toBe(second);
  });

  it("lists all registered ids", () => {
    const registry = new SkillRegistry();
    registry.register(makeSkill("a"));
    registry.register(makeSkill("b"));
    expect(registry.ids).toEqual(["a", "b"]);
  });
});
