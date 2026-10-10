import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, hostSlot, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  isNavalType,
  isAircraftType,
  XENO_TYPES,
  XENO_DAMAGE_MUL,
  SHARED_TYPES,
  inFaction,
  BUILDING_TYPES,
  RIFLE,
  airLoadoutOf,
  factionDamage,
  supplyShortOf,
  HQ_OF,
  SCRAP_TILE_YIELD,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  energySupplyOf,
  DEPLOYMENT_LEASH_TILES,
  HIVE_DROP_SECONDS,
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

/** A is Alliance, B picks `bFaction` in the lobby. */
function match(bFaction: Faction = "xeno"): MatchState {
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
  it("gives the Xenomorphs their foot soldiers and their own base, the Conversion Chamber in place of the Central", () => {
    assert.deepEqual(
      [...XENO_TYPES].sort(),
      [
        "aerie",
        "assembler",
        "assimilator",
        "behemoth",
        "conversion",
        "forge",
        "fusionnode",
        "gnat",
        "hivecore",
        "juggernaut",
        "lancer",
        "laserfence",
        "leech",
        "lurker",
        "mawcaster",
        "nexus",
        "overseer",
        "pulsespire",
        "ravager",
        "scourge",
        "seed",
        "shade",
        "simunit2",
        "siphon",
        "spawnpool",
        "spineturret",
        "spitter",
        "stalker",
        "thrall",
        "wasp",
        "weaver",
        "xenodrone",
      ],
    );
    for (const t of ["rig", "core", "dynamo", "smelter", "rifleman", "ss3", "muster", "sandbags", "cyborg", "cyborgcommander"]) assert.equal(factionOf(t), "alliance", t);
    // The Cyborg Central is the Alliance's alone; the Xenomorphs raise their infantry in the Conversion Chamber.
    assert.deepEqual([...SHARED_TYPES], []);
    assert.ok(inFaction("cyborgcentral", "alliance") && !inFaction("cyborgcentral", "xeno"));
    assert.ok(inFaction("conversion", "xeno") && !inFaction("conversion", "alliance") && !inFaction("conversion", "bloom"));
    for (const t of BUILDING_TYPES.filter((b) => factionOf(b) === "xeno")) assert.ok(XENO_TYPES.has(t));
    // Foot soldiers come from the Conversion Chamber, ships from the Spawning Pool, planes from the Aerie, the rest from the Nanite Forge.
    for (const t of TRAIN_TYPES.filter((u) => factionOf(u) === "xeno")) {
      const want = isCyborg(t) ? "conversion" : isNavalType(t) ? "spawnpool" : isAircraftType(t) ? "aerie" : "forge";
      assert.equal(producerType(t), want, t);
    }
    for (const t of ["stalker", "ravager", "behemoth", "juggernaut", "siphon", "assembler", "mawcaster"] as const) assert.equal(producerType(t), "forge");
    for (const t of ["xenodrone", "thrall", "lancer", "spitter", "weaver", "shade"] as const) assert.ok(isCyborg(t) && onUplink(t) && isInfantryType(t), t);
    assert.ok(!onUplink("cyborgcommander"));
  });

  it("names the Xenomorph base and keeps its roles beside the Alliance's", () => {
    assert.equal(catalog("seed").name, "Deployment");
    assert.equal(catalog("hivecore").name, "Hive Core");
    assert.equal(catalog("fusionnode").name, "Fusion Node");
    assert.equal(catalog("assimilator").name, "Assimilator");
    assert.deepEqual(HQ_OF.xeno, { rig: "seed", core: "hivecore" });
    assert.ok(isHqRig("seed") && isHqBuilding("hivecore") && isHq("seed") && isHq("core"));
    assert.ok(isSmelterType("assimilator") && isSmelterType("smelter") && !isSmelterType("dynamo"));
    assert.ok(energySupplyOf("fusionnode") > 0 && catalog("fusionnode").power === 0, "feeds the hive energy, not power");
    assert.equal(catalog("assimilator").tileW, catalog("smelter").tileW);
    assert.equal(yardBuildSeconds("assimilator"), yardBuildSeconds("smelter"));
  });
});

describe("a Xenomorph seat", () => {
  it("starts with a Deployment and sees its faction in the snapshot", () => {
    const state = match();
    assert.equal(hqOf(state, "A")!.type, "rig");
    assert.equal(hqOf(state, "B")!.type, "seed");
    assert.equal(state.players.get("B")!.faction, "xeno");
    const players = snapshotFor(state, "A").players;
    assert.equal(players.find((p) => p.playerId === "B")!.faction, "xeno");
    assert.equal(players.find((p) => p.playerId === "A")!.faction, "alliance");
  });

  it("drops the Hive Core onto the Deployment, whole on landing, and never packs it again", () => {
    const state = match();
    const seed = hqOf(state, "B")!;
    assert.equal(applyCommand(state, "B", { type: "cmd.deploy", id: seed.id }).ok, true);
    const fall = secondsToTicks(HIVE_DROP_SECONDS);
    for (let i = 0; i < fall - 2; i++) step(state, TICK_DT);
    assert.equal(hqOf(state, "B")!.type, "seed", "still falling");
    for (let i = 0; i < 4; i++) step(state, TICK_DT);
    const hive = hqOf(state, "B")!;
    assert.equal(hive.type, "hivecore");
    assert.equal(hive.hp, catalog("hivecore").hp);
    assert.equal(hive.hpMax, catalog("hivecore").hp);
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    const pack = applyCommand(state, "B", { type: "cmd.deploy", id: hive.id });
    assert.equal(pack.ok, false);
    for (let i = 0; i < 200; i++) step(state, TICK_DT);
    assert.equal(hqOf(state, "B")!.type, "hivecore");
  });

  it("creeps the Deployment only inside its leash round the drop zone", () => {
    const state = match();
    const seed = hqOf(state, "B")!;
    const home = { ...seed.anchor! };
    assert.deepEqual(home, { x: seed.x, y: seed.y });
    const leash = DEPLOYMENT_LEASH_TILES * state.tileSize;
    const far = { x: state.width * state.tileSize - home.x, y: state.height * state.tileSize - home.y };
    assert.ok(Math.hypot(far.x - home.x, far.y - home.y) > leash * 1.5);
    assert.equal(applyCommand(state, "B", { type: "cmd.move", ids: [seed.id], x: far.x, y: far.y }).ok, true);
    const order = seed.order;
    assert.equal(order?.kind, "move");
    const gx = order?.kind === "move" ? (order.x ?? NaN) : NaN;
    const gy = order?.kind === "move" ? (order.y ?? NaN) : NaN;
    assert.ok(Math.hypot(gx - home.x, gy - home.y) <= leash + 1);
    seed.x = far.x;
    seed.y = far.y;
    step(state, TICK_DT);
    assert.ok(Math.hypot(seed.x - home.x, seed.y - home.y) <= leash + 1);
    assert.deepEqual(snapshotFor(state, "B").entities.find((e) => e.id === seed.id)!.anchor, home);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === seed.id)?.anchor, undefined);
  });

  it("is out when its Hive Core falls", () => {
    const state = match();
    unpack(state, "B");
    hqOf(state, "B")!.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.players.get("B")!.alive, false);
  });

  it("builds only Xenomorph structures, and Alliance only its own", () => {
    const state = match();
    unpack(state, "A");
    unpack(state, "B");
    state.players.get("A")!.scrap = 50_000;
    state.players.get("B")!.scrap = 50_000;
    const refuse = (pid: string, building: "dynamo" | "fusionnode" | "cyborgcentral" | "conversion" | "muster") => {
      const r = applyCommand(state, pid, { type: "cmd.build", building });
      assert.equal(r.ok, false, `${pid} ${building}`);
      if (!r.ok) assert.equal(r.message, "Not available to your faction.");
    };
    refuse("B", "dynamo");
    refuse("B", "muster");
    refuse("B", "cyborgcentral");
    refuse("A", "conversion");
    const bags = applyCommand(state, "B", { type: "cmd.field", ids: [], structure: "sandbags", x: 100, y: 100, facing: 0 });
    assert.equal(bags.ok, false);
    if (!bags.ok) assert.equal(bags.message, "Not available to your faction.");
    refuse("A", "fusionnode");
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "fusionnode" }).ok, true);
    assert.equal(applyCommand(state, "A", { type: "cmd.build", building: "dynamo" }).ok, true);
  });

  it("trains its foot soldiers at a Conversion Chamber, with no Research Facility", () => {
    const state = match();
    unpack(state, "B");
    const ts = state.tileSize;
    const p = state.players.get("B")!;
    p.scrap = 50_000;
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "conversion" }).ok, true);
    const central = makeEntity(state, "conversion", "B", tileCenter(40, ts), tileCenter(40, ts), { tileX: 40, tileY: 40 });
    for (const unit of ["xenodrone", "simunit2", "lancer"] as const) {
      const r = applyCommand(state, "B", { type: "cmd.train", unit });
      assert.equal(r.ok, true, r.ok ? unit : r.message);
    }
    assert.deepEqual(central.queue.map((j) => j.type), ["xenodrone", "simunit2", "lancer"]);
    const alliance = applyCommand(state, "B", { type: "cmd.train", unit: "cyborg" });
    assert.equal(alliance.ok, false);
    const eu = applyCommand(state, "B", { type: "cmd.train", unit: "rifleman" });
    assert.equal(eu.ok, false);
  });

  it("builds the Alliance a Cyborg Central for its Cyborg and Commander, and no Xenomorph cyborg", () => {
    const state = match();
    unpack(state, "A");
    const ts = state.tileSize;
    state.players.get("A")!.scrap = 50_000;
    assert.equal(applyCommand(state, "A", { type: "cmd.build", building: "cyborgcentral" }).ok, true);
    const central = makeEntity(state, "cyborgcentral", "A", tileCenter(40, ts), tileCenter(40, ts), { tileX: 40, tileY: 40 });
    for (const unit of ["cyborg", "cyborgcommander"] as const) {
      const r = applyCommand(state, "A", { type: "cmd.train", unit });
      assert.equal(r.ok, true, r.ok ? unit : r.message);
    }
    assert.deepEqual(central.queue.map((j) => j.type), ["cyborg", "cyborgcommander"]);
    const r = applyCommand(state, "A", { type: "cmd.train", unit: "xenodrone" });
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
    // Alliance cannot use a captured Forge.
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

  it("fires a crewless Spine Turret while the hive has energy for it, and silences it when the hive runs short", () => {
    const fight = (powered: boolean): number => {
      const state = openField();
      const ts = state.tileSize;
      makeEntity(state, "fusionnode", "B", tileCenter(100, ts), tileCenter(100, ts), { tileX: 100, tileY: 100 });
      // Short: older units already take all 500 of the Fusion Node's energy.
      if (!powered) for (const t of ["behemoth", "behemoth", "lancer", "lancer"] as const) makeEntity(state, t, "B", tileCenter(10, ts), tileCenter(10, ts));
      makeEntity(state, "spineturret", "B", tileCenter(120, ts), tileCenter(120, ts), { tileX: 120, tileY: 120 });
      const target = makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
      for (let i = 0; i < 60; i++) step(state, TICK_DT);
      return target.hp;
    };
    assert.ok(fight(true) < catalog("rifleman").hp, "a powered turret hits the rifleman");
    assert.equal(fight(false), catalog("rifleman").hp, "an unpowered turret stays silent");
  });

  it("never lets a Xenomorph unit run dry, with no Forge, truck, or pad anywhere", () => {
    const state = openField();
    const ts = state.tileSize;
    const stalker = makeEntity(state, "stalker", "B", tileCenter(180, ts), tileCenter(160, ts));
    const ravager = makeEntity(state, "ravager", "B", tileCenter(170, ts), tileCenter(160, ts));
    const cyborg = makeEntity(state, "xenodrone", "B", tileCenter(160, ts), tileCenter(160, ts));
    const scourge = makeEntity(state, "scourge", "B", tileCenter(150, ts), tileCenter(160, ts));
    const tiger = makeEntity(state, "ss3", "A", tileCenter(40, ts), tileCenter(40, ts));
    stalker.ammo = { ap: 0, he: 0 };
    ravager.mgAmmo = 0;
    cyborg.clip = 0;
    scourge.air!.bombs = 0;
    scourge.air!.rounds = 0;
    tiger.ammo = { ap: 0, he: 0 };
    step(state, TICK_DT);
    for (const e of [stalker, ravager, cyborg]) {
      assert.equal(supplyShortOf(e.type, e.ammo, e.mgAmmo, e.clip, e.rockets, e.heavy, e.minePacks), false, e.type);
    }
    assert.deepEqual({ bombs: scourge.air!.bombs, rounds: scourge.air!.rounds }, airLoadoutOf("scourge"), "the Scourge's pod and belts are full");
    assert.equal((tiger.ammo.ap ?? 0) + (tiger.ammo.he ?? 0), 0, "an Alliance rack still waits for a truck");
  });

  it("lands lighter hits from Xenomorph weapons than from the same weapon on Alliance", () => {
    assert.equal(factionDamage("xenodrone", RIFLE.damage), Math.max(1, Math.round(RIFLE.damage * XENO_DAMAGE_MUL)));
    assert.ok(factionDamage("leech", 13) < 13);
    assert.equal(factionDamage("rifleman", RIFLE.damage), RIFLE.damage);
    assert.equal(factionDamage("gunboat", 13), 13);
    const state = openField();
    const ts = state.tileSize;
    const drone = makeEntity(state, "xenodrone", "B", tileCenter(120, ts), tileCenter(120, ts));
    makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(127, ts));
    // A rifle round can land inside the tick it leaves on: catch it as it is laid.
    let shot: number | undefined;
    const push = state.projectiles.push.bind(state.projectiles);
    state.projectiles.push = (...ps) => {
      for (const p of ps) if (p.fromId === drone.id) shot ??= p.damage;
      return push(...ps);
    };
    for (let i = 0; i < 200 && shot == null; i++) step(state, TICK_DT);
    assert.equal(shot, factionDamage("xenodrone", RIFLE.damage), "the drone's round leaves at the Xenomorph damage");
  });

  it("grows ships at a Spawning Pool and fliers at an Aerie, which lift straight out of it", () => {
    assert.equal(producerType("leech"), "spawnpool");
    assert.equal(producerType("lurker"), "spawnpool");
    assert.equal(producerType("wasp"), "aerie");
    assert.equal(producerType("scourge"), "aerie");
    assert.equal(producerType("overseer"), "aerie");
    assert.equal(producerType("gnat"), "aerie");
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
    assert.ok(wasp, "the Wasp is grown");
    assert.equal(wasp!.air?.homeId, null, "no nest to go home to");
    assert.notEqual(wasp!.air?.phase, "parked", "it lifts off at once");
    const ship = applyCommand(state, "B", { type: "cmd.train", unit: "leech" });
    assert.equal(ship.ok, false);
    if (!ship.ok) assert.equal(ship.message, "Need a Spawning Pool.");
  });

  it("flags every Xenomorph shot and hit as energy, and no Alliance one", () => {
    const state = openField();
    const ts = state.tileSize;
    makeEntity(state, "xenodrone", "B", tileCenter(120, ts), tileCenter(120, ts));
    makeEntity(state, "rifleman", "A", tileCenter(120, ts), tileCenter(128, ts));
    let xenoHit = false;
    let euHit = false;
    for (let i = 0; i < 80; i++) {
      step(state, TICK_DT);
      const snap = snapshotFor(state, "A");
      for (const p of snap.projectiles) assert.equal(p.energy, state.players.get(state.entities.get(p.fromId)?.ownerId ?? "")?.faction === "xeno" ? true : undefined);
      for (const hit of snap.impacts) {
        if (hit.ownerId === "B") xenoHit ||= hit.energy === true;
        if (hit.ownerId === "A") {
          assert.equal(hit.energy, undefined);
          euHit = true;
        }
      }
    }
    assert.ok(xenoHit, "where a Drone's pulse lands is energy");
    assert.ok(euHit, "the rifleman fired too");
  });

  it("lets the host seat a Xenomorph CPU, and refuses an unknown faction", () => {
    const r = createRoom({ id: "FX2", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
    if (!r.ok) throw new Error(r.message);
    const room = r.value;
    assert.equal(hostSlot(room, "A", 1, { status: "ai", ai: "defensive", faction: "xeno" }).ok, true);
    assert.equal(room.slots[1]!.faction, "xeno");
    assert.equal(hostSlot(room, "A", 1, { faction: "nope" as Faction }).ok, false);
  });
});
