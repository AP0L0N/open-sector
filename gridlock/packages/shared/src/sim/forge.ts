import { FORGE_REARM_PER_PASS, FORGE_REARM_SECONDS, FORGE_REARM_TILES, BORG_FACTORY, factionOf, secondsToTicks } from "../catalog.js";
import { needsSupply, transferOnce } from "./supply.js";
import type { Entity, MatchState } from "./types.js";

/**
 * The Borg drive no supply trucks. A standing Nanite Forge whose owner's power holds rearms
 * that owner's Borg units and buildings within FORGE_REARM_TILES of its footprint: every
 * FORGE_REARM_SECONDS each one short of shells, rockets, a belt, or fuel takes up to
 * FORGE_REARM_PER_PASS hand-outs, as from a truck that never runs out.
 */
export function tickForgeRearm(state: MatchState): void {
  if (state.tick % Math.max(1, secondsToTicks(FORGE_REARM_SECONDS)) !== 0) return;
  let forges: Entity[] | null = null;
  for (const e of state.entities.values()) {
    if (e.type !== BORG_FACTORY || e.kind !== "building" || e.hp <= 0 || e.wreck || e.unpowered) continue;
    (forges ??= []).push(e);
  }
  if (!forges) return;
  const ts = state.tileSize;
  for (const e of state.entities.values()) {
    if (e.type === BORG_FACTORY || factionOf(e.type) !== "borg" || !needsSupply(e)) continue;
    if (!forges.some((f) => f.ownerId === e.ownerId && besideForge(f, e, ts))) continue;
    const store = { supply: Infinity };
    for (let i = 0; i < FORGE_REARM_PER_PASS; i++) if (!transferOnce(store, e)) break;
  }
}

/** Within reach of the Forge's footprint edge. */
function besideForge(f: Entity, e: Entity, ts: number): boolean {
  const reach = FORGE_REARM_TILES * ts + e.radius;
  const nx = Math.max(f.tileX * ts, Math.min(e.x, (f.tileX + f.tileW) * ts));
  const ny = Math.max(f.tileY * ts, Math.min(e.y, (f.tileY + f.tileH) * ts));
  return Math.hypot(e.x - nx, e.y - ny) <= reach;
}
