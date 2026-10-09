import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILD_RADIUS } from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { inBuildRadius } from "./geo.js";
import { createMatch, step } from "./match.js";
import { previewPlace } from "./preview.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

// Alpha and Bravo share team 1; Charlie fights alone on team 2.
function threeWayMatch(): MatchState {
  const r = createRoom({ id: "ALLY", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  assert.equal(joinRoom(room, "C", "Charlie").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1, team: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, team: 1 });
  updateSelf(room, "C", { ready: true, spawnId: 2, team: 2 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Alpha deploys the Rig, so Alpha has a base and the build radius around it. */
function deployAlphaBase(state: MatchState): void {
  const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig");
  assert.ok(rig);
  const res = applyCommand(state, "A", { type: "cmd.deploy", id: rig!.id });
  assert.equal(res.ok, true, res.ok ? "" : res.message);
  for (let i = 0; i < 35; i++) step(state);
  assert.ok([...state.entities.values()].some((e) => e.ownerId === "A" && e.type === "core"));
}

describe("ally build range", () => {
  it("lets a teammate build within range of your base, and keeps a foe out", () => {
    const state = threeWayMatch();
    deployAlphaBase(state);
    const core = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "core")!;
    const tx = core.tileX + core.tileW + 2;
    const ty = core.tileY + 1;
    assert.equal(inBuildRadius(state, "A", tx, ty, 2, 2, BUILD_RADIUS), true, "the owner builds beside the base");
    assert.equal(inBuildRadius(state, "B", tx, ty, 2, 2, BUILD_RADIUS), true, "a teammate builds beside Alpha's base");
    assert.equal(inBuildRadius(state, "C", tx, ty, 2, 2, BUILD_RADIUS), false, "a foe does not");

    const farX = core.tileX + 3 * BUILD_RADIUS;
    assert.equal(inBuildRadius(state, "A", farX, ty, 2, 2, BUILD_RADIUS), false, "precondition: far past the yard");
    assert.equal(inBuildRadius(state, "B", farX, ty, 2, 2, BUILD_RADIUS), false, "far past every base stays out of reach");
  });

  it("shows the same reach in the client ghost for a teammate", () => {
    const state = threeWayMatch();
    deployAlphaBase(state);
    const core = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "core")!;
    const tx = core.tileX + core.tileW + 2;
    const ty = core.tileY + 1;
    const ghostA = previewPlace(snapshotFor(state, "A"), "dynamo", tx, ty);
    assert.equal(ghostA, true, "precondition: the owner's ghost is green here");
    assert.equal(previewPlace(snapshotFor(state, "B"), "dynamo", tx, ty), true, "a teammate's ghost is green too");
    assert.equal(previewPlace(snapshotFor(state, "C"), "dynamo", tx, ty), false, "a foe's ghost stays red");
  });
});
