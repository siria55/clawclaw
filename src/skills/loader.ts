import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Parsed SKILL.md definition — metadata + agent instructions. */
export interface SkillDef {
  id: string;
  description: string;
  /** Keywords passed to browser searches. */
  queries: string[];
  /** Max articles to collect and render. */
  maxArticles: number;
  /** Candidate articles requested from the extraction pass before quota trimming. */
  maxCandidates: number;
  /** Final domestic article quota. */
  domesticArticles: number;
  /** Final international article quota. */
  internationalArticles: number;
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

/**
 * Find the most recent `YYYY-MM-DD.png` output file for a skill.
 * Returns the absolute path, or undefined if none exists.
 */
export function findLatestSkillPng(dataRoot: string, skillId: string): string | undefined {
  const dir = join(dataRoot, skillId);
  if (!existsSync(dir)) return undefined;
  const pngs = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.png$/.test(f))
    .sort();
  if (pngs.length === 0) return undefined;
  return join(dir, pngs[pngs.length - 1]!);
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
  const legacyMaxArticles = parsePositiveInt(meta["max-articles"], 12);
  const hasQuotaFields = meta["domestic-articles"] !== undefined || meta["international-articles"] !== undefined;
  const domesticArticles = parsePositiveInt(meta["domestic-articles"], hasQuotaFields ? legacyMaxArticles : legacyMaxArticles);
  const internationalArticles = parsePositiveInt(meta["international-articles"], hasQuotaFields ? 0 : 0);
  const maxArticles = hasQuotaFields ? domesticArticles + internationalArticles : legacyMaxArticles;
  const maxCandidates = Math.max(
    parsePositiveInt(meta["max-candidates"], Math.max(maxArticles * 3, maxArticles)),
    maxArticles,
  );
  return {
    id: meta["id"] ?? "",
    description: meta["description"] ?? "",
    queries: (meta["queries"] ?? "").split(",").map((q) => q.trim()).filter(Boolean),
    maxArticles,
    maxCandidates,
    domesticArticles: hasQuotaFields ? domesticArticles : maxArticles,
    internationalArticles: hasQuotaFields ? internationalArticles : 0,
    instructions: match[2].trim(),
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
