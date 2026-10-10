import type { LampType } from "@gridlock/shared";

/**
 * Night over the field, and the lamps that cut it: tower spotlights, hull
 * headlights, and the slow work lights around a base. Drawing only: the sim
 * decides what each side sees (shared/sim/night.ts); this just shades the
 * picture to match.
 */

/** Darkest shade laid over everything at full dark. Ground out of sight darkens further through the fog. */
export const NIGHT_SHADE_MAX = 0.6;
export const NIGHT_RGB = "10, 16, 38";
/** Fog veil over ground out of sight, at full dark, and its colour. */
export const NIGHT_FOG_ALPHA = 0.86;
export const NIGHT_FOG_RGB: readonly [number, number, number] = [6, 9, 22];

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

/** Fog veil alpha and colour for this much daylight: the day veil, sliding to the night one. */
export function nightFog(
  daylight: number,
  dayAlpha: number,
  dayRgb: readonly [number, number, number],
): { alpha: number; rgb: [number, number, number] } {
  const k = 1 - Math.min(1, Math.max(0, daylight));
  const mix = (a: number, b: number): number => a + (b - a) * k;
  return {
    alpha: mix(dayAlpha, NIGHT_FOG_ALPHA),
    rgb: [mix(dayRgb[0], NIGHT_FOG_RGB[0]), mix(dayRgb[1], NIGHT_FOG_RGB[1]), mix(dayRgb[2], NIGHT_FOG_RGB[2])],
  };
}

/**
 * How much of a wreck shows for this much daylight and sight (0..1) at its
 * hull. By day it stays on the map; at night a hulk out of sight is lost in
 * the dark fog with the ground under it.
 */
export function wreckNightAlpha(daylight: number, sight: number): number {
  const dark = 1 - Math.min(1, Math.max(0, daylight));
  const hidden = 1 - Math.min(1, Math.max(0, sight));
  return 1 - dark * hidden;
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

/** One soft pool of light: `d` out along the beam, radius `r`, both in world px, and its strength 0–1. */
export type LightBlob = { d: number; r: number; a: number };

/**
 * A beam as a run of overlapping soft pools, so it has no hard edge. It
 * stays dark for the first `start` share of its reach, comes up quickly, and
 * then loses power steadily to nothing at `reach`. Pools widen with the cone,
 * a little past its edge, so the sides feather.
 */
export function beamBlobs(
  reach: number,
  halfRad: number,
  opts: { start?: number; count?: number; widen?: number; minR?: number } = {},
): LightBlob[] {
  const start = opts.start ?? 0.12;
  const count = Math.max(2, opts.count ?? 14);
  const widen = opts.widen ?? 1.35;
  const tan = Math.tan(halfRad);
  const out: LightBlob[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const t = start + (1 - start) * u;
    const d = reach * t;
    const rise = Math.min(1, u / 0.18);
    const fall = Math.pow(1 - u, 1.3);
    const minR = opts.minR ?? reach * 0.05;
    out.push({ d, r: Math.max(minR, d * tan * widen), a: rise * fall });
  }
  return out;
}

/**
 * Lamp light stacks, but not without end. Up to the knee (about one tower
 * beam at its brightest) it adds as it falls; past it each extra lamp adds
 * less, and the sum never passes the ceiling, so a column of hulls at night
 * still shows the ground under it.
 */
export const LIGHT_STACK_KNEE = 0.4;
export const LIGHT_STACK_MAX = 0.6;
/** The light layer stores sums at this fraction, so stacks past 1 are still told apart. */
export const LIGHT_HEADROOM = 3;
/** The light layer is drawn at this fraction of the screen. It is all soft gradients. */
export const LIGHT_LAYER_SCALE = 4;

/** Warm light alpha shown for this much stacked lamp light. */
export function stackedLight(sum: number): number {
  if (sum <= LIGHT_STACK_KNEE) return Math.max(0, sum);
  const room = LIGHT_STACK_MAX - LIGHT_STACK_KNEE;
  return LIGHT_STACK_KNEE + room * (1 - Math.exp(-(sum - LIGHT_STACK_KNEE) / room));
}

/**
 * Near disc of a hull beam, against the old bulb size. The bright point that
 * used to sit on the lamp itself is not drawn. The beam past this disc is unchanged.
 */
export const LAMP_BULB_SCALE = 0.7;

/**
 * A small pool just behind a missile, opposite its travel. Short and dim:
 * a hint of the motor on the ground, not a lamp.
 */
export function missileSpot(
  x: number,
  y: number,
  vx: number,
  vy: number,
  tile: number,
): { x: number; y: number; r: number; a: number } {
  const sp = Math.hypot(vx, vy) || 1;
  const back = tile * 0.7;
  return {
    x: x - (vx / sp) * back,
    y: y - (vy / sp) * back,
    r: tile * 1.15,
    a: 0.22,
  };
}

/** Slow work lights around a structure: how many, by footprint. */
export function workLightCount(tileW: number, tileH: number, subdiv: number): number {
  return Math.max(tileW, tileH) >= 3 * subdiv ? 3 : 2;
}

/** Radians a second a work light drifts round its structure. Deliberately slow. */
export const WORK_LIGHT_TURN = 0.05;

/**
 * Bearing of each work light at `nowSec`. Each lamp drifts back and forth over
 * its own arc of the yard, so neighbours never sweep in step.
 */
export function workLightBearings(id: number, count: number, nowSec: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < count; k++) {
    const base = ((id * 2.399 + (k * Math.PI * 2) / count) % (Math.PI * 2));
    const phase = id * 1.7 + k * 2.1;
    const swing = (0.9 * Math.PI) / count;
    out.push(base + swing * Math.sin(nowSec * WORK_LIGHT_TURN * (1 + 0.15 * k) + phase));
  }
  return out;
}

/** A map's street lamp: how it draws, how far its pool reaches, and its light. */
export interface StreetLampSpec {
  /** Post height on screen at zoom 1, px. */
  drawH: number;
  /** Pool radius, fine tiles. */
  reachTiles: number;
  /** Light colour of the pool and the bulb. */
  rgb: string;
  /** Bulb halo radius on screen at zoom 1, px. */
  halo: number;
  /** Share of the night tint its pool lifts, and how much it warms the ground. */
  cut: number;
  warm: number;
  /**
   * An aimed lamp: its light is a beam `reachTiles` long and `halfDeg` either
   * side of where it points, plus a small spill round the foot. Absent, the
   * pool lies all round the post.
   */
  beam?: { halfDeg: number; spillTiles: number };
}

export const STREET_LAMPS: Record<LampType, StreetLampSpec> = {
  gaslamp: { drawH: 30, reachTiles: 5, rgb: "255, 184, 102", halo: 9, cut: 0.72, warm: 0.3 },
  streetlamp: { drawH: 42, reachTiles: 7, rgb: "255, 206, 136", halo: 12, cut: 0.78, warm: 0.26 },
  floodlight: { drawH: 50, reachTiles: 10, rgb: "222, 234, 255", halo: 15, cut: 0.85, warm: 0.18 },
  twinlamp: { drawH: 43, reachTiles: 8, rgb: "255, 222, 170", halo: 10, cut: 0.8, warm: 0.24 },
  sodium: { drawH: 47, reachTiles: 8, rgb: "255, 168, 70", halo: 12, cut: 0.8, warm: 0.36 },
  spotpole: { drawH: 44, reachTiles: 16, rgb: "232, 240, 255", halo: 12, cut: 0.85, warm: 0.16, beam: { halfDeg: 13, spillTiles: 1.5 } },
  yardflood: { drawH: 31, reachTiles: 9, rgb: "255, 236, 200", halo: 11, cut: 0.82, warm: 0.22, beam: { halfDeg: 36, spillTiles: 1.5 } },
};

/**
 * An aimed street lamp's light on the ground in world px: a dim spill round
 * the foot, then a beam out along `facing` (radians), as a tower's spotlight lays it.
 */
export function aimedLampGround(spec: StreetLampSpec, x: number, y: number, facing: number, tile: number): { x: number; y: number; r: number; a: number }[] {
  const beam = spec.beam!;
  const out = [{ x, y, r: beam.spillTiles * tile, a: 0.55 }];
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  for (const b of beamBlobs(spec.reachTiles * tile, (beam.halfDeg * Math.PI) / 180, { start: 0.08, count: 18, widen: 1.15 })) {
    out.push({ x: x + c * b.d, y: y + s * b.d, r: b.r, a: b.a });
  }
  return out;
}

/**
 * How bright a street lamp burns this instant, 0..1 of full. A gas mantle
 * breathes a little, each post on its own beat; electric lamps hold steady.
 */
export function streetLampFlicker(type: LampType, x: number, y: number, nowSec: number): number {
  if (type !== "gaslamp") return 1;
  const phase = (x * 12.9898 + y * 78.233) % (Math.PI * 2);
  const slow = Math.sin(nowSec * 2.3 + phase);
  const quick = Math.sin(nowSec * 7.1 + phase * 3.1);
  return 0.9 + 0.06 * slow + 0.04 * quick;
}

/**
 * A tower spotlight's light on the ground in world px: soft blobs from the
 * tower out along `facing`, as the battlefield lays a manned tower's beam.
 */
export function spotBeamGround(
  x: number,
  y: number,
  facing: number,
  reach: number,
  halfRad: number,
): { x: number; y: number; r: number; a: number }[] {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  return beamBlobs(reach, halfRad, { count: 24, widen: 1.15 }).map((b) => ({ x: x + c * b.d, y: y + s * b.d, r: b.r, a: b.a }));
}

/** The xenomorphs' own light: a cold blue glow off every live Borg unit and structure, in place of lamps. */
export const XENO_GLOW_RGB = "70, 140, 255";
/** Glow radius against a unit's body radius, and against half a structure's footprint. */
export const XENO_GLOW_UNIT_SCALE = 3.5;
export const XENO_GLOW_BUILDING_SCALE = 2;

/**
 * Radius of a Borg glow on the ground, world px, by the size of what gives it
 * off: a unit by its body radius, a structure by its footprint (fine tiles of
 * `tile` px). Never smaller than one fine tile.
 */
export function xenoGlowRadius(
  e: { kind: string; tileW: number; tileH: number },
  unitRadius: number,
  tile: number,
): number {
  const r =
    e.kind === "building"
      ? (Math.max(e.tileW, e.tileH) * tile * XENO_GLOW_BUILDING_SCALE) / 2
      : unitRadius * XENO_GLOW_UNIT_SCALE;
  return Math.max(tile, r);
}

/** A slow breath on the glow, 0.88..1, each one on its own beat. */
export function xenoGlowPulse(id: number, nowSec: number): number {
  return 0.94 + 0.06 * Math.sin(nowSec * 1.3 + (id % 4096) * 0.61);
}
