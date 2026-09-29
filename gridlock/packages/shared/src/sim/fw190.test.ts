import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  FW190_CANNON,
  FW190_ROOF_HP_SHARE,
  FW190_ROUNDS,
  START_UNITS,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  isAircraftType,
} from "../catalog.js";
import { resolveRoofHit, roofArmorOf } from "./ballistics.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { spawnUnit } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "FW19", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value, { startingUnits: false });
  state.players.get("A")!.scrap = 50_000;
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n && !state.ended; i++) step(state, TICK_DT);
}

function until(state: MatchState, max: number, done: () => boolean): number {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    step(state, TICK_DT);
  }
  return -1;
}

function seedCore(state: MatchState, owner = "A", tx = 4, ty = 4): Entity {
  const ts = state.tileSize;
  return makeEntity(state, "core", owner, tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
}

function seedAirfield(state: MatchState, tx = 30, ty = 30, owner = "A"): Entity {
  const ts = state.tileSize;
  const def = catalog("airfield");
  return makeEntity(state, "airfield", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function planeOver(state: MatchState, type: "stuka" | "fw190", owner: string, x: number, y: number): Entity {
  const plane = makeEntity(state, type, owner, x, y);
  plane.air!.phase = "fly";
  plane.air!.alt = AIR_CRUISE_ALT;
  plane.air!.speed = 1;
  plane.order = { kind: "move", x, y };
  return plane;
}

describe("Fw 190", () => {
  it("is an aircraft trained at the Airfield, not in the opening army", () => {
    assert.ok(TRAIN_TYPES.includes("fw190"));
    assert.ok(!START_UNITS.includes("fw190"));
    assert.ok(isAircraftType("fw190"));
    assert.equal(catalog("fw190").name, "Fw 190");
    assert.ok(catalog("fw190").moveTilesPerSec > catalog("stuka").moveTilesPerSec, "faster than the Stuka");
    assert.ok(catalog("fw190").turnDegPerSec > catalog("stuka").turnDegPerSec, "turns tighter than the Stuka");
  });

  it("rolls onto a hardstand with its cannon loaded and no bomb", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const r = applyCommand(state, "A", { type: "cmd.train", unit: "fw190" });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    ticks(state, Math.ceil(catalog("fw190").buildSeconds / TICK_DT) + 20);
    const plane = [...state.entities.values()].find((e) => e.type === "fw190");
    assert.ok(plane);
    assert.equal(plane.air?.phase, "parked");
    assert.equal(plane.air?.homeId, field.id);
    assert.equal(plane.air?.bombs, 0);
    assert.equal(plane.air?.rounds, FW190_ROUNDS);
  });

  it("rearms its cannon on the pad and never hangs a bomb", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 60, tileY: 4 });
    const field = seedAirfield(state);
    const plane = spawnUnit(state, "A", "fw190", field, false)!;
    plane.air!.rounds = 0;
    ticks(state, Math.ceil(12 / TICK_DT));
    assert.equal(plane.air!.rounds, FW190_ROUNDS);
    assert.equal(plane.air!.bombs, 0);
  });

  it("shoots down an enemy plane in the air", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const foe = planeOver(state, "stuka", "B", 110 * ts, 100 * ts);
    const fighter = planeOver(state, "fw190", "A", 100 * ts, 100 * ts);
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [fighter.id], targetId: foe.id }).ok, true);
    const t = until(state, 1200, () => !state.entities.has(foe.id));
    assert.ok(t >= 0, `the Stuka should go down (hp ${foe.hp}/${foe.hpMax}, rounds ${fighter.air!.rounds})`);
    assert.ok(fighter.air!.rounds < FW190_ROUNDS);
  });

  it("attack-move takes a plane in the air before a tank on the ground", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    makeEntity(state, "warden", "B", 106 * ts, 100 * ts);
    const foe = planeOver(state, "stuka", "B", 108 * ts, 100 * ts);
    const fighter = planeOver(state, "fw190", "A", 100 * ts, 100 * ts);
    applyCommand(state, "A", { type: "cmd.attackmove", ids: [fighter.id], x: 160 * ts, y: 100 * ts });
    // Once the side has eyes on the plane it drops the tank for it.
    const t = until(state, 10, () => fighter.attackTarget === foe.id);
    assert.ok(t >= 0, `target ${fighter.attackTarget}`);
    ticks(state, 20);
    assert.equal(fighter.attackTarget, foe.id);
  });

  for (const type of ["warden", "hauler"] as const) {
    it(`strafes a ${catalog(type).name} and the cannon come through the roof`, () => {
      const state = twoPlayerMatch();
      seedCore(state);
      seedCore(state, "B", 200, 200);
      const field = seedAirfield(state);
      const plane = spawnUnit(state, "A", "fw190", field, false)!;
      const ts = state.tileSize;
      const tank = makeEntity(state, type, "B", 120 * ts, 60 * ts);
      tank.holdPosition = true;
      makeEntity(state, "dynamo", "A", 0, 0, { tileX: 118, tileY: 64 });
      const hp0 = tank.hp;
      assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [plane.id], targetId: tank.id }).ok, true);
      const t = until(state, 2400, () => tank.hp <= hp0 * 0.8 || !state.entities.has(tank.id));
      assert.ok(t >= 0, `${type} hp ${tank.hp}/${hp0}, rounds left ${plane.air!.rounds}`);
    });
  }

  it("a Stuka still does not take a plane in the air", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const foe = planeOver(state, "fw190", "B", 110 * ts, 100 * ts);
    const stuka = planeOver(state, "stuka", "A", 100 * ts, 100 * ts);
    applyCommand(state, "A", { type: "cmd.attack", ids: [stuka.id], targetId: foe.id });
    ticks(state, 200);
    assert.equal(foe.hp, foe.hpMax);
  });
});

describe("roof hits", () => {
  it("the roof is a share of the side plate", () => {
    assert.ok(roofArmorOf(catalog("hauler")) < catalog("hauler").armorSide);
    assert.ok(roofArmorOf(catalog("hauler")) < FW190_CANNON.penetration, "30 mm beats the heaviest roof");
  });

  it("a biting round takes a fixed share of max HP on any hull, and never one-shots", () => {
    for (const type of ["warden", "hauler", "titan", "ss3"] as const) {
      const def = catalog(type);
      const res = resolveRoofHit({ penetration: FW190_CANNON.penetration, target: def, targetHp: def.hp, targetHpMax: def.hp, rand: () => 0.5 });
      assert.equal(res.kind, "pen", type);
      assert.equal(res.damage, Math.round(def.hp * FW190_ROOF_HP_SHARE), type);
    }
  });

  it("a round that does not beat the roof glances off", () => {
    const def = catalog("hauler");
    const res = resolveRoofHit({ penetration: 8, target: def, targetHp: def.hp, targetHpMax: def.hp, rand: () => 0.5 });
    assert.equal(res.kind, "glance");
    assert.equal(res.damage, 0);
  });
});
