import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { ENERGY_WALL, TICK_DT, catalog, energyDomeOf, energyShieldOf, isCivilianType, secondsToTicks } from "../catalog.js";
import { allyInLine } from "./lineoffire.js";
import { tickSpotlights } from "./night.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickProjectiles } from "./combat.js";
import { domeCharge, holdShieldLines, shieldSweep, shieldWatch, tickEnergyShields } from "./energy-shield.js";
import { fireLaser } from "./laser.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { punch } from "./thrall.js";
import type { EnergyShield, Entity, MatchState, Projectile } from "./types.js";

/** A is Alliance, B the Xenite, on bare flat ground. */
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

/** A B Siphon alone on the field, its dome cast. */
function siphonUp(): { state: MatchState; s: Entity; dome: EnergyShield } {
  const state = field();
  const ts = state.tileSize;
  const s = makeEntity(state, "siphon", "B", tileCenter(100, ts), tileCenter(120, ts));
  tickEnergyShields(state, TICK_DT);
  const dome = state.energyShields!.find((w) => w.fromId === s.id)!;
  assert.ok(dome, "dome up");
  return { state, s, dome };
}

function lobbed(state: MatchState, ownerId: string, x: number, y: number, damage: number): Projectile {
  const p = round(state, ownerId, x, y, 0, damage);
  p.flight = "mortar";
  p.life = 0.001;
  p.flightTime = 1;
  p.apex = 40;
  p.landX = x;
  p.landY = y;
  return p;
}

describe("Siphon energy dome", () => {
  it("is cast with nothing to fight, covers the whole circle, and walks with the Siphon", () => {
    const { state, s, dome } = siphonUp();
    const def = energyDomeOf("siphon")!;
    assert.equal(dome.dome, true);
    assert.equal(dome.r, def.radiusTiles * state.tileSize);
    assert.equal(dome.hp, def.energy);
    s.x += 40;
    s.y -= 12;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 1, "still the one dome");
    assert.deepEqual({ x: dome.x, y: dome.y }, { x: s.x, y: s.y }, "the dome followed");
    const me = snapshotFor(state, "B");
    assert.equal(me.shields?.[0]?.dome, true);
    assert.equal(me.shields?.[0]?.fromId, s.id);
    assert.equal(me.entities.find((e) => e.id === s.id)?.energy, 1, "full energy shows on the bar");
  });

  it("stops enemy rounds from every side and drains the energy; rounds from inside go out", () => {
    const { state, s, dome } = siphonUp();
    const mate = makeEntity(state, "rifleman", "B", s.x - dome.r + 10, s.y);
    for (const [dx, vx] of [
      [dome.r + 4, -1200],
      [-(dome.r + 4), 1200],
    ] as const) {
      const p = round(state, "A", s.x + dx, s.y, vx, 50);
      tickProjectiles(state, TICK_DT);
      assert.ok(!state.projectiles.includes(p), "the enemy round is spent on the dome");
    }
    assert.equal(dome.hp, dome.hpMax - 100);
    assert.equal(mate.hp, mate.hpMax, "the soldier under it untouched");
    assert.equal(s.hp, s.hpMax);
    const own = round(state, "B", s.x + dome.r - 4, s.y, 1200, 50);
    tickProjectiles(state, TICK_DT);
    assert.ok(state.projectiles.includes(own), "its own side shoots out");
    const foeIn = makeEntity(state, "rifleman", "A", s.x + 40, s.y + 20);
    const out = round(state, "A", foeIn.x + 8, foeIn.y, 1200, 50);
    out.ignoreId = out.fromId = foeIn.id;
    tickProjectiles(state, TICK_DT);
    assert.ok(state.projectiles.includes(out), "an enemy already inside is not stopped going out");
    assert.equal(dome.hp, dome.hpMax - 100);
  });

  it("catches shells lobbed onto it, and a burst outside does not reach under it", () => {
    const { state, s, dome } = siphonUp();
    const mate = makeEntity(state, "rifleman", "B", s.x + dome.r - 6, s.y);
    const shell = lobbed(state, "A", s.x + 10, s.y, 70);
    tickProjectiles(state, TICK_DT);
    assert.ok(!state.projectiles.includes(shell));
    assert.equal(dome.hp, dome.hpMax - 70, "the shell burst on the skin");
    assert.equal(s.hp, s.hpMax);
    lobbed(state, "A", s.x + dome.r + 8, s.y, 70);
    tickProjectiles(state, TICK_DT);
    assert.equal(mate.hp, mate.hpMax, "the near burst outside spared the soldier under it");
    assert.equal(dome.hp, dome.hpMax - 140, "the dome paid for it");
  });

  it("stops rounds dropping from overhead onto it", () => {
    const { state, s, dome } = siphonUp();
    const p = round(state, "A", s.x + 5, s.y, 300, 40);
    p.fromAbove = true;
    tickProjectiles(state, TICK_DT);
    assert.ok(!state.projectiles.includes(p));
    assert.equal(dome.hp, dome.hpMax - 40);
  });

  it("turns a blow at arm's reach from outside", () => {
    const { state, s, dome } = siphonUp();
    const mate = makeEntity(state, "rifleman", "B", s.x + dome.r - 4, s.y);
    const thrall = makeEntity(state, "thrall", "A", s.x + dome.r + 8, s.y);
    punch(state, thrall, mate);
    assert.equal(mate.hp, mate.hpMax);
    assert.ok(dome.hp < dome.hpMax);
  });

  it("drained, it is gone until the energy fills back, then cast again at full", () => {
    const { state, s, dome } = siphonUp();
    const def = energyDomeOf("siphon")!;
    dome.hp = 0;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0, "gone");
    const p = round(state, "A", s.x + dome.r + 4, s.y, -1200, 50);
    for (let i = 0; i < 4 && state.projectiles.includes(p); i++) tickProjectiles(state, TICK_DT);
    assert.ok(s.hp < s.hpMax, "rounds reach the Siphon now");
    state.tick += Math.floor(secondsToTicks(def.rechargeSeconds) / 2);
    const half = domeCharge(state, s)!;
    assert.ok(half > 0.4 && half < 0.6, `recharging (${half})`);
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0, "not before it is full");
    state.tick += secondsToTicks(def.rechargeSeconds);
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 1);
    assert.equal(state.energyShields![0]!.hp, def.energy);
  });

  it("regains energy while it stands, and keeps what it had when lowered undrained", () => {
    const { state, s, dome } = siphonUp();
    dome.hp = 300;
    tickEnergyShields(state, 1);
    assert.equal(dome.hp, 300 + energyDomeOf("siphon")!.regenPerSecond);
    s.shutdown = true;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0, "lowered while shut down");
    s.shutdown = undefined;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields![0]!.hp, dome.hp, "cast again with what was left");
  });

  it("no enemy walks in; one already under it walks out", () => {
    const { state, s, dome } = siphonUp();
    const foe = makeEntity(state, "rifleman", "A", s.x + dome.r + 3, s.y);
    const inside = makeEntity(state, "rifleman", "A", s.x + dome.r - 3, s.y + 20);
    const watch = shieldWatch(state);
    const from = { x: foe.x, y: foe.y };
    foe.x -= 8;
    inside.x += 8;
    holdShieldLines(state, watch);
    assert.deepEqual({ x: foe.x, y: foe.y }, from, "held outside");
    assert.equal(inside.x, s.x + dome.r + 5, "walked out");
  });
});

describe("pulses and lasers on a hive shield", () => {
  /** A's seat is a second hive, so its rounds are energy bolts. */
  function hiveFoe(state: MatchState): void {
    state.players.get("A")!.faction = "xeno";
  }

  it("a flat pulse bolt turns back off a dome, still live, and the dome pays for it", () => {
    const { state, s, dome } = siphonUp();
    hiveFoe(state);
    const startX = s.x + dome.r + 4;
    const bolt = round(state, "A", startX, s.y, -1200, 60);
    tickProjectiles(state, TICK_DT);
    assert.ok(state.projectiles.includes(bolt), "the bolt flies on");
    assert.ok(bolt.vx > 0, "back the way it came");
    assert.ok(bolt.x > s.x + dome.r, "outside the dome");
    assert.equal(dome.hp, dome.hpMax - 60);
    assert.equal(s.hp, s.hpMax, "nothing reached the Siphon");
    assert.ok(state.impacts.some((i) => i.kind === "ricochet"));
    tickProjectiles(state, TICK_DT);
    assert.ok(bolt.x > startX, "it keeps going out");
  });

  it("the first pulse never breaks it, however hard; the next one can", () => {
    const { state, s, dome } = siphonUp();
    hiveFoe(state);
    round(state, "A", s.x + dome.r + 4, s.y, -1200, dome.hpMax * 10);
    tickProjectiles(state, TICK_DT);
    assert.equal(dome.hp, 1, "stands on one point");
    round(state, "A", s.x - dome.r - 4, s.y, 1200, 60);
    tickProjectiles(state, TICK_DT);
    assert.equal(dome.hp, 0, "the second breaks it");
  });

  it("a plain round gets no such grace", () => {
    const { state, s, dome } = siphonUp();
    round(state, "A", s.x + dome.r + 4, s.y, -1200, dome.hpMax * 10);
    tickProjectiles(state, TICK_DT);
    assert.equal(dome.hp, 0);
  });

  it("a Commander's beam and his sweep both cost a wall, and the first never breaks it", () => {
    const { state, b, tiger } = standoff();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields![0]!;
    const cmd = makeEntity(state, "cyborgcommander", "A", tiger.x, tiger.y + 3 * state.tileSize);
    w.hp = 5;
    fireLaser(state, cmd, b.x, b.y, 40 * state.tileSize, b);
    assert.equal(w.hp, 1, "the line beam leaves it one point");
    assert.equal(b.hp, b.hpMax, "the beam stopped on the wall");
    cmd.laser = undefined;
    fireLaser(state, cmd, b.x, b.y, 40 * state.tileSize, undefined);
    assert.equal(w.hp, 0, "the sweep into it breaks it now");
  });
});

describe("Juggernaut", () => {
  it("has ten times the old 420 hit points", () => {
    assert.equal(catalog("juggernaut").hp, 4200);
  });
});

describe("Energy Wall", () => {
  /** A B Energy Wall facing east. */
  function wallPost(): { state: MatchState; post: Entity } {
    const state = field();
    const ts = state.tileSize;
    const post = makeEntity(state, "energywall", "B", tileCenter(100, ts), tileCenter(120, ts), { facing: 0 });
    return { state, post };
  }

  it("holds its curtain with nothing to fight, wide across the way it faces", () => {
    const { state, post } = wallPost();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields?.find((s) => s.fromId === post.id);
    assert.ok(w?.post, "curtain up");
    assert.equal(w.angle, 0);
    assert.equal(w.hp, ENERGY_WALL.hp);
    const span = w.r * w.half * 2;
    const behemoth = energyShieldOf("behemoth")!;
    assert.ok(span > behemoth.arcPx * ((behemoth.halfDeg * Math.PI) / 180) * 2 * 1.5, "far wider than a Behemoth's wall");
    for (let i = 0; i < secondsToTicks(30); i++) tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.filter((s) => s.fromId === post.id).length, 1, "it stays up");
  });

  it("stops enemy rounds and drains; its own rounds go through and over the low core", () => {
    const { state, post } = wallPost();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields![0]!;
    const foe = round(state, "A", post.x + w.r + 4, post.y, -1200, 60);
    tickProjectiles(state, TICK_DT);
    assert.ok(!state.projectiles.includes(foe));
    assert.equal(w.hp, w.hpMax - 60);
    const own = round(state, "B", post.x + w.r - 4, post.y, 1200, 60);
    tickProjectiles(state, TICK_DT);
    assert.ok(state.projectiles.includes(own));
    // A Stalker behind the core has a clear line past it to a tank out front.
    const ts = state.tileSize;
    const stalker = makeEntity(state, "stalker", "B", post.x - 3 * ts, post.y);
    const tiger = makeEntity(state, "ss3", "A", post.x + 40 * ts, post.y);
    assert.equal(allyInLine(state, stalker, stalker.x, stalker.y, tiger), undefined);
  });

  it("drained, it is down until the core recharges, then up at full; it mends while it stands", () => {
    const { state, post } = wallPost();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields![0]!;
    w.hp = 100;
    tickEnergyShields(state, 1);
    assert.equal(w.hp, 100 + ENERGY_WALL.regenPerSecond);
    w.hp = 0;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0);
    state.tick += secondsToTicks(ENERGY_WALL.rechargeSeconds) - 1;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0, "still recharging");
    state.tick += 1;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields![0]!.hp, ENERGY_WALL.hp);
    assert.equal(domeCharge(state, post), 1);
  });

  it("offline, the curtain falls and keeps its points for when it comes back", () => {
    const { state, post } = wallPost();
    tickEnergyShields(state, TICK_DT);
    state.energyShields![0]!.hp = 700;
    post.unpowered = true;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields!.length, 0);
    post.unpowered = false;
    tickEnergyShields(state, TICK_DT);
    assert.equal(state.energyShields![0]!.hp, 700);
  });

  it("Rotate turns the curtain; Patrol sweeps it between points", () => {
    const { state, post } = wallPost();
    tickEnergyShields(state, TICK_DT);
    const w = state.energyShields![0]!;
    assert.equal(applyCommand(state, "B", { type: "cmd.rotate", ids: [post.id], x: post.x, y: post.y + 100 }).ok, true);
    for (let i = 0; i < secondsToTicks(5); i++) {
      tickSpotlights(state, TICK_DT);
      tickEnergyShields(state, TICK_DT);
    }
    assert.ok(Math.abs(w.angle - Math.PI / 2) < 1e-6, `turned south (${w.angle})`);
    const north = { x: post.x, y: post.y - 100 };
    const east = { x: post.x + 100, y: post.y };
    assert.equal(applyCommand(state, "B", { type: "cmd.patrol", ids: [post.id], points: [north, east] }).ok, true);
    const seen = new Set<string>();
    for (let i = 0; i < secondsToTicks(20); i++) {
      tickSpotlights(state, TICK_DT);
      tickEnergyShields(state, TICK_DT);
      if (Math.abs(w.angle + Math.PI / 2) < 0.01) seen.add("north");
      if (Math.abs(w.angle) < 0.01) seen.add("east");
    }
    assert.deepEqual([...seen].sort(), ["east", "north"], "swept both ways");
    // The enemy cannot turn it.
    assert.equal(applyCommand(state, "A", { type: "cmd.rotate", ids: [post.id], x: 0, y: 0 }).ok, false);
  });

  it("the snapshot draws it as a curtain and sends the core's heading", () => {
    const { state, post } = wallPost();
    tickEnergyShields(state, TICK_DT);
    const snap = snapshotFor(state, "B");
    assert.equal(snap.shields?.[0]?.post, true);
    assert.equal(snap.entities.find((e) => e.id === post.id)?.spotFacing, 0);
  });
});
