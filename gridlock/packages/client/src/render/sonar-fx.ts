/**
 * The Destroyer on the map: its sonar contacts and its contact mines. Nothing
 * here changes the field; the sim says what the sonar hears and where a mine lies.
 */

/** One sonar ping: a ring that spreads out from the contact and fades. */
export const SONAR_PING_MS = 1800;

/** 0–1 through this contact's ping. Each contact runs on its own clock. */
export function sonarPingPhase(nowMs: number, id: number): number {
  const offset = (Math.abs(Math.trunc(id)) * 397) % SONAR_PING_MS;
  return (((nowMs + offset) % SONAR_PING_MS) + SONAR_PING_MS) % SONAR_PING_MS / SONAR_PING_MS;
}

/**
 * A sonar contact on the water: a spreading ping ring laid flat on the ground
 * (2:1 like the map) and a small diamond on the heard spot. `down` (submerged)
 * draws the diamond hollow. `unit` is one tile in screen px.
 */
export function drawSonarContact(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { nowMs: number; id: number; down: boolean; unit: number },
): void {
  const t = sonarPingPhase(opts.nowMs, opts.id);
  const r = opts.unit * (0.8 + 3.2 * t);
  ctx.save();
  ctx.strokeStyle = `rgba(110, 230, 190, ${(0.75 * (1 - t)).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  const d = Math.max(3, opts.unit * 0.55);
  ctx.beginPath();
  ctx.moveTo(x, y - d);
  ctx.lineTo(x + d, y);
  ctx.lineTo(x, y + d);
  ctx.lineTo(x - d, y);
  ctx.closePath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(8, 20, 16, 0.8)";
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#6ee6be";
  ctx.stroke();
  if (!opts.down) {
    ctx.fillStyle = "rgba(110, 230, 190, 0.55)";
    ctx.fill();
  }
  ctx.restore();
}

/** Vertical bob of a moored mine at the waterline, screen px. Seeded so a line of mines does not bob as one. */
export function waterMineBob(seed: number, nowMs: number): number {
  return Math.sin(nowMs / 650 + seed * 2.3) * 0.6;
}

/** Horns round the shell, as angles on screen. Five show from any side. */
const HORNS = [-Math.PI / 2, -Math.PI / 2 - 1.05, -Math.PI / 2 + 1.05, Math.PI + 0.35, -0.35];

/**
 * A moored contact mine: a dark iron ball riding half out of the water, its
 * horns standing round the top, a ripple ring round it. While it is still
 * arming the horns have no caps lit. `size` is the ball's radius in screen px.
 */
export function drawWaterMine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { seed: number; arming: boolean; nowMs: number; size: number },
): void {
  const r = opts.size;
  const by = y + waterMineBob(opts.seed, opts.nowMs);
  ctx.save();
  // Ripple on the water round the ball.
  const rip = ((opts.nowMs / 1400 + opts.seed * 0.37) % 1 + 1) % 1;
  ctx.strokeStyle = `rgba(214, 232, 228, ${(0.45 * (1 - rip)).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.35, r * (1.3 + rip * 1.1), r * (0.65 + rip * 0.55), 0, 0, Math.PI * 2);
  ctx.stroke();
  // Horns: a short stalk and a cap.
  ctx.lineCap = "round";
  for (const a of HORNS) {
    const hx = x + Math.cos(a) * r * 1.35;
    const hy = by - r * 0.15 + Math.sin(a) * r * 1.2;
    ctx.strokeStyle = "#141210";
    ctx.lineWidth = Math.max(1.2, r * 0.32);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.6, by - r * 0.15 + Math.sin(a) * r * 0.55);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = opts.arming ? "#3a3530" : "#8e8a7e";
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(0.8, r * 0.2), 0, Math.PI * 2);
    ctx.fill();
  }
  // The ball, cut at the waterline: only the top shows.
  ctx.beginPath();
  ctx.arc(x, by, r, Math.PI, 0);
  ctx.ellipse(x, by, r, r * 0.35, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = "#2a2724";
  ctx.fill();
  ctx.strokeStyle = "#0e0c0a";
  ctx.lineWidth = 1;
  ctx.stroke();
  // A highlight on the curve of the shell.
  ctx.fillStyle = "rgba(200, 196, 184, 0.35)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, by - r * 0.55, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
