import { airLoadoutOf, endlessAmmo, plasmaCellOf, supplyShortOf, TICK_DT } from "../catalog.js";
import { transferOnce } from "./supply.js";
import type { Entity, MatchState } from "./types.js";

/** Hand-outs one top-up may take: far more than any rack, belt, or drum holds. */
const TOP_UP_CAP = 4000;

/** Share of a drained cell that must regrow before its gun fires again (and never less than one shot). */
export const PLASMA_RESUME_SHARE = 0.1;

/**
 * Xenite weapons draw on the hive. Every tick, before anything fires, each Xenite unit and gun
 * gets back whatever it spent: shells, rockets, a belt, a drum, a jet's fuel, a plane's bomb
 * and rounds. So none of them ever runs dry, and none needs a truck, a pad, or a pool.
 * A magazine that reloads by itself still reloads: that is the gun's pace, not its stock.
 * A plasma cannon is the exception: its cell holds a few shots and regrows them one at a time,
 * so it fires a burst and then only as fast as the cell refills. Run dry, it holds fire until
 * PLASMA_RESUME_SHARE of the cell has regrown, so it does not trickle out a shot as each one returns.
 */
export function tickHiveAmmo(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) continue;
    const cell = plasmaCellOf(e.type);
    if (cell) {
      e.energy = Math.min(cell.shots, (e.energy ?? cell.shots) + TICK_DT / cell.rechargeSeconds);
      if (e.energyDrained && e.energy >= resumeShots(cell.shots)) e.energyDrained = undefined;
    }
    if (!endlessAmmo(e.type)) continue;
    topUp(e);
  }
}

/** Energy a drained cell of `shots` needs back before its gun fires again. */
export function resumeShots(shots: number): number {
  return Math.max(1, shots * PLASMA_RESUME_SHARE);
}

/** Shots of energy `e`'s plasma cell may spend now: 0 while drained and still regrowing, Infinity when its gun has no cell. */
export function plasmaShots(e: Entity): number {
  const cell = plasmaCellOf(e.type);
  if (!cell) return Infinity;
  return e.energyDrained ? 0 : (e.energy ?? cell.shots);
}

/** Share of `e`'s plasma cell charged, 0–1 to the hundredth. Undefined when its gun has no cell. */
export function plasmaCharge(e: Entity): number | undefined {
  const cell = plasmaCellOf(e.type);
  if (!cell || e.hp <= 0 || e.wreck) return undefined;
  return Math.round(((e.energy ?? cell.shots) / cell.shots) * 100) / 100;
}

/** The plasma cannon on `e` fired: draw `shots` (one round by default) from its cell. */
export function drawPlasma(e: Entity, shots = 1): void {
  const cell = plasmaCellOf(e.type);
  if (!cell) return;
  e.energy = Math.max(0, (e.energy ?? cell.shots) - shots);
  if (e.energy < 1) e.energyDrained = true;
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
