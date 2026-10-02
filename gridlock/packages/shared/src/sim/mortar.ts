import {
  MORTAR_LOB,
  ROCKET_TRACK_CHANCE,
  TILE_SIZE,
  TITAN_ROCKET_RACK,
  type LobShellDef,
  type RocketRackDef,
} from "../catalog.js";
import type { ArmorFace } from "./ballistics.js";

function clamp01(u: number): number {
  return Math.min(1, Math.max(0, u));
}

/** Ground miss radius. Grows with range. `mul` is target posture and movement. */
export function mortarScatterRadius(dist: number, maxRange: number, mul = 1, lob: LobShellDef = MORTAR_LOB): number {
  const near = lob.scatterNearTiles * TILE_SIZE;
  const far = lob.scatterFarTiles * TILE_SIZE;
  const u = clamp01(dist / Math.max(1, maxRange));
  return (near + (far - near) * u) * Math.max(0.2, mul);
}

/** Uniform disk around the aim point. */
export function mortarLanding(
  aimX: number,
  aimY: number,
  radius: number,
  rand: () => number,
): { x: number; y: number } {
  const ang = rand() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, rand())) * Math.max(0, radius);
  return { x: aimX + Math.cos(ang) * r, y: aimY + Math.sin(ang) * r };
}

/** Seconds in the air. Long shots hang longer so the arc can be seen. */
export function mortarFlightSeconds(dist: number, maxRange: number, lob: LobShellDef = MORTAR_LOB): number {
  const u = clamp01(dist / Math.max(1, maxRange));
  return lob.flightNear + (lob.flightFar - lob.flightNear) * u;
}

/** Peak air height in elevation units. Short shots still go mostly up. */
export function mortarApex(dist: number, maxRange: number, lob: LobShellDef = MORTAR_LOB): number {
  const u = clamp01(dist / Math.max(1, maxRange));
  return lob.apexNear + (lob.apexFar - lob.apexNear) * u;
}

/** Parabola. 0 at the tube and at the ground, `apex` at the middle. */
export function mortarAirZ(u: number, apex: number): number {
  const t = clamp01(u);
  return 4 * apex * t * (1 - t);
}

export interface MortarArcPoint {
  x: number;
  y: number;
  /** Air height in elevation units. */
  z: number;
  /** 0 at the tube, 1 at the ground. */
  u: number;
}

/**
 * World samples from the tube up to the bomb.
 * `arc` is how far the bomb has flown (0–1). Velocity is constant.
 */
export function mortarArcPoints(opts: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  apex: number;
  arc: number;
  hang: number;
  steps: number;
}): MortarArcPoint[] {
  const u = clamp01(opts.arc);
  const hang = Math.max(0.05, opts.hang);
  const n = Math.max(2, Math.floor(opts.steps));
  const pts: MortarArcPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const s = (u * i) / n;
    const back = (u - s) * hang;
    pts.push({
      x: opts.x - opts.vx * back,
      y: opts.y - opts.vy * back,
      z: mortarAirZ(s, opts.apex),
      u: s,
    });
  }
  return pts;
}

/**
 * Share of blast damage at `dist` from the impact.
 * Center is full. The rim still wounds.
 */
export function mortarFalloff(dist: number, radius: number): number {
  if (radius <= 1e-6) return 1;
  const u = clamp01(dist / radius);
  return 0.35 + 0.65 * (1 - u);
}

/**
 * Nick an armored hull. `falloff` is mortarFalloff at the hull center.
 * A tracked tank rolls the lob's track chance on top of the nick.
 */
export function mortarArmorNick(
  hpMax: number,
  falloff: number,
  tracked: boolean,
  rand: () => number,
  lob: LobShellDef = MORTAR_LOB,
): { damage: number; throwTrack: boolean } {
  const span = 0.75 + rand() * 0.5;
  const damage = Math.max(1, Math.round(hpMax * lob.armorChip * Math.max(0, falloff) * span));
  const throwTrack = tracked && rand() < lob.trackChance;
  return { damage, throwTrack };
}

/**
 * Rocket miss radius. At full attack range the disk is the rack's far scatter.
 * Inside that reach it tightens toward the near radius with the square of the
 * range fraction, so a shot at half the reach is already close to point-blank
 * and only the long shot keeps the wide disk.
 */
export function rocketScatterRadius(
  dist: number,
  maxRange: number,
  mul = 1,
  rack: Pick<RocketRackDef, "scatterNearTiles" | "scatterFarTiles"> = TITAN_ROCKET_RACK,
): number {
  const near = rack.scatterNearTiles * TILE_SIZE;
  const far = rack.scatterFarTiles * TILE_SIZE;
  const u = clamp01(dist / Math.max(1, maxRange));
  return (near + (far - near) * u * u) * Math.max(0.2, mul);
}

/**
 * A rocket against an armored hull. A flat dent, not a share of max HP, so it
 * hurts a light hull more than a heavy one. One that lands on a tracked hull
 * from the side or the rear (`onHull`) has a high chance to throw a track.
 * A splash that only reaches the hull, or a hit on the front, does not.
 */
export function rocketArmorDamage(
  center: number,
  falloff: number,
  tracked: boolean,
  face: ArmorFace | "none",
  onHull: boolean,
  rand: () => number,
): { damage: number; throwTrack: boolean } {
  const span = 0.8 + rand() * 0.4;
  const damage = Math.max(1, Math.round(center * Math.max(0, falloff) * span));
  const flank = face === "side" || face === "rear";
  const throwTrack = tracked && onHull && flank && rand() < ROCKET_TRACK_CHANCE;
  return { damage, throwTrack };
}
