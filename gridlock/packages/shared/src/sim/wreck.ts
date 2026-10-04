import { WRECK_BLAST_MUL, isNavalType, wreckHpOf, wreckScrapOf } from "../catalog.js";
import { shoveFromWreck } from "./collision.js";
import { occupyEntity, worldToTile } from "./geo.js";
import { mortarFalloff } from "./mortar.js";
import { hideScout } from "./scout.js";
import { earnScrap } from "./smelter.js";
import type { Entity, MatchState } from "./types.js";

/**
 * Convert a destroyed armored hull into an impassable wreck. An engineer can scrap it.
 * A ship settles on the bottom where it went down, and its hulk blocks the water the same way.
 */
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
  // A submarine sinks in plain sight: its hulk is never hidden as a dive.
  e.dive = undefined;
  hideScout(state, e);
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
  occupyEntity(state, e);
  shoveFromWreck(state, e);
}

/** A ship's hulk on the bottom. Engineers stay ashore: only a boat can salvage it. */
export function isSunkWreck(e: Entity): boolean {
  return e.wreck && e.hp > 0 && e.kind === "unit" && isNavalType(e.type);
}

/** Cut a hulk apart: its scrap goes to the salvager's commander, and the wreck clears on the next tick. */
export function salvageWreck(state: MatchState, playerId: string, wreck: Entity): void {
  if (!wreck.wreck || wreck.hp <= 0) return;
  const player = state.players.get(playerId);
  if (player) earnScrap(state, player, wreckScrapOf(wreck.type));
  wreck.hp = 0;
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
