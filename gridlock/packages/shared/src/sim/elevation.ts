import {
  HEIGHT_DOWNHILL_COST,
  HEIGHT_DOWNHILL_SPEED,
  HEIGHT_RANGE_BONUS,
  HEIGHT_SIGHT_BONUS,
  HEIGHT_STEP_MAX,
  HEIGHT_UPHILL_COST,
  HEIGHT_UPHILL_SPEED,
  catalog,
  type EntityType,
} from "../catalog.js";
import { inBounds, tileIndex, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

export function elevAt(elev: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return elev[y * width + x] ?? 0;
}

export function tileHeight(state: MatchState, x: number, y: number): number {
  if (!inBounds(state, x, y)) return 0;
  return state.heights[tileIndex(state, x, y)] ?? 0;
}

export function worldTileHeight(state: MatchState, wx: number, wy: number): number {
  return tileHeight(state, worldToTile(wx, state.tileSize), worldToTile(wy, state.tileSize));
}

export function entityHeight(state: MatchState, e: Entity): number {
  if (e.kind === "building") {
    let h = 0;
    for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
      for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
        const t = tileHeight(state, x, y);
        if (t > h) h = t;
      }
    }
    return h;
  }
  return worldTileHeight(state, e.x, e.y);
}

export function climbableDelta(dh: number): boolean {
  return Math.abs(dh) <= HEIGHT_STEP_MAX;
}

export function slopeSpeedMul(dh: number): number {
  if (dh > 0) return HEIGHT_UPHILL_SPEED ** dh;
  if (dh < 0) return HEIGHT_DOWNHILL_SPEED ** -dh;
  return 1;
}

export function slopeCostMul(dh: number): number {
  if (dh > 0) return HEIGHT_UPHILL_COST ** dh;
  if (dh < 0) return HEIGHT_DOWNHILL_COST ** -dh;
  return 1;
}

export function minSlopeCostMul(): number {
  return Math.min(1, HEIGHT_DOWNHILL_COST);
}

export function sightTilesOf(type: EntityType, elev: number): number {
  return catalog(type).sightTiles + Math.max(0, elev) * HEIGHT_SIGHT_BONUS;
}

export function rangeTilesOf(type: EntityType, elev: number): number {
  const base = catalog(type).rangeTiles;
  if (base <= 0) return 0;
  return base + Math.max(0, elev) * HEIGHT_RANGE_BONUS;
}

export function weaponRangeWorld(state: MatchState, e: Entity): number {
  return rangeTilesOf(e.type, entityHeight(state, e)) * state.tileSize;
}

/**
 * Ridges taller than the observer hide whatever sits at or below the ridge.
 * Looking onto a hillside is allowed; looking past it is not.
 */
export function hasTerrainLos(
  elev: ArrayLike<number>,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  if (x0 === x1 && y0 === y1) return true;
  const h0 = elevAt(elev, width, height, x0, y0);
  const h1 = elevAt(elev, width, height, x1, y1);
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const cap = dx + dy + 2;
  for (let n = 0; n < cap; n++) {
    if (x === x1 && y === y1) return true;
    const e2 = err * 2;
    let steppedX = false;
    let steppedY = false;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
      steppedX = true;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
      steppedY = true;
    }
    if (steppedX && steppedY) {
      const cx = x - sx;
      const cy = y - sy;
      if (blocksLos(elev, width, height, cx, y, x0, y0, x1, y1, h0, h1)) return false;
      if (blocksLos(elev, width, height, x, cy, x0, y0, x1, y1, h0, h1)) return false;
    }
    if (blocksLos(elev, width, height, x, y, x0, y0, x1, y1, h0, h1)) return false;
  }
  return true;
}

function blocksLos(
  elev: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h0: number,
  h1: number,
): boolean {
  if (x === x0 && y === y0) return false;
  if (x === x1 && y === y1) return false;
  const h = elevAt(elev, width, height, x, y);
  return h > h0 && h >= h1;
}
