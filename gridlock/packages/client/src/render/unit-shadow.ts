/**
 * Soft ground blob under units. Client-only; no sim traffic.
 *
 * World facing: 0 = east, π/2 = south. The blob slides a little ESE
 * (down and a little right on the 2:1 diamond).
 */

const SLIDE_ANGLE = Math.PI / 8;
/** How far the blob center slides from the feet, per unit of height. */
const SLIDE = 0.18;
const SEGS = 16;
/** Contact patch size, as a share of the blob. */
const CONTACT = 0.62;

export function shadowStanceScale(stance?: string): number {
  if (stance === "crawl") return 0.38;
  if (stance === "crouch") return 0.7;
  return 1;
}

export function unitCastsShadow(opts: {
  kind: string;
  garrisonedIn?: number | null;
  swimming?: boolean;
}): boolean {
  return opts.kind === "unit" && opts.garrisonedIn == null && !opts.swimming;
}

export function unitShadowFootprint(opts: {
  x: number;
  y: number;
  facing: number;
  radius: number;
  elongated: boolean;
  stance?: string;
  /** Off the ground (a flying plane): no contact patch under it. */
  airborne?: boolean;
}): { cx: number; cy: number; points: { x: number; y: number }[]; contact: { x: number; y: number }[] } {
  const height = Math.max(2, opts.radius * 0.7 * shadowStanceScale(opts.stance));
  const cx = opts.x + Math.cos(SLIDE_ANGLE) * height * SLIDE;
  const cy = opts.y + Math.sin(SLIDE_ANGLE) * height * SLIDE;
  const along = opts.radius * (opts.elongated ? 0.95 : 0.72);
  const across = opts.radius * (opts.elongated ? 0.52 : 0.72);
  const fx = Math.cos(opts.facing);
  const fy = Math.sin(opts.facing);
  const ring = (ox: number, oy: number, a: number, b: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const t = (i / SEGS) * Math.PI * 2;
      const ca = Math.cos(t);
      const sa = Math.sin(t);
      out.push({ x: ox + fx * a * ca - fy * b * sa, y: oy + fy * a * ca + fx * b * sa });
    }
    return out;
  };
  const points = ring(cx, cy, along, across);
  // Right under the feet or tracks, where the body meets the ground.
  const contact = opts.airborne ? [] : ring(opts.x, opts.y, along * CONTACT, across * CONTACT);
  return { cx, cy, points, contact };
}

export function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  contact: { x: number; y: number }[] = [],
): void {
  if (points.length < 3) return;
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  ctx.save();
  ctx.fillStyle = "rgba(10, 8, 5, 0.08)";
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const x = cx + (p.x - cx) * 1.12;
    const y = cy + (p.y - cy) * 1.12;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(10, 8, 5, 0.16)";
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.closePath();
  ctx.fill();
  if (contact.length >= 3) {
    ctx.fillStyle = "rgba(10, 8, 5, 0.2)";
    ctx.beginPath();
    ctx.moveTo(contact[0]!.x, contact[0]!.y);
    for (let i = 1; i < contact.length; i++) ctx.lineTo(contact[i]!.x, contact[i]!.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
