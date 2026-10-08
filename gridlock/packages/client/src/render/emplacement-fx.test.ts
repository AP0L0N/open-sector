import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLAK_RACK, MGNEST_BELT, PAK36_RACK, PAK43_RACK, mountArcDegOf } from "@gridlock/shared";
import { ammoBarRatios } from "./ammo-bars.js";
import { emplacementShotLook, facingConeDegOf, PAK43_FX_CALIBER_MUL } from "./emplacement-fx.js";
import { FLAK_CLOUD_MS, airBurstPuffs, flakCloudPuffs } from "./rocket-smoke.js";

describe("crewed gun shot look", () => {
  it("the Pak 43 throws a far bigger blast and strikes bigger than the Pak 36", () => {
    const small = emplacementShotLook("pak36");
    const big = emplacementShotLook("pak43");
    assert.ok(big.smoke >= small.smoke * 2, "a much larger blast cloud");
    assert.equal(big.muzzle, 0, "no front smoke; the blast behind the pit carries it");
    assert.ok(PAK43_FX_CALIBER_MUL > 1.5);
    const flakLook = emplacementShotLook("flak");
    assert.ok(flakLook.smoke > 0, "the blast behind the Flak stays");
    assert.equal(flakLook.muzzle, 0, "no front smoke; the spark is enough");
  });

  it("the Pak 43 shows a cone as wide as the Pak 36's, though it still lays all round", () => {
    assert.equal(facingConeDegOf("pak43"), facingConeDegOf("pak36"));
    assert.equal(mountArcDegOf("pak43"), null, "the sim keeps its all-round traverse");
    assert.equal(facingConeDegOf("flak"), null);
  });

  it("a flak burst is a black cloud that is gone inside a second", () => {
    const flak = flakCloudPuffs(100, 100, 24, 0, 7);
    const rocket = airBurstPuffs(100, 100, 24, 0, 7);
    assert.ok(flak.length > rocket.length);
    assert.ok(flak.every((p) => p.shade > 1.9), "black, not the rocket's brown");
    assert.ok(flak.every((p) => Math.abs(p.z - 24) < 3), "at the fuse height");
    const longest = (ps: { life: number }[]) => Math.max(...ps.map((p) => p.life));
    const widest = (ps: { r1: number }[]) => Math.max(...ps.map((p) => p.r1));
    assert.ok(longest(flak) < longest(rocket) / 2, "gone well before a rocket's smoke");
    assert.ok(longest(flak) <= FLAK_CLOUD_MS);
    assert.ok(longest(flak) < 1000);
    assert.ok(widest(flak) > widest(rocket) * 2, "still a wide cloud");
    assert.ok(widest(flak) < 110, "a fifth under the wide cloud's biggest puff");
  });
});

describe("crewed gun ammo bars", () => {
  it("each gun shows how much of its store is left", () => {
    assert.deepEqual(ammoBarRatios({ type: "pak36", ammo: { ap: PAK36_RACK / 2 } }), [0.5]);
    assert.deepEqual(ammoBarRatios({ type: "pak43", ammo: { ap: PAK43_RACK } }), [1]);
    assert.deepEqual(ammoBarRatios({ type: "flak", ammo: { he: FLAK_RACK / 4 } }), [0.25]);
    assert.deepEqual(ammoBarRatios({ type: "mgnest", clip: MGNEST_BELT / 2 }), [0.5]);
  });
});
