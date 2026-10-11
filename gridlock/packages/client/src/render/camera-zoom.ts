/** Zoom the battlefield opens at. 1 is the iso pixel = CSS pixel scale. */
export const MAP_ZOOM_START = 1.25;
/** Maps a pixel wheel delta onto a multiplicative zoom step. */
export const MAP_ZOOM_WHEEL = 0.00125;
/** One wheel notch in CSS pixels. */
const MAP_ZOOM_TICK_PX = 100;
/** Zoom steps allowed each way from the start zoom, in wheel notches. */
const MAP_ZOOM_OUT_TICKS = 2;
const MAP_ZOOM_IN_TICKS = 2;
/** Floor: two notches out from the start zoom, no further. */
export const MAP_ZOOM_MIN = MAP_ZOOM_START * Math.exp(-MAP_ZOOM_OUT_TICKS * MAP_ZOOM_TICK_PX * MAP_ZOOM_WHEEL);
/** Ceiling: two notches in from the start zoom, no further. */
export const MAP_ZOOM_MAX = MAP_ZOOM_START * Math.exp(MAP_ZOOM_IN_TICKS * MAP_ZOOM_TICK_PX * MAP_ZOOM_WHEEL);

export function clampMapZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, z));
}

/** CSS-pixel wheel delta. `deltaMode` 1 = lines, 2 = pages. */
export function wheelPixels(deltaY: number, deltaMode = 0): number {
  if (deltaMode === 1) return deltaY * 40;
  if (deltaMode === 2) return deltaY * 400;
  return deltaY;
}

export function mapZoomAfterWheel(zoom: number, deltaY: number, deltaMode = 0): number {
  const dy = wheelPixels(deltaY, deltaMode);
  if (dy === 0) return clampMapZoom(zoom);
  return clampMapZoom(zoom * Math.exp(-dy * MAP_ZOOM_WHEEL));
}

/**
 * Keep the iso point under CSS pixel (px, py) fixed while zoom changes.
 * `cam` is the viewport top-left in iso space; `px`/`py` are canvas CSS pixels.
 */
export function zoomCamAt(
  camX: number,
  camY: number,
  zoom: number,
  nextZoom: number,
  px: number,
  py: number,
): { camX: number; camY: number; zoom: number } {
  const z0 = zoom > 0 ? zoom : 1;
  const z1 = clampMapZoom(nextZoom);
  if (z1 === z0) return { camX, camY, zoom: z1 };
  const k = 1 / z0 - 1 / z1;
  return { camX: camX + px * k, camY: camY + py * k, zoom: z1 };
}
