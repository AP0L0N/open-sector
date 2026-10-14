import { CHEAT_SCRAP, usesHiveEnergy } from "../catalog.js";
import type { MatchState } from "./types.js";

/**
 * The skirmish cheat (0 pressed five times). The side keeps CHEAT_POWER more power, or the
 * Xenite CHEAT_ENERGY more hive energy, for the rest of the match, and an Alliance side's scrap
 * is topped up to CHEAT_SCRAP. Turning it on again tops the scrap up again. The hub only lets a
 * skirmish or a play test ask for it.
 */
export function grantCheat(state: MatchState, playerId: string): boolean {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return false;
  p.cheat = true;
  if (!usesHiveEnergy(p.faction)) p.scrap = Math.max(p.scrap, CHEAT_SCRAP);
  return true;
}
