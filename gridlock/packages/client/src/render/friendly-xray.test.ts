import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoDepth } from "@gridlock/shared";
import { AIR_DRAW_LAYER } from "./aircraft.js";
import { axisFootprint, STANDING_DRAW_LAYER, type DrawKey } from "./corpse-depth.js";
import { xrayPairs, type XrayItem } from "./friendly-xray.js";

const house = axisFootprint(100, 100, 64, 64);
const houseKey: DrawKey = { layer: STANDING_DRAW_LAYER, z: isoDepth(house.cx, house.cy), foot: house };
const cover: XrayItem = { key: houseKey, rect: { x: 0, y: 0, w: 100, h: 100 } };

function unitAt(x: number, y: number, rect = { x: 40, y: 40, w: 20, h: 20 }, layer = STANDING_DRAW_LAYER): XrayItem {
  return { key: { layer, z: isoDepth(x, y), at: { x, y } }, rect };
}

describe("friendly x-ray", () => {
  it("a unit north-west of a house, under its sprite, shows through it", () => {
    const pairs = xrayPairs([unitAt(90, 90)], [cover]);
    assert.deepEqual([...pairs], [[0, [0]]]);
  });

  it("a unit in front of the house is drawn over it already", () => {
    assert.equal(xrayPairs([unitAt(180, 180)], [cover]).size, 0);
  });

  it("a unit behind the house but off its sprite is left alone", () => {
    assert.equal(xrayPairs([unitAt(90, 90, { x: 200, y: 200, w: 20, h: 20 })], [cover]).size, 0);
  });

  it("a plane over the house is never under it", () => {
    assert.equal(xrayPairs([unitAt(90, 90, undefined, AIR_DRAW_LAYER)], [cover]).size, 0);
  });

  it("groups every hidden unit under the house that hides it", () => {
    const pairs = xrayPairs([unitAt(90, 90), unitAt(180, 180), unitAt(95, 80)], [cover]);
    assert.deepEqual(pairs.get(0), [0, 2]);
  });
});
