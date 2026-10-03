import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drawMine, mineLamp } from "./airdrop-fx.js";

describe("mine lamp", () => {
  it("stays dark while the mine is still arming", () => {
    assert.equal(mineLamp(3, 100, true), 0);
    assert.equal(mineLamp(3, 900, true), 0);
  });

  it("pulses once a cycle and stays dark the rest of the time", () => {
    let bright = 0;
    let dark = 0;
    for (let t = 0; t < 1600; t += 20) {
      const k = mineLamp(1, t, false);
      if (k > 0.9) bright++;
      if (k === 0) dark++;
    }
    assert.ok(bright >= 1, "the lamp reaches a full pulse");
    assert.ok(dark > bright * 4, "most of the cycle is dark");
  });

  it("draws only a small speck, and a small red lamp when the blink is on", () => {
    const radii: number[] = [];
    const ctx = {
      fillStyle: "",
      save() {},
      restore() {},
      translate() {},
      beginPath() {},
      ellipse(_x: number, _y: number, rx: number) {
        radii.push(rx);
      },
      arc(_x: number, _y: number, r: number) {
        radii.push(r);
      },
      fill() {},
      fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    drawMine(ctx, 10, 10, { seed: 1, arming: true, nowMs: 0 });
    assert.deepEqual(radii, [1.7]);
    // Phase depends on the seed. Step until the lamp is on, then check the radii.
    let lit = false;
    for (let t = 0; t < 1600 && !lit; t += 20) {
      radii.length = 0;
      drawMine(ctx, 10, 10, { seed: 1, arming: false, nowMs: t });
      lit = radii.length > 1;
    }
    assert.ok(lit, "a live mine blinks");
    assert.ok(radii.every((r) => r <= 3.1), `mine mark stays a small dot, got ${radii.join(",")}`);
  });
});
