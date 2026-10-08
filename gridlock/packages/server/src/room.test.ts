import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomMapSpec, ServerMessage } from "@gridlock/shared";
import { HEIGHT_BASE, TILE_EMPTY, TILE_SUBDIV, encodeRuns, getMap, newPlaytestMapId, step, stepMatch } from "@gridlock/shared";
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
    hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 4 });
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

  it("host + / − clamps game speed to 1–5×, starting at 1×", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8 });
      hub.handle("A", { type: "slot.update", ready: true });
      hub.handle("A", { type: "room.start" });
      const roomId = hub.sessions.get("A")!.roomId!;
      const match = hub.matches.get(roomId)!;
      assert.equal(match.gameSpeed, 1);
      hub.handle("A", { type: "cmd.speed", delta: -1 });
      assert.equal(match.gameSpeed, 1);
      for (let n = 2; n <= 5; n++) {
        hub.handle("A", { type: "cmd.speed", delta: 1 });
        assert.equal(match.gameSpeed, n);
      }
      hub.handle("A", { type: "cmd.speed", delta: 1 });
      assert.equal(match.gameSpeed, 5);
      hub.handle("A", { type: "cmd.speed", delta: -1 });
      assert.equal(match.gameSpeed, 4);
      const snap = a.of("match.snapshot").at(-1);
      assert.equal(snap?.match.gameSpeed, 4);
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
      assert.equal(hub.matches.get(hub.sessions.get("A")!.roomId!)!.gameSpeed, 1);
    } finally {
      hub.shutdown();
    }
  });

  it("esc pause holds a skirmish and blocks orders", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8, mode: "skirmish" });
      hub.handle("A", { type: "room.start" });
      const roomId = hub.sessions.get("A")!.roomId!;
      const match = hub.matches.get(roomId)!;
      const tick = match.tick;
      hub.handle("A", { type: "match.pause", paused: true });
      assert.equal(match.paused, true);
      const snap = a.of("match.snapshot").at(-1);
      assert.equal(snap?.match.paused, true);
      stepMatch(match);
      assert.equal(match.tick, tick);
      const rig = [...match.entities.values()].find((e) => e.type === "rig");
      assert.ok(rig);
      hub.handle("A", { type: "cmd.move", ids: [rig.id], x: rig.x + 40, y: rig.y });
      assert.equal(a.of("room.error").at(-1)?.code, "paused");
      assert.equal(rig.order, null);
      hub.handle("A", { type: "match.pause", paused: false });
      assert.equal(match.paused, false);
      assert.equal(a.of("match.snapshot").at(-1)?.match.paused, undefined);
    } finally {
      hub.shutdown();
    }
  });

  it("a network match cannot be paused", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8, mode: "network" });
      hub.handle("A", { type: "slot.update", ready: true });
      hub.handle("A", { type: "room.start" });
      hub.handle("A", { type: "match.pause", paused: true });
      assert.equal(a.of("room.error").at(-1)?.code, "closed");
      assert.equal(hub.matches.get(hub.sessions.get("A")!.roomId!)!.paused, undefined);
    } finally {
      hub.shutdown();
    }
  });

  it("saves a skirmish and loads it into a new session", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "hello", name: "Alpha" });
      hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8, mode: "skirmish" });
      hub.handle("A", { type: "slot.host", slotIndex: 1, status: "ai" });
      hub.handle("A", { type: "room.start" });
      const roomId = hub.sessions.get("A")!.roomId!;
      const match = hub.matches.get(roomId)!;
      for (let i = 0; i < 3; i++) step(match);
      const tick = match.tick;
      hub.handle("A", { type: "match.save" });
      const saved = a.of("match.saved").at(-1);
      assert.ok(saved);
      assert.equal(saved.save.tick, tick);
      assert.equal(saved.save.humanId, "A");
      hub.handle("A", { type: "room.leave" });
      const b = client(hub, "B");
      hub.handle("B", { type: "hello", name: "Bravo" });
      hub.handle("B", { type: "match.load", save: saved.save });
      const resumed = b.of("match.resume").at(-1);
      assert.ok(resumed);
      assert.equal(resumed.match.youPlayerId, "B");
      assert.equal(resumed.match.tick, tick);
      assert.equal(resumed.match.mapId, "yard-64");
      assert.equal(resumed.room.mode, "skirmish");
      assert.equal(resumed.room.phase, "playing");
      const loaded = hub.matches.get(hub.sessions.get("B")!.roomId!);
      assert.ok(loaded);
      assert.equal(loaded.players.has("B"), true);
      assert.equal(loaded.players.has("A"), false);
      assert.equal(loaded.players.has("ai:1"), true);
      assert.equal([...loaded.entities.values()].some((e) => e.ownerId === "B" && e.type === "rig"), true);
    } finally {
      hub.shutdown();
    }
  });
});

describe("hub map builder play test", () => {
  function testSheet(id: string, spawns: { id: number; x: number; y: number }[]): CustomMapSpec {
    const side = 48 * TILE_SUBDIV;
    const n = side * side;
    return {
      id,
      name: "Sketch",
      author: "",
      width: side,
      height: side,
      maxPlayers: 4,
      tiles: encodeRuns(new Array(n).fill(TILE_EMPTY)),
      heights: encodeRuns(new Array(n).fill(HEIGHT_BASE)),
      spawns,
      features: [{ type: "tower", x: 64, y: 64, facing: 0 }],
      updatedAt: 0,
    };
  }

  it("drops the tester alone onto an unsaved sheet with one start, then forgets it", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      const other = client(hub, "B");
      hub.handle("A", { type: "hello", name: "Alpha" });
      const id = newPlaytestMapId();
      hub.handle("A", { type: "map.test", map: testSheet(id, [{ id: 2, x: 30, y: 30 }]) });
      assert.deepEqual(a.of("room.error"), []);
      const start = a.of("match.start")[0];
      assert.ok(start, "the match starts without a lobby step");
      assert.equal(start.match.mapId, id);
      const rigs = start.match.entities.filter((e) => e.type === "rig");
      assert.equal(rigs.length, 1);
      assert.equal(rigs[0]?.ownerId, "A");
      assert.equal(hub.rooms.get(hub.sessions.get("A")!.roomId!)?.mode, "skirmish");
      assert.equal(other.of("map.upsert").length, 0, "a play test is not announced");
      assert.equal(hub.maps.has(id), false, "a play test is not stored");
      hub.handle("A", { type: "room.leave" });
      assert.equal(getMap(id), undefined, "leaving drops the sheet");
    } finally {
      hub.shutdown();
    }
  });

  it("drops the tester on the start they picked", () => {
    const starts = [
      { id: 1, x: 30, y: 30 },
      { id: 2, x: 30, y: 160 },
      { id: 3, x: 160, y: 160 },
    ];
    for (const pick of [1, 2, 3]) {
      const hub = new Hub();
      try {
        const a = client(hub, "A");
        hub.handle("A", { type: "hello", name: "Alpha" });
        hub.handle("A", { type: "map.test", map: testSheet(newPlaytestMapId(), starts), spawnId: pick });
        assert.deepEqual(a.of("room.error"), []);
        assert.equal(a.of("match.start").length, 1);
        const room = hub.rooms.get(hub.sessions.get("A")!.roomId!)!;
        assert.equal(room.slots.find((sl) => sl.playerId === "A")?.spawnId, pick);
      } finally {
        hub.shutdown();
      }
    }
  });

  it("refuses a start the sheet does not have, and leaves no room behind", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "hello", name: "Alpha" });
      const id = newPlaytestMapId();
      hub.handle("A", { type: "map.test", map: testSheet(id, [{ id: 1, x: 30, y: 30 }]), spawnId: 3 });
      assert.equal(a.of("room.error").length, 1);
      assert.equal(a.of("match.start").length, 0);
      assert.equal(hub.sessions.get("A")!.roomId, null);
      assert.equal(getMap(id), undefined);
    } finally {
      hub.shutdown();
    }
  });

  it("refuses a sheet with no start, or a play test under a saved map's id", () => {
    const hub = new Hub();
    try {
      const a = client(hub, "A");
      hub.handle("A", { type: "map.test", map: testSheet(newPlaytestMapId(), []) });
      hub.handle("A", { type: "map.test", map: testSheet("c-savedmap01", [{ id: 1, x: 30, y: 30 }]) });
      assert.equal(a.of("room.error").length, 2);
      assert.equal(a.of("match.start").length, 0);
    } finally {
      hub.shutdown();
    }
  });
});

describe("snapshot wire diet", () => {
  function started(hub: Hub): { a: ReturnType<typeof client>; roomId: string } {
    const a = client(hub, "A");
    hub.handle("A", { type: "hello", name: "Alpha" });
    hub.handle("A", { type: "room.create", mapId: "yard-64", maxSlots: 8 });
    hub.handle("A", { type: "slot.update", ready: true });
    hub.handle("A", { type: "room.start" });
    return { a, roomId: hub.sessions.get("A")!.roomId! };
  }

  it("sends the scrap grid with match.start, then only after scrapRev moves", () => {
    const hub = new Hub();
    try {
      const { a, roomId } = started(hub);
      const start = a.of("match.start")[0];
      assert.ok(start);
      assert.ok(Array.isArray(start.match.scrap));
      hub["tickRoom"](roomId);
      const snap = a.of("match.snapshot").at(-1);
      assert.ok(snap);
      assert.equal(snap.match.scrap, undefined);
      hub.matches.get(roomId)!.scrapRev++;
      hub["tickRoom"](roomId);
      assert.ok(Array.isArray(a.of("match.snapshot").at(-1)?.match.scrap));
      hub["tickRoom"](roomId);
      assert.equal(a.of("match.snapshot").at(-1)?.match.scrap, undefined);
    } finally {
      hub.shutdown();
    }
  });

  it("sends the scenery list with match.start, then only after a house changes", () => {
    const hub = new Hub();
    try {
      const { a, roomId } = started(hub);
      const start = a.of("match.start")[0];
      assert.ok(start);
      assert.ok(Array.isArray(start.match.scenery));
      const match = hub.matches.get(roomId)!;
      const houses = start.match.scenery!.filter((e) => e.kind === "building");
      assert.ok(houses.length > 0, "yard-64 has civilian buildings");
      hub["tickRoom"](roomId);
      const snap = a.of("match.snapshot").at(-1);
      assert.ok(snap);
      assert.equal(snap.match.scenery, undefined);
      // Out of sight, a house is not in `entities` either: the client keeps drawing it from the list.
      assert.equal(snap.match.entities.some((e) => e.id === houses[0]!.id), false);
      const house = match.entities.get(houses[0]!.id)!;
      house.hp = Math.max(1, house.hp - 50);
      hub["tickRoom"](roomId);
      const again = a.of("match.snapshot").at(-1)!.match.scenery;
      assert.ok(Array.isArray(again));
      assert.equal(again!.find((e) => e.id === house.id)?.hp, house.hp);
      hub["tickRoom"](roomId);
      assert.equal(a.of("match.snapshot").at(-1)?.match.scenery, undefined);
    } finally {
      hub.shutdown();
    }
  });

  it("skips tick snapshots for a backlogged socket and resumes once it drains", () => {
    const hub = new Hub();
    try {
      const { a, roomId } = started(hub);
      const session = hub.sessions.get("A")!;
      hub["tickRoom"](roomId);
      const before = a.of("match.snapshot").length;
      session.backlogged = () => true;
      hub["tickRoom"](roomId);
      hub["tickRoom"](roomId);
      assert.equal(a.of("match.snapshot").length, before);
      session.backlogged = () => false;
      hub["tickRoom"](roomId);
      assert.equal(a.of("match.snapshot").length, before + 1);
    } finally {
      hub.shutdown();
    }
  });
});
