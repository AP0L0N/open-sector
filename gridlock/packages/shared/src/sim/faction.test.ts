import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, hostSlot, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  isNavalType,
  isAircraftType,
  BORG_TYPES,
  FORGE_REARM_SECONDS,
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
  isCivilianType,
  isCyborg,
  secondsToTicks,
  isInfantryType,
  onUplink,
  yardBuildSeconds,
  type Faction,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_SCRAP, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, hasCore, hqOf, makeEntity, tileCenter } from "./geo.js";
import { radarOnline } from "./radar.js";
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

/** The same match on bare, flat ground: no trees, walls, or houses in the line of fire. */
function openField(): MatchState {
  const state = match();
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  state.blocked.fill(0);
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
  return state;
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
      [
        "aerie",
        "assimilator",
        "behemoth",
        "borgdrone",
        "cyborg",
        "cyborgcentral",
        "cyborgcommander",
        "forge",
        "fusionnode",
        "hivecore",
        "juggernaut",
        "lancer",
        "leech",
        "lurker",
        "nexus",
        "pulsespire",
        "ravager",
        "scourge",
        "seed",
        "simunit2",
        "spawnpool",
        "spineturret",
        "stalker",
        "wasp",
      ],
    );
    for (const t of ["rig", "core", "dynamo", "smelter", "rifleman", "ss3", "muster", "sandbags"]) assert.equal(factionOf(t), "eu", t);
    for (const t of BUILDING_TYPES.filter((b) => factionOf(b) === "borg")) assert.ok(BORG_TYPES.has(t));
    // Cyborgs come from the Central, ships from the Spawning Pool, planes from the Aerie, the rest from the Nanite Forge.
    for (const t of TRAIN_TYPES.filter((u) => factionOf(u) === "borg")) {
      const want = isCyborg(t) ? "cyborgcentral" : isNavalType(t) ? "spawnpool" : isAircraftType(t) ? "aerie" : "forge";
      assert.equal(producerType(t), want, t);
    }
    for (const t of ["stalker", "ravager", "behemoth", "juggernaut"] as const) assert.equal(producerType(t), "forge");
    for (const t of ["borgdrone", "lancer"] as const) assert.ok(isCyborg(t) && onUplink(t) && isInfantryType(t), t);
    assert.ok(!onUplink("cyborgcommander"));
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

  it("grows the heavy assimilators at a Nanite Forge, the Behemoth only with a Neural Nexus", () => {
    const state = match();
    unpack(state, "B");
    const ts = state.tileSize;
    state.players.get("B")!.scrap = 50_000;
    const none = applyCommand(state, "B", { type: "cmd.train", unit: "stalker" });
    assert.equal(none.ok, false);
    if (!none.ok) assert.equal(none.message, "Need a Nanite Forge.");
    const forge = makeEntity(state, "forge", "B", tileCenter(40, ts), tileCenter(40, ts), { tileX: 40, tileY: 40 });
    for (const unit of ["stalker", "ravager"] as const) {
      const r = applyCommand(state, "B", { type: "cmd.train", unit });
      assert.equal(r.ok, true, r.ok ? unit : r.message);
    }
    for (const unit of ["behemoth", "juggernaut"] as const) {
      const locked = applyCommand(state, "B", { type: "cmd.train", unit });
      assert.equal(locked.ok, false);
      if (!locked.ok) assert.equal(locked.message, "Need a Neural Nexus.");
    }
    makeEntity(state, "nexus", "B", tileCenter(30, ts), tileCenter(30, ts), { tileX: 30, tileY: 30 });
    assert.equal(applyCommand(state, "B", { type: "cmd.train", unit: "behemoth" }).ok, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.train", unit: "juggernaut" }).ok, true);
    assert.deepEqual(forge.queue.map((j) => j.type), ["stalker", "ravager", "behemoth", "juggernaut"]);
    // Earth United cannot use a captured Forge.
    unpack(state, "A");
    forge.ownerId = "A";
    const eu = applyCommand(state, "A", { type: "cmd.train", unit: "stalker" });
    assert.equal(eu.ok, false);
  });

  it("raises a Pulse Spire only with a Neural Nexus standing", () => {
    const state = match();
    unpack(state, "B");
    const ts = state.tileSize;
    state.players.get("B")!.scrap = 50_000;
    const r = applyCommand(state, "B", { type: "cmd.build", building: "pulsespire" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.message, "Need a Neural Nexus.");
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "spineturret" }).ok, true);
    applyCommand(state, "B", { type: "cmd.cancel", what: "structure", building: "spineturret" });
    makeEntity(state, "nexus", "B", tileCenter(30, ts), tileCenter(30, ts), { tileX: 30, tileY: 30 });
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "pulsespire" }).ok, true);
  });

  it("lights the radar panel with a Neural Nexus", () => {
    const state = match();
    const ts = state.tileSize;
    assert.equal(radarOnline(state, "B"), false);
    makeEntity(state, "nexus", "B", tileCenter(30, ts), tileCenter(30, ts), { tileX: 30, tileY: 30 });
    assert.equal(radarOnline(state, "B"), true);
  });

  it("fires a crewless Spine Turret while power holds, and silences it when power runs short", () => {
    const fight = (powered: boolean): number => {
      const state = openField();
      const ts = state.tileSize;
      if (powered) makeEntity(state, "fusionnode", "B", tileCenter(100, ts), tileCenter(100, ts), { tileX: 100, tileY: 100 });
      makeEntity(state, "spineturret", "B", tileCenter(120, ts), tileCenter(120, ts), { tileX: 120, tileY: 120 });
      const target = makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
      for (let i = 0; i < 60; i++) step(state, TICK_DT);
      return target.hp;
    };
    assert.ok(fight(true) < catalog("rifleman").hp, "a powered turret hits the rifleman");
    assert.equal(fight(false), catalog("rifleman").hp, "an unpowered turret stays silent");
  });

  it("rearms Borg units beside a powered Nanite Forge, and only there", () => {
    const state = openField();
    const ts = state.tileSize;
    makeEntity(state, "fusionnode", "B", tileCenter(100, ts), tileCenter(100, ts), { tileX: 100, tileY: 100 });
    makeEntity(state, "forge", "B", tileCenter(120, ts), tileCenter(120, ts), { tileX: 120, tileY: 120 });
    const near = makeEntity(state, "stalker", "B", tileCenter(126, ts), tileCenter(121, ts));
    const far = makeEntity(state, "stalker", "B", tileCenter(180, ts), tileCenter(160, ts));
    for (const s of [near, far]) s.ammo = { ap: 0, he: 0 };
    for (let i = 0; i < secondsToTicks(FORGE_REARM_SECONDS * 4) + 1; i++) step(state, TICK_DT);
    assert.ok((near.ammo.ap ?? 0) + (near.ammo.he ?? 0) > 0, "the Forge refills the near Stalker");
    assert.equal((far.ammo.ap ?? 0) + (far.ammo.he ?? 0), 0, "the far one waits");
  });

  it("grows ships at a Spawning Pool and planes at an Aerie, which parks them on its pads", () => {
    assert.equal(producerType("leech"), "spawnpool");
    assert.equal(producerType("lurker"), "spawnpool");
    assert.equal(producerType("wasp"), "aerie");
    assert.equal(producerType("scourge"), "aerie");
    assert.equal(producerType("gunboat"), "dock");
    assert.equal(producerType("fw190"), "airfield");
    const state = openField();
    unpack(state, "B");
    const ts = state.tileSize;
    state.players.get("B")!.scrap = 50_000;
    const none = applyCommand(state, "B", { type: "cmd.train", unit: "wasp" });
    assert.equal(none.ok, false);
    if (!none.ok) assert.equal(none.message, "Need an Aerie.");
    makeEntity(state, "fusionnode", "B", tileCenter(100, ts), tileCenter(100, ts), { tileX: 100, tileY: 100 });
    makeEntity(state, "fusionnode", "B", tileCenter(100, ts), tileCenter(110, ts), { tileX: 100, tileY: 110 });
    const aerie = makeEntity(state, "aerie", "B", tileCenter(120, ts), tileCenter(140, ts), { tileX: 120, tileY: 140 });
    assert.equal(applyCommand(state, "B", { type: "cmd.train", unit: "wasp" }).ok, true);
    const locked = applyCommand(state, "B", { type: "cmd.train", unit: "scourge" });
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.message, "Need a Neural Nexus.");
    for (let i = 0; i < secondsToTicks(catalog("wasp").buildSeconds) * 3 && aerie.queue.length > 0; i++) step(state, TICK_DT);
    const wasp = [...state.entities.values()].find((e) => e.type === "wasp");
    assert.ok(wasp, "the Wasp rolls out");
    assert.equal(wasp!.air?.homeId, aerie.id, "homed on its Aerie");
    const ship = applyCommand(state, "B", { type: "cmd.train", unit: "leech" });
    assert.equal(ship.ok, false);
    if (!ship.ok) assert.equal(ship.message, "Need a Spawning Pool.");
  });

  it("flags every Borg shot and hit as energy, and no Earth United one", () => {
    const state = openField();
    const ts = state.tileSize;
    makeEntity(state, "borgdrone", "B", tileCenter(120, ts), tileCenter(120, ts));
    makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
    let borgHit = false;
    let euHit = false;
    for (let i = 0; i < 80; i++) {
      step(state, TICK_DT);
      const snap = snapshotFor(state, "A");
      for (const p of snap.projectiles) assert.equal(p.energy, state.players.get(state.entities.get(p.fromId)?.ownerId ?? "")?.faction === "borg" ? true : undefined);
      for (const hit of snap.impacts) {
        if (hit.ownerId === "B") borgHit ||= hit.energy === true;
        if (hit.ownerId === "A") {
          assert.equal(hit.energy, undefined);
          euHit = true;
        }
      }
    }
    assert.ok(borgHit, "where a Drone's pulse lands is energy");
    assert.ok(euHit, "the rifleman fired too");
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
