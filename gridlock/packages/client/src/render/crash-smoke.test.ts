import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  crashTrailPuffs,
  layCrashTrail,
  layChargeTrail,
  chargeTrailPuffs,
  CRASH_TRAIL_SPACING,
  CHARGE_TRAIL_MS,
  CHARGE_TRAIL_SPACING,
} from "./crash-smoke.js";
import { trailPuffs } from "./rocket-smoke.js";

describe("crash smoke", () => {
  it("lays a thick black trail along the fall", () => {
    const from = { x: 0, y: 0, z: 20 };
    const to = { x: 48, y: 0, z: 16 };
    const puffs = crashTrailPuffs(from, to, 1000, 7);
    const rocket = trailPuffs(from, to, 1000, 7);
    assert.ok(puffs.length > rocket.length, "the crash trail is denser than a rocket");
    assert.ok(puffs.every((p) => p.shade >= 0.94), "the smoke is black");
    assert.ok(puffs.every((p) => p.r0 >= 7 && p.r1 >= 26), "the column is thick");
    assert.ok(puffs.every((p) => p.life > 3000));
    assert.equal(CRASH_TRAIL_SPACING < 3, true);
  });

  it("lays nothing on a step shorter than the spacing", () => {
    assert.equal(crashTrailPuffs({ x: 0, y: 0, z: 8 }, { x: 1, y: 0, z: 8 }, 0, 1).length, 0);
  });

  it("lays a short dark trail for a charging walker", () => {
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: 64, y: 0, z: 0 };
    const puffs = chargeTrailPuffs(from, to, 1000, 9);
    const crash = crashTrailPuffs(from, to, 1000, 9);
    assert.ok(puffs.length > 0);
    assert.ok(puffs.length < crash.length, "the charge trail is thinner than a crash column");
    assert.ok(puffs.every((p) => p.shade >= 0.9), "the smoke is dark");
    assert.ok(puffs.every((p) => p.life <= CHARGE_TRAIL_MS * 1.2 && p.life < 1600));
    assert.ok(puffs.every((p) => p.r1 < 16));
    assert.ok(CHARGE_TRAIL_SPACING > CRASH_TRAIL_SPACING);
    let head: { x: number; y: number; z: number } | undefined;
    let n = 0;
    for (let i = 1; i <= 24; i++) {
      const laid = layChargeTrail(head, { x: i, y: 0, z: 0 }, 0, 4);
      head = laid.from;
      n += laid.puffs.length;
    }
    assert.ok(n >= 2, `short frames should add up, laid ${n}`);
  });

  it("keeps a short step so the column does not skip", () => {
    let from: { x: number; y: number; z: number } | undefined;
    let n = 0;
    for (let i = 1; i <= 12; i++) {
      const laid = layCrashTrail(from, { x: i, y: 0, z: 16 }, 0, 3);
      from = laid.from;
      n += laid.puffs.length;
    }
    assert.ok(n >= 3, `short frames should add up, laid ${n}`);
    assert.ok(from && from.x > 0);
  });
});
