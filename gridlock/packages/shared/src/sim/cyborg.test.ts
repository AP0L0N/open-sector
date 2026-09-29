import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CYBORG_DRAG_SPEED,
  CYBORG_DRUM,
  CYBORG_LEGS_BACK_HP,
  CYBORG_LEGS_LOST_HP,
  GATLING,
  STANCE_SPEED,
  TICK_DT,
  WALKER_ONE_BURST,
  catalog,
  hasCrit,
  infantryGunFor,
  infantryLoadout,
  isCivilianType,
  isInfantryType,
  isRepairableUnit,
  stanceOf,
  supplyShortOf,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickCombat } from "./combat.js";
import { moveSpeedMul, rollCrits } from "./crits.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { tickStance } from "./stance.js";
import type { Entity, MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "CY",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
}

function clearCover(state: MatchState): void {
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
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function setHpShare(e: Entity, share: number): void {
  e.hp = Math.round(e.hpMax * share);
}

describe("cyborg", () => {
  it("is an Armory-trained infantry type with one gatling and a drum that never reloads", () => {
    const def = catalog("cyborg");
    assert.equal(def.name, "Cyborg");
    assert.equal(isInfantryType("cyborg"), true);
    assert.equal(isRepairableUnit("cyborg"), true);
    assert.equal(isRepairableUnit("rifleman"), false);
    assert.equal(isRepairableUnit("warden"), true);
    assert.deepEqual(
      infantryLoadout("cyborg").map((g) => g.id),
      ["gatling"],
    );
    assert.equal(infantryGunFor({ type: "cyborg" })?.id, "gatling");
    assert.equal(GATLING.clip, CYBORG_DRUM);
    assert.equal(GATLING.reload, 0);
    assert.equal(GATLING.shotsPerTick, WALKER_ONE_BURST);
    assert.equal(GATLING.bulky, true);
    const trained = applyCommand(match().state, "A", { type: "cmd.train", unit: "cyborg" });
    assert.equal(trained.ok, false);
    if (!trained.ok) assert.equal(trained.message, "Need an Armory.");
  });

  it("spawns with a full drum, fires one gatling's burst, and stays dry at empty", () => {
    const { state, a, b } = match();
    clearCover(state);
    const ts = state.tileSize;
    const cy = makeEntity(state, "cyborg", a, tileCenter(12, ts), tileCenter(12, ts));
    const target = makeEntity(state, "walker", b, tileCenter(16, ts), tileCenter(12, ts));
    target.holdPosition = true;
    target.cooldown = 99;
    assert.equal(cy.clip, CYBORG_DRUM);
    cy.facing = 0;
    cy.order = { kind: "attack", targetId: target.id };
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.filter((p) => p.fromId === cy.id).length, WALKER_ONE_BURST);
    assert.equal(cy.clip, CYBORG_DRUM - WALKER_ONE_BURST);

    cy.clip = 0;
    state.projectiles.length = 0;
    for (let i = 0; i < 100; i++) {
      cy.cooldown = 0;
      tickCombat(state, TICK_DT);
    }
    assert.equal(state.projectiles.filter((p) => p.fromId === cy.id).length, 0);
    assert.equal(cy.reload, 0);
    assert.equal(cy.clip, 0);
    assert.equal(supplyShortOf("cyborg", cy.ammo, cy.mgAmmo, cy.clip), true);
    assert.equal(supplyShortOf("cyborg", cy.ammo, cy.mgAmmo, CYBORG_DRUM), false);
  });

  it("loses the legs near death, drags himself slowly, and keeps shooting", () => {
    const { state, a, b } = match();
    clearCover(state);
    const ts = state.tileSize;
    const cy = makeEntity(state, "cyborg", a, tileCenter(12, ts), tileCenter(12, ts));
    setHpShare(cy, CYBORG_LEGS_LOST_HP + 0.05);
    tickStance(state);
    assert.equal(hasCrit(cy, "leg"), false);
    assert.equal(stanceOf(cy), "stand");

    setHpShare(cy, CYBORG_LEGS_LOST_HP - 0.02);
    tickStance(state);
    assert.equal(hasCrit(cy, "leg"), true);
    assert.equal(stanceOf(cy), "crawl");
    assert.equal(cy.stance, "crawl");
    assert.equal(moveSpeedMul(cy), CYBORG_DRAG_SPEED);
    assert.ok(CYBORG_DRAG_SPEED < STANCE_SPEED.crawl);

    const target = makeEntity(state, "walker", b, tileCenter(16, ts), tileCenter(12, ts));
    target.holdPosition = true;
    target.cooldown = 99;
    cy.facing = 0;
    cy.order = { kind: "attack", targetId: target.id };
    const before = cy.clip;
    tickCombat(state, TICK_DT);
    assert.ok(cy.clip < before, `legless cyborg fired: clip ${cy.clip}`);

    // Patched a little is not enough. Past the back threshold, the legs return.
    setHpShare(cy, (CYBORG_LEGS_LOST_HP + CYBORG_LEGS_BACK_HP) / 2);
    tickStance(state);
    assert.equal(hasCrit(cy, "leg"), true);
    setHpShare(cy, CYBORG_LEGS_BACK_HP);
    tickStance(state);
    assert.equal(hasCrit(cy, "leg"), false);
    assert.equal(stanceOf(cy), "stand");
    assert.equal(moveSpeedMul(cy), STANCE_SPEED.stand);
  });

  it("ignores stance orders, never ducks under fire, and takes no random limb hits", () => {
    const { state, a, b } = match();
    clearCover(state);
    const ts = state.tileSize;
    const cy = makeEntity(state, "cyborg", a, tileCenter(12, ts), tileCenter(12, ts));
    const res = applyCommand(state, a, { type: "cmd.stance", ids: [cy.id], stance: "crawl" });
    assert.equal(res.ok, false);
    const foe = makeEntity(state, "rifleman", b, tileCenter(16, ts), tileCenter(12, ts));
    foe.attackTarget = cy.id;
    tickStance(state);
    assert.equal(cy.stance, "stand");
    for (let i = 0; i < 20; i++) rollCrits(cy, "none", "hit", 10, () => 0);
    assert.deepEqual(cy.crits, []);
  });

  it("is healed by a medic, and the legs come back", () => {
    const { state, a } = match();
    clearCover(state);
    const ts = state.tileSize;
    const medic = makeEntity(state, "medic", a, tileCenter(80, ts), tileCenter(52, ts));
    const cy = makeEntity(state, "cyborg", a, tileCenter(86, ts), tileCenter(52, ts));
    setHpShare(cy, CYBORG_LEGS_LOST_HP - 0.05);
    step(state, TICK_DT);
    assert.equal(hasCrit(cy, "leg"), true);
    const hp0 = cy.hp;
    ticks(state, 40);
    assert.ok(cy.hp > hp0, `hp ${cy.hp}`);
    assert.equal(medic.tendId, cy.id);
    ticks(state, 400);
    assert.equal(cy.hp, cy.hpMax);
    assert.equal(hasCrit(cy, "leg"), false);
    assert.equal(stanceOf(cy), "stand");
  });

  it("is repaired by an engineer, and the legs come back", () => {
    const { state, a } = match();
    clearCover(state);
    const ts = state.tileSize;
    const eng = makeEntity(state, "engineer", a, tileCenter(36, ts), tileCenter(32, ts));
    const cy = makeEntity(state, "cyborg", a, tileCenter(36, ts) + 20, tileCenter(32, ts));
    cy.holdPosition = true;
    setHpShare(cy, CYBORG_LEGS_LOST_HP - 0.05);
    step(state, TICK_DT);
    assert.equal(hasCrit(cy, "leg"), true);
    const res = applyCommand(state, a, { type: "cmd.repair", ids: [eng.id], targetId: cy.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 300);
    assert.equal(cy.hp, cy.hpMax);
    assert.equal(hasCrit(cy, "leg"), false);
    const full = applyCommand(state, a, { type: "cmd.repair", ids: [eng.id], targetId: cy.id });
    assert.equal(full.ok, false);
  });

  it("gets the drum topped up by a supply truck", () => {
    const { state, a } = match();
    clearCover(state);
    const ts = state.tileSize;
    const truck = makeEntity(state, "supply", a, tileCenter(40, ts), tileCenter(40, ts));
    const cy = makeEntity(state, "cyborg", a, tileCenter(43, ts), tileCenter(40, ts));
    cy.holdPosition = true;
    assert.equal(applyCommand(state, a, { type: "cmd.supply", ids: [truck.id], targetId: cy.id }).ok, false);
    cy.clip = 0;
    const cargo = truck.supply;
    assert.equal(applyCommand(state, a, { type: "cmd.supply", ids: [truck.id], targetId: cy.id }).ok, true);
    ticks(state, 40);
    assert.ok(cy.clip > 0 && cy.clip <= CYBORG_DRUM, `clip ${cy.clip}`);
    assert.ok(truck.supply < cargo);
    assert.equal(cy.reload, 0);
  });
});
