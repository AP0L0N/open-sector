/**
 * Cast shadows for buildings and trees. Client-only; no sim traffic.
 *
 * Same sun as the unit blobs: shadows fall ESE in world space (down and a
 * little right on the 2:1 diamond). All casters fill as one path, so where two
 * shadows overlap the ground does not get darker twice.
 */

type Pt = { x: number; y: number };

export const SUN_ANGLE = Math.PI / 8;
/** World shadow length per world unit of caster height. */
const SHADOW_PER_HEIGHT = 0.8;
const SEGS = 16;

export function shadowOffset(height: number): Pt {
  const len = Math.max(0, height) * SHADOW_PER_HEIGHT;
  return { x: Math.cos(SUN_ANGLE) * len, y: Math.sin(SUN_ANGLE) * len };
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex hull, clockwise on screen (y down), so every caster winds the same way. */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * A box on its footprint, pushed along the sun: the hull of its base and its roof's shadow.
 * `base` replaces the box corners for a turned building.
 */
export function buildingShadowFootprint(opts: {
  x: number;
  y: number;
  w: number;
  h: number;
  height: number;
  base?: readonly Pt[];
}): Pt[] {
  const { x, y, w, h } = opts;
  const d = shadowOffset(opts.height);
  const base = opts.base
    ? [...opts.base]
    : [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
  return convexHull([...base, ...base.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))]);
}

/** A crown on a trunk: an ellipse leaning away from the sun, starting at the stem. */
export function treeShadowFootprint(opts: { x: number; y: number; height: number; crown: number }): Pt[] {
  const d = shadowOffset(opts.height);
  const len = Math.hypot(d.x, d.y);
  const along = len * 0.5 + opts.crown * 0.6;
  const across = opts.crown;
  const cx = opts.x + d.x * 0.62;
  const cy = opts.y + d.y * 0.62;
  const fx = Math.cos(SUN_ANGLE);
  const fy = Math.sin(SUN_ANGLE);
  const points: Pt[] = [];
  for (let i = 0; i < SEGS; i++) {
    const t = (i / SEGS) * Math.PI * 2;
    const ca = Math.cos(t);
    const sa = Math.sin(t);
    points.push({
      x: cx + fx * along * ca - fy * across * sa,
      y: cy + fy * along * ca + fx * across * sa,
    });
  }
  return points;
}

function tracePolys(ctx: CanvasRenderingContext2D, polys: Pt[][], grow: number): void {
  ctx.beginPath();
  for (const poly of polys) {
    if (poly.length < 3) continue;
    let cx = 0;
    let cy = 0;
    for (const p of poly) {
      cx += p.x;
      cy += p.y;
    }
    cx /= poly.length;
    cy /= poly.length;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const x = cx + (p.x - cx) * grow;
      const y = cy + (p.y - cy) * grow;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

/**
 * Graded rims, outermost first. A single hard edge under a building reads as the
 * edge of a slab it stands on; stacked rims let the shadow fade into the ground.
 */
const SHADOW_RIMS: readonly { grow: number; alpha: number }[] = [
  { grow: 1.1, alpha: 0.05 },
  { grow: 1.05, alpha: 0.06 },
  { grow: 1, alpha: 0.07 },
  { grow: 0.93, alpha: 0.08 },
];

/** Screen-space polygons, all wound the same way. Soft rims, then the core. */
export function drawCastShadows(ctx: CanvasRenderingContext2D, polys: Pt[][]): void {
  if (polys.length === 0) return;
  ctx.save();
  for (const rim of SHADOW_RIMS) {
    ctx.fillStyle = `rgba(10, 8, 5, ${rim.alpha})`;
    tracePolys(ctx, polys, rim.grow);
    ctx.fill("nonzero");
  }
  ctx.restore();
}
