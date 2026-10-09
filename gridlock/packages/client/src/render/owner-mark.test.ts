import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownerRingPoints, ownerRingRadius } from "./owner-mark.js";

describe("ownerRingPoints", () => {
  it("rings the feet at the given radius", () => {
    const pts = ownerRingPoints(100, 50, 8);
    assert.ok(pts.length >= 12);
    for (const p of pts) assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 50) - 8) < 1e-9);
  });
});

describe("ownerRingRadius", () => {
  it("keeps a soldier's ring readable and a tank's wider", () => {
    assert.ok(ownerRingRadius(1, 0.9, true) >= 5);
    assert.ok(ownerRingRadius(14, 1.25, false) > ownerRingRadius(6, 0.9, true));
  });
});
