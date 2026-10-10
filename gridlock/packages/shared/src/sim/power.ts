import { catalog, LOW_POWER_MIN_SPEED, usesHiveEnergy } from "../catalog.js";
import type { MatchState } from "./types.js";

/** A side's power. The Xenite draw none: they run on hive energy (sim/hive-energy.ts). */
export function powerOf(state: MatchState, playerId: string): { provided: number; used: number; lowPower: boolean } {
  if (usesHiveEnergy(state.players.get(playerId)?.faction)) return { provided: 0, used: 0, lowPower: false };
  let provided = 0;
  let used = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0 || e.kind !== "building") continue;
    const p = catalog(e.type).power;
    if (p >= 0) provided += p;
    else used += -p;
  }
  return { provided, used, lowPower: used > provided };
}

/** Mark every building of a player short on power. Their lamps go dark and their CIWS and RAM stop. */
export function tickPower(state: MatchState): void {
  const low = new Map<string, boolean>();
  for (const e of state.entities.values()) {
    if (e.kind !== "building") continue;
    let short = low.get(e.ownerId);
    if (short === undefined) {
      short = state.players.has(e.ownerId) && powerOf(state, e.ownerId).lowPower;
      low.set(e.ownerId, short);
    }
    e.unpowered = short || undefined;
  }
}

/** 1 at surplus/even power; scales with provided/used when short, never 0. */
export function productionSpeed(provided: number, used: number): number {
  if (used <= provided) return 1;
  if (provided <= 0) return LOW_POWER_MIN_SPEED;
  return Math.max(LOW_POWER_MIN_SPEED, provided / used);
}
