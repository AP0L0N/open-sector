import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, hostSlot, startMatch } from "../lobby.js";
import { TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { fellTreeAt } from "./geo.js";
import { createMatch, step, stepMatch } from "./match.js";
import { soakBlast } from "./remains.js";
import { applySaveSeats, exportSave, restoreMatch } from "./save.js";
import type { MatchState } from "./types.js";
import type { RoomState } from "../protocol.js";

function skirmish(): { state: MatchState; room: RoomState } {
  const created = createRoom({
    id: "SV",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
    mode: "skirmish",
  });
  if (!created.ok) throw new Error(created.message);
  const room = created.value;
  const ai = hostSlot(room, "A", 1, { status: "ai" });
  if (!ai.ok) throw new Error(ai.message);
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), room };
}

function finger(state: MatchState): string {
  return JSON.stringify({
    tick: state.tick,
    rng: state.rngState,
    nextId: state.nextId,
    speed: state.gameSpeed,
    ended: state.ended,
    entities: [...state.entities.values()].sort((a, b) => a.id - b.id),
    players: [...state.players.values()].sort((a, b) => a.playerId.localeCompare(b.playerId)),
    projectiles: state.projectiles,
    scrap: Array.from(state.scrapYield),
    terrain: Array.from(state.terrain),
    occupy: Array.from(state.occupy),
    fort: Array.from(state.fortBlock),
    wreck: Array.from(state.wreckBlock),
    cleared: state.clearedTrees,
    bodies: state.bodies,
    holes: state.holes,
    heights: Array.from(state.heights),
    dug: [...state.dug],
    blast: [...state.blast],
  });
}

describe("skirmish save", () => {
  it("round-trips a fight and keeps stepping the same way", () => {
    const { state, room } = skirmish();
    const rig = [...state.entities.values()].find((e) => e.type === "rig" && e.ownerId === "A");
    assert.ok(rig);
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [rig.id], x: rig.x + 90, y: rig.y + 30 }).ok, true);
    step(state);
    step(state);
    let felled = false;
    for (let i = 0; i < state.terrain.length; i++) {
      if (state.terrain[i] !== TILE_TREE) continue;
      felled = fellTreeAt(state, i % state.width, Math.floor(i / state.width));
      break;
    }
    assert.equal(felled, true);
    let scraped = -1;
    for (let i = 0; i < state.scrapYield.length; i++) {
      if ((state.scrapYield[i] ?? 0) <= 10) continue;
      state.scrapYield[i] = 7;
      scraped = i;
      break;
    }
    assert.ok(scraped >= 0);
    let sunk = false;
    for (let i = 0; i < state.terrain.length && !sunk; i++) {
      if (state.terrain[i] !== 0 || state.occupy[i] !== 0 || (state.heights[i] ?? 0) < 2) continue;
      sunk = soakBlast(state, i % state.width, Math.floor(i / state.width), 400);
    }
    assert.equal(sunk, true);
    const saved = exportSave(state, room, 1_700_000_000_000);
    const back = restoreMatch(saved, { roomId: "SV", humanPlayerId: "A" });
    assert.equal(back.ok, true);
    if (!back.ok) return;
    assert.equal(back.value.state.paused, false);
    assert.equal(finger(state), finger(back.value.state));
    for (let i = 0; i < 5; i++) step(state);
    for (let i = 0; i < 5; i++) step(back.value.state);
    assert.equal(finger(state), finger(back.value.state));
    assert.equal(back.value.state.scrapYield[scraped], 7);
  });

  it("gives the loaded fight to the commander who opened it", () => {
    const { state, room } = skirmish();
    const saved = exportSave(state, room, 1_700_000_000_000);
    const back = restoreMatch(saved, { roomId: "NEXT", humanPlayerId: "Zed" });
    assert.equal(back.ok, true);
    if (!back.ok) return;
    const restored = back.value.state;
    assert.equal(restored.roomId, "NEXT");
    assert.equal(restored.players.has("A"), false);
    assert.equal(restored.players.has("Zed"), true);
    assert.equal(restored.players.has("ai:1"), true);
    const rig = [...restored.entities.values()].find((e) => e.type === "rig" && e.ownerId === "Zed");
    assert.ok(rig);
    assert.equal([...restored.entities.values()].some((e) => e.ownerId === "A"), false);
    assert.equal([...restored.entities.values()].some((e) => e.ownerId === "ai:1"), true);
  });

  it("loads a save from before the CPU types: its Easy CPU plays on as Defensive", () => {
    const { state, room } = skirmish();
    const saved = exportSave(state, room, 1_700_000_000_000);
    const seat = saved.seats.find((s) => s.status === "ai")!;
    (seat as { ai?: string }).ai = "easy";
    (saved.players.find((p) => p.playerId === "ai:1")! as { ai?: string }).ai = "easy";
    const back = restoreMatch(saved, { roomId: "OLD", humanPlayerId: "A" });
    assert.equal(back.ok, true, !back.ok ? back.message : "");
    if (!back.ok) return;
    assert.equal(back.value.state.players.get("ai:1")?.ai, "defensive");
    const next = createRoom({ id: "OLD", hostId: "A", hostName: "Alpha", mapId: saved.mapId, maxSlots: 8, mode: "skirmish" });
    if (!next.ok) throw new Error(next.message);
    applySaveSeats(next.value, back.value.save, "A", "Alpha");
    assert.equal(next.value.slots[1]?.ai, "defensive");
  });

  it("loads a save from before the faction rename: Borg reads as Xenomorph, Earth United as Alliance", () => {
    const { state, room } = skirmish();
    const saved = exportSave(state, room, 1_700_000_000_000);
    const old = JSON.parse(JSON.stringify(saved).replace(/"xenodrone"/g, '"borgdrone"'));
    old.seats.find((s: { status: string }) => s.status === "ai").faction = "borg";
    old.seats.find((s: { status: string }) => s.status === "human").faction = "eu";
    old.players.find((p: { playerId: string }) => p.playerId === "ai:1").faction = "borg";
    old.players.find((p: { playerId: string }) => p.playerId === "A").faction = "eu";
    const rig = old.entities.find((e: { type: string; ownerId: string }) => e.type === "rig" && e.ownerId === "A");
    old.entities.push({ ...rig, id: old.nextId++, type: "borgdrone", kind: "unit" });
    const back = restoreMatch(old, { roomId: "OLD", humanPlayerId: "A" });
    assert.equal(back.ok, true, !back.ok ? back.message : "");
    if (!back.ok) return;
    assert.equal(back.value.state.players.get("ai:1")?.faction, "xeno");
    assert.equal(back.value.state.players.get("A")?.faction, "alliance");
    assert.ok([...back.value.state.entities.values()].some((e) => e.type === "xenodrone"));
    const next = createRoom({ id: "OLD", hostId: "A", hostName: "Alpha", mapId: saved.mapId, maxSlots: 8, mode: "skirmish" });
    if (!next.ok) throw new Error(next.message);
    applySaveSeats(next.value, back.value.save, "A", "Alpha");
    assert.equal(next.value.slots[1]?.faction, "xeno");
  });

  it("loads a save from before the Broodmother became the Assembler", () => {
    const { state, room } = skirmish();
    const saved = exportSave(state, room, 1_700_000_000_000);
    const old = JSON.parse(JSON.stringify(saved));
    const rig = old.entities.find((e: { type: string; ownerId: string }) => e.type === "rig" && e.ownerId === "A");
    const motherId = old.nextId++;
    old.entities.push({ ...rig, id: motherId, type: "broodmother", kind: "unit", broodNext: 99 });
    old.entities.push({ ...rig, id: old.nextId++, type: "thrall", kind: "unit", broodOf: motherId });
    const back = restoreMatch(old, { roomId: "OLD", humanPlayerId: "A" });
    assert.equal(back.ok, true, !back.ok ? back.message : "");
    if (!back.ok) return;
    const ents = [...back.value.state.entities.values()];
    assert.equal(ents.find((e) => e.id === motherId)?.type, "assembler");
    assert.ok(ents.some((e) => e.type === "thrall" && e.assembledBy === motherId));
  });

  it("holds the sim while paused and rejects orders", () => {
    const { state } = skirmish();
    const tick = state.tick;
    const rng = state.rngState;
    state.paused = true;
    stepMatch(state);
    assert.equal(state.tick, tick);
    assert.equal(state.rngState, rng);
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig");
    assert.ok(rig);
    const ordered = applyCommand(state, "A", { type: "cmd.stop", ids: [rig.id] });
    assert.equal(ordered.ok, false);
    if (ordered.ok) return;
    assert.equal(ordered.code, "paused");
    state.paused = false;
    stepMatch(state);
    assert.ok(state.tick > tick);
  });

  it("rejects a save that is not this version", () => {
    const { state, room } = skirmish();
    const saved = exportSave(state, room, 1);
    const bad = restoreMatch({ ...saved, v: 2 }, { roomId: "SV", humanPlayerId: "A" });
    assert.equal(bad.ok, false);
    const missing = restoreMatch(null, { roomId: "SV", humanPlayerId: "A" });
    assert.equal(missing.ok, false);
  });
});
