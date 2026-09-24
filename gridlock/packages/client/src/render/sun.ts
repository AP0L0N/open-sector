/**
 * Fixed directional sun and ground shadows for units, trees, and buildings.
 * Client-only; no sim traffic.
 *
 * World facing: 0 = east, π/2 = south. The sun sits WNW so shadows fall ESE
 * (down and a little right on the 2:1 diamond).
 */

/** Direction to the sun. WNW. */
export const SUN_AZIMUTH = (9 * Math.PI) / 8;
/** Height of the sun above the horizon. */
export const SUN_ELEVATION = (48 * Math.PI) / 180;
/** How far the blob center slides from the feet toward the cast, 0..1. */
export const SHADOW_CAST = 0.2;
const SHADOW_SEGS = 16;
/** World-space height used to hang the disc in the NW sky void. */
export const SUN_SKY_ELEV = 48;

export function sunWorldDir(): { x: number; y: number } {
  return { x: Math.cos(SUN_AZIMUTH), y: Math.sin(SUN_AZIMUTH) };
}

/** Unit vector away from the sun — the ground direction shadows stretch. */
export function shadowWorldDir(): { x: number; y: number } {
  return { x: Math.cos(SUN_AZIMUTH + Math.PI), y: Math.sin(SUN_AZIMUTH + Math.PI) };
}

export function shadowLength(height: number): number {
  if (height <= 0) return 0;
  return height / Math.tan(SUN_ELEVATION);
}

export function shadowStanceScale(stance?: string): number {
  if (stance === "crawl") return 0.38;
  if (stance === "crouch") return 0.7;
  return 1;
}

export function unitShadowHeight(radius: number, stance?: string): number {
  return Math.max(2, radius * 0.7 * shadowStanceScale(stance));
}

export function unitCastsShadow(opts: {
  kind: string;
  garrisonedIn?: number | null;
  swimming?: boolean;
}): boolean {
  return opts.kind === "unit" && opts.garrisonedIn == null && !opts.swimming;
}

/** Off-map NW of the origin so the disc lives in the sky void above the diamond. */
export function sunSkyWorld(tileSize: number): { x: number; y: number; z: number } {
  const d = tileSize * 16;
  return { x: -d, y: -d, z: SUN_SKY_ELEV };
}

export function groundShadowEllipse(opts: {
  x: number;
  y: number;
  facing: number;
  along: number;
  across: number;
  height: number;
}): { cx: number; cy: number; points: { x: number; y: number }[] } {
  const dir = shadowWorldDir();
  const len = shadowLength(Math.max(0, opts.height)) * SHADOW_CAST;
  const cx = opts.x + dir.x * len;
  const cy = opts.y + dir.y * len;
  const fx = Math.cos(opts.facing);
  const fy = Math.sin(opts.facing);
  const rx = -fy;
  const ry = fx;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < SHADOW_SEGS; i++) {
    const t = (i / SHADOW_SEGS) * Math.PI * 2;
    const ca = Math.cos(t);
    const sa = Math.sin(t);
    points.push({
      x: cx + fx * opts.along * ca + rx * opts.across * sa,
      y: cy + fy * opts.along * ca + ry * opts.across * sa,
    });
  }
  return { cx, cy, points };
}

export function unitShadowFootprint(opts: {
  x: number;
  y: number;
  facing: number;
  radius: number;
  elongated: boolean;
  stance?: string;
}): { cx: number; cy: number; points: { x: number; y: number }[] } {
  return groundShadowEllipse({
    x: opts.x,
    y: opts.y,
    facing: opts.facing,
    along: opts.radius * (opts.elongated ? 0.95 : 0.72),
    across: opts.radius * (opts.elongated ? 0.52 : 0.72),
    height: unitShadowHeight(opts.radius, opts.stance),
  });
}

/** Canopy puddle at the stem. `drawH` is the on-map sprite height in screen pixels. */
export function treeShadowFootprint(
  x: number,
  y: number,
  drawH: number,
): { cx: number; cy: number; points: { x: number; y: number }[] } {
  const r = Math.max(4, drawH * 0.2);
  return groundShadowEllipse({
    x,
    y,
    facing: 0,
    along: r,
    across: r * 0.92,
    height: r * 1.15,
  });
}

/** How tightly the lot blob hugs the diamond. 2 is a round ellipse. */
const BUILDING_SHADOW_ROUND = 1.25;
/** Just past the lot, so the pad does not cover the whole blob. */
const BUILDING_SHADOW_SCALE = 1.02;
/** Center slide, as a fraction of the longer half-extent. Same idea as SHADOW_CAST. */
const BUILDING_SHADOW_SLIDE = 0.06;
const BUILDING_SHADOW_SEGS = 24;

function signedPow(v: number, exp: number): number {
  if (v === 0) return 0;
  return Math.sign(v) * Math.abs(v) ** exp;
}

/**
 * Contact blob on the building lot. Half-extents are world pixels.
 * The sprite's ground pad covers an inscribed ellipse, so the blob
 * follows the lot corners and slides a little with the sun.
 */
export function buildingShadowFootprint(opts: {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
}): { cx: number; cy: number; points: { x: number; y: number }[] } {
  const dir = shadowWorldDir();
  const reach = Math.max(4, opts.halfW, opts.halfH);
  const slide = reach * BUILDING_SHADOW_SLIDE;
  const cx = opts.x + dir.x * slide;
  const cy = opts.y + dir.y * slide;
  const hw = Math.max(4, opts.halfW) * BUILDING_SHADOW_SCALE;
  const hh = Math.max(4, opts.halfH) * BUILDING_SHADOW_SCALE;
  // East and south corners of the axis-aligned lot.
  const ve = { x: hw, y: -hh };
  const vs = { x: hw, y: hh };
  const exp = 2 / BUILDING_SHADOW_ROUND;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < BUILDING_SHADOW_SEGS; i++) {
    const t = (i / BUILDING_SHADOW_SEGS) * Math.PI * 2;
    const a = signedPow(Math.cos(t), exp);
    const b = signedPow(Math.sin(t), exp);
    points.push({
      x: cx + ve.x * a + vs.x * b,
      y: cy + ve.y * a + vs.y * b,
    });
  }
  return { cx, cy, points };
}

export function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  alpha = 1,
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
  ctx.globalAlpha *= alpha;
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
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Soft light from the WNW of the viewport so the sun reads even when the disc is off-map. */
export function drawSunWash(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const x = w * 0.2;
  const y = h * 0.02;
  const r = Math.max(w, h) * 0.38;
  const g = ctx.createRadialGradient(x, y, 4, x, y, r);
  g.addColorStop(0, "rgba(255, 220, 140, 0.07)");
  g.addColorStop(0.35, "rgba(255, 196, 110, 0.03)");
  g.addColorStop(1, "rgba(255, 180, 90, 0)");
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function drawSunDisc(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 6, x, y, 108);
  glow.addColorStop(0, "rgba(255, 236, 176, 0.5)");
  glow.addColorStop(0.16, "rgba(255, 196, 96, 0.2)");
  glow.addColorStop(0.48, "rgba(232, 148, 56, 0.06)");
  glow.addColorStop(1, "rgba(200, 120, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 108, 0, Math.PI * 2);
  ctx.fill();
  const core = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, 18);
  core.addColorStop(0, "#fff6d8");
  core.addColorStop(0.4, "#ffd27a");
  core.addColorStop(1, "rgba(240, 158, 48, 0.12)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
