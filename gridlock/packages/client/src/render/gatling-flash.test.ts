import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gatlingMuzzles } from "./gatling-flash.js";

const SOUTH = Math.PI / 4;
const WEST = (3 * Math.PI) / 4;

describe("gatlingMuzzles", () => {
  it("flashes one barrel for one gun and two for both", () => {
    assert.equal(gatlingMuzzles(0, 0, 100, SOUTH, 1).length, 1);
    assert.equal(gatlingMuzzles(0, 0, 100, SOUTH, 2).length, 2);
  });

  it("puts the barrels either side of the body, above the feet, facing the viewer", () => {
    const [right, left] = gatlingMuzzles(0, 0, 100, SOUTH, 2);
    assert.ok(right && left);
    assert.ok(Math.abs(right.x + left.x) < 1e-6);
    assert.ok(Math.abs(right.x - left.x) > 30);
    assert.ok(right.y < 0 && left.y < 0);
    assert.ok(right.dirY > 0.99);
  });

  it("points the barrels screen-left when the Walker faces west", () => {
    const [m] = gatlingMuzzles(0, 0, 100, WEST, 1);
    assert.ok(m);
    assert.ok(m.x < -25);
    assert.ok(m.dirX < -0.99);
  });

  it("turns the off arm toward a second target", () => {
    const [main, off] = gatlingMuzzles(0, 0, 100, SOUTH, 2, WEST);
    assert.ok(main && off);
    assert.ok(main.dirY > 0.99);
    assert.ok(off.dirX < -0.99);
  });
});
