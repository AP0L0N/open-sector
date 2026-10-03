/**
 * Smelter economy. A Smelter stands on a scrap field and melts it down for the
 * whole match: the field never runs out, and every Smelter adds its own share.
 */

import { SMELTER_SCRAP_COVER, SMELTER_SCRAP_PER_SEC, catalog } from "../catalog.js";
import { scrapTilesUnder, tilesBlocked } from "./geo.js";
import { powerOf, productionSpeed } from "./power.js";
import type { Entity, MatchState } from "./types.js";

/** Scrap tiles a Smelter footprint needs under it. */
export function smelterScrapNeeded(): number {
  const def = catalog("smelter");
  return Math.ceil(def.tileW * def.tileH * SMELTER_SCRAP_COVER);
}

/** Enough of the footprint at (tx, ty) lies on scrap. */
export function smelterOnScrap(state: MatchState, tx: number, ty: number): boolean {
  const def = catalog("smelter");
  return scrapTilesUnder(state, tx, ty, def.tileW, def.tileH) >= smelterScrapNeeded();
}

/** Clear ground with enough scrap under it: where a Smelter may be placed. */
export function smelterSiteOk(state: MatchState, tx: number, ty: number): boolean {
  const def = catalog("smelter");
  if (tilesBlocked(state, tx, ty, def.tileW, def.tileH)) return false;
  return smelterOnScrap(state, tx, ty);
}

/** A standing Smelter on its scrap field. */
export function smelterYields(state: MatchState, e: Entity): boolean {
  return e.kind === "building" && e.type === "smelter" && e.hp > 0 && !e.wreck && smelterOnScrap(state, e.tileX, e.tileY);
}

/** Scrap a second this commander's Smelters earn at full power. */
export function smelterIncome(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && smelterYields(state, e)) n++;
  }
  return n * SMELTER_SCRAP_PER_SEC;
}

/** Pay every commander for the Smelters standing on scrap. Short power slows the pour like production. */
export function tickSmelters(state: MatchState, dt: number): void {
  for (const p of state.players.values()) {
    if (!p.alive) continue;
    const rate = smelterIncome(state, p.playerId);
    if (rate <= 0) continue;
    const pow = powerOf(state, p.playerId);
    p.scrapCarry += rate * productionSpeed(pow.provided, pow.used) * dt;
    // Pay whole points so the counter never shows a fraction.
    const whole = Math.floor(p.scrapCarry + 1e-9);
    if (whole <= 0) continue;
    p.scrap += whole;
    p.scrapCarry -= whole;
  }
}
