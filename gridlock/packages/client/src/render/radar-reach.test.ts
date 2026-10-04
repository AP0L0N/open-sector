import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CIWS_AIR_REACH_MUL,
  HEIGHT_BASE,
  HEIGHT_RANGE_BONUS,
  RADAR_LONG_RANGE_MUL,
  catalog,
} from "@gridlock/shared";
import { footprintPeak, radarReachTiles } from "./radar-reach.js";

describe("radar reach ring", () => {
  it("shows the CIWS's plane reach outside its ground reach, and Max range on both", () => {
    const base = catalog("ciws").rangeTiles;
    const normal = radarReachTiles("ciws", HEIGHT_BASE, false);
    assert.equal(normal.ground, base);
    assert.equal(normal.air, base * CIWS_AIR_REACH_MUL);
    const max = radarReachTiles("ciws", HEIGHT_BASE, true);
    assert.equal(max.ground, base * RADAR_LONG_RANGE_MUL);
    assert.equal(max.air, base * RADAR_LONG_RANGE_MUL * CIWS_AIR_REACH_MUL);
  });

  it("shows one reach for the RAM", () => {
    const r = radarReachTiles("ram", HEIGHT_BASE, false);
    assert.equal(r.ground, catalog("ram").rangeTiles);
    assert.equal(r.air, r.ground);
  });

  it("adds the height bonus from the highest tile under the pad, as the sim does", () => {
    const width = 4;
    const heights = [0, 0, 0, 0, 0, 1, 3, 0, 0, 2, 1, 0, 0, 0, 0, 0];
    const peak = footprintPeak(heights, width, 4, 1, 1, 2, 2);
    assert.equal(peak, 3);
    const r = radarReachTiles("ram", peak, false);
    assert.equal(r.ground, catalog("ram").rangeTiles + Math.max(0, peak - HEIGHT_BASE) * HEIGHT_RANGE_BONUS);
  });
});
