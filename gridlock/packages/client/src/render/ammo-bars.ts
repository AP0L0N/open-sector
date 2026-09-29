/**
 * Ammo strips under an allied health bar. Only finite stores a truck refills:
 * the shell rack, the coaxial belt, rocket pods, a belt that never reloads, and
 * the cyborg drum. Smoke is left out — it is a screen, not the gun's reserve.
 */
import {
  beltOf,
  catalog,
  launcherOnlyOf,
  rocketAmmoOf,
  SHELL_TYPES,
  supplyDrumOf,
  type EntityView,
} from "@gridlock/shared";

export const AMMO_PRIMARY_FILL = "rgba(226, 190, 72, 0.95)";
export const AMMO_SECONDARY_FILL = "rgba(178, 176, 168, 0.9)";

function fraction(left: number, full: number): number {
  return Math.max(0, Math.min(1, left / full));
}

/** Main gun first, then the secondary store. At most two. Empty when nothing is finite or the view is not allied. */
export function ammoBarRatios(e: Pick<EntityView, "type" | "ammo" | "mgAmmo" | "clip" | "rockets" | "wreck">): number[] {
  if (e.wreck) return [];
  const def = catalog(e.type);
  const primary: number[] = [];
  const secondary: number[] = [];

  if (def.ammo && e.ammo) {
    let full = 0;
    let left = 0;
    for (const s of SHELL_TYPES) {
      if (s === "smoke") continue;
      full += def.ammo[s] ?? 0;
      left += Math.max(0, e.ammo[s] ?? 0);
    }
    if (full > 0) primary.push(fraction(left, full));
  }

  const belt = beltOf(e.type);
  const drum = belt && belt.reload <= 0 ? belt.clip : supplyDrumOf(e.type);
  if (drum > 0 && e.clip != null) primary.push(fraction(e.clip, drum));

  const pods = rocketAmmoOf(e.type);
  if (pods > 0 && e.rockets != null) {
    (launcherOnlyOf(e.type) ? primary : secondary).push(fraction(e.rockets, pods));
  }

  const mg = def.mgAmmo ?? 0;
  if (mg > 0 && e.mgAmmo != null) secondary.push(fraction(e.mgAmmo, mg));

  return [...primary, ...secondary].slice(0, 2);
}
