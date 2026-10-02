import {
  HEIGHT_BASE,
  HEIGHT_MAX,
  TILE_BLOCKED,
  TILE_ROAD,
  TILE_ROCK,
  TILE_TREE,
  TILE_WATER,
  vertexElev,
  type MapDef,
} from "@gridlock/shared";
import { blurField } from "./fog-field.js";
import { hillshadeGradient } from "./relief.js";

export function elevShadeFactor(h: number): number {
  const span = Math.max(1, HEIGHT_MAX - HEIGHT_BASE);
  const u = (h - HEIGHT_BASE) / span;
  // Valleys sink harder than peaks lift so a hollow reads at a glance.
  return 1 + u * (u < 0 ? 0.6 : 0.62);
}

export function hash2(tx: number, ty: number, salt: number): number {
  return Math.imul(tx * 374761393 + ty * 668265263 + salt, 1103515245) >>> 0;
}

/** Vertex heights are smoothed this far (in vertices) before shading, so terraces read as slopes. */
const SHADE_BLUR = 1;

/**
 * Altitude tone times sun hillshade at every mesh vertex. The GPU blends it
 * across each tile, so a slope shades as one surface instead of facets.
 */
export function vertexTones(map: Pick<MapDef, "width" | "height" | "heights">): Float32Array {
  const cols = map.width + 1;
  const rows = map.height + 1;
  const h = new Float32Array(cols * rows);
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) h[vy * cols + vx] = vertexElev(map.heights, map.width, map.height, vx, vy);
  }
  blurField(h, cols, rows, SHADE_BLUR);
  const at = (x: number, y: number): number =>
    h[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))]!;
  const out = new Float32Array(cols * rows);
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const gx = (at(vx + 1, vy) - at(vx - 1, vy)) / 2;
      const gy = (at(vx, vy + 1) - at(vx, vy - 1)) / 2;
      out[vy * cols + vx] = elevShadeFactor(at(vx, vy)) * hillshadeGradient(gx, gy);
    }
  }
  return out;
}

/** Broad drier / darker meadow fields, 64 tiles a side. Same pick as the 2D surface. */
export function meadowField(tx: number, ty: number): 0 | 1 | 2 {
  const field = hash2(tx >> 6, ty >> 6, 5);
  if (field % 5 === 0) return 1;
  if (field % 8 === 0) return 2;
  return 0;
}

/**
 * Per-tile material weights for the ground shader.
 * `a` = (dirt, dry meadow, damp meadow, rock); `b` = (tree floor, water, blocked, 0).
 */
export function materialBytes(
  map: Pick<MapDef, "width" | "height" | "tiles">,
  scrap: ReadonlySet<number>,
): { a: Uint8Array; b: Uint8Array } {
  const n = map.width * map.height;
  const a = new Uint8Array(n * 4);
  const b = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const kind = map.tiles[i] ?? 0;
    const o = i * 4;
    if (kind === TILE_WATER) {
      b[o + 1] = 255;
      continue;
    }
    if (kind === TILE_BLOCKED) {
      b[o + 2] = 255;
      continue;
    }
    if (kind === TILE_ROCK) {
      a[o + 3] = 255;
      continue;
    }
    if (kind === TILE_ROAD || scrap.has(i)) {
      a[o] = 255;
      continue;
    }
    if (kind === TILE_TREE) b[o] = 255;
    const f = meadowField(i % map.width, (i / map.width) | 0);
    if (f === 1) a[o + 1] = 255;
    else if (f === 2) a[o + 2] = 255;
  }
  return { a, b };
}
