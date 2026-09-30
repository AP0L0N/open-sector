import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AIR_CRUISE_ALT,
  APOCALYPSE_CIWS_BELT,
  APOCALYPSE_CIWS_RANGE_TILES,
  CIWS_INTERCEPT_ROUNDS,
  TECH_REQUIRES,
  TICK_DT,
  TITAN_ROCKET,
  TRAIN_TYPES,
  catalog,
  hasMg,
  hasTurret,
  mainGunBarrels,
  roofCiwsOf,
  supplyShortOf,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, playerTeam } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "APO1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  // Flat, open ground in the middle of the map: nothing blocks sight or shots.
  for (let y = 90; y <= 170; y++) {
    for (let x = 90; x <= 170; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
  return state;
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

function apocalypse(state: MatchState, owner = "A"): Entity {
  const ts = state.tileSize;
  const e = makeEntity(state, "apocalypse", owner, 120.5 * ts, 120.5 * ts);
  e.holdPosition = true;
  return e;
}

/** A spot `frac` of the roof mount's reach east of the tank. */
function inReach(state: MatchState, e: Entity, frac: number): { x: number; y: number } {
  return { x: e.x + APOCALYPSE_CIWS_RANGE_TILES * state.tileSize * frac, y: e.y };
}

function planeOver(state: MatchState, owner: string, x: number, y: number): Entity {
  const plane = makeEntity(state, "stuka", owner, x, y);
  plane.air!.phase = "fly";
  plane.air!.alt = AIR_CRUISE_ALT;
  plane.air!.speed = 1;
  plane.order = { kind: "move", x, y };
  return plane;
}

function rocket(state: MatchState, ownerId: string, x: number, y: number): Projectile {
  const p: Projectile = {
    id: state.nextId++,
    ownerId,
    team: playerTeam(state, ownerId),
    x,
    y,
    vx: 400,
    vy: 0,
    damage: TITAN_ROCKET.damage,
    penetration: TITAN_ROCKET.penetration,
    caliber: TITAN_ROCKET.caliber,
    life: 0.5,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
    flight: "rocket",
    landX: x + 200,
    landY: y,
    flightTime: 0.5,
    z: 40,
    vz: 0,
  };
  state.projectiles.push(p);
  return p;
}

function rackLeft(e: Entity): number {
  return Object.values(e.ammo).reduce((n, v) => n + (v ?? 0), 0);
}

describe("Apocalypse catalog", () => {
  it("is a research-gated Armory tank, heavier than the Tiger, with twin guns and a roof mount", () => {
    const def = catalog("apocalypse");
    const tiger = catalog("warden");
    assert.ok(TRAIN_TYPES.includes("apocalypse"));
    assert.equal(producerType("apocalypse"), "armory");
    assert.equal(TECH_REQUIRES.apocalypse, "research");
    assert.equal(def.name, "Apocalypse");
    assert.equal(hasTurret("apocalypse"), true);
    assert.equal(mainGunBarrels("apocalypse"), 2);
    assert.equal(mainGunBarrels("warden"), 1);
    assert.equal(roofCiwsOf("apocalypse"), true);
    assert.equal(roofCiwsOf("warden"), false);
    assert.ok(def.hp > tiger.hp && def.cost > tiger.cost);
    assert.ok(def.armorFront > tiger.armorFront && def.armorSide > tiger.armorSide && def.armorRear > tiger.armorRear);
    assert.ok(def.moveTilesPerSec < tiger.moveTilesPerSec, "slower hull");
    assert.ok(def.penetration > tiger.armorFront, "AP goes through a Tiger's front");
    assert.ok(def.leavesWreck && def.tracked);
    // The roof mount's belt rides in the coaxial slot, so the truck refills it.
    assert.equal(hasMg("apocalypse"), true);
    assert.equal(def.mgAmmo, APOCALYPSE_CIWS_BELT);
    assert.equal(supplyShortOf("apocalypse", { ...def.ammo }, APOCALYPSE_CIWS_BELT, 0), false);
    assert.equal(supplyShortOf("apocalypse", { ...def.ammo }, APOCALYPSE_CIWS_BELT - 1, 0), true);
  });
});

describe("Apocalypse main guns", () => {
  it("fires both barrels together: two shells a volley, one reload", () => {
    const state = match();
    const ts = state.tileSize;
    const tank = apocalypse(state);
    const full = rackLeft(tank);
    const tiger = makeEntity(state, "warden", "B", tank.x + 10 * ts, tank.y);
    tiger.holdPosition = true;
    tiger.ammo = {};
    const t = until(state, 200, () => rackLeft(tank) < full);
    assert.ok(t >= 0, "the guns fire");
    assert.equal(rackLeft(tank), full - 2, "two shells leave together");
    assert.equal(tank.ammo.ap, (catalog("apocalypse").ammo?.ap ?? 0) - 2);
    assert.ok(tank.cooldown > catalog("apocalypse").cooldown - 0.5, "one reload for the pair");
  });

  it("fires the last shell of a kind alone", () => {
    const state = match();
    const ts = state.tileSize;
    const tank = apocalypse(state);
    tank.ammo = { ap: 1 };
    const tiger = makeEntity(state, "warden", "B", tank.x + 10 * ts, tank.y);
    tiger.holdPosition = true;
    tiger.ammo = {};
    const t = until(state, 200, () => (tank.ammo.ap ?? 0) === 0);
    assert.ok(t >= 0);
    assert.equal(tank.ammo.ap, 0, "never goes below zero");
  });

  it("lays one smoke round, not two", () => {
    const state = match();
    const ts = state.tileSize;
    const tank = apocalypse(state);
    tank.turretFacing = 0;
    const smoke = tank.ammo.smoke ?? 0;
    assert.equal(applyCommand(state, "A", { type: "cmd.ammo", ids: [tank.id], shell: "smoke" }).ok, true);
    assert.equal(
      applyCommand(state, "A", { type: "cmd.forceattack", ids: [tank.id], x: tank.x + 10 * ts, y: tank.y }).ok,
      true,
    );
    const t = until(state, 100, () => (tank.ammo.smoke ?? 0) < smoke);
    assert.ok(t >= 0, "the smoke round goes");
    assert.equal(tank.ammo.smoke, smoke - 1);
  });
});

describe("Apocalypse roof CIWS", () => {
  it("picks its own soldier while the main guns stay on an ordered tank", () => {
    const state = match();
    const ts = state.tileSize;
    const tank = apocalypse(state);
    const tiger = makeEntity(state, "warden", "B", tank.x, tank.y + 12 * ts);
    tiger.holdPosition = true;
    tiger.ammo = {};
    tiger.mgAmmo = 0;
    const at = inReach(state, tank, 0.5);
    const soldier = makeEntity(state, "rifleman", "B", at.x, at.y);
    soldier.holdPosition = true;
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [tank.id], targetId: tiger.id }).ok, true);
    step(state, TICK_DT);
    assert.equal(tank.ciwsTarget, soldier.id, "the mount lays on the soldier");
    const t = until(state, 80, () => soldier.hp <= 0 || !state.entities.has(soldier.id));
    assert.ok(t >= 0, "the soldier goes down");
    assert.ok(tank.mgAmmo < APOCALYPSE_CIWS_BELT, `belt ${tank.mgAmmo}`);
    assert.equal(tank.attackTarget ?? (tank.order?.kind === "attack" ? tank.order.targetId : null), tiger.id);
    assert.ok(Math.abs((tank.ciwsFacing ?? 99) - Math.PI / 2) > 0.5, "the mount turned apart from the turret");
  });

  it("takes a plane in the air before a nearer soldier", () => {
    const state = match();
    const tank = apocalypse(state);
    const near = inReach(state, tank, 0.2);
    const soldier = makeEntity(state, "rifleman", "B", near.x, near.y);
    soldier.holdPosition = true;
    const plane = planeOver(state, "B", tank.x, tank.y - APOCALYPSE_CIWS_RANGE_TILES * state.tileSize * 0.6);
    step(state, TICK_DT);
    assert.equal(tank.ciwsTarget, plane.id);
    const t = until(state, 80, () => !state.entities.has(plane.id) || plane.hp < plane.hpMax);
    assert.ok(t >= 0, "rounds reach the plane");
  });

  it("spares the belt on a tank front plate, and takes its thin rear", () => {
    const state = match();
    const tank = apocalypse(state);
    tank.ammo = {};
    const at = inReach(state, tank, 0.5);
    const tiger = makeEntity(state, "warden", "B", at.x, at.y);
    tiger.holdPosition = true;
    tiger.ammo = {};
    tiger.mgAmmo = 0;
    // Front plate toward the mount. Its thin rear is a different story (the next check).
    tiger.facing = Math.PI;
    tiger.turretFacing = Math.PI;
    ticks(state, 20);
    assert.equal(tank.ciwsTarget, null);
    assert.equal(tank.mgAmmo, APOCALYPSE_CIWS_BELT);
    // Turned away, its 16mm rear is within reach of the 20mm.
    tiger.facing = 0;
    step(state, TICK_DT);
    assert.equal(tank.ciwsTarget, tiger.id);
  });

  it("bursts a hostile rocket in reach and spends an intercept burst", () => {
    const state = match();
    const tank = apocalypse(state);
    const at = inReach(state, tank, 0.4);
    const p = rocket(state, "B", at.x, at.y);
    step(state, TICK_DT);
    assert.ok(p.ciwsTried?.includes(tank.id), "the mount tried it");
    assert.equal(tank.mgAmmo, APOCALYPSE_CIWS_BELT - CIWS_INTERCEPT_ROUNDS);
    assert.ok(Math.abs(tank.ciwsFacing ?? 99) < 0.2, "laid east onto the rocket");
  });

  it("holds fire on an empty belt", () => {
    const state = match();
    const tank = apocalypse(state);
    tank.mgAmmo = 0;
    const at = inReach(state, tank, 0.4);
    const soldier = makeEntity(state, "rifleman", "B", at.x, at.y);
    soldier.holdPosition = true;
    tank.ammo = {};
    ticks(state, 20);
    assert.equal(tank.ciwsTarget, null);
    assert.equal(soldier.hp, soldier.hpMax);
  });

  it("shows its facing to both sides, and a flash while it fires", () => {
    const state = match();
    const tank = apocalypse(state);
    const at = inReach(state, tank, 0.4);
    const soldier = makeEntity(state, "rifleman", "B", at.x, at.y);
    soldier.holdPosition = true;
    until(state, 40, () => tank.ciwsFireTick != null);
    const mine = snapshotFor(state, "A").entities.find((v) => v.id === tank.id);
    assert.ok(mine?.ciws);
    assert.equal(mine.ciws.fire, true);
    assert.equal(mine.ciws.facing, tank.ciwsFacing);
    const theirs = snapshotFor(state, "B").entities.find((v) => v.id === tank.id);
    if (theirs) assert.ok(theirs.ciws, "an enemy who sees the tank sees the mount");
    const tiger = snapshotFor(state, "A").entities.find((v) => v.type === "warden");
    assert.equal(tiger?.ciws, undefined);
  });
});
