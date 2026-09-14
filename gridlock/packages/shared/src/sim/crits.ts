import {
  CRIT_ARM_CHANCE,
  CRIT_ENGINE_CHANCE,
  CRIT_ENGINE_TURN,
  CRIT_LEG_CHANCE,
  CRIT_LEG_SPEED,
  CRIT_TRACKS_CHANCE,
  HANDGUN,
  addCrit,
  catalog,
  gunStatsFor,
  hasAmmo,
  hasCrit,
  isInfantryType,
  isMotorVehicle,
  pickLoadedShell,
  type Crit,
} from "../catalog.js";
import type { ImpactKind } from "../protocol.js";
import type { ArmorFace } from "./ballistics.js";
import type { Entity } from "./types.js";

export function moveSpeedMul(e: Entity): number {
  if (hasCrit(e, "tracks") || hasCrit(e, "engine")) return 0;
  if (hasCrit(e, "leg")) return CRIT_LEG_SPEED;
  return 1;
}

export function hullTurnMul(e: Entity): number {
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
  if (isInfantryType(e.type) && hasCrit(e, "arm")) {
    return {
      damage: HANDGUN.damage,
      penetration: HANDGUN.penetration,
      caliber: HANDGUN.caliber,
      spreadDeg: HANDGUN.spreadDeg,
      cooldown: HANDGUN.cooldown,
      rangeTiles: HANDGUN.rangeTiles,
    };
  }
  const shell = hasAmmo(e.type) ? pickLoadedShell(e.ammo, e.shell) : null;
  const gun = gunStatsFor(e.type, shell);
  return { ...gun, cooldown: def.cooldown };
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
    if (rand() < CRIT_LEG_CHANCE) addCrit(e, "leg");
    return;
  }
  if (!isMotorVehicle(e.type)) return;
  if (face === "side" && rand() < CRIT_TRACKS_CHANCE) addCrit(e, "tracks");
  if (face === "rear" && rand() < CRIT_ENGINE_CHANCE) addCrit(e, "engine");
}
