import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  GARRISON_STRUCTURAL_CALIBER,
  HULL_EYE_HEIGHT,
  INFANTRY_EYE_HEIGHT,
  INFANTRY_UPHILL_SIGHT,
  SCOUT_HP_MUL,
  TICK_DT,
  catalog,
  entityIsScouting,
  hasScout,
  isCivilianType,
  scoutHpMaxOf,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickProjectiles } from "./combat.js";
import { observerEyeForEntity, sightTilesForEntity, sightTilesOf, weaponRangeWorld } from "./elevation.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { paintEntitySight, tileOnMask, visionMask } from "./vision.js";
import type { MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "SC1",
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

function clearCover(state: MatchState): void {
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
}

function fireAt(
  state: MatchState,
  opts: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage?: number;
    penetration?: number;
    caliber?: number;
  },
): Projectile {
  const gun = catalog("trooper");
  const p: Projectile = {
    id: state.nextId++,
    ownerId: "A",
    team: 1,
    x: opts.x,
    y: opts.y,
    vx: opts.vx,
    vy: opts.vy,
    damage: opts.damage ?? gun.damage,
    penetration: opts.penetration ?? gun.penetration,
    caliber: opts.caliber ?? gun.caliber,
    life: 1,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
  };
  state.projectiles.push(p);
  return p;
}

describe("hatch scout", () => {
  it("gives Wardens a 3× trooper-HP crew and leaves other types unscouted", () => {
    assert.equal(hasScout("warden"), true);
    assert.equal(hasScout("ss3"), true);
    assert.equal(hasScout("hauler"), false);
    assert.equal(hasScout("trooper"), false);
    assert.equal(scoutHpMaxOf("warden"), catalog("trooper").hp * SCOUT_HP_MUL);
    assert.equal(scoutHpMaxOf("ss3"), catalog("trooper").hp * SCOUT_HP_MUL);
    assert.equal(scoutHpMaxOf("hauler"), 0);
  });

  it("starts buttoned with infantry-less hull sight", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", a, tileCenter(24, ts), tileCenter(24, ts));
    assert.equal(tank.scoutOut, false);
    assert.equal(tank.scoutHp, scoutHpMaxOf("warden"));
    assert.equal(entityIsScouting(tank), false);
    assert.equal(sightTilesForEntity(state, tank), sightTilesOf("warden", 0));
    assert.equal(observerEyeForEntity(tank), HULL_EYE_HEIGHT);
  });

  it("opens the hatch for infantry fog, peek, and uphill sight without stretching the gun", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    const range0 = weaponRangeWorld(state, tank);
    const res = applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: true });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(tank.scoutOut, true);
    assert.equal(sightTilesForEntity(state, tank), sightTilesOf("trooper", 0));
    assert.equal(observerEyeForEntity(tank), INFANTRY_EYE_HEIGHT);
    assert.equal(weaponRangeWorld(state, tank), range0);

    const inf = makeEntity(state, "trooper", a, tileCenter(ox, ts), tileCenter(oy + 4, ts));
    const tankMask = new Uint8Array(state.width * state.height);
    const infMask = new Uint8Array(state.width * state.height);
    paintEntitySight(tankMask, state.width, state.height, ts, tank, state.heights);
    paintEntitySight(infMask, state.width, state.height, ts, inf, state.heights);
    const infR = sightTilesOf("trooper", 0);
    assert.equal(tileOnMask(tankMask, state.width, ox + infR, oy), true);
    assert.equal(tileOnMask(infMask, state.width, ox + infR, oy + 4), true);

    state.heights[oy * state.width + (ox + 2)] = 6;
    const peek = new Uint8Array(state.width * state.height);
    const hull = new Uint8Array(state.width * state.height);
    paintEntitySight(peek, state.width, state.height, ts, tank, state.heights);
    tank.scoutOut = false;
    paintEntitySight(hull, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(peek, state.width, ox + 8, oy), true);
    assert.equal(tileOnMask(hull, state.width, ox + 8, oy), false);
  });

  it("sees a hilltop past flat hull sight the way infantry does", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const ox = 20;
    const oy = 20;
    const rise = 6;
    const dist = catalog("trooper").sightTiles + rise * INFANTRY_UPHILL_SIGHT;
    state.heights[oy * state.width + (ox + dist)] = rise;
    const tank = makeEntity(state, "warden", a, tileCenter(ox, ts), tileCenter(oy, ts));
    applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: true });
    const mask = new Uint8Array(state.width * state.height);
    paintEntitySight(mask, state.width, state.height, ts, tank, state.heights);
    assert.equal(tileOnMask(mask, state.width, ox + dist, oy), true);
  });

  it("lets small arms wound the exposed scout instead of the hull", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", a, tileCenter(28, ts), tileCenter(24, ts));
    tank.facing = Math.PI;
    applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: true });
    const hull = tank.hp;
    const scout = tank.scoutHp;
    fireAt(state, {
      x: tank.x - tank.radius - 6,
      y: tank.y,
      vx: catalog("trooper").projectileSpeed,
      vy: 0,
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(tank.hp, hull);
    assert.ok(tank.scoutHp < scout, `scout hp ${tank.scoutHp} vs ${scout}`);
    assert.equal(tank.scoutOut, true);
    assert.ok(catalog("trooper").caliber < GARRISON_STRUCTURAL_CALIBER);
  });

  it("buttons up on a hull hit and keeps the wounded HP", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", a, tileCenter(28, ts), tileCenter(24, ts));
    tank.facing = Math.PI;
    applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: true });
    tank.scoutHp = 40;
    const hull = tank.hp;
    const gun = catalog("warden");
    fireAt(state, {
      x: tank.x - tank.radius - 6,
      y: tank.y,
      vx: gun.projectileSpeed,
      vy: 0,
      damage: gun.damage,
      penetration: gun.penetration,
      caliber: gun.caliber,
    });
    tickProjectiles(state, TICK_DT);
    assert.ok(tank.hp < hull, `hull ${tank.hp} vs ${hull}`);
    assert.equal(tank.scoutOut, false);
    assert.equal(tank.scoutHp, 40);
    applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: true });
    assert.equal(tank.scoutOut, true);
    assert.equal(tank.scoutHp, 40);
  });

  it("does not let rifles wound a buttoned scout", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", a, tileCenter(28, ts), tileCenter(24, ts));
    tank.facing = Math.PI;
    tank.scoutHp = 40;
    const scout = tank.scoutHp;
    const hull = tank.hp;
    fireAt(state, {
      x: tank.x - tank.radius - 6,
      y: tank.y,
      vx: catalog("trooper").projectileSpeed,
      vy: 0,
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(tank.scoutHp, scout);
    assert.equal(tank.hp, hull);
    assert.equal(tank.scoutOut, false);
  });

  it("loses the hatch for good when the scout dies", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", a, tileCenter(28, ts), tileCenter(24, ts));
    applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: true });
    tank.scoutHp = 4;
    fireAt(state, {
      x: tank.x - tank.radius - 6,
      y: tank.y,
      vx: catalog("trooper").projectileSpeed,
      vy: 0,
      damage: 20,
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(tank.scoutHp, 0);
    assert.equal(tank.scoutOut, false);
    const res = applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: true });
    assert.equal(res.ok, false);
    assert.equal(tank.scoutOut, false);
    assert.equal(sightTilesForEntity(state, tank), sightTilesOf("warden", 0));
  });

  it("rebuilds fog when the hatch toggles and snapshots the crew", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const tank = makeEntity(state, "warden", a, tileCenter(40, ts), tileCenter(40, ts));
    makeEntity(state, "trooper", b, tileCenter(42, ts), tileCenter(40, ts));
    const first = visionMask(state, a);
    applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: true });
    const open = visionMask(state, a);
    assert.notEqual(open, first);
    const you = snapshotFor(state, a).entities.find((e) => e.id === tank.id);
    const them = snapshotFor(state, b).entities.find((e) => e.id === tank.id);
    assert.equal(you?.scout?.out, true);
    assert.equal(you?.scout?.hp, tank.scoutHp);
    assert.equal(them?.scout?.out, true);
    applyCommand(state, a, { type: "cmd.scout", ids: [tank.id], out: false });
    const shut = snapshotFor(state, b).entities.find((e) => e.id === tank.id);
    assert.equal(shut?.scout, undefined);
    const youShut = snapshotFor(state, a).entities.find((e) => e.id === tank.id);
    assert.equal(youShut?.scout?.out, undefined);
    assert.equal(youShut?.scout?.hp, tank.scoutHp);
  });
});
