/**
 * Whose is it: the commander's colour on the field itself, not only on the
 * minimap. A unit stands in a faint ring of its owner's colour on the ground; a
 * garrisoned building flies a pennant in its holder's. Client-only; no sim traffic.
 */

export interface MarkPt {
  x: number;
  y: number;
}

const RING_SEGS = 20;

/** World points of the ground ring round a unit's feet: a circle, which the 2:1 projection flattens. */
export function ownerRingPoints(x: number, y: number, radius: number): MarkPt[] {
  const out: MarkPt[] = [];
  for (let i = 0; i < RING_SEGS; i++) {
    const t = (i / RING_SEGS) * Math.PI * 2;
    out.push({ x: x + Math.cos(t) * radius, y: y + Math.sin(t) * radius });
  }
  return out;
}

/** Ring radius, world px, for a unit of catalog radius `r` drawn at visual `scale`. */
export function ownerRingRadius(r: number, scale: number, infantry: boolean): number {
  return Math.max(infantry ? 5 : 7, r * scale * (infantry ? 0.95 : 0.85));
}

function rgb(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return "136, 136, 136";
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** The ring on the ground: a dark under-stroke so it reads on pale dirt, the colour over it, a faint tint inside. */
export function drawOwnerRing(ctx: CanvasRenderingContext2D, pts: readonly MarkPt[], hex: string, alpha = 1): void {
  if (pts.length < 3 || alpha <= 0) return;
  const c = rgb(hex);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.fillStyle = `rgba(${c}, ${0.07 * alpha})`;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(8, 6, 4, ${0.22 * alpha})`;
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = `rgba(${c}, ${0.45 * alpha})`;
  ctx.stroke();
  ctx.restore();
}

/** A pennant on a short pole, its foot at (x, y) on the building's roof line. */
export function drawOwnerPennant(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string, alpha = 1): void {
  if (alpha <= 0) return;
  const pole = 14;
  const top = y - pole;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(20, 16, 10, 0.95)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 0.5, top);
  ctx.lineTo(x + 12, top + 3.5);
  ctx.lineTo(x + 0.5, top + 7);
  ctx.closePath();
  ctx.fillStyle = hex;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(8, 6, 4, 0.9)";
  ctx.stroke();
  ctx.restore();
}
