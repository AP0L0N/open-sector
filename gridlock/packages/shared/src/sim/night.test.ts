import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  DAY_SECONDS,
  DUSK_SECONDS,
  NEUTRAL_OWNER,
  NIGHT_REACH_MUL,
  NIGHT_SECONDS,
  SPOTLIGHT_REACH_TILES,
  SPOTLIGHT_TURN_DEG_PER_SEC,
  TICK_DT,
  catalog,
  type EntityType,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { sightTilesForEntity, weaponRangeWorld } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { DAY_CYCLE_SECONDS, daylightAt, nightReachMul, nightTiles, spotlightsOn, tickSpotlights } from "./night.js";
import { snapshotFor } from "./snapshot.js";
import { visionMask } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

const NIGHT_TICK = Math.round((DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS / 2) / TICK_DT);
const DUSK_MID_TICK = Math.round((DAY_SECONDS + DUSK_SECONDS / 2) / TICK_DT);

/** Flat, empty ground with nobody on it but what the test places. */
function emptyField(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "NT", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.entities.clear();
  state.heights.fill(0);
  state.blocked.fill(0);
  state.occupy.fill(0);
  state.terrain.fill(TILE_EMPTY);
  return { state, a: "A", b: "B" };
}

function trooper(state: MatchState, type: EntityType, owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

function towerAt(state: MatchState, owner: string, tx: number, ty: number): Entity {
  const def = catalog("tower");
  const ts = state.tileSize;
  return makeEntity(state, "tower", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function lit(state: MatchState, playerId: string, x: number, y: number): boolean {
  return visionMask(state, playerId)[y * state.width + x] === 1;
}

describe("day and night", () => {
  it("opens in daylight, darkens through dusk, and comes round again", () => {
    assert.equal(daylightAt(0), 1);
    assert.equal(daylightAt(Math.round((DAY_SECONDS - 1) / TICK_DT)), 1);
    const dusk = daylightAt(DUSK_MID_TICK);
    assert.ok(dusk > 0.4 && dusk < 0.6, `mid-dusk daylight ${dusk}`);
    assert.equal(daylightAt(NIGHT_TICK), 0);
    assert.equal(daylightAt(Math.round(DAY_CYCLE_SECONDS / TICK_DT) + 5), 1, "the next morning");
    assert.equal(nightReachMul(0), 1);
    assert.equal(nightReachMul(NIGHT_TICK), NIGHT_REACH_MUL);
    assert.equal(spotlightsOn(0), false);
    assert.equal(spotlightsOn(NIGHT_TICK), true);
  });

  it("halves weapon reach in full dark", () => {
    const { state, a } = emptyField();
    const rifle = trooper(state, "rifleman", a, 100, 100);
    const day = weaponRangeWorld(state, rifle);
    state.tick = NIGHT_TICK;
    assert.ok(Math.abs(weaponRangeWorld(state, rifle) - day * NIGHT_REACH_MUL) < 1e-6);
  });

  it("halves a soldier's sight ring in full dark", () => {
    const { state, a } = emptyField();
    const rifle = trooper(state, "rifleman", a, 100, 128);
    const r = sightTilesForEntity(state, rifle);
    const half = nightTiles(r, NIGHT_REACH_MUL);
    assert.equal(half, Math.round(r / 2));
    assert.equal(lit(state, a, 100 + r - 2, 128), true, "seen by day");
    state.tick = NIGHT_TICK;
    assert.equal(lit(state, a, 100 + r - 2, 128), false, "lost in the dark");
    assert.equal(lit(state, a, 100 + half - 2, 128), true, "close ground still seen");
  });
});

describe("watch tower spotlight", () => {
  it("lights ground down the beam past the dark sight ring, and nothing beside it", () => {
    const { state, a } = emptyField();
    const tower = towerAt(state, a, 60, 128);
    tower.spotFacing = 0;
    const ox = tower.tileX + Math.floor(tower.tileW / 2);
    const oy = tower.tileY + Math.floor(tower.tileH / 2);
    const far = SPOTLIGHT_REACH_TILES - 6;
    assert.equal(lit(state, a, ox + far, oy), false, "a lamp does nothing by day");
    state.tick = NIGHT_TICK;
    assert.equal(lit(state, a, ox + far, oy), true, "lit down the beam");
    assert.equal(lit(state, a, ox, oy + far), false, "dark off the beam");
    assert.equal(lit(state, a, ox + SPOTLIGHT_REACH_TILES + 6, oy), false, "dark past the beam's reach");
  });

  it("swings to the Rotate heading at its own pace", () => {
    const { state, a } = emptyField();
    const tower = towerAt(state, a, 60, 60);
    tower.spotFacing = 0;
    const ok = applyCommand(state, a, { type: "cmd.rotate", ids: [tower.id], x: tower.x, y: tower.y + 500 });
    assert.equal(ok.ok, true);
    tickSpotlights(state, TICK_DT);
    const step = (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT * Math.PI) / 180;
    assert.ok(Math.abs(tower.spotFacing! - step) < 1e-9, "one tick of swing, not a snap");
    for (let i = 0; i < 40; i++) tickSpotlights(state, TICK_DT);
    assert.ok(Math.abs(tower.spotFacing! - Math.PI / 2) < 1e-9, "settles on the heading");
    assert.equal(tower.spotAim, undefined);
  });

  it("follows the beam into the night fog once it swings", () => {
    const { state, a } = emptyField();
    const tower = towerAt(state, a, 60, 60);
    tower.spotFacing = 0;
    state.tick = NIGHT_TICK;
    const ox = tower.tileX + Math.floor(tower.tileW / 2);
    const oy = tower.tileY + Math.floor(tower.tileH / 2);
    const far = SPOTLIGHT_REACH_TILES - 6;
    assert.equal(lit(state, a, ox, oy + far), false);
    applyCommand(state, a, { type: "cmd.rotate", ids: [tower.id], x: tower.x, y: tower.y + 500 });
    for (let i = 0; i < 40; i++) tickSpotlights(state, TICK_DT);
    assert.equal(lit(state, a, ox, oy + far), true, "the new heading is lit");
    assert.equal(lit(state, a, ox + far, oy), false, "the old one went dark");
  });

  it("stays dark on a neutral tower, and the snapshot carries a held lamp's heading", () => {
    const { state, a, b } = emptyField();
    const neutral = towerAt(state, NEUTRAL_OWNER, 60, 60);
    const held = towerAt(state, a, 120, 60);
    held.spotFacing = 1.25;
    assert.equal(applyCommand(state, b, { type: "cmd.rotate", ids: [held.id], x: 0, y: 0 }).ok, false, "not B's lamp");
    tickSpotlights(state, TICK_DT);
    assert.equal(neutral.spotFacing, undefined);
    const view = snapshotFor(state, a).entities.find((e) => e.id === held.id);
    assert.equal(view?.spotFacing, 1.25);
    const gone = snapshotFor(state, a).entities.find((e) => e.id === neutral.id);
    assert.equal(gone?.spotFacing, undefined);
  });
});
