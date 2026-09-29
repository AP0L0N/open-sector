import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AIR_CRUISE_ALT,
  catalog,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
  LAUNCHER,
  LAUNCHER_RELOAD,
  RELOAD_MUL_MAX,
  START_UNITS,
  TICK_DT,
  TITAN_ROCKET,
  TRAIN_TYPES,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
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
  return createMatch(room, started.value, { startingUnits: false });
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
    assert.ok(!START_UNITS.includes("rocketer"));
    assert.equal(producerType("rocketer"), "muster");
    assert.ok(isInfantryType("rocketer"));
    assert.deepEqual(infantryLoadout("rocketer"), [LAUNCHER]);
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
});
