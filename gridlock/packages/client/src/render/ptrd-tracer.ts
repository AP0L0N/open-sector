/**
 * PTRD tracers. The AT soldier's 14.5 mm round carries a tracer. The round
 * resolves in the sim between snapshots, so the client only sees where it
 * ended (an impact). Every round is drawn as a streak from his muzzle to that
 * point, and the impact waits until the streak arrives.
 */
import type { CiwsTracer } from "./ciws-tracer.js";

/** World px a PTRD tracer covers per ms. A heavy rifle round, a touch slower on screen than a 20mm belt. */
export const PTRD_TRACER_PX_PER_MS = 1.6;
/** Shortest and longest flight of one streak, ms. */
export const PTRD_TRACER_MIN_MS = 60;
export const PTRD_TRACER_MAX_MS = 260;
/** Muzzle height by posture, as a share of the infantry sprite's draw size. */
export const PTRD_MUZZLE_LIFT = { stand: 0.42, crouch: 0.28, crawl: 0.08 } as const;

/** One streak per round, muzzle to where it ended. `groundZ` is the ground under the end. */
export function ptrdTracers(
  muzzle: { x: number; y: number; z: number },
  impacts: readonly { id: number; x: number; y: number }[],
  groundZ: (x: number, y: number) => number,
  now: number,
  tileSize: number,
): CiwsTracer[] {
  return [...impacts]
    .sort((a, b) => a.id - b.id)
    .map((i) => {
      const z1 = groundZ(i.x, i.y);
      // Height is in elevation units; a unit is about a quarter of a tile across.
      const d = Math.hypot(i.x - muzzle.x, i.y - muzzle.y, (z1 - muzzle.z) * tileSize * 0.25);
      return {
        id: i.id,
        x0: muzzle.x,
        y0: muzzle.y,
        x1: i.x,
        y1: i.y,
        z0: muzzle.z,
        z1,
        at: now,
        dur: Math.max(PTRD_TRACER_MIN_MS, Math.min(PTRD_TRACER_MAX_MS, d / PTRD_TRACER_PX_PER_MS)),
        wing: 1 as const,
      };
    });
}
