import {
  CRIT_ARM_CHANCE,
  CRIT_ENGINE_CHANCE,
  CRIT_ENGINE_TURN,
  CRIT_LEG_CHANCE,
  CRIT_TRACKS_CHANCE,
  STANCE_AIM_SPREAD,
  STANCE_SPEED,
  SWIM_SPEED,
  addCrit,
  catalog,
  gunStatsFor,
  hasAmmo,
  hasCrit,
  infantryGunFor,
  isInfantryType,
  isMotorVehicle,
  pickLoadedShell,
  stanceOf,
  type Crit,
} from "../catalog.js";
import type { ImpactKind } from "../protocol.js";
import type { ArmorFace } from "./ballistics.js";
import type { Entity } from "./types.js";

export function moveSpeedMul(e: Entity, swimming = false): number {
  if (hasCrit(e, "tracks") || hasCrit(e, "engine")) return 0;
  if (isInfantryType(e.type) && swimming) return SWIM_SPEED;
  if (isInfantryType(e.type)) return STANCE_SPEED[stanceOf(e)];
  return 1;
}

/** Broken tracks freeze the hull. Engine damage only slows it. Turret traverse is separate. */
export function hullTurnMul(e: Entity): number {
  if (hasCrit(e, "tracks")) return 0;
  if (hasCrit(e, "engine")) return CRIT_ENGINE_TURN;
  return 1;
}

export function immobilized(e: { crits?: readonly Crit[] }): boolean {
  const crits = e.crits ?? [];
  return hasCrit({ crits }, "tracks") || hasCrit({ crits }, "engine");
}

export function fireStats(e: Entity): {
  damage: number;
  penetration: number;
  caliber: number;
  spreadDeg: number;
  cooldown: number;
  rangeTiles?: number;
} {
  const def = catalog(e.type);
  const aim = STANCE_AIM_SPREAD[stanceOf(e)];
  const inf = infantryGunFor(e);
  if (inf) {
    return {
      damage: inf.damage,
      penetration: inf.penetration,
      caliber: inf.caliber,
      spreadDeg: inf.spreadDeg * aim,
      cooldown: inf.cooldown,
      rangeTiles: inf.rangeTiles,
    };
  }
  const shell = hasAmmo(e.type) ? pickLoadedShell(e.ammo, e.shell) : null;
  const gun = gunStatsFor(e.type, shell);
  return { ...gun, spreadDeg: gun.spreadDeg * aim, cooldown: def.cooldown };
}

export function rollCrits(
  e: Entity,
  face: ArmorFace | "none",
  kind: ImpactKind,
  damage: number,
  rand: () => number,
): void {
  if (e.kind !== "unit" || e.wreck) return;
  if (kind === "ricochet" || kind === "miss" || kind === "puff" || kind === "crush") return;
  if (isInfantryType(e.type)) {
    if (damage <= 0) return;
    if (rand() < CRIT_ARM_CHANCE) addCrit(e, "arm");
    if (rand() < CRIT_LEG_CHANCE) {
      addCrit(e, "leg");
      e.stanceOrder = "crawl";
      e.stance = "crawl";
    }
    return;
  }
  if (!isMotorVehicle(e.type)) return;
  if (face === "side" && rand() < CRIT_TRACKS_CHANCE) addCrit(e, "tracks");
  if (face === "rear" && rand() < CRIT_ENGINE_CHANCE) addCrit(e, "engine");
}
