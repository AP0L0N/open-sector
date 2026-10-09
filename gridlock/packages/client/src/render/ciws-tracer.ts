/**
 * CIWS tracers. A 20mm round lives less than a tick, so it never shows up in a
 * snapshot; only its end does (an impact). The client draws every
 * CIWS_TRACER_EVERY-th round as a streak from the barrels to where it ended,
 * spread over the snapshot gap so the belt reads as a stream, not a volley.
 * Rounds fired at a plane end in the sky (`airZ`), so a miss climbs past it.
 * A burst at a rocket fires no rounds the sim keeps; it gets a short fan of
 * streaks along the gun's bearing instead.
 */
import type { BarrageTracer } from "./barrage-tracer.js";

/** One round in this many carries a tracer. The rest are plain ball: no streak. */
export const CIWS_TRACER_EVERY = 9;
/** Ms the rounds of one snapshot are spread over. One sim tick at normal speed. */
export const CIWS_STREAM_MS = 100;
/** World px a tracer covers per ms. Fast, but slow enough to see. */
export const CIWS_TRACER_PX_PER_MS = 2.2;
/** Shortest and longest flight of one streak, ms. */
export const CIWS_TRACER_MIN_MS = 40;
export const CIWS_TRACER_MAX_MS = 180;
/** Streaks in a burst at a rocket. One, like the belt: a tracer in nine. */
export const CIWS_BURST_TRACERS = 1;
/** Degrees the burst streaks fan either side of the bearing. */
export const CIWS_BURST_FAN_DEG = 6;

export interface CiwsTracer extends BarrageTracer {
  /** Elevation units at the barrels and at the end. */
  z0: number;
  z1: number;
}

/** True when this round carries a tracer. Keyed on the impact id, so both clients pick the same rounds. */
export function isTracerRound(id: number): boolean {
  return ((id % CIWS_TRACER_EVERY) + CIWS_TRACER_EVERY) % CIWS_TRACER_EVERY === 0;
}

function flightMs(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tileSize: number): number {
  // Height is in elevation units; a unit is about a quarter of a tile across.
  const d = Math.hypot(x1 - x0, y1 - y0, (z1 - z0) * tileSize * 0.25);
  return Math.max(CIWS_TRACER_MIN_MS, Math.min(CIWS_TRACER_MAX_MS, d / CIWS_TRACER_PX_PER_MS));
}

/**
 * Streaks for one mount's rounds this snapshot. `groundZ` is the ground under a
 * round that came down; `airZ` on the impact wins when the round ended aloft.
 */
export function ciwsTracers(
  muzzle: { x: number; y: number; z: number },
  impacts: readonly { id: number; x: number; y: number; airZ?: number }[],
  groundZ: (x: number, y: number) => number,
  now: number,
  tileSize: number,
): CiwsTracer[] {
  const rounds = [...impacts].sort((a, b) => a.id - b.id);
  const out: CiwsTracer[] = [];
  rounds.forEach((i, k) => {
    if (!isTracerRound(i.id)) return;
    const z1 = i.airZ ?? groundZ(i.x, i.y);
    out.push({
      id: i.id,
      x0: muzzle.x,
      y0: muzzle.y,
      x1: i.x,
      y1: i.y,
      z0: muzzle.z,
      z1,
      at: now + (k / Math.max(1, rounds.length)) * CIWS_STREAM_MS,
      dur: flightMs(muzzle.x, muzzle.y, muzzle.z, i.x, i.y, z1, tileSize),
      wing: 1,
    });
  });
  return out;
}

/** A short fan along the gun's bearing: the burst it spends on a rocket. `seed` varies the fan per burst. */
export function ciwsBurstTracers(
  muzzle: { x: number; y: number; z: number },
  facing: number,
  reach: number,
  climb: number,
  now: number,
  seed: number,
  tileSize: number,
): CiwsTracer[] {
  const out: CiwsTracer[] = [];
  for (let k = 0; k < CIWS_BURST_TRACERS; k++) {
    const r = Math.sin((seed + k * 7.31) * 12.9898) * 43758.5453;
    const u = r - Math.floor(r);
    const ang = facing + ((u * 2 - 1) * CIWS_BURST_FAN_DEG * Math.PI) / 180;
    const x1 = muzzle.x + Math.cos(ang) * reach;
    const y1 = muzzle.y + Math.sin(ang) * reach;
    const z1 = muzzle.z + climb * (0.6 + 0.8 * u);
    out.push({
      id: -1,
      x0: muzzle.x,
      y0: muzzle.y,
      x1,
      y1,
      z0: muzzle.z,
      z1,
      at: now + (k / CIWS_BURST_TRACERS) * CIWS_STREAM_MS,
      dur: flightMs(muzzle.x, muzzle.y, muzzle.z, x1, y1, z1, tileSize),
      wing: 1,
    });
  }
  return out;
}
