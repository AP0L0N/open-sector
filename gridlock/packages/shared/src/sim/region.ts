/**
 * Coarse ground regions: the map in REGION_CELL-tile cells, a cell passable when any tile in it
 * is walkable, cells joined 8-ways and labelled. Two tiles in different regions have no path
 * between them, so a chase toward unreachable ground is refused at once instead of flooding the
 * whole map with a search. The converse is not promised: the same region only means the search
 * is worth running.
 */
import { isInfantryType, isMotorVehicle, isNavalType, rollsThroughWoods, vaultsWalls, wadesOf, type EntityType } from "../catalog.js";
import { groundKey, walkable } from "./geo.js";
import type { MatchState } from "./types.js";

export const REGION_CELL = 4;

/** Everything `walkable` reads off a unit type, as one short string, so types that walk alike share one map. */
const classMemo = new Map<string, string>();
export function pathClass(type: EntityType | undefined): string {
  if (!type) return "-";
  let c = classMemo.get(type);
  if (c === undefined) {
    c = isNavalType(type)
      ? `n:${type}`
      : (vaultsWalls(type) ? "v" : "") +
        (isInfantryType(type) ? "i" : "") +
        (wadesOf(type) ? "w" : "") +
        (isMotorVehicle(type) ? "m" : "") +
        (rollsThroughWoods(type) ? "r" : "");
    if (c === "") c = "x";
    classMemo.set(type, c);
  }
  return c;
}

interface Regions {
  key: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  /** Region id per cell, from 1. 0 where no tile in the cell is walkable. */
  label: Int32Array;
}

const regionCache = new WeakMap<MatchState, Map<string, Regions>>();

/** What the regions depend on beyond the ground key: felled trees open ground to hulls. */
function regionKeyOf(state: MatchState): number {
  return (groundKey(state) ^ Math.imul(state.clearedTrees.length, 0x9e3779b1)) >>> 0;
}

export function regionsOf(state: MatchState, type: EntityType | undefined): Regions {
  const cls = pathClass(type);
  let per = regionCache.get(state);
  if (!per) {
    per = new Map();
    regionCache.set(state, per);
  }
  const key = regionKeyOf(state);
  const old = per.get(cls);
  if (old && old.key === key && old.w === state.width && old.h === state.height) return old;
  const w = state.width;
  const h = state.height;
  const cols = Math.ceil(w / REGION_CELL);
  const rows = Math.ceil(h / REGION_CELL);
  const pass = new Uint8Array(cols * rows);
  for (let y = 0; y < h; y++) {
    const row = ((y / REGION_CELL) | 0) * cols;
    for (let x = 0; x < w; x++) {
      const c = row + ((x / REGION_CELL) | 0);
      if (pass[c] === 1) continue;
      if (walkable(state, x, y, type)) pass[c] = 1;
    }
  }
  const label = new Int32Array(cols * rows);
  const stack: number[] = [];
  let next = 0;
  for (let c = 0; c < pass.length; c++) {
    if (pass[c] !== 1 || label[c] !== 0) continue;
    next++;
    label[c] = next;
    stack.push(c);
    while (stack.length > 0) {
      const at = stack.pop()!;
      const ax = at % cols;
      const ay = (at - ax) / cols;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = ay + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ax + dx;
          if (nx < 0 || nx >= cols || (dx === 0 && dy === 0)) continue;
          const n = ny * cols + nx;
          if (pass[n] !== 1 || label[n] !== 0) continue;
          label[n] = next;
          stack.push(n);
        }
      }
    }
  }
  const made = { key, w, h, cols, rows, label };
  per.set(cls, made);
  return made;
}

/**
 * False only when no path can exist between the two tiles. A tile whose whole cell is blocked
 * (a unit standing inside a footprint, say) is given the benefit of the doubt.
 */
export function sameRegion(state: MatchState, sx: number, sy: number, gx: number, gy: number, type: EntityType | undefined): boolean {
  if (type && isNavalType(type)) return true;
  if (sx < 0 || sy < 0 || gx < 0 || gy < 0 || sx >= state.width || sy >= state.height || gx >= state.width || gy >= state.height) return true;
  const r = regionsOf(state, type);
  const a = r.label[((sy / REGION_CELL) | 0) * r.cols + ((sx / REGION_CELL) | 0)] ?? 0;
  const b = r.label[((gy / REGION_CELL) | 0) * r.cols + ((gx / REGION_CELL) | 0)] ?? 0;
  if (a === 0 || b === 0) return true;
  return a === b;
}
