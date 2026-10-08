import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUILDING_TYPES,
  DAY_SECONDS,
  DUSK_SECONDS,
  GUN_CREW_TYPE,
  NIGHT_SECONDS,
  SPOTLIGHT_POST_COST,
  SPOTLIGHT_POST_WOUND_MUL,
  SPOTLIGHT_REACH_TILES,
  SPOTLIGHT_TURN_DEG_PER_SEC,
  TICK_DT,
  TOWER_WOUND_MUL,
  catalog,
  garrisonCapOf,
  isDefenceStructure,
  isRotatableBuilding,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { raiseBuilding } from "./build.js";
import { applyCommand } from "./commands.js";
import { makeEntity } from "./geo.js";
import { enterGarrison, livingGarrison, woundGarrison } from "./garrison.js";
import { createMatch, step } from "./match.js";
import { hasSpotlight, spotFacingOf, spotlightLit, tickSpotlights } from "./night.js";
import { snapshotFor } from "./snapshot.js";
import { visionMask } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

const NIGHT_TICK = Math.round((DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS / 2) / TICK_DT);

/** Flat, empty ground with nobody on it but what the test places. */
function emptyField(): MatchState {
  const r = createRoom({ id: "SPOT", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.entities.clear();
  state.heights.fill(0);
  state.blocked.fill(0);
  state.occupy.fill(0);
  state.terrain.fill(TILE_EMPTY);
  return state;
}

/** A's post in the middle of the field, turned to `facing` before it was placed. */
function post(state: MatchState, facing = 0): Entity {
  return raiseBuilding(state, "A", "spotlight", 128, 128, facing);
}

function man(state: MatchState, p: Entity): Entity {
  const crew = livingGarrison(state, p);
  assert.equal(crew.length, 1);
  return crew[0]!;
}

/** Ground straight down the beam, inside its reach and well past the dark sight ring. */
function beamLit(state: MatchState, p: Entity, facing = 0): boolean {
  const far = SPOTLIGHT_REACH_TILES - 6;
  const tx = Math.floor(p.x / state.tileSize + Math.cos(facing) * far);
  const ty = Math.floor(p.y / state.tileSize + Math.sin(facing) * far);
  return visionMask(state, "A")[ty * state.width + tx] === 1;
}

describe("spotlight post", () => {
  it("is a 150-scrap defence, turned before placing, for one man", () => {
    const def = catalog("spotlight");
    assert.ok(BUILDING_TYPES.includes("spotlight"));
    assert.equal(def.cost, SPOTLIGHT_POST_COST);
    assert.equal(def.cost, 150);
    assert.equal(isDefenceStructure("spotlight"), true);
    assert.equal(isRotatableBuilding("spotlight"), true);
    assert.equal(garrisonCapOf("spotlight"), 1);
    assert.equal(hasSpotlight("spotlight"), true);
    assert.ok(SPOTLIGHT_POST_WOUND_MUL > TOWER_WOUND_MUL, "a few sandbags stop less than a tower cab");
  });

  it("comes with its man, and its lamp first looks the way it was turned", () => {
    const state = emptyField();
    const p = post(state, Math.PI / 2);
    assert.equal(man(state, p).type, GUN_CREW_TYPE);
    assert.equal(man(state, p).ownerId, "A");
    assert.equal(spotFacingOf(p), Math.PI / 2);
  });

  it("lights the ground down its beam at night, from its pole", () => {
    const state = emptyField();
    const p = post(state);
    assert.equal(beamLit(state, p), false, "nothing by day");
    state.tick = NIGHT_TICK;
    assert.equal(beamLit(state, p), true);
    assert.equal(beamLit(state, p, Math.PI / 2), false, "dark off the beam");
  });

  it("goes dark when a bullet smashes the lamp, and the man stays at it", () => {
    const state = emptyField();
    const p = post(state);
    state.tick = NIGHT_TICK;
    const m = man(state, p);
    p.crits.push("lamp");
    state.visionTick = -1;
    assert.equal(beamLit(state, p), false);
    assert.equal(m.hp > 0, true);
    assert.equal(livingGarrison(state, p).length, 1, "the man is untouched");
  });

  it("goes dark when its man is killed, holds its heading, and burns again for the next man", () => {
    const state = emptyField();
    const p = post(state);
    state.tick = NIGHT_TICK;
    const hpBefore = p.hp;
    const m = man(state, p);
    for (let i = 0; i < 200 && m.hp > 0; i++) woundGarrison(state, p, 60, 7.92);
    step(state, TICK_DT);
    assert.equal(livingGarrison(state, p).length, 0, "the man fell");
    assert.ok(p.hp > 0 && p.hp === hpBefore, "the pole and lamp still stand");
    assert.equal(p.crits.includes("lamp"), false);
    assert.equal(spotlightLit(p), false);
    assert.equal(beamLit(state, p), false, "dark with nobody at it");
    const view = snapshotFor(state, "A").entities.find((e) => e.id === p.id);
    assert.equal(view?.spotFacing, undefined, "no lamp heading to turn");
    assert.equal(applyCommand(state, "A", { type: "cmd.rotate", ids: [p.id], x: p.x, y: p.y + 500 }).ok, false, "nobody to turn it");

    const next = makeEntity(state, "rifleman", "A", p.x - 40, p.y);
    assert.equal(enterGarrison(state, next, p), true);
    state.visionTick = -1;
    assert.equal(spotlightLit(p), true);
    assert.equal(beamLit(state, p), true, "lit again where it was left");
  });

  it("swings to a Rotate at the lamp's own pace", () => {
    const state = emptyField();
    const p = post(state);
    assert.equal(applyCommand(state, "A", { type: "cmd.rotate", ids: [p.id], x: p.x, y: p.y + 500 }).ok, true);
    tickSpotlights(state, TICK_DT);
    const stepRad = (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT * Math.PI) / 180;
    assert.ok(Math.abs(p.spotFacing! - stepRad) < 1e-9, "one tick of swing, not a snap");
    const settle = Math.ceil(90 / (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT)) + 2;
    for (let i = 0; i < settle; i++) tickSpotlights(state, TICK_DT);
    assert.ok(Math.abs(p.spotFacing! - Math.PI / 2) < 1e-9);
  });

  it("sweeps between patrol spots and stays put", () => {
    const state = emptyField();
    const p = post(state);
    const ts = state.tileSize;
    const x0 = p.x;
    const y0 = p.y;
    const south = { x: p.x, y: p.y + ts * 20 };
    const west = { x: p.x - ts * 20, y: p.y };
    assert.equal(applyCommand(state, "B", { type: "cmd.patrol", ids: [p.id], points: [south, west] }).ok, false, "not B's");
    assert.equal(applyCommand(state, "A", { type: "cmd.patrol", ids: [p.id], points: [south, west] }).ok, true);
    assert.equal(p.order?.kind, "patrol");
    let swungWest = false;
    const sweep = Math.ceil(200 / (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT)) + 2;
    for (let i = 0; i < sweep; i++) {
      step(state, TICK_DT);
      const f = p.spotFacing!;
      if (Math.abs(Math.abs(f) - Math.PI) < 0.15) swungWest = true;
    }
    assert.equal(swungWest, true, "turns on to the second spot");
    assert.equal(p.x, x0);
    assert.equal(p.y, y0);
  });

  it("passes most of a hit on the post to the man, apart from the pole", () => {
    const state = emptyField();
    const p = post(state);
    const m = man(state, p);
    for (let i = 0; i < 20; i++) {
      const before = m.hp;
      woundGarrison(state, p, 40, 7.92);
      const took = before - m.hp;
      assert.ok(took >= 1 && took <= Math.ceil(40 * SPOTLIGHT_POST_WOUND_MUL * 1.1), `took ${took}`);
      m.hp = m.hpMax;
    }
  });
});
