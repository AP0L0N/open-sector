/**
 * A turned building's ground: a rectangle of the catalog's tileW × tileH, centred on
 * the entity and turned by its facing. Facing 0 runs tileW east, the way the art was
 * drawn. The entity's tileX/tileY/tileW/tileH are the tile box around the turned
 * rectangle, so code that only needs "near the building" keeps reading the box, and
 * code that needs the real ground (occupancy, site checks, shots, adjacency) asks here.
 */
import { BUILDING_FACINGS, BUILDING_TURN_STEP, catalog, isRotatableBuilding, type EntityType } from "./catalog.js";

export interface BuildingRect {
  cx: number;
  cy: number;
  /** Unit axis along tileW (the facing). */
  ux: number;
  uy: number;
  /** Unit axis along tileH, a quarter clockwise from the facing. */
  vx: number;
  vy: number;
  halfU: number;
  halfV: number;
}

type Placed = { type: EntityType; x: number; y: number; facing: number };
type Boxed = Placed & { tileX: number; tileY: number; tileW: number; tileH: number };

/** Which of the BUILDING_FACINGS a facing lands on. */
export function buildingTurnIndex(facing: number): number {
  if (!Number.isFinite(facing)) return 0;
  const n = BUILDING_FACINGS;
  return ((Math.round(facing / BUILDING_TURN_STEP) % n) + n) % n;
}

/** The facing a building stands at: a rotatable one snaps to the nearest step, the rest face east. */
export function snapBuildingFacing(type: EntityType, facing: number): number {
  return isRotatableBuilding(type) ? buildingTurnIndex(facing) * BUILDING_TURN_STEP : 0;
}

/** True when the building's ground is not its plain catalog box. */
export function isTurnedBuilding(e: { type: EntityType; facing: number }): boolean {
  return isRotatableBuilding(e.type) && buildingTurnIndex(e.facing) !== 0;
}

/** Tile box around the turned rectangle. Exact at the quarters; other steps round to whole tiles. */
export function turnedBox(type: EntityType, facing: number): { w: number; h: number } {
  const def = catalog(type);
  if (!isRotatableBuilding(type)) return { w: def.tileW, h: def.tileH };
  const a = snapBuildingFacing(type, facing);
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return {
    w: Math.max(1, Math.round(def.tileW * c + def.tileH * s)),
    h: Math.max(1, Math.round(def.tileW * s + def.tileH * c)),
  };
}

export function buildingRect(e: Placed, tileSize: number): BuildingRect {
  const def = catalog(e.type);
  const a = snapBuildingFacing(e.type, e.facing);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  return { cx: e.x, cy: e.y, ux, uy, vx: -uy, vy: ux, halfU: (def.tileW * tileSize) / 2, halfV: (def.tileH * tileSize) / 2 };
}

/** Building-local coordinates: u along tileW, v along tileH, both from the centre. */
export function rectLocal(r: BuildingRect, px: number, py: number): { u: number; v: number } {
  const dx = px - r.cx;
  const dy = py - r.cy;
  return { u: dx * r.ux + dy * r.uy, v: dx * r.vx + dy * r.vy };
}

export function rectWorld(r: BuildingRect, u: number, v: number): { x: number; y: number } {
  return { x: r.cx + u * r.ux + v * r.vx, y: r.cy + u * r.uy + v * r.vy };
}

export function rectContains(r: BuildingRect, px: number, py: number, pad = 0): boolean {
  const { u, v } = rectLocal(r, px, py);
  return Math.abs(u) <= r.halfU + pad && Math.abs(v) <= r.halfV + pad;
}

/** Corners on the ground, clockwise from the back-left (−u, −v). */
export function rectCorners(r: BuildingRect, pad = 0): { x: number; y: number }[] {
  const hu = r.halfU + pad;
  const hv = r.halfV + pad;
  return [rectWorld(r, -hu, -hv), rectWorld(r, hu, -hv), rectWorld(r, hu, hv), rectWorld(r, -hu, hv)];
}

/** Distance from a point to the rectangle's edge; 0 inside. */
export function rectDistance(r: BuildingRect, px: number, py: number): number {
  const { u, v } = rectLocal(r, px, py);
  return Math.hypot(Math.max(0, Math.abs(u) - r.halfU), Math.max(0, Math.abs(v) - r.halfV));
}

/** Nearest point of the rectangle (its edge or inside) to a point. */
export function rectNearest(r: BuildingRect, px: number, py: number): { x: number; y: number } {
  const { u, v } = rectLocal(r, px, py);
  return rectWorld(r, Math.max(-r.halfU, Math.min(r.halfU, u)), Math.max(-r.halfV, Math.min(r.halfV, v)));
}

/** Where along the segment (0..1) it first enters the rectangle, or null when it misses. */
export function segmentRectT(r: BuildingRect, x0: number, y0: number, x1: number, y1: number): number | null {
  const a = rectLocal(r, x0, y0);
  const b = rectLocal(r, x1, y1);
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number][] = [
    [a.u, b.u - a.u, r.halfU],
    [a.v, b.v - a.v, r.halfV],
  ];
  for (const [p, d, h] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (p < -h || p > h) return null;
      continue;
    }
    let ta = (-h - p) / d;
    let tb = (h - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

/**
 * The tiles a building stands on. A plain building is its box; a turned one is every tile
 * of its box whose centre lies inside the turned rectangle.
 */
export function buildingTilesOf(e: Boxed, tileSize: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const turned = isTurnedBuilding(e);
  const r = turned ? buildingRect(e, tileSize) : null;
  for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
    for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
      if (r && !rectContains(r, (x + 0.5) * tileSize, (y + 0.5) * tileSize, 1e-6)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** A candidate site: the box at (tx, ty) for this facing, its centre, and the snapped facing. */
export function buildingSite(
  type: EntityType,
  tx: number,
  ty: number,
  facing: number,
  tileSize: number,
): Boxed {
  const box = turnedBox(type, facing);
  return {
    type,
    facing: snapBuildingFacing(type, facing),
    tileX: tx,
    tileY: ty,
    tileW: box.w,
    tileH: box.h,
    x: (tx + box.w / 2) * tileSize,
    y: (ty + box.h / 2) * tileSize,
  };
}
