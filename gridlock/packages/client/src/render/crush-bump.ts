/**
 * The Apocalypse riding over a hull it rolls flat, like a car over a speed bump:
 * the nose climbs onto the hulk, the hull rises, then the tail drops off it and
 * the whole tank settles with a small bounce.
 */
export const CRUSH_BUMP_MS = 560;
/** Peak rise as a fraction of the sprite's drawSize. */
export const CRUSH_BUMP_LIFT_FRAC = 0.07;
/** Peak pitch, radians: nose up going on, nose down coming off. */
export const CRUSH_BUMP_PITCH = 0.08;

/**
 * Screen pixels the hull rides up, and its pitch (positive: nose up), `now - at`
 * ms into the bump. Null once it has settled.
 */
export function crushBump(at: number, now: number, drawSize: number): { liftPx: number; pitch: number } | null {
  const age = now - at;
  if (age < 0 || age >= CRUSH_BUMP_MS) return null;
  const t = age / CRUSH_BUMP_MS;
  // Up and over in the first 80%, then a small dip and rebound as the springs catch it.
  const over = Math.min(1, t / 0.8);
  const settle = t > 0.8 ? (t - 0.8) / 0.2 : 0;
  const lift = Math.sin(Math.PI * over) - 0.18 * Math.sin(Math.PI * settle);
  const pitch = t < 0.8 ? Math.sin(2 * Math.PI * over) : 0;
  return { liftPx: drawSize * CRUSH_BUMP_LIFT_FRAC * lift, pitch: CRUSH_BUMP_PITCH * pitch };
}

/**
 * Canvas rotation for a pitch, given the hull's screen heading (`dirX`, `dirY`).
 * Nose up lifts the end the hull points at; head-on to the camera it shows no tilt.
 */
export function bumpTilt(pitch: number, dirX: number, dirY: number): number {
  const len = Math.hypot(dirX, dirY) || 1;
  return (-pitch * dirX) / len;
}
