import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { START_SCRAP, catalog } from "../catalog.js";
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import { EASY_ARMY, EASY_HAULER_JAM_TICKS, tickAi } from "./ai.js";
import { hasCore, makeEntity } from "./geo.js";
import { createMatch, stepMatch } from "./match.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

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

function coreOf(state: MatchState, aiId: string): Entity {
  return [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
}

/** Stand the CPU's factories around its Core, spaced clear of one another. */
function withBase(state: MatchState, aiId: string, types: Entity["type"][]): void {
  const hq = coreOf(state, aiId);
  const spots: [number, number][] = [
    [-12, 0],
    [16, 0],
    [0, 16],
    [0, -14],
    [16, 16],
    [-12, 16],
  ];
  types.forEach((type, i) => {
    const [dx, dy] = spots[i]!;
    makeEntity(state, type, aiId, hq.x + dx * 8, hq.y + dy * 8, { tileX: hq.tileX + dx, tileY: hq.tileY + dy });
  });
}

function troopers(state: MatchState, aiId: string, n: number): void {
  const hq = coreOf(state, aiId);
  for (let i = 0; i < n; i++) makeEntity(state, "rifleman", aiId, hq.x + 16 + i * 8, hq.y);
}

/** One support / shell / defense pass, with no attack wave. */
function micro(state: MatchState, aiId: string): void {
  const cpu = state.players.get(aiId)!;
  cpu.aiNextMicroTick = 0;
  cpu.aiNextAttackTick = Number.MAX_SAFE_INTEGER;
  tickAi(state);
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

  it("leaves a Mauler that is holding at base idle", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    const hauler = makeEntity(state, "hauler", aiId, hq.x + 24, hq.y);
    hauler.autoHarvest = false;
    hauler.returnToBase = true;
    hauler.holdPosition = true;
    hauler.order = null;
    hauler.state = "idle";
    tickAi(state);
    assert.equal(hauler.autoHarvest, false);
    assert.equal(hauler.holdPosition, true);
  });

  it("attack-moves troops at the enemy HQ now and then", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      const t = makeEntity(state, "rifleman", aiId, hq.x + 16 + i * 8, hq.y);
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
      ids.push(makeEntity(state, "rifleman", aiId, hq.x + 16 + i * 8, hq.y).id);
    }
    for (let i = 0; i < 2; i++) {
      ids.push(makeEntity(state, "warden", aiId, hq.x + 16 + i * 8, hq.y + 24).id);
    }
    const cpu = state.players.get(aiId)!;
    cpu.aiNextAttackTick = 0;
    tickAi(state);
    const kinds = ids.map((id) => state.entities.get(id)).filter((e) => e?.order?.kind === "attackmove");
    assert.ok(kinds.some((e) => e?.type === "rifleman"), "wave needs troopers");
    assert.ok(kinds.some((e) => e?.type === "warden"), "wave needs tanks");
  });

  it("trains StuGs when an Armory is standing", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    makeEntity(state, "dynamo", aiId, hq.x - 64, hq.y, { tileX: hq.tileX - 12, tileY: hq.tileY });
    makeEntity(state, "muster", aiId, hq.x + 64, hq.y, { tileX: hq.tileX + 16, tileY: hq.tileY });
    makeEntity(state, "armory", aiId, hq.x, hq.y + 64, { tileX: hq.tileX, tileY: hq.tileY + 16 });
    for (let i = 0; i < 4; i++) {
      makeEntity(state, "rifleman", aiId, hq.x + 16 + i * 8, hq.y);
    }
    const cpu = state.players.get(aiId)!;
    cpu.scrap = 1000;
    tickAi(state);
    const queued = [...state.entities.values()].some(
      (e) => e.ownerId === aiId && e.type === "armory" && e.queue.some((j) => j.type === "ss3"),
    );
    assert.equal(queued, true, "CPU did not queue a StuG");
  });

  it("starts a Research Facility after the Armory so it can train Tigers", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    makeEntity(state, "dynamo", aiId, hq.x - 64, hq.y, { tileX: hq.tileX - 12, tileY: hq.tileY });
    makeEntity(state, "dynamo", aiId, hq.x - 64, hq.y + 64, { tileX: hq.tileX - 12, tileY: hq.tileY + 8 });
    makeEntity(state, "smelter", aiId, hq.x, hq.y - 64, { tileX: hq.tileX, tileY: hq.tileY - 16 });
    makeEntity(state, "muster", aiId, hq.x + 64, hq.y, { tileX: hq.tileX + 16, tileY: hq.tileY });
    makeEntity(state, "armory", aiId, hq.x, hq.y + 64, { tileX: hq.tileX, tileY: hq.tileY + 16 });
    for (let i = 0; i < 4; i++) {
      makeEntity(state, "rifleman", aiId, hq.x + 16 + i * 8, hq.y);
    }
    cpu.scrap = 5000;
    tickAi(state);
    const job = state.players.get(aiId)!.structure;
    assert.equal(job?.type, "research");
  });

  it("trains Troopers from the opening scrap pile", () => {
    const { state, aiId } = humanVsEasy();
    let trained = false;
    for (let i = 0; i < 800; i++) {
      stepMatch(state);
      if ([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "rifleman" && e.hp > 0)) {
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

  it("lists every army row under the factory that trains it", () => {
    for (const [factory, rows] of Object.entries(EASY_ARMY)) {
      for (const row of rows) assert.equal(producerType(row.unit), factory, row.unit);
    }
  });

  it("builds the Airfield once the factories and Research stand", () => {
    // The west seat's yard has room for the strip; the NE corner of yard-64 does not.
    const { state } = humanVsEasy();
    const aiId = "A";
    state.players.get(aiId)!.ai = "easy";
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "dynamo"]);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 5000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "airfield");
  });

  it("builds a Dynamo before a CIWS that would overdraw power", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "airfield"]);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 5000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "dynamo");
  });

  it("refunds a finished building that has no room, then builds past it", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "dynamo"]);
    troopers(state, aiId, 8);
    const cpu = state.players.get(aiId)!;
    const cost = catalog("airfield").cost;
    cpu.structure = { type: "airfield", progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: cost };
    cpu.scrap = 0;
    const blocked = state.blocked.slice();
    state.blocked.fill(1);
    tickAi(state);
    assert.equal(cpu.structure, null);
    assert.equal(cpu.scrap, cost);
    assert.ok((cpu.aiNoRoomUntil?.airfield ?? 0) > state.tick);
    state.blocked.set(blocked);
    cpu.scrap = 5000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "ciws");
  });

  it("keeps the Armory busy with unlocked hulls before Research stands", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "muster", "armory"]);
    troopers(state, aiId, 8);
    const hq = coreOf(state, aiId);
    for (let i = 0; i < 3; i++) makeEntity(state, "ss3", aiId, hq.x + 40 + i * 24, hq.y + 40);
    state.players.get(aiId)!.scrap = 5000;
    tickAi(state);
    const armory = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "armory")!;
    const types = armory.queue.map((j) => j.type);
    assert.ok(types.length > 0, "armory stalled on a locked rank");
    assert.ok(types.every((t) => t === "walker" || t === "supply"), `armory queue ${types.join(",")}`);
  });

  it("crews its Bunker with idle soldiers, gunners first", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["bunker"]);
    const bunker = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "bunker")!;
    const hq = coreOf(state, aiId);
    const gunner = makeEntity(state, "gunner", aiId, hq.x + 40, hq.y + 40);
    troopers(state, aiId, 6);
    micro(state, aiId);
    const inbound = [...state.entities.values()].filter(
      (e) => e.ownerId === aiId && (e.order?.kind === "garrison" || e.garrisonedIn === bunker.id),
    );
    assert.equal(inbound.length, catalog("bunker").garrisonCap);
    assert.ok(inbound.includes(gunner), "the MG goes in first");
  });

  it("crews its Watch Tower with idle soldiers, up to its three", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["tower"]);
    const tower = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "tower")!;
    troopers(state, aiId, 6);
    micro(state, aiId);
    const inbound = [...state.entities.values()].filter(
      (e) => e.ownerId === aiId && (e.order?.kind === "garrison" || e.garrisonedIn === tower.id),
    );
    assert.equal(inbound.length, catalog("tower").garrisonCap);
  });

  it("fills the Armory with a mix of hulls", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "muster", "armory"]);
    troopers(state, aiId, 8);
    state.players.get(aiId)!.scrap = 5000;
    tickAi(state);
    tickAi(state);
    const armory = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "armory")!;
    const types = new Set(armory.queue.map((j) => j.type));
    assert.ok(types.size >= 2, `armory queue ${[...types].join(",")}`);
  });

  it("trains Muster specialists once the first rifle wave stands", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "muster"]);
    troopers(state, aiId, 4);
    state.players.get(aiId)!.scrap = 5000;
    tickAi(state);
    const muster = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "muster")!;
    assert.ok(
      muster.queue.some((j) => j.type !== "rifleman"),
      `muster queue ${muster.queue.map((j) => j.type).join(",")}`,
    );
  });

  it("sends parked Stukas and a medic escort with the wave", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    troopers(state, aiId, 4);
    const medic = makeEntity(state, "medic", aiId, hq.x + 16, hq.y + 16);
    const plane = makeEntity(state, "stuka", aiId, hq.x - 40, hq.y);
    const cpu = state.players.get(aiId)!;
    cpu.aiNextAttackTick = 0;
    cpu.aiNextMicroTick = Number.MAX_SAFE_INTEGER;
    tickAi(state);
    assert.equal(plane.order?.kind, "attackmove");
    assert.equal(medic.order?.kind, "guard");
    assert.equal(state.entities.get(medic.order!.targetId!)?.type, "rifleman");
  });

  it("loads HE against infantry and AP against armor", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const tiger = makeEntity(state, "warden", aiId, hq.x + 40, hq.y);
    const soldier = makeEntity(state, "rifleman", "A", hq.x + 120, hq.y);
    tiger.attackTarget = soldier.id;
    micro(state, aiId);
    assert.equal(tiger.shell, "he");
    const tank = makeEntity(state, "warden", "A", hq.x + 120, hq.y + 24);
    tiger.attackTarget = tank.id;
    micro(state, aiId);
    assert.equal(tiger.shell, "ap");
  });

  it("runs the Walker on both arms", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const walker = makeEntity(state, "walker", aiId, hq.x + 40, hq.y);
    micro(state, aiId);
    assert.equal(walker.gatlingGuns, 2);
  });

  it("sets a halted Nebelwerfer to fire at its target", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const neb = makeEntity(state, "nebelwerfer", aiId, hq.x + 40, hq.y);
    const foe = makeEntity(state, "rifleman", "A", hq.x + 40 + 12 * 32, hq.y);
    neb.order = { kind: "attackmove", x: foe.x, y: foe.y };
    neb.state = "attack";
    neb.attackTarget = foe.id;
    neb.waypoints = [{ x: foe.x, y: foe.y }];
    micro(state, aiId);
    assert.equal(neb.order?.kind, "attack");
    assert.equal(neb.order?.targetId, foe.id);
  });

  it("sends an idle engineer to repair a damaged building", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo"]);
    const dynamo = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "dynamo")!;
    dynamo.hp = Math.floor(dynamo.hpMax / 2);
    const hq = coreOf(state, aiId);
    const eng = makeEntity(state, "engineer", aiId, hq.x + 24, hq.y + 24);
    micro(state, aiId);
    assert.equal(eng.order?.kind, "repair");
    assert.equal(eng.order?.targetId, dynamo.id);
  });

  it("sends a supply truck to a hull short of shells", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const truck = makeEntity(state, "supply", aiId, hq.x + 24, hq.y + 24);
    const tiger = makeEntity(state, "warden", aiId, hq.x + 60, hq.y + 24);
    tiger.ammo = { ap: 0, he: 0 };
    micro(state, aiId);
    assert.equal(truck.order?.kind, "supply");
    assert.equal(truck.order?.targetId, tiger.id);
  });

  it("launches a strike drone once the op walks out with the army", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const fighter = makeEntity(state, "rifleman", aiId, hq.x + 40, hq.y);
    const op = makeEntity(state, "droneop", aiId, hq.x + 48, hq.y);
    op.order = { kind: "guard", targetId: fighter.id };
    micro(state, aiId);
    assert.equal(op.droneLink?.mode, "strike");
    assert.notEqual(op.droneLink?.droneId, null);
  });

  it("turns a wave with nothing to shoot on the enemy buildings", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const inward = Math.sign((state.width * state.tileSize) / 2 - hq.x) || 1;
    const x = hq.x + inward * 240;
    const shed = makeEntity(state, "dynamo", "A", x, hq.y + 120, {
      tileX: Math.floor(x / state.tileSize),
      tileY: hq.tileY + 12,
    });
    const rifle = makeEntity(state, "rifleman", aiId, x, hq.y + 40);
    const tiger = makeEntity(state, "warden", aiId, x + 24, hq.y + 40);
    const walker = makeEntity(state, "walker", aiId, x - 24, hq.y + 40);
    for (const e of [rifle, tiger, walker]) e.order = { kind: "attackmove", x: shed.x, y: shed.y };
    stepMatch(state);
    for (const e of [rifle, tiger, walker]) {
      e.order = { kind: "attackmove", x: shed.x, y: shed.y };
      e.attackTarget = null;
    }
    micro(state, aiId);
    assert.equal(rifle.order?.kind, "attack");
    assert.equal(rifle.order?.targetId, shed.id);
    assert.equal(tiger.order?.targetId, shed.id);
    assert.equal(walker.order?.kind, "attackmove", "gatlings cannot bring a building down");
    tiger.attackTarget = shed.id;
    micro(state, aiId);
    assert.equal(tiger.shell, "he");
  });

  it("backs a jammed Mauler off, then sends it back to the haul", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const hauler = makeEntity(state, "hauler", aiId, hq.x - 60, hq.y + 60);
    hauler.cargo = 400;
    hauler.state = "unload";
    hauler.autoHarvest = true;
    hauler.waypoints = [{ x: hq.x, y: hq.y + 60 }];
    const cpu = state.players.get(aiId)!;
    cpu.aiHaulerStill = { [hauler.id]: { x: hauler.x, y: hauler.y, since: state.tick - EASY_HAULER_JAM_TICKS } };
    micro(state, aiId);
    assert.equal(hauler.order?.kind, "move");
    hauler.order = null;
    hauler.autoHarvest = false;
    hauler.state = "idle";
    hauler.waypoints = [];
    tickAi(state);
    assert.equal(hauler.autoHarvest, true, "a loaded Mauler goes back to work");
  });

  it("moves an idle truck parked against a building out of the lane", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const truck = makeEntity(state, "supply", aiId, (hq.tileX + hq.tileW + 1) * state.tileSize, hq.y);
    micro(state, aiId);
    assert.equal(truck.order?.kind, "move");
    const cell = { x: Math.floor(truck.order!.x! / state.tileSize), y: Math.floor(truck.order!.y! / state.tileSize) };
    const gapX = Math.max(0, hq.tileX - cell.x, cell.x - (hq.tileX + hq.tileW - 1));
    const gapY = Math.max(0, hq.tileY - cell.y, cell.y - (hq.tileY + hq.tileH - 1));
    assert.ok(Math.max(gapX, gapY) >= 5, "staging spot clears the Core");
  });

  it("turns home troops on an enemy that walks into the base", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const inward = Math.sign((state.width * state.tileSize) / 2 - hq.x) || 1;
    const guard = makeEntity(state, "rifleman", aiId, hq.x + inward * 24, hq.y);
    const foe = makeEntity(state, "rifleman", "A", hq.x + inward * (24 + 20 * 8), hq.y);
    stepMatch(state);
    guard.order = null;
    micro(state, aiId);
    const order = state.entities.get(guard.id)!.order;
    assert.equal(order?.kind, "attackmove");
    assert.ok(Math.hypot(order!.x! - foe.x, order!.y! - foe.y) < 64, "defends toward the intruder");
  });
});
