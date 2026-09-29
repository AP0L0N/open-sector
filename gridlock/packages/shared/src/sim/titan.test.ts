import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalog,
  hpMaxOf,
  specialLabel,
  START_UNITS,
  TICK_DT,
  TITAN_BRACE_SECONDS,
  TITAN_BRACED_HP_MUL,
  TITAN_WADE_SPEED,
  TRAIN_TYPES,
} from "../catalog.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { moveSpeedMul } from "./crits.js";
import { makeEntity, tileCenter, unitInWater, walkable } from "./geo.js";
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
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
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
function firedBy(state: MatchState, e: Entity): boolean {
  const full = Object.values(catalog(e.type).ammo ?? {}).reduce((n, v) => n + (v ?? 0), 0);
  const left = Object.values(e.ammo).reduce((n, v) => n + (v ?? 0), 0);
  return left < full || state.projectiles.some((p) => p.fromId === e.id);
}

const BRACE_TICKS = Math.ceil(TITAN_BRACE_SECONDS / TICK_DT) + 2;

describe("titan", () => {
  it("is an Armory walker with the Tiger's gun and heavier armor", () => {
    const titan = catalog("titan");
    const tiger = catalog("warden");
    assert.ok(TRAIN_TYPES.includes("titan"));
    assert.equal(START_UNITS.includes("titan"), false, "opening army stays the same");
    assert.equal(producerType("titan"), "armory");
    assert.equal(titan.penetration, tiger.penetration);
    assert.equal(titan.caliber, tiger.caliber);
    assert.equal(titan.damage, tiger.damage);
    assert.equal(titan.rangeTiles, tiger.rangeTiles);
    assert.deepEqual(titan.ammo, tiger.ammo);
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

  it("cannot fire from the water and resumes on land", () => {
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
    for (let i = 0; i < 60; i++) {
      step(state, TICK_DT);
      assert.equal(firedBy(state, titan), false, "must not fire while wading");
    }
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === titan.id)?.wading, true);

    titan.x = tileCenter(92, ts);
    titan.tileX = 92;
    titan.waypoints = [];
    assert.equal(unitInWater(state, titan), false);
    applyCommand(state, "A", { type: "cmd.attack", ids: [titan.id], targetId: tank.id });
    let fired = false;
    for (let i = 0; i < 60 && !fired; i++) {
      step(state, TICK_DT);
      fired = firedBy(state, titan);
    }
    assert.ok(fired, "fires once back on land");
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
      fired = firedBy(state, titan);
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
