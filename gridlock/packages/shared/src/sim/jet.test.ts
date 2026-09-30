import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  ASSAULT,
  HANDGUN,
  JET_ALT,
  JET_FUEL_SECONDS,
  JET_LAND_RESERVE,
  JET_REFUEL_DELAY,
  JET_TAKEOFF_MIN_SECONDS,
  TECH_REQUIRES,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  infantryLoadout,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter, walkable, worldToTile } from "./geo.js";
import { reachesJet } from "./jet.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "JET1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
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

function put(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

function takeOff(state: MatchState, e: Entity): void {
  const res = applyCommand(state, e.ownerId, { type: "cmd.jet", ids: [e.id], action: "up" });
  assert.equal(res.ok, true, res.ok ? "" : res.message);
}

describe("Jump Jet", () => {
  it("is trained at the Muster behind Research, carries an assault rifle and a handgun", () => {
    assert.ok(TRAIN_TYPES.includes("jumpjet"));
    assert.equal(producerType("jumpjet"), "muster");
    assert.equal(TECH_REQUIRES.jumpjet, "research");
    assert.deepEqual(infantryLoadout("jumpjet"), [ASSAULT, HANDGUN]);
    assert.equal(catalog("jumpjet").name, "Jump Jet");
  });

  it("climbs to flying height on take-off and burns fuel while up", () => {
    const state = twoPlayerMatch();
    const j = put(state, "jumpjet", "A", 10, 30);
    assert.equal(j.jet!.fuel, JET_FUEL_SECONDS);
    takeOff(state, j);
    ticks(state, 20);
    assert.equal(j.jet!.alt, JET_ALT);
    assert.ok(isAirborne(j));
    assert.ok(j.jet!.fuel < JET_FUEL_SECONDS - 1.5);
  });

  it("lands by himself on a low pack, then refuels only after a pause", () => {
    const state = twoPlayerMatch();
    const j = put(state, "jumpjet", "A", 10, 30);
    takeOff(state, j);
    const n = until(state, 400, () => j.jet!.alt === 0 && !j.jet!.up && state.tick > 5);
    assert.ok(n >= 0, "he should come down");
    assert.ok(j.jet!.fuel <= JET_LAND_RESERVE + 0.01);
    const low = j.jet!.fuel;
    ticks(state, Math.floor((JET_REFUEL_DELAY - 1) / TICK_DT));
    assert.equal(j.jet!.fuel, low, "no refill during the pause");
    ticks(state, 40);
    assert.ok(j.jet!.fuel > low, "the pack refills after the pause");
  });

  it("refuses to take off on a nearly empty pack", () => {
    const state = twoPlayerMatch();
    const j = put(state, "jumpjet", "A", 10, 30);
    j.jet!.fuel = JET_TAKEOFF_MIN_SECONDS - 1;
    const res = applyCommand(state, "A", { type: "cmd.jet", ids: [j.id], action: "up" });
    assert.equal(res.ok, false);
    assert.equal(j.jet!.up, false);
  });

  it("flies a straight line to the goal, faster than he walks", () => {
    const state = twoPlayerMatch();
    const walker = put(state, "jumpjet", "A", 10, 30);
    const flier = put(state, "jumpjet", "A", 10, 34);
    takeOff(state, flier);
    ticks(state, 5);
    const goal = tileCenter(40, state.tileSize);
    applyCommand(state, "A", { type: "cmd.move", ids: [walker.id], x: goal, y: walker.y });
    applyCommand(state, "A", { type: "cmd.move", ids: [flier.id], x: goal, y: flier.y });
    ticks(state, 30);
    assert.ok(flier.x - tileCenter(10, state.tileSize) > walker.x - tileCenter(10, state.tileSize));
    assert.ok(Math.abs(flier.y - tileCenter(34, state.tileSize)) < 1, "no detour in the air");
  });

  it("lands off a building roof onto open ground", () => {
    const state = twoPlayerMatch();
    const house = put(state, "dynamo", "A", 30, 30);
    const j = put(state, "jumpjet", "A", 26, 30);
    takeOff(state, j);
    ticks(state, 5);
    // Hang him over the middle of the building, then set down.
    j.x = house.x;
    j.y = house.y;
    j.waypoints = [];
    j.order = null;
    applyCommand(state, "A", { type: "cmd.jet", ids: [j.id], action: "land" });
    const n = until(state, 200, () => j.jet!.alt === 0);
    assert.ok(n >= 0, "he should land");
    const tx = worldToTile(j.x, state.tileSize);
    const ty = worldToTile(j.y, state.tileSize);
    assert.ok(walkable(state, tx, ty, "jumpjet"), "he set down on open ground");
  });

  it("in the air only anti-air weapons reach him", () => {
    const state = twoPlayerMatch();
    const rifle = put(state, "rifleman", "B", 0, 0);
    const gunner = put(state, "gunner", "B", 0, 1);
    const tank = put(state, "warden", "B", 0, 2);
    assert.equal(reachesJet(rifle), false);
    assert.equal(reachesJet(tank), false);
    assert.equal(reachesJet(gunner), true);
    assert.equal(reachesJet(put(state, "walker", "B", 0, 3)), true);
    assert.equal(reachesJet(put(state, "cyborg", "B", 0, 4)), true);
  });

  it("a rifleman cannot touch him up there while his bursts come down on the rifleman", () => {
    const state = twoPlayerMatch();
    const j = put(state, "jumpjet", "A", 20, 30);
    takeOff(state, j);
    ticks(state, 10);
    const rifle = put(state, "rifleman", "B", 24, 30);
    rifle.stanceOrder = "crawl";
    // Small-arms rounds live less than a tick; catch them as they leave the muzzle.
    let plunging = false;
    for (let i = 0; i < 60; i++) {
      const list = state.projectiles;
      list.push = (...ps: Projectile[]) => {
        if (ps.some((p) => p.fromId === j.id && p.plunging)) plunging = true;
        return Array.prototype.push.apply(list, ps);
      };
      step(state, TICK_DT);
    }
    assert.equal(j.hp, catalog("jumpjet").hp, "rifle fire should not reach him");
    assert.notEqual(rifle.attackTarget, j.id);
    assert.ok(plunging, "his rounds are fired down from the air");
    assert.ok(rifle.hp < catalog("rifleman").hp, "a prone man still takes hits from overhead");
  });

  it("an MG42 brings him down out of the air", () => {
    const state = twoPlayerMatch();
    const j = put(state, "jumpjet", "A", 20, 30);
    takeOff(state, j);
    ticks(state, 10);
    j.jet!.fuel = JET_FUEL_SECONDS * 10;
    // Past the assault rifle's reach, inside the MG42's.
    put(state, "gunner", "B", 20 + 36, 30).stanceOrder = "crawl";
    const n = until(state, 600, () => j.hp < catalog("jumpjet").hp);
    assert.ok(n >= 0, "the MG42 should hit him");
  });

  it("on the ground he is an ordinary target for a rifle", () => {
    const state = twoPlayerMatch();
    const j = put(state, "jumpjet", "A", 20, 30);
    put(state, "rifleman", "B", 24, 30);
    const n = until(state, 300, () => j.hp < catalog("jumpjet").hp);
    assert.ok(n >= 0);
  });

  it("shows his height to everyone but his fuel only to his own side", () => {
    const state = twoPlayerMatch();
    const j = put(state, "jumpjet", "A", 20, 30);
    put(state, "rifleman", "B", 22, 30);
    takeOff(state, j);
    ticks(state, 5);
    const own = snapshotFor(state, "A").entities.find((e) => e.id === j.id)!;
    assert.ok(own.jet && own.jet.alt > 0 && own.jet.fuel != null && own.jet.up);
    const foe = snapshotFor(state, "B").entities.find((e) => e.id === j.id);
    assert.ok(foe?.jet);
    assert.ok(foe.jet.alt > 0);
    assert.equal(foe.jet.fuel, undefined);
    assert.equal(foe.jet.up, undefined);
  });
});
