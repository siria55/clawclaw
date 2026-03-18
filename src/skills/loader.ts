import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Parsed SKILL.md definition — metadata + agent instructions. */
export interface SkillDef {
  id: string;
  description: string;
  /** Keywords passed to browser searches. */
  queries: string[];
  /** Max articles to collect and render. */
  maxArticles: number;
  /** Agent instructions (SKILL.md body after frontmatter). */
  instructions: string;
}

/**
 * Parse a SKILL.md file into a SkillDef.
 * Frontmatter is simple key: value pairs (no nested YAML).
 * Array values use comma-separated format: `queries: AI科技,创业投资`
 */
export function loadSkillDef(skillDir: string): SkillDef {
  const content = readFileSync(join(skillDir, "SKILL.md"), "utf8");
  return parseSkillMd(content);
}

/** Exported for testing. */
export function parseSkillMd(content: string): SkillDef {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match?.[1] || !match[2]) throw new Error("SKILL.md missing frontmatter delimiters");
  const meta: Record<string, string> = {};
  for (const line of match[1].trim().split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return {
    id: meta["id"] ?? "",
    description: meta["description"] ?? "",
    queries: (meta["queries"] ?? "").split(",").map((q) => q.trim()).filter(Boolean),
    maxArticles: parseInt(meta["max-articles"] ?? "12", 10),
    instructions: match[2].trim(),
  };
}
