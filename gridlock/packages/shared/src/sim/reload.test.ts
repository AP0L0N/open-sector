import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  HANDGUN,
  RIFLE,
  RELOAD_MUL_MAX,
  RELOAD_MUL_MIN,
  TICK_DT,
  addCrit,
  isCivilianType,
  reloadSecondsOf,
} from "../catalog.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "RL1",
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

function clearCivilians(state: MatchState): void {
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
}

function duel(state: MatchState): {
  gun: ReturnType<typeof makeEntity>;
  dummy: ReturnType<typeof makeEntity>;
} {
  state.heights.fill(0);
  clearCivilians(state);
  const ts = state.tileSize;
  const gun = makeEntity(state, "trooper", "A", tileCenter(24, ts), tileCenter(24, ts));
  const dummy = makeEntity(state, "hauler", "B", tileCenter(28, ts), tileCenter(24, ts));
  dummy.autoHarvest = false;
  dummy.holdPosition = true;
  gun.facing = 0;
  gun.reloadMul = 1;
  return { gun, dummy };
}

function until(state: MatchState, pred: () => boolean, cap = 80): void {
  for (let i = 0; i < cap && !pred(); i++) step(state, TICK_DT);
}

describe("infantry reload", () => {
  it("bakes a personal reload multiplier onto each trooper at spawn", () => {
    const { state, a } = twoPlayerMatch();
    const muls = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const t = makeEntity(state, "trooper", a, 80 + i * 8, 80);
      assert.ok(t.reloadMul >= RELOAD_MUL_MIN && t.reloadMul <= RELOAD_MUL_MAX, `mul=${t.reloadMul}`);
      assert.equal(t.clip, RIFLE.clip);
      assert.equal(t.reload, 0);
      muls.add(t.reloadMul.toFixed(5));
    }
    assert.ok(muls.size > 1, `muls=${[...muls].join(",")}`);
    const tank = makeEntity(state, "warden", a, 200, 80);
    assert.equal(tank.clip, 0);
    assert.equal(tank.reloadMul, 1);
  });

  it("starts a magazine change after the last round and does not fire until it finishes", () => {
    const { state } = twoPlayerMatch();
    const { gun, dummy } = duel(state);
    gun.clip = 1;
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [gun.id], targetId: dummy.id }).ok, true);
    until(state, () => gun.reload > 0);
    assert.equal(gun.clip, 0);
    assert.ok(Math.abs(gun.reload - RIFLE.reload) < TICK_DT + 1e-9, `reload=${gun.reload}`);
    const hp = dummy.hp;
    const left = gun.reload;
    const hold = Math.max(1, Math.floor(left / TICK_DT) - 1);
    for (let i = 0; i < hold; i++) step(state, TICK_DT);
    assert.equal(dummy.hp, hp, "must not fire mid-reload");
    assert.equal(gun.clip, 0);
    assert.ok(gun.reload > 0);
    until(state, () => gun.reload <= 0 && gun.clip === RIFLE.clip, 40);
    assert.equal(gun.clip, RIFLE.clip);
    assert.equal(gun.reload, 0);
  });

  it("scales reload time by the baked multiplier", () => {
    const { state } = twoPlayerMatch();
    const { gun, dummy } = duel(state);
    gun.reloadMul = 1.08;
    gun.clip = 1;
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [gun.id], targetId: dummy.id }).ok, true);
    until(state, () => gun.reload > 0);
    const expected = reloadSecondsOf(RIFLE, 1.08);
    assert.ok(Math.abs(gun.reload - expected) < TICK_DT + 1e-9, `reload=${gun.reload} expected=${expected}`);
  });

  it("swaps to a full handgun magazine when the shooting arm breaks", () => {
    const { state } = twoPlayerMatch();
    const { gun, dummy } = duel(state);
    gun.clip = 2;
    addCrit(gun, "arm");
    assert.equal(gun.clip, HANDGUN.clip);
    assert.equal(gun.reload, 0);
    gun.clip = 1;
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [gun.id], targetId: dummy.id }).ok, true);
    until(state, () => gun.reload > 0);
    assert.equal(gun.clip, 0);
    const expected = reloadSecondsOf(HANDGUN, gun.reloadMul);
    assert.ok(Math.abs(gun.reload - expected) < TICK_DT + 1e-9, `reload=${gun.reload} expected=${expected}`);
    until(state, () => gun.reload <= 0 && gun.clip === HANDGUN.clip, 40);
    assert.equal(gun.clip, HANDGUN.clip);
  });

  it("puts allied clip on the snapshot and hides it from the enemy", () => {
    const { state, a, b } = twoPlayerMatch();
    const { gun } = duel(state);
    gun.clip = 3;
    gun.reload = 1.2;
    const mine = snapshotFor(state, a).entities.find((e) => e.id === gun.id);
    const theirs = snapshotFor(state, b).entities.find((e) => e.id === gun.id);
    assert.equal(mine?.clip, 3);
    assert.equal(mine?.reload, 1.2);
    assert.equal(theirs?.clip, undefined);
    assert.equal(theirs?.reload, undefined);
  });
});
