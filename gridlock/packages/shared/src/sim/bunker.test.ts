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
  MEDIC_HEAL_PER_SEC,
  TICK_DT,
  catalog,
  coverHeightOf,
  garrisonCapOf,
  type EntityType,
} from "../catalog.js";
import { applyCommand } from "./commands.js";
import { sellBuilding } from "./build.js";
import { tickCombat } from "./combat.js";
import { sightTilesForEntity, weaponRangeWorld } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { canGarrison, enterGarrison, livingGarrison, woundGarrison } from "./garrison.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "BK", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
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

  it("lets the gunner fire his MG from the slit, but not from a cottage window", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const bunker = bunkerAt(state, a);
    const gunner = trooper(state, "gunner", a);
    assert.equal(enterGarrison(state, gunner, bunker), true);
    const dummy = makeEntity(state, "hauler", b, gunner.x + ts * 12, gunner.y);
    dummy.autoHarvest = false;
    gunner.order = { kind: "attack", targetId: dummy.id };
    tickCombat(state, TICK_DT);
    assert.ok(state.projectiles.length > 0, "bunker gunner fires");
    assert.equal(state.projectiles[0]!.ignoreId, bunker.id);

    const { state: s2, a: a2, b: b2 } = twoPlayerMatch();
    const cottage = makeEntity(s2, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), { tileX: 36, tileY: 12 });
    const g2 = trooper(s2, "gunner", a2);
    assert.equal(enterGarrison(s2, g2, cottage), true);
    const d2 = makeEntity(s2, "hauler", b2, g2.x + ts * 12, g2.y);
    d2.autoHarvest = false;
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

  it("stays a target for enemy tanks while empty, unlike an empty house", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const bunker = bunkerAt(state, a);
    const tank = makeEntity(state, "warden", b, bunker.x + ts * 14, bunker.y);
    tank.facing = Math.PI;
    for (let i = 0; i < 12; i++) step(state, TICK_DT);
    assert.ok(
      tank.attackTarget === bunker.id || tank.order?.targetId === bunker.id,
      `tank should engage the empty bunker, order=${tank.order?.kind} target=${tank.attackTarget}`,
    );
  });
});
