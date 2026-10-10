import {
  ACID_CORRODE_MAX_SHARE,
  ACID_CORRODE_MM,
  ACID_CORRODE_SECONDS,
  catalog,
  secondsToTicks,
  type CatalogEntry,
} from "../catalog.js";
import { isArmored } from "./ballistics.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Spitter's acid on a hull. Every glob that lands on a live armored unit adds
 * ACID_CORRODE_MM to the coat, whatever face it struck and whether it bit; the coat comes off
 * every face, never more than ACID_CORRODE_MAX_SHARE of a plate, and dries all at once
 * ACID_CORRODE_SECONDS after the last glob. Hits read the thinner plate through corrodedDef.
 */

/** The coat still eating the plate, in mm, or 0. */
export function acidMm(e: Pick<Entity, "acid">, tick: number): number {
  const a = e.acid;
  return a && tick < a.until ? a.mm : 0;
}

/** A glob lands on `e`. Only a live armored unit takes the coat. */
export function coatAcid(state: MatchState, e: Entity): boolean {
  if (e.kind !== "unit" || e.wreck || e.hp <= 0 || !isArmored(catalog(e.type))) return false;
  const def = catalog(e.type);
  const most = Math.max(def.armorFront, def.armorSide, def.armorRear) * ACID_CORRODE_MAX_SHARE;
  const mm = Math.min(most, acidMm(e, state.tick) + ACID_CORRODE_MM);
  e.acid = { mm, until: state.tick + secondsToTicks(ACID_CORRODE_SECONDS) };
  return true;
}

/** `def` with the coat taken off each face, never past ACID_CORRODE_MAX_SHARE of that face. */
export function corrodedDef(e: Pick<Entity, "acid">, def: CatalogEntry, tick: number): CatalogEntry {
  const mm = acidMm(e, tick);
  if (mm <= 0) return def;
  const eat = (n: number) => Math.max(n * (1 - ACID_CORRODE_MAX_SHARE), n - mm);
  return { ...def, armorFront: eat(def.armorFront), armorSide: eat(def.armorSide), armorRear: eat(def.armorRear) };
}

/** Drop dried coats so the entity carries nothing it no longer needs. */
export function tickAcid(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.acid && state.tick >= e.acid.until) e.acid = undefined;
  }
}
