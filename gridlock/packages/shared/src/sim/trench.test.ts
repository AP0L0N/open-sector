import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILE_EMPTY } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUNKER_GARRISON_HP_MUL,
  BUNKER_TYPES,
  BUNKER_WOUND_MUL,
  FIELD_STRUCTURES,
  MORTAR_MIN_RANGE_TILES,
  TICK_DT,
  TRENCH_GARRISON_CAP,
  TRENCH_GARRISON_HP_MUL,
  TRENCH_TYPES,
  TRENCH_WOUND_MUL,
  catalog,
  coverHeightOf,
  garrisonCapOf,
  type EntityType,
} from "../catalog.js";
import { applyCommand } from "./commands.js";
import { tickCombat } from "./combat.js";
import { sightTilesForEntity } from "./elevation.js";
import { makeEntity, tileCenter, tileIndex, walkable, worldToTile } from "./geo.js";
import { canGarrison, enterGarrison, woundGarrison } from "./garrison.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "TR", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  clearPatch(state, 20, 20, 30, 20);
  return { state, a: "A", b: "B" };
}

function clearPatch(state: MatchState, tx: number, ty: number, w: number, h: number): void {
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      const i = tileIndex(state, x, y);
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.scrapYield[i] = 0;
      state.occupy[i] = 0;
      state.fortBlock[i] = 0;
      state.heights[i] = 0;
    }
  }
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function trenchAt(state: MatchState, owner: string, tx = 32, ty = 30): Entity {
  const ts = state.tileSize;
  return makeEntity(state, "trench", owner, tileCenter(tx, ts), tileCenter(ty, ts), { facing: 0 });
}

function trooper(state: MatchState, type: EntityType, owner: string, tx = 30, ty = 30): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

describe("trench", () => {
  it("is an engineer field work, not a yard building", () => {
    assert.ok(FIELD_STRUCTURES.includes("trench"));
    assert.equal(catalog("trench").kind, "building");
    assert.equal(garrisonCapOf("trench"), TRENCH_GARRISON_CAP);
    assert.equal(TRENCH_GARRISON_CAP, 1);
  });

  it("is dug by an engineer on a cmd.field order, for its cost", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const x = tileCenter(34, ts);
    const y = tileCenter(30, ts);
    const eng = makeEntity(state, "engineer", a, x - 30, y);
    const scrap0 = state.players.get(a)!.scrap;
    const res = applyCommand(state, a, { type: "cmd.field", ids: [eng.id], structure: "trench", x, y, facing: 0 });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, Math.round((catalog("trench").buildSeconds + 6) / TICK_DT));
    const dug = [...state.entities.values()].find((e) => e.type === "trench");
    assert.ok(dug, "the trench was dug");
    assert.equal(dug!.ownerId, a);
    assert.equal(state.players.get(a)!.scrap, scrap0 - catalog("trench").cost);
    assert.equal(eng.state, "idle");
  });

  it("blocks no one: infantry and tanks both cross it", () => {
    const { state, a } = twoPlayerMatch();
    const trench = trenchAt(state, a);
    step(state, TICK_DT);
    const tx = worldToTile(trench.x, state.tileSize);
    const ty = worldToTile(trench.y, state.tileSize);
    assert.equal(state.fortBlock[tileIndex(state, tx, ty)], 0);
    assert.equal(walkable(state, tx, ty, "rifleman"), true);
    assert.equal(walkable(state, tx, ty, "warden"), true);
  });

  it("holds one man from the bunker roster, and the mortarman too", () => {
    const { state, a } = twoPlayerMatch();
    assert.deepEqual([...TRENCH_TYPES].sort(), [...BUNKER_TYPES, "mortarman"].sort());
    for (const type of TRENCH_TYPES) {
      const trench = trenchAt(state, a);
      assert.equal(canGarrison(state, trooper(state, type, a), trench), null, `${type} may enter`);
    }
    for (const type of ["cyborg", "droneop"] as EntityType[]) {
      const trench = trenchAt(state, a);
      assert.notEqual(canGarrison(state, trooper(state, type, a), trench), null, `${type} must not enter`);
    }
    const trench = trenchAt(state, a);
    assert.equal(enterGarrison(state, trooper(state, "mortarman", a), trench), true);
    assert.equal(enterGarrison(state, trooper(state, "rifleman", a), trench), false, "one man only");
  });

  it("walks a soldier in on a cmd.garrison order", () => {
    const { state, a } = twoPlayerMatch();
    const trench = trenchAt(state, a);
    const r = trooper(state, "rifleman", a, 26, 30);
    const res = applyCommand(state, a, { type: "cmd.garrison", ids: [r.id], buildingId: trench.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 200);
    assert.equal(r.garrisonedIn, trench.id);
  });

  it("gives moderate protection: less than a bunker, more than the open", () => {
    const { state, a } = twoPlayerMatch();
    const trench = trenchAt(state, a);
    const r = trooper(state, "rifleman", a);
    const open = r.hpMax;
    assert.equal(enterGarrison(state, r, trench), true);
    assert.equal(r.hpMax, open * TRENCH_GARRISON_HP_MUL);
    assert.ok(TRENCH_GARRISON_HP_MUL > 1 && TRENCH_GARRISON_HP_MUL < BUNKER_GARRISON_HP_MUL);
    assert.ok(TRENCH_WOUND_MUL < 1 && TRENCH_WOUND_MUL > BUNKER_WOUND_MUL);
    for (let i = 0; i < 20; i++) {
      const before = r.hp;
      woundGarrison(state, trench, 50, 7.92);
      const took = before - r.hp;
      assert.ok(took >= 1 && took <= Math.ceil(50 * TRENCH_WOUND_MUL * 1.1), `took ${took}`);
      r.hp = r.hpMax;
    }
    assert.ok(coverHeightOf("trench") < coverHeightOf("bunker"), "lower than a bunker");
    const sight = sightTilesForEntity(state, trooper(state, "rifleman", a, 40, 30));
    assert.equal(sightTilesForEntity(state, r), sight, "no sight bonus from a hole");
  });

  it("lets a mortarman fire from it, which no roofed building does", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const trench = trenchAt(state, a);
    const m = trooper(state, "mortarman", a);
    assert.equal(enterGarrison(state, m, trench), true);
    const dummy = makeEntity(state, "hauler", b, m.x + ts * (MORTAR_MIN_RANGE_TILES + 6), m.y);
    dummy.autoHarvest = false;
    m.order = { kind: "attack", targetId: dummy.id };
    tickCombat(state, TICK_DT);
    assert.ok(state.projectiles.some((p) => p.flight === "mortar"), "a bomb leaves the trench");
  });

  it("lets the gunner lay his MG on the parapet", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const trench = trenchAt(state, a);
    const g = trooper(state, "gunner", a);
    assert.equal(enterGarrison(state, g, trench), true);
    const dummy = makeEntity(state, "hauler", b, g.x + ts * 10, g.y);
    dummy.autoHarvest = false;
    g.order = { kind: "attack", targetId: dummy.id };
    tickCombat(state, TICK_DT);
    assert.ok(state.projectiles.length > 0);
    assert.equal(state.projectiles[0]!.ignoreId, trench.id);
  });

  it("keeps the enemy out while empty, and is not worth a tank round until someone is in it", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const trench = trenchAt(state, a);
    assert.notEqual(canGarrison(state, trooper(state, "rifleman", b), trench), null);
    // Park A's rig out of the tank's reach, so the trench is the only thing to shoot at.
    for (const e of state.entities.values()) {
      if (e.type !== "rig") continue;
      e.x = tileCenter(state.width - 3, ts);
      e.y = tileCenter(2, ts);
      e.tileX = state.width - 3;
      e.tileY = 2;
    }
    const tank = makeEntity(state, "warden", b, trench.x + ts * 14, trench.y);
    tank.facing = Math.PI;
    ticks(state, 12);
    assert.notEqual(tank.attackTarget, trench.id, "empty trench is ignored");
    assert.equal(enterGarrison(state, trooper(state, "rifleman", a), trench), true);
    ticks(state, 12);
    assert.ok(
      tank.attackTarget === trench.id || tank.order?.targetId === trench.id,
      `tank should engage the manned trench, target=${tank.attackTarget} ${state.entities.get(tank.attackTarget ?? -1)?.type} ${state.entities.get(tank.attackTarget ?? -1)?.ownerId}`,
    );
  });

  it("spills its man when it is destroyed", () => {
    const { state, a } = twoPlayerMatch();
    const trench = trenchAt(state, a);
    const r = trooper(state, "rifleman", a);
    assert.equal(enterGarrison(state, r, trench), true);
    trench.hp = 0;
    ticks(state, 2);
    assert.equal(r.garrisonedIn, null);
  });
});
