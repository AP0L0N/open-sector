import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CART_HITCH_BACK, CART_MAX_FOLD, CART_TONGUE, cartStraight, followCart } from "./mauler-cart.js";

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

describe("followCart", () => {
  it("starts straight behind the dozer", () => {
    const c = followCart(null, 100, 50, 0);
    assert.ok(near(c.x, 100 - CART_HITCH_BACK - CART_TONGUE));
    assert.ok(near(c.y, 50));
    assert.ok(near(c.facing, 0));
  });

  it("stays in line while the dozer drives straight", () => {
    let c = cartStraight(0, 0, 0);
    for (let x = 1; x <= 40; x++) c = followCart(c, x, 0, 0);
    assert.ok(near(c.y, 0) && near(c.facing, 0));
    assert.ok(near(c.x, 40 - CART_HITCH_BACK - CART_TONGUE));
  });

  it("lags behind the hull on a turn and straightens out after", () => {
    let c = cartStraight(0, 0, 0);
    for (let i = 1; i <= 10; i++) c = followCart(c, 0, 0, (Math.PI / 4) * (i / 10));
    assert.ok(Math.abs(c.facing - Math.PI / 4) > 0.2, `cart does not turn with the hull: ${c.facing}`);
    let x = 0;
    let y = 0;
    for (let i = 0; i < 80; i++) {
      x += Math.cos(Math.PI / 4);
      y += Math.sin(Math.PI / 4);
      c = followCart(c, x, y, Math.PI / 4);
    }
    assert.ok(near(c.facing, Math.PI / 4, 1e-3), `cart trails in line: ${c.facing}`);
  });

  it("keeps the tongue length", () => {
    let c = cartStraight(0, 0, 0);
    c = followCart(c, 3, 2, 0.6);
    const hx = 3 - Math.cos(0.6) * CART_HITCH_BACK;
    const hy = 2 - Math.sin(0.6) * CART_HITCH_BACK;
    assert.ok(near(Math.hypot(hx - c.x, hy - c.y), CART_TONGUE));
  });

  it("does not fold the cart into the dozer on a spin", () => {
    const c = followCart(cartStraight(0, 0, 0), 0, 0, Math.PI * 0.95);
    let fold = c.facing - Math.PI * 0.95;
    while (fold > Math.PI) fold -= Math.PI * 2;
    while (fold < -Math.PI) fold += Math.PI * 2;
    assert.ok(Math.abs(fold) <= CART_MAX_FOLD + 1e-9);
  });

  it("resets when the hitch jumps", () => {
    const c = followCart(cartStraight(0, 0, 0), 500, 500, 1);
    const s = cartStraight(500, 500, 1);
    assert.ok(near(c.x, s.x) && near(c.y, s.y) && near(c.facing, 1));
  });
});
