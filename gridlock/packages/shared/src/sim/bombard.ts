import { BOMBARD_MIN_RANGE_TILES, FISTS, dropsCannon } from "../catalog.js";
import { isAirborne } from "./air.js";
import { weaponRangeWorld } from "./elevation.js";
import { allies } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Bombard's cannon. It cannot lay the cannon inside BOMBARD_MIN_RANGE_TILES, so an enemy
 * that attacks it from inside that ring makes it drop the cannon where it stands and fight on
 * with its fists (Entity.fists, catalog.infantryGunFor). The cannon is gone for good: nothing
 * gives it back. "Attacks" means the enemy has the Bombard as its target and in its own reach.
 */

/** Still carries the cannon: a live Bombard on the field that has not dropped it. */
function armed(e: Entity): boolean {
  return dropsCannon(e.type) && !e.fists && e.hp > 0 && !e.wreck && e.garrisonedIn == null;
}

/**
 * Drops the cannon and squares up to `foe`: it runs it down like a Thrall going for what it picked.
 * A target the player named, or a move the player gave, it keeps.
 */
export function dropCannon(e: Entity, foe?: Entity): void {
  e.fists = true;
  e.clip = FISTS.clip;
  e.reload = 0;
  e.cooldown = 0;
  e.rocketSalvo = 0;
  e.rocketTarget = null;
  e.rocketCooldown = 0;
  if (!foe) return;
  const o = e.order;
  const named = (o?.kind === "attack" || o?.kind === "forceattack") && o.targetId != null && !o.auto;
  if (named || (o?.kind === "move" && !o.auto)) return;
  e.attackTarget = foe.id;
  e.order = { kind: "attack", targetId: foe.id, auto: true };
  e.state = "attack";
}

export function tickBombards(state: MatchState): void {
  const ring = BOMBARD_MIN_RANGE_TILES * state.tileSize;
  for (const a of state.entities.values()) {
    if (a.attackTarget == null || a.hp <= 0 || a.wreck || a.shutdown || a.dormant || isAirborne(a)) continue;
    const e = state.entities.get(a.attackTarget);
    if (!e || !armed(e) || allies(state, a.ownerId, e.ownerId)) continue;
    const d = Math.hypot(e.x - a.x, e.y - a.y);
    if (d > ring + e.radius) continue;
    if (d > weaponRangeWorld(state, a) + e.radius) continue;
    dropCannon(e, a);
  }
}
