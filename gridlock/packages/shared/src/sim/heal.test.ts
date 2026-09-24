import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCrit,
  catalog,
  fires,
  infantryGunById,
  infantryGunFor,
  infantryLoadout,
  isInfantryType,
  isMotorVehicle,
  MEDIC_HEAL_PER_SEC,
  MEDIC_MEND_SECONDS,
  MEDIC_SEEK_TILES,
  TICK_DT,
  TILE_SIZE,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function match(opts?: { team?: number }): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "MD",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  const team = opts?.team;
  updateSelf(room, "A", { ready: true, spawnId: 1, team });
  updateSelf(room, "B", { ready: true, spawnId: 4, team });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
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

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

describe("medic", () => {
  it("is an unarmed Muster soldier", () => {
    const m = catalog("medic");
    assert.equal(m.name, "Medic");
    assert.equal(m.letter, "M");
    assert.equal(isInfantryType("medic"), true);
    assert.equal(isMotorVehicle("medic"), false);
    assert.equal(fires("medic"), false);
    assert.equal(m.damage, 0);
    assert.equal(m.rangeTiles, 0);
    assert.deepEqual(infantryLoadout("medic"), []);
    assert.equal(infantryGunFor({ type: "medic" }), null);
    assert.equal(m.sightTiles, catalog("rifleman").sightTiles);
    assert.ok(MEDIC_SEEK_TILES < m.sightTiles);
    assert.ok(MEDIC_HEAL_PER_SEC > 0);
    const trained = applyCommand(match().state, "A", { type: "cmd.train", unit: "medic" });
    assert.equal(trained.ok, false);
    if (!trained.ok) assert.equal(trained.message, "Need a Muster.");
  });

  it("walks up to a wounded soldier and heals him to full, then does it again", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 110, 70);
    const medic = makeEntity(state, "medic", a, tileCenter(80, ts), tileCenter(52, ts));
    const friend = makeEntity(state, "rifleman", a, tileCenter(90, ts), tileCenter(52, ts));
    friend.hp = 10;
    const gap = Math.hypot(friend.x - medic.x, friend.y - medic.y);
    assert.ok(gap > 20, "fixture should start out of arm's reach");
    assert.ok(gap < MEDIC_SEEK_TILES * TILE_SIZE);
    ticks(state, 40);
    assert.ok(friend.hp > 10, `hp ${friend.hp}`);
    assert.ok(Math.hypot(friend.x - medic.x, friend.y - medic.y) < 30);
    ticks(state, 120);
    assert.equal(friend.hp, friend.hpMax);
    const snap = snapshotFor(state, a);
    assert.equal(snap.entities.find((e) => e.id === medic.id)?.tend, undefined);
    friend.hp = 8;
    ticks(state, 140);
    assert.equal(friend.hp, friend.hpMax);
    assert.equal(state.projectiles.length, 0);
  });

  it("publishes the patient only while hands are on him", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 110, 70);
    const medic = makeEntity(state, "medic", a, tileCenter(80, ts), tileCenter(52, ts));
    const friend = makeEntity(state, "rifleman", a, tileCenter(90, ts), tileCenter(52, ts));
    friend.hp = 12;
    step(state, TICK_DT);
    const walking = snapshotFor(state, a).entities.find((e) => e.id === medic.id);
    assert.equal(walking?.tend, undefined);
    assert.equal(medic.order?.auto, true);
    friend.x = medic.x;
    friend.y = medic.y;
    step(state, TICK_DT);
    const tending = snapshotFor(state, a).entities.find((e) => e.id === medic.id);
    assert.equal(tending?.tend, friend.id);
    assert.ok(friend.hp > 12);
  });

  it("picks the nearer wounded soldier", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 120, 70);
    const medic = makeEntity(state, "medic", a, tileCenter(80, ts), tileCenter(52, ts));
    const far = makeEntity(state, "rifleman", a, tileCenter(96, ts), tileCenter(52, ts));
    const near = makeEntity(state, "gunner", a, tileCenter(84, ts), tileCenter(52, ts));
    far.hp = 5;
    near.hp = 20;
    step(state, TICK_DT);
    assert.equal(medic.tendId, near.id);
  });

  it("does not heal vehicles, enemies, himself, or a full-health soldier", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 110, 70);
    const x = tileCenter(80, ts);
    const y = tileCenter(52, ts);
    const medic = makeEntity(state, "medic", a, x, y);
    medic.hp = 10;
    const hauler = makeEntity(state, "hauler", a, x + 4, y);
    hauler.hp = 40;
    const healthy = makeEntity(state, "sniper", a, x + 8, y);
    ticks(state, 30);
    assert.equal(medic.hp, 10);
    assert.equal(hauler.hp, 40);
    assert.equal(healthy.hp, healthy.hpMax);
    assert.equal(medic.tendId, undefined);
  });

  it("does not heal an enemy and does not shoot", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 100, 70);
    const x = tileCenter(80, ts);
    const y = tileCenter(52, ts);
    const medic = makeEntity(state, "medic", a, x, y);
    const foe = makeEntity(state, "rifleman", b, x, y);
    foe.hp = 11;
    ticks(state, 20);
    assert.equal(foe.hp, 11);
    assert.ok(state.projectiles.every((p) => p.fromId !== medic.id));
    assert.equal(medic.attackTarget, null);
  });

  it("heals an ally on the other team slot", () => {
    const { state, a, b } = match({ team: 1 });
    const ts = state.tileSize;
    clearPad(state, 70, 46, 110, 70);
    const x = tileCenter(82, ts);
    const y = tileCenter(54, ts);
    makeEntity(state, "medic", a, x, y);
    const friend = makeEntity(state, "rifleman", b, x, y);
    friend.hp = 15;
    ticks(state, 20);
    assert.ok(friend.hp > 15);
  });

  it("obeys a move order and a hold instead of chasing", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    clearPad(state, 70, 40, 120, 80);
    const medic = makeEntity(state, "medic", a, tileCenter(80, ts), tileCenter(52, ts));
    const friend = makeEntity(state, "rifleman", a, tileCenter(80, ts), tileCenter(60, ts));
    friend.hp = 9;
    const x0 = medic.x;
    applyCommand(state, a, { type: "cmd.move", ids: [medic.id], x: tileCenter(100, ts), y: medic.y });
    ticks(state, 25);
    assert.ok(medic.x > x0 + 8, `x ${medic.x} from ${x0}`);
    assert.equal(friend.hp, 9);
    friend.hp = friend.hpMax;

    const held = makeEntity(state, "medic", a, tileCenter(80, ts), tileCenter(70, ts));
    const hx = held.x;
    const hy = held.y;
    held.holdPosition = true;
    const away = makeEntity(state, "rifleman", a, tileCenter(92, ts), tileCenter(70, ts));
    away.hp = 6;
    ticks(state, 20);
    assert.equal(held.x, hx);
    assert.equal(held.y, hy);
    assert.equal(away.hp, 6);
    away.x = held.x;
    away.y = held.y;
    ticks(state, 15);
    assert.ok(Math.hypot(held.x - hx, held.y - hy) < 24, `held drifted to ${held.x},${held.y}`);
    assert.ok(away.hp > 6);
  });

  it("ignores a soldier outside the seek disk", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    clearPad(state, 60, 40, 160, 80);
    const medic = makeEntity(state, "medic", a, tileCenter(70, ts), tileCenter(52, ts));
    const far = makeEntity(state, "rifleman", a, tileCenter(110, ts), tileCenter(52, ts));
    far.hp = 4;
    const tiles = Math.hypot(far.x - medic.x, far.y - medic.y) / ts;
    assert.ok(tiles > MEDIC_SEEK_TILES);
    const x0 = medic.x;
    ticks(state, 20);
    assert.equal(medic.x, x0);
    assert.equal(far.hp, 4);
    assert.equal(medic.tendId, undefined);
  });

  it("sets a broken limb after a long kneel and gives the rifle back", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 100, 70);
    const x = tileCenter(80, ts);
    const y = tileCenter(52, ts);
    makeEntity(state, "medic", a, x, y);
    const friend = makeEntity(state, "rifleman", a, x, y);
    addCrit(friend, "arm");
    addCrit(friend, "leg");
    assert.equal(infantryGunFor(friend)?.id, "handgun");
    ticks(state, 20);
    assert.ok(friend.crits.includes("arm"));
    const need = Math.ceil((MEDIC_MEND_SECONDS * 2) / TICK_DT) + 5;
    ticks(state, need);
    assert.deepEqual(friend.crits, []);
    assert.equal(friend.weapon, "rifle");
    assert.equal(friend.clip, infantryGunById("rifle").clip);
  });

  it("bandages a housemate and not a soldier shut in another building", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    clearPad(state, 70, 46, 110, 80);
    const house = makeEntity(state, "cottage", "", tileCenter(84, ts), tileCenter(54, ts));
    const other = makeEntity(state, "shack", "", tileCenter(96, ts), tileCenter(54, ts));
    const x = house.x;
    const y = house.y;
    const medic = makeEntity(state, "medic", a, x, y);
    const inside = makeEntity(state, "rifleman", a, x, y);
    const shut = makeEntity(state, "gunner", a, x, y);
    medic.garrisonedIn = house.id;
    inside.garrisonedIn = house.id;
    shut.garrisonedIn = other.id;
    medic.state = "garrison";
    inside.state = "garrison";
    shut.state = "garrison";
    inside.hp = 10;
    shut.hp = 10;
    ticks(state, 15);
    assert.ok(inside.hp > 10);
    assert.equal(shut.hp, 10);
  });

  it("stacks when two medics treat the same soldier", () => {
    const healFor = (n: number): number => {
      const { state, a } = match();
      const ts = state.tileSize;
      clearPad(state, 70, 46, 100, 70);
      const x = tileCenter(80, ts);
      const y = tileCenter(52, ts);
      const friend = makeEntity(state, "rifleman", a, x, y);
      friend.hp = 10;
      for (let i = 0; i < n; i++) makeEntity(state, "medic", a, x, y);
      ticks(state, 10);
      return friend.hp;
    };
    assert.ok(healFor(2) > healFor(1));
  });
});
