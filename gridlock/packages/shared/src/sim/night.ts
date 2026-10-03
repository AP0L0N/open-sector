import {
  DAY_SECONDS,
  DUSK_SECONDS,
  NEUTRAL_OWNER,
  NIGHT_REACH_MUL,
  NIGHT_SECONDS,
  SPOTLIGHT_ON_DAYLIGHT,
  SPOTLIGHT_TURN_DEG_PER_SEC,
  TICK_DT,
} from "../catalog.js";
import type { EntityType } from "../protocol.js";
import type { Entity, MatchState } from "./types.js";

/** One full day: day, dusk, night, dawn. Dawn is as long as dusk. */
export const DAY_CYCLE_SECONDS = DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS + DUSK_SECONDS;

/** 1 in full day, 0 in full night, sliding through dusk and dawn. The match opens at morning. */
export function daylightAt(tick: number): number {
  const s = (tick * TICK_DT) % DAY_CYCLE_SECONDS;
  if (s < DAY_SECONDS) return 1;
  if (s < DAY_SECONDS + DUSK_SECONDS) return 1 - (s - DAY_SECONDS) / DUSK_SECONDS;
  if (s < DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS) return 0;
  return Math.min(1, (s - DAY_SECONDS - DUSK_SECONDS - NIGHT_SECONDS) / DUSK_SECONDS);
}

/** Share of daylight sight and weapon reach left at this tick. */
export function nightReachMul(tick: number): number {
  return NIGHT_REACH_MUL + (1 - NIGHT_REACH_MUL) * daylightAt(tick);
}

/** A sight or reach in tiles, cut for the dark. Never below one tile while it had any. */
export function nightTiles(tiles: number, mul: number): number {
  if (mul >= 1 || tiles <= 0) return tiles;
  return Math.max(1, Math.round(tiles * mul));
}

/** Lamps are lit: spotlights paint the ground. */
export function spotlightsOn(tick: number): boolean {
  return daylightAt(tick) < SPOTLIGHT_ON_DAYLIGHT;
}

export function hasSpotlight(type: EntityType): boolean {
  return type === "tower";
}

/** A tower someone holds carries a working lamp. A neutral one stands dark. */
export function spotlightManned(e: {
  type: EntityType;
  ownerId: string;
  hp: number;
  ruined?: boolean;
  wreck?: boolean;
}): boolean {
  return hasSpotlight(e.type) && e.ownerId !== NEUTRAL_OWNER && e.hp > 0 && !e.ruined && !e.wreck;
}

/** Heading the lamp rests on before anyone turns it: the way the tower was placed. */
export function spotFacingOf(e: Pick<Entity, "facing" | "spotFacing">): number {
  return e.spotFacing ?? e.facing;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Swing every held lamp toward the heading Rotate gave it. */
export function tickSpotlights(state: MatchState, dt: number): void {
  const max = ((SPOTLIGHT_TURN_DEG_PER_SEC * Math.PI) / 180) * dt;
  for (const e of state.entities.values()) {
    if (e.kind !== "building" || !spotlightManned(e)) continue;
    const at = spotFacingOf(e);
    e.spotFacing = at;
    if (e.spotAim == null) continue;
    const delta = wrap(e.spotAim - at);
    if (Math.abs(delta) <= max) {
      e.spotFacing = wrap(e.spotAim);
      e.spotAim = undefined;
    } else {
      e.spotFacing = wrap(at + Math.sign(delta) * max);
    }
  }
}
