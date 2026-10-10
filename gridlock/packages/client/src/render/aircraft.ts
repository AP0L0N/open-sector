import { AIR_CRUISE_ALT, isoLift, staysAloft, type EntityView } from "@gridlock/shared";

/**
 * Planes in the air draw above every standing thing, at their height over
 * the ground. Their shadow stays on the ground under them.
 */
export const AIR_DRAW_LAYER = 3;

/** A plane's or a Jump Jet's height, or a paratrooper's under his canopy. 0 on the ground. */
function heightOf(e: Pick<EntityView, "air" | "jet" | "chute">): number {
  return e.air?.alt ?? e.jet?.alt ?? e.chute ?? 0;
}

/** Elevation units above the ground, eased between the last two snapshots. */
export function lerpAirAlt(prev: EntityView | undefined, curr: EntityView, t: number): number {
  const a = heightOf(curr);
  if (!prev || (prev.air == null && prev.jet == null && prev.chute == null)) return a;
  const b = heightOf(prev);
  const u = Math.max(0, Math.min(1, t));
  return b + (a - b) * u;
}

/** Seconds of one slow rise and fall of a hovering Xenite flier, and its height in screen pixels. */
export const HOVER_BOB_SECONDS = 1.8;
export const HOVER_BOB_PX = 1.6;

/**
 * Screen pixels a Xenite flier (staysAloft) bobs above its height while it hangs in the air:
 * a slow rise and fall, out of step between fliers. 0 for anything else, on the ground, or going down.
 */
export function hoverBobPx(e: Pick<EntityView, "type" | "id" | "air" | "wreck">, nowMs: number): number {
  if (!staysAloft(e.type) || e.wreck || !e.air || e.air.phase === "crash" || e.air.alt <= 0.5) return 0;
  // Fades in over the first cells of the climb, so it lifts off clean.
  const fade = Math.min(1, e.air.alt / 4);
  return Math.sin((nowMs / 1000 / HOVER_BOB_SECONDS) * Math.PI * 2 + e.id * 1.3) * HOVER_BOB_PX * fade;
}

/** Which wing stroke a Xenite insect shows now: its wings beat all the time, out of step between fliers. */
export function wingBeatFrame(id: number, fps: number, frames: number, nowMs: number): number {
  return Math.floor((nowMs / 1000) * fps + id * 1.37) % frames;
}

/** Turns a second of the Overseer's spinning hull. */
export const SAUCER_SPIN_PER_SEC = 0.5;

/** Radians the Overseer's hull has spun at this moment: it turns all the time, the way it flies or not. */
export function saucerSpin(id: number, nowMs: number): number {
  return ((nowMs / 1000) * SAUCER_SPIN_PER_SEC + id * 0.19) * Math.PI * 2;
}

/** Screen pixels a plane lifts off its ground point. */
export function airLiftPx(alt: number): number {
  return isoLift(alt);
}

export function inAir(e: Pick<EntityView, "air" | "jet" | "chute">): boolean {
  return heightOf(e) > 0.5;
}

/**
 * Shadow grows and fades as the plane climbs: sharp on the strip, a soft
 * smudge at cruise height.
 */
export function aircraftShadowScale(alt: number): { scale: number; alpha: number } {
  const u = Math.max(0, Math.min(1, alt / AIR_CRUISE_ALT));
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
