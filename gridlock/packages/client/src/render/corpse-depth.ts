import { isoDepth } from "@gridlock/shared";

/**
 * Painter layers. Craters and unit ground shadows use HOLE_DRAW_LAYER, move clicks
 * use 0, and fallen soldiers with their blood use CORPSE_DRAW_LAYER, so every
 * ground mark paints under anything that stands. Trees, buildings, field
 * walls, units, track dirt, and muzzle smoke all share STANDING_DRAW_LAYER
 * and interleave by ground depth: whatever stands further south-east paints
 * on top, so a tank behind a house is covered and a tank in front covers it.
 */
export const HOLE_DRAW_LAYER = -1;
export const CORPSE_DRAW_LAYER = 0.5;
export const STANDING_DRAW_LAYER = 1;

/** Ground rectangle of a building or field wall. `ax, ay` is the unit axis `halfAlong` runs on. */
export type DrawFootprint = {
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  halfAlong: number;
  halfAcross: number;
};

export type DrawKey = {
  layer: number;
  z: number;
  /** World ground point of a small standing item (unit, tree). */
  at?: { x: number; y: number };
  foot?: DrawFootprint;
};

export function axisFootprint(x: number, y: number, w: number, h: number): DrawFootprint {
  return { cx: x + w / 2, cy: y + h / 2, ax: 1, ay: 0, halfAlong: w / 2, halfAcross: h / 2 };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Positive when the point stands south-east of the footprint's nearest edge, or on it. */
function pointAhead(p: { x: number; y: number }, f: DrawFootprint): number {
  const dx = p.x - f.cx;
  const dy = p.y - f.cy;
  const u = clamp(dx * f.ax + dy * f.ay, -f.halfAlong, f.halfAlong);
  const v = clamp(-dx * f.ay + dy * f.ax, -f.halfAcross, f.halfAcross);
  const d = isoDepth(p.x, p.y) - isoDepth(f.cx + f.ax * u - f.ay * v, f.cy + f.ay * u + f.ax * v);
  return d === 0 ? 1 : d;
}

/** Layer first, then south-east ground depth, measured against a footprint's edge when one side has one. */
export function compareDrawOrder(a: DrawKey, b: DrawKey): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  if (a.layer === STANDING_DRAW_LAYER) {
    if (b.foot && !a.foot && a.at) return pointAhead(a.at, b.foot);
    if (a.foot && !b.foot && b.at) return -pointAhead(b.at, a.foot);
  }
  return a.z - b.z;
}
