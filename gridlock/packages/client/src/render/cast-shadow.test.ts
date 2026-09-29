import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildingShadowFootprint, convexHull, shadowOffset, treeShadowFootprint } from "./cast-shadow.js";

function signedArea(points: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

describe("shadowOffset", () => {
  it("falls east and a little south, longer for taller casters", () => {
    const low = shadowOffset(10);
    const high = shadowOffset(40);
    assert.ok(low.x > 0 && low.y > 0 && low.x > low.y);
    assert.ok(Math.hypot(high.x, high.y) > Math.hypot(low.x, low.y));
    assert.deepEqual(shadowOffset(-5), { x: 0, y: 0 });
  });
});

describe("convexHull", () => {
  it("drops interior points", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 },
    ]);
    assert.equal(hull.length, 4);
  });
});

describe("buildingShadowFootprint", () => {
  it("covers the footprint and reaches past its sun-side corner", () => {
    const poly = buildingShadowFootprint({ x: 0, y: 0, w: 32, h: 32, height: 40 });
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    assert.equal(Math.min(...xs), 0);
    assert.equal(Math.min(...ys), 0);
    assert.ok(Math.max(...xs) > 32 && Math.max(...ys) > 32);
  });
});

describe("treeShadowFootprint", () => {
  it("leans away from the stem, wound like the building hull", () => {
    const tree = treeShadowFootprint({ x: 0, y: 0, height: 60, crown: 8 });
    const cx = tree.reduce((s, p) => s + p.x, 0) / tree.length;
    assert.ok(cx > 0);
    const hull = buildingShadowFootprint({ x: 0, y: 0, w: 16, h: 16, height: 20 });
    // One nonzero fill only merges overlaps when every polygon winds the same way.
    assert.equal(Math.sign(signedArea(tree)), Math.sign(signedArea(hull)));
  });
});
