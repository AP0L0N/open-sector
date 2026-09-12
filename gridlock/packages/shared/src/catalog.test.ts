import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAME_SPEED_DEFAULT,
  GAME_SPEED_MAX,
  SPECIAL_COOLDOWN_MIN,
  armorLabel,
  catalog,
  clampGameSpeed,
  nudgeGameSpeed,
  specialCooldownOf,
  specialLabel,
  specialOf,
  specialReady,
} from "./catalog.js";

describe("special actions", () => {
  it("marks Rig and Core as deploy specials", () => {
    assert.equal(specialOf("rig"), "deploy");
    assert.equal(specialOf("core"), "deploy");
    assert.equal(specialOf("trooper"), undefined);
    assert.equal(specialLabel("rig"), "Deploy");
    assert.equal(specialLabel("core"), "Pack");
    assert.equal(specialLabel("hauler"), null);
  });

  it("is not ready while transforming or on cooldown", () => {
    assert.equal(specialReady("rig", "idle"), true);
    assert.equal(specialReady("rig", "move"), true);
    assert.equal(specialReady("rig", "deploy"), false);
    assert.equal(specialReady("core", "undeploy"), false);
    assert.equal(specialReady("trooper", "idle"), false);
    assert.equal(specialReady("rig", "idle", 0.4), false);
    assert.equal(specialCooldownOf("deploy") >= SPECIAL_COOLDOWN_MIN, true);
  });
});

describe("armor", () => {
  it("labels the Warden plates and leaves infantry unarmored", () => {
    const w = catalog("warden");
    assert.ok(w.armorFront > w.armorSide && w.armorSide > w.armorRear);
    assert.equal(armorLabel("warden"), `F${w.armorFront} / S${w.armorSide} / R${w.armorRear}`);
    assert.equal(armorLabel("trooper"), null);
    assert.equal(catalog("trooper").armorFront, 0);
  });
});

describe("game speed", () => {
  it("clamps to 1–5×", () => {
    assert.equal(clampGameSpeed(GAME_SPEED_DEFAULT), 1);
    assert.equal(clampGameSpeed(2.4), 2);
    assert.equal(clampGameSpeed(9), GAME_SPEED_MAX);
    assert.equal(clampGameSpeed(0), 1);
    assert.equal(clampGameSpeed(Number.NaN), 1);
  });

  it("nudges in integer steps and stops at the cap", () => {
    assert.equal(nudgeGameSpeed(1, 1), 2);
    assert.equal(nudgeGameSpeed(4, 1), 5);
    assert.equal(nudgeGameSpeed(5, 1), 5);
    assert.equal(nudgeGameSpeed(1, -1), 1);
    assert.equal(nudgeGameSpeed(5, -1), 4);
  });
});
