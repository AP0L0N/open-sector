import {
  ARTILLERY_TOW_SPEED,
  CRIT_ARM_CHANCE,
  CRIT_ENGINE_CHANCE,
  CRIT_LAMP_CHANCE,
  CRIT_LAMP_SNIPER_CHANCE,
  CRIT_LEG_CHANCE,
  CRIT_TRACKS_CHANCE,
  CYBORG_CRAWL_SHIELD_SECONDS,
  CYBORG_DRAG_SPEED,
  CYBORG_LEGS_LOST_HP,
  STANCE_AIM_SPREAD,
  STANCE_SPEED,
  SWIM_SPEED,
  WALKER_CHARGE_SPEED,
  addCrit,
  catalog,
  cyborgLegsLost,
  gunStatsFor,
  hasAmmo,
  hasCrit,
  hasForceField,
  infantryGunFor,
  isCyborg,
  isInfantryType,
  isMotorVehicle,
  trackCritAllowed,
  pickLoadedShell,
  secondsToTicks,
  stanceOf,
  wadeSpeedOf,
  wadesOf,
  type Crit,
} from "../catalog.js";
import type { ImpactKind } from "../protocol.js";
import { artilleryHaulMul, gunCrewOf } from "./artillery.js";
import type { ArmorFace } from "./ballistics.js";
import { hasHeadlight, hasSpotlight } from "./night.js";
import type { Entity } from "./types.js";

export function moveSpeedMul(e: Entity, swimming = false): number {
  if (e.braced || hasCrit(e, "tracks") || hasCrit(e, "engine")) return 0;
  if (e.type === "artillery") return artilleryHaulMul(e);
  if (e.towing != null) return ARTILLERY_TOW_SPEED;
  if (isInfantryType(e.type) && swimming) return SWIM_SPEED;
  if (isCyborg(e.type) && hasCrit(e, "leg")) return CYBORG_DRAG_SPEED;
  if (swimming && wadesOf(e.type)) return wadeSpeedOf(e.type);
  if (isInfantryType(e.type)) return STANCE_SPEED[stanceOf(e)];
  if (e.charging) return WALKER_CHARGE_SPEED;
  return 1;
}

/**
 * Hull yaw. A dead engine locks the hull; only a turret can still traverse.
 * Broken tracks stop the roll (`moveSpeedMul`) but still pivot the hull so a casemate can aim.
 */
export function hullTurnMul(e: Entity): number {
  if (e.type === "artillery") return e.towedBy == null && gunCrewOf(e) > 0 ? 1 : 0;
  return e.braced || hasCrit(e, "engine") ? 0 : 1;
}

/**
 * Cyborg legs follow his HP. Shot down to the last stretch, they are torn off
 * and he drags himself; healed or repaired well past it, they work again.
 */
export function syncCyborgLegs(e: Entity, tick: number): void {
  const lost = cyborgLegsLost(e);
  if (lost == null || e.hp <= 0) return;
  const had = hasCrit(e, "leg");
  if (lost && !had) {
    tearCyborgLegs(e, tick);
  } else if (!lost && had) {
    e.crits = e.crits.filter((c) => c !== "leg");
    e.stanceOrder = "stand";
    e.stance = "stand";
  }
}

/** Legs off, down on the arm, and CYBORG_CRAWL_SHIELD_SECONDS of plating nothing gets through. */
function tearCyborgLegs(e: Entity, tick: number): void {
  addCrit(e, "leg");
  e.stanceOrder = "crawl";
  e.stance = "crawl";
  e.shieldUntilTick = tick + secondsToTicks(CYBORG_CRAWL_SHIELD_SECONDS);
}

/** The legs have just gone and he cannot be hurt yet. */
export function cyborgShielded(e: { type: Entity["type"]; shieldUntilTick?: number }, tick: number): boolean {
  return isCyborg(e.type) && e.shieldUntilTick != null && tick < e.shieldUntilTick;
}

/**
 * Take `damage` off a unit's HP and return what actually came off. Every hit
 * goes through here so the cyborg's crawl rule holds whatever did the damage:
 * while shielded nothing lands, and the hit that tears his legs off (even one
 * that would have killed him) leaves at least 1 HP and starts the shield.
 * The Cyborg Commander's force field soaks what it can before any of that.
 */
export function takeDamage(e: Entity, damage: number, tick: number): number {
  if (damage <= 0 || e.hp <= 0) return 0;
  // A plane already falling cannot be shot out of the crash.
  if (e.air?.phase === "crash") return 0;
  const before = e.hp;
  if (isCyborg(e.type)) {
    if (cyborgShielded(e, tick)) return 0;
    // The Commander's force field takes the hit first. Only what it cannot hold reaches the plating.
    if (hasForceField(e.type)) {
      e.fieldHitTick = tick;
      const field = e.field ?? 0;
      if (field > 0) {
        const soak = Math.min(field, damage);
        e.field = field - soak;
        damage -= soak;
        if (damage <= 0) return 0;
      }
    }
    const after = before - damage;
    if (!hasCrit(e, "leg") && after <= e.hpMax * CYBORG_LEGS_LOST_HP) {
      e.hp = Math.max(1, after);
      tearCyborgLegs(e, tick);
      return before - e.hp;
    }
  }
  e.hp = Math.max(0, before - damage);
  return before - e.hp;
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
  // The Mammoth and aircraft have no tracks to throw. A rear hit can still kill the engine.
  if (face === "side" && trackCritAllowed(e.type) && rand() < trackChance) addCrit(e, "tracks");
  // A towed gun has wheels to break but no engine.
  if (face === "rear" && e.type !== "artillery" && rand() < CRIT_ENGINE_CHANCE) addCrit(e, "engine");
}

/**
 * A bullet that meets a hull or a watch tower may smash its lamps. Every lamp
 * on that body goes dark together. Shells, rockets, and bombs do not roll this.
 * `shot` is omitted when the round is not a bullet, and then no die is thrown.
 */
export function rollLamp(e: Entity, shot: "bullet" | "sniper" | undefined, rand: () => number): void {
  if (!shot || e.hp <= 0 || e.wreck || e.ruined) return;
  if (!hasHeadlight(e.type) && !hasSpotlight(e.type)) return;
  const chance = shot === "sniper" ? CRIT_LAMP_SNIPER_CHANCE : CRIT_LAMP_CHANCE;
  if (rand() < chance) addCrit(e, "lamp");
}
