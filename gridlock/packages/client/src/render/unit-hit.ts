import { BUILDING_ALPHA_MIN, type BuildingAlphaMap } from "./building-hit.js";

/** Skip the antialiased fringe; sparks sit on painted hull/turret pixels. */
export const UNIT_HIT_ALPHA_MIN = Math.max(BUILDING_ALPHA_MIN, 80);

/** Dest-space inset so the spark is on the body, not the 1px outline. */
export const UNIT_HIT_INSET = 1;

export interface UnitHitMask {
  w: number;
  h: number;
  /** 1 = painted (after inset). */
  solid: Uint8Array;
}

export interface UnitSheetCell {
  map: BuildingAlphaMap;
  sx: number;
  sy: number;
  cell: number;
}

/** Extra dest pixels down so tracks/feet overlap the ground blob. */
export function unitGroundSink(drawSize: number): number {
  return Math.max(3, Math.round(drawSize * 0.1));
}

export function unitSpriteDest(
  groundX: number,
  groundY: number,
  drawSize: number,
  contactY: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: groundX - drawSize / 2,
    y: groundY - drawSize * contactY + unitGroundSink(drawSize),
    w: drawSize,
    h: drawSize,
  };
}

/** Dest-pixel mask of hull + turret + gun for one facing. */
export function unitDestMaskFromSheets(
  destSize: number,
  hull: UnitSheetCell,
  turret?: UnitSheetCell | null,
  gun?: UnitSheetCell | null,
  alphaMin = UNIT_HIT_ALPHA_MIN,
): UnitHitMask {
  const w = Math.max(1, Math.round(destSize));
  const h = w;
  const raw = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      if (cellOpaque(hull, u, v, alphaMin)) {
        raw[y * w + x] = 1;
        continue;
      }
      if (turret && cellOpaque(turret, u, v, alphaMin)) {
        raw[y * w + x] = 1;
        continue;
      }
      if (gun && cellOpaque(gun, u, v, alphaMin)) {
        raw[y * w + x] = 1;
      }
    }
  }
  return { w, h, solid: erodeMask(raw, w, h, UNIT_HIT_INSET) };
}

/**
 * Keep a point already on painted hull; otherwise snap to the nearest
 * painted pixel so sparks never start in empty canvas around the sprite.
 */
export function snapToUnitHitMask(
  mask: UnitHitMask,
  localX: number,
  localY: number,
): { x: number; y: number } | null {
  const { w, h, solid } = mask;
  if (w <= 0 || h <= 0 || solid.length < w * h) return null;
  const ix = Math.round(localX);
  const iy = Math.round(localY);
  if (ix >= 0 && iy >= 0 && ix < w && iy < h && solid[iy * w + ix]) {
    return { x: ix, y: iy };
  }
  let best = -1;
  let bestD = Infinity;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!solid[row + x]) continue;
      const dx = localX - x;
      const dy = localY - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = row + x;
      }
    }
  }
  if (best < 0) return null;
  return { x: best % w, y: Math.floor(best / w) };
}

function cellOpaque(cell: UnitSheetCell, u: number, v: number, alphaMin: number): boolean {
  const srcX = cell.sx + u * cell.cell;
  const srcY = cell.sy + v * cell.cell;
  const x0 = Math.round(srcX * cell.map.toMap);
  const y0 = Math.round(srcY * cell.map.toMap);
  if (x0 < 0 || y0 < 0 || x0 >= cell.map.w || y0 >= cell.map.h) return false;
  return cell.map.a[y0 * cell.map.w + x0]! >= alphaMin;
}

function erodeMask(raw: Uint8Array, w: number, h: number, inset: number): Uint8Array {
  const r = Math.max(0, Math.round(inset));
  if (r <= 0) return raw;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!raw[y * w + x]) continue;
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          ok = false;
          break;
        }
        const row = yy * w;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || !raw[row + xx]) {
            ok = false;
            break;
          }
        }
      }
      if (ok) out[y * w + x] = 1;
    }
  }
  return out;
}
