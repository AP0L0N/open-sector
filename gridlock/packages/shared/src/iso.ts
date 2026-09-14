import { HEIGHT_MAX, TILE_SUBDIV } from "./catalog.js";

/** Classic C&C / RA2 2:1 dimetric. Simulation stays Cartesian; only the view projects. */

/** Screen size of one gameplay tile. Authoring diamonds were 64×32; TILE_SUBDIV splits them. */
export const ISO_TILE_W = 64 / TILE_SUBDIV;
export const ISO_TILE_H = 32 / TILE_SUBDIV;
/** Screen pixels the diamond lifts per elevation level. Half of ISO_TILE_H. */
export const ISO_ELEVATION = 16 / TILE_SUBDIV;

export function isoLift(height: number): number {
  return Math.max(0, height) * ISO_ELEVATION;
}

export interface IsoPt {
  x: number;
  y: number;
}

export function isoScale(tileSize: number): { hw: number; hh: number } {
  return { hw: ISO_TILE_W / (2 * tileSize), hh: ISO_TILE_H / (2 * tileSize) };
}

export function worldToIso(wx: number, wy: number, tileSize: number): IsoPt {
  const { hw, hh } = isoScale(tileSize);
  return { x: (wx - wy) * hw, y: (wx + wy) * hh };
}

export function worldToIso3(wx: number, wy: number, wz: number, tileSize: number): IsoPt {
  const p = worldToIso(wx, wy, tileSize);
  return { x: p.x, y: p.y - isoLift(wz) };
}

export function isoToWorld(ix: number, iy: number, tileSize: number): IsoPt {
  const { hw, hh } = isoScale(tileSize);
  const a = ix / hw;
  const b = iy / hh;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Painter's-algorithm key: south-east is in front. */
export function isoDepth(wx: number, wy: number): number {
  return wx + wy;
}

/** Screen-space direction of a world facing (0 = east). */
export function facingToIso(facing: number, tileSize: number): IsoPt {
  const origin = worldToIso(0, 0, tileSize);
  const tip = worldToIso(Math.cos(facing), Math.sin(facing), tileSize);
  return { x: tip.x - origin.x, y: tip.y - origin.y };
}

/** Screen facings on a unit sprite sheet (22.5° steps). */
export const UNIT_SPRITE_DIRS = 16;

/**
 * Screen facing index for unit sprites. Row 0 is east (right);
 * indices increase clockwise (canvas +y is down).
 * Default 16 dirs at 22.5°. Pass 8 for the old 45° sheet.
 */
export function isoDirIndex(dx: number, dy: number, dirs = UNIT_SPRITE_DIRS): number {
  const n = dirs > 0 ? dirs : UNIT_SPRITE_DIRS;
  if (dx === 0 && dy === 0) return Math.round(n / 4);
  const i = Math.round(Math.atan2(dy, dx) / ((Math.PI * 2) / n));
  return ((i % n) + n) % n;
}

/** 16-way screen facing, 22.5° steps. */
export function isoDir16(dx: number, dy: number): number {
  return isoDirIndex(dx, dy, 16);
}

/** 8-way screen facing, 45° steps. */
export function isoDir8(dx: number, dy: number): number {
  return isoDirIndex(dx, dy, 8);
}

/** Cardinal building sprite index. 0 = east, then south, west, north. */
export function buildingFaceIndex(facing: number): number {
  if (!Number.isFinite(facing)) return 0;
  return ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4;
}

export function tileDiamond(
  tx: number,
  ty: number,
  tileSize: number,
): { n: IsoPt; e: IsoPt; s: IsoPt; w: IsoPt } {
  const ts = tileSize;
  return {
    n: worldToIso(tx * ts, ty * ts, ts),
    e: worldToIso((tx + 1) * ts, ty * ts, ts),
    s: worldToIso((tx + 1) * ts, (ty + 1) * ts, ts),
    w: worldToIso(tx * ts, (ty + 1) * ts, ts),
  };
}

export function isoMapBounds(
  mapW: number,
  mapH: number,
  tileSize: number,
  maxElev = 0,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const ts = tileSize;
  const nw = worldToIso(0, 0, ts);
  const ne = worldToIso(mapW * ts, 0, ts);
  const sw = worldToIso(0, mapH * ts, ts);
  const se = worldToIso(mapW * ts, mapH * ts, ts);
  return {
    minX: Math.min(nw.x, ne.x, sw.x, se.x),
    maxX: Math.max(nw.x, ne.x, sw.x, se.x),
    minY: Math.min(nw.y, ne.y, sw.y, se.y) - isoLift(maxElev),
    maxY: Math.max(nw.y, ne.y, sw.y, se.y),
  };
}

export function pointInPoly(px: number, py: number, verts: readonly IsoPt[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a = verts[i];
    const b = verts[j];
    if (!a || !b) continue;
    const hit = a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Silhouette of a world-aligned box extruded `ez` iso-pixels upward, sitting `lift` above the floor. */
export function isoBoxSilhouette(
  x: number,
  y: number,
  w: number,
  h: number,
  ez: number,
  tileSize: number,
  lift = 0,
): IsoPt[] {
  const n = worldToIso(x, y, tileSize);
  const e = worldToIso(x + w, y, tileSize);
  const s = worldToIso(x + w, y + h, tileSize);
  const west = worldToIso(x, y + h, tileSize);
  const z = lift;
  return [
    { x: n.x, y: n.y - ez - z },
    { x: e.x, y: e.y - ez - z },
    { x: e.x, y: e.y - z },
    { x: s.x, y: s.y - z },
    { x: west.x, y: west.y - z },
    { x: west.x, y: west.y - ez - z },
  ];
}

export function pointInIsoBox(
  ix: number,
  iy: number,
  x: number,
  y: number,
  w: number,
  h: number,
  ez: number,
  tileSize: number,
  lift = 0,
): boolean {
  return pointInPoly(ix, iy, isoBoxSilhouette(x, y, w, h, ez, tileSize, lift));
}

/**
 * True when a unit at (ux, uy) sits north/west of an iso box and its sprite
 * (lifted `visualLift` iso-pixels) overlaps the box silhouette. East or south
 * of the box is in front of the camera, so those units stay opaque.
 */
export function unitBehindIsoBox(
  ux: number,
  uy: number,
  visualLift: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  boxEz: number,
  tileSize: number,
  boxElevLift = 0,
  unitElevLift = 0,
): boolean {
  if (boxW <= 0 || boxH <= 0 || boxEz <= 0) return false;
  if (ux >= boxX + boxW || uy >= boxY + boxH) return false;
  const p = worldToIso(ux, uy, tileSize);
  const baseY = p.y - unitElevLift;
  const lift = Math.max(0, visualLift);
  return (
    pointInIsoBox(p.x, baseY - lift, boxX, boxY, boxW, boxH, boxEz, tileSize, boxElevLift) ||
    (lift > 2 &&
      pointInIsoBox(p.x, baseY - lift * 0.45, boxX, boxY, boxW, boxH, boxEz, tileSize, boxElevLift))
  );
}

function liftPt(p: IsoPt, ez: number): IsoPt {
  return { x: p.x, y: p.y - ez };
}

/**
 * Front-most elevated tile under an iso-space click, including cliff faces.
 * `heightOf` is 0 outside the map.
 * `clip` is an inclusive tile AABB intersected with the search band.
 */
export function pickElevatedTile(
  ix: number,
  iy: number,
  mapW: number,
  mapH: number,
  tileSize: number,
  heightOf: (tx: number, ty: number) => number,
  clip?: { x0: number; y0: number; x1: number; y1: number },
): { x: number; y: number } | null {
  const flat = isoToWorld(ix, iy, tileSize);
  const sx = Math.floor(flat.x / tileSize);
  const sy = Math.floor(flat.y / tileSize);
  const band = Math.ceil(isoLift(HEIGHT_MAX) / (ISO_TILE_H / 2)) + 4;
  let minX = Math.max(0, sx - band);
  let maxX = Math.min(mapW - 1, sx + band);
  let minY = Math.max(0, sy - band);
  let maxY = Math.min(mapH - 1, sy + band);
  if (clip) {
    minX = Math.max(minX, clip.x0);
    maxX = Math.min(maxX, clip.x1);
    minY = Math.max(minY, clip.y0);
    maxY = Math.min(maxY, clip.y1);
  }
  if (minX > maxX || minY > maxY) return null;
  for (let sum = maxX + maxY; sum >= minX + minY; sum--) {
    const x0 = Math.max(minX, sum - maxY);
    const x1 = Math.min(maxX, sum - minY);
    for (let x = x1; x >= x0; x--) {
      const y = sum - x;
      const h = heightOf(x, y);
      const ez = isoLift(h);
      const d = tileDiamond(x, y, tileSize);
      const top = [liftPt(d.n, ez), liftPt(d.e, ez), liftPt(d.s, ez), liftPt(d.w, ez)];
      if (pointInPoly(ix, iy, top)) return { x, y };
      const he = x + 1 < mapW ? heightOf(x + 1, y) : 0;
      if (h > he) {
        const lo = isoLift(he);
        if (pointInPoly(ix, iy, [liftPt(d.e, ez), liftPt(d.s, ez), liftPt(d.s, lo), liftPt(d.e, lo)])) {
          return { x, y };
        }
      }
      const hs = y + 1 < mapH ? heightOf(x, y + 1) : 0;
      if (h > hs) {
        const lo = isoLift(hs);
        if (pointInPoly(ix, iy, [liftPt(d.w, ez), liftPt(d.s, ez), liftPt(d.s, lo), liftPt(d.w, lo)])) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

export function clampIsoCamera(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
  tileSize: number,
  maxElev = 0,
): IsoPt {
  const b = isoMapBounds(mapW, mapH, tileSize, maxElev);
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  let x: number;
  let y: number;
  if (viewW >= bw) x = b.minX - (viewW - bw) / 2;
  else {
    const cx = Math.min(b.maxX, Math.max(b.minX, camX + viewW / 2));
    x = cx - viewW / 2;
  }
  if (viewH >= bh) y = b.minY - (viewH - bh) / 2;
  else {
    const cy = Math.min(b.maxY, Math.max(b.minY, camY + viewH / 2));
    y = cy - viewH / 2;
  }
  return { x, y };
}
