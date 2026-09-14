import { GARRISON_HIDE_SIGHT, GARRISON_WATCH_SIGHT_BONUS, HEIGHT_MAX, SMOKE_PEEK_TILES } from "../catalog.js";
import type { EntityView, MatchSnapshot } from "../protocol.js";
import { getMap, TILE_EMPTY, TILE_TREE } from "../maps.js";
import {
  hasFullLos,
  observerEyeOf,
  sightTilesOf,
  uphillSightOf,
  type CoverField,
} from "./elevation.js";
import { allies, chebyshev, footprint, inBounds, worldToTile } from "./geo.js";
import { occupantSightTiles } from "./garrison.js";
import { cloudsCoverTile } from "./smoke.js";
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
  /** Override catalog sight. Used for garrison watch / hide. */
  sightTiles?: number;
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
    let maxH = 0;
    for (const t of footprint(e.tileX, e.tileY, e.tileW, e.tileH)) {
      if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) continue;
      mask[t.y * width + t.x] = 1;
      if (elev) {
        const h = elev[t.y * width + t.x] ?? 0;
        if (h > maxH) maxH = h;
      }
    }
    const cx = e.tileX + Math.floor(e.tileW / 2);
    const cy = e.tileY + Math.floor(e.tileH / 2);
    paintSight(mask, width, height, cx, cy, e.sightTiles ?? sightTilesOf(e.type, maxH), elev, field);
    return;
  }
  const tx = worldToTile(e.x, tileSize);
  const ty = worldToTile(e.y, tileSize);
  const h = elev ? elevAtSafe(elev, width, height, tx, ty) : 0;
  paintSight(
    mask,
    width,
    height,
    tx,
    ty,
    e.sightTiles ?? sightTilesOf(e.type, h),
    elev,
    field,
    observerEyeOf(e.type),
    uphillSightOf(e.type),
  );
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
  observerEye = 0,
  uphillBonus = 0,
): void {
  if (radius <= 0) return;
  if (!elev) {
    paintChebyshev(mask, width, height, ox, oy, radius);
    return;
  }
  const maxR = radius + (uphillBonus > 0 ? HEIGHT_MAX * uphillBonus : 0);
  const x0 = Math.max(0, ox - maxR);
  const x1 = Math.min(width - 1, ox + maxR);
  const y0 = Math.max(0, oy - maxR);
  const y1 = Math.min(height - 1, oy + maxR);
  const h0 = elevAtSafe(elev, width, height, ox, oy);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const extra =
        uphillBonus > 0 ? Math.max(0, elevAtSafe(elev, width, height, x, y) - h0) * uphillBonus : 0;
      if (chebyshev(x, y, ox, oy) > radius + extra) continue;
      if (!hasFullLos(elev, width, height, ox, oy, x, y, cover, observerEye)) continue;
      if (cover?.smokeAt?.(x, y) && chebyshev(x, y, ox, oy) > SMOKE_PEEK_TILES) continue;
      mask[y * width + x] = 1;
    }
  }
}

function coverOf(state: MatchState): CoverField {
  return {
    terrain: state.terrain,
    occupy: state.occupy,
    smokeAt: (x, y) => tileInSmokeQuick(state, x, y),
  };
}

function tileInSmokeQuick(state: MatchState, x: number, y: number): boolean {
  return cloudsCoverTile(state.smokeClouds, state.tileSize, x, y);
}

/** Snapshot fog uses the static map; drop trees a vehicle has already flattened. */
export function coverTerrainFromSnapshot(
  tiles: ArrayLike<number>,
  width: number,
  height: number,
  clearedTrees: { x: number; y: number }[] | undefined,
): ArrayLike<number> {
  if (!clearedTrees || clearedTrees.length === 0) return tiles;
  const terrain = new Uint8Array(tiles);
  for (const t of clearedTrees) {
    if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) continue;
    const i = t.y * width + t.x;
    if (terrain[i] === TILE_TREE) terrain[i] = TILE_EMPTY;
  }
  return terrain;
}

export function visionMask(state: MatchState, playerId: string): Uint8Array {
  if (state.visionTick === state.tick) {
    const cached = state.visionByPlayer.get(playerId);
    if (cached) return cached;
  } else {
    state.visionByPlayer.clear();
    state.visionTick = state.tick;
  }
  const mask = new Uint8Array(state.width * state.height);
  const cover = coverOf(state);
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) continue;
    if (!allies(state, playerId, e.ownerId)) continue;
    const sightTiles = occupantSightTiles(state, e);
    paintEntitySight(
      mask,
      state.width,
      state.height,
      state.tileSize,
      sightTiles != null ? { ...e, sightTiles } : e,
      state.heights,
      cover,
    );
  }
  state.visionByPlayer.set(playerId, mask);
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
  const cover: CoverField | undefined = map
    ? {
        terrain: coverTerrainFromSnapshot(map.tiles, width, height, snap.clearedTrees),
        occupy,
        smokeAt: (x, y) => cloudsCoverTile(snap.smoke ?? [], tileSize, x, y),
      }
    : undefined;
  for (const e of snap.entities) {
    if (e.wreck) continue;
    const allied = e.ownerId === you || (team !== 0 && snap.players.find((p) => p.playerId === e.ownerId)?.team === team);
    if (!allied) continue;
    const sightTiles = snapshotOccupantSight(snap, e, elev, width, height, tileSize);
    paintEntitySight(mask, width, height, tileSize, sightTiles != null ? { ...e, sightTiles } : e, elev, cover);
  }
  return mask;
}

function snapshotOccupantSight(
  snap: MatchSnapshot,
  e: EntityView,
  elev: ArrayLike<number> | undefined,
  width: number,
  height: number,
  tileSize: number,
): number | undefined {
  if (!e.garrisonedIn) return undefined;
  const house = snap.entities.find((x) => x.id === e.garrisonedIn);
  if (!house) return undefined;
  if (house.garrison?.hide) return GARRISON_HIDE_SIGHT;
  const tx = worldToTile(e.x, tileSize);
  const ty = worldToTile(e.y, tileSize);
  const h = elev ? elevAtSafe(elev, width, height, tx, ty) : 0;
  return sightTilesOf(e.type, h) + GARRISON_WATCH_SIGHT_BONUS;
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
