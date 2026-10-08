/**
 * One observer's sight disc in a single radial sweep.
 *
 * Tiles go out in distance order through angular bins that remember, for
 * that direction, the steepest rising ground, the cover, and the grove cost
 * met so far. The rules are those of `hasFullLosFlagged`: ground blocks when
 * it rises above the eye-to-target line by more than LOS_TERRAIN_SLACK (and
 * only a tile higher than the one before it on the way can), walls,
 * buildings, hulls and smoke stop the eye outright except the observer's own
 * and the target's own hull, groves spend GROVE_SIGHT_BUDGET, and a smoke
 * tile shows only from SMOKE_PEEK_TILES. Where the walker casts one ray per
 * tile, O(R³), the sweep touches each tile once, O(R²).
 */
import { GROVE_SIGHT_BUDGET, HEIGHT_MAX, LOS_TERRAIN_SLACK, SIGHT_UPHILL_MAX_TILES, SMOKE_PEEK_TILES } from "../catalog.js";
import { groveSightCost, TILE_BLOCKED } from "../maps.js";
import { coverSmokeAt, levelSightExtra, type CoverField } from "./elevation.js";

/** What the sweep reads from one observer. */
export type SweepEye = {
  ox: number;
  oy: number;
  /** Catalog reach in tiles; the uphill bonus reaches past it. */
  radius: number;
  eye: number;
  uphill: number;
  /** Occupy or hull id of the observer's own body, never a blocker. */
  ignore: number;
};

/** Tile indices, with a count, so a caller can append without allocating per tile. */
export type LitList = { tiles: Int32Array; n: number };

export function litPush(out: LitList, i: number): void {
  if (out.n === out.tiles.length) {
    const grown = new Int32Array(out.tiles.length * 2);
    grown.set(out.tiles);
    out.tiles = grown;
  }
  out.tiles[out.n++] = i;
}

/** Angular bins per tile of reach: a tile at the rim spans about one. */
const BINS_PER_TILE = 6;
/** Bins either side of a target's centre that may also show it. 0: the centre line alone decides, as a walked ray would. */
const PEEK_BINS = 0;
const TWO_PI = Math.PI * 2;

/** Every offset within one reach, nearest first, with its bins and inward neighbour. */
type SweepTable = {
  n: number;
  bins: number;
  dx: Int16Array;
  dy: Int16Array;
  /** Rounded reach, as `sightDist` measures it. */
  d: Int16Array;
  /** 1 / true distance, for slopes. 0 at the origin. */
  inv: Float32Array;
  /** Index in this table of the next tile toward the origin; -1 at the origin. */
  inner: Int32Array;
  /** First bin of the tile's angular span, how many bins it spans, and the bin under its centre. */
  b0: Int32Array;
  bn: Int16Array;
  bc: Int32Array;
};

const tables = new Map<number, SweepTable>();

/** Tables come in steps of this many tiles, so dusk dimming sight by a tile does not build a new one each time. */
const TABLE_STEP = 16;

function wrapAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

/** The table out to `R` with `bins` bins. Bins come from the eye's whole reach, so a culled sweep paints the same as a full one. */
function tableFor(R: number, bins: number): SweepTable {
  const hit = tables.get(R * 65536 + bins);
  if (hit) return hit;
  const side = 2 * R + 1;
  const ox: number[] = [];
  const oy: number[] = [];
  const od: number[] = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const rho = Math.hypot(dx, dy);
      if (Math.round(rho) > R) continue;
      ox.push(dx);
      oy.push(dy);
      od.push(rho);
    }
  }
  const order = ox.map((_, k) => k);
  order.sort((a, b) => od[a]! - od[b]! || oy[a]! - oy[b]! || ox[a]! - ox[b]!);
  const n = order.length;
  const binW = TWO_PI / bins;
  const pos = new Int32Array(side * side).fill(-1);
  for (let k = 0; k < n; k++) {
    const o = order[k]!;
    pos[(oy[o]! + R) * side + ox[o]! + R] = k;
  }
  const t: SweepTable = {
    n,
    bins,
    dx: new Int16Array(n),
    dy: new Int16Array(n),
    d: new Int16Array(n),
    inv: new Float32Array(n),
    inner: new Int32Array(n),
    b0: new Int32Array(n),
    bn: new Int16Array(n),
    bc: new Int32Array(n),
  };
  for (let k = 0; k < n; k++) {
    const o = order[k]!;
    const dx = ox[o]!;
    const dy = oy[o]!;
    const rho = od[o]!;
    t.dx[k] = dx;
    t.dy[k] = dy;
    t.d[k] = Math.round(rho);
    if (rho === 0) {
      t.inv[k] = 0;
      t.inner[k] = -1;
      t.b0[k] = 0;
      t.bn[k] = bins;
      t.bc[k] = 0;
      continue;
    }
    t.inv[k] = 1 / rho;
    const ix = Math.round(dx - dx / rho);
    const iy = Math.round(dy - dy / rho);
    t.inner[k] = pos[(iy + R) * side + ix + R]!;
    const centre = Math.atan2(dy, dx);
    let lo = 0;
    let hi = 0;
    for (let c = 0; c < 4; c++) {
      const cx = dx + (c & 1 ? 0.5 : -0.5);
      const cy = dy + (c & 2 ? 0.5 : -0.5);
      let delta = Math.atan2(cy, cx) - centre;
      if (delta > Math.PI) delta -= TWO_PI;
      else if (delta < -Math.PI) delta += TWO_PI;
      if (delta < lo) lo = delta;
      if (delta > hi) hi = delta;
    }
    // The tile claims the bins whose centre line crosses it, so a corner grazing a bin does not take it;
    // neighbours abut, so a solid wall still leaves no gap. A tile narrower than a bin keeps its centre bin.
    let b0 = Math.ceil((centre + lo) / binW - 0.5);
    const b1 = Math.floor((centre + hi) / binW - 0.5);
    const bc = Math.floor(wrapAngle(centre) / binW);
    let bn = b1 - b0 + 1;
    if (bn < 1) {
      b0 = bc;
      bn = 1;
    }
    t.b0[k] = ((b0 % bins) + bins) % bins;
    t.bn[k] = bn;
    t.bc[k] = bc;
  }
  tables.set(R * 65536 + bins, t);
  return t;
}

/** Tiles per reach block. The uphill ring is sought only in blocks whose ground can be in reach. */
const SIGHT_BLOCK = 16;

let sightBlockMin = new Uint8Array(0);
let sightBlockMax = new Uint8Array(0);
let sightBlockCols = 0;
let sightBlockRows = 0;
let sightBlocksFor: ArrayLike<number> | null = null;
let sightBlocksRev = -1;
/** 1 where the tile stands above some neighbour, so it can be a rising tile on a way out from somewhere. */
let sightRisers = new Uint8Array(0);

/**
 * Min and max ground in each block of `elev`, so a sweep stops at the last
 * block its uphill bonus can reach, and the tiles that can rise, so the
 * ring past catalog reach skips flat ground in one read. Cached per height
 * grid and `rev`; call again with a new `rev` after the ground changes.
 */
export function armSightBlocks(elev: ArrayLike<number>, width: number, height: number, rev = 0): void {
  if (sightBlocksFor === elev && sightBlocksRev === rev) return;
  const cols = Math.ceil(width / SIGHT_BLOCK);
  const rows = Math.ceil(height / SIGHT_BLOCK);
  const n = cols * rows;
  if (sightBlockMin.length !== n) {
    sightBlockMin = new Uint8Array(n);
    sightBlockMax = new Uint8Array(n);
  }
  if (sightRisers.length !== width * height) sightRisers = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const h = elev[row + x]!;
      let rises = 0;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1) && !rises; ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          if (elev[ny * width + nx]! < h) {
            rises = 1;
            break;
          }
        }
      }
      sightRisers[row + x] = rises;
    }
  }
  for (let by = 0; by < rows; by++) {
    const y0 = by * SIGHT_BLOCK;
    const y1 = Math.min(height, y0 + SIGHT_BLOCK);
    for (let bx = 0; bx < cols; bx++) {
      const x0 = bx * SIGHT_BLOCK;
      const x1 = Math.min(width, x0 + SIGHT_BLOCK);
      let lo = 255;
      let hi = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          const h = elev[row + x]!;
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      const i = by * cols + bx;
      sightBlockMin[i] = lo;
      sightBlockMax[i] = hi;
    }
  }
  sightBlockCols = cols;
  sightBlockRows = rows;
  sightBlocksFor = elev;
  sightBlocksRev = rev;
}

/** Forget the block cache, so the next sweep scans its whole uphill ring. */
export function clearSightBlocks(): void {
  sightBlocksFor = null;
  sightBlocksRev = -1;
}

/**
 * Farthest reach the uphill bonus can give this eye: the far corner of the
 * last block whose highest or lowest ground is far enough above or below the
 * eye's ground. The catalog reach when nothing is, or the whole bonus when
 * the blocks are not armed for this ground.
 */
function farReach(p: SweepEye, width: number, height: number, elev: ArrayLike<number>, h0: number, maxR: number): number {
  if (p.uphill <= 0 || maxR <= p.radius) return p.radius;
  if (sightBlocksFor !== elev) return maxR;
  const B = SIGHT_BLOCK;
  const bx0 = Math.max(0, ((p.ox - maxR) / B) | 0);
  const bx1 = Math.min(sightBlockCols - 1, ((p.ox + maxR) / B) | 0);
  const by0 = Math.max(0, ((p.oy - maxR) / B) | 0);
  const by1 = Math.min(sightBlockRows - 1, ((p.oy + maxR) / B) | 0);
  let far = p.radius;
  for (let by = by0; by <= by1; by++) {
    const ty0 = by * B;
    const ty1 = Math.min(height - 1, ty0 + B - 1);
    for (let bx = bx0; bx <= bx1; bx++) {
      const tx0 = bx * B;
      const tx1 = Math.min(width - 1, tx0 + B - 1);
      const i = by * sightBlockCols + bx;
      const extra = Math.max(Math.abs(sightBlockMin[i]! - h0), Math.abs(sightBlockMax[i]! - h0)) * p.uphill;
      if (extra <= 0) continue;
      const cx = p.ox < tx0 ? tx0 : p.ox > tx1 ? tx1 : p.ox;
      const cy = p.oy < ty0 ? ty0 : p.oy > ty1 ? ty1 : p.oy;
      const near = Math.round(Math.hypot(cx - p.ox, cy - p.oy));
      if (near > p.radius + extra) continue;
      const fx = Math.max(Math.abs(tx0 - p.ox), Math.abs(tx1 - p.ox));
      const fy = Math.max(Math.abs(ty0 - p.oy), Math.abs(ty1 - p.oy));
      const corner = Math.round(Math.hypot(fx, fy));
      if (corner > far) far = corner;
    }
  }
  return Math.min(far, maxR);
}

/** Running totals, for benchmarks. */
export const sweepStats = { sweeps: 0, tiles: 0, lit: 0 };

let slopeBins = new Float32Array(0);
let opaqueBins = new Uint8Array(0);
let hullBins = new Int32Array(0);
let groveBins = new Uint16Array(0);

const LOS_FLAG_COVER = 1;
const LOS_FLAG_TREE = 2;

function elevAtSafe(elev: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return elev[y * width + x] ?? 0;
}

/**
 * Append every tile `p` lights to `out`. The origin is always lit. `cover`
 * may carry `losFlags` from `fillLosFlags`; without them each tile's cover
 * is read in full.
 */
export function sweepSight(
  p: SweepEye,
  width: number,
  height: number,
  elev: ArrayLike<number>,
  cover: CoverField | undefined,
  out: LitList,
): void {
  if (p.radius <= 0) return;
  const uphill = p.uphill > 0 ? p.uphill : 0;
  const maxR = Math.ceil(p.radius + (uphill > 0 ? Math.min(SIGHT_UPHILL_MAX_TILES, HEIGHT_MAX * uphill) : 0));
  const ox = p.ox;
  const oy = p.oy;
  const h0 = elevAtSafe(elev, width, height, ox, oy);
  const hEye = h0 + Math.max(0, p.eye);
  const reach = farReach(p, width, height, elev, h0, maxR);
  // Bins follow the catalog reach, where the disc is dense; the uphill ring past it is sparse ground anyway.
  const baseR = Math.ceil(p.radius / TABLE_STEP) * TABLE_STEP;
  const t = tableFor(Math.ceil(reach / TABLE_STEP) * TABLE_STEP, Math.max(64, BINS_PER_TILE * baseR));
  const bins = t.bins;
  if (slopeBins.length < bins) {
    slopeBins = new Float32Array(bins);
    opaqueBins = new Uint8Array(bins);
    hullBins = new Int32Array(bins);
    groveBins = new Uint16Array(bins);
  }
  slopeBins.fill(-1e30, 0, bins);
  opaqueBins.fill(0, 0, bins);
  hullBins.fill(0, 0, bins);
  groveBins.fill(0, 0, bins);
  const terrain = cover?.terrain;
  const occupy = cover?.occupy;
  const hull = cover?.hull;
  const flags = cover?.losFlags;
  const ignore = p.ignore;
  const risers = sightBlocksFor === elev ? sightRisers : null;
  sweepStats.sweeps++;
  const litFrom = out.n;
  const dxs = t.dx;
  const dys = t.dy;
  const ds = t.d;
  const invs = t.inv;
  for (let k = 0; k < t.n; k++) {
    const d = ds[k]!;
    if (d > reach) {
      sweepStats.tiles += k;
      break;
    }
    const x = ox + dxs[k]!;
    const y = oy + dys[k]!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = y * width + x;
    if (d === 0) {
      litPush(out, i);
      continue;
    }
    const h = elev[i] ?? 0;
    // Past catalog reach, flat open ground can neither be lit nor stand in the way: one read and on.
    if (
      d > p.radius &&
      risers &&
      risers[i] === 0 &&
      (flags ? flags[i] === 0 : !cover) &&
      d > p.radius + Math.abs(h - h0) * uphill
    ) {
      continue;
    }
    const bc = t.bc[k]!;
    // The target: in reach, and nothing nearer stands in the way of its centre or of a line just beside it.
    if (d <= p.radius + (uphill > 0 ? levelSightExtra(h0, h, uphill) : 0)) {
      const slopeT = (h - hEye) * invs[k]!;
      const hid = hull ? (hull[i] ?? 0) : 0;
      let lit = false;
      for (let m = -PEEK_BINS; m <= PEEK_BINS && !lit; m++) {
        let b = bc + m;
        if (b < 0) b += bins;
        else if (b >= bins) b -= bins;
        lit =
          opaqueBins[b] === 0 &&
          groveBins[b]! <= GROVE_SIGHT_BUDGET &&
          slopeBins[b]! <= slopeT &&
          (hullBins[b] === 0 || hullBins[b] === hid);
      }
      if (lit && cover && d > SMOKE_PEEK_TILES && coverSmokeAt(cover, width, height, x, y)) lit = false;
      if (lit) litPush(out, i);
    }
    // The same tile as a blocker of what lies beyond it.
    let stops = false;
    let hid = 0;
    let cost = 0;
    if (cover && terrain && occupy) {
      const f = flags ? flags[i]! : LOS_FLAG_COVER | LOS_FLAG_TREE;
      if (f & LOS_FLAG_COVER) {
        if (terrain[i] === TILE_BLOCKED) stops = true;
        else {
          const occ = occupy[i] ?? 0;
          if (occ !== 0 && occ !== ignore) stops = true;
          else if (coverSmokeAt(cover, width, height, x, y)) stops = true;
        }
        if (hull) {
          const hv = hull[i] ?? 0;
          if (hv !== 0 && hv !== ignore) hid = hv;
        }
      }
      if (f & LOS_FLAG_TREE) cost = groveSightCost(terrain[i] ?? 0);
    }
    const innerK = t.inner[k]!;
    const prevH = innerK < 0 ? h0 : (elev[(oy + dys[innerK]!) * width + ox + dxs[innerK]!] ?? 0);
    const rising = h > prevH;
    if (!stops && hid === 0 && cost === 0 && !rising) continue;
    const bs = rising ? (h - hEye - LOS_TERRAIN_SLACK) * invs[k]! : 0;
    let b = t.b0[k]!;
    if (!stops && hid === 0 && cost === 0) {
      // Plain rising ground, the common case on a slope: only the steepest line matters.
      for (let m = t.bn[k]!; m > 0; m--) {
        if (bs > slopeBins[b]!) slopeBins[b] = bs;
        if (++b === bins) b = 0;
      }
      continue;
    }
    for (let m = t.bn[k]!; m > 0; m--) {
      if (stops) opaqueBins[b] = 1;
      if (hid !== 0) {
        const cur = hullBins[b]!;
        if (cur === 0) hullBins[b] = hid;
        else if (cur !== hid) opaqueBins[b] = 1;
      }
      if (cost !== 0) groveBins[b] = Math.min(65535, groveBins[b]! + cost);
      if (rising && bs > slopeBins[b]!) slopeBins[b] = bs;
      if (++b === bins) b = 0;
    }
  }
  sweepStats.lit += out.n - litFrom;
}
