import {
  MG42_BIPOD_SECONDS,
  STANCE_HIT_RADIUS,
  STANCE_TARGET_SPREAD,
  TICK_DT,
  hasCrit,
  isInfantryType,
  stanceOf,
  type Stance,
} from "../catalog.js";
import { unitInWater } from "./geo.js";
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
    if (
      (e.order?.kind === "attack" || e.order?.kind === "forceattack") &&
      e.order.targetId != null
    ) {
      ids.add(e.order.targetId);
    }
  }
  return ids;
}

/** One bipod second per sim step. tickStance only clears it, because combat calls that twice. */
export function tickBipod(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.type !== "gunner" || e.hp <= 0 || e.bipod >= MG42_BIPOD_SECONDS) continue;
    const planting =
      e.stance === "crawl" && !unitInWater(state, e) && e.garrisonedIn == null && !hasCrit(e, "arm");
    if (planting) e.bipod = Math.min(MG42_BIPOD_SECONDS, e.bipod + TICK_DT);
  }
}

export function tickStance(state: MatchState): void {
  const hot = targetedIds(state);
  for (const e of state.entities.values()) {
    if (!isInfantryType(e.type) || e.hp <= 0) continue;
    if (hasCrit(e, "leg")) e.stanceOrder = "crawl";
    if (unitInWater(state, e)) {
      e.stance = e.stanceOrder;
      continue;
    }
    e.stance = effectiveStance(e, hot.has(e.id));
    if (e.type === "gunner") {
      const planting =
        e.stance === "crawl" && !unitInWater(state, e) && e.garrisonedIn == null && !hasCrit(e, "arm");
      if (!planting) e.bipod = 0;
    }
  }
}

export function stanceHitRadiusMul(e: Entity, swimming = false): number {
  if (swimming) return STANCE_HIT_RADIUS.stand;
  return STANCE_HIT_RADIUS[stanceOf(e)];
}

export function stanceTargetSpreadMul(e: Entity, swimming = false): number {
  if (swimming) return STANCE_TARGET_SPREAD.stand;
  return STANCE_TARGET_SPREAD[stanceOf(e)];
}
