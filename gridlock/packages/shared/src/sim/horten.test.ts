import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  AIR_FUEL_SECONDS,
  AIR_HIGH_ALT,
  HORTEN_CRUISE_ALT,
  HORTEN_FUEL_SECONDS,
  TICK_DT,
  TRAIN_TYPES,
  airLoadoutOf,
  catalog,
  isAircraftType,
  isReconType,
  techNeeds,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { planeIsHigh } from "./air.js";
import { applyCommand } from "./commands.js";
import { liveSightExtra } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { spawnUnit } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function dry(): MatchState {
  const r = createRoom({ id: "SR71", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.players.get("A")!.scrap = 50_000;
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

/** A plane in the air over (tx, ty), heading east, at `alt`. */
function planeOver(state: MatchState, type: "horten" | "stuka", owner: string, tx: number, ty: number, alt: number): Entity {
  const p = at(state, tx, ty);
  const plane = makeEntity(state, type, owner, p.x, p.y);
  plane.facing = 0;
  plane.air!.phase = "fly";
  plane.air!.alt = alt;
  plane.air!.speed = 1;
  plane.order = { kind: "move", x: p.x, y: p.y };
  return plane;
}

const PLANES = TRAIN_TYPES.filter((t) => isAircraftType(t) && t !== "horten");

function flyingSight(type: (typeof TRAIN_TYPES)[number]): number {
  return catalog(type).sightTiles + liveSightExtra({ type, air: { alt: AIR_CRUISE_ALT } });
}

describe("Horten VII", () => {
  it("is an unarmed recon plane trained at the Airfield behind Research and Radar", () => {
    assert.ok(TRAIN_TYPES.includes("horten"));
    assert.ok(isAircraftType("horten"));
    assert.ok(isReconType("horten"));
    assert.equal(catalog("horten").name, "Horten VII");
    assert.equal(catalog("horten").rangeTiles, 0);
    assert.deepEqual(airLoadoutOf("horten"), { bombs: 0, rounds: 0 });
    assert.deepEqual([...techNeeds("horten")], ["research", "radar"]);
    // The Borg Gnat is the only other recon flyer.
    for (const t of PLANES) assert.equal(isReconType(t), t === "gnat", t);
  });

  it("is the fastest plane, carries more fuel, and sees the farthest in the air", () => {
    const bb = catalog("horten");
    for (const t of PLANES) {
      assert.ok(bb.moveTilesPerSec > catalog(t).moveTilesPerSec, `faster than ${t}`);
      assert.ok(flyingSight("horten") > flyingSight(t), `sees farther than ${t}`);
    }
    assert.ok(HORTEN_FUEL_SECONDS > AIR_FUEL_SECONDS);
    assert.ok(HORTEN_CRUISE_ALT > AIR_HIGH_ALT && AIR_HIGH_ALT > AIR_CRUISE_ALT);
  });

  it("comes off the pad with its own bigger tank", () => {
    const state = dry();
    const ts = state.tileSize;
    makeEntity(state, "core", "A", tileCenter(4, ts), tileCenter(4, ts), { tileX: 4, tileY: 4 });
    const def = catalog("airfield");
    const field = makeEntity(state, "airfield", "A", (30 + def.tileW / 2) * ts, (30 + def.tileH / 2) * ts, { tileX: 30, tileY: 30 });
    const plane = spawnUnit(state, "A", "horten", field, false)!;
    assert.equal(plane.air!.phase, "parked");
    assert.equal(plane.air!.fuel, HORTEN_FUEL_SECONDS);
  });

  it("climbs above every other plane, where only anti-air guns reach it", () => {
    const state = dry();
    const bb = planeOver(state, "horten", "A", 60, 120, AIR_CRUISE_ALT);
    const stuka = planeOver(state, "stuka", "A", 60, 140, AIR_CRUISE_ALT);
    const p = at(state, 200, 120);
    applyCommand(state, "A", { type: "cmd.move", ids: [bb.id], x: p.x, y: p.y });
    applyCommand(state, "A", { type: "cmd.move", ids: [stuka.id], x: p.x, y: p.y + 20 * state.tileSize });
    for (let i = 0; i < Math.ceil(5 / TICK_DT); i++) step(state, TICK_DT);
    assert.equal(bb.air!.alt, HORTEN_CRUISE_ALT);
    assert.equal(stuka.air!.alt, AIR_CRUISE_ALT);
    assert.ok(planeIsHigh(bb));
    assert.ok(!planeIsHigh(stuka));
  });

  it("shrugs off rifles overhead, but an MG42 brings it down", () => {
    const hit = (shooter: "rifleman" | "gunner"): boolean => {
      const state = dry();
      const p = at(state, 120, 120);
      const bb = planeOver(state, "horten", "A", 120, 120, HORTEN_CRUISE_ALT);
      bb.order = { kind: "guard", x: p.x, y: p.y };
      bb.air!.guard = { x: p.x, y: p.y };
      const hp = bb.hp;
      for (let i = 0; i < 4; i++) {
        const s = makeEntity(state, shooter, "B", p.x + (i - 1.5) * 12, p.y + 10);
        s.holdPosition = true;
      }
      for (let i = 0; i < Math.ceil(20 / TICK_DT) && bb.hp === hp; i++) step(state, TICK_DT);
      return bb.hp < hp;
    };
    assert.equal(hit("rifleman"), false, "rifles cannot reach it");
    assert.equal(hit("gunner"), true, "machine guns can");
  });

  it("sent at an enemy, flies over and circles it without spending the sortie", () => {
    const state = dry();
    const ts = state.tileSize;
    makeEntity(state, "core", "A", tileCenter(4, ts), tileCenter(4, ts), { tileX: 4, tileY: 4 });
    const def = catalog("airfield");
    const field = makeEntity(state, "airfield", "A", (20 + def.tileW / 2) * ts, (20 + def.tileH / 2) * ts, { tileX: 20, tileY: 20 });
    const bb = planeOver(state, "horten", "A", 60, 120, HORTEN_CRUISE_ALT);
    bb.air!.homeId = field.id;
    const truck = makeEntity(state, "supply", "B", at(state, 160, 160).x, at(state, 160, 160).y);
    truck.holdPosition = true;
    const hp = truck.hp;
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [bb.id], targetId: truck.id }).ok, true);
    for (let i = 0; i < Math.ceil(20 / TICK_DT); i++) step(state, TICK_DT);
    assert.equal(truck.hp, hp, "no weapons");
    assert.notEqual(bb.order?.kind, "land", "nothing to spend: it stays out");
    // A wide circle: fast as it is, it turns wide. Well inside its sight.
    assert.ok(Math.hypot(bb.x - truck.x, bb.y - truck.y) < 8 * 4 * ts, "circling over the target");
    // Low on fuel, it goes home.
    bb.air!.fuel = 5;
    step(state, TICK_DT);
    assert.equal(bb.order?.kind, "land");
  });
});
