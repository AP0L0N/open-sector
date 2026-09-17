import { WATER_PATH_COST, type EntityType } from "../catalog.js";
import { isWater, nearestWalkable, tileCenter, walkable, worldToTile } from "./geo.js";
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
  const pts = pathToWorld(state, e.x, e.y, toX, toY, e.type);
  e.waypoints = pts;
  return pts.length > 0;
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

/** Open-ground shortcut. Water is left to A* so infantry still prefer a land detour. */
function straightPath(
  state: MatchState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  type?: EntityType,
): { x: number; y: number }[] | null {
  return walkTileLine(state, sx, sy, gx, gy, type, sx, sy, () => false);
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
  const waterOk = (x: number, y: number): boolean => pathSet.has(key(x, y));
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
