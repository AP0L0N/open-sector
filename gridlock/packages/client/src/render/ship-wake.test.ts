import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shipLeavesWake,
  shipWakeOrigins,
  shipWakePose,
  spawnShipWake,
  SHIP_WAKE_MS,
} from "./ship-wake.js";

describe("shipLeavesWake", () => {
  it("runs only on live hulls afloat", () => {
    const boat = { naval: true };
    assert.equal(shipLeavesWake(boat), true);
    assert.equal(shipLeavesWake({ ...boat, wreck: true }), false);
    assert.equal(shipLeavesWake({ ...boat, torpedo: true }), false);
    assert.equal(shipLeavesWake({ ...boat, garrisonedIn: 3 }), false);
    assert.equal(shipLeavesWake({}), false);
  });

  it("leaves no wake from a submarine running submerged", () => {
    assert.equal(shipLeavesWake({ naval: true, submerged: false }), true);
    assert.equal(shipLeavesWake({ naval: true, submerged: true }), false);
  });
});

describe("shipWakeOrigins", () => {
  it("drops port, starboard, and centre astern when under way", () => {
    const o = shipWakeOrigins(100, 50, 0, false, 14);
    assert.equal(o.length, 3);
    for (const p of o) assert.ok(p.x < 100);
    const [port, star, centre] = o;
    assert.ok(port!.y < 50 && star!.y > 50);
    assert.ok(port!.oy < 0 && star!.oy > 0, "side patches drift away from the keel");
    assert.ok(centre!.centre && centre!.y === 50);
  });

  it("drops them at the bow when going astern", () => {
    for (const p of shipWakeOrigins(100, 50, 0, true, 14)) assert.ok(p.x > 100);
  });
});

describe("shipWakePose", () => {
  it("spreads outward and fades out on the wall clock", () => {
    const [port] = shipWakeOrigins(0, 0, 0, false, 14);
    const patch = spawnShipWake(port!, 1000, 7, 1);
    const mid = shipWakePose(patch, 1000 + SHIP_WAKE_MS * 0.5);
    assert.ok(mid);
    assert.ok(mid.y < patch.y, "port patch drifts to port");
    assert.equal(shipWakePose(patch, 1000 + SHIP_WAKE_MS), null);
    assert.equal(shipWakePose(patch, 999), null);
  });
});
