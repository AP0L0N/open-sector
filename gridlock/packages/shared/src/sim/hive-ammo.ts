import { airLoadoutOf, endlessAmmo, supplyShortOf } from "../catalog.js";
import { transferOnce } from "./supply.js";
import type { Entity, MatchState } from "./types.js";

/** Hand-outs one top-up may take: far more than any rack, belt, or drum holds. */
const TOP_UP_CAP = 4000;

/**
 * Borg weapons draw on the hive. Every tick, before anything fires, each Borg unit and gun
 * gets back whatever it spent: shells, rockets, a belt, a drum, a jet's fuel, a plane's bomb
 * and rounds. So none of them ever runs dry, and none needs a truck, a pad, or a pool.
 * A magazine that reloads by itself still reloads: that is the gun's pace, not its stock.
 */
export function tickHiveAmmo(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck || !endlessAmmo(e.type)) continue;
    topUp(e);
  }
}

/** Fill every finite store `e` carries to the catalog's full load. */
export function topUp(e: Entity): void {
  if (supplyShortOf(e.type, e.ammo, e.mgAmmo, e.clip, e.rockets, e.heavy, e.minePacks)) {
    const store = { supply: Infinity };
    for (let i = 0; i < TOP_UP_CAP; i++) if (!transferOnce(store, e)) break;
  }
  const a = e.air;
  if (a && a.phase !== "crash") {
    const load = airLoadoutOf(e.type);
    if (a.bombs < load.bombs && a.payload !== "troops") a.bombs = load.bombs;
    if (a.rounds < load.rounds) a.rounds = load.rounds;
  }
}
