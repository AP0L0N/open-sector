import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEIGHT_BASE,
  HEIGHT_SIGHT_BONUS,
  HEIGHT_MAX,
  HEIGHT_WORLD,
  HULL_EYE_HEIGHT,
  HULL_LEVEL_SIGHT,
  INFANTRY_EYE_HEIGHT,
  INFANTRY_UPHILL_SIGHT,
  TANK_GUN_CLIMB,
  TANK_GUN_ELEV_DEG,
  TICK_DT,
  TILE_SIZE,
  TILE_SUBDIV,
  TREE_COVER_HEIGHT,
  WEAPON_RANGE_SIGHT_MUL,
  catalog,
  coverHeightOf,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  canAimWeapon,
  gunCanElevate,
  hasTerrainLos,
  levelSightExtra,
  shotClearsCover,
  observerEyeOf,
  rangeTilesOf,
  sightTilesOf,
  slopeCostMul,
  slopeSpeedMul,
  uphillSightOf,
} from "./elevation.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { tickMovement } from "./orders.js";
import { tickCombat } from "./combat.js";
import { paintEntitySight } from "./vision.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "T1",
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
  const state = createMatch(room, started.value, { startingUnits: false });
  return { state, a: "A", b: "B" };
}

describe("slope multipliers", () => {
  it("slows climbs and speeds descents", () => {
    assert.equal(slopeSpeedMul(0), 1);
    assert.ok(slopeSpeedMul(1) < 1);
    assert.ok(slopeSpeedMul(-1) > 1);
    assert.ok(slopeCostMul(1) > 1);
    assert.ok(slopeCostMul(-1) < 1);
  });
});

describe("high ground bonuses", () => {
  it("adds sight and weapon range per elevation", () => {
    const trooper = catalog("trooper");
    assert.equal(sightTilesOf("trooper", HEIGHT_BASE), trooper.sightTiles);
    assert.equal(sightTilesOf("trooper", 0), trooper.sightTiles);
    assert.equal(sightTilesOf("trooper", HEIGHT_BASE + 2), trooper.sightTiles + 2 * HEIGHT_SIGHT_BONUS);
    assert.equal(rangeTilesOf("trooper", HEIGHT_BASE), trooper.sightTiles * WEAPON_RANGE_SIGHT_MUL);
    assert.equal(rangeTilesOf("trooper", HEIGHT_BASE + 1), sightTilesOf("trooper", HEIGHT_BASE + 1) * WEAPON_RANGE_SIGHT_MUL);
    assert.equal(rangeTilesOf("hauler", HEIGHT_BASE + 3), 0);
  });

  it("grows weapon range when extra optics extend sight", () => {
    const optics = 8;
    assert.equal(sightTilesOf("warden", 0, optics), catalog("warden").sightTiles + optics);
    assert.equal(rangeTilesOf("warden", 0, optics), sightTilesOf("warden", 0, optics) * WEAPON_RANGE_SIGHT_MUL);
    assert.ok(rangeTilesOf("warden", 0, optics) > rangeTilesOf("warden", 0));
  });

  it("gives infantry more fog reach than a tank", () => {
    assert.ok(catalog("trooper").sightTiles > catalog("warden").sightTiles);
    assert.equal(observerEyeOf("trooper"), INFANTRY_EYE_HEIGHT);
    assert.equal(observerEyeOf("warden"), HULL_EYE_HEIGHT);
    assert.ok(observerEyeOf("trooper") > observerEyeOf("warden"));
    assert.ok(uphillSightOf("trooper") > uphillSightOf("warden"));
    assert.equal(uphillSightOf("warden"), HULL_LEVEL_SIGHT);
    assert.equal(levelSightExtra(0, 4, INFANTRY_UPHILL_SIGHT), 4 * INFANTRY_UPHILL_SIGHT);
    assert.equal(levelSightExtra(4, 0, INFANTRY_UPHILL_SIGHT), 4 * INFANTRY_UPHILL_SIGHT);
    assert.equal(levelSightExtra(2, 2, INFANTRY_UPHILL_SIGHT), 0);
  });

  it("gives structures the same peek and uphill sight as infantry", () => {
    assert.equal(observerEyeOf("core"), INFANTRY_EYE_HEIGHT);
    assert.equal(observerEyeOf("dynamo"), INFANTRY_EYE_HEIGHT);
    assert.equal(observerEyeOf("cottage"), INFANTRY_EYE_HEIGHT);
    assert.equal(uphillSightOf("core"), uphillSightOf("trooper"));
    assert.equal(uphillSightOf("warden"), HULL_LEVEL_SIGHT);
  });
});

describe("terrain line of sight", () => {
  it("lets a hilltop see across a valley", () => {
    const elev = [2, 0, 0, 0, 0];
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0), true);
  });

  it("blocks looking past a taller ridge", () => {
    const elev = [0, 0, HEIGHT_BASE, 0, 0];
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0), false);
  });

  it("lets a modest roll through that used to count as a ridge", () => {
    const elev = [0, 0, 2, 0, 0];
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0), true);
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0, INFANTRY_EYE_HEIGHT), true);
  });

  it("still lets you see the hillside itself", () => {
    const elev = [0, 1, 2];
    assert.equal(hasTerrainLos(elev, 3, 1, 0, 0, 2, 0), true);
  });

  it("lets infantry peek over a rise that hides a hull", () => {
    const elev = [0, 0, 6, 0, 0, 0, 0, 0, 0];
    assert.equal(hasTerrainLos(elev, 9, 1, 0, 0, 8, 0, HULL_EYE_HEIGHT), false);
    assert.equal(hasTerrainLos(elev, 9, 1, 0, 0, 8, 0, INFANTRY_EYE_HEIGHT), true);
  });

  it("hides a distant peak behind a closer lower ridge", () => {
    const elev = [0, 0, HEIGHT_BASE, 0, 0, 0, 0, 0, 5];
    assert.equal(hasTerrainLos(elev, 9, 1, 0, 0, 8, 0), false);
    assert.equal(hasTerrainLos(elev, 9, 1, 0, 0, 2, 0), true);
  });

  it("lets a gentle climb through", () => {
    const elev = [0, 2, 2, 3];
    assert.equal(hasTerrainLos(elev, 4, 1, 0, 0, 3, 0), true);
  });

  it("hides a peak behind a steep bulge on the way up", () => {
    const elev = [0, HEIGHT_BASE, HEIGHT_BASE, 3];
    assert.equal(hasTerrainLos(elev, 4, 1, 0, 0, 3, 0), false);
    assert.equal(hasTerrainLos(elev, 4, 1, 0, 0, 1, 0), true);
  });

  it("lets a hilltop see every lower terrace, including the lip", () => {
    const elev = [4, 4, 3, 3, 2, 2, 1, 1, 0];
    for (let x = 1; x < elev.length; x++) {
      assert.equal(hasTerrainLos(elev, elev.length, 1, 0, 0, x, 0), true, `lip ${x}`);
    }
  });

  it("still hides the floor behind a ridge when looking down", () => {
    const elev = [HEIGHT_BASE, HEIGHT_BASE, HEIGHT_MAX, 2, 0];
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 2, 0), true);
    assert.equal(hasTerrainLos(elev, 5, 1, 0, 0, 4, 0), false);
  });
});

describe("movement on slopes", () => {
  it("covers less ground going uphill than on the flat", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const from = { x: tileCenter(10, ts), y: tileCenter(10, ts) };
    const dest = { x: tileCenter(11, ts), y: tileCenter(10, ts) };
    const flat = makeEntity(state, "trooper", a, from.x, from.y);
    flat.facing = Math.atan2(dest.y - from.y, dest.x - from.x);
    flat.waypoints = [{ x: dest.x, y: dest.y }];
    tickMovement(state, TICK_DT);
    const flatDist = Math.hypot(flat.x - from.x, flat.y - from.y);

    state.heights[10 * state.width + 11] = 1;
    const up = makeEntity(state, "trooper", a, from.x, from.y);
    up.facing = flat.facing;
    up.waypoints = [{ x: dest.x, y: dest.y }];
    tickMovement(state, TICK_DT);
    const upDist = Math.hypot(up.x - from.x, up.y - from.y);
    assert.ok(flatDist > 1, `flat moved ${flatDist}`);
    assert.ok(upDist < flatDist * 0.95, `uphill ${upDist} vs flat ${flatDist}`);
  });
});

describe("vision and range on a hill", () => {
  it("paints a wider sight disc from high ground", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(HEIGHT_BASE);
    const ts = state.tileSize;
    const e = makeEntity(state, "trooper", a, tileCenter(20, ts), tileCenter(20, ts));
    const flat = new Uint8Array(state.width * state.height);
    paintEntitySight(flat, state.width, state.height, ts, e, state.heights);
    let flatN = 0;
    for (const v of flat) if (v) flatN++;

    state.heights[20 * state.width + 20] = HEIGHT_BASE + 2;
    const high = new Uint8Array(state.width * state.height);
    paintEntitySight(high, state.width, state.height, ts, e, state.heights);
    let highN = 0;
    for (const v of high) if (v) highN++;
    assert.ok(highN > flatN, `high ${highN} vs flat ${flatN}`);
  });

  it("lets a hilltop trooper fire past flat max range", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(HEIGHT_BASE);
    const ts = state.tileSize;
    const extra = TILE_SUBDIV;
    const shooter = makeEntity(state, "trooper", a, tileCenter(12, ts), tileCenter(12, ts));
    const past = catalog("trooper").rangeTiles + extra;
    const target = makeEntity(state, "trooper", b, tileCenter(12 + past, ts), tileCenter(12, ts));
    shooter.facing = 0;
    shooter.order = { kind: "attack", targetId: target.id };
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.length, 0);

    state.heights[12 * state.width + 12] = HEIGHT_BASE + extra;
    shooter.cooldown = 0;
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.length, 1);
  });
});

describe("shot cover height", () => {
  it("lets a hilltop hull clear a valley tree but not a manor", () => {
    const z = HEIGHT_BASE + HULL_EYE_HEIGHT;
    assert.ok(TREE_COVER_HEIGHT < coverHeightOf("house"));
    assert.ok(TREE_COVER_HEIGHT < coverHeightOf("manor"));
    assert.equal(shotClearsCover(z, 0, TREE_COVER_HEIGHT), true);
    assert.equal(shotClearsCover(z, 0, coverHeightOf("cottage")), true);
    assert.equal(shotClearsCover(z, 0, coverHeightOf("manor")), false);
    assert.equal(shotClearsCover(0, 0, TREE_COVER_HEIGHT), false);
  });
});

describe("tank gun elevation", () => {
  it("lets a modest terrace through and blocks a steep hole lip", () => {
    const ts = TILE_SIZE;
    assert.equal(gunCanElevate(0, TANK_GUN_CLIMB, ts), true);
    assert.equal(gunCanElevate(0, TANK_GUN_CLIMB + 1, ts), false);
    const valley = HEIGHT_BASE;
    const rimDist = valley * ts;
    assert.equal(gunCanElevate(0, valley, rimDist), false);
    assert.equal(gunCanElevate(valley, 0, rimDist), true);
    const shallow = Math.ceil((valley * HEIGHT_WORLD) / Math.tan((TANK_GUN_ELEV_DEG * Math.PI) / 180) + ts);
    assert.equal(gunCanElevate(0, valley, shallow), true);
  });

  it("lets infantry fire up a lip that hides a hull gun", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const gap = HEIGHT_BASE;
    const shooter = makeEntity(state, "trooper", a, tileCenter(12, ts), tileCenter(12, ts));
    const target = makeEntity(state, "trooper", b, tileCenter(12 + gap, ts), tileCenter(12, ts));
    state.heights[12 * state.width + 12 + gap] = HEIGHT_BASE;
    shooter.facing = 0;
    shooter.order = { kind: "attack", targetId: target.id };
    assert.equal(canAimWeapon(state, shooter, target.x, target.y, target), true);
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.some((p) => p.fromId === shooter.id), true);
  });

  it("stops a valley Warden from hitting a hull much above it", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const gap = HEIGHT_BASE;
    const shooter = makeEntity(state, "warden", a, tileCenter(12, ts), tileCenter(12, ts));
    const target = makeEntity(state, "hauler", b, tileCenter(12 + gap, ts), tileCenter(12, ts));
    target.autoHarvest = false;
    state.heights[12 * state.width + 12 + gap] = HEIGHT_BASE;
    shooter.facing = 0;
    shooter.turretFacing = 0;
    shooter.order = { kind: "attack", targetId: target.id };
    assert.equal(canAimWeapon(state, shooter, target.x, target.y, target), false);
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.some((p) => p.fromId === shooter.id), false);
  });

  it("lets a hilltop Warden fire down into a valley", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const gap = HEIGHT_BASE;
    const shooter = makeEntity(state, "warden", a, tileCenter(12, ts), tileCenter(12, ts));
    const target = makeEntity(state, "hauler", b, tileCenter(12 + gap, ts), tileCenter(12, ts));
    target.autoHarvest = false;
    state.heights[12 * state.width + 12] = HEIGHT_BASE;
    shooter.facing = 0;
    shooter.turretFacing = 0;
    shooter.order = { kind: "attack", targetId: target.id };
    assert.equal(canAimWeapon(state, shooter, target.x, target.y, target), true);
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.some((p) => p.fromId === shooter.id), true);
  });

  it("still engages across one authoring terrace", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const gap = TANK_GUN_CLIMB;
    const shooter = makeEntity(state, "warden", a, tileCenter(12, ts), tileCenter(12, ts));
    const target = makeEntity(state, "hauler", b, tileCenter(12 + gap, ts), tileCenter(12, ts));
    target.autoHarvest = false;
    state.heights[12 * state.width + 12 + gap] = TANK_GUN_CLIMB;
    shooter.facing = 0;
    shooter.turretFacing = 0;
    shooter.order = { kind: "attack", targetId: target.id };
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.some((p) => p.fromId === shooter.id), true);
  });

  it("does not auto-acquire a hull it cannot elevate to", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const gap = HEIGHT_BASE;
    const shooter = makeEntity(state, "warden", a, tileCenter(12, ts), tileCenter(12, ts));
    const target = makeEntity(state, "hauler", b, tileCenter(12 + gap, ts), tileCenter(12, ts));
    target.autoHarvest = false;
    state.heights[12 * state.width + 12 + gap] = HEIGHT_BASE;
    shooter.facing = 0;
    shooter.turretFacing = 0;
    tickCombat(state, TICK_DT);
    assert.equal(shooter.attackTarget, null);
    assert.equal(state.projectiles.some((p) => p.fromId === shooter.id), false);
  });

  it("stops a valley StuG from hitting a hull much above it", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const gap = HEIGHT_BASE;
    const shooter = makeEntity(state, "ss3", a, tileCenter(12, ts), tileCenter(12, ts));
    const target = makeEntity(state, "hauler", b, tileCenter(12 + gap, ts), tileCenter(12, ts));
    target.autoHarvest = false;
    state.heights[12 * state.width + 12 + gap] = HEIGHT_BASE;
    shooter.facing = 0;
    shooter.turretFacing = 0;
    shooter.order = { kind: "attack", targetId: target.id };
    assert.equal(canAimWeapon(state, shooter, target.x, target.y, target), false);
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.some((p) => p.fromId === shooter.id), false);
  });
});
