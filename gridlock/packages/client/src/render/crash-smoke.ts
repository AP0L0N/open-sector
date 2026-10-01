/**
 * Smoke behind a plane that is falling. Client-only.
 * The trail is a thick black ribbon that hangs after the airframe has gone by.
 */

import { trailPuffs, type RocketPuff } from "./rocket-smoke.js";

/** World pixels between puffs. Dense enough to read as one column. */
export const CRASH_TRAIL_SPACING = 2.4;
/** Most puffs kept at once. The oldest go first. */
export const CRASH_PUFF_CAP = 900;

/**
 * Puffs along the stretch the airframe flew since the last frame.
 * Larger and darker than a rocket trail, and they hang longer.
 */
export function crashTrailPuffs(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  now: number,
  seed: number,
): RocketPuff[] {
  return trailPuffs(from, to, now, seed, CRASH_TRAIL_SPACING).map((p, i) => ({
    ...p,
    r0: 7 + (i % 3) * 1.4,
    r1: 26 + (i % 5) * 2.5,
    alpha: 0.78 + (i % 3) * 0.04,
    /** drawSoot treats shade near 1 as black. */
    shade: 0.94 + (i % 4) * 0.015,
    life: p.life * 1.7,
    rise: 7 + (i % 4) * 2,
    dx: p.dx * 0.6,
    dy: p.dy * 0.6,
  }));
}
