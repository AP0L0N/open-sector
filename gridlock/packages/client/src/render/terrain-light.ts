import {
  GROUND_DIRT,
  GROUND_GRASS,
  GROUND_SAND,
  GROUND_STONES,
  GROUND_SWAMP,
  GROUND_TALL_GRASS,
  HEIGHT_BASE,
  HEIGHT_MAX,
  TILE_BLOCKED,
  TILE_ROAD,
  TILE_MOUNTAIN,
  TILE_ROCK,
  isGroveTile,
  isMountainCliff,
  TILE_WATER,
  vertexElev,
  type MapDef,
} from "@gridlock/shared";
import { SUN_ANGLE } from "./cast-shadow.js";
import { blurField } from "./fog-field.js";
import { hillshadeGradient } from "./relief.js";
import { scrapCoverByte, scrapField } from "./scrap-field.js";

/**
 * Altitude tone on one fixed scale: the valley floor is darkest, HEIGHT_MAX is
 * brightest, so a taller map really does read taller.
 */
export function elevShadeFactor(h: number, peak = HEIGHT_MAX): number {
  if (h < HEIGHT_BASE) return 1 - ((HEIGHT_BASE - h) / Math.max(1, HEIGHT_BASE)) * 0.35;
  return 1 + ((h - HEIGHT_BASE) / Math.max(1, peak - HEIGHT_BASE)) * 0.45;
}

export function hash2(tx: number, ty: number, salt: number): number {
  return Math.imul(tx * 374761393 + ty * 668265263 + salt, 1103515245) >>> 0;
}

/** Vertex heights are smoothed this far (in vertices) before shading, so terraces read as slopes. */
const SHADE_BLUR = 1;

/**
 * Levels the terrain sun ray drops per tile. Lower than the building sun (a
 * walkable slope never climbs faster than 1), so a ridge throws a shadow whose
 * length grows with its height.
 */
const TERRAIN_SUN_DROP = 0.45;
/** Levels a ray may pass under the horizon before the ground is fully dark: a soft rim. */
const SHADOW_SOFT = 1.5;
/** Tone lost in full terrain shadow. */
const SHADOW_DARK = 0.35;
/** Hollow darkening: neighbourhood radius in vertices, tone per level below it, cap. */
const HOLLOW_RADIUS = 6;
const HOLLOW_PER_LEVEL = 0.03;
const HOLLOW_MAX = 0.2;

function sample(h: Float32Array, cols: number, rows: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const top = h[y0 * cols + x0]! + (h[y0 * cols + x1]! - h[y0 * cols + x0]!) * fx;
  const bot = h[y1 * cols + x0]! + (h[y1 * cols + x1]! - h[y1 * cols + x0]!) * fx;
  return top + (bot - top) * fy;
}

/**
 * Light left at each vertex after higher ground between it and the sun: 1 in
 * the open, down to 0 deep in a ridge's shadow. Same sun bearing as building shadows.
 */
export function terrainSunlight(h: Float32Array, cols: number, rows: number): Float32Array {
  let peak = -Infinity;
  for (const z of h) if (z > peak) peak = z;
  const dx = -Math.cos(SUN_ANGLE);
  const dy = -Math.sin(SUN_ANGLE);
  const out = new Float32Array(cols * rows);
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const h0 = h[vy * cols + vx]!;
      let under = 0;
      for (let t = 1; h0 + t * TERRAIN_SUN_DROP < peak; t++) {
        const x = vx + dx * t;
        const y = vy + dy * t;
        if (x < 0 || y < 0 || x > cols - 1 || y > rows - 1) break;
        const d = sample(h, cols, rows, x, y) - h0 - t * TERRAIN_SUN_DROP;
        if (d > under) under = d;
        if (under >= SHADOW_SOFT) break;
      }
      out[vy * cols + vx] = 1 - Math.min(1, under / SHADOW_SOFT);
    }
  }
  return out;
}

/**
 * Altitude tone times sun hillshade, terrain shadow and hollow darkening at
 * every mesh vertex. The GPU blends it across each tile, so a slope shades as
 * one surface instead of facets.
 */
export function vertexTones(map: Pick<MapDef, "width" | "height" | "heights"> & { tiles?: ArrayLike<number> }): Float32Array {
  const cols = map.width + 1;
  const rows = map.height + 1;
  const h = new Float32Array(cols * rows);
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) h[vy * cols + vx] = vertexElev(map.heights, map.width, map.height, vx, vy, map.tiles);
  }
  blurField(h, cols, rows, SHADE_BLUR);
  const sun = terrainSunlight(h, cols, rows);
  const around = blurField(Float32Array.from(h), cols, rows, HOLLOW_RADIUS);
  const at = (x: number, y: number): number =>
    h[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))]!;
  const out = new Float32Array(cols * rows);
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const i = vy * cols + vx;
      const gx = (at(vx + 1, vy) - at(vx - 1, vy)) / 2;
      const gy = (at(vx, vy + 1) - at(vx, vy - 1)) / 2;
      const hollow = 1 - Math.min(HOLLOW_MAX, Math.max(0, around[i]! - h[i]!) * HOLLOW_PER_LEVEL);
      const shadow = 1 - (1 - sun[i]!) * SHADOW_DARK;
      out[i] = elevShadeFactor(h[i]!) * hillshadeGradient(gx, gy) * shadow * hollow;
    }
  }
  return out;
}

/**
 * Per-tile material weights for the ground shader.
 * `a` = (dirt, dry meadow, damp meadow, rock); `b` = (tree floor, water, blocked, scrap yard);
 * `c` = (sand, tall grass, stones, swamp), the cover a map paints over the meadow.
 * The dry and damp meadow channels come from the cover's neighbourhood: tall grass dries
 * the ground around it a little, marsh dampens it, so a stand does not sit on a hard edge.
 * Scrap is the blurred yard cover, so the stained ground has a rounded rim.
 */
export function materialBytes(
  map: Pick<MapDef, "width" | "height" | "tiles"> & { heights?: ArrayLike<number>; ground?: ArrayLike<number> },
  scrap: ReadonlySet<number>,
): { a: Uint8Array; b: Uint8Array; c: Uint8Array } {
  const n = map.width * map.height;
  const a = new Uint8Array(n * 4);
  const b = new Uint8Array(n * 4);
  const c = new Uint8Array(n * 4);
  const yard = scrap.size ? scrapField(scrap, map.width, map.height) : null;
  const cover = map.ground;
  for (let i = 0; i < n; i++) {
    const kind = map.tiles[i] ?? 0;
    const o = i * 4;
    if (yard) b[o + 3] = scrapCoverByte(yard, i);
    if (kind === TILE_WATER) {
      b[o + 1] = 255;
      continue;
    }
    if (kind === TILE_BLOCKED) {
      b[o + 2] = 255;
      continue;
    }
    if (kind === TILE_ROCK || (map.heights && isMountainCliff(map.tiles, map.heights, map.width, map.height, i % map.width, (i / map.width) | 0))) {
      a[o + 3] = 255;
      continue;
    }
    if (kind === TILE_MOUNTAIN) {
      a[o + 3] = 110;
      continue;
    }
    if (kind === TILE_ROAD) {
      a[o] = 255;
      continue;
    }
    if (isGroveTile(kind)) b[o] = 255;
    const g = cover ? (cover[i] ?? GROUND_GRASS) : GROUND_GRASS;
    if (g === GROUND_DIRT) a[o] = 255;
    else if (g === GROUND_SAND) c[o] = 255;
    else if (g === GROUND_TALL_GRASS) {
      c[o + 1] = 255;
      a[o + 1] = 150;
    } else if (g === GROUND_STONES) c[o + 2] = 255;
    else if (g === GROUND_SWAMP) {
      c[o + 3] = 255;
      a[o + 2] = 255;
    }
  }
  if (cover) {
    // Dampness spreads one tile past a marsh, dryness one tile past tall grass.
    const w = map.width;
    for (let i = 0; i < n; i++) {
      const g = cover[i] ?? GROUND_GRASS;
      if (g !== GROUND_SWAMP && g !== GROUND_TALL_GRASS) continue;
      const x = i % w;
      const y = (i / w) | 0;
      const ch = g === GROUND_SWAMP ? 2 : 1;
      const v = g === GROUND_SWAMP ? 140 : 80;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) continue;
          const j = (ny * w + nx) * 4;
          if (a[j + 3] || b[j + 1] || b[j + 2] || a[j]) continue;
          if (a[j + ch]! < v) a[j + ch] = v;
        }
      }
    }
  }
  return { a, b, c };
}
