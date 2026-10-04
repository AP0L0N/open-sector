import { buildingRect, rectLocal, rectWorld, type BuildingRect } from "../building-rect.js";
import {
  AIR_BELT_REARM_PER_SEC,
  AIR_CLIMB_PER_SEC,
  AIR_CRASH_BUILDING_DAMAGE,
  AIR_CRASH_HULL_MIN,
  AIR_CRASH_HULL_SHARE,
  AIR_CRASH_COVER_MAX,
  AIR_CRASH_COVER_MIN,
  AIR_CRASH_RANGE_MAX,
  AIR_CRASH_RANGE_MIN,
  AIR_CRASH_SHIVER_DEG,
  AIR_CRASH_SINK_MAX,
  AIR_CRASH_SINK_MIN,
  AIR_CRASH_SOFT_DAMAGE,
  AIR_CRASH_SPEED_MAX,
  AIR_CRASH_SPEED_MIN,
  AIR_CRASH_SPLASH_TILES,
  AIR_CRASH_TIME_MAX,
  AIR_CRASH_TIME_MIN,
  AIR_CRASH_TURN_MAX,
  AIR_CRASH_TURN_MIN,
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
  BV222_DROP_ALT,
  BV222_DROP_TILES,
  PARA_DOOR_SECONDS,
  CIWS_AIR_SPREAD,
  FW190_BARRAGE_ARC_DEG,
  FW190_BARRAGE_COOLDOWN,
  FW190_BARRAGE_LINE_TILES,
  FW190_BARRAGE_ROUNDS,
  FW190_BARRAGE_TILES,
  FW190_CANNON,
  FW190_WING_GUN_OFFSET,
  radarLaidOf,
  STUKA_MG,
  STUKA_MG_PER_TICK,
  STUKA_MG_ROUNDS,
  addCrit,
  airLoadoutOf,
  TREE_COVER_HEIGHT,
  catalog,
  coverHeightOf,
  hasTracks,
  trackCritAllowed,
  infantryGunFor,
  isAircraftType,
  isArmoredType,
  isDroneType,
  isFighterType,
  isGarrisonable,
  isInfantryType,
  isJumpJetType,
  isTransportType,
  isBattleship,
} from "../catalog.js";
import { hasCargo, loseRiders, payloadOf, planeRiders, releaseCanister, startJumping, tickDoor } from "./airdrop.js";
import type { ImpactView } from "../protocol.js";
import { aimAngle } from "./ballistics.js";
import { takeDamage } from "./crits.js";
import { coverStrike } from "./field.js";
import { aimHeight, airAlt, entityHeight, weaponRangeWorld, worldTileHeight } from "./elevation.js";
import { allies, buildingBounds, buildingContains, burnTreeAt, fellTreeAt, isTree, newAirState, playerTeam, tileCenter, worldToTile } from "./geo.js";
import { livingGarrison, woundGarrison } from "./garrison.js";
import { mortarFalloff } from "./mortar.js";
import { stepTurn } from "./orders.js";
import { distToRoute, patrolLegIndex, stepPatrolLeg } from "./patrol.js";
import { powerOf, productionSpeed } from "./power.js";
import { noteImpactSurface } from "./remains.js";
import { nextRand } from "./rng.js";
import { hideScout } from "./scout.js";
import { canSeeEntity } from "./vision.js";
import { blastWrecks, toWreck } from "./wreck.js";
import { nightReachMul } from "./night.js";
import type { AirState, Entity, MatchState, Order, Projectile } from "./types.js";

/** Runway heading of an unturned Airfield, world radians: the strip runs east–west. A turned one adds its facing. */
export const RUNWAY_HEADING = 0;
/** Parked planes on an unturned Airfield sit nose south in their revetment, tail to the strip (see parkHeading). */
export const PARK_HEADING = Math.PI / 2;

/** In the air (or rolling off the pad). A parked plane is a ground target. */
export function isAirborne(e: { air?: AirState | { alt: number; phase?: string }; jet?: { alt: number } }): boolean {
  return airAlt(e) > 0.5;
}

/** Shot down and still falling. Nothing hurts it until the airframe hits. */
export function isCrashing(e: { air?: { phase?: string } | null }): boolean {
  return e.air?.phase === "crash";
}

/**
 * Small arms reach a plane in the air: rifles, the handgun, the MG42, the
 * scoped rifle, the PTRD, the Rocketer's tube (an air-burst rocket), the
 * Walker's gatlings, and the CIWS. Tank guns and
 * the mortar cannot lay on it. The Titan's main gun is a tank gun; its pods pick
 * planes on their own (tickRocketPods), so the unit's own target stays on the ground.
 */
export function reachesAircraft(e: Entity): boolean {
  // The Battle Ship reaches a plane with its CIWS mounts, not its main guns.
  if (e.type === "walker" || radarLaidOf(e.type) || isBattleship(e.type)) return true;
  const gun = infantryGunFor(e);
  return !!gun && gun.id !== "mortar";
}

/** Extra spread on a shot at this target. 1 for anything on the ground. A radar-laid gun opens less. */
export function airTargetSpreadMul(target: Entity, shooter?: Entity): number {
  if (!isAirborne(target)) return 1;
  return shooter && radarLaidOf(shooter.type) ? CIWS_AIR_SPREAD : AIR_TARGET_SPREAD;
}

type FieldRect = Pick<Entity, "type" | "facing" | "tileX" | "tileY" | "tileW" | "tileH">;

/**
 * The Airfield's own frame: u runs along the strip (east at facing 0), v across it
 * (south at facing 0), both from the middle of the field. The layout fractions in the
 * catalog are shares of the unturned footprint, so every point is placed in u, v and
 * turned into the world with the field.
 */
export function airfieldFrame(field: FieldRect, tileSize: number): BuildingRect {
  const box = {
    type: field.type,
    facing: field.facing,
    x: (field.tileX + field.tileW / 2) * tileSize,
    y: (field.tileY + field.tileH / 2) * tileSize,
  };
  return buildingRect(box, tileSize);
}

/** Frame point from shares of the unturned footprint (0..1 along the strip, 0..1 from the back). */
function frameAt(r: BuildingRect, along: number, across: number): { x: number; y: number } {
  return rectWorld(r, (along - 0.5) * 2 * r.halfU, (across - 0.5) * 2 * r.halfV);
}

/** World pixel of a hardstand: a row beside the strip, on its near (south) side. */
export function airfieldPadWorld(field: FieldRect, pad: number, tileSize: number): { x: number; y: number } {
  const i = Math.max(0, Math.min(AIRFIELD_PADS - 1, pad));
  return frameAt(airfieldFrame(field, tileSize), AIRFIELD_PAD_X[i]!, AIRFIELD_PAD_Y);
}

/**
 * The strip in the field's frame: `heading` runs toward the east mark, `v` is the
 * centreline across, `u0` / `u1` the west and east touchdown marks along, `half` its
 * half-width. `frame` turns these into the world.
 */
export interface AirfieldRunway {
  frame: BuildingRect;
  heading: number;
  v: number;
  half: number;
  u0: number;
  u1: number;
}

export function airfieldRunway(field: FieldRect, tileSize: number): AirfieldRunway {
  const frame = airfieldFrame(field, tileSize);
  const w = frame.halfU * 2;
  const h = frame.halfV * 2;
  return {
    frame,
    heading: Math.atan2(frame.uy, frame.ux) + RUNWAY_HEADING,
    v: (AIRFIELD_RUNWAY_Y - 0.5) * h,
    half: h * AIRFIELD_RUNWAY_HALF,
    u0: (AIRFIELD_THRESHOLD - 0.5) * w,
    u1: (0.5 - AIRFIELD_THRESHOLD) * w,
  };
}

/** A point on the strip: `along` from the field's middle, `off` across from the centreline. */
export function runwayPoint(rw: AirfieldRunway, along: number, off = 0): { x: number; y: number } {
  return rectWorld(rw.frame, along, rw.v + off);
}

/** A world point in strip terms: `along` from the field's middle, `lateral` off the centreline. */
export function runwayLocal(rw: AirfieldRunway, x: number, y: number): { along: number; lateral: number } {
  const l = rectLocal(rw.frame, x, y);
  return { along: l.u, lateral: l.v - rw.v };
}

/** World heading of a strip-frame direction (`du` along, `dv` across). */
function runwayHeadingOf(rw: AirfieldRunway, du: number, dv: number): number {
  const f = rw.frame;
  return Math.atan2(du * f.uy + dv * f.vy, du * f.ux + dv * f.vx);
}

/** Parked planes sit nose toward the near side of the field, tail to the strip. */
export function parkHeading(field: FieldRect, tileSize: number): number {
  return airfieldRunway(field, tileSize).heading - RUNWAY_HEADING + PARK_HEADING;
}

/** A hardstand's place along the strip, from the field's middle. */
function padAlong(field: FieldRect, pad: number, tileSize: number): number {
  const p = airfieldPadWorld(field, pad, tileSize);
  return runwayLocal(airfieldRunway(field, tileSize), p.x, p.y).along;
}

/** Where a plane from this hardstand joins the strip. */
function runwayEntry(field: FieldRect, pad: number, tileSize: number): { x: number; y: number } {
  return runwayPoint(airfieldRunway(field, tileSize), padAlong(field, pad, tileSize));
}

/** Take off toward the longer run of strip: west pads roll east, east pads roll west. */
function takeoffHeading(field: FieldRect, pad: number, tileSize: number): number {
  const rw = airfieldRunway(field, tileSize);
  return padAlong(field, pad, tileSize) <= 0 ? rw.heading : rw.heading + Math.PI;
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

/** Planes homed here plus planes still in its queue. Training stops at AIRFIELD_PADS. */
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
  const fix = runwayPoint(rw, padAlong(home, e.air!.pad, ts) <= 0 ? rw.u1 + len : rw.u0 - len);
  const m = turnRadius(state, e);
  const w = state.width * state.tileSize;
  const h = state.height * state.tileSize;
  return { x: Math.max(m, Math.min(w - m, fix.x)), y: Math.max(m, Math.min(h - m, fix.y)) };
}

/** Seconds to fly home and land from here. */
function secondsHome(state: MatchState, e: Entity, home: Entity): number {
  const pad = airfieldPadWorld(home, e.air!.pad, state.tileSize);
  const d = Math.hypot(pad.x - e.x, pad.y - e.y) + AIR_FINAL_TILES * state.tileSize * 2;
  return d / Math.max(1, cruiseSpeed(state, e));
}

function spent(state: MatchState, e: Entity): boolean {
  if (isTransportType(e.type)) return !hasCargo(state, e);
  // Once the bomb is gone the sortie is over; the belts are only for the way in.
  if (e.air!.bombed) return true;
  return e.air!.bombs <= 0 && !hasRounds(e);
}

/** Bomb, belts, and tank all the way up. A troop bay is full when someone is aboard. */
function loadFull(state: MatchState, e: Entity): boolean {
  const a = e.air!;
  if (a.fuel < AIR_FUEL_SECONDS - 1e-3) return false;
  const load = airLoadoutOf(e.type);
  if (isTransportType(e.type) && a.payload === "troops") return hasCargo(state, e);
  return a.bombs >= load.bombs && a.rounds >= load.rounds - 1e-3;
}

function clearGuard(e: Entity): void {
  if (e.air) e.air.guard = null;
  e.guardFacing = null;
}

/** Guns loaded. A fighter fires whole barrages; the rearm tops the last one up in steps. */
function hasRounds(e: Entity): boolean {
  const r = e.air!.rounds;
  return isFighterType(e.type) ? r >= 1 : r > 0;
}

/**
 * Whether this plane's guns do anything to the target. Plate stops the Stuka's
 * wing MGs; infantry, soft trucks, and parked planes do not. The Fw 190's cannon
 * come down through any hull's roof, and reach planes in the air.
 */
function gunsHurt(e: Entity, target: Entity): boolean {
  if (isCrashing(target)) return false;
  if (target.kind !== "unit" || target.wreck) return false;
  if (isFighterType(e.type)) return isAirborne(target) ? !!target.air && !target.drone : true;
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
  if (!a || e.hp <= 0 || e.wreck || a.phase === "crash") return;
  if (order.kind === "land" && a.phase === "parked") {
    clearGuard(e);
    e.order = null;
    return;
  }
  if (order.kind === "land" && a.phase === "takeoff" && a.taxi) {
    // Still on the taxiway: turn back to the hardstand.
    clearGuard(e);
    taxiHome(e);
    return;
  }
  e.order = order;
  e.attackTarget = null;
  e.waypoints = [];
  e.holdPosition = false;
  a.extend = false;
  if (order.kind === "guard" && order.x != null && order.y != null) {
    a.guard = { x: order.x, y: order.y };
    e.guardFacing = order.facing ?? e.facing;
  } else {
    clearGuard(e);
  }
  // Short of a full load, a guard stays on the pad until the bomb, belts, and tank are full.
  const onPad = a.phase === "parked" || (a.phase === "landing" && a.touched);
  if (order.kind === "guard" && onPad && !loadFull(state, e)) {
    if (a.phase === "parked") e.state = "idle";
    return;
  }
  if (a.phase === "parked" || (a.phase === "landing" && a.touched && order.kind !== "land")) {
    // Taxi out onto the strip, line up, and roll.
    a.phase = "takeoff";
    a.bombed = false;
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
  if (!a || a.phase === "crash") return;
  clearGuard(e);
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
    // Drones fly in tickDrones. A wreck is a hulk on the ground.
    if (!a || e.drone || e.wreck) continue;
    if (a.phase === "crash") {
      tickCrash(state, e, dt);
      continue;
    }
    if (e.hp <= 0) continue;
    if (e.cooldown > 0) e.cooldown = Math.max(0, e.cooldown - dt);
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
  const load = airLoadoutOf(e.type);
  // Belts fill in the same time whatever they hold.
  a.rounds = Math.min(load.rounds, a.rounds + ((AIR_BELT_REARM_PER_SEC * load.rounds) / STUKA_MG_ROUNDS) * s);
  // A transport loaded for paratroops carries no canister: its passengers board it.
  if (a.bombs < load.bombs && a.payload !== "troops") {
    a.rearm += s;
    if (a.rearm >= BOMB_REARM_SECONDS) {
      a.bombs += 1;
      a.rearm = 0;
    }
  } else {
    a.rearm = 0;
  }
  // Guard survives the landing. A full bomb, full belts, and a full tank send it back out.
  if (a.guard && loadFull(state, e)) {
    const g = a.guard;
    orderAircraft(state, e, { kind: "guard", x: g.x, y: g.y, facing: e.guardFacing ?? e.facing });
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
  const transport = isTransportType(e.type);
  if (transport) normalizeTransportOrder(e);
  const stick = transport && tickDoor(state, e, dt);
  if (e.order?.kind !== "land" && home && !stick) {
    if (a.fuel <= secondsHome(state, e, home) + AIR_FUEL_RESERVE || spent(state, e)) {
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
  if (stick) {
    // Level and straight until the last man is out of the door.
    altGoal = BV222_DROP_ALT;
  } else if (transport && o.kind === "forceattack" && o.x != null && o.y != null) {
    altGoal = dropRun(state, e, o.x, o.y, dt, turned);
  } else if (o.kind === "land") {
    if (!home) {
      loiterHere(e);
    } else if (!turned) {
      const f = finalFix(state, e, home);
      steerTo(state, e, f.x, f.y, dt);
      if (Math.hypot(f.x - e.x, f.y - e.y) < state.tileSize * 6) a.phase = "landing";
    }
  } else if (o.kind === "attack" && o.targetId != null) {
    const t = state.entities.get(o.targetId);
    if (!t || t.hp <= 0 || (isAirborne(t) && !gunsHurt(e, t)) || allies(state, e.ownerId, t.ownerId)) {
      loiterHere(e);
    } else if (canSeeEntity(state, e.ownerId, t)) {
      o.x = t.x;
      o.y = t.y;
      altGoal = isAirborne(t) ? dogfight(state, e, t, dt, turned) : attackRun(state, e, t.x, t.y, t, dt, turned, false);
    } else if (o.x != null && o.y != null && Math.hypot(o.x - e.x, o.y - e.y) > orbitRadius(state, e)) {
      // Lost from sight. Fly to where it was last seen and look again.
      if (!turned) steerTo(state, e, o.x, o.y, dt);
    } else {
      loiterHere(e);
    }
  } else if (o.kind === "forceattack" && o.x != null && o.y != null) {
    const t = o.targetId != null ? state.entities.get(o.targetId) : undefined;
    if (o.targetId != null && (!t || t.hp <= 0 || (isAirborne(t) && !gunsHurt(e, t)))) {
      loiterHere(e);
    } else if (t && isAirborne(t)) {
      altGoal = dogfight(state, e, t, dt, turned);
    } else if (a.bombs <= 0 && !(hasRounds(e) && (t ? gunsHurt(e, t) : isFighterType(e.type)))) {
      // Nothing left for it: a Stuka without its bomb flies to the point. A fighter's barrage takes a bare point too.
      e.order = { kind: "move", x: o.x, y: o.y };
    } else {
      altGoal = attackRun(state, e, t?.x ?? o.x, t?.y ?? o.y, t, dt, turned, true);
    }
  } else if ((o.kind === "attackmove" || o.kind === "guard") && o.x != null && o.y != null) {
    // A transport holds the area. It has no guns, and the bay stays shut until Drop.
    if (o.kind === "guard" && transport) {
      e.attackTarget = null;
      if (!turned) flyToOrOrbit(state, e, o.x, o.y, dt);
    } else {
      let t = e.attackTarget != null ? state.entities.get(e.attackTarget) : undefined;
      if (t && (t.hp <= 0 || !canSeeEntity(state, e.ownerId, t) || !canHurt(e, t))) t = undefined;
      // A fighter clears the sky before it strafes.
      if (!t || (!isAirborne(t) && isFighterType(e.type))) t = acquireAir(state, e) ?? t;
      if (!t) t = acquireGround(state, e);
      e.attackTarget = t?.id ?? null;
      if (t && isAirborne(t)) altGoal = dogfight(state, e, t, dt, turned);
      else if (t) altGoal = attackRun(state, e, t.x, t.y, t, dt, turned, false);
      else if (!turned) flyToOrOrbit(state, e, o.x, o.y, dt);
    }
  } else if (o.kind === "patrol" && o.route && o.route.length >= 2) {
    const route = o.route;
    const t = transport ? undefined : patrolPlaneTarget(state, e);
    e.attackTarget = t?.id ?? null;
    if (t && isAirborne(t)) altGoal = dogfight(state, e, t, dt, turned);
    else if (t) altGoal = attackRun(state, e, t.x, t.y, t, dt, turned, false);
    else if (!turned) {
      const loop = o.loop === true;
      const leg = patrolLegIndex(route.length, o.leg, loop);
      let dest = route[leg] ?? route[route.length - 1]!;
      if (Math.hypot(dest.x - e.x, dest.y - e.y) <= orbitRadius(state, e)) {
        const stepped = stepPatrolLeg(route, leg, o.dir === -1 ? -1 : 1, loop);
        o.leg = stepped.leg;
        o.dir = stepped.dir;
        dest = route[stepped.leg] ?? dest;
      }
      flyToOrOrbit(state, e, dest.x, dest.y, dt);
    }
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

/**
 * A transport has nothing to attack with. Sent at a unit it drops on where
 * the unit stands; an attack-move is just a flight there.
 */
function normalizeTransportOrder(e: Entity): void {
  const o = e.order;
  if (!o || (o.kind !== "attack" && o.kind !== "attackmove")) return;
  e.attackTarget = null;
  if (o.x == null || o.y == null) {
    e.order = null;
    return;
  }
  e.order = o.kind === "attack" ? { kind: "forceattack", x: o.x, y: o.y } : { kind: "move", x: o.x, y: o.y };
}

/**
 * Transport run over the drop point: come down to BV222_DROP_ALT on the way
 * in, fly over it, and let go — the canister, or the first of the stick.
 * Missed it wide: fly out straight and come round again. Returns the height
 * the plane is trying to hold.
 */
function dropRun(state: MatchState, e: Entity, tx: number, ty: number, dt: number, turned: boolean): number {
  const a = e.air!;
  const ts = state.tileSize;
  if (!hasCargo(state, e)) {
    if (liveHome(state, e)) e.order = { kind: "land" };
    else loiterHere(e);
    return AIR_CRUISE_ALT;
  }
  const d = Math.hypot(tx - e.x, ty - e.y);
  if (a.extend) {
    if (d > AIR_EXTEND_TILES * ts) a.extend = false;
    return AIR_CRUISE_ALT;
  }
  if (!turned) steerTo(state, e, tx, ty, dt);
  const off = Math.abs(angOff(Math.atan2(ty - e.y, tx - e.x), e.facing));
  const troops = payloadOf(e) === "troops";
  // The stick strings out along the track: the first man goes half its length short of the point.
  const stick = troops ? (planeRiders(state, e).length * PARA_DOOR_SECONDS * cruiseSpeed(state, e) * a.speed) / 2 : 0;
  if (d <= Math.max(BV222_DROP_TILES * ts, stick) && (d <= BV222_DROP_TILES * ts || off < Math.PI / 8)) {
    if (troops) startJumping(e);
    else releaseCanister(state, e, tx, ty);
    return BV222_DROP_ALT;
  }
  if (d < ts * 2 || (off > (100 * Math.PI) / 180 && d < turnRadius(state, e))) a.extend = true;
  return d < AIR_DIVE_START_TILES * ts ? BV222_DROP_ALT : AIR_CRUISE_ALT;
}

/** Enemy unit this plane can hurt, seen, and within weapon range of the patrol line. */
function patrolPlaneTarget(state: MatchState, e: Entity): Entity | undefined {
  const route = e.order?.route;
  if (!route || route.length < 2) return undefined;
  const range = weaponRangeWorld(state, e);
  if (range <= 0) return undefined;
  const sticky = e.attackTarget != null ? state.entities.get(e.attackTarget) : undefined;
  if (sticky && planePatrolContact(state, e, sticky, route, range)) return sticky;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (!planePatrolContact(state, e, o, route, range)) continue;
    const d = distToRoute(route, o.x, o.y, e.order?.loop === true);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function planePatrolContact(state: MatchState, e: Entity, o: Entity, route: readonly { x: number; y: number }[], range: number): boolean {
  if (o.kind !== "unit" || o.hp <= 0 || o.wreck || o.id === e.id || isCrashing(o)) return false;
  if (!o.ownerId || allies(state, e.ownerId, o.ownerId)) return false;
  if (!canSeeEntity(state, e.ownerId, o) || !canHurt(e, o)) return false;
  return distToRoute(route, o.x, o.y, e.order?.loop === true) <= range;
}

function canHurt(e: Entity, t: Entity): boolean {
  const a = e.air!;
  return (a.bombs > 0 && !isAirborne(t)) || (hasRounds(e) && gunsHurt(e, t));
}

/** Fighter only: nearest enemy plane in the air it can see. */
function acquireAir(state: MatchState, e: Entity): Entity | undefined {
  if (!isFighterType(e.type) || !hasRounds(e)) return undefined;
  const reach = catalog(e.type).sightTiles * state.tileSize;
  let best: Entity | undefined;
  let bestD = reach * reach;
  for (const o of state.entities.values()) {
    if (o.hp <= 0 || o.id === e.id || !o.air || o.drone || o.air.phase === "crash" || !isAirborne(o)) continue;
    if (!o.ownerId || allies(state, e.ownerId, o.ownerId)) continue;
    const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
    if (d > bestD) continue;
    if (!canSeeEntity(state, e.ownerId, o)) continue;
    bestD = d;
    best = o;
  }
  return best;
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
    if (!canHurt(e, o)) continue;
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
  // A forced fighter pass on a bare point still has something to shoot at: the ground.
  const guns = hasRounds(e) && (target ? gunsHurt(e, target) : forced && isFighterType(e.type));
  if (!bomb && !guns) {
    if (liveHome(state, e)) e.order = { kind: "land" };
    else if (!a.guard) loiterHere(e);
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
  if (isFighterType(e.type)) {
    // One barrage a pass: release on the nose, then fly out and come round for the next.
    if (diving && guns && barrageReady(state, e, target, d, off)) {
      fireBarrage(state, e, tx, ty, target, forced);
      a.extend = true;
    }
  } else if (diving && guns && d <= STUKA_MG.rangeTiles * ts * nightReachMul(state.tick) && off <= (STUKA_MG.arcDeg * Math.PI) / 180) {
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
  const range = STUKA_MG.rangeTiles * state.tileSize * nightReachMul(state.tick);
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

/**
 * Fighter on a plane in the air: chase it, match its height, and loose a
 * barrage while it sits in front of the nose. A faster, tighter-turning plane
 * gets onto its tail; a target inside the turn is overshot and come round on.
 * Returns the height the plane is trying to hold.
 */
function dogfight(state: MatchState, e: Entity, t: Entity, dt: number, turned: boolean): number {
  const a = e.air!;
  a.extend = false;
  if (!hasRounds(e)) {
    if (liveHome(state, e)) e.order = { kind: "land" };
    else loiterHere(e);
    return AIR_CRUISE_ALT;
  }
  if (!turned) steerTo(state, e, t.x, t.y, dt);
  const d = Math.hypot(t.x - e.x, t.y - e.y);
  const off = Math.abs(angOff(Math.atan2(t.y - e.y, t.x - e.x), e.facing));
  if (barrageReady(state, e, t, d, off)) fireBarrage(state, e, t.x, t.y, t, false);
  const zT = entityHeight(state, t) + airAlt(t);
  return Math.max(AIR_STRAFE_ALT, zT - worldTileHeight(state, e.x, e.y));
}

/** Target close, on the nose, guns loaded and cleared since the last barrage. */
function barrageReady(state: MatchState, e: Entity, t: Entity | undefined, d: number, off: number): boolean {
  if (e.cooldown > 0 || !hasRounds(e)) return false;
  if (d > FW190_BARRAGE_TILES * state.tileSize || d < e.radius * 2) return false;
  if (off > (FW190_BARRAGE_ARC_DEG * Math.PI) / 180) return false;
  // Height matched before it fires on a plane.
  return !t || !isAirborne(t) || Math.abs(airAlt(t) - e.air!.alt) <= AIR_STRAFE_ALT;
}

/**
 * One barrage: both wing cannon at once, two straight parallel lines of rounds
 * laid along the bearing to the target, one wing-gap apart, running from
 * short of it to past it. On the ground each round comes down on its point of
 * the line and meets a hull's roof (fromAbove); at a plane the lines run at
 * its height. `tx, ty` is the point laid on: the target, or a force-fired
 * point. A forced barrage, like a forced bomb, hits your own side too.
 */
function fireBarrage(state: MatchState, e: Entity, tx: number, ty: number, target: Entity | undefined, forced: boolean): void {
  const a = e.air!;
  const gun = FW190_CANNON;
  const ts = state.tileSize;
  const aloft = !!target && isAirborne(target);
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / d;
  const uy = dy / d;
  const px = -uy;
  const py = ux;
  const z0 = worldTileHeight(state, e.x, e.y) + a.alt;
  const zAir = aloft && target ? entityHeight(state, target) + airAlt(target) : 0;
  const len = FW190_BARRAGE_LINE_TILES * ts;
  // A plane moves on: its lines start at it and run on past.
  const from = aloft ? -len * 0.2 : -len / 2;
  const n = FW190_BARRAGE_ROUNDS;
  const step = len / Math.max(1, n - 1);
  const maxX = state.width * ts - 1;
  const maxY = state.height * ts - 1;
  for (const wing of [1, -1]) {
    const gap = wing * e.radius * FW190_WING_GUN_OFFSET;
    const mx = e.x + ux * (e.radius + 2) + px * gap;
    const my = e.y + uy * (e.radius + 2) + py * gap;
    for (let k = 0; k < n; k++) {
      const along = from + step * k + (nextRand(state) - 0.5) * step * 0.4;
      const lx = Math.max(0, Math.min(maxX, tx + ux * along + px * gap));
      const ly = Math.max(0, Math.min(maxY, ty + uy * along + py * gap));
      const run = Math.max(1, Math.hypot(lx - mx, ly - my));
      const ang = Math.atan2(ly - my, lx - mx);
      const zEnd = aloft ? zAir : worldTileHeight(state, lx, ly);
      state.projectiles.push({
        id: state.nextId++,
        ownerId: e.ownerId,
        team: playerTeam(state, e.ownerId),
        x: mx,
        y: my,
        vx: Math.cos(ang) * gun.projectileSpeed,
        vy: Math.sin(ang) * gun.projectileSpeed,
        damage: gun.damage,
        penetration: gun.penetration,
        caliber: gun.caliber,
        life: run / gun.projectileSpeed,
        ignoreId: e.id,
        fromId: e.id,
        bounced: false,
        shell: null,
        z: z0,
        vz: -((z0 - zEnd) / run) * gun.projectileSpeed,
        fromAbove: aloft ? undefined : true,
        landX: aloft ? undefined : lx,
        landY: aloft ? undefined : ly,
        harmAllies: forced ? true : undefined,
      });
    }
  }
  a.rounds = Math.max(0, a.rounds - 1);
  e.cooldown = FW190_BARRAGE_COOLDOWN;
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
  a.bombed = true;
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
      if (hasTracks(e.type) && trackCritAllowed(e.type) && nextRand(state) < BOMB_TRACK_CHANCE * fall) addCrit(e, "tracks");
      hideScout(state, e);
    } else {
      dmg = Math.round(BOMB_DAMAGE * fall);
    }
    if (e.kind === "unit") coverStrike(e, dmg, state.tick, true);
    else takeDamage(e, dmg, state.tick);
    if (e.hp <= 0) killed = true;
  }
  blastWrecks(state, p.x, p.y, radius, BOMB_DAMAGE);
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
    damage: BOMB_DAMAGE,
    blast: true,
    mortar: true,
    bomb: true,
  };
  noteImpactSurface(state, impact, p, "miss");
  state.impacts.push(impact);
}

/**
 * A plane that just died in the air starts falling instead of vanishing.
 * It stays in the match, and further hits do not move its hit points.
 */
export function beginAircraftCrash(e: Entity): void {
  const a = e.air;
  if (!a || e.wreck || e.drone || !isAircraftType(e.type) || !isAirborne(e)) return;
  if (a.phase === "crash") {
    if (e.hp < 1) e.hp = 1;
    return;
  }
  a.phase = "crash";
  a.originX = e.x;
  a.originY = e.y;
  a.yaw = undefined;
  a.sink = undefined;
  a.reach = undefined;
  a.struck = [];
  a.extend = false;
  a.taxi = false;
  a.jumping = false;
  a.door = undefined;
  a.guard = null;
  e.guardFacing = null;
  e.hp = Math.max(1, e.hp);
  e.order = null;
  e.attackTarget = null;
  e.waypoints = [];
  e.cooldown = 0;
  e.state = "move";
}

/**
 * Roll how this airframe comes down. One draw picks the family: a short,
 * steep hook or a long, shallow glide, and the degrees in between.
 * Speed, sink, and the turn are tied to that draw so the wreck actually
 * lands at different distances instead of spiraling in place.
 */
function rollCrashFlight(state: MatchState, e: Entity): void {
  const a = e.air!;
  const u = nextRand(state);
  const reachTiles = AIR_CRASH_RANGE_MIN + u * (AIR_CRASH_RANGE_MAX - AIR_CRASH_RANGE_MIN);
  a.reach = reachTiles * state.tileSize;
  a.speed = AIR_CRASH_SPEED_MIN + u * (AIR_CRASH_SPEED_MAX - AIR_CRASH_SPEED_MIN);
  const v = Math.max(1, cruiseSpeed(state, e) * a.speed);
  const cover = AIR_CRASH_COVER_MIN + u * (AIR_CRASH_COVER_MAX - AIR_CRASH_COVER_MIN);
  let flight = a.reach / cover / v;
  flight = Math.max(AIR_CRASH_TIME_MIN, Math.min(AIR_CRASH_TIME_MAX, flight));
  const alt = Math.max(a.alt, 0.5);
  a.sink = Math.max(AIR_CRASH_SINK_MIN, Math.min(AIR_CRASH_SINK_MAX, alt / flight));
  const turnJitter = 0.75 + nextRand(state) * 0.5;
  const turnDeg = (AIR_CRASH_TURN_MAX + u * (AIR_CRASH_TURN_MIN - AIR_CRASH_TURN_MAX)) * turnJitter;
  const yawRate = (turnDeg * Math.PI) / 180 / flight;
  a.yaw = (nextRand(state) < 0.5 ? -1 : 1) * yawRate;
}

function tickCrash(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
  e.state = "move";
  e.order = null;
  e.attackTarget = null;
  if (e.hp < 1) e.hp = 1;
  if (a.yaw == null) rollCrashFlight(state, e);
  const ox = a.originX ?? e.x;
  const oy = a.originY ?? e.y;
  const maxR = a.reach ?? AIR_CRASH_RANGE_MAX * state.tileSize;
  // Once the rolled distance is spent, drop the rest of the way instead of orbiting the rim.
  if (Math.hypot(e.x - ox, e.y - oy) >= maxR * 0.97) a.yaw = 0;
  const shiver = a.yaw === 0 ? 0 : (nextRand(state) - 0.5) * 2 * ((AIR_CRASH_SHIVER_DEG * Math.PI) / 180);
  e.facing += ((a.yaw ?? 0) + shiver) * dt;
  e.turretFacing = e.facing;
  glideCrash(state, e, dt);
  a.alt = Math.max(0, a.alt - (a.sink ?? AIR_CRASH_SINK_MIN) * dt);
  strikeWhileCrashing(state, e);
}

/** Glide at the rolled crash speed, and stop at the distance rolled for this fall. */
function glideCrash(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
  const ox = a.originX ?? e.x;
  const oy = a.originY ?? e.y;
  const maxR = a.reach ?? AIR_CRASH_RANGE_MAX * state.tileSize;
  const v = cruiseSpeed(state, e) * a.speed;
  let x = e.x + Math.cos(e.facing) * v * dt;
  let y = e.y + Math.sin(e.facing) * v * dt;
  const dx = x - ox;
  const dy = y - oy;
  const d = Math.hypot(dx, dy);
  if (d > maxR) {
    x = ox + (dx / d) * maxR;
    y = oy + (dy / d) * maxR;
  }
  const maxX = state.width * state.tileSize - 1;
  const maxY = state.height * state.tileSize - 1;
  e.x = Math.max(1, Math.min(maxX, x));
  e.y = Math.max(1, Math.min(maxY, y));
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
}

/** A building or a ground hull stops the airframe. Men, trees, and other planes do not. */
function crashStopsOn(o: Entity): boolean {
  if (o.air?.phase === "crash") return false;
  if (o.wreck && o.kind === "unit") return true;
  if (o.kind === "building") return o.type !== "trench";
  if (o.kind !== "unit" || o.garrisonedIn != null) return false;
  if (isInfantryType(o.type) || isAircraftType(o.type) || isDroneType(o.type) || isJumpJetType(o.type)) return false;
  return true;
}

function crashTouches(state: MatchState, plane: Entity, o: Entity): boolean {
  if (o.kind === "building") {
    const b = buildingBounds(o, state.tileSize);
    const r = plane.radius;
    return plane.x >= b.x0 - r && plane.x <= b.x1 + r && plane.y >= b.y0 - r && plane.y <= b.y1 + r;
  }
  return Math.hypot(o.x - plane.x, o.y - plane.y) <= plane.radius + Math.max(4, o.radius);
}

function lowEnough(state: MatchState, plane: Entity, o: Entity): boolean {
  const z = worldTileHeight(state, plane.x, plane.y) + (plane.air?.alt ?? 0);
  return z <= entityHeight(state, o) + coverHeightOf(o.type) + 0.35;
}

function crashHurt(state: MatchState, o: Entity): void {
  if (o.hp <= 0 || o.air?.phase === "crash") return;
  let dmg: number;
  if (o.kind === "building") {
    dmg = AIR_CRASH_BUILDING_DAMAGE;
    if (isGarrisonable(o.type) && livingGarrison(state, o).length > 0) woundGarrison(state, o, dmg, 120);
  } else if (isInfantryType(o.type) || isDroneType(o.type) || isJumpJetType(o.type) || isAircraftType(o.type)) {
    dmg = Math.max(AIR_CRASH_SOFT_DAMAGE, o.hpMax + 1);
  } else {
    dmg = Math.max(AIR_CRASH_HULL_MIN, Math.round(o.hpMax * AIR_CRASH_HULL_SHARE));
    if (hasTracks(o.type) && trackCritAllowed(o.type)) addCrit(o, "tracks");
    hideScout(state, o);
  }
  if (o.kind === "unit") coverStrike(o, dmg, state.tick, true);
  else takeDamage(o, dmg, state.tick);
}

function burnTreesNear(state: MatchState, e: Entity, extra: number): void {
  const alt = e.air?.alt ?? 0;
  if (extra === 0 && alt > TREE_COVER_HEIGHT) return;
  const ts = state.tileSize;
  const r = e.radius + extra;
  const x0 = worldToTile(e.x - r, ts);
  const y0 = worldToTile(e.y - r, ts);
  const x1 = worldToTile(e.x + r, ts);
  const y1 = worldToTile(e.y + r, ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (Math.hypot(tileCenter(tx, ts) - e.x, tileCenter(ty, ts) - e.y) > r) continue;
      burnTreeAt(state, tx, ty);
    }
  }
}

/** Lay the hulk just outside a structure it came down on, so the pad stays the building's. */
function shoveOffStructure(state: MatchState, e: Entity): void {
  const ts = state.tileSize;
  for (const o of state.entities.values()) {
    if (o.kind !== "building" || o.type === "trench") continue;
    if (!buildingContains(o, ts, e.x, e.y)) continue;
    const b = buildingBounds(o, ts);
    let dx = e.x - (b.x0 + b.x1) / 2;
    let dy = e.y - (b.y0 + b.y1) / 2;
    if (Math.hypot(dx, dy) < 1) {
      dx = Math.cos(e.facing);
      dy = Math.sin(e.facing);
    }
    const len = Math.hypot(dx, dy) || 1;
    const step = ts * 0.35;
    for (let i = 0; i < 36 && buildingContains(o, ts, e.x, e.y); i++) {
      e.x += (dx / len) * step;
      e.y += (dy / len) * step;
    }
    break;
  }
  const maxX = state.width * ts - 1;
  const maxY = state.height * ts - 1;
  e.x = Math.max(1, Math.min(maxX, e.x));
  e.y = Math.max(1, Math.min(maxY, e.y));
}

function crashSplash(state: MatchState, e: Entity): void {
  const radius = AIR_CRASH_SPLASH_TILES * state.tileSize;
  const struck = e.air?.struck ?? [];
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.hp <= 0 || o.garrisonedIn != null || o.air?.phase === "crash") continue;
    if (struck.includes(o.id)) continue;
    let d: number;
    if (o.kind === "building") {
      const b = buildingBounds(o, state.tileSize);
      const dx = Math.max(b.x0 - e.x, 0, e.x - b.x1);
      const dy = Math.max(b.y0 - e.y, 0, e.y - b.y1);
      d = Math.hypot(dx, dy);
    } else {
      d = Math.max(0, Math.hypot(o.x - e.x, o.y - e.y) - o.radius);
    }
    if (d > radius) continue;
    crashHurt(state, o);
  }
}

function finishAircraftCrash(state: MatchState, e: Entity): void {
  if (e.wreck || !e.air || e.air.phase !== "crash") return;
  // The sink already clamps altitude to zero on the impact tick. Riders are
  // only taken while the airframe is still airborne, so hold a sliver until then.
  if (e.air.alt <= 0.5) e.air.alt = 0.51;
  loseRiders(state, e);
  crashSplash(state, e);
  e.air.alt = 0;
  burnTreesNear(state, e, state.tileSize);
  shoveOffStructure(state, e);
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId: e.ownerId,
    kind: "kill",
    fromId: e.id,
    x: e.x,
    y: e.y,
    vx: Math.cos(e.facing) * 80,
    vy: Math.sin(e.facing) * 80,
    caliber: 90,
    blast: true,
  };
  noteImpactSurface(state, impact, { caliber: 90, shell: null, vx: impact.vx, vy: impact.vy }, "miss");
  state.impacts.push(impact);
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
  toWreck(state, e);
  e.air = undefined;
}

function strikeWhileCrashing(state: MatchState, e: Entity): void {
  const a = e.air;
  if (!a || e.wreck || a.phase !== "crash") return;
  const struck = (a.struck ??= []);
  let stop = false;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.hp <= 0 || o.garrisonedIn != null || o.air?.phase === "crash") continue;
    if (struck.includes(o.id)) continue;
    if (!crashTouches(state, e, o) || !lowEnough(state, e, o)) continue;
    struck.push(o.id);
    crashHurt(state, o);
    if (crashStopsOn(o)) stop = true;
  }
  if (a.alt <= TREE_COVER_HEIGHT) burnTreesNear(state, e, 0);
  if (stop || a.alt <= 0) finishAircraftCrash(state, e);
}

/** A drone that dies in the air pops. A plane falls (see beginAircraftCrash) and crashes as a wreck. */
export function aircraftDown(state: MatchState, e: Entity): void {
  if (!e.air || !isAirborne(e)) return;
  // A drone is a handful of plastic and a battery. It pops; it does not crater.
  const caliber = e.drone ? 12 : 60;
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId: e.ownerId,
    kind: "kill",
    fromId: e.id,
    x: e.x + Math.cos(e.facing) * 12,
    y: e.y + Math.sin(e.facing) * 12,
    vx: Math.cos(e.facing) * 100,
    vy: Math.sin(e.facing) * 100,
    caliber,
    blast: true,
  };
  noteImpactSurface(state, impact, { caliber, shell: null, vx: impact.vx, vy: impact.vy }, "miss");
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
    if (taxiTo(state, e, pad.x, pad.y, dt)) stopOnGround(e, parkHeading(home, ts));
    return;
  }
  const rw = airfieldRunway(home, ts);
  const final = AIR_FINAL_TILES * ts;
  const at = runwayLocal(rw, e.x, e.y);
  e.state = "move";
  if (a.touched) {
    // Roll out along the strip, braking to taxi speed at the turn-off.
    const dir = Math.cos(e.facing - rw.heading) >= 0 ? 1 : -1;
    const left = dir * (runwayLocal(rw, pad.x, pad.y).along - at.along);
    const step = cruiseSpeed(state, e) * Math.max(a.speed, AIR_TAXI_SPEED) * dt;
    if (left <= step) {
      a.taxi = true;
      return;
    }
    a.alt = 0;
    a.speed = AIR_TAXI_SPEED + (AIR_ROLL_SPEED - AIR_TAXI_SPEED) * Math.min(1, left / (6 * ts));
    headTo(e, runwayHeadingOf(rw, dir * 3 * ts, -at.lateral), dt);
    advance(state, e, dt);
    return;
  }
  const dir = at.along < 0 ? 1 : -1;
  const thr = dir > 0 ? rw.u0 : rw.u1;
  const along = dir * (thr - at.along);
  const lateral = at.lateral;
  if (along > final * 1.8 || Math.abs(lateral) > final) {
    // Came in crossways. Go round.
    a.phase = "fly";
    return;
  }
  // Chase a point on the centreline ahead so the nose settles onto the strip.
  headTo(e, runwayHeadingOf(rw, dir * 6 * ts, -lateral), dt);
  const u = Math.max(0, Math.min(1, along / final));
  const lined =
    Math.abs(lateral) < final * 0.25 && Math.abs(angOff(dir > 0 ? rw.heading : rw.heading + Math.PI, e.facing)) < Math.PI / 6;
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
  const g = a.guard;
  // The area guard is still the order. A queued follow-up waits until the player sends them somewhere else.
  e.order = g ? { kind: "guard", x: g.x, y: g.y, facing: e.guardFacing ?? heading } : null;
  e.attackTarget = null;
  e.state = "idle";
}
