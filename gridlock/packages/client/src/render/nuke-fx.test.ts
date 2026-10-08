import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NUKE_FLASH_MS, NUKE_FX_MS, NUKE_RING_MS, NUKE_SCORCH_MS, nukeColor, nukePhase, nukeScorchAlpha } from "./nuke-fx.js";
import { titanFlameLength } from "./titan-jet-fx.js";

describe("nuke fx", () => {
  it("flashes white at once and the flash is gone within a second", () => {
    assert.equal(nukePhase(0).flash, 1);
    assert.equal(nukePhase(NUKE_FLASH_MS).flash, 0);
    assert.ok(NUKE_FLASH_MS <= 1000);
  });

  it("sends a shockwave out past the blast radius, then lets it go", () => {
    assert.equal(nukePhase(0).ring, 0);
    let last = -1;
    for (let t = 0; t <= NUKE_RING_MS; t += 50) {
      const r = nukePhase(t).ring;
      assert.ok(r >= last);
      last = r;
    }
    assert.ok(last > 1, "the ring outruns the damage radius");
    assert.equal(nukePhase(NUKE_RING_MS + 1).ringAlpha, 0);
  });

  it("starts as a fireball on the ground and rises into a cap that cools to smoke", () => {
    const start = nukePhase(0);
    assert.equal(start.capRise, 0, "the fireball starts on the ground");
    assert.equal(start.heat, 1);
    const late = nukePhase(6500);
    assert.ok(late.capRise > 1, "the cap stands well above ground zero");
    assert.ok(late.capR > start.capR);
    assert.equal(late.heat, 0);
    assert.deepEqual(nukeColor(1, 1), [255, 252, 236]);
    const smoke = nukeColor(0, 1);
    assert.ok(smoke[0] < 120 && smoke[1] < 120, "cold smoke is dark");
  });

  it("the cloud is gone by the end, the scorch outlives it and then fades", () => {
    assert.equal(nukePhase(NUKE_FX_MS).alpha, 0);
    assert.ok(nukeScorchAlpha(NUKE_FX_MS) > 0.3);
    assert.equal(nukeScorchAlpha(NUKE_SCORCH_MS), 0);
    assert.ok(nukeScorchAlpha(NUKE_SCORCH_MS * 0.9) < nukeScorchAlpha(NUKE_SCORCH_MS * 0.5));
  });
});

describe("titan thrust fx", () => {
  it("has no flame when cold and a flame under a third of the sprite at full burn", () => {
    assert.equal(titanFlameLength(100, 0, 0, 1), 0);
    const l = titanFlameLength(100, 1, 1234, 1);
    assert.ok(l > 20 && l <= 34);
  });
});
