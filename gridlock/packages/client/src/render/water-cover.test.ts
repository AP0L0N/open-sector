import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fallbackHoleRect,
  maskPunchRect,
  propScreenRect,
  rectsOverlap,
  screenWaterCovers,
  unionRect,
} from "./water-cover.js";

describe("water over shell holes", () => {
  it("pins a crater contact to the ground point", () => {
    const rect = propScreenRect(80, 40, 90, 200, 100, 50, 80);
    const scale = 90 / 100;
    assert.equal(rect.x + 50 * scale, 80);
    assert.equal(rect.y + 80 * scale, 40);
    assert.equal(rect.w, Math.round(200 * scale));
    assert.equal(rect.h, 90);
  });

  it("mirrors a flipped contact across the sheet", () => {
    const rect = propScreenRect(10, 10, 50, 100, 50, 20, 40, true);
    const scale = 1;
    assert.equal(rect.x + (100 - 20) * scale, 10);
  });

  it("keeps the vector crater inside a box past its long radius", () => {
    const rect = fallbackHoleRect(30, 20, 10, 5);
    assert.ok(rect.x < 30 - 10);
    assert.ok(rect.x + rect.w > 30 + 10);
    assert.ok(rect.y < 20 - 10);
    assert.ok(rect.y + rect.h > 20 + 10);
  });

  it("shifts pond masks with the camera the way the terrain atlas does", () => {
    const [mask] = screenWaterCovers([{ canvas: { width: 4, height: 5 } as HTMLCanvasElement, x: 100, y: 80 }], 40, 25, 10, 6);
    assert.equal(mask!.x, 70);
    assert.equal(mask!.y, 61);
  });

  it("punches only the part of the pond that covers the crater", () => {
    const punch = maskPunchRect(100, 50, 40, 30, 120, 60, 50, 40);
    assert.deepEqual(punch, { sx: 20, sy: 10, sw: 20, sh: 20, dx: 0, dy: 0 });
    assert.equal(maskPunchRect(0, 0, 10, 10, 20, 20, 5, 5), null);
  });

  it("treats a crater that only crosses the bank as overlapping the pond", () => {
    const hole = unionRect(propScreenRect(0, 0, 32, 64, 32, 32, 16), fallbackHoleRect(0, 0, 8, 4));
    const pond = { x: hole.x + hole.w - 3, y: hole.y, w: 20, h: hole.h };
    assert.equal(rectsOverlap(hole, pond), true);
    assert.equal(rectsOverlap(hole, { x: hole.x + hole.w + 2, y: hole.y, w: 10, h: 10 }), false);
  });
});
