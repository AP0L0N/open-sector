import { WRECK_BLAST_MUL, wreckHpOf } from "../catalog.js";
import { shoveFromWreck } from "./collision.js";
import { occupyEntity, worldToTile } from "./geo.js";
import { mortarFalloff } from "./mortar.js";
import { hideScout } from "./scout.js";
import type { Entity, MatchState } from "./types.js";

/** Convert a destroyed armored hull into an impassable wreck. An engineer can scrap it. */
export function toWreck(state: MatchState, e: Entity): void {
  if (e.wreck) return;
  e.wreck = true;
  e.state = "wreck";
  const hp = wreckHpOf(e.type);
  e.hp = hp;
  e.hpMax = hp;
  e.order = null;
  e.waypoints = [];
  e.attackTarget = null;
  e.cooldown = 0;
  e.reload = 0;
  e.mgCooldown = 0;
  e.mgOverheat = 0;
  e.queue = [];
  hideScout(state, e);
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
  occupyEntity(state, e);
  shoveFromWreck(state, e);
}

/**
 * A ground burst tears at every hulk it reaches, whoever's it was. The plate is
 * cooked and holed, so the blast's soft damage counts, scaled by WRECK_BLAST_MUL.
 */
export function blastWrecks(state: MatchState, x: number, y: number, radius: number, damage: number): void {
  for (const e of state.entities.values()) {
    if (!e.wreck || e.hp <= 0 || e.kind !== "unit") continue;
    const d = Math.max(0, Math.hypot(e.x - x, e.y - y) - e.radius);
    if (d > radius) continue;
    const dmg = Math.max(1, Math.round(damage * WRECK_BLAST_MUL * mortarFalloff(d, radius)));
    e.hp = Math.max(0, e.hp - dmg);
  }
}
