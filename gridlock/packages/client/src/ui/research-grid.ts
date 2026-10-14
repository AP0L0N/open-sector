import { researchOf, type ResearchDef, type ResearchId, type ResearchSubject } from "@gridlock/shared";

/**
 * The upgrades a structure's grid shows. A level chain (Advanced, then Ultra Fusion) holds one
 * slot: the level running, else the next one the least upgraded of `mine` may take, else the
 * last one, done. A level past that stays off the grid until the one before it is researched.
 * Upgrades outside a chain (Force Shield, Shield Wall...) always show.
 */
export function visibleResearch(type: string, mine: readonly ResearchSubject[]): ResearchDef[] {
  const all = researchOf(type);
  const levels = all.filter((r) => r.level != null);
  if (levels.length === 0) return all;
  const runningLevel = mine.map((e) => e.research && levels.find((r) => r.id === e.research!.id)).find((r) => r);
  const lowest = mine.length > 0 ? Math.min(...mine.map((e) => e.level ?? 0)) : 0;
  const top = levels[levels.length - 1]!;
  const slot = runningLevel ?? levels.find((r) => r.level === lowest + 1) ?? top;
  return all.filter((r) => r.level == null || r.id === slot.id);
}

/** The research art for one cameo: the Force Shield has one per structure that can raise it. */
export function researchArtKey(id: ResearchId, type: string): string {
  return id === "forceshield" ? `${id}-${type}` : id;
}
