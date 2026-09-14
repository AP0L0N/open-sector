import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AUTO_DEPLOY_SECONDS,
  catalog,
  GAME_SPEED_MAX,
  HAULER_CARGO,
  LOW_POWER_MIN_SPEED,
  TANK_MG,
  secondsToTicks,
  START_SCRAP,
  TICK_DT,
  TILE_SUBDIV,
} from "../catalog.js";
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
    assert.equal(state.gameSpeed, GAME_SPEED_MAX);
    assert.equal(snap.gameSpeed, GAME_SPEED_MAX);
  });

  it("auto-deploys each Rig into a Core after 0.5s wall-clock", () => {
    const { state } = twoPlayerMatch();
    const wait = secondsToTicks(AUTO_DEPLOY_SECONDS);
    for (let i = 0; i < wait - 1; i++) stepMatch(state);
    assert.equal([...state.entities.values()].filter((e) => e.type === "core").length, 0);
    stepMatch(state);
    const cores = [...state.entities.values()].filter((e) => e.type === "core");
    assert.equal(cores.length, 2);
    assert.equal([...state.entities.values()].some((e) => e.type === "rig"), false);
  });

  it("stepMatch runs gameSpeed sim ticks per wall-clock tick", () => {
    const { state } = twoPlayerMatch();
    state.gameSpeed = 3;
    const t0 = state.tick;
    stepMatch(state);
    assert.equal(state.tick, t0 + 3);
    state.gameSpeed = 5;
    stepMatch(state);
    assert.equal(state.tick, t0 + 8);
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
    const path = astar(state, 3 * TILE_SUBDIV, 3 * TILE_SUBDIV, 60 * TILE_SUBDIV, 60 * TILE_SUBDIV);
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
    const tx = core.tileX + core.tileW;
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
    applyCommand(state, "A", { type: "cmd.place", building: "dynamo", tx: core.tileX + core.tileW, ty: core.tileY });
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
      tx: core.tileX + core.tileW,
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

  it("attack-move stops to shoot then continues to the click", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const t1 = makeEntity(state, "trooper", "A", 24 * 32, 20 * 32);
    const dummy = makeEntity(state, "hauler", "B", 28 * 32, 20 * 32);
    dummy.autoHarvest = false;
    dummy.hp = 40;
    dummy.hpMax = 40;
    t1.facing = 0;
    const destX = 36 * 32;
    const destY = 20 * 32;
    const res = applyCommand(state, "A", { type: "cmd.attackmove", ids: [t1.id], x: destX, y: destY });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(t1.order?.kind, "attackmove");
    ticks(state, 80);
    assert.ok(dummy.hp < 40, `should have fired on the way hp=${dummy.hp}`);
    ticks(state, 80);
    assert.ok(t1.x > dummy.x - 8, `should resume past the fight x=${t1.x}`);
  });

  it("kills a Trooper in four hits", () => {
    const { state } = twoPlayerMatch();
    const t1 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const dummy = makeEntity(state, "hauler", "B", 24 * 32, 20 * 32);
    dummy.autoHarvest = false;
    dummy.holdPosition = true;
    dummy.hp = 40;
    dummy.hpMax = 40;
    applyCommand(state, "A", { type: "cmd.attack", ids: [t1.id], targetId: dummy.id });
    ticks(state, 80);
    assert.ok(
      dummy.hp <= 0 || !state.entities.has(dummy.id),
      `hp=${dummy.hp} shots expected ~4 vs trooper; hauler hp ${dummy.hp}`,
    );
  });

  it("soft-target kills are kinetic, not cook-off blasts", () => {
    const { state } = twoPlayerMatch();
    const t1 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const dummy = makeEntity(state, "hauler", "B", 24 * 32, 20 * 32);
    dummy.autoHarvest = false;
    dummy.hp = 12;
    dummy.hpMax = 40;
    applyCommand(state, "A", { type: "cmd.attack", ids: [t1.id], targetId: dummy.id });
    let sawKill = false;
    for (let i = 0; i < 40; i++) {
      step(state);
      for (const x of state.impacts) {
        if (x.kind !== "kill") continue;
        sawKill = true;
        assert.equal(x.blast, undefined);
        assert.ok((x.caliber ?? 0) < 40, `caliber=${x.caliber}`);
      }
    }
    assert.equal(sawKill, true);
  });

  it("rifle ricochets zip off armor and puff on landing", () => {
    const { state } = twoPlayerMatch();
    const t1 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const tank = makeEntity(state, "warden", "B", 23 * 32, 20 * 32);
    tank.facing = Math.PI;
    applyCommand(state, "A", { type: "cmd.attack", ids: [t1.id], targetId: tank.id });
    const muzzle = catalog("trooper").projectileSpeed;
    let bounceSp = 0;
    let sawPuff = false;
    const bounceAngs: number[] = [];
    for (let i = 0; i < 80; i++) {
      step(state);
      for (const p of state.projectiles) {
        if (!p.bounced) continue;
        bounceSp = Math.max(bounceSp, Math.hypot(p.vx, p.vy));
        bounceAngs.push(Math.atan2(p.vy, p.vx));
      }
      if (state.impacts.some((x) => x.kind === "puff")) sawPuff = true;
    }
    assert.ok(bounceSp > 400, `bounce speed ${bounceSp} vs muzzle ${muzzle}`);
    assert.ok(bounceSp < muzzle * 0.5, `spark must not keep full rifle speed ${muzzle}`);
    assert.equal(sawPuff, true);
    assert.ok(bounceAngs.length > 2, `bounces=${bounceAngs.length}`);
    const spread = Math.max(...bounceAngs) - Math.min(...bounceAngs);
    assert.ok(spread > 0.8, `ricochet dirs must fan out spread=${spread}`);
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
      if (state.impacts.some((x) => x.kind === "kill" && x.blast && (x.caliber ?? 0) >= 40)) sawKill = true;
    }
    assert.equal(sawKill, true);
    assert.ok(b.wreck || b.hp <= 0 || !state.entities.has(b.id), `rear hp=${b.hp} wreck=${b.wreck}`);
  });

  it("does not one-shot a Warden through the front", () => {
    const { state } = twoPlayerMatch();
    const a = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    const b = makeEntity(state, "warden", "B", 23 * 32, 20 * 32);
    a.facing = 0;
    b.facing = Math.PI;
    applyCommand(state, "A", { type: "cmd.attack", ids: [a.id], targetId: b.id });
    ticks(state, 8);
    assert.ok(state.entities.has(b.id), "front armor should hold the first volley");
    assert.ok(b.hp > 0, `front hp=${b.hp}`);
  });

  it("kills a Warden from the front in a few shots", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const a = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const b = makeEntity(state, "warden", "B", tileCenter(28, ts), tileCenter(24, ts));
    a.facing = 0;
    a.turretFacing = 0;
    b.facing = Math.PI;
    b.turretFacing = Math.PI;
    b.ammo = { ap: 0, he: 0, heat: 0, smoke: 0 };
    b.mgAmmo = 0;
    applyCommand(state, "A", { type: "cmd.attack", ids: [a.id], targetId: b.id });
    ticks(state, 220);
    assert.ok(b.wreck || b.hp <= 0 || !state.entities.has(b.id), `front hp=${b.hp} wreck=${b.wreck}`);
  });

  it("Warden turret aims without yawing the hull", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const dummy = makeEntity(state, "hauler", "B", tileCenter(24, ts), tileCenter(28, ts));
    dummy.autoHarvest = false;
    tank.facing = 0;
    tank.turretFacing = 0;
    const hull0 = tank.facing;
    applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: dummy.id });
    ticks(state, 10);
    assert.ok(Math.abs(tank.facing - hull0) < 0.12, `hull should stay put facing=${tank.facing}`);
    assert.ok(tank.turretFacing > 0.6, `turret should yaw south turretFacing=${tank.turretFacing}`);
  });

  it("Trooper snaps facing when they start to move", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const t1 = makeEntity(state, "trooper", "A", tileCenter(48, ts), tileCenter(16, ts));
    t1.facing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [t1.id], x: tileCenter(32, ts), y: tileCenter(16, ts) });
    step(state);
    const delta = Math.abs(Math.atan2(Math.sin(t1.facing - Math.PI), Math.cos(t1.facing - Math.PI)));
    assert.ok(delta < 0.2, `should already face west facing=${t1.facing}`);
  });

  it("Warden hull turns in place before it rolls", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    tank.facing = 0;
    const x0 = tank.x;
    const y0 = tank.y;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(24, ts), y: tileCenter(36, ts) });
    step(state);
    assert.ok(tank.facing > 0.05, `should yaw toward south, facing=${tank.facing}`);
    assert.equal(tank.x, x0);
    assert.equal(tank.y, y0);
    ticks(state, 8);
    assert.ok(Math.hypot(tank.x - x0, tank.y - y0) < 1, "must not translate while pivoting");
    ticks(state, 40);
    assert.ok(tank.y > y0 + 16, `should roll after the hull faces the waypoint y=${tank.y}`);
  });

  it("Warden turret follows the hull when the tank is not engaged", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(24, ts), y: tileCenter(36, ts) });
    step(state);
    assert.ok(tank.facing > 0.05, `hull=${tank.facing}`);
    assert.ok(tank.turretFacing > 0.05, `turret should follow the move, turretFacing=${tank.turretFacing}`);
    assert.ok(tank.turretFacing > tank.facing, "turret traverse is faster than the hull");
  });

  it("Warden turret stays on the target while the hull faces a move", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "A", tileCenter(24, ts), tileCenter(24, ts));
    const dummy = makeEntity(state, "hauler", "B", tileCenter(24, ts), tileCenter(28, ts));
    dummy.autoHarvest = false;
    tank.facing = 0;
    tank.turretFacing = 0;
    applyCommand(state, "A", {
      type: "cmd.attackmove",
      ids: [tank.id],
      x: tileCenter(36, ts),
      y: tileCenter(24, ts),
    });
    ticks(state, 12);
    assert.ok(Math.abs(tank.facing) < 0.45, `hull should stay east facing=${tank.facing}`);
    assert.ok(tank.turretFacing > 0.7, `turret should stay on the south target turretFacing=${tank.turretFacing}`);
  });

  it("Warden main gun only cycles once on a 75mm clock", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const a = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    const b = makeEntity(state, "warden", "B", 23 * 32, 20 * 32);
    a.facing = 0;
    a.turretFacing = 0;
    b.facing = Math.PI;
    applyCommand(state, "A", { type: "cmd.attack", ids: [a.id], targetId: b.id });
    ticks(state, 20);
    assert.equal(a.ammo.ap, 11, "one shell in two seconds");
    ticks(state, 40);
    assert.equal(a.ammo.ap, 11, "still reloading at 6s");
    ticks(state, 20);
    assert.equal(a.ammo.ap, 10, "second shell after the 6.5s wait");
  });

  it("uses the coaxial MG on troops and the 75mm on armor", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const tank = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    const inf = makeEntity(state, "trooper", "B", 23 * 32, 20 * 32);
    tank.facing = 0;
    tank.turretFacing = 0;
    inf.facing = Math.PI;
    applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: inf.id });
    ticks(state, 4);
    assert.ok(tank.mgAmmo <= TANK_MG.ammo - 3, `mgAmmo=${tank.mgAmmo}`);
    assert.equal(tank.ammo.ap, 12, "must not spend a 75mm on infantry");
    assert.ok(inf.hp < inf.hpMax || !state.entities.has(inf.id) || inf.hp <= 0);

    const { state: s2 } = twoPlayerMatch();
    s2.heights.fill(0);
    const gun = makeEntity(s2, "warden", "A", 20 * 32, 20 * 32);
    const armor = makeEntity(s2, "warden", "B", 23 * 32, 20 * 32);
    gun.facing = 0;
    gun.turretFacing = 0;
    armor.facing = Math.PI;
    applyCommand(s2, "A", { type: "cmd.attack", ids: [gun.id], targetId: armor.id });
    ticks(s2, 4);
    assert.equal(gun.mgAmmo, TANK_MG.ammo);
    assert.equal(gun.ammo.ap, 11);
  });

  it("overheats the MG after a dump and jams it until it cools", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const tank = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    const inf = makeEntity(state, "trooper", "B", 23 * 32, 20 * 32);
    inf.hp = 4000;
    inf.hpMax = 4000;
    tank.facing = 0;
    tank.turretFacing = 0;
    applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: inf.id });
    const shots = Math.ceil(TANK_MG.heatMax / TANK_MG.heatPerShot);
    ticks(state, shots);
    assert.ok(tank.mgOverheat > 0, `overheat=${tank.mgOverheat} heat=${tank.mgHeat} ammo=${tank.mgAmmo}`);
    const jammed = tank.mgAmmo;
    ticks(state, 5);
    assert.equal(tank.mgAmmo, jammed);
    assert.equal(tank.ammo.ap, 12, "overheat must not dump the cannon into infantry");
  });

  it("puts MG belt and heat on a friendly snapshot", () => {
    const { state } = twoPlayerMatch();
    const tank = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    tank.mgHeat = 0.4;
    const mine = snapshotFor(state, "A").entities.find((e) => e.id === tank.id);
    const theirs = snapshotFor(state, "B").entities.find((e) => e.id === tank.id);
    assert.equal(mine?.mgAmmo, TANK_MG.ammo);
    assert.equal(mine?.mgHeat, 0.4);
    assert.equal(theirs?.mgAmmo, undefined);
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
    const ts = state.tileSize;
    const sm = catalog("smelter");
    const smelter = makeEntity(state, "smelter", "A", tileCenter(8, ts), tileCenter(8, ts), {
      tileX: 8,
      tileY: 8,
    });
    const hx = 8 + sm.tileW + 2;
    const hy = 10;
    const hauler = makeEntity(state, "hauler", "A", tileCenter(hx, ts), tileCenter(hy, ts));
    hauler.autoHarvest = true;
    const i = hx + hy * state.width;
    state.scrapYield[i] = 400;
    applyCommand(state, "A", { type: "cmd.harvest", ids: [hauler.id], tileX: hx, tileY: hy });
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
    const m = catalog("muster");
    const ts = state.tileSize;
    for (let i = 0; i < 8; i++) {
      const tileX = core.tileX + core.tileW + (i % 4) * m.tileW;
      const tileY = core.tileY + Math.floor(i / 4) * m.tileH;
      makeEntity(state, "muster", "A", tileX * ts, tileY * ts, { tileX, tileY });
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
