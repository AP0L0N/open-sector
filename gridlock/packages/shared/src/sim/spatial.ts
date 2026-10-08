/**
 * Uniform grid over the match, rebuilt for one phase of a tick.
 * Combat, shots, and separation ask a circle or a segment instead of every entity.
 * Callers still apply their own filters. The grid only promises a superset,
 * returned in entity-id order so a tie breaks the way a full scan did.
 */
import {
  ALLY_LINE_MARGIN,
  BATTLESHIP_HALF_BEAM,
  BATTLESHIP_HALF_LENGTH,
  PROJECTILE_RADIUS,
  isBattleship,
} from "../catalog.js";
import type { Entity, MatchState } from "./types.js";

/** Cell side, in fine tiles. A rifle's reach is a handful of these. */
const CELL_TILES = 8;

const PAD = PROJECTILE_RADIUS + ALLY_LINE_MARGIN;

let stamp = new Int32Array(1024);
let stampGen = 1;
let buf: Entity[] = [];

export type SpatialGrid = {
  cell: number;
  cols: number;
  rows: number;
  buckets: number[][];
  byId: Map<number, Entity>;
  /** Flat cell indexes this id was inserted into. */
  cellsOf: Map<number, number[]>;
  /** Widest unit radius indexed. Separation queries use it. */
  maxRadius: number;
  /** Extra reach past a blast so a building center or a ship's bow is not missed. */
  splashPad: number;
};

let active: SpatialGrid | null = null;

/** Rebuild the grid and make it the one circle and segment queries inside this phase share. */
export function activateSpatial(state: MatchState): SpatialGrid {
  active = buildSpatial(state);
  return active;
}

/** The grid `activateSpatial` built, if this phase has one. */
export function spatialGrid(): SpatialGrid | null {
  return active;
}

/** Drop the phase grid so a later phase cannot query positions from before units moved. */
export function clearSpatial(): void {
  active = null;
}

export function buildSpatial(state: MatchState): SpatialGrid {
  const cell = CELL_TILES * state.tileSize;
  const cols = Math.max(1, Math.ceil((state.width * state.tileSize) / cell));
  const rows = Math.max(1, Math.ceil((state.height * state.tileSize) / cell));
  const buckets: number[][] = new Array(cols * rows);
  for (let i = 0; i < buckets.length; i++) buckets[i] = [];
  const grid: SpatialGrid = {
    cell,
    cols,
    rows,
    buckets,
    byId: new Map(),
    cellsOf: new Map(),
    maxRadius: 0,
    splashPad: 0,
  };
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.garrisonedIn) continue;
    insert(grid, e);
  }
  return grid;
}

/** After a separation shove, so the next pair sees where this unit stands now. */
export function relocate(grid: SpatialGrid, e: Entity): void {
  const prev = grid.cellsOf.get(e.id);
  if (prev) {
    for (let i = 0; i < prev.length; i++) {
      const bucket = grid.buckets[prev[i]!]!;
      const at = bucket.indexOf(e.id);
      if (at >= 0) bucket.splice(at, 1);
    }
  }
  if (e.hp <= 0 || e.garrisonedIn) {
    grid.byId.delete(e.id);
    grid.cellsOf.delete(e.id);
    return;
  }
  insert(grid, e);
}

/**
 * Entities whose indexed body can meet the circle. The returned array is
 * reused by the next query. Finish reading it first.
 */
export function queryCircle(grid: SpatialGrid, x: number, y: number, radius: number): Entity[] {
  beginStamp();
  buf.length = 0;
  const c = grid.cell;
  const x0 = clamp((x - radius) / c, grid.cols);
  const x1 = clamp((x + radius) / c, grid.cols);
  const y0 = clamp((y - radius) / c, grid.rows);
  const y1 = clamp((y + radius) / c, grid.rows);
  for (let cy = y0; cy <= y1; cy++) {
    const row = cy * grid.cols;
    for (let cx = x0; cx <= x1; cx++) takeBucket(grid, row + cx);
  }
  buf.sort(byId);
  return buf;
}

/**
 * Entities that can meet a capsule around the polyline. `close` joins the last
 * point back to the first. The array is a copy. The shared circle buffer is not.
 */
export function queryCapsules(
  grid: SpatialGrid,
  points: readonly { x: number; y: number }[],
  radius: number,
  close: boolean,
): Entity[] {
  if (points.length === 0) return [];
  const cells = capsuleCells(grid, points, radius, close);
  beginStamp();
  const out: Entity[] = [];
  for (let k = 0; k < cells.length; k++) {
    const bucket = grid.buckets[cells[k]!];
    if (!bucket) continue;
    for (let j = 0; j < bucket.length; j++) {
      const id = bucket[j]!;
      if (!mark(id)) continue;
      const e = grid.byId.get(id);
      if (e) out.push(e);
    }
  }
  out.sort(byId);
  return out;
}

/** Cells a capsule around a polyline covers, kept per route so a patrol does not re-walk its line every tick. */
const capsuleCellCache = new WeakMap<readonly { x: number; y: number }[], Map<string, number[]>>();

function capsuleCells(
  grid: SpatialGrid,
  points: readonly { x: number; y: number }[],
  radius: number,
  close: boolean,
): number[] {
  const key = `${radius}|${close ? 1 : 0}|${grid.cell}|${grid.cols}|${grid.rows}`;
  let byKey = capsuleCellCache.get(points);
  if (!byKey) {
    byKey = new Map();
    capsuleCellCache.set(points, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const seen = new Set<number>();
  const cells: number[] = [];
  const c = grid.cell;
  const pull = (x: number, y: number): void => {
    const x0 = clamp((x - radius) / c, grid.cols);
    const x1 = clamp((x + radius) / c, grid.cols);
    const y0 = clamp((y - radius) / c, grid.rows);
    const y1 = clamp((y + radius) / c, grid.rows);
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * grid.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const i = row + cx;
        if (seen.has(i)) continue;
        seen.add(i);
        cells.push(i);
      }
    }
  };
  if (points.length === 1) {
    pull(points[0]!.x, points[0]!.y);
  } else {
    const n = points.length;
    const segs = close ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % n]!;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(dist / c));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        pull(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      }
    }
  }
  byKey.set(key, cells);
  return cells;
}

/** Entities whose indexed body can meet the segment. Same reuse rule as `queryCircle`. */
export function querySegment(grid: SpatialGrid, x0: number, y0: number, x1: number, y1: number): Entity[] {
  beginStamp();
  buf.length = 0;
  visitSegment(grid, x0, y0, x1, y1, (i) => takeBucket(grid, i));
  buf.sort(byId);
  return buf;
}

function insert(grid: SpatialGrid, e: Entity): void {
  grid.byId.set(e.id, e);
  const cells: number[] = [];
  grid.cellsOf.set(e.id, cells);
  if (e.kind === "building") {
    const ts = grid.cell / CELL_TILES;
    const bonus = Math.min(e.tileW, e.tileH) * ts * 0.25;
    if (bonus > grid.splashPad) grid.splashPad = bonus;
    const x0 = e.tileX * ts - PAD;
    const y0 = e.tileY * ts - PAD;
    const x1 = (e.tileX + e.tileW) * ts + PAD;
    const y1 = (e.tileY + e.tileH) * ts + PAD;
    coverAabb(grid, e.id, cells, x0, y0, x1, y1);
    return;
  }
  if (e.radius > grid.maxRadius) grid.maxRadius = e.radius;
  if (isBattleship(e.type)) {
    if (BATTLESHIP_HALF_LENGTH > grid.splashPad) grid.splashPad = BATTLESHIP_HALF_LENGTH;
    const c = Math.cos(e.facing);
    const s = Math.sin(e.facing);
    const beam = BATTLESHIP_HALF_BEAM + PAD;
    const ex = Math.abs(c) * BATTLESHIP_HALF_LENGTH + Math.abs(s) * beam;
    const ey = Math.abs(s) * BATTLESHIP_HALF_LENGTH + Math.abs(c) * beam;
    coverAabb(grid, e.id, cells, e.x - ex, e.y - ey, e.x + ex, e.y + ey);
    return;
  }
  const r = e.radius + PAD;
  coverAabb(grid, e.id, cells, e.x - r, e.y - r, e.x + r, e.y + r);
}

function coverAabb(grid: SpatialGrid, id: number, cells: number[], x0: number, y0: number, x1: number, y1: number): void {
  const c = grid.cell;
  const cx0 = clamp(x0 / c, grid.cols);
  const cx1 = clamp(x1 / c, grid.cols);
  const cy0 = clamp(y0 / c, grid.rows);
  const cy1 = clamp(y1 / c, grid.rows);
  for (let cy = cy0; cy <= cy1; cy++) {
    const row = cy * grid.cols;
    for (let cx = cx0; cx <= cx1; cx++) {
      const i = row + cx;
      grid.buckets[i]!.push(id);
      cells.push(i);
    }
  }
}

function takeBucket(grid: SpatialGrid, i: number): void {
  const bucket = grid.buckets[i];
  if (!bucket) return;
  for (let k = 0; k < bucket.length; k++) {
    const id = bucket[k]!;
    if (!mark(id)) continue;
    const e = grid.byId.get(id);
    if (e) buf.push(e);
  }
}

/** Every cell the continuous segment touches. */
function visitSegment(grid: SpatialGrid, x0: number, y0: number, x1: number, y1: number, visit: (i: number) => void): void {
  const c = grid.cell;
  let cx = clamp(x0 / c, grid.cols);
  let cy = clamp(y0 / c, grid.rows);
  const ex = clamp(x1 / c, grid.cols);
  const ey = clamp(y1 / c, grid.rows);
  visit(cy * grid.cols + cx);
  if (cx === ex && cy === ey) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = dx >= 0 ? 1 : -1;
  const stepY = dy >= 0 ? 1 : -1;
  const invX = dx === 0 ? 0 : 1 / dx;
  const invY = dy === 0 ? 0 : 1 / dy;
  let tMaxX = dx === 0 ? Infinity : ((cx + (stepX > 0 ? 1 : 0)) * c - x0) * invX;
  let tMaxY = dy === 0 ? Infinity : ((cy + (stepY > 0 ? 1 : 0)) * c - y0) * invY;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(c * invX);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(c * invY);
  const guard = grid.cols + grid.rows + 2;
  for (let n = 0; n < guard && (cx !== ex || cy !== ey); n++) {
    if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxX) {
      cy += stepY;
      tMaxY += tDeltaY;
    } else {
      // Through a corner: both edge cells can hold a body the line grazes.
      const nx = cx + stepX;
      const ny = cy + stepY;
      if (ny >= 0 && ny < grid.rows) visit(ny * grid.cols + cx);
      if (nx >= 0 && nx < grid.cols) visit(cy * grid.cols + nx);
      cx = nx;
      cy = ny;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }
    if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) break;
    visit(cy * grid.cols + cx);
  }
}

function clamp(t: number, n: number): number {
  if (t < 0) return 0;
  const i = t | 0;
  return i >= n ? n - 1 : i;
}

function byId(a: Entity, b: Entity): number {
  return a.id - b.id;
}

function beginStamp(): void {
  stampGen++;
  if (stampGen >= 0x7fffffff) {
    stamp.fill(0);
    stampGen = 1;
  }
}

function mark(id: number): boolean {
  if (id >= stamp.length) {
    const next = new Int32Array(Math.max(id + 1, stamp.length * 2));
    next.set(stamp);
    stamp = next;
  }
  if (stamp[id] === stampGen) return false;
  stamp[id] = stampGen;
  return true;
}
