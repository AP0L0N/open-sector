import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TORPEDO_RADIUS_PX, TORPEDO_SUBMERGED_ALPHA, torpedoOutline } from "./torpedo-draw.js";

describe("torpedo body", () => {
  it("is drawn see-through, as if under the surface", () => {
    assert.ok(TORPEDO_SUBMERGED_ALPHA > 0.3 && TORPEDO_SUBMERGED_ALPHA < 0.85);
  });

  it("has a tapered tail, a full-width run, and comes to a point at the nose", () => {
    const tail = { x: 0, y: 0 };
    const nose = { x: 20, y: 0 };
    const pts = torpedoOutline(tail, nose, TORPEDO_RADIUS_PX);
    const tip = pts.reduce((a, b) => (b.x > a.x ? b : a));
    assert.deepEqual(tip, nose);
    const widest = Math.max(...pts.map((p) => Math.abs(p.y)));
    assert.ok(Math.abs(widest - TORPEDO_RADIUS_PX) < 1e-9);
    const atTail = pts.filter((p) => p.x === 0).map((p) => Math.abs(p.y));
    assert.ok(Math.max(...atTail) < TORPEDO_RADIUS_PX * 0.5, "the tail cone narrows");
    // Mirror-symmetric about the axis.
    const above = pts.filter((p) => p.y > 0).map((p) => p.x).sort((a, b) => a - b);
    const below = pts.filter((p) => p.y < 0).map((p) => p.x).sort((a, b) => a - b);
    assert.deepEqual(above, below);
  });
});
