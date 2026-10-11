import {
  catalog,
  FACE_MOVE_DEG,
  fires,
  hasTurret,
  meleeNow,
  REVERSE_CONE_DEG,
  REVERSE_TILES,
  snapTankYaw,
  TILE_SIZE,
  TRACK_ARRIVE_SLOP,
} from "../catalog.js";
import { adjacentToBuilding, hqOf, rallyPoint, unitInWater, waterSilenced, worldToTile } from "./geo.js";
import { wantsCapture, pathToCapture } from "./capture.js";
import { moveWithCollision, pathAroundParked, stepGiveWay, tickMakeWay, tickShuffle } from "./collision.js";
import { activateSpatial, clearSpatial } from "./spatial.js";
import { hullTurnMul, moveSpeedMul } from "./crits.js";
import { openSpotNear, spotTaken, unitClearance } from "./formation.js";
import { sidestepGoal } from "./lineoffire.js";
import { setPath } from "./path.js";
import { patrolLegIndex, stepPatrolLeg } from "./patrol.js";
import { flyStep, jetAloft } from "./jet.js";
import { slopeSpeedMul, tileHeight, weaponRangeWorld, worldTileHeight } from "./elevation.js";
import { inStrikeReach } from "./simunit.js";
import type { Entity, MatchState } from "./types.js";

/** Guard order that follows a living unit instead of holding a point. */
/** Close enough to stop and fight: the gun's reach to the target's middle, a blade's to its body or wall. */
function inWeaponReach(state: MatchState, e: Entity, t: Entity): boolean {
  if (meleeNow(e)) return inStrikeReach(state, e, t);
  return Math.hypot(t.x - e.x, t.y - e.y) <= weaponRangeWorld(state, e);
}

export function escorting(e: Entity): boolean {
  return e.order?.kind === "guard" && e.order.targetId != null;
}

/** Stand just outside the escorted unit's collision radius. */
export function escortAnchor(e: Entity, t: Entity): { x: number; y: number } {
  const gap = unitClearance(e.radius, t.radius);
  const dx = e.x - t.x;
  const dy = e.y - t.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    const a = t.facing + Math.PI;
    return { x: t.x + Math.cos(a) * gap, y: t.y + Math.sin(a) * gap };
  }
  const s = gap / d;
  return { x: t.x + dx * s, y: t.y + dy * s };
}

export function stepTurn(
  current: number,
  want: number,
  degPerSec: number,
  dt: number,
): { angle: number; remainingDeg: number } {
  let delta = want - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const max = ((degPerSec * Math.PI) / 180) * dt;
  if (Math.abs(delta) <= max) return { angle: want, remainingDeg: 0 };
  const next = current + Math.sign(delta) * max;
  return { angle: next, remainingDeg: ((delta - Math.sign(delta) * max) * 180) / Math.PI };
}

export function turnTo(e: Entity, want: number, degPerSec: number, dt: number): number {
  const r = stepTurn(e.facing, want, degPerSec, dt);
  e.facing = r.angle;
  if (!hasTurret(e.type)) e.turretFacing = e.facing;
  return r.remainingDeg;
}

export function turnToward(e: Entity, tx: number, ty: number, degPerSec: number, dt: number): number {
  return turnTo(e, Math.atan2(ty - e.y, tx - e.x), degPerSec, dt);
}

/** Hull stays on the bow heading and the tracks roll backward. */
export function reversing(e: Entity): boolean {
  // The crew walks ahead pulling the trail, so the barrel always trails.
  if (e.type === "artillery") return e.waypoints.length > 0 && e.towedBy == null;
  if (!catalog(e.type).turnInPlace || catalog(e.type).noReverse) return false;
  if (catalog(e.type).doubleEnded) {
    const wp = e.waypoints[0];
    return !!wp && sternNearer(e, wp);
  }
  const kind = e.order?.kind;
  if (kind !== "move" && kind !== "attackmove" && kind !== "patrol") return false;
  const wp = e.waypoints[0];
  return !!wp && closeRearWaypoint(e, wp);
}

/** Waypoint in the rear half: swinging the stern onto it is the shorter yaw. */
function sternNearer(e: Entity, wp: { x: number; y: number }): boolean {
  const dx = wp.x - e.x;
  const dy = wp.y - e.y;
  if (Math.hypot(dx, dy) < 1e-6) return false;
  return dx * Math.cos(e.facing) + dy * Math.sin(e.facing) < 0;
}

/** Short hop already in the rear cone — spin would flash the rear plate. */
function closeRearWaypoint(e: Entity, wp: { x: number; y: number }): boolean {
  const dx = wp.x - e.x;
  const dy = wp.y - e.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6 || dist > REVERSE_TILES * TILE_SIZE) return false;
  const along = dx * Math.cos(e.facing) + dy * Math.sin(e.facing);
  const half = (REVERSE_CONE_DEG * Math.PI) / 360;
  return along / dist <= -Math.cos(half);
}

export function turnTurretTo(e: Entity, want: number, degPerSec: number, dt: number): number {
  const r = stepTurn(e.turretFacing, want, degPerSec, dt);
  e.turretFacing = r.angle;
  return r.remainingDeg;
}

export function turnTurretToward(e: Entity, tx: number, ty: number, degPerSec: number, dt: number): number {
  return turnTurretTo(e, Math.atan2(ty - e.y, tx - e.x), degPerSec, dt);
}

export function tickMovement(state: MatchState, dt: number): void {
  // One grid for the phase: every blocker probe asks the bodies near a spot instead of the whole roster.
  activateSpatial(state);
  try {
    tickMovementBodies(state, dt);
  } finally {
    clearSpatial();
  }
}

function tickMovementBodies(state: MatchState, dt: number): void {
  tickMakeWay(state);
  tickShuffle(state);
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.wreck || e.garrisonedIn) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    // Aircraft fly in tickAir; paratroopers drift down in tickChutes.
    if (e.air || e.chute) continue;
    // A lunging Behemoth flies its arc in tickLunges, a ramming Juggernaut charges in tickJuggernauts; a Stalker under the ground stays put.
    if (e.lunge || e.ram || e.burrow) {
      e.waypoints = [];
      continue;
    }
    // A Titan shot down in the air drops straight down in tickJets.
    if (e.jet?.crash) {
      e.waypoints = [];
      continue;
    }
    // An unarmed hull only remembers the aim so the soldiers inside can shoot.
    if (e.order?.kind === "forceattack" && !fires(e.type)) {
      e.waypoints = [];
      if (e.state === "move" || e.state === "attack") e.state = "idle";
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      continue;
    }
    if (e.braced) {
      // Outriggers down: the torso still aims and fires, the legs do not step.
      e.waypoints = [];
      if (e.state === "move") e.state = "idle";
      continue;
    }
    const def = catalog(e.type);
    const speed = marchTilesPerSec(e) * state.tileSize;
    const flying = jetAloft(e);
    if (!flying && stepGiveWay(state, e, def.moveTilesPerSec * state.tileSize * moveSpeedMul(e, unitInWater(state, e)), dt)) {
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      continue;
    }
    if (e.order?.kind === "rotate" && e.order.x != null && e.order.y != null) {
      tickRotate(e, dt);
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      continue;
    }
    if (escorting(e)) {
      if (tickEscort(state, e)) {
        e.tileX = worldToTile(e.x, state.tileSize);
        e.tileY = worldToTile(e.y, state.tileSize);
        if (e.state === "move") e.state = "idle";
        continue;
      }
    }
    // Stepping aside for a clear line of fire: walk the short path, and let the order wait.
    const aside = sidestepGoal(state, e) != null;
    if (e.guardFacing != null && e.waypoints.length === 0 && !e.attackTarget) {
      if (!e.order || e.order.kind === "guard") {
        tickGuardFacing(e, dt);
        e.tileX = worldToTile(e.x, state.tileSize);
        e.tileY = worldToTile(e.y, state.tileSize);
        continue;
      }
    }
    if (e.order?.kind === "patrol") {
      if (steerPatrol(state, e)) {
        e.tileX = worldToTile(e.x, state.tileSize);
        e.tileY = worldToTile(e.y, state.tileSize);
        continue;
      }
    }
    // A force-attack sent on a Move drives that course; it never closes on the aim.
    const underway = e.order?.kind === "forceattack" && e.order.travel != null;
    const chaseId =
      (e.order?.kind === "attack" || e.order?.kind === "forceattack") && e.order.targetId != null && !underway
        ? e.order.targetId
        : null;
    if (chaseId != null && !aside) {
      const t = state.entities.get(chaseId);
      if (t && t.hp > 0) {
        if (wantsCapture(e, t)) {
          if (adjacentToBuilding(state, e, t) || e.holdPosition) {
            e.waypoints = [];
            continue;
          }
          if (e.waypoints.length === 0 || (state.tick + e.id) % 5 === 0) pathToCapture(state, e, t);
        } else {
          if ((inWeaponReach(state, e, t) && !waterSilenced(state, e)) || e.holdPosition) {
            e.waypoints = [];
            continue;
          }
          if (e.waypoints.length === 0 || (state.tick + e.id) % 5 === 0) {
            setPath(state, e, t.x, t.y);
          }
        }
      }
    }
    if (
      e.order?.kind === "forceattack" &&
      !underway &&
      e.order.targetId == null &&
      e.order.x != null &&
      e.order.y != null
    ) {
      const range = weaponRangeWorld(state, e);
      const dist = Math.hypot(e.order.x - e.x, e.order.y - e.y);
      if ((dist <= range && !waterSilenced(state, e)) || e.holdPosition) {
        e.waypoints = [];
        if (dist <= range && !waterSilenced(state, e)) e.state = "attack";
        e.tileX = worldToTile(e.x, state.tileSize);
        e.tileY = worldToTile(e.y, state.tileSize);
        continue;
      }
      if (e.waypoints.length === 0 || (state.tick + e.id) % 5 === 0) {
        setPath(state, e, e.order.x, e.order.y);
      }
    }
    if (e.order?.kind === "attackmove" && e.attackTarget != null && !aside) {
      const t = state.entities.get(e.attackTarget);
      if (t && t.hp > 0) {
        if (wantsCapture(e, t)) {
          if (adjacentToBuilding(state, e, t)) {
            e.state = "attack";
            e.tileX = worldToTile(e.x, state.tileSize);
            e.tileY = worldToTile(e.y, state.tileSize);
            continue;
          }
        } else {
          if (inWeaponReach(state, e, t) && !waterSilenced(state, e)) {
            e.state = "attack";
            e.tileX = worldToTile(e.x, state.tileSize);
            e.tileY = worldToTile(e.y, state.tileSize);
            continue;
          }
        }
      }
    }
    if (e.waypoints.length === 0) {
      if (e.order?.kind === "patrol") {
        e.tileX = worldToTile(e.x, state.tileSize);
        e.tileY = worldToTile(e.y, state.tileSize);
        continue;
      }
      if (e.state === "move") e.state = "idle";
      if (e.order?.kind === "move" || e.order?.kind === "attackmove" || e.order?.kind === "withdraw") {
        finishTravel(state, e);
      }
      continue;
    }
    if (flying) {
      // Jet pack lit: straight at the goal over everything, no path, no shoving.
      const goal = e.waypoints[e.waypoints.length - 1]!;
      turnToward(e, goal.x, goal.y, def.turnDegPerSec, dt);
      e.state = movingState(e);
      flyStep(state, e, dt);
      if (e.waypoints.length === 0 && e.order?.kind === "patrol") {
        commitPatrolArrival(state, e);
      } else if (
        e.waypoints.length === 0 &&
        (e.order?.kind === "move" || e.order?.kind === "attackmove" || e.order?.kind === "withdraw")
      ) {
        finishTravel(state, e);
      }
      continue;
    }
    if (settleNearGoal(state, e)) {
      if (e.state === "move") e.state = "idle";
      if (e.order?.kind === "patrol") commitPatrolArrival(state, e);
      else if (e.order?.kind === "move" || e.order?.kind === "attackmove" || e.order?.kind === "withdraw") {
        finishTravel(state, e);
      }
      continue;
    }
    if (def.turnInPlace) skipTinyWaypoints(e);
    const wp = e.waypoints[0];
    const want = wp ? hullSteerWant(e, wp) : e.facing;
    const rate = def.turnDegPerSec * hullTurnMul(e);
    // Must already be on the travel face at tick start — not after this tick's yaw.
    if (def.turnInPlace && Math.abs(angRemainingDeg(e.facing, want)) > FACE_MOVE_DEG) {
      turnTo(e, want, rate, dt);
      e.state = movingState(e) === "attack" ? "attack" : "idle";
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      continue;
    }
    if (wp) turnTo(e, want, rate, dt);
    e.state = movingState(e);
    const dest = e.waypoints[0];
    const dh = dest
      ? tileHeight(state, worldToTile(dest.x, state.tileSize), worldToTile(dest.y, state.tileSize)) -
        worldTileHeight(state, e.x, e.y)
      : 0;
    const ox = e.x;
    const oy = e.y;
    moveWithCollision(
      state,
      e,
      speed * slopeSpeedMul(dh) * moveSpeedMul(e, unitInWater(state, e)),
      dt,
      reversing(e),
      dest ? hullAcrossSlop(e, dest) : TRACK_ARRIVE_SLOP,
    );
    e.tileX = worldToTile(e.x, state.tileSize);
    e.tileY = worldToTile(e.y, state.tileSize);
    // Staggered by id: a whole jam re-planning on the same tick is one long tick.
    if (e.waypoints.length > 0 && Math.hypot(e.x - ox, e.y - oy) < 0.25 && (state.tick + e.id) % 10 === 0) {
      const last = e.waypoints[e.waypoints.length - 1];
      if (last) pathAroundParked(state, e, last.x, last.y);
    }
    if (e.waypoints.length === 0 && e.order?.kind === "patrol") {
      commitPatrolArrival(state, e);
    } else if (
      e.waypoints.length === 0 &&
      (e.order?.kind === "move" || e.order?.kind === "attackmove" || e.order?.kind === "withdraw")
    ) {
      finishTravel(state, e);
    }
  }
}

/** Attack pose while closing on a patrol contact. The route itself stays a walk. */
function movingState(e: Entity): "attack" | "move" {
  const kind = e.order?.kind;
  if (kind === "attack" || kind === "attackmove" || kind === "forceattack") return "attack";
  if (kind === "patrol" && e.attackTarget != null) return "attack";
  return "move";
}

/**
 * Keep a patrol on its leg, or peel off toward the contact combat picked.
 * True when the unit is in range and should stand and shoot this tick.
 */
function steerPatrol(state: MatchState, e: Entity): boolean {
  const o = e.order;
  if (!o || o.kind !== "patrol" || !o.route || o.route.length < 2) return false;
  const route = o.route;
  const loop = o.loop === true;
  const leg = patrolLegIndex(route.length, o.leg, loop);
  const dest = route[leg] ?? route[loop ? 0 : 1] ?? route[0];
  if (!dest) return false;

  if (e.attackTarget != null) {
    const t = state.entities.get(e.attackTarget);
    if (t && t.hp > 0) {
      const range = weaponRangeWorld(state, e);
      const dist = Math.hypot(t.x - e.x, t.y - e.y);
      if (inWeaponReach(state, e, t) && !waterSilenced(state, e)) {
        e.waypoints = [];
        e.state = "attack";
        return true;
      }
      // In the water the gun is silent. Stay on the route instead of wading closer.
      // A unit told to hold its ground keeps walking the route and lets the target come to it.
      if (!e.holdPosition && !(waterSilenced(state, e) && dist <= range)) {
        const goal = e.waypoints[e.waypoints.length - 1];
        if (!goal || Math.hypot(goal.x - t.x, goal.y - t.y) > state.tileSize || (state.tick + e.id) % 5 === 0) {
          setPath(state, e, t.x, t.y);
        }
        return false;
      }
      e.attackTarget = null;
    }
  }

  const close = Math.hypot(dest.x - e.x, dest.y - e.y) <= Math.max(state.tileSize * 2, e.radius * 4);
  // The path was asked for this spot: the pulled or nearest-walkable end it got is the best there is,
  // so a spot on a tree or a ledge does not cost a new search every tick. Reaching that end is the leg done.
  const goal = e.pathGoal;
  const aimed = !!goal && Math.hypot(goal.x - dest.x, goal.y - dest.y) <= state.tileSize;
  if (e.waypoints.length === 0 && (close || aimed)) {
    commitPatrolArrival(state, e);
    return false;
  }
  if (!aimed) setPath(state, e, dest.x, dest.y);
  return false;
}

/** The current leg is done. An open route turns around. A loop wraps to the first spot. */
function commitPatrolArrival(state: MatchState, e: Entity): void {
  const o = e.order;
  if (!o || o.kind !== "patrol" || !o.route || o.route.length < 2) return;
  if (e.attackTarget != null) return;
  const loop = o.loop === true;
  const leg = patrolLegIndex(o.route.length, o.leg, loop);
  const next = stepPatrolLeg(o.route, leg, o.dir === -1 ? -1 : 1, loop);
  o.leg = next.leg;
  o.dir = next.dir;
  const dest = o.route[next.leg];
  if (dest) setPath(state, e, dest.x, dest.y);
}

/** Distances below are in the unit's own radius; units are wider than a tile. */
const SETTLE_RADII = 4;
const SETTLE_SHIFT_RADII = 10;
const STALL_RADII = 8;
const STALL_TICKS = 20;

/** Closest the unit has come to its current goal, and when. */
const approach = new WeakMap<Entity, { gx: number; gy: number; best: number; tick: number }>();

/**
 * Final approach onto ground another unit holds: take the nearest open spot
 * instead of circling it. A unit that stops gaining on a nearby goal stands
 * where it is. Returns true when the unit is done travelling.
 */
function settleNearGoal(state: MatchState, e: Entity): boolean {
  const kind = e.order?.kind;
  if (kind !== "move" && kind !== "attackmove" && kind !== "guard" && kind !== "withdraw" && kind !== "patrol") {
    return false;
  }
  if (escorting(e) || ((kind === "attackmove" || kind === "patrol") && e.attackTarget != null)) return false;
  const goal = e.waypoints[e.waypoints.length - 1];
  if (!goal) return false;
  const r = Math.max(e.radius, state.tileSize);
  const dist = Math.hypot(goal.x - e.x, goal.y - e.y);

  if (dist <= r * SETTLE_RADII && spotTaken(state, e, goal.x, goal.y)) {
    const spot = openSpotNear(state, e, goal.x, goal.y);
    if (Math.hypot(spot.x - goal.x, spot.y - goal.y) > r * SETTLE_SHIFT_RADII || !setPath(state, e, spot.x, spot.y)) {
      e.waypoints = [];
      return true;
    }
    if (e.order && e.order.x != null) {
      e.order.x = spot.x;
      e.order.y = spot.y;
    }
    approach.delete(e);
    return false;
  }

  // Hulls yaw in place and never side-step, so a slow turn is not a stall.
  if (catalog(e.type).turnInPlace) return false;
  const prev = approach.get(e);
  if (!prev || prev.gx !== goal.x || prev.gy !== goal.y || dist < prev.best - 1) {
    approach.set(e, { gx: goal.x, gy: goal.y, best: dist, tick: state.tick });
    return false;
  }
  if (dist <= r * STALL_RADII && state.tick - prev.tick >= STALL_TICKS) {
    approach.delete(e);
    e.waypoints = [];
    return true;
  }
  return false;
}

function finishTravel(state: MatchState, e: Entity): void {
  if (e.returnToBase && e.order?.kind === "withdraw") {
    beginReturnToBase(state, e);
    return;
  }
  if (e.returnToBase && e.order?.kind === "move") {
    e.order = null;
    e.waypoints = [];
    e.state = "idle";
    e.holdPosition = true;
    return;
  }
  if (e.order?.kind === "move" && e.order.arrive != null) {
    const face = e.order.arrive;
    e.waypoints = [];
    e.order = {
      kind: "rotate",
      x: e.x + Math.cos(face) * 48,
      y: e.y + Math.sin(face) * 48,
    };
    e.state = "idle";
    return;
  }
  e.order = null;
  e.state = "idle";
}

function beginReturnToBase(state: MatchState, e: Entity): void {
  const hq = hqOf(state, e.ownerId);
  if (!hq || adjacentToBuilding(state, e, hq)) {
    e.order = null;
    e.waypoints = [];
    e.state = "idle";
    e.holdPosition = true;
    return;
  }
  const rally = rallyPoint(state, hq);
  if (Math.hypot(rally.x - e.x, rally.y - e.y) < state.tileSize) {
    e.order = null;
    e.waypoints = [];
    e.state = "idle";
    e.holdPosition = true;
    return;
  }
  e.order = { kind: "move", x: rally.x, y: rally.y, returnToBase: true };
  e.state = "move";
  setPath(state, e, rally.x, rally.y);
}

function marchTilesPerSec(e: Entity): number {
  const tiles = catalog(e.type).moveTilesPerSec;
  const cap = e.order?.pace;
  if (cap == null || cap <= 0 || cap >= tiles) return tiles;
  return cap;
}

function angRemainingDeg(current: number, want: number): number {
  let delta = want - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return (delta * 180) / Math.PI;
}

/** Drop sub-pixel lead points so hull want is the real travel heading. */
function skipTinyWaypoints(e: Entity): void {
  while (e.waypoints.length > 1) {
    const wp = e.waypoints[0];
    if (!wp || Math.hypot(wp.x - e.x, wp.y - e.y) > 2) break;
    e.waypoints.shift();
  }
}

function hullWant(e: Entity, want: number): number {
  return catalog(e.type).turnInPlace ? snapTankYaw(want) : want;
}

/** Locked travel face for the current waypoint so dest-heading snap does not flicker. */
const committedFace = new WeakMap<
  Entity,
  { face: number; wx: number; wy: number; acrossMax: number; back: boolean }
>();

function hullAcrossSlop(e: Entity, wp: { x: number; y: number }): number {
  const prev = committedFace.get(e);
  if (prev && prev.wx === wp.x && prev.wy === wp.y) return prev.acrossMax;
  return TRACK_ARRIVE_SLOP;
}

function hullSteerWant(e: Entity, wp: { x: number; y: number }): number {
  const back = reversing(e);
  // A short tank hop keeps the dest face; a double-ended hull steers its stern down the course.
  if (back && e.order?.facing != null && !catalog(e.type).doubleEnded) return hullWant(e, e.order.facing);
  const dx = wp.x - e.x;
  const dy = wp.y - e.y;
  // Heading of travel toward the waypoint; the hull points the other way when it backs up.
  const dest = Math.atan2(dy, dx);
  const hullDest = back ? dest + Math.PI : dest;
  if (!catalog(e.type).turnInPlace) return hullDest;
  const travel = back ? e.facing + Math.PI : e.facing;
  const fx = Math.cos(travel);
  const fy = Math.sin(travel);
  const along = dx * fx + dy * fy;
  const across = dx * -fy + dy * fx;
  // Already on a face with the waypoint's foot within arrival slop of the
  // axis: finish the roll on this face. Re-aiming would spin the hull for a
  // few pixels. Mid-yaw the dest face below still wins, so no oscillation.
  const face = snapTankYaw(e.facing);
  const onFace = Math.abs(angRemainingDeg(e.facing, face)) <= FACE_MOVE_DEG;
  if (onFace && Math.abs(across) <= TRACK_ARRIVE_SLOP && along > -TRACK_ARRIVE_SLOP) return face;
  const destSnap = snapTankYaw(hullDest);
  const prev = committedFace.get(e);
  // Backing up needs the lock as much as rolling forward: a bearing on the
  // edge between two faces would otherwise flip the hull every step.
  if (prev && prev.wx === wp.x && prev.wy === wp.y && prev.back === back && along > 2) return prev.face;
  const dist = Math.hypot(dx, dy);
  const err = (Math.abs(angRemainingDeg(hullDest, destSnap)) * Math.PI) / 180;
  const acrossMax = dist * Math.sin(err) + TRACK_ARRIVE_SLOP;
  committedFace.set(e, { face: destSnap, wx: wp.x, wy: wp.y, acrossMax, back });
  return destSnap;
}

function liveEscortTarget(state: MatchState, e: Entity): Entity | undefined {
  const id = e.order?.kind === "guard" ? e.order.targetId : undefined;
  if (id == null) return undefined;
  const t = state.entities.get(id);
  if (!t || t.hp <= 0 || t.wreck || t.id === e.id) return undefined;
  return t;
}

/** Stay beside the target. Returns true when the unit should hold this tick. */
function tickEscort(state: MatchState, e: Entity): boolean {
  const t = liveEscortTarget(state, e);
  if (!t) {
    e.order = null;
    e.waypoints = [];
    if (e.state === "move" || e.state === "attack") e.state = "idle";
    return false;
  }
  const dist = Math.hypot(t.x - e.x, t.y - e.y);
  const leash = unitClearance(e.radius, t.radius) + state.tileSize;
  if (dist <= leash) {
    e.waypoints = [];
    return true;
  }
  if (e.waypoints.length === 0 || (state.tick + e.id) % 5 === 0) {
    const dest = escortAnchor(e, t);
    setPath(state, e, dest.x, dest.y);
  }
  return false;
}

function tickGuardFacing(e: Entity, dt: number): void {
  const want = e.guardFacing;
  if (want == null) return;
  const def = catalog(e.type);
  const hull = stepTurn(e.facing, want, def.turnDegPerSec * hullTurnMul(e), dt);
  e.facing = hull.angle;
  if (!hasTurret(e.type)) {
    e.turretFacing = e.facing;
  } else {
    const rate = def.turretTurnDegPerSec ?? def.turnDegPerSec;
    const gun = stepTurn(e.turretFacing, want, rate, dt);
    e.turretFacing = gun.angle;
  }
  if (e.state === "move") e.state = "idle";
}

function tickRotate(e: Entity, dt: number): void {
  const def = catalog(e.type);
  const tx = e.order?.x;
  const ty = e.order?.y;
  if (tx == null || ty == null) {
    e.order = null;
    return;
  }
  const hullRate = def.turnDegPerSec * hullTurnMul(e);
  const hull = turnToward(e, tx, ty, hullRate, dt);
  let gun = 0;
  if (hasTurret(e.type)) {
    const rate = def.turretTurnDegPerSec ?? def.turnDegPerSec;
    gun = turnTurretToward(e, tx, ty, rate, dt);
  }
  e.state = "idle";
  const hullDone = hullRate <= 0 || Math.abs(hull) <= 0.5;
  if (hullDone && Math.abs(gun) <= 0.5) e.order = null;
}

export function repathIfBlocked(state: MatchState, e: Entity): void {
  if (e.waypoints.length === 0) return;
  const last = e.waypoints[e.waypoints.length - 1];
  if (!last) return;
  setPath(state, e, last.x, last.y);
}
