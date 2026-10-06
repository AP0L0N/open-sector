import { buildingTilesOf, isTurnedBuilding } from "../building-rect.js";
import {
  FOV_ISLAND_LIMIT,
  GARRISON_HIDE_SIGHT,
  garrisonSightBonusOf,
  HEIGHT_MAX,
  SMOKE_PEEK_TILES,
  HEADLIGHT_HALF_DEG,
  SPOTLIGHT_HALF_DEG,
  SPOTLIGHT_REACH_TILES,
  TOWER_EYE_HEIGHT,
  TICK_DT,
  catalog,
  entityIsScouting,
  isArmoredType,
  type Crit,
} from "../catalog.js";
import type { EntityView, MatchSnapshot } from "../protocol.js";
import { featureLotSite, getMap, isMapLine, TILE_EMPTY, TILE_TREE } from "../maps.js";
import {
  coverSmokeAt,
  fillLosFlags,
  hasFullLos,
  hasFullLosFlagged,
  heightsWithDug,
  observerEyeForEntity,
  levelSightExtra,
  liveSightExtra,
  lowPowerSight,
  sightTilesForEntity,
  sightTilesOf,
  uphillSightForEntity,
  type CoverField,
} from "./elevation.js";
import { allies, fillHullCover, footprint, inBounds, worldToTile } from "./geo.js";
import { hiddenSubmarine, sonarSpotted } from "./naval.js";
import { occupantEye, occupantSightTiles } from "./garrison.js";
import { fillSmokeMask, smokeCloudTileBounds } from "./smoke.js";
import {
  hasSpotlight,
  headlightLit,
  hullLamps,
  lampHeading,
  nightSightMul,
  nightTiles,
  spotFacingOf,
  spotlightLit,
  spotlightsOn,
} from "./night.js";
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
  /** Aircraft height. A plane in the air looks down over hills. */
  air?: { alt: number };
  /** Read for a watch tower's lamp. */
  facing?: number;
  spotFacing?: number;
  hp?: number;
  ruined?: boolean;
  wreck?: boolean;
  /** A lamp crit darkens every spotlight on this hull or tower. */
  crits?: readonly Crit[];
  /** A building whose owner is short on power has a dark lamp and shorter sight. */
  unpowered?: boolean;
};

/** Light at the moment sight is painted: how far it carries, whether lamps are lit, and match seconds for lamps that sweep. */
export type SightLight = { mul: number; spots: boolean; sec: number };

const DAYLIGHT: SightLight = { mul: 1, spots: false, sec: 0 };

export function sightLightAt(tick: number): SightLight {
  return { mul: nightSightMul(tick), spots: spotlightsOn(tick), sec: tick * TICK_DT };
}

const SPOT_COS = Math.cos((SPOTLIGHT_HALF_DEG * Math.PI) / 180);
const HEADLIGHT_COS = Math.cos((HEADLIGHT_HALF_DEG * Math.PI) / 180);

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

/** Sight reach in whole tiles, measured round so a sight ring is a circle, not a square. */
export function sightDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.round(Math.hypot(ax - bx, ay - by));
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
      if (sightDist(x, y, ox, oy) <= radius) mask[y * width + x] = 1;
    }
  }
}

/** Everything `paintSight` reads from one observer. Cover and ground are separate. */
type SightParams = {
  ox: number;
  oy: number;
  radius: number;
  eye: number;
  uphill: number;
  ignore: number;
  /** Building footprint, always lit. `fw` is 0 for units. */
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  /** Lamp beam: reach in tiles (0 when dark or none), unit heading, cos of half its width, and the lamp's eye. */
  sr: number;
  sdx: number;
  sdy: number;
  scos: number;
  seye: number;
  /** Mammoth flank lamps, same reach and width as the nose light. Absent on every other eye. */
  flanks?: readonly { dx: number; dy: number }[];
};

type SpotPaint = {
  sr: number;
  sdx: number;
  sdy: number;
  scos: number;
  seye: number;
  flanks?: readonly { dx: number; dy: number }[];
};

const NO_SPOT: SpotPaint = { sr: 0, sdx: 0, sdy: 0, scos: 1, seye: 0 };

/** A held tower's spotlight, or a hull's headlight giving back its daylight sight down the nose. */
function spotOf(e: SightSource, light: SightLight, daySight: number, eye: number): SpotPaint {
  if (!light.spots) return NO_SPOT;
  if (e.kind === "building" || hasSpotlight(e.type)) {
    if (!hasSpotlight(e.type)) return NO_SPOT;
    if (!spotlightLit({ type: e.type, ownerId: e.ownerId, hp: e.hp ?? 1, ruined: e.ruined, wreck: e.wreck, crits: e.crits, unpowered: e.unpowered })) {
      return NO_SPOT;
    }
    const a = lampHeading(spotFacingOf({ facing: e.facing ?? 0, spotFacing: e.spotFacing }));
    return { sr: SPOTLIGHT_REACH_TILES, sdx: Math.cos(a), sdy: Math.sin(a), scos: SPOT_COS, seye: TOWER_EYE_HEIGHT };
  }
  if (!headlightLit(e) || daySight <= 0) return NO_SPOT;
  const facing = e.facing ?? 0;
  const lamps = hullLamps(e.type, e.id ?? 0, light.sec);
  const nose = lampHeading(facing + lamps[0]!.beam);
  const spot: SpotPaint = {
    sr: daySight,
    sdx: Math.cos(nose),
    sdy: Math.sin(nose),
    scos: HEADLIGHT_COS,
    seye: eye,
  };
  if (lamps.length > 1) {
    const flanks: { dx: number; dy: number }[] = [];
    for (let i = 1; i < lamps.length; i++) {
      const a = lampHeading(facing + lamps[i]!.beam);
      flanks.push({ dx: Math.cos(a), dy: Math.sin(a) });
    }
    spot.flanks = flanks;
  }
  return spot;
}

function sightParams(
  e: SightSource,
  width: number,
  height: number,
  tileSize: number,
  elev?: ArrayLike<number>,
  light: SightLight = DAYLIGHT,
): SightParams {
  const ignore = coverIgnoreId(e);
  const eye = e.observerEye ?? observerEyeForEntity(e);
  const uphill = e.uphillSight ?? uphillSightForEntity(e);
  if (e.kind === "building") {
    let maxH = 0;
    if (elev) {
      for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
        for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const h = elev[y * width + x] ?? 0;
          if (h > maxH) maxH = h;
        }
      }
    }
    return {
      ox: e.tileX + Math.floor(e.tileW / 2),
      oy: e.tileY + Math.floor(e.tileH / 2),
      radius: nightTiles(e.sightTiles ?? lowPowerSight(sightTilesOf(e.type, maxH), e.unpowered), light.mul),
      eye,
      uphill,
      ignore,
      fx: e.tileX,
      fy: e.tileY,
      fw: e.tileW,
      fh: e.tileH,
      ...spotOf(e, light, 0, eye),
    };
  }
  const tx = worldToTile(e.x, tileSize);
  const ty = worldToTile(e.y, tileSize);
  const h = elev ? elevAtSafe(elev, width, height, tx, ty) : 0;
  const daySight =
    e.sightTiles ?? (entityIsScouting(e) ? sightTilesOf("rifleman", h) : sightTilesOf(e.type, h, liveSightExtra(e)));
  return {
    ox: tx,
    oy: ty,
    radius: nightTiles(daySight, light.mul),
    eye,
    uphill,
    ignore,
    fx: 0,
    fy: 0,
    fw: 0,
    fh: 0,
    ...spotOf(e, light, daySight, eye),
  };
}

function sameSightParams(a: SightParams, b: SightParams): boolean {
  return (
    a.ox === b.ox &&
    a.oy === b.oy &&
    a.radius === b.radius &&
    a.eye === b.eye &&
    a.uphill === b.uphill &&
    a.ignore === b.ignore &&
    a.fx === b.fx &&
    a.fy === b.fy &&
    a.fw === b.fw &&
    a.fh === b.fh &&
    a.sr === b.sr &&
    a.sdx === b.sdx &&
    a.sdy === b.sdy &&
    a.scos === b.scos &&
    a.seye === b.seye &&
    sameFlanks(a.flanks, b.flanks)
  );
}

function sameFlanks(
  a: readonly { dx: number; dy: number }[] | undefined,
  b: readonly { dx: number; dy: number }[] | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.dx !== b[i]!.dx || a[i]!.dy !== b[i]!.dy) return false;
  }
  return true;
}

/** Chebyshev reach of the box `paintSight` scans, uphill bonus included. */
function sightBoxRadius(p: SightParams, elev: boolean): number {
  let r = 0;
  if (p.radius > 0) r = !elev ? p.radius : p.radius + (p.uphill > 0 ? HEIGHT_MAX * p.uphill : 0);
  return Math.max(r, p.sr);
}

/** One lamp's beam reaches this tile, before line of sight and smoke. */
function inSpotCone(p: SightParams, sdx: number, sdy: number, x: number, y: number): boolean {
  if (p.sr <= 0) return false;
  const d = sightDist(x, y, p.ox, p.oy);
  if (d < 1 || d > p.sr) return false;
  const dx = x - p.ox;
  const dy = y - p.oy;
  return dx * sdx + dy * sdy >= p.scos * Math.hypot(dx, dy);
}

/** Nose lamp, or any Mammoth flank lamp. */
function inAnyLamp(p: SightParams, x: number, y: number): boolean {
  if (inSpotCone(p, p.sdx, p.sdy, x, y)) return true;
  const flanks = p.flanks;
  if (!flanks) return false;
  for (let i = 0; i < flanks.length; i++) {
    const f = flanks[i]!;
    if (inSpotCone(p, f.dx, f.dy, x, y)) return true;
  }
  return false;
}

/** Same test as `paintSpot`, for one tile. */
function spotLightsTile(
  p: SightParams,
  x: number,
  y: number,
  elev: ArrayLike<number> | undefined,
  width: number,
  height: number,
  cover: CoverField | undefined,
): boolean {
  if (!inAnyLamp(p, x, y)) return false;
  if (!elev) return true;
  if (cover) cover.ignoreOccupyId = p.ignore;
  if (!hasFullLos(elev, width, height, p.ox, p.oy, x, y, cover, p.seye)) return false;
  if (cover && coverSmokeAt(cover, width, height, x, y) && sightDist(x, y, p.ox, p.oy) > SMOKE_PEEK_TILES) return false;
  return true;
}

/** Ground the lamp lights, seen from the cab. The beam stops on what stops an eye. */
function paintSpot(
  mask: Uint8Array,
  width: number,
  height: number,
  p: SightParams,
  elev?: ArrayLike<number>,
  cover?: CoverField,
): void {
  if (p.sr <= 0) return;
  const x0 = Math.max(0, p.ox - p.sr);
  const x1 = Math.min(width - 1, p.ox + p.sr);
  const y0 = Math.max(0, p.oy - p.sr);
  const y1 = Math.min(height - 1, p.oy + p.sr);
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      if (mask[row + x]) continue;
      if (spotLightsTile(p, x, y, elev, width, height, cover)) mask[row + x] = 1;
    }
  }
}

function paintSightParams(
  mask: Uint8Array,
  width: number,
  height: number,
  p: SightParams,
  elev?: ArrayLike<number>,
  cover?: CoverField,
): void {
  if (cover) cover.ignoreOccupyId = p.ignore;
  for (let y = p.fy; y < p.fy + p.fh; y++) {
    for (let x = p.fx; x < p.fx + p.fw; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      mask[y * width + x] = 1;
    }
  }
  paintSight(mask, width, height, p.ox, p.oy, p.radius, elev, cover, p.eye, p.uphill);
  paintSpot(mask, width, height, p, elev, cover);
}

export function paintEntitySight(
  mask: Uint8Array,
  width: number,
  height: number,
  tileSize: number,
  e: SightSource,
  elev?: ArrayLike<number>,
  cover?: CoverField,
  light: SightLight = DAYLIGHT,
): void {
  paintSightParams(mask, width, height, sightParams(e, width, height, tileSize, elev, light), elev, cover);
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
  const flags = cover?.losFlags;
  const flagged =
    !!cover &&
    !!flags &&
    !!cover.smoke &&
    elev instanceof Uint8Array &&
    ox >= 0 &&
    oy >= 0 &&
    ox < width &&
    oy < height;
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      if (mask[row + x]) continue;
      const d = sightDist(x, y, ox, oy);
      if (d > boxR || d < minD) continue;
      const extra = levelSightExtra(h0, elevAtSafe(elev, width, height, x, y), uphillBonus);
      if (d > catalogR + extra) continue;
      const los = flagged
        ? hasFullLosFlagged(elev, flags, cover, width, ox, oy, x, y, observerEye)
        : hasFullLos(elev, width, height, ox, oy, x, y, cover, observerEye);
      if (!los) continue;
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
  h = mix(h, state.digRev);
  const light = sightLightAt(state.tick);
  h = mix(h, Math.round(light.mul * 4096));
  h = mix(h, light.spots ? 1 : 0);
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
    h = mix(h, e.air ? Math.round(e.air.alt) : 0);
    h = mix(h, occupantSightTiles(state, e) ?? -1);
    if (e.kind === "building") h = mix(h, e.unpowered ? 1 : 0);
    if (light.spots && hasSpotlight(e.type)) {
      h = mix(h, e.crits.includes("lamp") ? 0 : 1);
      h = mix(h, Math.round(lampHeading(spotFacingOf(e)) * 4096));
    }
    if (light.spots && headlightLit(e)) {
      const facing = e.facing ?? 0;
      if (e.type === "mammoth") {
        const lamps = hullLamps(e.type, e.id, light.sec);
        for (let i = 0; i < lamps.length; i++) h = mix(h, Math.round(lampHeading(facing + lamps[i]!.beam) * 4096));
      } else {
        h = mix(h, Math.round(lampHeading(facing) * 4096));
      }
    }
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

/**
 * One observer's lit tiles, kept while it holds still. `local` fingerprints
 * the static cover plus any hull or smoke inside its sight box.
 */
type SightMemo = {
  p: SightParams;
  local: number;
  /** Rebuilds seen with the same inputs. */
  calls: number;
  tiles: Int32Array | null;
};

/** A unit must hold its tile this many rebuilds before its sight is stored. */
const SIGHT_SETTLE_CALLS = 2;

const sightMemos = new WeakMap<MatchState, Map<number, SightMemo>>();

function sightMemoOf(state: MatchState): Map<number, SightMemo> {
  let memo = sightMemos.get(state);
  if (!memo) {
    memo = new Map();
    sightMemos.set(state, memo);
  }
  return memo;
}

type TileBox = { id: number; x0: number; y0: number; x1: number; y1: number };

type SightEnv = {
  /** Terrain and building / wreck footprints. */
  base: number;
  hull: Int32Array;
  hulls: TileBox[];
  smoke: Uint8Array;
  clouds: TileBox[];
};

function sightEnvOf(state: MatchState, cover: CoverField): SightEnv {
  let base = 2166136261;
  const terrain = state.terrain;
  const occupy = state.occupy;
  for (let i = 0; i < terrain.length; i++) base = mix(base, terrain[i]! * 31 + occupy[i]!);
  const ts = state.tileSize;
  const hulls: TileBox[] = [];
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || !isArmoredType(e.type)) continue;
    const r = catalog(e.type).radius;
    if (r <= 0) continue;
    hulls.push({
      id: e.id,
      x0: Math.max(0, worldToTile(e.x - r, ts)),
      x1: Math.min(state.width - 1, worldToTile(e.x + r, ts)),
      y0: Math.max(0, worldToTile(e.y - r, ts)),
      y1: Math.min(state.height - 1, worldToTile(e.y + r, ts)),
    });
  }
  const clouds: TileBox[] = state.smokeClouds.map((c) => ({
    id: c.id,
    ...smokeCloudTileBounds(c, ts, state.width, state.height),
  }));
  return {
    base,
    hull: cover.hull as Int32Array,
    hulls,
    smoke: cover.smoke as Uint8Array,
    clouds,
  };
}

/** Hash of every hull and smoke tile inside the observer's sight box. */
function localCoverKey(env: SightEnv, p: SightParams, width: number, height: number): number {
  const r = sightBoxRadius(p, true);
  const bx0 = Math.max(0, p.ox - r);
  const bx1 = Math.min(width - 1, p.ox + r);
  const by0 = Math.max(0, p.oy - r);
  const by1 = Math.min(height - 1, p.oy + r);
  let h = env.base;
  const hashBoxes = (boxes: TileBox[], grid: ArrayLike<number>): void => {
    for (const b of boxes) {
      const x0 = Math.max(bx0, b.x0);
      const x1 = Math.min(bx1, b.x1);
      const y0 = Math.max(by0, b.y0);
      const y1 = Math.min(by1, b.y1);
      if (x0 > x1 || y0 > y1) continue;
      h = mix(h, b.id);
      h = mix(h, x0);
      h = mix(h, y0);
      h = mix(h, x1);
      h = mix(h, y1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) h = mix(h, grid[y * width + x]!);
      }
    }
  };
  hashBoxes(env.hulls, env.hull);
  h = mix(h, -1);
  hashBoxes(env.clouds, env.smoke);
  return h;
}

let sightScratch = new Uint8Array(0);
let losFlagScratch = new Uint8Array(0);

/** Every tile one observer lights, with nothing skipped. */
function fullSightTiles(state: MatchState, p: SightParams, cover: CoverField): Int32Array {
  const width = state.width;
  const height = state.height;
  if (sightScratch.length < width * height) sightScratch = new Uint8Array(width * height);
  const scratch = sightScratch;
  paintSightParams(scratch, width, height, p, state.heights, cover);
  const r = sightBoxRadius(p, true);
  const x0 = Math.max(0, Math.min(p.ox - r, p.fw > 0 ? p.fx : p.ox));
  const x1 = Math.min(width - 1, Math.max(p.ox + r, p.fx + p.fw - 1));
  const y0 = Math.max(0, Math.min(p.oy - r, p.fh > 0 ? p.fy : p.oy));
  const y1 = Math.min(height - 1, Math.max(p.oy + r, p.fy + p.fh - 1));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      if (!scratch[row + x]) continue;
      out.push(row + x);
      scratch[row + x] = 0;
    }
  }
  return Int32Array.from(out);
}

/** Allied observers, widest sight first, with the sight they paint. */
function alliedSight(state: MatchState, playerId: string): { e: Entity; p: SightParams }[] {
  const observers: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) continue;
    if (!allies(state, playerId, e.ownerId)) continue;
    observers.push(e);
  }
  observers.sort((a, b) => observerRadius(state, b) - observerRadius(state, a));
  const light = sightLightAt(state.tick);
  return observers.map((e) => {
    const sightTiles = occupantSightTiles(state, e) ?? (entityIsScouting(e) ? sightTilesForEntity(state, e) : undefined);
    const observerEye = occupantEye(state, e);
    const p = sightParams(
      sightTiles != null || observerEye != null ? { ...e, sightTiles, observerEye } : e,
      state.width,
      state.height,
      state.tileSize,
      state.heights,
      light,
    );
    return { e, p };
  });
}

/**
 * The fog mask read one tile at a time, for combat's handful of sight checks
 * between snapshots. Equal to the tile `visionMask` would build right now:
 * the same observers, cover, and small-island sealing.
 */
type LazyVision = {
  key: number;
  observers: SightParams[];
  cover: CoverField;
  /** -1 unknown, else the painted (pre-seal) value. */
  raw: Int8Array;
  /** After filling small unseen islands. */
  filled: Int8Array;
  /** After also hiding small seen islands. */
  sealed: Int8Array;
};

const lazyVisions = new WeakMap<MatchState, Map<string, LazyVision>>();

function lazyVisionOf(state: MatchState, playerId: string, key: number): LazyVision {
  let byPlayer = lazyVisions.get(state);
  if (!byPlayer) {
    byPlayer = new Map();
    lazyVisions.set(state, byPlayer);
  }
  const hit = byPlayer.get(playerId);
  if (hit && hit.key === key) return hit;
  const n = state.width * state.height;
  const live = coverOf(state);
  const lazy: LazyVision = {
    key,
    observers: alliedSight(state, playerId).map((o) => o.p),
    cover: {
      terrain: live.terrain,
      occupy: live.occupy,
      hull: Int32Array.from(live.hull as Int32Array),
      smoke: Uint8Array.from(live.smoke as Uint8Array),
    },
    raw: hit?.raw ?? new Int8Array(n),
    filled: hit?.filled ?? new Int8Array(n),
    sealed: hit?.sealed ?? new Int8Array(n),
  };
  lazy.raw.fill(-1);
  lazy.filled.fill(-1);
  lazy.sealed.fill(-1);
  byPlayer.set(playerId, lazy);
  return lazy;
}

/** Same test as `paintSight`, for one tile. */
function observerLightsTile(
  p: SightParams,
  x: number,
  y: number,
  elev: ArrayLike<number>,
  width: number,
  height: number,
  cover: CoverField,
): boolean {
  if (p.fw > 0 && x >= p.fx && x < p.fx + p.fw && y >= p.fy && y < p.fy + p.fh) return true;
  if (eyeLightsTile(p, x, y, elev, width, height, cover)) return true;
  return spotLightsTile(p, x, y, elev, width, height, cover);
}

function eyeLightsTile(
  p: SightParams,
  x: number,
  y: number,
  elev: ArrayLike<number>,
  width: number,
  height: number,
  cover: CoverField,
): boolean {
  if (p.radius <= 0) return false;
  const d = sightDist(x, y, p.ox, p.oy);
  if (d > p.radius) {
    if (p.uphill <= 0 || d > p.radius + HEIGHT_MAX * p.uphill) return false;
    const h0 = elevAtSafe(elev, width, height, p.ox, p.oy);
    if (d > p.radius + levelSightExtra(h0, elevAtSafe(elev, width, height, x, y), p.uphill)) return false;
  }
  cover.ignoreOccupyId = p.ignore;
  if (!hasFullLos(elev, width, height, p.ox, p.oy, x, y, cover, p.eye)) return false;
  if (coverSmokeAt(cover, width, height, x, y) && d > SMOKE_PEEK_TILES) return false;
  return true;
}

function lazyRaw(state: MatchState, lazy: LazyVision, i: number): number {
  const known = lazy.raw[i]!;
  if (known >= 0) return known;
  const width = state.width;
  const x = i % width;
  const y = (i / width) | 0;
  let lit = 0;
  for (const p of lazy.observers) {
    if (observerLightsTile(p, x, y, state.heights, width, state.height, lazy.cover)) {
      lit = 1;
      break;
    }
  }
  lazy.raw[i] = lit;
  return lit;
}

const fillQueue = new Int32Array(FOV_ISLAND_LIMIT + 2);
const sealQueue = new Int32Array(FOV_ISLAND_LIMIT + 2);

/**
 * Flood the 8-connected `from` island holding `start`, reading tiles through
 * `at`, and stop once it outgrows FOV_ISLAND_LIMIT. Returns the island size,
 * capped at the limit + 1, with its tiles at the front of `q`.
 */
function islandSize(
  width: number,
  height: number,
  start: number,
  from: number,
  q: Int32Array,
  at: (i: number) => number,
): number {
  q[0] = start;
  let n = 1;
  for (let k = 0; k < n; k++) {
    const cur = q[k]!;
    const cx = cur % width;
    const cy = (cur / width) | 0;
    for (const [dx, dy] of FOV_N8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (at(ni) !== from) continue;
      let dup = false;
      for (let j = 0; j < n; j++) {
        if (q[j] === ni) {
          dup = true;
          break;
        }
      }
      if (dup) continue;
      q[n++] = ni;
      if (n > FOV_ISLAND_LIMIT) return n;
    }
  }
  return n;
}

function lazyFilled(state: MatchState, lazy: LazyVision, i: number): number {
  const known = lazy.filled[i]!;
  if (known >= 0) return known;
  if (lazyRaw(state, lazy, i) === 1) {
    lazy.filled[i] = 1;
    return 1;
  }
  const n = islandSize(state.width, state.height, i, 0, fillQueue, (j) => lazyRaw(state, lazy, j));
  const v = n <= FOV_ISLAND_LIMIT ? 1 : 0;
  for (let k = 0; k < n; k++) lazy.filled[fillQueue[k]!] = v;
  return v;
}

function lazySealed(state: MatchState, lazy: LazyVision, i: number): number {
  const known = lazy.sealed[i]!;
  if (known >= 0) return known;
  if (lazyFilled(state, lazy, i) === 0) {
    lazy.sealed[i] = 0;
    return 0;
  }
  const n = islandSize(state.width, state.height, i, 1, sealQueue, (j) => lazyFilled(state, lazy, j));
  const v = n <= FOV_ISLAND_LIMIT ? 0 : 1;
  for (let k = 0; k < n; k++) lazy.sealed[sealQueue[k]!] = v;
  return v;
}

function lazyTileLit(state: MatchState, lazy: LazyVision, x: number, y: number): boolean {
  if (x < 0 || y < 0) return false;
  const i = y * state.width + x;
  if (i < 0 || i >= lazy.raw.length) return false;
  return lazySealed(state, lazy, i) === 1;
}

function lazyEntityVisible(state: MatchState, playerId: string, key: number, e: Entity): boolean {
  const lazy = lazyVisionOf(state, playerId, key);
  if (e.kind === "building") {
    for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
      for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        if (lazyTileLit(state, lazy, x, y)) return true;
      }
    }
    return false;
  }
  return lazyTileLit(state, lazy, worldToTile(e.x, state.tileSize), worldToTile(e.y, state.tileSize));
}

export function visionMask(state: MatchState, playerId: string): Uint8Array {
  const key = visionKey(state, playerId);
  const cached = state.visionByPlayer.get(playerId);
  if (cached && state.visionKeyByPlayer.get(playerId) === key) return cached;
  lazyVisions.get(state)?.delete(playerId);
  const width = state.width;
  const height = state.height;
  const mask = new Uint8Array(width * height);
  const cover = coverOf(state);
  if (losFlagScratch.length !== width * height) losFlagScratch = new Uint8Array(width * height);
  fillLosFlags(cover, losFlagScratch);
  cover.losFlags = losFlagScratch;
  const observers = alliedSight(state, playerId);
  const memo = sightMemoOf(state);
  const env = sightEnvOf(state, cover);
  const settle: SightMemo[] = [];
  const movers: SightParams[] = [];
  for (const { e, p } of observers) {
    const local = localCoverKey(env, p, width, height);
    const m = memo.get(e.id);
    if (m && m.local === local && sameSightParams(m.p, p)) {
      if (m.tiles) {
        const tiles = m.tiles;
        for (let i = 0; i < tiles.length; i++) mask[tiles[i]!] = 1;
        continue;
      }
      m.calls += 1;
      if (m.calls >= SIGHT_SETTLE_CALLS) {
        settle.push(m);
        continue;
      }
    } else {
      memo.set(e.id, { p, local, calls: 0, tiles: null });
    }
    movers.push(p);
  }
  for (const m of settle) {
    m.tiles = fullSightTiles(state, m.p, cover);
    const tiles = m.tiles;
    for (let i = 0; i < tiles.length; i++) mask[tiles[i]!] = 1;
  }
  // Tiles an earlier observer lit are skipped, so movers only pay for new ground.
  for (const p of movers) paintSightParams(mask, width, height, p, state.heights, cover);
  for (const id of memo.keys()) if (!state.entities.has(id)) memo.delete(id);
  sealFovIslands(mask, width, height);
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
  const elev = map ? heightsWithDug(map.heights, snap.dug) : undefined;
  const occupy = new Int32Array(width * height);
  const hull = new Int32Array(width * height);
  if (map) {
    let featureId = -1;
    for (const f of map.features ?? []) {
      // A sandbag or wall section, or a bridge brick, does not stand in the way of sight.
      if (isMapLine(f.type)) continue;
      const site = featureLotSite(f);
      if (f.turn != null) {
        const placed = { type: f.type, facing: site.facing, tileX: site.tx, tileY: site.ty, tileW: site.w, tileH: site.h, x: (site.tx + site.w / 2) * tileSize, y: (site.ty + site.h / 2) * tileSize };
        const id = featureId--;
        for (const t of buildingTilesOf(placed, tileSize)) {
          if (t.x >= 0 && t.y >= 0 && t.x < width && t.y < height) occupy[t.y * width + t.x] = id;
        }
      } else stampOccupy(occupy, width, height, featureId--, site.tx, site.ty, site.w, site.h);
    }
    for (const e of snap.entities) {
      if (e.hp <= 0) continue;
      if (e.kind === "building" || e.wreck) {
        if (isTurnedBuilding(e)) {
          for (const t of buildingTilesOf(e, tileSize)) {
            if (t.x >= 0 && t.y >= 0 && t.x < width && t.y < height) occupy[t.y * width + t.x] = e.id;
          }
        } else stampOccupy(occupy, width, height, e.id, e.tileX, e.tileY, e.tileW, e.tileH);
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
  const light = sightLightAt(snap.tick);
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
    const observerEye = snapshotOccupantEye(snap, e);
    paintEntitySight(
      mask,
      width,
      height,
      tileSize,
      sightTiles != null || observerEye != null ? { ...e, sightTiles, observerEye } : e,
      elev,
      cover,
      light,
    );
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
  if (e.scout?.out) return sightTilesOf("rifleman", h);
  return lowPowerSight(sightTilesOf(e.type, h, liveSightExtra(e)), e.kind === "building" && e.unpowered);
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
  return sightTilesOf("rifleman", h);
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
  return sightTilesOf(e.type, h) + garrisonSightBonusOf(house.type);
}

function snapshotOccupantEye(snap: MatchSnapshot, e: EntityView): number | undefined {
  if (!e.garrisonedIn) return undefined;
  const house = snap.entities.find((x) => x.id === e.garrisonedIn);
  if (!house || house.garrison?.hide) return undefined;
  return catalog(house.type).garrisonEye;
}

/** Run lengths of a 0/1 mask, alternating 0-run / 1-run, starting with 0. */
export function encodeVisionRuns(mask: Uint8Array): number[] {
  const runs: number[] = [];
  let cur = 0;
  let len = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 1 : 0;
    if (v === cur) {
      len++;
      continue;
    }
    runs.push(len);
    cur = v;
    len = 1;
  }
  runs.push(len);
  return runs;
}

/** Inverse of `encodeVisionRuns`. Tiles past the last run stay hidden. */
export function decodeVisionRuns(runs: readonly number[], tiles: number): Uint8Array {
  const mask = new Uint8Array(tiles);
  let at = 0;
  for (let r = 0; r < runs.length && at < tiles; r++) {
    const end = Math.min(tiles, at + Math.max(0, runs[r] ?? 0));
    if (r % 2 === 1) mask.fill(1, at, end);
    at = end;
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
  if (hiddenSubmarine(state, playerId, e)) return false;
  if (sonarSpotted(state, playerId, e)) return true;
  if (mask) return entityOnMask(e, mask, state.width, state.height, state.tileSize);
  return entityVisibleToPlayer(state, playerId, e);
}

function entityVisibleToPlayer(state: MatchState, playerId: string, e: Entity): boolean {
  if (FOV_ISLAND_LIMIT > 0) {
    const key = visionKey(state, playerId);
    const cached = state.visionByPlayer.get(playerId);
    if (cached && state.visionKeyByPlayer.get(playerId) === key) {
      return entityOnMask(e, cached, state.width, state.height, state.tileSize);
    }
    return lazyEntityVisible(state, playerId, key, e);
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
    const light = sightLightAt(state.tick);
    const radius = nightTiles(occupantSightTiles(state, obs) ?? lowPowerSight(sightTilesOf(obs.type, maxH), obs.unpowered), light.mul);
    const seen = tileInSight(
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
    if (seen) return true;
    const p = sightParams(obs, width, height, state.tileSize, elev, light);
    return spotLightsTile(p, tx, ty, elev, width, height, cover);
  }
  const ox = worldToTile(obs.x, state.tileSize);
  const oy = worldToTile(obs.y, state.tileSize);
  const h = elevAtSafe(elev, width, height, ox, oy);
  const light = sightLightAt(state.tick);
  const radius = nightTiles(
    occupantSightTiles(state, obs) ??
      (entityIsScouting(obs) ? sightTilesOf("rifleman", h) : sightTilesOf(obs.type, h, liveSightExtra(obs))),
    light.mul,
  );
  const seen = tileInSight(
    tx,
    ty,
    ox,
    oy,
    radius,
    width,
    height,
    elev,
    cover,
    occupantEye(state, obs) ?? observerEyeForEntity(obs),
    uphillSightForEntity(obs),
  );
  if (seen || !light.spots || !headlightLit(obs)) return seen;
  const p = sightParams(obs, width, height, state.tileSize, elev, light);
  return spotLightsTile(p, tx, ty, elev, width, height, cover);
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
  const d = sightDist(tx, ty, ox, oy);
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
