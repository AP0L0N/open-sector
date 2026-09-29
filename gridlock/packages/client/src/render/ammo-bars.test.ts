import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUPPLY_CARGO, catalog, rocketAmmoOf } from "@gridlock/shared";
import { ammoBarRatios } from "./ammo-bars.js";

describe("ammoBarRatios", () => {
  it("shows the shell rack and the coaxial belt on a tank", () => {
    const def = catalog("warden");
    const ammo = { ...def.ammo!, ap: Math.floor((def.ammo!.ap ?? 0) / 2) };
    const r = ammoBarRatios({ type: "warden", ammo, mgAmmo: def.mgAmmo! });
    assert.equal(r.length, 2);
    assert.ok(r[0]! > 0 && r[0]! < 1);
    assert.equal(r[1], 1);
  });

  it("does not drain the main bar when only smoke is spent", () => {
    const def = catalog("warden");
    const r = ammoBarRatios({ type: "warden", ammo: { ...def.ammo!, smoke: 0 }, mgAmmo: 0 });
    assert.deepEqual(r, [1, 0]);
  });

  it("puts Titan rockets second and Nebelwerfer rockets first", () => {
    assert.deepEqual(ammoBarRatios({ type: "titan", ammo: { ap: 0 }, rockets: rocketAmmoOf("titan") }), [0, 1]);
    assert.deepEqual(ammoBarRatios({ type: "nebelwerfer", rockets: 0 }), [0]);
  });

  it("tracks belts and drums that never reload, not rifle magazines", () => {
    assert.equal(ammoBarRatios({ type: "ciws", clip: 0 }).length, 1);
    assert.equal(ammoBarRatios({ type: "cyborg", clip: 0 }).length, 1);
    assert.deepEqual(ammoBarRatios({ type: "rifleman", clip: 3 }), []);
  });

  it("shows a supply truck's cargo, hidden when the view carries none", () => {
    assert.deepEqual(ammoBarRatios({ type: "supply", supply: SUPPLY_CARGO / 4 }), [0.25]);
    assert.deepEqual(ammoBarRatios({ type: "supply" }), []);
  });

  it("hides on enemies (no rack in view) and wrecks", () => {
    assert.deepEqual(ammoBarRatios({ type: "warden" }), []);
    assert.deepEqual(ammoBarRatios({ type: "warden", ammo: { ap: 1 }, wreck: true }), []);
  });
});
