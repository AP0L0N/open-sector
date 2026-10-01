import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog } from "@gridlock/shared";
import {
  spawnTrackKickPuffs,
  tankTracksKick,
  trackKickOrigins,
  trackKickPose,
  trackKickTravel,
  treadReachWorld,
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

  it("kicks for the Rig, which turns in place like a tank", () => {
    assert.equal(catalog("rig").turnInPlace, true);
    assert.equal(
      tankTracksKick({ kind: "unit", turnInPlace: catalog("rig").turnInPlace }),
      tankTracksKick({ kind: "unit", turnInPlace: catalog("warden").turnInPlace }),
    );
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

  it("plants the treads at an explicit reach instead of the collision radius", () => {
    const [a, b] = trackKickOrigins(100, 50, 0, false, 12, 30);
    assert.ok(near(a.x, 70));
    assert.ok(near(b.x, 70));
    assert.ok(a.y < 50 && b.y > 50);
  });
});

describe("treadReachWorld", () => {
  it("reaches a painted tread that sticks out past the collision circle", () => {
    const cell = 40;
    const opaque = (x: number, y: number) => x === 4 && y === 39;
    const reach = treadReachWorld({
      cell,
      contactY: 1,
      drawSize: 40,
      facing: 0,
      radius: 4,
      hw: 1,
      hh: 0.5,
      opaque,
    });
    assert.ok(near(reach.back, 13.2, 0.02), `back ${reach.back}`);
  });

  it("keeps the collision reach when the paint sits inside the circle", () => {
    const opaque = (x: number, y: number) => x === 20 && y === 39;
    const reach = treadReachWorld({
      cell: 40,
      contactY: 1,
      drawSize: 40,
      facing: 0,
      radius: 4,
      hw: 1,
      hh: 0.5,
      opaque,
    });
    assert.ok(near(reach.back, 4 * 0.95));
    assert.ok(near(reach.front, 4 * 0.95));
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
