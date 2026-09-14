import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAME_SPEED_DEFAULT,
  GAME_SPEED_MAX,
  HANDGUN,
  SMALL_ARMS_SPEED,
  SPECIAL_COOLDOWN_MIN,
  TANK_MG,
  TICK_DT,
  TILE_SIZE,
  armorLabel,
  catalog,
  hasMg,
  clampGameSpeed,
  isInfantryType,
  isMotorVehicle,
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

describe("warden ammo", () => {
  it("starts with a mixed rack of about twenty shells", () => {
    const w = catalog("warden");
    const ammo = w.ammo ?? {};
    const total = (ammo.ap ?? 0) + (ammo.he ?? 0) + (ammo.heat ?? 0);
    assert.ok(total >= 20 && total <= 24, `total=${total}`);
    assert.equal(w.defaultShell, "ap");
    assert.equal(w.leavesWreck, true);
  });

  it("reloads the 75mm on a Sudden Strike clock and carries a coaxial MG", () => {
    const w = catalog("warden");
    assert.ok(w.cooldown >= 6, `cooldown=${w.cooldown}`);
    assert.ok(w.cooldown > catalog("trooper").cooldown * 5);
    assert.equal(hasMg("warden"), true);
    assert.equal(hasMg("trooper"), false);
    assert.equal(w.mgAmmo, TANK_MG.ammo);
    assert.ok(TANK_MG.spreadDeg > w.spreadDeg * 4);
    assert.equal(TANK_MG.cooldown < 0.2, true);
    assert.ok(TANK_MG.heatPerShot * 25 >= TANK_MG.heatMax);
  });
});

describe("small-arms flight", () => {
  it("crosses max range in under a sim tick so the round is not a tracer", () => {
    const rifle = catalog("trooper");
    assert.equal(rifle.projectileSpeed, SMALL_ARMS_SPEED);
    assert.equal(TANK_MG.projectileSpeed, SMALL_ARMS_SPEED);
    const rifleRange = rifle.rangeTiles * TILE_SIZE;
    assert.ok(rifle.projectileSpeed * TICK_DT >= rifleRange, `rifle ${rifle.projectileSpeed}`);
    const mgRange = catalog("warden").rangeTiles * TILE_SIZE;
    assert.ok(TANK_MG.projectileSpeed * TICK_DT >= mgRange, `mg ${TANK_MG.projectileSpeed}`);
  });
});

describe("armor", () => {
  it("gives the Warden an independent turret and leaves troopers hull-fixed", () => {
    assert.equal(catalog("warden").turretTurnDegPerSec! > catalog("warden").turnDegPerSec, true);
    assert.equal(catalog("trooper").turretTurnDegPerSec, undefined);
    assert.equal(catalog("hauler").turretTurnDegPerSec, undefined);
    assert.ok(catalog("trooper").turnDegPerSec >= 1080);
  });

  it("labels the Warden plates and leaves infantry unarmored", () => {
    const w = catalog("warden");
    assert.ok(w.armorFront > w.armorSide && w.armorSide > w.armorRear);
    assert.equal(armorLabel("warden"), `F${w.armorFront} / S${w.armorSide} / R${w.armorRear}`);
    assert.equal(armorLabel("trooper"), null);
    assert.equal(catalog("trooper").armorFront, 0);
  });
});

describe("injuries", () => {
  it("marks rolling hulls as motor vehicles and troopers as infantry", () => {
    assert.equal(isMotorVehicle("warden"), true);
    assert.equal(isMotorVehicle("hauler"), true);
    assert.equal(isMotorVehicle("rig"), true);
    assert.equal(isMotorVehicle("trooper"), false);
    assert.equal(isMotorVehicle("core"), false);
    assert.equal(isInfantryType("trooper"), true);
    assert.ok(HANDGUN.rangeTiles < catalog("trooper").rangeTiles);
    assert.ok(HANDGUN.damage < catalog("trooper").damage);
  });
});

describe("game speed", () => {
  it("clamps to 1–5×", () => {
    assert.equal(clampGameSpeed(GAME_SPEED_DEFAULT), GAME_SPEED_MAX);
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
