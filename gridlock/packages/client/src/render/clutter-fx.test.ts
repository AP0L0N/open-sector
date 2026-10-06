import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clutterChip } from "./clutter-fx.js";

describe("clutterChip", () => {
  it("starts at the foot, flies out, and lands back on the ground", () => {
    for (let n = 0; n < 7; n++) {
      const start = clutterChip(3, n, 0);
      assert.ok(Math.abs(start.x) < 1e-9);
      assert.ok(Math.abs(start.y) < 1e-9);
      const mid = clutterChip(3, n, 0.5);
      const end = clutterChip(3, n, 1);
      assert.ok(Math.hypot(end.x, end.y) > 2.5, "never left the foot");
      assert.ok(mid.y < end.y, "never arcs up");
    }
  });

  it("throws the same chips for the same piece", () => {
    assert.deepEqual(clutterChip(11, 2, 0.4), clutterChip(11, 2, 0.4));
    assert.notDeepEqual(clutterChip(11, 2, 0.4), clutterChip(12, 2, 0.4));
  });
});
