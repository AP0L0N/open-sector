import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CIVILIAN_TYPES, catalog, TILE_SIZE } from "@gridlock/shared";
import { readFileSync } from "node:fs";
import {
  RUBBLE_MAX_RISE,
  RUIN_FIRE_FULL_MS,
  RUIN_FIRE_OUT_MS,
  RUIN_SMOKE_OUT_MS,
  ruinFireLife,
  ruinFireState,
  rubbleLayout,
  rubblePalette,
} from "./rubble.js";

describe("ruins", () => {
  const manifest = JSON.parse(readFileSync(new URL("../assets/ruins/ruins.json", import.meta.url), "utf8")) as Record<
    string,
    { file: string; padWidth: number; fires: number[][] }[]
  >;

  it("gives every civilian house its own ruin in all four faces, with fires on the lot", () => {
    for (const type of CIVILIAN_TYPES) {
      const faces = manifest[type];
      assert.equal(faces?.length, 4, type);
      const w = catalog(type).tileW * TILE_SIZE;
      const h = catalog(type).tileH * TILE_SIZE;
      for (const f of faces!) {
        assert.ok(f.file.startsWith(type), f.file);
        assert.equal(f.padWidth, (w + h) * 3, `${type} pad`);
        assert.ok(f.fires.length >= 1, `${type} has a fire`);
        for (const [x, y, z] of f.fires) {
          assert.ok(x! >= 0 && x! <= w && y! >= 0 && y! <= h, `${type} fire ${x},${y} on its ${w}x${h} lot`);
          assert.ok(z! >= 0 && z! < 20, `${type} fire z ${z}`);
        }
      }
    }
  });

  it("burns, sinks to embers, smoulders, then goes cold", () => {
    assert.ok(ruinFireState(10_000, 1).heat >= 0.99);
    const dying = ruinFireState((RUIN_FIRE_FULL_MS + RUIN_FIRE_OUT_MS) / 2, 1);
    assert.ok(dying.heat > 0.2 && dying.heat < 0.8, `${dying.heat}`);
    const smoulder = ruinFireState((RUIN_FIRE_OUT_MS + RUIN_SMOKE_OUT_MS) / 2, 1);
    assert.equal(smoulder.heat, 0);
    assert.ok(smoulder.smoke > 0);
    assert.deepEqual(ruinFireState(RUIN_SMOKE_OUT_MS + 1, 1), { heat: 0, smoke: 0 });
  });

  it("lets the side fires go out before the main one", () => {
    assert.equal(ruinFireLife(5, 0), 1);
    for (let i = 1; i < 6; i++) {
      const l = ruinFireLife(5, i);
      assert.ok(l >= 0.55 && l < 0.9, `${l}`);
    }
  });
});

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
