import {
  catalog,
  FACE_MOVE_DEG,
  hasTurret,
  REVERSE_CONE_DEG,
  REVERSE_TILES,
  snapTankYaw,
  TILE_SIZE,
  TRACK_ARRIVE_SLOP,
} from "../catalog.js";
import { adjacentToBuilding, hqOf, rallyPoint, unitInWater, worldToTile } from "./geo.js";
import { wantsCapture, pathToCapture } from "./capture.js";
import { moveWithCollision } from "./collision.js";
import { hullTurnMul, moveSpeedMul } from "./crits.js";
import { unitClearance } from "./formation.js";
import { setPath } from "./path.js";
import { slopeSpeedMul, tileHeight, weaponRangeWorld, worldTileHeight } from "./elevation.js";
import type { Entity, MatchState } from "./types.js";

/** Guard order that follows a living unit instead of holding a point. */
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
  if (!catalog(e.type).turnInPlace) return false;
  const kind = e.order?.kind;
  if (kind !== "move" && kind !== "attackmove") return false;
  const wp = e.waypoints[0];
  return !!wp && closeRearWaypoint(e, wp);
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
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.wreck || e.garrisonedIn) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    const def = catalog(e.type);
    const speed = marchTilesPerSec(e) * state.tileSize;
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
    if (e.guardFacing != null && e.waypoints.length === 0 && !e.attackTarget) {
      if (!e.order || e.order.kind === "guard") {
        tickGuardFacing(e, dt);
        e.tileX = worldToTile(e.x, state.tileSize);
        e.tileY = worldToTile(e.y, state.tileSize);
        continue;
      }
    }
    const chaseId =
      (e.order?.kind === "attack" || e.order?.kind === "forceattack") && e.order.targetId != null
        ? e.order.targetId
        : null;
    if (chaseId != null) {
      const t = state.entities.get(chaseId);
      if (t && t.hp > 0) {
        if (wantsCapture(e, t)) {
          if (adjacentToBuilding(state, e, t) || e.holdPosition) {
            e.waypoints = [];
            continue;
          }
          if (e.waypoints.length === 0 || state.tick % 5 === 0) pathToCapture(state, e, t);
        } else {
          const range = weaponRangeWorld(state, e);
          const dist = Math.hypot(t.x - e.x, t.y - e.y);
          if ((dist <= range && !unitInWater(state, e)) || e.holdPosition) {
            e.waypoints = [];
            continue;
          }
          if (e.waypoints.length === 0 || state.tick % 5 === 0) {
            setPath(state, e, t.x, t.y);
          }
        }
      }
    }
    if (e.order?.kind === "forceattack" && e.order.targetId == null && e.order.x != null && e.order.y != null) {
      const range = weaponRangeWorld(state, e);
      const dist = Math.hypot(e.order.x - e.x, e.order.y - e.y);
      if ((dist <= range && !unitInWater(state, e)) || e.holdPosition) {
        e.waypoints = [];
        if (dist <= range && !unitInWater(state, e)) e.state = "attack";
        e.tileX = worldToTile(e.x, state.tileSize);
        e.tileY = worldToTile(e.y, state.tileSize);
        continue;
      }
      if (e.waypoints.length === 0 || state.tick % 5 === 0) {
        setPath(state, e, e.order.x, e.order.y);
      }
    }
    if (e.order?.kind === "attackmove" && e.attackTarget != null) {
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
          const range = weaponRangeWorld(state, e);
          const dist = Math.hypot(t.x - e.x, t.y - e.y);
          if (dist <= range && !unitInWater(state, e)) {
            e.state = "attack";
            e.tileX = worldToTile(e.x, state.tileSize);
            e.tileY = worldToTile(e.y, state.tileSize);
            continue;
          }
        }
      }
    }
    if (e.waypoints.length === 0) {
      if (e.state === "move") e.state = "idle";
      if (e.order?.kind === "move" || e.order?.kind === "attackmove" || e.order?.kind === "withdraw") {
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
      e.state =
        e.order?.kind === "attack" || e.order?.kind === "attackmove" || e.order?.kind === "forceattack"
          ? "attack"
          : "idle";
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      continue;
    }
    if (wp) turnTo(e, want, rate, dt);
    e.state =
      e.order?.kind === "attack" || e.order?.kind === "attackmove" || e.order?.kind === "forceattack"
        ? "attack"
        : e.order?.kind === "harvest"
          ? "harvest"
          : e.order?.kind === "unload"
            ? "unload"
            : "move";
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
    if (e.waypoints.length > 0 && Math.hypot(e.x - ox, e.y - oy) < 0.25 && state.tick % 10 === 0) {
      const last = e.waypoints[e.waypoints.length - 1];
      if (last) setPath(state, e, last.x, last.y);
    }
    if (
      e.waypoints.length === 0 &&
      (e.order?.kind === "move" || e.order?.kind === "attackmove" || e.order?.kind === "withdraw")
    ) {
      finishTravel(state, e);
    }
  }
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
const committedFace = new WeakMap<Entity, { face: number; wx: number; wy: number; acrossMax: number }>();

function hullAcrossSlop(e: Entity, wp: { x: number; y: number }): number {
  const prev = committedFace.get(e);
  if (prev && prev.wx === wp.x && prev.wy === wp.y) return prev.acrossMax;
  return TRACK_ARRIVE_SLOP;
}

function hullSteerWant(e: Entity, wp: { x: number; y: number }): number {
  if (reversing(e)) return hullWant(e, reverseHeading(e, wp));
  const dest = Math.atan2(wp.y - e.y, wp.x - e.x);
  if (!catalog(e.type).turnInPlace) return dest;
  const dx = wp.x - e.x;
  const dy = wp.y - e.y;
  const fx = Math.cos(e.facing);
  const fy = Math.sin(e.facing);
  const along = dx * fx + dy * fy;
  const across = dx * -fy + dy * fx;
  // Already on a face with the waypoint's foot within arrival slop of the
  // axis: finish the roll on this face. Re-aiming would spin the hull for a
  // few pixels. Mid-yaw the dest face below still wins, so no oscillation.
  const face = snapTankYaw(e.facing);
  const onFace = Math.abs(angRemainingDeg(e.facing, face)) <= FACE_MOVE_DEG;
  if (onFace && Math.abs(across) <= TRACK_ARRIVE_SLOP && along > -TRACK_ARRIVE_SLOP) return face;
  const destSnap = snapTankYaw(dest);
  const prev = committedFace.get(e);
  if (prev && prev.wx === wp.x && prev.wy === wp.y && along > 2) return prev.face;
  const dist = Math.hypot(dx, dy);
  const err = (Math.abs(angRemainingDeg(dest, destSnap)) * Math.PI) / 180;
  const acrossMax = dist * Math.sin(err) + TRACK_ARRIVE_SLOP;
  committedFace.set(e, { face: destSnap, wx: wp.x, wy: wp.y, acrossMax });
  return destSnap;
}

function reverseHeading(e: Entity, wp: { x: number; y: number }): number {
  if (e.order?.facing != null) return e.order.facing;
  return Math.atan2(e.y - wp.y, e.x - wp.x);
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
  if (e.waypoints.length === 0 || state.tick % 5 === 0) {
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
