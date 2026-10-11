import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ISO_ELEVATION } from "@gridlock/shared";
import {
  CURTAIN_PANELS,
  DOME_OPACITY,
  PULSE_SPIRE_TOP_PX,
  SHIELD_PANELS,
  curtainHeightElev,
  domeHeightElev,
  shieldCurve,
  shieldGlow,
  shieldHeightElev,
} from "./energy-shield.js";

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

  it("a Siphon's dome crowns lower for its span than a wall, and grows with its radius", () => {
    assert.ok(domeHeightElev(96) < shieldHeightElev(96));
    assert.ok(domeHeightElev(96) > domeHeightElev(48));
  });

  it("an Energy Wall's curtain stands as tall as a Pulse Spire, however wide, with more panels to bend on", () => {
    assert.equal(curtainHeightElev() * ISO_ELEVATION, PULSE_SPIRE_TOP_PX);
    assert.equal(shieldCurve({ x: 0, y: 0, angle: 0, half: 1, r: 96 }, CURTAIN_PANELS).length, CURTAIN_PANELS + 1);
    assert.ok(CURTAIN_PANELS > SHIELD_PANELS);
  });

  it("a dome draws half as opaque as before", () => {
    assert.equal(DOME_OPACITY, 0.5);
  });
});
