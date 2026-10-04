/**
 * Where a battlefield sound sits in the mix, from where it happened on screen.
 * The listener is the middle of the viewport. Client-only.
 *
 * `r` is the distance from the centre in half-viewports: 0 at the centre, 1 on
 * the nearest screen edge along each axis (an ellipse that fits the view).
 * A shot near the middle is full loud; one at the edge is still clearly heard;
 * off screen it fades and darkens, and well off screen it is not played at all.
 */

/** Loudness knots: [r, dB]. Linear in dB between them. */
const KNOTS: readonly (readonly [number, number])[] = [
  [0.25, 0],
  [1, -7],
  [2, -18],
];
/** Past the last knot the sound fades to silence by here. */
export const SFX_CUTOFF_R = 2.8;
/** Sounds quieter than this are not worth a voice. */
export const SFX_MIN_GAIN = 0.02;
/** Never hard-pan: an edge shot still reaches both ears. */
const MAX_PAN = 0.75;
/** No filtering on screen; off screen the low-pass slides down to this. */
const FAR_LOWPASS_HZ = 1400;
const OPEN_LOWPASS_HZ = 20000;

export interface SpatialMix {
  /** 0..1 linear gain, before the player's SFX volume. */
  gain: number;
  /** -1 (left) .. 1 (right). */
  pan: number;
  /** Low-pass cutoff in Hz: distance muffles. */
  lowpassHz: number;
}

/** Distance from the viewport centre in half-viewports. */
export function viewRadius(sx: number, sy: number, viewW: number, viewH: number): number {
  const nx = (sx - viewW / 2) / Math.max(1, viewW / 2);
  const ny = (sy - viewH / 2) / Math.max(1, viewH / 2);
  return Math.hypot(nx, ny);
}

function dbAt(r: number): number {
  const first = KNOTS[0]!;
  if (r <= first[0]) return first[1];
  for (let i = 1; i < KNOTS.length; i++) {
    const [r1, d1] = KNOTS[i]!;
    const [r0, d0] = KNOTS[i - 1]!;
    if (r <= r1) return d0 + ((d1 - d0) * (r - r0)) / (r1 - r0);
  }
  return KNOTS[KNOTS.length - 1]![1];
}

/** Mix for a sound at screen point (sx, sy) in a viewport of viewW x viewH (same units). Null: too far to hear. */
export function spatialMix(sx: number, sy: number, viewW: number, viewH: number): SpatialMix | null {
  const r = viewRadius(sx, sy, viewW, viewH);
  if (!(r < SFX_CUTOFF_R)) return null;
  const last = KNOTS[KNOTS.length - 1]!;
  let gain = 10 ** (dbAt(r) / 20);
  if (r > last[0]) gain *= 1 - (r - last[0]) / (SFX_CUTOFF_R - last[0]);
  if (gain < SFX_MIN_GAIN) return null;
  const nx = (sx - viewW / 2) / Math.max(1, viewW / 2);
  const pan = Math.max(-MAX_PAN, Math.min(MAX_PAN, nx * 0.6));
  const off = Math.max(0, Math.min(1, (r - 1) / (SFX_CUTOFF_R - 1)));
  const lowpassHz = OPEN_LOWPASS_HZ * (FAR_LOWPASS_HZ / OPEN_LOWPASS_HZ) ** off;
  return { gain, pan, lowpassHz };
}
