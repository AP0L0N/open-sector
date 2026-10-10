import { ASSEMBLER_SPEEDUP, ASSEMBLER_THRALLS, UNIT_CAP, catalog, secondsToTicks } from "../catalog.js";
import { openSpotNear } from "./formation.js";
import { makeEntity, ownedUnits, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Assembler: a small walking nanite forge. From the moment it leaves the Forge it builds
 * Thralls on its own, ASSEMBLER_SPEEDUP times as fast as a Forge would, and sets each one down
 * behind it. Every Thrall spends 1 / ASSEMBLER_THRALLS of its energy; empty, it builds no more.
 * Its Thralls are Thralls like any other: its side's, under the unit cap, on the uplink. At the
 * cap the Assembler holds the next one (and its energy) until there is room.
 *
 * `energy` counts the Thralls it has left to build (undefined = full).
 */

export function isAssembler(type: string): boolean {
  return type === "assembler";
}

/** Thralls the Assembler `e` can still build. */
export function assemblerCharges(e: Entity): number {
  return e.energy ?? ASSEMBLER_THRALLS;
}

/** Share of the Assembler's energy left, 0–1 to the hundredth. Undefined for anything else. */
export function assemblerCharge(e: Entity): number | undefined {
  if (!isAssembler(e.type) || e.hp <= 0 || e.wreck) return undefined;
  return Math.round((assemblerCharges(e) / ASSEMBLER_THRALLS) * 100) / 100;
}

/** Ticks one Assembler Thrall takes: a Forge Thrall's build time over ASSEMBLER_SPEEDUP. */
export function assemblyTicks(): number {
  return secondsToTicks(catalog("thrall").buildSeconds / ASSEMBLER_SPEEDUP);
}

/** A finished Thrall out of the Assembler's bay, on open ground behind it. */
export function assembleThrall(state: MatchState, forge: Entity): Entity {
  const back = forge.radius + 8;
  const x = forge.x - Math.cos(forge.facing) * back;
  const y = forge.y - Math.sin(forge.facing) * back;
  const u = makeEntity(state, "thrall", forge.ownerId, x, y, { facing: forge.facing });
  const spot = openSpotNear(state, u, x, y);
  u.x = spot.x;
  u.y = spot.y;
  u.tileX = worldToTile(spot.x, state.tileSize);
  u.tileY = worldToTile(spot.y, state.tileSize);
  u.assembledBy = forge.id;
  return u;
}

export function tickAssemblers(state: MatchState): void {
  const forges: Entity[] = [];
  for (const e of state.entities.values()) {
    if (isAssembler(e.type) && e.hp > 0 && !e.wreck && assemblerCharges(e) > 0) forges.push(e);
  }
  for (const f of forges) {
    if (f.assemblyDone == null) {
      f.assemblyDone = state.tick + assemblyTicks();
      continue;
    }
    if (state.tick < f.assemblyDone) continue;
    // A full army: the finished Thrall waits in the bay.
    if (ownedUnits(state, f.ownerId) >= UNIT_CAP) continue;
    assembleThrall(state, f);
    f.energy = assemblerCharges(f) - 1;
    f.assemblyDone = state.tick + assemblyTicks();
  }
}
