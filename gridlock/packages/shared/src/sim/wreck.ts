import { wreckHpOf } from "../catalog.js";
import { occupyEntity, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/** Convert a destroyed armored hull into an impassable wreck. Repair is TODO. */
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
  e.harvestTile = null;
  e.autoHarvest = false;
  e.cooldown = 0;
  e.mgCooldown = 0;
  e.mgOverheat = 0;
  e.queue = [];
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
  occupyEntity(state, e);
}
