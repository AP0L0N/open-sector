import { ASSEMBLER_REGEN_SECONDS, ASSEMBLER_SPEEDUP, ASSEMBLER_THRALLS, TICK_DT, UNIT_CAP, catalog, secondsToTicks } from "../catalog.js";
import { openSpotNear } from "./formation.js";
import { makeEntity, ownedUnits, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Assembler: a small walking nanite forge. From the moment it leaves the Forge it builds
 * Thralls on its own, ASSEMBLER_SPEEDUP times as fast as a Forge would, and sets each one down
 * behind it. Every Thrall spends 1 / ASSEMBLER_THRALLS of its energy. When one of its Thralls is
 * gone, that share flows slowly back (one Thrall's worth every ASSEMBLER_REGEN_SECONDS), and once a
 * whole Thrall's worth is back it starts building again. So it never holds more energy than its
 * living Thralls leave room for. Its Thralls are Thralls like any other: its side's, under the unit
 * cap, on the uplink. At the cap the Assembler holds the next one (and its energy) until there is room.
 *
 * `energy` counts the Thralls it can build, fractional while it regrows (undefined = full).
 */

export function isAssembler(type: string): boolean {
  return type === "assembler";
}

/** Thralls the Assembler `e` can build now, fractional while its energy regrows. */
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
  const alive = new Map<number, number>();
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.wreck) continue;
    if (isAssembler(e.type)) forges.push(e);
    else if (e.assembledBy != null) alive.set(e.assembledBy, (alive.get(e.assembledBy) ?? 0) + 1);
  }
  const regen = TICK_DT / ASSEMBLER_REGEN_SECONDS;
  for (const f of forges) {
    // Each lost Thrall's share flows back, slowly, up to what its living Thralls leave room for.
    const room = ASSEMBLER_THRALLS - (alive.get(f.id) ?? 0);
    const charges = assemblerCharges(f);
    if (charges < room) f.energy = Math.min(room, charges + regen);
    if (assemblerCharges(f) < 1) {
      // Not a whole Thrall's worth yet: the bay waits, and starts a fresh Thrall once it is.
      f.assemblyDone = undefined;
      continue;
    }
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
