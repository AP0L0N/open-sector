import {
  CRIT_ARM_CHANCE,
  CRIT_ENGINE_CHANCE,
  CRIT_LEG_CHANCE,
  CRIT_TRACKS_CHANCE,
  CYBORG_DRAG_SPEED,
  STANCE_AIM_SPREAD,
  STANCE_SPEED,
  SWIM_SPEED,
  addCrit,
  catalog,
  cyborgLegsLost,
  gunStatsFor,
  hasAmmo,
  hasCrit,
  infantryGunFor,
  isCyborg,
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
  if (isCyborg(e.type) && hasCrit(e, "leg")) return CYBORG_DRAG_SPEED;
  if (isInfantryType(e.type)) return STANCE_SPEED[stanceOf(e)];
  return 1;
}

/**
 * Hull yaw. A dead engine locks the hull; only a turret can still traverse.
 * Broken tracks stop the roll (`moveSpeedMul`) but still pivot the hull so a casemate can aim.
 */
export function hullTurnMul(e: Entity): number {
  return hasCrit(e, "engine") ? 0 : 1;
}

/**
 * Cyborg legs follow his HP. Shot down to the last stretch, they are torn off
 * and he drags himself; healed or repaired well past it, they work again.
 */
export function syncCyborgLegs(e: Entity): void {
  const lost = cyborgLegsLost(e);
  if (lost == null || e.hp <= 0) return;
  const had = hasCrit(e, "leg");
  if (lost && !had) {
    addCrit(e, "leg");
    e.stanceOrder = "crawl";
    e.stance = "crawl";
  } else if (!lost && had) {
    e.crits = e.crits.filter((c) => c !== "leg");
    e.stanceOrder = "stand";
    e.stance = "stand";
  }
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
  trackChance = CRIT_TRACKS_CHANCE,
): void {
  if (e.kind !== "unit" || e.wreck) return;
  if (kind === "ricochet" || kind === "miss" || kind === "puff" || kind === "crush") return;
  // The cyborg's limbs are not dice rolls: the legs follow his HP (syncCyborgLegs).
  if (isCyborg(e.type)) return;
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
  if (face === "side" && rand() < trackChance) addCrit(e, "tracks");
  if (face === "rear" && rand() < CRIT_ENGINE_CHANCE) addCrit(e, "engine");
}
