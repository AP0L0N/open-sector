/** Classic C&C / RA2 2:1 dimetric. Simulation stays Cartesian; only the view projects. */

export const ISO_TILE_W = 64;
export const ISO_TILE_H = 32;

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

/**
 * 8-way screen facing for unit sprites, 45° steps.
 * 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE (canvas +y is down).
 */
export function isoDir8(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 2;
  const i = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ((i % 8) + 8) % 8;
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
): { minX: number; maxX: number; minY: number; maxY: number } {
  const ts = tileSize;
  const nw = worldToIso(0, 0, ts);
  const ne = worldToIso(mapW * ts, 0, ts);
  const sw = worldToIso(0, mapH * ts, ts);
  const se = worldToIso(mapW * ts, mapH * ts, ts);
  return {
    minX: Math.min(nw.x, ne.x, sw.x, se.x),
    maxX: Math.max(nw.x, ne.x, sw.x, se.x),
    minY: Math.min(nw.y, ne.y, sw.y, se.y),
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

/** Silhouette of a world-aligned box extruded `ez` iso-pixels upward. */
export function isoBoxSilhouette(
  x: number,
  y: number,
  w: number,
  h: number,
  ez: number,
  tileSize: number,
): IsoPt[] {
  const n = worldToIso(x, y, tileSize);
  const e = worldToIso(x + w, y, tileSize);
  const s = worldToIso(x + w, y + h, tileSize);
  const west = worldToIso(x, y + h, tileSize);
  return [
    { x: n.x, y: n.y - ez },
    { x: e.x, y: e.y - ez },
    { x: e.x, y: e.y },
    { x: s.x, y: s.y },
    { x: west.x, y: west.y },
    { x: west.x, y: west.y - ez },
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
): boolean {
  return pointInPoly(ix, iy, isoBoxSilhouette(x, y, w, h, ez, tileSize));
}

export function clampIsoCamera(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
  tileSize: number,
): IsoPt {
  const b = isoMapBounds(mapW, mapH, tileSize);
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
