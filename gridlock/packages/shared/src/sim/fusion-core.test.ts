import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { FUSION_CORE_ENERGY, FUSION_NODE_ENERGY, TICK_DT, TITAN_NUKE, catalog, energySupplyOf, nukesOnDeath } from "../catalog.js";
import { buildTechMissing } from "./build.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "FC1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

function put(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

describe("Fusion Core", () => {
  it("takes as long to raise as eight Fusion Nodes and stores 2000 hive energy while it stands", () => {
    assert.equal(catalog("fusioncore").buildSeconds, 8 * catalog("fusionnode").buildSeconds);
    assert.equal(FUSION_CORE_ENERGY, 2000);
    assert.equal(FUSION_CORE_ENERGY, 4 * FUSION_NODE_ENERGY);
    assert.equal(energySupplyOf("fusioncore"), 2000);
    assert.equal(catalog("fusioncore").cost, 0, "the Xenite pay no scrap");
    assert.equal(catalog("fusioncore").energy ?? 0, 0, "it is a supplier, not a drain");
  });

  it("is yard-built only once a Neural Nexus stands", () => {
    const state = twoPlayerMatch();
    assert.deepEqual(buildTechMissing(state, "B", "fusioncore"), ["nexus"]);
    put(state, "nexus", "B", 40, 40);
    assert.deepEqual(buildTechMissing(state, "B", "fusioncore"), []);
  });

  it("is a nuclear death, like the Titan's", () => {
    assert.equal(nukesOnDeath("fusioncore"), true);
    assert.equal(nukesOnDeath("titan"), true);
    assert.equal(nukesOnDeath("nexus"), false);
  });

  it("destroyed, it goes up in the Titan's blast: a soldier at ground zero is gone, the far side is untouched", () => {
    const state = twoPlayerMatch();
    const core = put(state, "fusioncore", "B", 30, 30);
    const close = put(state, "rifleman", "A", 33, 30);
    const far = put(state, "rifleman", "A", 30, 30 + TITAN_NUKE.radiusTiles + 6);
    core.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.entities.has(core.id), false, "nothing is left of the reactor");
    const nuke = state.impacts.find((i) => i.nuke);
    assert.ok(nuke, "the clients get a nuke impact");
    assert.equal(nuke!.x, core.x);
    assert.ok(close.hp <= 0 || !state.entities.has(close.id), "a soldier in the blast is gone");
    assert.equal(far.hp, catalog("rifleman").hp, "past the edge nobody is touched");
  });
});
