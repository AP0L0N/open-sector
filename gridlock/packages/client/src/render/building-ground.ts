/**
 * Where a building meets the ground. Client-only; no sim traffic.
 *
 * - `buildingGroundElev`: the height a building's sprite is drawn at. The
 *   lowest of its three visible corners, so a footprint on a slope never shows
 *   air under its front; the uphill back sinks behind the walls instead.
 * - `yardWearFootprint` / `drawYardWear`: a ragged patch of trampled earth
 *   around each building. All patches fill as one path, so a row of houses
 *   shares one worn yard instead of each sitting on its own tile.
 */

import { vertexElev } from "@gridlock/shared";
import { valueNoise } from "./pad-blend.js";

type Pt = { x: number; y: number };

export function buildingGroundElev(
  heights: ArrayLike<number>,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
  tileW: number,
  tileH: number,
): number {
  const south = vertexElev(heights, width, height, tileX + tileW, tileY + tileH);
  const east = vertexElev(heights, width, height, tileX + tileW, tileY);
  const west = vertexElev(heights, width, height, tileX, tileY + tileH);
  return Math.min(south, east, west);
}

/** Share of the footprint the walls stand on; the rest is the art's own yard. */
export const WALL_SHARE = 0.7;

/**
 * The walls' rectangle inside a footprint. A shadow cast from the full footprint
 * would trace the yard's straight edge right where the pad now frays away.
 */
export function wallFootprint(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const ww = w * WALL_SHARE;
  const wh = h * WALL_SHARE;
  return { x: x + (w - ww) / 2, y: y + (h - wh) / 2, w: ww, h: wh };
}

/** World units the worn patch reaches past the footprint, as a share of its shorter side. */
const WEAR_REACH = 0.22;
/** Perimeter samples per side. */
const WEAR_SIDE_SEGS = 10;

/**
 * A ragged ring around a world-space footprint. The jitter is hashed from world
 * position, so the patch holds still from frame to frame.
 */
export function yardWearFootprint(opts: { x: number; y: number; w: number; h: number; corners?: readonly Pt[] }): Pt[] {
  const { x, y, w, h } = opts;
  const reach = Math.min(w, h) * WEAR_REACH;
  // A turned building passes its own four corners; w and h are then its unturned sides.
  const corners: Pt[] = opts.corners
    ? [...opts.corners]
    : [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
  const cx = corners.reduce((s, c) => s + c.x, 0) / corners.length;
  const cy = corners.reduce((s, c) => s + c.y, 0) / corners.length;
  const cell = Math.max(1, reach * 0.9);
  const out: Pt[] = [];
  for (let side = 0; side < 4; side++) {
    const a = corners[side]!;
    const b = corners[(side + 1) % 4]!;
    for (let i = 0; i < WEAR_SIDE_SEGS; i++) {
      const t = i / WEAR_SIDE_SEGS;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      const dx = px - cx;
      const dy = py - cy;
      const len = Math.hypot(dx, dy) || 1;
      const n = valueNoise(px, py, cell, 7);
      const push = reach * (0.35 + n * 1.1);
      out.push({ x: px + (dx / len) * push, y: py + (dy / len) * push });
    }
  }
  return out;
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
      const px = cx + (p.x - cx) * grow;
      const py = cy + (p.y - cy) * grow;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}

/** Screen-space patches, all wound the same way. Soft rims, then the trodden core. */
export function drawYardWear(ctx: CanvasRenderingContext2D, polys: Pt[][]): void {
  if (polys.length === 0) return;
  ctx.save();
  ctx.fillStyle = "rgba(58, 46, 28, 0.10)";
  tracePolys(ctx, polys, 1.1);
  ctx.fill("nonzero");
  ctx.fillStyle = "rgba(58, 46, 28, 0.12)";
  tracePolys(ctx, polys, 1);
  ctx.fill("nonzero");
  ctx.restore();
}
