/**
 * Turn-in-place hull pose between two snapshots.
 *
 * The sim only rolls a tracked hull along its own axis and only yaws it while
 * it stands still, but one snapshot can cover several sim ticks (game speed).
 * A straight lerp between snapshot positions therefore cuts the corner and the
 * hull appears to slide diagonally. Rebuild the corner instead: roll along the
 * old heading to the pivot, yaw there, then roll along the new heading.
 */
export function lerpHullPose(
  prev: { x: number; y: number; facing: number },
  next: { x: number; y: number; facing: number },
  t: number,
  turnDegPerSec: number,
  gameSpeed: number,
  tickSec: number,
): { x: number; y: number; facing: number } {
  const u = Math.min(1, Math.max(0, t));
  let df = next.facing - prev.facing;
  while (df > Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  const maxRad = ((turnDegPerSec * Math.PI) / 180) * tickSec * Math.max(1, gameSpeed);
  const travelled = Math.hypot(next.x - prev.x, next.y - prev.y) >= 0.5;
  // A yaw bigger than one window's budget still has to leave time for the roll.
  const turnCap = travelled ? 0.75 : 1;
  const turnFrac = maxRad < 1e-9 ? 0 : Math.min(turnCap, Math.abs(df) / maxRad);
  if (turnFrac <= 1e-9) {
    return {
      x: prev.x + (next.x - prev.x) * u,
      y: prev.y + (next.y - prev.y) * u,
      facing: next.facing,
    };
  }
  const pivot = cornerPivot(prev, next);
  const moveFrac = 1 - turnFrac;
  // Roll before the yaw (to the pivot) and after it (from the pivot). Without a
  // usable pivot assume the hull yawed first — the common move-start case.
  const before = pivot ? pivot.before : 0;
  const after = pivot ? pivot.after : Math.hypot(next.x - prev.x, next.y - prev.y);
  const total = before + after;
  const f1 = total > 1e-9 ? moveFrac * (before / total) : 0;
  const f2 = moveFrac - f1;
  const px = pivot ? pivot.x : prev.x;
  const py = pivot ? pivot.y : prev.y;
  if (u < f1) {
    const k = u / f1;
    return { x: prev.x + (px - prev.x) * k, y: prev.y + (py - prev.y) * k, facing: prev.facing };
  }
  if (u < f1 + turnFrac) {
    const k = (u - f1) / turnFrac;
    return { x: px, y: py, facing: prev.facing + df * k };
  }
  if (f2 <= 1e-9) return { x: next.x, y: next.y, facing: next.facing };
  const k = Math.min(1, (u - f1 - turnFrac) / f2);
  return { x: px + (next.x - px) * k, y: py + (next.y - py) * k, facing: next.facing };
}

/**
 * Where the old heading line through `prev` meets the new heading line
 * through `next`. Returns the roll lengths on either side, or null when the
 * headings are (nearly) parallel or the corner is longer than one snapshot of
 * travel could explain (a shove, a teleport, or two yaws in one window).
 */
export function cornerPivot(
  prev: { x: number; y: number; facing: number },
  next: { x: number; y: number; facing: number },
): { x: number; y: number; before: number; after: number } | null {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 0.5) return null;
  const ax = Math.cos(prev.facing);
  const ay = Math.sin(prev.facing);
  const bx = Math.cos(next.facing);
  const by = Math.sin(next.facing);
  const cross = ax * by - ay * bx;
  if (Math.abs(cross) < 1e-3) return null;
  // prev + a·A = next − b·B  ⇒  a·A + b·B = D
  const a = (dx * by - dy * bx) / cross;
  const b = (ax * dy - ay * dx) / cross;
  const before = Math.abs(a);
  const after = Math.abs(b);
  if (before + after > chord * 2.5 + 1) return null;
  return { x: prev.x + ax * a, y: prev.y + ay * a, before, after };
}
