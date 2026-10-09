import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CIWS_BURST_TRACERS,
  CIWS_STREAM_MS,
  CIWS_TRACER_EVERY,
  CIWS_TRACER_MAX_MS,
  ciwsBurstTracers,
  ciwsTracers,
  isTracerRound,
} from "./ciws-tracer.js";

const muzzle = { x: 100, y: 100, z: 3 };
const ground = () => 0;

describe("CIWS tracers", () => {
  it("lights one round in CIWS_TRACER_EVERY", () => {
    const impacts = Array.from({ length: CIWS_TRACER_EVERY * 4 }, (_, k) => ({ id: 500 + k, x: 300, y: 100 + k }));
    const streaks = ciwsTracers(muzzle, impacts, ground, 0, 32);
    assert.equal(streaks.length, 4);
    assert.ok(streaks.every((s) => isTracerRound(s.id)));
  });

  it("runs from the barrels to where each round ended, aloft when it missed a plane", () => {
    const [up, down] = ciwsTracers(
      muzzle,
      [
        { id: CIWS_TRACER_EVERY * 70, x: 400, y: 100, airZ: 40 },
        { id: CIWS_TRACER_EVERY * 71, x: 200, y: 140 },
      ],
      () => 1.5,
      0,
      32,
    );
    assert.deepEqual([up!.x0, up!.y0, up!.z0], [100, 100, 3]);
    assert.deepEqual([up!.x1, up!.y1, up!.z1], [400, 100, 40]);
    assert.equal(down!.z1, 1.5, "a round that came down ends on the ground");
  });

  it("spreads one snapshot's rounds into a stream, oldest first", () => {
    const impacts = Array.from({ length: 9 }, (_, k) => ({ id: 900 - k * CIWS_TRACER_EVERY, x: 300, y: 100 }));
    const streaks = ciwsTracers(muzzle, impacts, ground, 1000, 32);
    const ats = streaks.map((s) => s.at);
    assert.deepEqual(ats, [...ats].sort((a, b) => a - b));
    assert.ok(ats[0]! >= 1000 && ats.at(-1)! < 1000 + CIWS_STREAM_MS);
    assert.ok(streaks.every((s) => s.dur > 0 && s.dur <= CIWS_TRACER_MAX_MS));
  });

  it("fans a rocket burst along the bearing and climbs", () => {
    const fan = ciwsBurstTracers(muzzle, 0, 200, 4, 0, 7, 32);
    assert.equal(fan.length, CIWS_BURST_TRACERS);
    for (const s of fan) {
      assert.ok(s.x1 > muzzle.x + 190, "out along the bearing");
      assert.ok(Math.abs(s.y1 - muzzle.y) < 30, "a narrow fan");
      assert.ok(s.z1 > muzzle.z);
    }
  });
});
