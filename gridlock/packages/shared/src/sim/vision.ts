import {
  FOV_ISLAND_LIMIT,
  GARRISON_HIDE_SIGHT,
  GARRISON_WATCH_SIGHT_BONUS,
  HEIGHT_MAX,
  SMOKE_PEEK_TILES,
  catalog,
  entityIsScouting,
  isArmoredType,
} from "../catalog.js";
import type { EntityView, MatchSnapshot } from "../protocol.js";
import { getMap, TILE_EMPTY, TILE_TREE } from "../maps.js";
import {
  coverSmokeAt,
  hasFullLos,
  observerEyeForEntity,
  levelSightExtra,
  sightTilesForEntity,
  sightTilesOf,
  uphillSightForEntity,
  type CoverField,
} from "./elevation.js";
import { allies, chebyshev, fillHullCover, footprint, inBounds, worldToTile } from "./geo.js";
import { occupantSightTiles } from "./garrison.js";
import { fillSmokeMask } from "./smoke.js";
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
  /** Override catalog sight. Used for garrison watch / hide / hatch scout. */
  sightTiles?: number;
  observerEye?: number;
  uphillSight?: number;
  scoutOut?: boolean;
  scoutHp?: number;
};

const FOV_N8: readonly [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const FOV_SEEN_CLEAR = 0;
const FOV_SEEN_SMALL = 1;
const FOV_SEEN_LARGE = 2;

let fovSeen = new Uint8Array(0);
let fovStack = new Uint32Array(0);
let fovSmall = new Uint32Array(0);

function ensureFovScratch(tiles: number, limit: number): void {
  if (fovSeen.length < tiles) {
    fovSeen = new Uint8Array(tiles);
    fovStack = new Uint32Array(tiles);
  }
  if (fovSmall.length < limit + 1) fovSmall = new Uint32Array(limit + 1);
}

/** Fill unseen islands, then hide visible ones, of `limit` tiles or fewer. */
export function sealFovIslands(
  mask: Uint8Array,
  width: number,
  height: number,
  limit = FOV_ISLAND_LIMIT,
): void {
  if (limit <= 0) return;
  const tiles = width * height;
  ensureFovScratch(tiles, limit);
  recolorSmallIslands(mask, width, height, tiles, 0, 1, limit);
  recolorSmallIslands(mask, width, height, tiles, 1, 0, limit);
}

function touchesOther(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  from: number,
): boolean {
  for (const [dx, dy] of FOV_N8) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (mask[ny * width + nx] !== from) return true;
  }
  return false;
}

function recolorSmallIslands(
  mask: Uint8Array,
  width: number,
  height: number,
  tiles: number,
  from: number,
  to: number,
  limit: number,
): void {
  const seen = fovSeen;
  const stack = fovStack;
  const small = fovSmall;
  seen.fill(FOV_SEEN_CLEAR, 0, tiles);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (seen[start] !== FOV_SEEN_CLEAR || mask[start] !== from) continue;
      if (!touchesOther(mask, width, height, x, y, from)) continue;
      seen[start] = FOV_SEEN_SMALL;
      stack[0] = start;
      let nStack = 1;
      let nSmall = 0;
      let large = false;
      while (nStack > 0) {
        const cur = stack[--nStack]!;
        if (large) {
          seen[cur] = FOV_SEEN_LARGE;
          continue;
        }
        small[nSmall++] = cur;
        if (nSmall > limit) {
          large = true;
          seen[cur] = FOV_SEEN_LARGE;
          continue;
        }
        const cx = cur % width;
        const cy = (cur / width) | 0;
        for (const [dx, dy] of FOV_N8) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (mask[ni] !== from) continue;
          const mark = seen[ni];
          if (mark === FOV_SEEN_LARGE) {
            large = true;
            break;
          }
          if (mark !== FOV_SEEN_CLEAR) continue;
          seen[ni] = FOV_SEEN_SMALL;
          stack[nStack++] = ni;
        }
      }
      if (large) {
        for (let i = 0; i < nSmall && i <= limit; i++) seen[small[i]!] = FOV_SEEN_LARGE;
        continue;
      }
      for (let i = 0; i < nSmall; i++) mask[small[i]!] = to;
    }
  }
}

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
  const ignore = coverIgnoreId(e);
  if (cover) cover.ignoreOccupyId = ignore;
  if (e.kind === "building") {
    let maxH = 0;
    for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
      for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        mask[y * width + x] = 1;
        if (elev) {
          const h = elev[y * width + x] ?? 0;
          if (h > maxH) maxH = h;
        }
      }
    }
    const cx = e.tileX + Math.floor(e.tileW / 2);
    const cy = e.tileY + Math.floor(e.tileH / 2);
    paintSight(
      mask,
      width,
      height,
      cx,
      cy,
      e.sightTiles ?? sightTilesOf(e.type, maxH),
      elev,
      cover,
      e.observerEye ?? observerEyeForEntity(e),
      e.uphillSight ?? uphillSightForEntity(e),
    );
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
    e.sightTiles ?? (entityIsScouting(e) ? sightTilesOf("trooper", h) : sightTilesOf(e.type, h)),
    elev,
    cover,
    e.observerEye ?? observerEyeForEntity(e),
    e.uphillSight ?? uphillSightForEntity(e),
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
  const h0 = elevAtSafe(elev, width, height, ox, oy);
  const maxR = radius + (uphillBonus > 0 ? HEIGHT_MAX * uphillBonus : 0);
  paintSightBox(mask, width, height, ox, oy, radius, 0, radius, elev, cover, observerEye, 0, h0);
  if (maxR > radius) {
    paintSightBox(mask, width, height, ox, oy, maxR, radius, radius, elev, cover, observerEye, uphillBonus, h0);
  }
}

function paintSightBox(
  mask: Uint8Array,
  width: number,
  height: number,
  ox: number,
  oy: number,
  boxR: number,
  minD: number,
  catalogR: number,
  elev: ArrayLike<number>,
  cover: CoverField | undefined,
  observerEye: number,
  uphillBonus: number,
  h0: number,
): void {
  const x0 = Math.max(0, ox - boxR);
  const x1 = Math.min(width - 1, ox + boxR);
  const y0 = Math.max(0, oy - boxR);
  const y1 = Math.min(height - 1, oy + boxR);
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      if (mask[row + x]) continue;
      const d = chebyshev(x, y, ox, oy);
      if (d > boxR || d < minD) continue;
      const extra = levelSightExtra(h0, elevAtSafe(elev, width, height, x, y), uphillBonus);
      if (d > catalogR + extra) continue;
      if (!hasFullLos(elev, width, height, ox, oy, x, y, cover, observerEye)) continue;
      if (cover && coverSmokeAt(cover, width, height, x, y) && d > SMOKE_PEEK_TILES) continue;
      mask[row + x] = 1;
    }
  }
}

function coverIgnoreId(e: { kind: string; id?: number; garrisonedIn?: number | null }): number {
  if (e.kind === "building") return e.id ?? 0;
  return e.garrisonedIn ?? e.id ?? 0;
}

function coverOf(state: MatchState): CoverField {
  const n = state.width * state.height;
  if (state.hullMask.length !== n) state.hullMask = new Int32Array(n);
  fillHullCover(state.entities.values(), state.tileSize, state.width, state.height, state.hullMask);
  return {
    terrain: state.terrain,
    occupy: state.occupy,
    hull: state.hullMask,
    smoke: ensureSmokeMask(state),
  };
}

function ensureSmokeMask(state: MatchState): Uint8Array {
  const n = state.width * state.height;
  if (state.smokeMask.length !== n) {
    state.smokeMask = new Uint8Array(n);
    state.smokeMaskTick = -1;
  }
  if (state.smokeMaskTick === state.tick) return state.smokeMask;
  fillSmokeMask(state.smokeClouds, state.tileSize, state.width, state.height, state.smokeMask);
  state.smokeMaskTick = state.tick;
  return state.smokeMask;
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v | 0), 16777619);
}

function visionKey(state: MatchState, playerId: string): number {
  let h = 2166136261;
  h = mix(h, state.clearedTrees.length);
  for (const e of state.entities.values()) {
    if (e.hp <= 0) continue;
    if (e.kind === "unit" && isArmoredType(e.type)) {
      h = mix(h, e.id);
      h = mix(h, worldToTile(e.x, state.tileSize));
      h = mix(h, worldToTile(e.y, state.tileSize));
    }
    if (e.wreck) continue;
    if (!allies(state, playerId, e.ownerId)) continue;
    h = mix(h, e.id);
    if (e.kind === "building") {
      h = mix(h, e.tileX);
      h = mix(h, e.tileY);
    } else {
      h = mix(h, worldToTile(e.x, state.tileSize));
      h = mix(h, worldToTile(e.y, state.tileSize));
    }
    h = mix(h, e.garrisonedIn ?? 0);
    h = mix(h, e.garrisonHide ? 1 : 0);
    h = mix(h, e.scoutOut && e.scoutHp > 0 ? 1 : 0);
    h = mix(h, occupantSightTiles(state, e) ?? -1);
  }
  for (const c of state.smokeClouds) {
    h = mix(h, c.id);
    h = mix(h, worldToTile(c.x, state.tileSize));
    h = mix(h, worldToTile(c.y, state.tileSize));
    h = mix(h, c.lifeMax > 0 ? ((c.life * 16) / c.lifeMax) | 0 : 0);
  }
  return h;
}

function observerRadius(state: MatchState, e: Entity): number {
  return sightTilesForEntity(state, e);
}

function stampOccupy(
  occupy: Int32Array,
  width: number,
  height: number,
  id: number,
  tileX: number,
  tileY: number,
  tileW: number,
  tileH: number,
): void {
  for (let y = tileY; y < tileY + tileH; y++) {
    for (let x = tileX; x < tileX + tileW; x++) {
      if (x >= 0 && y >= 0 && x < width && y < height) occupy[y * width + x] = id;
    }
  }
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
  const key = visionKey(state, playerId);
  const cached = state.visionByPlayer.get(playerId);
  if (cached && state.visionKeyByPlayer.get(playerId) === key) return cached;
  const mask = new Uint8Array(state.width * state.height);
  const cover = coverOf(state);
  const observers: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) continue;
    if (!allies(state, playerId, e.ownerId)) continue;
    observers.push(e);
  }
  observers.sort((a, b) => observerRadius(state, b) - observerRadius(state, a));
  for (const e of observers) {
    const sightTiles = occupantSightTiles(state, e) ?? (entityIsScouting(e) ? sightTilesForEntity(state, e) : undefined);
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
  sealFovIslands(mask, state.width, state.height);
  state.visionByPlayer.set(playerId, mask);
  state.visionKeyByPlayer.set(playerId, key);
  state.visionTick = state.tick;
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
  const hull = new Int32Array(width * height);
  if (map) {
    let featureId = -1;
    for (const f of map.features ?? []) {
      const def = catalog(f.type);
      stampOccupy(occupy, width, height, featureId--, f.x, f.y, def.tileW, def.tileH);
    }
    for (const e of snap.entities) {
      if (e.hp <= 0) continue;
      if (e.kind === "building" || e.wreck) {
        stampOccupy(occupy, width, height, e.id, e.tileX, e.tileY, e.tileW, e.tileH);
      }
    }
    fillHullCover(snap.entities, tileSize, width, height, hull);
  }
  let smoke: Uint8Array | undefined;
  const clouds = snap.smoke ?? [];
  if (map && clouds.length > 0) {
    smoke = new Uint8Array(width * height);
    fillSmokeMask(clouds, tileSize, width, height, smoke);
  }
  const cover: CoverField | undefined = map
    ? {
        terrain: coverTerrainFromSnapshot(map.tiles, width, height, snap.clearedTrees),
        occupy,
        hull,
        smoke,
      }
    : undefined;
  const allied: EntityView[] = [];
  for (const e of snap.entities) {
    if (e.wreck) continue;
    const friend = e.ownerId === you || (team !== 0 && snap.players.find((p) => p.playerId === e.ownerId)?.team === team);
    if (!friend) continue;
    allied.push(e);
  }
  allied.sort(
    (a, b) =>
      catalogSight(b, elev, width, height, tileSize) - catalogSight(a, elev, width, height, tileSize),
  );
  for (const e of allied) {
    const sightTiles = snapshotSightTiles(snap, e, elev, width, height, tileSize);
    paintEntitySight(mask, width, height, tileSize, sightTiles != null ? { ...e, sightTiles } : e, elev, cover);
  }
  sealFovIslands(mask, width, height);
  return mask;
}

function catalogSight(
  e: EntityView,
  elev: ArrayLike<number> | undefined,
  width: number,
  height: number,
  tileSize: number,
): number {
  const tx = e.kind === "building" ? e.tileX + Math.floor(e.tileW / 2) : worldToTile(e.x, tileSize);
  const ty = e.kind === "building" ? e.tileY + Math.floor(e.tileH / 2) : worldToTile(e.y, tileSize);
  const h = elev ? elevAtSafe(elev, width, height, tx, ty) : 0;
  if (e.scout?.out) return sightTilesOf("trooper", h);
  return sightTilesOf(e.type, h);
}

function snapshotSightTiles(
  snap: MatchSnapshot,
  e: EntityView,
  elev: ArrayLike<number> | undefined,
  width: number,
  height: number,
  tileSize: number,
): number | undefined {
  const occupant = snapshotOccupantSight(snap, e, elev, width, height, tileSize);
  if (occupant != null) return occupant;
  if (!e.scout?.out) return undefined;
  const tx = worldToTile(e.x, tileSize);
  const ty = worldToTile(e.y, tileSize);
  const h = elev ? elevAtSafe(elev, width, height, tx, ty) : 0;
  return sightTilesOf("trooper", h);
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
  if (mask) return entityOnMask(e, mask, state.width, state.height, state.tileSize);
  return entityVisibleToPlayer(state, playerId, e);
}

function entityVisibleToPlayer(state: MatchState, playerId: string, e: Entity): boolean {
  if (FOV_ISLAND_LIMIT > 0) {
    return entityOnMask(e, visionMask(state, playerId), state.width, state.height, state.tileSize);
  }
  if (state.seeTick !== state.tick) {
    state.seeByPlayer.clear();
    state.seeTick = state.tick;
  }
  let cache = state.seeByPlayer.get(playerId);
  if (!cache) {
    cache = new Map();
    state.seeByPlayer.set(playerId, cache);
  }
  const hit = cache.get(e.id);
  if (hit !== undefined) return hit;
  const vis = observersSeeEntity(state, playerId, e);
  cache.set(e.id, vis);
  return vis;
}

function observersSeeEntity(state: MatchState, playerId: string, e: Entity): boolean {
  const cover = coverOf(state);
  if (e.kind === "building") {
    for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
      for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        if (tileVisibleToAllies(state, playerId, x, y, cover)) return true;
      }
    }
    return false;
  }
  return tileVisibleToAllies(
    state,
    playerId,
    worldToTile(e.x, state.tileSize),
    worldToTile(e.y, state.tileSize),
    cover,
  );
}

function tileVisibleToAllies(
  state: MatchState,
  playerId: string,
  tx: number,
  ty: number,
  cover: CoverField,
): boolean {
  for (const obs of state.entities.values()) {
    if (obs.hp <= 0 || obs.wreck) continue;
    if (!allies(state, playerId, obs.ownerId)) continue;
    if (observerSeesTile(state, obs, tx, ty, cover)) return true;
  }
  return false;
}

function observerSeesTile(
  state: MatchState,
  obs: Entity,
  tx: number,
  ty: number,
  cover: CoverField,
): boolean {
  const width = state.width;
  const height = state.height;
  const elev = state.heights;
  const ignore = coverIgnoreId(obs);
  cover.ignoreOccupyId = ignore;
  if (obs.kind === "building") {
    if (
      tx >= obs.tileX &&
      ty >= obs.tileY &&
      tx < obs.tileX + obs.tileW &&
      ty < obs.tileY + obs.tileH
    ) {
      return true;
    }
    let maxH = 0;
    for (let y = obs.tileY; y < obs.tileY + obs.tileH; y++) {
      for (let x = obs.tileX; x < obs.tileX + obs.tileW; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const h = elev[y * width + x] ?? 0;
        if (h > maxH) maxH = h;
      }
    }
    const ox = obs.tileX + Math.floor(obs.tileW / 2);
    const oy = obs.tileY + Math.floor(obs.tileH / 2);
    const radius = occupantSightTiles(state, obs) ?? sightTilesOf(obs.type, maxH);
    return tileInSight(
      tx,
      ty,
      ox,
      oy,
      radius,
      width,
      height,
      elev,
      cover,
      observerEyeForEntity(obs),
      uphillSightForEntity(obs),
    );
  }
  const ox = worldToTile(obs.x, state.tileSize);
  const oy = worldToTile(obs.y, state.tileSize);
  const h = elevAtSafe(elev, width, height, ox, oy);
  const radius = occupantSightTiles(state, obs) ?? (entityIsScouting(obs) ? sightTilesOf("trooper", h) : sightTilesOf(obs.type, h));
  return tileInSight(
    tx,
    ty,
    ox,
    oy,
    radius,
    width,
    height,
    elev,
    cover,
    observerEyeForEntity(obs),
    uphillSightForEntity(obs),
  );
}

function tileInSight(
  tx: number,
  ty: number,
  ox: number,
  oy: number,
  radius: number,
  width: number,
  height: number,
  elev: ArrayLike<number>,
  cover: CoverField | undefined,
  observerEye: number,
  uphillBonus: number,
): boolean {
  if (radius <= 0) return ox === tx && oy === ty;
  const d = chebyshev(tx, ty, ox, oy);
  const h0 = elevAtSafe(elev, width, height, ox, oy);
  const extra = levelSightExtra(h0, elevAtSafe(elev, width, height, tx, ty), uphillBonus);
  if (d > radius + extra) return false;
  if (!hasFullLos(elev, width, height, ox, oy, tx, ty, cover, observerEye)) return false;
  if (cover && coverSmokeAt(cover, width, height, tx, ty) && d > SMOKE_PEEK_TILES) return false;
  return true;
}

export function canSeeWorld(state: MatchState, mask: Uint8Array, wx: number, wy: number): boolean {
  const tx = worldToTile(wx, state.tileSize);
  const ty = worldToTile(wy, state.tileSize);
  if (!inBounds(state, tx, ty)) return false;
  return tileOnMask(mask, state.width, tx, ty);
}
