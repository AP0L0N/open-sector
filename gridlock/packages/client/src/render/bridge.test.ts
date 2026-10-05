import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRIDGE_DECK_RISE, bridgeDeckElev } from "./bridge.js";

describe("bridge deck height", () => {
  it("meets each bank at its end and lifts over the water between", () => {
    const h = { a: 2, b: 4 };
    assert.equal(bridgeDeckElev(h, 0, 0.2), 2);
    assert.equal(bridgeDeckElev(h, 1, 0.2), 4);
    assert.equal(bridgeDeckElev(h, 0.5, 0.2), 3 + BRIDGE_DECK_RISE);
    // Halfway up the ramp: half the lift.
    assert.ok(Math.abs(bridgeDeckElev({ a: 0, b: 0 }, 0.1, 0.2) - BRIDGE_DECK_RISE / 2) < 1e-9);
  });
});
