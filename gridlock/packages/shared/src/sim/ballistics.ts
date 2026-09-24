/** Sudden Strike-style AP: directional armor, aim cone, ricochet, variable pen. */

import {
  PTRD_CALIBER,
  PTRD_CLOSE_TILES,
  PTRD_DMG_LIGHT,
  PTRD_DMG_REAR,
  PTRD_DMG_SIDE,
  PTRD_LIGHT_FRONT,
  type CatalogEntry,
} from "../catalog.js";
import type { ImpactKind } from "../protocol.js";

export const FRONT_ARC_DEG = 50;
export const REAR_ARC_DEG = 50;
export const RICOCHET_DEG = 68;
export const KILL_OVERMATCH = 2.4;
export const REAR_KILL_OVERMATCH = 1.25;
export const WEAK_POINT = 0.05;
/** Incoming speed kept after a bounce. Near-muzzle, so the spark zips away. */
export const RICOCHET_KEEP = 0.88;
/** Shortest bounced spark — dies almost on the hull. */
export const RICOCHET_TRAVEL_MIN = 8;
/** Longest bounced spark before it hits dirt. */
export const RICOCHET_TRAVEL = 150;
/**
 * Inbound rounds are faster than a visible tracer. Cap the bounce so the
 * spark still zips instead of vanishing in a single tick.
 */
export const RICOCHET_SPARK_SPEED = 720;
export const MIN_COS = 0.14;
export const MOVING_SPREAD = 1.5;
/** Extra aim-cone scale once a shot is past the shooter's own sight. */
export const LONG_SHOT_SPREAD = 1.7;

export type ArmorFace = "front" | "side" | "rear";

export interface HitResolution {
  kind: Exclude<ImpactKind, "miss" | "puff" | "crush">;
  face: ArmorFace | "none";
  damage: number;
  bounceVx: number;
  bounceVy: number;
  effectiveArmor: number;
  overmatch: number;
}

export function isArmored(def: CatalogEntry): boolean {
  return def.armorFront > 0 || def.armorSide > 0 || def.armorRear > 0;
}

export function armorOn(def: CatalogEntry, face: ArmorFace): number {
  if (face === "front") return def.armorFront;
  if (face === "rear") return def.armorRear;
  return def.armorSide;
}

/** Which plate the shell meets, from travel direction vs hull facing. */
export function hitFace(facing: number, vx: number, vy: number): ArmorFace {
  const from = Math.atan2(-vy, -vx);
  const a = (Math.abs(normAngle(from - facing)) * 180) / Math.PI;
  if (a <= FRONT_ARC_DEG) return "front";
  if (a >= 180 - REAR_ARC_DEG) return "rear";
  return "side";
}

/**
 * Random point on the incoming face of a circular hull. `hitX/Y` is the
 * sweep contact; the result stays on that half of the disk so sparks read
 * as a strike on the plate, not the far side or the dead center.
 */
export function scatterHullImpact(
  cx: number,
  cy: number,
  radius: number,
  hitX: number,
  hitY: number,
  rand: () => number,
): { x: number; y: number } {
  const r = Math.max(4, radius);
  const ox = hitX - cx;
  const oy = hitY - cy;
  const len = Math.hypot(ox, oy) || 1;
  const ux = ox / len;
  const uy = oy / len;
  const tx = -uy;
  const ty = ux;
  const along = (rand() * 2 - 1) * r * 0.92;
  const span = Math.sqrt(Math.max(0.08, 1 - (along / r) ** 2)) * r;
  const out = span * (0.22 + rand() * 0.78);
  return { x: cx + ux * out + tx * along, y: cy + uy * out + ty * along };
}

export function faceNormal(
  facing: number,
  face: ArmorFace,
  vx: number,
  vy: number,
): { x: number; y: number } {
  if (face === "front") return { x: Math.cos(facing), y: Math.sin(facing) };
  if (face === "rear") return { x: -Math.cos(facing), y: -Math.sin(facing) };
  const sx = -Math.sin(facing);
  const sy = Math.cos(facing);
  if (vx * sx + vy * sy > 0) return { x: -sx, y: -sy };
  return { x: sx, y: sy };
}

export function aimAngle(
  facing: number,
  spreadDeg: number,
  dist: number,
  maxRange: number,
  rand: () => number,
  moving = false,
  spreadPower = 1,
  targetSpreadMul = 1,
  accurateRange = maxRange,
): number {
  if (spreadDeg <= 0) return facing;
  const reach = accurateRange > 1e-6 ? accurateRange : maxRange;
  const t = reach <= 1e-6 ? 1 : clamp(dist / reach, 0, 1);
  const falloff = spreadPower > 1 ? 0.15 + 0.85 * t ** spreadPower : 0.35 + 0.65 * t;
  let cone = spreadDeg * falloff;
  if (dist > reach && maxRange > reach) {
    const extra = clamp((dist - reach) / (maxRange - reach), 0, 1);
    cone *= 1 + extra * (LONG_SHOT_SPREAD - 1);
  }
  if (moving) cone *= MOVING_SPREAD;
  if (targetSpreadMul > 0) cone *= targetSpreadMul;
  return facing + (rand() * 2 - 1) * ((cone * Math.PI) / 180);
}

export function resolveHit(opts: {
  gun: Pick<CatalogEntry, "damage" | "penetration" | "caliber">;
  target: CatalogEntry;
  targetFacing: number;
  targetHp: number;
  targetHpMax: number;
  vx: number;
  vy: number;
  rand: () => number;
  /** Use gun.damage as the final number. Scoped infantry hits set this. */
  exact?: boolean;
}): HitResolution {
  const { gun, target, rand } = opts;
  if (!isArmored(target) || target.kind === "building") {
    const damage = opts.exact
      ? Math.min(opts.targetHp, Math.max(0, gun.damage))
      : Math.max(1, Math.round(gun.damage * (0.9 + rand() * 0.2)));
    return {
      kind: damage >= opts.targetHp ? "kill" : "hit",
      face: hitFace(opts.targetFacing, opts.vx, opts.vy),
      damage,
      bounceVx: 0,
      bounceVy: 0,
      effectiveArmor: 0,
      overmatch: 99,
    };
  }

  const speed = Math.hypot(opts.vx, opts.vy) || 1;
  const face = hitFace(opts.targetFacing, opts.vx, opts.vy);
  const armor = armorOn(target, face);
  const n = faceNormal(opts.targetFacing, face, opts.vx, opts.vy);
  const ix = opts.vx / speed;
  const iy = opts.vy / speed;
  const cosInc = clamp(-(ix * n.x + iy * n.y), 0, 1);
  const incDeg = (Math.acos(cosInc) * 180) / Math.PI;
  const effective = armor / Math.max(cosInc, MIN_COS);
  const overmatch = effective <= 1e-6 ? 99 : gun.penetration / effective;
  const caliberOver = gun.caliber > armor * 2.6;

  const bounce = (): HitResolution =>
    reflect(ix, iy, n.x, n.y, speed, face, effective, overmatch, rand, gun.caliber);

  if (!caliberOver && incDeg >= RICOCHET_DEG) return bounce();

  const bites = gun.penetration >= effective * 0.92;
  if (!bites) {
    const weak =
      face === "front" && gun.penetration >= armor * 0.7 && rand() < WEAK_POINT;
    if (!weak) {
      if (incDeg > 40 || gun.penetration < armor * 0.85) return bounce();
      const chip = rand() < 0.35 ? Math.round(rand() * 2) : 0;
      return {
        kind: "glance",
        face,
        damage: chip,
        bounceVx: 0,
        bounceVy: 0,
        effectiveArmor: effective,
        overmatch,
      };
    }
    const nick = Math.max(1, Math.round(opts.targetHpMax * (0.04 + rand() * 0.12)));
    return {
      kind: nick >= opts.targetHp ? "kill" : "hit",
      face,
      damage: Math.min(opts.targetHp, nick),
      bounceVx: 0,
      bounceVy: 0,
      effectiveArmor: effective,
      overmatch,
    };
  }

  if (
    overmatch >= KILL_OVERMATCH ||
    (face === "rear" && overmatch >= REAR_KILL_OVERMATCH) ||
    gun.caliber >= armor * 2.4
  ) {
    return kill(opts.targetHp, face, effective, overmatch);
  }

  const size = gun.caliber / (armor + gun.caliber * 0.5 + 8);
  const strength = clamp((overmatch - 0.9) / (KILL_OVERMATCH - 0.9), 0, 1);
  const roll = rand();
  if (roll > 0.96 && overmatch > 1.2) return kill(opts.targetHp, face, effective, overmatch);

  const frac = strength * size * (0.04 + roll * 0.96);
  let damage = Math.min(opts.targetHp, Math.round(opts.targetHpMax * frac));
  if (gun.caliber >= 40) {
    const floor = Math.round(gun.damage * clamp(overmatch, 0.85, 2.4));
    damage = Math.min(opts.targetHp, Math.max(damage, floor));
  }
  if (damage >= opts.targetHp && damage > 0) return kill(opts.targetHp, face, effective, overmatch);
  let kind: HitResolution["kind"] = "hit";
  if (damage <= 2) kind = "glance";
  else if (overmatch >= 1.35 || damage >= opts.targetHpMax * 0.28) kind = "pen";
  return {
    kind,
    face,
    damage,
    bounceVx: 0,
    bounceVy: 0,
    effectiveArmor: effective,
    overmatch,
  };
}

/**
 * Whether resolveHit can deal damage on this exact shot, ignoring the roll.
 * Auto-fire uses it so a rifle does not open up when every impact would spark.
 * Keep the branches in step with resolveHit.
 */
export function armorHarmPossible(opts: {
  gun: Pick<CatalogEntry, "damage" | "penetration" | "caliber">;
  target: CatalogEntry;
  targetFacing: number;
  targetHpMax: number;
  vx: number;
  vy: number;
}): boolean {
  const { gun, target } = opts;
  if (!isArmored(target) || target.kind === "building") return true;
  const speed = Math.hypot(opts.vx, opts.vy) || 1;
  const face = hitFace(opts.targetFacing, opts.vx, opts.vy);
  const armor = armorOn(target, face);
  const n = faceNormal(opts.targetFacing, face, opts.vx, opts.vy);
  const ix = opts.vx / speed;
  const iy = opts.vy / speed;
  const cosInc = clamp(-(ix * n.x + iy * n.y), 0, 1);
  const incDeg = (Math.acos(cosInc) * 180) / Math.PI;
  const effective = armor / Math.max(cosInc, MIN_COS);
  const overmatch = effective <= 1e-6 ? 99 : gun.penetration / effective;
  const caliberOver = gun.caliber > armor * 2.6;
  if (!caliberOver && incDeg >= RICOCHET_DEG) return false;
  const bites = gun.penetration >= effective * 0.92;
  if (!bites) {
    if (face === "front" && gun.penetration >= armor * 0.7) return true;
    if (incDeg > 40 || gun.penetration < armor * 0.85) return false;
    return true;
  }
  if (
    overmatch >= KILL_OVERMATCH ||
    (face === "rear" && overmatch >= REAR_KILL_OVERMATCH) ||
    gun.caliber >= armor * 2.4
  ) {
    return true;
  }
  // resolveHit can still kill on roll > 0.96 when overmatch is past 1.2.
  if (overmatch > 1.2) return true;
  const size = gun.caliber / (armor + gun.caliber * 0.5 + 8);
  const strength = clamp((overmatch - 0.9) / (KILL_OVERMATCH - 0.9), 0, 1);
  const fracMax = strength * size;
  let damage = Math.round(opts.targetHpMax * fracMax);
  if (gun.caliber >= 40) {
    const floor = Math.round(gun.damage * clamp(overmatch, 0.85, 2.4));
    damage = Math.max(damage, floor);
  }
  return damage > 0;
}

/**
 * 14.5 mm against a hull. Shell overmatch would delete a thin rear; this round
 * does not. Light hulls (front plate at or under PTRD_LIGHT_FRONT) fail on
 * every face out to the end of the sights. Heavier fronts are tanks: the front
 * plate holds, and side or rear only inside close range, and only when the
 * angle-thickened plate is still within the round's penetration.
 * `penetration` is already the range-fallen value from ptrdPenetration.
 */
export function resolveAtRifleHit(opts: {
  penetration: number;
  distTiles: number;
  target: CatalogEntry;
  targetFacing: number;
  targetHp: number;
  targetHpMax: number;
  vx: number;
  vy: number;
  rand: () => number;
}): HitResolution {
  const { target, rand } = opts;
  const speed = Math.hypot(opts.vx, opts.vy) || 1;
  const face = hitFace(opts.targetFacing, opts.vx, opts.vy);
  const armor = armorOn(target, face);
  const n = faceNormal(opts.targetFacing, face, opts.vx, opts.vy);
  const ix = opts.vx / speed;
  const iy = opts.vy / speed;
  const cosInc = clamp(-(ix * n.x + iy * n.y), 0, 1);
  const incDeg = (Math.acos(cosInc) * 180) / Math.PI;
  const effective = armor / Math.max(cosInc, MIN_COS);
  const overmatch = effective <= 1e-6 ? 99 : opts.penetration / effective;
  const bounce = (): HitResolution =>
    reflect(ix, iy, n.x, n.y, speed, face, effective, overmatch, rand, PTRD_CALIBER);

  if (incDeg >= RICOCHET_DEG) return bounce();

  const light = target.armorFront <= PTRD_LIGHT_FRONT;
  const inReach = light || (face !== "front" && opts.distTiles <= PTRD_CLOSE_TILES);
  const bites = inReach && opts.penetration >= effective * 0.92;
  if (!bites) return bounce();

  const base = light ? PTRD_DMG_LIGHT : face === "rear" ? PTRD_DMG_REAR : PTRD_DMG_SIDE;
  const frac = base * (0.85 + rand() * 0.3);
  const damage = Math.min(opts.targetHp, Math.max(1, Math.round(opts.targetHpMax * frac)));
  if (damage >= opts.targetHp) return kill(opts.targetHp, face, effective, overmatch);
  return {
    kind: "pen",
    face,
    damage,
    bounceVx: 0,
    bounceVy: 0,
    effectiveArmor: effective,
    overmatch,
  };
}

/** Same bite test as resolveAtRifleHit, without the damage roll. */
export function ptrdHarmPossible(opts: {
  penetration: number;
  distTiles: number;
  target: CatalogEntry;
  targetFacing: number;
  vx: number;
  vy: number;
}): boolean {
  const { target } = opts;
  const speed = Math.hypot(opts.vx, opts.vy) || 1;
  const face = hitFace(opts.targetFacing, opts.vx, opts.vy);
  const armor = armorOn(target, face);
  const n = faceNormal(opts.targetFacing, face, opts.vx, opts.vy);
  const ix = opts.vx / speed;
  const iy = opts.vy / speed;
  const cosInc = clamp(-(ix * n.x + iy * n.y), 0, 1);
  const incDeg = (Math.acos(cosInc) * 180) / Math.PI;
  if (incDeg >= RICOCHET_DEG) return false;
  const effective = armor / Math.max(cosInc, MIN_COS);
  const light = target.armorFront <= PTRD_LIGHT_FRONT;
  const inReach = light || (face !== "front" && opts.distTiles <= PTRD_CLOSE_TILES);
  return inReach && opts.penetration >= effective * 0.92;
}

function kill(
  hp: number,
  face: ArmorFace,
  effectiveArmor: number,
  overmatch: number,
): HitResolution {
  return {
    kind: "kill",
    face,
    damage: hp,
    bounceVx: 0,
    bounceVy: 0,
    effectiveArmor,
    overmatch,
  };
}

function reflect(
  ix: number,
  iy: number,
  nx: number,
  ny: number,
  speed: number,
  face: ArmorFace,
  effectiveArmor: number,
  overmatch: number,
  rand: () => number,
  caliber: number,
): HitResolution {
  const keep = RICOCHET_KEEP + rand() * 0.06;
  let rx: number;
  let ry: number;
  if (caliber < 40) {
    // Rifle sparks ping off in a random direction away from the plate.
    const ang = rand() * Math.PI * 2;
    rx = Math.cos(ang);
    ry = Math.sin(ang);
    if (rx * nx + ry * ny < 0) {
      rx = -rx;
      ry = -ry;
    }
  } else {
    const dot = ix * nx + iy * ny;
    rx = ix - 2 * dot * nx;
    ry = iy - 2 * dot * ny;
    const scatter = (rand() - 0.5) * 0.5;
    const cs = Math.cos(scatter);
    const sn = Math.sin(scatter);
    const bx = rx * cs - ry * sn;
    const by = rx * sn + ry * cs;
    rx = bx;
    ry = by;
  }
  return {
    kind: "ricochet",
    face,
    damage: 0,
    bounceVx: rx * speed * keep,
    bounceVy: ry * speed * keep,
    effectiveArmor,
    overmatch,
  };
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
