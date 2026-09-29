/**
 * Fw 190 barrage tracers. The sim resolves a barrage in one tick, so the
 * rounds never show up in a snapshot. The client draws each one as a streak
 * from its wing gun to where it landed, the near rounds first, and holds the
 * impact until its streak arrives: two lines of hits walking up to and
 * through the target.
 */

export interface BarrageTracer {
  id: number;
  /** Wing gun, world pixels. */
  x0: number;
  y0: number;
  /** Where the round came down (or met a plane), world pixels. */
  x1: number;
  y1: number;
  /** Wall-clock ms the streak leaves the gun. */
  at: number;
  /** Ms from the gun to the impact. */
  dur: number;
  /** Which wing: +1 left of the line of fire, -1 right. */
  wing: 1 | -1;
}

/** Ms from the first round of a barrage to the last leaving the guns. */
export const BARRAGE_SPREAD_MS = 260;
/** Ms a streak takes from the gun to its impact. */
export const TRACER_FLIGHT_MS = 110;
/** Share of the gun-to-impact path the glowing streak covers. */
export const TRACER_TAIL = 0.35;

/**
 * One streak per impact. `gap` is how far out each wing gun sits from the
 * plane's centerline, in world pixels. Rounds are sent in order of distance,
 * over BARRAGE_SPREAD_MS.
 */
export function barrageTracers(
  plane: { x: number; y: number },
  impacts: readonly { id: number; x: number; y: number }[],
  gap: number,
  now: number,
): BarrageTracer[] {
  if (impacts.length === 0) return [];
  const cx = impacts.reduce((s, i) => s + i.x, 0) / impacts.length;
  const cy = impacts.reduce((s, i) => s + i.y, 0) / impacts.length;
  const d = Math.hypot(cx - plane.x, cy - plane.y) || 1;
  const ux = (cx - plane.x) / d;
  const uy = (cy - plane.y) / d;
  const along = impacts.map((i) => (i.x - plane.x) * ux + (i.y - plane.y) * uy);
  const near = Math.min(...along);
  const far = Math.max(...along);
  const span = Math.max(1, far - near);
  return impacts.map((i, k) => {
    const wing: 1 | -1 = (i.x - plane.x) * -uy + (i.y - plane.y) * ux >= 0 ? 1 : -1;
    return {
      id: i.id,
      x0: plane.x - uy * gap * wing,
      y0: plane.y + ux * gap * wing,
      x1: i.x,
      y1: i.y,
      at: now + ((along[k]! - near) / span) * BARRAGE_SPREAD_MS,
      dur: TRACER_FLIGHT_MS,
      wing,
    };
  });
}

/** Ms after `now` the impact should appear: when its streak lands. */
export function tracerLandsAt(t: BarrageTracer): number {
  return t.at + t.dur;
}

/**
 * Head and tail of the streak along gun→impact, 0 at the gun and 1 at the
 * impact. Null before it leaves the gun and once it has landed.
 */
export function tracerSpan(t: BarrageTracer, now: number): { head: number; tail: number } | null {
  const u = (now - t.at) / t.dur;
  if (u < 0 || u > 1) return null;
  return { head: u, tail: Math.max(0, u - TRACER_TAIL) };
}
