import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BURN_POSES, burnAnimMs, burnDeathPose, burnFallAgeMs } from "./burn-death.js";

describe("burned infantry", () => {
  it("holds a black sprite, then collapses, and the three poses differ", () => {
    assert.deepEqual(
      BURN_POSES.map((p) => p.standMs),
      [1000, 1500, 2000],
    );
    for (const variant of [0, 1, 2] as const) {
      const spec = BURN_POSES[variant];
      const burn = burnDeathPose(spec.standMs - 1, variant);
      assert.equal(burn.phase, "burn");
      assert.equal(burn.heat, 1);
      assert.ok(burn.brightness < 0.2, "the standing sprite is blackened");
      assert.equal(burn.rot, 0);
      const mid = burnDeathPose(spec.standMs + spec.fallMs * 0.5, variant);
      assert.equal(mid.phase, "fall");
      assert.ok(mid.heat < 1 && mid.heat > 0);
      assert.ok(Math.abs(mid.rot) > 0 || variant === 2);
      const down = burnDeathPose(burnAnimMs(variant) + 10, variant);
      assert.equal(down.phase, "down");
      assert.equal(down.heat, 0);
      assert.ok(down.brightness > burn.brightness && down.brightness < 0.45, "the body stays a dark shade");
      assert.equal(down.fallT, 1);
    }
    assert.notEqual(BURN_POSES[0].rot, BURN_POSES[1].rot);
    assert.notEqual(BURN_POSES[1].sink, BURN_POSES[2].sink);
  });

  it("maps the collapse onto the die sheet", () => {
    assert.equal(burnFallAgeMs(0, 8, 4), 0);
    assert.equal(burnFallAgeMs(1, 8, 4), 375);
    assert.equal(burnFallAgeMs(0.5, 8, 4), 187.5);
  });
});
