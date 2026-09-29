import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BARRAGE_SPREAD_MS, TRACER_FLIGHT_MS, barrageTracers, tracerLandsAt, tracerSpan } from "./barrage-tracer.js";

describe("barrage tracers", () => {
  // Plane at the origin firing east: two lines at y = ±4, from x = 90 to x = 110.
  const plane = { x: 0, y: 0 };
  const impacts = [
    { id: 1, x: 90, y: 4 },
    { id: 2, x: 100, y: 4 },
    { id: 3, x: 110, y: 4 },
    { id: 4, x: 90, y: -4 },
    { id: 5, x: 100, y: -4 },
    { id: 6, x: 110, y: -4 },
  ];

  it("sends each round from the wing on its side of the line of fire", () => {
    const t = barrageTracers(plane, impacts, 6, 0);
    for (const tr of t) {
      assert.equal(Math.sign(tr.y0), Math.sign(tr.y1), `round ${tr.id} starts on its own wing`);
      assert.ok(Math.abs(Math.abs(tr.y0) - 6) < 1e-9);
    }
    assert.equal(t.filter((tr) => tr.wing === 1).length, 3);
    assert.equal(t.filter((tr) => tr.wing === -1).length, 3);
  });

  it("walks the hits out along the lines: near rounds land first", () => {
    const t = barrageTracers(plane, impacts, 6, 1000);
    const byId = new Map(t.map((tr) => [tr.id, tr]));
    assert.ok(tracerLandsAt(byId.get(1)!) < tracerLandsAt(byId.get(2)!));
    assert.ok(tracerLandsAt(byId.get(2)!) < tracerLandsAt(byId.get(3)!));
    assert.equal(byId.get(1)!.at, 1000);
    assert.equal(byId.get(3)!.at, 1000 + BARRAGE_SPREAD_MS);
    assert.equal(byId.get(1)!.at, byId.get(4)!.at, "both wings fire together");
  });

  it("the streak is drawn only between leaving the gun and landing", () => {
    const [tr] = barrageTracers(plane, impacts.slice(0, 1), 6, 0);
    assert.equal(tracerSpan(tr!, -1), null);
    assert.deepEqual(tracerSpan(tr!, 0), { head: 0, tail: 0 });
    const mid = tracerSpan(tr!, TRACER_FLIGHT_MS * 0.8)!;
    assert.ok(mid.head > mid.tail && mid.tail > 0);
    assert.equal(tracerSpan(tr!, TRACER_FLIGHT_MS + 1), null);
  });
});
