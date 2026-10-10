import { BROOD_FIRST_SECONDS, BROOD_MAX, BROOD_SECONDS, UNIT_CAP, secondsToTicks } from "../catalog.js";
import { openSpotNear } from "./formation.js";
import { makeEntity, ownedUnits, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Broodmother's sac. BROOD_FIRST_SECONDS after she comes out of the Forge, and then every
 * BROOD_SECONDS while fewer than BROOD_MAX Thralls born of her live, one tears out beside her
 * rear. A brood Thrall is a Thrall like any other: its side's, under the unit cap, on the uplink.
 * At the cap the sac holds the Thrall until there is room.
 */

export function isBroodmother(type: string): boolean {
  return type === "broodmother";
}

/** Her brood still alive. */
export function broodAlive(state: MatchState, mother: Entity): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.broodOf === mother.id && e.hp > 0 && !e.wreck) n++;
  }
  return n;
}

/** A Thrall out of the sac, on open ground behind her. */
export function birthThrall(state: MatchState, mother: Entity): Entity {
  const back = mother.radius + 10;
  const x = mother.x - Math.cos(mother.facing) * back;
  const y = mother.y - Math.sin(mother.facing) * back;
  const u = makeEntity(state, "thrall", mother.ownerId, x, y, { facing: mother.facing });
  const spot = openSpotNear(state, u, x, y);
  u.x = spot.x;
  u.y = spot.y;
  u.tileX = worldToTile(spot.x, state.tileSize);
  u.tileY = worldToTile(spot.y, state.tileSize);
  u.broodOf = mother.id;
  return u;
}

export function tickBrood(state: MatchState): void {
  const mothers: Entity[] = [];
  for (const e of state.entities.values()) {
    if (isBroodmother(e.type) && e.hp > 0 && !e.wreck) mothers.push(e);
  }
  for (const m of mothers) {
    if (m.broodNext == null) {
      m.broodNext = state.tick + secondsToTicks(BROOD_FIRST_SECONDS);
      continue;
    }
    if (state.tick < m.broodNext) continue;
    // A full brood or a full army: the sac keeps the next one ready.
    if (broodAlive(state, m) >= BROOD_MAX || ownedUnits(state, m.ownerId) >= UNIT_CAP) continue;
    birthThrall(state, m);
    m.broodNext = state.tick + secondsToTicks(BROOD_SECONDS);
  }
}
