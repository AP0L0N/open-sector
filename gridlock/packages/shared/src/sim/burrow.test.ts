import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { STALKER_BURROW_SECONDS, STALKER_UNBURROW_SECONDS, TICK_DT, isCivilianType, secondsToTicks } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { canSeeEntity } from "./vision.js";
import type { MatchState } from "./types.js";

/** A is Earth United, B the Borg, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "BRW", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "borg" });
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

describe("Stalker burrow", () => {
  it("digs in, vanishes from the enemy, holds still and silent, and rises firing", () => {
    const state = field();
    const ts = state.tileSize;
    const s = makeEntity(state, "stalker", "B", tileCenter(120, ts), tileCenter(120, ts));
    const watcher = makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
    ticks(state, 2);
    assert.equal(canSeeEntity(state, "A", s), true, "seen on its legs");
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [s.id], on: true }).ok, true);
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
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [s.id], on: false }).ok, true);
    ticks(state, secondsToTicks(STALKER_UNBURROW_SECONDS) + 1);
    assert.equal(s.burrow, undefined, "back on its legs");
    assert.equal(canSeeEntity(state, "A", s), true);
  });

  it("is the Stalker's alone", () => {
    const state = field();
    const ts = state.tileSize;
    const b = makeEntity(state, "behemoth", "B", tileCenter(120, ts), tileCenter(120, ts));
    assert.equal(applyCommand(state, "B", { type: "cmd.burrow", ids: [b.id], on: true }).ok, false);
  });
});
