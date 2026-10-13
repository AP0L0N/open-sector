/** Veil colour over ground that is out of sight. One level: the map itself is always known. */
export const FOG_RGB: readonly [number, number, number] = [14, 16, 20];
/** Veil opacity where a tile is fully out of sight. */
export const FOG_VEIL_ALPHA = 0.52;
/** Complete fog of war: never-seen ground. Alpha above 1 so the veil noise cannot thin it. */
export const SHROUD_RGB: readonly [number, number, number] = [0, 0, 0];
export const SHROUD_ALPHA = 1.3;
/** Box-blur radius in tiles; two passes round the edge into a soft falloff. */
export const FOG_BLUR_TILES = 2;
export const FOG_FADE_MS = 300;

export function fogCss(alpha: number): string {
  return `rgba(${FOG_RGB[0]},${FOG_RGB[1]},${FOG_RGB[2]},${alpha.toFixed(3)})`;
}

function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean): void {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const span = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const at = (k: number): number => {
      const c = k < 0 ? 0 : k >= len ? len - 1 : k;
      return horizontal ? src[line * w + c]! : src[c * w + line]!;
    };
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += at(k);
    for (let k = 0; k < len; k++) {
      const o = horizontal ? line * w + k : k * w + line;
      dst[o] = sum / span;
      sum += at(k + r + 1) - at(k - r);
    }
  }
}

/** Two separable box passes with clamped edges, in place. */
export function blurField(a: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return a;
  const b = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    boxPass(a, b, w, h, radius, true);
    boxPass(b, a, w, h, radius, false);
  }
  return a;
}

/** Per-tile sight (0 or 1) softened into 0..1 with clamped edges. */
export function blurVision(mask: ArrayLike<number>, w: number, h: number, radius = FOG_BLUR_TILES): Float32Array {
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = mask[i] ? 1 : 0;
  return blurField(a, w, h, radius);
}

/** Bilinear read at tile coordinates, where tile `i` covers [i, i+1). Matches GL LINEAR + CLAMP. */
export function sampleField(f: ArrayLike<number>, w: number, h: number, u: number, v: number): number {
  const x = Math.min(w - 1, Math.max(0, u - 0.5));
  const y = Math.min(h - 1, Math.max(0, v - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = f[y0 * w + x0] ?? 0;
  const b = f[y0 * w + x1] ?? 0;
  const c = f[y1 * w + x0] ?? 0;
  const d = f[y1 * w + x1] ?? 0;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function fadeT(changedAt: number, now: number, ms = FOG_FADE_MS): number {
  if (ms <= 0) return 1;
  const t = (now - changedAt) / ms;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** A box of tiles, `x0..x1` and `y0..y1` inclusive. */
export type TileBox = { x0: number; y0: number; x1: number; y1: number };

/** The box round every tile where `a` and `b` differ, or null when none does. */
export function maskDiffBox(a: ArrayLike<number>, b: ArrayLike<number>, w: number): TileBox | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    if ((a[i] ? 1 : 0) === (b[i] ? 1 : 0)) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 };
}

/** Soft sight field the ground veil and the building veil both read, so they agree. */
export class FogField {
  readonly w: number;
  readonly h: number;
  prev: Float32Array;
  next: Float32Array;
  changedAt = -Infinity;
  /** Bumps on every `set`; GL uploads key off it. */
  version = 0;
  /** The mask `next` was blurred from, so the next one can be compared and only the change re-blurred. */
  private mask: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.prev = new Float32Array(w * h);
    this.next = new Float32Array(w * h);
    this.mask = new Uint8Array(w * h);
  }

  /**
   * New sight mask. A fade that is still running continues from where it is. Only the tiles
   * that changed (`box`, found by comparing when left out) and the blur's reach round them are
   * blurred again: a few hundred tiles a snapshot, not the whole map.
   */
  set(mask: ArrayLike<number>, now: number, instant = false, box?: TileBox | null): void {
    const w = this.w;
    const h = this.h;
    const n = w * h;
    const dirty = box === undefined ? maskDiffBox(this.mask, mask, w) : box;
    if (!dirty && this.version > 0) return;
    const t = fadeT(this.changedAt, now);
    const from = this.prev;
    const to = this.next;
    // Where the fade stands now becomes where the next one starts from.
    if (t >= 1) from.set(to);
    else for (let i = 0; i < n; i++) from[i] = from[i]! + (to[i]! - from[i]!) * t;
    for (let i = 0; i < n; i++) this.mask[i] = mask[i] ? 1 : 0;
    const reach = FOG_BLUR_TILES * 2;
    const d = dirty ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
    // The crop holds the blur's reach round the box, so its clamped edges only fall where the map's do.
    const cx0 = Math.max(0, d.x0 - reach * 2);
    const cy0 = Math.max(0, d.y0 - reach * 2);
    const cx1 = Math.min(w - 1, d.x1 + reach * 2);
    const cy1 = Math.min(h - 1, d.y1 + reach * 2);
    const cw = cx1 - cx0 + 1;
    const ch = cy1 - cy0 + 1;
    const crop = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const row = (cy0 + y) * w + cx0;
      for (let x = 0; x < cw; x++) crop[y * cw + x] = this.mask[row + x]!;
    }
    blurField(crop, cw, ch, FOG_BLUR_TILES);
    const bx0 = Math.max(0, d.x0 - reach);
    const by0 = Math.max(0, d.y0 - reach);
    const bx1 = Math.min(w - 1, d.x1 + reach);
    const by1 = Math.min(h - 1, d.y1 + reach);
    for (let y = by0; y <= by1; y++) {
      const row = y * w;
      const crow = (y - cy0) * cw - cx0;
      for (let x = bx0; x <= bx1; x++) to[row + x] = crop[crow + x]!;
    }
    if (instant) from.set(to);
    this.changedAt = now;
    this.version++;
  }

  mix(now: number): number {
    return fadeT(this.changedAt, now);
  }

  /** Sight 0..1 at tile coordinates. */
  sample(u: number, v: number, now: number): number {
    const t = this.mix(now);
    const b = sampleField(this.next, this.w, this.h, u, v);
    if (t >= 1) return b;
    const a = sampleField(this.prev, this.w, this.h, u, v);
    return a + (b - a) * t;
  }

  /** Veil opacity at tile coordinates. */
  veil(u: number, v: number, now: number): number {
    return FOG_VEIL_ALPHA * (1 - this.sample(u, v, now));
  }
}

export function fieldBytes(f: Float32Array): Uint8Array {
  const out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, f[i]!)) * 255);
  return out;
}
