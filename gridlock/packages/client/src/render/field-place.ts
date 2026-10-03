/**
 * Laying a field line in legs. The player presses to set the start, drags or
 * clicks to set each corner, and the line is sent to the sim as one order when
 * he confirms. Pure state so the map view's handlers stay thin and this can be
 * tested without a canvas.
 */

export interface Pt {
  x: number;
  y: number;
}

/**
 * The corners after a press at `press` and a release at `release`. The first
 * press starts the line; a drag long enough to hold a piece also pins its end,
 * a short one pins only the start. Every later release pins one more corner,
 * wherever the press was: the leg runs from the end of the last one.
 */
export function pinFieldPoint(points: readonly Pt[], press: Pt, release: Pt, minDrag: number): Pt[] {
  if (points.length === 0) {
    if (Math.hypot(release.x - press.x, release.y - press.y) >= minDrag) return [press, release];
    return [press];
  }
  return [...points, release];
}

/** Take back the last corner. The start goes with the first leg. */
export function undoFieldPoint(points: readonly Pt[]): Pt[] {
  if (points.length <= 2) return [];
  return points.slice(0, -1);
}

/**
 * The corners to draw and to send: the pinned ones plus the cursor as the live
 * leg's end, when there is a line to continue. With no pin and a press held, the
 * press is the start.
 */
export function fieldPointsWithCursor(points: readonly Pt[], press: Pt | null, cursor: Pt): Pt[] {
  if (points.length > 0) return [...points, cursor];
  if (press) return [press, cursor];
  return [cursor];
}
