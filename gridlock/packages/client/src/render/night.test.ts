import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NIGHT_SHADE_MAX, beamPolygon, easeSpot, lampGlow, nightShade } from "./night.js";

describe("night render", () => {
  it("shades nothing by day and the most at full dark", () => {
    assert.equal(nightShade(1), 0);
    assert.equal(nightShade(0), NIGHT_SHADE_MAX);
    assert.ok(nightShade(0.5) > 0 && nightShade(0.5) < NIGHT_SHADE_MAX);
  });

  it("keeps the lamps dark by day and full at night", () => {
    assert.equal(lampGlow(1), 0);
    assert.equal(lampGlow(0), 1);
  });

  it("sweeps the beam toward the new heading the short way, a step at a time", () => {
    assert.equal(easeSpot(0, 0.05, 0.1), 0.05);
    assert.equal(easeSpot(0, 1, 0.1), 0.1);
    const wrapped = easeSpot(3, -3, 0.1);
    assert.ok(wrapped > 3, "crosses ±π instead of turning the long way");
  });

  it("opens the beam from the lamp to its reach", () => {
    const pts = beamPolygon(10, 20, 0, 100, Math.PI / 8, 4);
    assert.deepEqual(pts[0], { x: 10, y: 20 });
    assert.equal(pts.length, 6);
    for (const p of pts.slice(1)) assert.ok(Math.abs(Math.hypot(p.x - 10, p.y - 20) - 100) < 1e-9);
  });
});
