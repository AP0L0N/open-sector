/** Which trooper sheet to draw. Stance sheets stay on spriteFor. */
export type TrooperSheet = "walk" | "crouch" | "crawl" | "swim" | "handgun" | "rifle-fire" | "die";

/** How long a rifle recoil pose stays up, ms. Shorter than the rifle cooldown. */
export const RIFLE_FIRE_MS = 450;

export function trooperSheet(opts: {
  swimming?: boolean;
  wreck?: boolean;
  stance?: "stand" | "crouch" | "crawl";
  weapon?: "rifle" | "handgun" | "mg42" | null;
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

/** One-shot frame that holds on the last cell instead of looping. */
export function heldFrame(ageMs: number, fps: number, frames: number): number {
  if (frames <= 1) return 0;
  const i = Math.floor((Math.max(0, ageMs) / 1000) * Math.max(1, fps));
  return Math.min(frames - 1, i);
}
