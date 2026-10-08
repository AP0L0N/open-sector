import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEUERWIRBEL_MODEL, feuerwirbelMountLayers, feuerwirbelMountMuzzle, feuerwirbelNozzle } from "./feuerwirbel-mounts.js";

const TS = 8;
/** World facings that land screen-east and screen-south on the 2:1 map. */
const SCREEN_EAST = -Math.PI / 4;
const SCREEN_SOUTH = Math.PI / 4;

describe("feuerwirbelMountLayers", () => {
  it("puts the fore mount ahead of the aft one along the hull, each on its own row", () => {
    const east = feuerwirbelMountLayers(SCREEN_EAST, [SCREEN_EAST, SCREEN_SOUTH], 100, TS);
    const fore = east.find((l) => l.i === 0)!;
    const aft = east.find((l) => l.i === 1)!;
    assert.ok(fore.dx > 0 && aft.dx < 0, `fore ${fore.dx} aft ${aft.dx}`);
    assert.ok(Math.abs(fore.dy) < 1e-6 && Math.abs(aft.dy) < 1e-6, "across the screen, no depth");
    assert.notEqual(fore.row, aft.row, "independent rows");
  });

  it("draws the far mount first when the bow points at the viewer", () => {
    const south = feuerwirbelMountLayers(SCREEN_SOUTH, [SCREEN_SOUTH, SCREEN_SOUTH], 100, TS);
    // Bow toward the viewer: the aft mount is farther up the screen and goes first.
    assert.deepEqual(south.map((l) => l.i), [1, 0]);
    assert.ok(south[0]!.dy < south[1]!.dy);
  });
});

describe("feuerwirbelMountMuzzle", () => {
  it("leaves the barrel tip ahead of the mount's pivot, pointing along the mount", () => {
    const m = feuerwirbelMountMuzzle(0, 0, 0, SCREEN_EAST, SCREEN_EAST, 100, TS);
    const k = FEUERWIRBEL_MODEL.cellPerMeter * 100;
    assert.ok(m.x > 0.9 * k, "past the fore pivot");
    assert.ok(m.y < -FEUERWIRBEL_MODEL.originLift * 100, "up at barrel height");
    assert.ok(m.dirX > 0.99);
    const back = feuerwirbelMountMuzzle(0, 0, 0, SCREEN_EAST, SCREEN_EAST + Math.PI, 100, TS);
    assert.ok(back.dirX < -0.99, "a mount laid astern points astern");
  });
});

describe("feuerwirbelNozzle", () => {
  it("rides the hull nose, below the mounts' barrels", () => {
    const n = feuerwirbelNozzle(0, 0, SCREEN_EAST, 100, TS);
    const m = feuerwirbelMountMuzzle(0, 0, 0, SCREEN_EAST, SCREEN_EAST, 100, TS);
    assert.ok(n.x > m.x, "the nose is farther forward than the fore mount's muzzle");
    assert.ok(n.y > m.y, "and lower on the screen");
  });
});
