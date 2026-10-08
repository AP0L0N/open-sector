import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOW_NOZZLE_LIFT,
  BOW_NOZZLE_REACH,
  TWIN_GATLING_LIFT,
  TWIN_GATLING_REACH,
  TWIN_GATLING_SIDE,
  bowNozzle,
  twinGatlingMuzzles,
} from "./gatling-turret.js";

/** World facings that land screen-east and screen-south on the 2:1 map. */
const SCREEN_EAST = -Math.PI / 4;
const SCREEN_SOUTH = Math.PI / 4;

describe("twinGatlingMuzzles", () => {
  it("puts one muzzle each side of the barrels' line, both pointing down the barrels", () => {
    const [a, b] = twinGatlingMuzzles(0, 0, 100, SCREEN_EAST);
    for (const m of [a!, b!]) {
      assert.ok(Math.abs(m.x - TWIN_GATLING_REACH * 100) < 1e-6);
      assert.ok(m.dirX > 0.99);
    }
    // Across the barrels on screen-east is the depth axis, halved on the map.
    assert.ok(Math.abs(Math.abs(a!.y - b!.y) - TWIN_GATLING_SIDE * 100) < 1e-6);
    assert.ok(Math.abs((a!.y + b!.y) / 2 + TWIN_GATLING_LIFT * 100) < 1e-6);
  });

  it("splits the pair across the screen when the turret faces the viewer", () => {
    const [a, b] = twinGatlingMuzzles(0, 0, 100, SCREEN_SOUTH);
    assert.ok(Math.abs(Math.abs(a!.x - b!.x) - 2 * TWIN_GATLING_SIDE * 100) < 1e-6);
    assert.ok(a!.dirY > 0.99 && b!.dirY > 0.99);
  });
});

describe("bowNozzle", () => {
  it("rides the hull nose, below the gatlings", () => {
    const m = bowNozzle(0, 0, 100, SCREEN_EAST);
    assert.ok(Math.abs(m.x - BOW_NOZZLE_REACH * 100) < 1e-6);
    assert.ok(Math.abs(m.y + BOW_NOZZLE_LIFT * 100) < 1e-6);
    assert.ok(BOW_NOZZLE_LIFT < TWIN_GATLING_LIFT);
  });
});
