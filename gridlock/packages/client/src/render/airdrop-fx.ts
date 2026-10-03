/**
 * What a transport leaves behind: parachute canopies over jumpers and crates,
 * mines on the ground, and supply crates. Pure canvas drawing; the
 * sim decides where each one is.
 */

const OUTLINE = "#1a1410";

/**
 * Canopy over a load hanging at (x, y) on screen — a soldier's shoulders or
 * a crate's lid. `span` is the canopy width in px; `sway` (radians) tilts it
 * a little so a stick of canopies does not look stamped.
 */
export function drawCanopy(ctx: CanvasRenderingContext2D, x: number, y: number, span: number, sway: number, tint = "#d8d2bc"): void {
  const rise = span * 0.7;
  const cx = x + Math.sin(sway) * rise;
  const cy = y - Math.cos(sway) * rise;
  const half = span / 2;
  ctx.save();
  // Rigging lines from the canopy skirt down to the harness.
  ctx.strokeStyle = "rgba(40, 34, 28, 0.95)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const k of [-1, -0.35, 0.35, 1]) {
    ctx.moveTo(cx + k * half, cy + span * 0.08);
    ctx.lineTo(x + k * 1.2, y);
  }
  ctx.stroke();
  ctx.translate(cx, cy);
  ctx.rotate(sway);
  ctx.fillStyle = tint;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-half, span * 0.08);
  ctx.bezierCurveTo(-half, -span * 0.42, half, -span * 0.42, half, span * 0.08);
  // Scalloped skirt.
  const gores = 5;
  for (let i = gores; i > 0; i--) {
    const a = -half + ((i - 0.5) / gores) * span;
    const b = -half + ((i - 1) / gores) * span;
    ctx.quadraticCurveTo(a, -span * 0.02, b, span * 0.08);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Gore seams and a shaded half so it reads round.
  ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
  ctx.beginPath();
  ctx.moveTo(0, -span * 0.3);
  ctx.bezierCurveTo(half * 0.9, -span * 0.3, half, -span * 0.1, half, span * 0.08);
  ctx.lineTo(0, span * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 34, 28, 0.35)";
  ctx.beginPath();
  for (const k of [-0.5, 0, 0.5]) {
    ctx.moveTo(k * half * 0.4, -span * 0.31);
    ctx.lineTo(k * half, span * 0.06);
  }
  ctx.stroke();
  ctx.restore();
}

/** Small sideways swing for a canopy: seeded by its id, slow in time. */
export function canopySway(id: number, nowMs: number): number {
  return Math.sin(nowMs / 700 + id * 1.7) * 0.12;
}

/** How often a live friendly mine's lamp comes on, and how long that blink lasts. */
const MINE_LAMP_PERIOD_MS = 1600;
const MINE_LAMP_WINDOW_MS = 220;

/**
 * 0–1 brightness of a mine's red lamp. Dark while it is still arming, then a
 * short pulse and a long dark. Seeded so a scattered field does not blink as one.
 */
export function mineLamp(seed: number, nowMs: number, arming: boolean): number {
  if (arming) return 0;
  const period = MINE_LAMP_PERIOD_MS;
  const phase = ((nowMs + seed * 173) % period + period) % period;
  if (phase >= MINE_LAMP_WINDOW_MS) return 0;
  return Math.sin((phase / MINE_LAMP_WINDOW_MS) * Math.PI);
}

/**
 * A mine on the ground: a small dark speck. Once it is live, a faint red lamp
 * blinks on it. The enemy is not sent the mine, so this is only drawn for you
 * and your allies. `disarm` 0–1 is the bar while a supply truck is lifting it.
 */
export function drawMine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { seed: number; arming: boolean; nowMs: number; disarm?: number },
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#2c2822";
  ctx.beginPath();
  ctx.ellipse(0, 0.4, 1.7, 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  const lamp = mineLamp(opts.seed, opts.nowMs, opts.arming);
  if (lamp > 0.02) {
    ctx.fillStyle = `rgba(170, 28, 22, ${(0.14 * lamp).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, -0.2, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(214, 46, 34, ${(0.32 + 0.48 * lamp).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, -0.2, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const p = opts.disarm;
  if (p != null && p > 0) {
    const w = 10;
    const h = 2;
    const top = y - 7;
    ctx.fillStyle = "rgba(8, 6, 4, 0.78)";
    ctx.fillRect(x - w / 2, top, w, h);
    ctx.fillStyle = "#e8b84a";
    ctx.fillRect(x - w / 2, top, w * Math.max(0, Math.min(1, p)), h);
  }
}

/**
 * Wooden supply crate, iso box with a painted band in the dropping side's
 * color. `left` 0–1 is what is still in it; the lid sits lower as it empties.
 */
export function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, band: string, left = 1): void {
  const w = size;
  const d = size * 0.5;
  const h = size * (0.45 + 0.25 * Math.max(0, Math.min(1, left)));
  ctx.save();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  // Left face
  ctx.fillStyle = "#7a5a34";
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - d / 2);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x - w / 2, y - d / 2 - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Right face
  ctx.fillStyle = "#5e4428";
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y - d / 2);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w / 2, y - d / 2 - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Lid
  ctx.fillStyle = "#9a764a";
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w / 2, y - d / 2 - h);
  ctx.lineTo(x, y - d - h);
  ctx.lineTo(x - w / 2, y - d / 2 - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Painted band round the middle, and a slat line on the lid.
  ctx.strokeStyle = band;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - d / 2 - h * 0.5);
  ctx.lineTo(x, y - h * 0.5);
  ctx.lineTo(x + w / 2, y - d / 2 - h * 0.5);
  ctx.stroke();
  ctx.strokeStyle = "rgba(26, 20, 16, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - w / 4, y - d * 0.75 - h);
  ctx.lineTo(x + w / 4, y - d * 0.25 - h);
  ctx.stroke();
  ctx.restore();
}

/** Canopy span for a soldier drawn `drawSize` px tall. */
export function troopCanopySpan(drawSize: number): number {
  return Math.max(14, drawSize * 0.55);
}
