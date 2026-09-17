import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRIT_ENGINE_CHANCE,
  CRIT_ENGINE_TURN,
  CRIT_LEG_SPEED,
  CRIT_TRACKS_CHANCE,
  HANDGUN,
  TICK_DT,
  addCrit,
  catalog,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { fireStats, hullTurnMul, immobilized, moveSpeedMul, rollCrits } from "./crits.js";
import { weaponRangeWorld } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { tickMovement } from "./orders.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "T1",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value, { startingUnits: false });
  return { state, a: "A", b: "B" };
}

describe("rollCrits", () => {
  it("breaks a trooper's arm and leg on hot rolls", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "trooper", a, 100, 100);
    rollCrits(t, "front", "hit", 12, () => 0);
    assert.deepEqual(t.crits, ["arm", "leg"]);
  });

  it("does not injure infantry on a cold roll or a zero-damage glance", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "trooper", a, 100, 100);
    rollCrits(t, "front", "hit", 12, () => 0.9);
    assert.deepEqual(t.crits, []);
    rollCrits(t, "front", "glance", 0, () => 0);
    assert.deepEqual(t.crits, []);
  });

  it("breaks tracks on a side hit under 20% and skips a miss", () => {
    const { state, a } = twoPlayerMatch();
    const tank = makeEntity(state, "warden", a, 100, 100);
    rollCrits(tank, "side", "pen", 40, () => CRIT_TRACKS_CHANCE - 0.01);
    assert.deepEqual(tank.crits, ["tracks"]);
    const other = makeEntity(state, "warden", a, 120, 100);
    rollCrits(other, "side", "pen", 40, () => CRIT_TRACKS_CHANCE);
    assert.deepEqual(other.crits, []);
    rollCrits(other, "side", "ricochet", 0, () => 0);
    assert.deepEqual(other.crits, []);
  });

  it("breaks the engine on a rear hit under 40%", () => {
    const { state, a } = twoPlayerMatch();
    const tank = makeEntity(state, "warden", a, 100, 100);
    rollCrits(tank, "rear", "hit", 50, () => CRIT_ENGINE_CHANCE - 0.01);
    assert.deepEqual(tank.crits, ["engine"]);
    const cold = makeEntity(state, "hauler", a, 140, 100);
    rollCrits(cold, "rear", "hit", 12, () => CRIT_ENGINE_CHANCE);
    assert.deepEqual(cold.crits, []);
  });

  it("applies vehicle crits to motor vehicles, not buildings", () => {
    const { state, a } = twoPlayerMatch();
    const hauler = makeEntity(state, "hauler", a, 100, 100);
    rollCrits(hauler, "side", "hit", 12, () => 0);
    assert.deepEqual(hauler.crits, ["tracks"]);
    const core = makeEntity(state, "core", a, 200, 200);
    rollCrits(core, "side", "hit", 40, () => 0);
    assert.deepEqual(core.crits, []);
  });

  it("does not stack the same injury twice", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "trooper", a, 100, 100);
    addCrit(t, "arm");
    rollCrits(t, "front", "hit", 12, () => 0);
    assert.deepEqual(t.crits, ["arm", "leg"]);
  });
});

describe("crit effects", () => {
  it("drops a wounded trooper to the handgun", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "trooper", a, 100, 100);
    const rifle = fireStats(t);
    assert.equal(rifle.damage, catalog("trooper").damage);
    addCrit(t, "arm");
    const pistol = fireStats(t);
    assert.equal(pistol.damage, HANDGUN.damage);
    assert.ok(weaponRangeWorld(state, t) < catalog("trooper").rangeTiles * state.tileSize);
    assert.equal(weaponRangeWorld(state, t), HANDGUN.rangeTiles * state.tileSize);
  });

  it("slows a trooper with a broken leg and pins tracked vehicles", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const from = { x: tileCenter(12, ts), y: tileCenter(12, ts) };
    const dest = { x: tileCenter(20, ts), y: tileCenter(12, ts) };
    const healthy = makeEntity(state, "trooper", a, from.x, from.y);
    const wounded = makeEntity(state, "trooper", a, from.x, from.y + ts * 6);
    addCrit(wounded, "leg");
    healthy.facing = 0;
    wounded.facing = 0;
    healthy.waypoints = [{ x: dest.x, y: dest.y }];
    wounded.waypoints = [{ x: dest.x, y: dest.y + ts * 6 }];
    tickMovement(state, TICK_DT);
    const dH = Math.hypot(healthy.x - from.x, healthy.y - from.y);
    const dW = Math.hypot(wounded.x - from.x, wounded.y - (from.y + ts * 6));
    assert.ok(dH > 0, `healthy moved ${dH}`);
    assert.ok(Math.abs(dW / dH - CRIT_LEG_SPEED) < 0.08, `ratio=${dW / dH}`);
    assert.equal(moveSpeedMul(wounded), CRIT_LEG_SPEED);

    const tank = makeEntity(state, "warden", a, from.x, from.y + ts * 12);
    tank.facing = 0;
    addCrit(tank, "tracks");
    tank.waypoints = [{ x: dest.x, y: tank.y }];
    const x0 = tank.x;
    tickMovement(state, TICK_DT);
    assert.equal(tank.x, x0);
    assert.equal(immobilized(tank), true);
    assert.equal(moveSpeedMul(tank), 0);
  });

  it("leaves turret traverse alone when the engine dies", () => {
    const { state, a } = twoPlayerMatch();
    const tank = makeEntity(state, "warden", a, 100, 100);
    addCrit(tank, "engine");
    assert.equal(hullTurnMul(tank), CRIT_ENGINE_TURN);
    assert.equal(moveSpeedMul(tank), 0);
    assert.equal(fireStats(tank).damage, catalog("warden").damage);
  });

  it("puts injuries on the snapshot", () => {
    const { state, a } = twoPlayerMatch();
    const t = makeEntity(state, "trooper", a, 100, 100);
    addCrit(t, "arm");
    addCrit(t, "leg");
    const snap = snapshotFor(state, a);
    const view = snap.entities.find((e) => e.id === t.id);
    assert.deepEqual(view?.crits, ["arm", "leg"]);
  });
});
