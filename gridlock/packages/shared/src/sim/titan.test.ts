import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalog,
  hpMaxOf,
  MORTAR_FLIGHT_NEAR,
  TITAN_ROCKET,
  AIR_CRUISE_ALT,
  SUPPLY_CARGO,
  SUPPLY_REGEN_PER_SEC,
  SUPPLY_SHELL_COST,
  TITAN_ROCKET_AMMO,
  TITAN_ROCKET_INTERVAL,
  TITAN_ROCKET_RELOAD,
  TITAN_ROCKET_SALVO,
  specialLabel,
  TICK_DT,
  TITAN_BRACE_SECONDS,
  TITAN_BRACED_HP_MUL,
  TITAN_POD_ARC_DEG,
  TITAN_WADE_SPEED,
  TITAN_LAMP_FIX_SECONDS,
  addCrit,
  TRAIN_TYPES,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { moveSpeedMul, rollCrits } from "./crits.js";
import { makeEntity, playerTeam, tileCenter, unitInWater, walkable } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { astar } from "./path.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "TI1",
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
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function clearPad(state: MatchState, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
}

function flood(state: MatchState, x: number, y: number): void {
  const i = y * state.width + x;
  state.terrain[i] = TILE_WATER;
  state.blocked[i] = 1;
}

/** A shell resolves inside the tick it leaves the gun, so watch the rack instead of the projectile list. */
function mainGunFired(state: MatchState, e: Entity): boolean {
  const full = Object.values(catalog(e.type).ammo ?? {}).reduce((n, v) => n + (v ?? 0), 0);
  const left = Object.values(e.ammo).reduce((n, v) => n + (v ?? 0), 0);
  return left < full || state.projectiles.some((p) => p.fromId === e.id && p.flight !== "rocket");
}

function mainTargetOf(e: Entity): number | null | undefined {
  return e.attackTarget ?? (e.order?.kind === "attack" ? e.order.targetId : undefined);
}

function rocketsFrom(state: MatchState, e: Entity) {
  return state.projectiles.filter((p) => p.fromId === e.id && p.flight === "rocket");
}

/** Test targets that shells cannot finish: an AP hit cooks a Tiger off, so undo the kill every tick. */
const immortal = new Set<Entity>();

function unkillable(...ents: Entity[]): void {
  for (const t of ents) {
    t.hpMax = 100000;
    // Never reaches 0, so it never wrecks: a kill would end the orders aimed at it.
    let hp = t.hpMax;
    Object.defineProperty(t, "hp", {
      get: () => hp,
      set: (n: number) => {
        hp = Math.max(1, n);
      },
      enumerable: true,
      configurable: true,
    });
    immortal.add(t);
  }
}

/** Step `n` ticks and record the tick each new rocket from `e` first appeared. */
function watchLaunches(state: MatchState, e: Entity, n: number, seen = new Map<number, number>()): Map<number, number> {
  for (let i = 0; i < n; i++) {
    step(state, TICK_DT);
    for (const t of immortal) {
      t.wreck = false;
      t.hp = t.hpMax;
    }
    for (const p of rocketsFrom(state, e)) if (!seen.has(p.id)) seen.set(p.id, state.tick);
  }
  return seen;
}

/** A rocket fused to burst at (x, y) on the next tick. */
function rocketAt(state: MatchState, ownerId: string, x: number, y: number): void {
  state.projectiles.push({
    id: state.nextId++,
    ownerId,
    team: playerTeam(state, ownerId),
    x: x - 1,
    y,
    vx: 1 / TICK_DT,
    vy: 0,
    damage: TITAN_ROCKET.damage,
    penetration: TITAN_ROCKET.penetration,
    caliber: TITAN_ROCKET.caliber,
    life: TICK_DT / 2,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
    flight: "rocket",
    landX: x,
    landY: y,
    flightTime: TICK_DT / 2,
    z: 40,
    vz: 0,
  });
}

/** Flat, dry pad with a Titan at x0 and nothing else on it. */
function range(): { state: MatchState; y: number; ts: number } {
  immortal.clear();
  const { state } = twoPlayerMatch();
  state.heights.fill(0);
  const ts = state.tileSize;
  const y = 40;
  clearPad(state, 60, y - 8, 130, y + 8);
  return { state, y, ts };
}

const BRACE_TICKS = Math.ceil(TITAN_BRACE_SECONDS / TICK_DT) + 2;

describe("titan", () => {
  it("is an Armory walker with the Tiger's gun and heavier armor", () => {
    const titan = catalog("titan");
    const tiger = catalog("warden");
    assert.ok(TRAIN_TYPES.includes("titan"));
    assert.equal(producerType("titan"), "armory");
    assert.equal(titan.penetration, tiger.penetration);
    assert.equal(titan.caliber, tiger.caliber);
    assert.equal(titan.damage, tiger.damage);
    assert.equal(titan.rangeTiles, tiger.rangeTiles);
    assert.deepEqual(Object.keys(titan.ammo ?? {}), ["ap"], "armor-piercing shot only");
    assert.equal(titan.defaultShell, "ap");
    assert.equal(titan.rockets, true, "shoulder rocket pods");
    assert.ok(titan.hp > tiger.hp);
    assert.ok(titan.armorFront > tiger.armorFront);
    assert.ok(titan.armorSide > tiger.armorSide);
    assert.ok(titan.armorRear > tiger.armorRear);
    assert.ok((titan.turretTurnDegPerSec ?? 0) > 0, "torso traverses like a turret");
    assert.equal(titan.tracked, undefined, "legs, not tracks");
    assert.equal(titan.special, "deploy");
  });

  it("paths and walks through water that stops the Tiger", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 48;
    clearPad(state, 72, y - 3, 110, y + 3);
    for (let gy = y - 3; gy <= y + 3; gy++) {
      for (let gx = 86; gx <= 96; gx++) flood(state, gx, gy);
    }
    assert.equal(walkable(state, 90, y, "titan"), true);
    assert.equal(walkable(state, 90, y, "warden"), false);
    const path = astar(state, 80, y, 104, y, "titan");
    assert.ok(path.some((p) => state.terrain[p.y * state.width + p.x] === TILE_WATER), "wades straight across");

    const titan = makeEntity(state, "titan", "A", tileCenter(80, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [titan.id], x: tileCenter(104, ts), y: tileCenter(y, ts) });
    let wet = false;
    for (let i = 0; i < 400 && titan.x < tileCenter(100, ts); i++) {
      step(state, TICK_DT);
      wet ||= unitInWater(state, titan);
    }
    assert.ok(wet, "stood in the water on the way");
    assert.ok(titan.x > tileCenter(100, ts), `reached the far bank x=${titan.x}`);
  });

  it("wades slower than it walks", () => {
    const { state, a } = twoPlayerMatch();
    const titan = makeEntity(state, "titan", a, 100, 100);
    assert.equal(moveSpeedMul(titan), 1);
    assert.equal(moveSpeedMul(titan, true), TITAN_WADE_SPEED);
    assert.ok(TITAN_WADE_SPEED < 1);
  });

  it("keeps the main gun silent in water but still looses rockets", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = 40;
    clearPad(state, 70, y - 6, 120, y + 6);
    for (let gy = y - 3; gy <= y + 3; gy++) {
      for (let gx = 76; gx <= 88; gx++) flood(state, gx, gy);
    }
    const titan = makeEntity(state, "titan", "A", tileCenter(82, ts), tileCenter(y, ts));
    const tank = makeEntity(state, "warden", "B", tileCenter(104, ts), tileCenter(y, ts));
    tank.holdPosition = true;
    tank.cooldown = 99;
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    assert.equal(unitInWater(state, titan), true);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: tank.id });
    const seen = new Map<number, number>();
    for (let i = 0; i < 80; i++) {
      watchLaunches(state, titan, 1, seen);
      assert.equal(mainGunFired(state, titan), false, "main gun must not fire while wading");
    }
    assert.equal(seen.size, TITAN_ROCKET_SALVO, "the pods fire from the water");
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === titan.id)?.wading, true);

    titan.x = tileCenter(92, ts);
    titan.tileX = 92;
    titan.waypoints = [];
    assert.equal(unitInWater(state, titan), false);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: tank.id });
    let fired = false;
    for (let i = 0; i < 60 && !fired; i++) {
      step(state, TICK_DT);
      fired = mainGunFired(state, titan);
    }
    assert.ok(fired, "main gun fires once back on land");
  });

  it("ripples a four-rocket salvo one after another, then reloads", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const foe = makeEntity(state, "rifleman", "B", tileCenter(90, ts), tileCenter(y, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    foe.hp = foe.hpMax = 100000;
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: foe.id });
    const seen = watchLaunches(state, titan, 60);
    assert.equal(seen.size, TITAN_ROCKET_SALVO, "one full salvo");
    const at = [...seen.values()].sort((p, q) => p - q);
    assert.equal(new Set(at).size, TITAN_ROCKET_SALVO, "no two rockets leave in the same tick");
    const gap = Math.round(TITAN_ROCKET_INTERVAL / TICK_DT);
    for (let i = 1; i < at.length; i++) assert.ok(Math.abs(at[i]! - at[i - 1]! - gap) <= 1, `gap ${at[i]! - at[i - 1]!}`);
    assert.equal(titan.rockets, TITAN_ROCKET_AMMO - TITAN_ROCKET_SALVO, "each rocket comes out of the rack");
    const views = snapshotFor(state, "A");
    const me = views.entities.find((e) => e.id === titan.id);
    assert.equal(me?.rockets, TITAN_ROCKET_AMMO - TITAN_ROCKET_SALVO);
    assert.ok((me?.rocketReload ?? 0) > TITAN_ROCKET_INTERVAL * 2, "pods reload after the salvo");

    const before = seen.size;
    watchLaunches(state, titan, Math.floor(((me?.rocketReload ?? 0) - 0.5) / TICK_DT), seen);
    assert.equal(seen.size, before, "no second salvo during the reload");
    watchLaunches(state, titan, Math.ceil(4 / TICK_DT), seen);
    assert.ok(seen.size > before, "fires again after the reload");
  });

  it("runs dry after its rack, and a supply truck refills it", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    titan.rockets = 2;
    const foe = makeEntity(state, "rifleman", "B", tileCenter(90, ts), tileCenter(y, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    foe.hp = foe.hpMax = 100000;
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: foe.id });
    const seen = watchLaunches(state, titan, Math.ceil((TITAN_ROCKET_RELOAD + 4) / TICK_DT));
    assert.equal(seen.size, 2, "only what is in the rack");
    assert.equal(titan.rockets, 0);

    const truck = makeEntity(state, "supply", "A", tileCenter(72, ts), tileCenter(y + 2, ts));
    assert.equal(applyCommand(state, "A", { type: "cmd.supply", ids: [truck.id], targetId: titan.id }).ok, true);
    ticks(state, 60);
    assert.ok((titan.rockets ?? 0) > 0, `rockets ${titan.rockets}`);

    // Nothing left to shoot at: the rest of the rack stays in the rack.
    state.entities.delete(foe.id);
    titan.attackTarget = null;
    titan.rocketTarget = undefined;
    titan.ammo = { ...catalog("titan").ammo };
    titan.rockets = 0;
    truck.supply = SUPPLY_CARGO;
    assert.equal(applyCommand(state, "A", { type: "cmd.supply", ids: [truck.id], targetId: titan.id }).ok, true);
    // The truck scrounges cargo back while it works; take that out before counting the cost.
    let regen = 0;
    for (let n = 0; truck.order && n < 400; n++) {
      if (truck.supply < SUPPLY_CARGO) regen += SUPPLY_REGEN_PER_SEC * TICK_DT;
      ticks(state, 1);
    }
    assert.equal(titan.rockets, TITAN_ROCKET_AMMO, "the whole rack, not one rocket");
    const spent = SUPPLY_CARGO - truck.supply + regen;
    assert.ok(Math.abs(spent - TITAN_ROCKET_AMMO * SUPPLY_SHELL_COST) < 1e-6, `a rocket costs what a shell costs (${spent})`);
    assert.equal(truck.order, null, "the truck stops once the rack is full");
  });

  it("holds its rockets while the pods are switched off", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const foe = makeEntity(state, "warden", "B", tileCenter(90, ts), tileCenter(y, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    unkillable(foe);
    assert.equal(applyCommand(state, "A", { type: "cmd.rockets", ids: [titan.id], on: false }).ok, true);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === titan.id)?.rocketsOff, true);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: foe.id });
    let gun = false;
    for (let i = 0; i < 80; i++) {
      assert.equal(watchLaunches(state, titan, 1).size, 0, "no rockets while off");
      gun ||= mainGunFired(state, titan);
    }
    assert.ok(gun, "the main gun still fires");
    assert.equal(titan.rockets, TITAN_ROCKET_AMMO);
    assert.equal(applyCommand(state, "A", { type: "cmd.rockets", ids: [titan.id], on: true }).ok, true);
    assert.ok(watchLaunches(state, titan, 60).size > 0, "back on, the pods fire");
    const tiger = makeEntity(state, "warden", "A", tileCenter(66, ts), tileCenter(y, ts));
    assert.equal(applyCommand(state, "A", { type: "cmd.rockets", ids: [tiger.id], on: false }).ok, false);
  });

  it("takes a plane in the air with rockets only, and can bring it down", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const plane = makeEntity(state, "stuka", "B", tileCenter(84, ts), tileCenter(y, ts));
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 0;
    plane.facing = Math.PI / 2;
    plane.order = { kind: "move", x: plane.x, y: plane.y };
    const hp0 = plane.hp;
    const seen = new Map<number, number>();
    let aimed = false;
    for (let i = 0; i < Math.ceil(30 / TICK_DT) && state.entities.has(plane.id) && plane.hp > 0; i++) {
      // Hold the plane in place so the test measures the rockets, not the flight model.
      plane.x = tileCenter(84, ts);
      plane.y = tileCenter(y, ts);
      plane.air!.alt = AIR_CRUISE_ALT;
      watchLaunches(state, titan, 1, seen);
      aimed ||= titan.rocketTarget === plane.id;
      assert.notEqual(titan.attackTarget, plane.id, "the main gun keeps to the ground");
      assert.equal(mainGunFired(state, titan), false, "the tank gun cannot lay on a plane");
    }
    assert.ok(aimed, "the pods take the plane as their target");
    assert.ok(seen.size > 0, "rockets go up at it");
    assert.ok(plane.hp < hp0 || !state.entities.has(plane.id), `plane hp ${plane.hp}/${hp0}`);

    titan.rocketsOff = true;
    const other = makeEntity(state, "stuka", "B", tileCenter(84, ts), tileCenter(y + 3, ts));
    other.air!.phase = "fly";
    other.air!.alt = AIR_CRUISE_ALT;
    other.order = { kind: "move", x: other.x, y: other.y };
    titan.attackTarget = null;
    titan.order = null;
    for (let i = 0; i < 10; i++) {
      other.x = tileCenter(84, ts);
      other.y = tileCenter(y + 3, ts);
      other.air!.alt = AIR_CRUISE_ALT;
      step(state, TICK_DT);
    }
    assert.notEqual(titan.attackTarget, other.id, "the main gun never takes a plane");
    assert.notEqual(titan.rocketTarget, other.id, "pods off: nothing aboard reaches a plane");
  });

  it("fires the pods and the main gun on separate clocks", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const foe = makeEntity(state, "warden", "B", tileCenter(90, ts), tileCenter(y, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    unkillable(foe);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: foe.id });
    const seen = new Map<number, number>();
    let gunAt = -1;
    for (let i = 0; i < Math.ceil(3 / TICK_DT); i++) {
      watchLaunches(state, titan, 1, seen);
      if (gunAt < 0 && mainGunFired(state, titan)) gunAt = state.tick;
    }
    assert.ok(gunAt >= 0, "the main gun fired");
    assert.equal(seen.size, TITAN_ROCKET_SALVO, "the whole salvo went too, in the same few seconds");
    const at = [...seen.values()];
    assert.ok(Math.min(...at) <= gunAt + 2, "the pods did not wait for the gun");
    assert.ok((titan.cooldown ?? 0) > 0 && (titan.rocketCooldown ?? 0) > 0, "each weapon runs its own reload");
  });

  it("leaves a tank off the torso's bearing alone while the main gun works the first", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const first = makeEntity(state, "warden", "B", tileCenter(86, ts), tileCenter(y, ts));
    const side = makeEntity(state, "warden", "B", tileCenter(84, ts), tileCenter(y + 6, ts));
    for (const t of [first, side]) {
      t.holdPosition = true;
      t.cooldown = 99;
    }
    unkillable(first, side);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: first.id });
    const seen = new Map<number, number>();
    for (let i = 0; i < Math.ceil(3 / TICK_DT); i++) {
      watchLaunches(state, titan, 1, seen);
      assert.notEqual(titan.rocketTarget, side.id, "the pods face where the torso faces");
    }
    assert.equal(mainTargetOf(titan), first.id, "the main gun stays on its ordered tank");
    assert.equal(titan.rocketTarget, first.id, "the pods back up the gun on its bearing");
    assert.ok(seen.size > 0);
    for (const p of rocketsFrom(state, titan)) {
      assert.ok(Math.hypot(p.landX! - first.x, p.landY! - first.y) < Math.hypot(p.landX! - side.x, p.landY! - side.y), "every rocket goes down the torso's bearing");
    }
  });

  it("holds the pods until the torso turns onto a target behind it", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(84, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const foe = makeEntity(state, "warden", "B", tileCenter(68, ts), tileCenter(y, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    unkillable(foe);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: foe.id });
    const bearing = Math.atan2(foe.y - titan.y, foe.x - titan.x);
    const off = () => {
      let d = bearing - titan.turretFacing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return (Math.abs(d) * 180) / Math.PI;
    };
    const seen = new Map<number, number>();
    for (let i = 0; i < Math.ceil(4 / TICK_DT); i++) {
      const before = seen.size;
      watchLaunches(state, titan, 1, seen);
      if (seen.size > before) assert.ok(off() <= TITAN_POD_ARC_DEG + 1e-6, `a rocket left ${off().toFixed(1)}° off the torso`);
    }
    assert.ok(seen.size > 0, "once the torso is round, the pods fire");
  });

  it("lays the pods on a second tank on the same bearing while the main gun works the first", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const first = makeEntity(state, "warden", "B", tileCenter(90, ts), tileCenter(y, ts));
    const second = makeEntity(state, "warden", "B", tileCenter(82, ts), tileCenter(y + 1, ts));
    for (const t of [first, second]) {
      t.holdPosition = true;
      t.cooldown = 99;
    }
    unkillable(first, second);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: first.id });
    const seen = new Map<number, number>();
    const aims: { x: number; y: number }[] = [];
    for (let i = 0; i < Math.ceil(3 / TICK_DT); i++) {
      const before = seen.size;
      watchLaunches(state, titan, 1, seen);
      if (seen.size > before) aims.push(...rocketsFrom(state, titan).slice(-1).map((p) => ({ x: p.landX!, y: p.landY! })));
    }
    assert.equal(mainTargetOf(titan), first.id, "the main gun stays on its ordered tank");
    assert.equal(titan.rocketTarget, second.id, "the pods take the other tank");
    assert.ok(aims.length > 0);
    for (const a of aims) {
      const dSecond = Math.hypot(a.x - second.x, a.y - second.y);
      const dFirst = Math.hypot(a.x - first.x, a.y - first.y);
      assert.ok(dSecond < dFirst, "every rocket is fused toward the second tank");
    }
  });

  it("backs up the main gun when it is the only target in reach", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const only = makeEntity(state, "warden", "B", tileCenter(88, ts), tileCenter(y, ts));
    only.holdPosition = true;
    only.cooldown = 99;
    unkillable(only);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: only.id });
    watchLaunches(state, titan, Math.ceil(2 / TICK_DT));
    assert.equal(titan.rocketTarget, only.id);
  });

  it("flies straight and far faster than a mortar bomb", () => {
    const { state, y, ts } = range();
    const titan = makeEntity(state, "titan", "A", tileCenter(70, ts), tileCenter(y, ts));
    titan.facing = 0;
    titan.turretFacing = 0;
    titan.holdPosition = true;
    const foe = makeEntity(state, "warden", "B", tileCenter(96, ts), tileCenter(y, ts));
    foe.holdPosition = true;
    foe.cooldown = 99;
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: foe.id });
    let salvo: ReturnType<typeof rocketsFrom> = [];
    for (let i = 0; i < 40 && salvo.length === 0; i++) {
      step(state, TICK_DT);
      salvo = rocketsFrom(state, titan);
    }
    assert.ok(salvo.length > 0);
    for (const p of salvo) {
      assert.equal(p.apex, undefined, "no lob");
      assert.ok((p.flightTime ?? 99) < MORTAR_FLIGHT_NEAR / 2, `flight ${p.flightTime}s`);
    }
    const r = salvo[0]!;
    const z0 = r.z ?? 0;
    step(state, TICK_DT);
    if (state.projectiles.includes(r)) {
      const dz = (r.z ?? 0) - z0;
      assert.ok(Math.abs(dz - (r.vz ?? 0) * TICK_DT) < 1e-6, "height changes along a straight line");
    }
    for (let i = 0; i < 60 && rocketsFrom(state, titan).length > 0; i++) step(state, TICK_DT);
    assert.equal(rocketsFrom(state, titan).length, 0, "the whole salvo has burst inside a second or two");
  });

  it("shreds infantry and dents a tank", () => {
    const { state, y, ts } = range();
    const x = tileCenter(100, ts);
    const soldier = makeEntity(state, "rifleman", "B", x, tileCenter(y, ts));
    rocketAt(state, "A", x, tileCenter(y, ts));
    step(state, TICK_DT);
    assert.ok(soldier.hp < soldier.hpMax * 0.3, `rifleman hp ${soldier.hp}/${soldier.hpMax}`);
    assert.ok(state.impacts.some((i) => i.rocket), "burst is flagged for the client");

    const tank = makeEntity(state, "warden", "B", tileCenter(80, ts), tileCenter(y, ts));
    const hp0 = tank.hp;
    rocketAt(state, "A", tank.x, tank.y);
    step(state, TICK_DT);
    const lost = hp0 - tank.hp;
    assert.ok(lost >= hp0 * 0.05 && lost <= hp0 * 0.15, `tank lost ${lost} of ${hp0}`);
    assert.ok(tank.hp > 0);
  });

  it("braces in place for extra hit points, then packs back up", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 40;
    clearPad(state, 70, y - 4, 110, y + 4);
    const titan = makeEntity(state, "titan", a, tileCenter(80, ts), tileCenter(y, ts));
    const base = catalog("titan").hp;
    titan.hp = base / 2;

    assert.equal(applyCommand(state, a, { type: "cmd.deploy", id: titan.id }).ok, true);
    assert.equal(titan.state, "deploy");
    ticks(state, BRACE_TICKS);
    assert.equal(titan.braced, true);
    assert.equal(titan.hpMax, Math.round(base * TITAN_BRACED_HP_MUL));
    assert.equal(titan.hpMax, hpMaxOf("titan", true));
    assert.equal(titan.hp, Math.round(titan.hpMax / 2), "keeps its share of max");
    assert.equal(specialLabel("titan", true), "Pack");
    const view = snapshotFor(state, a).entities.find((e) => e.id === titan.id);
    assert.equal(view?.braced, true);
    assert.equal(view?.hpMax, titan.hpMax);

    const x0 = titan.x;
    const moved = applyCommand(state, a, { type: "cmd.move", ids: [titan.id], x: tileCenter(100, ts), y: tileCenter(y, ts) });
    assert.equal(moved.ok, false, "a braced Titan refuses a move order");
    ticks(state, 30);
    assert.equal(titan.x, x0);

    ticks(state, 30); // special cooldown
    assert.equal(applyCommand(state, a, { type: "cmd.deploy", id: titan.id }).ok, true);
    assert.equal(titan.state, "undeploy");
    ticks(state, BRACE_TICKS);
    assert.equal(titan.braced, false);
    assert.equal(titan.hpMax, base);
    assert.equal(titan.hp, base / 2, "a brace / pack loop does not heal");
    applyCommand(state, a, { type: "cmd.move", ids: [titan.id], x: tileCenter(100, ts), y: tileCenter(y, ts) });
    ticks(state, 60);
    assert.ok(titan.x > x0, "walks again once packed");
  });

  it("still traverses and fires while braced", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const y = 40;
    clearPad(state, 70, y - 6, 120, y + 6);
    const titan = makeEntity(state, "titan", "A", tileCenter(80, ts), tileCenter(y, ts));
    titan.facing = Math.PI / 2;
    titan.turretFacing = Math.PI / 2;
    applyCommand(state, "A", { type: "cmd.deploy", id: titan.id });
    ticks(state, BRACE_TICKS);
    assert.equal(titan.braced, true);
    const tank = makeEntity(state, "warden", "B", tileCenter(100, ts), tileCenter(y, ts));
    tank.holdPosition = true;
    tank.cooldown = 99;
    const hull = titan.facing;
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: tank.id });
    let fired = false;
    for (let i = 0; i < 80 && !fired; i++) {
      step(state, TICK_DT);
      fired = mainGunFired(state, titan);
    }
    assert.ok(fired, "torso swings onto the target and fires");
    assert.equal(titan.facing, hull, "legs stay planted");
  });

  it("will not brace standing in water", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 44;
    clearPad(state, 80, y - 2, 90, y + 2);
    flood(state, 85, y);
    const titan = makeEntity(state, "titan", a, tileCenter(85, ts), tileCenter(y, ts));
    assert.equal(applyCommand(state, a, { type: "cmd.deploy", id: titan.id }).ok, false);
    assert.equal(titan.braced, undefined);
  });
});

describe("titan and juggernaut crits", () => {
  it("never take a broken engine, whatever hits them", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    for (const type of ["titan", "juggernaut"] as const) {
      const e = makeEntity(state, type, "A", tileCenter(80, ts), tileCenter(40, ts));
      for (let i = 0; i < 50; i++) rollCrits(e, "rear", "pen", 10, () => 0);
      addCrit(e, "engine");
      assert.equal(e.crits.includes("engine"), false, type);
    }
    const tiger = makeEntity(state, "warden", "A", tileCenter(84, ts), tileCenter(40, ts));
    rollCrits(tiger, "rear", "pen", 10, () => 0);
    assert.equal(tiger.crits.includes("engine"), true, "other hulls still lose theirs");
  });

  it("a titan's smashed lamp comes back on by itself", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const titan = makeEntity(state, "titan", "A", tileCenter(80, ts), tileCenter(40, ts));
    addCrit(titan, "lamp");
    const fix = Math.ceil(TITAN_LAMP_FIX_SECONDS / TICK_DT);
    ticks(state, fix - 5);
    assert.equal(titan.crits.includes("lamp"), true, "still dark before the time is up");
    ticks(state, 10);
    assert.equal(titan.crits.includes("lamp"), false);
    assert.equal(titan.lampFixAt, undefined);
  });
});
