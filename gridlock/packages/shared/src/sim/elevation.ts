import {
  DRONE_STRIKE_ALT,
  DRONE_SURVEIL_ALT,
  DRONE_SURVEIL_SIGHT_BONUS,
  GARRISON_HIDE_SIGHT,
  GARRISON_WATCH_SIGHT_BONUS,
  HEIGHT_BASE,
  HEIGHT_DOWNHILL_COST,
  HEIGHT_DOWNHILL_SPEED,
  HEIGHT_RANGE_BONUS,
  HEIGHT_SIGHT_BONUS,
  HEIGHT_STEP_MAX,
  HEIGHT_UPHILL_COST,
  HEIGHT_UPHILL_SPEED,
  HEIGHT_WORLD,
  HULL_EYE_HEIGHT,
  HULL_LEVEL_SIGHT,
  INFANTRY_EYE_HEIGHT,
  INFANTRY_UPHILL_SIGHT,
  LOS_TERRAIN_SLACK,
  TANK_GUN_CLIMB,
  TANK_GUN_ELEV_DEG,
  TREE_LOS_THROUGH,
  catalog,
  coverHeightOf,
  entityIsScouting,
  infantryGunFor,
  isDroneType,
  isInfantryType,
  sightBonusTilesOf,
  type EntityType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_TREE } from "../maps.js";
import { inBounds, tileIndex, worldToTile } from "./geo.js";
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

/** Muzzle / eye height in elevation units. */
export function muzzleHeight(state: MatchState, e: Entity): number {
  if (e.garrisonedIn != null) {
    const house = state.entities.get(e.garrisonedIn);
    if (house) return entityHeight(state, house) + coverHeightOf(house.type) * 0.6;
  }
  return entityHeight(state, e) + observerEyeForEntity(e);
}

/** Elevation units a plane flies above the ground. 0 on the pad and for every ground type. */
export function airAlt(e: { air?: { alt: number } }): number {
  return e.air && e.air.alt > 0 ? e.air.alt : 0;
}

/**
 * Extra sight a drone gains with height: none at Search & Destroy height,
 * DRONE_SURVEIL_SIGHT_BONUS at Surveillance height. Zero for every other type.
 */
export function droneSightExtra(e: { type: EntityType; air?: { alt: number } }): number {
  if (!isDroneType(e.type)) return 0;
  const u = (airAlt(e) - DRONE_STRIKE_ALT) / (DRONE_SURVEIL_ALT - DRONE_STRIKE_ALT);
  return Math.round(Math.max(0, Math.min(1, u)) * DRONE_SURVEIL_SIGHT_BONUS);
}

/** Aim height: mid-mass of the target so a descending shot still meets it. A plane is aimed at where it flies. */
export function aimHeight(state: MatchState, e: Entity): number {
  return entityHeight(state, e) + airAlt(e) + coverHeightOf(e.type) * 0.45;
}

/** True when the round is above the solid top of this cover. */
export function shotClearsCover(shotZ: number, groundH: number, coverH: number): boolean {
  return shotZ > groundH + coverH;
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
    Math.max(0, elev - HEIGHT_BASE) * HEIGHT_SIGHT_BONUS
  );
}

function usesInfantrySight(type: EntityType): boolean {
  return isInfantryType(type) || catalog(type).kind === "building";
}

/** Extra observer height used only for terrain LOS. */
export function observerEyeOf(type: EntityType): number {
  return usesInfantrySight(type) ? INFANTRY_EYE_HEIGHT : HULL_EYE_HEIGHT;
}

/** Extra Chebyshev reach per elevation step between observer and tile (up or down). */
export function uphillSightOf(type: EntityType): number {
  return usesInfantrySight(type) ? INFANTRY_UPHILL_SIGHT : HULL_LEVEL_SIGHT;
}

/** Extra fog tiles from a per-step bonus across an elevation delta. */
export function levelSightExtra(fromH: number, toH: number, perStep: number): number {
  if (perStep <= 0) return 0;
  return Math.abs(toH - fromH) * perStep;
}

export function observerEyeForEntity(e: {
  type: EntityType;
  scoutOut?: boolean;
  scoutHp?: number;
  air?: { alt: number };
}): number {
  const alt = airAlt(e);
  if (alt > 0) return HULL_EYE_HEIGHT + alt;
  return entityIsScouting(e) ? INFANTRY_EYE_HEIGHT : observerEyeOf(e.type);
}

export function uphillSightForEntity(e: { type: EntityType; scoutOut?: boolean; scoutHp?: number }): number {
  return entityIsScouting(e) ? INFANTRY_UPHILL_SIGHT : uphillSightOf(e.type);
}

/**
 * Flat catalog reach, or `baseTiles` when the live gun is shorter (handgun),
 * plus a step of HEIGHT_RANGE_BONUS above the plain. Optics do not extend it.
 */
export function rangeTilesOf(type: EntityType, elev: number, baseTiles?: number): number {
  const base = baseTiles ?? catalog(type).rangeTiles;
  if (base <= 0) return 0;
  return base + Math.max(0, elev - HEIGHT_BASE) * HEIGHT_RANGE_BONUS;
}

/** Live fog radius: height, garrison watch/hide, hatch scout, catalog optics. */
export function sightTilesForEntity(state: MatchState, e: Entity): number {
  if (e.garrisonedIn != null) {
    const house = state.entities.get(e.garrisonedIn);
    // A truck bed is not a window. Riders keep the sight they walked in with.
    if (house && house.type !== "supply") {
      if (house.garrisonHide) return GARRISON_HIDE_SIGHT;
      return sightTilesOf(e.type, entityHeight(state, e)) + GARRISON_WATCH_SIGHT_BONUS;
    }
  }
  if (entityIsScouting(e)) return sightTilesOf("rifleman", entityHeight(state, e));
  return sightTilesOf(e.type, entityHeight(state, e), droneSightExtra(e));
}

export function weaponRangeWorld(state: MatchState, e: Entity): number {
  const host = e.garrisonedIn != null ? state.entities.get(e.garrisonedIn) : undefined;
  const inHouse = !!host && host.type !== "supply";
  if (inHouse && host.garrisonHide) return GARRISON_HIDE_SIGHT * state.tileSize;
  const gun = infantryGunFor(e);
  const base = gun?.rangeTiles ?? catalog(e.type).rangeTiles;
  if (base <= 0) return 0;
  let tiles = rangeTilesOf(e.type, entityHeight(state, e), base);
  if (inHouse && !host.garrisonHide) tiles += GARRISON_WATCH_SIGHT_BONUS;
  return tiles * state.tileSize;
}

const TANK_GUN_ELEV_TAN = Math.tan((TANK_GUN_ELEV_DEG * Math.PI) / 180);

/**
 * Tank guns cannot crank up a steep lip. Level and downhill are always
 * allowed — a hilltop with a clear view still engages.
 */
export function gunCanElevate(fromH: number, toH: number, distWorld: number): boolean {
  const dh = toH - fromH;
  if (dh <= TANK_GUN_CLIMB) return true;
  if (distWorld <= 1e-6) return false;
  return dh * HEIGHT_WORLD <= distWorld * TANK_GUN_ELEV_TAN;
}

/** Infantry aim freely. Armed hulls (turret or casemate) use gunCanElevate. */
export function canAimWeapon(
  state: MatchState,
  shooter: Entity,
  aimX: number,
  aimY: number,
  target?: Entity,
): boolean {
  if (isInfantryType(shooter.type) || catalog(shooter.type).rangeTiles <= 0) return true;
  const fromH = entityHeight(state, shooter);
  const toH = target ? entityHeight(state, target) : worldTileHeight(state, aimX, aimY);
  return gunCanElevate(fromH, toH, Math.hypot(aimX - shooter.x, aimY - shooter.y));
}

/**
 * A tile blocks when it rises through the sight line from the observer's
 * eye to the destination ground by more than LOS_TERRAIN_SLACK. Descending
 * or level ground never occludes — a hilltop sees its own slope, including
 * terrace lips. A closer ridge still hides a farther peak even if that peak
 * is taller. Modest rolls stay open; a deep valley still hides.
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
    const px = x;
    const py = y;
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
    const prevH = elevAt(elev, width, height, px, py);
    if (steppedX && steppedY) {
      if (blocksLos(elev, width, height, x - sx, y, x0, y0, x1, y1, h0, h1, prevH)) return false;
      if (blocksLos(elev, width, height, x, y - sy, x0, y0, x1, y1, h0, h1, prevH)) return false;
    }
    if (blocksLos(elev, width, height, x, y, x0, y0, x1, y1, h0, h1, prevH)) return false;
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
  prevH: number,
): boolean {
  if (x === x0 && y === y0) return false;
  if (x === x1 && y === y1) return false;
  const h = elevAt(elev, width, height, x, y);
  if (h <= prevH) return false;
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const len2 = spanX * spanX + spanY * spanY;
  const t = len2 <= 0 ? 1 : ((x - x0) * spanX + (y - y0) * spanY) / len2;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const rayH = h0 + (h1 - h0) * clamped;
  return h > rayH + LOS_TERRAIN_SLACK;
}

export interface CoverField {
  terrain: ArrayLike<number>;
  occupy: ArrayLike<number>;
  ignoreOccupyId?: number;
  /** Armored hull id on a tile (LOS only). 0 = none. */
  hull?: ArrayLike<number>;
  /** 1 when the tile is inside a smoke screen. Preferred over `smokeAt`. */
  smoke?: ArrayLike<number>;
  /** True when this tile is inside a smoke screen. */
  smokeAt?: (x: number, y: number) => boolean;
  /** `fillLosFlags` of this cover, when the caller built one. */
  losFlags?: Uint8Array;
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

function hullIdAt(
  hull: ArrayLike<number> | undefined,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (!hull || x < 0 || y < 0 || x >= width || y >= height) return 0;
  return hull[y * width + x] ?? 0;
}

/**
 * Elevation ridges plus map cover. Trees eat a see-through budget;
 * walls, buildings, and armored hulls stop the ray outright. Water does not block.
 * Diagonal steps also test the two corner tiles so a building cannot be skipped.
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
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const len2 = spanX * spanX + spanY * spanY;
  const dh = h1 - h0;
  const terrain = cover ? cover.terrain : null;
  const occupy = cover ? cover.occupy : null;
  const hull = cover?.hull;
  const smoke = cover?.smoke;
  const smokeAt = smoke ? undefined : cover?.smokeAt;
  const ignore = cover?.ignoreOccupyId ?? 0;
  const destHull = hullIdAt(hull, width, height, x1, y1);
  const dx = Math.abs(spanX);
  const dy = Math.abs(spanY);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  let trees = 0;
  const cap = dx + dy + 2;
  for (let n = 0; n < cap; n++) {
    if (x === x1 && y === y1) return true;
    const prevH = x >= 0 && y >= 0 && x < width && y < height ? (elev[y * width + x] ?? 0) : 0;
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
      if (losTileBlocks(elev, terrain, occupy, hull, smoke, smokeAt, width, height, x - sx, y, x0, y0, x1, y1, spanX, spanY, len2, h0, dh, prevH, ignore, destHull)) return false;
      if (losTileBlocks(elev, terrain, occupy, hull, smoke, smokeAt, width, height, x, y - sy, x0, y0, x1, y1, spanX, spanY, len2, h0, dh, prevH, ignore, destHull)) return false;
    }
    if (losTileBlocks(elev, terrain, occupy, hull, smoke, smokeAt, width, height, x, y, x0, y0, x1, y1, spanX, spanY, len2, h0, dh, prevH, ignore, destHull)) return false;
    if (!terrain || (x === x1 && y === y1)) continue;
    if (terrain[y * width + x] === TILE_TREE) {
      trees += 1;
      if (trees > TREE_LOS_THROUGH) return false;
    }
  }
  return true;
}

/** `fillLosFlags` bit: something on the tile may stop a ray. */
const LOS_FLAG_COVER = 1;
/** `fillLosFlags` bit: a tree that spends the see-through budget. */
const LOS_FLAG_TREE = 2;

/** Per-tile blockers for `hasFullLosFlagged`. Rebuild whenever cover changes. */
export function fillLosFlags(cover: CoverField, out: Uint8Array): void {
  const { terrain, occupy, hull, smoke } = cover;
  for (let i = 0; i < out.length; i++) {
    const tile = terrain[i];
    let f = tile === TILE_TREE ? LOS_FLAG_TREE : 0;
    if (
      tile === TILE_BLOCKED ||
      (occupy[i] ?? 0) !== 0 ||
      (hull ? (hull[i] ?? 0) !== 0 : false) ||
      (smoke ? (smoke[i] ?? 0) !== 0 : false)
    ) {
      f |= LOS_FLAG_COVER;
    }
    out[i] = f;
  }
}

/**
 * `hasFullLos` with smoke as a mask and both ends on the map, so every
 * tile the ray visits is on the map too. `flags` comes from `fillLosFlags`.
 */
export function hasFullLosFlagged(
  elev: Uint8Array,
  flags: Uint8Array,
  cover: CoverField,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  observerEye: number,
): boolean {
  if (x0 === x1 && y0 === y1) return true;
  const terrain = cover.terrain;
  const occupy = cover.occupy;
  const hull = cover.hull;
  const smoke = cover.smoke;
  const ignore = cover.ignoreOccupyId ?? 0;
  const iStart = y0 * width + x0;
  const iEnd = y1 * width + x1;
  let prevH = elev[iStart]!;
  const h0 = prevH + Math.max(0, observerEye);
  const dh = elev[iEnd]! - h0;
  const destHull = hull ? (hull[iEnd] ?? 0) : 0;
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const len2 = spanX * spanX + spanY * spanY;
  const dx = Math.abs(spanX);
  const dy = Math.abs(spanY);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  let trees = 0;
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
      const ia = y * width + cx;
      if (ia !== iStart && ia !== iEnd) {
        const h = elev[ia]!;
        if (h > prevH && losRises(cx, y, h, x0, y0, spanX, spanY, len2, h0, dh)) return false;
        if (flags[ia]! & LOS_FLAG_COVER && losCoverStops(terrain, occupy, hull, smoke, ia, ignore, destHull)) return false;
      }
      const cy = y - sy;
      const ib = cy * width + x;
      if (ib !== iStart && ib !== iEnd) {
        const h = elev[ib]!;
        if (h > prevH && losRises(x, cy, h, x0, y0, spanX, spanY, len2, h0, dh)) return false;
        if (flags[ib]! & LOS_FLAG_COVER && losCoverStops(terrain, occupy, hull, smoke, ib, ignore, destHull)) return false;
      }
    }
    const i = y * width + x;
    if (i === iEnd) return true;
    const h = elev[i]!;
    if (h > prevH && losRises(x, y, h, x0, y0, spanX, spanY, len2, h0, dh)) return false;
    const f = flags[i]!;
    if (f & LOS_FLAG_COVER && losCoverStops(terrain, occupy, hull, smoke, i, ignore, destHull)) return false;
    if (f & LOS_FLAG_TREE && ++trees > TREE_LOS_THROUGH) return false;
    prevH = h;
  }
  return true;
}

function losCoverStops(
  terrain: ArrayLike<number>,
  occupy: ArrayLike<number>,
  hull: ArrayLike<number> | undefined,
  smoke: ArrayLike<number> | undefined,
  i: number,
  ignore: number,
  destHull: number,
): boolean {
  if (terrain[i] === TILE_BLOCKED) return true;
  const occ = occupy[i] ?? 0;
  if (occ !== 0 && occ !== ignore) return true;
  if (hull) {
    const hid = hull[i] ?? 0;
    if (hid !== 0 && hid !== ignore && hid !== destHull) return true;
  }
  return !!smoke && (smoke[i] ?? 0) !== 0;
}

function losRises(
  tx: number,
  ty: number,
  h: number,
  x0: number,
  y0: number,
  spanX: number,
  spanY: number,
  len2: number,
  h0: number,
  dh: number,
): boolean {
  const t = ((tx - x0) * spanX + (ty - y0) * spanY) / len2;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return h > h0 + dh * clamped + LOS_TERRAIN_SLACK;
}

/**
 * One tile on a sight ray, endpoints excluded: ground rising through the line,
 * then map cover. Off the map counts as hard cover when cover is given.
 */
function losTileBlocks(
  elev: ArrayLike<number>,
  terrain: ArrayLike<number> | null,
  occupy: ArrayLike<number> | null,
  hull: ArrayLike<number> | undefined,
  smoke: ArrayLike<number> | undefined,
  smokeAt: ((x: number, y: number) => boolean) | undefined,
  width: number,
  height: number,
  tx: number,
  ty: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  spanX: number,
  spanY: number,
  len2: number,
  h0: number,
  dh: number,
  prevH: number,
  ignore: number,
  destHull: number,
): boolean {
  if ((tx === x0 && ty === y0) || (tx === x1 && ty === y1)) return false;
  const inside = tx >= 0 && ty >= 0 && tx < width && ty < height;
  const i = ty * width + tx;
  const h = inside ? (elev[i] ?? 0) : 0;
  if (h > prevH) {
    const t = len2 <= 0 ? 1 : ((tx - x0) * spanX + (ty - y0) * spanY) / len2;
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    if (h > h0 + dh * clamped + LOS_TERRAIN_SLACK) return true;
  }
  if (!terrain || !occupy) return false;
  if (!inside) return true;
  if (terrain[i] === TILE_BLOCKED) return true;
  const occ = occupy[i] ?? 0;
  if (occ !== 0 && occ !== ignore) return true;
  if (hull) {
    const hid = hull[i] ?? 0;
    if (hid !== 0 && hid !== ignore && hid !== destHull) return true;
  }
  if (smoke) return (smoke[i] ?? 0) !== 0;
  return !!smokeAt?.(tx, ty);
}
