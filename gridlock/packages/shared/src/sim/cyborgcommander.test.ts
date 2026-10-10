import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMANDER_HP_REGEN_PER_SEC,
  COMMANDER_RANGE_TILES,
  CYBORG_LEGS_LOST_HP,
  FORCE_FIELD_DELAY,
  FORCE_FIELD_DIVERT_MUL,
  FORCE_FIELD_DOWN_DELAY,
  FORCE_FIELD_HP,
  FORCE_FIELD_REGEN_PER_SEC,
  LASER,
  LASER_FIRE_RADIUS,
  LASER_ARMOR_DAMAGE,
  factionDamage,
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
import { beamLength, fireLaser, tickForceFields, tickLasers } from "./laser.js";
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
  it("is an Alliance cyborg from the Cyborg Central with a force field and a cutting laser", () => {
    const def = catalog("cyborgcommander");
    assert.equal(def.name, "Cyborg Commander");
    assert.equal(def.cost, 5000);
    assert.ok(TRAIN_TYPES.includes("cyborgcommander"));
    assert.equal(producerType("cyborgcommander"), "cyborgcentral");
    assert.equal(TECH_REQUIRES.cyborgcommander, "cyborgcentral");
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
    // The plating mends itself, but only slowly.
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

  it("sweeps soldiers at full reach: burns every soldier the beam passes, friend or foe, spares the flanks, and leaves a line of fire", () => {
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
    const xeno = at(state, "cyborg", b, x, y, -LASER_SWEEP_HALF_DEG * 0.3, range * 0.7);
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
    for (const dead of [target, inArc, nearArc, friend]) {
      assert.equal(dead.hp, 0, `${dead.type} of ${dead.ownerId} burned`);
      assert.equal(dead.fireDeath, true);
    }
    for (const alive of [flank, beyond]) assert.equal(alive.hp, alive.hpMax, `${alive.type} spared`);
    assert.equal(xeno.hp, xeno.hpMax - factionDamage("cyborgcommander", LASER_SWEEP_CYBORG_DAMAGE), "a cyborg's plating takes a heavy cut");
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
    assert.equal(tank.hp, tank.hpMax - factionDamage("cyborgcommander", LASER_ARMOR_DAMAGE));
    runBeam(state, cmd);
    assert.equal(bystander.hp, bystander.hpMax, "the line does not sweep");
  });

  it("burns the soldiers standing on a straight beam, his own too", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const range = COMMANDER_RANGE_TILES * ts;
    const cmd = makeEntity(state, "cyborgcommander", a, x, y);
    const tank = at(state, "ss3", b, x, y, 0, range * 0.7);
    const ownMan = at(state, "rifleman", a, x, y, 0, range * 0.3);
    const foeMan = at(state, "gunner", b, x, y, 0, range * 0.5);
    const ownXeno = at(state, "cyborg", a, x, y, 0, range * 0.4);
    const aside = at(state, "rifleman", a, x, y, 20, range * 0.4);
    const behind = at(state, "rifleman", a, x, y, 0, range * 0.85);
    fireLaser(state, cmd, tank.x, tank.y, range, tank);
    assert.ok(cmd.laser?.line);
    for (const dead of [ownMan, foeMan]) assert.equal(dead.hp, 0, `${dead.type} of ${dead.ownerId} burned`);
    assert.equal(ownXeno.hp, ownXeno.hpMax - factionDamage("cyborgcommander", LASER_SWEEP_CYBORG_DAMAGE), "his own Cyborg takes the heavy cut");
    assert.equal(aside.hp, aside.hpMax, "off the line");
    assert.equal(behind.hp, behind.hpMax, "past the target the beam has stopped");
    assert.equal(tank.hp, tank.hpMax - factionDamage("cyborgcommander", LASER_ARMOR_DAMAGE));
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

  it("burns down every tree the beam crosses, sweep or line, and leaves the rest standing", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const range = COMMANDER_RANGE_TILES * ts;
    const plant = (deg: number, dist: number): { tx: number; ty: number } => {
      const r = (deg * Math.PI) / 180;
      const tx = Math.floor((x + Math.cos(r) * dist) / ts);
      const ty = Math.floor((y + Math.sin(r) * dist) / ts);
      state.terrain[ty * state.width + tx] = TILE_TREE;
      return { tx, ty };
    };
    const standing = (t: { tx: number; ty: number }) => state.terrain[t.ty * state.width + t.tx] === TILE_TREE;
    const inSweep = [plant(LASER_SWEEP_HALF_DEG * 0.8, range * 0.3), plant(-LASER_SWEEP_HALF_DEG * 0.5, range * 0.9), plant(4, range * 0.6)];
    const flank = plant(LASER_SWEEP_HALF_DEG * 2.5, range * 0.5);
    const pastReach = plant(0, range * 1.2);
    const cmd = makeEntity(state, "cyborgcommander", a, x, y);
    cmd.facing = 0;
    const target = at(state, "rifleman", b, x, y, 0, range * 0.45);
    cmd.order = { kind: "attack", targetId: target.id };
    const fires0 = state.fires.length;
    tickCombat(state, TICK_DT);
    runBeam(state, cmd);
    for (const t of inSweep) assert.equal(standing(t), false, `tree at ${t.tx},${t.ty} burned`);
    assert.equal(standing(flank), true, "a tree off the arc stands");
    assert.equal(standing(pastReach), true, "a tree past full reach stands");
    assert.ok(state.clearedTrees.filter((c) => c.burn).length >= inSweep.length);
    assert.ok(state.fires.length > fires0);

    // The line on a hull: trees between him and it go up too.
    const tank = at(state, "ss3", b, x, y, 180, range * 0.7);
    const between = plant(180, range * 0.35);
    cmd.order = { kind: "attack", targetId: tank.id };
    cmd.reload = 0;
    cmd.clip = 1;
    cmd.cooldown = 0;
    cmd.facing = Math.PI;
    tickCombat(state, TICK_DT);
    assert.ok(cmd.laser?.line, "a line on the hull");
    assert.equal(standing(between), false, "the tree on the line burned");
  });

  it("mends his plating very slowly, a whole point at a time, up to full", () => {
    const { state, a } = match();
    const cmd = makeEntity(state, "cyborgcommander", a, tileCenter(20, state.tileSize), tileCenter(20, state.tileSize));
    cmd.hp = 200;
    const seconds = 20;
    for (let i = 0; i < secondsToTicks(seconds); i++) {
      state.tick++;
      tickForceFields(state, TICK_DT);
    }
    assert.equal(cmd.hp, 200 + seconds * COMMANDER_HP_REGEN_PER_SEC);
    assert.equal(Number.isInteger(cmd.hp), true);
    cmd.hp = cmd.hpMax - 1;
    for (let i = 0; i < secondsToTicks(10); i++) {
      state.tick++;
      tickForceFields(state, TICK_DT);
    }
    assert.equal(cmd.hp, cmd.hpMax);
  });

  it("puts the laser's power into the field: five times the points, five times the recharge", () => {
    const { state, a, b } = match();
    const cmd = makeEntity(state, "cyborgcommander", a, tileCenter(20, state.tileSize), tileCenter(20, state.tileSize));
    const big = FORCE_FIELD_HP * FORCE_FIELD_DIVERT_MUL;
    assert.equal(applyCommand(state, a, { type: "cmd.fielddivert", ids: [cmd.id], on: true }).ok, true);
    assert.equal(cmd.fieldDivert, true);
    assert.equal(snapshotFor(state, a).entities.find((e) => e.id === cmd.id)?.fieldDivert, true);
    assert.equal(snapshotFor(state, b).entities.find((e) => e.id === cmd.id)?.fieldDivert, undefined, "the enemy is not told");

    // One quiet tick past full: it climbs at the boosted rate toward the boosted cap.
    const f0 = cmd.field ?? 0;
    state.tick++;
    tickForceFields(state, TICK_DT);
    assert.ok(Math.abs((cmd.field ?? 0) - (f0 + FORCE_FIELD_REGEN_PER_SEC * FORCE_FIELD_DIVERT_MUL * TICK_DT)) < 1e-9);
    for (let i = 0; i < secondsToTicks(10); i++) {
      state.tick++;
      tickForceFields(state, TICK_DT);
    }
    assert.equal(cmd.field, big);
    assert.equal(snapshotFor(state, a).entities.find((e) => e.id === cmd.id)?.field?.max, big);

    // A hit the normal field could not hold stays off his HP.
    const hp0 = cmd.hp;
    assert.equal(takeDamage(cmd, FORCE_FIELD_HP * 3, state.tick), 0);
    assert.equal(cmd.hp, hp0);

    // Back to the laser: the surplus bleeds off at once, and the normal rate returns.
    cmd.field = big;
    assert.equal(applyCommand(state, a, { type: "cmd.fielddivert", ids: [cmd.id], on: false }).ok, true);
    assert.equal(cmd.fieldDivert, undefined);
    assert.equal(cmd.field, FORCE_FIELD_HP);
  });

  it("cannot attack while the field has the laser's power, and fires again once it is back", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const x = tileCenter(20, ts);
    const y = tileCenter(60, ts);
    const cmd = makeEntity(state, "cyborgcommander", a, x, y);
    cmd.facing = 0;
    const tank = at(state, "ss3", b, x, y, 0, COMMANDER_RANGE_TILES * ts * 0.6);
    cmd.order = { kind: "attack", targetId: tank.id };
    assert.equal(applyCommand(state, a, { type: "cmd.fielddivert", ids: [cmd.id], on: true }).ok, true);
    assert.equal(cmd.order?.kind, undefined, "the attack order is dropped");

    // A new order to fire is not taken, and an enemy in reach, even one he was told to shoot, is not shot.
    applyCommand(state, a, { type: "cmd.attack", ids: [cmd.id], targetId: tank.id });
    assert.notEqual(cmd.order?.kind, "attack");
    cmd.order = { kind: "attack", targetId: tank.id };
    for (let i = 0; i < 3; i++) tickCombat(state, TICK_DT);
    assert.equal(!!cmd.laser, false);
    assert.equal(tank.hp, tank.hpMax);

    assert.equal(applyCommand(state, a, { type: "cmd.fielddivert", ids: [cmd.id], on: false }).ok, true);
    cmd.order = { kind: "attack", targetId: tank.id };
    tickCombat(state, TICK_DT);
    assert.ok(cmd.laser?.line, "the laser cuts again");
    assert.equal(tank.hp, tank.hpMax - factionDamage("cyborgcommander", LASER_ARMOR_DAMAGE));
  });

  it("only a Cyborg Commander of yours takes the field order", () => {
    const { state, a, b } = match();
    const cmd = makeEntity(state, "cyborgcommander", a, tileCenter(20, state.tileSize), tileCenter(20, state.tileSize));
    const cy = makeEntity(state, "cyborg", a, tileCenter(22, state.tileSize), tileCenter(20, state.tileSize));
    assert.equal(applyCommand(state, b, { type: "cmd.fielddivert", ids: [cmd.id], on: true }).ok, false);
    assert.equal(applyCommand(state, a, { type: "cmd.fielddivert", ids: [cy.id], on: true }).ok, false);
    assert.equal(cmd.fieldDivert, undefined);
    assert.equal(cy.fieldDivert, undefined);
  });
});
