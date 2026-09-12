import { catalog, LOW_POWER_MIN_SPEED } from "../catalog.js";
import type { MatchState } from "./types.js";

export function powerOf(state: MatchState, playerId: string): { provided: number; used: number; lowPower: boolean } {
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

/** 1 at surplus/even power; scales with provided/used when short, never 0. */
export function productionSpeed(provided: number, used: number): number {
  if (used <= provided) return 1;
  if (provided <= 0) return LOW_POWER_MIN_SPEED;
  return Math.max(LOW_POWER_MIN_SPEED, provided / used);
}
