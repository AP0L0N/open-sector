import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { treeFallBits } from "./tree-fall.js";

describe("tree fall", () => {
  it("throws leaves above the stump, then lets the husk drop", () => {
    const mid = treeFallBits(0.4, 7);
    const leaves = mid.filter((b) => b.kind === "leaf");
    const husks = mid.filter((b) => b.kind === "husk");
    assert.ok(leaves.length >= 4);
    assert.ok(husks.length >= 1);
    assert.ok(leaves.some((b) => b.y < -12), "a leaf is still in the air");
    const late = treeFallBits(0.92, 7);
    const lateHusk = late.filter((b) => b.kind === "husk");
    assert.ok(lateHusk.length >= 1);
    assert.ok(lateHusk.every((b) => b.y > -8), "husk has come back down");
  });
});
