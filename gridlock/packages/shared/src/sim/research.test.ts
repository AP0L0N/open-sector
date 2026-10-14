import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  FORCE_SHIELD_DOME,
  FORCE_SHIELD_ENERGY,
  FUSION_NODE_LEVEL_ENERGY,
  HIVE_CORE_ENERGY,
  RESEARCH,
  RESEARCH_OUTPUT_SHARE,
  TICK_DT,
  TILE_SUBDIV,
  isCivilianType,
  nextResearch,
  researchOf,
  secondsToTicks,
  type EntityType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, hasCore, hqOf, makeEntity, tileCenter } from "./geo.js";
import { domeOver } from "./energy-shield.js";
import { hiveEnergyOf } from "./hive-energy.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenite with its Hive Core standing, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "RSC", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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

describe("research", () => {
  it("offers the Fusion Node Advanced Fusion, then Ultra Fusion, then nothing", () => {
    assert.equal(nextResearch("fusionnode", 0)?.id, "advancedfusion");
    assert.equal(nextResearch("fusionnode", 1)?.id, "ultrafusion");
    assert.equal(nextResearch("fusionnode", 2), undefined);
    assert.equal(nextResearch("hivecore", 0), undefined);
    assert.ok(FUSION_NODE_LEVEL_ENERGY[0]! < FUSION_NODE_LEVEL_ENERGY[1]! && FUSION_NODE_LEVEL_ENERGY[1]! < FUSION_NODE_LEVEL_ENERGY[2]!);
  });

  it("holds half the node's energy while it upgrades, and the next level's once it is done", () => {
    const state = field();
    const node = at(state, "fusionnode", 40, 40);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + FUSION_NODE_LEVEL_ENERGY[0]!);

    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: "advancedfusion" }).ok, true);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + Math.floor(FUSION_NODE_LEVEL_ENERGY[0]! * RESEARCH_OUTPUT_SHARE));
    const view = snapshotFor(state, "B").entities.find((e) => e.id === node.id);
    assert.equal(view?.research?.id, "advancedfusion");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === node.id)?.research, undefined, "the enemy sees no progress");

    ticks(state, secondsToTicks(RESEARCH.advancedfusion.seconds) + 2);
    assert.equal(node.level, 1);
    assert.equal(node.research, undefined);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + FUSION_NODE_LEVEL_ENERGY[1]!);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === node.id)?.level ?? 1, 1);

    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: "ultrafusion" }).ok, true);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + Math.floor(FUSION_NODE_LEVEL_ENERGY[1]! * RESEARCH_OUTPUT_SHARE));
    ticks(state, secondsToTicks(RESEARCH.ultrafusion.seconds) + 2);
    assert.equal(node.level, 2);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + FUSION_NODE_LEVEL_ENERGY[2]!);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: "ultrafusion" }).ok, false, "nothing past Ultra");
  });

  it("refuses to skip a level, to research twice, or another side's node", () => {
    const state = field();
    const node = at(state, "fusionnode", 40, 40);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: "ultrafusion" }).ok, false);
    assert.equal(applyCommand(state, "A", { type: "cmd.research", ids: [node.id], research: "advancedfusion" }).ok, false);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: "advancedfusion" }).ok, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: "advancedfusion" }).ok, false);
  });

  it("starts on every selected node at once", () => {
    const state = field();
    const a = at(state, "fusionnode", 40, 40);
    const b = at(state, "fusionnode", 44, 40);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [a.id, b.id], research: "advancedfusion" }).ok, true);
    assert.ok(a.research && b.research);
  });

  it("cancels back to full output and the base level", () => {
    const state = field();
    const node = at(state, "fusionnode", 40, 40);
    applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: "advancedfusion" });
    ticks(state, 20);
    assert.equal(applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: null }).ok, true);
    assert.equal(node.research, undefined);
    assert.equal(node.level, undefined);
    assert.equal(hiveEnergyOf(state, "B").cap, HIVE_CORE_ENERGY + FUSION_NODE_LEVEL_ENERGY[0]!);
  });

  it("drops the job when the node changes hands", () => {
    const state = field();
    const node = at(state, "fusionnode", 40, 40);
    applyCommand(state, "B", { type: "cmd.research", ids: [node.id], research: "advancedfusion" });
    node.ownerId = "A";
    ticks(state, 1);
    assert.equal(node.research, undefined);
  });

  describe("Force Shield", () => {
    const domeOf = (state: MatchState, e: Entity) => state.energyShields?.find((d) => d.dome && d.fromId === e.id);
    const shield = (state: MatchState, e: Entity) => {
      applyCommand(state, "B", { type: "cmd.research", ids: [e.id], research: "forceshield" });
      ticks(state, secondsToTicks(RESEARCH.forceshield.seconds) + 2);
    };

    it("is offered on every Xenite defence and on nothing else", () => {
      for (const t of ["spineturret", "pulsespire", "energywall", "laserfence"] as const) {
        assert.ok(researchOf(t).some((r) => r.id === "forceshield"), t);
      }
      assert.ok(!researchOf("fusionnode").some((r) => r.id === "forceshield"));
      assert.ok(!researchOf("hivecore").some((r) => r.id === "forceshield"));
    });

    it("takes its energy from the moment it starts, and raises a small dome over the defence once done", () => {
      const state = field();
      at(state, "fusionnode", 30, 30);
      const spine = at(state, "spineturret", 40, 40);
      ticks(state, 1);
      const before = hiveEnergyOf(state, "B").used;
      applyCommand(state, "B", { type: "cmd.research", ids: [spine.id], research: "forceshield" });
      ticks(state, 1);
      assert.equal(hiveEnergyOf(state, "B").used, before + FORCE_SHIELD_ENERGY);
      assert.equal(domeOf(state, spine), undefined, "no dome while it researches");
      ticks(state, secondsToTicks(RESEARCH.forceshield.seconds) + 2);
      assert.equal(spine.forceShield, true);
      assert.equal(hiveEnergyOf(state, "B").used, before + FORCE_SHIELD_ENERGY, "the draw stays");
      const dome = domeOf(state, spine);
      assert.ok(dome, "the dome stands");
      assert.equal(dome.hpMax, FORCE_SHIELD_DOME.energy);
      assert.ok(dome.r > (spine.tileW / 2) * state.tileSize, "past the footprint");
      assert.ok(dome.r < spine.tileW * 2 * state.tileSize, "but tight to it");
      assert.equal(domeOver(state, "A", spine.x, spine.y), dome, "it shelters the turret from the enemy");
      const view = snapshotFor(state, "B").entities.find((e) => e.id === spine.id);
      assert.deepEqual(view?.shield, { hp: FORCE_SHIELD_DOME.energy, max: FORCE_SHIELD_DOME.energy });
      assert.equal(view?.forceShield, true);
    });

    it("drops when drained and comes back after the recharge", () => {
      const state = field();
      at(state, "fusionnode", 30, 30);
      const spine = at(state, "spineturret", 40, 40);
      shield(state, spine);
      domeOf(state, spine)!.hp = 0;
      ticks(state, 1);
      assert.equal(domeOf(state, spine), undefined);
      assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === spine.id)?.shield?.hp, 0);
      ticks(state, secondsToTicks(FORCE_SHIELD_DOME.rechargeSeconds) + 2);
      assert.ok(domeOf(state, spine), "back up");
    });

    it("lowers while the defence is offline and keeps what it had", () => {
      const state = field();
      at(state, "fusionnode", 30, 30);
      const spine = at(state, "spineturret", 40, 40);
      shield(state, spine);
      const dome = domeOf(state, spine)!;
      dome.hp = 90;
      spine.unpowered = true;
      spine.hiveOffline = true;
      ticks(state, 1);
      assert.equal(domeOf(state, spine), undefined);
      assert.ok((spine.forceShieldHp ?? 0) >= 90 && (spine.forceShieldHp ?? 0) < FORCE_SHIELD_DOME.energy);
    });

    it("gives an Energy Wall its dome beside its curtain", () => {
      const state = field();
      at(state, "fusionnode", 30, 30);
      at(state, "fusionnode", 34, 30);
      const wall = at(state, "energywall", 40, 40);
      ticks(state, 2);
      assert.ok(state.energyShields?.some((d) => d.post && d.fromId === wall.id), "the curtain stands");
      shield(state, wall);
      assert.ok(state.energyShields?.some((d) => d.post && d.fromId === wall.id), "the curtain still stands");
      assert.ok(domeOf(state, wall), "and the dome over the core");
    });
  });
});
