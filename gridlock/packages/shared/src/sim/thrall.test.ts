import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TECH_REQUIRES,
  THRALL_BLAST_HEAVY,
  THRALL_PUNCH_DAMAGE,
  THRALL_STAGGER_SPEED,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  fieldSpan,
  infantryGunFor,
  isCivilianType,
  isCyborg,
  isInfantryType,
  meleeOf,
  secondsToTicks,
  vaultsWalls,
  THRALL_STAGGER_SECONDS,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { restampForts } from "./field.js";
import { moveSpeedMul } from "./crits.js";
import { destroyEntity, makeEntity, tileCenter, tileIndex, walkable } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { maybeStagger } from "./thrall.js";
import type { EntityType } from "../catalog.js";
import type { Entity, MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "TH", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  state.blocked.fill(0);
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
  // Both sides keep their cyborgs linked: a powered Cyborg Central each.
  central(state, "A", 6, 6);
  central(state, "B", 6, 50);
  return { state, a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function central(state: MatchState, playerId: string, tx: number, ty: number): void {
  const ts = state.tileSize;
  makeEntity(state, "cyborgcentral", playerId, tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
  makeEntity(state, "dynamo", playerId, tileCenter(tx, ts), tileCenter(ty + 6, ts), { tileX: tx, tileY: ty + 6 });
}

function unit(state: MatchState, type: EntityType, playerId: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, playerId, tileCenter(tx, ts), tileCenter(ty, ts));
}

/** A line of sandbags or wall straight down column `tx`, the whole height of the map. */
function fortLine(state: MatchState, type: "sandbags" | "wall", tx: number): void {
  const ts = state.tileSize;
  const len = fieldSpan(type)!.length;
  for (let y = len / 2; y < state.height * ts; y += len) {
    const piece = makeEntity(state, type, "B", tileCenter(tx, ts), y, { facing: 0 });
    piece.facing = 0;
  }
  restampForts(state);
}

describe("Thrall catalog", () => {
  it("is a cheap, quick, tanky Xenomorph cyborg with fists, gated on the Conversion Chamber", () => {
    const d = catalog("thrall");
    assert.ok(TRAIN_TYPES.includes("thrall"));
    assert.equal(d.name, "Thrall");
    assert.ok(isInfantryType("thrall") && isCyborg("thrall") && meleeOf("thrall") && vaultsWalls("thrall"));
    assert.equal(TECH_REQUIRES.thrall, "conversion");
    assert.equal(infantryGunFor({ type: "thrall", crits: [] })?.id, "fists");
    assert.ok(d.cost < catalog("xenodrone").cost && d.buildSeconds < catalog("xenodrone").buildSeconds, "cheaper and quicker than the Drone");
    assert.ok(d.hp > catalog("xenodrone").hp, "tankier than the Drone");
    assert.ok(d.moveTilesPerSec > catalog("simunit2").moveTilesPerSec, "runs faster than the Sim Unit");
    assert.equal(vaultsWalls("rifleman"), false);
  });
});

describe("Thrall fists", () => {
  it("pummels a soldier down in a few blows and stays standing", () => {
    const { state, a, b } = match();
    const th = unit(state, "thrall", a, 40, 40);
    const rifle = makeEntity(state, "rifleman", b, th.x + 14, th.y);
    assert.ok(THRALL_PUNCH_DAMAGE * 1.15 < catalog("rifleman").hp, "not one blow");
    applyCommand(state, a, { type: "cmd.attack", ids: [th.id], targetId: rifle.id });
    ticks(state, 2);
    assert.ok(rifle.hp > 0 && rifle.hp < catalog("rifleman").hp, `one blow landed: ${rifle.hp}`);
    ticks(state, secondsToTicks(1.5));
    assert.ok(!state.entities.has(rifle.id) || rifle.hp <= 0, `rifleman still at ${rifle.hp}`);
    assert.ok(state.entities.has(th.id) && th.hp > 0);
  });

  it("runs down a soldier out of reach", () => {
    const { state, a, b } = match();
    const th = unit(state, "thrall", a, 40, 40);
    const rifle = unit(state, "rifleman", b, 45, 40);
    rifle.holdPosition = true;
    applyCommand(state, a, { type: "cmd.attack", ids: [th.id], targetId: rifle.id });
    ticks(state, secondsToTicks(4));
    assert.ok(!state.entities.has(rifle.id) || rifle.hp <= 0, `rifleman still at ${rifle.hp}`);
  });

  it("detonates on an armored hull instead of punching, and is gone", () => {
    const { state, a, b } = match();
    const th = unit(state, "thrall", a, 40, 40);
    const tank = makeEntity(state, "warden", b, th.x + 20, th.y);
    const hp = tank.hp;
    applyCommand(state, a, { type: "cmd.attack", ids: [th.id], targetId: tank.id });
    ticks(state, secondsToTicks(2));
    assert.equal(state.entities.has(th.id), false, "nothing left of it");
    const lost = hp - tank.hp;
    assert.ok(lost > THRALL_BLAST_HEAVY * 0.4 && lost <= THRALL_BLAST_HEAVY, `tank lost ${lost}`);
  });
});

describe("Thrall stagger", () => {
  it("staggers on a bullet only on a lucky roll, slows, and shakes it off", () => {
    const { state, a } = match();
    const th = unit(state, "thrall", a, 40, 40);
    const run = moveSpeedMul(th);
    maybeStagger(state, th, 8, () => 0.99);
    assert.equal(th.staggered, undefined, "not every bullet");
    maybeStagger(state, th, 75, () => 0);
    assert.equal(th.staggered, undefined, "a shell is not a bullet");
    maybeStagger(state, th, 8, () => 0);
    assert.equal(th.staggered, true);
    assert.ok(Math.abs(moveSpeedMul(th) - run * THRALL_STAGGER_SPEED) < 1e-9);
    assert.equal(snapshotFor(state, a).entities.find((e) => e.id === th.id)?.stagger, true);
    ticks(state, secondsToTicks(THRALL_STAGGER_SECONDS) + 1);
    assert.equal(th.staggered, undefined);
    maybeStagger(state, th, 8, () => 0);
    assert.equal(th.staggered, undefined, "a short guard before the next");
    const rifle = makeEntity(state, "rifleman", "B", th.x + 20, th.y);
    maybeStagger(state, rifle, 8, () => 0);
    assert.equal(rifle.staggered, undefined, "only the Thrall");
  });

  it("is staggered now and then under rifle fire, not by every hit", () => {
    const { state, a, b } = match();
    const th = unit(state, "thrall", a, 40, 40);
    th.holdPosition = true;
    th.shutdown = undefined;
    const shooters = [0, 1, 2, 3].map((i) => unit(state, "rifleman", b, 46, 38 + i));
    let staggers = 0;
    let hits = 0;
    let was = false;
    let hp = th.hp;
    for (let i = 0; i < secondsToTicks(20) && th.hp > 0; i++) {
      // Keep it alive and out of the fight: only the stagger is under test.
      th.cooldown = 99;
      step(state, TICK_DT);
      if (th.hp < hp) hits++;
      if (th.hp < 60) th.hp = th.hpMax;
      hp = th.hp;
      if (th.staggered && !was) staggers++;
      was = !!th.staggered;
    }
    assert.ok(shooters.length > 0);
    assert.ok(hits > 5, `hits ${hits}`);
    assert.ok(staggers >= 1, "staggered at least once");
    assert.ok(staggers < hits, `${staggers} staggers on ${hits} hits`);
  });
});

describe("Thrall vault", () => {
  for (const type of ["sandbags", "wall"] as const) {
    it(`runs across a line of ${type} that holds a rifleman back`, () => {
      const { state, a } = match();
      const ts = state.tileSize;
      fortLine(state, type, 50);
      assert.equal(state.fortBlock[tileIndex(state, 50, 40)], 1);
      assert.equal(walkable(state, 50, 40, "thrall"), true);
      assert.equal(walkable(state, 50, 40, "rifleman"), false);
      const th = unit(state, "thrall", a, 46, 40);
      const rifle = unit(state, "rifleman", a, 46, 44);
      applyCommand(state, a, { type: "cmd.move", ids: [th.id], x: tileCenter(54, ts), y: tileCenter(40, ts) });
      applyCommand(state, a, { type: "cmd.move", ids: [rifle.id], x: tileCenter(54, ts), y: tileCenter(44, ts) });
      let vaulted = false;
      for (let i = 0; i < secondsToTicks(6); i++) {
        step(state, TICK_DT);
        if (snapshotFor(state, a).entities.find((e) => e.id === th.id)?.vault) vaulted = true;
      }
      assert.ok(th.x > tileCenter(53, ts), `thrall at ${th.x / ts}`);
      assert.ok(vaulted, "the snapshot showed it on top");
      assert.ok(rifle.x < tileCenter(50, ts), `rifleman got to ${rifle.x / ts}`);
    });
  }
});
