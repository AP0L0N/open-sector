import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { waterSplashScale } from "./water-splash.js";

describe("waterSplashScale", () => {
  it("keeps bullet splashes a small fraction of a tank shell", () => {
    const bullet = waterSplashScale(8);
    const tank = waterSplashScale(75);
    assert.ok(bullet < tank * 0.25, `bullet ${bullet} tank ${tank}`);
    assert.ok(bullet > 0);
  });

  it("grows the plume with caliber", () => {
    assert.ok(waterSplashScale(150) > waterSplashScale(75));
    assert.ok(waterSplashScale(75) >= 1);
  });
});
