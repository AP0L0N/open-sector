import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AIR_CRUISE_ALT,
  catalog,
  heavyAmmoOf,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
  LAUNCHER,
  LAUNCHER_RELOAD,
  PENETRATOR,
  PENETRATOR_ARM_SECONDS,
  PENETRATOR_PLATE,
  PENETRATOR_RACK,
  PENETRATOR_SUPPLY_COST,
  RELOAD_MUL_MAX,
  TICK_DT,
  TILE_SIZE,
  TITAN_ROCKET,
  TITAN_ROCKET_RACK,
  TITAN_ROCKET_SPEED,
  TRAIN_TYPES,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { rocketScatterRadius } from "./mortar.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { transferOnce } from "./supply.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "RK1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Flat, dry pad and nothing else on it. */
function range(): { state: MatchState; y: number; ts: number } {
  const state = twoPlayerMatch();
  state.heights.fill(0);
  const ts = state.tileSize;
  const y = 40;
  for (let ty = y - 8; ty <= y + 8; ty++) {
    for (let tx = 60; tx <= 130; tx++) {
      const i = ty * state.width + tx;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
  return { state, y, ts };
}

function rocketer(state: MatchState, x: number, y: number): Entity {
  const e = makeEntity(state, "rocketer", "A", x, y);
  e.facing = 0;
  e.holdPosition = true;
  return e;
}

/** A target that will not fire back or die, so the test measures the tube. */
function dummy(state: MatchState, type: Parameters<typeof makeEntity>[1], x: number, y: number): Entity {
  const e = makeEntity(state, type, "B", x, y);
  e.holdPosition = true;
  e.cooldown = 1e9;
  e.hp = e.hpMax = 100000;
  return e;
}

/** Step `n` ticks and record the tick each new rocket from `e` first appeared. */
function watch(state: MatchState, e: Entity, n: number, seen = new Map<number, number>()): Map<number, number> {
  for (let i = 0; i < n; i++) {
    step(state, TICK_DT);
    for (const p of state.projectiles) {
      if (p.fromId === e.id && p.flight === "rocket" && !seen.has(p.id)) seen.set(p.id, state.tick);
    }
  }
  return seen;
}

const secs = (s: number) => Math.ceil(s / TICK_DT);

describe("rocketer", () => {
  it("is Muster infantry with one launcher, not in the opening army", () => {
    assert.ok(TRAIN_TYPES.includes("rocketer"));
    assert.equal(producerType("rocketer"), "muster");
    assert.ok(isInfantryType("rocketer"));
    assert.deepEqual(infantryLoadout("rocketer"), [LAUNCHER, PENETRATOR]);
    assert.equal(heavyAmmoOf("rocketer"), 1);
    assert.equal(LAUNCHER.clip, 1);
    assert.equal(LAUNCHER.damage, TITAN_ROCKET.damage);
    assert.equal(catalog("rocketer").rangeTiles, LAUNCHER.rangeTiles);
  });

  it("fires one Titan rocket, then reloads the tube before the next", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    const foe = dummy(state, "rifleman", tileCenter(96, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    const seen = watch(state, me, secs(LAUNCHER_RELOAD * RELOAD_MUL_MAX + 3));
    const launches = [...seen.values()].sort((a, b) => a - b);
    assert.ok(launches.length >= 2, `launches ${launches.length}`);
    const gap = (launches[1]! - launches[0]!) * TICK_DT;
    assert.ok(gap >= LAUNCHER_RELOAD * 0.9, `reload gap ${gap}s`);
    const r = state.projectiles.find((p) => seen.has(p.id));
    if (r) {
      assert.equal(r.damage, TITAN_ROCKET.damage);
      assert.equal(r.apex, undefined, "straight, no lob");
    }
    assert.ok(foe.hp < foe.hpMax, "the burst hurt the soldier");
  });

  it("engages a tank on its own and dents it", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    const tank = makeEntity(state, "warden", "B", tileCenter(94, ts), tileCenter(y, ts));
    tank.holdPosition = true;
    tank.cooldown = 1e9;
    tank.mgCooldown = 1e9;
    const hp0 = tank.hp;
    const seen = watch(state, me, secs(6));
    assert.ok(seen.size >= 1, "auto-fires at armor");
    assert.ok(tank.hp < hp0, `tank hp ${tank.hp}/${hp0}`);
    assert.ok(tank.hp > 0, "one rocket dents, it does not kill");
  });

  it("puts a rocket up beside a plane in the air", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    const plane = makeEntity(state, "stuka", "B", tileCenter(96, ts), tileCenter(y, ts));
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 0;
    plane.facing = Math.PI / 2;
    plane.order = { kind: "move", x: plane.x, y: plane.y };
    let air = false;
    for (let i = 0; i < secs(4) && !air; i++) {
      plane.x = tileCenter(96, ts);
      plane.y = tileCenter(y, ts);
      plane.air!.alt = AIR_CRUISE_ALT;
      step(state, TICK_DT);
      air = state.projectiles.some((p) => p.fromId === me.id && p.flight === "rocket" && p.airBurst);
    }
    assert.ok(air, "an air-burst rocket goes up at the plane");
  });

  it("puts the tube down with a broken arm", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    me.crits.push("arm");
    assert.equal(infantryGunFor(me), null);
    const foe = dummy(state, "rifleman", tileCenter(96, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    assert.equal(watch(state, me, secs(4)).size, 0);
    assert.equal(foe.hp, foe.hpMax);
  });

  it("cannot fire while swimming", () => {
    const { state, y, ts } = range();
    for (let tx = 69; tx <= 71; tx++) {
      for (let ty = y - 1; ty <= y + 1; ty++) {
        const i = ty * state.width + tx;
        state.terrain[i] = TILE_WATER;
        state.blocked[i] = 1;
      }
    }
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    const foe = dummy(state, "rifleman", tileCenter(96, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    assert.equal(watch(state, me, secs(3)).size, 0);
  });

  it("arms the high-penetration missile before it fires, and a second select does not restart that", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    assert.equal(me.heavy, 1);
    const tank = makeEntity(state, "warden", "B", tileCenter(90, ts), tileCenter(y, ts));
    tank.holdPosition = true;
    tank.cooldown = 1e9;
    tank.mgCooldown = 1e9;
    const before = tank.hp;
    assert.equal(applyCommand(state, "A", { type: "cmd.weapon", ids: [me.id], weapon: "penetrator" }).ok, true);
    assert.equal(me.weapon, "penetrator");
    assert.equal(me.reload, PENETRATOR_ARM_SECONDS);
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: tank.id });
    assert.equal(watch(state, me, secs(PENETRATOR_ARM_SECONDS) - 2).size, 0, "still fitting the missile");
    const left = me.reload;
    assert.equal(applyCommand(state, "A", { type: "cmd.weapon", ids: [me.id], weapon: "penetrator" }).ok, true);
    assert.ok(Math.abs(me.reload - left) < 1e-9, "already selected, so the arming clock stays");
    let rocket: { speed: number; plate?: number } | undefined;
    for (let i = 0; i < secs(2) && !rocket; i++) {
      step(state, TICK_DT);
      const live = state.projectiles.find((p) => p.fromId === me.id && p.flight === "rocket");
      if (!live) continue;
      rocket = { speed: Math.hypot(live.vx, live.vy), plate: live.plate };
    }
    assert.ok(rocket, "one missile leaves once it is armed");
    assert.equal(rocket.plate, PENETRATOR_PLATE);
    assert.ok(Math.abs(rocket.speed - TITAN_ROCKET_SPEED * 1.5) < 1, `speed ${rocket.speed}`);
    const reach = LAUNCHER.rangeTiles! * TILE_SIZE;
    const far = rocketScatterRadius(reach, reach, 1, PENETRATOR_RACK);
    const tube = rocketScatterRadius(reach, reach, 1, TITAN_ROCKET_RACK);
    assert.ok(far < tube * 0.25, `long-range scatter ${far} vs tube ${tube}`);
    assert.ok(far < tank.radius, "full reach still lands on a hull");
    for (let i = 0; i < secs(2) && tank.hp === before; i++) step(state, TICK_DT);
    const gap = before - tank.hp;
    assert.ok(gap >= 70, `armor damage ${gap}`);
    assert.equal(me.heavy, 0);
    const again = watch(state, me, secs(2));
    assert.equal(again.size, 0, "the second round is not in the pack");
  });

  it("fires at once when the missile is already on the tube", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    me.weapon = "penetrator";
    me.reload = 0;
    const foe = dummy(state, "warden", tileCenter(88, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.attack", ids: [me.id], targetId: foe.id });
    assert.ok(watch(state, me, secs(1.2)).size >= 1);
  });

  it("does not spend the missile on a target he picked himself", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    me.weapon = "penetrator";
    me.reload = 0;
    const foe = dummy(state, "rifleman", tileCenter(88, ts), tileCenter(y, ts));
    me.order = { kind: "attack", targetId: foe.id, auto: true };
    assert.equal(watch(state, me, secs(2)).size, 0);
    assert.equal(me.heavy, 1);
  });

  it("keeps the spent missile spent when he switches back to the tube", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    me.heavy = 0;
    me.weapon = "penetrator";
    assert.equal(applyCommand(state, "A", { type: "cmd.weapon", ids: [me.id], weapon: "launcher" }).ok, true);
    assert.equal(me.heavy, 0);
    assert.equal(me.clip, 1, "the tube was still loaded");
    assert.equal(applyCommand(state, "A", { type: "cmd.weapon", ids: [me.id], weapon: "penetrator" }).ok, true);
    assert.equal(me.reload, 0, "nothing to fit");
    assert.equal(me.heavy, 0);
    const view = snapshotFor(state, "A").entities.find((e) => e.id === me.id);
    assert.equal(view?.heavy, 0);
    assert.equal(view?.weapon, "penetrator");
  });

  it("takes one missile from a supply truck, and a full load takes nothing", () => {
    const { state, y, ts } = range();
    const me = rocketer(state, tileCenter(70, ts), tileCenter(y, ts));
    me.heavy = 0;
    me.weapon = "penetrator";
    me.reload = 0;
    const truck = { supply: 20 };
    assert.equal(transferOnce(truck, me), true);
    assert.equal(me.heavy, 1);
    assert.equal(truck.supply, 20 - PENETRATOR_SUPPLY_COST);
    assert.equal(me.reload, PENETRATOR_ARM_SECONDS, "fitting the round that just arrived");
    assert.equal(transferOnce(truck, me), false);
    assert.equal(truck.supply, 20 - PENETRATOR_SUPPLY_COST);
  });
});
