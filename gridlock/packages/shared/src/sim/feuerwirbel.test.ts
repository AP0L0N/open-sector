import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEUERWIRBEL_BELT,
  FEUERWIRBEL_HEAT,
  FEUERWIRBEL_RANGE_TILES,
  HULL_FLAMER_ARC_DEG,
  HULL_FLAMER_FUEL,
  HULL_FLAMER_RANGE_TILES,
  FLAMER_RANGE_TILES,
  TECH_REQUIRES,
  TICK_DT,
  TRAIN_TYPES,
  beltOf,
  catalog,
  gatlingHeatOf,
  gatlingTurretOf,
  hasTurret,
  hullFlamerOf,
  supplyShortOf,
  type EntityType,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { reachesAircraft } from "./air.js";
import { applyCommand } from "./commands.js";
import { reachesJet } from "./jet.js";
import { makeEntity } from "./geo.js";
import { createMatch, step } from "./match.js";
import { producerType } from "./train.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): MatchState {
  const r = createRoom({ id: "FW1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return createMatch(room, started.value);
}

/** Flat, dry pad and nothing else on it. */
function pad(): { state: MatchState; y: number; ts: number } {
  const state = twoPlayerMatch();
  state.heights.fill(0);
  const ts = state.tileSize;
  const y = 40;
  for (let ty = y - 10; ty <= y + 10; ty++) {
    for (let tx = 60; tx <= 130; tx++) {
      const i = ty * state.width + tx;
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
  return { state, y, ts };
}

function tank(state: MatchState, x: number, y: number, facing = 0): Entity {
  const e = makeEntity(state, "feuerwirbel", "A", x, y);
  e.facing = facing;
  e.turretFacing = facing;
  e.holdPosition = true;
  return e;
}

/** A target that will not fire back or die, so the test measures the tank. */
function dummy(state: MatchState, type: EntityType, x: number, y: number, owner = "B"): Entity {
  const e = makeEntity(state, type, owner, x, y);
  e.holdPosition = true;
  e.cooldown = 1e9;
  e.mgCooldown = 1e9;
  e.hp = e.hpMax = 100000;
  return e;
}

function flames(state: MatchState, e: Entity): number {
  return state.projectiles.filter((p) => p.fromId === e.id && p.flight === "flame").length;
}

function bullets(state: MatchState, e: Entity): number {
  return [...state.projectiles, ...state.impacts].filter((p) => p.fromId === e.id && !("flight" in p && p.flight === "flame")).length;
}

const fw = catalog("feuerwirbel");

describe("feuerwirbel catalog", () => {
  it("is a turreted tank trained at the Armory behind Research", () => {
    assert.equal(fw.name, "Feuerwirbel");
    assert.ok(TRAIN_TYPES.includes("feuerwirbel"));
    assert.equal(producerType("feuerwirbel"), "armory");
    assert.equal(TECH_REQUIRES.feuerwirbel, "research");
    assert.equal(hasTurret("feuerwirbel"), true);
    assert.equal(fw.tracked, true);
    assert.equal(fw.leavesWreck, true);
    assert.ok((fw.blurb ?? "").length > 24);
  });

  it("turns its turret faster than any other unit", () => {
    for (const t of TRAIN_TYPES) {
      if (t === "feuerwirbel") continue;
      assert.ok((fw.turretTurnDegPerSec ?? 0) > (catalog(t).turretTurnDegPerSec ?? 0), t);
    }
  });

  it("carries gatlings in the turret: a belt, gatling heat, and rounds that reach the air", () => {
    assert.equal(gatlingTurretOf("feuerwirbel"), true);
    assert.deepEqual(beltOf("feuerwirbel"), { clip: FEUERWIRBEL_BELT, reload: 0 });
    assert.equal(gatlingHeatOf("feuerwirbel"), FEUERWIRBEL_HEAT);
    assert.equal(fw.antiAir, true);
    assert.equal(fw.airFirst, true);
    assert.equal(fw.rangeTiles, FEUERWIRBEL_RANGE_TILES);
    assert.ok(!fw.ammo, "no shell rack");
  });

  it("has a bow flamer that outreaches the Pyro but not its own gatlings, fuelled in the coaxial slot", () => {
    assert.equal(hullFlamerOf("feuerwirbel"), true);
    assert.equal(fw.mgAmmo, HULL_FLAMER_FUEL);
    assert.ok(HULL_FLAMER_RANGE_TILES > FLAMER_RANGE_TILES);
    assert.ok(HULL_FLAMER_RANGE_TILES < FEUERWIRBEL_RANGE_TILES);
    assert.equal(supplyShortOf("feuerwirbel", undefined, HULL_FLAMER_FUEL - 1, FEUERWIRBEL_BELT), true);
    assert.equal(supplyShortOf("feuerwirbel", undefined, HULL_FLAMER_FUEL, FEUERWIRBEL_BELT - 1), true);
    assert.equal(supplyShortOf("feuerwirbel", undefined, HULL_FLAMER_FUEL, FEUERWIRBEL_BELT), false);
  });

  it("reaches planes and Jump Jets in the air", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 70 * ts, y * ts);
    assert.equal(reachesAircraft(e), true);
    assert.equal(reachesJet(e), true);
  });
});

describe("feuerwirbel gatlings", () => {
  it("swing round fast and hose a soldier behind the hull, without the hull turning", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 90 * ts, y * ts, 0);
    // Behind, past the flamer's reach but inside the gatlings'.
    const d = (HULL_FLAMER_RANGE_TILES + FEUERWIRBEL_RANGE_TILES) / 2;
    const foe = dummy(state, "rifleman", (90 - d) * ts, y * ts);
    applyCommand(state, "A", { type: "cmd.attack", ids: [e.id], targetId: foe.id });
    let fired = 0;
    let firstTick = -1;
    for (let i = 0; i < 20; i++) {
      step(state, TICK_DT);
      const n = bullets(state, e);
      if (n > 0 && firstTick < 0) firstTick = i;
      fired += n;
    }
    assert.ok(fired > 0, "the gatlings fired");
    // 180° at 300°/s is six ticks; a Tiger's turret would take more than eight.
    assert.ok(firstTick >= 0 && firstTick <= 8, `first round on tick ${firstTick}`);
    assert.ok(e.clip < FEUERWIRBEL_BELT, "the belt ran down");
    assert.ok(Math.abs(e.facing) < 1e-6, "the hull stayed put; the foe is out of the flamer's reach");
    assert.equal(e.mgAmmo, HULL_FLAMER_FUEL, "no fuel spent past the flamer's reach");
  });

  it("lets a Tiger's front plate alone unless told to fire", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 90 * ts, y * ts, 0);
    const tiger = dummy(state, "warden", 97 * ts, y * ts);
    tiger.facing = Math.PI;
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.equal(bullets(state, e), 0);
    assert.equal(e.clip, FEUERWIRBEL_BELT);
  });

  it("overheats on a long burst and sits it out", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 90 * ts, y * ts, 0);
    // Past the flamer's reach, which kills a soldier outright.
    const d = (HULL_FLAMER_RANGE_TILES + FEUERWIRBEL_RANGE_TILES) / 2;
    const foe = dummy(state, "rifleman", (90 + d) * ts, y * ts);
    applyCommand(state, "A", { type: "cmd.attack", ids: [e.id], targetId: foe.id });
    let hot = false;
    for (let i = 0; i < 60 && !hot; i++) {
      step(state, TICK_DT);
      hot = e.mgOverheat > 0;
    }
    assert.ok(hot, "the barrels locked");
    const belt = e.clip;
    step(state, TICK_DT);
    assert.equal(e.clip, belt, "no rounds while hot");
  });
});

describe("feuerwirbel bow flamer", () => {
  it("burns a soldier straight ahead and spends its own fuel", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 90 * ts, y * ts, 0);
    dummy(state, "rifleman", (90 + HULL_FLAMER_RANGE_TILES * 0.6) * ts, y * ts);
    let globs = 0;
    for (let i = 0; i < 10; i++) {
      step(state, TICK_DT);
      globs = Math.max(globs, flames(state, e));
    }
    assert.ok(globs > 0, "the projector fired");
    assert.ok(e.mgAmmo < HULL_FLAMER_FUEL);
  });

  it("only fires where the nose points: the hull turns onto a soldier at its side first", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 90 * ts, y * ts, 0);
    // Straight to the hull's left, close enough to burn.
    const foe = dummy(state, "rifleman", 90 * ts, (y + HULL_FLAMER_RANGE_TILES * 0.6) * ts);
    applyCommand(state, "A", { type: "cmd.attack", ids: [e.id], targetId: foe.id });
    const arc = (HULL_FLAMER_ARC_DEG * Math.PI) / 180;
    let burnedAt = -1;
    for (let i = 0; i < 40 && burnedAt < 0; i++) {
      step(state, TICK_DT);
      if (flames(state, e) > 0) {
        burnedAt = i;
        const off = Math.atan2(Math.sin(Math.PI / 2 - e.facing), Math.cos(Math.PI / 2 - e.facing));
        assert.ok(Math.abs(off) <= arc + 1e-6, `fired ${((off * 180) / Math.PI).toFixed(1)}° off the nose`);
      }
    }
    assert.ok(burnedAt > 0, "it turned, then burned");
  });

  it("does not traverse: with the hull held off the target, the projector stays cold", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 90 * ts, y * ts, 0);
    e.crits = [...e.crits, "tracks"];
    dummy(state, "rifleman", 90 * ts, (y + HULL_FLAMER_RANGE_TILES * 0.6) * ts);
    for (let i = 0; i < 30; i++) step(state, TICK_DT);
    assert.equal(e.mgAmmo, HULL_FLAMER_FUEL);
  });

  it("holds while a friendly soldier stands in the jet", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 90 * ts, y * ts, 0);
    dummy(state, "rifleman", (90 + HULL_FLAMER_RANGE_TILES * 0.8) * ts, y * ts);
    const friend = makeEntity(state, "rifleman", "A", (90 + HULL_FLAMER_RANGE_TILES * 0.4) * ts, y * ts);
    friend.holdPosition = true;
    for (let i = 0; i < 10; i++) step(state, TICK_DT);
    assert.equal(e.mgAmmo, HULL_FLAMER_FUEL);
  });

  it("leaves tank plate alone", () => {
    const { state, y, ts } = pad();
    const e = tank(state, 90 * ts, y * ts, 0);
    dummy(state, "warden", (90 + HULL_FLAMER_RANGE_TILES * 0.6) * ts, y * ts);
    for (let i = 0; i < 10; i++) step(state, TICK_DT);
    assert.equal(e.mgAmmo, HULL_FLAMER_FUEL);
  });
});
