import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  FORCE_SHIELD_ENERGY,
  FUSION_CORE_LEVEL_ENERGY,
  HIVE_CORE_ENERGY,
  RESEARCH,
  RESEARCH_OUTPUT_SHARE,
  ROOF_FLAK_ENERGY,
  TICK_DT,
  TILE_SUBDIV,
  isCivilianType,
  levelNameOf,
  nextResearch,
  researchOf,
  secondsToTicks,
  type EntityType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, hasCore, hqOf, makeEntity, tileCenter } from "./geo.js";
import { hiveEnergyOf } from "./hive-energy.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenite with its Hive Core standing, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "FCR", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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

function at(state: MatchState, type: EntityType, cx: number, cy: number, owner = "B"): Entity {
  const ts = state.tileSize;
  const tx = Math.round(cx * TILE_SUBDIV);
  const ty = Math.round(cy * TILE_SUBDIV);
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
}

function research(state: MatchState, e: Entity, id: keyof typeof RESEARCH): void {
  assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [e.id], research: id }).ok, true, id);
  ticks(state, secondsToTicks(RESEARCH[id].seconds) + 2);
}

describe("Fusion Core research", () => {
  it("offers the Fusion Reactor, a Force Shield, and the Flak Maw", () => {
    assert.deepEqual(researchOf("fusioncore").map((r) => r.id), ["fusionreactor", "forceshield", "flakmaw"]);
    assert.equal(nextResearch("fusioncore", 0)?.id, "fusionreactor");
    assert.equal(nextResearch("fusioncore", 1), undefined);
    assert.equal(levelNameOf("fusioncore", 1), "Fusion Reactor");
    assert.equal(FUSION_CORE_LEVEL_ENERGY[1], FUSION_CORE_LEVEL_ENERGY[0]! * 2);
    assert.ok(!researchOf("fusionnode").some((r) => r.id === "flakmaw"));
    assert.ok(RESEARCH.flakmaw.blurb.length > 0);
  });

  it("holds half its energy while it becomes a Fusion Reactor, and twice its store after", () => {
    const state = field();
    const core = at(state, "fusioncore", 40, 40);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + FUSION_CORE_LEVEL_ENERGY[0]!);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [core.id], research: "fusionreactor" }).ok, true);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + Math.floor(FUSION_CORE_LEVEL_ENERGY[0]! * RESEARCH_OUTPUT_SHARE));
    ticks(state, secondsToTicks(RESEARCH.fusionreactor.seconds) + 2);
    assert.equal(core.level, 1);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + FUSION_CORE_LEVEL_ENERGY[1]!);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [core.id], research: "fusionreactor" }).ok, false, "only once");
  });

  it("raises a Force Shield over the core", () => {
    const state = field();
    const core = at(state, "fusioncore", 40, 40);
    ticks(state, 1);
    const before = hiveEnergyOf(state, "B").used;
    research(state, core, "forceshield");
    assert.equal(core.forceShield, true);
    assert.equal(hiveEnergyOf(state, "B").used, before + FORCE_SHIELD_ENERGY);
    const dome = state.energyShields?.find((d) => d.dome && d.fromId === core.id);
    assert.ok(dome, "the dome stands");
    assert.ok(dome.r > (core.tileW / 2) * state.tileSize, "past the footprint");
  });

  it("grows a Flak Maw that takes its energy and fires at a low plane, not at the ground", () => {
    const state = field();
    const core = at(state, "fusioncore", 40, 40);
    ticks(state, 1);
    const before = hiveEnergyOf(state, "B").used;
    research(state, core, "flakmaw");
    assert.ok(core.roofFlak, "the maw is on the roof");
    assert.equal(hiveEnergyOf(state, "B").used, before + ROOF_FLAK_ENERGY);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [core.id], research: "flakmaw" }).ok, false, "only once");

    const ts = state.tileSize;
    at(state, "rifleman", 43, 40, "A");
    ticks(state, Math.round(1 / TICK_DT));
    assert.equal(core.roofFlak.firedTick, undefined, "it leaves soldiers alone");

    const plane = makeEntity(state, "stuka", "A", core.x + 4 * TILE_SUBDIV * ts, core.y);
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 0;
    let balls = false;
    for (let i = 0; i < Math.round(1 / TICK_DT) && !balls; i++) {
      ticks(state, 1);
      balls = state.projectiles.some((p) => p.launcher === "mawcaster" && p.airRack && p.fromId === core.id);
    }
    assert.ok(core.roofFlak.firedTick != null, "the flak maw fired");
    assert.ok(balls, "air balls from the core");

    const own = snapshotFor(state, "B").entities.find((e) => e.id === core.id);
    assert.ok(own?.roofFlak && own.roofFlak.energy != null, "its side sees the cell");
    const foe = snapshotFor(state, "A").entities.find((e) => e.id === core.id);
    if (foe) assert.equal(foe.roofFlak?.energy, undefined, "the enemy sees the maw, not its charge");
  });
});
