export const BUILDING_ALPHA_MIN = 32;

export interface BuildingAlphaMap {
  w: number;
  h: number;
  a: Uint8Array;
  /** Multiply source-image pixels by this to index `a`. */
  toMap: number;
}

/** Source-image pixel under a screen point on a grounded building sprite. */
export function buildingSpriteSrcAt(
  padWidth: number,
  padSouthX: number,
  padSouthY: number,
  southX: number,
  southY: number,
  footprintW: number,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const scale = footprintW / padWidth;
  return {
    x: (screenX - (southX - padSouthX * scale)) / scale,
    y: (screenY - (southY - padSouthY * scale)) / scale,
  };
}

/** True when `src` (source-image pixels) sits on an opaque texel, with a small radius. */
export function buildingAlphaOpaqueAt(
  map: BuildingAlphaMap,
  srcX: number,
  srcY: number,
  radius = 1,
): boolean {
  const x0 = Math.round(srcX * map.toMap);
  const y0 = Math.round(srcY * map.toMap);
  const r = Math.max(0, radius);
  for (let dy = -r; dy <= r; dy++) {
    const y = y0 + dy;
    if (y < 0 || y >= map.h) continue;
    const row = y * map.w;
    for (let dx = -r; dx <= r; dx++) {
      const x = x0 + dx;
      if (x < 0 || x >= map.w) continue;
      if (map.a[row + x]! >= BUILDING_ALPHA_MIN) return true;
    }
  }
  return false;
}

export function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
