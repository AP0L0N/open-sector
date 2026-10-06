/**
 * Bridge geometry, shared by the sim, the Map Builder, and the client's placement ghost.
 *
 * A bridge is a run of bricks laid end to end along a drawn line, the way a wall
 * is laid in sections. Each brick is a rectangle: centre (x, y), `facing` along
 * the deck, `length` along it (`bridgeBrickLength`), and the type's width across it.
 * A brick stands on water or on open land; how long the crossing is does not matter.
 */

import { bridgeBrickLength, bridgeWidth, type BridgeType } from "./catalog.js";

/** How far two bricks may cut into each other before they count as overlapping, world px. */
const BRICK_SLACK = 3;
/** Sharpest turn a bridge line takes at a corner, radians. Past this the leg folds back and is dropped. */
export const BRIDGE_TURN_MAX = (3 * Math.PI) / 4;
/** Most bricks one line lays. */
export const BRIDGE_BRICKS_MAX = 256;

export interface BridgeSpan {
  x: number;
  y: number;
  /** World radians along the deck. */
  facing: number;
  /** World px end to end. */
  length: number;
}

/** A brick already standing, or its wreckage. */
export interface BridgeBrick {
  type: BridgeType;
  span: BridgeSpan;
}

/** What `bridgeBrickProblem` needs to know about the ground. */
export interface BridgeGround {
  width: number;
  height: number;
  tileSize: number;
  /** Open water (no deck over it yet). */
  water(tx: number, ty: number): boolean;
  /** Land a brick may rest on: not rock, wall, fence, a building, or a standing tree. */
  footing(tx: number, ty: number): boolean;
  /** Bricks already standing, and wreckage. A new brick may meet them end to end, not overlap. */
  bricks?: readonly BridgeBrick[];
}

export function bridgeAxes(facing: number): { ux: number; uy: number; vx: number; vy: number } {
  const ux = Math.cos(facing);
  const uy = Math.sin(facing);
  return { ux, uy, vx: -uy, vy: ux };
}

/** Both ends of the deck's centre line. */
export function bridgeEnds(b: BridgeSpan): { ax: number; ay: number; bx: number; by: number } {
  const { ux, uy } = bridgeAxes(b.facing);
  const h = b.length / 2;
  return { ax: b.x - ux * h, ay: b.y - uy * h, bx: b.x + ux * h, by: b.y + uy * h };
}

/** Point inside the deck rectangle, grown by `pad` on every side. */
export function inBridge(b: BridgeSpan, width: number, px: number, py: number, pad = 0): boolean {
  const { ux, uy, vx, vy } = bridgeAxes(b.facing);
  const dx = px - b.x;
  const dy = py - b.y;
  return Math.abs(dx * ux + dy * uy) <= b.length / 2 + pad && Math.abs(dx * vx + dy * vy) <= width / 2 + pad;
}

/** Distance from a point to the deck rectangle. 0 inside. */
export function bridgeDist(b: BridgeSpan, width: number, px: number, py: number): number {
  const { ux, uy, vx, vy } = bridgeAxes(b.facing);
  const dx = px - b.x;
  const dy = py - b.y;
  const along = Math.max(0, Math.abs(dx * ux + dy * uy) - b.length / 2);
  const across = Math.max(0, Math.abs(dx * vx + dy * vy) - width / 2);
  return Math.hypot(along, across);
}

/** Share 0–1 along the deck from end A for the point's projection, clamped. */
export function bridgeAlong(b: BridgeSpan, px: number, py: number): number {
  const { ux, uy } = bridgeAxes(b.facing);
  const s = (px - b.x) * ux + (py - b.y) * uy;
  return Math.max(0, Math.min(1, s / Math.max(1, b.length) + 0.5));
}

/**
 * Tiles under the deck. A tile counts when its centre is on the deck; the
 * strip is at least one tile wide so a diagonal deck leaves no gap.
 */
export function bridgeTiles(
  grid: { width: number; height: number; tileSize: number },
  b: BridgeSpan,
  width: number,
): { x: number; y: number }[] {
  const ts = grid.tileSize;
  const reach = Math.hypot(b.length, width) / 2 + ts;
  const x0 = Math.max(0, Math.floor((b.x - reach) / ts));
  const x1 = Math.min(grid.width - 1, Math.floor((b.x + reach) / ts));
  const y0 = Math.max(0, Math.floor((b.y - reach) / ts));
  const y1 = Math.min(grid.height - 1, Math.floor((b.y + reach) / ts));
  const w = Math.max(width, ts);
  const out: { x: number; y: number }[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (inBridge(b, w, (tx + 0.5) * ts, (ty + 0.5) * ts)) out.push({ x: tx, y: ty });
    }
  }
  return out;
}

/**
 * True when two bricks overlap by more than a touch. Bricks of one line meet end to
 * end, and at a corner they meet in a mitre: the next leg starts `(w / 2) · tan(turn / 2)`
 * into the turn (`bridgePath`), so the two corner bricks share a wedge about
 * `(w / 2) · sin(turn)` deep. That wedge is the joint, not a clash (the client draws
 * both bricks bent onto one curve there), so two bricks whose ends meet that closely,
 * at that angle, never conflict. Anything else that overlaps by more than `slack` does.
 */
export function bricksConflict(a: BridgeSpan, aWidth: number, b: BridgeSpan, bWidth: number, slack = BRICK_SLACK): boolean {
  const pa = bridgeAxes(a.facing);
  const pb = bridgeAxes(b.facing);
  const half = (s: BridgeSpan, w: number, ax: { ux: number; uy: number; vx: number; vy: number }, nx: number, ny: number): number =>
    Math.abs(ax.ux * nx + ax.uy * ny) * (s.length / 2) + Math.abs(ax.vx * nx + ax.vy * ny) * (w / 2);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let depth = Infinity;
  for (const [nx, ny] of [
    [pa.ux, pa.uy],
    [pa.vx, pa.vy],
    [pb.ux, pb.uy],
    [pb.vx, pb.vy],
  ] as const) {
    const overlap = half(a, aWidth, pa, nx, ny) + half(b, bWidth, pb, nx, ny) - Math.abs(dx * nx + dy * ny);
    if (overlap <= slack) return false;
    depth = Math.min(depth, overlap);
  }
  return !mitreJoint(a, aWidth, b, bWidth, depth, slack);
}

/**
 * Two bricks meet in a corner's mitre: their decks cross at a turn up to a right
 * angle, an end of one lies within the mitre's offset of an end of the other, and
 * they overlap no deeper than that mitre's wedge. Parallel decks have no wedge, so
 * a brick laid over another, or alongside it, is never a joint; nor is one lying
 * across another, which cuts far deeper than any wedge.
 */
function mitreJoint(a: BridgeSpan, aWidth: number, b: BridgeSpan, bWidth: number, depth: number, slack: number): boolean {
  const pa = bridgeAxes(a.facing);
  const pb = bridgeAxes(b.facing);
  // The decks' angle, as lines: a leg laid the other way round is the same corner.
  const turn = Math.acos(Math.min(1, Math.abs(pa.ux * pb.ux + pa.uy * pb.uy)));
  const w = Math.max(aWidth, bWidth);
  const off = (w / 2) * Math.tan(turn / 2);
  // How far the ideal mitre's wedge cuts in, measured as the overlap test measures it.
  const wedge = Math.max(0, Math.min((w / 2) * Math.sin(turn) + off * (1 - Math.cos(turn)), w * Math.cos(turn)));
  if (depth > wedge + slack) return false;
  const reach = off * 2 * Math.sin(turn / 2) + slack * 2;
  const ea = bridgeEnds(a);
  const eb = bridgeEnds(b);
  for (const [x0, y0] of [
    [ea.ax, ea.ay],
    [ea.bx, ea.by],
  ]) {
    for (const [x1, y1] of [
      [eb.ax, eb.ay],
      [eb.bx, eb.by],
    ]) {
      if (Math.hypot(x0! - x1!, y0! - y1!) <= reach) return true;
    }
  }
  return false;
}

/** Deflection between two unit directions: 0 straight on, π folded back. */
function turnBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by)));
}

/**
 * Bricks along a polyline, laid end to end from the first point, as `fieldPath` lays
 * a wall. Every leg is laid in whole bricks from its start, so it ends a little short
 * of or past its point, and the next leg starts there, pushed into the mitre of the
 * corner by half the deck width. A single point is one brick along `facing`. A leg
 * shorter than half a brick, or one folded back past BRIDGE_TURN_MAX, is skipped.
 * With `snap` (radians), every leg turns to the nearest multiple of it, measured from
 * where the last leg really ended, as the Map Builder lays a wall line.
 */
export function bridgePath(
  type: BridgeType,
  points: readonly { x: number; y: number }[],
  facing = 0,
  snap?: number,
): BridgeSpan[] {
  const first = points[0];
  if (!first) return [];
  const length = bridgeBrickLength(type);
  const width = bridgeWidth(type);
  const out: BridgeSpan[] = [];
  let sx = first.x;
  let sy = first.y;
  let ux: number | null = null;
  let uy = 0;
  for (let i = 1; i < points.length && out.length < BRIDGE_BRICKS_MAX; i++) {
    let target = points[i]!;
    let dist = Math.hypot(target.x - sx, target.y - sy);
    if (dist < length * 0.5) continue;
    let vx = (target.x - sx) / dist;
    let vy = (target.y - sy) / dist;
    if (snap) {
      const a = Math.round(Math.atan2(vy, vx) / snap) * snap;
      vx = Math.cos(a);
      vy = Math.sin(a);
      target = { x: sx + vx * dist, y: sy + vy * dist };
    }
    let x0 = sx;
    let y0 = sy;
    if (ux != null) {
      const turn = turnBetween(ux, uy, vx, vy);
      if (turn > BRIDGE_TURN_MAX) continue;
      const off = (width / 2) * Math.tan(turn / 2);
      x0 = sx + off * (vx - ux);
      y0 = sy + off * (vy - uy);
      dist = (target.x - x0) * vx + (target.y - y0) * vy;
      if (dist < length * 0.5) continue;
    }
    const n = Math.min(BRIDGE_BRICKS_MAX - out.length, Math.max(1, Math.round(dist / length)));
    const along = Math.atan2(vy, vx);
    for (let k = 0; k < n; k++) {
      const s = length * (k + 0.5);
      out.push({ x: x0 + vx * s, y: y0 + vy * s, facing: along, length });
    }
    sx = x0 + vx * length * n;
    sy = y0 + vy * length * n;
    ux = vx;
    uy = vy;
  }
  if (out.length === 0) return [{ x: first.x, y: first.y, facing, length }];
  return out;
}

/**
 * Why a brick of `type` cannot stand on `span`, or null. Every tile under it is
 * water or open land, and it does not overlap another brick. `laid` are bricks of
 * the same line set down before it, which count as standing.
 */
export function bridgeBrickProblem(
  ground: BridgeGround,
  type: BridgeType,
  span: BridgeSpan,
  laid: readonly BridgeBrick[] = [],
): string | null {
  const width = bridgeWidth(type);
  const { ux, uy, vx, vy } = bridgeAxes(span.facing);
  const ts = ground.tileSize;
  for (const a of [-0.5, 0.5]) {
    for (const k of [-0.5, 0.5]) {
      const cx = span.x + ux * a * span.length + vx * k * width;
      const cy = span.y + uy * a * span.length + vy * k * width;
      if (cx < 0 || cy < 0 || cx >= ground.width * ts || cy >= ground.height * ts) return "Off the map.";
    }
  }
  const tiles = bridgeTiles(ground, span, width);
  if (tiles.length === 0) return "Off the map.";
  for (const t of tiles) {
    if (ground.water(t.x, t.y)) continue;
    if (!ground.footing(t.x, t.y)) return "No footing for the bridge there.";
  }
  for (const b of [...(ground.bricks ?? []), ...laid]) {
    if (bricksConflict(span, width, b.span, bridgeWidth(b.type))) return "Another bridge is in the way.";
  }
  return null;
}

/** Each brick a line would lay, with the reason it cannot stand, or null. Earlier good bricks count for later ones. */
export function planBridgeLine(
  ground: BridgeGround,
  type: BridgeType,
  points: readonly { x: number; y: number }[],
  facing = 0,
): { span: BridgeSpan; problem: string | null }[] {
  const laid: BridgeBrick[] = [];
  return bridgePath(type, points, facing).map((span) => {
    const problem = bridgeBrickProblem(ground, type, span, laid);
    if (!problem) laid.push({ type, span });
    return { span, problem };
  });
}

/** First share 0–1 along the segment where it meets the deck rectangle, or null. 0 when it starts on it. */
export function bridgeSegmentT(b: BridgeSpan, width: number, x0: number, y0: number, x1: number, y1: number): number | null {
  const { ux, uy, vx, vy } = bridgeAxes(b.facing);
  const a0 = (x0 - b.x) * ux + (y0 - b.y) * uy;
  const c0 = (x0 - b.x) * vx + (y0 - b.y) * vy;
  const da = (x1 - b.x) * ux + (y1 - b.y) * uy - a0;
  const dc = (x1 - b.x) * vx + (y1 - b.y) * vy - c0;
  const ha = b.length / 2;
  const hc = width / 2;
  if (Math.abs(a0) <= ha && Math.abs(c0) <= hc) return 0;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-da, a0 + ha],
    [da, ha - a0],
    [-dc, c0 + hc],
    [dc, hc - c0],
  ] as const) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1 ? t0 : null;
}
