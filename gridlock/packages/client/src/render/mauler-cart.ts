/**
 * Mauler scrap cart on a hitch. Client-only; the sim still treats the cart
 * as part of the hull for hits and harvesting.
 *
 * The cart pulls toward the hitch pin like a real trailer: its tongue keeps a
 * fixed length and points from the cart to the pin, so the cart cuts corners
 * on a turn and swings out when the dozer yaws in place.
 */

/** Mauler hull and cart draw this much larger than the base vehicle scale; the hitch grows with them. */
export const MAULER_SCALE = 1.2;
/** World px from the dozer's centre back to the hitch pin. */
export const CART_HITCH_BACK = 9 * MAULER_SCALE;
/** World px from the hitch pin to the cart's centre. */
export const CART_TONGUE = 7 * MAULER_SCALE;
/** Hardest the tongue can fold against the dozer's rear before the cart would clip it. */
export const CART_MAX_FOLD = (75 * Math.PI) / 180;
/** A hitch that jumps farther than this in one frame (spawn, fog reveal) resets the cart. */
const CART_SNAP_DIST = 24;

export interface CartPose {
  x: number;
  y: number;
  /** World heading of the cart (0 = east), pointing at the hitch. */
  facing: number;
}

export function cartHitch(x: number, y: number, facing: number): { x: number; y: number } {
  return { x: x - Math.cos(facing) * CART_HITCH_BACK, y: y - Math.sin(facing) * CART_HITCH_BACK };
}

/** Cart straight behind the dozer. */
export function cartStraight(x: number, y: number, facing: number): CartPose {
  const h = cartHitch(x, y, facing);
  return {
    x: h.x - Math.cos(facing) * CART_TONGUE,
    y: h.y - Math.sin(facing) * CART_TONGUE,
    facing,
  };
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Next cart pose after the dozer moves to (x, y, facing). */
export function followCart(prev: CartPose | null, x: number, y: number, facing: number): CartPose {
  if (!prev) return cartStraight(x, y, facing);
  const h = cartHitch(x, y, facing);
  const dx = h.x - prev.x;
  const dy = h.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6 || len > CART_TONGUE + CART_SNAP_DIST) return cartStraight(x, y, facing);
  let heading = Math.atan2(dy, dx);
  const fold = wrap(heading - facing);
  if (Math.abs(fold) > CART_MAX_FOLD) heading = facing + Math.sign(fold) * CART_MAX_FOLD;
  return {
    x: h.x - Math.cos(heading) * CART_TONGUE,
    y: h.y - Math.sin(heading) * CART_TONGUE,
    facing: wrap(heading),
  };
}
