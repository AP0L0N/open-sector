/**
 * Recoil on the crewless Xenomorph guns (Spine Turret, Pulse Spire). Their gun sheets carry the
 * recoil frames as columns (tools/sprites/render_xeno_guns.py): column 0 at rest, then one column
 * per barrel with that barrel slid back. Each shot kicks the next barrel in turn, so the Spine
 * Turret's two needles slide back one after the other.
 */

/** How long a barrel stays back after its shot, ms. */
export const HIVE_GUN_RECOIL_MS = 150;

export interface HiveGunRecoil {
  /** Shots seen so far: picks which barrel kicks next. */
  shots: number;
  /** Barrel that kicked last, 1-based (its sheet column). */
  barrel: number;
  /** When it kicked, ms. */
  at: number;
}

/** `n` shots left the gun at `now`: the last of them sets which barrel is back. `barrels` is the sheet's recoil columns. */
export function noteHiveGunShots(prev: HiveGunRecoil | undefined, n: number, now: number, barrels: number): HiveGunRecoil {
  const shots = (prev?.shots ?? 0) + Math.max(1, n);
  return { shots, barrel: ((shots - 1) % Math.max(1, barrels)) + 1, at: now };
}

/** The sheet column to draw at `now`: the barrel still sliding back, or 0 at rest. */
export function hiveRecoilColumn(r: HiveGunRecoil | undefined, now: number): number {
  if (!r || now - r.at >= HIVE_GUN_RECOIL_MS || now < r.at) return 0;
  return r.barrel;
}
