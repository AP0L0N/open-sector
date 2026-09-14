import { catalog, FACE_MOVE_DEG } from "../catalog.js";
import { followPath, setPath } from "./path.js";
import { slopeSpeedMul, tileHeight, weaponRangeWorld, worldTileHeight } from "./elevation.js";
import { worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

export function turnToward(e: Entity, tx: number, ty: number, degPerSec: number, dt: number): number {
  const want = Math.atan2(ty - e.y, tx - e.x);
  let delta = want - e.facing;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const max = (degPerSec * Math.PI) / 180 * dt;
  if (Math.abs(delta) <= max) {
    e.facing = want;
    return 0;
  }
  e.facing += Math.sign(delta) * max;
  return ((delta - Math.sign(delta) * max) * 180) / Math.PI;
}

export function tickMovement(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    const def = catalog(e.type);
    const speed = def.moveTilesPerSec * state.tileSize;
    if (e.order?.kind === "attack" && e.order.targetId != null) {
      const t = state.entities.get(e.order.targetId);
      if (t && t.hp > 0) {
        const range = weaponRangeWorld(state, e);
        const dist = Math.hypot(t.x - e.x, t.y - e.y);
        if (dist <= range) {
          e.waypoints = [];
          continue;
        }
        if (e.waypoints.length === 0 || state.tick % 5 === 0) {
          setPath(state, e, t.x, t.y);
        }
      }
    }
    if (e.waypoints.length === 0) {
      if (e.state === "move") e.state = "idle";
      continue;
    }
    const wp = e.waypoints[0];
    const remaining = wp ? turnToward(e, wp.x, wp.y, def.turnDegPerSec, dt) : 0;
    if (def.turnInPlace && Math.abs(remaining) > FACE_MOVE_DEG) {
      e.state = e.order?.kind === "attack" ? "attack" : "idle";
      e.tileX = worldToTile(e.x, state.tileSize);
      e.tileY = worldToTile(e.y, state.tileSize);
      continue;
    }
    e.state = e.order?.kind === "attack" ? "attack" : e.order?.kind === "harvest" ? "harvest" : e.order?.kind === "unload" ? "unload" : "move";
    const dest = e.waypoints[0];
    const dh = dest
      ? tileHeight(state, worldToTile(dest.x, state.tileSize), worldToTile(dest.y, state.tileSize)) -
        worldTileHeight(state, e.x, e.y)
      : 0;
    followPath(e, speed * slopeSpeedMul(dh), dt);
    e.tileX = worldToTile(e.x, state.tileSize);
    e.tileY = worldToTile(e.y, state.tileSize);
    if (e.waypoints.length === 0 && e.order?.kind === "move") {
      e.order = null;
      e.state = "idle";
    }
  }
}

export function repathIfBlocked(state: MatchState, e: Entity): void {
  if (e.waypoints.length === 0) return;
  const last = e.waypoints[e.waypoints.length - 1];
  if (!last) return;
  setPath(state, e, last.x, last.y);
}
