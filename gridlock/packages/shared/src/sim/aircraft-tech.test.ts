import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { techRequiresOf } from "../catalog.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { techMissing } from "./train.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "AIRT", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

describe("bomber tech", () => {
  it("Stuka and He 111 need Research; the BV 222 needs Research and Radar", () => {
    assert.deepEqual(techRequiresOf("stuka"), ["research"]);
    assert.deepEqual(techRequiresOf("he111"), ["research"]);
    assert.deepEqual(techRequiresOf("bv222"), ["research", "radar"]);
    assert.deepEqual(techRequiresOf("fw190"), []);
  });

  it("unlocks each bomber once its buildings stand", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    for (const unit of ["stuka", "he111", "bv222"] as const) assert.equal(techMissing(state, "A", unit), "research");
    assert.equal(techMissing(state, "A", "fw190"), null);

    makeEntity(state, "research", "A", tileCenter(20, ts), tileCenter(20, ts));
    assert.equal(techMissing(state, "A", "stuka"), null);
    assert.equal(techMissing(state, "A", "he111"), null);
    assert.equal(techMissing(state, "A", "bv222"), "radar");

    // The enemy's radar does not count.
    makeEntity(state, "radar", "B", tileCenter(40, ts), tileCenter(40, ts));
    assert.equal(techMissing(state, "A", "bv222"), "radar");

    makeEntity(state, "radar", "A", tileCenter(26, ts), tileCenter(20, ts));
    assert.equal(techMissing(state, "A", "bv222"), null);
  });
});
