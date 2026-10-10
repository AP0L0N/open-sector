import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NIGHT_FOG_ALPHA,
  NIGHT_SHADE_MAX,
  LAMP_BULB_SCALE,
  LIGHT_HEADROOM,
  LIGHT_STACK_KNEE,
  LIGHT_STACK_MAX,
  WORK_LIGHT_TURN,
  STREET_LAMPS,
  beamBlobs,
  beamPolygon,
  spotBeamGround,
  streetLampFlicker,
  easeSpot,
  lampGlow,
  missileSpot,
  nightFog,
  nightShade,
  stackedLight,
  workLightBearings,
  wreckNightAlpha,
  xenoGlowPulse,
  xenoGlowRadius,
  xenoGlowUnderShade,
  XENO_GLOW_BOOST,
} from "./night.js";

describe("night render", () => {
  it("leaves one lamp's light alone and caps a stack of them", () => {
    assert.equal(stackedLight(0), 0);
    assert.equal(stackedLight(0.3), 0.3);
    assert.equal(stackedLight(LIGHT_STACK_KNEE), LIGHT_STACK_KNEE);
    assert.ok(stackedLight(0.8) > stackedLight(0.5), "more lamps still read a little brighter");
    assert.ok(stackedLight(LIGHT_HEADROOM) < LIGHT_STACK_MAX);
    assert.ok(stackedLight(100) <= LIGHT_STACK_MAX);
  });

  it("shades nothing by day and the most at full dark", () => {
    assert.equal(nightShade(1), 0);
    assert.equal(nightShade(0), NIGHT_SHADE_MAX);
    assert.ok(nightShade(0.5) > 0 && nightShade(0.5) < NIGHT_SHADE_MAX);
  });

  it("keeps the near end of a hull beam at seventy percent of the old disc", () => {
    assert.equal(LAMP_BULB_SCALE, 0.7);
  });

  it("keeps the lamps dark by day and full at night", () => {
    assert.equal(lampGlow(1), 0);
    assert.equal(lampGlow(0), 1);
  });

  it("sinks ground out of sight into a darker veil at night", () => {
    const day = nightFog(1, 0.5, [40, 40, 40]);
    assert.equal(day.alpha, 0.5);
    assert.deepEqual(day.rgb, [40, 40, 40]);
    assert.equal(nightFog(0, 0.5, [40, 40, 40]).alpha, NIGHT_FOG_ALPHA);
  });

  it("loses a wreck out of sight in the night fog", () => {
    assert.equal(wreckNightAlpha(0, 0), 0, "full dark, out of sight");
    assert.equal(wreckNightAlpha(0, 1), 1, "full dark, in sight");
    assert.equal(wreckNightAlpha(1, 0), 1, "by day the hulk stays on the map");
    const dusk = wreckNightAlpha(0.5, 0);
    assert.ok(dusk > 0 && dusk < 1, "fades out as the light fails");
    assert.ok(wreckNightAlpha(0, 0.5) > 0 && wreckNightAlpha(0, 0.5) < 1, "soft at the fog edge");
  });

  it("sweeps the beam toward the new heading the short way, a step at a time", () => {
    assert.equal(easeSpot(0, 0.05, 0.1), 0.05);
    assert.equal(easeSpot(0, 1, 0.1), 0.1);
    const wrapped = easeSpot(3, -3, 0.1);
    assert.ok(wrapped > 3, "crosses ±π instead of turning the long way");
  });

  it("opens the outline from the lamp to its reach", () => {
    const pts = beamPolygon(10, 20, 0, 100, Math.PI / 8, 4);
    assert.deepEqual(pts[0], { x: 10, y: 20 });
    assert.equal(pts.length, 6);
  });

  it("starts the beam out from the lamp, swells, and fades to nothing at its reach", () => {
    const blobs = beamBlobs(1000, Math.PI / 12, { start: 0.12, count: 14 });
    assert.ok(blobs[0]!.d >= 120, "dark at the foot of the lamp");
    assert.equal(blobs[0]!.a, 0, "comes up from nothing");
    assert.equal(blobs.at(-1)!.d, 1000);
    assert.equal(blobs.at(-1)!.a, 0, "spent at full reach");
    const peak = blobs.reduce((i, b, j) => (b.a > blobs[i]!.a ? j : i), 0);
    assert.ok(peak > 0 && peak < blobs.length / 2, "brightest early, then losing power");
    for (let i = peak + 1; i < blobs.length; i++) assert.ok(blobs[i]!.a <= blobs[i - 1]!.a, "fades steadily");
    for (const b of blobs) assert.ok(b.r >= b.d * Math.tan(Math.PI / 12), "pools spill past the cone edge");
  });

  it("puts a small dim pool just behind a missile", () => {
    const spot = missileSpot(100, 40, 80, 0, 8);
    assert.ok(spot.x < 100, "sits back along the travel");
    assert.equal(spot.y, 40);
    assert.ok(spot.r < 8 * 2, "shorter than a lamp");
    assert.ok(spot.a > 0 && spot.a < 0.4, "only a hint");
    const up = missileSpot(0, 0, 0, 10, 8);
    assert.ok(up.y < 0, "behind a northbound missile");
  });

  it("drifts work lights very slowly, each on its own arc", () => {
    const a = workLightBearings(7, 2, 100);
    const b = workLightBearings(7, 2, 101);
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(b[i]! - a[i]!) < WORK_LIGHT_TURN * 2, "a few degrees a second at most");
    assert.notEqual(a[0], a[1]);
    assert.notDeepEqual(workLightBearings(8, 2, 100), a, "neighbours out of step");
  });
});

describe("street lamps", () => {
  it("lights a floodlight farther than a street lamp, and that farther than a gas lamp", () => {
    assert.ok(STREET_LAMPS.floodlight.reachTiles > STREET_LAMPS.streetlamp.reachTiles);
    assert.ok(STREET_LAMPS.streetlamp.reachTiles > STREET_LAMPS.gaslamp.reachTiles);
  });

  it("lets a gas mantle breathe a little while electric lamps hold steady", () => {
    for (let t = 0; t < 20; t += 0.37) {
      const g = streetLampFlicker("gaslamp", 12, 30, t);
      assert.ok(g >= 0.8 && g <= 1, `gas ${g}`);
      assert.equal(streetLampFlicker("streetlamp", 12, 30, t), 1);
    }
    assert.notEqual(streetLampFlicker("gaslamp", 12, 30, 3), streetLampFlicker("gaslamp", 40, 2, 3), "posts on their own beat");
  });
});

describe("spot beam on the ground", () => {
  it("throws the beam out the way the tower faces, widening and fading", () => {
    const blobs = spotBeamGround(100, 200, Math.PI / 2, 120, (14 * Math.PI) / 180);
    assert.ok(blobs.length > 4);
    for (const b of blobs) {
      assert.ok(Math.abs(b.x - 100) < 1e-9, "a south beam stays on the tower's x");
      assert.ok(b.y > 200 && b.y <= 320, `blob y ${b.y}`);
    }
    const first = blobs[0]!;
    const last = blobs[blobs.length - 1]!;
    assert.ok(last.r > first.r, "wider far out");
    assert.ok(last.a < 0.2, "faded at the end of its reach");
  });

  it("sizes a Xenite glow to what gives it off", () => {
    const tile = 8;
    const unit = { kind: "unit", tileW: 1, tileH: 1 };
    const small = xenoGlowRadius(unit, 7, tile);
    const big = xenoGlowRadius(unit, 20, tile);
    assert.ok(big > small * 2.5, "a Behemoth glows far wider than a Cyborg");
    assert.equal(xenoGlowRadius(unit, 0, tile), tile, "never under one fine tile");
    const node = xenoGlowRadius({ kind: "building", tileW: 8, tileH: 8 }, 0, tile);
    const core = xenoGlowRadius({ kind: "building", tileW: 12, tileH: 12 }, 0, tile);
    assert.ok(core > node && node > small, "structures glow by footprint");
    for (let t = 0; t < 20; t += 0.7) {
      const a = xenoGlowPulse(3, t);
      assert.ok(a >= 0.88 - 1e-9 && a <= 1 + 1e-9);
    }
  });

  it("lifts the Xenite glow for the shade it lies under, 20% over a lamp", () => {
    assert.equal(XENO_GLOW_BOOST, 1.2);
    assert.equal(xenoGlowUnderShade(0, 0), 1.2, "by day it is only the boost");
    const night = xenoGlowUnderShade(NIGHT_SHADE_MAX, 0.45);
    assert.ok(night > 1.2 && night < 2, "made up for the dark left over it");
    assert.ok(xenoGlowUnderShade(NIGHT_SHADE_MAX, 1) < night, "a fully cut dark needs no lift");
    for (const s of [0, 0.3, 1, 5]) {
      assert.ok(Number.isFinite(xenoGlowUnderShade(s, 0)));
    }
  });
});
