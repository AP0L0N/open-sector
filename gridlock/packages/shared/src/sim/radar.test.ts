import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { AIR_CRUISE_ALT, RADAR_RANGE_TILES, catalog, isBuildingType, type EntityType } from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, newAirState, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { radarContacts, radarOnline } from "./radar.js";
import { snapshotFor } from "./snapshot.js";
import { visionMask } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

/** Flat, empty ground with nobody on it but what the test places. */
function emptyField(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "RDR", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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
  state.scrapYield.fill(0);
  state.terrain.fill(TILE_EMPTY);
  return { state, a: "A", b: "B" };
}

function structureAt(state: MatchState, type: EntityType, owner: string, tx: number, ty: number): Entity {
  const def = catalog(type);
  const ts = state.tileSize;
  return makeEntity(state, type, owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, { tileX: tx, tileY: ty });
}

function planeOver(state: MatchState, owner: string, tx: number, ty: number): Entity {
  const plane = makeEntity(state, "stuka", owner, tileCenter(tx, state.tileSize), tileCenter(ty, state.tileSize));
  plane.air!.phase = "fly";
  plane.air!.alt = AIR_CRUISE_ALT;
  plane.air!.speed = 1;
  return plane;
}

describe("radar station catalog", () => {
  it("is a base structure that draws power and has no gun", () => {
    assert.equal(isBuildingType("radar"), true);
    const d = catalog("radar");
    assert.equal(d.kind, "building");
    assert.equal(d.name, "Radar Station");
    assert.ok(d.power < 0);
    assert.equal(d.rangeTiles, 0);
    assert.ok(RADAR_RANGE_TILES > catalog("sniper").sightTiles * 2, "the sweep reaches far past anyone's eyes");
  });
});

describe("radar panel", () => {
  it("is dark until a Radar Station stands, then lights", () => {
    const { state, a } = emptyField();
    structureAt(state, "core", a, 40, 40);
    assert.equal(radarOnline(state, a), false);
    let snap = snapshotFor(state, a);
    assert.equal(snap.you.radar, false);
    assert.equal(snap.radar, undefined);

    const station = structureAt(state, "radar", a, 50, 40);
    assert.equal(radarOnline(state, a), true);
    snap = snapshotFor(state, a);
    assert.equal(snap.you.radar, true);
    assert.deepEqual(snap.radar, []);

    station.hp = 0;
    assert.equal(radarOnline(state, a), false);
    assert.equal(snapshotFor(state, a).you.radar, false);
  });

  it("goes dark again when the station is destroyed in play", () => {
    const { state, a } = emptyField();
    structureAt(state, "core", a, 40, 40);
    const station = structureAt(state, "radar", a, 50, 40);
    assert.equal(snapshotFor(state, a).you.radar, true);
    station.hp = 0;
    step(state);
    assert.equal(state.entities.has(station.id), false);
    assert.equal(snapshotFor(state, a).you.radar, false);
  });

  it("reads an ally's station but not an enemy's", () => {
    const { state, a, b } = emptyField();
    structureAt(state, "core", a, 40, 40);
    structureAt(state, "radar", b, 120, 120);
    assert.equal(radarOnline(state, a), false);
    state.players.get(a)!.team = 1;
    state.players.get(b)!.team = 1;
    assert.equal(radarOnline(state, a), true);
  });

  it("can be built from the Core like any base structure", () => {
    const { state, a } = emptyField();
    const core = structureAt(state, "core", a, 40, 40);
    state.players.get(a)!.hqId = core.id;
    state.players.get(a)!.scrap = 5000;
    const r = applyCommand(state, a, { type: "cmd.build", building: "radar" });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    for (let i = 0; i < catalog("radar").buildSeconds * 10 + 2; i++) step(state);
    const place = applyCommand(state, a, { type: "cmd.place", building: "radar", tx: core.tileX + core.tileW, ty: core.tileY });
    assert.equal(place.ok, true, !place.ok ? place.message : "");
    assert.equal(snapshotFor(state, a).you.radar, true);
  });
});

describe("radar contacts", () => {
  it("hears an unseen enemy plane in the air inside the sweep, and nothing on the ground", () => {
    const { state, a, b } = emptyField();
    structureAt(state, "core", a, 40, 40);
    structureAt(state, "radar", a, 50, 40);
    // Far outside the Core's and the station's sight, well inside the sweep.
    const plane = planeOver(state, b, 140, 41);
    const tank = makeEntity(state, "warden", b, tileCenter(140, state.tileSize), tileCenter(50, state.tileSize));
    const vis = visionMask(state, a);
    const contacts = radarContacts(state, a, vis);
    assert.deepEqual(contacts, [{ id: plane.id, x: plane.x, y: plane.y }]);
    const snap = snapshotFor(state, a);
    assert.deepEqual(snap.radar, contacts);
    // Neither the plane nor the tank is in the entity list: the field shows nothing.
    assert.equal(snap.entities.some((e) => e.id === plane.id || e.id === tank.id), false);
  });

  it("drops a contact once someone sees the plane: it is an entity then", () => {
    const { state, a, b } = emptyField();
    structureAt(state, "core", a, 40, 40);
    structureAt(state, "radar", a, 50, 40);
    const plane = planeOver(state, b, 44, 41);
    const vis = visionMask(state, a);
    assert.deepEqual(radarContacts(state, a, vis), []);
    const snap = snapshotFor(state, a);
    assert.deepEqual(snap.radar, []);
    assert.equal(snap.entities.some((e) => e.id === plane.id), true);
  });

  it("ignores parked planes, planes beyond the sweep, allied planes, and wrecks", () => {
    const { state, a, b } = emptyField();
    structureAt(state, "core", a, 10, 10);
    const station = structureAt(state, "radar", a, 20, 10);
    const sx = station.x;
    const sy = station.y;
    const ts = state.tileSize;
    const reach = RADAR_RANGE_TILES * ts;
    const parked = planeOver(state, b, 60, 11);
    parked.air!.phase = "parked";
    parked.air!.alt = 0;
    const far = planeOver(state, b, 60, 60);
    far.x = sx + reach + 2 * ts;
    far.y = sy;
    const own = planeOver(state, a, 60, 20);
    const wreck = planeOver(state, b, 60, 30);
    wreck.wreck = true;
    const inside = planeOver(state, b, 60, 40);
    inside.x = sx + reach - 2 * ts;
    inside.y = sy;
    const vis = visionMask(state, a);
    const ids = radarContacts(state, a, vis).map((c) => c.id);
    assert.deepEqual(ids, [inside.id]);
    assert.equal(own.ownerId, a);
  });

  it("hears a drone aloft the same as a plane", () => {
    const { state, a, b } = emptyField();
    structureAt(state, "core", a, 40, 40);
    structureAt(state, "radar", a, 50, 40);
    const drone = makeEntity(state, "drone", b, tileCenter(140, state.tileSize), tileCenter(41, state.tileSize));
    // A launched drone flies on an air state (drone.ts launch).
    drone.air = newAirState(null, 0);
    drone.air.alt = 20;
    drone.air.phase = "fly";
    const vis = visionMask(state, a);
    assert.deepEqual(
      radarContacts(state, a, vis).map((c) => c.id),
      [drone.id],
    );
  });

  it("sends no contacts to a side without a station", () => {
    const { state, a, b } = emptyField();
    structureAt(state, "core", a, 40, 40);
    planeOver(state, b, 140, 41);
    const vis = visionMask(state, a);
    assert.deepEqual(radarContacts(state, a, vis), []);
    assert.equal(snapshotFor(state, a).radar, undefined);
  });
});
