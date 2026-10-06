/**
 * Smelter economy. A Smelter stands on a scrap field and melts it down for the
 * whole match: the field never runs out, and every Smelter adds its own share.
 * A Smelter on diamond scrap pours DIAMOND_SCRAP_MUL times the plain rate.
 */

import {
  DIAMOND_SCRAP_MUL,
  DIAMOND_SCRAP_TILE_YIELD,
  SCRAP_CAP_PER_SMELTER,
  SMELTER_CLEARANCE,
  SMELTER_SCRAP_COVER,
  SMELTER_SCRAP_PER_SEC,
  catalog,
} from "../catalog.js";
import { footprintGap, scrapAt, scrapTilesUnder, tilesBlocked } from "./geo.js";
import { powerOf, productionSpeed } from "./power.js";
import type { AiDifficulty } from "../protocol.js";
import type { Entity, MatchState, SimPlayer } from "./types.js";

/** The CPU's head start: its Smelters pour this many times the normal rate. */
export const AI_SMELTER_MUL: Readonly<Record<AiDifficulty, number>> = { easy: 2 };

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

/** A Smelter footprint at (tx, ty) would come within SMELTER_CLEARANCE tiles of a standing one, anyone's. */
export function smelterCrowded(
  entities: Iterable<Pick<Entity, "kind" | "type" | "hp" | "tileX" | "tileY" | "tileW" | "tileH"> & { wreck?: boolean }>,
  tx: number,
  ty: number,
): boolean {
  const def = catalog("smelter");
  for (const e of entities) {
    if (e.kind !== "building" || e.type !== "smelter" || e.hp <= 0 || e.wreck) continue;
    if (footprintGap(tx, ty, def.tileW, def.tileH, e.tileX, e.tileY, e.tileW, e.tileH) <= SMELTER_CLEARANCE) return true;
  }
  return false;
}

/**
 * Open ground with enough scrap under it, clear of other Smelters: where a Smelter may be placed.
 * A standing tree is no bar. Raising the building fells it, the same as any other structure.
 */
export function smelterSiteOk(state: MatchState, tx: number, ty: number): boolean {
  const def = catalog("smelter");
  if (tilesBlocked(state, tx, ty, def.tileW, def.tileH, false)) return false;
  if (smelterCrowded(state.entities.values(), tx, ty)) return false;
  return smelterOnScrap(state, tx, ty);
}

/**
 * Scrap a second a Smelter at (tx, ty) pours at full power, read from each tile's
 * scrap yield. 0 off scrap. Diamond scrap under most of its scrap multiplies it.
 * Takes a lookup so the HUD can ask the same question of a snapshot.
 */
export function smelterRateOn(yieldAt: (x: number, y: number) => number, tx: number, ty: number): number {
  const def = catalog("smelter");
  let plain = 0;
  let diamond = 0;
  for (let y = ty; y < ty + def.tileH; y++) {
    for (let x = tx; x < tx + def.tileW; x++) {
      const v = yieldAt(x, y);
      if (v >= DIAMOND_SCRAP_TILE_YIELD) diamond++;
      else if (v > 0) plain++;
    }
  }
  if (plain + diamond < smelterScrapNeeded()) return 0;
  return SMELTER_SCRAP_PER_SEC * (diamond > plain ? DIAMOND_SCRAP_MUL : 1);
}

/** A standing Smelter on its scrap field. */
export function smelterYields(state: MatchState, e: Entity): boolean {
  return e.kind === "building" && e.type === "smelter" && e.hp > 0 && !e.wreck && smelterOnScrap(state, e.tileX, e.tileY);
}

/** Scrap a second this commander's Smelters earn at full power, the CPU's head start included. */
export function smelterIncome(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && smelterYields(state, e)) {
      n += smelterRateOn((x, y) => scrapAt(state, x, y), e.tileX, e.tileY);
    }
  }
  const ai = state.players.get(playerId)?.ai;
  return ai ? n * AI_SMELTER_MUL[ai] : n;
}

/** Smelters this commander has standing, finished or not on scrap. */
export function smelterCount(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && e.kind === "building" && e.type === "smelter" && e.hp > 0 && !e.wreck) n++;
  }
  return n;
}

/** Most scrap this commander can hold: SCRAP_CAP_PER_SMELTER for each standing Smelter. */
export function scrapCap(state: MatchState, playerId: string): number {
  return smelterCount(state, playerId) * SCRAP_CAP_PER_SMELTER;
}

/**
 * Credit earned scrap up to the commander's cap. Scrap already held over the cap
 * (a Smelter fell) is kept, it just earns nothing more. Returns the amount credited.
 */
export function earnScrap(state: MatchState, p: SimPlayer, n: number): number {
  const room = Math.max(0, scrapCap(state, p.playerId) - p.scrap);
  const got = Math.max(0, Math.min(Math.floor(n), room));
  p.scrap += got;
  return got;
}

/** Pay every commander for the Smelters standing on scrap. Short power slows the pour like production. */
export function tickSmelters(state: MatchState, dt: number): void {
  for (const p of state.players.values()) {
    if (!p.alive) continue;
    const rate = smelterIncome(state, p.playerId);
    if (rate <= 0) continue;
    // A full store melts nothing: drop the fraction so it does not pile up behind the cap.
    if (p.scrap >= scrapCap(state, p.playerId)) {
      p.scrapCarry = 0;
      continue;
    }
    const pow = powerOf(state, p.playerId);
    p.scrapCarry += rate * productionSpeed(pow.provided, pow.used) * dt;
    // Pay whole points so the counter never shows a fraction.
    const whole = Math.floor(p.scrapCarry + 1e-9);
    if (whole <= 0) continue;
    earnScrap(state, p, whole);
    p.scrapCarry -= whole;
  }
}
