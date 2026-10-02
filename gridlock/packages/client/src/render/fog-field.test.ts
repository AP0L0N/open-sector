import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FOG_FADE_MS, FOG_VEIL_ALPHA, FogField, blurVision, fadeT, sampleField } from "./fog-field.js";

describe("fog field", () => {
  it("keeps a fully lit map at 1 and a dark map at 0", () => {
    const lit = blurVision(new Uint8Array(64).fill(1), 8, 8);
    for (const v of lit) assert.ok(Math.abs(v - 1) < 1e-6);
    const dark = blurVision(new Uint8Array(64), 8, 8);
    for (const v of dark) assert.equal(v, 0);
  });

  it("softens one lit tile symmetrically", () => {
    const w = 15;
    const mask = new Uint8Array(w * w);
    mask[7 * w + 7] = 1;
    const f = blurVision(mask, w, w, 2);
    const at = (x: number, y: number): number => f[y * w + x]!;
    assert.ok(at(7, 7) > at(8, 7));
    assert.ok(at(8, 7) > 0);
    assert.ok(Math.abs(at(6, 7) - at(8, 7)) < 1e-6);
    assert.ok(Math.abs(at(7, 6) - at(7, 8)) < 1e-6);
    assert.ok(Math.abs(at(5, 5) - at(9, 9)) < 1e-6);
  });

  it("samples tile centres exactly and blends between them", () => {
    const f = new Float32Array([0, 1, 0, 1]);
    assert.equal(sampleField(f, 2, 2, 0.5, 0.5), 0);
    assert.equal(sampleField(f, 2, 2, 1.5, 0.5), 1);
    assert.equal(sampleField(f, 2, 2, 1, 1), 0.5);
    assert.equal(sampleField(f, 2, 2, -3, 0.5), 0);
  });

  it("fades from the old sight to the new one", () => {
    assert.equal(fadeT(0, 0), 0);
    assert.equal(fadeT(0, FOG_FADE_MS), 1);
    const field = new FogField(4, 4);
    field.set(new Uint8Array(16).fill(1), 0, true);
    assert.ok(Math.abs(field.sample(2, 2, 0) - 1) < 1e-6);
    field.set(new Uint8Array(16), 1000);
    assert.ok(Math.abs(field.sample(2, 2, 1000) - 1) < 1e-6);
    assert.equal(field.sample(2, 2, 1000 + FOG_FADE_MS), 0);
    assert.ok(Math.abs(field.veil(2, 2, 1000 + FOG_FADE_MS) - FOG_VEIL_ALPHA) < 1e-6);
  });
});
