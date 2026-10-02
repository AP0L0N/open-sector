/** Veil colour over ground that is out of sight. One level: the map itself is always known. */
export const FOG_RGB: readonly [number, number, number] = [14, 16, 20];
/** Veil opacity where a tile is fully out of sight. */
export const FOG_VEIL_ALPHA = 0.52;
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

/** Soft sight field the ground veil and the building veil both read, so they agree. */
export class FogField {
  readonly w: number;
  readonly h: number;
  prev: Float32Array;
  next: Float32Array;
  changedAt = -Infinity;
  /** Bumps on every `set`; GL uploads key off it. */
  version = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.prev = new Float32Array(w * h);
    this.next = new Float32Array(w * h);
  }

  /** New sight mask. A fade that is still running continues from where it is. */
  set(mask: ArrayLike<number>, now: number, instant = false): void {
    const t = fadeT(this.changedAt, now);
    const from = this.prev;
    const to = this.next;
    const mid = new Float32Array(this.w * this.h);
    for (let i = 0; i < mid.length; i++) mid[i] = from[i]! + (to[i]! - from[i]!) * t;
    this.next = blurVision(mask, this.w, this.h);
    this.prev = instant ? this.next : mid;
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
