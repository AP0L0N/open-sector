/**
 * Sim Unit blink flash. Client-only: a cyan burst where he left and where he
 * landed, and a streak between them that fades. The purge mark is the ring on a
 * host he is inside. Nothing here changes the match.
 */

/** How long a blink flash lasts, ms of game time. */
export const BLINK_FX_MS = 520;
/** How long the streak between the two ends shows, ms. Shorter than the bursts. */
export const BLINK_STREAK_MS = 260;

const CYAN = "120, 232, 255";

/** Strength of the flash: full at once, gone at BLINK_FX_MS. */
export function blinkFxAlpha(ageMs: number): number {
  if (ageMs < 0 || ageMs >= BLINK_FX_MS) return 0;
  const u = ageMs / BLINK_FX_MS;
  return 1 - u * u;
}

/** Radius of the burst ring at both ends, screen px, from the unit's draw size. */
export function blinkRingRadius(ageMs: number, size: number): number {
  const u = Math.max(0, Math.min(1, ageMs / BLINK_FX_MS));
  return size * (0.18 + 0.5 * u);
}

/** A blink into or out of a garrison host shows its inside end as a smaller spark. */
export function drawBlinkFx(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ageMs: number,
  size: number,
  inside?: boolean,
): void {
  const a = blinkFxAlpha(ageMs);
  if (a <= 0) return;
  ctx.save();
  ctx.lineCap = "round";
  if (ageMs < BLINK_STREAK_MS) {
    const s = 1 - ageMs / BLINK_STREAK_MS;
    ctx.strokeStyle = `rgba(${CYAN}, ${0.7 * s})`;
    ctx.lineWidth = 1.5 + 2 * s;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const r = blinkRingRadius(ageMs, size);
  for (const [p, scale] of [
    [from, inside ? 0.55 : 1],
    [to, 1],
  ] as const) {
    ctx.strokeStyle = `rgba(${CYAN}, ${0.9 * a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * scale, r * scale * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(230, 250, 255, ${0.8 * a * a})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size * 0.12 * scale, size * 0.06 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The host a Sim Unit is purging: a cyan ring filling with the share done. */
export function drawPurgeMark(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, u: number, nowMs: number): void {
  const pulse = 0.65 + 0.35 * Math.sin(nowMs / 90);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(${CYAN}, 0.35)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${CYAN}, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.5, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, u)));
  ctx.stroke();
  ctx.restore();
}
