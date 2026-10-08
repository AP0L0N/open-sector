import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CRUSH_BUMP_LIFT_FRAC, CRUSH_BUMP_MS, bumpTilt, crushBump } from "./crush-bump.js";

describe("crush bump", () => {
  it("rises to its peak partway over and is gone once settled", () => {
    assert.equal(crushBump(1000, 999, 88), null);
    assert.equal(crushBump(1000, 1000 + CRUSH_BUMP_MS, 88), null);
    const start = crushBump(1000, 1000, 88)!;
    assert.ok(Math.abs(start.liftPx) < 1e-9);
    const peak = crushBump(1000, 1000 + CRUSH_BUMP_MS * 0.4, 88)!;
    assert.ok(Math.abs(peak.liftPx - 88 * CRUSH_BUMP_LIFT_FRAC) < 1e-9);
  });

  it("goes on nose up and comes off nose down", () => {
    assert.ok(crushBump(0, CRUSH_BUMP_MS * 0.2, 88)!.pitch > 0);
    assert.ok(crushBump(0, CRUSH_BUMP_MS * 0.6, 88)!.pitch < 0);
  });

  it("dips below the ground line as the springs catch it", () => {
    assert.ok(crushBump(0, CRUSH_BUMP_MS * 0.9, 88)!.liftPx < 0);
  });

  it("tilts the end the hull points at", () => {
    // Facing screen right, nose up turns the canvas counter-clockwise.
    assert.ok(bumpTilt(0.1, 1, 0) < 0);
    assert.ok(bumpTilt(0.1, -1, 0) > 0);
    assert.ok(Math.abs(bumpTilt(0.1, 0, 1)) < 1e-12);
  });
});
