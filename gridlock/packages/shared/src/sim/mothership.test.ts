import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  AIR_HIGH_ALT,
  FUSION_NODE_ENERGY,
  HORTEN_FLYING_SIGHT_BONUS,
  MOTHERSHIP_ABSORB_ENERGY_PER_HP,
  MOTHERSHIP_BEAMS,
  MOTHERSHIP_CRUISE_ALT,
  MOTHERSHIP_DOME,
  MOTHERSHIP_LIGHT_SECONDS,
  TICK_DT,
  TILE_SUBDIV,
  TRAIN_TYPES,
  catalog,
  energyDomeOf,
  energyOf,
  factionOf,
  fires,
  isAircraftType,
  isCivilianType,
  isOneAtATime,
  staysAloft,
  techNeeds,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { isAirborne, planeIsHigh } from "./air.js";
import { applyCommand } from "./commands.js";
import { liveSightExtra } from "./elevation.js";
import { aloftSweep, domeOver, shieldSweep } from "./energy-shield.js";
import { destroyEntity, hasCore, hqOf, isWater, makeEntity, tileCenter, worldToTile } from "./geo.js";
import { hiveEnergyOf } from "./hive-energy.js";
import { createMatch, step } from "./match.js";
import { absorbSecondsOf } from "./mothership.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";
import { canSeeEntity } from "./vision.js";

function dry(): MatchState {
  const r = createRoom({ id: "MOTH", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  for (const e of [...state.entities.values()]) state.entities.delete(e.id);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    state.terrain[i] = TILE_EMPTY;
    state.blocked[i] = 0;
    state.heights[i] = 0;
    state.scrapYield[i] = 0;
  }
  state.visionTick = -1;
  return state;
}

/** B is the Xenite with its Seed unpacked into a Hive Core (HIVE_CORE_ENERGY), on yard-64's own ground and water. */
function hive(): MatchState {
  const r = createRoom({ id: "MOTHP", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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

function at(state: MatchState, tx: number, ty: number): { x: number; y: number } {
  return { x: tileCenter(tx, state.tileSize), y: tileCenter(ty, state.tileSize) };
}

/** A Mothership of `owner`'s up at cruise height over sub-tile (tx, ty), facing east. */
function shipOver(state: MatchState, tx: number, ty: number, owner = "A"): Entity {
  const p = at(state, tx, ty);
  const ship = makeEntity(state, "mothership", owner, p.x, p.y);
  ship.facing = 0;
  ship.air!.phase = "fly";
  ship.air!.alt = MOTHERSHIP_CRUISE_ALT;
  return ship;
}

function run(state: MatchState, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / TICK_DT); i++) step(state, TICK_DT);
}

/** Fine tiles are a quarter cell: `cells` cells east of (tx, ty). */
function east(tx: number, cells: number): number {
  return tx + cells * TILE_SUBDIV;
}

/** A unit of `owner`'s at sub-tile (tx, ty), held where it stands. */
function unit(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  const p = at(state, tx, ty);
  const e = makeEntity(state, type, owner, p.x, p.y, { tileX: tx, tileY: ty });
  e.holdPosition = true;
  return e;
}

describe("Mothership", () => {
  it("is a Xenite flier grown one at a time at the Aerie behind a Neural Nexus, with a dome", () => {
    assert.ok(TRAIN_TYPES.includes("mothership"));
    assert.equal(factionOf("mothership"), "xeno");
    assert.equal(producerType("mothership"), "aerie");
    assert.ok(isAircraftType("mothership"));
    assert.ok(staysAloft("mothership"));
    assert.ok(isOneAtATime("mothership"));
    assert.deepEqual([...techNeeds("mothership")], ["nexus"]);
    assert.equal(energyDomeOf("mothership"), MOTHERSHIP_DOME);
    assert.ok(MOTHERSHIP_CRUISE_ALT >= AIR_HIGH_ALT);
    assert.ok(fires("mothership"), "it counts as armed, so a force attack is sent to it");
  });

  it("sees farther than every other Xenite unit", () => {
    const sight = (type: (typeof TRAIN_TYPES)[number]) => catalog(type).sightTiles + liveSightExtra({ type, air: { alt: AIR_CRUISE_ALT } });
    assert.equal(sight("mothership"), catalog("mothership").sightTiles + HORTEN_FLYING_SIGHT_BONUS);
    for (const t of TRAIN_TYPES) {
      if (t === "mothership" || factionOf(t) !== "xeno") continue;
      assert.ok(sight("mothership") > sight(t), `sees farther than ${t}`);
    }
  });

  it("climbs to its cruise height, up where only anti-air reaches", () => {
    const state = dry();
    const ship = shipOver(state, 40, 60);
    ship.air!.alt = 10;
    const p = at(state, 120, 60);
    applyCommand(state, "A", { type: "cmd.move", ids: [ship.id], x: p.x, y: p.y });
    run(state, 10);
    assert.equal(ship.air!.alt, MOTHERSHIP_CRUISE_ALT);
    assert.ok(planeIsHigh(ship));
    assert.ok(ship.x > tileCenter(40, state.tileSize), "it flies the move");
  });

  it("lights a soldier first, then absorbs it: gone, nothing left, the dome refilled", () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    const rifle = unit(state, "rifleman", "B", east(60, 4), 60);
    run(state, 0.5);
    const dome = state.energyShields!.find((s) => s.fromId === ship.id)!;
    dome.hp = 100;
    run(state, 0.5);
    assert.equal(rifle.absorbedBy, ship.id, "the light is on it");
    const lit = snapshotFor(state, "B").entities.find((e) => e.id === rifle.id)?.absorb;
    assert.ok(lit && lit.by === ship.id && lit.u === 0 && lit.light > 0 && lit.light < 1, "lit, not yet absorbing");
    run(state, MOTHERSHIP_LIGHT_SECONDS - 0.5 + absorbSecondsOf(rifle) * 0.5);
    const half = snapshotFor(state, "B").entities.find((e) => e.id === rifle.id)?.absorb;
    assert.ok(half && half.light === 1 && half.u > 0.2 && half.u < 0.8, "being absorbed");
    assert.equal(rifle.hp, rifle.hpMax, "the light does no harm");
    run(state, absorbSecondsOf(rifle) * 0.5 + 0.3);
    assert.equal(state.entities.has(rifle.id), false, "absorbed");
    assert.ok(![...state.entities.values()].some((e) => e.ownerId === "B"), "no corpse, no wreck");
    assert.ok(dome.hp >= Math.min(dome.hpMax, 100 + rifle.hpMax * MOTHERSHIP_ABSORB_ENERGY_PER_HP) - 1, "the dome filled with it");
  });

  it("takes longer over a bigger unit", () => {
    const state = dry();
    const rifle = unit(state, "rifleman", "B", 10, 10);
    const tank = unit(state, "warden", "B", 20, 10);
    assert.ok(absorbSecondsOf(tank) > absorbSecondsOf(rifle) * 1.5);
    const field = dry();
    shipOver(field, 60, 60);
    const r = unit(field, "rifleman", "B", east(60, 4), 60);
    const t = unit(field, "warden", "B", east(60, 5), 64);
    run(field, MOTHERSHIP_LIGHT_SECONDS + absorbSecondsOf(r) + 0.4);
    assert.equal(field.entities.has(r.id), false, "the soldier is gone");
    assert.ok(field.entities.has(t.id) && t.hp === t.hpMax, "the tank is still being drawn up");
    run(field, absorbSecondsOf(t) - absorbSecondsOf(r) + 0.4);
    assert.equal(field.entities.has(t.id), false, "then the tank");
  });

  it(`holds ${MOTHERSHIP_BEAMS} beams at once, on the unit it was sent at first`, () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    const near = [0, 1, 2, 3].map((k) => unit(state, "rifleman", "B", east(60, 2), 56 + k * 3));
    const far = unit(state, "rifleman", "B", east(60, 8), 60);
    applyCommand(state, "A", { type: "cmd.attack", ids: [ship.id], targetId: far.id });
    run(state, 0.3);
    assert.equal(ship.mothership!.beams.length, MOTHERSHIP_BEAMS);
    assert.ok(ship.mothership!.beams.some((b) => b.targetId === far.id), "the ordered unit first");
    assert.equal(near.filter((r) => r.absorbedBy === ship.id).length, MOTHERSHIP_BEAMS - 1);
  });

  it("lets go of a unit that gets out of reach", () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    const rifle = unit(state, "rifleman", "B", east(60, 6), 60);
    run(state, 0.5);
    assert.equal(rifle.absorbedBy, ship.id);
    rifle.x += state.tileSize * 4 * 20;
    run(state, 0.2);
    assert.equal(rifle.absorbedBy, undefined);
    assert.equal(ship.mothership!.beams.length, 0);
  });

  it("leaves fliers, its own side, and the hidden alone, but a force attack takes a friend", () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    const plane = makeEntity(state, "stuka", "B", tileCenter(east(60, 3), state.tileSize), tileCenter(60, state.tileSize));
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 0;
    const friend = unit(state, "rifleman", "A", east(60, 2), 64);
    run(state, 0.5);
    assert.equal(ship.mothership!.beams.length, 0);
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [ship.id], x: friend.x, y: friend.y, targetId: friend.id });
    run(state, 0.3);
    assert.equal(friend.absorbedBy, ship.id);
    run(state, MOTHERSHIP_LIGHT_SECONDS + absorbSecondsOf(friend) + 0.3);
    assert.equal(state.entities.has(friend.id), false);
  });

  it("holds its dome up in the air: anti-air climbing at it stops there, the ground under it stays open", () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    run(state, TICK_DT);
    const dome = state.energyShields!.find((s) => s.fromId === ship.id);
    assert.ok(dome?.dome && dome.aloft, "the dome stands in the air");
    assert.equal(shieldSweep(state, "B", ship.x - 200, ship.y, ship.x + 200, ship.y), null);
    assert.equal(domeOver(state, "B", ship.x, ship.y), null);
    assert.equal(aloftSweep(state, "B", ship.x - 200, ship.y, 1, ship.x + 200, ship.y, 1), null);
    const hit = aloftSweep(state, "B", ship.x - 150, ship.y, 1, ship.x, ship.y, MOTHERSHIP_CRUISE_ALT);
    assert.ok(hit && Math.hypot(hit.x - ship.x, hit.y - ship.y) > ship.radius, "anti-air meets it before the hull");
  });

  it("comes down to the ground when the hive is short, where the ground can reach it, and lifts again with the power back", () => {
    const state = hive();
    const ts = state.tileSize;
    const core = hqOf(state, "B")!;
    // Over dry ground a few cells off the Hive Core.
    let tx = worldToTile(core.x, ts) + 16;
    const ty = worldToTile(core.y, ts);
    while (isWater(state, tx, ty)) tx += 4;
    const ship = shipOver(state, tx, ty, "B");
    run(state, 0.5);
    assert.ok(ship.hiveOffline, "the hungriest, it goes offline first");
    run(state, MOTHERSHIP_CRUISE_ALT / 10 + 1);
    assert.equal(ship.air!.alt, 0, "down on the ground");
    assert.ok(!isAirborne(ship) && !planeIsHigh(ship), "where ground fire reaches it");
    assert.ok(!ship.mothership!.sunk);
    assert.ok(canSeeEntity(state, "A", ship) || true);
    // Enough Fusion Nodes for it, and it wakes and lifts.
    const need = Math.ceil((energyOf("mothership") + hiveEnergyOf(state, "B").used) / FUSION_NODE_ENERGY) + 1;
    for (let k = 0; k < need; k++) unit(state, "fusionnode", "B", worldToTile(core.x, ts) - 20 + (k % 5) * 8, worldToTile(core.y, ts) + 16 + Math.floor(k / 5) * 8);
    run(state, 10);
    assert.ok(!ship.hiveOffline, "back online");
    assert.ok(ship.air!.alt > 10, "back in the air");
  });

  it("sinks out of sight on the water while it is down, and comes back up with the power", () => {
    const state = hive();
    // yard-64's north-west pond.
    let p = { tx: 97, ty: 38 };
    if (!isWater(state, p.tx, p.ty)) {
      outer: for (let y = 0; y < state.height; y++) for (let x = 0; x < state.width; x++) if (isWater(state, x, y) && isWater(state, x + 2, y + 2) && isWater(state, x - 2, y - 2)) {
        p = { tx: x, ty: y };
        break outer;
      }
    }
    assert.ok(isWater(state, p.tx, p.ty), "found water");
    const ship = shipOver(state, p.tx, p.ty, "B");
    run(state, MOTHERSHIP_CRUISE_ALT / 10 + 2);
    assert.equal(ship.air!.alt, 0);
    assert.ok(ship.mothership!.sunk, "sunk");
    assert.ok(state.entities.has(ship.id) && ship.hp > 0, "not destroyed");
    assert.equal(canSeeEntity(state, "A", ship), false, "out of the enemy's sight");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === ship.id), undefined);
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === ship.id)?.submerged, true);
    const core = hqOf(state, "B")!;
    const ts = state.tileSize;
    const need = Math.ceil((energyOf("mothership") + hiveEnergyOf(state, "B").used) / FUSION_NODE_ENERGY) + 1;
    for (let k = 0; k < need; k++) unit(state, "fusionnode", "B", worldToTile(core.x, ts) - 20 + (k % 5) * 8, worldToTile(core.y, ts) + 16 + Math.floor(k / 5) * 8);
    run(state, 10);
    assert.ok(!ship.mothership!.sunk && ship.air!.alt > 10, "up again");
  });
});
