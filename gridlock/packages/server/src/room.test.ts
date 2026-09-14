import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServerMessage } from "@gridlock/shared";
import { step } from "@gridlock/shared";
import { Hub } from "./room.js";

function client(hub: Hub, id: string) {
  const inbox: ServerMessage[] = [];
  hub.connect(id, (m) => inbox.push(m));
  return {
    inbox,
    of: <T extends ServerMessage["type"]>(type: T) =>
      inbox.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type),
  };
}

describe("hub rooms", () => {
  it("create → join → ready → start yields unique spawns", () => {
    const hub = new Hub();
    const a = client(hub, "A");
    const b = client(hub, "B");
    hub.handle("A", { type: "hello", name: "Alpha" });
    hub.handle("B", { type: "hello", name: "Bravo" });
    hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8 });
    const created = a.of("room.state")[0];
    assert.ok(created);
    hub.handle("B", { type: "room.join", code: created.room.id });
    hub.handle("A", { type: "slot.update", ready: true, spawnId: 4 });
    hub.handle("B", { type: "slot.update", ready: true, spawnId: 1 });
    hub.handle("A", { type: "room.start" });
    const startA = a.of("match.start")[0];
    const startB = b.of("match.start")[0];
    assert.ok(startA);
    assert.ok(startB);
    assert.equal(startA.match.youPlayerId, "A");
    assert.equal(startB.match.youPlayerId, "B");
    const rigsA = startA.match.entities.filter((e) => e.type === "rig");
    const rigsB = startB.match.entities.filter((e) => e.type === "rig");
    assert.equal(rigsA.length, 1);
    assert.equal(rigsA[0]?.ownerId, "A");
    assert.equal(rigsB.length, 1);
    assert.equal(rigsB[0]?.ownerId, "B");
    assert.notEqual(
      `${Math.round(rigsA[0]!.x)},${Math.round(rigsA[0]!.y)}`,
      `${Math.round(rigsB[0]!.x)},${Math.round(rigsB[0]!.y)}`,
    );
    assert.equal(startA.match.you.scrap, 2200);
  });

  it("rejects a third joiner after start", () => {
    const hub = new Hub();
    client(hub, "A");
    const late = client(hub, "C");
    hub.handle("A", { type: "hello", name: "Alpha" });
    hub.handle("A", { type: "room.create", mapId: "canal-48", maxSlots: 4 });
    const code = hub.sessions.get("A")!.roomId!;
    hub.handle("A", { type: "slot.update", ready: true });
    hub.handle("A", { type: "room.start" });
    hub.handle("C", { type: "hello", name: "Late" });
    hub.handle("C", { type: "room.join", code });
    const err = late.of("room.error").at(-1);
    assert.ok(err);
    assert.equal(err.code, "started");
  });

  it("host leave notifies the other player", () => {
    const hub = new Hub();
    client(hub, "A");
    const b = client(hub, "B");
    hub.handle("A", { type: "hello", name: "H" });
    hub.handle("B", { type: "hello", name: "G" });
    hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8 });
    const code = hub.sessions.get("A")!.roomId!;
    hub.handle("B", { type: "room.join", code });
    hub.handle("A", { type: "room.leave" });
    const closed = b.of("room.closed")[0];
    assert.ok(closed);
    assert.match(closed.reason, /host left/i);
    assert.equal(hub.rooms.size, 0);
  });

  it("enforces unique colors", () => {
    const hub = new Hub();
    const b = client(hub, "B");
    client(hub, "A");
    hub.handle("A", { type: "hello", name: "H" });
    hub.handle("B", { type: "hello", name: "G" });
    hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8 });
    hub.handle("B", { type: "room.join", code: hub.sessions.get("A")!.roomId! });
    hub.handle("B", { type: "slot.update", colorId: 0 });
    const err = b.of("room.error").at(-1);
    assert.equal(err?.code, "color_taken");
  });

  it("deploys a Rig into a Core after start", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8 });
      hub.handle("A", { type: "slot.update", ready: true, spawnId: 3 });
      hub.handle("A", { type: "room.start" });
      const start = a.of("match.start")[0];
      assert.ok(start);
      const rig = start.match.entities.find((e) => e.type === "rig");
      assert.ok(rig);
      hub.handle("A", { type: "cmd.move", ids: [rig.id], x: rig.x + 64, y: rig.y + 64 });
      hub.handle("A", { type: "cmd.stop", ids: [rig.id] });
      hub.handle("A", { type: "cmd.deploy", id: rig.id });
      const match = hub.matches.get(hub.sessions.get("A")!.roomId!);
      assert.ok(match);
      for (let i = 0; i < 40; i++) step(match);
      const core = [...match.entities.values()].find((e) => e.type === "core");
      assert.ok(core);
      const snap = a.of("match.start")[0]!.match;
      assert.equal(snap.you.scrap, 2200);
    } finally {
      hub.shutdown();
    }
  });

  it("host + / − clamps game speed at 5×", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8 });
      hub.handle("A", { type: "slot.update", ready: true });
      hub.handle("A", { type: "room.start" });
      const roomId = hub.sessions.get("A")!.roomId!;
      const match = hub.matches.get(roomId)!;
      assert.equal(match.gameSpeed, 5);
      hub.handle("A", { type: "cmd.speed", delta: 1 });
      assert.equal(match.gameSpeed, 5);
      for (let n = 4; n >= 1; n--) {
        hub.handle("A", { type: "cmd.speed", delta: -1 });
        assert.equal(match.gameSpeed, n);
      }
      hub.handle("A", { type: "cmd.speed", delta: -1 });
      assert.equal(match.gameSpeed, 1);
      hub.handle("A", { type: "cmd.speed", delta: 1 });
      assert.equal(match.gameSpeed, 2);
      const snap = a.of("match.snapshot").at(-1);
      assert.equal(snap?.match.gameSpeed, 2);
    } finally {
      hub.shutdown();
    }
  });

  it("skirmish starts without ready and rejects joiners", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      const b = client(hub, "B");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("B", { type: "hello", name: "Bravo" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8, mode: "skirmish" });
      const created = a.of("room.state")[0];
      assert.ok(created);
      assert.equal(created.room.mode, "skirmish");
      hub.handle("B", { type: "room.join", code: created.room.id });
      const err = b.of("room.error").at(-1);
      assert.equal(err?.code, "closed");
      hub.handle("A", { type: "room.start" });
      assert.ok(a.of("match.start")[0]);
    } finally {
      hub.shutdown();
    }
  });

  it("host can add an Easy CPU and start vs it", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8, mode: "skirmish" });
      hub.handle("A", { type: "slot.host", slotIndex: 1, status: "ai" });
      const lobby = a.of("room.state").at(-1);
      assert.equal(lobby?.room.slots[1]?.status, "ai");
      assert.equal(lobby?.room.slots[1]?.ai, "easy");
      hub.handle("A", { type: "room.start" });
      const start = a.of("match.start")[0];
      assert.ok(start);
      const ids = start.match.players.map((p) => p.playerId);
      assert.equal(ids.includes("A"), true);
      assert.equal(ids.includes("ai:1"), true);
      assert.equal(start.match.players.length, 2);
      assert.ok(start.match.entities.some((e) => e.type === "rig" && e.ownerId === "A"));
    } finally {
      hub.shutdown();
    }
  });

  it("guest cannot change game speed", () => {
    const hub = new Hub();
    try {
      client(hub, "A");
      const b = client(hub, "B");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("B", { type: "hello", name: "Bravo" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8 });
      hub.handle("B", { type: "room.join", code: hub.sessions.get("A")!.roomId! });
      hub.handle("A", { type: "slot.update", ready: true });
      hub.handle("B", { type: "slot.update", ready: true });
      hub.handle("A", { type: "room.start" });
      hub.handle("B", { type: "cmd.speed", delta: 1 });
      const err = b.of("room.error").at(-1);
      assert.equal(err?.code, "not_host");
      assert.equal(hub.matches.get(hub.sessions.get("A")!.roomId!)!.gameSpeed, 5);
    } finally {
      hub.shutdown();
    }
  });
});
