import type { MatchState } from "./types.js";

/** The heaviest phases of a bench window as mean ms per tick, heaviest first. */
export function benchPhases(phaseMs: Record<string, number>, ticks: number, top = 12): string {
  const rows = Object.entries(phaseMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, ms]) => `${name} ${(ms / Math.max(1, ticks)).toFixed(2)}`);
  return `  phases ms/tick: ${rows.join(" | ")}`;
}

/**
 * FNV-1a over every entity's id, whole-pixel position, hp and route length: the
 * oracle for a change that must not move the sim. Two runs with the same seed and
 * the same code print the same hash.
 */
export function benchHash(state: MatchState): string {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    h ^= v & 0xffff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 16) & 0xffff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const ids = [...state.entities.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const e = state.entities.get(id)!;
    mix(id);
    mix(e.x | 0);
    mix(e.y | 0);
    mix(Math.round(e.hp));
    mix(e.waypoints.length);
  }
  mix(state.tick);
  return h.toString(16).padStart(8, "0");
}
