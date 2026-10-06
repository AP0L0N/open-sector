import { isRubble, leavesRubble } from "../catalog.js";
import { spillGarrison } from "./garrison.js";
import type { Entity, MatchState } from "./types.js";
import { endOrdersOnKill } from "./wreck.js";

/** What is left of a fallen house. Nothing wears it down any further. */
export const RUBBLE_HP = 1;

/**
 * Bring a civilian building down to its rubble. The heap keeps the footprint off
 * limits to every unit, but it is too low to hide anything behind it: sight rays and
 * rounds pass over it. Anyone inside spills onto the street first, hurt as before.
 * Nothing can hurt the heap, enter it, or repair it.
 */
export function toRubble(state: MatchState, e: Entity): void {
  if (e.kind !== "building" || e.ruined || !leavesRubble(e.type)) return;
  if (e.garrison.length) spillGarrison(state, e);
  // The heap keeps the house's id on `occupy`; the sight grid drops it on its next rebuild.
  e.ruined = true;
  e.hp = RUBBLE_HP;
  e.hpMax = RUBBLE_HP;
  e.state = "idle";
  e.order = null;
  e.waypoints = [];
  e.attackTarget = null;
  e.queue = [];
  e.crits = [];
  e.garrison = [];
  e.garrisonHide = false;
  endOrdersOnKill(state, e);
  // The cover under every observer changed: the next snapshot repaints sight from scratch.
  state.visionByPlayer.clear();
  state.visionKeyByPlayer.clear();
  state.visionTick = -1;
}

/** Rubble shrugs off anything that reaches it: a burst or a fire leaves the heap as it was. */
export function keepRubbleStanding(e: Entity): boolean {
  if (!isRubble(e)) return false;
  e.hp = RUBBLE_HP;
  return true;
}
