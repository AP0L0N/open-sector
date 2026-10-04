import {
  isTorpedoBody,
  secondsToTicks,
  SUB_AIR_RECOVER_MUL,
  SUB_DETECT_TILES,
  SUB_DIVE_SECONDS,
  SUB_REVEAL_SECONDS,
  submergesOf,
  torpedoesOf,
} from "../catalog.js";
import { allies, footprint, isWater, jetAloft, worldToTile } from "./geo.js";
import type { DiveState, Entity, MatchState } from "./types.js";

/**
 * Floats or stands in the water: a boat, a swimmer, a wading walker, or a building with
 * water under it (the Marine Base). This is what a torpedo can meet. Anything in the air is not.
 */
export function afloat(state: MatchState, e: Entity): boolean {
  if (e.kind === "building") return footprint(e.tileX, e.tileY, e.tileW, e.tileH).some((t) => isWater(state, t.x, t.y));
  if (e.garrisonedIn != null || e.air || e.drone || jetAloft(e)) return false;
  return isWater(state, worldToTile(e.x, state.tileSize), worldToTile(e.y, state.tileSize));
}

/**
 * A torpedo boat cannot engage anything that is not in the water, nor another torpedo.
 * Submerged, it only finds another submarine that is down too: it surfaces to strike a hull.
 */
export function torpedoCannotReach(state: MatchState, shooter: Entity, target: Entity): boolean {
  if (!torpedoesOf(shooter.type)) return false;
  if (isTorpedoBody(target.type) || !afloat(state, target)) return true;
  return diving(shooter) && !diving(target);
}

/** A submarine running below, seen by the enemy or not. */
export function diving(e: Entity): boolean {
  return submergesOf(e.type) && e.hp > 0 && !e.wreck && !!e.dive?.down;
}

/** A submarine running below that has not fired lately: out of the enemy's sight from afar. */
export function submerged(state: MatchState, e: Entity): boolean {
  if (!diving(e)) return false;
  if (e.surfacedTick == null) return true;
  return state.tick - e.surfacedTick > secondsToTicks(SUB_REVEAL_SECONDS);
}

/** The submarine just fired: everyone who has eyes on its water sees it for a while. */
export function surface(state: MatchState, e: Entity): void {
  if (submergesOf(e.type)) e.surfacedTick = state.tick;
}

function diveOf(e: Entity): DiveState {
  return (e.dive ??= { down: false, air: SUB_DIVE_SECONDS });
}

/** Take the boat down or bring it up. A boat that ran out of air stays up until the air is back. */
export function setDive(e: Entity, down: boolean): string | null {
  if (!submergesOf(e.type)) return null;
  const d = diveOf(e);
  if (down && d.winded) return "Out of air: it stays surfaced until its air is back.";
  d.down = down;
  return null;
}

/** Below, a submarine spends its air and surfaces when it runs out. Up, it takes air back in. */
export function tickSubmarines(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    const d = e.dive;
    if (!d || e.hp <= 0 || e.wreck || !submergesOf(e.type)) continue;
    if (d.down) {
      d.air = Math.max(0, d.air - dt);
      if (d.air <= 0) {
        d.down = false;
        d.winded = true;
      }
      continue;
    }
    if (d.air >= SUB_DIVE_SECONDS) continue;
    d.air = Math.min(SUB_DIVE_SECONDS, d.air + dt * SUB_AIR_RECOVER_MUL);
    if (d.air >= SUB_DIVE_SECONDS) d.winded = undefined;
  }
}

/**
 * A submerged boat stays out of `playerId`'s sight unless one of that side's units or
 * buildings is within SUB_DETECT_TILES of it. Fog still applies on top of this.
 */
export function hiddenSubmarine(state: MatchState, playerId: string, e: Entity): boolean {
  if (!submerged(state, e) || allies(state, playerId, e.ownerId)) return false;
  const ts = state.tileSize;
  const reach = SUB_DETECT_TILES * ts;
  for (const o of state.entities.values()) {
    if (o.hp <= 0 || o.wreck || !o.ownerId || !allies(state, playerId, o.ownerId)) continue;
    // A torpedo's body is no lookout.
    if (isTorpedoBody(o.type)) continue;
    if (o.kind === "building") {
      const nx = Math.max(o.tileX * ts, Math.min(e.x, (o.tileX + o.tileW) * ts));
      const ny = Math.max(o.tileY * ts, Math.min(e.y, (o.tileY + o.tileH) * ts));
      if (Math.hypot(e.x - nx, e.y - ny) <= reach) return false;
      continue;
    }
    if (Math.hypot(e.x - o.x, e.y - o.y) <= reach) return false;
  }
  return true;
}
