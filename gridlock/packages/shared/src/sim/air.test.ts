import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRASH_BUILDING_DAMAGE,
  AIR_CRASH_RANGE_MAX,
  AIR_CRASH_RANGE_MIN,
  AIR_CRUISE_ALT,
  AIR_FUEL_SECONDS,
  AIRFIELD_PADS,
  BOMB_CALIBER,
  BOMB_DAMAGE,
  BOMB_DIRECT_TILES,
  BOMB_FALL_SECONDS,
  BOMB_HOLE_SCALE,
  BOMB_REARM_SECONDS,
  BOMB_SPLASH_TILES,
  FW190_BARRAGES,
  STUKA_MG_ROUNDS,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  coverHeightOf,
  hasTracks,
  wreckHpOf,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { airfieldPadWorld, airfieldRunway, isAirborne, PARK_HEADING, parkHeading, runwayLocal, runwayPoint, stepBomb } from "./air.js";
import { shellHoleRadius } from "./remains.js";
import { mortarFalloff } from "./mortar.js";
import { applyCommand } from "./commands.js";
import { takeDamage } from "./crits.js";
import { buildingBounds, makeEntity, occupant, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { spawnUnit } from "./train.js";
import { raiseBuilding } from "./build.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "AIR1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.players.get("A")!.scrap = 50_000;
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

/** An SC 250 that has already reached the ground. */
function burstBomb(state: MatchState, x: number, y: number): void {
  const bomb: Projectile = {
    id: state.nextId++,
    ownerId: "A",
    team: 1,
    x,
    y,
    vx: 0,
    vy: 0,
    damage: BOMB_DAMAGE,
    penetration: 0,
    caliber: BOMB_CALIBER,
    life: 0,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
    flight: "bomb",
    landX: x,
    landY: y,
    apex: 5,
    flightTime: BOMB_FALL_SECONDS,
    z: 0,
  };
  assert.equal(stepBomb(state, bomb, TICK_DT), false);
}

function seedCore(state: MatchState, owner = "A", tx = 4, ty = 4): Entity {
  const ts = state.tileSize;
  return makeEntity(state, "core", owner, tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
}

function seedAirfield(state: MatchState, tx = 30, ty = 30, owner = "A"): Entity {
  const ts = state.tileSize;
  const def = catalog("airfield");
  return makeEntity(state, "airfield", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function parkedPlane(state: MatchState, field: Entity): Entity {
  const p = spawnUnit(state, field.ownerId, "stuka", field, false);
  assert.ok(p, "plane should spawn on a free pad");
  return p;
}

describe("airfield", () => {
  it("is a building type the construction yard can queue, and the Stuka is not in the opening army", () => {
    assert.equal(catalog("airfield").kind, "building");
    assert.ok(TRAIN_TYPES.includes("stuka"));
  });

  it("trains a Stuka that rolls onto a hardstand and waits there", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const r = applyCommand(state, "A", { type: "cmd.train", unit: "stuka" });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    assert.equal(field.queue.length, 1);
    ticks(state, Math.ceil(catalog("stuka").buildSeconds / TICK_DT) + 20);
    const planes = [...state.entities.values()].filter((e) => e.type === "stuka");
    assert.equal(planes.length, 1);
    const plane = planes[0]!;
    assert.equal(plane.air?.phase, "parked");
    assert.equal(plane.air?.homeId, field.id);
    const pad = airfieldPadWorld(field, plane.air!.pad, state.tileSize);
    assert.equal(plane.x, pad.x);
    assert.equal(plane.y, pad.y);
  });

  it(`parks at most ${AIRFIELD_PADS} planes and refuses a fifth`, () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    for (let i = 0; i < AIRFIELD_PADS; i++) {
      const r = applyCommand(state, "A", { type: "cmd.train", unit: "stuka" });
      assert.equal(r.ok, true, !r.ok ? r.message : "");
    }
    const fifth = applyCommand(state, "A", { type: "cmd.train", unit: "stuka" });
    assert.equal(fifth.ok, false);
    ticks(state, Math.ceil((catalog("stuka").buildSeconds * AIRFIELD_PADS) / TICK_DT) + 40);
    const planes = [...state.entities.values()].filter((e) => e.type === "stuka");
    assert.equal(planes.length, AIRFIELD_PADS);
    const pads = new Set(planes.map((p) => p.air!.pad));
    assert.equal(pads.size, AIRFIELD_PADS);
    assert.equal(applyCommand(state, "A", { type: "cmd.train", unit: "stuka" }).ok, false);
  });

  it("needs an Airfield", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const r = applyCommand(state, "A", { type: "cmd.train", unit: "stuka" });
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.message : "", /Airfield/);
  });

  it("a plane that lost its Airfield does not take a pad a queued Stuka holds", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const lost = seedAirfield(state, 30, 30);
    const other = seedAirfield(state, 30, 50);
    const plane = parkedPlane(state, lost);
    for (let i = 0; i < AIRFIELD_PADS - 1; i++) parkedPlane(state, other);
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 80 * state.tileSize, y: 80 * state.tileSize });
    ticks(state, 20);
    lost.hp = 0;
    ticks(state, 1);
    assert.equal(state.entities.has(lost.id), false);
    const r = applyCommand(state, "A", { type: "cmd.train", unit: "stuka" });
    assert.equal(r.ok, true, !r.ok ? r.message : "");
    assert.equal(other.queue.length, 1);
    ticks(state, 20);
    assert.equal(plane.air!.homeId, null);
    ticks(state, Math.ceil(catalog("stuka").buildSeconds / TICK_DT) + 20);
    assert.equal(other.queue.length, 0, "the queued Stuka rolled out onto its pad");
    const homed = [...state.entities.values()].filter((e) => e.air?.homeId === other.id);
    assert.equal(homed.length, AIRFIELD_PADS);
  });

  it("shows pad use to its owner", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    parkedPlane(state, field);
    const view = snapshotFor(state, "A").entities.find((e) => e.id === field.id);
    assert.deepEqual(view?.pads, { used: 1, cap: AIRFIELD_PADS });
    const enemy = snapshotFor(state, "B").entities.find((e) => e.id === field.id);
    assert.equal(enemy?.pads, undefined);
  });
});

describe("stuka flight", () => {
  it("takes off on a move order, climbs to cruise, and circles the point", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    const gx = 120 * ts;
    const gy = 120 * ts;
    assert.equal(applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: gx, y: gy }).ok, true);
    assert.equal(plane.air?.phase, "takeoff");
    // Pivot out of the revetment, taxi onto the strip, line up, roll.
    assert.ok(until(state, 80, () => plane.air?.phase === "fly") >= 0, "plane should be flying");
    ticks(state, 300);
    assert.ok(isAirborne(plane));
    assert.ok(Math.abs(plane.air!.alt - AIR_CRUISE_ALT) < 0.5, `alt ${plane.air!.alt}`);
    // Circling: stays near the point over the next several seconds.
    let far = 0;
    for (let i = 0; i < 60; i++) {
      step(state, TICK_DT);
      far = Math.max(far, Math.hypot(plane.x - gx, plane.y - gy));
    }
    assert.ok(far < 30 * ts, `strayed ${far / ts} tiles`);
    assert.ok(plane.air!.fuel < AIR_FUEL_SECONDS);
  });

  it("flies over walls and water: no path, no collision", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const tank = makeEntity(state, "warden", "A", plane.x + 20, plane.y);
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: plane.x + 400, y: plane.y });
    ticks(state, 30);
    assert.equal(plane.waypoints.length, 0);
    assert.ok(tank.hp > 0);
  });

  it("stop circles in place; land brings it home to its pad", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const pad = airfieldPadWorld(field, plane.air!.pad, state.tileSize);
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 150 * state.tileSize, y: 150 * state.tileSize });
    ticks(state, 80);
    applyCommand(state, "A", { type: "cmd.stop", ids: [plane.id] });
    assert.equal(plane.order?.kind, "move");
    assert.equal(applyCommand(state, "A", { type: "cmd.land", ids: [plane.id] }).ok, true);
    const t = until(state, 900, () => plane.air?.phase === "parked");
    assert.ok(t >= 0, "plane should land");
    assert.equal(plane.x, pad.x);
    assert.equal(plane.y, pad.y);
    assert.equal(plane.order, null);
  });

  it("hardstands sit beside the strip, inside the Airfield, clear of the runway", () => {
    const state = twoPlayerMatch();
    const field = seedAirfield(state);
    const ts = state.tileSize;
    const rw = airfieldRunway(field, ts);
    const x0 = field.tileX * ts;
    const y0 = field.tileY * ts;
    const planeR = catalog("stuka").radius;
    let lastX = -Infinity;
    for (let i = 0; i < AIRFIELD_PADS; i++) {
      const p = airfieldPadWorld(field, i, ts);
      assert.ok(p.x > x0 && p.x < x0 + field.tileW * ts && p.y < y0 + field.tileH * ts, `pad ${i} inside`);
      assert.ok(runwayLocal(rw, p.x, p.y).lateral - planeR > rw.half, `pad ${i} is off the strip`);
      assert.ok(p.x - lastX > planeR * 3, `pad ${i} has room for wings`);
      lastX = p.x;
    }
    assert.ok(rw.u1 - rw.u0 > field.tileH * ts * 1.5, "the strip is long");
  });

  it("takes off from the strip: taxis out of the revetment first, then rolls along the centreline", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    const rw = airfieldRunway(field, ts);
    assert.equal(plane.facing, PARK_HEADING);
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 150 * ts, y: 40 * ts });
    let lift: number | null = null;
    const t = until(state, 120, () => {
      if (lift == null && isAirborne(plane)) lift = runwayLocal(rw, plane.x, plane.y).lateral;
      return plane.air?.phase === "fly";
    });
    assert.ok(t >= 0, "plane should get airborne");
    assert.ok(lift != null && Math.abs(lift) <= rw.half, `lifted off ${lift} off the centreline`);
  });

  it("lands on the strip, rolls out, and taxis nose-in onto its hardstand", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    const rw = airfieldRunway(field, ts);
    const pad = airfieldPadWorld(field, plane.air!.pad, ts);
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 150 * ts, y: 40 * ts });
    until(state, 200, () => plane.air?.phase === "fly");
    ticks(state, 40);
    applyCommand(state, "A", { type: "cmd.land", ids: [plane.id] });
    let touch: { along: number; lateral: number } | null = null;
    const t = until(state, 1500, () => {
      if (touch == null && plane.air?.touched) touch = runwayLocal(rw, plane.x, plane.y);
      return plane.air?.phase === "parked";
    });
    assert.ok(t >= 0, "plane should land and park");
    const at = touch as { along: number; lateral: number } | null;
    assert.ok(at != null && Math.abs(at.lateral) <= rw.half, `touched down ${at?.lateral} off the centreline`);
    assert.ok(at != null && at.along >= rw.u0 - 3 * ts && at.along <= rw.u1 + 3 * ts, `touched down at ${at?.along} along`);
    assert.equal(plane.x, pad.x);
    assert.equal(plane.y, pad.y);
    assert.equal(plane.facing, PARK_HEADING);
  });

  it("comes in from any quarter and still lands on the strip", () => {
    for (let k = 0; k < 8; k++) {
      const state = twoPlayerMatch();
      seedCore(state);
      const field = seedAirfield(state, 90, 110);
      const plane = parkedPlane(state, field);
      const ts = state.tileSize;
      const rw = airfieldRunway(field, ts);
      const ang = (k * Math.PI) / 4;
      const mid = runwayPoint(rw, 0);
      plane.x = mid.x + Math.cos(ang) * 70 * ts;
      plane.y = mid.y + Math.sin(ang) * 70 * ts;
      plane.facing = ang + Math.PI / 2;
      Object.assign(plane.air!, { phase: "fly", alt: AIR_CRUISE_ALT, speed: 1, taxi: false, touched: false });
      plane.order = { kind: "land" };
      let touch: number | null = null;
      const t = until(state, 1500, () => {
        if (touch == null && plane.air?.touched) touch = runwayLocal(rw, plane.x, plane.y).lateral;
        return plane.air?.phase === "parked";
      });
      assert.ok(t >= 0, `from ${k * 45}° the plane should park`);
      assert.ok(touch != null && Math.abs(touch) <= rw.half, `from ${k * 45}° touched ${touch} off the centreline`);
    }
  });

  it("a turned Airfield turns its strip and hardstands, and planes fly it the turned way", () => {
    for (const turn of [Math.PI / 2, Math.PI / 4, (7 * Math.PI) / 6]) {
      const state = twoPlayerMatch();
      seedCore(state);
      const ts = state.tileSize;
      const field = raiseBuilding(state, "A", "airfield", 80, 70, turn);
      const rw = airfieldRunway(field, ts);
      assert.ok(Math.abs(Math.cos(rw.heading - turn) - 1) < 1e-9, "the strip runs along the facing");
      for (let i = 0; i < AIRFIELD_PADS; i++) {
        const p = airfieldPadWorld(field, i, ts);
        assert.equal(occupant(state, Math.floor(p.x / ts), Math.floor(p.y / ts)), field.id, `pad ${i} is on the field`);
      }
      const plane = parkedPlane(state, field);
      assert.ok(Math.abs(plane.facing - parkHeading(field, ts)) < 1e-9, "parks nose to the near side");
      const pad = airfieldPadWorld(field, plane.air!.pad, ts);
      applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 150 * ts, y: 150 * ts });
      let lift: number | null = null;
      assert.ok(
        until(state, 200, () => {
          if (lift == null && isAirborne(plane)) lift = runwayLocal(rw, plane.x, plane.y).lateral;
          return plane.air?.phase === "fly";
        }) >= 0,
        `airborne off the ${Math.round((turn * 180) / Math.PI)}° strip`,
      );
      assert.ok(lift != null && Math.abs(lift) <= rw.half, `lifted off ${lift} off the turned centreline`);
      ticks(state, 40);
      applyCommand(state, "A", { type: "cmd.land", ids: [plane.id] });
      let touch: number | null = null;
      const t = until(state, 2000, () => {
        if (touch == null && plane.air?.touched) touch = runwayLocal(rw, plane.x, plane.y).lateral;
        return plane.air?.phase === "parked";
      });
      assert.ok(t >= 0, `lands on the ${Math.round((turn * 180) / Math.PI)}° strip`);
      assert.ok(touch != null && Math.abs(touch) <= rw.half, `touched ${touch} off the turned centreline`);
      assert.equal(plane.x, pad.x);
      assert.equal(plane.y, pad.y);
      assert.ok(Math.abs(plane.facing - parkHeading(field, ts)) < 1e-9);
    }
  });

  it("a stop on the taxiway sends the plane back to its hardstand", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const pad = airfieldPadWorld(field, plane.air!.pad, state.tileSize);
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 150 * state.tileSize, y: 40 * state.tileSize });
    until(state, 60, () => plane.y < pad.y - 4);
    assert.equal(plane.air?.phase, "takeoff");
    applyCommand(state, "A", { type: "cmd.stop", ids: [plane.id] });
    assert.ok(until(state, 200, () => plane.air?.phase === "parked") >= 0, "back on the pad");
    assert.equal(plane.x, pad.x);
    assert.equal(plane.y, pad.y);
    assert.equal(isAirborne(plane), false);
  });

  it("land on a ground-only selection is refused", () => {
    const state = twoPlayerMatch();
    const u = makeEntity(state, "rifleman", "A", 100, 100);
    assert.equal(applyCommand(state, "A", { type: "cmd.land", ids: [u.id] }).ok, false);
  });

  it("a mixed selection sends the ground units and the plane their own orders", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    const u = makeEntity(state, "rifleman", "A", tileCenter(60, ts), tileCenter(10, ts));
    const r = applyCommand(state, "A", { type: "cmd.move", ids: [plane.id, u.id], x: 70 * ts, y: 20 * ts });
    assert.equal(r.ok, true);
    assert.equal(plane.air?.phase, "takeoff");
    assert.equal(u.order?.kind, "move");
    assert.ok(u.waypoints.length > 0);
  });
});

describe("stuka attack", () => {
  it("dive-bombs a tank: one bomb, a heavy hit, then it heads home to rearm", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedCore(state, "B", 200, 200);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "B", 120 * ts, 60 * ts);
    // A spotter so the side can see the target. A Dynamo survives the Tiger long enough.
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 118, tileY: 64 });
    const hp0 = tank.hp;
    assert.equal(applyCommand(state, "A", { type: "cmd.attack", ids: [plane.id], targetId: tank.id }).ok, true);
    const t = until(state, 900, () => plane.air!.bombs === 0);
    assert.ok(t >= 0, "bomb should drop");
    ticks(state, 15);
    assert.ok(tank.hp < hp0 || !state.entities.has(tank.id), "tank should be hurt");
    // No belts against plate: out of bomb means go home.
    ticks(state, 5);
    assert.equal(plane.order?.kind, "land");
    const landed = until(state, 1500, () => plane.air?.phase === "parked");
    assert.ok(landed >= 0, "plane should land after the run");
    ticks(state, Math.ceil(BOMB_REARM_SECONDS / TICK_DT) + 5);
    assert.equal(plane.air!.bombs, 1, "bomb hung again on the pad");
    plane.air!.fuel = AIR_FUEL_SECONDS;
    plane.air!.rounds = STUKA_MG_ROUNDS;
    ticks(state, 5);
    assert.equal(plane.air?.phase, "parked", "an attack sortie stays on the pad once it has rearmed");
  });

  it("turns for home once the bomb is gone, belts or not", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedCore(state, "B", 200, 200);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    // Soft target: the wing guns could keep at it, but the bomb ends the sortie.
    const foe = makeEntity(state, "rifleman", "B", 110 * ts, 50 * ts);
    // Tough enough to live through the strafe and still be there for the bomb.
    foe.hp = foe.hpMax = 100_000;
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 106, tileY: 54 });
    applyCommand(state, "A", { type: "cmd.attack", ids: [plane.id], targetId: foe.id });
    const t = until(state, 1200, () => plane.air!.bombs === 0);
    assert.ok(t >= 0, "bomb should drop");
    ticks(state, 2);
    assert.ok(plane.air!.rounds > 0, "belts still hold rounds");
    assert.equal(plane.order?.kind, "land");
    // He lived through the strafe. The slower return would sit in his rifle fire, so he steps out of this check.
    foe.hp = 0;
    assert.ok(until(state, 1500, () => plane.air?.phase === "parked") >= 0, "it lands to rearm");
    assert.equal(plane.air!.bombed, true);
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 90 * ts, y: 40 * ts });
    assert.equal(plane.air!.bombed, false, "a new sortie starts clean");
  });

  it("a direct hit takes half a tank; the rim of the burst only wounds", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const x = tileCenter(48, ts);
    const y = tileCenter(48, ts);
    const tank = makeEntity(state, "warden", "B", x, y);
    const man = makeEntity(state, "rifleman", "B", x, y + 4);
    const reach = BOMB_SPLASH_TILES * ts;
    const edgeDist = reach * 0.92;
    const edge = makeEntity(state, "rifleman", "B", x + edgeDist, y);
    burstBomb(state, x, y);
    assert.equal(tank.hp, tank.hpMax - Math.round(tank.hpMax * 0.5), "roof hit takes half the hull");
    assert.ok(tank.hp > 0, "a fresh Tiger survives one bomb");
    assert.equal(man.hp, 0, "a man under the blast dies");
    assert.equal(edge.hp, edge.hpMax - Math.round(70 * mortarFalloff(edgeDist, reach)));
    assert.ok(edge.hp > 0, "the rim wounds a rifleman and leaves him standing");

    const dist = BOMB_DIRECT_TILES * ts * 1.5;
    const near = makeEntity(state, "warden", "B", x, y + ts * 8);
    const before = near.hp;
    burstBomb(state, near.x - dist, near.y);
    const lost = before - near.hp;
    assert.equal(lost, Math.round(near.hpMax * 0.1 * mortarFalloff(dist, reach)));
    assert.ok(lost < near.hpMax * 0.12, `a near miss dents, it took ${lost}`);

    const house = makeEntity(state, "house", "", x + ts * 12, y, { tileX: 60, tileY: 48 });
    burstBomb(state, house.x, house.y);
    assert.equal(house.hp, house.hpMax - 240);
    assert.ok(house.hp > house.hpMax * 0.6, "a house keeps most of its walls");
  });

  it("leaves a crater half as wide as a shell of the same caliber", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    let tx = -1;
    let ty = -1;
    for (let y = 2; y < state.height - 2 && tx < 0; y++) {
      for (let x = 2; x < state.width - 2; x++) {
        if (state.terrain[y * state.width + x] !== TILE_EMPTY) continue;
        const occ = occupant(state, x, y);
        if (occ != null && state.entities.get(occ)?.kind === "building") continue;
        tx = x;
        ty = y;
        break;
      }
    }
    assert.ok(tx >= 0, "open dirt");
    const x = tileCenter(tx, ts);
    const y = tileCenter(ty, ts);
    burstBomb(state, x, y);
    assert.equal(state.holes.length, 1);
    assert.equal(state.holes[0]!.radius, shellHoleRadius(BOMB_CALIBER) * BOMB_HOLE_SCALE);
    assert.equal(state.impacts.at(-1)?.caliber, BOMB_CALIBER);
  });

  it("strafes infantry with the wing guns", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedCore(state, "B", 200, 200);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    plane.air!.bombs = 0;
    const ts = state.tileSize;
    const foe = makeEntity(state, "rifleman", "B", 110 * ts, 50 * ts);
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 106, tileY: 54 });
    applyCommand(state, "A", { type: "cmd.attack", ids: [plane.id], targetId: foe.id });
    const t = until(state, 1200, () => plane.air!.rounds < STUKA_MG_ROUNDS);
    assert.ok(t >= 0, "wing guns should fire");
  });

  it("guard fights the area, and when the ammo is gone it lands, rearms, and comes back", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedCore(state, "B", 200, 200);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    const gx = 110 * ts;
    const gy = 40 * ts;
    const foe = makeEntity(state, "warden", "B", gx, gy);
    makeEntity(state, "rifleman", "A", gx - 2 * ts, gy);
    assert.equal(applyCommand(state, "A", { type: "cmd.guard", ids: [plane.id], x: gx, y: gy, facing: 0 }).ok, true);
    assert.equal(plane.order?.kind, "guard");
    assert.equal(plane.air?.phase, "takeoff");
    assert.deepEqual(plane.air!.guard, { x: gx, y: gy });
    const saw = until(state, 900, () => plane.attackTarget === foe.id);
    assert.ok(saw >= 0, "a guard should fight what it can see in the area");

    plane.air!.bombs = 0;
    plane.air!.rounds = 0;
    plane.air!.fuel = AIR_FUEL_SECONDS;
    ticks(state, 2);
    assert.equal(plane.order?.kind, "land");
    assert.deepEqual(plane.air!.guard, { x: gx, y: gy });

    const landed = until(state, 1500, () => plane.air?.phase === "parked");
    assert.ok(landed >= 0, "it should land to rearm");
    assert.equal(plane.order?.kind, "guard");
    assert.ok(plane.air!.bombs < 1 || plane.air!.rounds < STUKA_MG_ROUNDS || plane.air!.fuel < AIR_FUEL_SECONDS);

    let launchedFull = false;
    const back = until(state, 400, () => {
      if (plane.air?.phase === "parked") return false;
      launchedFull =
        plane.air!.bombs >= 1 && plane.air!.rounds >= STUKA_MG_ROUNDS && plane.air!.fuel >= AIR_FUEL_SECONDS - 1;
      return true;
    });
    assert.ok(back >= 0, "it should take off again");
    assert.equal(launchedFull, true, "it waits for a full bomb, full belts, and a full tank");
    assert.equal(plane.order?.kind, "guard");
    assert.equal(plane.order?.x, gx);
    assert.equal(plane.order?.y, gy);
  });

  it("an empty plane ordered to guard waits on the pad until the load is full", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    plane.air!.bombs = 0;
    plane.air!.rounds = 0;
    plane.air!.fuel = AIR_FUEL_SECONDS;
    const ts = state.tileSize;
    const r = applyCommand(state, "A", { type: "cmd.guard", ids: [plane.id], x: 80 * ts, y: 40 * ts, facing: 1 });
    assert.equal(r.ok, true);
    assert.equal(plane.air?.phase, "parked");
    assert.equal(plane.order?.kind, "guard");
    ticks(state, 5);
    assert.equal(plane.air?.phase, "parked");
    assert.ok(plane.air!.rounds < STUKA_MG_ROUNDS);
  });

  it("a fighter on guard comes back only with every barrage", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = spawnUnit(state, "A", "fw190", field, false);
    assert.ok(plane);
    plane.air!.rounds = 0;
    plane.air!.fuel = AIR_FUEL_SECONDS;
    const ts = state.tileSize;
    applyCommand(state, "A", { type: "cmd.guard", ids: [plane.id], x: 90 * ts, y: 40 * ts, facing: 0 });
    assert.equal(plane.air?.phase, "parked");
    plane.air!.rounds = FW190_BARRAGES - 0.2;
    ticks(state, 3);
    assert.equal(plane.air?.phase, "parked", "a partial last barrage is not a full load");
    plane.air!.rounds = FW190_BARRAGES;
    ticks(state, 1);
    assert.equal(plane.air?.phase, "takeoff");
    assert.equal(plane.order?.kind, "guard");
    assert.equal(plane.air!.rounds, FW190_BARRAGES);
  });

  it("stop, land, and a new move cancel the guard return", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    applyCommand(state, "A", { type: "cmd.guard", ids: [plane.id], x: 80 * ts, y: 40 * ts, facing: 0 });
    assert.ok(plane.air!.guard);
    applyCommand(state, "A", { type: "cmd.stop", ids: [plane.id] });
    assert.equal(plane.air!.guard ?? null, null);
    assert.notEqual(plane.order?.kind, "guard");

    applyCommand(state, "A", { type: "cmd.guard", ids: [plane.id], x: 80 * ts, y: 40 * ts, facing: 0 });
    applyCommand(state, "A", { type: "cmd.land", ids: [plane.id] });
    assert.equal(plane.air!.guard ?? null, null);
    assert.ok(until(state, 200, () => plane.air?.phase === "parked") >= 0, "land should put it back on the pad");

    plane.air!.bombs = 0;
    plane.air!.rounds = 0;
    applyCommand(state, "A", { type: "cmd.guard", ids: [plane.id], x: 80 * ts, y: 40 * ts, facing: 0 });
    assert.equal(plane.air?.phase, "parked");
    assert.deepEqual(plane.air!.guard, { x: 80 * ts, y: 40 * ts });
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 70 * ts, y: 20 * ts });
    assert.equal(plane.air!.guard ?? null, null);
    assert.equal(plane.order?.kind, "move");
    assert.equal(plane.air?.phase, "takeoff");
  });

  it("attack-move finds a target on the way", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    seedCore(state, "B", 200, 200);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    const ts = state.tileSize;
    const foe = makeEntity(state, "warden", "B", 110 * ts, 40 * ts);
    makeEntity(state, "rifleman", "A", 108 * ts, 40 * ts);
    applyCommand(state, "A", { type: "cmd.attackmove", ids: [plane.id], x: 160 * ts, y: 40 * ts });
    const t = until(state, 900, () => plane.attackTarget === foe.id);
    assert.ok(t >= 0);
  });
});

describe("anti-aircraft", () => {
  function planeOver(state: MatchState, x: number, y: number): Entity {
    const plane = makeEntity(state, "stuka", "A", x, y);
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 1;
    plane.order = { kind: "move", x, y };
    return plane;
  }

  it("a tank does not engage a plane in the air", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", "B", 100 * ts, 100 * ts);
    const plane = planeOver(state, 100 * ts + 60, 100 * ts);
    ticks(state, 20);
    assert.notEqual(tank.attackTarget, plane.id);
    assert.equal(plane.hp, plane.hpMax);
  });

  it("rifles bring down a plane that circles low overhead", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const shooters: Entity[] = [];
    for (let i = 0; i < 6; i++) shooters.push(makeEntity(state, "gunner", "B", (100 + i * 2) * ts, 100 * ts));
    for (let i = 0; i < 6; i++) shooters.push(makeEntity(state, "rifleman", "B", (100 + i * 2) * ts, 104 * ts));
    const plane = planeOver(state, 105 * ts, 102 * ts);
    let engaged = false;
    const t = until(state, 1200, () => {
      if (shooters.some((s) => s.attackTarget === plane.id)) engaged = true;
      return plane.wreck;
    });
    assert.ok(engaged, "small arms should take the plane as a target");
    assert.ok(t >= 0, "the plane should go down");
    assert.equal(plane.air, undefined);
    assert.equal(plane.hp, wreckHpOf("stuka"));
    assert.equal(state.entities.has(plane.id), true);
  });

  it("a parked plane is a ground target for a tank", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    // South of the strip, off the Airfield footprint.
    const tank = makeEntity(state, "warden", "B", plane.x + 40, (field.tileY + field.tileH + 6) * state.tileSize);
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [tank.id], targetId: plane.id }).ok, true);
    const t = until(state, 400, () => plane.hp < plane.hpMax || !state.entities.has(plane.id));
    assert.ok(t >= 0, `tank target ${tank.attackTarget}`);
  });
});

describe("fuel", () => {
  it("heads home before the tank is dry", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    applyCommand(state, "A", { type: "cmd.move", ids: [plane.id], x: 200 * state.tileSize, y: 200 * state.tileSize });
    until(state, 120, () => plane.air?.phase === "fly");
    plane.air!.fuel = 8;
    ticks(state, 2);
    assert.equal(plane.order?.kind, "land");
  });

  it("goes down when the fuel runs out with no pad to reach", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const plane = makeEntity(state, "stuka", "A", 100 * ts, 100 * ts);
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.fuel = 1;
    plane.order = { kind: "move", x: plane.x, y: plane.y };
    const falling = until(state, 40, () => plane.air?.phase === "crash");
    assert.ok(falling >= 0, "a dry tank starts the fall");
    assert.equal(state.entities.has(plane.id), true);
    const down = until(state, 200, () => plane.wreck);
    assert.ok(down >= 0, "the fall ends as a wreck");
    assert.equal(plane.air, undefined);
    assert.equal(plane.hp, wreckHpOf("stuka"));
  });

  it("refuels on the pad", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    makeEntity(state, "dynamo", "A", 0, 0, { tileX: 60, tileY: 4 });
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    plane.air!.fuel = 10;
    ticks(state, 20);
    assert.ok(plane.air!.fuel > 10);
  });
});

describe("aircraft crash", () => {
  /** Ground with no hull and no building close enough to catch a falling plane. */
  function openGround(state: MatchState): { x: number; y: number } {
    const ts = state.tileSize;
    const pad = ts * 8;
    for (let ty = 24; ty < state.height - 24; ty += 5) {
      for (let tx = 24; tx < state.width - 24; tx += 5) {
        const x = tileCenter(tx, ts);
        const y = tileCenter(ty, ts);
        let busy = false;
        for (const e of state.entities.values()) {
          if (e.kind === "building") {
            const b = buildingBounds(e, ts);
            if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) busy = true;
          } else if (Math.hypot(e.x - x, e.y - y) < pad) busy = true;
        }
        if (!busy) return { x, y };
      }
    }
    throw new Error("no open ground");
  }

  function aloft(state: MatchState, x: number, y: number, alt: number): Entity {
    const plane = makeEntity(state, "stuka", "A", x, y);
    plane.air!.phase = "fly";
    plane.air!.alt = alt;
    plane.air!.speed = 1;
    plane.facing = 0;
    plane.order = { kind: "move", x, y };
    return plane;
  }

  it("falls indestructible instead of exploding, then wanders down into a wreck", () => {
    const state = twoPlayerMatch();
    const spot = openGround(state);
    const plane = aloft(state, spot.x, spot.y, 40);
    plane.hp = 0;
    step(state, TICK_DT);
    assert.equal(plane.air?.phase, "crash");
    assert.equal(plane.hp, 1);
    assert.equal(takeDamage(plane, 400, state.tick), 0);
    assert.equal(plane.hp, 1);
    const view = snapshotFor(state, "A").entities.find((e) => e.id === plane.id);
    assert.equal(view?.air?.phase, "crash");
    const facing0 = plane.facing;
    const x0 = plane.x;
    const y0 = plane.y;
    ticks(state, 8);
    assert.equal(plane.wreck, false);
    assert.ok((plane.air?.alt ?? 0) < 40, "it is losing height");
    let d = plane.facing - facing0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    assert.ok(Math.abs(d) > 0.05, `nose should leave its heading, turned ${d.toFixed(3)} rad`);
    const reach = AIR_CRASH_RANGE_MAX * state.tileSize + 1;
    let far = Math.hypot(plane.x - x0, plane.y - y0);
    const down = until(state, 250, () => {
      far = Math.max(far, Math.hypot(plane.x - x0, plane.y - y0));
      return plane.wreck;
    });
    assert.ok(down >= 0, "it should meet the ground");
    assert.ok(far <= reach, `glided ${far.toFixed(0)}px, max ${reach.toFixed(0)}`);
    assert.equal(plane.air, undefined);
    assert.equal(plane.hp, wreckHpOf("stuka"));
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === plane.id)?.air, undefined);
  });

  it("does not hurt a soldier it is still high above", () => {
    const state = twoPlayerMatch();
    const spot = openGround(state);
    const plane = aloft(state, spot.x, spot.y, AIR_CRUISE_ALT);
    const man = makeEntity(state, "rifleman", "B", plane.x, plane.y);
    const hp = man.hp;
    plane.hp = 0;
    step(state, TICK_DT);
    assert.equal(plane.air?.phase, "crash");
    assert.equal(man.hp, hp);
  });

  it("kills a soldier it falls onto and keeps going", () => {
    const state = twoPlayerMatch();
    const spot = openGround(state);
    const plane = aloft(state, spot.x, spot.y, 2.5);
    const man = makeEntity(state, "rifleman", "A", plane.x, plane.y);
    plane.hp = 0;
    ticks(state, 2);
    assert.ok(man.hp <= 0, "the man under the airframe dies");
    assert.equal(plane.wreck, false);
    assert.equal(plane.air?.phase, "crash");
    assert.ok((plane.air?.alt ?? 0) > 0);
  });

  it("breaks a tank it comes down on, and the airframe stops as a wreck", () => {
    const state = twoPlayerMatch();
    const spot = openGround(state);
    const plane = aloft(state, spot.x, spot.y, coverHeightOf("warden"));
    const tank = makeEntity(state, "warden", "B", plane.x, plane.y);
    const before = tank.hp;
    plane.hp = 0;
    ticks(state, 2);
    assert.ok(before - tank.hp >= Math.round(tank.hpMax * 0.8), `tank hp ${tank.hp}/${before}`);
    if (hasTracks("warden")) assert.ok(tank.crits.includes("tracks"));
    assert.equal(plane.wreck, true);
    assert.equal(plane.air, undefined);
    assert.equal(plane.hp, wreckHpOf("stuka"));
  });

  it("smashes a house and stops on it", () => {
    const state = twoPlayerMatch();
    const spot = openGround(state);
    const ts = state.tileSize;
    const plane = aloft(state, spot.x, spot.y, coverHeightOf("house"));
    const tx = plane.tileX;
    const ty = plane.tileY;
    const house = makeEntity(state, "house", "", tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
    plane.hp = 0;
    ticks(state, 2);
    assert.equal(house.hp, house.hpMax - AIR_CRASH_BUILDING_DAMAGE);
    assert.equal(plane.wreck, true);
    assert.equal(plane.air, undefined);
  });

  it("some wrecks come down nearby and some glide much farther", () => {
    const state = twoPlayerMatch();
    const ts = state.tileSize;
    const x = (state.width * ts) / 2;
    const y = (state.height * ts) / 2;
    for (const e of [...state.entities.values()]) {
      if (e.type !== "rig") state.entities.delete(e.id);
    }
    const planes: Entity[] = [];
    for (let i = 0; i < 12; i++) planes.push(aloft(state, x, y, AIR_CRUISE_ALT));
    for (const p of planes) p.hp = 0;
    const down = until(state, 80, () => planes.every((p) => p.wreck));
    assert.ok(down >= 0, "every airframe should meet the ground");
    const dists = planes.map((p) => Math.hypot(p.x - x, p.y - y));
    const near = Math.min(...dists);
    const far = Math.max(...dists);
    assert.ok(far > near * 3, `distances should spread, nearest ${near.toFixed(0)} farthest ${far.toFixed(0)}`);
    assert.ok(near < AIR_CRASH_RANGE_MIN * ts * 4, `a short fall stays close (${near.toFixed(0)})`);
    assert.ok(far > AIR_CRASH_RANGE_MAX * ts * 0.5, `a long glide runs out (${far.toFixed(0)})`);
    for (const d of dists) assert.ok(d <= AIR_CRASH_RANGE_MAX * ts + 1, `glided ${d.toFixed(0)}`);
  });

  it("still removes a plane that dies on the pad", () => {
    const state = twoPlayerMatch();
    seedCore(state);
    const field = seedAirfield(state);
    const plane = parkedPlane(state, field);
    assert.equal(isAirborne(plane), false);
    plane.hp = 0;
    step(state, TICK_DT);
    assert.equal(state.entities.has(plane.id), false);
  });
});
