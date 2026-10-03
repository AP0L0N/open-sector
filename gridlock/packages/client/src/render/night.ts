/**
 * Night over the field, and the watch towers' lamp beams. Drawing only: the
 * sim decides what each side sees (shared/sim/night.ts); this just shades the
 * picture to match.
 */

/** Darkest shade of the night tint, at full dark. */
export const NIGHT_SHADE_MAX = 0.62;
export const NIGHT_RGB = "10, 16, 38";

/** Tint alpha for this much daylight (1 day, 0 night). */
export function nightShade(daylight: number): number {
  const d = Math.min(1, Math.max(0, daylight));
  return (1 - d) * NIGHT_SHADE_MAX;
}

/** How bright a lamp burns: off by day, warming up as the light fails. */
export function lampGlow(daylight: number): number {
  const d = Math.min(1, Math.max(0, daylight));
  return Math.min(1, Math.max(0, (0.65 - d) / 0.4));
}

/**
 * Shown lamp heading, eased toward the sim's so the beam sweeps between
 * snapshots instead of stepping. `maxStep` is radians allowed this frame.
 */
export function easeSpot(shown: number, target: number, maxStep: number): number {
  let delta = target - shown;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) <= maxStep) return target;
  return shown + Math.sign(delta) * maxStep;
}

/** World points of the beam on the ground: the lamp, then the far arc. */
export function beamPolygon(
  ox: number,
  oy: number,
  facing: number,
  reach: number,
  halfRad: number,
  steps = 12,
): { x: number; y: number }[] {
  const out = [{ x: ox, y: oy }];
  for (let i = 0; i <= steps; i++) {
    const a = facing - halfRad + (2 * halfRad * i) / steps;
    out.push({ x: ox + Math.cos(a) * reach, y: oy + Math.sin(a) * reach });
  }
  return out;
}
