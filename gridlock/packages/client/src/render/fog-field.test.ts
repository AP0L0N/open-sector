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

describe("fog field, incremental", () => {
  const lit = (mask: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * w + x] = 1;
  };
  const same = (a: ArrayLike<number>, b: ArrayLike<number>, what: string): void => {
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i]! - b[i]!) < 1e-6, `${what}: tile ${i} ${a[i]} vs ${b[i]}`);
  };

  it("re-blurs only the change and still matches a fresh blur, at the edges too", () => {
    const w = 40;
    const h = 30;
    const f = new FogField(w, h);
    const mask = new Uint8Array(w * h);
    lit(mask, w, 5, 5, 10, 10);
    f.set(mask, 0, true);
    same(f.next, blurVision(mask, w, h), "first");
    lit(mask, w, 20, 12, 26, 18);
    f.set(mask, FOG_FADE_MS * 2);
    same(f.next, blurVision(mask, w, h), "a second patch far away");
    lit(mask, w, 0, 0, 2, 2);
    lit(mask, w, 37, 27, 39, 29);
    f.set(mask, FOG_FADE_MS * 4);
    same(f.next, blurVision(mask, w, h), "corners");
    mask.fill(0);
    f.set(mask, FOG_FADE_MS * 6);
    same(f.next, blurVision(mask, w, h), "all dark again");
  });

  it("starts the next fade from where the running one stands", () => {
    const w = 12;
    const h = 12;
    const f = new FogField(w, h);
    const mask = new Uint8Array(w * h);
    lit(mask, w, 4, 4, 7, 7);
    f.set(mask, 0, true);
    mask.fill(0);
    f.set(mask, 1000);
    const half = f.sample(5.5, 5.5, 1000 + FOG_FADE_MS / 2);
    lit(mask, w, 4, 4, 7, 7);
    f.set(mask, 1000 + FOG_FADE_MS / 2);
    assert.ok(Math.abs(f.sample(5.5, 5.5, 1000 + FOG_FADE_MS / 2) - half) < 1e-6, "no jump at the hand-over");
    const fresh = sampleField(blurVision(mask, w, h), w, h, 5.5, 5.5);
    assert.ok(Math.abs(f.sample(5.5, 5.5, 1000 + FOG_FADE_MS * 2) - fresh) < 1e-6, "and it fades up to the lit blur");
  });

  it("ignores a mask that did not change", () => {
    const w = 8;
    const f = new FogField(w, 8);
    const mask = new Uint8Array(64);
    lit(mask, w, 2, 2, 3, 3);
    f.set(mask, 0, true);
    const v = f.version;
    f.set(mask, 500);
    assert.equal(f.version, v);
  });
});
