import {
  DRONE_BATTERY_RESERVE,
  DRONE_BATTERY_SECONDS,
  DRONE_CLIMB_PER_SEC,
  DRONE_GUARD_ORBIT_PACE,
  DRONE_GUARD_ORBIT_TILES,
  DRONE_HIGH_ALT,
  DRONE_LAUNCH_MIN_SECONDS,
  DRONE_LEASH_TILES,
  DRONE_RECHARGE_PER_SEC,
  DRONE_REBUILD_SECONDS,
  DRONE_RECOVER_TILES,
  DRONE_STRIKE_ALT,
  DRONE_STRIKE_TILES,
  DRONE_SURVEIL_ALT,
  DRONE_WARHEAD,
  GARRISON_STRUCTURAL_CALIBER,
  addCrit,
  catalog,
  hasMg,
  infantryGunFor,
  isArmoredType,
  isGarrisonable,
  isInfantryType,
  radarLaidOf,
  antiAirGunOf,
  rocketsOf,
  rocketRackOf,
  type DroneMode,
  isBattleship,
  isLowFieldWork,
} from "../catalog.js";
import type { ImpactView } from "../protocol.js";
import { takeDamage } from "./crits.js";
import { coverStrike } from "./field.js";
import { airAlt, droneSightExtra, weaponRangeWorld } from "./elevation.js";
import { allies, ownerless, destroyEntity, makeEntity, newAirState, newDroneLink, unitInWater, worldToTile } from "./geo.js";
import { livingGarrison, woundGarrison } from "./garrison.js";
import { mortarFalloff } from "./mortar.js";
import { stepTurn } from "./orders.js";
import { distToRoute, patrolLegIndex, stepPatrolLeg } from "./patrol.js";
import { noteImpactSurface } from "./remains.js";
import { nextRand } from "./rng.js";
import { hideScout } from "./scout.js";
import { canSeeEntity } from "./vision.js";
import { domeOver, domeShelters, soakShield } from "./energy-shield.js";
import type { Entity, MatchState, Projectile } from "./types.js";

export { newDroneLink };

/** Height the drone holds in this mode. */
export function droneModeAlt(mode: DroneMode): number {
  return mode === "surveil" ? DRONE_SURVEIL_ALT : DRONE_STRIKE_ALT;
}

/** High enough that only anti-air guns reach it. */
export function droneIsHigh(e: { air?: { alt: number } }): boolean {
  return airAlt(e) >= DRONE_HIGH_ALT;
}

/**
 * Who can lay a gun on this drone. High: only the MG42 and the gatlings.
 * Low: small arms, a tank's coaxial MG, and rockets (Titan pods, Rocketer tube).
 * Tank guns and the mortar never can.
 */
export function reachesDrone(shooter: Entity, drone: Entity): boolean {
  const gun = infantryGunFor(shooter);
  // The Battle Ship's CIWS mounts reach a drone, high or low.
  if (isBattleship(shooter.type)) return true;
  if (droneIsHigh(drone)) return reachesHighFlyer(shooter);
  if (shooter.type === "walker" || radarLaidOf(shooter.type) || hasMg(shooter.type) || antiAirGunOf(shooter.type)) return true;
  // Titan pods reach a low drone. An artillery rack's lobbed rockets never do.
  if (rocketsOf(shooter.type)) return rocketRackOf(shooter.type).antiAir;
  return !!gun && gun.id !== "mortar";
}

/**
 * Who can lay a gun on something flying high: a drone on Surveillance, or a plane
 * at AIR_HIGH_ALT (the Horten VII). Bullets only, from anti-air guns: the MG42, the
 * gatlings, the CIWS, the Flak. The RAM's rockets are radar-laid but never reach it.
 */
export function reachesHighFlyer(shooter: Entity): boolean {
  if (isBattleship(shooter.type)) return true;
  if (shooter.type === "walker" || (radarLaidOf(shooter.type) && !rocketsOf(shooter.type)) || antiAirGunOf(shooter.type)) return true;
  return !!infantryGunFor(shooter)?.antiAir;
}

/** This round can strike this drone. Shells, mortar bombs, and plane bombs pass it by. */
export function projectileMeetsDrone(p: Projectile, drone: Entity): boolean {
  if (droneIsHigh(drone)) return !!p.antiAir;
  if (p.flight === "rocket") return true;
  if (p.flight || p.shell) return false;
  return p.caliber < GARRISON_STRUCTURAL_CALIBER;
}

function leash(state: MatchState): number {
  return DRONE_LEASH_TILES * state.tileSize;
}

function speedOf(state: MatchState, e: Entity): number {
  return catalog(e.type).moveTilesPerSec * state.tileSize;
}

function opOf(state: MatchState, d: Entity): Entity | null {
  const id = d.drone?.opId;
  if (id == null) return null;
  const op = state.entities.get(id);
  if (!op || op.hp <= 0 || op.ownerId !== d.ownerId || !op.droneLink) return null;
  return op;
}

/** The drone this operator has in the air, if any. */
export function droneOf(state: MatchState, op: Entity): Entity | null {
  const id = op.droneLink?.droneId;
  if (id == null) return null;
  const d = state.entities.get(id);
  return d && d.hp > 0 && d.drone?.opId === op.id ? d : null;
}

/** Why this operator cannot launch now, or null. */
export function launchBlocked(state: MatchState, op: Entity): string | null {
  const link = op.droneLink;
  if (!link || op.hp <= 0) return "Select a Drone Op.";
  if (droneOf(state, op)) return "Drone already up.";
  if (link.rebuild > 0) return "Building a new drone.";
  if (link.charge < DRONE_LAUNCH_MIN_SECONDS) return "Drone battery recharging.";
  if (unitInWater(state, op)) return "Cannot launch from the water.";
  return null;
}

/** Put the stowed drone in the air over the operator. */
export function launchDrone(state: MatchState, op: Entity): string | null {
  const err = launchBlocked(state, op);
  if (err) return err;
  const link = op.droneLink!;
  const d = makeEntity(state, "drone", op.ownerId, op.x, op.y, { facing: op.facing });
  d.air = newAirState(null, 0);
  d.air.phase = "fly";
  d.air.alt = 0;
  d.drone = { opId: op.id, mode: link.mode, battery: link.charge, recall: false };
  d.state = "move";
  link.droneId = d.id;
  return null;
}

/** Fly back to the operator and be stowed. */
export function recallDrone(d: Entity): void {
  if (!d.drone) return;
  d.drone.recall = true;
  d.order = null;
  d.attackTarget = null;
  dropDroneGuard(d);
}

function dropDroneGuard(d: Entity): void {
  if (d.drone) d.drone.guard = null;
  d.guardFacing = null;
}

export function setDroneMode(state: MatchState, e: Entity, mode: DroneMode): void {
  const op = e.droneLink ? e : e.drone ? opOf(state, e) : null;
  const d = e.drone ? e : e.droneLink ? droneOf(state, e) : null;
  if (op?.droneLink) op.droneLink.mode = mode;
  if (d?.drone) {
    d.drone.mode = mode;
    // Surveillance does not dive. Drop the strike it was on.
    if (mode === "surveil" && d.order?.kind === "attack") {
      d.order = null;
      d.attackTarget = null;
    }
  }
}

/** Move or attack order from the player. An attack puts it into Search & Destroy. */
export function orderDrone(state: MatchState, d: Entity, order: Entity["order"]): void {
  if (!d.drone || d.hp <= 0 || !order) return;
  d.drone.recall = false;
  d.attackTarget = null;
  dropDroneGuard(d);
  if (order.kind === "attack") setDroneMode(state, d, "strike");
  d.order = order;
}

/**
 * Guard a point, or a friendly unit it stays over. The drone circles there in
 * either mode; in Search & Destroy it dives on the first enemy it sees.
 */
export function guardDrone(d: Entity, x: number, y: number, facing: number, targetId?: number): void {
  if (!d.drone || d.hp <= 0) return;
  d.drone.recall = false;
  d.order = null;
  d.attackTarget = null;
  d.drone.guard = targetId != null ? { x, y, targetId } : { x, y };
  d.guardFacing = facing;
}

export function stopDrone(d: Entity): void {
  if (!d.drone) return;
  d.drone.recall = false;
  d.order = null;
  d.attackTarget = null;
  dropDroneGuard(d);
}

/** Point clamped inside the operator's reach. */
function inLeash(state: MatchState, op: Entity, x: number, y: number): { x: number; y: number } {
  const r = leash(state);
  const dx = x - op.x;
  const dy = y - op.y;
  const d = Math.hypot(dx, dy);
  if (d <= r) return { x, y };
  return { x: op.x + (dx / d) * r, y: op.y + (dy / d) * r };
}

function validStrikeTarget(state: MatchState, d: Entity, op: Entity, t: Entity | undefined): t is Entity {
  if (!t || t.hp <= 0 || t.wreck || t.garrisonedIn != null || t.id === d.id || t.dormant) return false;
  if (ownerless(t) || allies(state, d.ownerId, t.ownerId)) return false;
  if (t.air || airAlt(t) > 0 || isLowFieldWork(t.type)) return false;
  if (Math.hypot(t.x - op.x, t.y - op.y) > leash(state) + t.radius) return false;
  return true;
}

/** Nearest enemy the side can see, on the ground and inside the operator's reach. */
function acquireStrike(state: MatchState, d: Entity, op: Entity): Entity | undefined {
  const reach = (catalog(d.type).sightTiles + droneSightExtra(d)) * state.tileSize;
  let best: Entity | undefined;
  let bestD = reach * reach;
  for (const o of state.entities.values()) {
    if (o.kind !== "unit" && !(isGarrisonable(o.type) && livingGarrison(state, o).length > 0)) continue;
    if (!validStrikeTarget(state, d, op, o)) continue;
    const dd = (o.x - d.x) ** 2 + (o.y - d.y) ** 2;
    if (dd > bestD) continue;
    if (!canSeeEntity(state, d.ownerId, o)) continue;
    bestD = dd;
    best = o;
  }
  return best;
}

function place(state: MatchState, e: Entity, x: number, y: number): void {
  const maxX = state.width * state.tileSize - 1;
  const maxY = state.height * state.tileSize - 1;
  e.x = Math.max(1, Math.min(maxX, x));
  e.y = Math.max(1, Math.min(maxY, y));
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
}

/** Fly straight at a point. True once it is there. Hovers where it stops. */
function flyTo(state: MatchState, d: Entity, x: number, y: number, dt: number, speed = speedOf(state, d)): boolean {
  const dx = x - d.x;
  const dy = y - d.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= Math.max(0.5, step)) {
    place(state, d, x, y);
    return true;
  }
  d.facing = stepTurn(d.facing, Math.atan2(dy, dx), catalog(d.type).turnDegPerSec, dt).angle;
  d.turretFacing = d.facing;
  place(state, d, d.x + (dx / dist) * step, d.y + (dy / dist) * step);
  return false;
}

function approachAlt(d: Entity, goal: number, dt: number, rate = DRONE_CLIMB_PER_SEC): void {
  const a = d.air!;
  if (a.alt < goal) a.alt = Math.min(goal, a.alt + rate * dt);
  else if (a.alt > goal) a.alt = Math.max(goal, a.alt - rate * dt);
}

export function tickDrones(state: MatchState, dt: number): void {
  const stow: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.hp <= 0) continue;
    if (e.droneLink) tickLink(state, e, dt);
    else if (e.drone && e.air) {
      if (tickDrone(state, e, dt)) stow.push(e);
    }
  }
  for (const d of stow) {
    const op = opOf(state, d);
    if (op?.droneLink) {
      op.droneLink.droneId = null;
      op.droneLink.charge = Math.max(0, d.drone!.battery);
      op.droneLink.mode = d.drone!.mode;
    }
    destroyEntity(state, d);
  }
}

/** Operator side: notice a lost drone, build the next one, charge a stowed one. */
function tickLink(state: MatchState, op: Entity, dt: number): void {
  const link = op.droneLink!;
  if (link.droneId != null && !droneOf(state, op)) {
    link.droneId = null;
    link.rebuild = DRONE_REBUILD_SECONDS;
    link.charge = DRONE_BATTERY_SECONDS;
    return;
  }
  if (link.droneId != null) return;
  if (link.rebuild > 0) {
    link.rebuild = Math.max(0, link.rebuild - dt);
    return;
  }
  link.charge = Math.min(DRONE_BATTERY_SECONDS, link.charge + DRONE_RECHARGE_PER_SEC * dt);
}

/** One drone's tick. True when it has come home and should be stowed. */
function tickDrone(state: MatchState, d: Entity, dt: number): boolean {
  const s = d.drone!;
  const a = d.air!;
  const op = opOf(state, d);
  if (!op) {
    // Link lost with the operator. It falls.
    d.hp = 0;
    return false;
  }
  s.battery = Math.max(0, s.battery - dt);
  if (s.battery <= 0) {
    d.hp = 0;
    return false;
  }
  const home = Math.hypot(op.x - d.x, op.y - d.y) / Math.max(1, speedOf(state, d));
  if (!s.recall && s.battery <= home + DRONE_BATTERY_RESERVE) recallDrone(d);
  d.state = "move";

  if (s.recall) {
    const near = Math.hypot(op.x - d.x, op.y - d.y) <= DRONE_RECOVER_TILES * state.tileSize * 4;
    flyTo(state, d, op.x, op.y, dt);
    approachAlt(d, near ? 0 : Math.max(a.alt, DRONE_STRIKE_ALT), dt, DRONE_CLIMB_PER_SEC * 1.5);
    return Math.hypot(op.x - d.x, op.y - d.y) <= DRONE_RECOVER_TILES * state.tileSize && a.alt <= 1;
  }

  let altGoal = droneModeAlt(s.mode);
  const o = d.order;
  if (o?.kind === "attack" && s.mode === "strike") {
    const t = o.targetId != null ? state.entities.get(o.targetId) : undefined;
    if (!validStrikeTarget(state, d, op, t) || (o.auto && !canSeeEntity(state, d.ownerId, t))) {
      d.order = null;
      d.attackTarget = null;
    } else {
      d.attackTarget = t.id;
      const flat = Math.hypot(t.x - d.x, t.y - d.y);
      // Hold height until close, then drop onto it.
      if (flat < state.tileSize * 3) altGoal = 0;
      flyTo(state, d, t.x, t.y, dt);
      approachAlt(d, altGoal, dt, altGoal === 0 ? DRONE_CLIMB_PER_SEC * 2.5 : DRONE_CLIMB_PER_SEC);
      if (Math.hypot(t.x - d.x, t.y - d.y) <= DRONE_STRIKE_TILES * state.tileSize + t.radius && a.alt <= 1.5) {
        burst(state, d, t);
      }
      clampToLeash(state, d, op);
      return false;
    }
  }
  if (d.order?.kind === "patrol" && d.order.route && d.order.route.length >= 2) {
    flyPatrol(state, d, op, dt);
    return false;
  }
  if (d.order?.kind === "move" && d.order.x != null && d.order.y != null) {
    const goal = inLeash(state, op, d.order.x, d.order.y);
    if (flyTo(state, d, goal.x, goal.y, dt)) d.order = null;
  } else if (d.order) {
    d.order = null;
  }
  if (!d.order) {
    d.state = "idle";
    if (s.mode === "strike") {
      const t = acquireStrike(state, d, op);
      if (t) d.order = { kind: "attack", targetId: t.id, auto: true };
    }
    if (!d.order && s.guard) circleGuard(state, d, op, dt);
  }
  approachAlt(d, altGoal, dt);
  clampToLeash(state, d, op);
  return false;
}

/**
 * Walk the patrol polyline. An open route turns back; a loop wraps to the
 * first spot. Search & Destroy dives on an enemy within sight of that line
 * and keeps the patrol order.
 */
function flyPatrol(state: MatchState, d: Entity, op: Entity, dt: number): void {
  const o = d.order;
  if (!o || o.kind !== "patrol" || !o.route || o.route.length < 2) return;
  const route = o.route;
  const s = d.drone!;
  const a = d.air!;
  let altGoal = droneModeAlt(s.mode);
  if (s.mode === "strike") {
    const t = patrolDroneTarget(state, d, op, route);
    if (t) {
      d.attackTarget = t.id;
      const flat = Math.hypot(t.x - d.x, t.y - d.y);
      if (flat < state.tileSize * 3) altGoal = 0;
      flyTo(state, d, t.x, t.y, dt);
      approachAlt(d, altGoal, dt, altGoal === 0 ? DRONE_CLIMB_PER_SEC * 2.5 : DRONE_CLIMB_PER_SEC);
      if (Math.hypot(t.x - d.x, t.y - d.y) <= DRONE_STRIKE_TILES * state.tileSize + t.radius && a.alt <= 1.5) {
        burst(state, d, t);
      }
      clampToLeash(state, d, op);
      return;
    }
  }
  d.attackTarget = null;
  const loop = o.loop === true;
  const leg = patrolLegIndex(route.length, o.leg, loop);
  const raw = route[leg] ?? route[route.length - 1]!;
  const goal = inLeash(state, op, raw.x, raw.y);
  if (flyTo(state, d, goal.x, goal.y, dt)) {
    const stepped = stepPatrolLeg(route, leg, o.dir === -1 ? -1 : 1, loop);
    o.leg = stepped.leg;
    o.dir = stepped.dir;
  }
  approachAlt(d, altGoal, dt);
  clampToLeash(state, d, op);
}

/** Strike-mode contact: a unit the operator can still reach, seen, and near the patrol line. */
function patrolDroneTarget(
  state: MatchState,
  d: Entity,
  op: Entity,
  route: readonly { x: number; y: number }[],
): Entity | undefined {
  const sight = catalog(d.type).sightTiles * state.tileSize;
  const reach = Math.max(weaponRangeWorld(state, d), sight);
  if (reach <= 0) return undefined;
  const hit = (t: Entity | undefined): t is Entity =>
    !!t &&
    t.kind === "unit" &&
    validStrikeTarget(state, d, op, t) &&
    canSeeEntity(state, d.ownerId, t) &&
    distToRoute(route, t.x, t.y, d.order?.loop === true) <= reach;
  const sticky = d.attackTarget != null ? state.entities.get(d.attackTarget) : undefined;
  if (hit(sticky)) return sticky;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (!hit(o)) continue;
    const dist = distToRoute(route, o.x, o.y, d.order?.loop === true);
    if (dist < bestD) {
      bestD = dist;
      best = o;
    }
  }
  return best;
}

/** Where the guard ring is centred now. Null once a guarded unit is gone. */
function guardCenter(state: MatchState, d: Entity, op: Entity): { x: number; y: number } | null {
  const g = d.drone!.guard!;
  if (g.targetId != null) {
    const t = state.entities.get(g.targetId);
    if (!t || t.hp <= 0 || t.wreck || !allies(state, d.ownerId, t.ownerId)) return null;
    g.x = t.x;
    g.y = t.y;
  }
  return inLeash(state, op, g.x, g.y);
}

/** Fly out to the post, then circle it slowly, clockwise on screen. */
function circleGuard(state: MatchState, d: Entity, op: Entity, dt: number): void {
  const s = d.drone!;
  const c = guardCenter(state, d, op);
  if (!c) {
    dropDroneGuard(d);
    return;
  }
  d.state = "move";
  const r = DRONE_GUARD_ORBIT_TILES[s.mode] * state.tileSize;
  const dx = d.x - c.x;
  const dy = d.y - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist > r * 1.5) {
    flyTo(state, d, c.x + (dx / dist) * r, c.y + (dy / dist) * r, dt);
    return;
  }
  // Chase a point a little ahead on the ring; the radius settles on its own.
  const ang = (dist > 0.5 ? Math.atan2(dy, dx) : d.facing) + 0.5;
  flyTo(state, d, c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r, dt, speedOf(state, d) * DRONE_GUARD_ORBIT_PACE[s.mode]);
}

/** Walking away drags the drone along: it never leaves the operator's reach. */
function clampToLeash(state: MatchState, d: Entity, op: Entity): void {
  const p = inLeash(state, op, d.x, d.y);
  if (p.x !== d.x || p.y !== d.y) place(state, d, p.x, p.y);
}

/** Warhead goes off over the target. The drone is spent. */
function burst(state: MatchState, d: Entity, target: Entity): void {
  const ts = state.tileSize;
  const radius = DRONE_WARHEAD.splashTiles * ts;
  let killed = false;
  // Diving onto an enemy dome, the warhead spends itself on the skin.
  const dome = domeOver(state, d.ownerId, d.x, d.y);
  if (dome) soakShield(state, dome, DRONE_WARHEAD.damage);
  const soaked = new Set<number>(dome ? [dome.id] : []);
  for (const e of dome ? [] : [...state.entities.values()]) {
    if (e.hp <= 0 || e.wreck || e.garrisonedIn != null || e.id === d.id) continue;
    if (airAlt(e) > 0.5) continue;
    if (isLowFieldWork(e.type)) continue;
    if (e.ownerId !== "" && allies(state, d.ownerId, e.ownerId)) continue;
    const dist = e === target ? 0 : Math.hypot(e.x - d.x, e.y - d.y);
    const reach = e.kind === "building" ? radius + Math.min(e.tileW, e.tileH) * ts * 0.35 : radius;
    if (dist > reach) continue;
    if (domeShelters(state, d.ownerId, d.x, d.y, e, DRONE_WARHEAD.damage, soaked)) continue;
    const fall = mortarFalloff(dist, reach);
    let dmg: number;
    if (e.kind === "building") {
      dmg = Math.round(DRONE_WARHEAD.buildingDamage * fall);
      if (isGarrisonable(e.type) && livingGarrison(state, e).length > 0) {
        woundGarrison(state, e, Math.round(DRONE_WARHEAD.damage * fall), DRONE_WARHEAD.caliber);
      }
    } else if (isArmoredType(e.type) && !isInfantryType(e.type)) {
      // Through the roof.
      dmg = Math.round(e.hpMax * DRONE_WARHEAD.armorShare * fall);
      if (e === target && nextRand(state) < DRONE_WARHEAD.engineChance) addCrit(e, "engine");
      hideScout(state, e);
    } else {
      dmg = Math.round(DRONE_WARHEAD.damage * fall);
    }
    if (e.kind === "unit") coverStrike(e, dmg, state.tick, true);
    else takeDamage(e, dmg, state.tick);
    if (e.hp <= 0) killed = true;
  }
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId: d.ownerId,
    kind: killed ? "kill" : "miss",
    fromId: d.id,
    x: d.x,
    y: d.y,
    vx: Math.cos(d.facing) * 40,
    vy: Math.sin(d.facing) * 40,
    caliber: DRONE_WARHEAD.caliber,
    blast: true,
    rocket: true,
  };
  noteImpactSurface(state, impact, { caliber: DRONE_WARHEAD.caliber, shell: null, vx: impact.vx, vy: impact.vy }, "miss");
  state.impacts.push(impact);
  // Spent on the target: no fireball of its own when it is reaped.
  d.air!.alt = 0;
  d.hp = 0;
}
