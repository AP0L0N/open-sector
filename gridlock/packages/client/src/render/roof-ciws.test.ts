import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROOF_CIWS_LIFT, ROOF_CIWS_REACH, roofCiwsMuzzle } from "./roof-ciws.js";

/** World facings that land screen-east and screen-south on the 2:1 map. */
const SCREEN_EAST = -Math.PI / 4;
const SCREEN_SOUTH = Math.PI / 4;

describe("roofCiwsMuzzle", () => {
  it("sits above the ground point on the turret roof", () => {
    const m = roofCiwsMuzzle(0, 0, 100, SCREEN_EAST);
    assert.ok(Math.abs(m.y + ROOF_CIWS_LIFT * 100) < 1e-6);
  });

  it("reaches its full length across the screen and half toward the viewer", () => {
    const east = roofCiwsMuzzle(0, 0, 100, SCREEN_EAST);
    assert.ok(Math.abs(east.x - ROOF_CIWS_REACH * 100) < 1e-6);
    assert.ok(east.dirX > 0.99);
    const south = roofCiwsMuzzle(0, 0, 100, SCREEN_SOUTH);
    assert.ok(Math.abs(south.x) < 1e-6);
    assert.ok(Math.abs(south.y + ROOF_CIWS_LIFT * 100 - ROOF_CIWS_REACH * 50) < 1e-6);
    assert.ok(south.dirY > 0.99);
  });
});
