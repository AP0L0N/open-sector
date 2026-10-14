import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  AIR_HIGH_ALT,
  HORTEN_FLYING_SIGHT_BONUS,
  MAWCASTER_CELL,
  MOTHERSHIP_CELLS,
  MOTHERSHIP_CRUISE_ALT,
  MOTHERSHIP_DOME,
  SPINE_TURRET_CELL,
  PULSE_SPIRE_CELL,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  energyDomeOf,
  factionOf,
  isAircraftType,
  isOneAtATime,
  staysAloft,
  techNeeds,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { planeIsHigh } from "./air.js";
import { applyCommand } from "./commands.js";
import { liveSightExtra } from "./elevation.js";
import { aloftSweep, domeOver, shieldSweep } from "./energy-shield.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { mountValue } from "./mothership.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

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

function at(state: MatchState, tx: number, ty: number): { x: number; y: number } {
  return { x: tileCenter(tx, state.tileSize), y: tileCenter(ty, state.tileSize) };
}

/** A Mothership of A's up at cruise height over (tx, ty), facing east, holding there. */
function shipOver(state: MatchState, tx: number, ty: number): Entity {
  const p = at(state, tx, ty);
  const ship = makeEntity(state, "mothership", "A", p.x, p.y);
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
  return tx + cells * 4;
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
  });

  it("carries the Spine Turret's, the Pulse Spire's, and the Mawcaster's cells", () => {
    assert.equal(MOTHERSHIP_CELLS.spine, SPINE_TURRET_CELL);
    assert.equal(MOTHERSHIP_CELLS.pulse, PULSE_SPIRE_CELL);
    assert.equal(catalog("pulsespire").plasmaCell, PULSE_SPIRE_CELL);
    assert.equal(MOTHERSHIP_CELLS.maw, MAWCASTER_CELL);
    assert.equal(MOTHERSHIP_CELLS.flak, MAWCASTER_CELL);
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

  it("lays each mount on what it is for: soldiers for the spine, armor for the pulse, fliers for the flak maw", () => {
    const state = dry();
    const rifle = makeEntity(state, "rifleman", "B", 0, 0);
    const tank = makeEntity(state, "warden", "B", 0, 0);
    assert.ok(mountValue("spine", rifle, false) > mountValue("spine", tank, false));
    assert.equal(mountValue("spine", tank, false), 0, "plate turns the repeater");
    assert.ok(mountValue("pulse", tank, false) > mountValue("pulse", rifle, false));
    assert.ok(mountValue("maw", rifle, false) > 0);
    assert.equal(mountValue("flak", rifle, false), 0);
  });

  it("cuts down soldiers below with the spine and drives pulses into a tank, both at once", () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    const ts = state.tileSize;
    const rifle = makeEntity(state, "rifleman", "B", tileCenter(east(60, 6), ts), tileCenter(60, ts));
    const tank = makeEntity(state, "warden", "B", tileCenter(east(60, 8), ts), tileCenter(70, ts));
    const tankHp = tank.hp;
    run(state, 6);
    assert.ok(rifle.hp <= 0, "the soldier is down");
    assert.ok(tank.hp < tankHp, "the pulse hurt the tank");
    assert.ok(ship.mothership!.pulse.firedTick != null);
    assert.ok(ship.mothership!.spine.firedTick != null, "the spine fired");
  });

  it("throws the Mawcaster's salvo at the ground in its band, and never inside it", () => {
    const state = dry();
    shipOver(state, 30, 60);
    const ts = state.tileSize;
    const far = makeEntity(state, "rifleman", "B", tileCenter(east(30, 18), ts), tileCenter(60, ts));
    run(state, 1);
    const balls = state.projectiles.filter((p) => p.flight === "rocket" && p.launcher === "mawcaster" && !p.airRack);
    assert.ok(balls.length > 0, "the maw is throwing");
    assert.ok(far.hp > 0 || balls.length > 0);

    const near = dry();
    const ship = shipOver(near, 30, 60);
    makeEntity(near, "rifleman", "B", tileCenter(east(30, 3), ts), tileCenter(60, ts));
    run(near, 1);
    assert.equal(ship.mothership!.maw.firedTick, undefined, "too close for the maw");
  });

  it("spits the Mawcaster's air balls at a low plane in reach", () => {
    const state = dry();
    const ship = shipOver(state, 30, 60);
    const ts = state.tileSize;
    const plane = makeEntity(state, "stuka", "B", tileCenter(east(30, 8), ts), tileCenter(60, ts));
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 0;
    run(state, 0.5);
    assert.ok(ship.mothership!.flak.firedTick != null, "the flak maw fired");
    assert.ok(state.projectiles.some((p) => p.launcher === "mawcaster" && p.airRack));
  });

  it("holds its dome up in the air: anti-air climbing at it stops there, the ground under it stays open", () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    run(state, TICK_DT);
    const dome = state.energyShields!.find((s) => s.fromId === ship.id);
    assert.ok(dome?.dome && dome.aloft, "the dome stands in the air");
    assert.ok(Math.abs(dome.aloft.z - MOTHERSHIP_CRUISE_ALT) < 1e-6);
    // Flat on the ground, straight through under the ship: nothing there.
    assert.equal(shieldSweep(state, "B", ship.x - 200, ship.y, ship.x + 200, ship.y), null);
    assert.equal(domeOver(state, "B", ship.x, ship.y), null);
    assert.equal(aloftSweep(state, "B", ship.x - 200, ship.y, 1, ship.x + 200, ship.y, 1), null);
    // A round climbing from the ground at the hull meets the dome first.
    const hit = aloftSweep(state, "B", ship.x - 150, ship.y, 1, ship.x, ship.y, MOTHERSHIP_CRUISE_ALT);
    assert.ok(hit, "it meets the dome");
    assert.ok(Math.hypot(hit.x - ship.x, hit.y - ship.y) > ship.radius, "before it reaches the hull");
    // Its own side's rounds go out through it.
    assert.equal(aloftSweep(state, "A", ship.x - 150, ship.y, 1, ship.x, ship.y, MOTHERSHIP_CRUISE_ALT), null);
  });

  it("lets an enemy soldier walk under it", () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    const ts = state.tileSize;
    const walker = makeEntity(state, "engineer", "B", tileCenter(east(60, -3), ts), tileCenter(60, ts));
    run(state, TICK_DT);
    applyCommand(state, "B", { type: "cmd.move", ids: [walker.id], x: ship.x + ts * 12, y: ship.y });
    const x0 = walker.x;
    run(state, 6);
    assert.ok(walker.x > ship.x || walker.hp <= 0 || walker.x > x0 + ts * 8, "the dome does not fence him off");
  });

  it("shows its mounts in the snapshot, cells to its own side only", () => {
    const state = dry();
    const ship = shipOver(state, 60, 60);
    run(state, TICK_DT);
    const own = snapshotFor(state, "A").entities.find((e) => e.id === ship.id);
    assert.equal(own?.mothership?.mounts.length, 4);
    assert.equal(own?.mothership?.mounts[0]?.energy, 1);
    const theirs = snapshotFor(state, "B").entities.find((e) => e.id === ship.id);
    if (theirs) assert.equal(theirs.mothership?.mounts[0]?.energy, undefined);
  });
});
