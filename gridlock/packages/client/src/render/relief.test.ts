import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contourSegments, hillshadeFactor } from "./relief.js";

const quad = [
  { x: 0, y: 0 },
  { x: 10, y: 5 },
  { x: 0, y: 10 },
  { x: -10, y: 5 },
] as const;

describe("terrain relief", () => {
  it("lights slopes that face the sun and darkens the far side", () => {
    assert.equal(hillshadeFactor(4, 4, 4, 4), 1);
    // Rising toward +x (away from the upper-left sun) faces it.
    assert.ok(hillshadeFactor(0, 2, 2, 0) > 1);
    assert.ok(hillshadeFactor(2, 0, 0, 2) < 1);
  });

  it("draws a contour where a terrace level crosses the tile", () => {
    assert.equal(contourSegments(quad, [1, 1, 1, 1], 4).length, 0);
    const seg = contourSegments(quad, [2, 6, 6, 2], 4);
    assert.equal(seg.length, 2);
    // Halfway along the n→e and s→w edges.
    assert.deepEqual(seg[0], { x: 5, y: 2.5 });
    assert.deepEqual(seg[1], { x: -5, y: 7.5 });
  });

  it("stacks one contour per terrace on a steep tile", () => {
    assert.equal(contourSegments(quad, [0, 9, 9, 0], 4).length, 4);
  });
});
