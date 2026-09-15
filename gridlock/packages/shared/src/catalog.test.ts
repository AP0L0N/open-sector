import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAPTURE_DECAY_PER_SEC,
  CAPTURE_SECONDS,
  CAPTURE_SECONDS_MIN,
  GAME_SPEED_DEFAULT,
  GAME_SPEED_MAX,
  HANDGUN,
  RIFLE,
  RELOAD_MUL_MAX,
  RELOAD_MUL_MIN,
  SMALL_ARMS_SPEED,
  SPECIAL_COOLDOWN_MIN,
  TANK_MG,
  TANK_SHELL_SPEED,
  TICK_DT,
  TILE_SIZE,
  WEAPON_RANGE_SIGHT_MUL,
  SHELLS,
  armorLabel,
  BUILDING_TYPES,
  catalog,
  hasMg,
  infantryGunFor,
  hasScout,
  scoutHpMaxOf,
  SCOUT_HP_MUL,
  pickLoadedShell,
  clampGameSpeed,
  isInfantryType,
  isMotorVehicle,
  isStance,
  STANCE_AIM_SPREAD,
  STANCE_SPEED,
  SWIM_SPEED,
  WATER_PATH_COST,
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
    const total = (ammo.ap ?? 0) + (ammo.he ?? 0) + (ammo.heat ?? 0) + (ammo.smoke ?? 0);
    assert.ok(total >= 20 && total <= 28, `total=${total}`);
    assert.equal(ammo.smoke, 4);
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

  it("falls back to HE/HEAT but never auto-picks smoke", () => {
    const rack = { ap: 0, he: 3, heat: 1, smoke: 4 };
    assert.equal(pickLoadedShell(rack, "ap"), "he");
    assert.equal(pickLoadedShell({ ap: 0, he: 0, heat: 2, smoke: 4 }, "ap"), "heat");
    assert.equal(pickLoadedShell({ ap: 0, he: 0, heat: 0, smoke: 4 }, "ap"), null);
    assert.equal(pickLoadedShell({ ap: 0, he: 0, heat: 0, smoke: 4 }, "smoke"), "smoke");
    assert.equal(pickLoadedShell({ ap: 5, he: 0, heat: 0, smoke: 0 }, "smoke"), "ap");
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

  it("lets a 75mm take more than a tick to cross max range so the round is a tracer", () => {
    const w = catalog("warden");
    assert.equal(w.projectileSpeed, TANK_SHELL_SPEED);
    const range = w.rangeTiles * TILE_SIZE;
    assert.ok(w.projectileSpeed * TICK_DT < range, `shell ${w.projectileSpeed} range ${range}`);
    assert.ok(SHELLS.smoke.damage === 0 && SHELLS.smoke.caliber === 75);
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
    assert.equal(catalog("trooper").damage, RIFLE.damage);
    assert.equal(catalog("trooper").cooldown, RIFLE.cooldown);
    assert.equal(isStance("crouch"), true);
    assert.equal(isStance("sit"), false);
    assert.ok(STANCE_SPEED.crawl < STANCE_SPEED.crouch);
    assert.ok(STANCE_AIM_SPREAD.crawl < STANCE_AIM_SPREAD.stand);
    assert.ok(SWIM_SPEED < STANCE_SPEED.stand);
    assert.ok(SWIM_SPEED < STANCE_SPEED.crouch);
    assert.ok(WATER_PATH_COST > 1);
  });
});

describe("infantry guns", () => {
  it("gives the rifle and handgun their own clips and reload clocks", () => {
    assert.equal(RIFLE.clip, 8);
    assert.equal(HANDGUN.clip, 7);
    assert.ok(RIFLE.reload > HANDGUN.reload);
    assert.ok(RIFLE.reload > RIFLE.cooldown * 2);
    assert.equal(infantryGunFor({ type: "trooper" })?.id, "rifle");
    assert.equal(infantryGunFor({ type: "trooper", crits: ["arm"] })?.id, "handgun");
    assert.equal(infantryGunFor({ type: "warden" }), null);
    assert.ok(RELOAD_MUL_MIN < 1 && RELOAD_MUL_MAX > 1);
    assert.ok(RELOAD_MUL_MAX - RELOAD_MUL_MIN <= 0.2);
  });
});

describe("weapon reach", () => {
  it("is sight plus 20% for troopers and tanks", () => {
    const inf = catalog("trooper");
    const tank = catalog("warden");
    assert.equal(WEAPON_RANGE_SIGHT_MUL, 1.2);
    assert.equal(inf.rangeTiles, inf.sightTiles * WEAPON_RANGE_SIGHT_MUL);
    assert.equal(tank.rangeTiles, tank.sightTiles * WEAPON_RANGE_SIGHT_MUL);
    assert.equal(inf.sightBonusTiles ?? 0, 0);
    assert.equal(tank.sightBonusTiles ?? 0, 0);
  });
});

describe("hatch scout", () => {
  it("is a Warden crew with garrison-like 3× trooper HP", () => {
    assert.equal(hasScout("warden"), true);
    assert.equal(hasScout("hauler"), false);
    assert.equal(scoutHpMaxOf("warden"), catalog("trooper").hp * SCOUT_HP_MUL);
    assert.equal(SCOUT_HP_MUL, 3);
  });
});

describe("building sight", () => {
  it("matches infantry fog radius on player structures", () => {
    const inf = catalog("trooper").sightTiles;
    assert.equal(catalog("core").sightTiles, inf);
    for (const t of BUILDING_TYPES) {
      assert.equal(catalog(t).sightTiles, inf, t);
    }
  });
});

describe("building capture", () => {
  it("takes several seconds and decays if the troopers leave", () => {
    assert.ok(CAPTURE_SECONDS >= 8);
    assert.ok(CAPTURE_SECONDS_MIN >= 4);
    assert.ok(CAPTURE_DECAY_PER_SEC > 0 && CAPTURE_DECAY_PER_SEC < 1);
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
