import { CLUTTER_HIT_REACH, CLUTTER_HP, GARRISON_STRUCTURAL_CALIBER } from "../catalog.js";
import { getMap, type MapClutter, type MapDef } from "../maps.js";
import type { Entity, MatchState } from "./types.js";

/**
 * Breakable map clutter: crates, drums, a cart. The map lists the pieces; the
 * match keeps how many rounds each has left. Nothing here blocks a path or a
 * line of sight. A smashed piece stays flat on the ground for the match.
 */

/** Full rounds for every piece of `map`'s clutter, in map order. */
export function freshClutterHp(map: MapDef): number[] {
  return (map.clutter ?? []).map((c) => CLUTTER_HP[c.type]);
}

function clutterOf(state: MatchState): readonly MapClutter[] {
  return getMap(state.mapId)?.clutter ?? [];
}

/** Indices of smashed pieces, ascending. */
export function brokenClutter(state: MatchState): number[] {
  const out: number[] = [];
  state.clutterHp.forEach((hp, i) => {
    if (hp <= 0) out.push(i);
  });
  return out;
}

/** Take `damage` off every standing piece within `reach` world px of (x, y). Infinity breaks it. */
function hurtNear(state: MatchState, x: number, y: number, reach: number, damage: number): void {
  if (state.clutterHp.length === 0) return;
  const list = clutterOf(state);
  const ts = state.tileSize;
  const r2 = reach * reach;
  for (let i = 0; i < list.length; i++) {
    if ((state.clutterHp[i] ?? 0) <= 0) continue;
    const c = list[i]!;
    const dx = (c.x + 0.5) * ts - x;
    const dy = (c.y + 0.5) * ts - y;
    if (dx * dx + dy * dy > r2) continue;
    state.clutterHp[i] = Math.max(0, (state.clutterHp[i] ?? 0) - damage);
  }
}

/** A round that came down at (x, y): heavy shells break what they land on, lighter ones chip at it. */
export function hitClutter(state: MatchState, x: number, y: number, caliber: number, damage: number): void {
  if (damage <= 0) return;
  hurtNear(state, x, y, CLUTTER_HIT_REACH, caliber >= GARRISON_STRUCTURAL_CALIBER ? Infinity : damage);
}

/** A ground burst breaks every piece inside its radius. */
export function blastClutter(state: MatchState, x: number, y: number, radius: number): void {
  hurtNear(state, x, y, radius + CLUTTER_HIT_REACH * 0.5, Infinity);
}

/** A motor vehicle on the move rolls flat whatever clutter it drives over. The caller checks it is one. */
export function crushClutterUnder(state: MatchState, e: Entity): void {
  hurtNear(state, e.x, e.y, e.radius + state.tileSize * 0.35, Infinity);
}
