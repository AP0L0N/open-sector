import { TILE_SIZE, isoLift, isoToWorld, pickElevatedTile, worldToIso } from "@gridlock/shared";
import type { Sheet } from "./builder-model.js";

/** The Map Builder's in-game view camera: screen = (iso - cam) * zoom. */
export interface IsoCam {
  zoom: number;
  camX: number;
  camY: number;
}

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 6;

/** Centre the camera on the map at battlefield zoom. */
export function isoFit(cam: IsoCam, s: Sheet, w: number, h: number): void {
  const mid = worldToIso((s.width * TILE_SIZE) / 2, (s.height * TILE_SIZE) / 2, TILE_SIZE);
  const midH = s.heights[(s.height >> 1) * s.width + (s.width >> 1)] ?? 0;
  cam.zoom = 1;
  cam.camX = mid.x - w / 2;
  cam.camY = mid.y - isoLift(midH) - h / 2;
}

/** Zoom by the wheel, keeping the ground under the pointer where it is. */
export function isoZoomAt(cam: IsoCam, mx: number, my: number, deltaY: number): void {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom * (deltaY < 0 ? 1.15 : 1 / 1.15)));
  cam.camX += mx / cam.zoom - mx / next;
  cam.camY += my / cam.zoom - my / next;
  cam.zoom = next;
}

/** Screen point of a tile's centre on its own height. */
export function isoScreenOf(s: Sheet, cam: IsoCam, tx: number, ty: number): { x: number; y: number } {
  const p = worldToIso((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, TILE_SIZE);
  const cx = Math.max(0, Math.min(s.width - 1, tx));
  const cy = Math.max(0, Math.min(s.height - 1, ty));
  const z = isoLift(s.heights[cy * s.width + cx] ?? 0);
  return { x: (p.x - cam.camX) * cam.zoom, y: (p.y - z - cam.camY) * cam.zoom };
}

/** Tile under a screen point, on the raised ground. Off it, the flat plane answers, past the edge too. */
export function isoPick(s: Sheet, cam: IsoCam, px: number, py: number): { x: number; y: number; inside: boolean } {
  const ix = px / cam.zoom + cam.camX;
  const iy = py / cam.zoom + cam.camY;
  const hit = pickElevatedTile(ix, iy, s.width, s.height, TILE_SIZE, (x, y) => s.heights[y * s.width + x] ?? 0);
  if (hit) return { ...hit, inside: true };
  // Past the edge: unproject at the height of the nearest edge tile, settled over a couple of passes.
  let x = 0;
  let y = 0;
  let h = 0;
  for (let pass = 0; pass < 3; pass++) {
    const w = isoToWorld(ix, iy + isoLift(h), TILE_SIZE);
    x = Math.floor(w.x / TILE_SIZE);
    y = Math.floor(w.y / TILE_SIZE);
    const cx = Math.max(0, Math.min(s.width - 1, x));
    const cy = Math.max(0, Math.min(s.height - 1, y));
    h = s.heights[cy * s.width + cx] ?? 0;
  }
  return { x, y, inside: x >= 0 && y >= 0 && x < s.width && y < s.height };
}
