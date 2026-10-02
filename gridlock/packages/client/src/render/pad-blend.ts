/**
 * Melts a building sprite's baked ground pad into the terrain. Client-only.
 *
 * The art carries its own yard (grass, cobbles, a concrete slab) drawn as a thin
 * slab with lit side faces. On the map that lip reads as a plate the building
 * floats on, and the pad's straight diamond edge reads as a pasted tile. This
 * pass drops the lip and frays the pad's edge into a ragged fade:
 *
 * - South edges (SW, SE) always fade; nothing of the building stands past them.
 * - North edges (NW, NE) fade only in columns where nothing rises just above the
 *   edge line, so walls drawn over the pad keep their footing.
 *
 * Pad metrics are the sprite's own: a square footprint whose 2:1 diamond spans
 * `padWidth` source pixels, with its south contact at (padSouthX, padSouthY).
 */

export interface PadMetrics {
  padWidth: number;
  padSouthX: number;
  padSouthY: number;
}

/** Fade band, as a share of the pad width. */
export const PAD_FEATHER = 0.075;
/** Trodden earth the pad's rim goes to before it fades out. */
const MUD: readonly [number, number, number] = [74, 62, 42];
/** How far toward mud the rim goes where it is fully faded. */
const MUD_MIX = 0.85;
/** How far the noise pushes the fade line in or out, per fade width. */
const RAGGED = 1.1;
/** Perpendicular source px per unit of diamond coordinate (2:1 edge slope). */
const EDGE_PERP = 0.5 * 0.894;

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0, 1). Same input, same output, so every client frays alike. */
export function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smooth(gx - x0);
  const fy = smooth(gy - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function smoothstep01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * Per column, 1 where the pad's north edge is bare yard (nothing stands just
 * above it), easing to 0 next to columns where a wall rises through the edge.
 */
export function bareNorthColumns(rgba: ArrayLike<number>, width: number, height: number, pad: PadMetrics, fade: number): Float32Array {
  const raw = new Float32Array(width);
  const half = pad.padWidth / 2;
  for (let x = 0; x < width; x++) {
    const dx = x + 0.5 - pad.padSouthX;
    if (Math.abs(dx) > half) continue;
    const edgeY = pad.padSouthY - half + Math.abs(dx) / 2;
    let solid = 0;
    for (const off of [0.3, 0.6, 1.2, 2]) {
      const y = Math.floor(edgeY - fade * off);
      if (y < 0 || y >= height) continue;
      solid = Math.max(solid, rgba[(y * width + x) * 4 + 3]! / 255);
    }
    raw[x] = solid < 0.1 ? 1 : 0;
  }
  // A box blur, then keep the lower value: the fade backs off near any wall.
  const k = Math.max(1, Math.round(fade));
  const out = new Float32Array(width);
  let sum = 0;
  for (let x = 0; x < width + k; x++) {
    if (x < width) sum += raw[x]!;
    if (x - k >= 0) sum -= raw[x - k]!;
    const c = x - Math.floor(k / 2);
    if (c >= 0 && c < width) out[c] = Math.min(raw[c]!, sum / k);
  }
  return out;
}

/** Multiplier for one pixel's alpha. `bare` is this pixel's column from `bareNorthColumns`. */
export function padAlpha(x: number, y: number, pad: PadMetrics, fade: number, bare: number, noise: number): number {
  const p = pad.padWidth;
  const dx = x - pad.padSouthX;
  const dy = y - pad.padSouthY;
  const e = dx / p - (2 * dy) / p;
  const w = -dx / p - (2 * dy) / p;
  const k = p * EDGE_PERP;
  const jitter = (noise - 0.5) * fade * RAGGED;
  const south = smoothstep01((Math.min(e, w) * k + jitter) / fade);
  if (bare <= 0) return south;
  const dN = (1 - Math.max(e, w)) * k + jitter;
  // Above the north edge is the building itself; never touch it.
  if ((1 - Math.max(e, w)) * k <= 0) return south;
  const north = smoothstep01(dN / fade);
  return south * (1 - bare * (1 - north));
}

/** Rewrites the alpha channel of a sprite's pixels in place. */
export function blendPadInPlace(rgba: Uint8ClampedArray, width: number, height: number, pad: PadMetrics): void {
  if (pad.padWidth <= 0) return;
  const fade = Math.max(1, pad.padWidth * PAD_FEATHER);
  const bare = bareNorthColumns(rgba, width, height, pad, fade);
  const coarse = Math.max(4, Math.round(fade * 0.5));
  const fine = Math.max(2, Math.round(fade * 0.18));
  // Only the band around the pad's lower half can change.
  const yTop = Math.max(0, Math.floor(pad.padSouthY - pad.padWidth / 2 - fade * 2));
  for (let y = yTop; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4 + 3;
      const a = rgba[i]!;
      if (a === 0) continue;
      const noise = valueNoise(x, y, coarse, 1) * 0.65 + valueNoise(x, y, fine, 2) * 0.35;
      const m = padAlpha(x + 0.5, y + 0.5, pad, fade, bare[x]!, noise);
      if (m >= 1) continue;
      // Earth banks up over the edge before it gives way: a pale slab or bright
      // lawn goes muddy first, so its rim never reads as a plate on the grass.
      const mud = (1 - m) * MUD_MIX;
      rgba[i - 3] = Math.round(rgba[i - 3]! + (MUD[0] - rgba[i - 3]!) * mud);
      rgba[i - 2] = Math.round(rgba[i - 2]! + (MUD[1] - rgba[i - 2]!) * mud);
      rgba[i - 1] = Math.round(rgba[i - 1]! + (MUD[2] - rgba[i - 1]!) * mud);
      rgba[i] = Math.round(a * m);
    }
  }
}
