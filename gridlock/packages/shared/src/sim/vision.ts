import { catalog } from "../catalog.js";
import type { EntityView, MatchSnapshot } from "../protocol.js";
import { allies, chebyshev, footprint, inBounds, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

export type SightSource = {
  kind: "unit" | "building";
  type: EntityView["type"];
  ownerId: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
};

export function paintChebyshev(
  mask: Uint8Array,
  width: number,
  height: number,
  ox: number,
  oy: number,
  radius: number,
): void {
  const x0 = Math.max(0, ox - radius);
  const x1 = Math.min(width - 1, ox + radius);
  const y0 = Math.max(0, oy - radius);
  const y1 = Math.min(height - 1, oy + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (chebyshev(x, y, ox, oy) <= radius) mask[y * width + x] = 1;
    }
  }
}

export function paintEntitySight(
  mask: Uint8Array,
  width: number,
  height: number,
  tileSize: number,
  e: SightSource,
): void {
  const radius = catalog(e.type).sightTiles;
  if (radius <= 0) return;
  if (e.kind === "building") {
    for (const t of footprint(e.tileX, e.tileY, e.tileW, e.tileH)) {
      if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) continue;
      paintChebyshev(mask, width, height, t.x, t.y, radius);
    }
    return;
  }
  paintChebyshev(mask, width, height, worldToTile(e.x, tileSize), worldToTile(e.y, tileSize), radius);
}

export function visionMask(state: MatchState, playerId: string): Uint8Array {
  const mask = new Uint8Array(state.width * state.height);
  for (const e of state.entities.values()) {
    if (e.hp <= 0) continue;
    if (!allies(state, playerId, e.ownerId)) continue;
    paintEntitySight(mask, state.width, state.height, state.tileSize, e);
  }
  return mask;
}

export function visionMaskFromSnapshot(
  snap: MatchSnapshot,
  width: number,
  height: number,
  tileSize: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const you = snap.youPlayerId;
  const team = snap.players.find((p) => p.playerId === you)?.team ?? 0;
  for (const e of snap.entities) {
    if (e.ownerId === you) {
      paintEntitySight(mask, width, height, tileSize, e);
      continue;
    }
    if (team === 0) continue;
    const other = snap.players.find((p) => p.playerId === e.ownerId);
    if (other && other.team === team) paintEntitySight(mask, width, height, tileSize, e);
  }
  return mask;
}

export function tileOnMask(mask: Uint8Array, width: number, x: number, y: number): boolean {
  if (x < 0 || y < 0) return false;
  const i = y * width + x;
  if (i < 0 || i >= mask.length) return false;
  return mask[i] === 1;
}

export function entityOnMask(
  e: SightSource,
  mask: Uint8Array,
  width: number,
  height: number,
  tileSize: number,
): boolean {
  if (e.kind === "building") {
    for (const t of footprint(e.tileX, e.tileY, e.tileW, e.tileH)) {
      if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) continue;
      if (tileOnMask(mask, width, t.x, t.y)) return true;
    }
    return false;
  }
  return tileOnMask(mask, width, worldToTile(e.x, tileSize), worldToTile(e.y, tileSize));
}

export function canSeeEntity(state: MatchState, playerId: string, e: Entity, mask?: Uint8Array): boolean {
  if (e.hp <= 0) return false;
  if (allies(state, playerId, e.ownerId)) return true;
  const vis = mask ?? visionMask(state, playerId);
  return entityOnMask(e, vis, state.width, state.height, state.tileSize);
}

export function canSeeWorld(state: MatchState, mask: Uint8Array, wx: number, wy: number): boolean {
  const tx = worldToTile(wx, state.tileSize);
  const ty = worldToTile(wy, state.tileSize);
  if (!inBounds(state, tx, ty)) return false;
  return tileOnMask(mask, state.width, tx, ty);
}
