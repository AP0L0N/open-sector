import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCORCH_GLOW_MS, plasmaScale, plasmaSteamMs, scorchHeat, steamPuffs } from "./plasma-ground.js";

describe("plasma on water and dirt", () => {
  it("sizes the boil and its steam by caliber", () => {
    assert.ok(plasmaScale(8) < plasmaScale(20));
    assert.ok(plasmaScale(20) < plasmaScale(75));
    assert.ok(plasmaScale(75) < plasmaScale(150));
    assert.ok(plasmaSteamMs(8) < plasmaSteamMs(75));
    assert.equal(plasmaSteamMs(150), plasmaSteamMs(75));
    assert.ok(steamPuffs(3, 8, 0.5).length < steamPuffs(3, 75, 0.5).length);
  });

  it("lets the steam rise and fade out by the end", () => {
    const early = steamPuffs(11, 75, 0.3);
    const late = steamPuffs(11, 75, 0.85);
    assert.ok(early.length > 0);
    const meanY = (ps: { dy: number }[]): number => ps.reduce((a, p) => a + p.dy, 0) / ps.length;
    assert.ok(meanY(late) < meanY(early));
    for (const p of steamPuffs(11, 75, 0.999)) assert.ok(p.alpha < 0.05);
    assert.deepEqual(steamPuffs(11, 75, 0), []);
  });

  it("is the same picture for a given hit", () => {
    assert.deepEqual(steamPuffs(42, 40, 0.4), steamPuffs(42, 40, 0.4));
  });

  it("cools a fresh scorch from hot to dark", () => {
    assert.equal(scorchHeat(0), 1);
    assert.ok(scorchHeat(SCORCH_GLOW_MS * 0.5) < scorchHeat(SCORCH_GLOW_MS * 0.2));
    assert.equal(scorchHeat(SCORCH_GLOW_MS), 0);
    assert.equal(scorchHeat(-Infinity), 0);
  });
});
