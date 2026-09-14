/** Sudden Strike-style AP: directional armor, aim cone, ricochet, variable pen. */

import type { CatalogEntry } from "../catalog.js";
import type { ImpactKind } from "../protocol.js";

export const FRONT_ARC_DEG = 50;
export const REAR_ARC_DEG = 50;
export const RICOCHET_DEG = 68;
export const KILL_OVERMATCH = 2.4;
export const REAR_KILL_OVERMATCH = 1.25;
export const WEAK_POINT = 0.05;
/** Incoming speed kept after a bounce. Near-muzzle, so the spark zips away. */
export const RICOCHET_KEEP = 0.88;
/** World units a bounced round still flies before it hits dirt. */
export const RICOCHET_TRAVEL = 80;
export const MIN_COS = 0.14;
export const MOVING_SPREAD = 1.5;

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
): number {
  if (spreadDeg <= 0) return facing;
  const t = maxRange <= 1e-6 ? 1 : clamp(dist / maxRange, 0, 1);
  const falloff = spreadPower > 1 ? 0.15 + 0.85 * t ** spreadPower : 0.35 + 0.65 * t;
  let cone = spreadDeg * falloff;
  if (moving) cone *= MOVING_SPREAD;
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
}): HitResolution {
  const { gun, target, rand } = opts;
  if (!isArmored(target)) {
    const damage = Math.max(1, Math.round(gun.damage * (0.9 + rand() * 0.2)));
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

  const bounce = (): HitResolution => reflect(ix, iy, n.x, n.y, speed, face, effective, overmatch, rand);

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
): HitResolution {
  const dot = ix * nx + iy * ny;
  const rx = ix - 2 * dot * nx;
  const ry = iy - 2 * dot * ny;
  const scatter = (rand() - 0.5) * 0.5;
  const cs = Math.cos(scatter);
  const sn = Math.sin(scatter);
  const keep = RICOCHET_KEEP + rand() * 0.06;
  return {
    kind: "ricochet",
    face,
    damage: 0,
    bounceVx: (rx * cs - ry * sn) * speed * keep,
    bounceVy: (rx * sn + ry * cs) * speed * keep,
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
