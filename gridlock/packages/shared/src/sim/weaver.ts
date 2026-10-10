import {
  WEAVER_MEND_CYBORG,
  WEAVER_MEND_HEAVY,
  WEAVER_PULSE_SECONDS,
  WEAVER_REACH_TILES,
  factionOf,
  isCyborg,
  secondsToTicks,
  staysAloft,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { allies } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Weaver's mend. Every WEAVER_PULSE_SECONDS a working Weaver sends HP into each hive unit of
 * its side within WEAVER_REACH_TILES: WEAVER_MEND_CYBORG to a cyborg, WEAVER_MEND_HEAVY to any
 * other Xenomorph body. A unit in reach of two Weavers on the same tick mends once; a Weaver never
 * mends itself. Torn cyborg legs come back through syncCyborgLegs once the HP is there.
 */

export function isWeaver(type: string): boolean {
  return type === "weaver";
}

/** Can this Weaver mend now: alive, on its feet or crawling, linked, powered, and out in the open. */
function mending(e: Entity): boolean {
  return isWeaver(e.type) && e.hp > 0 && !e.wreck && !e.shutdown && !e.dormant && e.garrisonedIn == null;
}

/** May `w` mend `o`: a live Xenomorph unit of its side, not inside, not itself, hurt; in the air only a Xenomorph flier, which has no nest to mend on. */
export function weaverMends(state: MatchState, w: Entity, o: Entity): boolean {
  if (o === w || o.kind !== "unit" || o.hp <= 0 || o.wreck || o.hp >= o.hpMax) return false;
  if (factionOf(o.type) !== "xeno" || o.garrisonedIn != null || (isAirborne(o) && !staysAloft(o.type))) return false;
  if (!allies(state, w.ownerId, o.ownerId)) return false;
  const reach = WEAVER_REACH_TILES * state.tileSize;
  return Math.hypot(o.x - w.x, o.y - w.y) <= reach + o.radius;
}

export function mendAmount(type: Entity["type"]): number {
  return isCyborg(type) ? WEAVER_MEND_CYBORG : WEAVER_MEND_HEAVY;
}

export function tickWeavers(state: MatchState): void {
  let pulsing: Entity[] | null = null;
  for (const e of state.entities.values()) {
    if (!mending(e)) continue;
    if (e.mendNext == null) e.mendNext = state.tick + secondsToTicks(WEAVER_PULSE_SECONDS);
    if (state.tick < e.mendNext) continue;
    e.mendNext = state.tick + secondsToTicks(WEAVER_PULSE_SECONDS);
    (pulsing ??= []).push(e);
  }
  if (!pulsing) return;
  const mended = new Set<number>();
  for (const o of state.entities.values()) {
    if (o.kind !== "unit" || o.hp <= 0 || o.hp >= o.hpMax || factionOf(o.type) !== "xeno") continue;
    for (const w of pulsing) {
      if (mended.has(o.id) || !weaverMends(state, w, o)) continue;
      o.hp = Math.min(o.hpMax, o.hp + mendAmount(o.type));
      mended.add(o.id);
    }
  }
}
