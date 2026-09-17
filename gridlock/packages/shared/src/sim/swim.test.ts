import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SWIM_SPEED, STANCE_SPEED, TICK_DT } from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter, unitInWater, walkable } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { astar } from "./path.js";
import { moveSpeedMul } from "./crits.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "SW1",
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
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function clearPad(state: MatchState, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
}

function flood(state: MatchState, x: number, y: number): void {
  const i = y * state.width + x;
  state.terrain[i] = TILE_WATER;
  state.blocked[i] = 1;
}

describe("water swimming", () => {
  it("lets infantry enter water that blocks vehicles", () => {
    const { state } = twoPlayerMatch();
    const x0 = 70;
    const y0 = 40;
    clearPad(state, x0, y0, x0 + 20, y0 + 8);
    for (let y = y0 + 2; y <= y0 + 6; y++) {
      for (let x = x0 + 8; x <= x0 + 12; x++) flood(state, x, y);
    }
    const gx = x0 + 10;
    const gy = y0 + 4;
    assert.equal(walkable(state, gx, gy), false);
    assert.equal(walkable(state, gx, gy, "trooper"), true);
    assert.equal(walkable(state, gx, gy, "warden"), false);
    assert.equal(walkable(state, gx, gy, "hauler"), false);

    const infPath = astar(state, x0 + 2, gy, x0 + 18, gy, "trooper");
    assert.ok(infPath.length > 0);
    const tankPath = astar(state, x0 + 2, gy, x0 + 18, gy, "warden");
    assert.ok(tankPath.length > 0);
    for (const p of tankPath) {
      assert.equal(state.terrain[p.y * state.width + p.x] === TILE_WATER, false, `tank through water ${p.x},${p.y}`);
    }
  });

  it("lets troopers finish a swim across a pond", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 52;
    clearPad(state, 72, y - 3, 100, y + 3);
    for (let gy = y - 2; gy <= y + 2; gy++) {
      for (let gx = 82; gx <= 90; gx++) flood(state, gx, gy);
    }
    const inf = makeEntity(state, "trooper", "A", tileCenter(76, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [inf.id], x: tileCenter(96, ts), y: tileCenter(y, ts) });
    ticks(state, 160);
    assert.ok(inf.x > tileCenter(90, ts), `infantry x=${inf.x}`);
  });

  it("does not let a Warden drive through water", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 48;
    clearPad(state, 72, y - 3, 110, y + 3);
    for (let gy = y - 2; gy <= y + 2; gy++) {
      for (let gx = 86; gx <= 100; gx++) flood(state, gx, gy);
    }
    const tank = makeEntity(state, "warden", "A", tileCenter(80, ts), tileCenter(y, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(106, ts), y: tileCenter(y, ts) });
    for (let i = 0; i < 80; i++) {
      step(state, TICK_DT);
      const tx = Math.floor(tank.x / ts);
      const ty = Math.floor(tank.y / ts);
      assert.equal(state.terrain[ty * state.width + tx] === TILE_WATER, false, `tank in water ${tx},${ty}`);
    }
  });

  it("swims slower than a standing walk and ignores posture", () => {
    const { state, a } = twoPlayerMatch();
    const stand = makeEntity(state, "trooper", a, 100, 100);
    const crawl = makeEntity(state, "trooper", a, 140, 100);
    crawl.stance = "crawl";
    crawl.stanceOrder = "crawl";
    assert.equal(moveSpeedMul(stand), STANCE_SPEED.stand);
    assert.equal(moveSpeedMul(stand, true), SWIM_SPEED);
    assert.equal(moveSpeedMul(crawl, true), SWIM_SPEED);
    assert.ok(SWIM_SPEED < STANCE_SPEED.crouch);
    assert.ok(SWIM_SPEED > STANCE_SPEED.crawl);
  });

  it("cannot fire rifles from the water and resumes on land", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = 40;
    clearPad(state, 70, y - 6, 110, y + 6);
    for (let gy = y - 2; gy <= y + 2; gy++) {
      for (let gx = 78; gx <= 88; gx++) flood(state, gx, gy);
    }
    const inf = makeEntity(state, "trooper", "A", tileCenter(83, ts), tileCenter(y, ts));
    const dummy = makeEntity(state, "trooper", "B", tileCenter(94, ts), tileCenter(y, ts));
    dummy.holdPosition = true;
    dummy.cooldown = 99;
    dummy.facing = Math.PI;
    inf.facing = 0;
    inf.holdPosition = true;
    assert.equal(unitInWater(state, inf), true);
    applyCommand(state, "A", { type: "cmd.attack", ids: [inf.id], targetId: dummy.id });
    ticks(state, 40);
    assert.equal(unitInWater(state, inf), true);
    assert.equal(dummy.hp, 40, "must not fire while swimming");
    assert.equal(state.projectiles.length, 0);

    inf.holdPosition = false;
    inf.x = tileCenter(92, ts);
    inf.y = tileCenter(y, ts);
    inf.waypoints = [];
    inf.tileX = 92;
    inf.tileY = y;
    assert.equal(unitInWater(state, inf), false);
    applyCommand(state, "A", { type: "cmd.attack", ids: [inf.id], targetId: dummy.id });
    ticks(state, 20);
    assert.ok(dummy.hp < 40, `should fire on land hp=${dummy.hp}`);
  });

  it("marks swimming on a friendly snapshot", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 44;
    clearPad(state, 80, y - 2, 90, y + 2);
    flood(state, 85, y);
    const t = makeEntity(state, "trooper", a, tileCenter(85, ts), tileCenter(y, ts));
    const view = snapshotFor(state, a).entities.find((e) => e.id === t.id);
    assert.equal(view?.swimming, true);
    t.x = tileCenter(81, ts);
    t.y = tileCenter(y, ts);
    const dry = snapshotFor(state, a).entities.find((e) => e.id === t.id);
    assert.equal(dry?.swimming, undefined);
  });
});
