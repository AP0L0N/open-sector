import { isNavalType, PATH_RETRY_TICKS, WATER_PATH_COST, type EntityType } from "../catalog.js";
import { inBounds, isWater, nearestWalkable, tileCenter, walkable, worldToTile } from "./geo.js";
import { climbableDelta, minSlopeCostMul, slopeCostMul, tileHeight } from "./elevation.js";
import type { Entity, MatchState, Vec } from "./types.js";

const ORTHO = 10;
const DIAG = 14;

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  px: number;
  py: number;
}

function key(x: number, y: number): number {
  return (y << 16) | (x & 0xffff);
}

function heapPush(heap: Node[], n: Node): void {
  heap.push(n);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if ((heap[p]?.f ?? 0) <= (heap[i]?.f ?? 0)) break;
    const tmp = heap[p]!;
    heap[p] = heap[i]!;
    heap[i] = tmp;
    i = p;
  }
}

function heapPop(heap: Node[]): Node | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length === 0 || last === undefined) return top;
  heap[0] = last;
  let i = 0;
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let s = i;
    if (l < heap.length && (heap[l]?.f ?? 0) < (heap[s]?.f ?? 0)) s = l;
    if (r < heap.length && (heap[r]?.f ?? 0) < (heap[s]?.f ?? 0)) s = r;
    if (s === i) break;
    const tmp = heap[s]!;
    heap[s] = heap[i]!;
    heap[i] = tmp;
    i = s;
  }
  return top;
}

export function pathToWorld(
  state: MatchState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  type?: EntityType,
): Vec[] {
  const ts = state.tileSize;
  const sx = worldToTile(fromX, ts);
  const sy = worldToTile(fromY, ts);
  const gx = worldToTile(toX, ts);
  const gy = worldToTile(toY, ts);
  const goal = nearestWalkable(state, gx, gy, type);
  if (!goal) return [];
  const tiles = astar(state, sx, sy, goal.x, goal.y, type);
  if (tiles.length === 0) {
    if (sx === goal.x && sy === goal.y) return [{ x: toX, y: toY }];
    return [];
  }
  const pts: Vec[] = tiles.map((t) => ({
    x: tileCenter(t.x, ts),
    y: tileCenter(t.y, ts),
  }));
  const last = pts[pts.length - 1];
  if (last && walkable(state, gx, gy, type)) {
    last.x = toX;
    last.y = toY;
  }
  return pullString(state, fromX, fromY, pts, type, sx, sy, tiles);
}

export function setPath(state: MatchState, e: Entity, toX: number, toY: number): boolean {
  const tx = worldToTile(toX, state.tileSize);
  const ty = worldToTile(toY, state.tileSize);
  // Asked again for a goal that had no path moments ago: the answer stands until the retry.
  const fail = e.pathFail;
  if (fail && fail.tx === tx && fail.ty === ty && state.tick - fail.tick < PATH_RETRY_TICKS) {
    e.waypoints = [];
    return false;
  }
  const pts = pathToWorld(state, e.x, e.y, toX, toY, e.type);
  e.waypoints = pts;
  if (pts.length > 0) {
    e.pathFail = undefined;
    return true;
  }
  e.pathFail = { tx, ty, tick: state.tick };
  return false;
}

export function astar(
  state: MatchState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  type?: EntityType,
): { x: number; y: number }[] {
  if (sx === gx && sy === gy) return [];
  const straight = straightPath(state, sx, sy, gx, gy, type);
  if (straight) return straight;
  if (!inBounds(state, sx, sy) || !inBounds(state, gx, gy)) return astarLegacy(state, sx, sy, gx, gy, type);
  return astarGrid(state, sx, sy, gx, gy, type);
}

/** Per-search scratch, valid where `stamp` equals the current generation. */
const grid = {
  gen: 0,
  stamp: new Int32Array(0),
  best: new Float64Array(0),
  came: new Int32Array(0),
  passStamp: new Int32Array(0),
  pass: new Uint8Array(0),
};

/** Binary min-heap on `f`, same push / pop order as `heapPush` / `heapPop`. */
const open = {
  size: 0,
  f: new Float64Array(1024),
  g: new Float64Array(1024),
  at: new Int32Array(1024),
};

function openPush(f: number, g: number, at: number): void {
  if (open.size === open.f.length) {
    const cap = open.f.length * 2;
    const nf = new Float64Array(cap);
    const ng = new Float64Array(cap);
    const na = new Int32Array(cap);
    nf.set(open.f);
    ng.set(open.g);
    na.set(open.at);
    open.f = nf;
    open.g = ng;
    open.at = na;
  }
  const hf = open.f;
  const hg = open.g;
  const ha = open.at;
  let i = open.size++;
  hf[i] = f;
  hg[i] = g;
  ha[i] = at;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (hf[p]! <= hf[i]!) break;
    const tf = hf[p]!;
    const tg = hg[p]!;
    const ta = ha[p]!;
    hf[p] = hf[i]!;
    hg[p] = hg[i]!;
    ha[p] = ha[i]!;
    hf[i] = tf;
    hg[i] = tg;
    ha[i] = ta;
    i = p;
  }
}

/** Pops into `popped`. */
const popped = { g: 0, at: 0 };

function openPop(): void {
  const hf = open.f;
  const hg = open.g;
  const ha = open.at;
  popped.g = hg[0]!;
  popped.at = ha[0]!;
  const last = --open.size;
  if (last === 0) return;
  hf[0] = hf[last]!;
  hg[0] = hg[last]!;
  ha[0] = ha[last]!;
  const size = open.size;
  let i = 0;
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let s = i;
    if (l < size && hf[l]! < hf[s]!) s = l;
    if (r < size && hf[r]! < hf[s]!) s = r;
    if (s === i) break;
    const tf = hf[s]!;
    const tg = hg[s]!;
    const ta = ha[s]!;
    hf[s] = hf[i]!;
    hg[s] = hg[i]!;
    ha[s] = ha[i]!;
    hf[i] = tf;
    hg[i] = tg;
    ha[i] = ta;
    i = s;
  }
}

/** `astarLegacy` on flat arrays. Both ends must be on the map. */
function astarGrid(
  state: MatchState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  type?: EntityType,
): { x: number; y: number }[] {
  const width = state.width;
  const height = state.height;
  const n = width * height;
  if (grid.stamp.length !== n) {
    grid.gen = 0;
    grid.stamp = new Int32Array(n);
    grid.best = new Float64Array(n);
    grid.came = new Int32Array(n);
    grid.passStamp = new Int32Array(n);
    grid.pass = new Uint8Array(n);
  }
  if (grid.gen >= 0x7ffffff0) {
    grid.gen = 0;
    grid.stamp.fill(0);
    grid.passStamp.fill(0);
  }
  const gen = ++grid.gen;
  const { stamp, best, came, passStamp, pass } = grid;
  const heights = state.heights;
  const slopeFloor = minSlopeCostMul();
  const start = sy * width + sx;
  const goal = gy * width + gx;
  const passAt = (x: number, y: number): boolean => {
    if (x === sx && y === sy) return true;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = y * width + x;
    if (passStamp[i] !== gen) {
      passStamp[i] = gen;
      pass[i] = walkable(state, x, y, type) ? 1 : 0;
    }
    return pass[i] === 1;
  };
  const guess = (x: number, y: number): number => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return (ORTHO * (dx + dy) + (DIAG - 2 * ORTHO) * Math.min(dx, dy)) * slopeFloor;
  };
  open.size = 0;
  openPush(guess(sx, sy), 0, start);
  stamp[start] = gen;
  best[start] = 0;
  let found = -1;
  const cap = n * 4;
  for (let it = 0; it < cap && open.size > 0; it++) {
    openPop();
    const cur = popped.at;
    const curG = popped.g;
    if (curG > best[cur]!) continue;
    if (cur === goal) {
      found = cur;
      break;
    }
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const ch = heights[cur] ?? 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!passAt(nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!passAt(cx + dx, cy) || !passAt(cx, cy + dy)) continue;
        }
        const k = ny * width + nx;
        const dh = (heights[k] ?? 0) - ch;
        if (!climbableDelta(dh)) continue;
        const wet = isWater(state, nx, ny) ? WATER_PATH_COST : 1;
        const step = (dx !== 0 && dy !== 0 ? DIAG : ORTHO) * slopeCostMul(dh) * wet;
        const g = curG + step;
        if (stamp[k] === gen && g >= best[k]!) continue;
        stamp[k] = gen;
        best[k] = g;
        came[k] = cur;
        openPush(g + guess(nx, ny), g, k);
      }
    }
  }
  if (found < 0) return [];
  const path: { x: number; y: number }[] = [{ x: gx, y: gy }];
  let at = found;
  for (let i = 0; i < cap; i++) {
    if (at === start || stamp[at] !== gen) break;
    at = came[at]!;
    path.push({ x: at % width, y: (at / width) | 0 });
  }
  path.reverse();
  if (path[0] && path[0].x === sx && path[0].y === sy) path.shift();
  return path;
}

function astarLegacy(
  state: MatchState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  type?: EntityType,
): { x: number; y: number }[] {
  const open: Node[] = [];
  const best = new Map<number, number>();
  const start: Node = {
    x: sx,
    y: sy,
    g: 0,
    f: heuristic(sx, sy, gx, gy),
    px: sx,
    py: sy,
  };
  heapPush(open, start);
  best.set(key(sx, sy), 0);
  const came = new Map<number, { x: number; y: number }>();
  let found: Node | null = null;
  const cap = state.width * state.height * 4;

  for (let n = 0; n < cap && open.length; n++) {
    const cur = heapPop(open);
    if (!cur) break;
    const curBest = best.get(key(cur.x, cur.y));
    if (curBest !== undefined && cur.g > curBest) continue;
    if (cur.x === gx && cur.y === gy) {
      found = cur;
      break;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!passable(state, nx, ny, type, sx, sy)) continue;
        if (dx !== 0 && dy !== 0) {
          if (
            !passable(state, cur.x + dx, cur.y, type, sx, sy) ||
            !passable(state, cur.x, cur.y + dy, type, sx, sy)
          ) {
            continue;
          }
        }
        const dh = tileHeight(state, nx, ny) - tileHeight(state, cur.x, cur.y);
        if (!climbableDelta(dh)) continue;
        const wet = isWater(state, nx, ny) ? WATER_PATH_COST : 1;
        const step = (dx !== 0 && dy !== 0 ? DIAG : ORTHO) * slopeCostMul(dh) * wet;
        const g = cur.g + step;
        const k = key(nx, ny);
        const prev = best.get(k);
        if (prev !== undefined && g >= prev) continue;
        best.set(k, g);
        came.set(k, { x: cur.x, y: cur.y });
        heapPush(open, {
          x: nx,
          y: ny,
          g,
          f: g + heuristic(nx, ny, gx, gy),
          px: cur.x,
          py: cur.y,
        });
      }
    }
  }

  if (!found) return [];
  const path: { x: number; y: number }[] = [{ x: found.x, y: found.y }];
  let cx = found.x;
  let cy = found.y;
  const guard = cap;
  for (let i = 0; i < guard; i++) {
    if (cx === sx && cy === sy) break;
    const p = came.get(key(cx, cy));
    if (!p) break;
    cx = p.x;
    cy = p.y;
    path.push({ x: cx, y: cy });
  }
  path.reverse();
  if (path[0] && path[0].x === sx && path[0].y === sy) path.shift();
  return path;
}

/** Open-ground shortcut. Water is left to A* so infantry still prefer a land detour. A boat's open ground is the water. */
function straightPath(
  state: MatchState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  type?: EntityType,
): { x: number; y: number }[] | null {
  const afloat = !!type && isNavalType(type);
  return walkTileLine(state, sx, sy, gx, gy, type, sx, sy, () => afloat);
}

/**
 * Collapse A* tile centers to line-of-sight corners so a unit holds one heading
 * across open ground instead of stop-turning on every 8-way staircase step.
 * Water not on the A* path stays blocked so infantry do not cut a pond.
 */
function pullString(
  state: MatchState,
  fromX: number,
  fromY: number,
  pts: Vec[],
  type: EntityType | undefined,
  originX: number,
  originY: number,
  tiles: { x: number; y: number }[],
): Vec[] {
  if (pts.length <= 1) return pts;
  const pathSet = new Set<number>();
  pathSet.add(key(originX, originY));
  for (const t of tiles) pathSet.add(key(t.x, t.y));
  const afloat = !!type && isNavalType(type);
  const waterOk = (x: number, y: number): boolean => afloat || pathSet.has(key(x, y));
  const ts = state.tileSize;
  const out: Vec[] = [];
  let ax = fromX;
  let ay = fromY;
  let i = 0;
  while (i < pts.length) {
    let best = i;
    for (let j = i + 1; j < pts.length; j++) {
      const p = pts[j];
      if (!p) break;
      if (
        walkTileLine(
          state,
          worldToTile(ax, ts),
          worldToTile(ay, ts),
          worldToTile(p.x, ts),
          worldToTile(p.y, ts),
          type,
          originX,
          originY,
          waterOk,
        ) === null
      ) {
        break;
      }
      best = j;
    }
    const keep = pts[best];
    if (keep) out.push(keep);
    ax = keep?.x ?? ax;
    ay = keep?.y ?? ay;
    i = best + 1;
  }
  return out;
}

function walkTileLine(
  state: MatchState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  type: EntityType | undefined,
  originX: number,
  originY: number,
  waterOk: (x: number, y: number) => boolean,
): { x: number; y: number }[] | null {
  if (sx === gx && sy === gy) return [];
  const path: { x: number; y: number }[] = [];
  let x = sx;
  let y = sy;
  const dx = Math.abs(gx - sx);
  const dy = Math.abs(gy - sy);
  const stx = sx < gx ? 1 : -1;
  const sty = sy < gy ? 1 : -1;
  let err = dx - dy;
  const cap = dx + dy + 2;
  for (let n = 0; n < cap; n++) {
    if (x === gx && y === gy) return path;
    const e2 = err * 2;
    let ndx = 0;
    let ndy = 0;
    if (e2 > -dy) {
      err -= dy;
      ndx = stx;
    }
    if (e2 < dx) {
      err += dx;
      ndy = sty;
    }
    const nx = x + ndx;
    const ny = y + ndy;
    if (ndx !== 0 && ndy !== 0) {
      if (
        !passable(state, x + ndx, y, type, originX, originY) ||
        !passable(state, x, y + ndy, type, originX, originY)
      ) {
        return null;
      }
    }
    if (!passable(state, nx, ny, type, originX, originY)) return null;
    if (isWater(state, nx, ny) && !waterOk(nx, ny)) return null;
    if (!climbableDelta(tileHeight(state, nx, ny) - tileHeight(state, x, y))) return null;
    path.push({ x: nx, y: ny });
    x = nx;
    y = ny;
  }
  return null;
}

/** Start tile may sit inside wreck clearance; every other step must be walkable. */
function passable(
  state: MatchState,
  x: number,
  y: number,
  type: EntityType | undefined,
  sx: number,
  sy: number,
): boolean {
  if (x === sx && y === sy) return true;
  return walkable(state, x, y, type);
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  const octile = ORTHO * (dx + dy) + (DIAG - 2 * ORTHO) * Math.min(dx, dy);
  return octile * minSlopeCostMul();
}

export function followPath(e: Entity, speed: number, dt: number): boolean {
  const wp = e.waypoints[0];
  if (!wp) return false;
  const dx = wp.x - e.x;
  const dy = wp.y - e.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 2 || dist <= speed * dt) {
    e.x = wp.x;
    e.y = wp.y;
    e.waypoints.shift();
    return e.waypoints.length > 0;
  }
  e.x += (dx / dist) * speed * dt;
  e.y += (dy / dist) * speed * dt;
  return true;
}
