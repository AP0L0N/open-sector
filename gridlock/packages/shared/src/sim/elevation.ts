import {
  GARRISON_HIDE_SIGHT,
  GARRISON_WATCH_SIGHT_BONUS,
  HANDGUN,
  HEIGHT_DOWNHILL_COST,
  HEIGHT_DOWNHILL_SPEED,
  HEIGHT_SIGHT_BONUS,
  HEIGHT_STEP_MAX,
  HEIGHT_UPHILL_COST,
  HEIGHT_UPHILL_SPEED,
  INFANTRY_EYE_HEIGHT,
  INFANTRY_UPHILL_SIGHT,
  TREE_LOS_THROUGH,
  catalog,
  hasCrit,
  isInfantryType,
  sightBonusTilesOf,
  weaponRangeTiles,
  type EntityType,
} from "../catalog.js";
import { TILE_TREE } from "../maps.js";
import { hardCoverAt, inBounds, tileIndex, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

export function elevAt(elev: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return elev[y * width + x] ?? 0;
}

/** Height at a tile vertex (vx, vy) in 0..width / 0..height, averaged from adjacent cells. */
export function vertexElev(
  elev: ArrayLike<number>,
  width: number,
  height: number,
  vx: number,
  vy: number,
): number {
  let sum = 0;
  let n = 0;
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const x = vx + dx;
      const y = vy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      sum += elev[y * width + x] ?? 0;
      n++;
    }
  }
  return n ? sum / n : 0;
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

export function sightTilesOf(type: EntityType, elev: number, extra = 0): number {
  return (
    catalog(type).sightTiles +
    sightBonusTilesOf(type) +
    extra +
    Math.max(0, elev) * HEIGHT_SIGHT_BONUS
  );
}

function usesInfantrySight(type: EntityType): boolean {
  return isInfantryType(type) || catalog(type).kind === "building";
}

/** Extra observer height used only for terrain LOS. */
export function observerEyeOf(type: EntityType): number {
  return usesInfantrySight(type) ? INFANTRY_EYE_HEIGHT : 0;
}

/** Extra Chebyshev reach per elevation step of a looked-at tile above the observer. */
export function uphillSightOf(type: EntityType): number {
  return usesInfantrySight(type) ? INFANTRY_UPHILL_SIGHT : 0;
}

export function rangeTilesOf(type: EntityType, elev: number, extraSight = 0): number {
  if (catalog(type).rangeTiles <= 0) return 0;
  return weaponRangeTiles(sightTilesOf(type, elev, extraSight));
}

/** Live fog radius: height, garrison watch/hide, catalog optics. */
export function sightTilesForEntity(state: MatchState, e: Entity): number {
  if (e.garrisonedIn != null) {
    const house = state.entities.get(e.garrisonedIn);
    if (house?.garrisonHide) return GARRISON_HIDE_SIGHT;
    if (house) return sightTilesOf(e.type, entityHeight(state, e)) + GARRISON_WATCH_SIGHT_BONUS;
  }
  return sightTilesOf(e.type, entityHeight(state, e));
}

export function weaponRangeWorld(state: MatchState, e: Entity): number {
  if (isInfantryType(e.type) && hasCrit(e, "arm")) return HANDGUN.rangeTiles * state.tileSize;
  if (catalog(e.type).rangeTiles <= 0) return 0;
  return weaponRangeTiles(sightTilesForEntity(state, e)) * state.tileSize;
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
  observerEye = 0,
): boolean {
  if (x0 === x1 && y0 === y1) return true;
  const h0 = elevAt(elev, width, height, x0, y0) + Math.max(0, observerEye);
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

export interface CoverField {
  terrain: ArrayLike<number>;
  occupy: ArrayLike<number>;
  ignoreOccupyId?: number;
  /** 1 when the tile is inside a smoke screen. Preferred over `smokeAt`. */
  smoke?: ArrayLike<number>;
  /** True when this tile is inside a smoke screen. */
  smokeAt?: (x: number, y: number) => boolean;
}

export function coverSmokeAt(
  cover: CoverField,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (cover.smoke) {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return (cover.smoke[y * width + x] ?? 0) !== 0;
  }
  return !!cover.smokeAt?.(x, y);
}

/**
 * Elevation ridges plus map cover. Trees eat a see-through budget;
 * walls and buildings stop the ray outright. Water does not block.
 */
export function hasFullLos(
  elev: ArrayLike<number>,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cover?: CoverField,
  observerEye = 0,
): boolean {
  if (x0 === x1 && y0 === y1) return true;
  const h0 = elevAt(elev, width, height, x0, y0) + Math.max(0, observerEye);
  const h1 = elevAt(elev, width, height, x1, y1);
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const cap = dx + dy + 2;
  let trees = 0;
  const ignore = cover?.ignoreOccupyId ?? 0;
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
      if (blocksLos(elev, width, height, x - sx, y, x0, y0, x1, y1, h0, h1)) return false;
      if (blocksLos(elev, width, height, x, y - sy, x0, y0, x1, y1, h0, h1)) return false;
    }
    if (blocksLos(elev, width, height, x, y, x0, y0, x1, y1, h0, h1)) return false;
    if (!cover) continue;
    if (x === x1 && y === y1) return true;
    if (hardCoverAt(cover.terrain, cover.occupy, width, height, x, y, ignore)) return false;
    if (coverSmokeAt(cover, width, height, x, y)) return false;
    if (x >= 0 && y >= 0 && x < width && y < height && cover.terrain[y * width + x] === TILE_TREE) {
      trees += 1;
      if (trees > TREE_LOS_THROUGH) return false;
    }
  }
  return true;
}
