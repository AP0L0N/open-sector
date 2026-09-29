import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  AIR_CRUISE_ALT,
  AIR_FUEL_SECONDS,
  AIRFIELD_PADS,
  BOMB_REARM_SECONDS,
  START_UNITS,
  STUKA_MG_ROUNDS,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
} from "../catalog.js";
import { airfieldPadWorld, airfieldRunway, isAirborne, PARK_HEADING } from "./air.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { spawnUnit } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "AIR1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value, { startingUnits: false });
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
    assert.ok(!START_UNITS.includes("stuka"));
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
      assert.ok(p.y - planeR > rw.y + rw.half, `pad ${i} is off the strip`);
      assert.ok(p.x - lastX > planeR * 3, `pad ${i} has room for wings`);
      lastX = p.x;
    }
    assert.ok(rw.x1 - rw.x0 > field.tileH * ts * 1.5, "the strip is long");
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
    let liftY: number | null = null;
    const t = until(state, 120, () => {
      if (liftY == null && isAirborne(plane)) liftY = plane.y;
      return plane.air?.phase === "fly";
    });
    assert.ok(t >= 0, "plane should get airborne");
    assert.ok(liftY != null && Math.abs(liftY - rw.y) <= rw.half, `lifted off at y ${liftY}, strip ${rw.y}`);
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
    let touchY: number | null = null;
    let touchX: number | null = null;
    const t = until(state, 1500, () => {
      if (touchY == null && plane.air?.touched) {
        touchY = plane.y;
        touchX = plane.x;
      }
      return plane.air?.phase === "parked";
    });
    assert.ok(t >= 0, "plane should land and park");
    assert.ok(touchY != null && Math.abs(touchY - rw.y) <= rw.half, `touched down at y ${touchY}`);
    assert.ok(touchX != null && touchX >= rw.x0 - 3 * ts && touchX <= rw.x1 + 3 * ts, `touched down at x ${touchX}`);
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
      plane.x = rw.cx + Math.cos(ang) * 70 * ts;
      plane.y = rw.y + Math.sin(ang) * 70 * ts;
      plane.facing = ang + Math.PI / 2;
      Object.assign(plane.air!, { phase: "fly", alt: AIR_CRUISE_ALT, speed: 1, taxi: false, touched: false });
      plane.order = { kind: "land" };
      let touchY: number | null = null;
      const t = until(state, 1500, () => {
        if (touchY == null && plane.air?.touched) touchY = plane.y;
        return plane.air?.phase === "parked";
      });
      assert.ok(t >= 0, `from ${k * 45}° the plane should park`);
      assert.ok(touchY != null && Math.abs(touchY - rw.y) <= rw.half, `from ${k * 45}° touched at ${touchY}`);
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
      return !state.entities.has(plane.id);
    });
    assert.ok(engaged, "small arms should take the plane as a target");
    assert.ok(t >= 0, "the plane should go down");
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
    ticks(state, 20);
    assert.equal(state.entities.has(plane.id), false);
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
