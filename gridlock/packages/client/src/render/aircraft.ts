import { isoLift, type EntityView } from "@gridlock/shared";

/**
 * Planes in the air draw above every standing thing, at their height over
 * the ground. Their shadow stays on the ground under them.
 */
export const AIR_DRAW_LAYER = 3;

/** Elevation units above the ground, eased between the last two snapshots. */
export function lerpAirAlt(prev: EntityView | undefined, curr: EntityView, t: number): number {
  const a = curr.air?.alt ?? 0;
  const b = prev?.air?.alt;
  if (b == null) return a;
  const u = Math.max(0, Math.min(1, t));
  return b + (a - b) * u;
}

/** Screen pixels a plane lifts off its ground point. */
export function airLiftPx(alt: number): number {
  return isoLift(alt);
}

export function inAir(e: Pick<EntityView, "air">): boolean {
  return (e.air?.alt ?? 0) > 0.5;
}

/**
 * Shadow grows and fades as the plane climbs: sharp on the strip, a soft
 * smudge at cruise height.
 */
export function aircraftShadowScale(alt: number): { scale: number; alpha: number } {
  const u = Math.max(0, Math.min(1, alt / 16));
  return { scale: 1.4 + 0.3 * u, alpha: 1 - 0.55 * u };
}

/** Tail-first SC 250 falling from a plane. `x, y` is its screen point. */
export function drawFallingBomb(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number): void {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(uy, ux));
  ctx.fillStyle = "#3d4034";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-4.5, 0);
  ctx.lineTo(-7, -2.2);
  ctx.lineTo(-7, 2.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
