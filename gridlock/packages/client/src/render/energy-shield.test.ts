import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHIELD_PANELS, shieldCurve, shieldGlow, shieldHeightElev } from "./energy-shield.js";

describe("energy wall drawing", () => {
  it("curves about where it was raised, end to end across its span", () => {
    const pts = shieldCurve({ x: 100, y: 50, angle: 0, half: Math.PI / 2, r: 30 });
    assert.equal(pts.length, SHIELD_PANELS + 1);
    for (const p of pts) assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 50) - 30) < 1e-9);
    assert.ok(Math.abs(pts[0]!.y - 20) < 1e-9, "one end straight up-map");
    assert.ok(Math.abs(pts[SHIELD_PANELS]!.y - 80) < 1e-9, "the other straight down-map");
  });

  it("dims as it loses points, flares when struck, and a bigger wall stands taller", () => {
    const full = shieldGlow({ hp: 900, hpMax: 900 }, 0, 1);
    const low = shieldGlow({ hp: 300, hpMax: 900 }, 0, 1);
    const struck = shieldGlow({ hp: 300, hpMax: 900, hit: true }, 0, 1);
    assert.ok(low < full && struck > low);
    assert.ok(shieldHeightElev(34) > shieldHeightElev(13));
  });
});
