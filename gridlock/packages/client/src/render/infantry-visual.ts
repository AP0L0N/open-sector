import type { InfantryWeaponId } from "@gridlock/shared";

/** Which trooper sheet to draw. Stance sheets stay on spriteFor. */
export type TrooperSheet = "walk" | "crouch" | "crawl" | "swim" | "handgun" | "rifle-fire" | "die";

/** How long a rifle recoil pose stays up, ms. Shorter than the rifle cooldown. */
export const RIFLE_FIRE_MS = 450;

export function trooperSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  weapon?: InfantryWeaponId | null;
  shotAgeMs?: number | null;
}): TrooperSheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crouch") return "crouch";
  if (stance === "crawl") return "crawl";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < RIFLE_FIRE_MS;
  if (firing && opts.weapon !== "handgun") return "rifle-fire";
  if (opts.weapon === "handgun") return "handgun";
  return "walk";
}

export type GunnerSheet = "walk" | "crouch" | "crawl" | "swim" | "mg-fire" | "die";

/** Muzzle pose stays up across the 10 Hz gaps in a burst. */
export const MG_FIRE_MS = 160;

export function gunnerSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  shotAgeMs?: number | null;
}): GunnerSheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crouch") return "crouch";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < MG_FIRE_MS;
  if (stance === "crawl") return firing ? "mg-fire" : "crawl";
  return "walk";
}

export type CyborgSheet = "walk" | "fire" | "crawl" | "crawl-fire" | "swim" | "die";

/**
 * Cyborg. Stands, or drags himself once the legs are gone. The gatling fires
 * from either pose, and the burst holds the flash like the MG42.
 */
export function cyborgSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  shotAgeMs?: number | null;
}): CyborgSheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < MG_FIRE_MS;
  if (opts.stance === "crawl") return firing ? "crawl-fire" : "crawl";
  return firing ? "fire" : "walk";
}

export type SniperSheet = "walk" | "crouch" | "crawl" | "swim" | "fire" | "die";

/** Scoped-rifle recoil. Shorter than the bolt cooldown. */
export const SNIPER_FIRE_MS = 420;

export function sniperSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  shotAgeMs?: number | null;
}): SniperSheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crouch") return "crouch";
  if (stance === "crawl") return "crawl";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < SNIPER_FIRE_MS;
  if (firing) return "fire";
  return "walk";
}

export type AtInfantrySheet = "walk" | "crouch" | "crawl" | "swim" | "fire" | "die";

/** PTRD recoil. Shorter than the bolt, same window as the scoped rifle. */
export const AT_FIRE_MS = SNIPER_FIRE_MS;

export function atInfantrySheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  shotAgeMs?: number | null;
}): AtInfantrySheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crouch") return "crouch";
  if (stance === "crawl") return "crawl";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < AT_FIRE_MS;
  if (firing) return "fire";
  return "walk";
}

export type RocketerSheet = "walk" | "crouch" | "crawl" | "swim" | "fire" | "die";

/** Standing launch: the tube kicks and the backblast clears. Longer than the PTRD's recoil. */
export const ROCKETER_FIRE_MS = 500;

export function rocketerSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  shotAgeMs?: number | null;
}): RocketerSheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crouch") return "crouch";
  if (stance === "crawl") return "crawl";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < ROCKETER_FIRE_MS;
  if (firing) return "fire";
  return "walk";
}

export type PyroSheet = "walk" | "crouch" | "crawl" | "swim" | "fire" | "die";

/** A glob leaves the lance every tick of a burst, so this outlasts one tick and holds the pose through the burst. */
export const PYRO_FIRE_MS = 260;

export function pyroSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  shotAgeMs?: number | null;
}): PyroSheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crouch") return "crouch";
  if (stance === "crawl") return "crawl";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < PYRO_FIRE_MS;
  return firing ? "fire" : "walk";
}

export type MortarmanSheet = "walk" | "crouch" | "crawl" | "swim" | "fire" | "die";

/** Kneeling shot. The bomb is still in the air after this pose drops. */
export const MORTAR_FIRE_MS = 700;

export function mortarmanSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  shotAgeMs?: number | null;
}): MortarmanSheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crawl") return "crawl";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < MORTAR_FIRE_MS;
  if (stance === "crouch") return firing ? "fire" : "crouch";
  return "walk";
}

export type JumpJetSheet = "walk" | "crouch" | "crawl" | "swim" | "fire" | "fly" | "die";

/** Assault-rifle burst pose. Holds across the half-second between bursts. */
export const ASSAULT_FIRE_MS = 300;

/**
 * Jump Jet. In the air he hangs under the pack on the fly sheet, firing or
 * not: the flame is what reads. On the ground he is a trooper with a burst pose.
 */
export function jumpJetSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  aloft?: boolean;
  shotAgeMs?: number | null;
}): JumpJetSheet {
  if (opts.wreck) return "die";
  if (opts.aloft) return "fly";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crouch") return "crouch";
  if (stance === "crawl") return "crawl";
  const firing = opts.shotAgeMs != null && opts.shotAgeMs >= 0 && opts.shotAgeMs < ASSAULT_FIRE_MS;
  return firing ? "fire" : "walk";
}

export type MedicSheet = "walk" | "crouch" | "crawl" | "swim" | "die";

export function medicSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  tending?: boolean;
}): MedicSheet {
  if (opts.wreck) return "die";
  if (opts.swimming) return "swim";
  const stance = opts.stance ?? "stand";
  if (stance === "crawl") return "crawl";
  if (stance === "crouch" || opts.tending) return "crouch";
  return "walk";
}

/** One-shot frame that holds on the last cell instead of looping. */
export function heldFrame(ageMs: number, fps: number, frames: number): number {
  if (frames <= 1) return 0;
  const i = Math.floor((Math.max(0, ageMs) / 1000) * Math.max(1, fps));
  return Math.min(frames - 1, i);
}
