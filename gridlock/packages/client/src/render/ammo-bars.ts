/**
 * Ammo strips under an allied health bar. Only finite stores a truck refills:
 * the shell rack, the coaxial belt, rocket pods, a belt that never reloads, and
 * the cyborg drum. A supply truck or boat shows its cargo. A Jump Jet shows his pack
 * as the yellow bar. Smoke is left out — it is a screen, not the gun's reserve.
 */
import {
  beltOf,
  catalog,
  heavyAmmoOf,
  isInfantryType,
  isSupplyCarrier,
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
  if (isSupplyCarrier(e.type)) return e.supply != null ? [fraction(e.supply, SUPPLY_CARGO)] : [];
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

/**
 * Every finite store the unit attacks with is empty: the shell rack (smoke
 * aside), a belt or drum that never reloads, rocket pods, the coaxial belt.
 * A soldier whose magazine reloads from nowhere is never out, and neither is
 * the Rocketer — his one heavy missile rides on a tube that reloads. A supply
 * truck's cargo and a Jump Jet's fuel are not ammunition. False when the view
 * carries no ammo (an enemy).
 */
export function outOfAmmo(
  e: Pick<EntityView, "type" | "ammo" | "mgAmmo" | "clip" | "rockets" | "wreck">,
): boolean {
  if (e.wreck || isSupplyCarrier(e.type) || e.type === "jumpjet") return false;
  const def = catalog(e.type);
  // A soldier with a magazine that reloads by itself can always fight on.
  if (isInfantryType(e.type) && supplyDrumOf(e.type) <= 0) return false;
  const left: (number | undefined)[] = [];
  if (def.ammo) {
    let full = 0;
    let have = 0;
    for (const s of SHELL_TYPES) {
      if (s === "smoke") continue;
      full += def.ammo[s] ?? 0;
      have += Math.max(0, e.ammo?.[s] ?? 0);
    }
    if (full > 0) left.push(e.ammo ? have : undefined);
  }
  const belt = beltOf(e.type);
  const drum = belt && belt.reload <= 0 ? belt.clip : supplyDrumOf(e.type);
  if (drum > 0) left.push(e.clip);
  if (rocketAmmoOf(e.type) > 0) left.push(e.rockets);
  if ((def.mgAmmo ?? 0) > 0) left.push(e.mgAmmo);
  if (left.length === 0 || left.some((n) => n == null)) return false;
  return left.every((n) => (n ?? 0) <= 0);
}
