import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MUZZLE_CLOUD_MS,
  MUZZLE_JET_MS,
  muzzleSmokePose,
  spawnMuzzleSmoke,
} from "./muzzle-smoke.js";

describe("spawnMuzzleSmoke", () => {
  it("throws a jet then a cloud along the shot", () => {
    const puffs = spawnMuzzleSmoke({
      x: 10,
      y: 20,
      dirX: 1,
      dirY: 0,
      now: 1000,
      seed: 7,
    });
    const jets = puffs.filter((p) => p.kind === "jet");
    const clouds = puffs.filter((p) => p.kind === "cloud");
    assert.ok(jets.length >= 4);
    assert.ok(clouds.length >= 4);
    const meanVx = puffs.reduce((s, p) => s + p.vx, 0) / puffs.length;
    assert.ok(meanVx > 0, "smoke should travel with the shell");
    assert.ok(jets.every((p) => p.life <= MUZZLE_JET_MS * 1.2));
    assert.ok(clouds.some((p) => p.life > MUZZLE_JET_MS));
  });

  it("keeps a west shot traveling west", () => {
    const puffs = spawnMuzzleSmoke({
      x: 0,
      y: 0,
      dirX: -8,
      dirY: 0,
      now: 0,
      seed: 3,
    });
    const meanVx = puffs.reduce((s, p) => s + p.vx, 0) / puffs.length;
    assert.ok(meanVx < 0);
  });
});

describe("muzzleSmokePose", () => {
  it("drifts along velocity and dies after its life", () => {
    const puff = spawnMuzzleSmoke({
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      now: 0,
      seed: 1,
    }).find((p) => p.kind === "jet")!;
    const mid = muzzleSmokePose(puff, puff.life * 0.4);
    assert.ok(mid);
    assert.ok(mid.x > puff.x);
    assert.ok(mid.lift > 4);
    assert.equal(muzzleSmokePose(puff, puff.life), null);
    assert.equal(muzzleSmokePose(puff, -1), null);
  });

  it("holds a cloud longer than a jet", () => {
    const puffs = spawnMuzzleSmoke({
      x: 0,
      y: 0,
      dirX: 0,
      dirY: 1,
      now: 0,
      seed: 9,
    });
    const jet = puffs.find((p) => p.kind === "jet")!;
    const cloud = puffs.find((p) => p.kind === "cloud")!;
    assert.ok(muzzleSmokePose(cloud, MUZZLE_CLOUD_MS * 0.6));
    assert.equal(muzzleSmokePose(jet, MUZZLE_CLOUD_MS * 0.6), null);
  });
});
