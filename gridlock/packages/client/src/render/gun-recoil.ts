/**
 * Client-only gun and hull recoil when a tank fires a shell.
 * The barrel slides back along its facing; the hull rocks a little after.
 */

export const GUN_KICK_MS = 55;
export const GUN_RECOVER_MS = 280;
export const HULL_KICK_MS = 85;
export const HULL_RECOVER_MS = 360;
export const HULL_DELAY_MS = 18;

/** Peak barrel travel as a fraction of sprite drawSize. */
export const GUN_RECOIL_FRAC = 0.155;
/** Peak hull rock as a fraction of sprite drawSize. */
export const HULL_RECOIL_FRAC = 0.036;

export interface GunRecoil {
  at: number;
}

export function tankGunRecoils(opts: {
  wreck?: boolean;
  garrisonedIn?: number | null;
  hasGun?: boolean;
}): boolean {
  return !!opts.hasGun && !opts.wreck && opts.garrisonedIn == null;
}

/** 0..1 kick envelope. Fast slam, slower return, tiny settle overshoot. */
export function recoilEnvelope(
  ageMs: number,
  kickMs: number,
  recoverMs: number,
  delayMs = 0,
): number {
  const age = ageMs - delayMs;
  if (age <= 0) return 0;
  const total = kickMs + recoverMs;
  if (age >= total) return 0;
  if (age <= kickMs) {
    const t = age / kickMs;
    return 1 - (1 - t) * (1 - t) * (1 - t);
  }
  const t = (age - kickMs) / recoverMs;
  const rest = (1 - t) * (1 - t);
  return rest * (1 - 0.14 * Math.sin(t * Math.PI));
}

export function recoilAmounts(at: number, now: number): { gun: number; hull: number } | null {
  const age = now - at;
  if (age < 0) return null;
  const done = HULL_DELAY_MS + HULL_KICK_MS + HULL_RECOVER_MS;
  if (age >= done) return null;
  return {
    gun: recoilEnvelope(age, GUN_KICK_MS, GUN_RECOVER_MS),
    hull: recoilEnvelope(age, HULL_KICK_MS, HULL_RECOVER_MS, HULL_DELAY_MS),
  };
}

/** Screen-pixel offsets. Negative along the barrel (iso facing) is rearward. */
export function recoilLayerShift(
  isoDx: number,
  isoDy: number,
  hullPx: number,
  gunPx: number,
): { hullX: number; hullY: number; gunX: number; gunY: number } {
  const len = Math.hypot(isoDx, isoDy) || 1;
  const ux = isoDx / len;
  const uy = isoDy / len;
  return {
    hullX: -ux * hullPx,
    hullY: -uy * hullPx,
    gunX: -ux * (hullPx + gunPx),
    gunY: -uy * (hullPx + gunPx),
  };
}

export function recoilPixels(
  drawSize: number,
  amount: { gun: number; hull: number },
): { hullPx: number; gunPx: number } {
  return {
    hullPx: drawSize * HULL_RECOIL_FRAC * amount.hull,
    gunPx: drawSize * GUN_RECOIL_FRAC * amount.gun,
  };
}
