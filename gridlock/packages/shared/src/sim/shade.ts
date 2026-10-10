import { SHADE_REVEAL_SECONDS, SHADE_SPOT_TILES, secondsToTicks } from "../catalog.js";
import { allies } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Shade's skin. Settled, it hides the Shade from every enemy: no enemy sees it or can pick
 * it, walking or still. A shot it fires, or any hit that takes its HP, shows it for
 * SHADE_REVEAL_SECONDS; an enemy unit within SHADE_SPOT_TILES always sees it. Inside a
 * building, shut down, or powered down it is just a body.
 */

export function isShade(type: string): boolean {
  return type === "shade";
}

/** It fired: the skin shows it for a while. */
export function revealShade(state: MatchState, e: Entity): void {
  if (!isShade(e.type)) return;
  e.revealUntil = state.tick + secondsToTicks(SHADE_REVEAL_SECONDS);
  e.cloaked = undefined;
}

/** An enemy of this side cannot see it: its skin is settled. */
export function hiddenCloaked(state: MatchState, playerId: string, e: Entity): boolean {
  return e.cloaked === true && !allies(state, playerId, e.ownerId);
}

function enemyClose(state: MatchState, e: Entity): boolean {
  const reach = SHADE_SPOT_TILES * state.tileSize;
  for (const o of state.entities.values()) {
    if (o.kind !== "unit" || o.hp <= 0 || o.wreck || o.shutdown || o.dormant) continue;
    if (allies(state, e.ownerId, o.ownerId)) continue;
    if (Math.abs(o.x - e.x) > reach + o.radius || Math.abs(o.y - e.y) > reach + o.radius) continue;
    if (Math.hypot(o.x - e.x, o.y - e.y) <= reach + o.radius) return true;
  }
  return false;
}

export function tickShades(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (!isShade(e.type)) continue;
    if (e.hp <= 0 || e.wreck) {
      e.cloaked = undefined;
      continue;
    }
    if (e.shadeHpSeen != null && e.hp < e.shadeHpSeen) revealShade(state, e);
    e.shadeHpSeen = e.hp;
    const settled = state.tick >= (e.revealUntil ?? 0);
    const cloak = settled && !e.shutdown && !e.dormant && e.garrisonedIn == null && !enemyClose(state, e);
    e.cloaked = cloak ? true : undefined;
  }
}
