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
  beamBlobs,
  beamPolygon,
  easeSpot,
  lampGlow,
  missileSpot,
  nightFog,
  nightShade,
  stackedLight,
  workLightBearings,
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
