import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAPTURE_DECAY_PER_SEC,
  CAPTURE_SECONDS,
  CAPTURE_SECONDS_MIN,
  GAME_SPEED_DEFAULT,
  HAULER_SMOKE_CHARGES,
  HAULER_SMOKE_COOLDOWN,
  HAULER_SMOKE_RELOAD,
  SMOKE_SECONDS,
  haulerSmokeChargesOf,
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
  snapTankYaw,
  TANK_FACE_DIRS,
  WEAPON_RANGE_SIGHT_MUL,
  SHELLS,
  SHELL_TYPES,
  INFANTRY_GUNS,
  INFANTRY_WEAPON_IDS,
  armorLabel,
  BUILDING_TYPES,
  catalog,
  gunArcDegOf,
  FACE_FIRE_DEG,
  hasMg,
  hasTurret,
  shellsFor,
  STUG_SHELLS,
  infantryGunFor,
  infantryLoadout,
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
    assert.equal(specialOf("rifleman"), undefined);
    assert.equal(specialLabel("rig"), "Deploy");
    assert.equal(specialLabel("core"), "Pack");
    assert.equal(specialLabel("hauler"), null);
  });

  it("gives the Mauler three smoke screens and a long rack reload", () => {
    assert.equal(HAULER_SMOKE_CHARGES, 3);
    assert.equal(haulerSmokeChargesOf("hauler"), 3);
    assert.equal(haulerSmokeChargesOf("warden"), 0);
    assert.equal(HAULER_SMOKE_COOLDOWN, SMOKE_SECONDS);
    assert.ok(HAULER_SMOKE_COOLDOWN >= 2);
    assert.ok(HAULER_SMOKE_RELOAD >= HAULER_SMOKE_COOLDOWN * 3);
  });

  it("is not ready while transforming or on cooldown", () => {
    assert.equal(specialReady("rig", "idle"), true);
    assert.equal(specialReady("rig", "move"), true);
    assert.equal(specialReady("rig", "deploy"), false);
    assert.equal(specialReady("core", "undeploy"), false);
    assert.equal(specialReady("rifleman", "idle"), false);
    assert.equal(specialReady("rig", "idle", 0.4), false);
    assert.equal(specialCooldownOf("deploy") >= SPECIAL_COOLDOWN_MIN, true);
  });
});

describe("warden ammo", () => {
  it("is the Tiger tank in the catalog", () => {
    assert.equal(catalog("warden").name, "Tiger");
    assert.equal(catalog("warden").letter, "W");
  });

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
    assert.ok(w.cooldown > catalog("rifleman").cooldown * 5);
    assert.equal(hasMg("warden"), true);
    assert.equal(hasMg("rifleman"), false);
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

describe("instant rounds", () => {
  it("rifle, coaxial MG, and 75mm all cross max range in under a sim tick", () => {
    const rifle = catalog("rifleman");
    assert.equal(rifle.projectileSpeed, SMALL_ARMS_SPEED);
    assert.equal(TANK_MG.projectileSpeed, SMALL_ARMS_SPEED);
    const rifleRange = rifle.rangeTiles * TILE_SIZE;
    assert.ok(rifle.projectileSpeed * TICK_DT >= rifleRange, `rifle ${rifle.projectileSpeed}`);
    const mgRange = catalog("warden").rangeTiles * TILE_SIZE;
    assert.ok(TANK_MG.projectileSpeed * TICK_DT >= mgRange, `mg ${TANK_MG.projectileSpeed}`);
    const w = catalog("warden");
    assert.equal(w.projectileSpeed, TANK_SHELL_SPEED);
    assert.equal(TANK_SHELL_SPEED, SMALL_ARMS_SPEED);
    const range = w.rangeTiles * TILE_SIZE;
    assert.ok(w.projectileSpeed * TICK_DT >= range, `shell ${w.projectileSpeed} range ${range}`);
    assert.ok(SHELLS.smoke.damage === 0 && SHELLS.smoke.caliber === 75);
  });
});

describe("tank faces", () => {
  it("snaps hull yaw onto 22.5° steps with cardinals exact", () => {
    assert.equal(TANK_FACE_DIRS, 16);
    assert.equal(snapTankYaw(Math.PI / 2), Math.PI / 2);
    assert.equal(snapTankYaw(-Math.PI / 2), -Math.PI / 2);
    assert.ok(Math.abs(snapTankYaw(0)) < 1e-9);
    assert.ok(Math.abs(snapTankYaw(Math.PI) - Math.PI) < 1e-9);
    const step = (Math.PI * 2) / TANK_FACE_DIRS;
    assert.ok(Math.abs(snapTankYaw(Math.PI / 2 + 0.4 * step) - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(snapTankYaw(Math.PI / 2 + step) - (Math.PI / 2 + step)) < 1e-9);
  });
});

describe("armor", () => {
  it("gives the Warden an independent turret and leaves troopers hull-fixed", () => {
    assert.equal(catalog("warden").turretTurnDegPerSec! > catalog("warden").turnDegPerSec, true);
    assert.equal(catalog("rifleman").turretTurnDegPerSec, undefined);
    assert.equal(catalog("hauler").turretTurnDegPerSec, undefined);
    assert.ok(catalog("rifleman").turnDegPerSec >= 1080);
  });

  it("labels the Warden plates and leaves infantry unarmored", () => {
    const w = catalog("warden");
    const h = catalog("hauler");
    assert.ok(w.armorFront > w.armorSide && w.armorSide > w.armorRear);
    assert.equal(h.armorFront, w.armorFront);
    assert.equal(h.armorSide, w.armorSide);
    assert.equal(h.armorRear, w.armorRear);
    assert.equal(h.leavesWreck, true);
    assert.equal(armorLabel("warden"), `F${w.armorFront} / S${w.armorSide} / R${w.armorRear}`);
    assert.equal(armorLabel("hauler"), armorLabel("warden"));
    assert.equal(armorLabel("rifleman"), null);
    assert.equal(catalog("rifleman").armorFront, 0);
  });
});

describe("injuries", () => {
  it("marks rolling hulls as motor vehicles and troopers as infantry", () => {
    assert.equal(isMotorVehicle("warden"), true);
    assert.equal(isMotorVehicle("ss3"), true);
    assert.equal(isMotorVehicle("hauler"), true);
    assert.equal(isMotorVehicle("rig"), true);
    assert.equal(isMotorVehicle("rifleman"), false);
    assert.equal(isMotorVehicle("core"), false);
    assert.equal(isInfantryType("rifleman"), true);
    assert.ok(HANDGUN.rangeTiles < catalog("rifleman").rangeTiles);
    assert.ok(HANDGUN.damage < catalog("rifleman").damage);
    assert.equal(catalog("rifleman").damage, RIFLE.damage);
    assert.equal(catalog("rifleman").cooldown, RIFLE.cooldown);
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
    assert.equal(infantryGunFor({ type: "rifleman" })?.id, "rifle");
    assert.equal(infantryGunFor({ type: "rifleman", weapon: "handgun" })?.id, "handgun");
    assert.equal(infantryGunFor({ type: "rifleman", weapon: "handgun", crits: ["arm"] })?.id, "handgun");
    assert.equal(infantryGunFor({ type: "rifleman", weapon: "rifle", crits: ["arm"] })?.id, "handgun");
    assert.equal(infantryGunFor({ type: "warden" }), null);
    assert.deepEqual(
      infantryLoadout("rifleman").map((g) => g.id),
      ["rifle", "handgun"],
    );
    assert.deepEqual(infantryLoadout("warden"), []);
    assert.ok(RELOAD_MUL_MIN < 1 && RELOAD_MUL_MAX > 1);
    assert.ok(RELOAD_MUL_MAX - RELOAD_MUL_MIN <= 0.2);
  });

  it("explains every shell and infantry gun", () => {
    for (const id of SHELL_TYPES) {
      assert.ok(SHELLS[id].blurb.length > 24, id);
    }
    for (const id of INFANTRY_WEAPON_IDS) {
      assert.ok(INFANTRY_GUNS[id].blurb.length > 24, id);
    }
  });

  it("lets the handgun win a point-blank 1v1 on time-to-kill", () => {
    const hp = catalog("rifleman").hp;
    const ttk = (damage: number, cooldown: number) => (Math.ceil(hp / damage) - 1) * cooldown;
    assert.ok(HANDGUN.cooldown < RIFLE.cooldown);
    assert.ok(HANDGUN.rangeTiles! < catalog("rifleman").rangeTiles / 2);
    assert.ok(
      ttk(HANDGUN.damage, HANDGUN.cooldown) < ttk(RIFLE.damage, RIFLE.cooldown),
      `handgun ${ttk(HANDGUN.damage, HANDGUN.cooldown)}s vs rifle ${ttk(RIFLE.damage, RIFLE.cooldown)}s`,
    );
  });
});

describe("weapon reach", () => {
  it("is sight plus 20% for troopers and tanks", () => {
    const inf = catalog("rifleman");
    const tank = catalog("warden");
    const stug = catalog("ss3");
    assert.equal(WEAPON_RANGE_SIGHT_MUL, 1.2);
    assert.equal(inf.rangeTiles, inf.sightTiles * WEAPON_RANGE_SIGHT_MUL);
    assert.equal(tank.rangeTiles, tank.sightTiles * WEAPON_RANGE_SIGHT_MUL);
    assert.equal(stug.rangeTiles, stug.sightTiles * WEAPON_RANGE_SIGHT_MUL);
    assert.equal(inf.sightBonusTiles ?? 0, 0);
    assert.equal(tank.sightBonusTiles ?? 0, 0);
    assert.equal(stug.sightBonusTiles ?? 0, 0);
  });
});

describe("ss3 casemate", () => {
  it("is the StuG III: cheaper than the Tiger, no turret, ±10° gun arc", () => {
    const g = catalog("ss3");
    const w = catalog("warden");
    assert.equal(g.name, "StuG III");
    assert.equal(g.letter, "G");
    assert.equal(hasTurret("ss3"), false);
    assert.equal(hasTurret("warden"), true);
    assert.equal(g.turnInPlace, true);
    assert.equal(g.turretTurnDegPerSec, undefined);
    assert.equal(gunArcDegOf("ss3"), 10);
    assert.equal(gunArcDegOf("warden"), FACE_FIRE_DEG);
    assert.ok(g.cost < w.cost);
    assert.ok(g.buildSeconds < w.buildSeconds);
    assert.ok(g.hp < w.hp);
    assert.ok(g.armorFront < w.armorFront);
    assert.ok(g.armorSide < w.armorSide);
    assert.ok(g.armorRear > g.armorSide);
    assert.ok(g.moveTilesPerSec > w.moveTilesPerSec);
    assert.ok(g.turnDegPerSec < w.turnDegPerSec);
    assert.ok(g.sightTiles < w.sightTiles);
    assert.equal(g.rangeTiles, g.sightTiles * WEAPON_RANGE_SIGHT_MUL);
    assert.equal(hasMg("ss3"), true);
    assert.equal(hasScout("ss3"), true);
    assert.equal(g.leavesWreck, true);
    assert.ok((g.blurb ?? "").length > 24);
  });

  it("carries a mixed L/48 rack that cannot frontally pen a Tiger with AP", () => {
    const g = catalog("ss3");
    const ammo = g.ammo ?? {};
    const total = (ammo.ap ?? 0) + (ammo.he ?? 0) + (ammo.heat ?? 0) + (ammo.smoke ?? 0);
    assert.ok(total >= 20 && total <= 28, `total=${total}`);
    assert.ok((ammo.he ?? 0) >= 8, "assault gun keeps a real HE load");
    assert.equal(g.defaultShell, "ap");
    assert.equal(shellsFor("ss3"), STUG_SHELLS);
    assert.equal(shellsFor("warden"), SHELLS);
    assert.ok(STUG_SHELLS.ap.penetration < catalog("warden").armorFront);
    assert.ok(STUG_SHELLS.ap.penetration < SHELLS.ap.penetration);
    assert.ok(STUG_SHELLS.heat.penetration > catalog("warden").armorFront);
    assert.ok(STUG_SHELLS.he.damage > STUG_SHELLS.ap.damage);
    for (const id of SHELL_TYPES) {
      assert.ok(STUG_SHELLS[id].blurb.length > 24, id);
    }
  });
});

describe("hatch scout", () => {
  it("is a Warden crew with garrison-like 3× trooper HP", () => {
    assert.equal(hasScout("warden"), true);
    assert.equal(hasScout("ss3"), true);
    assert.equal(hasScout("hauler"), false);
    assert.equal(scoutHpMaxOf("warden"), catalog("rifleman").hp * SCOUT_HP_MUL);
    assert.equal(SCOUT_HP_MUL, 3);
  });
});

describe("building sight", () => {
  it("matches infantry fog radius on player structures", () => {
    const inf = catalog("rifleman").sightTiles;
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
