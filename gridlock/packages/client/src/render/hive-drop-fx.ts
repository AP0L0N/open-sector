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

/** How long the landing flash, shockwaves, and thrown debris last. */
export const HIVE_IMPACT_MS = 2400;
/** The camera shakes for this long after a landing. */
export const HIVE_SHAKE_MS = 700;

/** Height the Hive Core starts its fall from, in `unit`s: far off the top of the screen. */
const FALL_UNITS = 24;
/** Screen px it drifts sideways per px it falls: it comes in steep from the upper left. */
const SLANT = 0.28;

/**
 * Height of the falling Hive Core over its landing spot, screen px, at fall
 * share `u` 0–1. It is already moving fast when it starts and is still
 * speeding up when it hits.
 */
export function cometLift(u: number, unit: number): number {
  const t = Math.max(0, Math.min(1, u));
  return (1 - t) * (1 + 0.5 * t) * unit * FALL_UNITS;
}

/** Fixed per-index jitter, 0–1. */
function hash(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The Hive Core hurling down out of space onto its landing spot (gx, gy,
 * screen px): a massive burning head with a bow shock on its leading face,
 * a trail streaming far back up the sky, sparks and slag torn off it, and
 * the ground under it lighting up as it closes. `u` is the share of the fall
 * done, 0–1.
 */
export function drawHiveComet(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  opts: { u: number; unit: number; nowMs: number },
): void {
  const u = Math.max(0, Math.min(1, opts.u));
  const unit = opts.unit;
  const now = opts.nowMs;
  const lift = cometLift(u, unit);
  const hx = gx - lift * SLANT;
  const hy = gy - lift;
  // Unit vector of travel (down and to the right), and its normal.
  const len = Math.hypot(SLANT, 1);
  const fx = SLANT / len;
  const fy = 1 / len;
  const nx = -fy;
  const ny = fx;
  const flicker = 1 + 0.06 * Math.sin(now / 23) + 0.04 * Math.sin(now / 9.7);
  const head = unit * (1.05 + 0.35 * u);
  ctx.save();

  // The ground lights up under it as it closes, cyan going white.
  const near = Math.max(0, (u - 0.45) / 0.55);
  if (near > 0) {
    const r = unit * (2 + 6 * near);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, `rgba(225, 250, 255, ${(0.55 * near * near).toFixed(3)})`);
    g.addColorStop(0.4, `rgba(110, 215, 250, ${(0.3 * near).toFixed(3)})`);
    g.addColorStop(1, "rgba(60, 140, 220, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(gx, gy, r, r / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Trail: a wide outer glow, then a hot inner core, both streaming back up the sky.
  const streak = (length: number, width: number, stops: [number, string][]): void => {
    const tx = hx - fx * length;
    const ty = hy - fy * length;
    const grad = ctx.createLinearGradient(hx + fx * width * 0.5, hy + fy * width * 0.5, tx, ty);
    for (const [at, c] of stops) grad.addColorStop(at, c);
    ctx.fillStyle = grad;
    // Round nose round the head, flanks swelling out a little way back, then tapering to a point.
    const sw = hx - fx * length * 0.12;
    const sh = hy - fy * length * 0.12;
    ctx.beginPath();
    ctx.moveTo(hx + nx * width * 0.55, hy + ny * width * 0.55);
    ctx.quadraticCurveTo(sw + nx * width, sh + ny * width, tx, ty);
    ctx.quadraticCurveTo(sw - nx * width, sh - ny * width, hx - nx * width * 0.55, hy - ny * width * 0.55);
    ctx.quadraticCurveTo(hx + fx * width * 0.7, hy + fy * width * 0.7, hx + nx * width * 0.55, hy + ny * width * 0.55);
    ctx.closePath();
    ctx.fill();
  };
  streak(unit * 34, head * 1.9 * flicker, [
    [0, "rgba(120, 220, 255, 0.55)"],
    [0.3, "rgba(70, 150, 230, 0.28)"],
    [1, "rgba(40, 80, 160, 0)"],
  ]);
  streak(unit * 18, head * 1.05, [
    [0, "rgba(245, 254, 255, 0.95)"],
    [0.2, "rgba(150, 235, 255, 0.7)"],
    [1, "rgba(80, 170, 240, 0)"],
  ]);

  // Sparks and burning slag torn off the head, streaming back along the trail.
  for (let i = 0; i < 26; i++) {
    const f = (now / 260 + hash(i, 1)) % 1;
    const back = f * unit * (10 + 12 * hash(i, 2));
    const side = (hash(i, 3) - 0.5) * head * (1.4 + 2.2 * f);
    const sx = hx - fx * back + nx * side;
    const sy = hy - fy * back + ny * side;
    const big = hash(i, 4) > 0.75;
    const a = (1 - f) * (big ? 0.85 : 0.75);
    ctx.fillStyle = big ? `rgba(255, 236, 200, ${a.toFixed(3)})` : `rgba(210, 248, 255, ${a.toFixed(3)})`;
    const s = big ? 3 + 2 * (1 - f) : 2;
    ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
  }

  // Plasma halo round the head.
  const haloR = head * 3.2 * flicker;
  const halo = ctx.createRadialGradient(hx, hy, head * 0.4, hx, hy, haloR);
  halo.addColorStop(0, "rgba(240, 253, 255, 0.95)");
  halo.addColorStop(0.3, "rgba(140, 228, 255, 0.6)");
  halo.addColorStop(1, "rgba(60, 140, 220, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(hx, hy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Bow shock: a white-hot crescent pressed onto the leading face.
  const lead = Math.atan2(fy, fx);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = Math.max(2, head * 0.14);
  ctx.beginPath();
  ctx.arc(hx - fx * head * 0.1, hy - fy * head * 0.1, head * 1.0, lead - 1.0, lead + 1.0);
  ctx.stroke();
  ctx.strokeStyle = "rgba(170, 240, 255, 0.3)";
  ctx.lineWidth = Math.max(2, head * 0.22);
  ctx.beginPath();
  ctx.arc(hx - fx * head * 0.2, hy - fy * head * 0.2, head * 1.35, lead - 0.8, lead + 0.8);
  ctx.stroke();

  // The hive itself inside the fire: a dark shell, seams glowing through.
  const body = ctx.createRadialGradient(hx + fx * head * 0.45, hy + fy * head * 0.45, head * 0.05, hx, hy, head * 0.85);
  body.addColorStop(0, "rgba(255, 255, 255, 1)");
  body.addColorStop(0.3, "rgba(150, 230, 250, 1)");
  body.addColorStop(0.65, "#2f4152");
  body.addColorStop(1, "#1a232d");
  ctx.fillStyle = body;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rr = head * (0.68 + 0.12 * hash(i % 12, 11));
    const px = hx + Math.cos(a) * rr;
    const py = hy + Math.sin(a) * rr * 0.92;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Camera shake after a landing `ageMs` ago, screen px: hard at first, gone by HIVE_SHAKE_MS. */
export function hiveShake(ageMs: number, nowMs: number): { x: number; y: number } {
  if (ageMs < 0 || ageMs >= HIVE_SHAKE_MS) return { x: 0, y: 0 };
  const k = 1 - ageMs / HIVE_SHAKE_MS;
  const amp = 14 * k * k;
  return { x: Math.sin(nowMs * 0.091) * amp, y: Math.cos(nowMs * 0.117) * amp * 0.7 };
}

/**
 * The landing: a blinding flash, a fast bright shockwave and a slower one of
 * dust along the ground, a dust cloud, slag and rock thrown out on arcs, and
 * a glowing rim round the hive's foot that cools last. `age` 0–1 of HIVE_IMPACT_MS.
 */
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
  // Flash: blinding, gone in the first sixth.
  const flash = Math.max(0, 1 - a * 6);
  if (flash > 0) {
    const r = unit * 10;
    const g = ctx.createRadialGradient(x, y - unit, 0, x, y - unit, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${flash.toFixed(3)})`);
    g.addColorStop(0.35, `rgba(190, 245, 255, ${(0.7 * flash).toFixed(3)})`);
    g.addColorStop(1, "rgba(120, 225, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - unit, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dust cloud rolling out round the foot of the hive.
  const dust = unit * (2 + 4.5 * Math.sqrt(a));
  ctx.fillStyle = `rgba(115, 96, 74, ${(0.55 * (1 - a)).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, y, dust, dust / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // A column of dust and steam punched up off the ground, spreading and settling.
  if (a < 0.75) {
    const c = a / 0.75;
    const ch = unit * (2 + 5 * Math.sqrt(c));
    const g = ctx.createRadialGradient(x, y - ch * 0.6, 0, x, y - ch * 0.6, ch);
    g.addColorStop(0, `rgba(170, 160, 145, ${(0.6 * (1 - c)).toFixed(3)})`);
    g.addColorStop(1, "rgba(120, 104, 84, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - ch * 0.55, unit * (1.4 + 2.2 * c), ch * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Slow shockwave: a thick ring of dust along the ground.
  const slow = unit * (1.5 + 9 * Math.sqrt(a));
  ctx.strokeStyle = `rgba(150, 128, 100, ${(0.6 * (1 - a)).toFixed(3)})`;
  ctx.lineWidth = unit * 0.5 * (1 - a) + 1;
  ctx.beginPath();
  ctx.ellipse(x, y, slow, slow / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Fast shockwave: a bright ring racing out, gone by halfway.
  const fastA = Math.min(1, a * 2);
  if (fastA < 1) {
    const fast = unit * (2 + 18 * fastA);
    ctx.strokeStyle = `rgba(200, 245, 255, ${(0.9 * (1 - fastA)).toFixed(3)})`;
    ctx.lineWidth = 4 * (1 - fastA) + 1;
    ctx.beginPath();
    ctx.ellipse(x, y, fast, fast / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Slag and rock thrown out on arcs, landing by 60%.
  const t = a / 0.6;
  if (t < 1) {
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + hash(i, 5) * 0.4;
      const reach = unit * (3 + 5 * hash(i, 6)) * t;
      const up = unit * (2 + 4 * hash(i, 7)) * 4 * t * (1 - t);
      const px = x + Math.cos(ang) * reach;
      const py = y + Math.sin(ang) * reach * 0.5 - up;
      const s = unit * (0.1 + 0.16 * hash(i, 8));
      ctx.fillStyle = hash(i, 9) > 0.5 ? `rgba(255, 225, 180, ${(1 - t).toFixed(3)})` : `rgba(48, 44, 40, ${(1 - t * 0.6).toFixed(3)})`;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }
  }
  // Glowing rim round the hive's foot, cooling last.
  const rim = unit * 1.7;
  ctx.strokeStyle = `rgba(110, 230, 255, ${(0.7 * (1 - a) * (1 - a)).toFixed(3)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, rim, rim / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
