import { UNIT_SPACE_PAD, type EntityType } from "../catalog.js";
import { walkable, worldToTile } from "./geo.js";
import type { Entity, MatchState, Vec } from "./types.js";

const SEARCH_STEP = 4;

export function unitClearance(radiusA: number, radiusB: number): number {
  return radiusA + radiusB + UNIT_SPACE_PAD;
}

function occupied(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const min = unitClearance(ar, br);
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < min * min;
}

function inWorld(state: MatchState, x: number, y: number): boolean {
  const ts = state.tileSize;
  return x >= 0 && y >= 0 && x < state.width * ts && y < state.height * ts;
}

function tileWalkable(state: MatchState, x: number, y: number, type?: EntityType): boolean {
  const ts = state.tileSize;
  const tx = worldToTile(x, ts);
  const ty = worldToTile(y, ts);
  return walkable(state, tx, ty, type);
}

function isClear(
  state: MatchState,
  x: number,
  y: number,
  radius: number,
  placed: readonly { x: number; y: number; radius: number }[],
  type?: EntityType,
): boolean {
  if (!inWorld(state, x, y)) return false;
  if (!tileWalkable(state, x, y, type)) return false;
  for (const p of placed) {
    if (occupied(x, y, radius, p.x, p.y, p.radius)) return false;
  }
  return true;
}

function nearestClear(
  state: MatchState,
  x: number,
  y: number,
  radius: number,
  placed: readonly { x: number; y: number; radius: number }[],
  type?: EntityType,
): Vec {
  if (isClear(state, x, y, radius, placed, type)) return { x, y };

  const maxR = Math.max(state.width, state.height) * state.tileSize;
  for (let rad = SEARCH_STEP; rad < maxR; rad += SEARCH_STEP) {
    const n = Math.max(8, Math.round((Math.PI * 2 * rad) / SEARCH_STEP));
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (isClear(state, px, py, radius, placed, type)) return { x: px, y: py };
    }
  }
  return { x, y };
}

/**
 * Destinations for a group move: keep relative layout around the click,
 * then honor each unit's reserved radius so they do not stack.
 */
export function groupMoveTargets(state: MatchState, units: Entity[], destX: number, destY: number): Map<number, Vec> {
  const out = new Map<number, Vec>();
  if (units.length === 0) return out;
  if (units.length === 1) {
    const u = units[0]!;
    out.set(u.id, { x: destX, y: destY });
    return out;
  }

  let cx = 0;
  let cy = 0;
  for (const u of units) {
    cx += u.x;
    cy += u.y;
  }
  cx /= units.length;
  cy /= units.length;

  const order = units.slice().sort((a, b) => {
    if (b.radius !== a.radius) return b.radius - a.radius;
    const aa = Math.atan2(a.y - cy, a.x - cx);
    const ba = Math.atan2(b.y - cy, b.x - cx);
    if (aa !== ba) return aa - ba;
    return a.id - b.id;
  });

  const placed: { x: number; y: number; radius: number }[] = [];
  for (const u of order) {
    const prefX = destX + (u.x - cx);
    const prefY = destY + (u.y - cy);
    const spot = nearestClear(state, prefX, prefY, u.radius, placed, u.type);
    placed.push({ x: spot.x, y: spot.y, radius: u.radius });
    out.set(u.id, spot);
  }
  return out;
}
