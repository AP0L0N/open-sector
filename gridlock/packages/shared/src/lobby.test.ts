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
  applySkirmishSetup,
  skirmishSetupOf,
} from "./lobby.js";
import { getMap } from "./maps.js";
import type { RoomState, Slot } from "./protocol.js";

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

  it("keeps unique requested spawns and fills random from the remaining ids", () => {
    const r = room();
    joinRoom(r, "p2", "Two");
    joinRoom(r, "p3", "Three");
    updateSelf(r, "host", { spawnId: 8, ready: true });
    updateSelf(r, "p2", { spawnId: 0, ready: true });
    updateSelf(r, "p3", { spawnId: 2, ready: true });
    const resolved = resolveSpawns(r, () => 0);
    assert.equal(resolved.get("host")?.spawnId, 8);
    assert.equal(resolved.get("p3")?.spawnId, 2);
    assert.equal(resolved.get("p2")?.spawnId, 1);
    const ids = [...resolved.values()].map((v) => v.spawnId);
    assert.equal(new Set(ids).size, 3);
  });

  it("draws a Random start from every free position, not by lobby order", () => {
    const r = room();
    joinRoom(r, "p2", "Two");
    updateSelf(r, "p2", { spawnId: 3, ready: true });
    const host = r.slots[0]!;
    const draw = (rng?: () => number): number => {
      host.spawnId = 0;
      return resolveSpawns(r, rng).get("host")!.spawnId;
    };
    assert.equal(draw(() => 0), 1);
    assert.equal(draw(() => 0.999), 8);
    assert.equal(draw(() => 0.3), 4);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const id = draw();
      assert.notEqual(id, 3);
      seen.add(id);
    }
    assert.ok(seen.size >= 5, `random spawns seen ${[...seen].join(",")}`);
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
    assert.equal(setMap(r, "host", "yard-64").ok, true);
    assert.equal(r.mapId, "yard-64");
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

  it("lets the host drop a Defensive CPU on an open slot", () => {
    const r = room();
    const add = hostSlot(r, "host", 1, { status: "ai" });
    assert.equal(add.ok, true, !add.ok ? add.message : "");
    const cpu = r.slots[1];
    assert.equal(cpu?.status, "ai");
    assert.equal(cpu?.ai, "defensive");
    assert.equal(cpu?.ready, true);
    assert.equal(cpu?.playerId, "ai:1");
    assert.equal(cpu?.name, "Defensive CPU");
    assert.notEqual(cpu?.colorId, r.slots[0]?.colorId);
    updateSelf(r, "host", { ready: true });
    const started = startMatch(r, "host");
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.ok(started.value.has("host"));
    assert.ok(started.value.has("ai:1"));
    assert.notEqual(started.value.get("host")?.spawnId, started.value.get("ai:1")?.spawnId);
  });

  it("leaves Scrap Yard free-for-all when nobody picks a team", () => {
    const r = room();
    updateSelf(r, "host", { ready: true });
    assert.equal(startMatch(r, "host").ok, true);
    assert.equal(r.slots[0]?.team, 0);
  });

  it("seats a CPU of the asked type and switches it in place", () => {
    const r = room();
    assert.equal(hostSlot(r, "host", 1, { status: "ai", ai: "aggressive" }).ok, true);
    assert.equal(r.slots[1]?.ai, "aggressive");
    assert.equal(r.slots[1]?.name, "Aggressive CPU");
    const color = r.slots[1]?.colorId;
    assert.equal(hostSlot(r, "host", 1, { ai: "balanced" }).ok, true);
    assert.equal(r.slots[1]?.ai, "balanced");
    assert.equal(r.slots[1]?.name, "Balanced CPU");
    assert.equal(r.slots[1]?.playerId, "ai:1");
    assert.equal(r.slots[1]?.colorId, color, "switching the type keeps the seat");
    const bad = hostSlot(r, "host", 1, { ai: "easy" as never });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "bad_payload");
    assert.equal(r.slots[1]?.ai, "balanced");
  });

  it("lets the host remove a CPU", () => {
    const r = room();
    assert.equal(hostSlot(r, "host", 1, { status: "ai" }).ok, true);
    assert.equal(hostSlot(r, "host", 1, { kick: true }).ok, true);
    assert.equal(r.slots[1]?.status, "open");
    assert.equal(r.slots[1]?.playerId, undefined);
  });
});

describe("skirmish setup", () => {
  const skirmish = (): RoomState => {
    const r = createRoom({ id: "S1", hostId: "host", hostName: "Cmdr", mapId: "yard-64", maxSlots: 8, mode: "skirmish" });
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };
  it("rebuilds CPUs, factions, colors, teams and starts", () => {
    const a = skirmish();
    const [s1, s2, s3] = getMap("yard-64")!.spawns.map((s) => s.id).reverse();
    assert.equal(updateSelf(a, "host", { faction: "xeno", colorId: 3, team: 1, spawnId: s2 }).ok, true);
    assert.equal(hostSlot(a, "host", 2, { status: "ai", ai: "aggressive", faction: "xeno", team: 2, spawnId: s1 }).ok, true);
    assert.equal(hostSlot(a, "host", 1, { status: "ai", ai: "defensive", team: 2, spawnId: s3 }).ok, true);
    // Swap the CPUs' colors with the host's: an order a naive replay would trip on.
    assert.equal(hostSlot(a, "host", 2, { colorId: 5 }).ok, true);
    assert.equal(hostSlot(a, "host", 1, { colorId: 0 }).ok, true);
    const setup = JSON.parse(JSON.stringify(skirmishSetupOf(a)));

    const b = skirmish();
    applySkirmishSetup(b, setup);
    assert.equal(b.mapId, "yard-64");
    const pick = (s: Slot) => ({ status: s.status, ai: s.ai, faction: s.faction ?? "alliance", colorId: s.colorId, team: s.team, spawnId: s.spawnId });
    assert.deepEqual(b.slots.map(pick), a.slots.map(pick));
    assert.equal(b.maxSlots, a.maxSlots);
  });

  it("skips what no longer fits and never trusts the payload", () => {
    const b = skirmish();
    applySkirmishSetup(b, {
      mapId: "gone-map",
      host: { faction: "nope", colorId: 99, team: 9, spawnId: 999 },
      cpus: [
        { index: 0, ai: "aggressive" },
        { index: 1, ai: "made-up" },
        { index: 2, ai: "defensive", colorId: 0 },
        "junk",
      ],
    });
    assert.equal(b.mapId, "yard-64");
    assert.equal(b.slots[0]?.status, "human");
    assert.equal(b.slots[0]?.colorId, 0);
    assert.equal(b.slots[0]?.team, 0);
    assert.equal(b.slots[0]?.spawnId, 0);
    assert.notEqual(b.slots[1]?.status, "ai");
    assert.equal(b.slots[2]?.status, "ai");
    assert.notEqual(b.slots[2]?.colorId, b.slots[0]?.colorId);
    applySkirmishSetup(b, null);
    applySkirmishSetup(b, "x");
  });

  it("caps CPUs at the map's seats", () => {
    const b = skirmish();
    const seats = getMap("yard-64")!.spawns.length;
    applySkirmishSetup(b, { cpus: [1, 2, 3, 4, 5, 6, 7].map((index) => ({ index, ai: "defensive" })) });
    assert.equal(b.slots.filter((s) => s.status === "ai").length, Math.min(7, seats - 1));
  });
});
