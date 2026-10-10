import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  JUGGERNAUT_FIST_PACE_MUL,
  JUGGERNAUT_FIST_SECONDS,
  JUGGERNAUT_HAMMER_SECONDS,
  JUGGERNAUT_RAGE_HP,
  JUGGERNAUT_SPRINT_MUL,
  TICK_DT,
  TILE_SUBDIV,
  catalog,
  isCivilianType,
  meleeOf,
  secondsToTicks,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { moveSpeedMul } from "./crits.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { juggernautBlowSeconds } from "./juggernaut.js";
import { createMatch, step } from "./match.js";
import { reversing } from "./orders.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenomorphs, on bare flat ground, nothing but what a test places. */
function field(): MatchState {
  const r = createRoom({ id: "JUG", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
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
  for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

/** Places a unit at cell (cx, cy): whole cells, TILE_SUBDIV sub-tiles each. */
function at(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, cx: number, cy: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(Math.round(cx * TILE_SUBDIV), ts), tileCenter(Math.round(cy * TILE_SUBDIV), ts));
}

describe("Juggernaut", () => {
  it("is a Xenomorph melee giant from the Forge, plated, not a soldier", () => {
    const def = catalog("juggernaut");
    assert.equal(def.kind, "unit");
    assert.equal(meleeOf("juggernaut"), true);
    assert.ok(def.armorFront > 0 && def.leavesWreck);
  });

  it("turns to face a spot close behind it instead of backing up like a tank", () => {
    const state = field();
    const j = at(state, "juggernaut", "B", 20, 30);
    j.facing = 0;
    const ts = state.tileSize;
    assert.equal(applyCommand(state, "B", { type: "cmd.move", ids: [j.id], x: j.x - 2 * TILE_SUBDIV * ts, y: j.y }).ok, true);
    ticks(state, 2);
    assert.equal(reversing(j), false);
    ticks(state, 10);
    assert.ok(Math.cos(j.facing) < -0.9, `faces west, got ${j.facing}`);
  });

  it("sprints at what it is going for, and walks otherwise", () => {
    const state = field();
    const j = at(state, "juggernaut", "B", 20, 30);
    const foe = at(state, "warden", "A", 32, 30);
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [j.id], targetId: foe.id }).ok, true);
    ticks(state, 2);
    assert.equal(j.sprint, true);
    assert.equal(moveSpeedMul(j), JUGGERNAUT_SPRINT_MUL);
    const x0 = j.x;
    ticks(state, secondsToTicks(1));
    const run = j.x - x0;

    const calm = field();
    const k = at(calm, "juggernaut", "B", 20, 30);
    assert.equal(applyCommand(calm, "B", { type: "cmd.move", ids: [k.id], x: tileCenter(32 * TILE_SUBDIV, calm.tileSize), y: tileCenter(30 * TILE_SUBDIV, calm.tileSize) }).ok, true);
    ticks(calm, 2);
    assert.equal(k.sprint, undefined);
    const k0 = k.x;
    ticks(calm, secondsToTicks(1));
    const walk = k.x - k0;
    assert.ok(run > walk * 1.6, `run=${run} walk=${walk}`);
  });

  it("lands each blow in an area: soldiers die, plate gives, its own side is spared", () => {
    const state = field();
    const j = at(state, "juggernaut", "B", 30, 30);
    // Unarmed enemies, so nothing but the hammer can touch the friend.
    const tank = at(state, "supply", "A", 31.5, 30);
    const men = [at(state, "engineer", "A", 31.5, 30.8), at(state, "medic", "A", 32, 29.6)];
    const friend = at(state, "xenodrone", "B", 31.2, 29.3);
    const friendHp = friend.hp;
    const tankHp = tank.hp;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [j.id], targetId: tank.id }).ok, true);
    ticks(state, secondsToTicks(3));
    assert.ok(tank.hp < tankHp, "the truck's plate gives");
    for (const m of men) assert.ok(m.hp <= 0, "a soldier beside it dies");
    assert.equal(friend.hp, friendHp, "its own Drone is spared");
    assert.equal(j.fists, undefined);
  });

  it("knocks walls out of a building", () => {
    const state = field();
    const ts = state.tileSize;
    const j = at(state, "juggernaut", "B", 26, 30);
    const sx = 29 * TILE_SUBDIV;
    const house = makeEntity(state, "dynamo", "A", tileCenter(sx, ts), tileCenter(sx, ts), { tileX: sx, tileY: 30 * TILE_SUBDIV });
    const hp = house.hp;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [j.id], targetId: house.id }).ok, true);
    ticks(state, secondsToTicks(6));
    assert.ok(house.hp <= hp - 200, `building hp ${house.hp} of ${hp}`);
  });

  it("near death throws the hammer at the strongest enemy in reach, then fights faster with its fists", () => {
    const state = field();
    const j = at(state, "juggernaut", "B", 30, 30);
    const tank = at(state, "warden", "A", 36, 30);
    const man = at(state, "rifleman", "A", 31.5, 31.5);
    const tankHp = tank.hp;
    j.hp = Math.floor(j.hpMax * JUGGERNAUT_RAGE_HP) - 1;
    assert.equal(juggernautBlowSeconds(j), JUGGERNAUT_HAMMER_SECONDS);
    ticks(state, 1);
    assert.equal(j.fists, true);
    const hammer = state.projectiles.find((p) => p.hammer);
    assert.ok(hammer, "the hammer is in the air");
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === j.id)?.fists, true);
    assert.equal(snapshotFor(state, "B").projectiles.find((p) => p.id === hammer.id)?.hammer, true);
    // Thrown at the costlier Tiger, not the nearer rifleman.
    assert.ok(Math.abs((hammer.landX ?? 0) - tank.x) < 1 && Math.abs((hammer.landY ?? 0) - tank.y) < 1);
    ticks(state, secondsToTicks(1.5));
    assert.equal(state.projectiles.some((p) => p.hammer), false);
    assert.ok(tank.hp < tankHp, "the hammer came down on it");
    assert.equal(juggernautBlowSeconds(j), JUGGERNAUT_FIST_SECONDS);
    assert.ok(Math.abs(moveSpeedMul(j) / (j.sprint ? JUGGERNAUT_SPRINT_MUL : 1) - JUGGERNAUT_FIST_PACE_MUL) < 1e-9);
    assert.ok(man.id > 0);
    // It throws only once.
    ticks(state, secondsToTicks(2));
    assert.equal(state.projectiles.some((p) => p.hammer), false);
  });

  it("keeps the hammer when there is nothing in reach to throw it at", () => {
    const state = field();
    const j = at(state, "juggernaut", "B", 30, 30);
    at(state, "warden", "A", 50, 30);
    j.hp = 10;
    ticks(state, 3);
    assert.equal(j.fists, undefined);
    assert.equal(state.projectiles.some((p) => p.hammer), false);
  });
});
