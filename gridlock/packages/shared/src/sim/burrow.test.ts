import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { SIPHON_BURROW_HP, SIPHON_BURROW_SECONDS, SIPHON_UNBURROW_SECONDS, STALKER_BURROW_SECONDS, STALKER_UNBURROW_SECONDS, TICK_DT, isCivilianType, secondsToTicks } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { canSeeEntity } from "./vision.js";
import type { MatchState } from "./types.js";

/** A is Alliance, B the Xenite, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "BRW", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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

describe("Bile Worm burrow", () => {
  it("digs in, vanishes from the enemy, holds still and silent, and rises firing", () => {
    const state = field();
    const ts = state.tileSize;
    const s = makeEntity(state, "bileworm", "B", tileCenter(120, ts), tileCenter(120, ts));
    const watcher = makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
    ticks(state, 2);
    assert.equal(canSeeEntity(state, "A", s), true, "seen on its legs");
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [s.id], on: true }).ok, true, "burrow order taken");
    ticks(state, 2);
    assert.equal(s.burrow?.phase, "digging");
    assert.equal(canSeeEntity(state, "A", s), true, "digging in plain sight");
    ticks(state, secondsToTicks(STALKER_BURROW_SECONDS));
    assert.equal(s.burrow?.phase, "down");
    assert.equal(canSeeEntity(state, "A", s), false, "under the ground");
    assert.equal(snapshotFor(state, "A").entities.some((e) => e.id === s.id), false, "not in the enemy's snapshot");
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === s.id)?.burrow, "down", "its owner still sees it");
    // Ordered to move while down, it stays put; the rifleman next to it lives.
    const at = { x: s.x, y: s.y };
    applyCommand(state, "B", { type: "cmd.move", ids: [s.id], x: s.x + 20 * ts, y: s.y });
    ticks(state, 20);
    assert.deepEqual({ x: s.x, y: s.y }, at);
    assert.equal(watcher.hp, watcher.hpMax);
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [s.id], on: false }).ok, true, "rise order taken");
    ticks(state, 1);
    assert.equal(canSeeEntity(state, "A", s), true, "rising in plain sight");
    ticks(state, secondsToTicks(STALKER_UNBURROW_SECONDS));
    assert.equal(s.burrow, undefined, "back on its legs");
  });

  it("is not the Stalker's any more, nor a Behemoth's", () => {
    const state = field();
    const ts = state.tileSize;
    const b = makeEntity(state, "behemoth", "B", tileCenter(120, ts), tileCenter(120, ts));
    const s = makeEntity(state, "stalker", "B", tileCenter(124, ts), tileCenter(120, ts));
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [b.id, s.id], on: true }).ok, false);
  });
});

describe("Siphon half burrow", () => {
  it("sinks half way in plain sight, takes five times the beating, holds still, and comes back to its own hit points", () => {
    const state = field();
    const ts = state.tileSize;
    const s = makeEntity(state, "siphon", "B", tileCenter(120, ts), tileCenter(120, ts));
    makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
    ticks(state, 2);
    const max = s.hpMax;
    const cover = s.coverBonus;
    s.hp = Math.round(max / 2);
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [s.id], on: true }).ok, true);
    ticks(state, secondsToTicks(SIPHON_BURROW_SECONDS) + 1);
    assert.equal(s.burrow?.phase, "down");
    assert.equal(canSeeEntity(state, "A", s), true, "its back sticks out of the dirt");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === s.id)?.burrow, "down", "the enemy sees it dug in");
    assert.equal(s.hpMax, (max - cover) * SIPHON_BURROW_HP + cover, "five times the hit points");
    const share = s.hp / s.hpMax;
    assert.ok(Math.abs(share - Math.round(max / 2) / max) < 0.02, "same share of the bar");
    const at = { x: s.x, y: s.y };
    applyCommand(state, "B", { type: "cmd.move", ids: [s.id], x: s.x + 20 * ts, y: s.y });
    ticks(state, 20);
    assert.deepEqual({ x: s.x, y: s.y }, at, "dug in, it does not walk");
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [s.id], on: false }).ok, true);
    assert.equal(s.hpMax, max, "it gives the extra back as it starts to rise");
    ticks(state, secondsToTicks(SIPHON_UNBURROW_SECONDS) + 1);
    assert.equal(s.burrow, undefined, "back on its legs");
    applyCommand(state, "B", { type: "cmd.move", ids: [s.id], x: s.x + 6 * ts, y: s.y });
    ticks(state, 20);
    assert.notDeepEqual({ x: s.x, y: s.y }, at, "and walks again");
  });
});
