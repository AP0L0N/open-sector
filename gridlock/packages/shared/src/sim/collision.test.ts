import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TICK_DT, catalog } from "../catalog.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter, walkable, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
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

    tank.ammo = { ap: 0, he: 0, heat: 0 };
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
