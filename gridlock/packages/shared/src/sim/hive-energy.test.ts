import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  FUSION_NODE_ENERGY,
  HIVE_CORE_ENERGY,
  HIVE_SHORT_SPEED,
  HIVE_SWITCH_SECONDS,
  LASER_FENCE_ENERGY_PER_CELL,
  TICK_DT,
  TILE_SUBDIV,
  catalog,
  energyOf,
  inFaction,
  isCivilianType,
  secondsToTicks,
  type EntityType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { lowPowerSight, sightTilesForEntity } from "./elevation.js";
import { destroyEntity, hasCore, hqOf, makeEntity, tileCenter } from "./geo.js";
import { fenceEnergyToAdd, hiveEnergyOf, hiveSpeed, jobSpeed } from "./hive-energy.js";
import { liveFenceLinks } from "./laser-fence.js";
import { createMatch, step } from "./match.js";
import { powerOf } from "./power.js";
import { radarOnline } from "./radar.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenite, on bare flat ground with B's Seed unpacked into a Hive Core. */
function field(): MatchState {
  const r = createRoom({ id: "HEN", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

/** `type` for B at cell (cx, cy), standing still. */
function at(state: MatchState, type: EntityType, cx: number, cy: number, owner = "B"): Entity {
  const ts = state.tileSize;
  const tx = Math.round(cx * TILE_SUBDIV);
  const ty = Math.round(cy * TILE_SUBDIV);
  const e = makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
  e.holdPosition = true;
  return e;
}

describe("hive energy", () => {
  it("holds the Hive Core's 200 once it stands, and 500 more for each Fusion Node", () => {
    const state = field();
    assert.deepEqual(snapshotFor(state, "B").you.energy, { cap: HIVE_CORE_ENERGY, used: 0, offline: 0 });
    assert.equal(snapshotFor(state, "A").you.energy, undefined, "the Alliance pays scrap");
    at(state, "fusionnode", 40, 40);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + FUSION_NODE_ENERGY);
  });

  it("draws no power and builds no Assimilator", () => {
    const state = field();
    at(state, "forge", 30, 30);
    at(state, "conversion", 34, 30);
    assert.deepEqual(powerOf(state, "B"), { provided: 0, used: 0, lowPower: false });
    assert.equal(inFaction("assimilator", "xeno"), false);
    assert.equal(inFaction("fusionnode", "xeno"), true);
  });

  it("counts down from the full store: base structures, units, and defences each take their share", () => {
    const state = field();
    at(state, "fusionnode", 40, 40);
    at(state, "forge", 30, 30);
    at(state, "conversion", 34, 30);
    at(state, "lancer", 20, 20);
    const want = energyOf("forge") + energyOf("conversion") + energyOf("lancer");
    assert.ok(energyOf("forge") > 0 && energyOf("conversion") > 0 && energyOf("nexus") > 0 && energyOf("aerie") > 0 && energyOf("spawnpool") > 0);
    assert.equal(energyOf("hivecore"), 0);
    assert.equal(energyOf("fusionnode"), 0);
    ticks(state, 1);
    assert.deepEqual(snapshotFor(state, "B").you.energy, { cap: 700, used: want, offline: 0 });
  });

  it("never refuses or waits on energy: it builds and trains below zero, and pays no scrap", () => {
    const state = field();
    at(state, "conversion", 30, 30);
    const scrap = state.players.get("B")!.scrap;
    // 60 left after the Chamber: five Lancers (50 each) take the hive below zero, and all five come out.
    for (let i = 0; i < 5; i++) assert.equal(applyCommand(state, "B", { type: "cmd.train", unit: "lancer" }).ok, true);
    ticks(state, 8 * Math.ceil(catalog("lancer").buildSeconds / TICK_DT));
    const lancers = [...state.entities.values()].filter((e) => e.type === "lancer" && e.ownerId === "B");
    assert.equal(lancers.length, 5);
    assert.equal(state.players.get("B")!.scrap, scrap, "no scrap spent");
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "spineturret" }).ok, true);
  });

  it("builds 70% slower below zero, however short", () => {
    assert.equal(hiveSpeed(200, 150), 1);
    assert.equal(hiveSpeed(200, 200), 1);
    assert.equal(hiveSpeed(200, 201), HIVE_SHORT_SPEED);
    assert.equal(hiveSpeed(200, 100_000), HIVE_SHORT_SPEED);
    const state = field();
    // Base structures never go offline: an Aerie keeps the hive at -500.
    at(state, "aerie", 40, 30);
    ticks(state, 20);
    const { cap, used, offline } = hiveEnergyOf(state, "B");
    assert.equal(offline, 0);
    assert.ok(used > cap);
    assert.equal(jobSpeed(state, "B"), HIVE_SHORT_SPEED);
    const time = (slow: boolean): number => {
      const s = field();
      if (slow) at(s, "aerie", 40, 30);
      applyCommand(s, "B", { type: "cmd.build", building: "spineturret" });
      for (let i = 1; i < 2000; i++) {
        ticks(s, 1);
        if (s.players.get("B")!.defence?.ready) return i;
      }
      return Infinity;
    };
    assert.ok(time(true) > time(false), "the turret takes longer while the hive is short");
  });

  it("shuts down the hungriest first, one at a time, and only as many as it takes", () => {
    const state = field();
    const node = at(state, "fusionnode", 40, 40);
    const behemoth = at(state, "behemoth", 20, 20);
    const ravagers = [0, 1, 2, 3].map((i) => at(state, "ravager", 24 + i * 2, 24));
    const juggernaut = at(state, "juggernaut", 30, 20);
    ticks(state, 2);
    // 700 holds 200 + 4 × 50 + 150 = 550.
    assert.ok([behemoth, juggernaut, ...ravagers].every((u) => !u.shutdown));
    destroyEntity(state, node);
    ticks(state, 1);
    // 200 against 550: the Behemoth (200) goes first.
    assert.ok(behemoth.shutdown && behemoth.hiveOffline);
    assert.ok(!juggernaut.shutdown, "one at a time");
    ticks(state, secondsToTicks(HIVE_SWITCH_SECONDS));
    // Still 350 against 200: the Juggernaut (150) next, and that is enough.
    assert.ok(juggernaut.shutdown && juggernaut.hiveOffline);
    ticks(state, secondsToTicks(HIVE_SWITCH_SECONDS) * 6);
    assert.ok(ravagers.every((u) => !u.shutdown), "the Ravagers fit: they stay up");
    assert.deepEqual(hiveEnergyOf(state, "B"), { cap: 200, used: 200, offline: 2 });
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === behemoth.id)?.shutdown, true);
    // An order to an offline unit goes nowhere.
    const before = { x: behemoth.x, y: behemoth.y };
    applyCommand(state, "B", { type: "cmd.move", ids: [behemoth.id], x: before.x + 200, y: before.y });
    ticks(state, 20);
    assert.deepEqual({ x: behemoth.x, y: behemoth.y }, before);
    // A new Fusion Node: they wake one at a time, the hungriest that fits first.
    at(state, "fusionnode", 44, 40);
    ticks(state, 1);
    assert.ok(!behemoth.shutdown && juggernaut.shutdown);
    ticks(state, secondsToTicks(HIVE_SWITCH_SECONDS));
    assert.ok(!juggernaut.shutdown && !juggernaut.hiveOffline);
  });

  it("silences an offline defence", () => {
    const state = field();
    for (let i = 0; i < 4; i++) at(state, "ravager", 20 + i * 2, 20);
    const spire = at(state, "pulsespire", 30, 30);
    ticks(state, 2);
    // 300 against 200: the Pulse Spire (100) is the hungriest.
    assert.equal(spire.hiveOffline, true);
    assert.equal(spire.unpowered, true);
  });

  it("darkens every structure while below zero: no glow, and a fifth less sight", () => {
    const state = field();
    const core = [...state.entities.values()].find((e) => e.ownerId === "B" && e.kind === "building" && e.hp > 0)!;
    const full = sightTilesForEntity(state, core);
    // 200 + 3 × 500 holds the Nexus (1260) with room to spare.
    for (let i = 0; i < 3; i++) at(state, "fusionnode", 40 + i * 4, 36);
    const nexus = at(state, "nexus", 44, 40);
    ticks(state, 1);
    assert.equal(radarOnline(state, "B"), true);
    // Hold the switch off so the hive stays short.
    state.players.get("B")!.hiveSwitchTick = state.tick + 1000;
    const juggernauts = [0, 1, 2, 3, 4].map((i) => at(state, "juggernaut", 20 + i * 4, 20));
    ticks(state, 1);
    assert.ok(hiveEnergyOf(state, "B").used > hiveEnergyOf(state, "B").cap, "short");
    assert.equal(core.hiveDark, true);
    assert.equal(nexus.hiveDark, true);
    assert.equal(radarOnline(state, "B"), false, "the radar is down");
    assert.equal(snapshotFor(state, "B").you.radar, false);
    assert.equal(core.unpowered, undefined, "dark is not silenced");
    assert.equal(sightTilesForEntity(state, core), lowPowerSight(full, true));
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === core.id)?.hiveDark, true);
    assert.ok(juggernauts.every((u) => !u.hiveDark), "units are not dark, only structures");
    // Room again: the glow and the sight come back.
    state.players.get("B")!.hiveSwitchTick = 0;
    ticks(state, 1);
    for (const u of juggernauts) destroyEntity(state, u);
    ticks(state, 1);
    assert.equal(core.hiveDark, undefined);
    assert.equal(sightTilesForEntity(state, core), full);
    assert.equal(radarOnline(state, "B"), true);
  });

  it("charges a Laser Fence more the longer its link", () => {
    const state = field();
    at(state, "laserfence", 20, 30);
    const ts = state.tileSize;
    const near = fenceEnergyToAdd(state, "B", [{ x: tileCenter(Math.round(22 * TILE_SUBDIV), ts), y: tileCenter(Math.round(30 * TILE_SUBDIV), ts) }]);
    const far = fenceEnergyToAdd(state, "B", [{ x: tileCenter(Math.round(25 * TILE_SUBDIV), ts), y: tileCenter(Math.round(30 * TILE_SUBDIV), ts) }]);
    assert.equal(near, Math.round(2 * LASER_FENCE_ENERGY_PER_CELL));
    assert.equal(far, Math.round(5 * LASER_FENCE_ENERGY_PER_CELL));
    at(state, "laserfence", 25, 30);
    ticks(state, 1);
    assert.equal(hiveEnergyOf(state, "B").used, 2 * energyOf("laserfence") + far);
    assert.equal(liveFenceLinks(state).links.length, 1);
  });

  it("raises a sited fence line while the hive is short, and the hungriest goes dark instead", () => {
    const state = field();
    const core = hqOf(state, "B")!;
    // Toward the middle of the map from the Hive Core.
    const sx = core.tileX > state.width / 2 ? -1 : 1;
    const sy = core.tileY > state.height / 2 ? -1 : 1;
    const cx = core.tileX / TILE_SUBDIV + 1 + sx * 5;
    const cy = core.tileY / TILE_SUBDIV + 1 + sy * 5;
    const behemoth = at(state, "behemoth", cx, cy + sy * 4);
    const posts = [0, 5].map((d) => ({ tx: Math.round((cx + sx * d) * TILE_SUBDIV), ty: Math.round(cy * TILE_SUBDIV) }));
    assert.equal(applyCommand(state, "B", { type: "cmd.fence", posts }).ok, true);
    const scrap = state.players.get("B")!.scrap;
    ticks(state, 300);
    const fence = [...state.entities.values()].filter((e) => e.type === "laserfence" && e.ownerId === "B");
    assert.equal(fence.length, 2, "the line goes up though the Behemoth holds all 200");
    assert.equal(state.players.get("B")!.scrap, scrap, "no scrap spent");
    assert.ok(behemoth.hiveOffline, "the Behemoth, the hungriest, goes dark");
    assert.ok(fence.every((f) => !f.hiveOffline));
    assert.equal(hiveEnergyOf(state, "B").used, 2 * energyOf("laserfence") + Math.round(5 * LASER_FENCE_ENERGY_PER_CELL));
  });
});

describe("Spine Turret cell", () => {
  it("fires a burst, then slows to the pace its cell regrows", () => {
    const cell = catalog("spineturret").plasmaCell!;
    assert.ok(cell, "the Spine Turret has a cell");
    const state = field();
    at(state, "fusionnode", 40, 40);
    const turret = at(state, "spineturret", 30, 30);
    const man = at(state, "rifleman", 30, 33, "A");
    man.hp = man.hpMax = 1e9;
    assert.equal(turret.energy ?? cell.shots, cell.shots, "full at the start");
    let low = cell.shots;
    for (let i = 0; i < 120; i++) {
      ticks(state, 1);
      low = Math.min(low, turret.energy ?? cell.shots);
    }
    assert.ok(low < 1, `runs the cell dry on a long burst: lowest ${low}`);
    assert.ok((turret.energy ?? cell.shots) < cell.shots / 2, `held on a target it never refills: ${turret.energy}`);
  });
});
