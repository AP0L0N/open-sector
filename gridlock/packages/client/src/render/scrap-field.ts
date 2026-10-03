import { hash2 } from "./terrain-light.js";

/**
 * Scrap tiles come in 4×4 blocks laid out as a diamond, which reads on screen
 * as a hard rectangle. The picture follows a wide blurred cover field with a
 * wandering rim instead, so a yard reads as one rounded heap of salvage, the
 * same way the shore rounds diamond water. Harvest still works per tile.
 */

/** Blur radius in tiles. Wide enough to round a whole yard, not just its steps. */
export const SCRAP_SOFT_RADIUS = 5.5;
/** Tiles around a changed scrap tile whose picture can change with it. */
export const SCRAP_SOFT_REACH = Math.ceil(SCRAP_SOFT_RADIUS) + 2;
/** Cover a real scrap tile keeps under the stain, so the last remnants never vanish. */
const REMNANT_COVER = 0.42;
/** Tiles per cell of the noise that bends the rim. */
const RIM_CELL = 5;
/** How far the rim wanders, in cover units either side of one half. */
const RIM_WANDER = 0.2;

export type ScrapField = {
  set: ReadonlySet<number>;
  width: number;
  height: number;
  /** Blurred cover at each tile centre, 0..1. */
  cover: Float32Array;
};

const R = SCRAP_SOFT_RADIUS;
const RI = Math.ceil(R);

function kernel(d: number): number {
  return d < R ? 1 - d / R : 0;
}

/** Sum of the kernel over a full neighborhood centred on a tile. */
const CENTRE_SUM = (() => {
  let s = 0;
  for (let dy = -RI; dy <= RI; dy++) for (let dx = -RI; dx <= RI; dx++) s += kernel(Math.hypot(dx, dy));
  return s;
})();

/** Splat every scrap tile into a per-tile cover grid. Cost is scrap tiles × kernel, not map size. */
export function scrapField(set: ReadonlySet<number>, width: number, height: number): ScrapField {
  const cover = new Float32Array(width * height);
  for (const i of set) {
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -RI; dy <= RI; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -RI; dx <= RI; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const k = kernel(Math.hypot(dx, dy));
        if (k > 0) cover[ny * width + nx]! += k / CENTRE_SUM;
      }
    }
  }
  for (let i = 0; i < cover.length; i++) cover[i] = Math.min(1, cover[i]!);
  return { set, width, height, cover };
}

/** Cover at a point in tile units (tile (x, y) spans x..x+1), bilinear between tile centres. */
export function scrapCoverAt(field: ScrapField, fx: number, fy: number): number {
  const { width, height, cover } = field;
  const gx = fx - 0.5;
  const gy = fy - 0.5;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : (cover[y * width + x] ?? 0);
  const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
  const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bot * ty;
}

/** Smooth value noise in [-1, 1], one lattice point per RIM_CELL tiles. */
function rimNoise(fx: number, fy: number): number {
  const gx = fx / RIM_CELL;
  const gy = fy / RIM_CELL;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const sx = gx - x0;
  const sy = gy - y0;
  const ex = sx * sx * (3 - 2 * sx);
  const ey = sy * sy * (3 - 2 * sy);
  const v = (x: number, y: number): number => (hash2(x, y, 67) % 1024) / 511.5 - 1;
  const top = v(x0, y0) * (1 - ex) + v(x0 + 1, y0) * ex;
  const bot = v(x0, y0 + 1) * (1 - ex) + v(x0 + 1, y0 + 1) * ex;
  return top * (1 - ey) + bot * ey;
}

/** Where the yard's rounded rim sits at this point: cover above this is yard. */
export function scrapRim(fx: number, fy: number): number {
  return 0.5 + rimNoise(fx, fy) * RIM_WANDER;
}

/** True where the ground reads as a scrap yard (bare, stained earth). Used without WebGL. */
export function scrapGround(field: ScrapField, i: number): boolean {
  const x = i % field.width;
  const y = (i / field.width) | 0;
  return (field.cover[i] ?? 0) >= scrapRim(x + 0.5, y + 0.5);
}

export type ScrapDressKind = "heap" | "piece" | "bits";

export type ScrapDress = {
  kind: ScrapDressKind;
  face: number;
  /** Contact point in tile units. */
  fx: number;
  fy: number;
  drawH: number;
  flip: boolean;
};

/** Tiles per side of the jittered grid that seats hull-chunk heaps. */
const HEAP_CELL = 5;

/** Hull-chunk heaps stand apart: one seat per grid cell, jittered inside it. */
function heapSeat(tx: number, ty: number): boolean {
  const cx = Math.floor(tx / HEAP_CELL);
  const cy = Math.floor(ty / HEAP_CELL);
  const h = hash2(cx, cy, 61);
  return tx === cx * HEAP_CELL + 1 + ((h >>> 5) % 2) && ty === cy * HEAP_CELL + 1 + ((h >>> 13) % 2);
}

/**
 * The salvage this tile contributes, or null. Any tile can carry dress, not
 * only scrap tiles, so the outline follows the blurred cover, not the grid.
 * A real scrap tile left outside the rim still shows loose shards.
 */
export function scrapDressAt(field: ScrapField, tx: number, ty: number): ScrapDress | null {
  const { width, height } = field;
  if (tx < 0 || ty < 0 || tx >= width || ty >= height) return null;
  const own = field.set.has(ty * width + tx);
  // Cheap reject: nothing within reach of this tile.
  if (!own && (field.cover[ty * width + tx] ?? 0) < 0.2) return null;
  const h = hash2(tx, ty, 59);
  const fx = tx + 0.2 + ((h >>> 4) % 61) / 100;
  const fy = ty + 0.2 + ((h >>> 11) % 61) / 100;
  const flip = ((h >>> 9) & 1) === 1;
  const c = scrapCoverAt(field, fx, fy);
  // A ragged rim on top of the wandering one.
  const rim = scrapRim(fx, fy) + (((h >>> 18) % 13) - 6) / 100;
  if (c < rim) {
    if (own && h % 2 === 0) return { kind: "bits", face: h >>> 7, fx, fy, drawH: 6 + (h % 2), flip };
    return null;
  }
  if (c > rim + 0.1 && heapSeat(tx, ty)) {
    return { kind: "heap", face: h >>> 3, fx, fy, drawH: 23 + (h % 6), flip };
  }
  if (c > rim + 0.06 && h % 5 < 2) {
    return { kind: "piece", face: h >>> 5, fx, fy, drawH: 11 + (h % 5), flip };
  }
  // Leave some bare stained ground between items; the rim stays sparse.
  if (h % 5 < (c > rim + 0.12 ? 4 : 2)) {
    return { kind: "bits", face: h >>> 7, fx, fy, drawH: 7 + (h % 3), flip };
  }
  return null;
}

/** Material weight for the GL ground: blurred cover, held up on real scrap tiles. */
export function scrapCoverByte(field: ScrapField, i: number): number {
  let c = field.cover[i] ?? 0;
  if (field.set.has(i)) c = Math.max(c, REMNANT_COVER);
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}
