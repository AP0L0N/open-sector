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
  AIR_ORBIT_TILES,
  AIR_REFUEL_PER_SEC,
  AIR_RELEASE_ALT,
  AIR_REPAIR_PER_SEC,
  AIR_ROLL_SPEED,
  AIR_STRAFE_ALT,
  AIR_TAKEOFF_SECONDS,
  AIR_TARGET_SPREAD,
  AIRFIELD_PADS,
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

/** Runway heading, world radians. Planes park nose east and take off east. */
export const RUNWAY_HEADING = 0;

/** In the air (or rolling off the pad). A parked plane is a ground target. */
export function isAirborne(e: { air?: AirState | { alt: number; phase?: string } }): boolean {
  return airAlt(e) > 0.5;
}

/**
 * Small arms reach a plane in the air: rifles, the handgun, the MG42, the
 * scoped rifle, the PTRD, and the Walker's gatlings. Tank guns and the
 * mortar cannot lay on it.
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

/**
 * World pixel of a hardstand. Two lanes on the strip, staggered so a plane
 * rolling out does not sit on the next one's nose.
 */
export function airfieldPadWorld(
  field: Pick<Entity, "tileX" | "tileY" | "tileW" | "tileH">,
  pad: number,
  tileSize: number,
): { x: number; y: number } {
  const i = Math.max(0, Math.min(AIRFIELD_PADS - 1, pad));
  const w = field.tileW * tileSize;
  const h = field.tileH * tileSize;
  const x = field.tileX * tileSize + w * (0.14 + 0.22 * i);
  const y = field.tileY * tileSize + h * (i % 2 === 0 ? 0.42 : 0.62);
  return { x, y };
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
 * Start of the straight final: out along the runway on the side the plane
 * is coming from, kept inside the map so the approach never runs off it.
 */
function finalFix(state: MatchState, e: Entity, home: Entity): { x: number; y: number } {
  const pad = airfieldPadWorld(home, e.air!.pad, state.tileSize);
  const side = Math.cos(RUNWAY_HEADING) * (e.x - pad.x) + Math.sin(RUNWAY_HEADING) * (e.y - pad.y) >= 0 ? 1 : -1;
  const len = AIR_FINAL_TILES * state.tileSize;
  const m = turnRadius(state, e);
  const w = state.width * state.tileSize;
  const h = state.height * state.tileSize;
  return {
    x: Math.max(m, Math.min(w - m, pad.x + Math.cos(RUNWAY_HEADING) * len * side)),
    y: Math.max(m, Math.min(h - m, pad.y + Math.sin(RUNWAY_HEADING) * len * side)),
  };
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
  e.order = order;
  e.attackTarget = null;
  e.waypoints = [];
  e.guardFacing = null;
  e.holdPosition = false;
  a.extend = false;
  if (a.phase === "parked") {
    a.phase = "takeoff";
    a.roll = 0;
    a.speed = 0;
    e.facing = RUNWAY_HEADING;
    e.turretFacing = e.facing;
  } else if (a.phase === "landing" && order.kind !== "land") {
    a.phase = "fly";
  }
  e.state = "move";
}

/** Stop in the air: circle where the plane is. On the pad: stay parked. */
export function stopAircraft(e: Entity): void {
  const a = e.air;
  if (!a) return;
  if (a.phase === "parked") {
    e.order = null;
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
    if (a.fuel <= 0 && a.phase !== "takeoff" && e.air?.phase !== "parked") {
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

function tickTakeoff(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
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
    e.hp = Math.max(0, e.hp - dmg);
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

function tickLanding(state: MatchState, e: Entity, dt: number): void {
  const a = e.air!;
  const home = ensureHome(state, e);
  if (!home) {
    a.phase = "fly";
    loiterHere(e);
    return;
  }
  const ts = state.tileSize;
  const pad = airfieldPadWorld(home, a.pad, ts);
  const d = Math.hypot(pad.x - e.x, pad.y - e.y);
  const final = AIR_FINAL_TILES * ts;
  const bearing = Math.atan2(pad.y - e.y, pad.x - e.x);
  const off = Math.abs(angOff(bearing, e.facing));
  if (d > final * 1.8) {
    // Overshot or came in crossways. Go round.
    a.phase = "fly";
    return;
  }
  headTo(e, bearing, dt);
  const u = Math.max(0, Math.min(1, d / final));
  const glide = off < Math.PI / 6 ? AIR_CRUISE_ALT * u : Math.max(4, a.alt);
  approachAlt(a, glide, dt);
  a.speed = AIR_ROLL_SPEED + (1 - AIR_ROLL_SPEED) * u;
  e.state = "move";
  const step = cruiseSpeed(state, e) * a.speed * dt;
  if (d <= Math.max(4, step * 1.2)) {
    e.x = pad.x;
    e.y = pad.y;
    e.tileX = worldToTile(e.x, ts);
    e.tileY = worldToTile(e.y, ts);
    e.facing = RUNWAY_HEADING;
    e.turretFacing = e.facing;
    a.phase = "parked";
    a.alt = 0;
    a.speed = 0;
    a.extend = false;
    e.order = null;
    e.attackTarget = null;
    e.state = "idle";
    return;
  }
  advance(state, e, dt);
}
