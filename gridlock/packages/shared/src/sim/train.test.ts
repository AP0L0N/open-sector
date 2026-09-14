import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TRAIN_QUEUE_CAP, catalog, secondsToTicks, TICK_DT } from "../catalog.js";
import { applyCommand } from "./commands.js";
import { createMatch, step } from "./match.js";
import { paidForProgress } from "./production.js";
import { snapshotFor } from "./snapshot.js";
import { makeEntity, tileCenter } from "./geo.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "TQ1",
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

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function seedCore(state: MatchState): void {
  const ts = state.tileSize;
  makeEntity(state, "core", "A", tileCenter(4, ts), tileCenter(4, ts), { tileX: 4, tileY: 4 });
}

function seedMuster(state: MatchState, tx: number, ty: number) {
  const ts = state.tileSize;
  return makeEntity(state, "muster", "A", tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
}

describe("train queue", () => {
  it("queues several Troopers on one Muster and only advances the head", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    const scrap0 = state.players.get("A")!.scrap;
    for (let i = 0; i < 3; i++) {
      const r = applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
      assert.equal(r.ok, true, !r.ok ? r.message : "");
    }
    assert.equal(muster.queue.length, 3);
    assert.equal(state.players.get("A")!.scrap, scrap0);
    ticks(state, 10);
    assert.ok(muster.queue[0]!.progressTicks > 0);
    assert.equal(muster.queue[1]!.progressTicks, 0);
    assert.equal(muster.queue[2]!.progressTicks, 0);
    const head = muster.queue[0]!;
    assert.equal(head.paid, paidForProgress(head.progressTicks, head.totalTicks, catalog("trooper").cost));
    assert.equal(state.players.get("A")!.scrap, scrap0 - head.paid);
    assert.equal(muster.queue[1]!.paid, 0);
    assert.equal(muster.queue[2]!.paid, 0);
    const snap = snapshotFor(state, "A");
    const view = snap.entities.find((e) => e.id === muster.id);
    assert.equal(view?.trainQueue?.length, 3);
    assert.equal(view?.trainQueue?.filter((j) => j.paused).length, 0);
  });

  it("lets two Musters each build one Trooper at a time", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const a = seedMuster(state, 20, 4);
    const b = seedMuster(state, 20 + catalog("muster").tileW, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    assert.equal(a.queue.length + b.queue.length, 3);
    assert.ok(a.queue.length >= 1 && b.queue.length >= 1);
    ticks(state, 8);
    const heads = [a.queue[0], b.queue[0]].filter(Boolean);
    assert.ok(heads.every((j) => j && j.progressTicks > 0));
    const waiting = [...a.queue.slice(1), ...b.queue.slice(1)];
    assert.ok(waiting.every((j) => j.progressTicks === 0));
  });

  it("pauses and resumes a job", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    ticks(state, 6);
    const mid = muster.queue[0]!.progressTicks;
    assert.ok(mid > 0);
    const jobId = muster.queue[0]!.id;
    const pause = applyCommand(state, "A", { type: "cmd.pause", what: "train", jobId });
    assert.equal(pause.ok, true);
    assert.equal(muster.queue[0]!.paused, true);
    ticks(state, 12);
    assert.equal(muster.queue[0]!.progressTicks, mid);
    const resume = applyCommand(state, "A", { type: "cmd.pause", what: "train", unit: "trooper" });
    assert.equal(resume.ok, true);
    assert.equal(muster.queue[0]!.paused, false);
    ticks(state, 6);
    assert.ok(muster.queue[0]!.progressTicks > mid);
  });

  it("cancels the last queued unit of a type without charging waiting jobs", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    const after = state.players.get("A")!.scrap;
    const firstId = muster.queue[0]!.id;
    const cancel = applyCommand(state, "A", { type: "cmd.cancel", what: "train", unit: "trooper" });
    assert.equal(cancel.ok, true);
    assert.equal(muster.queue.length, 1);
    assert.equal(muster.queue[0]!.id, firstId);
    assert.equal(state.players.get("A")!.scrap, after);
  });

  it("refunds scrap already drained when canceling an in-progress train job", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    const scrap0 = state.players.get("A")!.scrap;
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    ticks(state, 20);
    const paid = muster.queue[0]!.paid;
    assert.ok(paid > 0);
    assert.equal(state.players.get("A")!.scrap, scrap0 - paid);
    const cancel = applyCommand(state, "A", { type: "cmd.cancel", what: "train", unit: "trooper" });
    assert.equal(cancel.ok, true);
    assert.equal(muster.queue.length, 0);
    assert.equal(state.players.get("A")!.scrap, scrap0);
  });

  it("cancels a specific job from the middle of the queue", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    const midId = muster.queue[1]!.id;
    const tailId = muster.queue[2]!.id;
    const cancel = applyCommand(state, "A", { type: "cmd.cancel", what: "train", jobId: midId });
    assert.equal(cancel.ok, true);
    assert.equal(muster.queue.length, 2);
    assert.equal(muster.queue[1]!.id, tailId);
  });

  it("spawns the unit when the head job finishes", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    seedMuster(state, 20, 4);
    const scrap0 = state.players.get("A")!.scrap;
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    ticks(state, secondsToTicks(catalog("trooper").buildSeconds) + 2);
    assert.ok([...state.entities.values()].some((e) => e.type === "trooper" && e.ownerId === "A"));
    assert.equal(
      [...state.entities.values()].filter((e) => e.type === "muster" && e.ownerId === "A")[0]?.queue.length,
      0,
    );
    assert.equal(state.players.get("A")!.scrap, scrap0 - catalog("trooper").cost);
  });

  it("starts training with too little scrap and stalls until funded", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    state.players.get("A")!.scrap = 5;
    const r = applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    ticks(state, 30);
    assert.equal(muster.queue.length, 1);
    assert.equal(state.players.get("A")!.scrap, 0);
    assert.ok(muster.queue[0]!.progressTicks > 0);
    assert.ok(muster.queue[0]!.progressTicks < 30);
    const frozen = muster.queue[0]!.progressTicks;
    ticks(state, 10);
    assert.equal(muster.queue[0]!.progressTicks, frozen);
    state.players.get("A")!.scrap = catalog("trooper").cost;
    ticks(state, secondsToTicks(catalog("trooper").buildSeconds) + 2);
    assert.ok([...state.entities.values()].some((e) => e.type === "trooper" && e.ownerId === "A"));
    assert.equal(muster.queue.length, 0);
    assert.equal(state.players.get("A")!.scrap, 5);
  });

  it("does not spawn while paused", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    applyCommand(state, "A", { type: "cmd.pause", what: "train", unit: "trooper" });
    ticks(state, secondsToTicks(catalog("trooper").buildSeconds) + 20);
    assert.equal(muster.queue.length, 1);
    assert.equal(
      [...state.entities.values()].some((e) => e.type === "trooper" && e.ownerId === "A"),
      false,
    );
  });

  it("rejects a tenth job on the same building", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    seedMuster(state, 20, 4);
    for (let i = 0; i < TRAIN_QUEUE_CAP; i++) {
      const r = applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
      assert.equal(r.ok, true, !r.ok ? r.message : "");
    }
    const extra = applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    assert.equal(extra.ok, false);
    if (!extra.ok) assert.equal(extra.code, "busy");
  });

  it("hides the train queue from enemies", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "trooper" });
    const you = snapshotFor(state, "A").entities.find((e) => e.id === muster.id);
    assert.equal(you?.trainQueue?.length, 1);
    const them = snapshotFor(state, "B").entities.find((e) => e.id === muster.id);
    if (them) assert.equal(them.trainQueue, undefined);
  });
});
