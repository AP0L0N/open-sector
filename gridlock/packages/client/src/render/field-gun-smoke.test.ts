import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIELD_GUN_SMOKE_MS, fieldGunSmokePose, spawnFieldGunSmoke } from "./field-gun-smoke.js";

describe("spawnFieldGunSmoke", () => {
  const fire = (facing: number) => spawnFieldGunSmoke({ x: 0, y: 0, facing, radius: 10, now: 1000, seed: 11 });

  it("throws a thick cloud behind the gun, away from the barrel", () => {
    const puffs = fire(0);
    assert.ok(puffs.length >= 10, "a thick cloud, not a wisp");
    assert.ok(puffs.every((p) => p.x <= 0), "it starts behind the shield");
    const meanVx = puffs.reduce((s, p) => s + p.vx, 0) / puffs.length;
    assert.ok(meanVx < 0, "it rolls rearward");
  });

  it("follows the barrel when the gun faces south", () => {
    const puffs = fire(Math.PI / 2);
    const meanY = puffs.reduce((s, p) => s + p.y + p.vy, 0) / puffs.length;
    assert.ok(meanY < 0);
  });

  it("hangs for seconds, climbs, and swells", () => {
    const [p] = fire(0);
    assert.ok(p!.life > FIELD_GUN_SMOKE_MS * 0.6);
    const early = fieldGunSmokePose(p!, p!.at + 50)!;
    const late = fieldGunSmokePose(p!, p!.at + p!.life * 0.8)!;
    assert.ok(late.lift > early.lift);
    assert.ok(late.radius > early.radius);
    assert.equal(fieldGunSmokePose(p!, p!.at + p!.life), null);
    assert.equal(fieldGunSmokePose(p!, p!.at - 1), null);
  });
});
