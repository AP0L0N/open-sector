import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUILDING_TYPES,
  BUNKER_GARRISON_HP_MUL,
  BUNKER_TYPES,
  BUNKER_WOUND_MUL,
  GARRISON_HIDE_SIGHT,
  GARRISON_WATCH_SIGHT_BONUS,
  TOWER_GARRISON_CAP,
  TOWER_GARRISON_HP_MUL,
  TOWER_REACH_BONUS,
  TOWER_SIGHT_BONUS,
  TOWER_WOUND_MUL,
  TICK_DT,
  catalog,
  coverHeightOf,
  garrisonCapOf,
  type EntityType,
} from "../catalog.js";
import { TILE_EMPTY, getMap, registerMap } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickCombat } from "./combat.js";
import { sightTilesForEntity, weaponRangeWorld } from "./elevation.js";
import { makeEntity, tileCenter, worldToTile } from "./geo.js";
import { canGarrison, enterGarrison, setGarrisonHide, woundGarrison } from "./garrison.js";
import { createMatch } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { visionMask, visionMaskFromSnapshot } from "./vision.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(mapId = "yard-64"): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "WT", hostId: "A", hostName: "Alpha", mapId, maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.blocked.fill(0);
  return { state, a: "A", b: "B" };
}

function structureAt(state: MatchState, type: EntityType, owner: string, tx = 36, ty = 12): Entity {
  const def = catalog(type);
  const ts = state.tileSize;
  return makeEntity(state, type, owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function trooper(state: MatchState, type: EntityType, owner: string, tx = 34, ty = 12): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(tx, ts), tileCenter(ty, ts));
}

function seenCount(mask: Uint8Array): number {
  let n = 0;
  for (const v of mask) n += v ? 1 : 0;
  return n;
}

describe("watch tower", () => {
  it("is a defensive structure built at the construction yard, for three", () => {
    assert.ok(BUILDING_TYPES.includes("tower"));
    const def = catalog("tower");
    assert.equal(def.kind, "building");
    assert.equal(def.name, "Watch Tower");
    assert.equal(garrisonCapOf("tower"), 3);
    assert.equal(TOWER_GARRISON_CAP, 3);
    assert.ok(def.hp < catalog("bunker").hp, "a shaft, not a slab");
  });

  it("admits exactly the bunker's infantry, up to three", () => {
    const { state, a } = twoPlayerMatch();
    const tower = structureAt(state, "tower", a);
    assert.deepEqual(catalog("tower").garrisonTypes, BUNKER_TYPES);
    for (const type of ["mortarman", "cyborg", "droneop", "warden"] as EntityType[]) {
      assert.notEqual(canGarrison(state, trooper(state, type, a), tower), null, `${type} must not enter`);
    }
    for (const type of BUNKER_TYPES) {
      assert.equal(canGarrison(state, trooper(state, type, a), tower), null, `${type} may enter`);
    }
    for (let i = 0; i < TOWER_GARRISON_CAP; i++) {
      assert.equal(enterGarrison(state, trooper(state, BUNKER_TYPES[i]!, a), tower), true);
    }
    assert.equal(enterGarrison(state, trooper(state, "rifleman", a), tower), false);
    const m = trooper(state, "mortarman", a);
    assert.equal(applyCommand(state, a, { type: "cmd.garrison", ids: [m.id], buildingId: tower.id }).ok, false);
  });

  it("keeps the enemy out even while empty", () => {
    const { state, a, b } = twoPlayerMatch();
    const tower = structureAt(state, "tower", a);
    assert.notEqual(canGarrison(state, trooper(state, "rifleman", b), tower), null);
  });

  it("protects moderately: better than a house, short of a bunker", () => {
    assert.ok(TOWER_WOUND_MUL > BUNKER_WOUND_MUL && TOWER_WOUND_MUL < 1);
    assert.ok(TOWER_GARRISON_HP_MUL < BUNKER_GARRISON_HP_MUL);
    assert.ok(TOWER_GARRISON_HP_MUL >= (catalog("cottage").garrisonHpMul ?? 1));
    const { state, a } = twoPlayerMatch();
    const tower = structureAt(state, "tower", a);
    const inf = trooper(state, "rifleman", a);
    const street = inf.hpMax;
    assert.equal(enterGarrison(state, inf, tower), true);
    assert.equal(inf.hpMax, street * TOWER_GARRISON_HP_MUL);
    for (let i = 0; i < 20; i++) {
      const before = inf.hp;
      woundGarrison(state, tower, 50, 7.92);
      const took = before - inf.hp;
      assert.ok(took >= 1 && took <= Math.ceil(50 * TOWER_WOUND_MUL * 1.1), `took ${took}`);
      inf.hp = inf.hpMax;
    }
  });

  it("sees far farther than a house window, but its rifles reach only a house window farther", () => {
    const { state, a } = twoPlayerMatch();
    const tower = structureAt(state, "tower", a);
    const r = trooper(state, "rifleman", a);
    const streetSight = sightTilesForEntity(state, r);
    const streetRange = weaponRangeWorld(state, r);
    assert.equal(enterGarrison(state, r, tower), true);
    assert.equal(sightTilesForEntity(state, r), streetSight + TOWER_SIGHT_BONUS);
    assert.ok(TOWER_SIGHT_BONUS >= GARRISON_WATCH_SIGHT_BONUS * 3, "vast, not a window");
    assert.equal(weaponRangeWorld(state, r), streetRange + TOWER_REACH_BONUS * state.tileSize);
    assert.ok(TOWER_REACH_BONUS < TOWER_SIGHT_BONUS);
    assert.ok(coverHeightOf("tower") > coverHeightOf("bunker"));
    setGarrisonHide(state, tower, true);
    assert.equal(sightTilesForEntity(state, r), GARRISON_HIDE_SIGHT);
  });

  it("lets the gunner fire his MG from the cab", () => {
    const { state, a, b } = twoPlayerMatch();
    const tower = structureAt(state, "tower", a);
    const gunner = trooper(state, "gunner", a);
    assert.equal(enterGarrison(state, gunner, tower), true);
    const dummy = makeEntity(state, "hauler", b, gunner.x + state.tileSize * 12, gunner.y);
    gunner.order = { kind: "attack", targetId: dummy.id };
    tickCombat(state, TICK_DT);
    assert.ok(state.projectiles.length > 0, "tower gunner fires");
    assert.equal(state.projectiles[0]!.ignoreId, tower.id);
  });

  it("looks over a ridge that hides the same ground from a man at its foot", () => {
    const setup = (garrison: boolean) => {
      const { state, a } = twoPlayerMatch();
      state.terrain.fill(TILE_EMPTY);
      const tower = structureAt(state, "tower", a);
      const r = trooper(state, "rifleman", a);
      const ox = worldToTile(tower.x, state.tileSize);
      const oy = worldToTile(tower.y, state.tileSize);
      if (garrison) assert.equal(enterGarrison(state, r, tower), true);
      else {
        // Stand him just off the east face, at the same distance from the ridge.
        r.x = tileCenter(tower.tileX + tower.tileW, state.tileSize);
        r.y = tileCenter(oy, state.tileSize);
      }
      for (let y = 0; y < state.height; y++) {
        for (const x of [ox + 8, ox + 9]) state.heights[y * state.width + x] = 10;
      }
      return { state, a, target: oy * state.width + (ox + 26) };
    };
    const high = setup(true);
    assert.equal(visionMask(high.state, high.a)[high.target], 1, "the cab sees past the ridge");
    const low = setup(false);
    assert.equal(visionMask(low.state, low.a)[low.target], 0, "the ridge hides it from the street");
  });

  it("paints its far sight into the client fog, where a bunker adds none", () => {
    // The client's fog reads the map's own heights, not the flattened fixture,
    // so compare on a flat copy of the yard: this is about reach, not Scrap Yard's hills.
    const yard = getMap("yard-64")!;
    registerMap({ ...yard, id: "yard-64-flat", heights: yard.heights.map(() => 0), maxHeight: 0 });
    const paint = (type: EntityType) => {
      const { state, a } = twoPlayerMatch("yard-64-flat");
      const house = structureAt(state, type, a);
      assert.equal(enterGarrison(state, trooper(state, "rifleman", a), house), true);
      return seenCount(visionMaskFromSnapshot(snapshotFor(state, a), state.width, state.height, state.tileSize));
    };
    assert.ok(paint("tower") > paint("bunker") * 1.5, "the tower paints a much wider circle");
  });
});
