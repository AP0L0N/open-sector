import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMANDER_RANGE_TILES,
  CYBORG_LEGS_LOST_HP,
  FORCE_FIELD_DELAY,
  FORCE_FIELD_DOWN_DELAY,
  FORCE_FIELD_HP,
  LASER,
  LASER_FIRE_RADIUS,
  LASER_LINE_DAMAGE,
  LASER_SWEEP_CYBORG_DAMAGE,
  LASER_SWEEP_HALF_DEG,
  TECH_REQUIRES,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  hasCrit,
  hasForceField,
  infantryLoadout,
  isCivilianType,
  isCyborg,
  isRepairableUnit,
  secondsToTicks,
  stanceOf,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickCombat } from "./combat.js";
import { takeDamage } from "./crits.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { beamLength, tickForceFields, tickLasers } from "./laser.js";
import { createMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "CC", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
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
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type) || e.type === "rig") destroyEntity(state, e);
  }
  return { state, a: "A", b: "B" };
}

/** A unit `dist` world px from (x, y) along `deg`. */
function at(state: MatchState, type: Entity["type"], owner: string, x: number, y: number, deg: number, dist: number): Entity {
  const a = (deg * Math.PI) / 180;
  return makeEntity(state, type, owner, x + Math.cos(a) * dist, y + Math.sin(a) * dist);
}

/** Run the beam out: tickLasers each tick until it has gone out. */
function runBeam(state: MatchState, cmd: Entity): void {
  for (let i = 0; i < 20 && cmd.laser; i++) {
    tickLasers(state);
    state.tick++;
  }
}

describe("cyborg commander", () => {
  it("is a research-gated Armory cyborg with a force field and a cutting laser", () => {
    const def = catalog("cyborgcommander");
    assert.equal(def.name, "Cyborg Commander");
    assert.ok(TRAIN_TYPES.includes("cyborgcommander"));
    assert.equal(producerType("cyborgcommander"), "armory");
    assert.equal(TECH_REQUIRES.cyborgcommander, "research");
    assert.equal(isCyborg("cyborgcommander"), true);
    assert.equal(isRepairableUnit("cyborgcommander"), true);
    assert.equal(hasForceField("cyborgcommander"), true);
    assert.equal(hasForceField("cyborg"), false);
    assert.deepEqual(infantryLoadout("cyborgcommander").map((g) => g.id), ["laser"]);
    assert.ok(COMMANDER_RANGE_TILES > catalog("cyborg").rangeTiles, "reaches past the gatling");
    const { state, a, b } = match();
    const cmd = makeEntity(state, "cyborgcommander", a, tileCenter(20, state.tileSize), tileCenter(20, state.tileSize));
    assert.equal(cmd.field, FORCE_FIELD_HP);
    assert.equal(cmd.clip, LASER.clip);
    const seen = snapshotFor(state, a).entities.find((v) => v.id === cmd.id);
    assert.deepEqual(seen?.field, { hp: FORCE_FIELD_HP, max: FORCE_FIELD_HP });
  });

  it("the force field takes every hit before his HP, then recharges after a quiet spell", () => {
    const { state, a } = match();
    const cmd = makeEntity(state, "cyborgcommander", a, tileCenter(20, state.tileSize), tileCenter(20, state.tileSize));
    const hp0 = cmd.hp;
    assert.equal(takeDamage(cmd, 150, state.tick), 0);
    assert.equal(cmd.hp, hp0);
    assert.equal(cmd.field, FORCE_FIELD_HP - 150);
    assert.equal(takeDamage(cmd, 100, state.tick), 100 - (FORCE_FIELD_HP - 150));
    assert.equal(cmd.field, 0);
    assert.equal(cmd.hp, hp0 - (100 - (FORCE_FIELD_HP - 150)));

    // Knocked flat, it waits the longer delay.
    const hitAt = state.tick;
    for (let i = 0; i < secondsToTicks(FORCE_FIELD_DELAY) + 1; i++) {
      state.tick++;
      tickForceFields(state, TICK_DT);
    }
    assert.equal(cmd.field, 0, "still down after the short delay");
    while (state.tick - hitAt < secondsToTicks(FORCE_FIELD_DOWN_DELAY) + 1) {
      state.tick++;
      tickForceFields(state, TICK_DT);
    }
    assert.ok((cmd.field ?? 0) > 0, "coming back on");
    for (let i = 0; i < 100; i++) {
      state.tick++;
      tickForceFields(state, TICK_DT);
    }
    assert.equal(cmd.field, FORCE_FIELD_HP);
    // The plating does not heal on its own.
    assert.ok(cmd.hp < hp0);
  });

  it("still loses his legs and crawls once the plating is badly cut", () => {
    const { state, a } = match();
    const cmd = makeEntity(state, "cyborgcommander", a, tileCenter(20, state.tileSize), tileCenter(20, state.tileSize));
    takeDamage(cmd, FORCE_FIELD_HP + cmd.hpMax * (1 - CYBORG_LEGS_LOST_HP) + 5, state.tick);
    assert.ok(cmd.hp > 0);
    assert.equal(hasCrit(cmd, "leg"), true);
    assert.equal(stanceOf(cmd), "crawl");
    assert.equal(applyCommand(state, a, { type: "cmd.stance", ids: [cmd.id], stance: "crouch" }).ok, false);
  });

  it("sweeps soldiers at full reach: burns every enemy the beam passes, spares friends and the flanks, and leaves a line of fire", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const range = COMMANDER_RANGE_TILES * ts;
    const cmd = makeEntity(state, "cyborgcommander", a, x, y);
    cmd.facing = 0;
    const target = at(state, "rifleman", b, x, y, 0, range * 0.5);
    const inArc = at(state, "gunner", b, x, y, LASER_SWEEP_HALF_DEG * 0.7, range * 0.85);
    const nearArc = at(state, "rifleman", b, x, y, -LASER_SWEEP_HALF_DEG * 0.6, range * 0.25);
    const flank = at(state, "rifleman", b, x, y, LASER_SWEEP_HALF_DEG * 2.5, range * 0.6);
    const beyond = at(state, "rifleman", b, x, y, 0, range * 1.3);
    const friend = at(state, "rifleman", a, x, y, -LASER_SWEEP_HALF_DEG * 0.85, range * 0.5);
    const borg = at(state, "cyborg", b, x, y, -LASER_SWEEP_HALF_DEG * 0.3, range * 0.7);
    cmd.order = { kind: "attack", targetId: target.id };
    tickCombat(state, TICK_DT);
    assert.ok(cmd.laser, "the sweep started");
    assert.equal(cmd.laser.line, undefined);
    assert.equal(cmd.clip, 0, "the emitter recharges");
    assert.ok(cmd.reload > 0);
    assert.ok(Math.abs(Math.abs(cmd.laser.a1 - cmd.laser.a0) - (2 * LASER_SWEEP_HALF_DEG * Math.PI) / 180) < 1e-9);
    for (const len of cmd.laser.lens) assert.ok(Math.abs(len - range) <= 1, `full reach ${len} vs ${range}`);
    const fires0 = state.fires.length;
    runBeam(state, cmd);
    assert.equal(cmd.laser, undefined, "the beam went out");
    for (const dead of [target, inArc, nearArc]) {
      assert.equal(dead.hp, 0, `${dead.type} burned`);
      assert.equal(dead.fireDeath, true);
    }
    for (const alive of [flank, beyond, friend]) assert.equal(alive.hp, alive.hpMax, `${alive.type} spared`);
    assert.equal(borg.hp, borg.hpMax - LASER_SWEEP_CYBORG_DAMAGE, "a cyborg's plating takes a heavy cut");
    assert.ok(state.impacts.some((i) => i.laser && i.kind === "kill"));

    // The cut at the tip: a run of small fires along the arc at full reach.
    const cut = state.fires.slice(fires0);
    assert.ok(cut.length >= 5, `fires ${cut.length}`);
    for (const f of cut) {
      assert.ok(Math.abs(Math.hypot(f.x - x, f.y - y) - range) < 2, "on the arc at full reach");
      assert.ok(f.radius <= LASER_FIRE_RADIUS * 1.2, "small");
    }
  });

  it("alternates the sweep direction shot to shot", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const cmd = makeEntity(state, "cyborgcommander", a, x, y);
    cmd.facing = 0;
    const target = at(state, "cyborg", b, x, y, 0, COMMANDER_RANGE_TILES * ts * 0.5);
    cmd.order = { kind: "attack", targetId: target.id };
    tickCombat(state, TICK_DT);
    const first = Math.sign(cmd.laser!.a1 - cmd.laser!.a0);
    runBeam(state, cmd);
    cmd.reload = 0;
    cmd.clip = 1;
    cmd.cooldown = 0;
    tickCombat(state, TICK_DT);
    assert.ok(cmd.laser);
    assert.equal(Math.sign(cmd.laser.a1 - cmd.laser.a0), -first);
  });

  it("puts one straight beam on a hull and cuts it for moderate damage from any face", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const cmd = makeEntity(state, "cyborgcommander", a, x, y);
    cmd.facing = 0;
    const tank = at(state, "ss3", b, x, y, 0, COMMANDER_RANGE_TILES * ts * 0.6);
    tank.facing = Math.PI; // nose on: the thickest plate
    const bystander = at(state, "rifleman", b, x, y, 6, COMMANDER_RANGE_TILES * ts * 0.4);
    cmd.order = { kind: "attack", targetId: tank.id };
    tickCombat(state, TICK_DT);
    assert.ok(cmd.laser?.line, "a line, not a sweep");
    assert.equal(tank.hp, tank.hpMax - LASER_LINE_DAMAGE);
    runBeam(state, cmd);
    assert.equal(bystander.hp, bystander.hpMax, "the line does not sweep");
  });

  it("is stopped by a building in the way", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const cmd = makeEntity(state, "cyborgcommander", a, x, y);
    const range = COMMANDER_RANGE_TILES * ts;
    const house = makeEntity(state, "dynamo", b, x + range * 0.5, y, { tileX: Math.floor((x + range * 0.5) / ts), tileY: Math.floor(y / ts) });
    const d = catalog("dynamo");
    for (let ty = house.tileY; ty < house.tileY + d.tileH; ty++) {
      for (let tx = house.tileX; tx < house.tileX + d.tileW; tx++) state.occupy[ty * state.width + tx] = house.id;
    }
    const len = beamLength(state, cmd, 0, range);
    assert.ok(len < range * 0.55, `stopped at ${len} of ${range}`);
    assert.equal(beamLength(state, cmd, Math.PI, range), range, "open the other way");
  });
});
