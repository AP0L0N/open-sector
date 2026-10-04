import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PTRD_TRACER_MAX_MS, PTRD_TRACER_MIN_MS, ptrdTracers } from "./ptrd-tracer.js";

const muzzle = { x: 100, y: 100, z: 2 };

describe("PTRD tracers", () => {
  it("draws every round, muzzle to where it ended on the ground", () => {
    const streaks = ptrdTracers(
      muzzle,
      [
        { id: 12, x: 400, y: 100 },
        { id: 11, x: 150, y: 120 },
      ],
      () => 1,
      1000,
      32,
    );
    assert.deepEqual(
      streaks.map((s) => s.id),
      [11, 12],
    );
    for (const s of streaks) {
      assert.equal(s.x0, 100);
      assert.equal(s.y0, 100);
      assert.equal(s.z0, 2);
      assert.equal(s.z1, 1);
      assert.equal(s.at, 1000);
    }
    assert.equal(streaks[1]!.x1, 400);
  });

  it("takes longer to reach a far target, within its bounds", () => {
    const [near, far] = ptrdTracers(
      muzzle,
      [
        { id: 1, x: 104, y: 100 },
        { id: 2, x: 5000, y: 100 },
      ],
      () => 0,
      0,
      32,
    );
    assert.equal(near!.dur, PTRD_TRACER_MIN_MS);
    assert.equal(far!.dur, PTRD_TRACER_MAX_MS);
    const [mid] = ptrdTracers(muzzle, [{ id: 3, x: 300, y: 100 }], () => 2, 0, 32);
    assert.ok(mid!.dur > PTRD_TRACER_MIN_MS && mid!.dur < PTRD_TRACER_MAX_MS);
  });
});
