import {
  MOTHERSHIP_ABSORB_BASE_SECONDS,
  MOTHERSHIP_ABSORB_ENERGY_PER_HP,
  MOTHERSHIP_ABSORB_SECONDS_PER_PX,
  MOTHERSHIP_BEAMS,
  MOTHERSHIP_BEAM_TILES,
  MOTHERSHIP_FALL_PER_SEC,
  MOTHERSHIP_LIGHT_SECONDS,
  MOTHERSHIP_CALM_SECONDS,
  MOTHERSHIP_COMBAT_TILES,
  MOTHERSHIP_CREW,
  MOTHERSHIP_CREW_LEASH_TILES,
  MOTHERSHIP_CREW_SIZE,
  MOTHERSHIP_DROP_COOLDOWN_SECONDS,
  MOTHERSHIP_DROP_MAX_TILES,
  MOTHERSHIP_DROP_MIN_TILES,
  MOTHERSHIP_DROP_SECONDS,
  MOTHERSHIP_SHOCKWAVE,
  isArmoredType,
  isGarrisonable,
  isInfantryType,
  type TrainType,
  energyDomeOf,
  isMothership,
  isTorpedoBody,
} from "../catalog.js";
import { isAirborne, isCrashing } from "./air.js";
import { takeDamage } from "./crits.js";
import { airAlt } from "./elevation.js";
import { coverStrike } from "./field.js";
import { detachGarrisoned, livingGarrison, woundGarrison } from "./garrison.js";
import { allies, destroyEntity, isWater, makeEntity, walkable, worldToTile } from "./geo.js";
import { nextRand } from "./rng.js";
import { hideScout } from "./scout.js";
import { domeShelters } from "./energy-shield.js";
import { blastClutter } from "./clutter.js";
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

/** A fresh Mothership: no beams up, no crew down. */
export function newMothershipState(): MothershipState {
  return { beams: [], crew: [], calm: 0, dropCooldown: 0 };
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
    // A crewman whose ship is gone, or changed hands, stays where it stands: one of the hive's own now.
    if (e.beamedBy != null) {
      const ship = state.entities.get(e.beamedBy);
      if (!liveShip(ship) || ship.ownerId !== e.ownerId) e.beamedBy = undefined;
      continue;
    }
    if (!isMothership(e.type) || !e.mothership) continue;
    tickBeams(state, e, dt);
    tickCrew(state, e, dt);
  }
}

/** One Mothership's beams: drop the lost, take the next, and absorb the done. */
function tickBeams(state: MatchState, e: Entity, dt: number): void {
  {
    const ms = e.mothership!;
    if (!working(e)) {
      if (ms.beams.length > 0) release(state, ms);
      return;
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
    if (done.length === 0) return;
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

/** A unit beamed down or up: the Sim Unit's blink where it stands. */
function blinkAt(state: MatchState, o: Pick<Entity, "id" | "ownerId" | "x" | "y">): void {
  state.blinks.push({ id: state.nextId++, unitId: o.id, ownerId: o.ownerId, x: o.x, y: o.y, tx: o.x, ty: o.y });
}

/** In a fight: a beam held, a crewman with a target, or an enemy it sees within MOTHERSHIP_COMBAT_TILES. */
function inFight(state: MatchState, e: Entity, crew: readonly Entity[]): boolean {
  if (e.mothership!.beams.length > 0) return true;
  if (crew.some((c) => c.attackTarget != null)) return true;
  const reach = MOTHERSHIP_COMBAT_TILES * state.tileSize;
  for (const o of state.entities.values()) {
    if (Math.abs(o.x - e.x) > reach || Math.abs(o.y - e.y) > reach) continue;
    if (o.hp <= 0 || o.wreck || o.ownerId === "" || allies(state, e.ownerId, o.ownerId) || hiddenFromAuto(o)) continue;
    if (o.kind === "building" && o.ruined) continue;
    if (Math.hypot(o.x - e.x, o.y - e.y) > reach || !canSeeEntity(state, e.ownerId, o)) continue;
    return true;
  }
  return false;
}

/** The crewman goes back up into the ship: gone from the ground, a blink where it stood. */
function beamUp(state: MatchState, c: Entity): void {
  if (c.garrisonedIn != null) detachGarrisoned(state, c);
  blinkAt(state, c);
  destroyEntity(state, c);
}

/**
 * Open ground for `n` crew round the ship: random spots MOTHERSHIP_DROP_MIN_TILES to
 * MOTHERSHIP_DROP_MAX_TILES out, on dry ground a soldier can stand on, not on top of each other.
 * Fewer, or none, where there is not that much ground.
 */
function dropSpots(state: MatchState, e: Entity, n: number): { x: number; y: number }[] {
  const ts = state.tileSize;
  const min = MOTHERSHIP_DROP_MIN_TILES * ts;
  const max = MOTHERSHIP_DROP_MAX_TILES * ts;
  const out: { x: number; y: number }[] = [];
  for (let tries = 0; tries < n * 12 && out.length < n; tries++) {
    const a = nextRand(state) * Math.PI * 2;
    const r = min + Math.sqrt(nextRand(state)) * (max - min);
    const x = e.x + Math.cos(a) * r;
    const y = e.y + Math.sin(a) * r;
    const tx = worldToTile(x, ts);
    const ty = worldToTile(y, ts);
    if (isWater(state, tx, ty) || !walkable(state, tx, ty, "lancer")) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < ts * 3)) continue;
    out.push({ x: (tx + 0.5) * ts, y: (ty + 0.5) * ts });
  }
  return out;
}

/** The crew still missing, in MOTHERSHIP_CREW order: whatever has been lost since the last drop. */
function missingCrew(crew: readonly Entity[]): TrainType[] {
  const out: TrainType[] = [];
  for (const { type, count } of MOTHERSHIP_CREW) {
    const have = crew.filter((c) => c.type === type).length;
    for (let i = have; i < count; i++) out.push(type);
  }
  return out.slice(0, Math.max(0, MOTHERSHIP_CREW_SIZE - crew.length));
}

/**
 * One Mothership's crew. It takes back any who strayed past MOTHERSHIP_CREW_LEASH_TILES, and the
 * lot once it has been out of the fight for MOTHERSHIP_CALM_SECONDS. In a fight, flying and
 * running, it points beams at open ground and sends the missing crew down under them after
 * MOTHERSHIP_DROP_SECONDS (never more than MOTHERSHIP_CREW_SIZE down at once).
 */
function tickCrew(state: MatchState, e: Entity, dt: number): void {
  const ms = e.mothership!;
  ms.crew ??= [];
  ms.calm ??= 0;
  ms.dropCooldown ??= 0;
  let crew: Entity[] = [];
  for (const id of ms.crew) {
    const c = state.entities.get(id);
    if (c && c.hp > 0 && !c.wreck && c.beamedBy === e.id) crew.push(c);
  }
  if (!liveShip(e)) {
    ms.crew = [];
    ms.drop = undefined;
    return;
  }
  ms.calm = inFight(state, e, crew) ? 0 : ms.calm + dt;
  ms.dropCooldown = Math.max(0, ms.dropCooldown - dt);
  const leash = MOTHERSHIP_CREW_LEASH_TILES * state.tileSize;
  const calm = ms.calm >= MOTHERSHIP_CALM_SECONDS;
  crew = crew.filter((c) => {
    if (!calm && Math.hypot(c.x - e.x, c.y - e.y) <= leash) return true;
    beamUp(state, c);
    return false;
  });
  ms.crew = crew.map((c) => c.id);
  if (ms.drop) {
    if (!working(e)) {
      ms.drop = undefined;
      return;
    }
    ms.drop.t -= dt;
    if (ms.drop.t > 0) return;
    for (const p of ms.drop.spots) {
      const c = makeEntity(state, p.type, e.ownerId, p.x, p.y, { facing: Math.atan2(p.y - e.y, p.x - e.x) });
      c.beamedBy = e.id;
      ms.crew.push(c.id);
      blinkAt(state, c);
    }
    ms.drop = undefined;
    return;
  }
  if (!working(e) || ms.calm > 0 || ms.dropCooldown > 0) return;
  const types = missingCrew(crew);
  if (types.length === 0) return;
  const spots = dropSpots(state, e, types.length);
  if (spots.length === 0) return;
  ms.drop = { t: MOTHERSHIP_DROP_SECONDS, spots: spots.map((p, i) => ({ ...p, type: types[i]! })) };
  ms.dropCooldown = MOTHERSHIP_DROP_COOLDOWN_SECONDS;
}

/** The beam-down under way on this ship, for the client: each spot and how far along 0–1. */
export function dropView(e: Entity): { x: number; y: number; u: number }[] | undefined {
  const d = e.mothership?.drop;
  if (!d) return undefined;
  const u = Math.round(Math.max(0, Math.min(1, 1 - d.t / MOTHERSHIP_DROP_SECONDS)) * 100) / 100;
  return d.spots.map((p) => ({ x: p.x, y: p.y, u }));
}

/** Share of the full blow at `dist`: all of it inside the core, falling off to edgeShare at the edge. */
export function shockwaveFalloff(dist: number, core: number, radius: number): number {
  if (dist > radius) return 0;
  if (dist <= core) return 1;
  const u = (dist - core) / Math.max(1e-6, radius - core);
  return 1 - (1 - MOTHERSHIP_SHOCKWAVE.edgeShare) * u;
}

/**
 * A downed Mothership hits the ground (sim/air.ts finishAircraftCrash, or where it lay landed):
 * on dry ground a shockwave goes out (MOTHERSHIP_SHOCKWAVE), hurting everything in reach, friend
 * or foe, the full blow in the core and less the farther out. Fliers are clear of it, and
 * water swallows it: on water, nothing.
 */
export function mothershipShockwave(state: MatchState, src: Entity): void {
  const ts = state.tileSize;
  if (isWater(state, worldToTile(src.x, ts), worldToTile(src.y, ts))) return;
  const S = MOTHERSHIP_SHOCKWAVE;
  const radius = S.radiusTiles * ts;
  const core = S.coreTiles * ts;
  const soaked = new Set<number>();
  for (const o of [...state.entities.values()]) {
    if (o.id === src.id || o.hp <= 0 || o.garrisonedIn != null || o.wreck) continue;
    if (isAirborne(o) || o.drone) continue;
    const reach = o.kind === "building" ? radius + Math.min(o.tileW, o.tileH) * ts * 0.35 : radius + o.radius * 0.5;
    const fall = shockwaveFalloff(Math.hypot(o.x - src.x, o.y - src.y), core, reach);
    if (fall <= 0) continue;
    if (domeShelters(state, src.ownerId, src.x, src.y, o, S.damage * fall, soaked)) continue;
    let dmg: number;
    if (o.kind === "building") {
      dmg = Math.round(S.buildingDamage * fall);
      if (isGarrisonable(o.type) && livingGarrison(state, o).length > 0) woundGarrison(state, o, Math.round(S.damage * fall), 300);
    } else if (isArmoredType(o.type) && !isInfantryType(o.type)) {
      dmg = Math.round(o.hpMax * S.armorShare * fall);
      if (o.garrison.length) woundGarrison(state, o, Math.round(S.damage * fall * 0.5), 300);
      hideScout(state, o);
    } else {
      dmg = Math.round(S.damage * fall);
    }
    if (o.kind === "unit") coverStrike(o, dmg, state.tick, true);
    else takeDamage(o, dmg, state.tick);
  }
  blastClutter(state, src.x, src.y, radius);
  state.impacts.push({
    id: state.nextId++,
    ownerId: src.ownerId,
    kind: "kill",
    fromId: src.id,
    x: src.x,
    y: src.y,
    vx: 0,
    vy: 0,
    caliber: 300,
    blast: true,
    shockwave: radius,
  });
}
