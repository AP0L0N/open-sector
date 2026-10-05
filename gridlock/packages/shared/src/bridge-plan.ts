/**
 * Bridge geometry, shared by the sim and the client's placement ghost.
 *
 * A bridge is a rectangle: centre (x, y), `facing` along the deck (from one
 * shore to the other), `length` along it, and the type's width across it.
 * The player drags roughly from shore to shore; `planBridge` snaps that drag
 * to the water it crosses, with a short footing on dry land at each end.
 */

import { BRIDGE_ABUTMENT, BRIDGE_MAX_TILES, bridgeWidth, type BridgeType } from "./catalog.js";

/** Farthest an end walks on past the abutment to find dry land across the deck, tiles. */
const BRIDGE_END_SEEK_TILES = 4;

export interface BridgeSpan {
  x: number;
  y: number;
  /** World radians along the deck. */
  facing: number;
  /** World px end to end. */
  length: number;
}

/** What `planBridge` needs to know about the ground. */
export interface BridgeGround {
  width: number;
  height: number;
  tileSize: number;
  /** Open water (no deck over it yet). */
  water(tx: number, ty: number): boolean;
  /** Land a bridge end may rest on: not rock, wall, fence, a building, or a standing tree. */
  footing(tx: number, ty: number): boolean;
  /** A tile already under some other bridge or its wreckage. */
  bridged?(tx: number, ty: number): boolean;
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

export type BridgePlan = { ok: true; span: BridgeSpan } | { ok: false; reason: string; span?: BridgeSpan };

/**
 * Snap a drag from (x1, y1) to (x2, y2) to a bridge. The first and last water
 * met along the drag set the crossing; the deck goes on to the land past each
 * shore (searching a little beyond the drag ends, so a drag that stops short in
 * the shallows still lands) and rests `BRIDGE_ABUTMENT` on it. `span` comes back
 * with a refusal when there is a deck to show in red.
 */
export function planBridge(ground: BridgeGround, type: BridgeType, x1: number, y1: number, x2: number, y2: number): BridgePlan {
  const ts = ground.tileSize;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < ts) return { ok: false, reason: "Drag across the water." };
  const ux = dx / len;
  const uy = dy / len;
  const step = ts / 2;
  const tileOf = (s: number): { x: number; y: number } => ({
    x: Math.floor((x1 + ux * s) / ts),
    y: Math.floor((y1 + uy * s) / ts),
  });
  const inside = (t: { x: number; y: number }): boolean => t.x >= 0 && t.y >= 0 && t.x < ground.width && t.y < ground.height;
  const wet = (s: number): boolean => {
    const t = tileOf(s);
    return inside(t) && ground.water(t.x, t.y);
  };
  let first = -1;
  let last = -1;
  for (let s = 0; s <= len; s += step) {
    if (!wet(s)) continue;
    if (first < 0) first = s;
    last = s;
  }
  if (first < 0) return { ok: false, reason: "A bridge has to cross water." };
  const maxLen = BRIDGE_MAX_TILES * ts;
  // Walk out of the water at each end to the first dry sample.
  let shoreA = first;
  while (shoreA > -maxLen && wet(shoreA - step)) shoreA -= step;
  let shoreB = last;
  while (shoreB < len + maxLen && wet(shoreB + step)) shoreB += step;
  const width = bridgeWidth(type);
  const w = Math.max(width, ts);
  const { vx, vy } = bridgeAxes(Math.atan2(uy, ux));
  // An end rests on land across the whole deck width. On a curved shore it walks on a little.
  const endDry = (s: number): boolean | null => {
    for (const k of [-0.5, 0, 0.5]) {
      const t = {
        x: Math.floor((x1 + ux * s + vx * w * k * 0.9) / ts),
        y: Math.floor((y1 + uy * s + vy * w * k * 0.9) / ts),
      };
      if (!inside(t)) return null;
      if (ground.water(t.x, t.y)) return false;
    }
    return true;
  };
  const reach = BRIDGE_END_SEEK_TILES * ts;
  let sA = shoreA - step / 2 - BRIDGE_ABUTMENT;
  let sB = shoreB + step / 2 + BRIDGE_ABUTMENT;
  let endA = endDry(sA + step / 2);
  for (let n = 0; endA === false && n * step < reach; n++) endA = endDry((sA -= step) + step / 2);
  let endB = endDry(sB - step / 2);
  for (let n = 0; endB === false && n * step < reach; n++) endB = endDry((sB += step) - step / 2);
  const length = sB - sA;
  const mid = (sA + sB) / 2;
  const span: BridgeSpan = { x: x1 + ux * mid, y: y1 + uy * mid, facing: Math.atan2(uy, ux), length };
  if (endA === null || endB === null) return { ok: false, reason: "Too close to the edge.", span };
  if (!endA || !endB) return { ok: false, reason: "Both ends need dry land.", span };
  if (length > maxLen) return { ok: false, reason: "Too long for a bridge.", span };
  for (const t of bridgeTiles(ground, span, width)) {
    if (ground.bridged?.(t.x, t.y)) return { ok: false, reason: "Another bridge is in the way.", span };
    if (ground.water(t.x, t.y)) continue;
    if (!ground.footing(t.x, t.y)) return { ok: false, reason: "No footing for the bridge there.", span };
  }
  return { ok: true, span };
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
