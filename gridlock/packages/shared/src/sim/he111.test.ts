import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  AIR_FUEL_SECONDS,
  HE111_DROP_ALT,
  TICK_DT,
  TORPEDO_RANGE_TILES,
  TORPEDO_SPEED,
  TRAIN_TYPES,
  airLoadoutOf,
  catalog,
  dropsTorpedo,
  isAircraftType,
  isTorpedoBody,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import type { ImpactView } from "../protocol.js";
import { applyCommand } from "./commands.js";
import { isWater, makeEntity, tileCenter, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
import { diving } from "./naval.js";
import { spawnUnit } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "HE11", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.players.get("A")!.scrap = 50_000;
  // Bare board: no village, no Rigs. Each test lays the ground and the units it is about.
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

/** A match whose whole middle is open water, with a dry rim for the Core and the Airfield. */
function sea(): MatchState {
  const state = twoPlayerMatch();
  paint(state, 0, 0, state.width - 1, state.height - 1, TILE_EMPTY);
  paint(state, 20, 20, state.width - 21, state.height - 21, TILE_WATER);
  return state;
}

function dry(): MatchState {
  const state = twoPlayerMatch();
  paint(state, 0, 0, state.width - 1, state.height - 1, TILE_EMPTY);
  return state;
}

function at(state: MatchState, tx: number, ty: number): { x: number; y: number } {
  return { x: tileCenter(tx, state.tileSize), y: tileCenter(ty, state.tileSize) };
}

function spawn(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  const p = at(state, tx, ty);
  return makeEntity(state, type, owner, p.x, p.y);
}

/** An Albatross in the air over (tx, ty), heading east. */
function planeOver(state: MatchState, owner: string, tx: number, ty: number): Entity {
  const p = at(state, tx, ty);
  const plane = makeEntity(state, "he111", owner, p.x, p.y);
  plane.facing = 0;
  plane.air!.phase = "fly";
  plane.air!.alt = AIR_CRUISE_ALT;
  plane.air!.speed = 1;
  plane.order = { kind: "move", x: p.x, y: p.y };
  return plane;
}

function torpedoes(state: MatchState): Entity[] {
  return [...state.entities.values()].filter((e) => isTorpedoBody(e.type) && e.hp > 0);
}

/** Step until the plane lets its torpedo go. Where it was, and the torpedo's body. */
function untilDrop(state: MatchState, plane: Entity, max = 600): { x: number; y: number; alt: number; body: Entity } | null {
  for (let i = 0; i < max; i++) {
    const x = plane.x;
    const y = plane.y;
    const alt = plane.air!.alt;
    step(state, TICK_DT);
    const body = torpedoes(state)[0];
    if (body) return { x, y, alt, body };
  }
  return null;
}

describe("Albatross", () => {
  it("is an aircraft trained at the Airfield that carries one torpedo and no guns", () => {
    assert.ok(TRAIN_TYPES.includes("he111"));
    assert.ok(isAircraftType("he111"));
    assert.ok(dropsTorpedo("he111"));
    assert.equal(catalog("he111").name, "Albatross");
    assert.deepEqual(airLoadoutOf("he111"), { bombs: 1, rounds: 0 });
  });

  it("drops the submarine's own torpedo", () => {
    const he = catalog("he111");
    const sub = catalog("submarine");
    for (const k of ["damage", "penetration", "caliber", "spreadDeg", "projectileSpeed", "rangeTiles"] as const) {
      assert.equal(he[k], sub[k], k);
    }
  });

  it("rolls onto a hardstand with its torpedo hung, and hangs another after a sortie", () => {
    const state = dry();
    const ts = state.tileSize;
    makeEntity(state, "core", "A", tileCenter(4, ts), tileCenter(4, ts), { tileX: 4, tileY: 4 });
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 60, tileY: 4 });
    const def = catalog("airfield");
    const field = makeEntity(state, "airfield", "A", (30 + def.tileW / 2) * ts, (30 + def.tileH / 2) * ts, { tileX: 30, tileY: 30 });
    const plane = spawnUnit(state, "A", "he111", field, false)!;
    assert.equal(plane.air!.phase, "parked");
    assert.equal(plane.air!.bombs, 1);
    plane.air!.bombs = 0;
    for (let i = 0; i < Math.ceil(12 / TICK_DT); i++) step(state, TICK_DT);
    assert.equal(plane.air!.bombs, 1, "loaded again on the pad");
  });

  it("comes down over the water and torpedoes a boat from a submarine's reach", () => {
    const state = sea();
    const ts = state.tileSize;
    const plane = planeOver(state, "A", 40, 120);
    const boat = spawn(state, "gunboat", "B", 120, 120);
    boat.holdPosition = true;
    boat.cooldown = 1e6;
    const hp = boat.hp;
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [plane.id], targetId: boat.id }).ok, true);
    const drop = untilDrop(state, plane);
    assert.ok(drop, "it let the torpedo go");
    const d = Math.hypot(boat.x - drop.x, boat.y - drop.y);
    assert.ok(d <= TORPEDO_RANGE_TILES * ts + 1e-6, "inside a submarine's reach");
    assert.ok(d > TORPEDO_RANGE_TILES * ts - 3 * ts, "at about a submarine's reach, not on top of it");
    assert.ok(drop.alt <= HE111_DROP_ALT + 2, "down on the water");
    assert.ok(isWater(state, worldToTile(drop.x, ts), worldToTile(drop.y, ts)), "with water under it");
    assert.equal(plane.air!.bombs, 0, "one torpedo a sortie");
    const p = state.projectiles.find((q) => q.bodyId === drop.body.id);
    assert.ok(p?.torpedo, "the round is a torpedo");
    assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - TORPEDO_SPEED) < 1e-9, "at a torpedo's speed");
    const seen: ImpactView[] = [];
    for (let i = 0; i < 400 && boat.hp === hp; i++) {
      step(state, TICK_DT);
      seen.push(...state.impacts);
    }
    assert.ok(boat.hp < hp, "the torpedo found it");
    assert.ok(seen.some((v) => v.torpedo), "and went off as a torpedo");
    // With no Airfield to go home to, it breaks off and circles.
    assert.notEqual(plane.order?.kind, "attack", "the bay is empty: it breaks off");
  });

  it("never drops with land under it, and finds nothing to attack ashore", () => {
    const state = dry();
    const plane = planeOver(state, "A", 40, 120);
    const truck = spawn(state, "supply", "B", 100, 120);
    truck.holdPosition = true;
    applyCommand(state, "A", { type: "cmd.attack", ids: [plane.id], targetId: truck.id });
    for (let i = 0; i < 400; i++) step(state, TICK_DT);
    assert.equal(plane.air!.bombs, 1, "an attack ashore keeps the torpedo");
    plane.air!.fuel = AIR_FUEL_SECONDS;
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: truck.x, y: truck.y });
    for (let i = 0; i < 400; i++) step(state, TICK_DT);
    assert.equal(plane.air!.bombs, 1, "a force attack over dry land keeps it too");
    assert.equal(torpedoes(state).length, 0);
    const p = at(state, 100, 100);
    plane.air!.fuel = AIR_FUEL_SECONDS;
    applyCommand(state, "A", { type: "cmd.attackmove", ids: [plane.id], x: p.x, y: p.y });
    for (let i = 0; i < 400; i++) step(state, TICK_DT);
    assert.equal(plane.air!.bombs, 1, "an attack-move passes over targets on land");
  });

  it("runs the whole of a torpedo's run on a force attack, past the point it was laid on", () => {
    const state = sea();
    const ts = state.tileSize;
    // Already low on its run, five tiles short of the point.
    const plane = planeOver(state, "A", 80, 120);
    plane.air!.alt = HE111_DROP_ALT;
    const p = at(state, 80 + 5 * 4, 120);
    assert.equal(applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: p.x, y: p.y }).ok, true);
    const drop = untilDrop(state, plane);
    assert.ok(drop, "it let the torpedo go over the water");
    assert.ok(Math.hypot(p.x - drop.body.x, p.y - drop.body.y) < 6 * 4 * ts, "laid on a point well inside a torpedo's run");
    const id = drop.body.id;
    const x0 = drop.body.x;
    const y0 = drop.body.y;
    const toPoint = Math.hypot(p.x - x0, p.y - y0);
    let last = { x: x0, y: y0 };
    for (let i = 0; i < 600 && state.entities.get(id)?.hp; i++) {
      const b = state.entities.get(id)!;
      last = { x: b.x, y: b.y };
      step(state, TICK_DT);
    }
    const ran = Math.hypot(last.x - x0, last.y - y0);
    assert.ok(ran > toPoint + 2 * ts, "it ran on past the point");
    assert.ok(ran >= TORPEDO_RANGE_TILES * ts - TORPEDO_SPEED * TICK_DT * 2, "the full run");
  });

  it("strikes a submarine that is down, and anything else afloat across its path", () => {
    const state = sea();
    const plane = planeOver(state, "A", 40, 120);
    const prey = spawn(state, "submarine", "B", 110, 120);
    prey.holdPosition = true;
    prey.cooldown = 1e6;
    applyCommand(state, "B", { type: "cmd.dive", ids: [prey.id], down: true });
    assert.equal(diving(prey), true);
    // A friendly boat sits in the lane short of it.
    const own = spawn(state, "gunboat", "A", 96, 120);
    own.holdPosition = true;
    own.cooldown = 1e6;
    const ownHp = own.hp;
    const p = { x: prey.x, y: prey.y };
    applyCommand(state, "A", { type: "cmd.forceattack", ids: [plane.id], x: p.x, y: p.y });
    assert.ok(untilDrop(state, plane), "dropped");
    for (let i = 0; i < 400 && own.hp === ownHp; i++) step(state, TICK_DT);
    assert.ok(own.hp < ownHp, "it meets the first hull in its path, friend or foe");

    // Same run with the lane clear: the submarine below takes it.
    const state2 = sea();
    const plane2 = planeOver(state2, "A", 40, 120);
    const prey2 = spawn(state2, "submarine", "B", 110, 120);
    prey2.holdPosition = true;
    prey2.cooldown = 1e6;
    applyCommand(state2, "B", { type: "cmd.dive", ids: [prey2.id], down: true });
    const hp = prey2.hp;
    applyCommand(state2, "A", { type: "cmd.forceattack", ids: [plane2.id], x: prey2.x, y: prey2.y });
    assert.ok(untilDrop(state2, plane2), "dropped");
    for (let i = 0; i < 400 && prey2.hp === hp; i++) step(state2, TICK_DT);
    assert.ok(prey2.hp < hp, "the submarine below took it");
  });
});
