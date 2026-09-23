import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TICK_DT, catalog } from "../catalog.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter, walkable, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
import { astar } from "./path.js";
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

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

describe("unit collision", () => {
  it("does not crush a friendly Trooper when a Mauler drives at it", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = tileCenter(16, ts);
    const hauler = makeEntity(state, "hauler", "A", tileCenter(36, ts), y);
    const trooper = makeEntity(state, "rifleman", "A", hauler.x + hauler.radius + 6, y);
    hauler.autoHarvest = false;
    hauler.facing = 0;
    const destX = tileCenter(56, ts);
    applyCommand(state, "A", { type: "cmd.move", ids: [hauler.id], x: destX, y });
    ticks(state, 80);
    assert.ok(trooper.hp > 0, "friendly infantry must not be crushed");
    assert.ok(state.entities.has(trooper.id));
  });

  it("lets an enemy Warden crush opposing Troopers", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(36, ts), tileCenter(16, ts));
    const trooper = makeEntity(state, "rifleman", "B", tank.x + tank.radius + 6, tank.y);
    tank.facing = 0;
    tank.turretFacing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(56, ts), y: tileCenter(16, ts) });
    ticks(state, 40);
    assert.ok(trooper.hp <= 0 || !state.entities.has(trooper.id), `trooper hp=${trooper.hp}`);
  });

  it("does not crush friendly Troopers", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(36, ts), tileCenter(16, ts));
    const trooper = makeEntity(state, "rifleman", "A", tank.x + tank.radius + 6, tank.y);
    tank.facing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(56, ts), y: tileCenter(16, ts) });
    ticks(state, 40);
    assert.ok(state.entities.has(trooper.id) && trooper.hp > 0, `friendly hp=${trooper.hp}`);
  });
});

describe("warden wrecks", () => {
  it("leaves an impassable hull that can be destroyed", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", 24 * 32, 20 * 32);
    const tx = worldToTile(tank.x, ts);
    const ty = worldToTile(tank.y, ts);
    tank.hp = 0;
    step(state, TICK_DT);
    assert.equal(tank.wreck, true);
    assert.ok(tank.hp > 0);
    assert.equal(walkable(state, tx, ty), false);

    tank.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.entities.has(tank.id), false);
    assert.equal(walkable(state, tx, ty), true);
  });

  it("does not leave a wreck for infantry", () => {
    const { state } = twoPlayerMatch();
    const t = makeEntity(state, "rifleman", "A", 20 * 32, 20 * 32);
    t.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.entities.has(t.id), false);
  });

  it("blocks the hull plus path clearance, not only the center tile", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(46, ts), tileCenter(16, ts));
    tank.hp = 0;
    step(state, TICK_DT);
    assert.equal(tank.wreck, true);
    const tx = worldToTile(tank.x, ts);
    const ty = worldToTile(tank.y, ts);
    assert.equal(walkable(state, tx, ty, "warden"), false);
    assert.equal(walkable(state, tx + 1, ty, "warden"), false);
    const need = tank.radius + catalog("warden").radius;
    const far = Math.ceil(need / ts) + 1;
    assert.equal(walkable(state, tx + far, ty, "warden"), true);
  });

  it("A* detours a wreck instead of clipping the hull", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = 16;
    const wreck = makeEntity(state, "warden", "A", tileCenter(46, ts), tileCenter(y, ts));
    wreck.hp = 0;
    step(state, TICK_DT);
    const path = astar(state, 36, y, 56, y, "warden");
    assert.ok(path.length > 0, "expected a path around the wreck");
    const need = wreck.radius + catalog("warden").radius;
    for (const p of path) {
      const d = Math.hypot(tileCenter(p.x, ts) - wreck.x, tileCenter(p.y, ts) - wreck.y);
      assert.ok(d + 1e-6 >= need, `path tile ${p.x},${p.y} dist=${d} need=${need}`);
    }
  });

  it("lets a Warden drive past a wreck instead of circling it", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = tileCenter(16, ts);
    const wreck = makeEntity(state, "warden", "A", tileCenter(46, ts), y);
    wreck.hp = 0;
    step(state, TICK_DT);
    const mover = makeEntity(state, "warden", "A", tileCenter(36, ts), y);
    mover.facing = 0;
    const destX = tileCenter(56, ts);
    applyCommand(state, "A", { type: "cmd.move", ids: [mover.id], x: destX, y });
    const need = mover.radius + wreck.radius;
    let minDist = Infinity;
    for (let i = 0; i < 250; i++) {
      step(state, TICK_DT);
      minDist = Math.min(minDist, Math.hypot(mover.x - wreck.x, mover.y - wreck.y));
      if (mover.waypoints.length === 0 && mover.state === "idle") break;
    }
    assert.ok(Math.abs(mover.x - destX) < ts * 2, `ended at ${mover.x}, dest ${destX}`);
    assert.ok(minDist + 0.5 >= need, `clipped wreck minDist=${minDist} need=${need}`);
  });

  it("lets a Trooper walk past a wreck", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = tileCenter(16, ts);
    const wreck = makeEntity(state, "warden", "A", tileCenter(46, ts), y);
    wreck.hp = 0;
    step(state, TICK_DT);
    const mover = makeEntity(state, "rifleman", "A", tileCenter(36, ts), y);
    const destX = tileCenter(56, ts);
    applyCommand(state, "A", { type: "cmd.move", ids: [mover.id], x: destX, y });
    const need = mover.radius + wreck.radius;
    let minDist = Infinity;
    for (let i = 0; i < 200; i++) {
      step(state, TICK_DT);
      minDist = Math.min(minDist, Math.hypot(mover.x - wreck.x, mover.y - wreck.y));
      if (mover.waypoints.length === 0 && mover.state === "idle") break;
    }
    assert.ok(Math.abs(mover.x - destX) < ts * 2, `ended at ${mover.x}, dest ${destX}`);
    assert.ok(minDist + 0.5 >= need, `clipped wreck minDist=${minDist} need=${need}`);
  });

  it("repaths around a wreck that appears on the way", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = tileCenter(16, ts);
    const mover = makeEntity(state, "warden", "A", tileCenter(36, ts), y);
    const blocker = makeEntity(state, "warden", "B", tileCenter(46, ts), y);
    mover.facing = 0;
    const destX = tileCenter(56, ts);
    applyCommand(state, "A", { type: "cmd.move", ids: [mover.id], x: destX, y });
    ticks(state, 8);
    blocker.hp = 0;
    ticks(state, 250);
    assert.ok(Math.abs(mover.x - destX) < ts * 3, `stuck at ${mover.x}, dest ${destX}`);
    assert.equal(blocker.wreck, true);
    assert.ok(Math.hypot(mover.x - blocker.x, mover.y - blocker.y) + 0.5 >= mover.radius + blocker.radius);
  });
});

describe("warden ammo", () => {
  it("consumes AP on fire and stops when the rack is empty", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const tank = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    const dummy = makeEntity(state, "hauler", "B", 24 * 32, 20 * 32);
    dummy.autoHarvest = false;
    tank.facing = 0;
    dummy.facing = Math.PI;
    const ap0 = tank.ammo.ap ?? 0;
    applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: dummy.id });
    ticks(state, 5);
    assert.equal(tank.ammo.ap, ap0 - 1);

    tank.ammo = { ap: 0, he: 0, heat: 0, smoke: 0 };
    const hp = dummy.hp;
    dummy.cooldown = 99;
    ticks(state, 30);
    assert.equal(dummy.hp, hp);
  });

  it("switches the loaded shell for selected Wardens", () => {
    const { state } = twoPlayerMatch();
    const tank = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    assert.equal(tank.shell, "ap");
    const res = applyCommand(state, "A", { type: "cmd.ammo", ids: [tank.id], shell: "he" });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(tank.shell, "he");
    assert.equal(catalog("warden").ammo?.he, 6);
  });
});

describe("warden tracks vs obstacles", () => {
  function angAbs(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  it("drives around a parked Warden by yawing, never sliding sideways", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = tileCenter(16, ts);
    const tank = makeEntity(state, "warden", "A", tileCenter(36, ts), y);
    tank.facing = 0;
    tank.turretFacing = 0;
    const parked = makeEntity(state, "warden", "A", tileCenter(41, ts), y);
    parked.facing = Math.PI / 2;
    parked.turretFacing = parked.facing;
    const destX = tileCenter(50, ts);
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: destX, y });
    let moved = 0;
    for (let i = 0; i < 400; i++) {
      const ox = tank.x;
      const oy = tank.y;
      const of = tank.facing;
      step(state, TICK_DT);
      const mx = tank.x - ox;
      const my = tank.y - oy;
      const m = Math.hypot(mx, my);
      if (m > 0.05) {
        moved++;
        const md = Math.atan2(my, mx);
        const off = Math.min(angAbs(md, of), angAbs(md, of + Math.PI)) * (180 / Math.PI);
        assert.ok(off <= 1.5, `tick ${i}: rolled ${off.toFixed(1)}° off the hull axis (facing ${of.toFixed(2)})`);
        assert.ok(angAbs(tank.facing, of) < 1e-9, `tick ${i}: yawed while rolling`);
      }
      if (!tank.order && tank.waypoints.length === 0) break;
    }
    assert.ok(moved > 10, "tank should have rolled");
    assert.ok(tank.x > parked.x + ts, `tank must get past the parked hull x=${tank.x} parked=${parked.x}`);
    assert.ok(tank.x > destX - ts * 2, `tank stuck at ${tank.x}, dest ${destX}`);
  });

  it("stops at the foot of a waypoint instead of hopping onto it sideways", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = tileCenter(16, ts);
    const tank = makeEntity(state, "warden", "A", tileCenter(36, ts), y);
    tank.facing = 0;
    tank.turretFacing = 0;
    // 1.8° off the bow snaps to the east face; the 3px miss is arrival slop, not a hop.
    tank.order = { kind: "move", x: tank.x + ts * 12, y: y + 3 };
    tank.state = "move";
    tank.waypoints = [{ x: tank.x + ts * 12, y: y + 3 }];
    for (let i = 0; i < 60; i++) {
      const oy = tank.y;
      step(state, TICK_DT);
      assert.ok(Math.abs(tank.y - oy) < 1e-6, `tick ${i}: hull moved sideways by ${tank.y - oy}`);
      if (tank.waypoints.length === 0) break;
    }
    assert.equal(tank.waypoints.length, 0);
  });
});
