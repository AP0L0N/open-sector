import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { STRUCTURE_QUEUE_CAP, TICK_DT, TILE_SUBDIV, isCivilianType } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, hasCore, hqOf } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState, SimPlayer } from "./types.js";

/** A is Alliance, B the Xenite, on bare flat ground with B's Seed unpacked into a Hive Core. */
function field(): MatchState {
  const r = createRoom({ id: "FNQ", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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
  applyCommand(state, "B", { type: "cmd.deploy", id: hqOf(state, "B")!.id });
  for (let i = 0; i < 80 && !hasCore(state, "B"); i++) step(state, TICK_DT);
  assert.ok(hasCore(state, "B"), "the Hive Core stands");
  return state;
}

function hive(state: MatchState): SimPlayer {
  return state.players.get("B")!;
}

/** Finish the yard job and place it on the first open ground near the Hive Core. */
function finishAndPlace(state: MatchState): void {
  const p = hive(state);
  const job = p.structure!;
  job.progressTicks = job.totalTicks - 1;
  for (let i = 0; i < 40 && !p.structure?.ready; i++) step(state, TICK_DT);
  assert.equal(p.structure?.ready, true, "the node is ready");
  const core = hqOf(state, "B")!;
  const cx = Math.floor(core.tileX / TILE_SUBDIV) * TILE_SUBDIV;
  const cy = Math.floor(core.tileY / TILE_SUBDIV) * TILE_SUBDIV;
  for (let r = 4; r < 40; r += 2) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
      if (applyCommand(state, "B", { type: "cmd.place", building: "fusionnode", tx: cx + dx!, ty: cy + dy! }).ok) return;
    }
  }
  assert.fail("no ground for the node");
}

describe("Fusion Node queue", () => {
  it("queues more Fusion Nodes only while one is building", () => {
    const state = field();
    const p = hive(state);
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" }).ok, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" }).ok, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" }).ok, true);
    assert.equal(p.structure?.type, "fusionnode");
    assert.equal(p.structure?.queued, 2);
    assert.equal(snapshotFor(state, "B").you.structureQueue?.queued, 2);
    // Another structure still waits for the lane.
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "conversion" }).ok, false);
    // A ready node takes no more behind it.
    p.structure!.queued = 0;
    p.structure!.ready = true;
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" }).ok, false);
  });

  it("stops at the queue cap", () => {
    const state = field();
    applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" });
    for (let i = 0; i < STRUCTURE_QUEUE_CAP; i++) {
      assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" }).ok, true);
    }
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" }).ok, false);
    assert.equal(hive(state).structure?.queued, STRUCTURE_QUEUE_CAP);
  });

  it("starts the next node only once the last is placed", () => {
    const state = field();
    const p = hive(state);
    applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" });
    applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" });
    applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" });
    finishAndPlace(state);
    assert.equal(p.structure?.type, "fusionnode");
    assert.equal(p.structure?.ready, false);
    assert.equal(p.structure?.progressTicks, 0);
    assert.equal(p.structure?.queued, 1);
    finishAndPlace(state);
    assert.equal(p.structure?.queued, undefined);
    finishAndPlace(state);
    assert.equal(p.structure, null);
  });

  it("cancel takes the queued nodes first, then the one in the yard", () => {
    const state = field();
    const p = hive(state);
    applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" });
    applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" });
    applyCommand(state, "B", { type: "cmd.pause", what: "structure", paused: true, building: "fusionnode" });
    assert.equal(p.structure?.paused, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.cancel", what: "structure", building: "fusionnode" }).ok, true);
    assert.equal(p.structure?.type, "fusionnode", "the node in the yard stays");
    assert.equal(p.structure?.queued, undefined);
    assert.equal(p.structure?.paused, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.cancel", what: "structure", building: "fusionnode" }).ok, true);
    assert.equal(p.structure, null);
  });
});
