import { nearestWalkable, tileCenter, walkable, worldToTile } from "./geo.js";
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

export function pathToWorld(
  state: MatchState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Vec[] {
  const ts = state.tileSize;
  const sx = worldToTile(fromX, ts);
  const sy = worldToTile(fromY, ts);
  const gx = worldToTile(toX, ts);
  const gy = worldToTile(toY, ts);
  const goal = nearestWalkable(state, gx, gy);
  if (!goal) return [];
  const tiles = astar(state, sx, sy, goal.x, goal.y);
  if (tiles.length === 0) {
    if (sx === goal.x && sy === goal.y) return [{ x: toX, y: toY }];
    return [];
  }
  const pts: Vec[] = tiles.map((t) => ({
    x: tileCenter(t.x, ts),
    y: tileCenter(t.y, ts),
  }));
  const last = pts[pts.length - 1];
  if (last && walkable(state, gx, gy)) {
    last.x = toX;
    last.y = toY;
  }
  return pts;
}

export function setPath(state: MatchState, e: Entity, toX: number, toY: number): boolean {
  const pts = pathToWorld(state, e.x, e.y, toX, toY);
  e.waypoints = pts;
  return pts.length > 0;
}

export function astar(
  state: MatchState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): { x: number; y: number }[] {
  if (sx === gx && sy === gy) return [];
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
  open.push(start);
  best.set(key(sx, sy), 0);
  const came = new Map<number, { x: number; y: number }>();
  let found: Node | null = null;
  const cap = state.width * state.height * 4;

  for (let n = 0; n < cap && open.length; n++) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if ((open[i]?.f ?? Infinity) < (open[bi]?.f ?? Infinity)) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    if (!cur) break;
    if (cur.x === gx && cur.y === gy) {
      found = cur;
      break;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!walkable(state, nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!walkable(state, cur.x + dx, cur.y) || !walkable(state, cur.x, cur.y + dy)) continue;
        }
        const dh = tileHeight(state, nx, ny) - tileHeight(state, cur.x, cur.y);
        if (!climbableDelta(dh)) continue;
        const step = (dx !== 0 && dy !== 0 ? DIAG : ORTHO) * slopeCostMul(dh);
        const g = cur.g + step;
        const k = key(nx, ny);
        const prev = best.get(k);
        if (prev !== undefined && g >= prev) continue;
        best.set(k, g);
        came.set(k, { x: cur.x, y: cur.y });
        open.push({
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
