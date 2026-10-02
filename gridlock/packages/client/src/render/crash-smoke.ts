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

/** World pixels between puffs. Wide enough to read as a short trail, not a column. */
export const CHARGE_TRAIL_SPACING = 8;
/** How long one puff of the walker's charge hangs, ms. */
export const CHARGE_TRAIL_MS = 1000;
/** Most charge puffs kept at once. */
export const CHARGE_PUFF_CAP = 240;

/**
 * Dark exhaust behind a Walker who is charging to detonate.
 * Shorter and thinner than a falling plane's column.
 */
export function chargeTrailPuffs(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  now: number,
  seed: number,
): RocketPuff[] {
  return trailPuffs(from, to, now, seed, CHARGE_TRAIL_SPACING).map((p, i) => ({
    ...p,
    r0: 2.4 + (i % 3) * 0.6,
    r1: 8 + (i % 4) * 1.2,
    alpha: 0.72,
    shade: 0.96,
    life: CHARGE_TRAIL_MS * (0.85 + (i % 3) * 0.08),
    rise: 12 + (i % 3) * 3,
    dx: p.dx * 0.35,
    dy: p.dy * 0.35,
  }));
}

/** Same remainder rule as a crash column, on the wider charge spacing. */
export function layChargeTrail(
  last: { x: number; y: number; z: number } | undefined,
  head: { x: number; y: number; z: number },
  now: number,
  seed: number,
): { from: { x: number; y: number; z: number }; puffs: RocketPuff[] } {
  const from = last ?? head;
  const puffs = chargeTrailPuffs(from, head, now, seed);
  return { from: puffs.length > 0 ? head : from, puffs };
}

/**
 * Puffs for one frame of the fall. A step shorter than the spacing is kept
 * on `from`, so the next frame can finish it. Dropping that remainder made
 * the column appear at the first long step and then go thin.
 */
export function layCrashTrail(
  last: { x: number; y: number; z: number } | undefined,
  head: { x: number; y: number; z: number },
  now: number,
  seed: number,
): { from: { x: number; y: number; z: number }; puffs: RocketPuff[] } {
  const from = last ?? head;
  const puffs = crashTrailPuffs(from, head, now, seed);
  return { from: puffs.length > 0 ? head : from, puffs };
}
