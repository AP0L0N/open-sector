import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { START_SCRAP } from "../catalog.js";
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import { tickAi } from "./ai.js";
import { hasCore, makeEntity } from "./geo.js";
import { createMatch, stepMatch } from "./match.js";
import type { MatchState } from "./types.js";

function humanVsEasy(): { state: MatchState; aiId: string } {
  const made = createRoom({
    id: "AI1",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!made.ok) throw new Error(made.message);
  const room = made.value;
  const add = hostSlot(room, "A", 1, { status: "ai" });
  if (!add.ok) throw new Error(add.message);
  updateSelf(room, "A", { ready: true });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), aiId: "ai:1" };
}

function waitCore(state: MatchState, playerId: string, n = 40): void {
  for (let i = 0; i < n; i++) {
    if (hasCore(state, playerId)) return;
    stepMatch(state);
  }
  assert.equal(hasCore(state, playerId), true, `no core for ${playerId}`);
}

describe("easy CPU", () => {
  it("spawns a Rig for the CPU seat", () => {
    const { state, aiId } = humanVsEasy();
    const cpu = state.players.get(aiId);
    assert.ok(cpu);
    assert.equal(cpu!.ai, "easy");
    assert.ok([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "rig"));
    assert.equal(state.initialHumans, 2);
  });

  it("starts a Dynamo after the Core unpacks", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    let dynamo = false;
    for (let i = 0; i < 8; i++) {
      stepMatch(state);
      const p = state.players.get(aiId);
      if (p?.structure?.type === "dynamo") dynamo = true;
      if ([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "dynamo")) dynamo = true;
    }
    assert.equal(dynamo, true);
  });

  it("sends idle Maulers to harvest", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    const hauler = makeEntity(state, "hauler", aiId, hq.x + 24, hq.y);
    hauler.autoHarvest = false;
    hauler.order = null;
    hauler.state = "idle";
    tickAi(state);
    assert.equal(hauler.autoHarvest, true);
  });

  it("attack-moves troops at the enemy HQ now and then", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      const t = makeEntity(state, "trooper", aiId, hq.x + 16 + i * 8, hq.y);
      ids.push(t.id);
    }
    const cpu = state.players.get(aiId)!;
    cpu.aiNextAttackTick = 0;
    tickAi(state);
    const moving = ids.filter((id) => {
      const e = state.entities.get(id);
      return e?.order?.kind === "attackmove";
    });
    assert.ok(moving.length >= 6, `waves ${moving.length}`);
  });

  it("sends Wardens with the attack wave", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(makeEntity(state, "trooper", aiId, hq.x + 16 + i * 8, hq.y).id);
    }
    for (let i = 0; i < 2; i++) {
      ids.push(makeEntity(state, "warden", aiId, hq.x + 16 + i * 8, hq.y + 24).id);
    }
    const cpu = state.players.get(aiId)!;
    cpu.aiNextAttackTick = 0;
    tickAi(state);
    const kinds = ids.map((id) => state.entities.get(id)).filter((e) => e?.order?.kind === "attackmove");
    assert.ok(kinds.some((e) => e?.type === "trooper"), "wave needs troopers");
    assert.ok(kinds.some((e) => e?.type === "warden"), "wave needs tanks");
  });

  it("trains Wardens when an Armory is standing", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    makeEntity(state, "dynamo", aiId, hq.x - 64, hq.y, { tileX: hq.tileX - 12, tileY: hq.tileY });
    makeEntity(state, "muster", aiId, hq.x + 64, hq.y, { tileX: hq.tileX + 16, tileY: hq.tileY });
    makeEntity(state, "armory", aiId, hq.x, hq.y + 64, { tileX: hq.tileX, tileY: hq.tileY + 16 });
    for (let i = 0; i < 4; i++) {
      makeEntity(state, "trooper", aiId, hq.x + 16 + i * 8, hq.y);
    }
    const cpu = state.players.get(aiId)!;
    cpu.scrap = 1000;
    tickAi(state);
    const queued = [...state.entities.values()].some(
      (e) => e.ownerId === aiId && e.type === "armory" && e.queue.some((j) => j.type === "warden"),
    );
    assert.equal(queued, true, "CPU did not queue a Warden");
  });

  it("trains Troopers from the opening scrap pile", () => {
    const { state, aiId } = humanVsEasy();
    let trained = false;
    for (let i = 0; i < 800; i++) {
      stepMatch(state);
      if ([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "trooper" && e.hp > 0)) {
        trained = true;
        break;
      }
    }
    assert.equal(trained, true, "CPU never trained a Trooper");
  });

  it("CPU has its own scrap pile", () => {
    const { state, aiId } = humanVsEasy();
    assert.equal(state.players.get("A")!.scrap, START_SCRAP);
    assert.equal(state.players.get(aiId)!.scrap, START_SCRAP);
  });
});
