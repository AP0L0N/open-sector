import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  FW190_CANNON,
  FW190_BARRAGE_ROUNDS,
  FW190_BARRAGES,
  FW190_ROOF_HP_SHARE,
  FW190_WING_GUN_OFFSET,
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
import type { ImpactView } from "../protocol.js";
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
  const state = createMatch(room, started.value);
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
  it("is an aircraft trained at the Airfield", () => {
    assert.ok(TRAIN_TYPES.includes("fw190"));
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
    assert.equal(plane.air?.rounds, FW190_BARRAGES);
  });

  it("rearms its cannon on the pad and never hangs a bomb", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 60, tileY: 4 });
    const field = seedAirfield(state);
    const plane = spawnUnit(state, "A", "fw190", field, false)!;
    plane.air!.rounds = 0;
    ticks(state, Math.ceil(12 / TICK_DT));
    assert.equal(plane.air!.rounds, FW190_BARRAGES);
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
    assert.ok(fighter.air!.rounds < FW190_BARRAGES);
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

  /** A field with the fighter on its pad, a target on open ground, and a spotter so side A sees it. */
  function strafeRange(type: "warden" | "hauler" | "ss3" | "rifleman"): { state: MatchState; plane: Entity; target: Entity } {
    const state = twoPlayerMatch();
    seedCore(state);
    seedCore(state, "B", 200, 200);
    const field = seedAirfield(state);
    const plane = spawnUnit(state, "A", "fw190", field, false)!;
    const ts = state.tileSize;
    const target = makeEntity(state, type, "B", 120 * ts, 60 * ts);
    target.holdPosition = true;
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 118, tileY: 64 });
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [plane.id], targetId: target.id }).ok, true);
    return { state, plane, target };
  }

  /** Steps until the plane looses a barrage; returns its impacts and where the plane was when it fired. */
  function nextBarrage(state: MatchState, plane: Entity, max: number): { impacts: ImpactView[]; from: { x: number; y: number } } | null {
    for (let i = 0; i < max; i++) {
      const before = plane.air!.rounds;
      const from = { x: plane.x, y: plane.y };
      step(state, TICK_DT);
      if (plane.air!.rounds < before) return { impacts: state.impacts.filter((im) => im.fromId === plane.id), from };
    }
    return null;
  }

  it(`a sortie is ${FW190_BARRAGES} barrages, one a pass, then it goes home`, () => {
    const { state, plane, target } = strafeRange("hauler");
    const at: number[] = [];
    for (let k = 0; k < FW190_BARRAGES; k++) {
      const shot = nextBarrage(state, plane, 900);
      assert.ok(shot, `barrage ${k + 1} should fire`);
      at.push(state.tick);
    }
    assert.equal(plane.air!.rounds, 0);
    for (let k = 1; k < at.length; k++) assert.ok(at[k]! - at[k - 1]! > 10, "each barrage is its own pass");
    ticks(state, 5);
    assert.equal(plane.order?.kind, "land");
    assert.ok(target.hp > 0 || !state.entities.has(target.id));
  });

  it("a barrage is two straight lines of rounds, one per wing, laid along the bearing to the target", () => {
    const { state, plane, target } = strafeRange("rifleman");
    const tx = target.x;
    const ty = target.y;
    const shot = nextBarrage(state, plane, 900);
    assert.ok(shot);
    assert.equal(shot.impacts.length, FW190_BARRAGE_ROUNDS * 2);
    const d = Math.hypot(tx - shot.from.x, ty - shot.from.y);
    const ux = (tx - shot.from.x) / d;
    const uy = (ty - shot.from.y) / d;
    const gap = plane.radius * FW190_WING_GUN_OFFSET;
    const left = shot.impacts.filter((im) => (im.x - tx) * -uy + (im.y - ty) * ux > 0);
    const right = shot.impacts.filter((im) => (im.x - tx) * -uy + (im.y - ty) * ux < 0);
    assert.equal(left.length, FW190_BARRAGE_ROUNDS);
    assert.equal(right.length, FW190_BARRAGE_ROUNDS);
    for (const im of shot.impacts) {
      const across = Math.abs((im.x - tx) * -uy + (im.y - ty) * ux);
      assert.ok(Math.abs(across - gap) < 0.5, `round ${across.toFixed(2)} off the line, gap ${gap}`);
    }
    // The lines run from short of the target to past it.
    const along = shot.impacts.map((im) => (im.x - tx) * ux + (im.y - ty) * uy);
    assert.ok(Math.min(...along) < 0 && Math.max(...along) > 0);
    // The 30 mm bursts in the dirt kill the soldier between the lines.
    assert.equal(state.entities.has(target.id), false);
  });

  for (const type of ["warden", "hauler", "ss3"] as const) {
    it(`every barrage comes through the roof of a ${catalog(type).name}`, () => {
      const { state, plane, target } = strafeRange(type);
      const hp0 = target.hp;
      let last = target.hp;
      for (let k = 0; k < FW190_BARRAGES; k++) {
        const shot = nextBarrage(state, plane, 900);
        assert.ok(shot, `barrage ${k + 1}`);
        assert.ok(shot.impacts.some((im) => im.kind === "pen" || im.kind === "kill"), `barrage ${k + 1} should bite`);
        assert.ok(target.hp < last, `barrage ${k + 1} hp ${target.hp}`);
        last = target.hp;
      }
      assert.ok(target.hp <= hp0 * 0.5, `${type} hp ${target.hp}/${hp0} after a sortie`);
    });
  }

  it("spares its own side in the line of fire", () => {
    // An unarmed engineer beside an enemy soldier with an empty rifle: only the barrage could hurt either.
    const { state, plane, target } = strafeRange("rifleman");
    target.clip = 0;
    target.reload = 9999;
    const friend = makeEntity(state, "engineer", "A", target.x + 3, target.y);
    friend.holdPosition = true;
    const shot = nextBarrage(state, plane, 900);
    assert.ok(shot);
    assert.equal(state.entities.has(target.id), false, "the enemy soldier dies");
    assert.equal(friend.hp, friend.hpMax, "the friend beside him does not");
  });

  /** Your own fighter on its pad and one of your own units out on open ground. */
  function ownRange(type: "rifleman" | "warden"): { state: MatchState; plane: Entity; target: Entity } {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = spawnUnit(state, "A", "fw190", field, false)!;
    const ts = state.tileSize;
    const target = makeEntity(state, type, "A", 120 * ts, 60 * ts);
    target.holdPosition = true;
    return { state, plane, target };
  }

  for (const type of ["rifleman", "warden"] as const) {
    it(`force-attack on your own ${catalog(type).name} hurts it, as a forced bomb does`, () => {
      const { state, plane, target } = ownRange(type);
      const hp0 = target.hp;
      const r = applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: target.x, y: target.y, targetId: target.id });
      assert.equal(r.ok, true, !r.ok ? r.message : "");
      const shot = nextBarrage(state, plane, 900);
      assert.ok(shot, "a barrage should fire on a forced target");
      assert.ok(!state.entities.has(target.id) || target.hp < hp0, `${type} hp ${target.hp}/${hp0}`);
    });
  }

  it("force-fire on a bare ground point lays a barrage there", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = spawnUnit(state, "A", "fw190", field, false)!;
    const ts = state.tileSize;
    const foe = makeEntity(state, "rifleman", "B", 120 * ts, 60 * ts);
    foe.clip = 0;
    foe.reload = 9999;
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: foe.x, y: foe.y });
    const shot = nextBarrage(state, plane, 900);
    assert.ok(shot, "a barrage should fire on a ground point");
    assert.equal(shot.impacts.length, FW190_BARRAGE_ROUNDS * 2);
    assert.equal(state.entities.has(foe.id), false, "the soldier standing on the point dies");
  });

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
