/**
 * Ammo strips under an allied health bar. Only finite stores a truck refills:
 * the shell rack, the coaxial belt, rocket pods, a belt that never reloads, and
 * the cyborg drum. A supply truck or boat shows its cargo. A Jump Jet shows his pack
 * as the yellow bar. Smoke is left out — it is a screen, not the gun's reserve.
 */
import {
  BATTLESHIP_BARREL_AMMO,
  BATTLESHIP_BARRELS_PER_TURRET,
  BATTLESHIP_CIWS_AT,
  BATTLESHIP_CIWS_BELT,
  BATTLESHIP_TURRET_AT,
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
/** A plasma cannon's energy cell: the hive keeps its rack full, the cell sets how fast it fires. */
export const ENERGY_FILL = "rgba(96, 226, 214, 0.95)";

function fraction(left: number, full: number): number {
  return Math.max(0, Math.min(1, left / full));
}

/** Battle Ship: every barrel's shells, then both CIWS belts. Undefined when the view carries no stores (an enemy). */
function shipStores(ship: EntityView["ship"]): { shells: number; rounds: number } | undefined {
  if (!ship) return undefined;
  let shells = 0;
  let rounds = 0;
  for (const t of ship.turrets) {
    if (!t.ammo) return undefined;
    for (const n of t.ammo) shells += Math.max(0, n);
  }
  for (const m of ship.ciws) {
    if (m.ammo == null) return undefined;
    rounds += Math.max(0, m.ammo);
  }
  return { shells, rounds };
}

const SHIP_SHELLS = BATTLESHIP_TURRET_AT.length * BATTLESHIP_BARRELS_PER_TURRET * BATTLESHIP_BARREL_AMMO;
const SHIP_ROUNDS = BATTLESHIP_CIWS_AT.length * BATTLESHIP_CIWS_BELT;

/** Main store first (the yellow bar), then the secondary store. At most two. Empty when nothing is finite or the view is not allied. */
export function ammoBarRatios(
  e: Pick<EntityView, "type" | "ammo" | "mgAmmo" | "clip" | "rockets" | "heavy" | "wreck" | "supply" | "jet" | "ship" | "energy"> & { ark?: EntityView["ark"] },
): number[] {
  if (e.wreck) return [];
  // The Hive Ark: each cannon's own energy cell, fore then aft. Enemies get no charge, so no strip.
  if (e.ark) {
    const cells = e.ark.cannons.map((c) => c.energy);
    return cells.every((c) => c != null) ? cells.map((c) => fraction(c!, 1)) : [];
  }
  if (isSupplyCarrier(e.type)) return e.supply != null ? [fraction(e.supply, SUPPLY_CARGO)] : [];
  // The Battle Ship: main-battery shells yellow, the CIWS belts gray.
  if (e.type === "battleship") {
    const s = shipStores(e.ship);
    return s ? [fraction(s.shells, SHIP_SHELLS), fraction(s.rounds, SHIP_ROUNDS)] : [];
  }
  // The pack is the yellow bar. Enemies get height only, so the strip stays hidden.
  if (e.type === "jumpjet") {
    const fuel = e.jet?.fuel;
    const full = e.jet?.fuelMax ?? 0;
    return fuel != null && full > 0 ? [fraction(fuel, full)] : [];
  }
  // A plasma cannon: the cell is the only store that runs low.
  if (e.energy != null) return [fraction(e.energy, 1)];
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
  e: Pick<EntityView, "type" | "ammo" | "mgAmmo" | "clip" | "rockets" | "wreck" | "ship">,
): boolean {
  if (e.wreck || isSupplyCarrier(e.type) || e.type === "jumpjet") return false;
  if (e.type === "battleship") {
    const s = shipStores(e.ship);
    return !!s && s.shells <= 0 && s.rounds <= 0;
  }
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
