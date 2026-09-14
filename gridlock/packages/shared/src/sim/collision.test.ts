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
  const state = createMatch(room, started.value);
  return { state, a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

describe("unit collision", () => {
  it("does not let a Mauler pass through a friendly Trooper", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const hauler = makeEntity(state, "hauler", "A", 18 * 32, 20 * 32);
    const trooper = makeEntity(state, "trooper", "A", 22 * 32, 20 * 32);
    hauler.autoHarvest = false;
    const need = hauler.radius + trooper.radius;
    applyCommand(state, "A", { type: "cmd.move", ids: [hauler.id], x: 30 * 32, y: 20 * 32 });
    for (let i = 0; i < 80; i++) {
      step(state, TICK_DT);
      const d = Math.hypot(hauler.x - trooper.x, hauler.y - trooper.y);
      assert.ok(d + 0.75 >= need, `overlap at tick ${i} dist=${d} need=${need}`);
    }
    assert.ok(trooper.hp > 0, "friendly infantry must not be crushed");
  });

  it("lets an enemy Warden crush opposing Troopers", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(36, ts), tileCenter(16, ts));
    const trooper = makeEntity(state, "trooper", "B", tank.x + tank.radius + 6, tank.y);
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
    const trooper = makeEntity(state, "trooper", "A", tank.x + tank.radius + 6, tank.y);
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
    const t = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
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
    const mover = makeEntity(state, "trooper", "A", tileCenter(36, ts), y);
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
