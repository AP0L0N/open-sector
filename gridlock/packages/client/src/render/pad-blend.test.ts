import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bareNorthColumns, blendPadInPlace, padAlpha, valueNoise } from "./pad-blend.js";

/** A 2:1 pad 80 px wide, south contact at the bottom middle, on a 100×60 canvas. */
const PAD = { padWidth: 80, padSouthX: 50, padSouthY: 58 };
const W = 100;
const H = 60;

function solidPad(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = 200;
    px[i * 4 + 1] = 200;
    px[i * 4 + 2] = 200;
    px[i * 4 + 3] = 255;
  }
  return px;
}

function alphaAt(px: Uint8ClampedArray, x: number, y: number): number {
  return px[(y * W + x) * 4 + 3]!;
}

describe("valueNoise", () => {
  it("is the same for the same input and stays in [0, 1)", () => {
    for (const [x, y] of [
      [0, 0],
      [13.5, 7.25],
      [400, 900],
    ] as const) {
      const n = valueNoise(x, y, 6, 1);
      assert.equal(n, valueNoise(x, y, 6, 1));
      assert.ok(n >= 0 && n < 1);
    }
  });
});

describe("padAlpha", () => {
  it("keeps the middle of the pad solid", () => {
    assert.equal(padAlpha(50, 38, PAD, 6, 1, 0.5), 1);
  });

  it("drops the slab lip below the south corner", () => {
    assert.equal(padAlpha(50, 60, PAD, 6, 0, 0.5), 0);
  });

  it("leaves a wall rising above the north edge alone", () => {
    // North corner is at y = 58 - 40 = 18; above it is the building itself.
    assert.equal(padAlpha(50, 10, PAD, 6, 1, 0.5), 1);
  });

  it("fades the north edge only in bare columns", () => {
    const inside = { x: 50, y: 20 };
    assert.equal(padAlpha(inside.x, inside.y, PAD, 6, 0, 0.5), 1);
    assert.ok(padAlpha(inside.x, inside.y, PAD, 6, 1, 0.5) < 1);
  });
});

describe("bareNorthColumns", () => {
  it("marks columns with nothing above the north edge as bare", () => {
    const px = new Uint8ClampedArray(W * H * 4);
    const bare = bareNorthColumns(px, W, H, PAD, 6);
    assert.equal(bare[50], 1);
  });

  it("backs off where a wall stands on the edge", () => {
    const px = solidPad();
    const bare = bareNorthColumns(px, W, H, PAD, 6);
    assert.equal(bare[50], 0);
    assert.equal(bare[30], 0);
  });
});

describe("blendPadInPlace", () => {
  it("frays the south rim, muddies it, and keeps the centre", () => {
    const px = solidPad();
    blendPadInPlace(px, W, H, PAD);
    assert.equal(alphaAt(px, 50, 59), 0);
    assert.equal(alphaAt(px, 50, 38), 255);
    const rim = (57 * W + 50) * 4;
    assert.ok(px[rim + 3]! < 255);
    assert.ok(px[rim]! < 200, "rim goes toward mud before it fades");
  });

  it("does nothing without pad metrics", () => {
    const px = solidPad();
    blendPadInPlace(px, W, H, { ...PAD, padWidth: 0 });
    assert.deepEqual(px, solidPad());
  });
});
