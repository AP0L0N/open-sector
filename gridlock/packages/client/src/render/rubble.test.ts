import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog, TILE_SIZE } from "@gridlock/shared";
import { RUBBLE_MAX_RISE, rubbleLayout, rubblePalette } from "./rubble.js";

describe("rubble layout", () => {
  const lots = (["shack", "house", "manor", "factory"] as const).map((t) => ({
    type: t,
    w: catalog(t).tileW * TILE_SIZE,
    h: catalog(t).tileH * TILE_SIZE,
  }));

  it("keeps every piece inside the footprint and low to the ground", () => {
    for (const lot of lots) {
      for (const seed of [1, 7, 991, 123456]) {
        const pieces = rubbleLayout(lot.w, lot.h, TILE_SIZE, seed);
        assert.ok(pieces.length >= 5, `${lot.type}: ${pieces.length} pieces`);
        for (const p of pieces) {
          assert.ok(p.x - p.hx >= 0 && p.x + p.hx <= lot.w, `${lot.type} x ${p.x}±${p.hx} in ${lot.w}`);
          assert.ok(p.y - p.hy >= 0 && p.y + p.hy <= lot.h, `${lot.type} y ${p.y}±${p.hy} in ${lot.h}`);
          assert.ok(p.z > 0 && p.z <= TILE_SIZE * RUBBLE_MAX_RISE + 1e-9, `${lot.type} z ${p.z}`);
        }
      }
    }
  });

  it("draws the same heap for the same seed and a different one for another", () => {
    const a = rubbleLayout(96, 96, TILE_SIZE, 42);
    const b = rubbleLayout(96, 96, TILE_SIZE, 42);
    const c = rubbleLayout(96, 96, TILE_SIZE, 43);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  it("puts wall stubs on the back edges and more blocks on a bigger lot", () => {
    const small = rubbleLayout(64, 64, TILE_SIZE, 5);
    const big = rubbleLayout(160, 160, TILE_SIZE, 5);
    const stubs = small.filter((p) => p.kind === 0);
    assert.ok(stubs.length >= 2);
    for (const s of stubs) assert.ok(s.x - s.hx < TILE_SIZE * 0.2 || s.y - s.hy < TILE_SIZE * 0.2);
    assert.ok(big.filter((p) => p.kind === 1).length > small.filter((p) => p.kind === 1).length);
  });

  it("gives timber houses and brick works their own tones", () => {
    assert.notDeepEqual(rubblePalette("shack"), rubblePalette("house"));
    assert.notDeepEqual(rubblePalette("factory"), rubblePalette("house"));
    assert.deepEqual(rubblePalette("inn"), rubblePalette("house"));
  });
});
