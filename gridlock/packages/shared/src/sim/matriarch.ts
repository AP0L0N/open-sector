import { MATRIARCH_BROOD, MATRIARCH_LAY_SECONDS } from "../catalog.js";
import { burrowBusy } from "./burrow.js";
import { makeEntity, nearestWalkable, tileCenter, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Matriarch lays Spawnlings. Every MATRIARCH_LAY_SECONDS she drops one behind her,
 * while fewer than MATRIARCH_BROOD of her own still live. A Spawnling she laid is her
 * owner's like any other; it outlives her. The clock waits while her brood is full, so the
 * next one comes a full interval after a gap opens.
 */
export function tickMatriarchs(state: MatchState, dt: number): void {
  let mothers: Entity[] | null = null;
  for (const e of state.entities.values()) {
    if (e.type !== "matriarch" || e.hp <= 0 || e.wreck || e.garrisonedIn != null || burrowBusy(e)) continue;
    (mothers ??= []).push(e);
  }
  if (!mothers) return;
  const brood = new Map<number, number>();
  for (const e of state.entities.values()) {
    if (e.matriarchOf == null || e.hp <= 0 || e.wreck) continue;
    brood.set(e.matriarchOf, (brood.get(e.matriarchOf) ?? 0) + 1);
  }
  for (const m of mothers) {
    if ((brood.get(m.id) ?? 0) >= MATRIARCH_BROOD) {
      m.matriarchLay = 0;
      continue;
    }
    m.matriarchLay = (m.matriarchLay ?? 0) + dt;
    if (m.matriarchLay < MATRIARCH_LAY_SECONDS) continue;
    if (lay(state, m)) m.matriarchLay = 0;
  }
}

/** Drop one Spawnling on open ground just behind her abdomen. False when there is no ground for it. */
export function lay(state: MatchState, mother: Entity): Entity | null {
  const back = mother.radius + 6;
  const bx = mother.x - Math.cos(mother.facing) * back;
  const by = mother.y - Math.sin(mother.facing) * back;
  const ts = state.tileSize;
  const spot = nearestWalkable(state, worldToTile(bx, ts), worldToTile(by, ts), "spawnling");
  if (!spot) return null;
  const x = spot.x === worldToTile(bx, ts) && spot.y === worldToTile(by, ts) ? bx : tileCenter(spot.x, ts);
  const y = spot.x === worldToTile(bx, ts) && spot.y === worldToTile(by, ts) ? by : tileCenter(spot.y, ts);
  const child = makeEntity(state, "spawnling", mother.ownerId, x, y, { facing: mother.facing });
  child.matriarchOf = mother.id;
  return child;
}
