import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AIR_CRUISE_ALT,
  catalog,
  fires,
  MORTAR_APEX_NEAR,
  MORTAR_FLIGHT_FAR,
  MORTAR_RANGE_TILES,
  NEBELWERFER_MIN_RANGE_TILES,
  NEBELWERFER_RANGE_TILES,
  NEBELWERFER_ROCKET,
  NEBELWERFER_ROCKET_AMMO,
  NEBELWERFER_SALVO,
  rocketAmmoOf,
  TICK_DT,
  TITAN_ROCKET,
  TITAN_ROCKET_RACK,
  TRAIN_TYPES,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, playerTeam, tileCenter } from "./geo.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { rocketScatterRadius } from "./mortar.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "NW1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Flat, dry strip along row `y`, wide enough for the launcher's full reach. */
function range(): { state: MatchState; y: number; ts: number } {
  const state = twoPlayerMatch();
  state.heights.fill(0);
  const ts = state.tileSize;
  const y = 40;
  for (let gy = y - 8; gy <= y + 8; gy++) {
    for (let gx = 20; gx <= 150; gx++) {
      const i = gy * state.width + gx;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
    }
  }
  return { state, y, ts };
}

/** A launcher at column x0, halted, frame already laid east. */
function launcher(state: MatchState, x0: number, y: number): Entity {
  const ts = state.tileSize;
  const n = makeEntity(state, "nebelwerfer", "A", tileCenter(x0, ts), tileCenter(y, ts));
  n.facing = 0;
  n.turretFacing = 0;
  n.holdPosition = true;
  return n;
}

/** A soldier who holds his ground, never fires back, and cannot die. */
function dummy(state: MatchState, owner: string, x: number, y: number): Entity {
  const ts = state.tileSize;
  const e = makeEntity(state, "rifleman", owner, tileCenter(x, ts), tileCenter(y, ts));
  e.holdPosition = true;
  e.cooldown = 1e9;
  e.hp = e.hpMax = 1e9;
  return e;
}

function rocketsFrom(state: MatchState, e: Entity) {
  return state.projectiles.filter((p) => p.fromId === e.id && p.flight === "rocket");
}

/** Step `n` ticks and record the tick each new rocket from `e` first appeared. */
function watchLaunches(state: MatchState, e: Entity, n: number, seen = new Map<number, number>()): Map<number, number> {
  for (let i = 0; i < n; i++) {
    step(state, TICK_DT);
    for (const p of rocketsFrom(state, e)) if (!seen.has(p.id)) seen.set(p.id, state.tick);
  }
  return seen;
}

/** A Nebelwerfer rocket fused to burst at (x, y) on the next tick. */
function rocketAt(state: MatchState, ownerId: string, x: number, y: number, rack = NEBELWERFER_ROCKET): void {
  state.projectiles.push({
    id: state.nextId++,
    ownerId,
    team: playerTeam(state, ownerId),
    x: x - 1,
    y,
    vx: 1 / TICK_DT,
    vy: 0,
    damage: rack.damage,
    penetration: rack.penetration,
    caliber: rack.caliber,
    life: TICK_DT / 2,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
    flight: "rocket",
    landX: x,
    landY: y,
    flightTime: TICK_DT / 2,
    z: 0,
    vz: 0,
    launcher: rack === NEBELWERFER_ROCKET ? "nebelwerfer" : "titan",
  });
}

const SALVO_TICKS =
  Math.ceil((NEBELWERFER_SALVO * (NEBELWERFER_ROCKET.interval + (NEBELWERFER_ROCKET.intervalJitter ?? 0))) / TICK_DT) + 20;

describe("nebelwerfer", () => {
  it("is an Armory rocket truck with twelve tubes and five salvos", () => {
    const def = catalog("nebelwerfer");
    assert.ok(TRAIN_TYPES.includes("nebelwerfer"));
    assert.equal(producerType("nebelwerfer"), "armory");
    assert.equal(def.name, "Nebelwerfer");
    assert.equal(def.damage, 0, "no gun besides the tubes");
    assert.equal(fires("nebelwerfer"), true, "still takes attack orders");
    assert.equal(NEBELWERFER_SALVO, 12);
    assert.equal(rocketAmmoOf("nebelwerfer"), NEBELWERFER_ROCKET_AMMO);
    assert.equal(NEBELWERFER_ROCKET_AMMO, 5 * 12);
    assert.ok(NEBELWERFER_RANGE_TILES > MORTAR_RANGE_TILES, "longer reach than the mortar");
    assert.ok(def.armorFront > 0, "armored");
    assert.equal(def.tracked, undefined, "wheels, not tracks");
    assert.ok((def.turretTurnDegPerSec ?? 0) > 0, "the frame traverses");
  });

  it("empties the frame in about a second, one to three rockets at a time, then reloads", () => {
    const { state, y } = range();
    const n = launcher(state, 30, y);
    const foe = dummy(state, "B", 30 + 60, y);
    dummy(state, "A", 30 + 58, y + 2); // spotter
    applyCommand(state, "A", { type: "cmd.attack", ids: [n.id], targetId: foe.id });
    const seen = watchLaunches(state, n, SALVO_TICKS);
    assert.equal(seen.size, NEBELWERFER_SALVO, "one full salvo");
    const perTick = new Map<number, number>();
    for (const t of seen.values()) perTick.set(t, (perTick.get(t) ?? 0) + 1);
    const volleys = [...perTick.entries()].sort((p, q) => p[0] - q[0]);
    for (const [, k] of volleys) assert.ok(k >= 1 && k <= (NEBELWERFER_ROCKET.volleyMax ?? 1), `volley of ${k}`);
    assert.ok(volleys.length >= NEBELWERFER_SALVO / 3 && volleys.length < NEBELWERFER_SALVO, `${volleys.length} launches`);
    assert.ok(volleys.some(([, k]) => k > 1), "some rockets leave together");
    const maxGap = Math.round((NEBELWERFER_ROCKET.interval + (NEBELWERFER_ROCKET.intervalJitter ?? 0)) / TICK_DT);
    for (let i = 1; i < volleys.length; i++) {
      const gap = volleys[i]![0] - volleys[i - 1]![0];
      assert.ok(gap >= 1 && gap <= maxGap + 1, `gap ${gap} ticks`);
    }
    const span = (volleys[volleys.length - 1]![0] - volleys[0]![0]) * TICK_DT;
    assert.ok(span <= 2.5, `whole salvo out in ${span.toFixed(1)}s`);
    assert.equal(n.rockets, NEBELWERFER_ROCKET_AMMO - NEBELWERFER_SALVO);
    const me = snapshotFor(state, "A").entities.find((e) => e.id === n.id);
    assert.equal(me?.rockets, NEBELWERFER_ROCKET_AMMO - NEBELWERFER_SALVO);
    assert.ok((me?.rocketReload ?? 0) > NEBELWERFER_ROCKET.interval * 4, "tubes reload after the salvo");

    const before = seen.size;
    watchLaunches(state, n, Math.floor(((me?.rocketReload ?? 0) - 0.5) / TICK_DT), seen);
    assert.equal(seen.size, before, "no second salvo during the reload");
    watchLaunches(state, n, Math.ceil(3 / TICK_DT), seen);
    assert.ok(seen.size > before, "fires again after the reload");
  });

  it("empties after five salvos, and a supply truck refills it", () => {
    const { state, y, ts } = range();
    const n = launcher(state, 30, y);
    n.rockets = 3;
    const foe = dummy(state, "B", 30 + 60, y);
    dummy(state, "A", 30 + 58, y + 2);
    applyCommand(state, "A", { type: "cmd.attack", ids: [n.id], targetId: foe.id });
    const seen = watchLaunches(state, n, Math.ceil((NEBELWERFER_ROCKET.reload + 6) / TICK_DT));
    assert.equal(seen.size, 3, "only what is in the rack");
    assert.equal(n.rockets, 0);

    const truck = makeEntity(state, "supply", "A", tileCenter(32, ts), tileCenter(y + 2, ts));
    assert.equal(applyCommand(state, "A", { type: "cmd.supply", ids: [truck.id], targetId: n.id }).ok, true);
    for (let i = 0; i < 60; i++) step(state, TICK_DT);
    assert.ok((n.rockets ?? 0) > 0, `rockets ${n.rockets}`);
  });

  it("swings the frame onto the target before the first rocket leaves", () => {
    const { state, y } = range();
    const n = launcher(state, 30, y);
    n.turretFacing = Math.PI; // laid the wrong way
    const foe = dummy(state, "B", 30 + 60, y);
    dummy(state, "A", 30 + 58, y + 2);
    applyCommand(state, "A", { type: "cmd.attack", ids: [n.id], targetId: foe.id });
    const traverse = 180 / (catalog("nebelwerfer").turretTurnDegPerSec ?? 1);
    const early = watchLaunches(state, n, Math.floor((traverse * 0.8) / TICK_DT));
    assert.equal(early.size, 0, "nothing leaves while the frame is still swinging");
    const later = watchLaunches(state, n, Math.ceil((traverse * 0.4) / TICK_DT) + SALVO_TICKS, early);
    assert.ok(later.size > 0, "fires once laid");
  });

  it("will not fire rolling", () => {
    const { state, y, ts } = range();
    const n = launcher(state, 30, y);
    n.holdPosition = false;
    const foe = dummy(state, "B", 30 + 60, y);
    dummy(state, "A", 30 + 58, y + 2);
    // A plain move engages on the way, so only the halt rule keeps the tubes quiet.
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [n.id], x: tileCenter(46, ts), y: tileCenter(y, ts) }).ok, true);
    let rollingTicks = 0;
    let firedRolling = 0;
    const seen = new Map<number, number>();
    for (let i = 0; i < 400 && n.waypoints.length > 0; i++) {
      const before = seen.size;
      watchLaunches(state, n, 1, seen);
      // Movement runs before the tubes in a tick, so a tick that ends still rolling never fired halted.
      if (n.waypoints.length > 0) {
        rollingTicks++;
        firedRolling += seen.size - before;
      }
    }
    assert.ok(rollingTicks > 20, `rolled for ${rollingTicks} ticks`);
    assert.equal(n.waypoints.length, 0, "arrived");
    assert.equal(firedRolling, 0, "nothing left the tubes on the road");
    watchLaunches(state, n, SALVO_TICKS, seen);
    assert.ok(seen.size > 0, "fires once halted");
  });

  it("holds fire inside its minimum range", () => {
    const { state, y } = range();
    const n = launcher(state, 30, y);
    const near = NEBELWERFER_MIN_RANGE_TILES - 2;
    const foe = dummy(state, "B", 30 + near, y);
    applyCommand(state, "A", { type: "cmd.attack", ids: [n.id], targetId: foe.id });
    const seen = watchLaunches(state, n, SALVO_TICKS);
    assert.equal(seen.size, 0, `target ${near} tiles away is too close`);
  });

  it("fires far past its own eyes on what a spotter sees, fast and on a flat arc", () => {
    const { state, y } = range();
    const n = launcher(state, 30, y);
    const far = NEBELWERFER_RANGE_TILES - 4;
    const foe = dummy(state, "B", 30 + far, y);
    applyCommand(state, "A", { type: "cmd.attack", ids: [n.id], targetId: foe.id });
    watchLaunches(state, n, 20);
    // No spotter yet: auto-fire drops what the side cannot see, but a player's order still stands.
    dummy(state, "A", 30 + far - 3, y + 2);
    // Watch a rocket from the tick it leaves the tube.
    const old = new Set(rocketsFrom(state, n).map((p) => p.id));
    let salvo: ReturnType<typeof rocketsFrom> = [];
    for (let i = 0; i < SALVO_TICKS + Math.ceil(NEBELWERFER_ROCKET.reload / TICK_DT) && salvo.length === 0; i++) {
      step(state, TICK_DT);
      salvo = rocketsFrom(state, n).filter((p) => !old.has(p.id));
    }
    assert.ok(salvo.length > 0, "the rockets go out to full reach");
    const r = salvo[0]!;
    const z0 = r.z ?? 0;
    assert.ok((r.apex ?? 0) > 0, "a slight arc");
    assert.ok((r.apex ?? 0) <= MORTAR_APEX_NEAR / 2, `far flatter than a mortar lob (apex ${r.apex})`);
    assert.ok((r.flightTime ?? 99) < MORTAR_FLIGHT_FAR, `fast (flight ${r.flightTime}s)`);
    let peak = z0;
    for (let i = 0; i < 60 && state.projectiles.includes(r); i++) {
      step(state, TICK_DT);
      if (state.projectiles.includes(r)) peak = Math.max(peak, r.z ?? 0);
    }
    assert.ok(peak > z0 && peak - z0 <= (r.apex ?? 0) + 1, `rises a little over its line (peak ${peak}, from ${z0})`);
    assert.equal(state.projectiles.includes(r), false, "it bursts at the far end");
    assert.ok(Math.abs(r.x - foe.x) < NEBELWERFER_ROCKET.scatterFarTiles * state.tileSize * 1.3, "lands near the target");
  });

  it("scatters wider than the Titan's pods and hits lighter", () => {
    const reach = NEBELWERFER_RANGE_TILES * 8;
    assert.ok(
      rocketScatterRadius(reach, reach, 1, NEBELWERFER_ROCKET) > rocketScatterRadius(reach, reach, 1, TITAN_ROCKET_RACK) * 1.5,
      "low accuracy",
    );
    assert.ok(NEBELWERFER_ROCKET.damage < TITAN_ROCKET.damage, "moderate damage per rocket");

    const { state, y, ts } = range();
    const soldier = makeEntity(state, "rifleman", "B", tileCenter(100, ts), tileCenter(y, ts));
    rocketAt(state, "A", soldier.x, soldier.y);
    step(state, TICK_DT);
    assert.ok(soldier.hp < soldier.hpMax, "wounds a soldier at the center");

    const tank = makeEntity(state, "warden", "B", tileCenter(60, ts), tileCenter(y, ts));
    const hp0 = tank.hp;
    rocketAt(state, "A", tank.x, tank.y);
    step(state, TICK_DT);
    const lost = hp0 - tank.hp;
    assert.ok(lost > 0 && lost <= hp0 * 0.1, `tank lost ${lost} of ${hp0}`);
  });

  it("never lays on a plane", () => {
    const { state, y, ts } = range();
    const n = launcher(state, 30, y);
    const plane = makeEntity(state, "stuka", "B", tileCenter(60, ts), tileCenter(y, ts));
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 0;
    plane.order = { kind: "move", x: plane.x, y: plane.y };
    for (let i = 0; i < 40; i++) {
      plane.x = tileCenter(60, ts);
      plane.y = tileCenter(y, ts);
      plane.air!.alt = AIR_CRUISE_ALT;
      step(state, TICK_DT);
      assert.notEqual(n.attackTarget, plane.id);
      assert.notEqual(n.rocketTarget, plane.id);
    }
    assert.equal(rocketsFrom(state, n).length, 0);
  });
});
