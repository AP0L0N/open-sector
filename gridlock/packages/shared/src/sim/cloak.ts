import { STALKER_CLOAK_COOLDOWN_SECONDS, STALKER_CLOAK_SECONDS, canCloak, secondsToTicks } from "../catalog.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Stalker's cloak. On the order it bends the light round itself for STALKER_CLOAK_SECONDS:
 * no enemy sees it or can pick it (the same `cloaked` mark as the Shade's skin), and it walks
 * unseen. Cloaked it picks no targets of its own; a target the player names it fires at, and that
 * shot drops the cloak. Dropped, by time or by a shot, it needs STALKER_CLOAK_COOLDOWN_SECONDS
 * before it can cloak again.
 */

/** Cloaked on order right now. */
export function cloakedOnOrder(e: Pick<Entity, "cloakUntil">): boolean {
  return e.cloakUntil != null;
}

export function startCloak(state: MatchState, e: Entity): boolean {
  if (!canCloak(e.type) || e.hp <= 0 || e.wreck || e.garrisonedIn != null || e.cloakUntil != null) return false;
  if (state.tick < (e.cloakReady ?? 0)) return false;
  e.cloakUntil = state.tick + secondsToTicks(STALKER_CLOAK_SECONDS);
  e.cloaked = true;
  // Whatever it was shooting at by itself, it lets go: the point is not to be seen.
  if (e.order?.kind === "attack" && e.order.auto) {
    e.order = null;
    if (e.state === "attack") e.state = "idle";
  }
  e.attackTarget = null;
  return true;
}

/** The cloak drops: its time ran out, or it fired. */
export function dropCloak(state: MatchState, e: Entity): void {
  if (e.cloakUntil == null) return;
  e.cloakUntil = undefined;
  e.cloaked = undefined;
  e.cloakReady = state.tick + secondsToTicks(STALKER_CLOAK_COOLDOWN_SECONDS);
}

/** 0–1: how far the cloak has come back since it dropped. 1 is ready. */
export function cloakCharge(state: MatchState, e: Entity): number {
  if (e.cloakUntil != null) return 0;
  const ready = e.cloakReady ?? 0;
  if (state.tick >= ready) return 1;
  const total = secondsToTicks(STALKER_CLOAK_COOLDOWN_SECONDS);
  return Math.max(0, Math.min(1, 1 - (ready - state.tick) / total));
}

export function tickCloaks(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.cloakUntil == null) continue;
    if (e.hp <= 0 || e.wreck || e.garrisonedIn != null || state.tick >= e.cloakUntil) dropCloak(state, e);
  }
}
