/**
 * The badge over a Rig unpacking into a Core, or a Core packing back into a Rig.
 * An amber ring fills with the transform; inside, the Core's footprint (a 2:1
 * diamond, like the ground) swells or shrinks with it, and corner brackets stream
 * out from it while deploying and in toward it while packing. Drawing only.
 */

export type DeployIconMode = "deploy" | "pack";

/** One bracket wave crosses the badge in this long. */
export const DEPLOY_ICON_CYCLE_MS = 1100;
/** Bracket waves on screen at once, evenly staggered. */
const WAVES = 2;
/** Badge radius, screen px. */
export const DEPLOY_ICON_RADIUS = 14;

const AMBER = "#e8b84a";
const CREAM = "#fff6c8";

/**
 * Where each bracket wave sits, as a fraction of the badge's inner radius, and how
 * strongly it shows. Deploy waves travel outward, pack waves travel inward; each
 * fades in and out at the ends of its run so the loop has no seam.
 */
export function deployIconWaves(mode: DeployIconMode, nowMs: number): { reach: number; alpha: number }[] {
  const out: { reach: number; alpha: number }[] = [];
  for (let i = 0; i < WAVES; i++) {
    const t = ((((nowMs / DEPLOY_ICON_CYCLE_MS + i / WAVES) % 1) + 1) % 1);
    const run = mode === "deploy" ? t : 1 - t;
    out.push({ reach: 0.55 + 0.45 * run, alpha: Math.sin(Math.PI * t) });
  }
  return out;
}

/** The footprint diamond's size, 0–1 of the inner radius: the Rig's small box grows into the Core's yard, or back. */
export function deployIconCore(mode: DeployIconMode, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  const grown = mode === "deploy" ? p : 1 - p;
  return 0.25 + 0.25 * grown;
}

/** Screen px the badge floats up and down. */
export function deployIconBob(nowMs: number): number {
  return Math.sin(nowMs / 420) * 1.2;
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, hw: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - hw / 2);
  ctx.lineTo(x + hw, y);
  ctx.lineTo(x, y + hw / 2);
  ctx.lineTo(x - hw, y);
  ctx.closePath();
}

/** The four corners of a 2:1 diamond as short brackets, each arm a third of the side. */
function corners(ctx: CanvasRenderingContext2D, x: number, y: number, hw: number): void {
  const pts: [number, number][] = [
    [x, y - hw / 2],
    [x + hw, y],
    [x, y + hw / 2],
    [x - hw, y],
  ];
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const [vx, vy] = pts[i]!;
    const [ax, ay] = pts[(i + 3) % 4]!;
    const [bx, by] = pts[(i + 1) % 4]!;
    const k = 0.32;
    ctx.moveTo(vx + (ax - vx) * k, vy + (ay - vy) * k);
    ctx.lineTo(vx, vy);
    ctx.lineTo(vx + (bx - vx) * k, vy + (by - vy) * k);
  }
}

/** Draw the badge centred on (x, y). `progress` is the transform, 0–1. */
export function drawDeployIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { mode: DeployIconMode; progress: number; nowMs: number },
): void {
  const p = Math.max(0, Math.min(1, opts.progress));
  const r = DEPLOY_ICON_RADIUS;
  const cy = y + deployIconBob(opts.nowMs);
  const inner = r - 3;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(12, 10, 8, 0.85)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000";
  ctx.stroke();

  // The ring: a dim track, then the share done, clockwise from the top.
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(232, 184, 74, 0.22)";
  ctx.beginPath();
  ctx.arc(x, cy, r - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  if (p > 0) {
    ctx.strokeStyle = AMBER;
    ctx.beginPath();
    ctx.arc(x, cy, r - 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.stroke();
  }

  ctx.lineWidth = 1.3;
  ctx.strokeStyle = CREAM;
  for (const w of deployIconWaves(opts.mode, opts.nowMs)) {
    if (w.alpha <= 0.02) continue;
    ctx.globalAlpha = w.alpha * 0.9;
    corners(ctx, x, cy, inner * w.reach);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  diamond(ctx, x, cy, inner * deployIconCore(opts.mode, p));
  ctx.fillStyle = AMBER;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
  ctx.stroke();
  ctx.restore();
}
