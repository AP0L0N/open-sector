import { secondsToTicks, SUB_DETECT_TILES, SUB_REVEAL_SECONDS, submergesOf, torpedoesOf } from "../catalog.js";
import { allies, footprint, isWater, jetAloft, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * Floats or stands in the water: a boat, a swimmer, a wading walker, or a building with
 * water under it (the Marine Base). This is what a torpedo can meet. Anything in the air is not.
 */
export function afloat(state: MatchState, e: Entity): boolean {
  if (e.kind === "building") return footprint(e.tileX, e.tileY, e.tileW, e.tileH).some((t) => isWater(state, t.x, t.y));
  if (e.garrisonedIn != null || e.air || e.drone || jetAloft(e)) return false;
  return isWater(state, worldToTile(e.x, state.tileSize), worldToTile(e.y, state.tileSize));
}

/** A torpedo boat cannot engage anything that is not in the water. */
export function torpedoCannotReach(state: MatchState, shooter: Entity, target: Entity): boolean {
  return torpedoesOf(shooter.type) && !afloat(state, target);
}

/** A submarine that has not fired lately. */
export function submerged(state: MatchState, e: Entity): boolean {
  if (!submergesOf(e.type) || e.hp <= 0 || e.wreck) return false;
  if (e.surfacedTick == null) return true;
  return state.tick - e.surfacedTick > secondsToTicks(SUB_REVEAL_SECONDS);
}

/** The submarine just fired: everyone who has eyes on its water sees it for a while. */
export function surface(state: MatchState, e: Entity): void {
  if (submergesOf(e.type)) e.surfacedTick = state.tick;
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
