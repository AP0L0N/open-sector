import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FACE_MOVE_DEG, REVERSE_TILES, snapTankYaw, TICK_DT, TILE_SIZE } from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { reversing } from "./orders.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "O1",
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

function angAbs(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

describe("tank tracks", () => {
  it("does not roll until the hull finishes the yaw", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 110, 70);
    const tank = makeEntity(state, "warden", "A", tileCenter(76, ts), tileCenter(52, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tank.x;
    const destY = tileCenter(64, ts);
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y: destY });
    const x0 = tank.x;
    const y0 = tank.y;
    const want = Math.PI / 2;
    for (let i = 0; i < 80; i++) {
      if (angAbs(tank.facing, want) * (180 / Math.PI) <= FACE_MOVE_DEG) break;
      step(state, TICK_DT);
      assert.equal(tank.x, x0, `rolled during yaw tick ${i} x=${tank.x}`);
      assert.equal(tank.y, y0, `rolled during yaw tick ${i} y=${tank.y}`);
      assert.notEqual(tank.state, "move");
    }
    assert.ok(angAbs(tank.facing, want) * (180 / Math.PI) <= FACE_MOVE_DEG);
    assert.equal(tank.x, x0);
    assert.equal(tank.y, y0);
    step(state, TICK_DT);
    assert.ok(tank.y > y0, `should roll after yaw y=${tank.y} from ${y0}`);
  });

  it("does not roll on the tick that finishes a small yaw", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 110, 60);
    const tank = makeEntity(state, "warden", "A", tileCenter(80, ts), tileCenter(52, ts));
    tank.facing = (5 * Math.PI) / 180;
    tank.turretFacing = tank.facing;
    const destX = tank.x + ts * 20;
    const destY = tank.y;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y: destY });
    const x0 = tank.x;
    const y0 = tank.y;
    const want = snapTankYaw(Math.atan2(destY - tank.y, destX - tank.x));
    for (let i = 0; i < 20; i++) {
      if (angAbs(tank.facing, want) * (180 / Math.PI) <= FACE_MOVE_DEG) break;
      step(state, TICK_DT);
      assert.equal(tank.x, x0);
      assert.equal(tank.y, y0);
    }
    assert.ok(angAbs(tank.facing, want) * (180 / Math.PI) <= FACE_MOVE_DEG);
    assert.equal(tank.x, x0);
    step(state, TICK_DT);
    assert.ok(tank.x > x0, `should roll once aligned x=${tank.x} from ${x0}`);
  });

  it("reverses a short hop already at the rear without spinning the hull", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 100, 60);
    const tank = makeEntity(state, "warden", "A", tileCenter(88, ts), tileCenter(52, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tank.x - REVERSE_TILES * TILE_SIZE * 0.6;
    const destY = tank.y;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y: destY });
    assert.equal(reversing(tank), true);
    const x0 = tank.x;
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.ok(tank.x < x0 - 8, `should back up x=${tank.x} from ${x0}`);
    assert.ok(tank.x <= destX + ts, `should reach dest x=${tank.x} dest=${destX}`);
    assert.ok(angAbs(tank.facing, 0) < 0.2, `hull stays bow-east facing=${tank.facing}`);
    assert.ok(angAbs(tank.facing, Math.PI) > 2, "must not spin the rear toward the hop");
  });

  it("spins and drives forward when the rear dest is too far to reverse", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 120, 60);
    const tank = makeEntity(state, "warden", "A", tileCenter(110, ts), tileCenter(52, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tank.x - REVERSE_TILES * TILE_SIZE * 3;
    const destY = tank.y;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y: destY });
    assert.equal(reversing(tank), false);
    const x0 = tank.x;
    step(state, TICK_DT);
    assert.equal(tank.x, x0);
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.ok(tank.x < x0 - 12, `should drive west x=${tank.x} from ${x0}`);
    assert.ok(angAbs(tank.facing, Math.PI) < 0.35, `hull should face the dest facing=${tank.facing}`);
  });

  it("rolls only along the hull, never crabbing onto a diagonal", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 120, 70);
    const tank = makeEntity(state, "warden", "A", tileCenter(80, ts), tileCenter(52, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tank.x + ts * 20;
    const destY = tank.y;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y: destY });
    let moved = false;
    for (let i = 0; i < 80; i++) {
      const px = tank.x;
      const py = tank.y;
      const fx = Math.cos(tank.facing);
      const fy = Math.sin(tank.facing);
      step(state, TICK_DT);
      const mx = tank.x - px;
      const my = tank.y - py;
      const mag = Math.hypot(mx, my);
      if (mag < 0.05) continue;
      moved = true;
      const along = mx * fx + my * fy;
      const across = Math.abs(mx * -fy + my * fx);
      assert.ok(across <= 0.35, `crabbed across=${across} along=${along} facing=${tank.facing}`);
    }
    assert.ok(moved, "tank should roll");
    assert.ok(tank.x > destX - ts * 4, `x=${tank.x} dest=${destX}`);
  });

  it("keeps the dest face instead of yawing between neighbors", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 120, 80);
    const tank = makeEntity(state, "warden", "A", tileCenter(80, ts), tileCenter(52, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tank.x + ts * 24;
    const destY = tank.y + ts * 24;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y: destY });
    const want = snapTankYaw(Math.atan2(destY - tank.y, destX - tank.x));
    for (let i = 0; i < 40; i++) {
      if (angAbs(tank.facing, want) * (180 / Math.PI) <= FACE_MOVE_DEG) break;
      const x0 = tank.x;
      const y0 = tank.y;
      step(state, TICK_DT);
      assert.equal(tank.x, x0);
      assert.equal(tank.y, y0);
    }
    assert.ok(angAbs(tank.facing, want) * (180 / Math.PI) <= FACE_MOVE_DEG);
    let rolled = 0;
    for (let i = 0; i < 20; i++) {
      const x0 = tank.x;
      const y0 = tank.y;
      const face = tank.facing;
      step(state, TICK_DT);
      const d = Math.hypot(tank.x - x0, tank.y - y0);
      if (d > 0.05) rolled++;
      assert.ok(angAbs(tank.facing, face) * (180 / Math.PI) < 2, `re-yawed facing=${tank.facing} from ${face}`);
    }
    assert.ok(rolled >= 18, `should keep rolling after the first yaw rolled=${rolled}`);
  });

  it("yaws toward a close side dest instead of reversing", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 100, 70);
    const tank = makeEntity(state, "warden", "A", tileCenter(80, ts), tileCenter(52, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tank.x;
    const destY = tank.y + REVERSE_TILES * TILE_SIZE * 0.6;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y: destY });
    assert.equal(reversing(tank), false);
    const x0 = tank.x;
    const y0 = tank.y;
    step(state, TICK_DT);
    assert.equal(tank.x, x0);
    assert.equal(tank.y, y0);
    for (let i = 0; i < 50; i++) step(state, TICK_DT);
    assert.ok(tank.y > y0 + 8, `should drive south y=${tank.y} from ${y0}`);
    assert.ok(angAbs(tank.facing, Math.PI / 2) < 0.35, `hull should face south facing=${tank.facing}`);
  });

  it("reaches a long due-east click on the hull axis without a late side-hook", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 140, 70);
    const tank = makeEntity(state, "warden", "A", tileCenter(80, ts), tileCenter(52, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    const destX = tank.x + ts * 40;
    const destY = tank.y;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y: destY });
    let kinks = 0;
    for (let i = 0; i < 200; i++) {
      const prev = tank.facing;
      const px = tank.x;
      const py = tank.y;
      step(state, TICK_DT);
      const mag = Math.hypot(tank.x - px, tank.y - py);
      if (mag > 0.05) {
        const fx = Math.cos(tank.facing);
        const fy = Math.sin(tank.facing);
        const across = Math.abs((tank.x - px) * -fy + (tank.y - py) * fx);
        assert.ok(across <= 0.35, `crabbed across=${across} facing=${tank.facing}`);
        if (angAbs(prev, tank.facing) > 8 * (Math.PI / 180)) kinks++;
      }
      if (tank.waypoints.length === 0 && mag < 0.05) break;
    }
    assert.equal(kinks, 0, `late heading kinks=${kinks}`);
    assert.ok(tank.x > destX - ts * 3, `x=${tank.x} dest=${destX}`);
    assert.ok(angAbs(tank.facing, 0) < 0.2, `hull should stay bow-east facing=${tank.facing}`);
  });
});
