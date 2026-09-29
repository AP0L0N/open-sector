import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  airBurstPuffs,
  backblastPuffs,
  ROCKET_TRAIL_MS,
  ROCKET_TRAIL_SPACING,
  rocketPuffPose,
  trailPuffs,
} from "./rocket-smoke.js";

describe("rocket smoke", () => {
  it("lays a dense trail along the stretch the rocket flew", () => {
    const puffs = trailPuffs({ x: 0, y: 0, z: 20 }, { x: 60, y: 0, z: 10 }, 1000, 7);
    assert.equal(puffs.length, Math.floor(60 / ROCKET_TRAIL_SPACING));
    for (const p of puffs) {
      assert.ok(p.x > 0 && p.x <= 62, `x ${p.x}`);
      assert.ok(p.z <= 20 && p.z >= 10, `z ${p.z}`);
      assert.ok(p.life >= ROCKET_TRAIL_MS * 0.7, "the trail hangs for seconds");
      assert.ok(p.r1 > p.r0 * 2, "and spreads as it hangs");
    }
    assert.equal(trailPuffs({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, 0, 1).length, 0);
  });

  it("throws the backblast behind the Titan, against the rocket", () => {
    const puffs = backblastPuffs({ x: 100, y: 100, z: 30, ground: 0, dirX: 1, dirY: 0, now: 0, seed: 3 });
    assert.ok(puffs.length >= 20);
    const exhaust = puffs.filter((p) => p.z > 10);
    assert.ok(exhaust.length > 0);
    for (const p of exhaust) assert.ok(p.dx < 0, `exhaust drifts backward, dx ${p.dx}`);
    assert.ok(puffs.some((p) => p.z === 0 && p.shade > 0.5), "dust kicked off the ground");
  });

  it("fades out and grows over its life", () => {
    const [p] = airBurstPuffs(0, 0, 40, 0, 9);
    assert.ok(p);
    assert.equal(rocketPuffPose(p, p.at - 1), null);
    const early = rocketPuffPose(p, p.at + p.life * 0.1)!;
    const late = rocketPuffPose(p, p.at + p.life * 0.9)!;
    assert.ok(late.r > early.r);
    assert.ok(late.alpha < early.alpha);
    assert.equal(rocketPuffPose(p, p.at + p.life), null);
  });
});
