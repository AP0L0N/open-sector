import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SFX_CUTOFF_R, spatialMix, viewRadius } from "./spatial-sfx.js";

const W = 1600;
const H = 900;

describe("spatialMix", () => {
  it("is full loud, centred and open at the middle of the view", () => {
    const m = spatialMix(W / 2, H / 2, W, H);
    assert.ok(m);
    assert.equal(m.gain, 1);
    assert.equal(m.pan, 0);
    assert.equal(m.lowpassHz, 20000);
  });

  it("gets quieter the further from the centre", () => {
    const xs = [W / 2, W * 0.7, W, W * 1.4, W * 1.8];
    const gains = xs.map((x) => spatialMix(x, H / 2, W, H)?.gain ?? 0);
    for (let i = 1; i < gains.length; i++) assert.ok(gains[i]! < gains[i - 1]!, `gain at ${xs[i]} not below ${xs[i - 1]}`);
  });

  it("keeps a screen-edge shot clearly audible", () => {
    const m = spatialMix(W, H / 2, W, H);
    assert.ok(m);
    assert.ok(m.gain > 0.4 && m.gain < 0.5, `edge gain ${m.gain}`);
    assert.equal(m.lowpassHz, 20000);
  });

  it("pans toward the side it came from, never hard", () => {
    assert.ok(spatialMix(0, H / 2, W, H)!.pan < 0);
    assert.ok(spatialMix(W, H / 2, W, H)!.pan > 0);
    assert.ok(spatialMix(W * 1.6, H / 2, W, H)!.pan <= 0.75);
  });

  it("muffles off-screen shots", () => {
    const m = spatialMix(W * 1.5, H / 2, W, H);
    assert.ok(m);
    assert.ok(m.lowpassHz < 20000);
  });

  it("drops shots far off screen", () => {
    const x = W / 2 + (W / 2) * SFX_CUTOFF_R;
    assert.equal(spatialMix(x, H / 2, W, H), null);
    assert.equal(spatialMix(W / 2, H * 5, W, H), null);
  });

  it("measures distance in half-viewports", () => {
    assert.equal(viewRadius(W, H / 2, W, H), 1);
    assert.equal(viewRadius(W / 2, 0, W, H), 1);
  });
});
