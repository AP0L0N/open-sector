import type { EntityView, MatchSnapshot } from "../protocol.js";
import { getMap } from "../maps.js";
import { hasFullLos, sightTilesOf, type CoverField } from "./elevation.js";
import { allies, chebyshev, footprint, inBounds, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

export type SightSource = {
  id?: number;
  kind: "unit" | "building";
  type: EntityView["type"];
  ownerId: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  garrisonedIn?: number | null;
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
  elev?: ArrayLike<number>,
  cover?: CoverField,
): void {
  const ignore = e.kind === "building" ? (e.id ?? 0) : (e.garrisonedIn ?? 0);
  const field = cover ? { ...cover, ignoreOccupyId: ignore || cover.ignoreOccupyId } : undefined;
  if (e.kind === "building") {
    for (const t of footprint(e.tileX, e.tileY, e.tileW, e.tileH)) {
      if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) continue;
      const h = elev ? (elev[t.y * width + t.x] ?? 0) : 0;
      paintSight(mask, width, height, t.x, t.y, sightTilesOf(e.type, h), elev, field);
    }
    return;
  }
  const tx = worldToTile(e.x, tileSize);
  const ty = worldToTile(e.y, tileSize);
  const h = elev ? elevAtSafe(elev, width, height, tx, ty) : 0;
  paintSight(mask, width, height, tx, ty, sightTilesOf(e.type, h), elev, field);
}

function elevAtSafe(elev: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return elev[y * width + x] ?? 0;
}

function paintSight(
  mask: Uint8Array,
  width: number,
  height: number,
  ox: number,
  oy: number,
  radius: number,
  elev?: ArrayLike<number>,
  cover?: CoverField,
): void {
  if (radius <= 0) return;
  if (!elev) {
    paintChebyshev(mask, width, height, ox, oy, radius);
    return;
  }
  const x0 = Math.max(0, ox - radius);
  const x1 = Math.min(width - 1, ox + radius);
  const y0 = Math.max(0, oy - radius);
  const y1 = Math.min(height - 1, oy + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (chebyshev(x, y, ox, oy) > radius) continue;
      if (!hasFullLos(elev, width, height, ox, oy, x, y, cover)) continue;
      mask[y * width + x] = 1;
    }
  }
}

function coverOf(state: MatchState): CoverField {
  return { terrain: state.terrain, occupy: state.occupy };
}

export function visionMask(state: MatchState, playerId: string): Uint8Array {
  const mask = new Uint8Array(state.width * state.height);
  const cover = coverOf(state);
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) continue;
    if (!allies(state, playerId, e.ownerId)) continue;
    paintEntitySight(mask, state.width, state.height, state.tileSize, e, state.heights, cover);
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
  const map = getMap(snap.mapId);
  const elev = map?.heights;
  const occupy = new Int32Array(width * height);
  if (map) {
    for (const e of snap.entities) {
      if (e.kind !== "building" || e.hp <= 0) continue;
      for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
        for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
          if (x >= 0 && y >= 0 && x < width && y < height) occupy[y * width + x] = e.id;
        }
      }
    }
  }
  const cover: CoverField | undefined = map ? { terrain: map.tiles, occupy } : undefined;
  for (const e of snap.entities) {
    if (e.wreck) continue;
    if (e.ownerId === you) {
      paintEntitySight(mask, width, height, tileSize, e, elev, cover);
      continue;
    }
    if (team === 0) continue;
    const other = snap.players.find((p) => p.playerId === e.ownerId);
    if (other && other.team === team) paintEntitySight(mask, width, height, tileSize, e, elev, cover);
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
