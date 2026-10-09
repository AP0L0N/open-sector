import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUILDING_TYPES,
  BUNKER_ENGINEER_REPAIR_PER_SEC,
  BUNKER_GARRISON_CAP,
  BUNKER_GARRISON_HP_MUL,
  BUNKER_MEDIC_REGEN_FRAC,
  BUNKER_TYPES,
  BUNKER_WOUND_MUL,
  GARRISON_WATCH_SIGHT_BONUS,
  SLIT_BULLET_WOUND_MUL,
  MEDIC_HEAL_PER_SEC,
  TICK_DT,
  catalog,
  coverHeightOf,
  garrisonCapOf,
  isCapturable,
  isCivilianType,
  type EntityType,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { placedFacing, raiseBuilding, sellBuilding } from "./build.js";
import { tickCombat } from "./combat.js";
import { sightTilesForEntity, weaponRangeWorld } from "./elevation.js";
import { destroyEntity, makeEntity, occupant, tileCenter } from "./geo.js";
import { canGarrison, enterGarrison, isBulletRound, livingGarrison, setGarrisonHide, woundGarrison } from "./garrison.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "BK", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.blocked.fill(0);
  return { state, a: "A", b: "B" };
}

function bunkerAt(state: MatchState, owner: string, tx = 36, ty = 12): Entity {
  const def = catalog("bunker");
  const ts = state.tileSize;
  return makeEntity(state, "bunker", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function trooper(state: MatchState, type: EntityType, owner: string, tx = 34, ty = 12): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

describe("bunker", () => {
  it("is built at the construction yard, not trained", () => {
    assert.ok(BUILDING_TYPES.includes("bunker"));
    const def = catalog("bunker");
    assert.equal(def.kind, "building");
    assert.equal(def.power, 0);
    assert.equal(garrisonCapOf("bunker"), BUNKER_GARRISON_CAP);
    assert.ok(def.hp > catalog("manor").hp, "concrete outlasts every house");
  });

  it("admits only the listed infantry, up to its cap", () => {
    const { state, a } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    for (const type of ["mortarman", "cyborg", "droneop", "warden"] as EntityType[]) {
      const u = trooper(state, type, a);
      assert.notEqual(canGarrison(state, u, bunker), null, `${type} must not enter`);
    }
    assert.deepEqual(
      [...BUNKER_TYPES].sort(),
      ["atinfantry", "engineer", "gunner", "medic", "pyro", "rifleman", "rocketer", "sniper"],
    );
    for (const type of BUNKER_TYPES) {
      const u = trooper(state, type, a);
      assert.equal(canGarrison(state, u, bunker), null, `${type} may enter`);
    }
    for (let i = 0; i < BUNKER_GARRISON_CAP; i++) {
      assert.equal(enterGarrison(state, trooper(state, BUNKER_TYPES[i % BUNKER_TYPES.length]!, a), bunker), true);
    }
    assert.equal(enterGarrison(state, trooper(state, "rifleman", a), bunker), false);
  });

  it("refuses a mortarman on the command path with a reason", () => {
    const { state, a } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const m = trooper(state, "mortarman", a);
    const res = applyCommand(state, a, { type: "cmd.garrison", ids: [m.id], buildingId: bunker.id });
    assert.equal(res.ok, false);
    assert.equal(m.garrisonedIn, null);
  });

  it("keeps the enemy out even while empty, and stays its builder's", () => {
    const { state, a, b } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const foe = trooper(state, "rifleman", b);
    assert.notEqual(canGarrison(state, foe, bunker), null);
    const mine = trooper(state, "rifleman", a);
    assert.equal(enterGarrison(state, mine, bunker), true);
    mine.hp = 0;
    for (let i = 0; i < 3; i++) step(state, TICK_DT);
    assert.equal(bunker.ownerId, a);
  });

  it("gives more HP than a house and lets only a share of each hit through", () => {
    const { state, a } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const inf = trooper(state, "rifleman", a);
    const street = inf.hpMax;
    assert.equal(enterGarrison(state, inf, bunker), true);
    assert.equal(inf.hpMax, street * BUNKER_GARRISON_HP_MUL);
    assert.ok(BUNKER_GARRISON_HP_MUL > (catalog("cottage").garrisonHpMul ?? 1));
    for (let i = 0; i < 20; i++) {
      const before = inf.hp;
      woundGarrison(state, bunker, 50, 7.92);
      const took = before - inf.hp;
      assert.ok(took >= 1 && took <= Math.ceil(50 * BUNKER_WOUND_MUL * 1.1), `took ${took}`);
      inf.hp = inf.hpMax;
    }
  });

  it("stops two thirds of the bullets its wall share lets through, but not shells", () => {
    const { state, a } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const inf = trooper(state, "rifleman", a);
    assert.equal(enterGarrison(state, inf, bunker), true);
    assert.equal(catalog("bunker").garrisonBulletMul, SLIT_BULLET_WOUND_MUL);
    const sum = (bullet: boolean, caliber: number): number => {
      let total = 0;
      for (let i = 0; i < 400; i++) {
        inf.hp = inf.hpMax;
        woundGarrison(state, bunker, 120, caliber, false, bullet);
        total += inf.hpMax - inf.hp;
      }
      return total;
    };
    const rifle = sum(true, 7.92);
    const open = sum(false, 7.92);
    const ratio = rifle / open;
    assert.ok(ratio > 0.28 && ratio < 0.4, `bullet share ${ratio.toFixed(3)}`);
    // A 75 mm shell is no bullet whatever the caller says.
    const shellFlag = sum(true, 75);
    const shell = sum(false, 75);
    assert.ok(shellFlag / shell > 0.85 && shellFlag / shell < 1.15, `shell share ${(shellFlag / shell).toFixed(3)}`);
  });

  it("tells a bullet from a shell, a bomb, and a flame glob", () => {
    assert.equal(isBulletRound({ caliber: 7.92, shell: null }), true);
    assert.equal(isBulletRound({ caliber: 8, shell: null, flight: undefined }), true);
    assert.equal(isBulletRound({ caliber: 75, shell: "ap" }), false);
    assert.equal(isBulletRound({ caliber: 60, shell: null, flight: "mortar" }), false);
    assert.equal(isBulletRound({ caliber: 1, shell: null, flight: "flame" }), false);
    assert.equal(isBulletRound({ caliber: 120, shell: null, flight: "bomb" }), false);
  });

  it("lets the gunner fire his MG from the slit, but not from a cottage window", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const bunker = bunkerAt(state, a);
    const gunner = trooper(state, "gunner", a);
    assert.equal(enterGarrison(state, gunner, bunker), true);
    const dummy = makeEntity(state, "hauler", b, gunner.x + ts * 12, gunner.y);
    gunner.order = { kind: "attack", targetId: dummy.id };
    tickCombat(state, TICK_DT);
    assert.ok(state.projectiles.length > 0, "bunker gunner fires");
    assert.equal(state.projectiles[0]!.ignoreId, bunker.id);

    const { state: s2, a: a2, b: b2 } = twoPlayerMatch();
    const cottage = makeEntity(s2, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), { tileX: 36, tileY: 12 });
    const g2 = trooper(s2, "gunner", a2);
    assert.equal(enterGarrison(s2, g2, cottage), true);
    const d2 = makeEntity(s2, "hauler", b2, g2.x + ts * 12, g2.y);
    g2.order = { kind: "attack", targetId: d2.id };
    tickCombat(s2, TICK_DT);
    assert.equal(s2.projectiles.length, 0, "house gunner still cannot set his bipod");
  });

  it("sits low: no sight or reach bonus, unlike a house", () => {
    const { state, a } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const cottage = makeEntity(state, "cottage", "", tileCenter(20, state.tileSize), tileCenter(40, state.tileSize), {
      tileX: 16,
      tileY: 36,
    });
    const r1 = trooper(state, "rifleman", a);
    const streetSight = sightTilesForEntity(state, r1);
    const streetRange = weaponRangeWorld(state, r1);
    assert.equal(enterGarrison(state, r1, bunker), true);
    assert.equal(sightTilesForEntity(state, r1), streetSight);
    assert.equal(weaponRangeWorld(state, r1), streetRange);
    const r2 = trooper(state, "rifleman", a, 14, 36);
    assert.equal(enterGarrison(state, r2, cottage), true);
    assert.equal(sightTilesForEntity(state, r2), streetSight + GARRISON_WATCH_SIGHT_BONUS);
    assert.ok(coverHeightOf("bunker") < coverHeightOf("cottage"));
  });

  it("heals everyone inside very slowly while a medic is in, and only then", () => {
    const { state, a } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const r1 = trooper(state, "rifleman", a);
    const r2 = trooper(state, "sniper", a);
    assert.equal(enterGarrison(state, r1, bunker), true);
    assert.equal(enterGarrison(state, r2, bunker), true);
    r1.hp = r1.hpMax / 2;
    r2.hp = r2.hpMax / 2;
    const secs = 10;
    const ticks = Math.round(secs / TICK_DT);
    for (let i = 0; i < ticks; i++) step(state, TICK_DT);
    assert.equal(r1.hp, r1.hpMax / 2, "no medic, no regen");

    const medic = trooper(state, "medic", a);
    assert.equal(enterGarrison(state, medic, bunker), true);
    const h1 = r1.hp;
    const h2 = r2.hp;
    for (let i = 0; i < ticks; i++) step(state, TICK_DT);
    const want1 = r1.hpMax * BUNKER_MEDIC_REGEN_FRAC * secs;
    assert.ok(Math.abs(r1.hp - h1 - want1) < 0.5, `r1 gained ${r1.hp - h1}, want ${want1}`);
    assert.ok(Math.abs(r2.hp - h2 - r2.hpMax * BUNKER_MEDIC_REGEN_FRAC * secs) < 0.5);
    assert.ok(r1.hp - h1 < MEDIC_HEAL_PER_SEC * secs, "slower than hands-on tending");
    assert.equal(medic.tendId, undefined, "the medic does not tend hands-on inside");

    const second = trooper(state, "medic", a);
    assert.equal(enterGarrison(state, second, bunker), true);
    const h3 = r1.hp;
    for (let i = 0; i < ticks; i++) step(state, TICK_DT);
    assert.ok(Math.abs(r1.hp - h3 - want1) < 0.5, "two medics do not stack");
  });

  it("patches the concrete very slowly while an engineer is in, and only then", () => {
    const { state, a } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    bunker.hp = 1000;
    const r = trooper(state, "rifleman", a);
    assert.equal(enterGarrison(state, r, bunker), true);
    const secs = 10;
    const ticks = Math.round(secs / TICK_DT);
    for (let i = 0; i < ticks; i++) step(state, TICK_DT);
    assert.equal(bunker.hp, 1000);
    const eng = trooper(state, "engineer", a);
    assert.equal(enterGarrison(state, eng, bunker), true);
    for (let i = 0; i < ticks; i++) step(state, TICK_DT);
    assert.ok(Math.abs(bunker.hp - 1000 - BUNKER_ENGINEER_REPAIR_PER_SEC * secs) < 0.5, `hp ${bunker.hp}`);
    assert.equal(livingGarrison(state, bunker).length, 2);
  });

  it("lets its owner sell it, and the men inside walk out unhurt", () => {
    const { state, a } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const r = trooper(state, "rifleman", a);
    const street = r.hpMax;
    assert.equal(enterGarrison(state, r, bunker), true);
    assert.equal(sellBuilding(state, a, bunker.id), null);
    assert.equal(state.entities.has(bunker.id), false);
    assert.equal(r.garrisonedIn, null);
    assert.equal(r.hpMax, street);
    assert.equal(r.hp, street);
  });

  it("is left alone by enemy tanks while empty, like an empty house", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const bunker = bunkerAt(state, a);
    const tank = makeEntity(state, "warden", b, bunker.x + ts * 14, bunker.y);
    tank.facing = Math.PI;
    const hp0 = bunker.hp;
    for (let i = 0; i < 60; i++) step(state, TICK_DT);
    assert.notEqual(tank.attackTarget, bunker.id, "no auto target on the empty bunker");
    assert.notEqual(tank.order?.targetId, bunker.id, "no auto order on the empty bunker");
    assert.equal(bunker.hp, hp0);
  });

  it("draws enemy tank fire once its owner's men are inside", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const bunker = bunkerAt(state, a);
    const rifle = trooper(state, "rifleman", a);
    assert.equal(enterGarrison(state, rifle, bunker), true);
    const tank = makeEntity(state, "warden", b, bunker.x + ts * 14, bunker.y);
    tank.facing = Math.PI;
    for (let i = 0; i < 12; i++) step(state, TICK_DT);
    assert.ok(
      tank.attackTarget === bunker.id || tank.order?.targetId === bunker.id,
      `tank should engage the manned bunker, order=${tank.order?.kind} target=${tank.attackTarget}`,
    );
  });

  it("stops drawing auto fire when the garrison is gone", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const bunker = bunkerAt(state, a);
    const rifle = trooper(state, "rifleman", a);
    assert.equal(enterGarrison(state, rifle, bunker), true);
    const tank = makeEntity(state, "warden", b, bunker.x + ts * 14, bunker.y);
    tank.facing = Math.PI;
    for (let i = 0; i < 12; i++) step(state, TICK_DT);
    assert.ok(tank.attackTarget === bunker.id || tank.order?.targetId === bunker.id);
    destroyEntity(state, rifle);
    for (let i = 0; i < 4; i++) step(state, TICK_DT);
    assert.notEqual(tank.attackTarget, bunker.id);
    assert.notEqual(tank.order?.targetId, bunker.id);
  });

  it("can still be shelled empty on a player order", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const bunker = bunkerAt(state, a);
    const tank = makeEntity(state, "warden", b, bunker.x + ts * 14, bunker.y);
    tank.facing = Math.PI;
    tank.order = { kind: "attack", targetId: bunker.id };
    const hp0 = bunker.hp;
    for (let i = 0; i < 200 && bunker.hp === hp0; i++) step(state, TICK_DT);
    assert.equal(tank.order?.targetId, bunker.id, "the player's order is kept");
    assert.ok(bunker.hp < hp0, "the tank shells the empty bunker");
  });

  it("fires out of the slit facing the target, on every side, without hitting its own walls", () => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const { state, a, b } = twoPlayerMatch();
      const ts = state.tileSize;
      const bunker = bunkerAt(state, a);
      const rifle = trooper(state, "rifleman", a);
      assert.equal(enterGarrison(state, rifle, bunker), true);
      rifle.facing = Math.atan2(-dy, -dx);
      const foe = makeEntity(state, "rifleman", b, bunker.x + dx * ts * 8, bunker.y + dy * ts * 8);
      rifle.order = { kind: "attack", targetId: foe.id };
      tickCombat(state, TICK_DT);
      const shot = state.projectiles.find((p) => p.fromId === rifle.id);
      assert.ok(shot, `fires toward ${dx},${dy}`);
      assert.equal(shot.ignoreId, bunker.id);
      const x0 = bunker.tileX * ts;
      const y0 = bunker.tileY * ts;
      const outside =
        shot.x < x0 || shot.x > x0 + bunker.tileW * ts || shot.y < y0 || shot.y > y0 + bunker.tileH * ts;
      assert.ok(outside, `round starts outside the walls, at ${shot.x},${shot.y}`);
      assert.ok(shot.vx * dx + shot.vy * dy > 0, `round heads at the target ${dx},${dy}, not along a stale facing`);
      const hp0 = bunker.hp;
      for (let i = 0; i < 400 && foe.hp > 0; i++) step(state, TICK_DT);
      assert.equal(foe.hp, 0, `foe at ${dx},${dy} goes down`);
      assert.equal(bunker.hp, hp0, "the bunker is not hit by its own men");
    }
  });

  it("sends a rocket out of the slit, clear of its own walls", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const bunker = bunkerAt(state, a);
    const rocketer = trooper(state, "rocketer", a);
    assert.equal(enterGarrison(state, rocketer, bunker), true);
    const tank = makeEntity(state, "warden", b, bunker.x - ts * 16, bunker.y);
    rocketer.order = { kind: "attack", targetId: tank.id };
    tickCombat(state, TICK_DT);
    const rocket = state.projectiles.find((p) => p.fromId === rocketer.id);
    assert.ok(rocket, "rocketer fires from inside");
    assert.equal(rocket.ignoreId, bunker.id);
    assert.ok(rocket.x < bunker.tileX * ts, `rocket leaves the west wall, at x=${rocket.x}`);
    const hp0 = bunker.hp;
    for (let i = 0; i < 30; i++) step(state, TICK_DT);
    assert.equal(bunker.hp, hp0);
  });

  it("cannot be captured by enemy infantry, even while empty", () => {
    assert.equal(isCapturable("bunker"), false);
    assert.equal(isCapturable("dynamo"), true);
    const { state, a, b } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const foes = [0, 1, 2].map((i) => trooper(state, "rifleman", b, 34, 12 + i));
    for (const f of foes) f.order = { kind: "attack", targetId: bunker.id };
    const secs = 60;
    for (let i = 0; i < Math.round(secs / TICK_DT); i++) step(state, TICK_DT);
    assert.equal(bunker.ownerId, a);
    assert.equal(bunker.captureProgress, 0);
  });

  it("force-attack on the bunker aims soldiers who can reach, and they stay inside", () => {
    const { state, a, b } = twoPlayerMatch();
    const bunker = bunkerAt(state, a);
    const rifle = trooper(state, "rifleman", a);
    const gunner = trooper(state, "gunner", a);
    const medic = trooper(state, "medic", a);
    assert.equal(enterGarrison(state, rifle, bunker), true);
    assert.equal(enterGarrison(state, gunner, bunker), true);
    assert.equal(enterGarrison(state, medic, bunker), true);
    const parked = bunker.x;
    const range = weaponRangeWorld(state, rifle);
    const x = bunker.x + range * 0.5;
    const y = bunker.y;
    assert.equal(applyCommand(state, a, { type: "cmd.forceattack", ids: [bunker.id], x, y }).ok, true);
    assert.equal(rifle.order?.kind, "forceattack");
    assert.equal(rifle.order?.relay, true);
    assert.equal(gunner.order?.kind, "forceattack");
    assert.equal(medic.order, null);
    step(state, TICK_DT);
    // A ground force-attack is fused to the click, so both rounds land in this same tick.
    assert.ok(state.impacts.some((p) => p.fromId === rifle.id));
    assert.ok(state.impacts.some((p) => p.fromId === gunner.id));
    assert.equal(rifle.garrisonedIn, bunker.id);
    assert.equal(gunner.garrisonedIn, bunker.id);
    assert.equal(bunker.x, parked);

    assert.equal(applyCommand(state, a, { type: "cmd.stop", ids: [bunker.id] }).ok, true);
    assert.equal(rifle.order, null);
    assert.equal(gunner.order, null);

    const far = applyCommand(state, a, { type: "cmd.forceattack", ids: [bunker.id], x: bunker.x + range * 4, y });
    assert.equal(far.ok, false);
    if (!far.ok) assert.match(far.message, /Out of range/);
    assert.equal(rifle.order, null);

    setGarrisonHide(state, bunker, true);
    const hidden = applyCommand(state, a, { type: "cmd.forceattack", ids: [bunker.id], x, y });
    assert.equal(hidden.ok, false);
    assert.equal(rifle.order, null);

    assert.equal(applyCommand(state, b, { type: "cmd.forceattack", ids: [bunker.id], x, y }).ok, false);
  });

  it("does not aim a gunner out of a house window", () => {
    const { state, a } = twoPlayerMatch();
    const def = catalog("cottage");
    const ts = state.tileSize;
    const tx = 48;
    const ty = 20;
    const cottage = makeEntity(state, "cottage", "", (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
      tileX: tx,
      tileY: ty,
    });
    const rifle = trooper(state, "rifleman", a, tx, ty);
    const gunner = trooper(state, "gunner", a, tx, ty);
    assert.equal(enterGarrison(state, rifle, cottage), true);
    assert.equal(enterGarrison(state, gunner, cottage), true);
    const range = weaponRangeWorld(state, rifle);
    assert.equal(
      applyCommand(state, a, { type: "cmd.forceattack", ids: [cottage.id], x: cottage.x + range * 0.5, y: cottage.y }).ok,
      true,
    );
    assert.equal(rifle.order?.kind, "forceattack");
    assert.equal(gunner.order, null);
    step(state, TICK_DT);
    assert.ok(state.impacts.some((p) => p.fromId === rifle.id));
    assert.equal(state.impacts.some((p) => p.fromId === gunner.id), false);
    assert.equal(rifle.garrisonedIn, cottage.id);
    assert.equal(gunner.garrisonedIn, cottage.id);
  });
});

describe("placed facing", () => {
  it("turns a Bunker, Watch Tower, or Airfield to the nearest 15° step, and leaves other buildings facing east", () => {
    const step = Math.PI / 12;
    assert.equal(placedFacing("bunker", Math.PI / 2 + 0.3), 7 * step);
    assert.equal(placedFacing("tower", -Math.PI / 2), 18 * step);
    assert.equal(placedFacing("airfield", step * 3.4), 3 * step);
    assert.equal(placedFacing("bunker", 0.1), 0);
    assert.equal(placedFacing("dynamo", Math.PI), 0);
    const { state, a } = twoPlayerMatch();
    const tower = raiseBuilding(state, a, "tower", 120, 120, Math.PI);
    assert.equal(tower.facing, 12 * step);
    const dynamo = raiseBuilding(state, a, "dynamo", 110, 110, Math.PI);
    assert.equal(dynamo.facing, 0);
  });

  it("turns the footprint with the building", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const def = catalog("airfield");
    // A quarter turn swaps the box and fills it exactly.
    const quarter = raiseBuilding(state, a, "airfield", 20, 20, Math.PI / 2);
    assert.equal(quarter.tileW, def.tileH);
    assert.equal(quarter.tileH, def.tileW);
    let mine = 0;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) if (state.occupy[y * state.width + x] === quarter.id) mine++;
    }
    assert.equal(mine, def.tileW * def.tileH);
    assert.equal(occupant(state, 20, 20 + def.tileW - 1), quarter.id, "the strip runs south now");
    assert.equal(occupant(state, 20 + def.tileH, 20), 0, "and not east");
    // 45°: a diamond in a bigger box. The box corners stay open ground.
    const bunker = raiseBuilding(state, a, "bunker", 120, 60, Math.PI / 4);
    assert.ok(bunker.tileW > catalog("bunker").tileW);
    assert.equal(occupant(state, bunker.tileX, bunker.tileY), 0, "the box corner is not the bunker");
    const cx = Math.floor(bunker.x / ts);
    const cy = Math.floor(bunker.y / ts);
    assert.equal(occupant(state, cx, cy), bunker.id);
    let diamond = 0;
    for (let y = bunker.tileY; y < bunker.tileY + bunker.tileH; y++) {
      for (let x = bunker.tileX; x < bunker.tileX + bunker.tileW; x++) if (occupant(state, x, y) === bunker.id) diamond++;
    }
    const area = catalog("bunker").tileW * catalog("bunker").tileH;
    assert.ok(Math.abs(diamond - area) <= area * 0.15, `about the bunker's own area (${diamond} vs ${area})`);
    // Selling clears every tile it stood on.
    sellBuilding(state, a, bunker.id);
    assert.equal(occupant(state, cx, cy), 0);
  });

  it("stands a placed Bunker at the facing the player turned it to", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    state.players.get(a)!.scrap = 50_000;
    // Open ground round the yard: the village and the scrap go.
    for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
    for (let y = 100; y <= 170; y++) {
      for (let x = 100; x <= 170; x++) {
        const i = y * state.width + x;
        state.terrain[i] = TILE_EMPTY;
        state.occupy[i] = 0;
      }
    }
    const core = makeEntity(state, "core", a, tileCenter(120, ts), tileCenter(120, ts), { tileX: 118, tileY: 118 });
    makeEntity(state, "dynamo", a, 0, 0, { tileX: 104, tileY: 104 });
    const tx = core.tileX + core.tileW + 2;
    const ty = core.tileY;
    assert.equal(applyCommand(state, a, { type: "cmd.build", building: "bunker" }).ok, true);
    let ready = false;
    for (let i = 0; i < 6000 && !ready; i++) {
      step(state, TICK_DT);
      ready = state.players.get(a)!.defence?.ready === true;
    }
    assert.ok(ready, "the Bunker finishes building");
    assert.equal(
      applyCommand(state, a, { type: "cmd.place", building: "bunker", tx, ty, facing: Number.NaN }).ok,
      false,
      "a facing that is not a number is refused",
    );
    const res = applyCommand(state, a, { type: "cmd.place", building: "bunker", tx, ty, facing: Math.PI / 2 });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    const placed = [...state.entities.values()].find((e) => e.type === "bunker" && e.ownerId === a);
    assert.ok(placed);
    assert.equal(placed.facing, Math.PI / 2);
  });
});
