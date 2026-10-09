import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMANDER_SCAN_RANGE_TILES,
  THERMAL_HALF_DEG,
  THERMAL_RANGE_TILES,
  isCivilianType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { thermalContacts } from "./thermal.js";
import type { Entity, MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "TH", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
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
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type) || e.type === "rig") destroyEntity(state, e);
  }
  return { state, a: "A", b: "B" };
}

/** A unit `tiles` tiles from (x, y) along `deg`. */
function at(state: MatchState, type: Entity["type"], owner: string, x: number, y: number, deg: number, tiles: number): Entity {
  const a = (deg * Math.PI) / 180;
  const d = tiles * state.tileSize;
  return makeEntity(state, type, owner, x + Math.cos(a) * d, y + Math.sin(a) * d);
}

/** Contact ids `playerId` reads with nothing on the fog mask. */
function blindIds(state: MatchState, playerId: string): Map<number, boolean> {
  const blind = new Uint8Array(state.width * state.height);
  return new Map(thermalContacts(state, playerId, blind).map((c) => [c.id, !!c.armored]));
}

describe("Cyborg thermal scanner", () => {
  it("picks up enemy soldiers in a cone off his facing, out to its range", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const cy = makeEntity(state, "cyborg", a, x, y);
    cy.facing = 0;
    const ahead = at(state, "rifleman", b, x, y, 0, THERMAL_RANGE_TILES * 0.8);
    const edge = at(state, "gunner", b, x, y, THERMAL_HALF_DEG - 5, THERMAL_RANGE_TILES * 0.6);
    const wide = at(state, "rifleman", b, x, y, THERMAL_HALF_DEG + 10, THERMAL_RANGE_TILES * 0.6);
    const behind = at(state, "rifleman", b, x, y, 180, THERMAL_RANGE_TILES * 0.5);
    const far = at(state, "rifleman", b, x, y, 0, THERMAL_RANGE_TILES * 1.1);
    const tank = at(state, "ss3", b, x, y, -10, THERMAL_RANGE_TILES * 0.6);
    const own = at(state, "rifleman", a, x, y, 5, THERMAL_RANGE_TILES * 0.5);
    const ids = blindIds(state, a);
    assert.equal(ids.get(ahead.id), false);
    assert.equal(ids.get(edge.id), false);
    for (const missed of [wide, behind, far, tank, own]) assert.equal(ids.has(missed.id), false, `${missed.type} not read`);
  });

  it("marks nothing the side already sees", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const cy = makeEntity(state, "cyborg", a, x, y);
    cy.facing = 0;
    at(state, "rifleman", b, x, y, 0, THERMAL_RANGE_TILES * 0.5);
    const seen = new Uint8Array(state.width * state.height).fill(1);
    assert.deepEqual(thermalContacts(state, a, seen), []);
  });
});

describe("Cyborg Commander thermal and APS radar", () => {
  it("reads soldiers and armored hulls all round him, hulls marked armored", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(30, ts);
    const y = tileCenter(60, ts);
    makeEntity(state, "cyborgcommander", a, x, y).facing = 0;
    const behind = at(state, "rifleman", b, x, y, 180, COMMANDER_SCAN_RANGE_TILES * 0.8);
    const tankSide = at(state, "ss3", b, x, y, 90, COMMANDER_SCAN_RANGE_TILES * 0.7);
    const tankBack = at(state, "titan", b, x, y, 200, COMMANDER_SCAN_RANGE_TILES * 0.5);
    const far = at(state, "ss3", b, x, y, 0, COMMANDER_SCAN_RANGE_TILES * 1.1);
    const ids = blindIds(state, a);
    assert.equal(ids.get(behind.id), false);
    assert.equal(ids.get(tankSide.id), true);
    assert.equal(ids.get(tankBack.id), true);
    assert.equal(ids.has(far.id), false);
  });

  it("goes out to the owner's snapshot past his sight, and not to the enemy's", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(30, ts);
    const y = tileCenter(60, ts);
    makeEntity(state, "cyborgcommander", a, x, y);
    const tank = at(state, "ss3", b, x, y, 0, COMMANDER_SCAN_RANGE_TILES - 0.3);
    const mine = snapshotFor(state, a);
    assert.equal(mine.entities.some((e) => e.id === tank.id), false, "past his sight");
    assert.deepEqual(mine.thermal, [{ id: tank.id, x: Math.round(tank.x), y: Math.round(tank.y), armored: true }]);
    assert.equal(snapshotFor(state, b).thermal, undefined);
  });
});
