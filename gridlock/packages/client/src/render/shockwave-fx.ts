/**
 * A downed Mothership's shockwave (sim/mothership.ts mothershipShockwave): a white-blue flash at
 * ground zero, then a bright ring racing out over the ground to the blast's reach, with a ring of
 * dust thrown up behind it, all fading as it goes. Drawing only; the sim decides who is hurt.
 */

/** How long the whole shockwave shows, ms. */
export const SHOCKWAVE_FX_MS = 1500;
/** How long the ring takes to reach the edge, ms. */
const RING_MS = 900;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

/** The ring's reach, as a share of the blast's, `age` ms in. */
export function shockwaveReach(age: number): number {
  return easeOut(clamp01(age / RING_MS));
}

/**
 * The shockwave on screen: `c` is ground zero, `rx`/`ry` the half axes of the blast's full reach
 * on the ground (2:1 iso ellipse), `age` ms since it went off.
 */
export function drawShockwave(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, rx: number, ry: number, age: number): void {
  if (age < 0 || age > SHOCKWAVE_FX_MS || rx <= 0) return;
  const k = shockwaveReach(age);
  const fade = 1 - clamp01(age / SHOCKWAVE_FX_MS);
  ctx.save();
  // The flash at ground zero, gone in the first third.
  const flash = 1 - clamp01(age / (SHOCKWAVE_FX_MS * 0.3));
  if (flash > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.55);
    g.addColorStop(0, `rgba(240, 250, 255, ${0.85 * flash})`);
    g.addColorStop(0.4, `rgba(160, 215, 255, ${0.45 * flash})`);
    g.addColorStop(1, "rgba(120, 190, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Dust thrown up just behind the front.
  ctx.globalCompositeOperation = "source-over";
  const dust = Math.max(0, k - 0.08);
  ctx.lineWidth = Math.max(4, rx * 0.12);
  ctx.strokeStyle = `rgba(110, 92, 70, ${0.35 * fade})`;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, Math.max(1, rx * dust), Math.max(0.5, ry * dust), 0, 0, Math.PI * 2);
  ctx.stroke();
  // The front itself: a bright ring.
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = Math.max(3, rx * 0.05);
  ctx.strokeStyle = `rgba(215, 240, 255, ${0.95 * fade})`;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, Math.max(1, rx * k), Math.max(0.5, ry * k), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(4, rx * 0.09);
  ctx.strokeStyle = `rgba(120, 190, 255, ${0.4 * fade})`;
  ctx.stroke();
  ctx.restore();
}
