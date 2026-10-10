import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  ARK_CANNON_CELL,
  ARK_CANNON_CHARGE_SECONDS,
  ARK_CANNON_RELOAD,
  ARK_CANNON_RECHARGE_SECONDS,
  ARK_DOME,
  ARK_MIN_RANGE_TILES,
  ARK_PLASMA_BALL,
  ARK_RANGE_TILES,
  ARK_WASP_CALM_SECONDS,
  ARK_WASP_REGROW_SECONDS,
  BATTLESHIP_RANGE_TILES,
  TICK_DT,
  TILE_SUBDIV,
  TRAIN_TYPES,
  catalog,
  factionDamage,
  factionOf,
  isNavalType,
  leavesWreck,
  secondsToTicks,
  techNeeds,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, ownedUnits, tileCenter } from "./geo.js";
import { arkDome, podWasp } from "./hive-ark.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "ARK1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

function paint(state: MatchState, x0: number, y0: number, x1: number, y1: number, water: boolean): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = water ? TILE_WATER : TILE_EMPTY;
      state.blocked[i] = water ? 1 : 0;
      state.heights[i] = 0;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

/** Water from x0 to x0 + 60, a beach east of it; nothing else on the map. */
function bay(): { state: MatchState; x0: number; y0: number } {
  const state = twoPlayerMatch();
  for (const e of [...state.entities.values()]) if (e.kind === "unit") state.entities.delete(e.id);
  const x0 = 40;
  const y0 = 40;
  paint(state, x0 - 4, y0 - 20, x0 + 140, y0 + 40, false);
  paint(state, x0, y0 - 20, x0 + 60, y0 + 40, true);
  return { state, x0, y0 };
}

function spawn(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  return makeEntity(state, type, owner, tileCenter(tx, state.tileSize), tileCenter(ty, state.tileSize));
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

/** An Ark bow east at (x0 + 20, y0 + 10), cannons laid east, and a tough enemy bunker `dist` tiles east of it. */
function shoot(dist: number): { state: MatchState; ark: Entity; target: Entity } {
  const { state, x0, y0 } = bay();
  const ark = spawn(state, "hiveark", "A", x0 + 20, y0 + 10);
  ark.facing = 0;
  for (const c of ark.ark!.cannons) c.facing = 0;
  const target = spawn(state, "bunker", "B", x0 + 20 + dist, y0 + 10);
  target.hp = target.hpMax = 1_000_000;
  return { state, ark, target };
}

function balls(state: MatchState, arkId: number): Projectile[] {
  return state.projectiles.filter((p) => p.fromId === arkId && p.arkCannon != null);
}

describe("Hive Ark catalog", () => {
  it("is a Xenomorph hull grown at the Spawning Pool with a Neural Nexus, and leaves a hulk", () => {
    assert.ok(TRAIN_TYPES.includes("hiveark"));
    assert.equal(catalog("hiveark").name, "Hive Ark");
    assert.equal(factionOf("hiveark"), "xeno");
    assert.equal(isNavalType("hiveark"), true);
    assert.equal(producerType("hiveark"), "spawnpool");
    assert.deepEqual(techNeeds("hiveark"), ["nexus"]);
    assert.equal(leavesWreck("hiveark"), true);
  });

  it("reaches half its old 31 tiles, short of the Battle Ship, on a high arc", () => {
    assert.equal(ARK_RANGE_TILES, (31 * TILE_SUBDIV) / 2);
    assert.ok(ARK_RANGE_TILES < BATTLESHIP_RANGE_TILES);
    assert.ok(ARK_PLASMA_BALL.apexNear > 0);
    assert.ok(catalog("hiveark").hp >= catalog("battleship").hp * 0.75);
  });
});

describe("Hive Ark hull", () => {
  it("is round: it moves off in any direction at once and never turns", () => {
    for (const [dx, dy] of [[-24, 0], [0, -14], [-12, 12]] as const) {
      const { state, x0, y0 } = bay();
      const ark = spawn(state, "hiveark", "A", x0 + 36, y0 + 10);
      ark.facing = 0;
      const goal = { x: tileCenter(x0 + 36 + dx, state.tileSize), y: tileCenter(y0 + 10 + dy, state.tileSize) };
      assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [ark.id], ...goal }).ok, true);
      const start = { x: ark.x, y: ark.y };
      ticks(state, 1);
      assert.ok(Math.hypot(ark.x - start.x, ark.y - start.y) > 0, "no turn before it moves");
      for (let i = 0; i < 1200 && ark.waypoints.length > 0; i++) {
        ticks(state, 1);
        assert.equal(ark.facing, 0, "the hull never yaws");
      }
      assert.ok(Math.hypot(ark.x - goal.x, ark.y - goal.y) <= state.tileSize * 2, `reached ${dx},${dy}`);
    }
  });
});

describe("Hive Ark cannons", () => {
  it("each cannon lobs one plasma ball and spends a ball of its own cell", () => {
    const { state, ark, target } = shoot(60);
    applyCommand(state, "A", { type: "cmd.attack", ids: [ark.id], targetId: target.id });
    ticks(state, 5);
    assert.equal(balls(state, ark.id).length, 0, "it charges up before the first ball");
    const glow = snapshotFor(state, "A").entities.find((v) => v.id === ark.id)?.ark?.cannons.map((c) => c.charge ?? 0);
    assert.ok(glow && glow.every((k) => k > 0 && k < 1), "the charge shows on both cannons");
    ticks(state, secondsToTicks(ARK_CANNON_CHARGE_SECONDS));
    const shot = balls(state, ark.id);
    assert.deepEqual(shot.map((p) => p.arkCannon).sort(), [0, 1]);
    for (const p of shot) {
      assert.equal(p.flight, "mortar");
      assert.equal(p.damage, factionDamage("hiveark", ARK_PLASMA_BALL.damage));
    }
    for (const c of ark.ark!.cannons) {
      assert.ok(c.energy < ARK_CANNON_CELL && c.energy > ARK_CANNON_CELL - 1);
      assert.ok(c.cooldown > 0);
    }
  });

  it("a dry cannon falls silent until its cell is full, while the other keeps firing", () => {
    const { state, ark, target } = shoot(60);
    const dry = ark.ark!.cannons[1]!;
    dry.energy = 0.5;
    dry.drained = true;
    applyCommand(state, "A", { type: "cmd.attack", ids: [ark.id], targetId: target.id });
    ticks(state, secondsToTicks(20));
    assert.equal(dry.firedTick, undefined, "the drained cannon held fire");
    assert.notEqual(ark.ark!.cannons[0]!.firedTick, undefined);
    ticks(state, secondsToTicks(ARK_CANNON_RECHARGE_SECONDS * ARK_CANNON_CELL));
    assert.notEqual(dry.firedTick, undefined, "full again, it fires");
  });

  it("keeps the reload's pace under steady fire: the charge rides the end of it", () => {
    const { state, ark, target } = shoot(60);
    applyCommand(state, "A", { type: "cmd.attack", ids: [ark.id], targetId: target.id });
    const fore = ark.ark!.cannons[0]!;
    const fired: number[] = [];
    for (let i = 0; i < secondsToTicks(ARK_CANNON_RELOAD * 2 + ARK_CANNON_CHARGE_SECONDS + 1); i++) {
      const before = fore.firedTick;
      ticks(state, 1);
      if (fore.firedTick !== before) fired.push(fore.firedTick!);
    }
    assert.equal(fired.length, 3);
    // The reload counts down in float steps: a tick of slack.
    assert.ok(Math.abs(fired[2]! - fired[1]! - secondsToTicks(ARK_CANNON_RELOAD)) <= 1);
  });

  it("will not fire inside its minimum range", () => {
    const { state, ark, target } = shoot(ARK_MIN_RANGE_TILES - 4);
    applyCommand(state, "A", { type: "cmd.attack", ids: [ark.id], targetId: target.id });
    ticks(state, 40);
    assert.equal(balls(state, ark.id).length, 0);
  });
});

describe("Hive Ark dome", () => {
  it("rises over the hull and rides with it", () => {
    const { state, x0, y0 } = bay();
    const ark = spawn(state, "hiveark", "A", x0 + 20, y0 + 10);
    ticks(state, 1);
    const dome = arkDome(state, ark)!;
    assert.ok(dome);
    assert.equal(dome.hp, ARK_DOME.energy);
    assert.equal(dome.r, ARK_DOME.radiusTiles * state.tileSize);
    ark.x += 30;
    ticks(state, 1);
    assert.equal(dome.x, ark.x);
    const view = snapshotFor(state, "A").shields?.find((s) => s.id === dome.id);
    assert.equal(view?.dome, true);
  });

  it("stops an enemy shell falling on the Ark from overhead", () => {
    const { state, x0, y0 } = bay();
    const ark = spawn(state, "hiveark", "A", x0 + 20, y0 + 10);
    ticks(state, 1);
    const hp = ark.hp;
    const dome = arkDome(state, ark)!;
    const from = { x: ark.x + 400, y: ark.y };
    const flight = 2;
    state.projectiles.push({
      id: state.nextId++,
      ownerId: "B",
      team: 1,
      x: from.x,
      y: from.y,
      vx: (ark.x - from.x) / flight,
      vy: 0,
      damage: 150,
      penetration: 40,
      caliber: 105,
      big: true,
      life: flight,
      ignoreId: -1,
      fromId: -1,
      bounced: false,
      shell: null,
      flight: "mortar",
      landX: ark.x,
      landY: ark.y,
      apex: 100,
      flightTime: flight,
      z: 0,
    });
    ticks(state, secondsToTicks(flight) + 2);
    assert.equal(ark.hp, hp, "the hull took nothing");
    assert.ok(dome.hp < ARK_DOME.energy, "the dome took the shell");
  });

  it("broken, it rises again full after its recharge", () => {
    const { state, x0, y0 } = bay();
    const ark = spawn(state, "hiveark", "A", x0 + 20, y0 + 10);
    ticks(state, 1);
    arkDome(state, ark)!.hp = 0;
    ticks(state, 2);
    assert.equal(arkDome(state, ark), null);
    ticks(state, secondsToTicks(ARK_DOME.rechargeSeconds) + 2);
    assert.equal(arkDome(state, ark)?.hp, ARK_DOME.energy);
  });
});

describe("Hive Ark Wasps", () => {
  function contact(): { state: MatchState; ark: Entity; foe: Entity } {
    const { state, x0, y0 } = bay();
    const ark = spawn(state, "hiveark", "A", x0 + 20, y0 + 10);
    // Unarmed, so it never shoots a Wasp down by itself.
    const foe = spawn(state, "supplyboat", "B", x0 + 50, y0 + 10);
    foe.hp = foe.hpMax = 100_000;
    return { state, ark, foe };
  }

  it("sit on their pods while nothing is in sight", () => {
    const { state, x0, y0 } = bay();
    const ark = spawn(state, "hiveark", "A", x0 + 20, y0 + 10);
    ticks(state, 40);
    assert.deepEqual(ark.ark!.pods.map((p) => p.waspId), [null, null]);
    assert.deepEqual(snapshotFor(state, "A").entities.find((e) => e.id === ark.id)?.ark?.pods.map((p) => p.docked), [true, true]);
  });

  it("lift by themselves at an enemy in sight, take no orders, and do not count as units", () => {
    const { state, ark, foe } = contact();
    const before = ownedUnits(state, "A");
    ticks(state, 4);
    const wasps = [0, 1].map((i) => podWasp(state, ark, i));
    assert.ok(wasps.every((w) => w && w.type === "wasp" && w.arkOf === ark.id));
    assert.ok(wasps.every((w) => w!.order?.kind === "attack" && w!.order.targetId === foe.id));
    assert.equal(ownedUnits(state, "A"), before);
    applyCommand(state, "A", { type: "cmd.move", ids: wasps.map((w) => w!.id), x: 10, y: 10 });
    assert.equal(wasps[0]!.order?.kind, "attack", "the player cannot steer them");
  });

  it("come home and stow on their pods once nothing is left", () => {
    const { state, ark, foe } = contact();
    ticks(state, secondsToTicks(3));
    assert.ok(podWasp(state, ark, 0));
    state.entities.delete(foe.id);
    ticks(state, secondsToTicks(ARK_WASP_CALM_SECONDS + 15));
    assert.deepEqual(ark.ark!.pods.map((p) => p.waspId), [null, null]);
    assert.equal([...state.entities.values()].filter((e) => e.arkOf === ark.id).length, 0);
  });

  it("a Wasp shot down regrows on its pod", () => {
    const { state, ark } = contact();
    ticks(state, 4);
    podWasp(state, ark, 0)!.hp = 0;
    ticks(state, 2);
    assert.ok(ark.ark!.pods[0]!.regrow > 0);
    ticks(state, secondsToTicks(ARK_WASP_REGROW_SECONDS) + 4);
    assert.ok(podWasp(state, ark, 0), "regrown and up again at the enemy still in sight");
  });

  it("a Wasp downed over the deck does not hurt its own Ark", () => {
    const { state, ark } = contact();
    ticks(state, 4);
    podWasp(state, ark, 0)!.hp = 0;
    ticks(state, secondsToTicks(6));
    assert.equal(ark.hp, ark.hpMax);
    assert.equal(ark.wreck, false);
  });

  it("fall with the Ark", () => {
    const { state, ark } = contact();
    ticks(state, 4);
    const w = podWasp(state, ark, 0)!;
    ark.hp = 0;
    ticks(state, 2);
    assert.ok(w.hp <= 0 || w.air?.phase === "crash" || !state.entities.has(w.id));
  });
});
