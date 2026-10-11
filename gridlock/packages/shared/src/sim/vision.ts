import { buildingTilesOf, isTurnedBuilding } from "../building-rect.js";
import {
  FOV_ISLAND_LIMIT,
  GARRISON_HIDE_SIGHT,
  garrisonSightBonusOf,
  HEIGHT_MAX,
  SIGHT_UPHILL_MAX_TILES,
  SMOKE_PEEK_TILES,
  HEADLIGHT_HALF_DEG,
  SPOTLIGHT_HALF_DEG,
  SPOTLIGHT_REACH_TILES,
  TOWER_EYE_HEIGHT,
  SPOTLIGHT_POLE_HEIGHT,
  TITAN_LAMP_POOL_AHEAD_TILES,
  TITAN_LAMP_POOL_RADIUS_TILES,
  TICK_DT,
  catalog,
  entityIsScouting,
  isArmoredType,
  isRubble,
  type Crit,
} from "../catalog.js";
import type { EntityView, MatchSnapshot } from "../protocol.js";
import { featureLotSite, getMap, isGroveTile, isMapLine, TILE_EMPTY } from "../maps.js";
import {
  coverSmokeAt,
  armLosFastPath,
  clearLosFastPath,
  fillLosFlags,
  hasFullLos,
  losFlagAt,
  hasFullLosFlagged,
  heightsWithDug,
  observerEyeForEntity,
  levelSightExtra,
  liveSightExtra,
  lowPowerSight,
  sightDimmed,
  sightTilesForEntity,
  sightTilesOf,
  uphillSightForEntity,
  type CoverField,
} from "./elevation.js";
import { allies, fillHullCover, fillSightOccupy, footprint, inBounds, stampArmoredHull, worldToTile } from "./geo.js";
import { armSightBlocks, clearSightBlocks, litPush, sweepSight, type LitList } from "./sight-sweep.js";
export { armSightBlocks, clearSightBlocks };
import { hiddenSubmarine, sonarSpotted } from "./naval.js";
import { occupantEye, occupantSightTiles } from "./garrison.js";
import { fillSmokeMask, smokeCloudTileBounds } from "./smoke.js";
import {
  hasSpotlight,
  headlightLit,
  hullLamps,
  lampHeading,
  lampPools,
  nightSightMul,
  nightTiles,
  spotFacingOf,
  spotlightLit,
  spotlightsOn,
} from "./night.js";
import type { Entity, MatchState } from "./types.js";
import { hiddenBurrowed } from "./burrow.js";
import { hiddenCloaked } from "./shade.js";

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
  /** Leg jets or a jet pack. A Titan aloft turns its lamp into a pool on the ground. */
  jet?: { alt: number };
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
  /** A Xenite structure whose hive is below zero: no glow, the same shorter sight. */
  hiveDark?: boolean;
  /** Who is inside: the Spotlight post's lamp burns only with its man. */
  garrison?: readonly unknown[] | { count: number };
};

/** Light at the moment sight is painted: how far it carries, whether lamps are lit, and match seconds for lamps that sweep. */
export type SightLight = { mul: number; spots: boolean; sec: number };

const DAYLIGHT: SightLight = { mul: 1, spots: false, sec: 0 };

export function sightLightAt(tick: number, alwaysNight = false): SightLight {
  return { mul: nightSightMul(tick, alwaysNight), spots: spotlightsOn(tick, alwaysNight), sec: tick * TICK_DT };
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
  within?: TileBounds,
): void {
  if (limit <= 0) return;
  const tiles = width * height;
  ensureFovScratch(tiles, limit);
  // Only ground at the edge of what is lit can change colour, so each pass walks the lit box and one tile around it.
  // A caller that knows where its eyes reach passes that box, grown by an island, and saves the scan of the whole mask.
  const a = within ? growBounds(within, limit + 1, width, height) : litBounds(mask, width, height);
  if (!a) return;
  recolorSmallIslands(mask, width, height, tiles, 0, 1, limit, a);
  const b = within ? a : litBounds(mask, width, height);
  if (!b) return;
  recolorSmallIslands(mask, width, height, tiles, 1, 0, limit, b);
}

type TileBounds = { x0: number; y0: number; x1: number; y1: number };

function growBounds(b: TileBounds, by: number, width: number, height: number): TileBounds {
  return {
    x0: Math.max(0, b.x0 - by),
    y0: Math.max(0, b.y0 - by),
    x1: Math.min(width - 1, b.x1 + by),
    y1: Math.min(height - 1, b.y1 + by),
  };
}

/** The box around every lit tile, grown by one tile and clamped to the map. Null when nothing is lit. */
function litBounds(mask: Uint8Array, width: number, height: number): TileBounds | null {
  let y0 = -1;
  let y1 = -1;
  let x0 = width;
  let x1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let lx = -1;
    let rx = -1;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      if (lx < 0) lx = x;
      rx = x;
    }
    if (lx < 0) continue;
    if (y0 < 0) y0 = y;
    y1 = y;
    if (lx < x0) x0 = lx;
    if (rx > x1) x1 = rx;
  }
  if (y0 < 0) return null;
  return {
    x0: Math.max(0, x0 - 1),
    y0: Math.max(0, y0 - 1),
    x1: Math.min(width - 1, x1 + 1),
    y1: Math.min(height - 1, y1 + 1),
  };
}

/** `FOV_N8` as two flat arrays, for the loops that run over every tile. */
const FOV_N8_DX = Int8Array.from(FOV_N8.map(([dx]) => dx));
const FOV_N8_DY = Int8Array.from(FOV_N8.map(([, dy]) => dy));

function touchesOther(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  from: number,
): boolean {
  for (let k = 0; k < 8; k++) {
    const nx = x + FOV_N8_DX[k]!;
    const ny = y + FOV_N8_DY[k]!;
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
  box: TileBounds,
): void {
  const seen = fovSeen;
  const stack = fovStack;
  const small = fovSmall;
  // A flood that starts in the box can walk one more island past it before it is called large.
  const clearY0 = Math.max(0, box.y0 - limit - 1);
  const clearY1 = Math.min(height - 1, box.y1 + limit + 1);
  seen.fill(FOV_SEEN_CLEAR, clearY0 * width, Math.min(tiles, (clearY1 + 1) * width));
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
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
        for (let k = 0; k < 8; k++) {
          const nx = cx + FOV_N8_DX[k]!;
          const ny = cy + FOV_N8_DY[k]!;
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
  // Same rounded value as Math.hypot on tile offsets, several times cheaper; this runs per tile per observer.
  const dx = ax - bx;
  const dy = ay - by;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
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
  /** A Titan aloft: the lamp lights one round pool this wide, `spa` tiles out along the heading, instead of a cone. */
  spr?: number;
  spa?: number;
};

type SpotPaint = {
  sr: number;
  sdx: number;
  sdy: number;
  scos: number;
  seye: number;
  flanks?: readonly { dx: number; dy: number }[];
  spr?: number;
  spa?: number;
};

const NO_SPOT: SpotPaint = { sr: 0, sdx: 0, sdy: 0, scos: 1, seye: 0 };

/** A held tower's spotlight, or a hull's headlight giving back its daylight sight down the nose. */
function spotOf(e: SightSource, light: SightLight, daySight: number, eye: number): SpotPaint {
  if (!light.spots) return NO_SPOT;
  if (e.kind === "building" || hasSpotlight(e.type)) {
    if (!hasSpotlight(e.type)) return NO_SPOT;
    if (
      !spotlightLit({
        type: e.type,
        ownerId: e.ownerId,
        hp: e.hp ?? 1,
        ruined: e.ruined,
        wreck: e.wreck,
        crits: e.crits,
        unpowered: e.unpowered,
        garrison: e.garrison,
      })
    ) {
      return NO_SPOT;
    }
    const a = lampHeading(spotFacingOf({ facing: e.facing ?? 0, spotFacing: e.spotFacing }));
    // Up on its jets the Titan's lamp tips down onto one pool ahead, lit from its height.
    if (lampPools(e)) {
      const spa = TITAN_LAMP_POOL_AHEAD_TILES;
      const spr = TITAN_LAMP_POOL_RADIUS_TILES;
      return { sr: Math.ceil(spa + spr), sdx: Math.cos(a), sdy: Math.sin(a), scos: 1, seye: eye, spr, spa };
    }
    // The pole lamp shines from its own height, under the tower cab's. The Titan's rides its torso.
    const seye = e.type === "spotlight" ? SPOTLIGHT_POLE_HEIGHT : e.kind === "unit" && e.type === "titan" ? eye : TOWER_EYE_HEIGHT;
    return { sr: SPOTLIGHT_REACH_TILES, sdx: Math.cos(a), sdy: Math.sin(a), scos: SPOT_COS, seye };
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
      radius: nightTiles(e.sightTiles ?? lowPowerSight(sightTilesOf(e.type, maxH), sightDimmed(e)), light.mul),
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
    a.spr === b.spr &&
    a.spa === b.spa &&
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
  if (p.radius > 0) r = !elev ? p.radius : p.radius + (p.uphill > 0 ? Math.min(SIGHT_UPHILL_MAX_TILES, HEIGHT_MAX * p.uphill) : 0);
  return Math.max(r, p.sr);
}

/** One lamp's beam reaches this tile, before line of sight and smoke. */
function inSpotCone(p: SightParams, sdx: number, sdy: number, x: number, y: number): boolean {
  if (p.sr <= 0) return false;
  if (p.spr != null && p.spa != null) {
    return Math.hypot(x - (p.ox + sdx * p.spa), y - (p.oy + sdy * p.spa)) <= p.spr;
  }
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
  if (!losClear(elev, width, height, p.ox, p.oy, x, y, cover, p.seye)) return false;
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
  out?: LitList,
): void {
  if (p.sr <= 0) return;
  const x0 = Math.max(0, p.ox - p.sr);
  const x1 = Math.min(width - 1, p.ox + p.sr);
  const y0 = Math.max(0, p.oy - p.sr);
  const y1 = Math.min(height - 1, p.oy + p.sr);
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      if (!out && mask[row + x]) continue;
      if (!spotLightsTile(p, x, y, elev, width, height, cover)) continue;
      mask[row + x] = 1;
      if (out) litPush(out, row + x);
    }
  }
}

/** Paint one eye. With `out`, every tile it lights is listed too, lit already or not, so the list can be re-stamped later. */
function paintSightParams(
  mask: Uint8Array,
  width: number,
  height: number,
  p: SightParams,
  elev?: ArrayLike<number>,
  cover?: CoverField,
  out?: LitList,
): void {
  if (cover) cover.ignoreOccupyId = p.ignore;
  for (let y = p.fy; y < p.fy + p.fh; y++) {
    for (let x = p.fx; x < p.fx + p.fw; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      mask[y * width + x] = 1;
      if (out) litPush(out, y * width + x);
    }
  }
  paintSight(mask, width, height, p.ox, p.oy, p.radius, elev, cover, p.eye, p.uphill, out);
  paintSpot(mask, width, height, p, elev, cover, out);
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
  out?: LitList,
): void {
  if (radius <= 0) return;
  if (!elev) {
    const x0 = Math.max(0, ox - radius);
    const x1 = Math.min(width - 1, ox + radius);
    const y0 = Math.max(0, oy - radius);
    const y1 = Math.min(height - 1, oy + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (sightDist(x, y, ox, oy) > radius) continue;
        mask[y * width + x] = 1;
        if (out) litPush(out, y * width + x);
      }
    }
    return;
  }
  const lit = out ?? sweepScratch;
  const from = lit.n;
  sweepSight(
    { ox, oy, radius, eye: observerEye, uphill: uphillBonus, ignore: cover?.ignoreOccupyId ?? 0 },
    width,
    height,
    elev,
    cover,
    lit,
  );
  for (let k = from; k < lit.n; k++) mask[lit.tiles[k]!] = 1;
  if (!out) lit.n = 0;
}

/** Lit tiles of a sweep nobody asked to keep. */
const sweepScratch: LitList = { tiles: new Int32Array(4096), n: 0 };

function coverIgnoreId(e: { kind: string; id?: number; garrisonedIn?: number | null }): number {
  if (e.kind === "building") return e.id ?? 0;
  return e.garrisonedIn ?? e.id ?? 0;
}

type CoverCache = {
  /** `coverKey`: buildings, rubble, trees, dug ground. A change rebuilds the cover. */
  key: number;
  cover: CoverField;
  env: SightEnv | null;
  /** Bumps on every change, the static rebuilds and the hull and smoke refreshes alike. */
  rev: number;
  /** `dynamicCoverKey` the hull and smoke layers match. */
  dynamicKey: number;
  /** Tiles each armored hull stamps now, so a move clears exactly those. */
  hullTiles: Map<number, number[]>;
  /** The smoke mask as last laid, for the tiles a cloud change touched, and whether it holds any smoke. */
  smokeWas: Uint8Array;
  hadSmoke: boolean;
};

/** `CoverCache.rev` for the cover `coverOf` returns now. */
function coverRevOf(state: MatchState): number {
  return coverCaches.get(state)?.rev ?? 0;
}

/** Stamp every armored hull and remember which tiles each one took. */
function stampHulls(state: MatchState, hull: Int32Array, into: Map<number, number[]>): void {
  into.clear();
  const width = state.width;
  const height = state.height;
  const ts = state.tileSize;
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || !isArmoredType(e.type)) continue;
    stampArmoredHull(hull, width, height, ts, e);
    const r = catalog(e.type).radius;
    if (r <= 0) continue;
    const tiles: number[] = [];
    const x0 = Math.max(0, worldToTile(e.x - r, ts));
    const x1 = Math.min(width - 1, worldToTile(e.x + r, ts));
    const y0 = Math.max(0, worldToTile(e.y - r, ts));
    const y1 = Math.min(height - 1, worldToTile(e.y + r, ts));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x;
        if (hull[i] === e.id) tiles.push(i);
      }
    }
    into.set(e.id, tiles);
  }
}

/** One rebuild of the cover: the tiles whose ground or footprint changed, or `all` when too many did. */
type CoverDiff = { rev: number; tiles: Int32Array; all: boolean };

/** Rebuilds of the cover kept for memo checks; an eye swept earlier than this many is swept again. */
const COVER_DIFFS_KEPT = 64;
/** More changed tiles than this in one rebuild and every eye is swept again. */
const COVER_DIFF_MAX = 2048;

/**
 * Which cover rebuild the match is on, and what the recent rebuilds that
 * changed any ground or footprint did change, so an eye re-sweeps only for
 * a change in its reach. Rebuilds for a hull or a cloud alone change no
 * tile here and are not kept. `forgotBelow`: an eye last checked before this
 * revision may have missed a change that is no longer kept.
 */
type CoverHistory = { rev: number; forgotBelow: number; occupy: Int32Array; terrain: Uint8Array; diffs: CoverDiff[] };

const coverHistories = new WeakMap<MatchState, CoverHistory>();

function coverHistoryOf(state: MatchState): CoverHistory {
  let h = coverHistories.get(state);
  if (!h) {
    h = { rev: 0, forgotBelow: 0, occupy: new Int32Array(0), terrain: new Uint8Array(0), diffs: [] };
    coverHistories.set(state, h);
  }
  return h;
}

/** Note what this rebuild of the cover changed against the last one. */
function recordCoverDiff(state: MatchState, cover: CoverField): void {
  const h = coverHistoryOf(state);
  const n = state.width * state.height;
  const occupy = cover.occupy as Int32Array;
  const terrain = cover.terrain;
  h.rev++;
  if (h.occupy.length !== n) {
    h.occupy = Int32Array.from(occupy);
    h.terrain = Uint8Array.from(terrain);
    h.diffs = [];
    h.forgotBelow = h.rev;
    return;
  }
  const changed: number[] = [];
  let all = false;
  for (let i = 0; i < n; i++) {
    if (occupy[i] === h.occupy[i] && terrain[i] === h.terrain[i]) continue;
    if (changed.length >= COVER_DIFF_MAX) {
      all = true;
      break;
    }
    changed.push(i);
  }
  if (changed.length === 0 && !all) return;
  h.occupy.set(occupy);
  h.terrain.set(terrain);
  h.diffs.push({ rev: h.rev, tiles: Int32Array.from(changed), all });
  while (h.diffs.length > COVER_DIFFS_KEPT) {
    const dropped = h.diffs.shift()!;
    h.forgotBelow = dropped.rev;
  }
}

/** True when nothing the cover changed since the eye's sweep lies within `r` tiles of it. Brings the memo up to date when so. */
function coverStillGood(m: SightMemo, p: SightParams, r: number, h: CoverHistory, width: number): boolean {
  if (m.coverRev === h.rev) return true;
  if (m.coverRev < h.forgotBelow) return false;
  for (const d of h.diffs) {
    if (d.rev <= m.coverRev) continue;
    if (d.all) return false;
    const tiles = d.tiles;
    for (let k = 0; k < tiles.length; k++) {
      const i = tiles[k]!;
      const x = i % width;
      const y = (i - x) / width;
      if (Math.abs(x - p.ox) <= r && Math.abs(y - p.oy) <= r) return false;
    }
  }
  m.coverRev = h.rev;
  return true;
}

const coverCaches = new WeakMap<MatchState, CoverCache>();

type KeyMemo = { rev: number; key: number };
const coverKeyMemos = new WeakMap<MatchState, KeyMemo>();
const visionKeyMemos = new WeakMap<MatchState, Map<string, KeyMemo>>();

/**
 * While a tick runs, the sight keys are hashed once per phase (`state.phaseRev`)
 * instead of once per check: bodies hold still inside a phase. Outside a tick
 * (a command between ticks, a test moving a unit by hand) every check hashes
 * afresh. `stepMatch` and `step` hold this while they run.
 */
let sightKeyMemoDepth = 0;

export function holdSightKeys(on: boolean): void {
  sightKeyMemoDepth += on ? 1 : -1;
  if (sightKeyMemoDepth < 0) sightKeyMemoDepth = 0;
}

/** True while a tick runs: a per-phase memo of the roster is safe, since nothing outside the sim moves it. */
export function sightKeysHeld(): boolean {
  return sightKeyMemoDepth > 0;
}

/** `coverKeyNow`, once per phase while a tick runs. */
function coverKey(state: MatchState): number {
  if (sightKeyMemoDepth === 0) return coverKeyNow(state);
  const m = coverKeyMemos.get(state);
  if (m && m.rev === state.phaseRev) return m.key;
  const key = coverKeyNow(state);
  coverKeyMemos.set(state, { rev: state.phaseRev, key });
  return key;
}

/**
 * Everything the sight cover is built from, hashed, so the grids are rebuilt only once something in them moved.
 * A building's hit points are not in it: a shell knocking chips off a wall leaves the line of sight where it was,
 * and hashing the bar would rebuild the whole cover every tick of a fight beside a wall. Only standing or down counts.
 */
function coverKeyNow(state: MatchState): number {
  let h = mix(2166136261, state.clearedTrees.length);
  h = mix(h, state.digRev);
  h = mix(h, state.width);
  for (const e of state.entities.values()) {
    if (e.kind !== "building") continue;
    h = mix(h, e.id);
    h = mix(h, e.tileX);
    h = mix(h, e.tileY);
    h = mix(h, e.hp <= 0 ? 0 : 1);
    h = mix(h, e.ruined ? 1 : 0);
  }
  return h;
}

/** The hulls and clouds on the ground: the layers of the cover that move every tick and are refreshed in place. */
function dynamicCoverKeyNow(state: MatchState): number {
  let h = 2166136261;
  for (const c of state.smokeClouds) {
    h = mix(h, c.id);
    h = mix(h, Math.round(c.x));
    h = mix(h, Math.round(c.y));
    h = mix(h, Math.round(c.life * 64));
  }
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || !isArmoredType(e.type)) continue;
    h = mix(h, e.id);
    h = mix(h, Math.round(e.x));
    h = mix(h, Math.round(e.y));
  }
  return h;
}

const dynamicKeyMemos = new WeakMap<MatchState, KeyMemo>();

function dynamicCoverKey(state: MatchState): number {
  if (sightKeyMemoDepth === 0) return dynamicCoverKeyNow(state);
  const m = dynamicKeyMemos.get(state);
  if (m && m.rev === state.phaseRev) return m.key;
  const key = dynamicCoverKeyNow(state);
  dynamicKeyMemos.set(state, { rev: state.phaseRev, key });
  return key;
}

/** The cover every eye of every side reads this tick, with its LOS flags. Rebuilt when `coverKey` moves. */
function coverOf(state: MatchState): CoverField {
  const key = coverKey(state);
  const hit = coverCaches.get(state);
  const n = state.width * state.height;
  if (hit && hit.key === key) {
    const dyn = dynamicCoverKey(state);
    if (dyn !== hit.dynamicKey) {
      memoStats.coverRefreshed++;
      refreshDynamicCover(state, hit);
      hit.dynamicKey = dyn;
      hit.rev++;
      hit.env = null;
    }
    return hit.cover;
  }
  memoStats.coverRebuilt++;
  if (state.hullMask.length !== n) state.hullMask = new Int32Array(n);
  state.hullMask.fill(0);
  const hullTiles = new Map<number, number[]>();
  stampHulls(state, state.hullMask, hullTiles);
  const smoke = ensureSmokeMask(state);
  const cover: CoverField = {
    terrain: state.terrain,
    // Rubble heaps are left out: they hold the ground but a sight ray passes over them.
    occupy: fillSightOccupy(state),
    hull: state.hullMask,
    smoke,
    losFlags: hit?.cover.losFlags?.length === n ? hit.cover.losFlags : new Uint8Array(n),
  };
  fillLosFlags(cover, cover.losFlags!);
  const smokeWas = hit?.smokeWas.length === n ? hit.smokeWas : new Uint8Array(n);
  smokeWas.set(smoke);
  coverCaches.set(state, {
    key,
    cover,
    env: null,
    rev: (hit?.rev ?? 0) + 1,
    dynamicKey: dynamicCoverKey(state),
    hullTiles,
    smokeWas,
    hadSmoke: state.smokeClouds.length > 0,
  });
  recordCoverDiff(state, cover);
  return cover;
}

/**
 * Hulls or clouds moved: clear the tiles the hulls held, stamp them where
 * they stand now, lay the smoke again, and recompute the LOS flags on just
 * the tiles that changed hands. The rest of the cover is untouched.
 */
function refreshDynamicCover(state: MatchState, hit: CoverCache): void {
  const cover = hit.cover;
  const hull = cover.hull as Int32Array;
  const flags = cover.losFlags!;
  const touched: number[] = [];
  for (const tiles of hit.hullTiles.values()) {
    for (let k = 0; k < tiles.length; k++) {
      hull[tiles[k]!] = 0;
      touched.push(tiles[k]!);
    }
  }
  stampHulls(state, hull, hit.hullTiles);
  for (const tiles of hit.hullTiles.values()) for (let k = 0; k < tiles.length; k++) touched.push(tiles[k]!);
  const smoke = cover.smoke as Uint8Array;
  const hasSmoke = state.smokeClouds.length > 0;
  if (hasSmoke || hit.hadSmoke) {
    state.smokeMaskTick = -1;
    ensureSmokeMask(state);
    const was = hit.smokeWas;
    for (let i = 0; i < smoke.length; i++) {
      if (smoke[i] !== was[i]) touched.push(i);
    }
    was.set(smoke);
    hit.hadSmoke = hasSmoke;
  }
  for (let k = 0; k < touched.length; k++) flags[touched[k]!] = losFlagAt(cover, touched[k]!);
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

/** `visionKeyNow`, once per side per phase while a tick runs: the hundreds of sight checks inside one phase share it. */
function visionKey(state: MatchState, playerId: string): number {
  if (sightKeyMemoDepth === 0) return visionKeyNow(state, playerId);
  const side = sightSideOf(state, playerId);
  let bySide = visionKeyMemos.get(state);
  if (!bySide) {
    bySide = new Map();
    visionKeyMemos.set(state, bySide);
  }
  const m = bySide.get(side);
  if (m && m.rev === state.phaseRev) return m.key;
  const key = visionKeyNow(state, playerId);
  bySide.set(side, { rev: state.phaseRev, key });
  return key;
}

function visionKeyNow(state: MatchState, playerId: string): number {
  let h = 2166136261;
  h = mix(h, state.clearedTrees.length);
  h = mix(h, state.digRev);
  const light = sightLightAt(state.tick, getMap(state.mapId)?.night);
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
    if (e.kind === "building") h = mix(h, sightDimmed(e) ? 1 : 0);
    if (light.spots && hasSpotlight(e.type)) {
      h = mix(h, e.crits.includes("lamp") ? 0 : 1);
      h = mix(h, e.garrison.length);
      h = mix(h, Math.round(lampHeading(spotFacingOf(e)) * 4096));
      h = mix(h, lampPools(e) ? 1 : 0);
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
    if (isGroveTile(terrain[i] ?? 0)) terrain[i] = TILE_EMPTY;
  }
  return terrain;
}

/**
 * One observer's lit tiles, kept while it holds still. `hulls` fingerprints
 * the static cover plus the armored hulls near the eye, `smoke` the static
 * cover plus every cloud inside its sight box.
 */
type SightMemo = {
  p: SightParams;
  hulls: number;
  smoke: number;
  /** Tick of the sweep that made `tiles`. */
  sweptTick: number;
  /** Cover rebuild the tiles are known good for (`CoverHistory.rev`). */
  coverRev: number;
  /** Ground the eye could light when `tiles` were made, for the repaint of a mask. */
  box?: TileBounds;
  tiles: Int32Array | null;
};

/**
 * A walking eye keeps its tiles while it has drifted at most this many tiles
 * from where it swept, for at most MOVE_STALE_TICKS. Sight around a corner
 * comes half a second late; the sweeps per tick fall by about half.
 */
export const MOVE_STALE_TILES = 2;
export const MOVE_STALE_TICKS = 6;
/**
 * Eyes that re-sweep in one paint of a side's mask. The rest keep their last
 * tiles one more tick and go first next time. A count, not a clock, so every
 * client runs the same sim; it bounds a tick instead of letting a big army
 * stall the server.
 */
export const SWEEP_BUDGET = 16;
/** An eye this close to one swept in the same paint, with the same reach, takes that eye's tiles instead of sweeping. */
export const SQUAD_SIGHT_TILES = 2;

/**
 * Ticks an eye keeps its tiles after a hull near it moved. The hull's old
 * shadow lingers that long; a fresh sweep comes sooner for any other change.
 */
export const HULL_STALE_TICKS = 5;

const sightMemos = new WeakMap<MatchState, Map<number, SightMemo>>();

/**
 * Sweeps by place: the tile an eye stood on and how it saw, whoever it was.
 * A patrol walking its loop again, or a file of soldiers following a leader,
 * finds the ground already swept and takes it under the same checks a
 * memo gets. Entries older than PLACE_MEMO_TICKS are dropped now and then.
 */
const placeMemos = new WeakMap<MatchState, Map<number, SightMemo>>();
const PLACE_MEMO_TICKS = 600;
const PLACE_MEMO_PRUNE_EVERY = 200;

function placeMemoOf(state: MatchState): Map<number, SightMemo> {
  let memo = placeMemos.get(state);
  if (!memo) {
    memo = new Map();
    placeMemos.set(state, memo);
  }
  return memo;
}

/** How an eye sees, apart from where it stands: reach, height, uphill bonus, lamp, footprint. */
function sightReachKey(p: SightParams): number {
  let h = mix(2166136261, p.radius);
  h = mix(h, Math.round(p.eye * 64));
  h = mix(h, Math.round(p.uphill * 64));
  h = mix(h, p.fw);
  h = mix(h, p.fh);
  h = mix(h, p.sr);
  h = mix(h, Math.round(p.sdx * 4096));
  h = mix(h, Math.round(p.sdy * 4096));
  h = mix(h, Math.round(p.scos * 4096));
  h = mix(h, Math.round(p.seye * 64));
  h = mix(h, Math.round((p.spr ?? 0) * 64));
  h = mix(h, Math.round((p.spa ?? 0) * 64));
  const flanks = p.flanks;
  if (flanks) for (let i = 0; i < flanks.length; i++) h = mix(mix(h, Math.round(flanks[i]!.dx * 4096)), Math.round(flanks[i]!.dy * 4096));
  return h;
}

function placeKey(p: SightParams, width: number): number {
  return mix(mix(sightReachKey(p), p.oy * width + p.ox), p.fw > 0 ? p.fy * width + p.fx : -1);
}

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

/** The cover's hull and cloud boxes with the static cover's hash, kept with the cover they describe. */
function sightEnvOf(state: MatchState, cover: CoverField): SightEnv {
  const hit = coverCaches.get(state);
  if (hit && hit.cover === cover && hit.env) return hit.env;
  const env = buildSightEnv(state, cover);
  if (hit && hit.cover === cover) hit.env = env;
  return env;
}

function buildSightEnv(state: MatchState, cover: CoverField): SightEnv {
  // Ground and footprints are not hashed here: what they changed is in the cover history, so only the eyes in reach of a change re-sweep.
  const base = mix(2166136261, state.digRev);
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

/**
 * A hull farther off than this throws a shadow too thin to re-sweep the eye
 * over each time it moves; sealing takes such slivers out anyway.
 */
const HULL_MEMO_TILES = 12;

/** Hash of the static cover and of every tile of `boxes` within `r` of the eye. */
function coverKeyNear(env: SightEnv, boxes: TileBox[], grid: ArrayLike<number>, p: SightParams, r: number, width: number, height: number): number {
  let h = env.base;
  const bx0 = Math.max(0, p.ox - r);
  const bx1 = Math.min(width - 1, p.ox + r);
  const by0 = Math.max(0, p.oy - r);
  const by1 = Math.min(height - 1, p.oy + r);
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
  return h;
}

/** Why memos were rebuilt, for benchmarks. */
export const memoStats = { hit: 0, fresh: 0, smoke: 0, params: 0, hulls: 0, cover: 0, drift: 0, deferred: 0, shared: 0, placed: 0, coverRebuilt: 0, coverRefreshed: 0, paints: 0 };

/** Same eye, same reach: only its tile may differ. */
function sameSightParamsButPlace(a: SightParams, b: SightParams): boolean {
  return sameSightParams({ ...a, ox: b.ox, oy: b.oy }, b);
}

/** Two eyes that see alike: same reach, height, uphill bonus and lamp, whoever they belong to and wherever they stand. */
function sameSightReach(a: SightParams, b: SightParams): boolean {
  return sameSightParams({ ...a, ox: b.ox, oy: b.oy, ignore: b.ignore }, b);
}
/** The tiles of the eye being swept, kept in its memo. */
const sweepKeep: LitList = { tiles: new Int32Array(8192), n: 0 };

/** Allied observers, widest sight first, with the sight they paint. */
function alliedSight(state: MatchState, playerId: string): { e: Entity; p: SightParams }[] {
  const observers: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) continue;
    if (!allies(state, playerId, e.ownerId)) continue;
    observers.push(e);
  }
  const radius = new Map<number, number>();
  for (const e of observers) radius.set(e.id, observerRadius(state, e));
  observers.sort((a, b) => radius.get(b.id)! - radius.get(a.id)!);
  const light = sightLightAt(state.tick, getMap(state.mapId)?.night);
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
 * Sight for a side that paints no fog mask: CPU seats and the neutral
 * garrison. A tile is seen when one allied eye near it has a clear ray to
 * it, under the rules `visionMask` sweeps with, without the small-island
 * sealing a painted picture gets. Answers are kept per tile until the side's
 * eyes or the cover move.
 */
type RayEye = { p: SightParams; box: TileBounds; dead: boolean };

type RaySight = {
  /** `state.phaseRev` the eyes were last checked against the roster, and the side's vision key then. */
  rev: number;
  key: number;
  eyes: Map<number, RayEye>;
  /** Eyes whose reach touches each RAY_CELL-tile square, so a tile asks only the eyes near it. Dead ones are skipped and swept out now and then. */
  buckets: RayEye[][];
  /** Dead eyes still listed in each bucket. */
  deadIn: Int32Array;
  /** Buckets per row. */
  cols: number;
  rows: number;
  cover: CoverField;
  coverRev: number;
  /** 0 or 1 per tile, good while `seenGen` matches its cell's `cellGen`. */
  seen: Int8Array;
  seenGen: Int32Array;
  /** Bumped for a cell whenever an eye near it moved or the cover changed, so its tiles forget their answers without a scan. */
  cellGen: Int32Array;
};

const raySights = new WeakMap<MatchState, Map<string, RaySight>>();
/** Side of one observer bucket, in tiles. */
const RAY_CELL = 8;

/** The tiles an eye can light, as a box: its reach around it, and its footprint. */
function eyeBounds(p: SightParams, width: number, height: number): TileBounds {
  const r = sightBoxRadius(p, true);
  let x0 = p.ox - r;
  let x1 = p.ox + r;
  let y0 = p.oy - r;
  let y1 = p.oy + r;
  if (p.fw > 0) {
    x0 = Math.min(x0, p.fx);
    y0 = Math.min(y0, p.fy);
    x1 = Math.max(x1, p.fx + p.fw - 1);
    y1 = Math.max(y1, p.fy + p.fh - 1);
  }
  return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(width - 1, x1), y1: Math.min(height - 1, y1) };
}

/**
 * The side's eyes, brought up to date once per phase: only an eye that moved
 * or changed reach is re-bucketed, and only the cells it could light before
 * and after forget their answers. A new cover forgets every cell.
 */
function raySightOf(state: MatchState, playerId: string): RaySight {
  let byPlayer = raySights.get(state);
  if (!byPlayer) {
    byPlayer = new Map();
    raySights.set(state, byPlayer);
  }
  const side = sightSideOf(state, playerId);
  const width = state.width;
  const height = state.height;
  const n = width * height;
  const cover = coverOf(state);
  let sight = byPlayer.get(side);
  if (!sight) {
    const cols = Math.ceil(width / RAY_CELL);
    const rows = Math.ceil(height / RAY_CELL);
    const buckets: RayEye[][] = [];
    for (let i = 0; i < cols * rows; i++) buckets.push([]);
    sight = {
      rev: -1,
      key: 0,
      eyes: new Map(),
      buckets,
      deadIn: new Int32Array(cols * rows),
      cols,
      rows,
      cover,
      coverRev: -1,
      seen: new Int8Array(n),
      seenGen: new Int32Array(n),
      cellGen: new Int32Array(cols * rows).fill(1),
    };
    byPlayer.set(side, sight);
  }
  const coverRev = coverRevOf(state);
  if (sight.cover !== cover || sight.coverRev !== coverRev) {
    sight.cover = cover;
    sight.coverRev = coverRev;
    const gens = sight.cellGen;
    for (let i = 0; i < gens.length; i++) gens[i]!++;
  }
  if (sightKeyMemoDepth > 0 && sight.rev === state.phaseRev) return sight;
  sight.rev = state.phaseRev;
  // The key hashes every allied eye's tile and reach: unchanged, the index stands as it is.
  const key = visionKey(state, playerId);
  if (key === sight.key && sight.eyes.size > 0) return sight;
  sight.key = key;
  const live = new Set<number>();
  for (const { e, p } of alliedSight(state, playerId)) {
    live.add(e.id);
    const old = sight.eyes.get(e.id);
    if (old && sameSightParams(old.p, p)) continue;
    if (old) dropRayEye(sight, old);
    const eye: RayEye = { p, box: eyeBounds(p, width, height), dead: false };
    const b = eye.box;
    const cx0 = (b.x0 / RAY_CELL) | 0;
    const cx1 = (b.x1 / RAY_CELL) | 0;
    const cy0 = (b.y0 / RAY_CELL) | 0;
    const cy1 = (b.y1 / RAY_CELL) | 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = cy * sight.cols + cx;
        sight.buckets[cell]!.push(eye);
        sight.cellGen[cell]!++;
      }
    }
    sight.eyes.set(e.id, eye);
  }
  for (const [id, eye] of sight.eyes) {
    if (live.has(id)) continue;
    dropRayEye(sight, eye);
    sight.eyes.delete(id);
  }
  return sight;
}

/** Mark the eye dead for its cells and forget their answers; a cell mostly dead is swept clean. */
function dropRayEye(sight: RaySight, eye: RayEye): void {
  eye.dead = true;
  const b = eye.box;
  const cx0 = (b.x0 / RAY_CELL) | 0;
  const cx1 = (b.x1 / RAY_CELL) | 0;
  const cy0 = (b.y0 / RAY_CELL) | 0;
  const cy1 = (b.y1 / RAY_CELL) | 0;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const cell = cy * sight.cols + cx;
      sight.cellGen[cell]!++;
      const bucket = sight.buckets[cell]!;
      const dead = ++sight.deadIn[cell]!;
      if (dead * 2 > bucket.length) {
        sight.buckets[cell] = bucket.filter((x) => !x.dead);
        sight.deadIn[cell] = 0;
      }
    }
  }
}

/** The sweep's test for one tile and one eye: in reach, a clear ray, no smoke on it, or under the eye's lamp. */
function paramSeesTile(
  p: SightParams,
  x: number,
  y: number,
  elev: Uint8Array,
  width: number,
  height: number,
  cover: CoverField,
): boolean {
  if (p.fw > 0 && x >= p.fx && x < p.fx + p.fw && y >= p.fy && y < p.fy + p.fh) return true;
  if (p.radius > 0) {
    const d = sightDist(x, y, p.ox, p.oy);
    const h0 = elevAtSafe(elev, width, height, p.ox, p.oy);
    const extra = p.uphill > 0 ? levelSightExtra(h0, elevAtSafe(elev, width, height, x, y), p.uphill) : 0;
    if (d <= p.radius + extra) {
      cover.ignoreOccupyId = p.ignore;
      if (
        losClear(elev, width, height, p.ox, p.oy, x, y, cover, p.eye) &&
        !(d > SMOKE_PEEK_TILES && coverSmokeAt(cover, width, height, x, y))
      ) {
        return true;
      }
    }
  }
  return spotLightsTile(p, x, y, elev, width, height, cover);
}

/** One sight ray, on the flagged fast path when the cover carries `losFlags` (same test as `paintSightBox`). */
function losClear(
  elev: ArrayLike<number>,
  width: number,
  height: number,
  ox: number,
  oy: number,
  x: number,
  y: number,
  cover: CoverField | undefined,
  eye: number,
): boolean {
  const flags = cover?.losFlags;
  if (
    cover &&
    flags &&
    cover.smoke &&
    elev instanceof Uint8Array &&
    ox >= 0 &&
    oy >= 0 &&
    ox < width &&
    oy < height &&
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height
  ) {
    return hasFullLosFlagged(elev, flags, cover, width, ox, oy, x, y, eye);
  }
  return hasFullLos(elev, width, height, ox, oy, x, y, cover, eye);
}

function rayTileLit(state: MatchState, sight: RaySight, x: number, y: number): boolean {
  const width = state.width;
  if (x < 0 || y < 0 || x >= width || y >= state.height) return false;
  const i = y * width + x;
  const cell = ((y / RAY_CELL) | 0) * sight.cols + ((x / RAY_CELL) | 0);
  const gen = sight.cellGen[cell]!;
  if (sight.seenGen[i] === gen) return sight.seen[i] === 1;
  let lit = 0;
  const near = sight.buckets[cell]!;
  for (let k = 0; k < near.length; k++) {
    const eye = near[k]!;
    if (eye.dead) continue;
    if (paramSeesTile(eye.p, x, y, state.heights, width, state.height, sight.cover)) {
      lit = 1;
      break;
    }
  }
  sight.seen[i] = lit;
  sight.seenGen[i] = gen;
  return lit === 1;
}

function rayEntityVisible(state: MatchState, playerId: string, e: Entity): boolean {
  const sight = raySightOf(state, playerId);
  if (e.kind === "building") {
    for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
      for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
        if (rayTileLit(state, sight, x, y)) return true;
      }
    }
    return false;
  }
  return rayTileLit(state, sight, worldToTile(e.x, state.tileSize), worldToTile(e.y, state.tileSize));
}

/**
 * Whose picture a player reads: allies on a team see with the same eyes, so
 * they share one mask, one key and one lazy picture.
 */
function sightSideOf(state: MatchState, playerId: string): string {
  const p = state.players.get(playerId);
  return p && p.team > 0 ? `team:${p.team}` : playerId;
}

/** Which paint of a mask array this is; the snapshot's run-length cache is keyed on it. */
const maskRevs = new WeakMap<Uint8Array, number>();
/** The two mask buffers a side alternates between, so a paint can start from the last one. */
const maskBuffers = new WeakMap<MatchState, Map<string, Uint8Array[]>>();

export function maskRevOf(mask: Uint8Array): number {
  return maskRevs.get(mask) ?? 0;
}

/** Observers this eye could copy its tiles from: swept or copied this paint, same reach, within SQUAD_SIGHT_TILES. */
type SquadSource = { p: SightParams; tiles: Int32Array };

function unionBounds(a: TileBounds | null, b: TileBounds): TileBounds {
  if (!a) return { ...b };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

function stampInside(mask: Uint8Array, tiles: Int32Array, width: number, b: TileBounds): void {
  for (let k = 0; k < tiles.length; k++) {
    const i = tiles[k]!;
    const x = i % width;
    if (x < b.x0 || x > b.x1) continue;
    const y = (i - x) / width;
    if (y < b.y0 || y > b.y1) continue;
    mask[i] = 1;
  }
}

/** The box around a lit list, or null when it is empty. */
function tileListBounds(tiles: Int32Array, width: number): TileBounds | null {
  if (tiles.length === 0) return null;
  let x0 = width;
  let x1 = -1;
  let y0 = Infinity;
  let y1 = -1;
  for (let k = 0; k < tiles.length; k++) {
    const i = tiles[k]!;
    const x = i % width;
    const y = (i - x) / width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function boxesTouch(a: TileBounds, b: TileBounds): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

/**
 * The side's fog mask: 1 where an allied eye lights the ground. Painted from
 * the last mask: only the ground around the eyes that swept, copied, or left
 * this time is cleared, re-stamped from every eye that reaches it, and
 * re-sealed; the rest stands. Nothing to repaint returns the same array.
 */
export function visionMask(state: MatchState, playerId: string): Uint8Array {
  const key = visionKey(state, playerId);
  const side = sightSideOf(state, playerId);
  const cached = state.visionByPlayer.get(side);
  if (cached && state.visionKeyByPlayer.get(side) === key) return cached;
  raySights.get(state)?.delete(side);
  const width = state.width;
  const height = state.height;
  const n = width * height;
  const cover = coverOf(state);
  const history = coverHistoryOf(state);
  const observers = alliedSight(state, playerId);
  const memo = sightMemoOf(state);
  const env = sightEnvOf(state, cover);
  const tick = state.tick;
  type Sweep = { id: number; p: SightParams; box: TileBounds; hulls: number; smoke: number; m: SightMemo | undefined };
  const fresh: Sweep[] = [];
  const stale: Sweep[] = [];
  const live = new Set<number>();
  // Ground whose paint may change: around every eye that sweeps, copies, or left. Boxes that touch merge.
  const dirty: TileBounds[] = [];
  const soil = (b: TileBounds): void => {
    for (let k = 0; k < dirty.length; k++) {
      const d = dirty[k]!;
      if (boxesTouch(d, b)) {
        dirty[k] = unionBounds(d, b);
        return;
      }
    }
    dirty.push({ ...b });
  };
  for (const { e, p } of observers) {
    live.add(e.id);
    const box = eyeBounds(p, width, height);
    const reach = sightBoxRadius(p, true);
    const hulls = coverKeyNear(env, env.hulls, env.hull, p, Math.min(reach, HULL_MEMO_TILES), width, height);
    const smoke = coverKeyNear(env, env.clouds, env.smoke, p, reach, width, height);
    const m = memo.get(e.id);
    if (!m || !m.tiles) {
      memoStats.fresh++;
      fresh.push({ id: e.id, p, box, hulls, smoke, m });
      continue;
    }
    // The eye walked on: a short drift keeps its tiles; a longer one, or a change of reach, sweeps.
    const samePlace = sameSightParams(m.p, p);
    const drifted =
      !samePlace &&
      sameSightParamsButPlace(m.p, p) &&
      Math.abs(m.p.ox - p.ox) <= MOVE_STALE_TILES &&
      Math.abs(m.p.oy - p.oy) <= MOVE_STALE_TILES &&
      tick - m.sweptTick < MOVE_STALE_TICKS;
    const good =
      (samePlace || drifted) &&
      m.smoke === smoke &&
      (m.hulls === hulls || tick - m.sweptTick < HULL_STALE_TICKS) &&
      coverStillGood(m, p, reach, history, width);
    if (good) {
      if (drifted) memoStats.drift++;
      else memoStats.hit++;
      continue;
    }
    if (m.smoke !== smoke) memoStats.smoke++;
    else if (!samePlace) memoStats.params++;
    else if (m.hulls !== hulls) memoStats.hulls++;
    else memoStats.cover++;
    stale.push({ id: e.id, p, box, hulls, smoke, m });
  }
  // Eyes that left this side (dead, wrecked, gone): their ground is repainted without them. Another side's eyes stay.
  for (const [id, m] of memo) {
    if (live.has(id)) continue;
    const e = state.entities.get(id);
    if (e && e.hp > 0 && !e.wreck && !allies(state, playerId, e.ownerId)) continue;
    if (m.box) soil(m.box);
    memo.delete(id);
  }
  // The eyes longest without a sweep go first. Past the budget an eye keeps last tick's tiles and waits a tick.
  stale.sort((a, b) => a.m!.sweptTick - b.m!.sweptTick || a.id - b.id);
  const todo = fresh.concat(stale);
  for (let k = fresh.length + SWEEP_BUDGET; k < todo.length; k++) memoStats.deferred++;
  const work = todo.slice(0, fresh.length + SWEEP_BUDGET);
  // Start from the last paint when there is one; the other buffer takes this paint, so a changed mask is a new array.
  let bufs = maskBuffers.get(state);
  if (!bufs) {
    bufs = new Map();
    maskBuffers.set(state, bufs);
  }
  let pair = bufs.get(side);
  if (!pair || pair[0]!.length !== n) {
    pair = [new Uint8Array(n), new Uint8Array(n)];
    bufs.set(side, pair);
  }
  const prev = cached && cached.length === n ? cached : null;
  if (work.length === 0 && dirty.length === 0 && prev) {
    state.visionKeyByPlayer.set(side, key);
    state.visionTick = tick;
    return prev;
  }
  const mask = pair[0] === prev ? pair[1]! : pair[0]!;
  memoStats.paints++;
  const places = placeMemoOf(state);
  if (tick % PLACE_MEMO_PRUNE_EVERY === 0) {
    for (const [k, m] of places) if (tick - m.sweptTick > PLACE_MEMO_TICKS) places.delete(k);
  }
  if (sweepScratchMask.length !== n) sweepScratchMask = new Uint8Array(n);
  const squad: SquadSource[] = [];
  armLosFastPath(state.heights, cover.losFlags!, width, height, coverRevOf(state));
  armSightBlocks(state.heights, width, height, state.digRev);
  try {
    // Sweep, or copy a squad mate's tiles, into the memo first; the mask is painted below.
    for (const s of work) {
      if (s.m?.box) soil(s.m.box);
      let tiles: Int32Array | null = null;
      for (const q of squad) {
        if (
          Math.abs(q.p.ox - s.p.ox) <= SQUAD_SIGHT_TILES &&
          Math.abs(q.p.oy - s.p.oy) <= SQUAD_SIGHT_TILES &&
          sameSightReach(q.p, s.p)
        ) {
          tiles = q.tiles;
          break;
        }
      }
      if (tiles) memoStats.shared++;
      else {
        // Someone swept from this very tile, seeing the same way, and nothing in reach changed since.
        const pm = places.get(placeKey(s.p, width));
        if (
          pm &&
          pm.tiles &&
          pm.p.ox === s.p.ox &&
          pm.p.oy === s.p.oy &&
          sameSightReach(pm.p, s.p) &&
          pm.smoke === s.smoke &&
          (pm.hulls === s.hulls || tick - pm.sweptTick < HULL_STALE_TICKS) &&
          coverStillGood(pm, s.p, sightBoxRadius(s.p, true), history, width)
        ) {
          tiles = pm.tiles;
          memoStats.placed++;
        }
      }
      if (!tiles) {
        sweepKeep.n = 0;
        paintSightParams(sweepScratchMask, width, height, s.p, state.heights, cover, sweepKeep);
        tiles = sweepKeep.tiles.slice(0, sweepKeep.n);
        for (let k = 0; k < tiles.length; k++) sweepScratchMask[tiles[k]!] = 0;
        squad.push({ p: s.p, tiles });
      }
      // The ground actually lit is usually well inside the reach box: keep that, so later repaints stay small.
      const litBox = tileListBounds(tiles, width) ?? s.box;
      soil(litBox);
      const entry: SightMemo = { p: s.p, box: litBox, hulls: s.hulls, smoke: s.smoke, sweptTick: tick, coverRev: history.rev, tiles };
      memo.set(s.id, entry);
      places.set(placeKey(s.p, width), entry);
    }
    if (prev) {
      mask.set(prev);
    } else {
      mask.fill(0);
      dirty.length = 0;
      dirty.push({ x0: 0, y0: 0, x1: width - 1, y1: height - 1 });
    }
    // Merge again: a late box may have bridged two earlier ones.
    for (let i = 0; i < dirty.length; i++) {
      for (let j = dirty.length - 1; j > i; j--) {
        if (boxesTouch(dirty[i]!, dirty[j]!)) {
          dirty[i] = unionBounds(dirty[i]!, dirty[j]!);
          dirty.splice(j, 1);
        }
      }
    }
    for (const box of dirty) {
      for (let y = box.y0; y <= box.y1; y++) mask.fill(0, y * width + box.x0, y * width + box.x1 + 1);
      for (const { e } of observers) {
        const m = memo.get(e.id);
        if (!m || !m.tiles || !m.box || !boxesTouch(m.box, box)) continue;
        stampInside(mask, m.tiles, width, box);
      }
      sealFovIslands(mask, width, height, FOV_ISLAND_LIMIT, box);
    }
  } finally {
    clearLosFastPath();
  }
  maskRevs.set(mask, (maskRevs.get(mask) ?? 0) + 1);
  state.visionByPlayer.set(side, mask);
  state.visionKeyByPlayer.set(side, key);
  state.visionTick = tick;
  return mask;
}

/** A spare mask the sweep paints into; its tiles are wiped again after each sweep. */
let sweepScratchMask = new Uint8Array(0);

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
        // A house down to its rubble lets sight through: its map feature's stamp comes off.
        const id = isRubble(e) ? 0 : e.id;
        if (isTurnedBuilding(e)) {
          for (const t of buildingTilesOf(e, tileSize)) {
            if (t.x >= 0 && t.y >= 0 && t.x < width && t.y < height) occupy[t.y * width + t.x] = id;
          }
        } else stampOccupy(occupy, width, height, id, e.tileX, e.tileY, e.tileW, e.tileH);
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
  const light = sightLightAt(snap.tick, map?.night);
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
  if (elev) armSightBlocks(elev, width, height);
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
  return lowPowerSight(sightTilesOf(e.type, h, liveSightExtra(e)), sightDimmed(e));
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
  if (hiddenBurrowed(state, playerId, e)) return false;
  if (hiddenCloaked(state, playerId, e)) return false;
  if (sonarSpotted(state, playerId, e)) return true;
  if (mask) return entityOnMask(e, mask, state.width, state.height, state.tileSize);
  return entityVisibleToPlayer(state, playerId, e);
}

/**
 * A human side reads its painted mask, built now if the one it holds is
 * stale, so combat and the snapshot agree. A CPU seat or the neutral
 * garrison asks the rays instead of painting.
 */
function entityVisibleToPlayer(state: MatchState, playerId: string, e: Entity): boolean {
  const player = state.players.get(playerId);
  if (player && !player.ai) {
    return entityOnMask(e, visionMask(state, playerId), state.width, state.height, state.tileSize);
  }
  const key = visionKey(state, playerId);
  const side = sightSideOf(state, playerId);
  const cached = state.visionByPlayer.get(side);
  if (cached && state.visionKeyByPlayer.get(side) === key) {
    return entityOnMask(e, cached, state.width, state.height, state.tileSize);
  }
  return rayEntityVisible(state, playerId, e);
}

export function canSeeWorld(state: MatchState, mask: Uint8Array, wx: number, wy: number): boolean {
  const tx = worldToTile(wx, state.tileSize);
  const ty = worldToTile(wy, state.tileSize);
  if (!inBounds(state, tx, ty)) return false;
  return tileOnMask(mask, state.width, tx, ty);
}
