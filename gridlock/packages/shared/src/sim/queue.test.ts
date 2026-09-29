import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ORDER_QUEUE_MAX, TICK_DT } from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "Q1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
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

/** Read through a call so an earlier `undefined` assertion does not narrow the field. */
function queued(e: Entity): number {
  return e.orderQueue?.length ?? 0;
}

function runUntil(state: MatchState, done: () => boolean, maxTicks: number): number {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return i;
    step(state, TICK_DT);
  }
  return -1;
}

describe("shift order queue", () => {
  it("walks queued points one after another", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 40, 100, 70);
    const u = makeEntity(state, "rifleman", "A", tileCenter(75, ts), tileCenter(45, ts));
    const a = { x: tileCenter(85, ts), y: tileCenter(45, ts) };
    const b = { x: tileCenter(85, ts), y: tileCenter(55, ts) };
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [u.id], ...a, queue: true }).ok, true);
    assert.equal(u.order?.kind, "move", "idle unit starts the first queued order at once");
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [u.id], ...b, queue: true }).ok, true);
    const queued = u.orderQueue?.length ?? 0;
    assert.equal(queued, 1);

    let sawA = false;
    const t = runUntil(
      state,
      () => {
        if (Math.hypot(u.x - a.x, u.y - a.y) < ts * 0.5) sawA = true;
        return u.order == null && !u.orderQueue && Math.hypot(u.x - b.x, u.y - b.y) < ts * 0.5;
      },
      2000,
    );
    assert.ok(t >= 0, `did not reach the second point: at ${u.x},${u.y}`);
    assert.ok(sawA, "passed through the first point");
  });

  it("an unqueued order drops the queue", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 40, 100, 70);
    const u = makeEntity(state, "rifleman", "A", tileCenter(75, ts), tileCenter(45, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(85, ts), y: u.y, queue: true });
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(85, ts), y: tileCenter(55, ts), queue: true });
    assert.ok(u.orderQueue?.length);
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(75, ts), y: tileCenter(60, ts) });
    assert.equal(u.orderQueue, undefined);

    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(85, ts), y: u.y, queue: true });
    assert.ok(queued(u) > 0);
    applyCommand(state, "A", { type: "cmd.stop", ids: [u.id] });
    assert.equal(u.orderQueue, undefined);
    assert.equal(u.order, null);
  });

  it("stance changes keep the queue", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 40, 100, 70);
    const u = makeEntity(state, "rifleman", "A", tileCenter(75, ts), tileCenter(45, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(85, ts), y: u.y, queue: true });
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(85, ts), y: tileCenter(55, ts), queue: true });
    applyCommand(state, "A", { type: "cmd.stance", ids: [u.id], stance: "crouch" });
    assert.equal(u.orderQueue?.length, 1);
  });

  it("attacks a queued target after the walk", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 40, 100, 70);
    const u = makeEntity(state, "rifleman", "A", tileCenter(75, ts), tileCenter(45, ts));
    const foe = makeEntity(state, "rifleman", "B", tileCenter(95, ts), tileCenter(60, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(78, ts), y: tileCenter(48, ts), queue: true });
    applyCommand(state, "A", { type: "cmd.attack", ids: [u.id], targetId: foe.id, queue: true });
    assert.equal(u.order?.kind, "move");
    const t = runUntil(state, () => u.order?.kind === "attack" && u.order.targetId === foe.id && !u.order.auto, 1000);
    assert.ok(t >= 0, `never took the queued attack; order=${JSON.stringify(u.order)}`);
  });

  it("keeps a group's formation spread for queued points", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 40, 100, 70);
    const units = [0, 1, 2].map((i) => makeEntity(state, "rifleman", "A", tileCenter(75 + i, ts), tileCenter(45, ts)));
    const ids = units.map((e) => e.id);
    applyCommand(state, "A", { type: "cmd.move", ids, x: tileCenter(85, ts), y: tileCenter(45, ts), queue: true });
    applyCommand(state, "A", { type: "cmd.move", ids, x: tileCenter(85, ts), y: tileCenter(58, ts), queue: true });
    const pts = units.map((e) => e.orderQueue![0]!.msg as { x: number; y: number });
    const distinct = new Set(pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    assert.equal(distinct.size, 3, "each unit got its own slot");
    for (const e of units) assert.deepEqual(e.orderQueue![0]!.msg.ids, [e.id]);
  });

  it("caps the queue", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 40, 100, 70);
    const u = makeEntity(state, "rifleman", "A", tileCenter(75, ts), tileCenter(45, ts));
    for (let i = 0; i < ORDER_QUEUE_MAX + 5; i++) {
      applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(76 + (i % 10), ts), y: u.y, queue: true });
    }
    const n = u.orderQueue?.length ?? 0;
    assert.equal(n, ORDER_QUEUE_MAX);
    const first = u.order;
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(90, ts), y: u.y, queue: true });
    assert.equal(u.order, first, "a full queue drops the order instead of running it now");
  });

  it("shows the queued route to its owner only", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 70, 40, 100, 70);
    const u = makeEntity(state, "rifleman", "A", tileCenter(75, ts), tileCenter(45, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [u.id], x: tileCenter(85, ts), y: u.y, queue: true });
    applyCommand(state, "A", { type: "cmd.attackmove", ids: [u.id], x: tileCenter(85, ts), y: tileCenter(55, ts), queue: true });
    const mine = snapshotFor(state, "A").entities.find((e) => e.id === u.id);
    assert.deepEqual(
      mine?.plan?.map((p) => p.kind),
      ["move", "attack"],
    );
    const theirs = snapshotFor(state, "B").entities.find((e) => e.id === u.id);
    assert.equal(theirs?.plan, undefined);
  });
});
