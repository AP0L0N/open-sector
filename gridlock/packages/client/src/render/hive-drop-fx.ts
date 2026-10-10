/**
 * The Xenomorph Deployment and the Hive Core's fall. The Deployment is no body:
 * a radial landing grid laid flat on the ground, the APS scan grid's look in
 * rings and spokes, breathing slowly. Deployed, the Hive Core comes down out
 * of the sky onto it like a comet and the sim makes it whole on landing.
 * Nothing here changes the field.
 */

/** World point → screen point. The grid is drawn in world space so it lies on the ground in true 2:1. */
export type Project = (wx: number, wy: number) => { x: number; y: number };

/** One slow breath of the grid. */
export const GRID_BREATH_MS = 3200;
/** A bright ring runs out from the middle once per GRID_SWEEP_MS. */
export const GRID_SWEEP_MS = 2600;
/** How long the landing flash and shockwave last. */
export const HIVE_IMPACT_MS = 1400;

const RINGS = 4;
const SPOKES = 12;

/** 0–1, swelling and falling once per GRID_BREATH_MS. */
export function gridBreath(nowMs: number): number {
  return 0.5 + 0.5 * Math.sin((nowMs / GRID_BREATH_MS) * Math.PI * 2);
}

/** 0–1 of the running sweep ring. */
export function gridSweep(nowMs: number): number {
  return (((nowMs % GRID_SWEEP_MS) + GRID_SWEEP_MS) % GRID_SWEEP_MS) / GRID_SWEEP_MS;
}

function ringPath(ctx: CanvasRenderingContext2D, project: Project, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const s = project(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  }
}

function ring(ctx: CanvasRenderingContext2D, project: Project, cx: number, cy: number, r: number): void {
  ringPath(ctx, project, cx, cy, r);
  ctx.stroke();
}

/**
 * The Deployment: concentric rings and spokes round (cx, cy), world units,
 * out to `radius`. `charge` 0–1 brightens it and draws it in as the Hive Core
 * comes down onto it.
 */
export function drawDeploymentGrid(
  ctx: CanvasRenderingContext2D,
  project: Project,
  cx: number,
  cy: number,
  opts: { nowMs: number; radius: number; charge?: number },
): void {
  const k = gridBreath(opts.nowMs);
  const charge = Math.max(0, Math.min(1, opts.charge ?? 0));
  const r = opts.radius * (0.94 + 0.06 * k) * (1 - 0.25 * charge);
  ctx.save();
  ctx.lineWidth = 1;
  // A faint disc so the grid reads on bright ground.
  const c = project(cx, cy);
  ctx.fillStyle = `rgba(60, 170, 210, ${(0.05 + 0.04 * k + 0.12 * charge).toFixed(3)})`;
  ringPath(ctx, project, cx, cy, r);
  ctx.fill();
  ctx.strokeStyle = `rgba(120, 225, 255, ${(0.24 + 0.16 * k + 0.4 * charge).toFixed(3)})`;
  for (let i = 1; i <= RINGS; i++) ring(ctx, project, cx, cy, (r * i) / RINGS);
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2;
    const a0 = project(cx + Math.cos(a) * r * 0.12, cy + Math.sin(a) * r * 0.12);
    const a1 = project(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(a1.x, a1.y);
    ctx.stroke();
  }
  // The sweep: a bright ring running out from the middle, fading as it goes.
  const s = gridSweep(opts.nowMs * (1 + 2 * charge));
  ctx.strokeStyle = `rgba(215, 248, 255, ${((0.55 + 0.3 * charge) * Math.sin(Math.PI * s)).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ring(ctx, project, cx, cy, r * s);
  // The centre mark.
  ctx.fillStyle = `rgba(215, 248, 255, ${(0.35 + 0.35 * k + 0.3 * charge).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 2.5 + charge * 2, 1.25 + charge, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Height of the falling Hive Core over its landing spot, screen px per `unit`, at fall share `u` 0–1. */
export function cometLift(u: number, unit: number): number {
  const t = Math.max(0, Math.min(1, u));
  // It speeds up all the way down.
  return (1 - t * t) * unit * 14;
}

/**
 * The Hive Core coming down: a burning head over its landing spot (gx, gy,
 * screen px), a long trail back up the sky, and its shadow swelling on the
 * ground. `u` is the share of the fall done, 0–1.
 */
export function drawHiveComet(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  opts: { u: number; unit: number; nowMs: number },
): void {
  const u = Math.max(0, Math.min(1, opts.u));
  const unit = opts.unit;
  const lift = cometLift(u, unit);
  // It comes in steep from the upper left.
  const hx = gx - lift * 0.35;
  const hy = gy - lift;
  const head = unit * (0.5 + 0.3 * u);
  ctx.save();
  // Shadow on the landing spot.
  ctx.fillStyle = `rgba(10, 20, 30, ${(0.1 + 0.4 * u).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(gx, gy, unit * (0.4 + 1.1 * u), unit * (0.2 + 0.55 * u), 0, 0, Math.PI * 2);
  ctx.fill();
  // The trail: back along the line it came down, widest at the head.
  const tail = unit * (6 + 4 * u);
  const dx = 0.35;
  const len = Math.hypot(dx, 1);
  const tx = hx - (dx / len) * tail;
  const ty = hy - (1 / len) * tail;
  const grad = ctx.createLinearGradient(hx, hy, tx, ty);
  grad.addColorStop(0, "rgba(200, 245, 255, 0.85)");
  grad.addColorStop(0.25, "rgba(90, 200, 240, 0.55)");
  grad.addColorStop(1, "rgba(60, 120, 200, 0)");
  const nx = 1 / len;
  const ny = -dx / len;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(hx + nx * head, hy + ny * head);
  ctx.lineTo(tx, ty);
  ctx.lineTo(hx - nx * head, hy - ny * head);
  ctx.closePath();
  ctx.fill();
  // Sparks shed off the trail, flickering.
  for (let i = 0; i < 6; i++) {
    const f = ((opts.nowMs / 90 + i * 37) % 10) / 10;
    const sx = hx - (dx / len) * tail * f + Math.sin(i * 12.9 + opts.nowMs / 70) * head * 0.8;
    const sy = hy - (1 / len) * tail * f;
    ctx.fillStyle = `rgba(220, 250, 255, ${(0.7 * (1 - f)).toFixed(3)})`;
    ctx.fillRect(sx, sy, 2, 2);
  }
  // The burning head: a halo, the hot core, and the dark hive shell inside it.
  const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, head * 2.4);
  halo.addColorStop(0, "rgba(230, 252, 255, 0.95)");
  halo.addColorStop(0.35, "rgba(110, 220, 250, 0.6)");
  halo.addColorStop(1, "rgba(60, 140, 220, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(hx, hy, head * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#34485e";
  ctx.beginPath();
  ctx.arc(hx, hy, head * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(95, 232, 240, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** The landing: a white flash, a shockwave ring on the ground, and dust thrown out. `age` 0–1 of HIVE_IMPACT_MS. */
export function drawHiveImpact(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { age: number; unit: number },
): void {
  const a = Math.max(0, Math.min(1, opts.age));
  if (a >= 1) return;
  const unit = opts.unit;
  ctx.save();
  // Flash: gone in the first fifth.
  const flash = Math.max(0, 1 - a * 5);
  if (flash > 0) {
    const g = ctx.createRadialGradient(x, y - unit * 0.5, 0, x, y - unit * 0.5, unit * 3.5);
    g.addColorStop(0, `rgba(240, 253, 255, ${(0.9 * flash).toFixed(3)})`);
    g.addColorStop(1, "rgba(120, 225, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - unit * 0.5, unit * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dust thrown out round the foot of the hive.
  const dust = unit * (1.6 + 2.6 * Math.sqrt(a));
  ctx.fillStyle = `rgba(120, 100, 78, ${(0.45 * (1 - a)).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, y, dust, dust / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shockwave ring, 2:1 on the ground.
  const wave = unit * (1 + 6 * a);
  ctx.strokeStyle = `rgba(160, 235, 255, ${(0.8 * (1 - a)).toFixed(3)})`;
  ctx.lineWidth = 2.5 * (1 - a) + 0.5;
  ctx.beginPath();
  ctx.ellipse(x, y, wave, wave / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
