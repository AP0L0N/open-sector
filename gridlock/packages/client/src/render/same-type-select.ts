import type { EntityView } from "@gridlock/shared";

/** Max gap between the two clicks of a double click, in ms. */
export const DOUBLE_CLICK_MS = 400;
/** Max drift between the two clicks of a double click, in view pixels. */
export const DOUBLE_CLICK_SLOP = 6;

export interface ClickMark {
  id: number;
  x: number;
  y: number;
  t: number;
}

/** True when `now` is the second click on the same unit, close in time and place. */
export function isDoubleClick(prev: ClickMark | null, now: ClickMark): boolean {
  if (!prev || prev.id !== now.id) return false;
  if (now.t - prev.t > DOUBLE_CLICK_MS) return false;
  return Math.abs(now.x - prev.x) <= DOUBLE_CLICK_SLOP && Math.abs(now.y - prev.y) <= DOUBLE_CLICK_SLOP;
}

/**
 * Your live, loose units of `picked`'s type whose screen point lies inside the view.
 * `screenOf` maps an entity to view pixels; the view spans 0..w, 0..h.
 */
export function sameTypeOnScreen(
  entities: readonly EntityView[],
  picked: EntityView,
  youPlayerId: string,
  view: { w: number; h: number },
  screenOf: (e: EntityView) => { x: number; y: number },
): number[] {
  const ids: number[] = [];
  for (const e of entities) {
    if (e.kind !== "unit" || e.type !== picked.type || e.ownerId !== youPlayerId) continue;
    // A Wasp off a Hive Ark's pod is the Ark's, not yours to command.
    if (e.wreck || e.hp <= 0 || e.garrisonedIn || e.arkOf != null) continue;
    const s = screenOf(e);
    if (s.x >= 0 && s.x <= view.w && s.y >= 0 && s.y <= view.h) ids.push(e.id);
  }
  return ids;
}
