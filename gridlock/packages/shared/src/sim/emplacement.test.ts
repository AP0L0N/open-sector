import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUNKER_GARRISON_CAP,
  CREWED_GUNS,
  GUN_CREW_TYPE,
  NEUTRAL_OWNER,
  TICK_DT,
  TILE_SUBDIV,
  TOWER_GARRISON_CAP,
  TOWER_SIGHT_BONUS,
  catalog,
  garrisonCapOf,
  isCivilianType,
  isDefenceStructure,
  isRotatableBuilding,
  type BuildingType,
} from "../catalog.js";
import { TILE_EMPTY, MAP_DEFENCE_TYPES, getMap, registerMap, type MapFeature } from "../maps.js";
import { raiseBuilding } from "./build.js";
import { garrisonCanShoot, inMountArc } from "./combat.js";
import { reachesAircraft } from "./air.js";
import { destroyEntity, makeEntity } from "./geo.js";
import { enterGarrison, exitGarrison, livingGarrison } from "./garrison.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "EMP1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  // Flat, open ground in the middle of the map: nothing blocks sight or shots.
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
  for (let y = 70; y <= 190; y++) {
    for (let x = 70; x <= 190; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
  return state;
}

/** A gun of A's raised in the middle of the field, facing east unless turned. */
function gun(state: MatchState, type: BuildingType, facing = 0): Entity {
  return raiseBuilding(state, "A", type, 128, 128, facing);
}

function foe(state: MatchState, type: "rifleman" | "ss3", at: Entity, dx: number, dy: number): Entity {
  const ts = state.tileSize;
  const e = makeEntity(state, type, "B", at.x + dx * ts, at.y + dy * ts);
  e.holdPosition = true;
  return e;
}

/** The gun has let a round go: its cooldown, belt change, or belt shows it. Rounds resolve within the tick. */
function shotsFrom(_state: MatchState, e: Entity): number {
  const belt = catalog(e.type).belt;
  return e.cooldown > 0 || e.reload > 0 || (belt != null && e.clip < belt) ? 1 : 0;
}

/** Steps until `done` or `ticks` run out; true when it came true. */
function until(state: MatchState, ticks: number, done: () => boolean): boolean {
  for (let i = 0; i < ticks; i++) {
    step(state, TICK_DT);
    if (done()) return true;
  }
  return false;
}

describe("new bunkers and towers", () => {
  it("differ from the Bunker and Watch Tower in room, cover, and sight", () => {
    assert.ok(garrisonCapOf("tobruk") < BUNKER_GARRISON_CAP);
    assert.ok(garrisonCapOf("casemate") > BUNKER_GARRISON_CAP);
    assert.ok(catalog("casemate").hp > catalog("bunker").hp);
    assert.ok((catalog("casemate").garrisonWoundMul ?? 1) < (catalog("bunker").garrisonWoundMul ?? 1));
    assert.equal(catalog("tobruk").garrisonOpenTop, true, "the ring-stand is open to the sky");
    assert.ok(catalog("tobruk").garrisonTypes?.includes("mortarman"));
    assert.ok(garrisonCapOf("hochstand") < TOWER_GARRISON_CAP);
    assert.ok((catalog("hochstand").garrisonSightBonus ?? 0) > TOWER_SIGHT_BONUS, "the lookout sees farthest");
    assert.ok(garrisonCapOf("leitturm") > TOWER_GARRISON_CAP);
    assert.ok((catalog("leitturm").garrisonReachBonus ?? 0) > (catalog("tower").garrisonReachBonus ?? 0));
  });

  it("are Defences-tab structures the player turns before placing, as are every gun, the CIWS, and the RAM", () => {
    for (const type of ["tobruk", "casemate", "hochstand", "leitturm", ...CREWED_GUNS, "ciws", "ram"] as BuildingType[]) {
      assert.ok(isRotatableBuilding(type), type);
      assert.ok(isDefenceStructure(type), type);
    }
  });

  it("are all map defences", () => {
    for (const type of ["tobruk", "casemate", "hochstand", "leitturm", ...CREWED_GUNS]) {
      assert.ok((MAP_DEFENCE_TYPES as readonly string[]).includes(type), type);
    }
  });
});

describe("crewed guns", () => {
  it("go up with their crew at them: one man at the MG and the Pak 36, two at the Pak 43 and the Flak", () => {
    const state = match();
    const want: Record<string, number> = { mgnest: 1, pak36: 1, pak43: 2, flak: 2 };
    let tx = 100;
    for (const type of CREWED_GUNS) {
      const g = raiseBuilding(state, "A", type, tx, 100, 0);
      tx += 20;
      const crew = livingGarrison(state, g);
      assert.equal(crew.length, want[type], type);
      for (const u of crew) {
        assert.equal(u.type, GUN_CREW_TYPE);
        assert.equal(u.ownerId, "A");
      }
    }
  });

  it("fire only while someone is at them; the crew's own rifles stay slung", () => {
    const state = match();
    const nest = gun(state, "mgnest");
    const [man] = livingGarrison(state, nest);
    assert.ok(man);
    assert.equal(garrisonCanShoot(state, man, nest), false);
    assert.ok(exitGarrison(state, man));
    const target = foe(state, "rifleman", nest, 8, 0);
    assert.equal(until(state, 40, () => shotsFrom(state, nest) > 0), false, "an empty nest is silent");
    const hand = makeEntity(state, "rifleman", "A", man.x, man.y);
    destroyEntity(state, man);
    assert.ok(enterGarrison(state, hand, nest), "another soldier takes his place");
    assert.ok(until(state, 60, () => shotsFrom(state, nest) > 0), "manned again, it opens up");
    assert.ok(target.hp < target.hpMax || !state.entities.has(target.id));
  });

  it("leave alone what stands behind their traverse", () => {
    const state = match();
    const nest = gun(state, "mgnest");
    assert.ok(inMountArc(nest, nest.x + 50, nest.y));
    assert.ok(!inMountArc(nest, nest.x - 50, nest.y));
    foe(state, "rifleman", nest, -8, 0);
    assert.equal(until(state, 60, () => shotsFrom(state, nest) > 0), false, "a soldier behind it is safe");
    foe(state, "rifleman", nest, 8, 2);
    assert.ok(until(state, 60, () => shotsFrom(state, nest) > 0), "one in front draws fire");
    const off = Math.abs(nest.turretFacing - nest.facing);
    assert.ok(off <= (catalog("mgnest").mountArcDeg! * Math.PI) / 180 + 1e-6);
  });

  it("an AT gun picks the tank over a nearer soldier", () => {
    const state = match();
    const pak = gun(state, "pak43");
    foe(state, "rifleman", pak, 6, 0);
    const tank = foe(state, "ss3", pak, 12, 0);
    assert.ok(until(state, 200, () => shotsFrom(state, pak) > 0));
    assert.equal(pak.attackTarget, tank.id);
  });

  it("short-handed, a two-man gun loads at half pace", () => {
    const full = match();
    const a = gun(full, "pak43");
    foe(full, "ss3", a, 12, 0);
    assert.ok(until(full, 200, () => shotsFrom(full, a) > 0));
    const fullCooldown = a.cooldown;
    const lone = match();
    const b = gun(lone, "pak43");
    const [first] = livingGarrison(lone, b);
    assert.ok(first && exitGarrison(lone, first));
    foe(lone, "ss3", b, 12, 0);
    assert.ok(until(lone, 200, () => shotsFrom(lone, b) > 0));
    assert.ok(Math.abs(b.cooldown - fullCooldown * 2) < 0.05, `${b.cooldown} vs ${fullCooldown}`);
  });

  it("only the Flak and the MG reach a plane", () => {
    const state = match();
    for (const [type, aa] of [
      ["flak", true],
      ["mgnest", true],
      ["pak36", false],
      ["pak43", false],
    ] as [BuildingType, boolean][]) {
      const g = makeEntity(state, type, "A", 100, 100);
      assert.equal(reachesAircraft(g), aa, type);
    }
  });
});

describe("crewed guns on a map", () => {
  it("stand neutral with neutral crews", () => {
    const yard = getMap("yard-64")!;
    const id = `yard-guns-${Math.random().toString(36).slice(2, 8)}`;
    const mid = 32 * TILE_SUBDIV;
    const features: MapFeature[] = [
      { type: "flak", x: mid, y: mid, facing: 0 },
      { type: "mgnest", x: mid + 20, y: mid, facing: 0, turn: 6 },
    ];
    registerMap({ ...yard, id, tiles: yard.tiles.map(() => TILE_EMPTY), heights: yard.heights.map(() => 0), maxHeight: 0, features });
    const r = createRoom({ id: "EMP2", hostId: "A", hostName: "Alpha", mapId: id, maxSlots: 8 });
    if (!r.ok) throw new Error(r.message);
    assert.equal(joinRoom(r.value, "B", "Bravo").ok, true);
    updateSelf(r.value, "A", { ready: true, spawnId: 1 });
    updateSelf(r.value, "B", { ready: true, spawnId: 4 });
    const started = startMatch(r.value, "A", () => 0);
    if (!started.ok) throw new Error(started.message);
    const state = createMatch(r.value, started.value);
    const flak = [...state.entities.values()].find((e) => e.type === "flak")!;
    const nest = [...state.entities.values()].find((e) => e.type === "mgnest")!;
    assert.equal(livingGarrison(state, flak).length, 2);
    assert.equal(livingGarrison(state, nest).length, 1);
    for (const u of [...livingGarrison(state, flak), ...livingGarrison(state, nest)]) assert.equal(u.ownerId, NEUTRAL_OWNER);
    assert.ok(Math.abs(nest.facing - Math.PI / 2) < 1e-6, "turned to face south");
  });
});
