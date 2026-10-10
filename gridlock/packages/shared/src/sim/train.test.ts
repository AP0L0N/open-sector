import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { BUILD_REQUIRES, ONE_AT_A_TIME, TECH_REQUIRES, TRAIN_QUEUE_CAP, canContinuousTrain, catalog, factionOf, secondsToTicks, TICK_DT, type TrainType } from "../catalog.js";
import { applyCommand } from "./commands.js";
import { buildTechMissing } from "./build.js";
import { createMatch, step } from "./match.js";
import { paidForProgress } from "./production.js";
import { snapshotFor } from "./snapshot.js";
import { makeEntity, tileCenter } from "./geo.js";
import { oneAtATimeTaken, producerType, techMissing } from "./train.js";
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
  const started = startMatch(room, "A", () => 0);
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
      const r = applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
      assert.equal(r.ok, true, !r.ok ? r.message : "");
    }
    assert.equal(muster.queue.length, 3);
    assert.equal(state.players.get("A")!.scrap, scrap0);
    ticks(state, 10);
    assert.ok(muster.queue[0]!.progressTicks > 0);
    assert.equal(muster.queue[1]!.progressTicks, 0);
    assert.equal(muster.queue[2]!.progressTicks, 0);
    const head = muster.queue[0]!;
    assert.equal(head.paid, paidForProgress(head.progressTicks, head.totalTicks, catalog("rifleman").cost));
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
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
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
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    ticks(state, 6);
    const mid = muster.queue[0]!.progressTicks;
    assert.ok(mid > 0);
    const jobId = muster.queue[0]!.id;
    const pause = applyCommand(state, "A", { type: "cmd.pause", what: "train", jobId });
    assert.equal(pause.ok, true);
    assert.equal(muster.queue[0]!.paused, true);
    ticks(state, 12);
    assert.equal(muster.queue[0]!.progressTicks, mid);
    const resume = applyCommand(state, "A", { type: "cmd.pause", what: "train", unit: "rifleman" });
    assert.equal(resume.ok, true);
    assert.equal(muster.queue[0]!.paused, false);
    ticks(state, 6);
    assert.ok(muster.queue[0]!.progressTicks > mid);
  });

  it("cancels the last queued unit of a type without charging waiting jobs", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    const after = state.players.get("A")!.scrap;
    const firstId = muster.queue[0]!.id;
    const cancel = applyCommand(state, "A", { type: "cmd.cancel", what: "train", unit: "rifleman" });
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
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    ticks(state, 20);
    const paid = muster.queue[0]!.paid;
    assert.ok(paid > 0);
    assert.equal(state.players.get("A")!.scrap, scrap0 - paid);
    const cancel = applyCommand(state, "A", { type: "cmd.cancel", what: "train", unit: "rifleman" });
    assert.equal(cancel.ok, true);
    assert.equal(muster.queue.length, 0);
    assert.equal(state.players.get("A")!.scrap, scrap0);
  });

  it("cancels a specific job from the middle of the queue", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
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
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) + 2);
    assert.ok([...state.entities.values()].some((e) => e.type === "rifleman" && e.ownerId === "A"));
    assert.equal(
      [...state.entities.values()].filter((e) => e.type === "muster" && e.ownerId === "A")[0]?.queue.length,
      0,
    );
    assert.equal(state.players.get("A")!.scrap, scrap0 - catalog("rifleman").cost);
  });

  it("starts training with too little scrap and stalls until funded", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    state.players.get("A")!.scrap = 5;
    const r = applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    ticks(state, 30);
    assert.equal(muster.queue.length, 1);
    assert.equal(state.players.get("A")!.scrap, 0);
    assert.ok(muster.queue[0]!.progressTicks > 0);
    assert.ok(muster.queue[0]!.progressTicks < 30);
    const frozen = muster.queue[0]!.progressTicks;
    ticks(state, 10);
    assert.equal(muster.queue[0]!.progressTicks, frozen);
    state.players.get("A")!.scrap = catalog("rifleman").cost;
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) + 2);
    assert.ok([...state.entities.values()].some((e) => e.type === "rifleman" && e.ownerId === "A"));
    assert.equal(muster.queue.length, 0);
    assert.equal(state.players.get("A")!.scrap, 5);
  });

  it("does not spawn while paused", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    applyCommand(state, "A", { type: "cmd.pause", what: "train", unit: "rifleman" });
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) + 20);
    assert.equal(muster.queue.length, 1);
    assert.equal(
      [...state.entities.values()].some((e) => e.type === "rifleman" && e.ownerId === "A"),
      false,
    );
  });

  it("rejects one job past the queue cap", () => {
    assert.equal(TRAIN_QUEUE_CAP, 39);
    const { state } = twoPlayerMatch();
    seedCore(state);
    seedMuster(state, 20, 4);
    for (let i = 0; i < TRAIN_QUEUE_CAP; i++) {
      const r = applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
      assert.equal(r.ok, true, !r.ok ? r.message : "");
    }
    const extra = applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    assert.equal(extra.ok, false);
    if (!extra.ok) assert.equal(extra.code, "busy");
  });

  it("hides the train queue from enemies", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    const you = snapshotFor(state, "A").entities.find((e) => e.id === muster.id);
    assert.equal(you?.trainQueue?.length, 1);
    const them = snapshotFor(state, "B").entities.find((e) => e.id === muster.id);
    if (them) assert.equal(them.trainQueue, undefined);
  });
});

describe("continuous training", () => {
  it("keeps one job on each producer and starts the next when one finishes", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const first = seedMuster(state, 20, 4);
    const second = seedMuster(state, 40, 8);
    state.players.get("A")!.scrap = 100_000;
    const on = applyCommand(state, "A", { type: "cmd.continuous", unit: "rifleman", on: true });
    assert.equal(on.ok, true, !on.ok ? on.message : "");
    assert.deepEqual(state.players.get("A")!.continuous, ["rifleman"]);
    assert.equal(first.queue.length, 1);
    assert.equal(second.queue.length, 1);
    ticks(state, 15);
    assert.equal(first.queue.length, 1);
    assert.equal(second.queue.length, 1);
    const build = secondsToTicks(catalog("rifleman").buildSeconds);
    ticks(state, build);
    const men = () => [...state.entities.values()].filter((e) => e.type === "rifleman" && e.ownerId === "A");
    assert.equal(men().length, 2);
    assert.equal(first.queue.length, 1);
    assert.equal(second.queue.length, 1);
    assert.deepEqual(snapshotFor(state, "A").you.continuous, ["rifleman"]);
    assert.equal(snapshotFor(state, "B").you.continuous, undefined);
  });

  it("cancels the line and refunds what was already paid", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    const on = applyCommand(state, "A", { type: "cmd.continuous", unit: "rifleman", on: true });
    assert.equal(on.ok, true, !on.ok ? on.message : "");
    ticks(state, 10);
    const job = muster.queue[0];
    assert.ok(job && job.paid > 0);
    const scrap = state.players.get("A")!.scrap;
    const paid = job.paid;
    const off = applyCommand(state, "A", { type: "cmd.continuous", unit: "rifleman", on: false });
    assert.equal(off.ok, true, !off.ok ? off.message : "");
    assert.equal(muster.queue.length, 0);
    assert.equal(state.players.get("A")!.continuous, undefined);
    assert.equal(state.players.get("A")!.scrap, scrap + paid);
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) + 20);
    assert.equal([...state.entities.values()].some((e) => e.type === "rifleman" && e.ownerId === "A"), false);
  });

  it("refuses a unit already in the queue, a full queue, aircraft, and a one-at-a-time unit", () => {
    assert.equal(canContinuousTrain("rifleman"), true);
    assert.equal(canContinuousTrain("gunboat"), true);
    assert.equal(canContinuousTrain("jumpjet"), true);
    assert.equal(canContinuousTrain("stuka"), false);
    assert.equal(canContinuousTrain("fw190"), false);
    assert.equal(canContinuousTrain("he111"), false);
    assert.equal(canContinuousTrain("bv222"), false);
    assert.equal(canContinuousTrain("titan"), false);
    assert.equal(canContinuousTrain("cyborgcommander"), false);

    const { state } = twoPlayerMatch();
    seedCore(state);
    seedMuster(state, 20, 4);
    const queued = applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    assert.equal(queued.ok, true, !queued.ok ? queued.message : "");
    const busy = applyCommand(state, "A", { type: "cmd.continuous", unit: "rifleman", on: true });
    assert.equal(busy.ok, false);
    if (!busy.ok) assert.equal(busy.message, "Already in the queue.");
    assert.equal(state.players.get("A")!.continuous, undefined);

    const plane = applyCommand(state, "A", { type: "cmd.continuous", unit: "stuka", on: true });
    assert.equal(plane.ok, false);
    if (!plane.ok) assert.equal(plane.message, "That unit cannot be built continuously.");
    const titan = applyCommand(state, "A", { type: "cmd.continuous", unit: "titan", on: true });
    assert.equal(titan.ok, false);
    if (!titan.ok) assert.equal(titan.message, "That unit cannot be built continuously.");

    const { state: full } = twoPlayerMatch();
    seedCore(full);
    seedMuster(full, 20, 4);
    for (let i = 0; i < TRAIN_QUEUE_CAP; i++) {
      const r = applyCommand(full, "A", { type: "cmd.train", unit: "medic" });
      assert.equal(r.ok, true, !r.ok ? r.message : "");
    }
    const capped = applyCommand(full, "A", { type: "cmd.continuous", unit: "rifleman", on: true });
    assert.equal(capped.ok, false);
    if (!capped.ok) assert.equal(capped.message, "Queue is full.");
    assert.equal(full.players.get("A")!.continuous, undefined);
  });
});

describe("rally point", () => {
  it("sends a new unit toward the producer's rally point", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    const ts = state.tileSize;
    const rx = tileCenter(34, ts);
    const ry = tileCenter(24, ts);
    const r = applyCommand(state, "A", { type: "cmd.rally", ids: [muster.id], x: rx, y: ry });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    assert.deepEqual(muster.rally, { x: rx, y: ry });
    applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) + 2);
    const u = [...state.entities.values()].find((e) => e.type === "rifleman" && e.ownerId === "A");
    assert.ok(u);
    assert.equal(u.order?.kind, "move");
    if (u.order?.kind === "move") {
      assert.equal(u.order.x, rx);
      assert.equal(u.order.y, ry);
    }
    ticks(state, 400);
    assert.ok(Math.hypot(u.x - rx, u.y - ry) < ts * 2);
  });

  it("parks several trained units around one rally point instead of circling it", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    state.players.get("A")!.scrap = 99999;
    const muster = seedMuster(state, 20, 4);
    const ts = state.tileSize;
    const rx = tileCenter(34, ts);
    const ry = tileCenter(24, ts);
    applyCommand(state, "A", { type: "cmd.rally", ids: [muster.id], x: rx, y: ry });
    const n = 5;
    for (let i = 0; i < n; i++) applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) * n + 400);
    const units = [...state.entities.values()].filter((e) => e.type === "rifleman" && e.ownerId === "A");
    const count = units.length;
    assert.equal(count, n);
    for (const u of units) {
      assert.equal(u.state, "idle", `unit ${u.id} still ${u.state}`);
      assert.equal(u.waypoints.length, 0);
      assert.ok(Math.hypot(u.x - rx, u.y - ry) < 48, `unit ${u.id} parked ${Math.hypot(u.x - rx, u.y - ry)} away`);
    }
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i]!;
        const b = units[j]!;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) + 1e-6 >= a.radius + b.radius, `units ${a.id},${b.id} overlap`);
      }
    }
  });

  it("sets rally points on several producers at once and only for the owner", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const a = seedMuster(state, 20, 4);
    const b = seedMuster(state, 20 + catalog("muster").tileW, 4);
    const ts = state.tileSize;
    const r = applyCommand(state, "A", { type: "cmd.rally", ids: [a.id, b.id], x: tileCenter(10, ts), y: tileCenter(20, ts) });
    assert.equal(r.ok, true);
    assert.ok(a.rally && b.rally);
    const theirs = applyCommand(state, "B", { type: "cmd.rally", ids: [a.id], x: 0, y: 0 });
    assert.equal(theirs.ok, false);
    assert.equal(a.rally.x, tileCenter(10, ts));
    assert.deepEqual(snapshotFor(state, "A").entities.find((e) => e.id === a.id)?.rally, a.rally);
    const them = snapshotFor(state, "B").entities.find((e) => e.id === a.id);
    if (them) assert.equal(them.rally, undefined);
  });

  it("clears the rally point when the building itself is clicked", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const muster = seedMuster(state, 20, 4);
    const ts = state.tileSize;
    applyCommand(state, "A", { type: "cmd.rally", ids: [muster.id], x: tileCenter(30, ts), y: tileCenter(14, ts) });
    assert.ok(muster.rally);
    applyCommand(state, "A", { type: "cmd.rally", ids: [muster.id], x: muster.x, y: muster.y });
    assert.equal(muster.rally, undefined);
  });

  it("ignores buildings that do not train units", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const core = [...state.entities.values()].find((e) => e.type === "core")!;
    const r = applyCommand(state, "A", { type: "cmd.rally", ids: [core.id], x: 0, y: 0 });
    assert.equal(r.ok, false);
    assert.equal(core.rally, undefined);
  });
});

describe("spawn grouping", () => {
  function riflemen(state: MatchState) {
    return [...state.entities.values()].filter((e) => e.type === "rifleman" && e.ownerId === "A" && e.hp > 0);
  }

  function span(units: { x: number; y: number }[]): { x: number; y: number } {
    const xs = units.map((u) => u.x);
    const ys = units.map((u) => u.y);
    return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
  }

  it("packs each new rifleman into a block at the door instead of a line", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    state.players.get("A")!.scrap = 99999;
    seedMuster(state, 20, 4);
    const n = 8;
    for (let i = 0; i < n; i++) applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) * n + 80);
    const units = riflemen(state);
    assert.equal(units.length, n);
    for (const u of units) assert.equal(u.state, "idle", `unit ${u.id} still ${u.state}`);
    const box = span(units);
    assert.ok(box.x > 8 && box.y > 8, `still a line, span ${box.x.toFixed(1)} x ${box.y.toFixed(1)}`);
    assert.ok(box.x < 80 && box.y < 80, `scattered, span ${box.x.toFixed(1)} x ${box.y.toFixed(1)}`);
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i]!;
        const b = units[j]!;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) + 1e-6 >= a.radius + b.radius, `units ${a.id},${b.id} overlap`);
      }
    }
  });

  it("leaves a unit that was ordered away out of the next pack", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    state.players.get("A")!.scrap = 99999;
    seedMuster(state, 20, 4);
    const ts = state.tileSize;
    for (let i = 0; i < 3; i++) applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) * 3 + 40);
    const first = riflemen(state);
    assert.equal(first.length, 3);
    const wanderer = first[0]!;
    const dest = { x: tileCenter(40, ts), y: tileCenter(30, ts) };
    applyCommand(state, "A", { type: "cmd.move", ids: [wanderer.id], x: dest.x, y: dest.y });
    ticks(state, 400);
    assert.ok(Math.hypot(wanderer.x - dest.x, wanderer.y - dest.y) < ts * 3);
    const left = { x: wanderer.x, y: wanderer.y };
    for (let i = 0; i < 3; i++) applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" });
    ticks(state, secondsToTicks(catalog("rifleman").buildSeconds) * 3 + 80);
    assert.ok(Math.hypot(wanderer.x - left.x, wanderer.y - left.y) < ts, "ordered unit was pulled back into the pack");
    const stayed = riflemen(state).filter((e) => e.id !== wanderer.id);
    assert.equal(stayed.length, 5);
    const box = span(stayed);
    assert.ok(box.x > 8 && box.y > 8, `pack collapsed to a line, span ${box.x.toFixed(1)} x ${box.y.toFixed(1)}`);
  });
});

describe("research gate", () => {
  it("locks the advanced units until a Research Facility stands", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const ts = state.tileSize;
    makeEntity(state, "armory", "A", tileCenter(20, ts), tileCenter(4, ts), { tileX: 20, tileY: 4 });
    seedMuster(state, 20, 10);
    const gated = (Object.keys(TECH_REQUIRES) as TrainType[]).filter((u) => factionOf(u) !== "bloom");
    assert.deepEqual([...gated].sort(), ["apocalypse", "assembler", "battleship", "behemoth", "bv222", "cyborg", "cyborgcommander", "destroyer", "droneop", "he111", "horten", "jagdtiger", "juggernaut", "jumpjet", "lancer", "lurker", "mammoth", "nebelwerfer", "overseer", "scourge", "shade", "simunit2", "spitter", "stuka", "submarine", "thrall", "titan", "warden", "weaver", "xenodrone"]);
    const cyborgs = new Set<TrainType>(["cyborg", "cyborgcommander", "simunit2", "xenodrone", "thrall", "lancer", "spitter", "weaver"]);
    // Ships ask for the Marine Base first, bombers for the Airfield; their gates are checked on their own.
    for (const unit of gated.filter((u) => producerType(u) !== "dock" && producerType(u) !== "airfield")) {
      const r = applyCommand(state, "A", { type: "cmd.train", unit });
      assert.equal(r.ok, false, unit);
      // The Xenomorph units are not the Alliance's to train at all; its own cyborgs want a Cyborg Central.
      const want = factionOf(unit) === "xeno" ? "Not available to your faction." : unit === "cyborg" || unit === "cyborgcommander" ? "Need a Cyborg Central." : "Need a Research Facility.";
      if (!r.ok) assert.equal(r.message, want, unit);
    }
    assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: "ss3" }).ok, true);
    // The Feuerwirbel needs only the Machine Shop.
    assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: "feuerwirbel" }).ok, true);
    assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: "rifleman" }).ok, true);

    const lab = makeEntity(state, "research", "A", tileCenter(10, ts), tileCenter(14, ts), { tileX: 10, tileY: 14 });
    assert.equal(techMissing(state, "A", "warden"), null);
    assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: "warden" }).ok, true);
    assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: "droneop" }).ok, true);
    // Every cyborg wants only its own side's barracks (a Cyborg Central, a Conversion Chamber); the lab does not unlock them.
    for (const unit of cyborgs) assert.equal(techMissing(state, "A", unit), factionOf(unit) === "xeno" ? "conversion" : "cyborgcentral", unit);

    makeEntity(state, "cyborgcentral", "A", tileCenter(30, ts), tileCenter(14, ts), { tileX: 30, tileY: 14 });
    makeEntity(state, "conversion", "A", tileCenter(36, ts), tileCenter(14, ts), { tileX: 36, tileY: 14 });
    // The Shade also wants a Neural Nexus.
    assert.equal(techMissing(state, "A", "shade"), "nexus");
    for (const unit of cyborgs) assert.equal(techMissing(state, "A", unit), null, unit);

    lab.hp = 0;
    assert.equal(techMissing(state, "A", "titan"), "research");
    assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: "titan" }).ok, false);
    // The Central and the Chamber alone keep every cyborg unlocked.
    for (const unit of cyborgs) assert.equal(techMissing(state, "A", unit), null, unit);
  });

  it("does not count another player's Research Facility", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    makeEntity(state, "research", "B", tileCenter(10, ts), tileCenter(14, ts), { tileX: 10, tileY: 14 });
    makeEntity(state, "cyborgcentral", "B", tileCenter(20, ts), tileCenter(14, ts), { tileX: 20, tileY: 14 });
    assert.equal(techMissing(state, "A", "cyborgcommander"), "cyborgcentral");
    assert.equal(techMissing(state, "B", "cyborgcommander"), null);
    assert.equal(techMissing(state, "A", "cyborg"), "cyborgcentral");
    assert.equal(techMissing(state, "B", "cyborg"), null);
  });
});

describe("defence tech gate", () => {
  it("locks the heavy defences until a Research Facility stands, and CIWS and RAM until a Radar Station too", () => {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const ts = state.tileSize;
    state.players.get("A")!.scrap = 100_000;
    assert.deepEqual(Object.keys(BUILD_REQUIRES).filter((b) => factionOf(b) !== "bloom").sort(), ["casemate", "ciws", "flak", "leitturm", "pak43", "pulsespire", "ram"]);
    const tryBuild = (building: "leitturm" | "flak" | "pak43" | "casemate" | "ciws" | "ram") => {
      const r = applyCommand(state, "A", { type: "cmd.build", building });
      if (r.ok) applyCommand(state, "A", { type: "cmd.cancel", what: "structure", building });
      return r;
    };
    for (const b of ["leitturm", "flak", "pak43", "casemate"] as const) {
      const r = tryBuild(b);
      assert.equal(r.ok, false, b);
      if (!r.ok) assert.equal(r.message, "Need a Research Facility.");
    }
    for (const b of ["ciws", "ram"] as const) {
      const r = tryBuild(b);
      assert.equal(r.ok, false, b);
      if (!r.ok) assert.equal(r.message, `Need a ${catalog("research").name} and a ${catalog("radar").name}.`);
    }
    assert.equal(applyCommand(state, "A", { type: "cmd.build", building: "pak36" }).ok, true);
    applyCommand(state, "A", { type: "cmd.cancel", what: "structure", building: "pak36" });

    const lab = makeEntity(state, "research", "A", tileCenter(10, ts), tileCenter(14, ts), { tileX: 10, tileY: 14 });
    for (const b of ["leitturm", "flak", "pak43", "casemate"] as const) assert.equal(tryBuild(b).ok, true, b);
    assert.deepEqual(buildTechMissing(state, "A", "ciws"), ["radar"]);
    assert.equal(tryBuild("ram").ok, false);

    makeEntity(state, "radar", "A", tileCenter(14, ts), tileCenter(14, ts), { tileX: 14, tileY: 14 });
    assert.equal(tryBuild("ciws").ok, true);
    assert.equal(tryBuild("ram").ok, true);

    lab.hp = 0;
    assert.deepEqual(buildTechMissing(state, "A", "ram"), ["research"]);
    assert.equal(tryBuild("flak").ok, false);
  });

  it("does not count another player's Research Facility or Radar", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    makeEntity(state, "research", "B", tileCenter(10, ts), tileCenter(14, ts), { tileX: 10, tileY: 14 });
    makeEntity(state, "radar", "B", tileCenter(14, ts), tileCenter(14, ts), { tileX: 14, tileY: 14 });
    assert.deepEqual(buildTechMissing(state, "A", "ciws"), ["research", "radar"]);
    assert.deepEqual(buildTechMissing(state, "B", "ciws"), []);
  });
});

describe("naval tech gate", () => {
  it("needs a Research Facility for the Submarine and Destroyer, and a Radar Station too for the Battle Ship", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    for (const unit of ["submarine", "destroyer", "battleship"] as const) assert.equal(techMissing(state, "A", unit), "research", unit);
    assert.equal(techMissing(state, "A", "gunboat"), null);

    const lab = makeEntity(state, "research", "A", tileCenter(10, ts), tileCenter(14, ts), { tileX: 10, tileY: 14 });
    assert.equal(techMissing(state, "A", "submarine"), null);
    assert.equal(techMissing(state, "A", "destroyer"), null);
    assert.equal(techMissing(state, "A", "battleship"), "radar");

    makeEntity(state, "radar", "A", tileCenter(20, ts), tileCenter(14, ts), { tileX: 20, tileY: 14 });
    assert.equal(techMissing(state, "A", "battleship"), null);

    lab.hp = 0;
    assert.equal(techMissing(state, "A", "battleship"), "research");
    assert.equal(techMissing(state, "A", "submarine"), "research");
  });
});

describe("one at a time", () => {
  /** Two of the unit's factories for A. A cyborg's are Cyborg Centrals. */
  function armed(unit: TrainType = "titan"): { state: MatchState; shops: ReturnType<typeof makeEntity>[] } {
    const { state } = twoPlayerMatch();
    seedCore(state);
    const ts = state.tileSize;
    const shop = producerType(unit);
    const shops = [
      makeEntity(state, shop, "A", tileCenter(20, ts), tileCenter(4, ts), { tileX: 20, tileY: 4 }),
      makeEntity(state, shop, "A", tileCenter(30, ts), tileCenter(4, ts), { tileX: 30, tileY: 4 }),
    ];
    makeEntity(state, "research", "A", tileCenter(10, ts), tileCenter(14, ts), { tileX: 10, tileY: 14 });
    makeEntity(state, "cyborgcentral", "A", tileCenter(40, ts), tileCenter(14, ts), { tileX: 40, tileY: 14 });
    return { state, shops };
  }

  for (const unit of ["titan", "cyborgcommander"] as const) {
    it(`queues only one ${unit}, across every factory`, () => {
      const { state, shops } = armed(unit);
      const other = unit === "titan" ? "ss3" : "cyborg";
      assert.ok(ONE_AT_A_TIME.includes(unit));
      assert.equal(applyCommand(state, "A", { type: "cmd.train", unit }).ok, true);
      assert.equal(oneAtATimeTaken(state, "A", unit), "queued");
      const again = applyCommand(state, "A", { type: "cmd.train", unit });
      assert.equal(again.ok, false);
      if (!again.ok) assert.match(again.message, /already in the queue/);
      const jobs = shops.reduce((n, s) => n + s.queue.filter((j) => j.type === unit).length, 0);
      assert.equal(jobs, 1, "the second factory did not take one either");
      // Other units still queue beside it.
      assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: other }).ok, true);
      // Cancelled, the slot opens again.
      assert.equal(applyCommand(state, "A", { type: "cmd.cancel", what: "train", unit }).ok, true);
      assert.equal(oneAtATimeTaken(state, "A", unit), null);
      assert.equal(applyCommand(state, "A", { type: "cmd.train", unit }).ok, true);
    });

    it(`refuses a second ${unit} while the first lives, and allows one once it is destroyed`, () => {
      const { state } = armed(unit);
      const ts = state.tileSize;
      const first = makeEntity(state, unit, "A", tileCenter(40, ts), tileCenter(40, ts));
      assert.equal(oneAtATimeTaken(state, "A", unit), "alive");
      const r = applyCommand(state, "A", { type: "cmd.train", unit });
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.message, /still in the field/);
      // Another player's does not count against you.
      assert.equal(oneAtATimeTaken(state, "B", unit), null);
      first.hp = 0;
      if (unit === "titan") first.wreck = true;
      assert.equal(oneAtATimeTaken(state, "A", unit), null, "a dead one, or a wreck, frees the slot");
      assert.equal(applyCommand(state, "A", { type: "cmd.train", unit }).ok, true);
    });
  }

  it("leaves every other type alone", () => {
    const { state } = armed("cyborg");
    for (let i = 0; i < 3; i++) assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: "cyborg" }).ok, true);
    assert.equal(oneAtATimeTaken(state, "A", "cyborg"), null);
  });
});
