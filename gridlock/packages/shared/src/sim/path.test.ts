import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FACE_MOVE_DEG, TICK_DT } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter, walkable, worldToTile } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { astar, pathToWorld } from "./path.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "P1",
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

function wall(state: MatchState, x: number, y: number): void {
  const i = y * state.width + x;
  state.terrain[i] = TILE_BLOCKED;
  state.blocked[i] = 1;
}

function flood(state: MatchState, x: number, y: number): void {
  const i = y * state.width + x;
  state.terrain[i] = TILE_WATER;
  state.blocked[i] = 1;
}

function angDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

describe("pathToWorld smoothing", () => {
  it("collapses an open-ground staircase to one heading", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const x0 = 72;
    const y0 = 48;
    clearPad(state, x0, y0, x0 + 48, y0 + 24);
    const fromX = tileCenter(x0 + 2, ts);
    const fromY = tileCenter(y0 + 2, ts);
    const toX = tileCenter(x0 + 42, ts);
    const toY = tileCenter(y0 + 18, ts);
    const tiles = astar(state, x0 + 2, y0 + 2, x0 + 42, y0 + 18, "warden");
    assert.ok(tiles.length > 20, `A* still walks tiles, got ${tiles.length}`);
    const pts = pathToWorld(state, fromX, fromY, toX, toY, "warden");
    assert.equal(pts.length, 1, `smoothed to dest, got ${pts.length}`);
    assert.equal(pts[0]?.x, toX);
    assert.equal(pts[0]?.y, toY);
    const heading = Math.atan2(toY - fromY, toX - fromX);
    const step45 = Math.PI / 4;
    const snapped = Math.round(heading / step45) * step45;
    assert.ok(angDelta(heading, snapped) > 0.15, "dest is not an 8-way world heading");
  });

  it("keeps a corner instead of cutting a wall", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const x0 = 72;
    const y0 = 40;
    clearPad(state, x0, y0, x0 + 36, y0 + 24);
    for (let y = y0; y <= y0 + 18; y++) wall(state, x0 + 18, y);
    const fromX = tileCenter(x0 + 4, ts);
    const fromY = tileCenter(y0 + 4, ts);
    const toX = tileCenter(x0 + 32, ts);
    const toY = tileCenter(y0 + 4, ts);
    const pts = pathToWorld(state, fromX, fromY, toX, toY, "warden");
    assert.ok(pts.length >= 2, `must turn the wall, got ${pts.length}`);
    const samples: { x: number; y: number }[] = [{ x: fromX, y: fromY }, ...pts];
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]!;
      const b = samples[i + 1]!;
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (ts / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const wx = a.x + (b.x - a.x) * t;
        const wy = a.y + (b.y - a.y) * t;
        const tx = worldToTile(wx, ts);
        const ty = worldToTile(wy, ts);
        assert.equal(walkable(state, tx, ty, "warden"), true, `cut wall at ${tx},${ty}`);
      }
    }
  });

  it("does not pull infantry through a pond they routed around", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const x0 = 70;
    const y0 = 40;
    clearPad(state, x0, y0, x0 + 44, y0 + 22);
    for (let y = y0 + 2; y <= y0 + 20; y++) {
      for (let x = x0 + 10; x <= x0 + 38; x++) flood(state, x, y);
    }
    const fromX = tileCenter(x0 + 2, ts);
    const fromY = tileCenter(y0 + 12, ts);
    const toX = tileCenter(x0 + 42, ts);
    const toY = tileCenter(y0 + 12, ts);
    const tiles = astar(state, x0 + 2, y0 + 12, x0 + 42, y0 + 12, "trooper");
    assert.ok(tiles.length > 0);
    assert.equal(
      tiles.some((p) => state.terrain[p.y * state.width + p.x] === TILE_WATER),
      false,
      "fixture should make the land detour cheaper than swimming",
    );
    const pts = pathToWorld(state, fromX, fromY, toX, toY, "trooper");
    assert.ok(pts.length > 0);
    const samples: { x: number; y: number }[] = [{ x: fromX, y: fromY }, ...pts];
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]!;
      const b = samples[i + 1]!;
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (ts / 2)));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const wx = a.x + (b.x - a.x) * t;
        const wy = a.y + (b.y - a.y) * t;
        const tx = worldToTile(wx, ts);
        const ty = worldToTile(wy, ts);
        assert.equal(
          state.terrain[ty * state.width + tx] === TILE_WATER,
          false,
          `shortcut through water ${tx},${ty}`,
        );
      }
    }
  });

  it("lets a Tiger hold one heading after the first turn-in-place", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const x0 = 72;
    const y0 = 48;
    clearPad(state, x0, y0, x0 + 48, y0 + 24);
    const fromX = tileCenter(x0 + 2, ts);
    const fromY = tileCenter(y0 + 2, ts);
    const toX = tileCenter(x0 + 42, ts);
    const toY = tileCenter(y0 + 18, ts);
    const tank = makeEntity(state, "warden", "A", fromX, fromY);
    tank.facing = 0;
    tank.turretFacing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: toX, y: toY });
    const firstPath = tank.waypoints.length;
    assert.equal(firstPath, 1);
    const want = Math.atan2(toY - fromY, toX - fromX);
    let rolling = false;
    let kinks = 0;
    for (let i = 0; i < 160; i++) {
      const prev = tank.facing;
      step(state, TICK_DT);
      if (!rolling) {
        if (tank.state === "move" && angDelta(tank.facing, want) * (180 / Math.PI) <= FACE_MOVE_DEG + 1) {
          rolling = true;
        }
        continue;
      }
      if (tank.waypoints.length === 0) break;
      if (angDelta(prev, tank.facing) * (180 / Math.PI) > 8) kinks++;
    }
    assert.ok(rolling, "Tiger should start rolling toward dest");
    assert.equal(kinks, 0, `heading kinks after roll started: ${kinks}`);
    assert.ok(tank.x > toX - ts * 3, `Tiger x=${tank.x} dest=${toX}`);
  });
});
