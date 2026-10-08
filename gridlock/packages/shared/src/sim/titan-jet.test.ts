import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TICK_DT, TITAN_JET_FLIGHT, TITAN_NUKE, catalog, jetFlightOf, nukesOnDeath } from "../catalog.js";
import { isAirborne, isCrashing } from "./air.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { nukeFalloff } from "./nuke.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "TJ1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
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

function put(state: MatchState, type: Parameters<typeof makeEntity>[1], owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

function jet(state: MatchState, e: Entity, action: "up" | "land") {
  return applyCommand(state, e.ownerId, { type: "cmd.jet", ids: [e.id], action });
}

/** Up and at flying height, with fuel to stay there for the test. */
function airborneTitan(state: MatchState, tx: number, ty: number): Entity {
  const t = put(state, "titan", "A", tx, ty);
  const res = jet(state, t, "up");
  assert.equal(res.ok, true, res.ok ? "" : res.message);
  ticks(state, Math.ceil(TITAN_JET_FLIGHT.alt / TITAN_JET_FLIGHT.climbPerSec / TICK_DT) + 2);
  t.jet!.fuel = 1000;
  return t;
}

/** Watch every projectile the sim launches during `n` ticks. */
function launchedDuring(state: MatchState, n: number): Projectile[] {
  const seen: Projectile[] = [];
  for (let i = 0; i < n; i++) {
    const list = state.projectiles;
    list.push = (...ps: Projectile[]) => {
      seen.push(...ps);
      return Array.prototype.push.apply(list, ps);
    };
    step(state, TICK_DT);
  }
  return seen;
}

describe("Titan leg jets", () => {
  it("costs 8000 and carries a short jet flight that crashes when shot down", () => {
    assert.equal(catalog("titan").cost, 8000);
    const f = jetFlightOf("titan");
    assert.ok(f && f.crashes);
    assert.ok(f!.fuelSeconds < jetFlightOf("jumpjet")!.fuelSeconds, "a hop, shorter than a Jump Jet's flight");
    assert.equal(nukesOnDeath("titan"), true);
    assert.equal(nukesOnDeath("jagdtiger"), false);
  });

  it("lifts off, burns its short fuel, and sets down by itself", () => {
    const state = twoPlayerMatch();
    const t = put(state, "titan", "A", 30, 30);
    assert.equal(t.jet?.fuel, TITAN_JET_FLIGHT.fuelSeconds);
    assert.equal(jet(state, t, "up").ok, true);
    ticks(state, Math.ceil(2 / TICK_DT));
    assert.equal(t.jet!.alt, TITAN_JET_FLIGHT.alt);
    assert.ok(isAirborne(t));
    const n = until(state, Math.ceil(20 / TICK_DT), () => t.jet!.alt === 0);
    assert.ok(n >= 0, "it comes down on its own");
    assert.ok(t.jet!.fuel <= TITAN_JET_FLIGHT.landReserve + 0.01);
    assert.equal(jet(state, t, "up").ok, false, "the burners must recover first");
  });

  it("cannot take off with the outriggers down, nor brace in the air", () => {
    const state = twoPlayerMatch();
    const t = put(state, "titan", "A", 30, 30);
    t.braced = true;
    assert.equal(jet(state, t, "up").ok, false);
    t.braced = false;
    const up = airborneTitan(state, 34, 30);
    const res = applyCommand(state, "A", { type: "cmd.deploy", id: up.id });
    assert.equal(res.ok, false);
    assert.equal(up.state === "deploy", false);
  });

  it("aloft the main gun is stowed and only the pods fire", () => {
    const state = twoPlayerMatch();
    const t = airborneTitan(state, 30, 30);
    put(state, "warden", "B", 40, 30);
    const shots = launchedDuring(state, Math.ceil(6 / TICK_DT)).filter((p) => p.fromId === t.id);
    assert.ok(shots.length > 0, "the pods should fire");
    assert.ok(shots.every((p) => p.flight === "rocket"), "nothing but rockets from the air");
  });

  it("aloft a tank and a rifleman cannot reach it; anti-air rockets can", () => {
    const state = twoPlayerMatch();
    const t = airborneTitan(state, 30, 30);
    t.rocketsOff = true;
    const tank = put(state, "warden", "B", 40, 30);
    const rifle = put(state, "rifleman", "B", 38, 32);
    ticks(state, Math.ceil(4 / TICK_DT));
    assert.equal(t.hp, catalog("titan").hp, "no ground gun reaches it");
    assert.notEqual(tank.attackTarget, t.id);
    assert.notEqual(rifle.attackTarget, t.id);
    // Another Titan's pods are anti-air rockets.
    put(state, "titan", "B", 48, 30);
    const n = until(state, Math.ceil(15 / TICK_DT), () => t.hp < catalog("titan").hp);
    assert.ok(n >= 0, "the pods should hit it");
  });

  it("landed, the main gun works again", () => {
    const state = twoPlayerMatch();
    const t = airborneTitan(state, 30, 30);
    t.rocketsOff = true;
    assert.equal(jet(state, t, "land").ok, true);
    until(state, Math.ceil(5 / TICK_DT), () => t.jet!.alt === 0);
    put(state, "warden", "B", 44, 30);
    const shots = launchedDuring(state, Math.ceil(12 / TICK_DT)).filter((p) => p.fromId === t.id);
    assert.ok(shots.some((p) => p.flight !== "rocket"), "the gun fires on the ground");
  });
});

describe("Titan reactor", () => {
  it("falls off to the edge share and stops past the radius", () => {
    assert.equal(nukeFalloff(0, 6, 18), 1);
    assert.equal(nukeFalloff(6, 6, 18), 1);
    assert.ok(Math.abs(nukeFalloff(18, 6, 18) - TITAN_NUKE.edgeShare) < 1e-9);
    assert.equal(nukeFalloff(18.1, 6, 18), 0);
  });

  it("destroyed on the ground, it goes up and wrecks everything close, friend or foe", () => {
    const state = twoPlayerMatch();
    const t = put(state, "titan", "A", 30, 30);
    const close = put(state, "rifleman", "B", 33, 30);
    const own = put(state, "rifleman", "A", 30, 33);
    const tank = put(state, "warden", "B", 38, 30);
    const far = put(state, "rifleman", "B", 30, 30 + TITAN_NUKE.radiusTiles + 6);
    const tankHp = tank.hp;
    t.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.entities.has(t.id), false, "nothing is left of the walker");
    const nuke = state.impacts.find((i) => i.nuke);
    assert.ok(nuke, "the clients get a nuke impact");
    assert.equal(nuke!.x, t.x);
    assert.ok(close.hp <= 0 || !state.entities.has(close.id), "a soldier at ground zero is gone");
    assert.ok(own.hp <= 0 || !state.entities.has(own.id), "its own side is not spared");
    assert.ok(tank.hp < tankHp * 0.4 || tank.wreck, "a hull close by is all but destroyed");
    assert.equal(far.hp, catalog("rifleman").hp, "past the edge nobody is touched");
  });

  it("shot down in the air, it falls straight down untouchable and goes up on the ground", () => {
    const state = twoPlayerMatch();
    const t = airborneTitan(state, 30, 30);
    const x = t.x;
    const y = t.y;
    t.waypoints = [{ x: x + 200, y }];
    const victim = put(state, "rifleman", "B", 33, 30);
    t.hp = 0;
    step(state, TICK_DT);
    assert.ok(state.entities.has(t.id), "not dead yet: falling");
    assert.ok(isCrashing(t));
    assert.equal(t.hp, 1);
    assert.ok(state.impacts.every((i) => !i.nuke), "no blast in the air");
    const enemy = snapshotFor(state, "B").entities.find((e) => e.id === t.id);
    assert.equal(enemy?.jet?.crash, true, "everyone sees it falling");
    let blast = false;
    const n = until(state, Math.ceil(4 / TICK_DT), () => {
      if (state.impacts.some((i) => i.nuke)) blast = true;
      return blast;
    });
    assert.ok(n > 0, "it takes a moment to fall");
    assert.equal(t.x, x, "straight down");
    assert.equal(t.y, y);
    assert.equal(t.jet!.alt, 0, "the blast is on the ground");
    assert.ok(victim.hp <= 0 || !state.entities.has(victim.id));
  });
});
