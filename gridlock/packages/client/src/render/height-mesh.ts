import { ISO_TILE_H, ISO_TILE_W, isoLift, vertexElev, type MapDef } from "@gridlock/shared";

/** The ground as one lifted vertex grid, for GL passes that must sit on the drawn hills. */
export type HeightMesh = {
  cols: number;
  rows: number;
  /** Iso pixels per vertex, lifted by elevation. */
  pos: Float32Array;
  /** Tile-space coordinates per vertex (vx, vy). */
  uv: Float32Array;
  /** Two triangles per tile, ordered back (low tx+ty) to front like the 2D bake. */
  index: Uint32Array;
};

const heightSerials = new WeakMap<object, number>();
let heightSerial = 0;

/** Stable key for a heights array until `heightsChanged` marks it edited. Cache keys for meshes use it. */
export function heightsKey(heights: object): number {
  let k = heightSerials.get(heights);
  if (k == null) {
    k = ++heightSerial;
    heightSerials.set(heights, k);
  }
  return k;
}

/** The ground under `heights` moved (a blast sank it). Every mesh built from it is stale. */
export function heightsChanged(heights: object): void {
  heightSerials.set(heights, ++heightSerial);
}

export function heightMesh(map: Pick<MapDef, "width" | "height" | "heights"> & { tiles?: ArrayLike<number> }): HeightMesh {
  const cols = map.width + 1;
  const rows = map.height + 1;
  const pos = new Float32Array(cols * rows * 2);
  const uv = new Float32Array(cols * rows * 2);
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const o = (vy * cols + vx) * 2;
      const z = isoLift(vertexElev(map.heights, map.width, map.height, vx, vy, map.tiles));
      pos[o] = ((vx - vy) * ISO_TILE_W) / 2;
      pos[o + 1] = ((vx + vy) * ISO_TILE_H) / 2 - z;
      uv[o] = vx;
      uv[o + 1] = vy;
    }
  }
  const w = map.width;
  const h = map.height;
  const index = new Uint32Array(w * h * 6);
  let k = 0;
  for (let sum = 0; sum <= w + h - 2; sum++) {
    const x0 = Math.max(0, sum - (h - 1));
    const x1 = Math.min(w - 1, sum);
    for (let tx = x0; tx <= x1; tx++) {
      const ty = sum - tx;
      const n = ty * cols + tx;
      const e = n + 1;
      const s = n + cols + 1;
      const west = n + cols;
      index[k++] = n;
      index[k++] = e;
      index[k++] = s;
      index[k++] = n;
      index[k++] = s;
      index[k++] = west;
    }
  }
  return { cols, rows, pos, uv, index };
}

/** Tileable value noise, seeded so every client draws the same fog grain. */
export function noiseBytes(size: number, seed = 0x9e3779b9): Uint8Array {
  let s = seed >>> 0;
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) & 255;
  }
  return out;
}
