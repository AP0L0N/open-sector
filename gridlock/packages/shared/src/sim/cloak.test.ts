import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { STALKER_CLOAK_COOLDOWN_SECONDS, STALKER_CLOAK_SECONDS, TICK_DT, isCivilianType, secondsToTicks } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { canSeeEntity } from "./vision.js";
import type { MatchState } from "./types.js";

/** A is Alliance, B the Xenite, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "CLK", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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

describe("Stalker cloak", () => {
  it("vanishes from the enemy, holds its fire, drops by itself, and waits out its recharge", () => {
    const state = field();
    const ts = state.tileSize;
    const s = makeEntity(state, "stalker", "B", tileCenter(120, ts), tileCenter(120, ts));
    const watcher = makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
    watcher.hp = watcher.hpMax = 100000;
    ticks(state, 2);
    assert.equal(canSeeEntity(state, "A", s), true, "seen before it cloaks");
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === s.id)?.cloakCharge, 1, "ready");
    assert.equal(applyCommand(state, "B", { type: "cmd.cloak", ids: [s.id] }).ok, true);
    ticks(state, 2);
    assert.equal(canSeeEntity(state, "A", s), false, "cloaked");
    assert.equal(snapshotFor(state, "A").entities.some((e) => e.id === s.id), false, "not in the enemy's snapshot");
    const own = snapshotFor(state, "B").entities.find((e) => e.id === s.id);
    assert.equal(own?.cloaked, true, "its owner sees it cloaked");
    assert.equal(own?.cloakCharge, 0);
    const hp = watcher.hp;
    ticks(state, secondsToTicks(STALKER_CLOAK_SECONDS) - 10);
    assert.equal(watcher.hp, hp, "it picks no target of its own while cloaked");
    assert.equal(s.cloaked, true);
    ticks(state, 12);
    assert.equal(s.cloaked, undefined, "the cloak drops by itself");
    assert.equal(canSeeEntity(state, "A", s), true);
    assert.equal(applyCommand(state, "B", { type: "cmd.cloak", ids: [s.id] }).ok, false, "still recharging");
    const charge = snapshotFor(state, "B").entities.find((e) => e.id === s.id)?.cloakCharge ?? 1;
    assert.ok(charge < 0.1, `charge ${charge} just started`);
    ticks(state, secondsToTicks(STALKER_CLOAK_COOLDOWN_SECONDS) + 1);
    assert.equal(applyCommand(state, "B", { type: "cmd.cloak", ids: [s.id] }).ok, true, "ready again");
  });

  it("fires at a target the player names, and that shot drops the cloak", () => {
    const state = field();
    const ts = state.tileSize;
    const s = makeEntity(state, "stalker", "B", tileCenter(120, ts), tileCenter(120, ts));
    const watcher = makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
    watcher.hp = watcher.hpMax = 100000;
    ticks(state, 2);
    assert.equal(applyCommand(state, "B", { type: "cmd.cloak", ids: [s.id] }).ok, true);
    ticks(state, 2);
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [s.id], targetId: watcher.id }).ok, true);
    let n = 0;
    while (s.cloaked && n++ < 200) step(state, TICK_DT);
    assert.equal(s.cloaked, undefined, "the shot gave it away");
    assert.ok((s.cloakReady ?? 0) > state.tick, "and the cloak recharges");
    assert.equal(canSeeEntity(state, "A", s), true);
  });

  it("is the Stalker's alone", () => {
    const state = field();
    const ts = state.tileSize;
    const b = makeEntity(state, "siphon", "B", tileCenter(120, ts), tileCenter(120, ts));
    assert.equal(applyCommand(state, "B", { type: "cmd.cloak", ids: [b.id] }).ok, false);
  });
});
