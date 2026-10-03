import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTILLERY_CREW,
  ARTILLERY_CREW_HP,
  ARTILLERY_MIN_RANGE_TILES,
  ARTILLERY_RANGE_TILES,
  ARTILLERY_SETUP_SECONDS,
  ARTILLERY_SHELL,
  MORTAR,
  MORTAR_SPLASH_TILES,
  NEBELWERFER_RANGE_TILES,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  isArmoredType,
  isInfantryType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { gunCrewOf } from "./artillery.js";
import { applyCommand } from "./commands.js";
import { moveSpeedMul } from "./crits.js";
import { makeEntity, playerTeam, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "AR1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Flat, dry strip along row `y` with no units on it, long enough for the gun's whole reach. */
function range(): { state: MatchState; y: number; ts: number } {
  const state = twoPlayerMatch();
  for (const e of [...state.entities.values()]) if (e.kind === "unit") state.entities.delete(e.id);
  state.heights.fill(0);
  const ts = state.tileSize;
  const y = 40;
  for (let gy = y - 10; gy <= y + 10; gy++) {
    for (let gx = 4; gx < state.width - 4; gx++) {
      const i = gy * state.width + gx;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
    }
  }
  return { state, y, ts };
}

function gunAt(state: MatchState, x: number, y: number, owner = "A"): Entity {
  const ts = state.tileSize;
  const g = makeEntity(state, "artillery", owner, tileCenter(x, ts), tileCenter(y, ts));
  g.facing = 0;
  g.turretFacing = 0;
  g.holdPosition = true;
  return g;
}

/** A soldier who holds his ground, never fires back, and cannot die. */
function dummy(state: MatchState, owner: string, x: number, y: number): Entity {
  const ts = state.tileSize;
  const e = makeEntity(state, "rifleman", owner, tileCenter(x, ts), tileCenter(y, ts));
  e.holdPosition = true;
  e.cooldown = 1e9;
  e.hp = e.hpMax = 1e9;
  return e;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function secs(s: number): number {
  return Math.ceil(s / TICK_DT);
}

function shellsFrom(state: MatchState, e: Entity): Projectile[] {
  return state.projectiles.filter((p) => p.fromId === e.id && p.flight === "mortar");
}

/** A rifle round one tile west of `e`, flying east into it. */
function bulletInto(state: MatchState, e: Entity, damage: number): void {
  state.projectiles.push({
    id: state.nextId++,
    ownerId: "B",
    team: playerTeam(state, "B"),
    x: e.x - e.radius - 6,
    y: e.y,
    vx: 600,
    vy: 0,
    damage,
    penetration: 4,
    caliber: 7.92,
    life: 0.2,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
    z: 0,
  });
}

/** A field-gun shell fused to burst at (x, y) on the next tick. */
function shellAt(state: MatchState, owner: string, x: number, y: number): void {
  state.projectiles.push({
    id: state.nextId++,
    ownerId: owner,
    team: playerTeam(state, owner),
    x,
    y,
    vx: 0.01,
    vy: 0,
    damage: ARTILLERY_SHELL.damage,
    penetration: ARTILLERY_SHELL.penetration,
    caliber: ARTILLERY_SHELL.caliber,
    life: TICK_DT / 2,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
    flight: "mortar",
    big: true,
    landX: x,
    landY: y,
    flightTime: TICK_DT / 2,
    apex: 0,
    z: 0,
  });
}

describe("artillery", () => {
  it("is an Armory gun with two crew, a huge reach, and a slow crawl", () => {
    const def = catalog("artillery");
    assert.equal(def.name, "Artillery");
    assert.ok(TRAIN_TYPES.includes("artillery"));
    assert.equal(producerType("artillery"), "armory");
    assert.equal(isInfantryType("artillery"), false);
    assert.equal(isArmoredType("artillery"), false);
    assert.ok(ARTILLERY_RANGE_TILES > NEBELWERFER_RANGE_TILES);
    assert.ok(def.moveTilesPerSec < catalog("mammoth").moveTilesPerSec);
    assert.ok(def.cooldown >= 10);
    assert.ok(ARTILLERY_SHELL.damage > MORTAR.damage * 2);
    assert.ok(ARTILLERY_SHELL.splashTiles > MORTAR_SPLASH_TILES);
    const { state, y } = range();
    const g = gunAt(state, 30, y);
    assert.equal(gunCrewOf(g), ARTILLERY_CREW);
    assert.deepEqual(g.gunCrew, [ARTILLERY_CREW_HP, ARTILLERY_CREW_HP]);
  });

  it("lobs a big shell at long range once the trail is set, and not inside its minimum", () => {
    const { state, y } = range();
    const ts = state.tileSize;
    const g = gunAt(state, 20, y);
    const reach = Math.floor(ARTILLERY_RANGE_TILES * 0.8);
    dummy(state, "B", 20 + reach, y);
    dummy(state, "A", 20 + reach, y - 6);
    ticks(state, secs(ARTILLERY_SETUP_SECONDS) - 4);
    assert.equal(shellsFrom(state, g).length, 0, "no shot before the trail is set");
    ticks(state, secs(1));
    const shot = shellsFrom(state, g);
    assert.equal(shot.length, 1);
    assert.equal(shot[0]!.big, true);
    assert.equal(shot[0]!.caliber, ARTILLERY_SHELL.caliber);
    assert.equal(g.ammo.he, 9);
    ticks(state, secs(catalog("artillery").cooldown * 0.8));
    assert.equal(shellsFrom(state, g).length <= 1, true, "still reloading");

    const { state: s2, y: y2 } = range();
    const g2 = gunAt(s2, 20, y2);
    dummy(s2, "B", 20 + Math.floor(ARTILLERY_MIN_RANGE_TILES * 0.6), y2);
    ticks(s2, secs(ARTILLERY_SETUP_SECONDS + 3));
    assert.equal(shellsFrom(s2, g2).length, 0);
    assert.ok(ts > 0);
  });

  it("does not fire while it is on the move", () => {
    const { state, y } = range();
    const ts = state.tileSize;
    const g = gunAt(state, 20, y);
    g.holdPosition = false;
    g.bipod = ARTILLERY_SETUP_SECONDS;
    const reach = Math.floor(ARTILLERY_RANGE_TILES * 0.8);
    dummy(state, "B", 20 + reach, y);
    dummy(state, "A", 20 + reach, y - 6);
    applyCommand(state, "A", { type: "cmd.move", ids: [g.id], x: g.x, y: g.y + 8 * ts });
    ticks(state, secs(3));
    assert.equal(shellsFrom(state, g).length, 0);
  });

  it("backs straight in on a bearing between two faces instead of zig-zagging", () => {
    const { state, y } = range();
    const ts = state.tileSize;
    const g = gunAt(state, 20, y);
    g.holdPosition = false;
    const goal = { x: g.x + 10 * ts, y: g.y + 3 * ts };
    applyCommand(state, "A", { type: "cmd.move", ids: [g.id], ...goal });
    let turns = 0;
    let turning = false;
    for (let i = 0; i < secs(40) && g.waypoints.length > 0; i++) {
      const f = g.facing;
      step(state, TICK_DT);
      const now = g.facing !== f;
      if (now && !turning) turns++;
      turning = now;
    }
    assert.equal(g.waypoints.length, 0, "it arrived");
    assert.ok(Math.hypot(goal.x - g.x, goal.y - g.y) <= ts, "it stopped on the spot");
    assert.ok(turns <= 3, `turned ${turns} times on the way`);
  });

  it("shrugs off bullets, but they kill the crew", () => {
    const { state, y } = range();
    const g = gunAt(state, 30, y);
    const hp = g.hp;
    for (let i = 0; i < 80 && gunCrewOf(g) > 0; i++) {
      bulletInto(state, g, 25);
      step(state, TICK_DT);
    }
    assert.equal(g.hp, hp, "small arms never mark the gun");
    assert.equal(gunCrewOf(g), 0, "the crew went down");
    assert.ok(state.bodies.length >= ARTILLERY_CREW);
    const moved = applyCommand(state, "A", { type: "cmd.move", ids: [g.id], x: g.x + 80, y: g.y });
    assert.equal(moved.ok, false, "nobody left to haul it");
    assert.equal(moveSpeedMul(g), 0);
  });

  it("is crewed again by any infantry; an empty gun goes to whoever crews it", () => {
    const { state, y } = range();
    const ts = state.tileSize;
    const g = gunAt(state, 30, y);
    g.gunCrew = [ARTILLERY_CREW_HP];
    const r = makeEntity(state, "gunner", "A", tileCenter(26, ts), tileCenter(y, ts));
    r.hp = r.hpMax / 2;
    const ok = applyCommand(state, "A", { type: "cmd.board", ids: [r.id], truckId: g.id });
    assert.equal(ok.ok, true);
    ticks(state, secs(6));
    assert.equal(state.entities.has(r.id), false, "the soldier took his place at the gun");
    assert.equal(gunCrewOf(g), 2);
    assert.equal(g.gunCrew![1], Math.round(ARTILLERY_CREW_HP / 2));

    const full = makeEntity(state, "rifleman", "A", tileCenter(26, ts), tileCenter(y, ts));
    assert.equal(applyCommand(state, "A", { type: "cmd.board", ids: [full.id], truckId: g.id }).ok, false);
    state.entities.delete(full.id);

    g.gunCrew = [];
    const enemy = makeEntity(state, "rifleman", "B", tileCenter(34, ts), tileCenter(y, ts));
    assert.equal(applyCommand(state, "B", { type: "cmd.board", ids: [enemy.id], truckId: g.id }).ok, true);
    ticks(state, secs(6));
    assert.equal(g.ownerId, "B");
    assert.equal(gunCrewOf(g), 1);
  });

  it("is wrecked by shells, and the blast wounds the crew", () => {
    const { state, y } = range();
    const g = gunAt(state, 30, y);
    g.gunCrew = [1000, 1000];
    const hp = g.hp;
    shellAt(state, "B", g.x + 2, g.y);
    step(state, TICK_DT);
    assert.ok(g.hp < hp * 0.4, "a near hit nearly destroys it");
    assert.ok(g.gunCrew![0]! < 1000 && g.gunCrew![1]! < 1000);
    shellAt(state, "B", g.x, g.y);
    ticks(state, 2);
    assert.equal(state.entities.has(g.id), false);
  });

  it("hauls at half pace with one man", () => {
    const { state, y } = range();
    const g = gunAt(state, 30, y);
    assert.equal(moveSpeedMul(g), 1);
    g.gunCrew = [ARTILLERY_CREW_HP];
    assert.equal(moveSpeedMul(g), 0.5);
  });

  it("walks barrel last, and a supply truck tows it faster", () => {
    const { state, y } = range();
    const ts = state.tileSize;
    const g = gunAt(state, 30, y);
    g.holdPosition = false;
    const start = g.x;
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [g.id], x: g.x + 30 * ts, y: g.y }).ok, true);
    ticks(state, secs(10));
    const walked = g.x - start;
    assert.ok(walked > 0, "the crew hauled it");
    assert.ok(Math.cos(g.facing) < -0.9, "the barrel trails");
    applyCommand(state, "A", { type: "cmd.stop", ids: [g.id] });

    const truck = makeEntity(state, "supply", "A", g.x - 6 * ts, g.y + 8 * ts);
    assert.equal(applyCommand(state, "A", { type: "cmd.tow", ids: [truck.id], targetId: g.id }).ok, true);
    for (let i = 0; i < secs(20) && g.towedBy == null; i++) step(state, TICK_DT);
    assert.equal(g.towedBy, truck.id);
    assert.equal(truck.towing, g.id);
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [g.id], x: g.x + 40, y: g.y }).ok, false);

    const from = g.x;
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [truck.id], x: truck.x + 60 * ts, y: g.y }).ok, true);
    ticks(state, secs(10));
    assert.ok(g.x - from > walked * 2, "towing beats hauling");
    assert.ok(Math.hypot(g.x - truck.x, g.y - truck.y) < truck.radius + g.radius + 6, "the gun rides behind the truck");
    const snap = snapshotFor(state, "A").entities.find((e) => e.id === g.id);
    assert.equal(snap?.gun?.towedBy, truck.id);
    assert.equal(snap?.gun?.crew, 2);

    assert.equal(applyCommand(state, "A", { type: "cmd.tow", ids: [truck.id] }).ok, true);
    assert.equal(g.towedBy, undefined);
    assert.equal(truck.towing, undefined);
  });
});
