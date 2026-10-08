import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  BV222_TROOPS,
  CLUSTER_MINES,
  CLUSTER_RADIUS_TILES,
  CRATE_SUPPLY,
  MINE_ARM_SECONDS,
  TICK_DT,
  TILE_SUBDIV,
  TRAIN_TYPES,
  addCrit,
  catalog,
  isAircraftType,
  isTransportType,
} from "../catalog.js";
import { isAirborne } from "./air.js";
import { payloadOf, planeRiders, scatterMines } from "./airdrop.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { supplyRiderFights } from "./supply.js";
import type { Entity, MatchState } from "./types.js";

/** Catalog tiles in grid cells. */
const t = (n: number): number => n * TILE_SUBDIV;

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "BV22", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.players.get("A")!.scrap = 50_000;
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n && !state.ended; i++) step(state, TICK_DT);
}

function until(state: MatchState, max: number, done: () => boolean): number {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    step(state, TICK_DT);
  }
  return -1;
}

function seedCore(state: MatchState, owner = "A", tx = 4, ty = 4): Entity {
  const ts = state.tileSize;
  return makeEntity(state, "core", owner, tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
}

/** An Airfield, with the Research Facility and Radar every bomber needs, and a Dynamo to run them. */
function seedAirfield(state: MatchState, tx = 30, ty = 30, owner = "A"): Entity {
  const ts = state.tileSize;
  const def = catalog("airfield");
  makeEntity(state, "research", owner, tileCenter(tx, ts), tileCenter(ty - 6, ts), { tileX: tx, tileY: ty - 6 });
  makeEntity(state, "radar", owner, tileCenter(tx + 6, ts), tileCenter(ty - 6, ts), { tileX: tx + 6, tileY: ty - 6 });
  makeEntity(state, "dynamo", owner, tileCenter(tx + 12, ts), tileCenter(ty - 6, ts), { tileX: tx + 12, tileY: ty - 6 });
  return makeEntity(state, "airfield", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function transportOver(state: MatchState, owner: string, x: number, y: number): Entity {
  const plane = makeEntity(state, "bv222", owner, x, y);
  plane.air!.phase = "fly";
  plane.air!.alt = AIR_CRUISE_ALT;
  plane.air!.speed = 1;
  plane.order = { kind: "move", x, y };
  return plane;
}

/** A BV 222 trained on the Airfield, parked on its hardstand. */
function trainedTransport(state: MatchState): { plane: Entity; field: Entity } {
  seedCore(state);
  const field = seedAirfield(state);
  const r = applyCommand(state, "A", { type: "cmd.train", unit: "bv222" });
  assert.equal(r.ok, true, !r.ok ? r.message : "");
  ticks(state, Math.ceil(catalog("bv222").buildSeconds / TICK_DT) + 20);
  const plane = [...state.entities.values()].find((e) => e.type === "bv222");
  assert.ok(plane);
  assert.equal(plane.air?.phase, "parked");
  return { plane, field };
}

function riflemanAt(state: MatchState, owner: string, x: number, y: number): Entity {
  return makeEntity(state, "rifleman", owner, x, y);
}

describe("BV 222", () => {
  it("is an unarmed transport trained at the Airfield", () => {
    assert.ok(TRAIN_TYPES.includes("bv222"));
    assert.ok(isAircraftType("bv222"));
    assert.ok(isTransportType("bv222"));
    assert.equal(catalog("bv222").name, "BV 222");
    assert.equal(catalog("bv222").damage, 0);
    assert.ok(catalog("bv222").moveTilesPerSec < catalog("stuka").moveTilesPerSec, "slower than the Stuka");
  });

  it("comes off the line with a mine canister in the bay", () => {
    const state = twoPlayerMatch();
    const { plane, field } = trainedTransport(state);
    assert.equal(plane.air?.homeId, field.id);
    assert.equal(payloadOf(plane), "mines");
    assert.equal(plane.air?.bombs, 1);
    assert.equal(plane.air?.rounds, 0);
  });

  it("drops a cluster canister on a force-attack and scatters mines around the point", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedAirfield(state);
    const ts = state.tileSize;
    const plane = transportOver(state, "A", 10 * ts, 32 * ts);
    const tx = 32 * ts;
    const ty = 32 * ts;
    const r = applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: tx, y: ty });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    const n = until(state, 2000, () => state.mines.length > 0);
    assert.ok(n >= 0, "the mines land");
    assert.equal(plane.air!.bombs, 0);
    assert.ok(state.mines.length > CLUSTER_MINES / 2 && state.mines.length <= CLUSTER_MINES);
    for (const m of state.mines) {
      assert.ok(Math.hypot(m.x - tx, m.y - ty) <= CLUSTER_RADIUS_TILES * ts + ts, "near the drop point");
    }
    ticks(state, 5);
    assert.equal(plane.order?.kind, "land", "empty, it goes home");
  });

  it("treats a plain attack on an enemy as a drop where it stands", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedAirfield(state);
    const ts = state.tileSize;
    const plane = transportOver(state, "A", 10 * ts, 20 * ts);
    const foe = riflemanAt(state, "B", 30 * ts, 20 * ts);
    applyCommand(state, "A", { type: "cmd.attack", ids: [plane.id], targetId: foe.id });
    ticks(state, 1);
    assert.equal(plane.order?.kind, "forceattack");
    assert.equal(state.projectiles.filter((p) => p.flight === "bomb").length, 0, "it never drops a bomb");
  });

  it("mines arm, then go off under a friend or a foe", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const x = 20 * ts + ts / 2;
    const y = 20 * ts + ts / 2;
    state.mines.push({ id: state.nextId++, ownerId: "A", x, y, arm: MINE_ARM_SECONDS, life: 300 });
    const friend = riflemanAt(state, "A", x, y);
    ticks(state, 5);
    assert.equal(state.mines.length, 1, "still arming");
    assert.ok(friend.hp > 0);
    ticks(state, Math.ceil(MINE_ARM_SECONDS / TICK_DT));
    assert.equal(state.mines.length, 0, "a friend on top sets it off");
    assert.ok(friend.hp <= 0, "the blast hits the side that laid it");

    state.mines.push({ id: state.nextId++, ownerId: "A", x, y, arm: 0, life: 300 });
    const foe = riflemanAt(state, "B", x + ts * 3, y);
    const r = applyCommand(state, "B", { type: "cmd.move", ids: [foe.id], x, y });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    const n = until(state, 400, () => state.mines.length === 0);
    assert.ok(n >= 0, "the mine goes off");
    assert.ok(foe.hp <= 0 || !state.entities.has(foe.id), "the soldier on it is killed");
  });

  it("a supply truck that rolls onto a mine sets it off and gains no scrap", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const x = 24 * ts + ts / 2;
    const y = 24 * ts + ts / 2;
    state.mines.push({ id: state.nextId++, ownerId: "B", x, y, arm: 0, life: 300 });
    const truck = makeEntity(state, "supply", "A", x, y);
    const scrap = state.players.get("A")!.scrap;
    const hp = truck.hp;
    ticks(state, 1);
    assert.equal(state.mines.length, 0);
    assert.ok(truck.hp < hp);
    assert.equal(state.players.get("A")!.scrap, scrap);
  });

  it("does not go off while still arming", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const x = 20 * ts + ts / 2;
    const y = 20 * ts + ts / 2;
    state.mines.push({ id: state.nextId++, ownerId: "A", x, y, arm: MINE_ARM_SECONDS, life: 300 });
    const foe = riflemanAt(state, "B", x, y);
    ticks(state, 5);
    assert.equal(state.mines.length, 1);
    assert.ok(foe.hp > 0);
  });

  it("tears a tank's tracks off", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const x = 20 * ts + ts / 2;
    const y = 20 * ts + ts / 2;
    state.mines.push({ id: state.nextId++, ownerId: "A", x, y, arm: 0, life: 300 });
    let tracked = false;
    // The track roll is seeded: try a few hulls until one loses a track.
    for (let i = 0; i < 6 && !tracked; i++) {
      const tank = makeEntity(state, "warden", "B", x, y);
      const hp = tank.hp;
      state.mines.push({ id: state.nextId++, ownerId: "A", x, y, arm: 0, life: 300 });
      ticks(state, 1);
      assert.ok(tank.hp < hp, "the belly takes the blast");
      assert.ok(tank.hp > 0, "one mine does not kill a tank");
      tracked = tank.crits.includes("tracks");
      state.entities.delete(tank.id);
    }
    assert.ok(tracked, "a mine can break a track");
  });

  it("shows mines to the side that laid them and to allies, and hides them from the enemy", () => {
    const state = twoPlayerMatch();
    seedCore(state, "A", 4, 4);
    seedCore(state, "B", 50, 50);
    const ts = state.tileSize;
    scatterMines(state, "A", 30 * ts, 30 * ts);
    const laid = snapshotFor(state, "A").mines.length;
    assert.ok(laid > 0, "the side that laid them sees them");
    assert.equal(snapshotFor(state, "B").mines.length, 0, "another side does not");
    state.players.get("A")!.team = 1;
    state.players.get("B")!.team = 1;
    assert.equal(snapshotFor(state, "B").mines.length, laid, "an ally sees the same mines");
    state.players.get("B")!.team = 2;
    const mine = state.mines[0]!;
    riflemanAt(state, "B", mine.x, mine.y);
    state.visionTick = -1;
    assert.equal(snapshotFor(state, "B").mines.length, 0, "standing on an enemy mine still shows nothing");
    assert.ok(state.mines.length > 0, "the mine is still there until something sets it off");
  });

  it("changes load only on the pad", () => {
    const state = twoPlayerMatch();
    const { plane } = trainedTransport(state);
    assert.equal(applyCommand(state, "A", { type: "cmd.payload", ids: [plane.id], payload: "crate" }).ok, true);
    assert.equal(payloadOf(plane), "crate");
    assert.equal(plane.air!.bombs, 0, "the new crate has to be loaded");
    ticks(state, Math.ceil(10 / TICK_DT));
    assert.equal(plane.air!.bombs, 1, "the ground crew hangs it");
    plane.air!.phase = "fly";
    const r = applyCommand(state, "A", { type: "cmd.payload", ids: [plane.id], payload: "troops" });
    assert.equal(r.ok, false);
  });

  it("drops a crate that refills ammo and patches up allies standing at it", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedAirfield(state);
    const ts = state.tileSize;
    const plane = transportOver(state, "A", 10 * ts, 20 * ts);
    plane.air!.payload = "crate";
    const tx = 30 * ts + ts / 2;
    const ty = 20 * ts + ts / 2;
    const hurt = riflemanAt(state, "A", tx + 6, ty);
    hurt.hp = 10;
    const tank = makeEntity(state, "warden", "A", tx - 12, ty);
    for (const k of Object.keys(tank.ammo)) tank.ammo[k as keyof typeof tank.ammo] = 0;
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: tx, y: ty });
    assert.ok(until(state, 2000, () => state.crates.length > 0) >= 0, "the crate goes out");
    const crate = state.crates[0]!;
    assert.ok(crate.alt > 0, "it hangs under its canopy");
    assert.equal(snapshotFor(state, "A").crates[0]?.alt != null, true);
    assert.ok(until(state, 400, () => crate.alt <= 0) >= 0, "and comes down");
    assert.ok(Math.hypot(crate.x - tx, crate.y - ty) < ts * 1.5, "on the drop point");
    ticks(state, Math.ceil(6 / TICK_DT));
    assert.ok(hurt.hp > 10, "the wounded soldier is patched up");
    assert.ok(Object.values(tank.ammo).some((n) => (n ?? 0) > 0), "the tank takes shells");
    assert.ok((state.crates[0]?.supply ?? 0) < CRATE_SUPPLY);
  });

  it("gives an enemy standing at the crate nothing", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const x = 30 * ts;
    const y = 30 * ts;
    state.crates.push({ id: state.nextId++, ownerId: "A", x, y, alt: 0, vx: 0, vy: 0, supply: CRATE_SUPPLY, life: 200, work: 0, turn: 0 });
    const foe = riflemanAt(state, "B", x + 4, y);
    foe.hp = 10;
    ticks(state, Math.ceil(3 / TICK_DT));
    assert.equal(foe.hp, 10);
    assert.equal(state.crates[0]?.supply, CRATE_SUPPLY);
  });

  it("boards up to ten ground units, including a gunner and a tank", () => {
    const state = twoPlayerMatch();
    const { plane, field } = trainedTransport(state);
    assert.equal(applyCommand(state, "A", { type: "cmd.payload", ids: [plane.id], payload: "troops" }).ok, true);
    const ts = state.tileSize;
    const below = (field.tileY + field.tileH + 1) * ts;
    const men: Entity[] = [];
    for (let i = 0; i < BV222_TROOPS; i++) men.push(riflemanAt(state, "A", plane.x + (i - 6) * 6, below));
    const gunner = makeEntity(state, "gunner", "A", plane.x - 8, below);
    const tank = makeEntity(state, "warden", "A", plane.x + 8, below);
    const stuka = makeEntity(state, "stuka", "A", plane.x, below + ts);
    const braced = makeEntity(state, "titan", "A", plane.x + ts, below);
    braced.braced = true;
    const r = applyCommand(state, "A", {
      type: "cmd.board",
      ids: [gunner.id, tank.id, ...men.map((e) => e.id), stuka.id, braced.id],
      truckId: plane.id,
    });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    assert.notEqual(stuka.order?.kind, "board", "a plane does not climb in");
    assert.notEqual(braced.order?.kind, "board", "a braced Titan packs up before it can board");
    state.entities.delete(stuka.id);
    state.entities.delete(braced.id);
    assert.ok(until(state, 1600, () => planeRiders(state, plane).length >= BV222_TROOPS) >= 0, "they climb in");
    ticks(state, 20);
    assert.equal(planeRiders(state, plane).length, BV222_TROOPS);
    assert.equal(gunner.garrisonedIn, plane.id);
    assert.equal(tank.garrisonedIn, plane.id);
    for (const rider of planeRiders(state, plane)) assert.equal(supplyRiderFights(state, rider), false, "no fire from the bay");
    const hurt = planeRiders(state, plane)[0]!;
    hurt.hp = Math.max(1, Math.floor(hurt.hpMax / 2));
    const yours = snapshotFor(state, "A").entities.find((e) => e.id === plane.id);
    assert.equal(yours?.garrison?.count, BV222_TROOPS);
    assert.equal(yours?.garrison?.cap, BV222_TROOPS);
    assert.equal(yours?.garrison?.bars?.length, BV222_TROOPS);
    assert.ok(yours?.garrison?.bars?.some((b) => b.hp === hurt.hp && b.hpMax === hurt.hpMax));
    // The Airfield blocks sight across its pad. Out in the open, the other side sees the bars.
    plane.x = 90 * ts;
    plane.y = 90 * ts;
    for (const rider of planeRiders(state, plane)) {
      rider.x = plane.x;
      rider.y = plane.y;
    }
    riflemanAt(state, "B", plane.x + ts, plane.y);
    const seen = snapshotFor(state, "B").entities.find((e) => e.id === plane.id);
    assert.equal(seen?.garrison?.bars?.length, BV222_TROOPS, "an enemy who can see the plane sees who is aboard");
    assert.equal(snapshotFor(state, "B").entities.some((e) => e.garrisonedIn === plane.id), false);
    const unload = applyCommand(state, "A", { type: "cmd.unboard", truckId: plane.id });
    assert.equal(unload.ok, true);
    assert.equal(planeRiders(state, plane).length, 0);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === plane.id)?.garrison, undefined);
  });

  it("lets infantry board from any load, selects paratroops, and keeps that load while anyone is aboard", () => {
    const state = twoPlayerMatch();
    const { plane, field } = trainedTransport(state);
    assert.equal(payloadOf(plane), "mines");
    assert.equal(plane.air!.bombs, 1);
    const ts = state.tileSize;
    const below = (field.tileY + field.tileH + 1) * ts;
    const man = riflemanAt(state, "A", plane.x, below);
    const tank = makeEntity(state, "warden", "A", plane.x + ts, below);
    const refused = applyCommand(state, "A", { type: "cmd.board", ids: [tank.id], truckId: plane.id });
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.match(refused.message, /paratroops/i);
    assert.equal(payloadOf(plane), "mines");
    assert.equal(applyCommand(state, "A", { type: "cmd.board", ids: [man.id], truckId: plane.id }).ok, true);
    assert.ok(until(state, 800, () => man.garrisonedIn === plane.id) >= 0, "the rifleman climbs in");
    assert.equal(payloadOf(plane), "troops");
    assert.equal(plane.air!.bombs, 0);
    assert.equal(planeRiders(state, plane).length, 1);
    const locked = applyCommand(state, "A", { type: "cmd.payload", ids: [plane.id], payload: "crate" });
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.match(locked.message, /Unload/);
    assert.equal(payloadOf(plane), "troops");
    assert.equal(man.garrisonedIn, plane.id, "changing the load does not dump the stick");
    const unload = applyCommand(state, "A", { type: "cmd.unboard", truckId: plane.id });
    assert.equal(unload.ok, true);
    assert.equal(planeRiders(state, plane).length, 0);
    assert.equal(applyCommand(state, "A", { type: "cmd.payload", ids: [plane.id], payload: "crate" }).ok, true);
    assert.equal(payloadOf(plane), "crate");
  });

  it("drops a stick of paratroopers who drift down under canopies and then fight", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedAirfield(state);
    const ts = state.tileSize;
    const plane = transportOver(state, "A", 20 * ts, 120 * ts);
    plane.air!.payload = "troops";
    plane.air!.bombs = 0;
    const men: Entity[] = [];
    for (let i = 0; i < 6; i++) {
      const m = riflemanAt(state, "A", plane.x, plane.y);
      m.garrisonedIn = plane.id;
      plane.garrison.push(m.id);
      m.state = "garrison";
      men.push(m);
    }
    const tx = 100 * ts;
    const ty = 120 * ts;
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: tx, y: ty });
    assert.ok(until(state, 2000, () => men.some((m) => m.chute)) >= 0, "the first man jumps");
    const first = men.find((m) => m.chute)!;
    assert.ok(isAirborne(first), "under the canopy he is in the air");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === first.id)?.chute != null, true);
    const cmd = applyCommand(state, "A", { type: "cmd.move", ids: [first.id], x: 0, y: 0 });
    assert.equal(cmd.ok, false, "no orders in the air");
    assert.ok(until(state, 400, () => men.every((m) => m.garrisonedIn == null)) >= 0, "the whole stick is out");
    assert.ok(until(state, 600, () => men.every((m) => !m.chute)) >= 0, "and on the ground");
    for (const m of men) {
      assert.ok(m.hp > 0);
      assert.ok(Math.hypot(m.x - tx, m.y - ty) < t(4) * ts, "near the drop point");
    }
    ticks(state, 3);
    assert.equal(plane.order?.kind, "land");
    const ok = applyCommand(state, "A", { type: "cmd.move", ids: [first.id], x: first.x + ts * 2, y: first.y });
    assert.equal(ok.ok, true, "on the ground he takes orders");
  });

  it("drops a tank under a canopy and puts it on the ground", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedAirfield(state);
    const ts = state.tileSize;
    const plane = transportOver(state, "A", 20 * ts, 120 * ts);
    plane.air!.payload = "troops";
    plane.air!.bombs = 0;
    const tank = makeEntity(state, "warden", "A", plane.x, plane.y);
    tank.garrisonedIn = plane.id;
    plane.garrison.push(tank.id);
    tank.state = "garrison";
    const tx = 100 * ts;
    const ty = 120 * ts;
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: tx, y: ty });
    assert.ok(until(state, 2000, () => !!tank.chute) >= 0, "the tank jumps");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === tank.id)?.chute != null, true);
    const cmd = applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: 0, y: 0 });
    assert.equal(cmd.ok, false, "no orders in the air");
    assert.ok(until(state, 600, () => !tank.chute) >= 0, "and on the ground");
    assert.ok(tank.hp > 0);
    assert.equal(tank.garrisonedIn, null);
    assert.ok(Math.hypot(tank.x - tx, tank.y - ty) < t(6) * ts, "near the drop point");
  });

  it("does not let a Titan fire its rockets from the bay", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedAirfield(state);
    const ts = state.tileSize;
    const plane = transportOver(state, "A", 40 * ts, 40 * ts);
    plane.air!.payload = "troops";
    const titan = makeEntity(state, "titan", "A", plane.x, plane.y);
    titan.garrisonedIn = plane.id;
    plane.garrison.push(titan.id);
    titan.state = "garrison";
    const rockets = titan.rockets;
    riflemanAt(state, "B", plane.x + ts * 3, plane.y);
    const free = makeEntity(state, "titan", "A", plane.x + ts * 6, plane.y);
    const freeRockets = free.rockets ?? 0;
    ticks(state, 40);
    assert.ok((free.rockets ?? 0) < freeRockets, "a Titan on the ground fires in this setup");
    assert.equal(titan.rockets, rockets);
    assert.equal(state.projectiles.some((p) => p.fromId === titan.id), false);
    assert.ok(titan.hp > 0);
  });

  it("bails the stick out before it goes down", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const plane = transportOver(state, "A", 20 * ts, 20 * ts);
    plane.air!.payload = "troops";
    const m = riflemanAt(state, "A", plane.x, plane.y);
    m.garrisonedIn = plane.id;
    plane.garrison.push(m.id);
    plane.hp = 0;
    const down = until(state, 5, () => plane.air?.phase === "crash");
    assert.ok(down >= 0, "the transport should crash");
    assert.equal(m.garrisonedIn, null);
    assert.ok(m.chute && m.chute.alt > 1, "he leaves under a canopy at height");
    assert.ok(m.hp > 0);
    assert.equal(state.entities.has(m.id), true);
  });

  it("a wrecked engine destroys it and bails the stick out first", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const plane = transportOver(state, "A", 24 * ts, 24 * ts);
    plane.air!.payload = "troops";
    const m = riflemanAt(state, "A", plane.x, plane.y);
    m.garrisonedIn = plane.id;
    plane.garrison.push(m.id);
    addCrit(plane, "engine");
    step(state, TICK_DT);
    assert.equal(plane.air?.phase, "crash");
    assert.equal(m.garrisonedIn, null);
    assert.ok(m.chute && m.chute.alt > 1);
    assert.ok(m.hp > 0);
  });

  it("puts the stick on the pad when a parked plane's engine is wrecked", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const plane = makeEntity(state, "bv222", "A", 20 * ts, 20 * ts);
    plane.air!.payload = "troops";
    const m = riflemanAt(state, "A", plane.x, plane.y);
    m.garrisonedIn = plane.id;
    plane.garrison.push(m.id);
    addCrit(plane, "engine");
    step(state, TICK_DT);
    // A plane that dies on the pad is removed, the same as any other pad death.
    assert.equal(state.entities.has(plane.id), false);
    assert.equal(m.garrisonedIn, null);
    assert.equal(m.chute, undefined);
    assert.ok(m.hp > 0);
    assert.equal(state.entities.has(m.id), true);
    assert.ok(Math.hypot(m.x - plane.x, m.y - plane.y) > 4, "he climbed off the hardstand");
  });
});
