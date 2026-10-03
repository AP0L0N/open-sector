/**
 * Where a garrisoned rocket or flame should appear to leave its host.
 * Client-only. The sim still starts the shot at its own slit; this pushes the
 * picture out to the window, or past the drawn hull, and lets that extra
 * height settle back to the sim's flight.
 */
import {
  catalog,
  garrisonWindowLift,
  ISO_ELEVATION,
  largeWallSlit,
  pickGarrisonMuzzle,
  type EntityType,
  type EntityView,
} from "@gridlock/shared";

/** World pixels past a hull's collision radius, so the mouth clears the sprite. */
export const HULL_MOUTH_OUT = 36;
/** Screen pixels a hull slit sits above the deck. */
export const HULL_MOUTH_LIFT = 48;
/** World pixels over which the extra deck lift fades into the sim height. */
export const MOUTH_LIFT_FADE = 160;
/** Steps, world pixels, walked back along a shot whose shooter was omitted. */
export const HOST_BACKTRACK = [0, 16, 48, 96, 160] as const;

const FACE_OUT = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
} as const;

export interface ShotHost {
  id: number;
  kind: "building" | "unit";
  type: EntityType;
  x: number;
  y: number;
  radius: number;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  /** Set on a Large wall section, whose slits sit on its own rotated flanks. */
  facing?: number;
}

export function shotHostFrom(
  e: Pick<EntityView, "id" | "kind" | "type" | "x" | "y" | "tileX" | "tileY" | "tileW" | "tileH">,
): ShotHost {
  return {
    id: e.id,
    kind: e.kind === "building" ? "building" : "unit",
    type: e.type,
    x: e.x,
    y: e.y,
    radius: catalog(e.type).radius,
    tileX: e.tileX,
    tileY: e.tileY,
    tileW: e.tileW,
    tileH: e.tileH,
  };
}

/** Ground point the glob left, walked back from where it is now. */
export function flameLaunchPoint(p: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  arc?: number;
  hang?: number;
}): { x: number; y: number } {
  const flown = Math.max(0, p.arc ?? 0) * Math.max(0, p.hang ?? 0.3);
  return { x: p.x - p.vx * flown, y: p.y - p.vy * flown };
}

/** Points stepped against the shot, nearest first, for a host the snapshot hid. */
export function backtrackPoints(
  from: { x: number; y: number },
  vx: number,
  vy: number,
): { x: number; y: number }[] {
  const sp = Math.hypot(vx, vy) || 1;
  const ux = vx / sp;
  const uy = vy / sp;
  return HOST_BACKTRACK.map((d) => ({ x: from.x - ux * d, y: from.y - uy * d }));
}

export function garrisonMouthLift(host: Pick<ShotHost, "kind" | "type">, salt: number): number {
  if (host.kind === "unit") return HULL_MOUTH_LIFT;
  return garrisonWindowLift(host.type, salt);
}

/** World point the picture leaves: a window just outside the wall, or a hull slit past the sprite. */
export function garrisonMouthPoint(
  host: ShotHost,
  aimX: number,
  aimY: number,
  tileSize: number,
  salt: number,
): { x: number; y: number } {
  const ang = Math.atan2(aimY - host.y, aimX - host.x);
  if (host.kind === "unit") {
    const out = (host.radius > 0 ? host.radius : 16) + HULL_MOUTH_OUT;
    return { x: host.x + Math.cos(ang) * out, y: host.y + Math.sin(ang) * out };
  }
  if (host.type === "greatwall") return largeWallSlit({ x: host.x, y: host.y, facing: host.facing ?? 0 }, aimX, aimY, salt);
  const w = pickGarrisonMuzzle(host as never, tileSize, ang, salt);
  const out = FACE_OUT[w.face];
  return { x: w.x + out.x * 4, y: w.y + out.y * 4 };
}

/** Nozzle for `jetParticles`: world ground under the aperture, screen height above it. */
export function garrisonFlameNozzle(
  host: ShotHost,
  land: { x: number; y: number },
  tileSize: number,
  salt: number,
): { x: number; y: number; h: number } {
  const mouth = garrisonMouthPoint(host, land.x, land.y, tileSize, salt);
  return { x: mouth.x, y: mouth.y, h: garrisonMouthLift(host, salt) };
}

/** True when this origin is close enough to have left this host. */
export function claimsShot(host: ShotHost, origin: { x: number; y: number }, tileSize: number): boolean {
  if (host.kind === "unit") {
    const reach = (host.radius > 0 ? host.radius : 16) + HULL_MOUTH_OUT + 24;
    return Math.hypot(origin.x - host.x, origin.y - host.y) <= reach;
  }
  if (host.type === "greatwall") return Math.hypot(origin.x - host.x, origin.y - host.y) <= 40;
  const x0 = host.tileX * tileSize;
  const y0 = host.tileY * tileSize;
  const pad = 48;
  return (
    origin.x >= x0 - pad &&
    origin.x <= x0 + host.tileW * tileSize + pad &&
    origin.y >= y0 - pad &&
    origin.y <= y0 + host.tileH * tileSize + pad
  );
}

/**
 * Drawn rocket head. It stays on the mouth until the sim point clears the
 * sprite, and the extra screen lift fades out over `MOUTH_LIFT_FADE`.
 */
export function garrisonHeadPoint(opts: {
  host: { x: number; y: number };
  sim: { x: number; y: number; z: number };
  mouth: { x: number; y: number };
  mouthLiftPx: number;
  simLiftPx: number;
}): { x: number; y: number; z: number } {
  const mx = opts.mouth.x - opts.host.x;
  const my = opts.mouth.y - opts.host.y;
  const mouthDist = Math.hypot(mx, my);
  const sx = opts.sim.x - opts.host.x;
  const sy = opts.sim.y - opts.host.y;
  const along = mouthDist > 0.001 ? (sx * mx + sy * my) / mouthDist : 0;
  const past = along >= mouthDist - 0.5;
  const distPast = Math.max(0, along - mouthDist);
  const fade = Math.max(0, 1 - distPast / MOUTH_LIFT_FADE);
  const extraPx = Math.max(0, opts.mouthLiftPx - opts.simLiftPx) * fade;
  return {
    x: past ? opts.sim.x : opts.mouth.x,
    y: past ? opts.sim.y : opts.mouth.y,
    z: opts.sim.z + extraPx / ISO_ELEVATION,
  };
}
