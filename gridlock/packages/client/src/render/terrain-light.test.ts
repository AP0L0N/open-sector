import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEIGHT_BASE, TILE_EMPTY, TILE_ROAD, TILE_WATER } from "@gridlock/shared";
import { heightMesh } from "./height-mesh.js";
import { elevShadeFactor, materialBytes, vertexTones } from "./terrain-light.js";

const flat = (w: number, h: number, z: number) => ({ width: w, height: h, heights: new Array(w * h).fill(z) });

describe("terrain light", () => {
  it("leaves flat ground at the base level untouched", () => {
    const tones = vertexTones(flat(6, 6, HEIGHT_BASE));
    for (const t of tones) assert.ok(Math.abs(t - 1) < 1e-6);
  });

  it("brightens a slope that faces the sun and darkens the far side", () => {
    const w = 12;
    const rise = { width: w, height: w, heights: [] as number[] };
    const fall = { width: w, height: w, heights: [] as number[] };
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        rise.heights.push(HEIGHT_BASE + x);
        fall.heights.push(HEIGHT_BASE + (w - x));
      }
    }
    const cols = w + 1;
    const mid = 6 * cols + 6;
    const lit = vertexTones(rise)[mid]! / elevShadeFactor(HEIGHT_BASE + 5.5, Math.max(...rise.heights));
    const dark = vertexTones(fall)[mid]! / elevShadeFactor(HEIGHT_BASE + 6.5, Math.max(...fall.heights));
    assert.ok(lit > 1, `lit ${lit}`);
    assert.ok(dark < 1, `dark ${dark}`);
  });

  it("shades smoothly: neighbouring vertices on a ramp differ by a small step", () => {
    const w = 16;
    const heights: number[] = [];
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) heights.push(HEIGHT_BASE + Math.floor(x / 4) * 4);
    const tones = vertexTones({ width: w, height: w, heights });
    const cols = w + 1;
    for (let x = 1; x < w - 1; x++) {
      const d = Math.abs(tones[8 * cols + x + 1]! - tones[8 * cols + x]!);
      assert.ok(d < 0.15, `step at ${x}: ${d}`);
    }
  });

  it("weights materials per tile", () => {
    const map = { width: 3, height: 1, tiles: [TILE_ROAD, TILE_WATER, TILE_EMPTY] };
    const { a, b } = materialBytes(map, new Set([2]));
    assert.equal(a[0], 255);
    assert.equal(b[4 + 1], 255);
    assert.equal(a[8], 0, "scrap is its own channel, not road dirt");
    assert.ok(b[8 + 3]! > 0, "scrap cover reaches its own tile");
    assert.ok(b[4 + 3]! > 0, "and blurs onto the neighbor");
  });

  it("orders mesh triangles back to front", () => {
    const mesh = heightMesh(flat(3, 3, 0));
    assert.equal(mesh.index.length, 3 * 3 * 6);
    let last = -1;
    for (let k = 0; k < mesh.index.length; k += 6) {
      const n = mesh.index[k]!;
      const depth = (n % mesh.cols) + Math.floor(n / mesh.cols);
      assert.ok(depth >= last);
      last = depth;
    }
  });
});
