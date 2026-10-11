import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIMUNIT_BLINK_RANGE_TILES,
  SIMUNIT_BLINK_RECHARGE_SECONDS,
  SIMUNIT_PURGE_SECONDS,
  SIMUNIT_REACH_TILES,
  SIMUNIT_SLASH_DAMAGE,
  TECH_REQUIRES,
  TICK_DT,
  TRAIN_TYPES,
  HEIGHT_MAX,
  canPowerDown,
  catalog,
  infantryGunFor,
  isCivilianType,
  isCyborg,
  isInfantryType,
  secondsToTicks,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { enterGarrison } from "./garrison.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { weaponRangeWorld } from "./elevation.js";
import { blinkCharge, gapTo, purgeDenied } from "./simunit.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "SU", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
  // Both sides keep their cyborgs linked: a powered Cyborg Central each.
  central(state, "A", 6, 6);
  central(state, "B", 6, 50);
  return { state, a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function central(state: MatchState, playerId: string, tx: number, ty: number): void {
  const ts = state.tileSize;
  makeEntity(state, "cyborgcentral", playerId, tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
  makeEntity(state, "dynamo", playerId, tileCenter(tx, ts), tileCenter(ty + 6, ts), { tileX: tx, tileY: ty + 6 });
}

function unit(state: MatchState, type: "simunit2" | "cyborg" | "rifleman" | "walker" | "warden" | "cyborgcommander", playerId: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, playerId, tileCenter(tx, ts), tileCenter(ty, ts));
}

describe("Sim Unit II catalog", () => {
  it("is a trainable cyborg-class soldier with the daggers, gated on the Conversion Chamber and the Neural Nexus", () => {
    assert.ok(TRAIN_TYPES.includes("simunit2"));
    assert.equal(catalog("simunit2").name, "Sim Unit II");
    assert.equal(isInfantryType("simunit2"), true);
    assert.equal(isCyborg("simunit2"), true);
    assert.deepEqual(TECH_REQUIRES.simunit2, ["conversion", "nexus"]);
    assert.equal(infantryGunFor({ type: "simunit2", crits: [] })?.id, "daggers");
    assert.equal(catalog("simunit2").rangeTiles, SIMUNIT_REACH_TILES);
    assert.ok(catalog("simunit2").moveTilesPerSec > catalog("cyborg").moveTilesPerSec, "faster than the Cyborg");
  });

  it("lets the Cyborg and the Sim Unit power down, not the Commander", () => {
    assert.equal(canPowerDown("cyborg"), true);
    assert.equal(canPowerDown("simunit2"), true);
    assert.equal(canPowerDown("cyborgcommander"), false);
    assert.equal(canPowerDown("rifleman"), false);
  });
});

describe("Sim Unit II daggers", () => {
  it("kills any soldier who is not a cyborg in one slash", () => {
    for (const type of ["rifleman", "gunner", "sniper", "pyro", "medic", "jumpjet"] as const) {
      assert.ok(SIMUNIT_SLASH_DAMAGE * 0.9 > catalog(type).hp, `${type} has ${catalog(type).hp}`);
    }
    const { state, a, b } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 60, 40);
    const rifle = makeEntity(state, "rifleman", b, su.x + 14, su.y);
    applyCommand(state, a, { type: "cmd.attack", ids: [su.id], targetId: rifle.id });
    ticks(state, 2);
    assert.ok(!state.entities.has(rifle.id) || rifle.hp <= 0, `rifleman still at ${rifle.hp}`);
    assert.equal(blinkCharge(state, su), 1, "no blink for a man already at his arm");
    assert.ok(Math.abs(su.x - tileCenter(60, ts)) < 1, "did not move");
  });

  it("blinks onto an enemy soldier he goes for past arm's reach and cuts him the same tick", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 60, 40);
    const rifle = unit(state, "rifleman", b, 70, 40);
    ticks(state, 3);
    assert.ok(!state.entities.has(rifle.id) || rifle.hp <= 0, `rifleman still at ${rifle.hp}`);
    assert.ok(su.x > tileCenter(67, ts), `blinked across, at ${su.x / ts}`);
    assert.ok(blinkCharge(state, su) < 1, "the charge went on it");
    assert.ok(su.hp > 0);
  });

  it("blinks onto a named target out at the edge of the blink", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 40, 40);
    const rifle = unit(state, "rifleman", b, 72, 40);
    applyCommand(state, a, { type: "cmd.attack", ids: [su.id], targetId: rifle.id });
    ticks(state, 2);
    assert.ok(Math.hypot(su.x - rifle.x, su.y - rifle.y) < ts * 4, "beside him");
    assert.ok(!state.entities.has(rifle.id) || rifle.hp <= 0);
  });

  it("walks at a target past the blink, and blinks once it is in", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 40, 40);
    const rifle = unit(state, "rifleman", b, 76, 40);
    rifle.holdPosition = true;
    assert.ok(SIMUNIT_BLINK_RANGE_TILES * ts < Math.hypot(rifle.x - su.x, rifle.y - su.y), "9 cells is past the blink");
    applyCommand(state, a, { type: "cmd.attack", ids: [su.id], targetId: rifle.id });
    ticks(state, 2);
    assert.equal(blinkCharge(state, su), 1, "no blink from out there");
    assert.ok(su.x < tileCenter(45, ts), "still walking");
    ticks(state, 30);
    assert.ok(!state.entities.has(rifle.id) || rifle.hp <= 0, "closed, blinked, cut");
    assert.ok(blinkCharge(state, su) < 1);
  });

  it("blinks onto a force-attack target, friend or not", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 40, 40);
    const own = unit(state, "rifleman", a, 64, 40);
    const res = applyCommand(state, a, { type: "cmd.forceattack", ids: [su.id], targetId: own.id, x: own.x, y: own.y });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    ticks(state, 2);
    assert.ok(Math.hypot(su.x - own.x, su.y - own.y) < ts * 4, `beside him, at ${su.x / ts}`);
    assert.ok(blinkCharge(state, su) < 1, "the charge went on it");
    assert.ok(!state.entities.has(own.id) || own.hp <= 0, "cut down");
  });

  it("blinks to the wall of a building he is told to force-attack", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 40, 40);
    const depot = makeEntity(state, "dynamo", b, tileCenter(64, ts), tileCenter(40, ts), { tileX: 64, tileY: 40 });
    applyCommand(state, a, { type: "cmd.forceattack", ids: [su.id], targetId: depot.id, x: depot.x, y: depot.y });
    ticks(state, 2);
    assert.ok(blinkCharge(state, su) < 1, "the charge went on it");
    assert.ok(gapTo(state, su, depot) <= weaponRangeWorld(state, su), `at the wall, gap ${gapTo(state, su, depot)}`);
  });

  it("walks a short gap rather than spend the blink, and cannot cut from a cell off", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 60, 40);
    const rifle = unit(state, "rifleman", b, 64, 40);
    assert.ok(gapTo(state, su, rifle) > weaponRangeWorld(state, su), "a cell off is past the blade");
    su.holdPosition = true;
    applyCommand(state, a, { type: "cmd.attack", ids: [su.id], targetId: rifle.id });
    su.holdPosition = true;
    rifle.holdPosition = true;
    ticks(state, 10);
    assert.equal(rifle.hp, rifle.hpMax, "held a cell off, no cut lands");
    assert.equal(blinkCharge(state, su), 1, "no blink on hold");
    su.holdPosition = false;
    ticks(state, 20);
    assert.ok(!state.entities.has(rifle.id) || rifle.hp <= 0, "walked in and cut");
    assert.equal(blinkCharge(state, su), 1, "walked it, charge kept");
  });

  it("gets no reach from a hill", () => {
    const { state, a } = match();
    const su = unit(state, "simunit2", a, 60, 40);
    const flat = weaponRangeWorld(state, su);
    state.heights.fill(HEIGHT_MAX);
    const rifle = unit(state, "rifleman", "B", 60, 42);
    assert.ok(weaponRangeWorld(state, rifle) > catalog("rifleman").rangeTiles * state.tileSize, "the hill does lengthen a rifle");
    assert.equal(weaponRangeWorld(state, su), flat);
    assert.equal(flat, SIMUNIT_REACH_TILES * state.tileSize);
  });

  it("does moderate damage to a Walker and next to none to a Tiger", () => {
    const { state, a, b } = match();
    const su = unit(state, "simunit2", a, 60, 40);
    const walker = unit(state, "walker", b, 64, 40);
    const res = applyCommand(state, a, { type: "cmd.attack", ids: [su.id], targetId: walker.id });
    assert.equal(res.ok, true);
    ticks(state, 20);
    const cut = walker.hpMax - walker.hp;
    assert.ok(cut >= 25 && cut <= 65, `walker took ${cut} of ${walker.hpMax}`);

    const { state: s2, a: a2, b: b2 } = match();
    const su2 = unit(s2, "simunit2", a2, 60, 40);
    const tiger = unit(s2, "warden", b2, 64, 40);
    applyCommand(s2, a2, { type: "cmd.attack", ids: [su2.id], targetId: tiger.id });
    ticks(s2, 20);
    assert.ok(tiger.hpMax - tiger.hp <= 8, `tiger took ${tiger.hpMax - tiger.hp}`);
    assert.equal(s2.entities.has(su2.id), true);
  });

  it("does not go after a tank by himself", () => {
    const { state, a, b } = match();
    const su = unit(state, "simunit2", a, 60, 40);
    unit(state, "warden", b, 66, 40);
    ticks(state, 10);
    assert.equal(su.attackTarget, null);
    assert.equal(su.order, null);
  });
});

describe("Sim Unit II blink", () => {
  it("jumps to a point in reach at once, then waits on the charge", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 60, 40);
    assert.equal(blinkCharge(state, su), 1);
    const res = applyCommand(state, a, { type: "cmd.blink", ids: [su.id], x: tileCenter(70, ts), y: tileCenter(44, ts) });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    ticks(state, 1);
    assert.equal(su.x, tileCenter(70, ts));
    assert.equal(su.y, tileCenter(44, ts));
    assert.equal(su.tileX, 70);
    assert.equal(su.order, null);
    assert.ok(blinkCharge(state, su) < 1, "charge spent");
    assert.equal(snapshotFor(state, a).blinks?.length, 1, "the flash is in the snapshot");
    // Dry: the next blink waits where he stands until the drive is back.
    applyCommand(state, a, { type: "cmd.blink", ids: [su.id], x: tileCenter(60, ts), y: tileCenter(40, ts) });
    ticks(state, 5);
    assert.equal(su.x, tileCenter(70, ts), "still there");
    assert.equal(state.entities.get(su.id)!.order?.kind, "blink");
    ticks(state, secondsToTicks(SIMUNIT_BLINK_RECHARGE_SECONDS));
    assert.equal(su.x, tileCenter(60, ts), "went once the charge was back");
    assert.ok((snapshotFor(state, a).entities.find((e) => e.id === su.id)?.blink?.u ?? 1) < 0.1, "charge shows spent");
  });

  it("walks toward a point past his reach before he blinks", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    const su = unit(state, "simunit2", a, 20, 40);
    applyCommand(state, a, { type: "cmd.blink", ids: [su.id], x: tileCenter(100, ts), y: tileCenter(40, ts) });
    ticks(state, 20);
    assert.ok(su.x > tileCenter(20, ts), "moved off");
    assert.ok(su.x < tileCenter(60, ts), "not there yet");
    assert.equal(su.order?.kind, "blink");
  });
});

describe("Sim Unit II purge", () => {
  function held(state: MatchState, b: string): { house: Entity; occ: Entity[] } {
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(48, ts), tileCenter(16, ts), { tileX: 44, tileY: 12 });
    const occ = [unit(state, "rifleman", b, 33, 12), unit(state, "rifleman", b, 33, 14)];
    for (const o of occ) assert.equal(enterGarrison(state, o, house), true);
    return { house, occ };
  }

  it("blinks in, kills every soldier inside after the delay, and blinks back out", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const { house, occ } = held(state, b);
    const su = unit(state, "simunit2", a, 36, 16);
    assert.equal(purgeDenied(state, su, house), null);
    const res = applyCommand(state, a, { type: "cmd.purge", ids: [su.id], targetId: house.id });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    ticks(state, 1);
    assert.equal(su.garrisonedIn, house.id, "inside");
    assert.ok(su.purge, "on the purge");
    assert.ok(blinkCharge(state, su) < 1, "the charge went on the way in");
    assert.equal(snapshotFor(state, b).entities.some((e) => e.id === su.id), false, "the enemy cannot see him inside");
    const mine = snapshotFor(state, a).entities.find((e) => e.id === su.id);
    assert.equal(mine?.purge?.hostId, house.id);
    for (const o of occ) assert.ok(o.hp > 0, "not yet");
    // Orders do not reach him in there.
    assert.equal(applyCommand(state, a, { type: "cmd.move", ids: [su.id], x: 0, y: 0 }).ok, false);
    ticks(state, secondsToTicks(SIMUNIT_PURGE_SECONDS) + 1);
    for (const o of occ) assert.equal(state.entities.has(o.id), false, "every soldier inside is dead");
    assert.equal(house.garrison.length, 0);
    assert.equal(su.garrisonedIn, null, "back out");
    assert.equal(su.purge, undefined);
    assert.equal(su.hp, su.hpMax);
    assert.equal(su.hpMax, catalog("simunit2").hp, "his own pool, no cover baked in twice");
    assert.equal(su.tileX, 36);
    assert.equal(su.tileY, 16);
    assert.equal(tileCenter(su.tileX, ts), su.x);
  });

  it("is refused on an empty house, a friendly garrison, and by anyone but a Sim Unit", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const empty = makeEntity(state, "cottage", "", tileCenter(48, ts), tileCenter(16, ts), { tileX: 44, tileY: 12 });
    const su = unit(state, "simunit2", a, 36, 16);
    assert.equal(applyCommand(state, a, { type: "cmd.purge", ids: [su.id], targetId: empty.id }).ok, false);
    const own = unit(state, "rifleman", a, 33, 12);
    assert.equal(enterGarrison(state, own, empty), true);
    assert.equal(applyCommand(state, a, { type: "cmd.purge", ids: [su.id], targetId: empty.id }).ok, false);
    const { house } = held(state, b);
    const cy = unit(state, "cyborg", a, 36, 20);
    assert.equal(applyCommand(state, a, { type: "cmd.purge", ids: [cy.id], targetId: house.id }).ok, false);
    assert.equal(applyCommand(state, a, { type: "cmd.purge", ids: [su.id], targetId: house.id }).ok, true);
  });
});

describe("power down", () => {
  it("stops the Cyborg where he stands, and enemy guns pass him by until he powers up", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const cy = unit(state, "cyborg", a, 60, 40);
    applyCommand(state, a, { type: "cmd.move", ids: [cy.id], x: tileCenter(90, ts), y: tileCenter(40, ts) });
    ticks(state, 1);
    const res = applyCommand(state, a, { type: "cmd.powerdown", ids: [cy.id], on: true });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(cy.dormant, true);
    assert.equal(cy.order, null);
    assert.deepEqual(cy.waypoints, []);
    const x0 = cy.x;
    const rifle = unit(state, "rifleman", b, 70, 40);
    ticks(state, 30);
    assert.equal(cy.x, x0, "did not move");
    assert.equal(cy.hp, cy.hpMax, "untouched");
    assert.equal(rifle.hp, rifle.hpMax, "fired nothing");
    assert.equal(rifle.attackTarget, null);
    assert.equal(rifle.order, null);
    // The enemy sees no one's machine; his own side still sees his.
    const theirs = snapshotFor(state, b).entities.find((e) => e.id === cy.id);
    assert.equal(theirs?.ownerId, "");
    assert.equal(theirs?.dormant, true);
    assert.equal(snapshotFor(state, a).entities.find((e) => e.id === cy.id)?.ownerId, a);
    // He takes no order but Power up.
    assert.equal(applyCommand(state, a, { type: "cmd.move", ids: [cy.id], x: tileCenter(90, ts), y: tileCenter(40, ts) }).ok, false);
    assert.equal(applyCommand(state, a, { type: "cmd.powerdown", ids: [cy.id], on: false }).ok, true);
    assert.equal(cy.dormant, undefined);
    ticks(state, 30);
    assert.ok(rifle.hp < rifle.hpMax || !state.entities.has(rifle.id), "awake, he fires");
  });

  it("still dies to a named attack", () => {
    const { state, a, b } = match();
    const cy = unit(state, "simunit2", a, 60, 40);
    applyCommand(state, a, { type: "cmd.powerdown", ids: [cy.id], on: true });
    const rifle = unit(state, "rifleman", b, 70, 40);
    const res = applyCommand(state, b, { type: "cmd.attack", ids: [rifle.id], targetId: cy.id });
    assert.equal(res.ok, true);
    ticks(state, 40);
    assert.ok(cy.hp < cy.hpMax, "the named shot lands");
  });

  it("is not for the Commander", () => {
    const { state, a } = match();
    const boss = unit(state, "cyborgcommander", a, 60, 40);
    assert.equal(applyCommand(state, a, { type: "cmd.powerdown", ids: [boss.id], on: true }).ok, false);
    assert.equal(boss.dormant, undefined);
  });
});
