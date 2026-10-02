import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildingGroundElev, wallFootprint, yardWearFootprint } from "./building-ground.js";

describe("buildingGroundElev", () => {
  it("matches flat ground", () => {
    const heights = new Array(16 * 16).fill(5);
    assert.equal(buildingGroundElev(heights, 16, 16, 4, 4, 4, 4), 5);
  });

  it("sits on the lowest visible corner so a slope shows no air under it", () => {
    // Ground falls toward the south (larger y): rows are 10, 9, 8, ...
    const heights: number[] = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) heights.push(10 - y * 0.5);
    const elev = buildingGroundElev(heights, 16, 16, 4, 4, 4, 4);
    // The north-west tile is height 8; the south edge is lower, and the building follows it.
    assert.ok(elev < 8);
    assert.equal(elev, 10 - 7.5 * 0.5);
  });
});

describe("wallFootprint", () => {
  it("is centred inside the footprint", () => {
    const r = wallFootprint(0, 0, 100, 100);
    assert.ok(r.x > 0 && r.y > 0);
    assert.equal(r.x + r.w / 2, 50);
    assert.equal(r.y + r.h / 2, 50);
    assert.ok(r.w < 100 && r.h < 100);
  });
});

describe("yardWearFootprint", () => {
  it("reaches past the footprint on every side", () => {
    const pts = yardWearFootprint({ x: 0, y: 0, w: 96, h: 96 });
    assert.ok(Math.min(...pts.map((p) => p.x)) < 0);
    assert.ok(Math.min(...pts.map((p) => p.y)) < 0);
    assert.ok(Math.max(...pts.map((p) => p.x)) > 96);
    assert.ok(Math.max(...pts.map((p) => p.y)) > 96);
  });

  it("holds still between frames", () => {
    const a = yardWearFootprint({ x: 32, y: 64, w: 64, h: 64 });
    const b = yardWearFootprint({ x: 32, y: 64, w: 64, h: 64 });
    assert.deepEqual(a, b);
  });
});
