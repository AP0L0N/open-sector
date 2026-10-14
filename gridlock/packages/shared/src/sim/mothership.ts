import {
  MOTHERSHIP_ABSORB_BASE_SECONDS,
  MOTHERSHIP_ABSORB_ENERGY_PER_HP,
  MOTHERSHIP_ABSORB_SECONDS_PER_PX,
  MOTHERSHIP_BEAMS,
  MOTHERSHIP_BEAM_TILES,
  MOTHERSHIP_FALL_PER_SEC,
  MOTHERSHIP_LIGHT_SECONDS,
  energyDomeOf,
  isMothership,
  isTorpedoBody,
} from "../catalog.js";
import { isAirborne, isCrashing } from "./air.js";
import { airAlt } from "./elevation.js";
import { allies, destroyEntity, isWater, worldToTile } from "./geo.js";
import { diving } from "./naval.js";
import { hiddenFromAuto } from "./simunit.js";
import type { Entity, MatchState, MothershipBeam, MothershipState } from "./types.js";
import { canSeeEntity } from "./vision.js";

/**
 * The Mothership (catalog MOTHERSHIP_*). It flies in sim/air.ts (tickHover): sent at a unit it
 * hangs MOTHERSHIP_STANDOFF_TILES off it. It has no guns. This phase works its tractor beams:
 * up to MOTHERSHIP_BEAMS units at once inside MOTHERSHIP_BEAM_TILES, the one it was sent at
 * first, then the nearest enemies it can see. Each is lit for MOTHERSHIP_LIGHT_SECONDS, then
 * absorbed over a time that grows with its size (absorbSecondsOf). A unit that leaves the reach,
 * the sight of the ship's side, or the ground before that breaks free. An absorbed unit is gone:
 * no corpse, no wreck, and anyone riding in it goes too. It fills the ship's dome
 * (catalog MOTHERSHIP_DOME), or brings a drained dome straight back.
 *
 * Offline for lack of hive power (sim/hive-energy.ts), it drops every beam and comes down
 * (mothershipDown); on water it lies sunk, out of sight, until the power is back.
 */

/** A fresh Mothership: no beams up. */
export function newMothershipState(): MothershipState {
  return { beams: [] };
}

/** Seconds to absorb `o` once the light has shone: the bigger it is, the longer. */
export function absorbSecondsOf(o: Pick<Entity, "radius">): number {
  return MOTHERSHIP_ABSORB_BASE_SECONDS + Math.max(0, o.radius) * MOTHERSHIP_ABSORB_SECONDS_PER_PX;
}

/** Share 0–1 of the light phase done, and of the absorbing done, for a beam. */
export function beamProgress(b: MothershipBeam): { light: number; u: number } {
  const light = Math.min(1, b.t / MOTHERSHIP_LIGHT_SECONDS);
  const u = Math.max(0, Math.min(1, (b.t - MOTHERSHIP_LIGHT_SECONDS) / Math.max(1e-6, b.absorbSeconds)));
  return { light: Math.round(light * 100) / 100, u: Math.round(u * 100) / 100 };
}

/**
 * A unit a beam can take: on the ground or the water and out in the open, not in the air, not
 * under the water, not in a building or a hull, and not another Mothership. Enemies only,
 * unless `forced` (a force attack takes anything it can lift).
 */
export function mothershipCanTake(state: MatchState, ship: Entity, o: Entity, forced = false): boolean {
  if (o.id === ship.id || o.kind !== "unit" || o.hp <= 0 || o.wreck || o.garrisonedIn != null || o.chute) return false;
  if (o.drone || isAirborne(o) || isCrashing(o) || diving(o) || isTorpedoBody(o.type) || isMothership(o.type)) return false;
  if (o.absorbedBy != null && o.absorbedBy !== ship.id && liveShip(state.entities.get(o.absorbedBy))) return false;
  if (forced) return true;
  if (o.ownerId === "" || allies(state, ship.ownerId, o.ownerId) || hiddenFromAuto(o) || o.dormant) return false;
  return true;
}

function liveShip(e: Entity | undefined): e is Entity {
  return !!e && e.hp > 0 && !e.wreck && !!e.mothership && e.air?.phase !== "crash";
}

/** Up in the air and running: it can hold beams. */
function working(e: Entity): boolean {
  return liveShip(e) && !e.hiveOffline && !e.shutdown && isAirborne(e);
}

function reachOf(state: MatchState, o: Entity): number {
  return MOTHERSHIP_BEAM_TILES * state.tileSize + o.radius;
}

function inReach(state: MatchState, ship: Entity, o: Entity, slack = 1): boolean {
  return Math.hypot(o.x - ship.x, o.y - ship.y) <= reachOf(state, o) * slack;
}

/** What the ship was sent at, and whether it is a force attack. */
function orderedTarget(state: MatchState, e: Entity): { t: Entity; forced: boolean } | null {
  const o = e.order;
  if (!o || o.targetId == null || (o.kind !== "attack" && o.kind !== "forceattack")) return null;
  const t = state.entities.get(o.targetId);
  return t ? { t, forced: o.kind === "forceattack" } : null;
}

/** The beam stays on `o` while it can still take it, reach it, and (an enemy) see it. */
function holds(state: MatchState, ship: Entity, o: Entity | undefined, forced: boolean): boolean {
  if (!o || !mothershipCanTake(state, ship, o, forced)) return false;
  if (!inReach(state, ship, o, 1.25)) return false;
  return forced || canSeeEntity(state, ship.ownerId, o);
}

function release(state: MatchState, ship: MothershipState): void {
  for (const b of ship.beams) {
    const o = state.entities.get(b.targetId);
    if (o && o.absorbedBy != null) o.absorbedBy = undefined;
  }
  ship.beams = [];
}

/** Fill the ship's dome with `amount` points, or bring a drained one back with them. */
function refill(state: MatchState, e: Entity, amount: number): void {
  const def = energyDomeOf(e.type);
  if (!def || amount <= 0) return;
  const dome = state.energyShields?.find((s) => s.dome && s.fromId === e.id && s.hp > 0);
  if (dome) {
    dome.hp = Math.min(dome.hpMax, dome.hp + amount);
    return;
  }
  // Down after a break: it starts from nothing, and casts again now (sim/energy-shield.ts).
  const broken = e.shieldReady != null && state.tick < e.shieldReady;
  e.energy = Math.min(def.energy, (broken ? (e.energy ?? 0) : (e.energy ?? def.energy)) + amount);
  e.shieldReady = undefined;
}

/** The unit is drawn up into the hull: gone, and anyone inside it with it. A blink marks the spot. */
function absorb(state: MatchState, ship: Entity, o: Entity): void {
  refill(state, ship, o.hpMax * MOTHERSHIP_ABSORB_ENERGY_PER_HP);
  state.blinks.push({ id: state.nextId++, unitId: o.id, ownerId: o.ownerId, x: o.x, y: o.y, tx: o.x, ty: o.y });
  for (const r of [...state.entities.values()]) if (r.garrisonedIn === o.id) destroyEntity(state, r);
  destroyEntity(state, o);
  const ord = ship.order;
  if (ord && ord.targetId === o.id && (ord.kind === "attack" || ord.kind === "forceattack")) {
    ship.order = null;
    ship.attackTarget = null;
  }
}

/** Sim phase: every Mothership's beams light, hold, and absorb. */
export function tickMotherships(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (!isMothership(e.type) || !e.mothership) continue;
    const ms = e.mothership;
    if (!working(e)) {
      if (ms.beams.length > 0) release(state, ms);
      continue;
    }
    const order = orderedTarget(state, e);
    // Beams that lost their unit let it go.
    ms.beams = ms.beams.filter((b) => {
      const o = state.entities.get(b.targetId);
      const forced = !!order && order.forced && order.t.id === b.targetId;
      if (holds(state, e, o, forced)) return true;
      if (o && o.absorbedBy === e.id) o.absorbedBy = undefined;
      return false;
    });
    // The unit it was sent at first, then the nearest enemies in reach.
    const taken = new Set(ms.beams.map((b) => b.targetId));
    const add = (o: Entity) => {
      taken.add(o.id);
      o.absorbedBy = e.id;
      ms.beams.push({ targetId: o.id, t: 0, absorbSeconds: absorbSecondsOf(o) });
    };
    if (order && !taken.has(order.t.id) && ms.beams.length < MOTHERSHIP_BEAMS && holds(state, e, order.t, order.forced) && inReach(state, e, order.t)) {
      add(order.t);
    }
    if (ms.beams.length < MOTHERSHIP_BEAMS) {
      const reach = MOTHERSHIP_BEAM_TILES * state.tileSize + 64;
      const near: { o: Entity; d: number }[] = [];
      for (const o of state.entities.values()) {
        if (taken.has(o.id) || Math.abs(o.x - e.x) > reach || Math.abs(o.y - e.y) > reach) continue;
        if (!mothershipCanTake(state, e, o) || !inReach(state, e, o) || !canSeeEntity(state, e.ownerId, o)) continue;
        near.push({ o, d: Math.hypot(o.x - e.x, o.y - e.y) });
      }
      near.sort((a, b) => a.d - b.d || a.o.id - b.o.id);
      for (const { o } of near) {
        if (ms.beams.length >= MOTHERSHIP_BEAMS) break;
        add(o);
      }
    }
    const done: Entity[] = [];
    for (const b of ms.beams) {
      b.t += dt;
      const o = state.entities.get(b.targetId)!;
      o.absorbedBy = e.id;
      if (b.t >= MOTHERSHIP_LIGHT_SECONDS + b.absorbSeconds) done.push(o);
    }
    if (done.length === 0) continue;
    const gone = new Set(done.map((o) => o.id));
    ms.beams = ms.beams.filter((b) => !gone.has(b.targetId));
    for (const o of done) absorb(state, e, o);
  }
}

/** The beam on `o`, if a live Mothership holds one on it. */
export function beamOn(state: MatchState, o: Entity): { ship: Entity; beam: MothershipBeam } | null {
  if (o.absorbedBy == null) return null;
  const ship = state.entities.get(o.absorbedBy);
  if (!ship || !liveShip(ship)) return null;
  const beam = ship.mothership!.beams.find((b) => b.targetId === o.id);
  return beam ? { ship, beam } : null;
}

/**
 * The Mothership's flight while it is offline (sim/air.ts tickHover asks first): it holds still
 * and comes down to the ground, and lies sunk if that is water. True while it is down or coming
 * down. Back online, a ship on the ground lifts off again (the hover takeoff), and false.
 */
export function mothershipDown(state: MatchState, e: Entity, dt: number): boolean {
  const a = e.air!;
  const ms = e.mothership;
  if (!e.hiveOffline) {
    if (ms?.sunk) ms.sunk = undefined;
    if (a.alt <= 0.5 && a.phase === "fly") a.phase = "takeoff";
    return false;
  }
  a.phase = "fly";
  a.speed = 0;
  e.state = "idle";
  a.alt = Math.max(0, a.alt - MOTHERSHIP_FALL_PER_SEC * dt);
  if (ms) {
    const wet = airAlt(e) <= 0 && isWater(state, worldToTile(e.x, state.tileSize), worldToTile(e.y, state.tileSize));
    ms.sunk = wet || undefined;
  }
  return true;
}

/** A Mothership lying sunk on the water: out of every enemy's sight and reach. */
export function mothershipSunk(e: Pick<Entity, "mothership" | "hp">): boolean {
  return e.hp > 0 && !!e.mothership?.sunk;
}
