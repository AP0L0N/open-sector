/**
 * Cyborg link effects: a shut-down Cyborg's dead look, and the uplink a Cyborg
 * Commander throws to take one over. Drawing only; the sim decides who owns him.
 */

/** A shut-down Cyborg: greyer and darker than a map's neutral unit, the machine plainly off. */
export const SHUTDOWN_UNIT_FILTER = "grayscale(1) brightness(0.58) contrast(1.1)";

/** 0–1 hash of a seed and a slot, for steady per-unit jitter. */
function hash(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Over a shut-down Cyborg: now and then a short spark off his dead frame. No glow:
 * the machine is off. (x, y) is his foot point on screen; `size` the sheet size.
 */
export function drawShutdownMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, nowMs: number, seed: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // A spark every couple of seconds, a different spot each time.
  const period = 2300 + hash(seed, 1) * 900;
  const cycle = Math.floor((nowMs + hash(seed, 2) * period) / period);
  const t = ((nowMs + hash(seed, 2) * period) % period) / period;
  if (t < 0.09) {
    const a = 1 - t / 0.09;
    const sx = x + (hash(seed, cycle) - 0.5) * size * 0.4;
    const sy = y - size * (0.2 + hash(seed, cycle + 7) * 0.35);
    ctx.strokeStyle = `rgba(150, 220, 255, ${0.9 * a})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = 1; i <= 3; i++) {
      ctx.lineTo(sx + (hash(seed, cycle * 3 + i) - 0.5) * size * 0.22, sy - i * size * 0.05);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The Commander's uplink: a thin cyan carrier wave from him to the Cyborg, pulses
 * running down it, and a ring round the Cyborg that closes as the takeover runs (`u` 0–1).
 */
export function drawUplink(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  u: number,
  ringR: number,
  nowMs: number,
  seed: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = Math.max(8, Math.round(len / 6));
  const wave = (k: number): { x: number; y: number } => {
    const f = k / steps;
    // Still at both ends, a travelling ripple between.
    const amp = Math.sin(f * Math.PI) * 2.2;
    const off = Math.sin(f * len * 0.18 - nowMs * 0.012 + seed) * amp;
    return { x: from.x + dx * f + nx * off, y: from.y + dy * f + ny * off };
  };
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [w, c] of [
    [5, "rgba(60, 190, 255, 0.16)"],
    [2.2, "rgba(110, 225, 255, 0.5)"],
    [0.9, "rgba(220, 250, 255, 0.85)"],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const pt = wave(k);
      if (k === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }
  // Data pulses running out to the Cyborg.
  for (let i = 0; i < 3; i++) {
    const f = ((nowMs * 0.0009 + i / 3) % 1 + 1) % 1;
    const pt = wave(f * steps);
    ctx.fillStyle = "rgba(200, 245, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Progress ring: flattened to the ground, closing clockwise from the top.
  const share = Math.max(0, Math.min(1, u));
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(90, 210, 255, 0.25)";
  ctx.beginPath();
  ctx.ellipse(to.x, to.y, ringR, ringR * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (share > 0) {
    ctx.strokeStyle = "rgba(150, 235, 255, 0.95)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(to.x, to.y, ringR, ringR * 0.5, 0, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
