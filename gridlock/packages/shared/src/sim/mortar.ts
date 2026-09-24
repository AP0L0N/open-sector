import {
  MORTAR_APEX_FAR,
  MORTAR_APEX_NEAR,
  MORTAR_FLIGHT_FAR,
  MORTAR_FLIGHT_NEAR,
  MORTAR_SCATTER_FAR_TILES,
  MORTAR_SCATTER_NEAR_TILES,
  TILE_SIZE,
} from "../catalog.js";

function clamp01(u: number): number {
  return Math.min(1, Math.max(0, u));
}

/** Ground miss radius. Grows with range. `mul` is target posture and movement. */
export function mortarScatterRadius(dist: number, maxRange: number, mul = 1): number {
  const near = MORTAR_SCATTER_NEAR_TILES * TILE_SIZE;
  const far = MORTAR_SCATTER_FAR_TILES * TILE_SIZE;
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
export function mortarFlightSeconds(dist: number, maxRange: number): number {
  const u = clamp01(dist / Math.max(1, maxRange));
  return MORTAR_FLIGHT_NEAR + (MORTAR_FLIGHT_FAR - MORTAR_FLIGHT_NEAR) * u;
}

/** Peak air height in elevation units. Short shots still go mostly up. */
export function mortarApex(dist: number, maxRange: number): number {
  const u = clamp01(dist / Math.max(1, maxRange));
  return MORTAR_APEX_NEAR + (MORTAR_APEX_FAR - MORTAR_APEX_NEAR) * u;
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
