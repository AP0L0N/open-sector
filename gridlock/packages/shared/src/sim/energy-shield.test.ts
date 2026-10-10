import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TICK_DT, catalog, energyShieldOf, isCivilianType, secondsToTicks } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickProjectiles } from "./combat.js";
import { holdShieldLines, shieldSweep, shieldWatch, tickEnergyShields } from "./energy-shield.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState, Projectile } from "./types.js";

/** A is Alliance, B the Xenomorphs, on bare flat ground. */
function field(): MatchState {
  const r = createRoom({ id: "SHD", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  state.blocked.fill(0);
  for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
  return state;
}

/** A Behemoth of B squared up to an A Tiger 8 cells east. */
function standoff(): { state: MatchState; b: Entity; tiger: Entity } {
  const state = field();
  const ts = state.tileSize;
  const b = makeEntity(state, "behemoth", "B", tileCenter(100, ts), tileCenter(120, ts));
  const tiger = makeEntity(state, "ss3", "A", b.x + 32 * ts, b.y);
  b.attackTarget = tiger.id;
  // Held, so it stands and fights instead of lunging at the tank.
  b.holdPosition = true;
  return { state, b, tiger };
}

function round(state: MatchState, ownerId: string, x: number, y: number, vx: number, damage: number): Projectile {
  const gun = catalog("warden");
  const p: Projectile = {
    id: state.nextId++,
    ownerId,
    team: ownerId === "A" ? 1 : 2,
    x,
    y,
    vx,
    vy: 0,
    damage,
    penetration: gun.penetration,
    caliber: gun.caliber,
    life: 1,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
  };
  state.projectiles.push(p);
  return p;
}

describe("hive energy wall", () => {
  it("a Behemoth fighting a target in reach raises a wall across its front, and the wall stays put", () => {
    const { state, b } = standoff();
    tickEnergyShields(state, TICK_DT);
    const walls = state.energyShields ?? [];
    assert.equal(walls.length, 1);
    const w = walls[0]!;
    assert.equal(w.fromId, b.id);
    assert.ok(Math.abs(w.angle) < 1e-6, "faces the Tiger to the east");
    assert.equal(w.hp, energyShieldOf("behemoth")!.hp);
    assert.ok(w.r > b.radius, "stands clear of the hull");
    // Only one wall at a time.
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 1);
    b.x += 40;
    tickEnergyShields(state, TICK_DT);
    assert.equal(w.x, b.x - 40, "the wall did not follow");
    const view = snapshotFor(state, "B").shields ?? [];
    assert.equal(view.length, 1);
  });

  it("raises nothing with no target, or with the target out of reach", () => {
    const { state, b, tiger } = standoff();
    b.attackTarget = null;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0);
    b.attackTarget = tiger.id;
    tiger.x = b.x + 200 * state.tileSize;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0);
  });

  it("stops enemy rounds and takes their damage, lets its own side's rounds through", () => {
    const { state, b } = standoff();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields![0]!;
    // Enemy round flying west at the Behemoth, about to cross the wall this tick.
    const startX = b.x + w.r + 4;
    const foe = round(state, "A", startX, b.y, -1200, 60);
    tickProjectiles(state, TICK_DT);
    assert.ok(!state.projectiles.includes(foe), "the enemy round is spent");
    assert.equal(w.hp, w.hpMax - 60);
    assert.equal(b.hp, b.hpMax, "nothing reached the Behemoth");
    // The Behemoth's own round goes out through it.
    const own = round(state, "B", b.x + w.r - 4, b.y, 1200, 60);
    tickProjectiles(state, TICK_DT);
    assert.ok(state.projectiles.includes(own), "its own round flies on");
    assert.equal(w.hp, w.hpMax - 60);
  });

  it("is gone at zero, and the unit raises the next only after the recharge", () => {
    const { state, b } = standoff();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields![0]!;
    w.hp = 0;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0, "broken and not raised again at once");
    const wait = secondsToTicks(energyShieldOf("behemoth")!.rechargeSeconds);
    state.tick += wait;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 1, "up again after the recharge");
    assert.notEqual(state.energyShields![0]!.id, w.id);
  });

  it("enemy ground units cannot walk through it; its own side can", () => {
    const { state, b } = standoff();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields![0]!;
    const foe = makeEntity(state, "rifleman", "A", b.x + w.r + 3, b.y + 6);
    const watch = shieldWatch(state);
    const from = { x: foe.x, y: foe.y };
    foe.x -= 8;
    const mate = makeEntity(state, "xenodrone", "B", b.x + w.r + 3, b.y - 6);
    watch!.set(mate, { x: mate.x, y: mate.y });
    mate.x -= 8;
    holdShieldLines(state, watch);
    assert.deepEqual({ x: foe.x, y: foe.y }, from, "the enemy soldier is held on the far side");
    assert.equal(mate.x, b.x + w.r + 3 - 8, "the Drone walked through");
  });

  it("holds an enemy soldier ordered through it over many ticks", () => {
    const { state, b } = standoff();
    const ts = state.tileSize;
    // Keep the Behemoth still and fighting; the wall goes up on the first tick.
    step(state, TICK_DT);
    const w = state.energyShields?.[0];
    assert.ok(w, "wall up");
    const foe = makeEntity(state, "rifleman", "A", b.x + w.r + 6, b.y);
    applyCommand(state, "A", { type: "cmd.move", ids: [foe.id], x: b.x - 20 * ts, y: b.y });
    for (let i = 0; i < secondsToTicks(3); i++) step(state, TICK_DT);
    const d = Math.hypot(foe.x - w.x, foe.y - w.y);
    const side = Math.cos(Math.atan2(foe.y - w.y, foe.x - w.x) - w.angle);
    assert.ok(!(d < w.r && side > Math.cos(w.half)), `the soldier never got inside (d ${d.toFixed(1)})`);
    assert.ok(d < w.r + 4, `the soldier walked up to the wall (d ${d.toFixed(1)})`);
  });

  it("the Drone and the Lancer raise the same wall, far weaker than the Behemoth's", () => {
    const drone = energyShieldOf("xenodrone")!;
    const lancer = energyShieldOf("lancer")!;
    const big = energyShieldOf("behemoth")!;
    assert.deepEqual(drone, lancer);
    assert.ok(drone.hp * 5 <= big.hp);
    assert.ok(drone.arcPx < big.arcPx);
    assert.equal(energyShieldOf("rifleman"), undefined);
    assert.equal(energyShieldOf("thrall"), undefined);
  });

  it("stops a Cyborg Commander's beam line short", () => {
    const { state, b } = standoff();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields![0]!;
    const hit = shieldSweep(state, "A", b.x + 100, b.y, b.x - 100, b.y);
    assert.ok(hit);
    assert.ok(Math.abs(hit.x - (b.x + w.r)) < 1e-6);
    assert.equal(shieldSweep(state, "B", b.x + 100, b.y, b.x - 100, b.y), null, "not against its own side");
  });
});

describe("Juggernaut", () => {
  it("has ten times the old 420 hit points", () => {
    assert.equal(catalog("juggernaut").hp, 4200);
  });
});
