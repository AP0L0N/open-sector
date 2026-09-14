import { entityIsScouting, hasScout } from "../catalog.js";
import type { Entity, MatchState } from "./types.js";

export function canScout(e: Entity): boolean {
  return hasScout(e.type) && e.scoutHpMax > 0 && e.scoutHp > 0 && e.hp > 0 && !e.wreck;
}

export function setScoutOut(state: MatchState, e: Entity, out: boolean): string | null {
  if (!hasScout(e.type) || e.wreck || e.hp <= 0) return "No hatch.";
  if (e.scoutHp <= 0) return "Scout is dead.";
  if (e.scoutOut === out) return null;
  e.scoutOut = out;
  state.visionTick = -1;
  return null;
}

/** Button up. Hidden scouts take no further damage; remaining HP is kept. */
export function hideScout(state: MatchState, e: Entity): void {
  if (!e.scoutOut) return;
  e.scoutOut = false;
  state.visionTick = -1;
}

/** Wound an exposed scout. Returns true if this hit killed him. */
export function woundScout(state: MatchState, e: Entity, incoming: number): boolean {
  if (!entityIsScouting(e) || incoming <= 0) return false;
  const dmg = Math.max(1, Math.round(incoming));
  e.scoutHp = Math.max(0, e.scoutHp - dmg);
  if (e.scoutHp > 0) return false;
  e.scoutOut = false;
  state.visionTick = -1;
  return true;
}
