/** Adjacent civilian houses share a lot. Each house stays its own garrison. */

export interface HouseLot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NeighborSides {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

/** Fraction of the shorter footprint to hide on a shared edge (fences / lot trim). */
export const HOUSE_GROUP_SEAM = 0.12;

function rangeOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** True when two axis-aligned lots share an edge (not only a corner). */
export function lotsEdgeAdjacent(a: HouseLot, b: HouseLot): boolean {
  const xTouch = a.x + a.w === b.x || b.x + b.w === a.x;
  const yTouch = a.y + a.h === b.y || b.y + b.h === a.y;
  return (
    (xTouch && rangeOverlap(a.y, a.y + a.h, b.y, b.y + b.h)) ||
    (yTouch && rangeOverlap(a.x, a.x + a.w, b.x, b.x + b.w))
  );
}

export function neighborSides(a: HouseLot, others: readonly HouseLot[]): NeighborSides {
  const sides: NeighborSides = { n: false, e: false, s: false, w: false };
  for (const b of others) {
    if (b.id === a.id) continue;
    if (b.y + b.h === a.y && rangeOverlap(a.x, a.x + a.w, b.x, b.x + b.w)) sides.n = true;
    if (b.y === a.y + a.h && rangeOverlap(a.x, a.x + a.w, b.x, b.x + b.w)) sides.s = true;
    if (b.x + b.w === a.x && rangeOverlap(a.y, a.y + a.h, b.y, b.y + b.h)) sides.w = true;
    if (b.x === a.x + a.w && rangeOverlap(a.y, a.y + a.h, b.y, b.y + b.h)) sides.e = true;
  }
  return sides;
}

export function hasNeighbor(sides: NeighborSides): boolean {
  return sides.n || sides.e || sides.s || sides.w;
}

/** 4-connected components. Diagonal-only lots stay separate. */
export function houseGroups(lots: readonly HouseLot[]): HouseLot[][] {
  const parent = lots.map((_, i) => i);
  const find = (i: number): number => {
    let cur = i;
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]!]!;
      cur = parent[cur]!;
    }
    return cur;
  };
  const unite = (i: number, j: number): void => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[a] = b;
  };
  for (let i = 0; i < lots.length; i++) {
    for (let j = i + 1; j < lots.length; j++) {
      if (lotsEdgeAdjacent(lots[i]!, lots[j]!)) unite(i, j);
    }
  }
  const buckets = new Map<number, HouseLot[]>();
  for (let i = 0; i < lots.length; i++) {
    const root = find(i);
    const g = buckets.get(root);
    if (g) g.push(lots[i]!);
    else buckets.set(root, [lots[i]!]);
  }
  return [...buckets.values()];
}

export function neighborMap(lots: readonly HouseLot[]): Map<number, NeighborSides> {
  const out = new Map<number, NeighborSides>();
  for (const g of houseGroups(lots)) {
    for (const a of g) out.set(a.id, neighborSides(a, g));
  }
  return out;
}

export function seamTiles(lot: HouseLot): number {
  return Math.max(1, Math.round(Math.min(lot.w, lot.h) * HOUSE_GROUP_SEAM));
}

/** Shrink a lot on sides that share a neighbor so baked fences stay outside the clip. */
export function seamInset(lot: HouseLot, sides: NeighborSides, inset = seamTiles(lot)): HouseLot {
  let { x, y, w, h } = lot;
  if (sides.w) {
    x += inset;
    w -= inset;
  }
  if (sides.e) w -= inset;
  if (sides.n) {
    y += inset;
    h -= inset;
  }
  if (sides.s) h -= inset;
  return { id: lot.id, x, y, w: Math.max(1, w), h: Math.max(1, h) };
}
