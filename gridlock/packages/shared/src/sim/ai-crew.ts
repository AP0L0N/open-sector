/**
 * Crew calls a CPU or a map's neutral troops make for themselves, the way a
 * player would press the button: a submarine goes down when it sees the
 * enemy, and a Drone Op sends his drone up to look or to hunt. The CPU
 * gives these as commands (ai.ts); neutral crews, who have no seat to command
 * from, act on them directly (tickNeutralCrews).
 */

import { DRONE_BATTERY_SECONDS, DRONE_LEASH_TILES, NEUTRAL_OWNER, TICK_HZ, catalog, submergesOf, type DroneMode } from "../catalog.js";
import { droneOf, guardDrone, launchBlocked, launchDrone, orderDrone, setDroneMode } from "./drone.js";
import { airAlt } from "./elevation.js";
import { allies, ownerless } from "./geo.js";
import { setDive } from "./naval.js";
import { canSeeEntity } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

/** A submarine that went down on contact stays down this long after it last saw the enemy. */
export const SUB_AI_HOLD_TICKS = 30 * TICK_HZ;
/** Neutral crews look round this often. */
export const NEUTRAL_CREW_EVERY_TICKS = 2 * TICK_HZ;
/** A drone goes up just to look only on a battery this full, so it can stay out a while. */
export const DRONE_SCOUT_CHARGE = 0.9;

/** An enemy soldier, hull, or boat this side can see. Houses and empty defences are not the enemy. */
function seenFoe(state: MatchState, ownerId: string, o: Entity): boolean {
  if (o.kind !== "unit" || o.hp <= 0 || o.wreck || o.garrisonedIn != null) return false;
  if (ownerless(o) || allies(state, ownerId, o.ownerId)) return false;
  return canSeeEntity(state, ownerId, o);
}

/** A seen enemy inside the boat's own surfaced sight. */
function subContact(state: MatchState, e: Entity): boolean {
  const reach = catalog(e.type).sightTiles * state.tileSize;
  for (const o of state.entities.values()) {
    if (o.id === e.id || Math.hypot(o.x - e.x, o.y - e.y) > reach + o.radius) continue;
    if (seenFoe(state, e.ownerId, o)) return true;
  }
  return false;
}

/**
 * The depth this submarine wants now, or null to leave it. Down while an enemy
 * is in sight and for SUB_AI_HOLD_TICKS after; then up again for air. A named
 * strike sets its own depth: the boat closes in below and surfaces to fire.
 */
export function subDepthCall(state: MatchState, e: Entity): boolean | null {
  if (!submergesOf(e.type) || e.hp <= 0 || e.wreck) return null;
  const o = e.order;
  if ((o?.kind === "attack" || o?.kind === "forceattack") && !o.auto) return null;
  const down = !!e.dive?.down;
  if (subContact(state, e)) {
    e.aiDiveUntil = state.tick + SUB_AI_HOLD_TICKS;
    return down || e.dive?.winded ? null : true;
  }
  if (down && state.tick >= (e.aiDiveUntil ?? 0)) return false;
  return null;
}

/** The nearest enemy on the ground or the water that the side sees inside the operator's reach. */
function droneContact(state: MatchState, op: Entity): Entity | undefined {
  const reach = DRONE_LEASH_TILES * state.tileSize;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (o.air || airAlt(o) > 0) continue;
    const d = Math.hypot(o.x - op.x, o.y - op.y);
    if (d > reach + o.radius || d >= bestD) continue;
    if (!seenFoe(state, op.ownerId, o)) continue;
    best = o;
    bestD = d;
  }
  return best;
}

/** What a Drone Op does with his drone this pass. */
export interface DroneCall {
  /** Switch the drone (up or stowed) to this mode. */
  mode?: DroneMode;
  /** Put the stowed drone up. */
  launch?: boolean;
  /** Send the drone in on this enemy. */
  attackId?: number;
  /** Have the drone circle over its own operator. */
  overOp?: boolean;
}

/**
 * Search & Destroy on an enemy the side sees inside the leash. With none in
 * sight and `scout` set (out with the army, or a neutral post on watch), a
 * charged drone goes up in Surveillance over the operator to find one.
 */
export function droneCall(state: MatchState, op: Entity, scout: boolean): DroneCall | null {
  const link = op.droneLink;
  if (!link || op.hp <= 0 || op.garrisonedIn != null) return null;
  const foe = droneContact(state, op);
  const d = droneOf(state, op);
  if (d) {
    if (!foe || d.drone?.recall) return null;
    const busy = d.order?.kind === "attack" && d.order.targetId != null;
    if (d.drone?.mode === "strike" && busy) return null;
    return { mode: "strike", attackId: foe.id };
  }
  if (launchBlocked(state, op)) return null;
  if (foe) return { mode: "strike", launch: true, attackId: foe.id };
  if (scout && link.charge >= DRONE_BATTERY_SECONDS * DRONE_SCOUT_CHARGE) return { mode: "surveil", launch: true, overOp: true };
  return null;
}

/**
 * The map's neutral crews: a submarine dives on contact, and a Drone Op on
 * watch keeps a drone looking and sends it in on an enemy he sees.
 */
export function tickNeutralCrews(state: MatchState): void {
  if (state.tick < (state.neutralNextMicroTick ?? 0)) return;
  state.neutralNextMicroTick = state.tick + NEUTRAL_CREW_EVERY_TICKS;
  for (const e of [...state.entities.values()]) {
    if (e.ownerId !== NEUTRAL_OWNER || e.kind !== "unit" || e.hp <= 0 || e.wreck) continue;
    const depth = subDepthCall(state, e);
    if (depth != null) setDive(e, depth);
    const call = e.droneLink ? droneCall(state, e, true) : null;
    if (call) actDrone(state, e, call);
  }
}

/** Carry out a drone call straight on the sim, as the drone commands would. */
function actDrone(state: MatchState, op: Entity, call: DroneCall): void {
  if (call.mode) setDroneMode(state, op, call.mode);
  if (call.launch && launchDrone(state, op)) return;
  const d = droneOf(state, op);
  if (!d) return;
  const t = call.attackId != null ? state.entities.get(call.attackId) : undefined;
  if (t) orderDrone(state, d, { kind: "attack", targetId: t.id });
  else if (call.overOp) guardDrone(d, op.x, op.y, d.facing, op.id);
}
