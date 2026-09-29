import {
  AIR_BELT_REARM_PER_SEC,
  AIR_CLIMB_PER_SEC,
  AIR_CRUISE_ALT,
  AIR_DIVE_CONE_DEG,
  AIR_DIVE_PER_SEC,
  AIR_DIVE_START_TILES,
  AIR_EXTEND_TILES,
  AIR_FINAL_TILES,
  AIR_FUEL_RESERVE,
  AIR_FUEL_SECONDS,
  AIR_GROUND_TURN_MUL,
  AIR_ORBIT_TILES,
  AIR_REFUEL_PER_SEC,
  AIR_RELEASE_ALT,
  AIR_REPAIR_PER_SEC,
  AIR_ROLL_SPEED,
  AIR_STRAFE_ALT,
  AIR_TAKEOFF_SECONDS,
  AIR_TARGET_SPREAD,
  AIR_TAXI_SPEED,
  AIRFIELD_PAD_X,
  AIRFIELD_PAD_Y,
  AIRFIELD_PADS,
  AIRFIELD_RUNWAY_HALF,
  AIRFIELD_RUNWAY_Y,
  AIRFIELD_THRESHOLD,
  BOMB_ARMOR_DIRECT,
  BOMB_ARMOR_NEAR,
  BOMB_BUILDING_DAMAGE,
  BOMB_CALIBER,
  BOMB_DAMAGE,
  BOMB_DIRECT_TILES,
  BOMB_FALL_SECONDS,
  BOMB_REARM_SECONDS,
  BOMB_RELEASE_TILES,
  BOMB_SCATTER_TILES,
  BOMB_SPLASH_TILES,
  BOMB_TRACK_CHANCE,
  STUKA_BOMBS,
  STUKA_MG,
  STUKA_MG_PER_TICK,
  STUKA_MG_ROUNDS,
  addCrit,
  catalog,
  hasTracks,
  infantryGunFor,
  isAircraftType,
  isArmoredType,
  isGarrisonable,
  isInfantryType,
} from "../catalog.js";
import type { ImpactView } from "../protocol.js";
import { aimAngle } from "./ballistics.js";
import { takeDamage } from "./crits.js";
import { aimHeight, airAlt, worldTileHeight } from "./elevation.js";
import { allies, fellTreeAt, isTree, newAirState, playerTeam, worldToTile } from "./geo.js";
import { livingGarrison, woundGarrison } from "./garrison.js";
import { mortarFalloff } from "./mortar.js";
import { stepTurn } from "./orders.js";
import { powerOf, productionSpeed } from "./power.js";
import { noteImpactSurface } from "./remains.js";
import { nextRand } from "./rng.js";
import { hideScout } from "./scout.js";
import { canSeeEntity } from "./vision.js";
import type { AirState, Entity, MatchState, Order, Projectile } from "./types.js";

/** Runway heading, world radians. The strip runs east–west. */
export const RUNWAY_HEADING = 0;
/** Parked planes sit nose south in their revetment, tail to the strip. */
export const PARK_HEADING = Math.PI / 2;

/** In the air (or rolling off the pad). A parked plane is a ground target. */
export function isAirborne(e: { air?: AirState | { alt: number; phase?: string } }): boolean {
  return airAlt(e) > 0.5;
}

/**
 * Small arms reach a plane in the air: rifles, the handgun, the MG42, the
 * scoped rifle, the PTRD, and the Walker's gatlings. Tank guns and the mortar
 * cannot lay on it. The Titan's main gun is a tank gun; its pods pick planes
 * on their own (tickRocketPods), so the unit's own target stays on the ground.
 */
export function reachesAircraft(e: Entity): boolean {
  if (e.type === "walker") return true;
  const gun = infantryGunFor(e);
  return !!gun && gun.id !== "mortar";
}

/** Extra spread on a shot at this target. 1 for anything on the ground. */
export function airTargetSpreadMul(target: Entity): number {
  return isAirborne(target) ? AIR_TARGET_SPREAD : 1;
}

type FieldRect = Pick<Entity, "tileX" | "tileY" | "tileW" | "tileH">;

/** World pixel of a hardstand: a row beside the strip, on its near (south) side. */
export function airfieldPadWorld(field: FieldRect, pad: number, tileSize: number): { x: number; y: number } {
  const i = Math.max(0, Math.min(AIRFIELD_PADS - 1, pad));
  const w = field.tileW * tileSize;
  const h = field.tileH * tileSize;
  return { x: field.tileX * tileSize + w * AIRFIELD_PAD_X[i]!, y: field.tileY * tileSize + h * AIRFIELD_PAD_Y };
}

/** Strip centreline `y`, its half-width, the touchdown marks `x0` (west) and `x1` (east), and the middle `cx`. */
export function airfieldRunway(
  field: FieldRect,
  tileSize: number,
): { y: number; half: number; x0: number; x1: number; cx: number } {
  const w = field.tileW * tileSize;
  const h = field.tileH * tileSize;
  const left = field.tileX * tileSize;
  return {
    y: field.tileY * tileSize + h * AIRFIELD_RUNWAY_Y,
    half: h * AIRFIELD_RUNWAY_HALF,
    x0: left + w * AIRFIELD_THRESHOLD,
    x1: left + w * (1 - AIRFIELD_THRESHOLD),
    cx: left + w / 2,
  };
}

/** Where a plane from this hardstand joins the strip. */
function runwayEntry(field: FieldRect, pad: number, tileSize: number): { x: number; y: number } {
  return { x: airfieldPadWorld(field, pad, tileSize).x, y: airfieldRunway(field, tileSize).y };
}

/** Take off toward the longer run of strip: west pads roll east, east pads roll west. */
function takeoffHeading(field: FieldRect, pad: number, tileSize: number): number {
  const west = airfieldPadWorld(field, pad, tileSize).x <= airfieldRunway(field, tileSize).cx;
  return west ? RUNWAY_HEADING : RUNWAY_HEADING + Math.PI;
}

export { newAirState };

/** Pads taken on this Airfield by living planes, optionally ignoring one plane. */
export function padsTaken(state: MatchState, field: Entity, exceptId?: number): Set<number> {
  const out = new Set<number>();
  for (const e of state.entities.values()) {
    if (!e.air || e.hp <= 0 || e.id === exceptId) continue;
    if (e.air.homeId === field.id) out.add(e.air.pad);
  }
  return out;
}

/** Planes homed here plus Stukas still in its queue. Training stops at AIRFIELD_PADS. */
export function padsSpoken(state: MatchState, field: Entity): number {
  return padsTaken(state, field).size + field.queue.filter((j) => isAircraftType(j.type)).length;
}

export function freePad(state: MatchState, field: Entity, exceptId?: number): number | null {
  const taken = padsTaken(state, field, exceptId);
  for (let i = 0; i < AIRFIELD_PADS; i++) if (!taken.has(i)) return i;
  return null;
}

function liveHome(state: MatchState, e: Entity): Entity | null {
  const id = e.air?.homeId;
  if (id == null) return null;
  const f = state.entities.get(id);
  if (!f || f.hp <= 0 || f.type !== "airfield" || f.ownerId !== e.ownerId) return null;
  return f;
}

/** Keep the home pad, or move to the nearest owned Airfield with a free pad. */
function ensureHome(state: MatchState, e: Entity): Entity | null {
  const a = e.air;
  if (!a) return null;
  const home = liveHome(state, e);
  if (home) return home;
  a.homeId = null;
  let best: Entity | null = null;
  let bestPad = 0;
  let bestD = Infinity;
  for (const f of state.entities.values()) {
    if (f.type !== "airfield" || f.hp <= 0 || f.ownerId !== e.ownerId) continue;
    // A Stuka in that field's queue already holds a pad. Taking it would stall the queue.
    if (padsSpoken(state, f) >= AIRFIELD_PADS) continue;
    const pad = freePad(state, f, e.id);
    if (pad == null) continue;
    const d = Math.hypot(f.x - e.x, f.y - e.y);
    if (d < bestD) {
      bestD = d;
      best = f;
      bestPad = pad;
    }
  }
  if (!best) return null;
  a.homeId = best.id;
  a.pad = bestPad;
  return best;
}

function cruiseSpeed(state: MatchState, e: Entity): number {
  return catalog(e.type).moveTilesPerSec * state.tileSize;
}

function turnRate(e: Entity): number {
  return (catalog(e.type).turnDegPerSec * Math.PI) / 180;
}

function turnRadius(state: MatchState, e: Entity): number {
  return cruiseSpeed(state, e) / Math.max(1e-6, turnRate(e));
}

function angOff(want: number, cur: number): number {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function headTo(e: Entity, want: number, dt: number, mul = 1): void {
  e.facing = stepTurn(e.facing, want, catalog(e.type).turnDegPerSec * mul, dt).angle;
  e.turretFacing = e.facing;
}

/**
 * Turn toward a point. When it is behind and inside the turning circle,
 * hold straight until there is room to come round onto it.
 */
function steerTo(state: MatchState, e: Entity, x: number, y: number, dt: number): void {
  const d = Math.hypot(x - e.x, y - e.y);
  const bearing = Math.atan2(y - e.y, x - e.x);
  const off = angOff(bearing, e.facing);
  if (Math.abs(off) > Math.PI / 2 && d < 1.8 * turnRadius(state, e)) return;
  headTo(e, bearing, dt);
}

function orbitRadius(state: MatchState, e: Entity): number {
  return Math.max(AIR_ORBIT_TILES * state.tileSize, turnRadius(state, e) * 1.15);
}

/** Circle a point clockwise on screen, pulling in or out to hold the radius. */
function orbit(state: MatchState, e: Entity, cx: number, cy: number, dt: number): void {
  const r = orbitRadius(state, e);
  const dx = e.x - cx;
  const dy = e.y - cy;
  const d = Math.hypot(dx, dy);
  if (d > r * 1.6) {
    steerTo(state, e, cx, cy, dt);
    return;
  }
  const radial = Math.atan2(dy, dx);
  const err = Math.max(-1, Math.min(1, (d - r) / r));
  headTo(e, radial + Math.PI / 2 + err * (Math.PI / 3), dt);
}

function approachAlt(a: AirState, goal: number, dt: number): void {
  if (a.alt < goal) a.alt = Math.min(goal, a.alt + AIR_CLIMB_PER_SEC * dt);
  else if (a.alt > goal) a.alt = Math.max(goal, a.alt - AIR_DIVE_PER_SEC * dt);
}

function advance(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
  const v = cruiseSpeed(state, e) * a.speed;
  e.x += Math.cos(e.facing) * v * dt;
  e.y += Math.sin(e.facing) * v * dt;
  const maxX = state.width * state.tileSize - 1;
  const maxY = state.height * state.tileSize - 1;
  e.x = Math.max(1, Math.min(maxX, e.x));
  e.y = Math.max(1, Math.min(maxY, e.y));
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
}

/** Near the map edge a plane banks back toward the middle before anything else. */
function edgeTurn(state: MatchState, e: Entity, dt: number): boolean {
  const m = turnRadius(state, e) * 0.9;
  const w = state.width * state.tileSize;
  const h = state.height * state.tileSize;
  const out = e.x < m || e.y < m || e.x > w - m || e.y > h - m;
  if (!out) return false;
  const toMid = Math.atan2(h / 2 - e.y, w / 2 - e.x);
  if (Math.abs(angOff(toMid, e.facing)) < Math.PI / 2) return false;
  headTo(e, toMid, dt);
  return true;
}

/**
 * Start of the straight final: out along the strip centreline past the end
 * away from the plane's hardstand, so it lands long and rolls out toward it.
 * Kept inside the map so the approach never runs off it.
 */
function finalFix(state: MatchState, e: Entity, home: Entity): { x: number; y: number } {
  const ts = state.tileSize;
  const rw = airfieldRunway(home, ts);
  const len = AIR_FINAL_TILES * ts;
  const x = airfieldPadWorld(home, e.air!.pad, ts).x <= rw.cx ? rw.x1 + len : rw.x0 - len;
  const m = turnRadius(state, e);
  const w = state.width * state.tileSize;
  const h = state.height * state.tileSize;
  return { x: Math.max(m, Math.min(w - m, x)), y: Math.max(m, Math.min(h - m, rw.y)) };
}

/** Seconds to fly home and land from here. */
function secondsHome(state: MatchState, e: Entity, home: Entity): number {
  const pad = airfieldPadWorld(home, e.air!.pad, state.tileSize);
  const d = Math.hypot(pad.x - e.x, pad.y - e.y) + AIR_FINAL_TILES * state.tileSize * 2;
  return d / Math.max(1, cruiseSpeed(state, e));
}

function spent(a: AirState): boolean {
  return a.bombs <= 0 && a.rounds <= 0;
}

/** Plate stops a wing MG round. Infantry, soft trucks, and parked planes do not. */
function wingGunsHurt(target: Entity): boolean {
  if (target.kind !== "unit" || target.wreck) return false;
  if (isAirborne(target)) return false;
  return !isArmoredType(target.type);
}

function loiterHere(e: Entity): void {
  e.order = { kind: "move", x: e.x + Math.cos(e.facing) * 40, y: e.y + Math.sin(e.facing) * 40 };
  e.attackTarget = null;
}

/** Give a plane an order. A parked plane starts its takeoff roll. */
export function orderAircraft(state: MatchState, e: Entity, order: Order): void {
  const a = e.air;
  if (!a || e.hp <= 0) return;
  if (order.kind === "land" && a.phase === "parked") {
    e.order = null;
    return;
  }
  if (order.kind === "land" && a.phase === "takeoff" && a.taxi) {
    // Still on the taxiway: turn back to the hardstand.
    taxiHome(e);
    return;
  }
  e.order = order;
  e.attackTarget = null;
  e.waypoints = [];
  e.guardFacing = null;
  e.holdPosition = false;
  a.extend = false;
  if (a.phase === "parked" || (a.phase === "landing" && a.touched && order.kind !== "land")) {
    // Taxi out onto the strip, line up, and roll.
    a.phase = "takeoff";
    a.taxi = true;
    a.touched = false;
    a.roll = 0;
    a.speed = 0;
  } else if (a.phase === "landing" && order.kind !== "land") {
    a.phase = "fly";
  }
  e.state = "move";
}

/** On the ground, heading back to its hardstand. */
function taxiHome(e: Entity): void {
  const a = e.air!;
  a.phase = "landing";
  a.touched = true;
  a.taxi = true;
  a.roll = 0;
  e.order = { kind: "land" };
  e.attackTarget = null;
}

/** Stop in the air: circle where the plane is. On the pad: stay parked. */
export function stopAircraft(e: Entity): void {
  const a = e.air;
  if (!a) return;
  if (a.phase === "parked") {
    e.order = null;
    return;
  }
  // On the ground a stop goes back to the hardstand; it does not lift off.
  if (a.phase === "landing" && a.touched) return;
  if (a.phase === "takeoff" && a.taxi) {
    taxiHome(e);
    return;
  }
  if (a.phase === "landing") a.phase = "fly";
  a.extend = false;
  loiterHere(e);
}

export function tickAir(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    const a = e.air;
    if (!a || e.hp <= 0) continue;
    if (a.phase === "parked") {
      servicePad(state, e, dt);
      continue;
    }
    a.fuel = Math.max(0, a.fuel - dt);
    if (a.phase === "takeoff") tickTakeoff(state, e, dt);
    else if (a.phase === "landing") tickLanding(state, e, dt);
    else tickFly(state, e, dt);
    const onGround = a.phase === "takeoff" || (a.phase === "landing" && a.touched) || e.air?.phase === "parked";
    if (a.fuel <= 0 && !onGround) {
      // Dry tank. The plane goes down where it is.
      e.hp = 0;
    }
  }
}

function servicePad(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
  a.alt = 0;
  a.speed = 0;
  e.state = "idle";
  const home = liveHome(state, e);
  if (!home) {
    a.homeId = null;
    return;
  }
  const pow = powerOf(state, e.ownerId);
  const s = dt * productionSpeed(pow.provided, pow.used);
  a.fuel = Math.min(AIR_FUEL_SECONDS, a.fuel + AIR_REFUEL_PER_SEC * s);
  e.hp = Math.min(e.hpMax, e.hp + AIR_REPAIR_PER_SEC * s);
  a.rounds = Math.min(STUKA_MG_ROUNDS, a.rounds + AIR_BELT_REARM_PER_SEC * s);
  if (a.bombs < STUKA_BOMBS) {
    a.rearm += s;
    if (a.rearm >= BOMB_REARM_SECONDS) {
      a.bombs += 1;
      a.rearm = 0;
    }
  } else {
    a.rearm = 0;
  }
}

/**
 * Roll along the ground toward a point at taxi speed, pivoting first when it
 * is well off the nose. True once the plane is on it.
 */
function taxiTo(state: MatchState, e: Entity, x: number, y: number, dt: number): boolean {
  const a = e.air!;
  a.alt = 0;
  e.state = "move";
  const d = Math.hypot(x - e.x, y - e.y);
  const step = cruiseSpeed(state, e) * AIR_TAXI_SPEED * dt;
  if (d <= Math.max(0.5, step)) {
    e.x = x;
    e.y = y;
    e.tileX = worldToTile(x, state.tileSize);
    e.tileY = worldToTile(y, state.tileSize);
    a.speed = 0;
    return true;
  }
  const want = Math.atan2(y - e.y, x - e.x);
  headTo(e, want, dt, AIR_GROUND_TURN_MUL);
  if (Math.abs(angOff(want, e.facing)) > Math.PI / 4) {
    a.speed = 0;
    return false;
  }
  a.speed = AIR_TAXI_SPEED;
  advance(state, e, dt);
  return false;
}

function tickTakeoff(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
  const ts = state.tileSize;
  const home = liveHome(state, e);
  if (!home) a.homeId = null;
  e.state = "move";
  if (a.taxi) {
    // Out of the revetment and onto the strip.
    if (home) {
      const entry = runwayEntry(home, a.pad, ts);
      if (!taxiTo(state, e, entry.x, entry.y, dt)) return;
    }
    a.taxi = false;
    a.roll = 0;
  }
  if (a.roll === 0 && home) {
    // Line up on the strip before opening the throttle.
    const heading = takeoffHeading(home, a.pad, ts);
    if (Math.abs(angOff(heading, e.facing)) > 1e-3) {
      headTo(e, heading, dt, AIR_GROUND_TURN_MUL);
      a.speed = 0;
      return;
    }
  }
  a.roll += dt;
  const u = Math.min(1, a.roll / AIR_TAKEOFF_SECONDS);
  a.speed = Math.max(a.speed, AIR_ROLL_SPEED * 0.3 + (1 - AIR_ROLL_SPEED * 0.3) * u);
  if (u > 0.5) a.alt += AIR_CLIMB_PER_SEC * 1.5 * dt;
  advance(state, e, dt);
  e.state = "move";
  if (u >= 1) {
    a.phase = "fly";
    a.alt = Math.max(a.alt, 2);
    a.speed = 1;
  }
}

function tickFly(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
  a.speed = Math.min(1, a.speed + 0.5 * dt);
  const home = ensureHome(state, e);
  if (e.order?.kind !== "land" && home) {
    if (a.fuel <= secondsHome(state, e, home) + AIR_FUEL_RESERVE || spent(a)) {
      e.order = { kind: "land" };
      e.attackTarget = null;
      a.extend = false;
    }
  }
  if (!e.order) loiterHere(e);
  let altGoal = AIR_CRUISE_ALT;
  const turned = edgeTurn(state, e, dt);
  const o = e.order!;
  e.state = "move";
  if (o.kind === "land") {
    if (!home) {
      loiterHere(e);
    } else if (!turned) {
      const f = finalFix(state, e, home);
      steerTo(state, e, f.x, f.y, dt);
      if (Math.hypot(f.x - e.x, f.y - e.y) < state.tileSize * 6) a.phase = "landing";
    }
  } else if (o.kind === "attack" && o.targetId != null) {
    const t = state.entities.get(o.targetId);
    if (!t || t.hp <= 0 || isAirborne(t) || allies(state, e.ownerId, t.ownerId)) {
      loiterHere(e);
    } else if (canSeeEntity(state, e.ownerId, t)) {
      o.x = t.x;
      o.y = t.y;
      altGoal = attackRun(state, e, t.x, t.y, t, dt, turned, false);
    } else if (o.x != null && o.y != null && Math.hypot(o.x - e.x, o.y - e.y) > orbitRadius(state, e)) {
      // Lost from sight. Fly to where it was last seen and look again.
      if (!turned) steerTo(state, e, o.x, o.y, dt);
    } else {
      loiterHere(e);
    }
  } else if (o.kind === "forceattack" && o.x != null && o.y != null) {
    const t = o.targetId != null ? state.entities.get(o.targetId) : undefined;
    if (o.targetId != null && (!t || t.hp <= 0 || isAirborne(t))) {
      loiterHere(e);
    } else if (a.bombs <= 0 && !(t && wingGunsHurt(t) && a.rounds > 0)) {
      e.order = { kind: "move", x: o.x, y: o.y };
    } else {
      altGoal = attackRun(state, e, t?.x ?? o.x, t?.y ?? o.y, t, dt, turned, true);
    }
  } else if (o.kind === "attackmove" && o.x != null && o.y != null) {
    let t = e.attackTarget != null ? state.entities.get(e.attackTarget) : undefined;
    if (t && (t.hp <= 0 || isAirborne(t) || !canSeeEntity(state, e.ownerId, t) || !canHurt(a, t))) t = undefined;
    if (!t) t = acquireGround(state, e);
    e.attackTarget = t?.id ?? null;
    if (t) altGoal = attackRun(state, e, t.x, t.y, t, dt, turned, false);
    else if (!turned) flyToOrOrbit(state, e, o.x, o.y, dt);
  } else if (o.x != null && o.y != null) {
    if (!turned) flyToOrOrbit(state, e, o.x, o.y, dt);
  } else {
    loiterHere(e);
  }
  approachAlt(a, altGoal, dt);
  advance(state, e, dt);
}

function flyToOrOrbit(state: MatchState, e: Entity, x: number, y: number, dt: number): void {
  const d = Math.hypot(x - e.x, y - e.y);
  if (d > orbitRadius(state, e) * 1.6) steerTo(state, e, x, y, dt);
  else orbit(state, e, x, y, dt);
}

function canHurt(a: AirState, t: Entity): boolean {
  return a.bombs > 0 || (a.rounds > 0 && wingGunsHurt(t));
}

/** Nearest enemy on the ground this plane can see and has something for. */
function acquireGround(state: MatchState, e: Entity): Entity | undefined {
  const a = e.air!;
  const reach = catalog(e.type).sightTiles * state.tileSize;
  let best: Entity | undefined;
  let bestD = reach * reach;
  for (const o of state.entities.values()) {
    if (o.hp <= 0 || o.wreck || o.garrisonedIn != null || o.id === e.id) continue;
    if (!o.ownerId || allies(state, e.ownerId, o.ownerId)) continue;
    if (isAirborne(o) || o.type === "sandbags" || o.type === "teeth") continue;
    if (o.kind === "building" && a.bombs <= 0) continue;
    if (!canHurt(a, o)) continue;
    const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
    if (d > bestD) continue;
    if (!canSeeEntity(state, e.ownerId, o)) continue;
    bestD = d;
    best = o;
  }
  return best;
}

/**
 * One pass at the target: line up, dive, drop the bomb and fire the wing
 * guns, then fly out straight and come round again. Returns the height the
 * plane is trying to hold.
 */
function attackRun(
  state: MatchState,
  e: Entity,
  tx: number,
  ty: number,
  target: Entity | undefined,
  dt: number,
  turned: boolean,
  forced: boolean,
): number {
  const a = e.air!;
  const ts = state.tileSize;
  const d = Math.hypot(tx - e.x, ty - e.y);
  const off = Math.abs(angOff(Math.atan2(ty - e.y, tx - e.x), e.facing));
  const bomb = a.bombs > 0;
  const guns = a.rounds > 0 && !!target && wingGunsHurt(target);
  if (!bomb && !guns) {
    if (liveHome(state, e)) e.order = { kind: "land" };
    else loiterHere(e);
    return AIR_CRUISE_ALT;
  }
  if (a.extend) {
    if (d > AIR_EXTEND_TILES * ts) a.extend = false;
    return AIR_CRUISE_ALT;
  }
  if (!turned) steerTo(state, e, tx, ty, dt);
  const cone = (AIR_DIVE_CONE_DEG * Math.PI) / 180;
  const diving = d < AIR_DIVE_START_TILES * ts && off < cone;
  const goal = diving ? (bomb ? AIR_RELEASE_ALT : AIR_STRAFE_ALT) : AIR_CRUISE_ALT;
  if (diving && guns && d <= STUKA_MG.rangeTiles * ts && off <= (STUKA_MG.arcDeg * Math.PI) / 180) {
    fireWingGuns(state, e, target!, d);
  }
  if (bomb && diving && d <= BOMB_RELEASE_TILES * ts * 1.15 && off < (15 * Math.PI) / 180 && a.alt <= AIR_RELEASE_ALT + 3) {
    dropBomb(state, e, tx, ty, forced);
    a.extend = true;
  }
  if (d < ts * 2 || (off > (100 * Math.PI) / 180 && d < turnRadius(state, e))) a.extend = true;
  return goal;
}

function fireWingGuns(state: MatchState, e: Entity, target: Entity, dist: number): void {
  const a = e.air!;
  const n = Math.min(a.rounds, STUKA_MG_PER_TICK);
  const range = STUKA_MG.rangeTiles * state.tileSize;
  const bearing = Math.atan2(target.y - e.y, target.x - e.x);
  const moving = target.waypoints.length > 0 || target.state === "move";
  const z0 = worldTileHeight(state, e.x, e.y) + a.alt;
  const zAim = aimHeight(state, target);
  const ground = worldTileHeight(state, target.x, target.y);
  const drop = Math.max(0.1, z0 - zAim);
  const travel = Math.min(range * 1.2, dist * Math.max(1, (z0 - ground) / drop) + 4);
  for (let i = 0; i < n; i++) {
    const ang = aimAngle(bearing, STUKA_MG.spreadDeg, dist, range, () => nextRand(state), moving);
    const speed = STUKA_MG.projectileSpeed;
    const p: Projectile = {
      id: state.nextId++,
      ownerId: e.ownerId,
      team: playerTeam(state, e.ownerId),
      x: e.x + Math.cos(ang) * (e.radius + 2),
      y: e.y + Math.sin(ang) * (e.radius + 2),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      damage: STUKA_MG.damage,
      penetration: STUKA_MG.penetration,
      caliber: STUKA_MG.caliber,
      life: travel / speed,
      ignoreId: e.id,
      fromId: e.id,
      bounced: false,
      shell: null,
      z: z0,
      vz: -((z0 - zAim) / Math.max(1e-6, dist)) * speed,
    };
    state.projectiles.push(p);
  }
  a.rounds = Math.max(0, a.rounds - n);
}

function dropBomb(state: MatchState, e: Entity, tx: number, ty: number, forced: boolean): void {
  const a = e.air!;
  const r = BOMB_SCATTER_TILES * state.tileSize * Math.sqrt(nextRand(state));
  const ang = nextRand(state) * Math.PI * 2;
  const maxX = state.width * state.tileSize - 1;
  const maxY = state.height * state.tileSize - 1;
  const lx = Math.max(0, Math.min(maxX, tx + Math.cos(ang) * r));
  const ly = Math.max(0, Math.min(maxY, ty + Math.sin(ang) * r));
  const fall = BOMB_FALL_SECONDS;
  state.projectiles.push({
    id: state.nextId++,
    ownerId: e.ownerId,
    team: playerTeam(state, e.ownerId),
    x: e.x,
    y: e.y,
    vx: (lx - e.x) / fall,
    vy: (ly - e.y) / fall,
    damage: BOMB_DAMAGE,
    penetration: 0,
    caliber: BOMB_CALIBER,
    life: fall,
    ignoreId: e.id,
    fromId: e.id,
    bounced: false,
    shell: null,
    flight: "bomb",
    landX: lx,
    landY: ly,
    apex: a.alt,
    flightTime: fall,
    harmAllies: forced,
    z: a.alt,
  });
  a.bombs -= 1;
}

/** Advance a falling bomb. False once it has burst. */
export function stepBomb(state: MatchState, p: Projectile, dt: number): boolean {
  const total = p.flightTime ?? BOMB_FALL_SECONDS;
  const stepDt = p.life > 0 ? Math.min(dt, p.life) : 0;
  p.x += p.vx * stepDt;
  p.y += p.vy * stepDt;
  p.life -= dt;
  const u = Math.min(1, Math.max(0, (total - Math.max(0, p.life)) / total));
  p.z = (p.apex ?? 0) * (1 - u * u);
  if (p.life > 0) return true;
  if (p.landX != null && p.landY != null) {
    p.x = p.landX;
    p.y = p.landY;
  }
  p.z = 0;
  detonateBomb(state, p);
  return false;
}

function detonateBomb(state: MatchState, p: Projectile): void {
  const ts = state.tileSize;
  const tx = worldToTile(p.x, ts);
  const ty = worldToTile(p.y, ts);
  if (isTree(state, tx, ty)) fellTreeAt(state, tx, ty);
  const radius = BOMB_SPLASH_TILES * ts;
  const direct = BOMB_DIRECT_TILES * ts;
  let killed = false;
  for (const e of [...state.entities.values()]) {
    if (e.hp <= 0 || e.wreck || e.garrisonedIn != null) continue;
    if (e.type === "sandbags" || e.type === "teeth") continue;
    if (isAirborne(e)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const reach = e.kind === "building" ? radius + Math.min(e.tileW, e.tileH) * ts * 0.35 : radius;
    if (d > reach) continue;
    const friendly = e.ownerId !== "" && allies(state, p.ownerId, e.ownerId);
    if (friendly && !p.harmAllies) continue;
    const fall = mortarFalloff(d, reach);
    let dmg: number;
    if (e.kind === "building") {
      dmg = Math.round(BOMB_BUILDING_DAMAGE * fall);
      if (isGarrisonable(e.type) && livingGarrison(state, e).length > 0) woundGarrison(state, e, dmg, p.caliber);
    } else if (isArmoredType(e.type) && !isInfantryType(e.type)) {
      dmg = Math.round(e.hpMax * (d <= direct ? BOMB_ARMOR_DIRECT : BOMB_ARMOR_NEAR * fall));
      if (hasTracks(e.type) && nextRand(state) < BOMB_TRACK_CHANCE * fall) addCrit(e, "tracks");
      hideScout(state, e);
    } else {
      dmg = Math.round(BOMB_DAMAGE * fall);
    }
    takeDamage(e, dmg, state.tick);
    if (e.hp <= 0) killed = true;
  }
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId: p.ownerId,
    kind: killed ? "kill" : "miss",
    fromId: p.fromId,
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    caliber: p.caliber,
    blast: true,
    mortar: true,
    bomb: true,
  };
  noteImpactSurface(state, impact, p, "miss");
  state.impacts.push(impact);
}

/** A plane that dies in the air hits the ground in a fireball. */
export function aircraftDown(state: MatchState, e: Entity): void {
  if (!e.air || !isAirborne(e)) return;
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId: e.ownerId,
    kind: "kill",
    fromId: e.id,
    x: e.x + Math.cos(e.facing) * 12,
    y: e.y + Math.sin(e.facing) * 12,
    vx: Math.cos(e.facing) * 100,
    vy: Math.sin(e.facing) * 100,
    caliber: 60,
    blast: true,
  };
  noteImpactSurface(state, impact, { caliber: 60, shell: null, vx: impact.vx, vy: impact.vy }, "miss");
  state.impacts.push(impact);
}

/**
 * Line up on the strip centreline from the end the plane came in over, glide
 * down to the touchdown mark, roll out to its hardstand's taxiway, and taxi
 * in. A plane that cannot make the strip goes round.
 */
function tickLanding(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
  const home = ensureHome(state, e);
  if (!home) {
    if (a.touched) {
      // The field is gone from under it: stop where it is.
      stopOnGround(e, e.facing);
    } else {
      a.phase = "fly";
      loiterHere(e);
    }
    return;
  }
  const ts = state.tileSize;
  const pad = airfieldPadWorld(home, a.pad, ts);
  if (a.taxi) {
    if (taxiTo(state, e, pad.x, pad.y, dt)) stopOnGround(e, PARK_HEADING);
    return;
  }
  const rw = airfieldRunway(home, ts);
  const final = AIR_FINAL_TILES * ts;
  e.state = "move";
  if (a.touched) {
    // Roll out along the strip, braking to taxi speed at the turn-off.
    const dir = Math.cos(e.facing) >= 0 ? 1 : -1;
    const left = dir * (pad.x - e.x);
    const step = cruiseSpeed(state, e) * Math.max(a.speed, AIR_TAXI_SPEED) * dt;
    if (left <= step) {
      a.taxi = true;
      return;
    }
    a.alt = 0;
    a.speed = AIR_TAXI_SPEED + (AIR_ROLL_SPEED - AIR_TAXI_SPEED) * Math.min(1, left / (6 * ts));
    headTo(e, Math.atan2(rw.y - e.y, dir * 3 * ts), dt);
    advance(state, e, dt);
    return;
  }
  const dir = e.x < rw.cx ? 1 : -1;
  const thr = dir > 0 ? rw.x0 : rw.x1;
  const along = dir * (thr - e.x);
  const lateral = e.y - rw.y;
  if (along > final * 1.8 || Math.abs(lateral) > final) {
    // Came in crossways. Go round.
    a.phase = "fly";
    return;
  }
  // Chase a point on the centreline ahead so the nose settles onto the strip.
  headTo(e, Math.atan2(rw.y - e.y, dir * 6 * ts), dt);
  const u = Math.max(0, Math.min(1, along / final));
  const lined = Math.abs(lateral) < final * 0.25 && Math.abs(angOff(dir > 0 ? 0 : Math.PI, e.facing)) < Math.PI / 6;
  approachAlt(a, lined ? AIR_CRUISE_ALT * u : Math.max(4, a.alt), dt);
  a.speed = AIR_ROLL_SPEED + (1 - AIR_ROLL_SPEED) * u;
  if (a.alt <= 0.5 && along <= 2 * ts && Math.abs(lateral) <= rw.half) {
    a.alt = 0;
    a.touched = true;
  }
  advance(state, e, dt);
}

/** Wheels chocked: parked, facing `heading`. */
function stopOnGround(e: Entity, heading: number): void {
  const a = e.air!;
  e.facing = heading;
  e.turretFacing = heading;
  a.phase = "parked";
  a.alt = 0;
  a.speed = 0;
  a.extend = false;
  a.taxi = false;
  a.touched = false;
  e.order = null;
  e.attackTarget = null;
  e.state = "idle";
}
