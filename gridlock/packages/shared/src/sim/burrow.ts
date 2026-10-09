import { STALKER_BURROW_SECONDS, STALKER_UNBURROW_SECONDS, canBurrow, secondsToTicks } from "../catalog.js";
import { allies, clearOrder } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Stalker's burrow. On the order it digs in where it stands for STALKER_BURROW_SECONDS, in
 * plain sight; then it is under the ground: no enemy sees it or can pick it, and it neither moves
 * nor fires. On the order to rise it breaks out over STALKER_UNBURROW_SECONDS and comes up with its
 * gun already laid, so the first shot goes at once. Hit while digging or rising, it takes the hit.
 */

/** Under the ground, all the way: hidden from every enemy. */
export function burrowed(e: Pick<Entity, "burrow">): boolean {
  return e.burrow?.phase === "down";
}

/** Digging, under, or rising: it stays put and holds its fire. */
export function burrowBusy(e: Pick<Entity, "burrow">): boolean {
  return e.burrow != null;
}

/** An enemy of this side cannot see it: it is down under the ground. */
export function hiddenBurrowed(state: MatchState, playerId: string, e: Entity): boolean {
  return burrowed(e) && !allies(state, playerId, e.ownerId);
}

export function startBurrow(state: MatchState, e: Entity): boolean {
  if (!canBurrow(e.type) || e.burrow || e.hp <= 0 || e.wreck || e.garrisonedIn != null) return false;
  clearOrder(e);
  e.orderQueue = undefined;
  e.holdPosition = false;
  e.burrow = { phase: "digging", until: state.tick + secondsToTicks(STALKER_BURROW_SECONDS) };
  return true;
}

export function startUnburrow(state: MatchState, e: Entity): boolean {
  if (!e.burrow || e.burrow.phase === "rising") return false;
  e.burrow = { phase: "rising", until: state.tick + secondsToTicks(STALKER_UNBURROW_SECONDS) };
  return true;
}

export function tickBurrows(state: MatchState): void {
  for (const e of state.entities.values()) {
    const b = e.burrow;
    if (!b) continue;
    if (e.hp <= 0 || e.wreck) {
      e.burrow = undefined;
      continue;
    }
    e.waypoints = [];
    if (state.tick < b.until) continue;
    if (b.phase === "digging") e.burrow = { phase: "down", until: Number.MAX_SAFE_INTEGER };
    else if (b.phase === "rising") {
      e.burrow = undefined;
      // An ambush: it comes up with its gun laid.
      e.cooldown = 0;
    }
  }
}
