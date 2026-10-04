import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  DAY_SECONDS,
  DUSK_SECONDS,
  HEADLIGHT_HALF_DEG,
  LAMP_HEADING_STEP_DEG,
  MAMMOTH_LAMP_PERIOD_SECONDS,
  MAMMOTH_LAMP_STEP_DEG,
  MAMMOTH_LAMP_SWING_DEG,
  NEUTRAL_OWNER,
  NIGHT_REACH_MUL,
  NIGHT_SECONDS,
  NIGHT_SIGHT_MUL,
  SPOTLIGHT_REACH_TILES,
  SPOTLIGHT_TURN_DEG_PER_SEC,
  BUILDING_TYPES,
  TICK_DT,
  TRAIN_TYPES,
  catalog,
  type EntityType,
} from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { sightTilesForEntity, weaponRangeWorld } from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import {
  CLOCK_OPEN_HOUR,
  DAY_CYCLE_SECONDS,
  clockMarkLine,
  daylightAt,
  hasHeadlight,
  hasSpotlight,
  hullLamps,
  lampHeading,
  matchClock,
  nightReachMul,
  nightSightMul,
  nightTiles,
  phaseStartText,
  spotlightsOn,
  tickSpotlights,
} from "./night.js";
import { snapshotFor } from "./snapshot.js";
import { paintEntitySight, sightLightAt, visionMask, type SightSource } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

const NIGHT_TICK = Math.round((DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS / 2) / TICK_DT);
const DUSK_MID_TICK = Math.round((DAY_SECONDS + DUSK_SECONDS / 2) / TICK_DT);

/** Flat, empty ground with nobody on it but what the test places. */
function emptyField(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "NT", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.entities.clear();
  state.heights.fill(0);
  state.blocked.fill(0);
  state.occupy.fill(0);
  state.terrain.fill(TILE_EMPTY);
  return { state, a: "A", b: "B" };
}

function trooper(state: MatchState, type: EntityType, owner: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

function towerAt(state: MatchState, owner: string, tx: number, ty: number): Entity {
  const def = catalog("tower");
  const ts = state.tileSize;
  return makeEntity(state, "tower", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function lit(state: MatchState, playerId: string, x: number, y: number): boolean {
  return visionMask(state, playerId)[y * state.width + x] === 1;
}

describe("day and night", () => {
  it("opens in daylight, darkens through dusk, and comes round again", () => {
    assert.equal(daylightAt(0), 1);
    assert.equal(daylightAt(Math.round((DAY_SECONDS - 1) / TICK_DT)), 1);
    const dusk = daylightAt(DUSK_MID_TICK);
    assert.ok(dusk > 0.4 && dusk < 0.6, `mid-dusk daylight ${dusk}`);
    assert.equal(daylightAt(NIGHT_TICK), 0);
    assert.equal(daylightAt(Math.round(DAY_CYCLE_SECONDS / TICK_DT) + 5), 1, "the next morning");
    assert.equal(nightReachMul(0), 1);
    assert.equal(nightReachMul(NIGHT_TICK), NIGHT_REACH_MUL);
    assert.equal(nightSightMul(0), 1);
    assert.equal(nightSightMul(NIGHT_TICK), NIGHT_SIGHT_MUL);
    assert.equal(spotlightsOn(0), false);
    assert.equal(spotlightsOn(NIGHT_TICK), true);
  });

  it("reads a 24-hour clock that opens at morning and names the night", () => {
    const open = matchClock(0);
    assert.equal(open.phase, "day");
    assert.equal(open.hour, CLOCK_OPEN_HOUR);
    assert.equal(open.minute, 0);
    assert.equal(open.text, "06:00");
    assert.equal(phaseStartText("day"), "06:00");
    assert.equal(phaseStartText("dusk"), "19:23");
    assert.equal(phaseStartText("night"), "20:30");
    assert.equal(phaseStartText("dawn"), "04:53");
    assert.equal(clockMarkLine("day"), "night at 20:30");
    assert.equal(clockMarkLine("dusk"), "night at 20:30");
    assert.equal(clockMarkLine("night"), "dawn at 04:53");
    assert.equal(clockMarkLine("dawn"), "day at 06:00");

    const dusk = matchClock(DUSK_MID_TICK);
    assert.equal(dusk.phase, "dusk");
    assert.ok(dusk.hour >= 19 && dusk.hour <= 20, `dusk face ${dusk.text}`);

    const night = matchClock(NIGHT_TICK);
    assert.equal(night.phase, "night");
    assert.equal(night.text, "00:41");
    assert.equal(daylightAt(NIGHT_TICK), 0);

    const dawnTick = Math.round((DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS + DUSK_SECONDS / 2) / TICK_DT);
    const dawn = matchClock(dawnTick);
    assert.equal(dawn.phase, "dawn");
    assert.equal(dawn.text, "05:26");

    const nextMorning = matchClock(Math.round(DAY_CYCLE_SECONDS / TICK_DT) + 5);
    assert.equal(nextMorning.phase, "day");
    assert.equal(nextMorning.hour, CLOCK_OPEN_HOUR);
    assert.ok(nextMorning.minute < 3, nextMorning.text);
  });

  it("halves weapon reach in full dark", () => {
    const { state, a } = emptyField();
    const rifle = trooper(state, "rifleman", a, 100, 100);
    const day = weaponRangeWorld(state, rifle);
    state.tick = NIGHT_TICK;
    assert.ok(Math.abs(weaponRangeWorld(state, rifle) - day * NIGHT_REACH_MUL) < 1e-6);
  });

  it("cuts a soldier's sight ring harder than its weapon reach in full dark", () => {
    const { state, a } = emptyField();
    const rifle = trooper(state, "rifleman", a, 100, 128);
    const r = sightTilesForEntity(state, rifle);
    const dark = nightTiles(r, NIGHT_SIGHT_MUL);
    assert.equal(dark, Math.round(r * NIGHT_SIGHT_MUL));
    assert.ok(dark < nightTiles(r, NIGHT_REACH_MUL), "sight shrinks more than reach");
    assert.equal(lit(state, a, 100 + r - 2, 128), true, "seen by day");
    state.tick = NIGHT_TICK;
    assert.equal(lit(state, a, 100 + r - 2, 128), false, "lost in the dark");
    assert.equal(lit(state, a, 100 + dark + 2, 128), false, "past the dark ring");
    assert.equal(lit(state, a, 100 + dark - 1, 128), true, "close ground still seen");
  });
});

describe("watch tower spotlight", () => {
  it("lights ground down the beam past the dark sight ring, and nothing beside it", () => {
    const { state, a } = emptyField();
    const tower = towerAt(state, a, 60, 128);
    tower.spotFacing = 0;
    const ox = tower.tileX + Math.floor(tower.tileW / 2);
    const oy = tower.tileY + Math.floor(tower.tileH / 2);
    const far = SPOTLIGHT_REACH_TILES - 6;
    assert.equal(lit(state, a, ox + far, oy), false, "a lamp does nothing by day");
    state.tick = NIGHT_TICK;
    assert.equal(lit(state, a, ox + far, oy), true, "lit down the beam");
    assert.equal(lit(state, a, ox, oy + far), false, "dark off the beam");
    assert.equal(lit(state, a, ox + SPOTLIGHT_REACH_TILES + 6, oy), false, "dark past the beam's reach");
  });

  it("swings to the Rotate heading at its own pace", () => {
    const { state, a } = emptyField();
    const tower = towerAt(state, a, 60, 60);
    tower.spotFacing = 0;
    const ok = applyCommand(state, a, { type: "cmd.rotate", ids: [tower.id], x: tower.x, y: tower.y + 500 });
    assert.equal(ok.ok, true);
    tickSpotlights(state, TICK_DT);
    const step = (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT * Math.PI) / 180;
    assert.ok(Math.abs(tower.spotFacing! - step) < 1e-9, "one tick of swing, not a snap");
    const settleTicks = Math.ceil(90 / (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT)) + 2;
    for (let i = 0; i < settleTicks; i++) tickSpotlights(state, TICK_DT);
    assert.ok(Math.abs(tower.spotFacing! - Math.PI / 2) < 1e-9, "settles on the heading");
    assert.equal(tower.spotAim, undefined);
  });

  it("follows the beam into the night fog once it swings", () => {
    const { state, a } = emptyField();
    const tower = towerAt(state, a, 60, 60);
    tower.spotFacing = 0;
    state.tick = NIGHT_TICK;
    const ox = tower.tileX + Math.floor(tower.tileW / 2);
    const oy = tower.tileY + Math.floor(tower.tileH / 2);
    const far = SPOTLIGHT_REACH_TILES - 6;
    assert.equal(lit(state, a, ox, oy + far), false);
    applyCommand(state, a, { type: "cmd.rotate", ids: [tower.id], x: tower.x, y: tower.y + 500 });
    const settleTicks = Math.ceil(90 / (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT)) + 2;
    for (let i = 0; i < settleTicks; i++) tickSpotlights(state, TICK_DT);
    assert.equal(lit(state, a, ox, oy + far), true, "the new heading is lit");
    assert.equal(lit(state, a, ox + far, oy), false, "the old one went dark");
  });

  it("stays dark on a neutral tower, and the snapshot carries a held lamp's heading", () => {
    const { state, a, b } = emptyField();
    const neutral = towerAt(state, NEUTRAL_OWNER, 60, 60);
    const held = towerAt(state, a, 120, 60);
    held.spotFacing = 1.25;
    assert.equal(applyCommand(state, b, { type: "cmd.rotate", ids: [held.id], x: 0, y: 0 }).ok, false, "not B's lamp");
    tickSpotlights(state, TICK_DT);
    assert.equal(neutral.spotFacing, undefined);
    const view = snapshotFor(state, a).entities.find((e) => e.id === held.id);
    assert.equal(view?.spotFacing, 1.25);
    const gone = snapshotFor(state, a).entities.find((e) => e.id === neutral.id);
    assert.equal(gone?.spotFacing, undefined);
  });
});

describe("night sight for every eye", () => {
  function litCount(src: SightSource, tick: number): number {
    const w = 256;
    const mask = new Uint8Array(w * w);
    paintEntitySight(mask, w, w, 32, src, undefined, undefined, sightLightAt(tick));
    let n = 0;
    for (const v of mask) n += v;
    return n;
  }

  it("shrinks what each unit and structure sees after dark, lamps or not", () => {
    for (const type of [...TRAIN_TYPES, ...BUILDING_TYPES]) {
      // The Watch Tower and the Battle Ship carry a searchlight that lights far out.
      if (hasSpotlight(type)) continue;
      const def = catalog(type);
      if (def.sightTiles <= 0) continue;
      const building = def.kind === "building";
      const src: SightSource = {
        id: 1,
        kind: building ? "building" : "unit",
        type,
        ownerId: "A",
        x: 128 * 32 + 16,
        y: 128 * 32 + 16,
        tileX: 128,
        tileY: 128,
        tileW: building ? def.tileW : 1,
        tileH: building ? def.tileH : 1,
        facing: 0,
        hp: 1,
      };
      const day = litCount(src, 0);
      const night = litCount(src, NIGHT_TICK);
      // Three Mammoth lamps light more of the night than one nose lamp, and still less than day.
      const cap = type === "mammoth" ? 0.68 : hasHeadlight(type) ? 0.45 : 0.32;
      assert.ok(night < day * cap, `${type}: ${night} lit at night vs ${day} by day`);
    }
  });
});

describe("headlights", () => {
  it("run on armored ground hulls and the Cyborg, not on foot soldiers or planes", () => {
    assert.equal(hasHeadlight("cyborg"), true);
    assert.equal(hasHeadlight("ss3"), true);
    assert.equal(hasHeadlight("rifleman"), false);
    assert.equal(hasHeadlight("stuka"), false);
    assert.equal(hasHeadlight("tower"), false);
  });

  it("give back the daylight sight down the hull's nose only", () => {
    const { state, a } = emptyField();
    const tank = trooper(state, "ss3", a, 100, 128);
    tank.facing = 0;
    const r = sightTilesForEntity(state, tank);
    state.tick = NIGHT_TICK;
    assert.equal(lit(state, a, 100 + r - 2, 128), true, "ahead, in the light");
    assert.equal(lit(state, a, 100 - (r - 2), 128), false, "behind, in the dark");
    assert.equal(lit(state, a, 100, 128 + r - 2), false, "abeam, in the dark");
    tank.facing = Math.PI;
    assert.equal(lit(state, a, 100 - (r - 2), 128), true, "turns with the hull");
  });

  it("goes dark in every direction once the lamps are smashed", () => {
    const { state, a } = emptyField();
    const tank = trooper(state, "mammoth", a, 100, 128);
    tank.facing = 0;
    state.tick = NIGHT_TICK;
    const r = sightTilesForEntity(state, tank);
    const ahead = lit(state, a, 100 + r - 2, 128);
    assert.equal(ahead, true, "the nose lamp is lit");
    tank.crits = ["lamp"];
    assert.equal(lit(state, a, 100 + r - 2, 128), false, "nose went dark");
    assert.equal(lit(state, a, 100, 128 + r - 2), false, "flank went dark");

    const tower = towerAt(state, a, 40, 40);
    tower.spotFacing = 0;
    const ox = tower.tileX + Math.floor(tower.tileW / 2);
    const oy = tower.tileY + Math.floor(tower.tileH / 2);
    const far = SPOTLIGHT_REACH_TILES - 6;
    assert.equal(lit(state, a, ox + far, oy), true, "the cab lamp is lit");
    tower.crits = ["lamp"];
    assert.equal(lit(state, a, ox + far, oy), false, "the cab lamp is out");
  });

  it("gives a Mammoth a nose lamp and two flank lamps that sweep a small arc", () => {
    assert.deepEqual(hullLamps("ss3", 1, 4), [{ beam: 0, mount: 0 }]);
    const step = (MAMMOTH_LAMP_STEP_DEG * Math.PI) / 180;
    const swing = (MAMMOTH_LAMP_SWING_DEG * Math.PI) / 180;
    const a = hullLamps("mammoth", 3, 0);
    const b = hullLamps("mammoth", 9, 0);
    assert.equal(a.length, 3);
    assert.equal(a[0]!.beam, 0);
    assert.equal(a[0]!.mount, 0);
    assert.equal(a[1]!.mount, step);
    assert.equal(a[2]!.mount, -step);
    assert.notEqual(a[1]!.beam, b[1]!.beam);
    let moved = false;
    for (let i = 0; i <= 48; i++) {
      const lamps = hullLamps("mammoth", 3, (i / 48) * MAMMOTH_LAMP_PERIOD_SECONDS);
      assert.equal(lamps[0]!.beam, 0, "the nose lamp stays on the bow");
      assert.equal(lamps[1]!.mount, step);
      assert.equal(lamps[2]!.mount, -step);
      assert.ok(Math.abs(lamps[1]!.beam - step) <= swing + 1e-9);
      assert.ok(Math.abs(lamps[2]!.beam + step) <= swing + 1e-9);
      if (Math.abs(lamps[1]!.beam - a[1]!.beam) > swing * 0.5) moved = true;
    }
    assert.ok(moved, "a flank lamp travels its arc");
  });

  it("lights three directions at night and leaves the gaps dark", () => {
    const { state, a } = emptyField();
    const tank = trooper(state, "mammoth", a, 100, 128);
    tank.facing = 0;
    const r = sightTilesForEntity(state, tank);
    state.tick = NIGHT_TICK;
    const half = (HEADLIGHT_HALF_DEG * Math.PI) / 180;
    const swing = (MAMMOTH_LAMP_SWING_DEG * Math.PI) / 180;
    const step = (MAMMOTH_LAMP_STEP_DEG * Math.PI) / 180;
    const snap = ((LAMP_HEADING_STEP_DEG / 2) * Math.PI) / 180;
    const gapNear = half + snap;
    const gapFar = step - swing - half - snap;
    assert.ok(gapFar > gapNear, "the nose beam and a flank beam do not meet");
    const gap = (gapNear + gapFar) / 2;
    const dist = r - 2;
    const along = (rad: number) => ({
      x: 100 + Math.round(Math.cos(rad) * dist),
      y: 128 + Math.round(Math.sin(rad) * dist),
    });
    const dark = along(gap);
    assert.equal(lit(state, a, dark.x, dark.y), false, "the gap between nose and flank stays dark");
    const lamps = hullLamps("mammoth", tank.id, NIGHT_TICK * TICK_DT);
    for (const lamp of lamps) {
      const aim = lampHeading(tank.facing + lamp.beam);
      const tile = along(aim);
      assert.equal(lit(state, a, tile.x, tile.y), true, `lit along ${aim}`);
    }
  });

  it("go out when the hull is a passenger", () => {
    const { state, a } = emptyField();
    const cy = trooper(state, "cyborg", a, 100, 128);
    cy.facing = 0;
    const r = sightTilesForEntity(state, cy);
    state.tick = NIGHT_TICK;
    assert.equal(lit(state, a, 100 + r - 2, 128), true);
    cy.garrisonedIn = 9999;
    assert.equal(lit(state, a, 100 + r - 2, 128), false);
  });
});
