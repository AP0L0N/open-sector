/** World px a unit must cover between snapshots to count as travelling. */
export const STEP_MIN_TRAVEL = 0.5;

type Pos = { x: number; y: number };

/**
 * Whether a unit plays its walk / drive cycle. Attack-move and force-attack
 * keep the unit in "attack" while it travels, so actual travel between
 * snapshots counts too, not just the "move" state.
 */
export function unitStepping(opts: {
  type: string;
  state: string;
  swimming?: boolean;
  prev?: Pos;
  curr: Pos;
}): boolean {
  const travelled = !!opts.prev && Math.hypot(opts.prev.x - opts.curr.x, opts.prev.y - opts.curr.y) > STEP_MIN_TRAVEL;
  // Big walkers (the Borg spiders too, and the Mammoth) only stride while the hull really moves, not while turning in place.
  if (opts.type === "walker" || opts.type === "titan" || opts.type === "mammoth" || opts.type === "stalker" || opts.type === "behemoth" || opts.type === "ravager") return travelled;
  return travelled || opts.state === "move" || !!opts.swimming || opts.state === "build" || opts.state === "repair";
}

/**
 * World px the Walker covers in one full 8-frame stride (two steps). The legs
 * advance with ground covered, not the clock, so the feet keep pace with the
 * hull on a slope, in a slow column or on a charge.
 */
export const WALKER_STRIDE_WORLD = 26;

/** Longest single-frame hop counted as walking; anything longer is a snap or teleport. */
const STRIDE_MAX_HOP = 16;

/** Ground covered since the last frame, ignoring snaps. */
export function strideHop(prev: Pos | undefined, curr: Pos): number {
  if (!prev) return 0;
  const d = Math.hypot(curr.x - prev.x, curr.y - prev.y);
  return d > STRIDE_MAX_HOP ? 0 : d;
}

/** Walk-cycle column for `distance` world px walked; `id` offsets units so a squad does not march in lockstep. */
export function strideFrame(distance: number, strideLen: number, frames: number, id: number): number {
  const f = Math.floor((distance / strideLen) * frames + id * 0.37) % frames;
  return f < 0 ? f + frames : f;
}
