import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  spawnTrackKickPuffs,
  tankTracksKick,
  trackKickOrigins,
  trackKickPose,
  trackKickTravel,
  TRACK_KICK_MS,
} from "./track-kick.js";

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

describe("tankTracksKick", () => {
  it("runs only on live tracked hulls", () => {
    const tank = { kind: "unit", turnInPlace: true };
    assert.equal(tankTracksKick(tank), true);
    assert.equal(tankTracksKick({ ...tank, wreck: true }), false);
    assert.equal(tankTracksKick({ ...tank, swimming: true }), false);
    assert.equal(tankTracksKick({ ...tank, immobilized: true }), false);
    assert.equal(tankTracksKick({ ...tank, garrisonedIn: 4 }), false);
    assert.equal(tankTracksKick({ kind: "unit" }), false);
    assert.equal(tankTracksKick({ kind: "building", turnInPlace: true }), false);
  });
});

describe("trackKickTravel", () => {
  it("returns null when the hull is only yawing", () => {
    assert.equal(trackKickTravel(0, 0, 0), null);
    assert.equal(trackKickTravel(0.1, 0, 0), null);
  });

  it("tosses opposite a forward roll", () => {
    const t = trackKickTravel(10, 0, 0);
    assert.ok(t);
    assert.equal(t.reverse, false);
    assert.ok(near(t.tossX, -1));
    assert.ok(near(t.tossY, 0));
  });

  it("marks reverse and tosses toward the bow", () => {
    const t = trackKickTravel(-10, 0, 0);
    assert.ok(t);
    assert.equal(t.reverse, true);
    assert.ok(near(t.tossX, 1));
    assert.ok(near(t.tossY, 0));
  });
});

describe("trackKickOrigins", () => {
  it("puts both treads behind the hull when rolling forward", () => {
    const [a, b] = trackKickOrigins(100, 50, 0, false, 12);
    assert.ok(a.x < 100 && b.x < 100);
    assert.ok(a.y < 50 && b.y > 50);
  });

  it("puts both treads ahead of the hull when reversing", () => {
    const [a, b] = trackKickOrigins(100, 50, 0, true, 12);
    assert.ok(a.x > 100 && b.x > 100);
    assert.ok(a.y < 50 && b.y > 50);
  });
});

describe("trackKickPose", () => {
  it("drifts along the toss and dies after its life", () => {
    const puff = spawnTrackKickPuffs({ x: 0, y: 0 }, -1, 0, 1000, 1, false, 1)[0]!;
    const mid = trackKickPose(puff, 1000 + TRACK_KICK_MS * 0.4);
    assert.ok(mid);
    assert.ok(mid.x < puff.x, "clod should travel opposite the hull");
    assert.ok(mid.lift > 0.5);
    assert.equal(trackKickPose(puff, 1000 + TRACK_KICK_MS), null);
  });

  it("keeps wall-clock life so the toss still reads at high game speed", () => {
    const puff = spawnTrackKickPuffs({ x: 0, y: 0 }, -1, 0, 0, 2, false, 1)[0]!;
    assert.ok(trackKickPose(puff, TRACK_KICK_MS * 0.5));
    assert.equal(trackKickPose(puff, TRACK_KICK_MS), null);
  });
});
