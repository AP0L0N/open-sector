import { SIPHON_BURROW_HP, burrowSecondsOf, canBurrow, halfBurrow, secondsToTicks } from "../catalog.js";
import { allies, clearOrder } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * Burrow. On the order the unit digs in where it stands, in plain sight; then it is down and
 * neither moves nor fires. On the order to rise it breaks out and comes up with its gun already
 * laid, so the first shot goes at once. Hit while digging or rising, it takes the hit.
 *
 * The Bile Worm goes all the way under: no enemy sees it or can pick it. The Siphon sinks only
 * half way: its back stays above the dirt, seen and shot at, but while down it carries
 * SIPHON_BURROW_HP times its hit points, the same share of the bar. It loses the extra as it
 * starts to haul itself out.
 */

/** Under the ground, all the way: hidden from every enemy. A half-sunk Siphon is not. */
export function burrowed(e: Pick<Entity, "burrow" | "type">): boolean {
  return e.burrow?.phase === "down" && !halfBurrow(e.type);
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
  e.burrow = { phase: "digging", until: state.tick + secondsToTicks(burrowSecondsOf(e.type).down) };
  return true;
}

export function startUnburrow(state: MatchState, e: Entity): boolean {
  if (!e.burrow || e.burrow.phase === "rising") return false;
  shrinkBurrowed(e);
  e.burrow = { phase: "rising", until: state.tick + secondsToTicks(burrowSecondsOf(e.type).up) };
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
    if (b.phase === "digging") {
      e.burrow = { phase: "down", until: Number.MAX_SAFE_INTEGER };
      if (halfBurrow(e.type)) swellBurrowed(e);
    } else if (b.phase === "rising") {
      e.burrow = undefined;
      // An ambush: it comes up with its gun laid.
      e.cooldown = 0;
    }
  }
}

/** Dug in: SIPHON_BURROW_HP times the hit points, same share of the bar. Cover stays on the hull. */
function swellBurrowed(e: Entity): void {
  if (!e.burrow || e.burrow.swell) return;
  const cover = e.coverBonus;
  const baseHp = Math.max(0, e.hp - cover);
  const baseMax = Math.max(1, e.hpMax - cover);
  e.hp = baseHp * SIPHON_BURROW_HP + cover;
  e.hpMax = baseMax * SIPHON_BURROW_HP + cover;
  e.burrow.swell = true;
}

/** Back to its own hit points, the same share of the bar it had dug in. */
function shrinkBurrowed(e: Entity): void {
  if (!e.burrow?.swell) return;
  const cover = e.coverBonus;
  const baseHp = Math.max(0, e.hp - cover);
  const baseMax = Math.max(1, e.hpMax - cover);
  e.hpMax = Math.max(1, Math.round(baseMax / SIPHON_BURROW_HP) + cover);
  e.hp = Math.max(1, Math.round(baseHp / SIPHON_BURROW_HP) + cover);
  if (e.hp > e.hpMax) e.hp = e.hpMax;
  e.burrow.swell = undefined;
}
