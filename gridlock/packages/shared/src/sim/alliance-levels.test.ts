import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { DYNAMO_LEVEL_POWER, RESEARCH, catalog, levelNameOf, maxLevelOf, nextResearch, powerOfEntity, researchOf, secondsToTicks, TICK_DT } from "../catalog.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { powerOf } from "./power.js";
import type { MatchState } from "./types.js";

/** A and B, both Alliance, no buildings of their own yet. */
function match(): MatchState {
  const r = createRoom({ id: "ALV", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

describe("Alliance levels", () => {
  it("gives the Barracks, the Machine Shop, and the Power Plant two levels each, the second behind a Research Facility", () => {
    for (const [type, ids] of [
      ["muster", ["advancedtraining", "specialforces"]],
      ["armory", ["heavyworks", "prototypeworks"]],
      ["dynamo", ["gasturbines", "fissionreactor"]],
    ] as const) {
      assert.deepEqual(
        researchOf(type).map((r) => r.id),
        ids,
        type,
      );
      assert.equal(maxLevelOf(type), 2);
      assert.equal(nextResearch(type, 0)?.id, ids[0]);
      assert.equal(RESEARCH[ids[0]].requires, undefined);
      assert.deepEqual(RESEARCH[ids[1]].requires, ["research"]);
      assert.ok(RESEARCH[ids[0]].cost > 0 && RESEARCH[ids[1]].cost > RESEARCH[ids[0]].cost, "the Alliance pays scrap");
      assert.equal(levelNameOf(type, 2), RESEARCH[ids[1]].name);
    }
  });

  it("a Power Plant gives more power at each level, and half while it upgrades", () => {
    assert.equal(DYNAMO_LEVEL_POWER[0], catalog("dynamo").power);
    assert.equal(powerOfEntity({ type: "dynamo" }), 100);
    assert.equal(powerOfEntity({ type: "dynamo", level: 1 }), 150);
    assert.equal(powerOfEntity({ type: "dynamo", level: 2 }), 200);
    assert.equal(powerOfEntity({ type: "dynamo", level: 1, research: { id: "fissionreactor" } }), 75);
    // Every other building keeps its catalog figure.
    assert.equal(powerOfEntity({ type: "muster", level: 2 }), catalog("muster").power);
  });

  it("researches Gas Turbines on a plant for scrap, at half power while it runs", () => {
    const state = match();
    const ts = state.tileSize;
    const plant = makeEntity(state, "dynamo", "A", tileCenter(20, ts), tileCenter(10, ts), { tileX: 20, tileY: 10 });
    const before = powerOf(state, "A").provided;
    const p = state.players.get("A")!;
    p.scrap = 5000;
    const r = applyCommand(state, "A", { type: "cmd.research", ids: [plant.id], research: "gasturbines" });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    assert.equal(powerOf(state, "A").provided, before - 50);
    // Fission Reactor is not on offer before Gas Turbines, nor without a Research Facility.
    plant.research = undefined;
    const skip = applyCommand(state, "A", { type: "cmd.research", ids: [plant.id], research: "fissionreactor" });
    assert.equal(skip.ok, false);
    assert.equal(applyCommand(state, "A", { type: "cmd.research", ids: [plant.id], research: "gasturbines" }).ok, true);
    for (let i = 0; i < secondsToTicks(RESEARCH.gasturbines.seconds) * 3 && plant.research; i++) step(state, TICK_DT);
    assert.equal(plant.level, 1);
    assert.equal(powerOf(state, "A").provided, before + 50);
    assert.ok(p.scrap <= 5000 - RESEARCH.gasturbines.cost, "the research took its scrap");
    const locked = applyCommand(state, "A", { type: "cmd.research", ids: [plant.id], research: "fissionreactor" });
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.message, "Needs a Research Facility.");
    makeEntity(state, "research", "A", tileCenter(30, ts), tileCenter(10, ts), { tileX: 30, tileY: 10 });
    assert.equal(applyCommand(state, "A", { type: "cmd.research", ids: [plant.id], research: "fissionreactor" }).ok, true);
  });
});
