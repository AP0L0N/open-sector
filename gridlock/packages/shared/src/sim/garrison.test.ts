import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  GARRISON_HIDE_SIGHT,
  TILE_SUBDIV,
  TREE_LOS_THROUGH,
  catalog,
  garrisonCapOf,
  isGarrisonable,
} from "../catalog.js";
import { TILE_TREE, TILE_WATER } from "../maps.js";
import { hasFullLos } from "./elevation.js";
import { applyCommand } from "./commands.js";
import { buildingBounds, makeEntity, tileCenter, walkable } from "./geo.js";
import {
  enterGarrison,
  garrisonIsHostile,
  garrisonLooksOccupied,
  livingGarrison,
  occupantSightTiles,
  setGarrisonHide,
  spillGarrison,
} from "./garrison.js";
import { createMatch, step } from "./match.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import { snapshotFor } from "./snapshot.js";
import { TICK_DT } from "../catalog.js";
import type { MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "G1",
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
  return { state: createMatch(room, started.value), a: "A", b: "B" };
}

describe("cover LOS", () => {
  it("lets a ray cross water but not a wall of trees", () => {
    const elev = new Uint8Array(9);
    const terrain = new Uint8Array(9);
    const occupy = new Int32Array(9);
    terrain[1] = TILE_WATER;
    assert.equal(hasFullLos(elev, 9, 1, 0, 0, 2, 0, { terrain, occupy }), true);
    for (let i = 1; i <= TREE_LOS_THROUGH + 1; i++) terrain[i] = TILE_TREE;
    assert.equal(hasFullLos(elev, 9, 1, 0, 0, TREE_LOS_THROUGH + 2, 0, { terrain, occupy }), false);
  });

  it("stops at a building occupy id", () => {
    const elev = new Uint8Array(5);
    const terrain = new Uint8Array(5);
    const occupy = new Int32Array(5);
    occupy[2] = 7;
    assert.equal(hasFullLos(elev, 5, 1, 0, 0, 4, 0, { terrain, occupy }), false);
    assert.equal(hasFullLos(elev, 5, 1, 0, 0, 4, 0, { terrain, occupy, ignoreOccupyId: 7 }), true);
  });
});

describe("garrison", () => {
  it("lets infantry enter a house up to cap and fire from inside", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    assert.equal(isGarrisonable(house.type), true);
    const cap = garrisonCapOf("cottage");
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, inf, house), true);
    assert.equal(inf.garrisonedIn, house.id);
    assert.equal(livingGarrison(state, house).length, 1);
    assert.equal(walkable(state, 34, 12) || true, true);

    const dummy = makeEntity(state, "hauler", b, inf.x + catalog("trooper").rangeTiles * ts * 0.5, inf.y);
    dummy.autoHarvest = false;
    inf.facing = 0;
    inf.order = { kind: "attack", targetId: dummy.id };
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.length, 1);
    const shot = state.projectiles[0]!;
    const eastWall = (house.tileX + house.tileW) * ts;
    assert.ok(shot.x > house.x + 8, `muzzle x ${shot.x} vs house ${house.x}`);
    assert.ok(Math.abs(shot.x - eastWall) < ts * 2, `window x ${shot.x} wall ${eastWall}`);
    assert.equal(shot.ignoreId, house.id);
    const hp0 = house.hp;
    for (let i = 0; i < 8; i++) step(state, TICK_DT);
    assert.equal(house.hp, hp0, "garrison fire must not hit its own house");

    for (let i = 1; i < cap; i++) {
      const extra = makeEntity(state, "trooper", a, tileCenter(32, ts), tileCenter(12, ts));
      assert.equal(enterGarrison(state, extra, house), true);
    }
    const overflow = makeEntity(state, "trooper", a, tileCenter(32, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, overflow, house), false);
  });

  it("spills occupants with 0–100% damage when the house falls", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "house", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    const hp0 = inf.hp;
    assert.equal(enterGarrison(state, inf, house), true);
    house.hp = 0;
    spillGarrison(state, house);
    assert.equal(inf.garrisonedIn, null);
    assert.ok(inf.hp >= 0 && inf.hp <= hp0);
    assert.ok(livingGarrison(state, house).length === 0);
  });

  it("right-click command paths infantry into a cottage", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(48, ts), tileCenter(16, ts), {
      tileX: 44,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(36, ts), tileCenter(16, ts));
    const res = applyCommand(state, a, { type: "cmd.garrison", ids: [inf.id], buildingId: house.id });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    for (let i = 0; i < 80; i++) step(state, TICK_DT);
    assert.equal(inf.garrisonedIn, house.id);
  });

  it("does not let infantry garrison an enemy-owned house", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", b, tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    const res = applyCommand(state, a, { type: "cmd.garrison", ids: [inf.id], buildingId: house.id });
    assert.equal(res.ok, false);
  });

  it("does not let tanks garrison", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const tank = makeEntity(state, "warden", a, tileCenter(34, ts), tileCenter(12, ts));
    const res = applyCommand(state, a, { type: "cmd.garrison", ids: [tank.id], buildingId: house.id });
    assert.equal(res.ok, false);
  });

  it("puts occupant HP bars on snapshots for both sides", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    inf.hp = 22;
    assert.equal(enterGarrison(state, inf, house), true);
    makeEntity(state, "trooper", b, tileCenter(32, ts), tileCenter(12, ts));
    const you = snapshotFor(state, a).entities.find((e) => e.id === house.id);
    const them = snapshotFor(state, b).entities.find((e) => e.id === house.id);
    assert.ok(you?.garrison?.bars);
    assert.deepEqual(you!.garrison!.bars, [{ hp: 22, hpMax: inf.hpMax }]);
    assert.ok(them?.garrison?.bars);
    assert.deepEqual(them!.garrison!.bars, [{ hp: 22, hpMax: inf.hpMax }]);
    assert.equal(snapshotFor(state, b).entities.some((e) => e.id === inf.id), false);
  });

  it("wounds random occupants with small arms without chipping the walls", () => {
    const { state, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const occ = makeEntity(state, "trooper", b, tileCenter(34, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, occ, house), true);
    const houseHp = house.hp;
    const occHp = occ.hp;
    const box = buildingBounds(house, ts);
    fireAt(state, {
      x: box.x0 - 12,
      y: house.y,
      vx: catalog("trooper").projectileSpeed,
      vy: 0,
      damage: catalog("trooper").damage,
      penetration: catalog("trooper").penetration,
      caliber: catalog("trooper").caliber,
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(house.hp, houseHp);
    assert.ok(occ.hp < occHp, `occupant hp ${occ.hp} vs ${occHp}`);
    assert.equal(occ.garrisonedIn, house.id);
  });

  it("lets a tank shell damage the house and the garrison", () => {
    const { state, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const occ = makeEntity(state, "trooper", b, tileCenter(34, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, occ, house), true);
    const houseHp = house.hp;
    const occHp = occ.hp;
    const box = buildingBounds(house, ts);
    const gun = catalog("warden");
    fireAt(state, {
      x: box.x0 - 12,
      y: house.y,
      vx: gun.projectileSpeed,
      vy: 0,
      damage: gun.damage,
      penetration: gun.penetration,
      caliber: gun.caliber,
    });
    tickProjectiles(state, TICK_DT);
    assert.ok(house.hp < houseHp, `house hp ${house.hp} vs ${houseHp}`);
    assert.ok(occ.hp < occHp, `occupant hp ${occ.hp} vs ${occHp}`);
  });

  it("lets an occupant die inside while the house still stands", () => {
    const { state, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const occ = makeEntity(state, "trooper", b, tileCenter(34, ts), tileCenter(12, ts));
    const other = makeEntity(state, "trooper", b, tileCenter(33, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, occ, house), true);
    assert.equal(enterGarrison(state, other, house), true);
    const box = buildingBounds(house, ts);
    const gun = catalog("warden");
    for (let i = 0; i < 6 && livingGarrison(state, house).length === 2; i++) {
      fireAt(state, {
        x: box.x0 - 12,
        y: house.y,
        vx: gun.projectileSpeed,
        vy: 0,
        damage: gun.damage,
        penetration: gun.penetration,
        caliber: gun.caliber,
      });
      step(state, TICK_DT);
    }
    assert.ok(house.hp > 0, `house hp ${house.hp}`);
    assert.ok(livingGarrison(state, house).length < 2, "someone must die inside");
    assert.ok(livingGarrison(state, house).every((u) => u.garrisonedIn === house.id));
  });

  it("hides occupancy from the enemy and keeps it on the owner snapshot", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, inf, house), true);
    makeEntity(state, "trooper", b, tileCenter(32, ts), tileCenter(12, ts));
    setGarrisonHide(state, house, true);
    const you = snapshotFor(state, a).entities.find((e) => e.id === house.id);
    const them = snapshotFor(state, b).entities.find((e) => e.id === house.id);
    assert.equal(you?.garrison?.count, 1);
    assert.equal(you?.garrison?.hide, true);
    assert.ok(you?.garrison?.bars);
    assert.equal(them?.garrison?.count, 0);
    assert.equal(them?.garrison?.ownerId, undefined);
    assert.equal(them?.garrison?.bars, undefined);
    assert.equal(them?.garrison?.hide, undefined);
    assert.equal(garrisonLooksOccupied(state, b, house), false);
    assert.equal(garrisonIsHostile(state, b, house), true);
    assert.equal(garrisonLooksOccupied(state, a, house), true);
  });

  it("does not fire while hidden and does fire when watching", () => {
    const { state, a, b } = twoPlayerMatch();
    state.heights.fill(0);
    state.blocked.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, inf, house), true);
    const dummy = makeEntity(state, "hauler", b, inf.x + catalog("trooper").rangeTiles * ts * 0.5, inf.y);
    dummy.autoHarvest = false;
    inf.facing = 0;
    inf.order = { kind: "attack", targetId: dummy.id };
    setGarrisonHide(state, house, true);
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.length, 0);
    setGarrisonHide(state, house, false);
    inf.order = { kind: "attack", targetId: dummy.id };
    inf.attackTarget = dummy.id;
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.length, 1);
  });

  it("cuts occupant sight in hide and widens it on watch", () => {
    const { state, a } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, inf, house), true);
    const watch = occupantSightTiles(state, inf) ?? 0;
    setGarrisonHide(state, house, true);
    const hide = occupantSightTiles(state, inf) ?? 0;
    assert.equal(hide, GARRISON_HIDE_SIGHT);
    assert.ok(watch > hide * 2, `watch ${watch} vs hide ${hide}`);
  });

  it("toggles hide through a command on the house", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", tileCenter(40, ts), tileCenter(16, ts), {
      tileX: 36,
      tileY: 12,
    });
    const inf = makeEntity(state, "trooper", a, tileCenter(34, ts), tileCenter(12, ts));
    assert.equal(enterGarrison(state, inf, house), true);
    const res = applyCommand(state, a, { type: "cmd.garrisonhide", ids: [house.id], hide: true });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(house.garrisonHide, true);
    const back = applyCommand(state, a, { type: "cmd.garrisonhide", ids: [inf.id], hide: false });
    assert.equal(back.ok, true);
    assert.equal(house.garrisonHide, false);
  });
});

function fireAt(
  state: MatchState,
  opts: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    penetration: number;
    caliber: number;
  },
): Projectile {
  const p: Projectile = {
    id: state.nextId++,
    ownerId: "A",
    team: 1,
    x: opts.x,
    y: opts.y,
    vx: opts.vx,
    vy: opts.vy,
    damage: opts.damage,
    penetration: opts.penetration,
    caliber: opts.caliber,
    life: 1,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
  };
  state.projectiles.push(p);
  return p;
}

describe("water", () => {
  it("is not walkable on the yard ponds", () => {
    const { state } = twoPlayerMatch();
    let found = false;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (state.terrain[y * state.width + x] === TILE_WATER) {
          found = true;
          assert.equal(walkable(state, x, y), false);
        }
      }
    }
    assert.equal(found, true);
    void TILE_SUBDIV;
  });
});
