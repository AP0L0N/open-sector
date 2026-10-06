import { turnedBox } from "./building-rect.js";
import {
  BUILDING_FACINGS,
  BUILDING_TURN_STEP,
  HEIGHT_BASE,
  HEIGHT_MAX,
  HEIGHT_STEP_MAX,
  TILE_SIZE,
  TILE_SUBDIV,
  catalog,
  type CivilianType,
  type TrainType,
} from "./catalog.js";

export interface SpawnDef {
  id: number;
  x: number;
  y: number;
  suggestedTeam?: number;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  spawns: SpawnDef[];
  /** 0 = empty, 1 = blocked */
  tiles: number[];
  /** Discrete elevation per tile. Same length as `tiles`. 0 = valley floor. */
  heights: number[];
  /** Max of `heights`. Cached so render/pick do not scan the map. */
  maxHeight: number;
  /** Civilian houses and neutral defences. See `featureBox` for where each sits. */
  features: MapFeature[];
  /** Street lamps. Dress only: the sim never reads them; the client draws them and their light at night. */
  lamps?: MapLamp[];
  /** Breakable clutter. The sim keeps which pieces still stand; see `ClutterType`. */
  clutter?: MapClutter[];
  /** Neutral units the map stands on the field. Grey, hostile to every commander, they hold their ground. */
  units?: MapUnit[];
  /**
   * Complete fog of war: ground a commander has never seen is black, not dimmed.
   * Drawing only: sight and the sim are the same either way.
   */
  shroud?: boolean;
  /** Set on maps made in the Map Builder. Built-in maps leave it out and cannot be edited. */
  custom?: { author: string; updatedAt: number };
}

/** Defences a map stands on the field, neutral until someone takes them. */
export type MapDefenceType = "bunker" | "tower" | "sandbags" | "wall";
export const MAP_DEFENCE_TYPES: readonly MapDefenceType[] = ["bunker", "tower", "sandbags", "wall"];
/** Map defences laid as a line section rather than on a building lot. */
export type MapSectionType = "sandbags" | "wall";
export type MapFeatureType = CivilianType | MapDefenceType;

export interface MapFeature {
  type: MapFeatureType;
  x: number;
  y: number;
  /** Cardinal face. 0 = east, then south, west, north. A section looks this way and runs across it. */
  facing: number;
  /**
   * A defence turned finer than a quarter, the way the player turns one in a match:
   * BUILDING_TURN_STEPs (15°) clockwise from east, 0 to BUILDING_FACINGS - 1. When set it
   * wins over `facing`, which then holds the nearest quarter. Houses leave it out.
   * A turned bunker or tower keeps x, y as its unturned lot and turns about that lot.
   * A section's x, y may then be fractional (whole world px), so a slanted line lies end to end.
   */
  turn?: number;
  /** Watch Tower only: where its spotlight points, whole degrees, 0 = east, 90 = south. Left out, it looks the way the tower faces. */
  spot?: number;
  /** Watch Tower only: fine tiles the spotlight sweeps between, from the tower, as a held tower's Patrol sweeps them. */
  patrol?: { x: number; y: number }[];
  /** The sweep closes into a loop instead of running out and back. */
  loop?: boolean;
}

/** Street lamps a map can stand on its ground. Drawing only: they light the night, they do not block or reveal. */
export type LampType = "gaslamp" | "streetlamp" | "floodlight";
export const LAMP_TYPES: readonly LampType[] = ["gaslamp", "streetlamp", "floodlight"];

export const LAMP_NAMES: Record<LampType, string> = {
  gaslamp: "Gas Lamp",
  streetlamp: "Street Lamp",
  floodlight: "Floodlight",
};

export interface MapLamp {
  type: LampType;
  /** Fine tile the post stands on. */
  x: number;
  y: number;
}

/**
 * A neutral unit the map stands on the field at the start. It belongs to no one,
 * fires on anyone in its sight, and never leaves its post except to walk `patrol`.
 */
export interface MapUnit {
  type: TrainType;
  /** Fine tile it stands on. */
  x: number;
  y: number;
  /** Heading in whole degrees, 0 = east, 90 = south. */
  facing: number;
  /** Fine tiles of a patrol route, walked from where it stands. */
  patrol?: { x: number; y: number }[];
  /** The route closes into a loop instead of running out and back. */
  loop?: boolean;
  /**
   * Infantry that start inside the house, bunker, or tower whose lot holds (x, y),
   * at the lot's centre tile. They hold it for no one and shoot from its windows.
   */
  inside?: boolean;
  /** Battle Ship only: where its searchlight points, whole degrees, 0 = east, 90 = south. Left out, it looks down the bow. */
  spot?: number;
}

/**
 * Breakable odds and ends a map leaves on its ground: crates, drums, a cart.
 * They neither block nor hide anyone. A motor vehicle rolling over one, a shell
 * landing on it, or enough rounds into it leaves it smashed flat for the match.
 */
export type ClutterType = "crates" | "barrels" | "haybale" | "cart" | "bench" | "woodpile" | "tires" | "bins";
export const CLUTTER_TYPES: readonly ClutterType[] = ["crates", "barrels", "haybale", "cart", "bench", "woodpile", "tires", "bins"];

export const CLUTTER_NAMES: Record<ClutterType, string> = {
  crates: "Crates",
  barrels: "Oil Drums",
  haybale: "Hay Bales",
  cart: "Hand Cart",
  bench: "Bench",
  woodpile: "Woodpile",
  tires: "Tyre Stack",
  bins: "Dustbins",
};

export interface MapClutter {
  type: ClutterType;
  /** Fine tile it stands on. */
  x: number;
  y: number;
}

export function isClutterType(type: unknown): type is ClutterType {
  return typeof type === "string" && (CLUTTER_TYPES as readonly string[]).includes(type);
}

export function isLampType(type: unknown): type is LampType {
  return typeof type === "string" && (LAMP_TYPES as readonly string[]).includes(type);
}

export function isMapSection(type: string): type is MapSectionType {
  return type === "sandbags" || type === "wall";
}

/** Fine tiles a map section covers along its run, centred on its own tile. */
export const MAP_SECTION_TILES = 3;
/** Fine tiles a map section is thick, across its run. */
const MAP_SECTION_THICK = 1;
/**
 * How far two sections may cut into each other before they count as overlapping, fine
 * tiles off each half-size. The pieces of one line meet in mitred corners that touch.
 */
const SECTION_SLACK = 0.45;

/** The quarter nearest to a turn, as `facing` stores it. */
export function turnQuarter(turn: number): number {
  return Math.round(turn / (BUILDING_FACINGS / 4)) & 3;
}

/** World radians the feature faces: 0 east, clockwise. */
export function featureAngle(f: MapFeature): number {
  return f.turn != null ? f.turn * BUILDING_TURN_STEP : ((f.facing & 3) * Math.PI) / 2;
}

/** A house, bunker, or tower's ground box in fine tiles, and the facing it stands at. Same as a placed building's site. */
export function featureLotSite(f: MapFeature): { tx: number; ty: number; w: number; h: number; facing: number } {
  const def = catalog(f.type);
  if (f.turn == null) return { tx: f.x, ty: f.y, w: def.tileW, h: def.tileH, facing: featureAngle(f) };
  const facing = featureAngle(f);
  const box = turnedBox(f.type, facing);
  // Centred on the unturned lot; an odd box sits half a tile toward the top-left.
  return {
    tx: f.x + Math.floor((def.tileW - box.w) / 2),
    ty: f.y + Math.floor((def.tileH - box.h) / 2),
    w: box.w,
    h: box.h,
    facing,
  };
}

/** A feature's real ground in fine tiles: centre, the axis it faces (u), the axis across (v), and half sizes. */
export interface FeatureRect {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  halfU: number;
  halfV: number;
}

export function featureRect(f: MapFeature): FeatureRect {
  if (isMapSection(f.type)) {
    const a = featureAngle(f);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    return { cx: f.x + 0.5, cy: f.y + 0.5, ux, uy, vx: -uy, vy: ux, halfU: MAP_SECTION_THICK / 2, halfV: MAP_SECTION_TILES / 2 };
  }
  const def = catalog(f.type);
  const s = featureLotSite(f);
  // A house does not turn its ground; its door side is only art.
  const a = f.turn != null ? s.facing : 0;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  return { cx: s.tx + s.w / 2, cy: s.ty + s.h / 2, ux, uy, vx: -uy, vy: ux, halfU: def.tileW / 2, halfV: def.tileH / 2 };
}

/** True when the fine-tile point lies on the feature's ground, `pad` tiles out from its edge. */
export function featureContains(f: MapFeature, px: number, py: number, pad = 0): boolean {
  const r = featureRect(f);
  const dx = px - r.cx;
  const dy = py - r.cy;
  return Math.abs(dx * r.ux + dy * r.uy) <= r.halfU + pad && Math.abs(dx * r.vx + dy * r.vy) <= r.halfV + pad;
}

/** True when two features' ground overlaps. Sections may meet in a corner without counting. */
export function featureRectsOverlap(a: MapFeature, b: MapFeature): boolean {
  const slack = isMapSection(a.type) && isMapSection(b.type) ? SECTION_SLACK : 0;
  const p = featureRect(a);
  const q = featureRect(b);
  const pu = p.halfU - slack;
  const pv = p.halfV - slack;
  const qu = q.halfU - slack;
  const qv = q.halfV - slack;
  const dx = q.cx - p.cx;
  const dy = q.cy - p.cy;
  // Separating axes: both rectangles' edges.
  for (const [nx, ny] of [
    [p.ux, p.uy],
    [p.vx, p.vy],
    [q.ux, q.uy],
    [q.vx, q.vy],
  ] as const) {
    const d = Math.abs(dx * nx + dy * ny);
    const rp = pu * Math.abs(p.ux * nx + p.uy * ny) + pv * Math.abs(p.vx * nx + p.vy * ny);
    const rq = qu * Math.abs(q.ux * nx + q.uy * ny) + qv * Math.abs(q.vx * nx + q.vy * ny);
    if (d >= rp + rq - 1e-6) return false;
  }
  return true;
}

/** Fine-tile box of a feature, end exclusive. A lot's origin is its top-left; a section's is its centre. */
export function featureBox(f: MapFeature): { x0: number; y0: number; x1: number; y1: number } {
  if (isMapSection(f.type)) {
    const r = featureRect(f);
    const ex = r.halfU * Math.abs(r.ux) + r.halfV * Math.abs(r.vx);
    const ey = r.halfU * Math.abs(r.uy) + r.halfV * Math.abs(r.vy);
    return {
      x0: Math.floor(r.cx - ex + 1e-6),
      y0: Math.floor(r.cy - ey + 1e-6),
      x1: Math.ceil(r.cx + ex - 1e-6),
      y1: Math.ceil(r.cy + ey - 1e-6),
    };
  }
  const s = featureLotSite(f);
  return { x0: s.tx, y0: s.ty, x1: s.tx + s.w, y1: s.ty + s.h };
}

/** Houses, bunkers, and towers: the features that stand on a levelled lot. */
export function lotFeatures(features: readonly MapFeature[]): MapFeature[] {
  return features.filter((f) => !isMapSection(f.type));
}

export const TILE_EMPTY = 0;
export const TILE_BLOCKED = 1;
export const TILE_SCRAP = 2;
export const TILE_WATER = 3;
export const TILE_TREE = 4;
/** Walkable dirt lane. Same movement as open ground. */
export const TILE_ROAD = 5;
/** Wooden fence. Blocks walking. A shot still passes over it. */
export const TILE_FENCE = 6;
/**
 * Rocky slope. Blocks walking the same way a fence does, and does not stop
 * sight or a shot, so a hilltop still looks down across it.
 */
export const TILE_ROCK = 7;
/**
 * Diamond scrap. A scrap field with stones glinting through the salvage. It plays
 * like scrap in every way, except that a Smelter on it pours DIAMOND_SCRAP_MUL times as much.
 */
export const TILE_DIAMOND_SCRAP = 8;

/** Scrap of either grade, plain or diamond. */
export function isScrapTile(t: number | undefined): boolean {
  return t === TILE_SCRAP || t === TILE_DIAMOND_SCRAP;
}

function idx(width: number, x: number, y: number): number {
  return y * width + x;
}

function fillRect(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
): void {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(width - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(height - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      tiles[idx(width, x, y)] = value;
    }
  }
}

const BLOB: readonly [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 0],
  [0, -1],
  [2, 1],
  [1, 2],
];

function paintScrapBlob(tiles: number[], width: number, height: number, cx: number, cy: number): void {
  for (const [dx, dy] of BLOB) {
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = idx(width, x, y);
    if (tiles[i] === TILE_EMPTY) tiles[i] = TILE_SCRAP;
  }
}

/** Cells from a start to the scrap field a commander is given: past the Rig's pad, inside the yard's build range. */
const HOME_SCRAP_CELLS = 9;
/** A scattered field this close to a start, in cells, already serves as its home field. */
const HOME_SCRAP_REACH_CELLS = 12;

/**
 * Scattered scrap fields. The seed keeps every client on the same yard. A start that none of
 * them landed near gets one toward the map's middle, so a Smelter can always go up from the yard.
 */
function paintYardScrap(
  tiles: number[],
  width: number,
  height: number,
  seed: string,
  spawns: readonly { x: number; y: number }[],
  blobs = 14,
): void {
  const rng = { n: hash32(seed) };
  const pads = spawns.map((s) => ({ x: s.x, y: s.y, r: 7 }));
  const centers: { x: number; y: number }[] = [];
  let guard = 0;
  const guardMax = blobs === 14 ? 600 : blobs * 40;
  while (centers.length < blobs && guard < guardMax) {
    guard += 1;
    const cx = 4 + Math.floor(nextRand(rng) * (width - 8));
    const cy = 4 + Math.floor(nextRand(rng) * (height - 8));
    if (inPad(pads, cx, cy)) continue;
    if ((tiles[idx(width, cx, cy)] ?? 1) !== TILE_EMPTY) continue;
    let crowded = false;
    for (const c of centers) {
      const dx = c.x - cx;
      const dy = c.y - cy;
      if (dx * dx + dy * dy < 10 * 10) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;
    centers.push({ x: cx, y: cy });
    paintScrapBlob(tiles, width, height, cx, cy);
  }
  // A start with no field in yard range gets one toward the middle, past the Rig's pad.
  for (const s of spawns) {
    if (centers.some((c) => Math.hypot(c.x - s.x, c.y - s.y) <= HOME_SCRAP_REACH_CELLS)) continue;
    const dx = width / 2 - s.x;
    const dy = height / 2 - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = Math.round(s.x + (dx / len) * HOME_SCRAP_CELLS);
    const cy = Math.round(s.y + (dy / len) * HOME_SCRAP_CELLS);
    centers.push({ x: cx, y: cy });
    paintScrapBlob(tiles, width, height, cx, cy);
  }
}

/**
 * The scrap field nearest the map's middle turns to diamond scrap: the richest
 * ground on the map, and as far from every start as a field gets.
 */
function promoteCentreScrap(tiles: number[], width: number, height: number): void {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  let start = -1;
  let best = Infinity;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== TILE_SCRAP) continue;
    const d = Math.hypot((i % width) - cx, Math.floor(i / width) - cy);
    if (d < best) {
      best = d;
      start = i;
    }
  }
  if (start < 0) return;
  tiles[start] = TILE_DIAMOND_SCRAP;
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const [dx, dy] of WATER_ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const k = idx(width, nx, ny);
      if (tiles[k] !== TILE_SCRAP) continue;
      tiles[k] = TILE_DIAMOND_SCRAP;
      stack.push(k);
    }
  }
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextRand(state: { n: number }): number {
  state.n = (Math.imul(state.n, 1664525) + 1013904223) >>> 0;
  return state.n / 4294967296;
}

/**
 * A flat-topped hill or a flat-floored basin. Inside the crown ellipse the
 * ground moves by the full `delta`; past its rim the ground falls off at one
 * step per tile along every ray, the same ramp a pond bank gets. The flank
 * then reads as one incline between two flat levels instead of a rounded
 * swell whose slope is too gentle to shade.
 */
function splatMesa(
  heights: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  crownX: number,
  crownY: number,
  delta: number,
  ceil = HEIGHT_MAX,
): void {
  if (delta === 0) return;
  const run = Math.abs(delta);
  const kx = Math.max(1, crownX);
  const ky = Math.max(1, crownY);
  const reach = Math.max(kx, ky) + run + 1;
  const x0 = Math.max(0, Math.floor(cx - reach));
  const x1 = Math.min(width - 1, Math.ceil(cx + reach));
  const y0 = Math.max(0, Math.floor(cy - reach));
  const y1 = Math.min(height - 1, Math.ceil(cy + reach));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ox = x - cx;
      const oy = y - cy;
      // Distance to the crown rim in crown radii (1 on the rim)...
      const d = Math.hypot(ox / kx, oy / ky);
      // ...and in tiles along this ray, so the ramp is `run` tiles long everywhere.
      const past = d <= 1 ? 0 : Math.hypot(ox, oy) * (1 - 1 / d);
      if (past >= run) continue;
      const mag = Math.round(delta * (1 - past / run));
      if (mag === 0) continue;
      const i = idx(width, x, y);
      const cur = heights[i] ?? HEIGHT_BASE;
      heights[i] = Math.min(ceil, Math.max(0, cur + mag));
    }
  }
}

function hashNoise(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h >>> 0) / 4294967296;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hashNoise(x0, y0, seed);
  const n10 = hashNoise(x0 + 1, y0, seed);
  const n01 = hashNoise(x0, y0 + 1, seed);
  const n11 = hashNoise(x0 + 1, y0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function rollingDelta(x: number, y: number, seed: number): number {
  const n0 = smoothNoise(x / 14, y / 14, seed);
  const n1 = smoothNoise(x / 7, y / 7, seed ^ 0x9e3779b9);
  const n2 = smoothNoise(x / 3.5, y / 3.5, seed ^ 0x85ebca6b);
  const n = (n0 * 4 + n1 * 2 + n2) / 7;
  return Math.round((n - 0.5) * 6);
}

function paintRolling(heights: number[], width: number, height: number, seed: string, ceil = HEIGHT_MAX): void {
  const s = hash32(seed);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(width, x, y);
      const cur = heights[i] ?? HEIGHT_BASE;
      heights[i] = Math.min(ceil, Math.max(0, cur + rollingDelta(x, y, s)));
    }
  }
}

function relaxSlopes(
  heights: number[],
  width: number,
  height: number,
  locked?: Uint8Array,
): void {
  const step = HEIGHT_STEP_MAX;
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(width, x, y);
        if (locked?.[i]) continue;
        let h = heights[i] ?? 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = heights[idx(width, nx, ny)] ?? 0;
            if (h > n + step) {
              h = n + step;
              heights[i] = h;
              changed = true;
            }
          }
        }
      }
    }
  }
  if (!locked) return;
  const q: number[] = [];
  for (let i = 0; i < locked.length; i++) {
    if (locked[i]) q.push(i);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]!;
    const x = i % width;
    const y = (i / width) | 0;
    const h = heights[i] ?? 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = idx(width, nx, ny);
        if (locked[ni]) continue;
        const need = h - step;
        if (need <= 0) continue;
        const n = heights[ni] ?? 0;
        if (n >= need) continue;
        heights[ni] = need;
        q.push(ni);
      }
    }
  }
}

function flattenPad(
  heights: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
  z = HEIGHT_BASE,
): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (Math.hypot(x - cx, y - cy) <= r) heights[idx(width, x, y)] = z;
    }
  }
}

function markPad(
  locked: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  r: number,
): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (Math.hypot(x - cx, y - cy) <= r) locked[idx(width, x, y)] = 1;
    }
  }
}

function upsampleTiles(src: number[], sw: number, sh: number, sub: number): number[] {
  const width = sw * sub;
  const height = sh * sub;
  const out = new Array<number>(width * height);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const v = src[y * sw + x] ?? 0;
      for (let dy = 0; dy < sub; dy++) {
        for (let dx = 0; dx < sub; dx++) {
          out[(y * sub + dy) * width + (x * sub + dx)] = v;
        }
      }
    }
  }
  return out;
}

function scaleSpawn(s: SpawnDef, sub: number): SpawnDef {
  const mid = Math.floor(sub / 2);
  return { ...s, x: s.x * sub + mid, y: s.y * sub + mid };
}

function inPad(pads: readonly { x: number; y: number; r: number }[], x: number, y: number): boolean {
  for (const p of pads) {
    if (Math.hypot(x - p.x, y - p.y) <= p.r) return true;
  }
  return false;
}

const WATER_ORTHO: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function inHouseBox(
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
  x: number,
  y: number,
): boolean {
  for (const h of houses) {
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return true;
  }
  return false;
}

function houseBoxes(features: readonly MapFeature[], sub: number): { x0: number; y0: number; x1: number; y1: number }[] {
  return features.map((f) => {
    const def = catalog(f.type);
    const tw = Math.round(def.tileW / TILE_SUBDIV) * sub;
    const th = Math.round(def.tileH / TILE_SUBDIV) * sub;
    return { x0: f.x * sub, y0: f.y * sub, x1: f.x * sub + tw - 1, y1: f.y * sub + th - 1 };
  });
}

function canPaintWater(
  tiles: number[],
  width: number,
  height: number,
  x: number,
  y: number,
  pads: readonly { x: number; y: number; r: number }[],
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): boolean {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
  if (inPad(pads, x, y)) return false;
  if (inHouseBox(houses, x, y)) return false;
  const t = tiles[idx(width, x, y)] ?? 1;
  return t === TILE_EMPTY || t === TILE_WATER;
}

/** Seeded metaball lake. Overlapping lobes + shoreline warp so ponds are not rectangles. */
function paintOrganicPond(
  tiles: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): number {
  const rad = Math.max(6, radius);
  const balls: { x: number; y: number; r: number }[] = [
    { x: cx, y: cy, r: rad * (0.88 + nextRand(rng) * 0.18) },
  ];
  const extra = 1 + Math.floor(nextRand(rng) * 2);
  for (let i = 0; i < extra; i++) {
    const ang = nextRand(rng) * Math.PI * 2;
    const dist = rad * (0.28 + nextRand(rng) * 0.5);
    balls.push({
      x: cx + Math.cos(ang) * dist,
      y: cy + Math.sin(ang) * dist,
      r: rad * (0.3 + nextRand(rng) * 0.38),
    });
  }
  const bites: { x: number; y: number; r: number }[] = [];
  const biteCount = 1 + Math.floor(nextRand(rng) * 2);
  for (let i = 0; i < biteCount; i++) {
    const ang = nextRand(rng) * Math.PI * 2;
    bites.push({
      x: cx + Math.cos(ang) * rad * (0.72 + nextRand(rng) * 0.28),
      y: cy + Math.sin(ang) * rad * (0.72 + nextRand(rng) * 0.28),
      r: rad * (0.28 + nextRand(rng) * 0.22),
    });
  }
  const warp = 0.9 + nextRand(rng) * 1.2;
  const p1 = nextRand(rng) * Math.PI * 2;
  const p2 = nextRand(rng) * Math.PI * 2;
  const p3 = nextRand(rng) * Math.PI * 2;
  const thresh = 1.02 + nextRand(rng) * 0.14;
  let minX = cx;
  let maxX = cx;
  let minY = cy;
  let maxY = cy;
  for (const b of balls) {
    minX = Math.min(minX, b.x - b.r);
    maxX = Math.max(maxX, b.x + b.r);
    minY = Math.min(minY, b.y - b.r);
    maxY = Math.max(maxY, b.y + b.r);
  }
  const pad = warp + 3;
  const x0 = Math.max(1, Math.floor(minX - pad));
  const x1 = Math.min(width - 2, Math.ceil(maxX + pad));
  const y0 = Math.max(1, Math.floor(minY - pad));
  const y1 = Math.min(height - 2, Math.ceil(maxY + pad));
  let painted = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!canPaintWater(tiles, width, height, x, y, pads, houses)) continue;
      const wx = x + 0.5 + warp * Math.sin((y + 0.5) * 0.21 + p1) + 0.55 * Math.sin((y + x) * 0.13 + p3);
      const wy = y + 0.5 + warp * Math.sin((x + 0.5) * 0.19 + p2);
      let field = 0;
      for (const b of balls) {
        const dx = wx - b.x;
        const dy = wy - b.y;
        field += (b.r * b.r) / (dx * dx + dy * dy + 0.7);
      }
      for (const b of bites) {
        const dx = wx - b.x;
        const dy = wy - b.y;
        field -= 0.9 * (b.r * b.r) / (dx * dx + dy * dy + 0.7);
      }
      const ang = Math.atan2(wy - cy, wx - cx);
      field *= 1 + 0.14 * Math.sin(2 * ang + p1) + 0.09 * Math.sin(3 * ang + p2) + 0.05 * Math.sin(5 * ang + p3);
      if (field < thresh) continue;
      const i = idx(width, x, y);
      if (tiles[i] !== TILE_WATER) {
        tiles[i] = TILE_WATER;
        painted += 1;
      }
    }
  }
  return painted;
}

function waterNeighbors(tiles: number[], width: number, height: number, x: number, y: number): number {
  let n = 0;
  for (const [dx, dy] of WATER_ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (tiles[idx(width, nx, ny)] === TILE_WATER) n += 1;
  }
  return n;
}

/** Nibble and grow the shoreline so coasts are not a smooth metaball. */
function nibbleWaterShore(
  tiles: number[],
  width: number,
  height: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): void {
  const expand: { x: number; y: number; n: number }[] = [];
  const recede: { x: number; y: number; n: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const t = tiles[idx(width, x, y)];
      const n = waterNeighbors(tiles, width, height, x, y);
      if (t === TILE_EMPTY && n > 0 && canPaintWater(tiles, width, height, x, y, pads, houses)) {
        expand.push({ x, y, n });
      } else if (t === TILE_WATER && n < 4) {
        recede.push({ x, y, n });
      }
    }
  }
  for (const c of expand) {
    const p = c.n >= 3 ? 0.48 : c.n === 2 ? 0.2 : 0.06;
    if (nextRand(rng) < p) tiles[idx(width, c.x, c.y)] = TILE_WATER;
  }
  for (const c of recede) {
    if (tiles[idx(width, c.x, c.y)] !== TILE_WATER) continue;
    const n = waterNeighbors(tiles, width, height, c.x, c.y);
    if (n < 2) continue;
    const p = n === 2 ? 0.26 : 0.08;
    if (nextRand(rng) < p) tiles[idx(width, c.x, c.y)] = TILE_EMPTY;
  }
}

/** Drop disconnected puddles left by shoreline nibble. */
function pruneWaterSpecks(tiles: number[], width: number, height: number, minSize = 18): void {
  const seen = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(width, x, y);
      if (seen[start] || tiles[start] !== TILE_WATER) continue;
      const cells: { x: number; y: number }[] = [{ x, y }];
      seen[start] = 1;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]!;
        for (const [dx, dy] of WATER_ORTHO) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = idx(width, nx, ny);
          if (seen[ni] || tiles[ni] !== TILE_WATER) continue;
          seen[ni] = 1;
          cells.push({ x: nx, y: ny });
        }
      }
      if (cells.length >= minSize) continue;
      for (const c of cells) tiles[idx(width, c.x, c.y)] = TILE_EMPTY;
    }
  }
}

/** Fill tiny land pockets fully enclosed by water. */
function fillWaterPockets(tiles: number[], width: number, height: number): void {
  const seen = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(width, x, y);
      if (seen[start] || tiles[start] !== TILE_EMPTY) continue;
      const cells: { x: number; y: number }[] = [{ x, y }];
      seen[start] = 1;
      let enclosed = true;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]!;
        for (const [dx, dy] of WATER_ORTHO) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            enclosed = false;
            continue;
          }
          const ni = idx(width, nx, ny);
          const t = tiles[ni];
          if (t === TILE_EMPTY) {
            if (!seen[ni]) {
              seen[ni] = 1;
              cells.push({ x: nx, y: ny });
            }
          } else if (t !== TILE_WATER) {
            enclosed = false;
          }
        }
      }
      if (!enclosed || cells.length > 22) continue;
      for (const c of cells) tiles[idx(width, c.x, c.y)] = TILE_WATER;
    }
  }
}

function paintYardPonds(
  tiles: number[],
  width: number,
  height: number,
  seed: string,
  spawnPads: readonly { x: number; y: number; r: number }[],
  features: readonly MapFeature[],
): void {
  const rng = { n: hash32(seed) };
  const sub = TILE_SUBDIV;
  const houses = houseBoxes(features, sub);
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === TILE_WATER) tiles[i] = TILE_EMPTY;
  }
  const ponds: readonly { cx: number; cy: number }[] = [
    { cx: 24, cy: 9.5 },
    { cx: 41, cy: 42.5 },
  ];
  for (const p of ponds) {
    const radius = (2.55 + nextRand(rng) * 0.7) * sub;
    const jx = (nextRand(rng) - 0.5) * 0.6 * sub;
    const jy = (nextRand(rng) - 0.5) * 0.6 * sub;
    paintOrganicPond(
      tiles,
      width,
      height,
      p.cx * sub + sub / 2 + jx,
      p.cy * sub + sub / 2 + jy,
      radius,
      rng,
      spawnPads,
      houses,
    );
  }
  nibbleWaterShore(tiles, width, height, rng, spawnPads, houses);
  fillWaterPockets(tiles, width, height);
  pruneWaterSpecks(tiles, width, height);
}

function rectFree(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  tw: number,
  th: number,
): boolean {
  for (let y = y0; y < y0 + th; y++) {
    for (let x = x0; x < x0 + tw; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      if ((tiles[idx(width, x, y)] ?? 1) !== TILE_EMPTY) return false;
    }
  }
  return true;
}

const TREE_DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

function canPlantTree(
  tiles: number[],
  width: number,
  height: number,
  x: number,
  y: number,
  pads: readonly { x: number; y: number; r: number }[],
): boolean {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
  if (inPad(pads, x, y)) return false;
  return (tiles[idx(width, x, y)] ?? 1) === TILE_EMPTY;
}

function coarseTreeNeighbor(tiles: number[], width: number, height: number, x: number, y: number): boolean {
  for (const [dx, dy] of TREE_DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (tiles[idx(width, nx, ny)] === TILE_TREE) return true;
  }
  return false;
}

/** Organic connected patch. Stays 8-connected so vehicles cannot slip through. */
function paintGrove(
  tiles: number[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  cells: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
): number {
  let x = Math.round(cx);
  let y = Math.round(cy);
  let painted = 0;
  const cap = Math.max(3, cells);
  for (let step = 0; step < cap * 8 && painted < cap; step++) {
    if (canPlantTree(tiles, width, height, x, y, pads)) {
      tiles[idx(width, x, y)] = TILE_TREE;
      painted += 1;
    }
    const d = TREE_DIRS[Math.floor(nextRand(rng) * TREE_DIRS.length)]!;
    x += d[0];
    y += d[1];
    if (nextRand(rng) < 0.32) {
      x = Math.round(cx + (x - cx) * 0.35);
      y = Math.round(cy + (y - cy) * 0.35);
    }
  }
  return painted;
}

function paintClump(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  extra: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
): number {
  if (!canPlantTree(tiles, width, height, x0, y0, pads)) return 0;
  tiles[idx(width, x0, y0)] = TILE_TREE;
  const painted: { x: number; y: number }[] = [{ x: x0, y: y0 }];
  for (let n = 0; n < extra; n++) {
    const seed = painted[Math.floor(nextRand(rng) * painted.length)]!;
    const d = TREE_DIRS[Math.floor(nextRand(rng) * 4)]!;
    const x = seed.x + d[0];
    const y = seed.y + d[1];
    if (!canPlantTree(tiles, width, height, x, y, pads)) continue;
    tiles[idx(width, x, y)] = TILE_TREE;
    painted.push({ x, y });
  }
  return painted.length;
}

function scatterTrees(
  tiles: number[],
  width: number,
  height: number,
  rng: { n: number },
  pads: readonly { x: number; y: number; r: number }[],
  scale = 1,
): void {
  const groves = Math.round((16 + Math.floor(nextRand(rng) * 8)) * scale);
  for (let i = 0; i < groves; i++) {
    for (let attempt = 0; attempt < 28; attempt++) {
      const cx = 5 + nextRand(rng) * (width - 10);
      const cy = 5 + nextRand(rng) * (height - 10);
      if (inPad(pads, cx, cy)) continue;
      const cells = 6 + Math.floor(nextRand(rng) * 16);
      if (paintGrove(tiles, width, height, cx, cy, cells, rng, pads) > 0) break;
    }
  }
  const clumps = Math.round((18 + Math.floor(nextRand(rng) * 10)) * scale);
  for (let i = 0; i < clumps; i++) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = 2 + Math.floor(nextRand(rng) * (width - 4));
      const y = 2 + Math.floor(nextRand(rng) * (height - 4));
      const extra = 1 + Math.floor(nextRand(rng) * 4);
      if (paintClump(tiles, width, height, x, y, extra, rng, pads) >= 2) break;
    }
  }
  const singles = Math.round((110 + Math.floor(nextRand(rng) * 50)) * scale);
  for (let i = 0; i < singles; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = 2 + Math.floor(nextRand(rng) * (width - 4));
      const y = 2 + Math.floor(nextRand(rng) * (height - 4));
      if (!canPlantTree(tiles, width, height, x, y, pads)) continue;
      if (coarseTreeNeighbor(tiles, width, height, x, y)) continue;
      tiles[idx(width, x, y)] = TILE_TREE;
      break;
    }
  }
}

/**
 * One isolated authoring cell upsamples into a 4×4 cube. Keep a single stem
 * so lone trees read as trees, not hedges.
 */
function thinIsolatedTrees(
  fine: number[],
  fineW: number,
  fineH: number,
  coarse: number[],
  cw: number,
  ch: number,
  sub: number,
): void {
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      if (coarse[idx(cw, cx, cy)] !== TILE_TREE) continue;
      if (coarseTreeNeighbor(coarse, cw, ch, cx, cy)) continue;
      const h = hash32(`${cx}:${cy}:tree`);
      const lx = h % sub;
      const ly = (h >>> 8) % sub;
      for (let dy = 0; dy < sub; dy++) {
        for (let dx = 0; dx < sub; dx++) {
          const x = cx * sub + dx;
          const y = cy * sub + dy;
          if (x < 0 || y < 0 || x >= fineW || y >= fineH) continue;
          fine[y * fineW + x] = dx === lx && dy === ly ? TILE_TREE : TILE_EMPTY;
        }
      }
    }
  }
}

function flattenTerrain(
  heights: number[],
  tiles: number[],
  width: number,
  height: number,
  kind: number,
  locked?: Uint8Array,
): void {
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === kind) heights[i] = 0;
  }
  relaxSlopes(heights, width, height, locked);
}

/**
 * A village on two crossing streets. `fx, fy` are the fine-grid centre lines of
 * the streets (where the lanes run); `arm` is how far each street reaches from
 * the crossing, in authoring tiles.
 */
export interface VillageSpec {
  fx: number;
  fy: number;
  arm: number;
}

/** Village houses; barns and shacks go out to farmsteads instead. */
const VILLAGE_TYPES: ReadonlySet<CivilianType> = new Set(["cottage", "house", "inn", "chapel", "manor"]);
/** First lot along each street, in authoring tiles from the crossing: room for the square. */
const VILLAGE_SQUARE = 3;
/** A one-tile alley after every this many houses on a street side, so infantry can get between rows. */
const VILLAGE_ALLEY_EVERY = 2;

function houseSize(type: CivilianType): { tw: number; th: number } {
  const def = catalog(type);
  return { tw: Math.round(def.tileW / TILE_SUBDIV), th: Math.round(def.tileH / TILE_SUBDIV) };
}

/** Authoring-tile span a lane of radius 2 covers around a fine centre line. */
function streetBand(fine: number): { lo: number; hi: number } {
  return { lo: Math.floor((fine - 3) / TILE_SUBDIV), hi: Math.floor((fine + 3) / TILE_SUBDIV) };
}

/** Open ground or trees: a village fells what stands on its lots. */
function lotClear(tiles: number[], width: number, height: number, x0: number, y0: number, tw: number, th: number): boolean {
  for (let y = y0; y < y0 + th; y++) {
    for (let x = x0; x < x0 + tw; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const t = tiles[idx(width, x, y)];
      if (t !== TILE_EMPTY && t !== TILE_TREE) return false;
    }
  }
  return true;
}

/** Reserve a house lot: tiles go blocked until `scatterCover` hands the ground back. */
function claimLot(tiles: number[], width: number, height: number, x: number, y: number, tw: number, th: number): void {
  fillRect(tiles, width, height, x, y, x + tw - 1, y + th - 1, TILE_BLOCKED);
}

/**
 * Houses shoulder to shoulder along both sides of both streets, doors on the
 * street, biggest near the square. Every few houses an alley breaks the row.
 * Takes houses from the front of `pool` until the streets are full.
 */
function layVillage(
  tiles: number[],
  width: number,
  height: number,
  v: VillageSpec,
  pool: CivilianType[],
  pads: readonly { x: number; y: number; r: number }[],
  features: MapFeature[],
): void {
  const row = streetBand(v.fy);
  const col = streetBand(v.fx);
  const cx = Math.floor(v.fx / TILE_SUBDIV);
  const cy = Math.floor(v.fy / TILE_SUBDIV);
  // Eight street sides: along the E-W street (east/west arm × north/south side), then the N-S one.
  const sides: { alongX: boolean; sign: 1 | -1; low: boolean; cursor: number; placed: number }[] = [];
  for (const alongX of [true, false]) {
    for (const sign of [1, -1] as const) {
      for (const low of [true, false]) sides.push({ alongX, sign, low, cursor: VILLAGE_SQUARE, placed: 0 });
    }
  }
  let progress = true;
  while (progress && pool.length > 0) {
    progress = false;
    for (const s of sides) {
      const type = pool[0];
      if (!type) break;
      if (s.cursor >= v.arm) continue;
      progress = true;
      const { tw, th } = houseSize(type);
      let x: number;
      let y: number;
      let facing: number;
      if (s.alongX) {
        x = s.sign > 0 ? cx + s.cursor : cx - s.cursor - tw + 1;
        y = s.low ? row.lo - th : row.hi + 1;
        facing = s.low ? 1 : 3;
      } else {
        y = s.sign > 0 ? cy + s.cursor : cy - s.cursor - th + 1;
        x = s.low ? col.lo - tw : col.hi + 1;
        facing = s.low ? 0 : 2;
      }
      if (!lotClear(tiles, width, height, x, y, tw, th) || inPad(pads, x + tw / 2, y + th / 2)) {
        s.cursor += 1;
        continue;
      }
      pool.shift();
      features.push({ type, x, y, facing });
      claimLot(tiles, width, height, x, y, tw, th);
      s.placed += 1;
      s.cursor += (s.alongX ? tw : th) + (s.placed % VILLAGE_ALLEY_EVERY === 0 ? 1 : 0);
    }
  }
}

/** A farm: two or three buildings around one yard, each touching the last or a step off it. */
function layFarmstead(
  tiles: number[],
  width: number,
  height: number,
  rng: { n: number },
  group: CivilianType[],
  pads: readonly { x: number; y: number; r: number }[],
  features: MapFeature[],
  attempts: number,
): CivilianType[] {
  const first = group[0];
  if (!first) return [];
  const a = houseSize(first);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const x = 2 + Math.floor(nextRand(rng) * (width - a.tw - 4));
    const y = 2 + Math.floor(nextRand(rng) * (height - a.th - 4));
    if (inPad(pads, x + a.tw / 2, y + a.th / 2)) continue;
    if (!rectFree(tiles, width, height, x, y, a.tw, a.th)) continue;
    features.push({ type: first, x, y, facing: hash32(`${first}:${x}:${y}:face`) % 4 });
    claimLot(tiles, width, height, x, y, a.tw, a.th);
    const left: CivilianType[] = [];
    let prev = { x, y, tw: a.tw, th: a.th };
    for (const type of group.slice(1)) {
      const b = houseSize(type);
      let done = false;
      for (let t = 0; t < 16 && !done; t++) {
        const gap = Math.floor(nextRand(rng) * 2);
        const side = Math.floor(nextRand(rng) * 4);
        const slide = Math.floor(nextRand(rng) * 3) - 1;
        const bx =
          side === 0 ? prev.x + prev.tw + gap : side === 2 ? prev.x - b.tw - gap : prev.x + slide;
        const by =
          side === 1 ? prev.y + prev.th + gap : side === 3 ? prev.y - b.th - gap : prev.y + slide;
        if (inPad(pads, bx + b.tw / 2, by + b.th / 2)) continue;
        if (!rectFree(tiles, width, height, bx, by, b.tw, b.th)) continue;
        features.push({ type, x: bx, y: by, facing: hash32(`${type}:${bx}:${by}:face`) % 4 });
        claimLot(tiles, width, height, bx, by, b.tw, b.th);
        prev = { x: bx, y: by, tw: b.tw, th: b.th };
        done = true;
      }
      if (!done) left.push(type);
    }
    return left;
  }
  return group;
}

/**
 * Trees, ponds, and civilian houses. Authoring-grid coords; caller upsamples tiles.
 * Villages go down first, then trees around them, then farmsteads; whatever is
 * left over scatters on its own as before.
 */
function scatterCover(
  tiles: number[],
  width: number,
  height: number,
  seed: string,
  pads: readonly { x: number; y: number; r: number }[],
  scale = 1,
  villages: readonly VillageSpec[] = [],
): MapFeature[] {
  const rng = { n: hash32(seed) };
  const features: MapFeature[] = [];
  const kinds: CivilianType[] = [
    "shack",
    "shack",
    "cottage",
    "cottage",
    "cottage",
    "house",
    "house",
    "inn",
    "barn",
    "barn",
    "chapel",
    "manor",
    "shack",
    "inn",
    "cottage",
    "chapel",
  ];
  const passes = Math.max(1, Math.round(scale));
  const attempts = scale === 1 ? 80 : 160;
  const roster: CivilianType[] = [];
  for (let pass = 0; pass < passes; pass++) roster.push(...kinds);

  // Big houses nearest the square, cottages out at the ends of the streets.
  const townPool = roster
    .filter((t) => VILLAGE_TYPES.has(t))
    .sort((a, b) => houseSize(b).tw - houseSize(a).tw);
  const farmPool = roster.filter((t) => !VILLAGE_TYPES.has(t));
  // Trees first and on the same draw as ever, so the woods do not move; the
  // village then clears its own lots and streets.
  scatterTrees(tiles, width, height, rng, pads, scale);
  for (const v of villages) layVillage(tiles, width, height, v, townPool, pads, features);
  const streets: number[] = [];
  for (const v of villages) {
    const row = streetBand(v.fy);
    const col = streetBand(v.fx);
    const cx = Math.floor(v.fx / TILE_SUBDIV);
    const cy = Math.floor(v.fy / TILE_SUBDIV);
    for (let y = row.lo; y <= row.hi; y++) {
      for (let x = cx - v.arm; x <= cx + v.arm; x++) streets.push(x, y);
    }
    for (let x = col.lo; x <= col.hi; x++) {
      for (let y = cy - v.arm; y <= cy + v.arm; y++) streets.push(x, y);
    }
  }
  for (let i = 0; i < streets.length; i += 2) {
    const x = streets[i]!;
    const y = streets[i + 1]!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const k = idx(width, x, y);
    if (tiles[k] === TILE_TREE) tiles[k] = TILE_EMPTY;
  }

  const leftover: CivilianType[] = [...townPool];
  // Farms: a barn with a shack or two beside it.
  const barns = farmPool.filter((t) => t === "barn");
  const shacks = farmPool.filter((t) => t !== "barn");
  for (const barn of barns) {
    const group: CivilianType[] = [barn];
    for (let n = 0; n < 2 && shacks.length > 0; n++) group.push(shacks.shift()!);
    leftover.push(...layFarmstead(tiles, width, height, rng, group, pads, features, attempts));
  }
  leftover.push(...shacks);
  for (const type of leftover) {
    const def = catalog(type);
    const tw = Math.round(def.tileW / TILE_SUBDIV);
    const th = Math.round(def.tileH / TILE_SUBDIV);
    for (let attempt = 0; attempt < attempts; attempt++) {
      const x = 2 + Math.floor(nextRand(rng) * (width - tw - 4));
      const y = 2 + Math.floor(nextRand(rng) * (height - th - 4));
      if (inPad(pads, x + tw / 2, y + th / 2)) continue;
      if (!rectFree(tiles, width, height, x, y, tw, th)) continue;
      features.push({ type, x, y, facing: hash32(`${type}:${x}:${y}:face`) % 4 });
      fillRect(tiles, width, height, x, y, x + tw - 1, y + th - 1, TILE_EMPTY);
      for (let yy = y; yy < y + th; yy++) {
        for (let xx = x; xx < x + tw; xx++) {
          tiles[idx(width, xx, yy)] = TILE_BLOCKED;
        }
      }
      break;
    }
  }
  for (const f of features) {
    const def = catalog(f.type);
    const tw = Math.round(def.tileW / TILE_SUBDIV);
    const th = Math.round(def.tileH / TILE_SUBDIV);
    fillRect(tiles, width, height, f.x, f.y, f.x + tw - 1, f.y + th - 1, TILE_EMPTY);
  }
  return features;
}

function scaleFeatures(features: MapFeature[], sub: number): MapFeature[] {
  return features.map((f) => ({ type: f.type, x: f.x * sub, y: f.y * sub, facing: f.facing }));
}

/**
 * Seeded flat-topped hills and sunken fields on rolling ground. Every flank is
 * a one-step-per-tile ramp between two flat levels, the shape a pond bank has.
 * Spawns stay on the base; slopes never cliff. `ceil` caps a peak.
 */
export function scatterHeights(
  width: number,
  height: number,
  seed: string,
  pads: readonly { x: number; y: number; r: number }[],
  locked?: Uint8Array,
  relief = 1,
  ceil = HEIGHT_MAX,
): number[] {
  const heights = new Array(width * height).fill(HEIGHT_BASE);
  const rng = { n: hash32(seed) };
  paintRolling(heights, width, height, `${seed}:roll`, ceil);
  const riseMax = ceil - HEIGHT_BASE;
  const hillSpots: readonly [number, number][] = [
    [width * 0.3, height * 0.28],
    [width * 0.7, height * 0.3],
    [width * 0.32, height * 0.7],
    [width * 0.68, height * 0.72],
    [width * 0.5, height * 0.48],
  ];
  const valleySpots: readonly [number, number][] = [
    [width * 0.57, height * 0.25],
    [width * 0.2, height * 0.5],
    [width * 0.8, height * 0.52],
    [width * 0.48, height * 0.8],
    [width * 0.4, height * 0.42],
  ];
  for (const [qx, qy] of hillSpots) {
    const cx = qx + (nextRand(rng) - 0.5) * 8 * TILE_SUBDIV;
    const cy = qy + (nextRand(rng) - 0.5) * 8 * TILE_SUBDIV;
    const rise = Math.max(4, Math.round(riseMax * (0.55 + nextRand(rng) * 0.45)));
    // A flat summit a squad can stand on, then a ramp `rise` tiles long.
    const crown = rise * (0.35 + nextRand(rng) * 0.45);
    const stretch = 0.75 + nextRand(rng) * 0.55;
    splatMesa(heights, width, height, cx, cy, crown * stretch, crown / stretch, rise, ceil);
  }
  for (const [qx, qy] of valleySpots) {
    const cx = qx + (nextRand(rng) - 0.5) * 8 * TILE_SUBDIV;
    const cy = qy + (nextRand(rng) - 0.5) * 8 * TILE_SUBDIV;
    // Sunken fields: a broad flat floor a few steps above the water level, so
    // the plain around it stands as high ground and its edge reads like a dry
    // pond bank, while a pond inside one still keeps a bank of its own.
    const depth = Math.min(HEIGHT_BASE - 2, 4 + Math.floor(nextRand(rng) * 3));
    const crown = depth * (2 + nextRand(rng) * 1.5);
    const stretch = 0.7 + nextRand(rng) * 0.6;
    splatMesa(heights, width, height, cx, cy, crown * stretch, crown / stretch, -depth, ceil);
  }
  const extra = Math.round((8 + Math.floor(nextRand(rng) * 6)) * relief);
  for (let i = 0; i < extra; i++) {
    const cx = 6 * TILE_SUBDIV + nextRand(rng) * (width - 12 * TILE_SUBDIV);
    const cy = 6 * TILE_SUBDIV + nextRand(rng) * (height - 12 * TILE_SUBDIV);
    const valley = nextRand(rng) < 0.4;
    const mag = valley
      ? -(2 + Math.floor(nextRand(rng) * (HEIGHT_BASE - 1)))
      : 2 + Math.floor(nextRand(rng) * riseMax);
    const crown = Math.abs(mag) * (0.4 + nextRand(rng) * 0.8);
    const stretch = 0.7 + nextRand(rng) * 0.7;
    splatMesa(heights, width, height, cx, cy, crown * stretch, crown / stretch, mag, ceil);
  }
  const lock = locked ?? new Uint8Array(width * height);
  for (const p of pads) {
    flattenPad(heights, width, height, p.x, p.y, p.r, HEIGHT_BASE);
    markPad(lock, width, height, p.x, p.y, p.r);
  }
  relaxSlopes(heights, width, height, lock);
  return heights;
}

function paintLane(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): void {
  const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  const r2 = radius * radius + 0.25;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 1 || yy < 1 || xx >= width - 1 || yy >= height - 1) continue;
        if (inHouseBox(houses, xx, yy)) continue;
        const k = idx(width, xx, yy);
        const t = tiles[k];
        if (t === TILE_WATER || isScrapTile(t) || t === TILE_BLOCKED || t === TILE_FENCE || t === TILE_ROCK) continue;
        tiles[k] = TILE_ROAD;
      }
    }
  }
}

/** Stamp a road disk of radius `r` at (x, y), skipping ground a lane may not cover. */
function stampRoad(
  tiles: number[],
  width: number,
  height: number,
  x: number,
  y: number,
  r: number,
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): void {
  const ri = Math.ceil(r);
  const r2 = r * r + 0.25;
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      const ox = cx + dx - x;
      const oy = cy + dy - y;
      if (ox * ox + oy * oy > r2) continue;
      const xx = cx + dx;
      const yy = cy + dy;
      if (xx < 1 || yy < 1 || xx >= width - 1 || yy >= height - 1) continue;
      if (inHouseBox(houses, xx, yy)) continue;
      const k = idx(width, xx, yy);
      const t = tiles[k];
      if (t === TILE_WATER || isScrapTile(t) || t === TILE_BLOCKED || t === TILE_FENCE || t === TILE_ROCK) continue;
      tiles[k] = TILE_ROAD;
    }
  }
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

/**
 * Seeded meandering dirt lane. Control points are pushed sideways off the
 * straight line (tapered to zero at both ends so the endpoints stay put), a
 * Catmull-Rom spline runs through them, and the stamp width breathes between
 * `radius` and `radius + 1`.
 */
function paintWindingLane(
  tiles: number[],
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
  rng: { n: number },
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) {
    stampRoad(tiles, width, height, x0, y0, radius, houses);
    return;
  }
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const segs = Math.max(2, Math.round(len / 34));
  const amp = Math.min(16, len * 0.14);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const taper = Math.sin(Math.PI * t);
    const along = i === 0 || i === segs ? 0 : (nextRand(rng) - 0.5) * (len / segs) * 0.4;
    const side = (nextRand(rng) * 2 - 1) * amp * taper;
    const bx = x0 + (x1 - x0) * t + ((x1 - x0) / len) * along;
    const by = y0 + (y1 - y0) * t + ((y1 - y0) / len) * along;
    pts.push({ x: bx + nx * side, y: by + ny * side });
  }
  const seed = rng.n;
  const steps = Math.max(2, Math.ceil((len / segs) * 2));
  let walked = 0;
  for (let i = 0; i < segs; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(segs, i + 2)]!;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
      const y = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
      const r = radius + smoothNoise(walked / 14, 0.5, seed);
      stampRoad(tiles, width, height, x, y, r, houses);
      walked += 0.5;
    }
  }
}

/** Ends of a village's streets, in fine tiles: east, west, south, north. Outside lanes come in here. */
function villageGates(v: VillageSpec): { x: number; y: number }[] {
  const reach = (v.arm + 1) * TILE_SUBDIV;
  return [
    { x: v.fx + reach, y: v.fy },
    { x: v.fx - reach, y: v.fy },
    { x: v.fx, y: v.fy + reach },
    { x: v.fx, y: v.fy - reach },
  ];
}

function nearestGate(v: VillageSpec, x: number, y: number): { x: number; y: number } {
  let best = villageGates(v)[0]!;
  for (const g of villageGates(v)) {
    if (Math.hypot(g.x - x, g.y - y) < Math.hypot(best.x - x, best.y - y)) best = g;
  }
  return best;
}

/** Straight streets through a village and its square. A winding lane here would cut between the houses. */
function paintVillageStreets(
  tiles: number[],
  width: number,
  height: number,
  v: VillageSpec,
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): void {
  const reach = (v.arm + 1) * TILE_SUBDIV;
  paintLane(tiles, width, height, v.fx - reach, v.fy, v.fx + reach, v.fy, 2, houses);
  paintLane(tiles, width, height, v.fx, v.fy - reach, v.fx, v.fy + reach, 2, houses);
  stampRoad(tiles, width, height, v.fx, v.fy, 6.5, houses);
}

/** Dirt lanes from each start to the village, and its straight streets through the middle. */
function paintYardDress(
  tiles: number[],
  width: number,
  height: number,
  spawns: readonly { x: number; y: number }[],
  features: readonly MapFeature[],
  village: VillageSpec,
): void {
  const houses = houseBoxes(features, TILE_SUBDIV);
  const rng = { n: hash32("yard-64-lanes") };
  const margin = 18;
  const [east, west, south, north] = villageGates(village) as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  paintWindingLane(tiles, width, height, margin, village.fy, west.x, west.y, 2, houses, rng);
  paintWindingLane(tiles, width, height, east.x, east.y, width - 1 - margin, village.fy, 2, houses, rng);
  paintWindingLane(tiles, width, height, village.fx, margin, north.x, north.y, 2, houses, rng);
  paintWindingLane(tiles, width, height, south.x, south.y, village.fx, height - 1 - margin, 2, houses, rng);
  for (const s of spawns) {
    const g = nearestGate(village, s.x, s.y);
    paintWindingLane(tiles, width, height, s.x, s.y, g.x, g.y, 2, houses, rng);
  }
  paintVillageStreets(tiles, width, height, village, houses);
}

/** Fine tiles between two house lots below which they are levelled together. */
const LOT_SHARE_GAP = 6;
/** How far from a lot fixed ground (water, pads, hill skirts) still bounds its level. */
const LOT_FIXED_REACH = 12;

/**
 * Level ground under every house, a tile past its walls, at the lot's mean
 * height, and lock it so slope relaxing builds ramps around it, not under it.
 */
function levelHouseLots(
  heights: number[],
  tiles: readonly number[],
  width: number,
  height: number,
  features: readonly MapFeature[],
  locked: Uint8Array,
): void {
  const boxes = houseBoxes(features, TILE_SUBDIV);
  // Houses this close share one level, like a terraced row. Two locked lots at
  // different heights with no free ground between them would leave a cliff.
  const near = LOT_SHARE_GAP;
  const group = boxes.map((_, i) => i);
  const root = (i: number): number => {
    while (group[i] !== i) i = group[i] = group[group[i]!]!;
    return i;
  };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const gx = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      const gy = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
      if (Math.max(gx, gy) <= near) group[root(i)] = root(j);
    }
  }
  const sums = new Map<number, { sum: number; n: number }>();
  boxes.forEach((b, i) => {
    const acc = sums.get(root(i)) ?? { sum: 0, n: 0 };
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        acc.sum += heights[idx(width, x, y)] ?? 0;
        acc.n++;
      }
    }
    sums.set(root(i), acc);
  });
  // Ground that was fixed before the houses (water, pads, hill skirts) bounds a
  // group's level: no more than one step per tile away from it, or a cliff.
  const prefixed = new Uint8Array(locked);
  const fixed = (i: number): boolean => prefixed[i] === 1 || tiles[i] === TILE_WATER;
  const fixedZ = (i: number): number => (tiles[i] === TILE_WATER ? 0 : (heights[i] ?? 0));
  const bounds = new Map<number, { lo: number; hi: number }>();
  boxes.forEach((b, i) => {
    const r = root(i);
    const acc = bounds.get(r) ?? { lo: -Infinity, hi: Infinity };
    for (let y = Math.max(0, b.y0 - LOT_FIXED_REACH); y <= Math.min(height - 1, b.y1 + LOT_FIXED_REACH); y++) {
      for (let x = Math.max(0, b.x0 - LOT_FIXED_REACH); x <= Math.min(width - 1, b.x1 + LOT_FIXED_REACH); x++) {
        const k = idx(width, x, y);
        if (!fixed(k)) continue;
        // Counted from the levelled margin, a tile past the walls.
        const d = Math.max(1, Math.max(b.x0 - x, x - b.x1, b.y0 - y, y - b.y1) - 1);
        const z = fixedZ(k);
        acc.lo = Math.max(acc.lo, z - HEIGHT_STEP_MAX * d);
        acc.hi = Math.min(acc.hi, z + HEIGHT_STEP_MAX * d);
      }
    }
    bounds.set(r, acc);
  });
  const groups = new Map<number, { lo: number; hi: number; z: number; boxes: typeof boxes }>();
  boxes.forEach((b, i) => {
    const r = root(i);
    let g = groups.get(r);
    if (!g) {
      const acc = sums.get(r)!;
      const bound = bounds.get(r)!;
      const mean = Math.round(acc.sum / Math.max(1, acc.n));
      g = { lo: bound.lo, hi: bound.hi, z: Math.min(bound.hi, Math.max(bound.lo, mean)), boxes: [] };
      groups.set(r, g);
    }
    g.boxes.push(b);
  });
  // Margins are locked too. Two lots must sit close enough in height that the
  // ground between those margins can ramp one step per tile.
  const marginDist = (
    a: { x0: number; y0: number; x1: number; y1: number },
    b: { x0: number; y0: number; x1: number; y1: number },
  ): number => {
    const gx = Math.max(a.x0 - 1, b.x0 - 1) - Math.min(a.x1 + 1, b.x1 + 1);
    const gy = Math.max(a.y0 - 1, b.y0 - 1) - Math.min(a.y1 + 1, b.y1 + 1);
    return Math.max(gx, gy, 0);
  };
  const grouped = [...groups.values()];
  let changed = true;
  for (let guard = 0; changed && guard < grouped.length; guard++) {
    changed = false;
    for (let i = 0; i < grouped.length; i++) {
      for (let j = i + 1; j < grouped.length; j++) {
        const a = grouped[i]!;
        const b = grouped[j]!;
        let apart = Infinity;
        for (const ba of a.boxes) {
          for (const bb of b.boxes) apart = Math.min(apart, marginDist(ba, bb));
        }
        const maxDz = apart * HEIGHT_STEP_MAX;
        const hi = a.z >= b.z ? a : b;
        const lo = hi === a ? b : a;
        const excess = hi.z - lo.z - maxDz;
        if (excess <= 0) continue;
        const drop = Math.min(hi.z - hi.lo, Math.ceil(excess / 2));
        const rise = Math.min(lo.hi - lo.z, excess - drop);
        const drop2 = Math.min(hi.z - hi.lo, excess - rise);
        if (drop2 === 0 && rise === 0) continue;
        hi.z -= drop2;
        lo.z += rise;
        changed = true;
      }
    }
  }
  const lots = boxes.map((b, i) => ({ ...b, z: groups.get(root(i))!.z }));
  const level = (x0: number, y0: number, x1: number, y1: number, z: number): void => {
    for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
        const i = idx(width, x, y);
        if (fixed(i)) continue;
        heights[i] = z;
        locked[i] = 1;
      }
    }
  };
  // Margins first, then the lots: a neighbour's margin never tilts a house that touches it.
  for (const b of lots) level(b.x0 - 1, b.y0 - 1, b.x1 + 1, b.y1 + 1, b.z);
  for (const b of lots) level(b.x0, b.y0, b.x1, b.y1, b.z);
  relaxSlopes(heights, width, height, locked);
}

/** Open-ground flood (4-neighbour) from `sx, sy`. Rock, water, fence, and blocks stop it. */
function floodWalk(tiles: readonly number[], width: number, height: number, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(width * height);
  const open = (t: number | undefined): boolean =>
    t !== undefined && t !== TILE_BLOCKED && t !== TILE_WATER && t !== TILE_FENCE && t !== TILE_ROCK;
  const start = idx(width, sx, sy);
  if (!open(tiles[start])) return seen;
  const q = [start];
  seen[start] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]!;
    const x = i % width;
    const y = (i / width) | 0;
    for (const [dx, dy] of WATER_ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = idx(width, nx, ny);
      if (seen[ni] || !open(tiles[ni])) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

/** Raised hill summits: local height maxima well above the base, kept apart. */
function findHillPeaks(heights: readonly number[], width: number, height: number): { x: number; y: number; h: number }[] {
  const cand: { x: number; y: number; h: number }[] = [];
  const win = 10;
  for (let y = win; y < height - win; y += 2) {
    for (let x = win; x < width - win; x += 2) {
      const h = heights[idx(width, x, y)] ?? 0;
      if (h < HEIGHT_BASE + 4) continue;
      let top = true;
      for (let dy = -win; dy <= win && top; dy += 2) {
        for (let dx = -win; dx <= win; dx += 2) {
          if ((heights[idx(width, x + dx, y + dy)] ?? 0) > h) {
            top = false;
            break;
          }
        }
      }
      if (top) cand.push({ x, y, h });
    }
  }
  cand.sort((a, b) => b.h - a.h || a.y - b.y || a.x - b.x);
  const peaks: { x: number; y: number; h: number }[] = [];
  for (const c of cand) {
    if (peaks.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 36)) continue;
    peaks.push(c);
  }
  return peaks;
}

/**
 * Rocky flanks on a few hills. Rock only goes on open ground, one sector of
 * each hill stays a walkable ramp, and a patch that would cut off any ground
 * that was reachable before it (spawns, scrap, summits) is taken back.
 */
function paintYardRocks(
  tiles: number[],
  heights: readonly number[],
  width: number,
  height: number,
  seed: string,
  pads: readonly { x: number; y: number; r: number }[],
  houses: readonly { x0: number; y0: number; x1: number; y1: number }[],
): void {
  const rng = { n: hash32(seed) };
  const noiseSeed = hash32(`${seed}:grain`);
  const peaks = findHillPeaks(heights, width, height);
  const want = Math.min(peaks.length, 3 + Math.floor(nextRand(rng) * 3));
  const start = pads[0];
  if (!start) return;
  let reach = floodWalk(tiles, width, height, start.x, start.y);
  let placed = 0;
  for (const peak of peaks) {
    if (placed >= want) break;
    const rise = peak.h - HEIGHT_BASE;
    const maxR = rise * 2.4 + 8;
    const toMid = Math.atan2(height / 2 - peak.y, width / 2 - peak.x);
    const ramp = toMid + (nextRand(rng) - 0.5) * 1.4;
    const rampHalf = 0.7 + nextRand(rng) * 0.25;
    const bandTop = peak.h - 2;
    const bandLow = peak.h - Math.max(4, Math.round(rise * 0.7));
    const patch: number[] = [];
    const r0 = Math.ceil(maxR);
    for (let y = peak.y - r0; y <= peak.y + r0; y++) {
      for (let x = peak.x - r0; x <= peak.x + r0; x++) {
        if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) continue;
        const d = Math.hypot(x - peak.x, y - peak.y);
        if (d > maxR || d < 3) continue;
        let da = Math.atan2(y - peak.y, x - peak.x) - ramp;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < rampHalf) continue;
        const i = idx(width, x, y);
        if (tiles[i] !== TILE_EMPTY) continue;
        const h = heights[i] ?? 0;
        if (h > bandTop || h < bandLow) continue;
        const gx = (heights[idx(width, x + 2, y)] ?? 0) - (heights[idx(width, x - 2, y)] ?? 0);
        const gy = (heights[idx(width, x, y + 2)] ?? 0) - (heights[idx(width, x, y - 2)] ?? 0);
        if (Math.abs(gx) + Math.abs(gy) < 3) continue;
        if (smoothNoise(x / 6, y / 6, noiseSeed) < 0.3) continue;
        if (inHouseBox(houses, x, y)) continue;
        if (pads.some((p) => Math.hypot(x - p.x, y - p.y) <= p.r + 6)) continue;
        let crowded = false;
        for (const [dx, dy] of WATER_ORTHO) {
          const t = tiles[idx(width, x + dx, y + dy)];
          if (t === TILE_ROAD || isScrapTile(t) || t === TILE_WATER) crowded = true;
        }
        if (crowded) continue;
        patch.push(i);
      }
    }
    if (patch.length < 24) continue;
    for (const i of patch) tiles[i] = TILE_ROCK;
    let next = floodWalk(tiles, width, height, start.x, start.y);
    // Tiny open pockets sealed inside the outcrop become rock too; anything
    // bigger, or anything that is not plain ground, rejects the patch.
    const sealed: number[] = [];
    let ok = true;
    for (let i = 0; i < reach.length && ok; i++) {
      if (!reach[i] || next[i] || tiles[i] === TILE_ROCK) continue;
      if (tiles[i] !== TILE_EMPTY || inPad(pads, i % width, (i / width) | 0)) ok = false;
      sealed.push(i);
    }
    if (sealed.length > 24) ok = false;
    if (ok && sealed.length > 0) {
      for (const i of sealed) tiles[i] = TILE_ROCK;
      patch.push(...sealed);
      next = floodWalk(tiles, width, height, start.x, start.y);
    }
    if (!ok) {
      for (const i of patch) tiles[i] = TILE_EMPTY;
      continue;
    }
    reach = next;
    placed += 1;
  }
}

/** Scrap Yard summit: half the full rise over the plain, so a climb is a hill, not a mountain. */
export const YARD_HILL_CEIL = HEIGHT_BASE + (HEIGHT_MAX - HEIGHT_BASE) / 2;

/** 64×64 yard with a central compound and 8 edge/corner spawns. */
export function makeYard64(): MapDef {
  const width = 64;
  const height = 64;
  const tiles = new Array(width * height).fill(TILE_EMPTY);

  fillRect(tiles, width, height, 21, 7, 27, 12, TILE_WATER);
  fillRect(tiles, width, height, 38, 40, 44, 45, TILE_WATER);

  const spawns: SpawnDef[] = [
    { id: 1, x: 3, y: 3, suggestedTeam: 1 },
    { id: 2, x: 60, y: 3, suggestedTeam: 2 },
    { id: 3, x: 3, y: 60, suggestedTeam: 3 },
    { id: 4, x: 60, y: 60, suggestedTeam: 4 },
    { id: 5, x: 31, y: 3 },
    { id: 6, x: 31, y: 60 },
    { id: 7, x: 3, y: 31 },
    { id: 8, x: 60, y: 31 },
  ];
  paintYardScrap(tiles, width, height, "yard-64-scrap", spawns);
  promoteCentreScrap(tiles, width, height);
  const pads = spawns.map((s) => ({ x: s.x, y: s.y, r: 4 }));
  const sub = TILE_SUBDIV;
  // One village on the crossroads in the middle of the yard.
  const village: VillageSpec = { fx: (width * sub) / 2, fy: (height * sub) / 2, arm: 9 };
  const features = scatterCover(tiles, width, height, "yard-64-cover", pads, 1, [village]);
  const fineTiles = upsampleTiles(tiles, width, height, sub);
  const fineW = width * sub;
  const fineH = height * sub;
  thinIsolatedTrees(fineTiles, fineW, fineH, tiles, width, height, sub);
  const fineSpawns = spawns.map((s) => scaleSpawn(s, sub));
  const fineSpawnPads = fineSpawns.map((s) => ({ x: s.x, y: s.y, r: 4 * sub }));
  paintYardPonds(fineTiles, fineW, fineH, "yard-64-ponds", fineSpawnPads, features);
  paintYardDress(fineTiles, fineW, fineH, fineSpawns, features, village);
  const locked = new Uint8Array(fineW * fineH);
  const heights = scatterHeights(fineW, fineH, "yard-64-elev", fineSpawnPads, locked, 1, YARD_HILL_CEIL);
  levelHouseLots(heights, fineTiles, fineW, fineH, features, locked);
  flattenTerrain(heights, fineTiles, fineW, fineH, TILE_WATER, locked);
  paintYardRocks(fineTiles, heights, fineW, fineH, "yard-64-rocks", fineSpawnPads, houseBoxes(features, sub));
  const fineFeatures = scaleFeatures(features, sub);
  const clutter = scatterClutter(fineTiles, fineW, fineH, fineFeatures, fineSpawns, "yard-64-clutter");

  return {
    id: "yard-64",
    name: "Scrap Yard",
    width: fineW,
    height: fineH,
    tileSize: TILE_SIZE,
    tiles: fineTiles,
    heights,
    maxHeight: peakHeight(heights),
    spawns: fineSpawns,
    features: fineFeatures,
    clutter,
  };
}

/** What lies about each kind of building's yard, most likely first. */
const YARD_CLUTTER: Record<string, readonly ClutterType[]> = {
  barn: ["haybale", "haybale", "cart", "woodpile", "barrels"],
  granary: ["haybale", "crates", "cart", "haybale"],
  factory: ["barrels", "tires", "crates", "barrels", "bins"],
  foundry: ["barrels", "tires", "crates", "woodpile"],
  warehouse: ["crates", "crates", "barrels", "cart"],
  inn: ["barrels", "bench", "crates", "bins"],
  chapel: ["bench", "bench", "bins"],
};
const HOME_CLUTTER: readonly ClutterType[] = ["woodpile", "bins", "crates", "bench", "cart", "barrels"];
const ROAD_CLUTTER: readonly ClutterType[] = ["bench", "bins", "crates", "barrels", "cart", "tires"];
const FIELD_CLUTTER: readonly ClutterType[] = ["haybale", "woodpile", "tires", "barrels"];

/**
 * Breakable junk about a finished fine-tile map: by house and barn doors,
 * along the roads, and the odd piece out in the open. Same layout for the same
 * seed. Keeps off start pads, building lots, water, trees, and rock, and leaves
 * room between pieces. `density` scales how many go down; 1 is a lived-in look.
 */
export function scatterClutter(
  tiles: readonly number[],
  width: number,
  height: number,
  features: readonly MapFeature[],
  spawns: readonly { x: number; y: number }[],
  seed: string,
  density = 1,
  taken: readonly { x: number; y: number }[] = [],
): MapClutter[] {
  const rand = { n: hash32(seed) };
  const lot = new Int16Array(width * height).fill(-1);
  features.forEach((f, i) => {
    if (isMapSection(f.type)) return;
    const b = featureBox(f);
    for (let y = Math.max(0, b.y0); y < Math.min(height, b.y1); y++) {
      for (let x = Math.max(0, b.x0); x < Math.min(width, b.x1); x++) lot[y * width + x] = i;
    }
  });
  const near = (x: number, y: number, r: number, hit: (i: number) => boolean): number => {
    for (let d = 1; d <= r; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (hit(ny * width + nx)) return ny * width + nx;
        }
      }
    }
    return -1;
  };
  const out: MapClutter[] = [];
  const placed = taken.map((p) => ({ x: p.x, y: p.y }));
  const padR = SPAWN_PAD_R + 2;
  const pick = (list: readonly ClutterType[]): ClutterType => list[Math.floor(nextRand(rand) * list.length)] ?? list[0]!;
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      if (tiles[i] !== TILE_EMPTY || lot[i]! >= 0) continue;
      const r = nextRand(rand);
      let chance = 0;
      let list = FIELD_CLUTTER;
      const house = near(x, y, 2, (j) => lot[j]! >= 0);
      if (house >= 0) {
        const f = features[lot[house]!]!;
        if ((MAP_DEFENCE_TYPES as readonly string[]).includes(f.type)) continue;
        list = YARD_CLUTTER[f.type] ?? HOME_CLUTTER;
        chance = 0.05;
      } else if (near(x, y, 1, (j) => tiles[j] === TILE_ROAD) >= 0) {
        list = ROAD_CLUTTER;
        chance = 0.012;
      } else {
        chance = 0.0006;
      }
      if (r >= chance * density) continue;
      if (spawns.some((s) => Math.hypot(s.x - x, s.y - y) < padR)) continue;
      if (placed.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < 3)) continue;
      const piece: MapClutter = { type: pick(list), x, y };
      out.push(piece);
      placed.push(piece);
    }
  }
  return out;
}

/** Radius of the clear, level pad the Map Builder keeps around every start, in fine tiles. */
export const SPAWN_PAD_R = 4 * TILE_SUBDIV;

const WALK_BLOCKERS: ReadonlySet<number> = new Set([TILE_BLOCKED, TILE_WATER, TILE_TREE, TILE_FENCE, TILE_ROCK]);

/**
 * Make hand-painted ground playable, in place: every start gets a clear pad
 * level with its own tile, ground under a house is open, water sits at the
 * valley floor, house lots are levelled, and no two neighbours differ by more
 * than one step. `features` are fine-grid and on the coarse grid.
 * `brushed` cells keep their height so slope relaxing ramps around them.
 */
export function normalizeTerrain(
  tiles: number[],
  heights: number[],
  width: number,
  height: number,
  spawns: readonly { x: number; y: number }[],
  features: readonly MapFeature[],
  brushed?: Uint8Array,
): void {
  const locked = new Uint8Array(width * height);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = Math.max(0, Math.min(HEIGHT_MAX, Math.round(heights[i] ?? HEIGHT_BASE)));
  }
  for (const f of features) {
    const b = featureBox(f);
    for (let y = Math.max(0, b.y0); y < Math.min(height, b.y1); y++) {
      for (let x = Math.max(0, b.x0); x < Math.min(width, b.x1); x++) tiles[idx(width, x, y)] = TILE_EMPTY;
    }
  }
  const r = SPAWN_PAD_R;
  for (const s of spawns) {
    const z = heights[idx(width, s.x, s.y)] ?? HEIGHT_BASE;
    for (let y = s.y - r; y <= s.y + r; y++) {
      for (let x = s.x - r; x <= s.x + r; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height || Math.hypot(x - s.x, y - s.y) > r) continue;
        const i = idx(width, x, y);
        if (WALK_BLOCKERS.has(tiles[i] ?? TILE_EMPTY) || isScrapTile(tiles[i])) tiles[i] = TILE_EMPTY;
        heights[i] = z;
        locked[i] = 1;
      }
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === TILE_WATER) {
      heights[i] = 0;
      locked[i] = 1;
    } else if (brushed?.[i]) {
      locked[i] = 1;
    }
  }
  const coarse = lotFeatures(features).map((f) => ({ ...f, x: Math.floor(f.x / TILE_SUBDIV), y: Math.floor(f.y / TILE_SUBDIV) }));
  levelHouseLots(heights, tiles, width, height, coarse, locked);
  relaxSlopes(heights, width, height, locked);
}

/** Rolling hills and valleys for a fresh Map Builder sheet, starts kept flat. */
export function rollHeights(
  width: number,
  height: number,
  seed: string,
  spawns: readonly { x: number; y: number }[],
): number[] {
  const pads = spawns.map((s) => ({ x: s.x, y: s.y, r: SPAWN_PAD_R }));
  return scatterHeights(width, height, seed, pads, undefined, (width * height) / (256 * 256));
}

export const MAPS: Record<string, MapDef> = {
  "yard-64": makeYard64(),
};

export const DEFAULT_MAP_ID = "yard-64";

/** Maps made in the Map Builder, registered by whoever loaded them (server store or client). */
const CUSTOM_MAPS = new Map<string, MapDef>();

export function getMap(id: string): MapDef | undefined {
  return Object.hasOwn(MAPS, id) ? MAPS[id] : CUSTOM_MAPS.get(id);
}

/** Built-in maps first, then custom maps by name. */
/** Map Builder play tests run on a private map with this id prefix. It is never saved or listed. */
export const PLAYTEST_MAP_PREFIX = "c-playtest";

export function isPlaytestMapId(id: string): boolean {
  return id.startsWith(PLAYTEST_MAP_PREFIX);
}

/** Maps a lobby or the builder offers. A running play test's sheet is not one of them. */
export function listMaps(): MapDef[] {
  const custom = [...CUSTOM_MAPS.values()]
    .filter((m) => !isPlaytestMapId(m.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return [...Object.values(MAPS), ...custom];
}

/** Shipped maps. They cannot be overwritten or removed. */
export function isBuiltinMap(id: string): boolean {
  return Object.hasOwn(MAPS, id);
}

/** Add or replace a custom map. A built-in id is refused. */
export function registerMap(map: MapDef): boolean {
  if (isBuiltinMap(map.id)) return false;
  CUSTOM_MAPS.set(map.id, map);
  return true;
}

export function unregisterMap(id: string): boolean {
  return CUSTOM_MAPS.delete(id);
}

export function tileAt(map: MapDef, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return TILE_BLOCKED;
  return map.tiles[y * map.width + x] ?? TILE_BLOCKED;
}

export function heightAt(map: MapDef, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return map.heights[y * map.width + x] ?? 0;
}

export function peakHeight(heights: readonly number[]): number {
  let m = 0;
  for (const h of heights) {
    if (h > m) m = h;
  }
  return m;
}

export function maxHeightOf(map: MapDef): number {
  return map.maxHeight;
}
