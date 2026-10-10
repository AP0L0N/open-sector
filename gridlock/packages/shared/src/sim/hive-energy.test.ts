import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  FUSION_NODE_ENERGY,
  HIVE_CORE_ENERGY,
  LASER_FENCE_ENERGY_PER_CELL,
  TICK_DT,
  TILE_SUBDIV,
  catalog,
  energyOf,
  inFaction,
  isCivilianType,
  type EntityType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, hasCore, hqOf, makeEntity, tileCenter } from "./geo.js";
import { fenceEnergyToAdd, hiveEnergyOf } from "./hive-energy.js";
import { liveFenceLinks } from "./laser-fence.js";
import { createMatch, step } from "./match.js";
import { powerOf } from "./power.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenomorphs, on bare flat ground with B's Seed unpacked into a Hive Core. */
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
    at(state, "cyborgcentral", 34, 30);
    assert.deepEqual(powerOf(state, "B"), { provided: 0, used: 0, lowPower: false });
    assert.equal(inFaction("assimilator", "xeno"), false);
    assert.equal(inFaction("fusionnode", "xeno"), true);
  });

  it("builds a structure for nothing, and a defence for its energy", () => {
    const state = field();
    const scrap = state.players.get("B")!.scrap;
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "forge" }).ok, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "spineturret" }).ok, true);
    ticks(state, 400);
    const p = state.players.get("B")!;
    assert.equal(p.structure?.ready, true);
    assert.equal(p.defence?.ready, true);
    assert.equal(p.scrap, scrap, "no scrap spent");
    assert.equal(hiveEnergyOf(state, "B").used, energyOf("spineturret"), "the ready turret holds its energy");
  });

  it("trains a unit for its energy, waits when the hive is full, and frees it on cancel", () => {
    const state = field();
    at(state, "cyborgcentral", 30, 30);
    const scrap = state.players.get("B")!.scrap;
    // 200 energy: four Lancers (50 each) fill it; the fifth waits.
    for (let i = 0; i < 5; i++) assert.equal(applyCommand(state, "B", { type: "cmd.train", unit: "lancer" }).ok, true);
    ticks(state, 5 * Math.ceil(catalog("lancer").buildSeconds / TICK_DT) + 40);
    const lancers = () => [...state.entities.values()].filter((e) => e.type === "lancer" && e.ownerId === "B").length;
    assert.equal(lancers(), 4);
    assert.equal(state.players.get("B")!.scrap, scrap, "no scrap spent");
    assert.equal(hiveEnergyOf(state, "B").used, 200);
    // A Fusion Node makes room: the fifth comes out.
    at(state, "fusionnode", 40, 40);
    ticks(state, Math.ceil(catalog("lancer").buildSeconds / TICK_DT) + 20);
    assert.equal(lancers(), 5);
  });

  it("puts the newest units offline when the hive runs short, and wakes them once there is room", () => {
    const state = field();
    const node = at(state, "fusionnode", 40, 40);
    const old = at(state, "behemoth", 20, 20);
    const units = [0, 1].map((i) => at(state, "behemoth", 24 + i * 4, 20));
    ticks(state, 2);
    assert.ok([old, ...units].every((u) => !u.shutdown), "700 holds three Behemoths");
    destroyEntity(state, node);
    ticks(state, 2);
    // 200 left: the oldest Behemoth stays, the rest go dark.
    assert.ok(!old.shutdown && !old.hiveOffline);
    assert.ok(units.every((u) => u.shutdown && u.hiveOffline));
    assert.deepEqual(hiveEnergyOf(state, "B"), { cap: 200, used: 200, offline: 2 });
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === units[0]!.id)?.shutdown, true);
    // An order to an offline unit goes nowhere.
    const before = { x: units[0]!.x, y: units[0]!.y };
    applyCommand(state, "B", { type: "cmd.move", ids: [units[0]!.id], x: before.x + 200, y: before.y });
    ticks(state, 20);
    assert.deepEqual({ x: units[0]!.x, y: units[0]!.y }, before);
    at(state, "fusionnode", 44, 40);
    ticks(state, 2);
    assert.ok(units.every((u) => !u.shutdown && !u.hiveOffline), "a new Fusion Node wakes them");
  });

  it("silences an offline defence", () => {
    const state = field();
    at(state, "behemoth", 10, 10);
    const turret = at(state, "spineturret", 30, 30);
    ticks(state, 2);
    assert.equal(turret.hiveOffline, true);
    assert.equal(turret.unpowered, true);
  });

  it("charges a Laser Fence more the longer its link", () => {
    const state = field();
    at(state, "laserfence", 20, 30);
    const near = fenceEnergyToAdd(state, "B", tileCenter(Math.round(22 * TILE_SUBDIV), state.tileSize), tileCenter(Math.round(30 * TILE_SUBDIV), state.tileSize));
    const far = fenceEnergyToAdd(state, "B", tileCenter(Math.round(25 * TILE_SUBDIV), state.tileSize), tileCenter(Math.round(30 * TILE_SUBDIV), state.tileSize));
    assert.equal(near, 2 * LASER_FENCE_ENERGY_PER_CELL);
    assert.equal(far, 5 * LASER_FENCE_ENERGY_PER_CELL);
    at(state, "laserfence", 25, 30);
    ticks(state, 1);
    assert.equal(hiveEnergyOf(state, "B").used, 2 * energyOf("laserfence") + far);
    assert.equal(liveFenceLinks(state).links.length, 1);
  });

  it("refuses a fence post whose link the hive cannot feed", () => {
    const state = field();
    const core = hqOf(state, "B")!;
    // Toward the middle of the map from the Hive Core.
    const sx = core.tileX > state.width / 2 ? -1 : 1;
    const sy = core.tileY > state.height / 2 ? -1 : 1;
    const cx = core.tileX / TILE_SUBDIV + 1 + sx * 5;
    const cy = core.tileY / TILE_SUBDIV + 1 + sy * 5;
    at(state, "behemoth", cx, cy + sy * 4);
    at(state, "laserfence", cx, cy);
    const p = state.players.get("B")!;
    p.defence = { type: "laserfence", progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: energyOf("laserfence") };
    const place = () =>
      applyCommand(state, "B", { type: "cmd.place", building: "laserfence", tx: Math.round((cx + sx * 5) * TILE_SUBDIV), ty: Math.round(cy * TILE_SUBDIV) });
    const r = place();
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /Not enough energy/);
    at(state, "fusionnode", cx + sx * 4, cy + sy * 8);
    assert.equal(place().ok, true, "with a Fusion Node the link fits");
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
    ticks(state, 120);
    assert.ok((turret.energy ?? cell.shots) < 2, `drained after a long burst: ${turret.energy}`);
  });
});
