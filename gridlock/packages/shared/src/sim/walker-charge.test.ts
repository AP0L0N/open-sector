import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TICK_DT, WALKER_CHARGE_HP, WALKER_SELF_DESTRUCT_HP, catalog } from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "WC1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  for (let i = 0; i < state.terrain.length; i++) {
    state.terrain[i] = TILE_EMPTY;
    state.blocked[i] = 0;
    state.occupy[i] = 0;
    state.heights[i] = 0;
  }
  for (const e of [...state.entities.values()]) {
    if (e.type !== "rig") destroyEntity(state, e);
  }
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n && !state.ended; i++) step(state, TICK_DT);
}

function lowWalker(state: MatchState, x: number, y: number): Entity {
  const walker = makeEntity(state, "walker", "A", x, y);
  walker.hp = Math.round(walker.hpMax * WALKER_SELF_DESTRUCT_HP);
  walker.clip = 0;
  return walker;
}

describe("Walker self-destroy", () => {
  it("detonates on contact, nicks a tank, hurts everything else, and leaves no wreck", () => {
    const state = match();
    const ts = state.tileSize;
    const x = tileCenter(120, ts);
    const y = tileCenter(120, ts);
    const walker = lowWalker(state, x, y);
    const rifle = makeEntity(state, "rifleman", "B", x + 4, y);
    rifle.holdPosition = true;
    const tiger = makeEntity(state, "warden", "B", x + 12, y);
    tiger.holdPosition = true;
    tiger.cooldown = 999;
    const truck = makeEntity(state, "supply", "B", x + 36, y);
    truck.holdPosition = true;
    const friend = makeEntity(state, "rifleman", "A", x - 6, y);
    friend.holdPosition = true;
    const tigerHp = tiger.hp;
    const truckHp = truck.hp;
    step(state, TICK_DT);
    assert.equal(state.entities.has(walker.id), false);
    assert.equal([...state.entities.values()].some((e) => e.type === "walker"), false);
    assert.ok(rifle.hp <= 0);
    const tigerLost = tigerHp - tiger.hp;
    const truckLost = truckHp - truck.hp;
    assert.ok(tigerLost >= 1 && tigerLost <= 20, `tiger lost ${tigerLost}`);
    assert.ok(truckLost > tigerLost, `truck ${truckLost} tiger ${tigerLost}`);
    assert.ok(friend.hp < friend.hpMax);
    assert.equal(tiger.crits.length, 0);
    assert.ok(state.impacts.some((i) => i.kind === "kill" && i.blast && !i.cookoff));
  });

  it("rushes a truck he can see and blows up on it", () => {
    const state = match();
    const ts = state.tileSize;
    const x = tileCenter(110, ts);
    const y = tileCenter(120, ts);
    const walker = lowWalker(state, x, y);
    const truck = makeEntity(state, "supply", "B", x + 80, y);
    truck.holdPosition = true;
    const x0 = walker.x;
    let n = 0;
    for (; n < 250 && state.entities.has(walker.id); n++) step(state, TICK_DT);
    assert.ok(n < 250, "he reached the truck");
    assert.ok(walker.x > x0 + 10, `moved ${walker.x - x0}`);
    assert.ok(truck.hp < truck.hpMax);
    assert.equal([...state.entities.values()].some((e) => e.type === "walker" && e.wreck), false);
  });

  it("charges a building when no enemy unit is in sight", () => {
    const state = match();
    const ts = state.tileSize;
    const def = catalog("cottage");
    const tx = 120;
    const ty = 120;
    const cottage = makeEntity(state, "cottage", "B", (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
      tileX: tx,
      tileY: ty,
    });
    const walker = lowWalker(state, tileCenter(tx + def.tileW, ts), tileCenter(ty + 1, ts));
    const hp = cottage.hp;
    step(state, TICK_DT);
    assert.equal(state.entities.has(walker.id), false);
    assert.ok(cottage.hp < hp);
    assert.ok(cottage.hp > 0);
  });

  it("ignores a wall, a neutral house, and an ally, and stands when nothing qualifies", () => {
    const state = match();
    const ts = state.tileSize;
    const x = tileCenter(120, ts);
    const y = tileCenter(140, ts);
    const walker = lowWalker(state, x, y);
    // Far enough to be seen, and outside the wall's cover so the extra HP does not cancel the charge.
    const wall = makeEntity(state, "wall", "B", x + 200, y, { tileX: 145, tileY: 140 });
    const neutral = makeEntity(state, "cottage", "", x, y + 160, { tileX: 118, tileY: 160 });
    const ally = makeEntity(state, "supply", "A", x + 30, y);
    const x0 = walker.x;
    const y0 = walker.y;
    ticks(state, 15);
    assert.equal(walker.hp, Math.round(walker.hpMax * WALKER_SELF_DESTRUCT_HP));
    assert.ok(Math.abs(walker.x - x0) < 2 && Math.abs(walker.y - y0) < 2);
    assert.equal(wall.hp, wall.hpMax);
    assert.equal(neutral.hp, neutral.hpMax);
    assert.equal(ally.hp, ally.hpMax);
    assert.equal(walker.charging, true);
  });

  it("does nothing above the threshold, and Hold together keeps him put", () => {
    const state = match();
    const ts = state.tileSize;
    const x = tileCenter(120, ts);
    const y = tileCenter(160, ts);
    const walker = makeEntity(state, "walker", "A", x, y);
    walker.hp = Math.round(walker.hpMax * WALKER_SELF_DESTRUCT_HP) + 1;
    walker.clip = 0;
    makeEntity(state, "supply", "B", x + 40, y);
    ticks(state, 20);
    assert.equal(walker.x, x);
    assert.equal(walker.charging, undefined);

    walker.hp = 1;
    walker.selfDestructOff = true;
    ticks(state, 30);
    assert.equal(walker.x, x);
    assert.equal(walker.hp, 1);
    assert.equal(state.entities.has(walker.id), true);
  });

  it("drops the charge when Config turns it off, and again when he is repaired", () => {
    const state = match();
    const ts = state.tileSize;
    const x = tileCenter(100, ts);
    const y = tileCenter(100, ts);
    const walker = lowWalker(state, x, y);
    makeEntity(state, "supply", "B", x + 220, y);
    ticks(state, 20);
    assert.ok(walker.x > x + 8, `closed ${walker.x - x}`);
    assert.equal(applyCommand(state, "A", { type: "cmd.selfdestruct", ids: [walker.id], on: false }).ok, true);
    assert.equal(walker.hpMax, catalog("walker").hp);
    assert.equal(walker.hp, Math.round(catalog("walker").hp * WALKER_SELF_DESTRUCT_HP));
    assert.equal(walker.chargeBuff, undefined);
    const held = walker.x;
    ticks(state, 40);
    assert.ok(Math.abs(walker.x - held) < 2, `drifted to ${walker.x}`);
    assert.equal(walker.charging, undefined);
    assert.equal(walker.selfDestructOff, true);

    assert.equal(applyCommand(state, "A", { type: "cmd.selfdestruct", ids: [walker.id], on: true }).ok, true);
    ticks(state, 12);
    assert.ok(walker.x > held + 4);
    walker.hp = walker.hpMax;
    step(state, TICK_DT);
    const stopped = walker.x;
    ticks(state, 20);
    assert.ok(Math.abs(walker.x - stopped) < 2);
    assert.equal(walker.charging, undefined);
  });

  it("rejects an enemy, and the owner sees the switch", () => {
    const state = match();
    const ts = state.tileSize;
    const walker = makeEntity(state, "walker", "A", tileCenter(120, ts), tileCenter(180, ts));
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === walker.id)?.selfDestruct, true);
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === walker.id)?.selfDestruct, undefined);
    assert.equal(applyCommand(state, "B", { type: "cmd.selfdestruct", ids: [walker.id], on: false }).ok, false);
    assert.equal(walker.selfDestructOff, undefined);
    assert.equal(applyCommand(state, "A", { type: "cmd.selfdestruct", ids: [], on: false }).ok, false);
    assert.equal(applyCommand(state, "A", { type: "cmd.selfdestruct", ids: [walker.id], on: false }).ok, true);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === walker.id)?.selfDestruct, false);
    assert.equal(applyCommand(state, "A", { type: "cmd.selfdestruct", ids: [walker.id], on: true }).ok, true);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === walker.id)?.selfDestruct, true);
  });

  it("swells to five times the same fraction and runs faster", () => {
    const state = match();
    const ts = state.tileSize;
    const x = tileCenter(100, ts);
    const y = tileCenter(120, ts);
    const walker = lowWalker(state, x, y);
    walker.facing = 0;
    const truck = makeEntity(state, "supply", "B", x + 220, y);
    truck.holdPosition = true;
    const base = catalog("walker").hp;
    const low = Math.round(base * WALKER_SELF_DESTRUCT_HP);
    ticks(state, 2);
    assert.equal(walker.hpMax, base * WALKER_CHARGE_HP);
    assert.equal(walker.hp, low * WALKER_CHARGE_HP);
    assert.equal(walker.hp / walker.hpMax, WALKER_SELF_DESTRUCT_HP);
    assert.equal(walker.charging, true);
    assert.equal(state.smokeClouds.length, 0);
    const own = snapshotFor(state, "A").entities.find((e) => e.id === walker.id);
    assert.equal(own?.charging, true);
    assert.equal(own?.hp, walker.hp);
    assert.equal(own?.hpMax, walker.hpMax);
    const x1 = walker.x;
    ticks(state, 10);
    const gained = walker.x - x1;
    const normal = catalog("walker").moveTilesPerSec * ts * TICK_DT * 10;
    assert.ok(gained > normal * 1.25, `gained ${gained} vs normal ${normal}`);
    assert.ok(gained < normal * 1.55, `gained ${gained} vs normal ${normal}`);
  });

  it("still leaves a wreck when he is destroyed without detonating", () => {
    const state = match();
    const ts = state.tileSize;
    const walker = lowWalker(state, tileCenter(130, ts), tileCenter(130, ts));
    walker.selfDestructOff = true;
    walker.hp = 0;
    step(state, TICK_DT);
    assert.equal(walker.wreck, true);
    assert.equal(state.entities.has(walker.id), true);

    const other = lowWalker(state, tileCenter(150, ts), tileCenter(130, ts));
    other.hp = 0;
    step(state, TICK_DT);
    assert.equal(other.wreck, true);
    assert.equal(state.entities.has(other.id), true);
  });
});
