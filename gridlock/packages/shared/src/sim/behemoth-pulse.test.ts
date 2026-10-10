import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BEHEMOTH_AUTO_LUNGE_MIN_TILES,
  BEHEMOTH_LUNGE_RANGE_TILES,
  BEHEMOTH_PULSE_FAR_MUL,
  BEHEMOTH_PULSE_NEAR_MUL,
  TICK_DT,
  carriesShell,
  isCivilianType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { pulseBoltMul } from "./combat.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenite, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "PLS", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  state.blocked.fill(0);
  for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

/**
 * Damage of each bolt `b` fires on a force-attack at the ground `dist` world tiles off over
 * `seconds`. Bolts are caught as they leave the barrel: up close one lands the same tick.
 */
function volley(light: boolean, seconds: number, dist = 8): number[] {
  const state = field();
  const ts = state.tileSize;
  const b = makeEntity(state, "behemoth", "B", tileCenter(100, ts), tileCenter(120, ts));
  if (light) assert.equal(applyCommand(state, "B", { type: "cmd.pulse", ids: [b.id], light: true }).ok, true);
  assert.equal(applyCommand(state, "B", { type: "cmd.forceattack", ids: [b.id], x: b.x + dist * ts, y: b.y }).ok, true);
  const damage: number[] = [];
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) {
    const list = state.projectiles;
    const push = list.push.bind(list);
    list.push = (...ps: MatchState["projectiles"]) => {
      for (const p of ps) if (p.fromId === b.id) damage.push(p.damage);
      return push(...ps);
    };
    step(state, TICK_DT);
  }
  return damage;
}

describe("Behemoth pulse", () => {
  it("carries no HE and switches between High and Light Pulse", () => {
    assert.equal(carriesShell("behemoth", "he"), false);
    assert.equal(carriesShell("behemoth", "ap"), true);
    const state = field();
    const ts = state.tileSize;
    const b = makeEntity(state, "behemoth", "B", tileCenter(100, ts), tileCenter(120, ts));
    assert.equal(applyCommand(state, "B", { type: "cmd.pulse", ids: [b.id], light: true }).ok, true);
    assert.equal(b.lightPulse, true);
    assert.equal(snapshotFor(state, "B").entities.find((e) => e.id === b.id)?.lightPulse, true);
    assert.equal(applyCommand(state, "B", { type: "cmd.pulse", ids: [b.id], light: false }).ok, true);
    assert.equal(b.lightPulse, undefined);
    const s = makeEntity(state, "stalker", "B", tileCenter(90, ts), tileCenter(120, ts));
    assert.equal(applyCommand(state, "B", { type: "cmd.pulse", ids: [s.id], light: true }).ok, false);
  });

  it("hits harder close in than far out", () => {
    assert.equal(pulseBoltMul(1, 0, 100), BEHEMOTH_PULSE_NEAR_MUL);
    assert.ok(Math.abs(pulseBoltMul(1, 100, 100) - BEHEMOTH_PULSE_FAR_MUL) < 1e-9);
    assert.ok(pulseBoltMul(1, 30, 100) > pulseBoltMul(1, 70, 100));
    const near = volley(false, 1, 8);
    const far = volley(false, 1, 56);
    assert.ok(near.length > 0 && far.length > 0, "both fire");
    assert.ok(near[0]! > far[0]! * 2, `near ${near[0]} > far ${far[0]}`);
  });

  it("Light Pulse fires far more bolts, each far lighter", () => {
    const high = volley(false, 20);
    const light = volley(true, 20);
    assert.ok(high.length > 0, "High Pulse fires");
    assert.ok(light.length >= high.length * 2.5, `light ${light.length} vs high ${high.length}`);
    assert.ok(Math.max(...light) < Math.min(...high) * 0.5, "each light bolt is far weaker");
  });
});

describe("Behemoth auto-lunge", () => {
  function setup(): { state: MatchState; b: Entity; foe: Entity } {
    const state = field();
    const ts = state.tileSize;
    const b = makeEntity(state, "behemoth", "B", tileCenter(100, ts), tileCenter(120, ts));
    const foe = makeEntity(state, "apocalypse", "A", b.x + (BEHEMOTH_LUNGE_RANGE_TILES - 1) * ts, b.y);
    return { state, b, foe };
  }

  it("jumps at the enemy unit it is fighting and keeps fighting it", () => {
    const { state, b, foe } = setup();
    const d0 = Math.hypot(foe.x - b.x, foe.y - b.y);
    applyCommand(state, "B", { type: "cmd.attack", ids: [b.id], targetId: foe.id });
    ticks(state, 3);
    assert.ok(b.lunge, "in the air");
    assert.equal(b.attackTarget, foe.id, "still on its target");
    ticks(state, 40);
    const d1 = Math.hypot(foe.x - b.x, foe.y - b.y);
    assert.ok(d1 < d0 / 2, `came down close: ${d1 / state.tileSize} cells`);
  });

  it("stays put on hold position, on a plain move, and when the enemy is already close", () => {
    const held = setup();
    applyCommand(held.state, "B", { type: "cmd.attack", ids: [held.b.id], targetId: held.foe.id });
    held.b.holdPosition = true;
    ticks(held.state, 5);
    assert.equal(held.b.lunge, undefined, "hold position");

    const moving = setup();
    applyCommand(moving.state, "B", { type: "cmd.move", ids: [moving.b.id], x: moving.b.x, y: moving.b.y + 30 * moving.state.tileSize });
    moving.b.attackTarget = moving.foe.id;
    ticks(moving.state, 3);
    assert.equal(moving.b.lunge, undefined, "plain move");

    const close = setup();
    close.foe.x = close.b.x + (BEHEMOTH_AUTO_LUNGE_MIN_TILES - 1) * close.state.tileSize;
    applyCommand(close.state, "B", { type: "cmd.attack", ids: [close.b.id], targetId: close.foe.id });
    ticks(close.state, 5);
    assert.equal(close.b.lunge, undefined, "already close");
  });
});
