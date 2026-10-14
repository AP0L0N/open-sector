import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { CHEAT_ENERGY, CHEAT_POWER, CHEAT_SCRAP } from "../catalog.js";
import { grantCheat } from "./cheat.js";
import { hiveEnergyOf } from "./hive-energy.js";
import { createMatch } from "./match.js";
import { powerOf } from "./power.js";
import type { MatchState } from "./types.js";

/** A is Alliance, B the Xenite. */
function field(): MatchState {
  const r = createRoom({ id: "CHT", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

describe("skirmish cheat", () => {
  it("tops an Alliance side's scrap up and adds power", () => {
    const state = field();
    const before = powerOf(state, "A").provided;
    assert.equal(grantCheat(state, "A"), true);
    assert.equal(state.players.get("A")!.scrap, CHEAT_SCRAP);
    assert.equal(powerOf(state, "A").provided, before + CHEAT_POWER);
    assert.equal(powerOf(state, "B").provided, 0, "the other side is untouched");
  });

  it("gives the Xenite hive energy, not scrap", () => {
    const state = field();
    const scrap = state.players.get("B")!.scrap;
    const before = hiveEnergyOf(state, "B").cap;
    assert.equal(grantCheat(state, "B"), true);
    assert.equal(hiveEnergyOf(state, "B").cap, before + CHEAT_ENERGY);
    assert.equal(state.players.get("B")!.scrap, scrap);
    assert.equal(powerOf(state, "B").provided, 0);
  });

  it("does nothing for a side that is out", () => {
    const state = field();
    state.players.get("A")!.alive = false;
    assert.equal(grantCheat(state, "A"), false);
    assert.equal(state.players.get("A")!.cheat, undefined);
  });
});
