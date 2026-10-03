import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JET_FUEL_SECONDS, SUPPLY_CARGO, catalog, rocketAmmoOf } from "@gridlock/shared";
import { ammoBarRatios, outOfAmmo } from "./ammo-bars.js";

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

  it("shows the Rocketer's one high-penetration missile, and hides it from enemies", () => {
    assert.deepEqual(ammoBarRatios({ type: "rocketer", heavy: 1 }), [1]);
    assert.deepEqual(ammoBarRatios({ type: "rocketer", heavy: 0 }), [0]);
    assert.deepEqual(ammoBarRatios({ type: "rocketer" }), []);
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

  it("shows a Jump Jet's fuel as the yellow bar, hidden from enemies and on a corpse", () => {
    assert.deepEqual(
      ammoBarRatios({ type: "jumpjet", jet: { alt: 0, fuel: JET_FUEL_SECONDS / 2, fuelMax: JET_FUEL_SECONDS } }),
      [0.5],
    );
    assert.deepEqual(ammoBarRatios({ type: "jumpjet", jet: { alt: 7 } }), []);
    assert.deepEqual(
      ammoBarRatios({ type: "jumpjet", jet: { alt: 0, fuel: 1, fuelMax: JET_FUEL_SECONDS }, wreck: true }),
      [],
    );
  });

  it("hides on enemies (no rack in view) and wrecks", () => {
    assert.deepEqual(ammoBarRatios({ type: "warden" }), []);
    assert.deepEqual(ammoBarRatios({ type: "warden", ammo: { ap: 1 }, wreck: true }), []);
  });
});

describe("outOfAmmo", () => {
  it("marks a tank once the shells (smoke aside) and the coaxial belt are both gone", () => {
    assert.equal(outOfAmmo({ type: "warden", ammo: { smoke: 2 }, mgAmmo: 0 }), true);
    assert.equal(outOfAmmo({ type: "warden", ammo: { ap: 1 }, mgAmmo: 0 }), false);
    assert.equal(outOfAmmo({ type: "warden", ammo: {}, mgAmmo: 5 }), false);
  });

  it("marks a CIWS on an empty belt and a RAM on an empty rack", () => {
    assert.equal(outOfAmmo({ type: "ciws", clip: 0 }), true);
    assert.equal(outOfAmmo({ type: "ciws", clip: 10 }), false);
    assert.equal(outOfAmmo({ type: "ram", rockets: 0 }), true);
    assert.equal(outOfAmmo({ type: "ram", rockets: 3 }), false);
  });

  it("marks a Walker or a Cyborg run dry, never a rifleman or a Rocketer", () => {
    assert.equal(outOfAmmo({ type: "walker", clip: 0 }), true);
    assert.equal(outOfAmmo({ type: "cyborg", clip: 0 }), true);
    assert.equal(outOfAmmo({ type: "rifleman", clip: 0 }), false);
    assert.equal(outOfAmmo({ type: "rocketer", clip: 0 }), false);
  });

  it("needs every store: a Titan with rockets left is still armed", () => {
    assert.equal(outOfAmmo({ type: "titan", ammo: {}, rockets: 2, mgAmmo: 0 }), false);
  });

  it("stays off for enemies, wrecks, a supply truck, and a Jump Jet", () => {
    assert.equal(outOfAmmo({ type: "warden" }), false);
    assert.equal(outOfAmmo({ type: "ciws", clip: 0, wreck: true }), false);
    assert.equal(outOfAmmo({ type: "supply" }), false);
    assert.equal(outOfAmmo({ type: "jumpjet" }), false);
  });
});
