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
  // Big walkers only stride while the hull really moves, not while turning in place.
  if (opts.type === "walker" || opts.type === "titan") return travelled;
  return travelled || opts.state === "move" || !!opts.swimming || opts.state === "build" || opts.state === "repair";
}
