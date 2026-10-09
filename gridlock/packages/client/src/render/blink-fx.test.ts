import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BLINK_FX_MS, blinkFxAlpha, blinkRingRadius } from "./blink-fx.js";

describe("blink fx", () => {
  it("flashes at full strength and is gone at the end", () => {
    assert.equal(blinkFxAlpha(0), 1);
    const mid = blinkFxAlpha(BLINK_FX_MS / 2);
    assert.ok(mid > 0 && mid < 1, `mid ${mid}`);
    assert.equal(blinkFxAlpha(BLINK_FX_MS), 0);
    assert.equal(blinkFxAlpha(-1), 0);
  });

  it("grows the ring out from the unit", () => {
    assert.ok(blinkRingRadius(0, 100) < blinkRingRadius(BLINK_FX_MS, 100));
    assert.ok(blinkRingRadius(BLINK_FX_MS * 2, 100) === blinkRingRadius(BLINK_FX_MS, 100), "clamped at the end");
  });
});
