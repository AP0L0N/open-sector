import type { MatchState, Vec } from "./types.js";

/** Clicks one patrol order will take. The unit's own start is added on top. */
export const PATROL_POINTS_MAX = 12;

/** Keep a point inside the map. */
export function clampWorld(state: MatchState, x: number, y: number): Vec {
  const maxX = Math.max(0, state.width * state.tileSize - 1);
  const maxY = Math.max(0, state.height * state.tileSize - 1);
  return { x: Math.max(0, Math.min(maxX, x)), y: Math.max(0, Math.min(maxY, y)) };
}

/**
 * Player clicks, in order, with duplicates and points off the map dropped.
 * Null when nothing usable was sent.
 */
export function cleanPatrolPoints(state: MatchState, raw: { x: number; y: number }[] | undefined): Vec[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const minSep = state.tileSize;
  const out: Vec[] = [];
  for (const p of raw) {
    if (out.length >= PATROL_POINTS_MAX) break;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const at = clampWorld(state, p.x, p.y);
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - at.x, prev.y - at.y) < minSep) continue;
    out.push(at);
  }
  return out.length > 0 ? out : null;
}

/**
 * Where this unit walks. The first point is where it stood. Later points are
 * the clicks, shifted by (ox, oy) so a group keeps its shape along the route.
 */
export function buildPatrolRoute(state: MatchState, origin: Vec, points: readonly Vec[], ox: number, oy: number): Vec[] {
  const route: Vec[] = [clampWorld(state, origin.x, origin.y)];
  for (const p of points) {
    const at = clampWorld(state, p.x + ox, p.y + oy);
    const prev = route[route.length - 1]!;
    if (Math.hypot(prev.x - at.x, prev.y - at.y) < state.tileSize) continue;
    route.push(at);
  }
  if (route.length < 2) {
    const start = route[0]!;
    route.push(clampWorld(state, start.x + state.tileSize * 2, start.y));
  }
  return route;
}

/** Next point on a ping-pong. At either end the direction flips. */
export function stepPatrolLeg(route: readonly Vec[], leg: number, dir: 1 | -1): { leg: number; dir: 1 | -1 } {
  const n = route.length;
  if (n < 2) return { leg: 0, dir: 1 };
  let d: 1 | -1 = dir === -1 ? -1 : 1;
  let next = leg + d;
  if (next >= n) {
    d = -1;
    next = n - 2;
  } else if (next < 0) {
    d = 1;
    next = 1;
  }
  return { leg: next, dir: d };
}

/** Distance from a point to the closest spot on the polyline. */
export function distToRoute(route: readonly Vec[], x: number, y: number): number {
  if (route.length === 0) return Infinity;
  const first = route[0]!;
  let best = Math.hypot(first.x - x, first.y - y);
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const d = distToSegment(a.x, a.y, b.x, b.y, x, y);
    if (d < best) best = d;
  }
  return best;
}

function distToSegment(ax: number, ay: number, bx: number, by: number, x: number, y: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(ax - x, ay - y);
  let t = ((x - ax) * dx + (y - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(ax + dx * t - x, ay + dy * t - y);
}
