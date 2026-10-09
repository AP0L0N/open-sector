import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, hostSlot, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BORG_TYPES,
  BUILDING_TYPES,
  HQ_OF,
  SCRAP_TILE_YIELD,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  factionOf,
  isHq,
  isHqBuilding,
  isHqRig,
  isSmelterType,
  yardBuildSeconds,
  type Faction,
} from "../catalog.js";
import { TILE_SCRAP } from "../maps.js";
import { applyCommand } from "./commands.js";
import { hasCore, hqOf, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { smelterCount, smelterIncome, smelterYields } from "./smelter.js";
import { producerType } from "./train.js";
import type { MatchState } from "./types.js";

/** A is Earth United, B picks `bFaction` in the lobby. */
function match(bFaction: Faction = "borg"): MatchState {
  const r = createRoom({ id: "FX1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: bFaction });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

function unpack(state: MatchState, pid: string): void {
  const rig = hqOf(state, pid)!;
  applyCommand(state, pid, { type: "cmd.deploy", id: rig.id });
  for (let i = 0; i < 60; i++) {
    step(state, TICK_DT);
    if (hasCore(state, pid)) return;
  }
  throw new Error("never unpacked");
}

describe("factions in the catalog", () => {
  it("gives the Borg the cyborgs, their Central, and their own base", () => {
    assert.deepEqual(
      [...BORG_TYPES].sort(),
      ["assimilator", "cyborg", "cyborgcentral", "cyborgcommander", "fusionnode", "hivecore", "seed", "simunit2"],
    );
    for (const t of ["rig", "core", "dynamo", "smelter", "rifleman", "ss3", "muster", "sandbags"]) assert.equal(factionOf(t), "eu", t);
    for (const t of BUILDING_TYPES.filter((b) => factionOf(b) === "borg")) assert.ok(BORG_TYPES.has(t));
    for (const t of TRAIN_TYPES.filter((u) => factionOf(u) === "borg")) assert.equal(producerType(t), "cyborgcentral", t);
  });

  it("names the Borg base and keeps its roles beside Earth United's", () => {
    assert.equal(catalog("seed").name, "Seed");
    assert.equal(catalog("hivecore").name, "Hive Core");
    assert.equal(catalog("fusionnode").name, "Fusion Node");
    assert.equal(catalog("assimilator").name, "Assimilator");
    assert.deepEqual(HQ_OF.borg, { rig: "seed", core: "hivecore" });
    assert.ok(isHqRig("seed") && isHqBuilding("hivecore") && isHq("seed") && isHq("core"));
    assert.ok(isSmelterType("assimilator") && isSmelterType("smelter") && !isSmelterType("dynamo"));
    assert.ok(catalog("fusionnode").power > 0);
    assert.equal(catalog("assimilator").tileW, catalog("smelter").tileW);
    assert.equal(yardBuildSeconds("assimilator"), yardBuildSeconds("smelter"));
  });
});

describe("a Borg seat", () => {
  it("starts with a Seed and sees its faction in the snapshot", () => {
    const state = match();
    assert.equal(hqOf(state, "A")!.type, "rig");
    assert.equal(hqOf(state, "B")!.type, "seed");
    assert.equal(state.players.get("B")!.faction, "borg");
    const players = snapshotFor(state, "A").players;
    assert.equal(players.find((p) => p.playerId === "B")!.faction, "borg");
    assert.equal(players.find((p) => p.playerId === "A")!.faction, "eu");
  });

  it("grows the Seed into a Hive Core and packs it back into a Seed", () => {
    const state = match();
    unpack(state, "B");
    const hive = hqOf(state, "B")!;
    assert.equal(hive.type, "hivecore");
    assert.equal(hive.hpMax, catalog("hivecore").hp);
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.equal(applyCommand(state, "B", { type: "cmd.deploy", id: hive.id }).ok, true);
    for (let i = 0; i < 200 && hqOf(state, "B")!.type !== "seed"; i++) step(state, TICK_DT);
    assert.equal(hqOf(state, "B")!.type, "seed");
  });

  it("is out when its Hive Core falls", () => {
    const state = match();
    unpack(state, "B");
    hqOf(state, "B")!.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.players.get("B")!.alive, false);
  });

  it("builds only Borg structures, and Earth United only its own", () => {
    const state = match();
    unpack(state, "A");
    unpack(state, "B");
    state.players.get("A")!.scrap = 50_000;
    state.players.get("B")!.scrap = 50_000;
    const refuse = (pid: string, building: "dynamo" | "fusionnode" | "cyborgcentral" | "muster") => {
      const r = applyCommand(state, pid, { type: "cmd.build", building });
      assert.equal(r.ok, false, `${pid} ${building}`);
      if (!r.ok) assert.equal(r.message, "Not available to your faction.");
    };
    refuse("B", "dynamo");
    refuse("B", "muster");
    const bags = applyCommand(state, "B", { type: "cmd.field", ids: [], structure: "sandbags", x: 100, y: 100, facing: 0 });
    assert.equal(bags.ok, false);
    if (!bags.ok) assert.equal(bags.message, "Not available to your faction.");
    refuse("A", "fusionnode");
    refuse("A", "cyborgcentral");
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" }).ok, true);
    assert.equal(applyCommand(state, "A", { type: "cmd.build", building: "dynamo" }).ok, true);
  });

  it("trains all three cyborgs at a Cyborg Central, with no Research Facility", () => {
    const state = match();
    unpack(state, "B");
    const ts = state.tileSize;
    const p = state.players.get("B")!;
    p.scrap = 50_000;
    const central = makeEntity(state, "cyborgcentral", "B", tileCenter(40, ts), tileCenter(40, ts), { tileX: 40, tileY: 40 });
    for (const unit of ["cyborg", "simunit2", "cyborgcommander"] as const) {
      const r = applyCommand(state, "B", { type: "cmd.train", unit });
      assert.equal(r.ok, true, r.ok ? unit : r.message);
    }
    assert.deepEqual(central.queue.map((j) => j.type), ["cyborg", "simunit2", "cyborgcommander"]);
    const eu = applyCommand(state, "B", { type: "cmd.train", unit: "rifleman" });
    assert.equal(eu.ok, false);
  });

  it("keeps Earth United from training a cyborg even with a captured Central", () => {
    const state = match();
    unpack(state, "A");
    const ts = state.tileSize;
    makeEntity(state, "cyborgcentral", "A", tileCenter(40, ts), tileCenter(40, ts), { tileX: 40, tileY: 40 });
    const r = applyCommand(state, "A", { type: "cmd.train", unit: "cyborg" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.message, "Not available to your faction.");
  });

  it("melts scrap with an Assimilator as a Smelter does", () => {
    const state = match();
    const ts = state.tileSize;
    const tx = 30;
    const ty = 30;
    for (let y = ty; y < ty + 3; y++) {
      for (let x = tx; x < tx + 3; x++) {
        const i = y * state.width + x;
        state.scrapYield[i] = SCRAP_TILE_YIELD;
        state.terrain[i] = TILE_SCRAP;
        state.blocked[i] = 0;
      }
    }
    const a = makeEntity(state, "assimilator", "B", tileCenter(tx + 1, ts), tileCenter(ty + 1, ts), { tileX: tx, tileY: ty });
    assert.equal(smelterYields(state, a), true);
    assert.equal(smelterCount(state, "B"), 1);
    assert.ok(smelterIncome(state, "B") > 0);
  });

  it("lets the host seat a Borg CPU, and refuses an unknown faction", () => {
    const r = createRoom({ id: "FX2", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
    if (!r.ok) throw new Error(r.message);
    const room = r.value;
    assert.equal(hostSlot(room, "A", 1, { status: "ai", ai: "defensive", faction: "borg" }).ok, true);
    assert.equal(room.slots[1]!.faction, "borg");
    assert.equal(hostSlot(room, "A", 1, { faction: "nope" as Faction }).ok, false);
  });
});
