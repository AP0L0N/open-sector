import {
  STANCE_HIT_RADIUS,
  STANCE_TARGET_SPREAD,
  hasCrit,
  isInfantryType,
  stanceOf,
  type Stance,
} from "../catalog.js";
import type { Entity, MatchState } from "./types.js";

export function commandedStance(e: Entity): Stance {
  if (!isInfantryType(e.type)) return "stand";
  if (hasCrit(e, "leg")) return "crawl";
  return e.stanceOrder;
}

export function effectiveStance(e: Entity, targeted: boolean): Stance {
  if (!isInfantryType(e.type)) return "stand";
  if (hasCrit(e, "leg")) return "crawl";
  if (targeted && !e.garrisonedIn) return "crawl";
  return e.stanceOrder;
}

export function targetedIds(state: MatchState): Set<number> {
  const ids = new Set<number>();
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) continue;
    if (e.attackTarget != null) ids.add(e.attackTarget);
    if (e.order?.kind === "attack" && e.order.targetId != null) ids.add(e.order.targetId);
  }
  return ids;
}

export function tickStance(state: MatchState): void {
  const hot = targetedIds(state);
  for (const e of state.entities.values()) {
    if (!isInfantryType(e.type) || e.hp <= 0) continue;
    if (hasCrit(e, "leg")) e.stanceOrder = "crawl";
    e.stance = effectiveStance(e, hot.has(e.id));
  }
}

export function stanceHitRadiusMul(e: Entity): number {
  return STANCE_HIT_RADIUS[stanceOf(e)];
}

export function stanceTargetSpreadMul(e: Entity): number {
  return STANCE_TARGET_SPREAD[stanceOf(e)];
}
