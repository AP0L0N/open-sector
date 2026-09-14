import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  resolveSpawns,
  startMatch,
  startPreconditions,
  updateSelf,
  hostSlot,
  setMap,
} from "./lobby.js";
import type { RoomState } from "./protocol.js";

function room(maxSlots = 8): RoomState {
  const r = createRoom({
    id: "K7M2",
    hostId: "host",
    hostName: "Commander-AAA",
    mapId: "yard-64",
    maxSlots,
  });
  if (!r.ok) throw new Error(r.message);
  return r.value;
}

describe("lobby rules", () => {
  it("rejects unknown maps", () => {
    const r = createRoom({
      id: "X",
      hostId: "h",
      hostName: "H",
      mapId: "nope",
      maxSlots: 8,
    });
    assert.equal(r.ok, false);
  });

  it("closes extra slots when maxSlots is 4", () => {
    const r = room(4);
    assert.equal(r.mode, "network");
    assert.equal(r.slots.filter((s) => s.status === "closed").length, 4);
    assert.equal(r.slots[0]?.status, "human");
  });

  it("rejects a taken color", () => {
    const r = room();
    assert.equal(joinRoom(r, "p2", "Two").ok, true);
    const clash = updateSelf(r, "p2", { colorId: 0 });
    assert.equal(clash.ok, false);
    if (!clash.ok) assert.equal(clash.code, "color_taken");
  });

  it("allows a free color", () => {
    const r = room();
    assert.equal(joinRoom(r, "p2", "Two").ok, true);
    assert.equal(updateSelf(r, "p2", { colorId: 3 }).ok, true);
    assert.equal(r.slots[1]?.colorId, 3);
  });

  it("rejects a taken spawn", () => {
    const r = room();
    assert.equal(joinRoom(r, "p2", "Two").ok, true);
    assert.equal(updateSelf(r, "host", { spawnId: 3 }).ok, true);
    const clash = updateSelf(r, "p2", { spawnId: 3 });
    assert.equal(clash.ok, false);
    if (!clash.ok) assert.equal(clash.code, "spawn_taken");
  });

  it("blocks start until every human is ready", () => {
    const r = room();
    joinRoom(r, "p2", "Two");
    updateSelf(r, "host", { ready: true });
    const pre = startPreconditions(r);
    assert.equal(pre.ok, false);
    if (!pre.ok) assert.match(pre.message, /Waiting for Two/);
    updateSelf(r, "p2", { ready: true });
    assert.equal(startPreconditions(r).ok, true);
  });

  it("allows solo preview start when the only human is ready", () => {
    const r = room();
    updateSelf(r, "host", { ready: true });
    const started = startMatch(r, "host");
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const spawn = started.value.get("host");
    assert.ok(spawn);
    assert.ok(spawn!.spawnId > 0);
    assert.equal(r.phase, "playing");
  });

  it("only the host can start", () => {
    const r = room();
    joinRoom(r, "p2", "Two");
    updateSelf(r, "host", { ready: true });
    updateSelf(r, "p2", { ready: true });
    const res = startMatch(r, "p2");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "not_host");
  });

  it("keeps unique requested spawns and fills random from remaining sorted ids", () => {
    const r = room();
    joinRoom(r, "p2", "Two");
    joinRoom(r, "p3", "Three");
    updateSelf(r, "host", { spawnId: 8, ready: true });
    updateSelf(r, "p2", { spawnId: 0, ready: true });
    updateSelf(r, "p3", { spawnId: 2, ready: true });
    const resolved = resolveSpawns(r);
    assert.equal(resolved.get("host")?.spawnId, 8);
    assert.equal(resolved.get("p3")?.spawnId, 2);
    assert.equal(resolved.get("p2")?.spawnId, 1);
    const ids = [...resolved.values()].map((v) => v.spawnId);
    assert.equal(new Set(ids).size, 3);
  });

  it("never overlaps random spawns", () => {
    const r = room();
    for (let i = 2; i <= 8; i++) joinRoom(r, `p${i}`, `P${i}`);
    for (const s of r.slots) {
      if (s.playerId) updateSelf(r, s.playerId, { ready: true, spawnId: 0 });
    }
    const resolved = resolveSpawns(r);
    const ids = [...resolved.values()].map((v) => v.spawnId);
    assert.equal(ids.length, 8);
    assert.equal(new Set(ids).size, 8);
  });

  it("rejects join after start", () => {
    const r = room();
    updateSelf(r, "host", { ready: true });
    assert.equal(startMatch(r, "host").ok, true);
    const j = joinRoom(r, "late", "Late");
    assert.equal(j.ok, false);
    if (!j.ok) assert.equal(j.code, "started");
  });

  it("rejects join when full", () => {
    const r = room(2);
    assert.equal(joinRoom(r, "p2", "Two").ok, true);
    const j = joinRoom(r, "p3", "Three");
    assert.equal(j.ok, false);
    if (!j.ok) assert.equal(j.code, "full");
  });

  it("host leave is flagged", () => {
    const r = room();
    joinRoom(r, "p2", "Two");
    const left = leaveRoom(r, "host");
    assert.equal(left.hostLeft, true);
    assert.equal(left.emptied, true);
  });

  it("host can kick and close a slot", () => {
    const r = room();
    joinRoom(r, "p2", "Two");
    assert.equal(hostSlot(r, "host", 1, { kick: true }).ok, true);
    assert.equal(r.slots[1]?.status, "open");
    assert.equal(hostSlot(r, "host", 1, { status: "closed" }).ok, true);
    assert.equal(r.slots[1]?.status, "closed");
  });

  it("changing map resets spawns and ready", () => {
    const r = room();
    updateSelf(r, "host", { spawnId: 4, ready: true });
    assert.equal(setMap(r, "host", "canal-48").ok, true);
    assert.equal(r.mapId, "canal-48");
    assert.equal(r.slots[0]?.spawnId, 0);
    assert.equal(r.slots[0]?.ready, false);
  });

  it("skirmish rooms are solo, closed to joiners, and start without ready", () => {
    const made = createRoom({
      id: "SKRM",
      hostId: "host",
      hostName: "Solo",
      mapId: "yard-64",
      maxSlots: 8,
      mode: "skirmish",
    });
    assert.equal(made.ok, true);
    if (!made.ok) return;
    const r = made.value;
    assert.equal(r.mode, "skirmish");
    assert.ok(r.slots.filter((s) => s.status === "open").length > 0);
    const join = joinRoom(r, "p2", "Two");
    assert.equal(join.ok, false);
    if (!join.ok) assert.equal(join.code, "closed");
    assert.equal(startPreconditions(r).ok, true);
    assert.equal(startMatch(r, "host").ok, true);
  });

  it("skirmish host cannot open extra slots for human joiners", () => {
    const made = createRoom({
      id: "SKRM",
      hostId: "host",
      hostName: "Solo",
      mapId: "yard-64",
      maxSlots: 8,
      mode: "skirmish",
    });
    assert.equal(made.ok, true);
    if (!made.ok) return;
    const open = hostSlot(made.value, "host", 1, { status: "open" });
    assert.equal(open.ok, false);
    if (!open.ok) assert.equal(open.code, "closed");
  });

  it("lets the host drop an Easy CPU on an open slot", () => {
    const r = room();
    const add = hostSlot(r, "host", 1, { status: "ai" });
    assert.equal(add.ok, true, !add.ok ? add.message : "");
    const cpu = r.slots[1];
    assert.equal(cpu?.status, "ai");
    assert.equal(cpu?.ai, "easy");
    assert.equal(cpu?.ready, true);
    assert.equal(cpu?.playerId, "ai:1");
    assert.equal(cpu?.name, "Easy CPU");
    assert.notEqual(cpu?.colorId, r.slots[0]?.colorId);
    updateSelf(r, "host", { ready: true });
    const started = startMatch(r, "host");
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.ok(started.value.has("host"));
    assert.ok(started.value.has("ai:1"));
    assert.notEqual(started.value.get("host")?.spawnId, started.value.get("ai:1")?.spawnId);
  });

  it("lets the host remove an Easy CPU", () => {
    const r = room();
    assert.equal(hostSlot(r, "host", 1, { status: "ai" }).ok, true);
    assert.equal(hostSlot(r, "host", 1, { kick: true }).ok, true);
    assert.equal(r.slots[1]?.status, "open");
    assert.equal(r.slots[1]?.playerId, undefined);
  });
});
