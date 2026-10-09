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
import { allies } from "./geo.js";
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
  /** One bit per owner that has something a gun can aim at, per cell: a side can tell at a glance whether any foe is in reach. */
  cellOwners: Int32Array;
  ownerBit: Map<string, number>;
  /** Bits of the owners hostile to a side, by that side, made on first use. */
  hostileBits: Map<string, number>;
};

let active: SpatialGrid | null = null;

/** Bring the match's grid up to date and make it the one circle and segment queries inside this phase share. */
export function activateSpatial(state: MatchState): SpatialGrid {
  active = syncSpatial(state);
  return active;
}

const persistent = new WeakMap<MatchState, SpatialGrid>();

/**
 * The match's one grid, brought up to date: bodies that left their cells are
 * filed again, newcomers filed, the dead and the garrisoned dropped, and the
 * owner bits laid afresh. A fresh build allocated a bucket per cell and a
 * cell list per body, and the tick asked for one five times over.
 */
export function syncSpatial(state: MatchState): SpatialGrid {
  const cell = CELL_TILES * state.tileSize;
  const cols = Math.max(1, Math.ceil((state.width * state.tileSize) / cell));
  const rows = Math.max(1, Math.ceil((state.height * state.tileSize) / cell));
  let grid = persistent.get(state);
  if (!grid || grid.cell !== cell || grid.cols !== cols || grid.rows !== rows) {
    grid = buildSpatial(state);
    persistent.set(state, grid);
    return grid;
  }
  grid.cellOwners.fill(0);
  grid.hostileBits.clear();
  for (const [id, e] of grid.byId) {
    if (state.entities.get(id) !== e || e.hp <= 0 || e.garrisonedIn) remove(grid, id);
  }
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.garrisonedIn) continue;
    const cells = grid.cellsOf.get(e.id);
    if (!cells) {
      insert(grid, e);
      continue;
    }
    aabbOf(grid, e);
    const n = (ax1 - ax0 + 1) * (ay1 - ay0 + 1);
    if (cells.length === n && cells[0] === ay0 * cols + ax0 && cells[n - 1] === ay1 * cols + ax1) {
      const bit = aimable(e) ? ownerBitOf(grid, e.ownerId) : 0;
      if (bit) {
        for (let k = 0; k < n; k++) {
          const i = cells[k]!;
          grid.cellOwners[i] = (grid.cellOwners[i] ?? 0) | bit;
        }
      }
    } else {
      relocate(grid, e);
    }
  }
  return grid;
}

function remove(grid: SpatialGrid, id: number): void {
  const prev = grid.cellsOf.get(id);
  if (prev) {
    for (let i = 0; i < prev.length; i++) {
      const bucket = grid.buckets[prev[i]!]!;
      const at = bucket.indexOf(id);
      if (at >= 0) bucket.splice(at, 1);
    }
  }
  grid.byId.delete(id);
  grid.cellsOf.delete(id);
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
    cellOwners: new Int32Array(cols * rows),
    ownerBit: new Map(),
    hostileBits: new Map(),
  };
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.garrisonedIn) continue;
    insert(grid, e);
  }
  return grid;
}

/** After a separation shove, so the next pair sees where this unit stands now. */
export function relocate(grid: SpatialGrid, e: Entity): void {
  remove(grid, e.id);
  if (e.hp <= 0 || e.garrisonedIn) return;
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
  /** With a side given, an empty list comes back at once when no cell on the line holds a foe of it. */
  state?: MatchState,
  ownerId?: string,
): Entity[] {
  if (points.length === 0) return [];
  const cells = capsuleCells(grid, points, radius, close);
  if (state && ownerId !== undefined) {
    const mask = hostileBitsOf(grid, state, ownerId);
    let any = false;
    for (let k = 0; k < cells.length && !any; k++) any = (grid.cellOwners[cells[k]!]! & mask) !== 0;
    if (!any) return [];
  }
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

/** Something a gun may aim at: any unit, a side's building, or a neutral one with people in it. */
function aimable(e: Entity): boolean {
  if (e.kind === "unit") return true;
  return e.ownerId !== "" || e.garrison.length > 0;
}

function ownerBitOf(grid: SpatialGrid, ownerId: string): number {
  let bit = grid.ownerBit.get(ownerId);
  if (bit === undefined) {
    bit = 1 << Math.min(30, grid.ownerBit.size);
    grid.ownerBit.set(ownerId, bit);
    // A side seen for the first time: every hostile mask made before it is short a bit.
    grid.hostileBits.clear();
  }
  return bit;
}

/** Bits of every owner hostile to `ownerId`, made once per grid. */
function hostileBitsOf(grid: SpatialGrid, state: MatchState, ownerId: string): number {
  let mask = grid.hostileBits.get(ownerId);
  if (mask === undefined) {
    mask = 0;
    for (const [owner, bit] of grid.ownerBit) {
      if (!allies(state, ownerId, owner)) mask |= bit;
    }
    grid.hostileBits.set(ownerId, mask);
  }
  return mask;
}

/** True when a cell within `radius` of the point holds something of an owner hostile to `ownerId`. */
export function anyHostileNear(grid: SpatialGrid, state: MatchState, ownerId: string, x: number, y: number, radius: number): boolean {
  const mask = hostileBitsOf(grid, state, ownerId);
  if (mask === 0) return false;
  const c = grid.cell;
  const x0 = clamp((x - radius) / c, grid.cols);
  const x1 = clamp((x + radius) / c, grid.cols);
  const y0 = clamp((y - radius) / c, grid.rows);
  const y1 = clamp((y + radius) / c, grid.rows);
  for (let cy = y0; cy <= y1; cy++) {
    const row = cy * grid.cols;
    for (let cx = x0; cx <= x1; cx++) {
      if ((grid.cellOwners[row + cx]! & mask) !== 0) return true;
    }
  }
  return false;
}

/** The cell box `aabbOf` last worked out: columns ax0..ax1, rows ay0..ay1. */
let ax0 = 0;
let ay0 = 0;
let ax1 = 0;
let ay1 = 0;

/** The cells a body's indexed footprint covers, into ax0..ay1. Widens the grid's pads as it goes. */
function aabbOf(grid: SpatialGrid, e: Entity): void {
  if (e.kind === "building") {
    const ts = grid.cell / CELL_TILES;
    const bonus = Math.min(e.tileW, e.tileH) * ts * 0.25;
    if (bonus > grid.splashPad) grid.splashPad = bonus;
    cellBox(grid, e.tileX * ts - PAD, e.tileY * ts - PAD, (e.tileX + e.tileW) * ts + PAD, (e.tileY + e.tileH) * ts + PAD);
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
    cellBox(grid, e.x - ex, e.y - ey, e.x + ex, e.y + ey);
    return;
  }
  const r = e.radius + PAD;
  cellBox(grid, e.x - r, e.y - r, e.x + r, e.y + r);
}

function cellBox(grid: SpatialGrid, x0: number, y0: number, x1: number, y1: number): void {
  const c = grid.cell;
  ax0 = clamp(x0 / c, grid.cols);
  ax1 = clamp(x1 / c, grid.cols);
  ay0 = clamp(y0 / c, grid.rows);
  ay1 = clamp(y1 / c, grid.rows);
}

function insert(grid: SpatialGrid, e: Entity): void {
  grid.byId.set(e.id, e);
  const cells: number[] = [];
  grid.cellsOf.set(e.id, cells);
  aabbOf(grid, e);
  const bit = aimable(e) ? ownerBitOf(grid, e.ownerId) : 0;
  for (let cy = ay0; cy <= ay1; cy++) {
    const row = cy * grid.cols;
    for (let cx = ax0; cx <= ax1; cx++) {
      const i = row + cx;
      grid.buckets[i]!.push(e.id);
      cells.push(i);
      if (bit) grid.cellOwners[i] = (grid.cellOwners[i] ?? 0) | bit;
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
