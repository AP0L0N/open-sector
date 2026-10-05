import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUNKER_GARRISON_HP_MUL,
  DECK_MG,
  LST_BAY_SLOTS,
  LST_HALF_LENGTH,
  TICK_DT,
  TRAIN_TYPES,
  bayLoadOf,
  catalog,
  garrisonCandidate,
  infantryGunFor,
  isNavalType,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { garrisonSpace, woundDeckGunners } from "./garrison.js";
import { makeEntity, isWater, tileCenter, worldToTile } from "./geo.js";
import { deckGunners, deckLoad, rampAshore } from "./lst.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

/** Shoreline: dry to the west of SHORE, open water from it eastward. */
const SHORE = 60;

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "LST1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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
  return state;
}

function paint(state: MatchState, x0: number, y0: number, x1: number, y1: number, tile: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = tile;
      state.blocked[i] = tile === TILE_WATER ? 1 : 0;
      state.heights[i] = 0;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

function beach(): MatchState {
  const state = twoPlayerMatch();
  paint(state, 0, 0, state.width - 1, state.height - 1, TILE_EMPTY);
  paint(state, SHORE, 0, state.width - 1, state.height - 1, TILE_WATER);
  return state;
}

function spawn(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  return makeEntity(state, type, owner, tileCenter(tx, state.tileSize), tileCenter(ty, state.tileSize));
}

/** An LST nosed into the beach, bow to the west. */
function beached(state: MatchState, owner = "A"): Entity {
  const ship = spawn(state, "lst", owner, SHORE + 4, 60);
  ship.facing = Math.PI;
  return ship;
}

function run(state: MatchState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(state, TICK_DT);
}

/** Put a unit straight aboard, the way a finished walk up the ramp does. */
function board(state: MatchState, ship: Entity, ...units: Entity[]): void {
  const r = applyCommand(state, ship.ownerId, { type: "cmd.garrison", ids: units.map((u) => u.id), buildingId: ship.id });
  assert.equal(r.ok, true, r.ok ? "" : r.message);
  run(state, 400);
  for (const u of units) assert.equal(u.garrisonedIn, ship.id, `${u.type} boarded`);
}

describe("Transport LST", () => {
  it("is a Marine Base ship with a 40-slot tank deck", () => {
    assert.ok(TRAIN_TYPES.includes("lst"));
    assert.equal(producerType("lst"), "dock");
    assert.equal(isNavalType("lst"), true);
    assert.equal(catalog("lst").name, "Transport LST");
    assert.equal(catalog("lst").garrisonCap, LST_BAY_SLOTS);
    assert.equal(LST_BAY_SLOTS, 40);
    assert.ok(catalog("lst").armorFront >= catalog("destroyer").armorFront * 3, "heavily plated");
  });

  it("takes infantry and ground vehicles, the bigger the hull the more room", () => {
    assert.equal(bayLoadOf("lst", "rifleman"), 1);
    assert.ok(bayLoadOf("lst", "ss3") < bayLoadOf("lst", "warden"));
    assert.ok(bayLoadOf("lst", "warden") < bayLoadOf("lst", "mammoth"));
    assert.equal(garrisonCandidate("lst", "warden"), true);
    assert.equal(garrisonCandidate("lst", "rifleman"), true);
    for (const t of ["gunboat", "stuka", "lst"] as const) assert.equal(garrisonCandidate("lst", t), false, t);
    // Every other host still counts heads and takes infantry only.
    assert.equal(bayLoadOf("bunker", "rifleman"), 1);
    assert.equal(garrisonCandidate("bunker", "warden"), false);
    assert.equal(garrisonCandidate("mammoth", "warden"), false);
  });

  it("loads units that walk and drive up the bow ramp from the beach", () => {
    const state = beach();
    const ship = beached(state);
    assert.equal(rampAshore(state, ship), true);
    const tank = spawn(state, "warden", "A", SHORE - 12, 62);
    const man = spawn(state, "rifleman", "A", SHORE - 14, 56);
    board(state, ship, tank, man);
    assert.equal(deckLoad(state, ship), bayLoadOf("lst", "warden") + 1);
    const snap = snapshotFor(state, "A");
    const view = snap.entities.find((e) => e.id === ship.id)!;
    assert.equal(view.garrison?.count, bayLoadOf("lst", "warden") + 1, "count is deck room");
    // The enemy never sees what is aboard.
    const theirs = snapshotFor(state, "B");
    assert.equal(theirs.entities.some((e) => e.id === tank.id), false);
  });

  it("refuses a hull that does not fit in the room left", () => {
    const state = beach();
    const ship = beached(state);
    const tanks = [0, 1, 2, 3, 4].map((i) => spawn(state, "warden", "A", SHORE - 6, 50 + i * 4));
    board(state, ship, ...tanks);
    assert.equal(garrisonSpace(state, ship), 0);
    const late = spawn(state, "ss3", "A", SHORE - 6, 72);
    const r = applyCommand(state, "A", { type: "cmd.garrison", ids: [late.id], buildingId: ship.id });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.message, /full/);
  });

  it("will not land anyone while the bow is out at sea", () => {
    const state = beach();
    const ship = beached(state);
    const man = spawn(state, "rifleman", "A", SHORE - 6, 60);
    board(state, ship, man);
    ship.x = tileCenter(SHORE + 40, state.tileSize);
    ship.tileX = SHORE + 40;
    run(state, 1);
    assert.equal(rampAshore(state, ship), false);
    const r = applyCommand(state, "A", { type: "cmd.ungarrison", buildingId: ship.id });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.message, /shore/);
    // A move order on the soldier aboard keeps him on deck.
    applyCommand(state, "A", { type: "cmd.move", ids: [man.id], x: 100, y: 100 });
    assert.equal(man.garrisonedIn, ship.id);
  });

  it("unloads everyone down the ramp onto dry ground", () => {
    const state = beach();
    const ship = beached(state);
    const units = [
      spawn(state, "warden", "A", SHORE - 8, 52),
      spawn(state, "ss3", "A", SHORE - 8, 68),
      spawn(state, "rifleman", "A", SHORE - 10, 60),
      spawn(state, "medic", "A", SHORE - 10, 62),
    ];
    board(state, ship, ...units);
    const r = applyCommand(state, "A", { type: "cmd.ungarrison", buildingId: ship.id });
    assert.equal(r.ok, true);
    const ts = state.tileSize;
    for (const u of units) {
      assert.equal(u.garrisonedIn, null);
      assert.equal(isWater(state, worldToTile(u.x, ts), worldToTile(u.y, ts)), false, `${u.type} on dry ground`);
    }
    const [a, b] = units;
    assert.ok(Math.hypot(a!.x - b!.x, a!.y - b!.y) > a!.radius, "hulls land apart");
    assert.equal(ship.garrison.length, 0);
  });

  it("puts the first two soldiers who can shoot on the deck MGs, and nobody else fires", () => {
    const state = beach();
    const ship = beached(state);
    const medic = spawn(state, "medic", "A", SHORE - 6, 58);
    const first = spawn(state, "rifleman", "A", SHORE - 6, 60);
    const second = spawn(state, "sniper", "A", SHORE - 6, 62);
    const third = spawn(state, "gunner", "A", SHORE - 6, 64);
    for (const u of [medic, first, second, third]) board(state, ship, u);
    run(state, 1);
    assert.deepEqual(deckGunners(state, ship).map((u) => u.id), [first.id, second.id]);
    assert.equal(first.mountedGun, 0);
    assert.equal(second.mountedGun, 1);
    assert.equal(third.mountedGun, undefined);
    assert.equal(infantryGunFor(second), DECK_MG, "the sniper fires the mount, not his rifle");
    assert.equal(first.hpMax, catalog("rifleman").hp * BUNKER_GARRISON_HP_MUL, "bunker-grade cover");

    // An enemy on the beach in reach: only the two tub gunners shoot at him.
    const foe = spawn(state, "rifleman", "B", SHORE - 12, 60);
    foe.hp = foe.hpMax = 100000;
    const shooters = new Set<number>();
    for (let i = 0; i < 200; i++) {
      step(state, TICK_DT);
      for (const p of state.projectiles) shooters.add(p.fromId);
      for (const imp of state.impacts) if (imp.fromId != null) shooters.add(imp.fromId);
    }
    shooters.delete(foe.id);
    assert.ok(shooters.size > 0, "the tubs open fire");
    for (const id of shooters) assert.ok(id === first.id || id === second.id, `only tub gunners fire (saw ${id})`);
  });

  it("hands a gun to the next soldier when a tub gunner falls", () => {
    const state = beach();
    const ship = beached(state);
    const a = spawn(state, "rifleman", "A", SHORE - 6, 58);
    const b = spawn(state, "rifleman", "A", SHORE - 6, 60);
    const c = spawn(state, "rifleman", "A", SHORE - 6, 62);
    for (const u of [a, b, c]) board(state, ship, u);
    run(state, 1);
    assert.equal(c.mountedGun, undefined);
    a.hp = 0;
    a.state = "dead";
    run(state, 2);
    assert.equal(state.entities.has(a.id), false);
    assert.deepEqual(deckGunners(state, ship).map((u) => u.id), [b.id, c.id]);
    assert.equal(c.mountedGun, 1);
  });

  it("lets hits on the hull wound only the tub gunners, through the shield", () => {
    const state = beach();
    const ship = beached(state);
    const gunner = spawn(state, "rifleman", "A", SHORE - 6, 58);
    const rider = spawn(state, "rifleman", "A", SHORE - 6, 60);
    const other = spawn(state, "rifleman", "A", SHORE - 6, 62);
    for (const u of [gunner, rider, other]) board(state, ship, u);
    run(state, 1);
    const before = other.hp;
    for (let i = 0; i < 200; i++) woundDeckGunners(state, ship, 10);
    assert.ok(gunner.hp < gunner.hpMax || rider.hp < rider.hpMax, "a tub gunner got hit");
    assert.equal(other.hp, before, "below decks nobody is touched");
  });

  it("takes everyone aboard down with it, leaving only its own hulk", () => {
    const state = beach();
    const ship = beached(state);
    const tank = spawn(state, "warden", "A", SHORE - 8, 54);
    const truck = spawn(state, "supply", "A", SHORE - 8, 66);
    const man = spawn(state, "rifleman", "A", SHORE - 10, 60);
    const rider = spawn(state, "rifleman", "A", SHORE - 12, 66);
    const ride = applyCommand(state, "A", { type: "cmd.board", ids: [rider.id], truckId: truck.id });
    assert.equal(ride.ok, true);
    run(state, 300);
    assert.equal(rider.garrisonedIn, truck.id);
    board(state, ship, tank, truck, man);
    const bodies = state.bodies.length;
    ship.hp = 0;
    run(state, 2);
    for (const u of [tank, truck, man, rider]) assert.equal(state.entities.has(u.id), false, `${u.type} lost`);
    const wrecks = [...state.entities.values()].filter((e) => e.wreck);
    assert.deepEqual(wrecks.map((e) => e.type), ["lst"]);
    assert.equal(state.bodies.length, bodies, "no bodies wash up");
  });

  it("runs its bow up the beach and stops with the hull still afloat", () => {
    const state = beach();
    const ship = spawn(state, "lst", "A", SHORE + 30, 60);
    ship.facing = Math.PI;
    const r = applyCommand(state, "A", { type: "cmd.move", ids: [ship.id], x: tileCenter(SHORE - 10, state.tileSize), y: ship.y });
    assert.equal(r.ok, true);
    run(state, 2000);
    assert.equal(ship.waypoints.length, 0, "it stopped");
    assert.equal(rampAshore(state, ship), true, "the ramp reaches dry ground");
    const ts = state.tileSize;
    const fore = ship.x + Math.cos(ship.facing) * LST_HALF_LENGTH * 0.8;
    assert.equal(isWater(state, worldToTile(fore, ts), worldToTile(ship.y, ts)), true, "the fore hull still floats");
    // Loaded there, it can land what it carries.
    const man = spawn(state, "rifleman", "A", SHORE - 6, 60);
    board(state, ship, man);
    assert.equal(applyCommand(state, "A", { type: "cmd.ungarrison", buildingId: ship.id }).ok, true);
  });

  it("keeps a carried Titan's rockets quiet", () => {
    const state = beach();
    const ship = beached(state);
    const titan = spawn(state, "titan", "A", SHORE - 8, 60);
    board(state, ship, titan);
    const foe = spawn(state, "warden", "B", SHORE - 14, 60);
    foe.hp = foe.hpMax = 100000;
    const rockets = titan.rockets;
    run(state, 300);
    assert.equal(titan.rockets, rockets);
  });
});
