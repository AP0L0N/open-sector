import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { DRONE_BATTERY_SECONDS, NEUTRAL_OWNER, TICK_DT } from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { NEUTRAL_CREW_EVERY_TICKS, SUB_AI_HOLD_TICKS, droneCall, subDepthCall, tickNeutralCrews } from "./ai-crew.js";
import { droneOf } from "./drone.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "CR1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Open, level ground over the rectangle, inclusive. Water where `water` says so. */
function paint(state: MatchState, x0: number, y0: number, x1: number, y1: number, water: boolean): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = water ? TILE_WATER : TILE_EMPTY;
      state.blocked[i] = water ? 1 : 0;
      state.heights[i] = 0;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

/** Open water over the middle of the yard, (120..200)². */
function sea(): MatchState {
  const state = twoPlayerMatch();
  paint(state, 120, 120, 200, 200, true);
  return state;
}

/** Open level ground over the middle of the yard, (120..200)². */
function field(): MatchState {
  const state = twoPlayerMatch();
  paint(state, 120, 120, 200, 200, false);
  return state;
}

function spawn(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  return makeEntity(state, type, owner, tileCenter(tx, state.tileSize), tileCenter(ty, state.tileSize));
}

/** Run the neutral crews once, on a fresh tick. */
function crews(state: MatchState): void {
  step(state, TICK_DT);
  state.neutralNextMicroTick = 0;
  tickNeutralCrews(state);
}

describe("crew calls", () => {
  it("a neutral submarine dives when it sees an enemy boat", () => {
    const state = sea();
    const sub = spawn(state, "submarine", NEUTRAL_OWNER, 150, 160);
    crews(state);
    assert.ok(!sub.dive?.down, "nothing in sight: it stays up");
    spawn(state, "gunboat", "A", 165, 160);
    crews(state);
    assert.equal(sub.dive?.down, true, "it goes down on contact");
  });

  it("comes up for air once the enemy has been gone a while", () => {
    const state = sea();
    const sub = spawn(state, "submarine", NEUTRAL_OWNER, 150, 160);
    const boat = spawn(state, "gunboat", "A", 165, 160);
    crews(state);
    assert.equal(sub.dive?.down, true);
    boat.hp = 0;
    state.entities.delete(boat.id);
    crews(state);
    assert.equal(sub.dive?.down, true, "it holds below for a while");
    state.tick += SUB_AI_HOLD_TICKS;
    crews(state);
    assert.equal(sub.dive?.down, false, "then surfaces");
  });

  it("leaves a named strike to set its own depth", () => {
    const state = sea();
    const sub = spawn(state, "submarine", "B", 150, 160);
    const boat = spawn(state, "gunboat", "A", 165, 160);
    sub.order = { kind: "attack", targetId: boat.id };
    assert.equal(subDepthCall(state, sub), null);
    sub.order = null;
    assert.equal(subDepthCall(state, sub), true);
  });

  it("a neutral Drone Op sends his drone in on an enemy he sees", () => {
    const state = field();
    const op = spawn(state, "droneop", NEUTRAL_OWNER, 150, 160);
    op.holdPosition = true;
    const foe = spawn(state, "rifleman", "A", 162, 160);
    foe.holdPosition = true;
    crews(state);
    const d = droneOf(state, op);
    assert.ok(d, "the drone is up");
    assert.equal(d.drone?.mode, "strike");
    assert.equal(d.order?.kind, "attack");
    assert.equal(d.order?.targetId, foe.id);
  });

  it("a neutral Drone Op on watch keeps a charged drone up looking", () => {
    const state = field();
    const op = spawn(state, "droneop", NEUTRAL_OWNER, 150, 160);
    op.droneLink!.charge = DRONE_BATTERY_SECONDS;
    crews(state);
    const d = droneOf(state, op);
    assert.ok(d, "the drone is up");
    assert.equal(d.drone?.mode, "surveil");
    assert.equal(d.drone?.guard?.targetId, op.id, "it circles over its op");
  });

  it("a surveilling drone turns to Search & Destroy on contact", () => {
    const state = field();
    const op = spawn(state, "droneop", "B", 150, 160);
    op.droneLink!.charge = DRONE_BATTERY_SECONDS;
    assert.deepEqual(droneCall(state, op, false), null, "at home with nothing seen, it stays stowed");
    const call = droneCall(state, op, true);
    assert.equal(call?.mode, "surveil");
    assert.equal(call?.launch, true);
    const foe = spawn(state, "rifleman", "A", 162, 160);
    assert.deepEqual(droneCall(state, op, false), { mode: "strike", launch: true, attackId: foe.id });
  });

  it("checks the neutral crews only every so often", () => {
    const state = sea();
    const sub = spawn(state, "submarine", NEUTRAL_OWNER, 150, 160);
    crews(state);
    spawn(state, "gunboat", "A", 165, 160);
    tickNeutralCrews(state);
    assert.ok(!sub.dive?.down, "not until the next look");
    state.tick += NEUTRAL_CREW_EVERY_TICKS;
    tickNeutralCrews(state);
    assert.equal(sub.dive?.down, true);
  });
});
