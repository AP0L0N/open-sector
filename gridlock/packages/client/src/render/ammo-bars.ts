/**
 * Ammo strips under an allied health bar. Only finite stores a truck refills:
 * the shell rack, the coaxial belt, rocket pods, a belt that never reloads, and
 * the cyborg drum. A supply truck shows its cargo. A Jump Jet shows his pack
 * as the yellow bar. Smoke is left out — it is a screen, not the gun's reserve.
 */
import {
  beltOf,
  catalog,
  heavyAmmoOf,
  launcherOnlyOf,
  rocketAmmoOf,
  SHELL_TYPES,
  SUPPLY_CARGO,
  supplyDrumOf,
  type EntityView,
} from "@gridlock/shared";

export const AMMO_PRIMARY_FILL = "rgba(226, 190, 72, 0.95)";
export const AMMO_SECONDARY_FILL = "rgba(178, 176, 168, 0.9)";

function fraction(left: number, full: number): number {
  return Math.max(0, Math.min(1, left / full));
}

/** Main store first (the yellow bar), then the secondary store. At most two. Empty when nothing is finite or the view is not allied. */
export function ammoBarRatios(
  e: Pick<EntityView, "type" | "ammo" | "mgAmmo" | "clip" | "rockets" | "heavy" | "wreck" | "supply" | "jet">,
): number[] {
  if (e.wreck) return [];
  if (e.type === "supply") return e.supply != null ? [fraction(e.supply, SUPPLY_CARGO)] : [];
  // The pack is the yellow bar. Enemies get height only, so the strip stays hidden.
  if (e.type === "jumpjet") {
    const fuel = e.jet?.fuel;
    const full = e.jet?.fuelMax ?? 0;
    return fuel != null && full > 0 ? [fraction(fuel, full)] : [];
  }
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

  const heavyCap = heavyAmmoOf(e.type);
  if (heavyCap > 0 && e.heavy != null) primary.push(fraction(e.heavy, heavyCap));

  const pods = rocketAmmoOf(e.type);
  if (pods > 0 && e.rockets != null) {
    (launcherOnlyOf(e.type) ? primary : secondary).push(fraction(e.rockets, pods));
  }

  const mg = def.mgAmmo ?? 0;
  if (mg > 0 && e.mgAmmo != null) secondary.push(fraction(e.mgAmmo, mg));

  return [...primary, ...secondary].slice(0, 2);
}
