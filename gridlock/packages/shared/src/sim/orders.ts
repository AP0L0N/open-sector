import { catalog, FACE_MOVE_DEG, hasTurret } from "../catalog.js";
import { adjacentToBuilding, unitInWater, worldToTile } from "./geo.js";
import { wantsCapture, pathToCapture } from "./capture.js";
import { moveWithCollision } from "./collision.js";
import { hullTurnMul, moveSpeedMul } from "./crits.js";
import { setPath } from "./path.js";
import { slopeSpeedMul, tileHeight, weaponRangeWorld, worldTileHeight } from "./elevation.js";
import type { Entity, MatchState } from "./types.js";

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

export function turnToward(e: Entity, tx: number, ty: number, degPerSec: number, dt: number): number {
  const want = Math.atan2(ty - e.y, tx - e.x);
  const r = stepTurn(e.facing, want, degPerSec, dt);
  e.facing = r.angle;
  if (!hasTurret(e.type)) e.turretFacing = e.facing;
  return r.remainingDeg;
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
    const speed = def.moveTilesPerSec * state.tileSize;
    if (e.order?.kind === "rotate" && e.order.x != null && e.order.y != null) {
      tickRotate(e, dt);
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      continue;
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
      if (e.order?.kind === "attackmove" || e.order?.kind === "withdraw") {
        e.order = null;
        e.state = "idle";
      }
      continue;
    }
    const wp = e.waypoints[0];
    const remaining = wp ? turnToward(e, wp.x, wp.y, def.turnDegPerSec * hullTurnMul(e), dt) : 0;
    if (def.turnInPlace && Math.abs(remaining) > FACE_MOVE_DEG) {
      e.state =
        e.order?.kind === "attack" || e.order?.kind === "attackmove" || e.order?.kind === "forceattack"
          ? "attack"
          : "idle";
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      continue;
    }
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
    moveWithCollision(state, e, speed * slopeSpeedMul(dh) * moveSpeedMul(e, unitInWater(state, e)), dt);
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
      e.order = null;
      e.state = "idle";
    }
  }
}

function tickRotate(e: Entity, dt: number): void {
  const def = catalog(e.type);
  const tx = e.order?.x;
  const ty = e.order?.y;
  if (tx == null || ty == null) {
    e.order = null;
    return;
  }
  const hull = turnToward(e, tx, ty, def.turnDegPerSec * hullTurnMul(e), dt);
  let gun = 0;
  if (hasTurret(e.type)) {
    const rate = def.turretTurnDegPerSec ?? def.turnDegPerSec;
    gun = turnTurretToward(e, tx, ty, rate, dt);
  }
  e.state = "idle";
  if (Math.abs(hull) <= 0.5 && Math.abs(gun) <= 0.5) e.order = null;
}

export function repathIfBlocked(state: MatchState, e: Entity): void {
  if (e.waypoints.length === 0) return;
  const last = e.waypoints[e.waypoints.length - 1];
  if (!last) return;
  setPath(state, e, last.x, last.y);
}
