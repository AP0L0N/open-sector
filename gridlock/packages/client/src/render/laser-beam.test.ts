import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beamAngle, beamEnd, beamLength, beamShare } from "./laser-beam.js";

describe("cyborg commander laser beam", () => {
  const sweep = { a0: -0.2, a1: 0.2, u: 0.5, dur: 0.6, lens: [100, 100, 60] };

  it("runs on from the snapshot's share at the sweep's own pace, and stops at the end", () => {
    assert.equal(beamShare(sweep, 1000, 1000), 0.5);
    assert.ok(Math.abs(beamShare(sweep, 1000, 1150) - 0.75) < 1e-9);
    assert.equal(beamShare(sweep, 1000, 5000), 1);
    assert.equal(beamShare({ ...sweep, line: true }, 1000, 1000), 1, "a line is always fully out");
  });

  it("swings from a0 to a1 and follows the sampled length", () => {
    assert.equal(beamAngle(sweep, 0), -0.2);
    assert.equal(beamAngle(sweep, 1), 0.2);
    assert.equal(beamLength(sweep.lens, 0.25), 100);
    assert.equal(beamLength(sweep.lens, 0.75), 80, "a building cuts the far end short");
    assert.equal(beamLength([42], 0.3), 42);
    const end = beamEnd({ ...sweep, a0: 0, a1: 0, lens: [50] }, 10, 20, 0);
    assert.deepEqual(end, { x: 60, y: 20 });
  });
});
