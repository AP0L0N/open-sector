import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AIR_CRUISE_ALT,
  CIWS_AIR_REACH_MUL,
  CIWS_HEAT,
  CIWS_LAY,
  CIWS_RANGE_TILES,
  CYBORG_HEAT,
  RADAR_LONG_RANGE_MUL,
  TICK_DT,
  WALKER_HEAT,
  catalog,
  gatlingHeatOf,
  gatlingSprayOf,
  isCivilianType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "HEAT1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A");
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
  for (let y = 70; y <= 190; y++) {
    for (let x = 70; x <= 190; x++) {
      const i = y * state.width + x;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n && !state.ended; i++) step(state, TICK_DT);
}

function seedCiws(state: MatchState, owner = "A"): Entity {
  const ts = state.tileSize;
  const def = catalog("ciws");
  return makeEntity(state, "ciws", owner, (120 + def.tileW / 2) * ts, (120 + def.tileH / 2) * ts, { tileX: 120, tileY: 120 });
}

/** An enemy soldier who never goes down: the gun stays on him. */
function dummy(state: MatchState, x: number, y: number): Entity {
  const e = makeEntity(state, "rifleman", "B", x, y);
  e.holdPosition = true;
  e.hp = e.hpMax = 1e7;
  return e;
}

/** Ticks until the gun locks with an overheat, or -1. */
function untilHot(state: MatchState, gun: Entity, max: number): number {
  for (let i = 0; i < max; i++) {
    step(state, TICK_DT);
    if (gun.mgOverheat > 0) return i + 1;
  }
  return -1;
}

describe("gatling heat", () => {
  it("every gatling has heat, and nothing else does", () => {
    for (const type of ["ciws", "walker", "cyborg", "apocalypse"] as const) assert.ok(gatlingHeatOf(type), type);
    for (const type of ["rifleman", "gunner", "titan", "ram"] as const) assert.equal(gatlingHeatOf(type), null, type);
  });

  it("a CIWS on the trigger overheats, sits out the lock without firing, then fires again", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    ciws.clip = 1e6;
    dummy(state, ciws.x + 12 * ts, ciws.y);
    const hot = untilHot(state, ciws, 200);
    assert.ok(hot > 0, "it overheats");
    // About a second and a half of fire, plus the swing onto the target.
    assert.ok(hot * TICK_DT >= 1.3 && hot * TICK_DT <= 2.5, `overheated after ${hot * TICK_DT}s`);
    const snap = snapshotFor(state, "A").entities.find((e) => e.id === ciws.id);
    assert.ok((snap?.mgOverheat ?? 0) > 0, "the owner sees the lock");
    assert.equal(snap?.mgHeat, 1);
    const left = ciws.clip;
    ticks(state, Math.floor(CIWS_HEAT.overheatSeconds / TICK_DT) - 1);
    assert.equal(ciws.clip, left, "no round while locked");
    ticks(state, 3);
    assert.ok(ciws.clip < left, "back on the trigger once it cools");
    assert.ok(ciws.mgHeat < 0.25, "it comes back cold");
  });

  it("short bursts shed heat between them and never lock", () => {
    const state = match();
    const ciws = seedCiws(state);
    ciws.mgHeat = 0.5;
    ticks(state, 20);
    assert.ok(Math.abs(ciws.mgHeat - (0.5 - CIWS_HEAT.coolPerSec * 2)) < 0.02, `heat ${ciws.mgHeat}`);
    assert.equal(ciws.mgOverheat, 0);
  });

  it("a Walker on both arms overheats much sooner than on one", () => {
    const time = (guns: 1 | 2) => {
      const state = match();
      const ts = state.tileSize;
      const w = makeEntity(state, "walker", "A", 120 * ts, 120 * ts);
      w.holdPosition = true;
      w.gatlingGuns = guns;
      w.clip = 1e6;
      dummy(state, w.x + 6 * ts, w.y);
      return untilHot(state, w, 300);
    };
    const one = time(1);
    const two = time(2);
    assert.ok(one > 0 && two > 0, `one ${one}, two ${two}`);
    assert.ok(two * 2 < one, `both arms ${two} ticks, one arm ${one}`);
    assert.ok(WALKER_HEAT.overheatSeconds > 0);
  });

  it("a Cyborg's arm overheats and stops firing", () => {
    const state = match();
    const ts = state.tileSize;
    const c = makeEntity(state, "cyborg", "A", 120 * ts, 120 * ts);
    c.holdPosition = true;
    c.clip = 1e6;
    dummy(state, c.x + 6 * ts, c.y);
    const hot = untilHot(state, c, 200);
    assert.ok(hot > 0, "it overheats");
    const left = c.clip;
    ticks(state, Math.floor(CYBORG_HEAT.overheatSeconds / TICK_DT) - 1);
    assert.equal(c.clip, left, "no round while locked");
  });

  it("the Apocalypse's roof mount overheats and holds while locked", () => {
    const state = match();
    const ts = state.tileSize;
    const tank = makeEntity(state, "apocalypse", "A", 120 * ts, 120 * ts);
    tank.holdPosition = true;
    tank.mgAmmo = 1e6;
    tank.ammo = {};
    dummy(state, tank.x + 6 * ts, tank.y);
    const hot = untilHot(state, tank, 200);
    assert.ok(hot > 0, "the roof mount overheats");
    // A little over a second of fire, plus the swing onto the target.
    assert.ok(hot * TICK_DT >= 1 && hot * TICK_DT <= 2.2, `roof overheated after ${hot * TICK_DT}s`);
    const left = tank.mgAmmo;
    ticks(state, 5);
    assert.equal(tank.mgAmmo, left, "the roof mount holds while locked");
  });
});

describe("gatling accuracy", () => {
  it("cheap gatlings and the secondary roof mount spray wider than the CIWS pad", () => {
    const pad = gatlingSprayOf("ciws");
    for (const type of ["walker", "cyborg", "apocalypse"] as const) assert.ok(gatlingSprayOf(type) > pad, type);
  });

  it("the pad and the roof lay half again as tight; the other gatlings do not", () => {
    assert.ok(Math.abs(gatlingSprayOf("ciws") * CIWS_LAY - 1) < 1e-9);
    assert.ok(Math.abs(gatlingSprayOf("apocalypse") * CIWS_LAY - 1.5) < 1e-9);
    assert.equal(gatlingSprayOf("walker"), 1.6);
    assert.equal(gatlingSprayOf("cyborg"), 1.8);
  });

  it("a Walker's rounds at a plane end in the sky, not in the dirt", () => {
    const state = match();
    const ts = state.tileSize;
    const w = makeEntity(state, "walker", "A", 120 * ts, 120 * ts);
    w.holdPosition = true;
    const plane = makeEntity(state, "stuka", "B", w.x + 4 * ts, w.y - 2 * ts);
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 1;
    plane.order = { kind: "move", x: plane.x, y: plane.y };
    plane.hp = plane.hpMax = 1e6;
    const ends: { airZ?: number }[] = [];
    for (let i = 0; i < 20; i++) {
      step(state, TICK_DT);
      for (const m of state.impacts) if (m.fromId === w.id) ends.push(m);
    }
    assert.ok(ends.length > 10, `rounds ${ends.length}`);
    assert.ok(ends.every((m) => m.airZ != null && m.airZ > 0));
  });
});

describe("CIWS and RAM reach", () => {
  it("the CIWS takes a plane farther out than a soldier", () => {
    assert.ok(CIWS_AIR_REACH_MUL > 1);
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    const out = CIWS_RANGE_TILES * ts * (1 + CIWS_AIR_REACH_MUL) * 0.5;
    const soldier = dummy(state, ciws.x + out, ciws.y);
    step(state, TICK_DT);
    assert.equal(ciws.attackTarget, null, "a soldier there is out of reach");
    state.entities.delete(soldier.id);
    const plane = makeEntity(state, "stuka", "B", ciws.x + out, ciws.y);
    plane.air!.phase = "fly";
    plane.air!.alt = AIR_CRUISE_ALT;
    plane.air!.speed = 1;
    plane.order = { kind: "move", x: plane.x, y: plane.y };
    step(state, TICK_DT);
    assert.equal(ciws.attackTarget, plane.id, "a plane there is in reach");
  });

  it("Max range reaches past the normal reach; Normal reach goes back", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    const out = CIWS_RANGE_TILES * ts * (1 + RADAR_LONG_RANGE_MUL) * 0.5;
    const soldier = dummy(state, ciws.x + out, ciws.y);
    step(state, TICK_DT);
    assert.equal(ciws.attackTarget, null);
    assert.equal(applyCommand(state, "A", { type: "cmd.reach", ids: [ciws.id], max: true }).ok, true);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === ciws.id)?.longRange, true);
    step(state, TICK_DT);
    assert.equal(ciws.attackTarget, soldier.id);
    const left = ciws.clip;
    ticks(state, 3);
    assert.ok(ciws.clip < left, "it fires out there");
    assert.equal(applyCommand(state, "A", { type: "cmd.reach", ids: [ciws.id], max: false }).ok, true);
    step(state, TICK_DT);
    assert.equal(ciws.attackTarget, null);
    assert.equal(snapshotFor(state, "A").entities.find((e) => e.id === ciws.id)?.longRange, undefined);
  });

  it("Max range spreads the fire: far fewer rounds connect out there", () => {
    const hitShare = (max: boolean, frac: number) => {
      const state = match();
      const ts = state.tileSize;
      const ciws = seedCiws(state);
      ciws.clip = 1e6;
      ciws.longRange = max || undefined;
      const s = dummy(state, ciws.x + CIWS_RANGE_TILES * ts * frac, ciws.y);
      ticks(state, 20);
      return (1e7 - s.hp) / catalog("ciws").damage / (1e6 - ciws.clip);
    };
    const near = hitShare(true, 0.9);
    const far = hitShare(true, RADAR_LONG_RANGE_MUL * 0.98);
    assert.ok(far < near * 0.5, `near ${near}, far ${far}`);
  });

  it("a RAM on Max range fires a barrage past its normal reach", () => {
    const state = match();
    const ts = state.tileSize;
    const def = catalog("ram");
    const ram = makeEntity(state, "ram", "A", (120 + def.tileW / 2) * ts, (120 + def.tileH / 2) * ts, { tileX: 120, tileY: 120 });
    const out = def.rangeTiles * ts * (1 + RADAR_LONG_RANGE_MUL) * 0.5;
    const s = dummy(state, ram.x + out, ram.y);
    // Past the mount's own sight: a friendly spotter shows it the target.
    const spotter = makeEntity(state, "rifleman", "A", s.x - 6 * ts, s.y + 12 * ts);
    spotter.holdPosition = true;
    ticks(state, 5);
    assert.equal(ram.rockets, def.rocketAmmo, "out of its normal reach");
    assert.equal(applyCommand(state, "A", { type: "cmd.reach", ids: [ram.id], max: true }).ok, true);
    ticks(state, 30);
    assert.ok((ram.rockets ?? 0) < (def.rocketAmmo ?? 0), "it fires out there");
    assert.equal(ram.attackTarget, s.id);
  });

  it("only the owner sets it, and only on a CIWS or a RAM", () => {
    const state = match();
    const ts = state.tileSize;
    const ciws = seedCiws(state);
    const rifle = makeEntity(state, "rifleman", "A", 100 * ts, 100 * ts);
    assert.equal(applyCommand(state, "B", { type: "cmd.reach", ids: [ciws.id], max: true }).ok, false);
    assert.equal(applyCommand(state, "A", { type: "cmd.reach", ids: [rifle.id], max: true }).ok, false);
    assert.equal(ciws.longRange, undefined);
  });
});
