import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TICK_DT, catalog } from "../catalog.js";
import { TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { isSingleTree, makeEntity, tileCenter, walkable } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { astar } from "./path.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "TR1",
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
  return { state: createMatch(room, started.value), a: "A", b: "B" };
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

function plant(state: MatchState, x: number, y: number): void {
  state.terrain[y * state.width + x] = TILE_TREE;
  state.blocked[y * state.width + x] = 0;
}

describe("trees", () => {
  it("lets troopers walk groves that block Wardens", () => {
    const { state } = twoPlayerMatch();
    const x0 = 70;
    const y0 = 40;
    clearPad(state, x0, y0, x0 + 20, y0 + 8);
    for (let y = y0 + 2; y <= y0 + 6; y++) {
      for (let x = x0 + 8; x <= x0 + 12; x++) plant(state, x, y);
    }
    const gx = x0 + 10;
    const gy = y0 + 4;
    assert.equal(walkable(state, gx, gy), false);
    assert.equal(walkable(state, gx, gy, "trooper"), true);
    assert.equal(walkable(state, gx, gy, "warden"), false);
    assert.equal(isSingleTree(state, gx, gy), false);

    const infPath = astar(state, x0 + 2, gy, x0 + 18, gy, "trooper");
    assert.ok(infPath.some((p) => state.terrain[p.y * state.width + p.x] === TILE_TREE));
    const tankPath = astar(state, x0 + 2, gy, x0 + 18, gy, "warden");
    assert.ok(tankPath.length > 0);
    for (const p of tankPath) {
      assert.equal(state.terrain[p.y * state.width + p.x] === TILE_TREE, false, `tank through grove ${p.x},${p.y}`);
    }
  });

  it("lets a Warden crush a lone tree and not a grove", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 48;
    clearPad(state, 72, y - 4, 110, y + 4);
    plant(state, 88, y);
    assert.equal(isSingleTree(state, 88, y), true);
    assert.equal(walkable(state, 88, y, "warden"), true);

    const tank = makeEntity(state, "warden", "A", tileCenter(80, ts), tileCenter(y, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(96, ts), y: tileCenter(y, ts) });
    let sawCrush = false;
    for (let i = 0; i < 80; i++) {
      step(state, TICK_DT);
      if (state.impacts.some((im) => im.kind === "crush")) sawCrush = true;
    }
    assert.equal(state.terrain[y * state.width + 88], TILE_EMPTY);
    assert.ok(tank.x > tileCenter(88, ts));
    assert.ok(state.clearedTrees.some((t) => t.x === 88 && t.y === y));
    assert.ok(snapshotFor(state, "A").clearedTrees.some((t) => t.x === 88 && t.y === y));
    assert.ok(sawCrush, "crush should emit a debris impact");

    clearPad(state, 72, y - 4, 110, y + 4);
    tank.x = tileCenter(80, ts);
    tank.y = tileCenter(y, ts);
    tank.facing = 0;
    for (let gy = y - 1; gy <= y + 1; gy++) {
      for (let gx = 86; gx <= 90; gx++) plant(state, gx, gy);
    }
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(96, ts), y: tileCenter(y, ts) });
    ticks(state, 80);
    assert.equal(state.terrain[y * state.width + 88], TILE_TREE);
    assert.equal(walkable(state, 88, y, "warden"), false);
  });

  it("destroys a lone tree as soon as the hull overlaps it", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 44;
    clearPad(state, 72, y - 3, 100, y + 3);
    plant(state, 90, y);
    const tank = makeEntity(state, "warden", "A", tileCenter(90, ts) - catalog("warden").radius - 2, tileCenter(y, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    tank.state = "move";
    tank.waypoints = [{ x: tileCenter(96, ts), y: tileCenter(y, ts) }];
    ticks(state, 8);
    assert.equal(state.terrain[y * state.width + 90], TILE_EMPTY, "tree should be gone once the hull hits it");
    assert.ok(state.clearedTrees.some((t) => t.x === 90 && t.y === y));
  });

  it("lets troopers finish a move through woods", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 52;
    clearPad(state, 72, y - 3, 100, y + 3);
    for (let gy = y - 2; gy <= y + 2; gy++) {
      for (let gx = 82; gx <= 90; gx++) plant(state, gx, gy);
    }
    const inf = makeEntity(state, "trooper", "A", tileCenter(76, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [inf.id], x: tileCenter(96, ts), y: tileCenter(y, ts) });
    ticks(state, 90);
    assert.ok(inf.x > tileCenter(90, ts), `infantry x=${inf.x}`);
  });
});
