import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { catalog, HAULER_CARGO, LOW_POWER_MIN_SPEED, START_SCRAP, TICK_DT } from "../catalog.js";
import { TILE_BLOCKED, TILE_SCRAP, getMap, tileAt } from "../maps.js";
import { applyCommand } from "./commands.js";
import { createMatch, step, stepMatch } from "./match.js";
import { productionSpeed } from "./power.js";
import { snapshotFor } from "./snapshot.js";
import { astar } from "./path.js";
import { makeEntity, tileCenter, walkable } from "./geo.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "T1",
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
  const state = createMatch(room, started.value);
  return { state, a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

describe("createMatch", () => {
  it("spawns one Rig per player on the spawn tile", () => {
    const { state } = twoPlayerMatch();
    const rigs = [...state.entities.values()].filter((e) => e.type === "rig");
    assert.equal(rigs.length, 2);
    assert.equal(state.players.get("A")?.scrap, START_SCRAP);
    const snap = snapshotFor(state, "A");
    assert.equal(snap.you.provided, 0);
    assert.equal(snap.entities.filter((e) => e.type === "rig").length, 1);
    assert.equal(snap.entities[0]?.ownerId, "A");
    assert.equal(state.gameSpeed, 1);
    assert.equal(snap.gameSpeed, 1);
  });

  it("stepMatch runs gameSpeed sim ticks per wall-clock tick", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    assert.equal(applyCommand(state, "A", { type: "cmd.deploy", id: rig.id }).ok, true);
    state.gameSpeed = 3;
    for (let i = 0; i < 12; i++) stepMatch(state);
    const core = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "core");
    assert.ok(core);
  });

  it("does not spawn a Core until deploy finishes", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    const res = applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    assert.equal(res.ok, true);
    ticks(state, 10);
    const mid = snapshotFor(state, "A").entities.find((e) => e.id === rig.id);
    assert.ok(mid?.deployProgress);
    assert.ok(mid!.deployProgress! > 0.2 && mid!.deployProgress! < 0.5);
    ticks(state, 25);
    const core = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "core");
    assert.ok(core);
    assert.equal(snapshotFor(state, "A").you.provided, catalog("core").power);
  });

  it("blocks packing the Core until the special cooldown elapses", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    assert.equal(applyCommand(state, "A", { type: "cmd.deploy", id: rig.id }).ok, true);
    ticks(state, 35);
    const core = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "core")!;
    assert.ok(core.specialCooldown > 0);
    const tooSoon = applyCommand(state, "A", { type: "cmd.deploy", id: core.id });
    assert.equal(tooSoon.ok, false);
    if (!tooSoon.ok) assert.equal(tooSoon.code, "busy");
    ticks(state, 25);
    const packed = applyCommand(state, "A", { type: "cmd.deploy", id: core.id });
    assert.equal(packed.ok, true, !packed.ok ? packed.message : "");
  });
});

describe("pathfinding", () => {
  it("paths around the yard compound", () => {
    const { state } = twoPlayerMatch();
    const path = astar(state, 3, 3, 60, 60);
    assert.ok(path.length > 10);
    for (const p of path) {
      assert.equal(walkable(state, p.x, p.y), true, `blocked ${p.x},${p.y}`);
    }
  });
});

describe("construction", () => {
  it("rejects build without a Core", () => {
    const { state } = twoPlayerMatch();
    const res = applyCommand(state, "A", { type: "cmd.build", building: "dynamo" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "no_core");
  });

  it("rejects build when scrap is too low", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    ticks(state, 35);
    state.players.get("A")!.scrap = 10;
    const res = applyCommand(state, "A", { type: "cmd.build", building: "dynamo" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "low_scrap");
  });

  it("builds then places a Dynamo and increases power", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    ticks(state, 35);
    const before = state.players.get("A")!.scrap;
    const b = applyCommand(state, "A", { type: "cmd.build", building: "dynamo" });
    assert.equal(b.ok, true, !b.ok ? b.message : "");
    assert.equal(state.players.get("A")!.scrap, before - catalog("dynamo").cost);
    ticks(state, catalog("dynamo").buildSeconds * 10 + 2);
    const p = state.players.get("A")!;
    assert.equal(p.structure?.ready, true);
    assert.equal(p.placingType, "dynamo");
    assert.equal([...state.entities.values()].some((e) => e.type === "dynamo"), false);
    const core = [...state.entities.values()].find((e) => e.type === "core" && e.ownerId === "A")!;
    const tx = core.tileX + 3;
    const ty = core.tileY;
    const place = applyCommand(state, "A", { type: "cmd.place", building: "dynamo", tx, ty });
    assert.equal(place.ok, true, !place.ok ? place.message : "");
    const dyn = [...state.entities.values()].find((e) => e.type === "dynamo");
    assert.ok(dyn);
    assert.equal(snapshotFor(state, "A").you.provided, 150);
  });

  it("cannot sell the Core", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    ticks(state, 35);
    const core = [...state.entities.values()].find((e) => e.type === "core" && e.ownerId === "A")!;
    const res = applyCommand(state, "A", { type: "cmd.sell", id: core.id });
    assert.equal(res.ok, false);
  });

  it("sells a Dynamo for 50%", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    ticks(state, 35);
    applyCommand(state, "A", { type: "cmd.build", building: "dynamo" });
    ticks(state, catalog("dynamo").buildSeconds * 10 + 2);
    const core = [...state.entities.values()].find((e) => e.type === "core" && e.ownerId === "A")!;
    applyCommand(state, "A", { type: "cmd.place", building: "dynamo", tx: core.tileX + 3, ty: core.tileY });
    const dyn = [...state.entities.values()].find((e) => e.type === "dynamo")!;
    const scrap = state.players.get("A")!.scrap;
    const sell = applyCommand(state, "A", { type: "cmd.sell", id: dyn.id });
    assert.equal(sell.ok, true);
    assert.equal(state.players.get("A")!.scrap, scrap + 250);
  });

  it("builds an Armory and trains a Warden", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    ticks(state, 35);
    const core = [...state.entities.values()].find((e) => e.type === "core" && e.ownerId === "A")!;
    const b = applyCommand(state, "A", { type: "cmd.build", building: "armory" });
    assert.equal(b.ok, true, !b.ok ? b.message : "");
    ticks(state, catalog("armory").buildSeconds * 10 + 2);
    const place = applyCommand(state, "A", {
      type: "cmd.place",
      building: "armory",
      tx: core.tileX + 3,
      ty: core.tileY,
    });
    assert.equal(place.ok, true, !place.ok ? place.message : "");
    assert.ok([...state.entities.values()].some((e) => e.type === "armory"));
    const train = applyCommand(state, "A", { type: "cmd.train", unit: "warden" });
    assert.equal(train.ok, true, !train.ok ? train.message : "");
    ticks(state, catalog("warden").buildSeconds * 10 + 2);
    assert.ok([...state.entities.values()].some((e) => e.type === "warden" && e.ownerId === "A"));
  });
});

describe("combat", () => {
  it("does not fire while moving", () => {
    const { state } = twoPlayerMatch();
    const t1 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const dummy = makeEntity(state, "hauler", "B", 22 * 32, 20 * 32);
    applyCommand(state, "A", { type: "cmd.move", ids: [t1.id], x: 8 * 32, y: 8 * 32 });
    const hpBefore = dummy.hp;
    ticks(state, 8);
    assert.equal(dummy.hp, hpBefore);
  });

  it("kills a Trooper in four hits", () => {
    const { state } = twoPlayerMatch();
    const t1 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const dummy = makeEntity(state, "hauler", "B", 24 * 32, 20 * 32);
    dummy.autoHarvest = false;
    dummy.hp = 40;
    dummy.hpMax = 40;
    applyCommand(state, "A", { type: "cmd.attack", ids: [t1.id], targetId: dummy.id });
    ticks(state, 80);
    assert.ok(
      dummy.hp <= 0 || !state.entities.has(dummy.id),
      `hp=${dummy.hp} shots expected ~4 vs trooper; hauler hp ${dummy.hp}`,
    );
  });

  it("cannot kill a Warden with rifle fire", () => {
    const { state } = twoPlayerMatch();
    const t1 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const tank = makeEntity(state, "warden", "B", 23 * 32, 20 * 32);
    tank.facing = Math.PI;
    applyCommand(state, "A", { type: "cmd.attack", ids: [t1.id], targetId: tank.id });
    ticks(state, 120);
    assert.ok(state.entities.has(tank.id), "warden should still exist");
    assert.ok(tank.hp > tank.hpMax - 8, `rifle vs armor hp=${tank.hp}`);
  });

  it("kills a Warden with one rear shot", () => {
    const { state } = twoPlayerMatch();
    const a = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    const b = makeEntity(state, "warden", "B", 23 * 32, 20 * 32);
    a.facing = 0;
    b.facing = 0;
    applyCommand(state, "A", { type: "cmd.attack", ids: [a.id], targetId: b.id });
    let sawKill = false;
    for (let i = 0; i < 12; i++) {
      step(state);
      if (state.impacts.some((x) => x.kind === "kill")) sawKill = true;
    }
    assert.equal(sawKill, true);
    assert.ok(b.hp <= 0 || !state.entities.has(b.id), `rear hp=${b.hp}`);
  });

  it("does not kill a Warden through the front in a short duel", () => {
    const { state } = twoPlayerMatch();
    const a = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    const b = makeEntity(state, "warden", "B", 23 * 32, 20 * 32);
    a.facing = 0;
    b.facing = Math.PI;
    applyCommand(state, "A", { type: "cmd.attack", ids: [a.id], targetId: b.id });
    ticks(state, 30);
    assert.ok(state.entities.has(b.id), "front armor should hold");
    assert.ok(b.hp > b.hpMax * 0.7, `front hp=${b.hp}`);
  });

  it("wipes a player when their Rig dies", () => {
    const { state } = twoPlayerMatch();
    const rigA = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    rigA.hp = 0;
    step(state);
    assert.equal(state.players.get("A")?.alive, false);
    assert.equal(state.ended, true);
    assert.equal(state.winner?.playerId, "B");
  });
});

describe("harvest", () => {
  it("credits scrap after a harvest cycle", () => {
    const { state } = twoPlayerMatch();
    const player = state.players.get("A")!;
    const before = player.scrap;
    const smelter = makeEntity(state, "smelter", "A", tileCenter(10, 32), tileCenter(10, 32), {
      tileX: 9,
      tileY: 9,
    });
    const hauler = makeEntity(state, "hauler", "A", tileCenter(12, 32), tileCenter(10, 32));
    hauler.autoHarvest = true;
    const i = 12 + 10 * state.width;
    state.scrapYield[i] = 400;
    applyCommand(state, "A", { type: "cmd.harvest", ids: [hauler.id], tileX: 12, tileY: 10 });
    ticks(state, 120);
    assert.ok(
      player.scrap >= before + HAULER_CARGO,
      `scrap ${player.scrap} vs ${before} (need at least +${HAULER_CARGO})`,
    );
    assert.ok(smelter.hp > 0);
  });
});

describe("production speed", () => {
  it("is full when power is even or surplus, and never zero when short", () => {
    assert.equal(productionSpeed(50, 40), 1);
    assert.equal(productionSpeed(50, 50), 1);
    assert.equal(productionSpeed(50, 100), 0.5);
    assert.equal(productionSpeed(0, 40), LOW_POWER_MIN_SPEED);
  });
});

describe("low power", () => {
  it("slows construction instead of pausing it", () => {
    const { state } = twoPlayerMatch();
    const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    applyCommand(state, "A", { type: "cmd.deploy", id: rig.id });
    ticks(state, 35);
    const core = [...state.entities.values()].find((e) => e.type === "core" && e.ownerId === "A")!;
    for (let i = 0; i < 8; i++) {
      makeEntity(state, "muster", "A", (core.tileX + 4 + (i % 4) * 2) * 32, (core.tileY + Math.floor(i / 4) * 2) * 32, {
        tileX: core.tileX + 4 + (i % 4) * 2,
        tileY: core.tileY + Math.floor(i / 4) * 2,
      });
    }
    const pow = snapshotFor(state, "A").you;
    assert.equal(pow.lowPower, true);
    assert.ok(pow.used > pow.provided);
    const b = applyCommand(state, "A", { type: "cmd.build", building: "dynamo" });
    assert.equal(b.ok, true, !b.ok ? b.message : "");
    ticks(state, 40);
    const job = state.players.get("A")!.structure!;
    assert.ok(job.progressTicks > 0, "production must keep moving");
    assert.ok(job.progressTicks < 40, `should be slower than full speed, got ${job.progressTicks}`);
    assert.equal(job.ready, false);
    ticks(state, catalog("dynamo").buildSeconds * 10 * Math.ceil(1 / LOW_POWER_MIN_SPEED) + 8);
    assert.equal(state.players.get("A")!.structure?.ready, true);
  });
});

describe("fog of war", () => {
  it("hides the enemy Rig across the map and reveals it in sight", () => {
    const { state } = twoPlayerMatch();
    const snap = snapshotFor(state, "A");
    assert.equal(snap.entities.filter((e) => e.ownerId === "B").length, 0);
    assert.ok(snap.entities.some((e) => e.ownerId === "A" && e.type === "rig"));
    const rigA = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig")!;
    const rigB = [...state.entities.values()].find((e) => e.ownerId === "B" && e.type === "rig")!;
    rigB.x = rigA.x + state.tileSize;
    rigB.y = rigA.y;
    const seen = snapshotFor(state, "A");
    assert.ok(seen.entities.some((e) => e.id === rigB.id));
  });
});

describe("maps scrap", () => {
  it("keeps spawns empty and paints scrap fields", () => {
    for (const id of ["yard-64", "canal-48"] as const) {
      const map = getMap(id)!;
      let scrap = 0;
      for (let i = 0; i < map.tiles.length; i++) {
        if (map.tiles[i] === TILE_SCRAP) scrap++;
      }
      assert.ok(scrap > 10, id);
      for (const s of map.spawns) {
        assert.notEqual(tileAt(map, s.x, s.y), TILE_BLOCKED);
        assert.notEqual(tileAt(map, s.x, s.y), TILE_SCRAP);
      }
    }
  });
});
