import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEIGHT_RANGE_BONUS,
  HEIGHT_SIGHT_BONUS,
  INFANTRY_EYE_HEIGHT,
  TICK_DT,
  TILE_SUBDIV,
  catalog,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  hasTerrainLos,
  observerEyeOf,
  rangeTilesOf,
  sightTilesOf,
  slopeCostMul,
  slopeSpeedMul,
  uphillSightOf,
} from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { tickMovement } from "./orders.js";
import { tickCombat } from "./combat.js";
import { paintEntitySight } from "./vision.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "T1",
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
  const state = createMatch(room, started.value);
  return { state, a: "A", b: "B" };
}

describe("slope multipliers", () => {
  it("slows climbs and speeds descents", () => {
    assert.equal(slopeSpeedMul(0), 1);
    assert.ok(slopeSpeedMul(1) < 1);
    assert.ok(slopeSpeedMul(-1) > 1);
    assert.ok(slopeCostMul(1) > 1);
    assert.ok(slopeCostMul(-1) < 1);
  });
});

describe("high ground bonuses", () => {
  it("adds sight and weapon range per elevation", () => {
    const trooper = catalog("trooper");
    assert.equal(sightTilesOf("trooper", 0), trooper.sightTiles);
    assert.equal(sightTilesOf("trooper", 2), trooper.sightTiles + 2 * HEIGHT_SIGHT_BONUS);
    assert.equal(rangeTilesOf("trooper", 1), trooper.rangeTiles + HEIGHT_RANGE_BONUS);
    assert.equal(rangeTilesOf("hauler", 3), 0);
  });

  it("gives infantry more fog reach than a tank", () => {
    assert.ok(catalog("trooper").sightTiles > catalog("warden").sightTiles);
    assert.equal(observerEyeOf("trooper"), INFANTRY_EYE_HEIGHT);
    assert.equal(observerEyeOf("warden"), 0);
    assert.ok(uphillSightOf("trooper") > uphillSightOf("warden"));
  });
});

describe("terrain line of sight", () => {
  it("lets a hilltop see across a valley", () => {
    const elev = [2, 0, 0, 0, 0];
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0), true);
  });

  it("blocks looking past a taller ridge", () => {
    const elev = [0, 0, 2, 0, 0];
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0), false);
  });

  it("still lets you see the hillside itself", () => {
    const elev = [0, 1, 2];
    assert.equal(hasTerrainLos(elev, 3, 1, 0, 0, 2, 0), true);
  });

  it("lets infantry peek over a rise that hides a hull", () => {
    const ridge = INFANTRY_EYE_HEIGHT;
    const elev = [0, 0, ridge, 0, 0];
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0), false);
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0, INFANTRY_EYE_HEIGHT), true);
  });
});

describe("movement on slopes", () => {
  it("covers less ground going uphill than on the flat", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const from = { x: tileCenter(10, ts), y: tileCenter(10, ts) };
    const dest = { x: tileCenter(11, ts), y: tileCenter(10, ts) };
    const flat = makeEntity(state, "trooper", a, from.x, from.y);
    flat.facing = Math.atan2(dest.y - from.y, dest.x - from.x);
    flat.waypoints = [{ x: dest.x, y: dest.y }];
    tickMovement(state, TICK_DT);
    const flatDist = Math.hypot(flat.x - from.x, flat.y - from.y);

    state.heights[10 * state.width + 11] = 1;
    const up = makeEntity(state, "trooper", a, from.x, from.y);
    up.facing = flat.facing;
    up.waypoints = [{ x: dest.x, y: dest.y }];
    tickMovement(state, TICK_DT);
    const upDist = Math.hypot(up.x - from.x, up.y - from.y);
    assert.ok(flatDist > 1, `flat moved ${flatDist}`);
    assert.ok(upDist < flatDist * 0.95, `uphill ${upDist} vs flat ${flatDist}`);
  });
});

describe("vision and range on a hill", () => {
  it("paints a wider sight disc from high ground", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const e = makeEntity(state, "trooper", a, tileCenter(20, ts), tileCenter(20, ts));
    const flat = new Uint8Array(state.width * state.height);
    paintEntitySight(flat, state.width, state.height, ts, e, state.heights);
    let flatN = 0;
    for (const v of flat) if (v) flatN++;

    state.heights[20 * state.width + 20] = 2;
    const high = new Uint8Array(state.width * state.height);
    paintEntitySight(high, state.width, state.height, ts, e, state.heights);
    let highN = 0;
    for (const v of high) if (v) highN++;
    assert.ok(highN > flatN, `high ${highN} vs flat ${flatN}`);
  });

  it("lets a hilltop trooper fire past flat max range", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const extra = TILE_SUBDIV;
    const shooter = makeEntity(state, "trooper", a, tileCenter(12, ts), tileCenter(12, ts));
    const past = catalog("trooper").rangeTiles + extra;
    const target = makeEntity(state, "trooper", b, tileCenter(12 + past, ts), tileCenter(12, ts));
    shooter.facing = 0;
    shooter.order = { kind: "attack", targetId: target.id };
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.length, 0);

    state.heights[12 * state.width + 12] = extra;
    shooter.cooldown = 0;
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.length, 1);
  });
});
