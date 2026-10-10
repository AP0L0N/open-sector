import { REGROWTH_BUILDING_PER_SEC, REGROWTH_DELAY_SECONDS, REGROWTH_UNIT_PER_SEC, regrows } from "../catalog.js";
import type { Entity, MatchState } from "./types.js";

/**
 * Regrowth: Bloom flesh closes its own wounds. Any HP loss restarts the clock; once a Bloom unit
 * or structure has gone REGROWTH_DELAY_SECONDS without one, it regains a share of its max HP
 * every second until whole. A building still going up does not regrow: it is not alive yet.
 */
export function tickRegrowth(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck || !regrows(e.type)) continue;
    regrow(e, dt);
  }
}

function regrow(e: Entity, dt: number): void {
  if (e.regrowSeen != null && e.hp < e.regrowSeen) e.regrowQuiet = 0;
  else e.regrowQuiet = (e.regrowQuiet ?? 0) + dt;
  if (e.regrowQuiet >= REGROWTH_DELAY_SECONDS && e.hp < e.hpMax && !growing(e)) {
    const rate = e.kind === "building" ? REGROWTH_BUILDING_PER_SEC : REGROWTH_UNIT_PER_SEC;
    e.hp = Math.min(e.hpMax, e.hp + e.hpMax * rate * dt);
  }
  e.regrowSeen = e.hp;
}

/** A structure still rising from the ground (raised in place) has nothing to regrow yet. */
function growing(e: Entity): boolean {
  return e.kind === "building" && e.state === "build";
}
