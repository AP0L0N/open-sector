import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CIWS_BELT,
  GATLING_LIGHT_CHANCE,
  TICK_DT,
  catalog,
  isLightHull,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { resolveGatlingLight } from "./ballistics.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "GL1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  for (let i = 0; i < state.terrain.length; i++) {
    state.terrain[i] = TILE_EMPTY;
    state.blocked[i] = 0;
    state.occupy[i] = 0;
    state.heights[i] = 0;
  }
  for (const e of [...state.entities.values()]) {
    if (e.type !== "rig") destroyEntity(state, e);
  }
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n && !state.ended; i++) step(state, TICK_DT);
}

function seedCiws(state: MatchState): Entity {
  const ts = state.tileSize;
  const def = catalog("ciws");
  const tx = 120;
  const ty = 120;
  return makeEntity(state, "ciws", "A", (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

/** Nose toward the gun on his west, so the rounds meet the front plate. */
function truckEastOf(state: MatchState, x: number, y: number): Entity {
  return makeEntity(state, "supply", "B", x, y, { facing: Math.PI });
}

function countFire(state: MatchState, n: number): { spark: number; bite: number } {
  let spark = 0;
  let bite = 0;
  for (let i = 0; i < n && !state.ended; i++) {
    step(state, TICK_DT);
    for (const im of state.impacts) {
      if (im.kind === "ricochet") spark++;
      else if (im.kind === "hit" || im.kind === "pen" || im.kind === "kill") bite++;
    }
  }
  return { spark, bite };
}

describe("gatling rounds against light plate", () => {
  it("names the light hulls and leaves tanks off that list", () => {
    assert.equal(isLightHull(catalog("walker")), true);
    assert.equal(isLightHull(catalog("supply")), true);
    assert.equal(isLightHull(catalog("warden")), false);
    assert.equal(isLightHull(catalog("nebelwerfer")), false);
    assert.equal(isLightHull(catalog("rifleman")), false);
    assert.equal(isLightHull(catalog("cyborg")), false);
    assert.ok(GATLING_LIGHT_CHANCE > 0 && GATLING_LIGHT_CHANCE < 0.2);
  });

  it("a square hit sometimes punches and otherwise sparks", () => {
    const walker = catalog("walker");
    const seq = (values: number[]) => {
      let i = 0;
      return () => values[i++] ?? 0;
    };
    const hit = resolveGatlingLight({
      damage: 8,
      caliber: 8,
      target: walker,
      targetFacing: 0,
      targetHp: 80,
      vx: -400,
      vy: 0,
      rand: seq([0, 0]),
    });
    assert.equal(hit.kind, "hit");
    assert.equal(hit.damage, 7);
    const spark = resolveGatlingLight({
      damage: 8,
      caliber: 8,
      target: walker,
      targetFacing: 0,
      targetHp: 80,
      vx: -400,
      vy: 0,
      rand: seq([0.99, 0, 0, 0]),
    });
    assert.equal(spark.kind, "ricochet");
    assert.equal(spark.damage, 0);
  });

  it("a pad CIWS mostly sparks on a truck and still draws blood", () => {
    const state = match();
    const ciws = seedCiws(state);
    const truck = truckEastOf(state, ciws.x + 36, ciws.y);
    truck.holdPosition = true;
    const hp = truck.hp;
    const { spark, bite } = countFire(state, 50);
    assert.ok(spark > bite, `sparks ${spark} bites ${bite}`);
    assert.ok(bite > 0, "a round got through");
    assert.ok(truck.hp < hp || truck.wreck);
    assert.ok(ciws.clip < CIWS_BELT);
  });

  it("the same gun still chews a StuG's side and still leaves a Tiger's front alone", () => {
    const sideState = match();
    const sideGun = seedCiws(sideState);
    const stug = makeEntity(sideState, "ss3", "B", sideGun.x + 40, sideGun.y, { facing: -Math.PI / 2 });
    stug.holdPosition = true;
    stug.cooldown = 999;
    const side = stug.hp;
    ticks(sideState, 20);
    assert.ok(stug.hp < side, "side plate is not a light hull");

    const state = match();
    const ciws = seedCiws(state);
    const tiger = makeEntity(state, "warden", "B", ciws.x + 40, ciws.y, { facing: Math.PI });
    tiger.holdPosition = true;
    tiger.cooldown = 999;
    tiger.ammo = { ap: 0, he: 0, smoke: 0 };
    const front = tiger.hp;
    ticks(state, 25);
    assert.equal(tiger.hp, front);
    assert.equal(ciws.clip, CIWS_BELT, "the pad does not spend rounds on plate it cannot hurt");
  });

  it("a Walker's own guns nick a truck and bounce off a Tiger's front", () => {
    const state = match();
    const ts = state.tileSize;
    const x = tileCenter(120, ts);
    const y = tileCenter(140, ts);
    const walker = makeEntity(state, "walker", "A", x, y);
    const truck = truckEastOf(state, x + 36, y);
    truck.holdPosition = true;
    const hp = truck.hp;
    const { spark, bite } = countFire(state, 40);
    assert.ok(spark > bite, `sparks ${spark} bites ${bite}`);
    assert.ok(bite > 0);
    assert.ok(truck.hp < hp || truck.wreck);
    assert.equal(walker.crits.length, 0);

    destroyEntity(state, truck);
    for (const e of [...state.entities.values()]) {
      if (e.ownerId === "B") destroyEntity(state, e);
    }
    const tiger = makeEntity(state, "warden", "B", x + 40, y, { facing: Math.PI });
    tiger.holdPosition = true;
    tiger.cooldown = 999;
    tiger.ammo = { ap: 0, he: 0, smoke: 0 };
    const plate = tiger.hp;
    ticks(state, 20);
    assert.equal(tiger.hp, plate);
  });

  it("a Gunner's MG42 does not chip a truck's front", () => {
    const state = match();
    const ts = state.tileSize;
    const x = tileCenter(120, ts);
    const y = tileCenter(150, ts);
    const gunner = makeEntity(state, "gunner", "A", x, y);
    const truck = truckEastOf(state, x + 28, y);
    truck.holdPosition = true;
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [gunner.id], targetId: truck.id }).ok, true);
    const hp = truck.hp;
    ticks(state, 40);
    assert.equal(truck.hp, hp);
  });

  it("a Cyborg's gatling and an Apocalypse roof also nick a truck", () => {
    const cyborgState = match();
    const ts = cyborgState.tileSize;
    const x = tileCenter(100, ts);
    const y = tileCenter(120, ts);
    makeEntity(cyborgState, "cyborg", "A", x, y);
    const truck = truckEastOf(cyborgState, x + 36, y);
    truck.holdPosition = true;
    const hp = truck.hp;
    const cyborg = countFire(cyborgState, 40);
    assert.ok(cyborg.spark > cyborg.bite, `cyborg sparks ${cyborg.spark} bites ${cyborg.bite}`);
    assert.ok(cyborg.bite > 0);
    assert.ok(truck.hp < hp || truck.wreck);

    const state = match();
    const tank = makeEntity(state, "apocalypse", "A", x, y);
    tank.holdPosition = true;
    tank.ammo = { ap: 0, he: 0, smoke: 0 };
    tank.cooldown = 999;
    const other = truckEastOf(state, tank.x + 48, tank.y);
    other.holdPosition = true;
    const before = other.hp;
    const roof = countFire(state, 40);
    assert.ok(roof.spark > roof.bite, `roof sparks ${roof.spark} bites ${roof.bite}`);
    assert.ok(roof.bite > 0);
    assert.ok(other.hp < before || other.wreck);
    assert.equal(tank.hp, tank.hpMax);
  });
});
