import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  DRONE_BATTERY_SECONDS,
  DRONE_GUARD_ORBIT_PACE,
  DRONE_GUARD_ORBIT_TILES,
  DRONE_HIGH_ALT,
  DRONE_LEASH_TILES,
  DRONE_REBUILD_SECONDS,
  DRONE_STRIKE_ALT,
  DRONE_SURVEIL_ALT,
  MG42,
  GATLING,
  RIFLE,
  TICK_DT,
  TILE_SUBDIV,
  TRAIN_TYPES,
  catalog,
  type InfantryGun,
} from "../catalog.js";
import { applyCommand } from "./commands.js";
import { droneIsHigh, droneOf, projectileMeetsDrone, reachesDrone } from "./drone.js";
import { sightTilesForEntity } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "DRN1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n && !state.ended; i++) step(state, TICK_DT);
}

function until(state: MatchState, max: number, done: () => boolean): number {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    step(state, TICK_DT);
  }
  return -1;
}

/** A unit on a tile, on the open ground in the middle of the yard. */
function put(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

function launch(state: MatchState, op: Entity): Entity {
  const res = applyCommand(state, op.ownerId, { type: "cmd.drone", ids: [op.id], action: "launch" });
  assert.equal(res.ok, true, res.ok ? "" : res.message);
  const d = droneOf(state, op);
  assert.ok(d, "drone should be up");
  return d;
}

function fakeDrone(alt: number): Entity {
  return { drone: { opId: 0, mode: "surveil", battery: 10, recall: false }, air: { alt } } as unknown as Entity;
}

function round(over: Partial<Projectile>): Projectile {
  return {
    id: 1,
    ownerId: "B",
    team: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    damage: 10,
    penetration: 5,
    caliber: 7.92,
    life: 1,
    ignoreId: 0,
    fromId: 0,
    bounced: false,
    shell: null,
    ...over,
  };
}

describe("drone op catalog", () => {
  it("is trained at the Muster, is not in the opening army, and the drone itself is not trainable", () => {
    assert.ok(TRAIN_TYPES.includes("droneop"));
    assert.ok(!(TRAIN_TYPES as readonly string[]).includes("drone"));
    assert.equal(producerType("droneop"), "muster");
    assert.equal(catalog("droneop").name, "Drone Op");
    assert.equal(catalog("drone").drone, true);
  });

  it("marks only the MG42 and the gatlings as anti-air", () => {
    assert.equal(MG42.antiAir, true);
    assert.equal(GATLING.antiAir, true);
    assert.ok(!(RIFLE as InfantryGun).antiAir);
  });
});

describe("drone launch and flight", () => {
  it("launches one drone that climbs to Surveillance height; a second launch is refused", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 30, 30);
    const d = launch(state, op);
    assert.equal(d.drone?.opId, op.id);
    assert.equal(op.droneLink?.droneId, d.id);
    const again = applyCommand(state, "A", { type: "cmd.drone", ids: [op.id], action: "launch" });
    assert.equal(again.ok, false);
    ticks(state, 80);
    assert.equal(d.air?.alt, DRONE_SURVEIL_ALT);
    assert.ok(droneIsHigh(d));
  });

  it("switching to Search & Destroy brings it down low", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 30, 30);
    const d = launch(state, op);
    ticks(state, 80);
    applyCommand(state, "A", { type: "cmd.drone", ids: [d.id], action: "mode", mode: "strike" });
    ticks(state, 60);
    assert.equal(d.air?.alt, DRONE_STRIKE_ALT);
    assert.ok(!droneIsHigh(d));
    assert.equal(op.droneLink?.mode, "strike");
  });

  it("never flies past the operator's reach, and is dragged along when he walks off", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 10, 30);
    const d = launch(state, op);
    const leash = DRONE_LEASH_TILES * state.tileSize;
    applyCommand(state, "A", { type: "cmd.move", ids: [d.id], x: op.x + leash * 3, y: op.y });
    ticks(state, 300);
    const reach = Math.hypot(d.x - op.x, d.y - op.y);
    assert.ok(reach <= leash + 0.5, `drone at ${reach} past leash ${leash}`);
    assert.ok(reach > leash * 0.9, "it should reach the edge of the leash");
    // He walks the other way; the drone keeps within reach of him.
    op.x -= leash * 0.5;
    ticks(state, 1);
    assert.ok(Math.hypot(d.x - op.x, d.y - op.y) <= leash + 0.5);
  });

  it("turns back on a low battery and is stowed to recharge", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 30, 30);
    const d = launch(state, op);
    applyCommand(state, "A", { type: "cmd.move", ids: [d.id], x: op.x + state.tileSize * 30, y: op.y });
    ticks(state, 60);
    d.drone!.battery = 6;
    ticks(state, 1);
    assert.equal(d.drone?.recall, true);
    const n = until(state, 600, () => op.droneLink!.droneId == null);
    assert.ok(n >= 0, "drone should come home");
    assert.ok(!state.entities.has(d.id));
    assert.equal(op.droneLink?.rebuild, 0, "a stowed drone is not a lost one");
    const before = op.droneLink!.charge;
    ticks(state, 50);
    assert.ok(op.droneLink!.charge > before, "the stowed drone recharges");
  });

  it("a flat battery drops it; the operator builds a new one over the long rebuild", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 30, 30);
    const d = launch(state, op);
    ticks(state, 20);
    d.drone!.battery = 0.05;
    d.drone!.recall = true;
    ticks(state, 3);
    assert.ok(!state.entities.has(d.id), "it went down");
    assert.equal(op.droneLink?.droneId, null);
    assert.ok(op.droneLink!.rebuild > DRONE_REBUILD_SECONDS - 1);
    const early = applyCommand(state, "A", { type: "cmd.drone", ids: [op.id], action: "launch" });
    assert.equal(early.ok, false, "no drone while the new one is being built");
    ticks(state, Math.ceil(DRONE_REBUILD_SECONDS / TICK_DT) + 2);
    assert.equal(op.droneLink?.rebuild, 0);
    assert.equal(op.droneLink?.charge, DRONE_BATTERY_SECONDS);
    launch(state, op);
  });

  it("falls when its operator dies", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 30, 30);
    const d = launch(state, op);
    ticks(state, 10);
    op.hp = 0;
    ticks(state, 3);
    assert.ok(!state.entities.has(d.id));
  });

  it("sees farther at Surveillance height than at Search & Destroy height", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 30, 30);
    const d = launch(state, op);
    ticks(state, 80);
    const high = sightTilesForEntity(state, d);
    applyCommand(state, "A", { type: "cmd.drone", ids: [op.id], action: "mode", mode: "strike" });
    ticks(state, 60);
    const low = sightTilesForEntity(state, d);
    assert.ok(high > low, `surveil ${high} should beat strike ${low}`);
  });

  it("hides battery and operator from the enemy snapshot", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 30, 30);
    const d = launch(state, op);
    ticks(state, 5);
    const mine = snapshotFor(state, "A").entities.find((e) => e.id === d.id);
    assert.equal(mine?.drone?.opId, op.id);
    assert.ok((mine?.drone?.battery ?? 0) > 0);
    const opView = snapshotFor(state, "A").entities.find((e) => e.id === op.id);
    assert.equal(opView?.droneLink?.droneId, d.id);
    const theirs = snapshotFor(state, "B").entities.find((e) => e.id === d.id);
    if (theirs) {
      assert.equal(theirs.drone?.battery, undefined);
      assert.equal(theirs.drone?.opId, undefined);
    }
  });
});

describe("who can hit a drone", () => {
  it("high: only anti-air guns; low: bullets and rockets, never the tank gun or mortar", () => {
    const state = twoPlayerMatch();
    const rifle = put(state, "rifleman", "B", 5, 5);
    const gunner = put(state, "gunner", "B", 6, 5);
    const mortar = put(state, "mortarman", "B", 7, 5);
    const walker = put(state, "walker", "B", 8, 8);
    const tank = put(state, "warden", "B", 12, 12);
    const titan = put(state, "titan", "B", 18, 18);
    const high = fakeDrone(DRONE_SURVEIL_ALT);
    const low = fakeDrone(DRONE_STRIKE_ALT);
    assert.ok(DRONE_SURVEIL_ALT >= DRONE_HIGH_ALT && DRONE_STRIKE_ALT < DRONE_HIGH_ALT);
    assert.deepEqual(
      [rifle, gunner, mortar, walker, tank, titan].map((s) => reachesDrone(s, high)),
      [false, true, false, true, false, false],
    );
    assert.deepEqual(
      [rifle, gunner, mortar, walker, tank, titan].map((s) => reachesDrone(s, low)),
      [true, true, false, true, true, true],
    );
  });

  it("rounds: shells, mortar bombs, and bombs pass by; a high drone takes only anti-air rounds", () => {
    const high = fakeDrone(DRONE_SURVEIL_ALT);
    const low = fakeDrone(DRONE_STRIKE_ALT);
    assert.equal(projectileMeetsDrone(round({}), low), true);
    assert.equal(projectileMeetsDrone(round({ flight: "rocket", caliber: 80 }), low), true);
    assert.equal(projectileMeetsDrone(round({ shell: "ap", caliber: 75 }), low), false);
    assert.equal(projectileMeetsDrone(round({ flight: "mortar", caliber: 81 }), low), false);
    assert.equal(projectileMeetsDrone(round({ flight: "bomb", caliber: 250 }), low), false);
    assert.equal(projectileMeetsDrone(round({}), high), false);
    assert.equal(projectileMeetsDrone(round({ antiAir: true }), high), true);
  });

  it("a rifleman cannot touch a Surveillance drone overhead; a machine gunner brings it down", () => {
    const state = twoPlayerMatch();
    // The operator stays back past rifle and MG reach; the drone hangs over the enemy.
    const op = put(state, "droneop", "A", 10, 30);
    const d = launch(state, op);
    applyCommand(state, "A", { type: "cmd.move", ids: [d.id], x: tileCenter(50, state.tileSize), y: op.y });
    ticks(state, 150);
    const rifle = put(state, "rifleman", "B", 52, 30);
    ticks(state, 150);
    assert.equal(op.hp, catalog("droneop").hp, "the operator is out of reach");
    assert.equal(d.hp, catalog("drone").hp, "rifle fire should not reach it");
    assert.notEqual(rifle.attackTarget, d.id);
    put(state, "gunner", "B", 52, 31).stanceOrder = "crawl";
    const n = until(state, 1200, () => !state.entities.has(d.id));
    assert.ok(n >= 0, "the MG42 should shoot it down");
  });

  for (const shooter of ["rifleman", "titan"] as const) {
    it(`a ${shooter} brings down a low Search & Destroy drone it can reach`, () => {
      const state = twoPlayerMatch();
      const op = put(state, "droneop", "A", 10, 30);
      const d = launch(state, op);
      applyCommand(state, "A", { type: "cmd.drone", ids: [op.id], action: "mode", mode: "strike" });
      const leash = DRONE_LEASH_TILES * state.tileSize;
      applyCommand(state, "A", { type: "cmd.move", ids: [d.id], x: op.x + leash, y: op.y });
      ticks(state, 250);
      assert.ok(!droneIsHigh(d));
      // Beyond strike reach of the operator, inside the shooter's range of the drone.
      const gap = shooter === "rifleman" ? 16 : 30;
      put(state, shooter, "B", Math.round((op.x + leash) / state.tileSize) + gap, 30);
      const n = until(state, 1500, () => !state.entities.has(d.id));
      assert.ok(n >= 0, `${shooter} should shoot it down`);
      assert.equal(op.hp, catalog("droneop").hp);
    });
  }

  it("a tank lays only its coaxial on a low drone, never the main gun", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 10, 30);
    const d = launch(state, op);
    applyCommand(state, "A", { type: "cmd.drone", ids: [op.id], action: "mode", mode: "strike" });
    // Park the drone at the edge of reach; the tank sits beyond it, out of strike reach.
    const leash = DRONE_LEASH_TILES * state.tileSize;
    applyCommand(state, "A", { type: "cmd.move", ids: [d.id], x: op.x + leash, y: op.y });
    ticks(state, 250);
    const tank = put(state, "warden", "B", Math.round((op.x + leash) / state.tileSize) + 16, 30);
    let shells = 0;
    let bullets = 0;
    for (let i = 0; i < 200 && state.entities.has(d.id); i++) {
      step(state, TICK_DT);
      for (const p of state.projectiles) {
        if (p.fromId !== tank.id) continue;
        if (p.shell) shells++;
        else bullets++;
      }
    }
    assert.equal(shells, 0, "no shell at a drone");
    assert.ok(bullets > 0 || !state.entities.has(d.id), "the coaxial should open up");
  });
});

describe("search and destroy", () => {
  it("dives on an enemy soldier inside reach and bursts on him; the drone is spent", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 20, 30);
    const d = launch(state, op);
    applyCommand(state, "A", { type: "cmd.drone", ids: [op.id], action: "mode", mode: "strike" });
    const foe = put(state, "medic", "B", 30, 30);
    const n = until(state, 600, () => !state.entities.has(d.id));
    assert.ok(n >= 0, "drone should strike");
    ticks(state, 1);
    assert.ok(!state.entities.has(foe.id) || state.entities.get(foe.id)!.hp <= 0, "the soldier it struck is dead");
    assert.equal(op.droneLink?.droneId, null);
    assert.ok(op.droneLink!.rebuild > 0, "a spent drone must be rebuilt");
  });

  it("does not chase a target outside the operator's reach", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 10, 30);
    const d = launch(state, op);
    const far = put(state, "medic", "B", 10 + DRONE_LEASH_TILES + 20, 30);
    applyCommand(state, "A", { type: "cmd.attack", ids: [d.id], targetId: far.id });
    ticks(state, 50);
    assert.equal(d.order, null, "an attack beyond reach is dropped");
    assert.equal(far.hp, catalog("medic").hp);
  });
});

describe("drone guard", () => {
  /** Guard a tile, fly out, and settle on the ring. Returns the ring centre. */
  function guardAt(state: MatchState, d: Entity, tx: number, ty: number): { x: number; y: number } {
    const ts = state.tileSize;
    const c = { x: tileCenter(tx, ts), y: tileCenter(ty, ts) };
    const res = applyCommand(state, "A", { type: "cmd.guard", ids: [d.id], x: c.x, y: c.y, facing: 0 });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 300);
    return c;
  }

  /** Path length and radius spread over `n` ticks on the ring. */
  function lap(state: MatchState, d: Entity, c: { x: number; y: number }, n: number) {
    let path = 0;
    let rMin = Infinity;
    let rMax = 0;
    for (let i = 0; i < n; i++) {
      const x = d.x;
      const y = d.y;
      step(state, TICK_DT);
      path += Math.hypot(d.x - x, d.y - y);
      const r = Math.hypot(d.x - c.x, d.y - c.y);
      rMin = Math.min(rMin, r);
      rMax = Math.max(rMax, r);
    }
    return { path, rMin, rMax };
  }

  it("circles its post in Surveillance: wide, slow, and shown as guarding", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 20, 30);
    const d = launch(state, op);
    const c = guardAt(state, d, 26, 30);
    const r = DRONE_GUARD_ORBIT_TILES.surveil * state.tileSize;
    const n = 60;
    const run = lap(state, d, c, n);
    assert.ok(run.rMin > r * 0.8 && run.rMax < r * 1.2, `holds the ring (${run.rMin.toFixed(1)}..${run.rMax.toFixed(1)} vs ${r})`);
    const top = catalog("drone").moveTilesPerSec * state.tileSize * TICK_DT * n;
    assert.ok(run.path > 0, "keeps moving");
    assert.ok(run.path <= top * DRONE_GUARD_ORBIT_PACE.surveil + 0.5, "circles at the slow guard pace");
    assert.equal(d.air!.alt, DRONE_SURVEIL_ALT);
    const snap = snapshotFor(state, "A");
    assert.equal(snap.entities.find((e) => e.id === d.id)?.guardFacing, 0);
  });

  it("circles tighter and faster in Search & Destroy than in Surveillance", () => {
    assert.ok(DRONE_GUARD_ORBIT_TILES.strike < DRONE_GUARD_ORBIT_TILES.surveil);
    assert.ok(DRONE_GUARD_ORBIT_PACE.strike > DRONE_GUARD_ORBIT_PACE.surveil);
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 20, 30);
    const d = launch(state, op);
    applyCommand(state, "A", { type: "cmd.drone", ids: [op.id], action: "mode", mode: "strike" });
    const c = guardAt(state, d, 26, 30);
    const r = DRONE_GUARD_ORBIT_TILES.strike * state.tileSize;
    const run = lap(state, d, c, 60);
    assert.ok(run.rMin > r * 0.8 && run.rMax < r * 1.2, `holds the tight ring (${run.rMin.toFixed(1)}..${run.rMax.toFixed(1)} vs ${r})`);
  });

  it("in Search & Destroy dives on the first enemy it sees from its post", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 20, 30);
    const d = launch(state, op);
    applyCommand(state, "A", { type: "cmd.drone", ids: [op.id], action: "mode", mode: "strike" });
    guardAt(state, d, 26, 30);
    assert.equal(d.order, null, "nothing to strike yet: it circles");
    const foe = put(state, "medic", "B", 29, 30);
    const n = until(state, 600, () => !state.entities.has(d.id));
    assert.ok(n >= 0, "drone should strike");
    ticks(state, 1);
    assert.ok(!state.entities.has(foe.id) || state.entities.get(foe.id)!.hp <= 0, "the soldier it saw is dead");
  });

  it("in Surveillance only watches the enemy it sees", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 20, 30);
    const d = launch(state, op);
    guardAt(state, d, 26, 30);
    const foe = put(state, "medic", "B", 29, 30);
    ticks(state, 120);
    assert.ok(state.entities.has(d.id));
    assert.equal(foe.hp, catalog("medic").hp);
    assert.ok(d.drone!.guard, "still on guard");
  });

  it("circles over a friendly unit it was told to guard", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 20, 30);
    const d = launch(state, op);
    const buddy = put(state, "rifleman", "A", 24, 30);
    applyCommand(state, "A", { type: "cmd.guard", ids: [d.id], targetId: buddy.id });
    ticks(state, 300);
    const r = Math.hypot(d.x - buddy.x, d.y - buddy.y);
    assert.ok(r < DRONE_GUARD_ORBIT_TILES.surveil * state.tileSize * 1.2, "stays over the unit");
  });

  it("a move order or stop ends the guard", () => {
    const state = twoPlayerMatch();
    const op = put(state, "droneop", "A", 20, 30);
    const d = launch(state, op);
    guardAt(state, d, 26, 30);
    const ts = state.tileSize;
    applyCommand(state, "A", { type: "cmd.move", ids: [d.id], x: tileCenter(22, ts), y: tileCenter(32, ts) });
    assert.equal(d.drone!.guard, null);
    assert.equal(d.guardFacing, null);
    guardAt(state, d, 26, 30);
    applyCommand(state, "A", { type: "cmd.stop", ids: [d.id] });
    assert.equal(d.drone!.guard, null);
  });

  it("the Drone Op walks at 80% of his old t(2) pace", () => {
    assert.equal(catalog("droneop").moveTilesPerSec, 2 * TILE_SUBDIV * 0.8);
  });
});
