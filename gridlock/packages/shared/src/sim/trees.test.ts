import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEIGHT_BASE,
  HULL_EYE_HEIGHT,
  SHELLS,
  TANK_MG,
  TICK_DT,
  TREE_COVER_HEIGHT,
  TREE_HIT_CHANCE,
  TREE_LOS_THROUGH,
  catalog,
} from "../catalog.js";
import { TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickProjectiles } from "./combat.js";
import {
  crushTreeAt,
  destroyEntity,
  fellTreeAt,
  isSingleTree,
  isTree,
  makeEntity,
  tileCenter,
  walkable,
} from "./geo.js";
import type { Projectile } from "./types.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { createMatch, step } from "./match.js";
import { astar } from "./path.js";
import { hasFullLos } from "./elevation.js";
import { snapshotFor } from "./snapshot.js";
import { coverTerrainFromSnapshot, tileOnMask, visionMask } from "./vision.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "TR1",
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

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
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

function plant(state: MatchState, x: number, y: number): void {
  state.terrain[y * state.width + x] = TILE_TREE;
  state.blocked[y * state.width + x] = 0;
}

describe("trees", () => {
  it("lets troopers walk groves that block Wardens", () => {
    const { state } = twoPlayerMatch();
    const x0 = 70;
    const y0 = 40;
    clearPad(state, x0, y0, x0 + 20, y0 + 8);
    for (let y = y0 + 2; y <= y0 + 6; y++) {
      for (let x = x0 + 8; x <= x0 + 12; x++) plant(state, x, y);
    }
    const gx = x0 + 10;
    const gy = y0 + 4;
    assert.equal(walkable(state, gx, gy), false);
    assert.equal(walkable(state, gx, gy, "rifleman"), true);
    assert.equal(walkable(state, gx, gy, "warden"), false);
    assert.equal(isSingleTree(state, gx, gy), false);

    const infPath = astar(state, x0 + 2, gy, x0 + 18, gy, "rifleman");
    assert.ok(infPath.some((p) => state.terrain[p.y * state.width + p.x] === TILE_TREE));
    const tankPath = astar(state, x0 + 2, gy, x0 + 18, gy, "warden");
    assert.ok(tankPath.length > 0);
    for (const p of tankPath) {
      assert.equal(state.terrain[p.y * state.width + p.x] === TILE_TREE, false, `tank through grove ${p.x},${p.y}`);
    }
  });

  it("lets a Warden crush a lone tree and not a grove", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 48;
    clearPad(state, 72, y - 4, 110, y + 4);
    plant(state, 88, y);
    assert.equal(isSingleTree(state, 88, y), true);
    assert.equal(walkable(state, 88, y, "warden"), true);

    const tank = makeEntity(state, "warden", "A", tileCenter(80, ts), tileCenter(y, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(96, ts), y: tileCenter(y, ts) });
    let sawCrush = false;
    for (let i = 0; i < 80; i++) {
      step(state, TICK_DT);
      if (state.impacts.some((im) => im.kind === "crush")) sawCrush = true;
    }
    assert.equal(state.terrain[y * state.width + 88], TILE_EMPTY);
    assert.ok(tank.x > tileCenter(88, ts));
    assert.ok(state.clearedTrees.some((t) => t.x === 88 && t.y === y));
    assert.ok(snapshotFor(state, "A").clearedTrees.some((t) => t.x === 88 && t.y === y));
    assert.ok(sawCrush, "crush should emit a debris impact");

    clearPad(state, 72, y - 4, 110, y + 4);
    tank.x = tileCenter(80, ts);
    tank.y = tileCenter(y, ts);
    tank.facing = 0;
    for (let gy = y - 1; gy <= y + 1; gy++) {
      for (let gx = 86; gx <= 90; gx++) plant(state, gx, gy);
    }
    applyCommand(state, "A", { type: "cmd.move", ids: [tank.id], x: tileCenter(96, ts), y: tileCenter(y, ts) });
    ticks(state, 80);
    assert.equal(state.terrain[y * state.width + 88], TILE_TREE);
    assert.equal(walkable(state, 88, y, "warden"), false);
  });

  it("destroys a lone tree as soon as the hull overlaps it", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 44;
    clearPad(state, 72, y - 3, 100, y + 3);
    plant(state, 90, y);
    const tank = makeEntity(state, "warden", "A", tileCenter(90, ts) - catalog("warden").radius - 2, tileCenter(y, ts));
    tank.facing = 0;
    tank.turretFacing = 0;
    tank.state = "move";
    tank.waypoints = [{ x: tileCenter(96, ts), y: tileCenter(y, ts) }];
    ticks(state, 8);
    assert.equal(state.terrain[y * state.width + 90], TILE_EMPTY, "tree should be gone once the hull hits it");
    assert.ok(state.clearedTrees.some((t) => t.x === 90 && t.y === y));
  });

  it("lets troopers finish a move through woods", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 52;
    clearPad(state, 72, y - 3, 100, y + 3);
    for (let gy = y - 2; gy <= y + 2; gy++) {
      for (let gx = 82; gx <= 90; gx++) plant(state, gx, gy);
    }
    const inf = makeEntity(state, "rifleman", "A", tileCenter(76, ts), tileCenter(y, ts));
    applyCommand(state, "A", { type: "cmd.move", ids: [inf.id], x: tileCenter(96, ts), y: tileCenter(y, ts) });
    ticks(state, 90);
    assert.ok(inf.x > tileCenter(90, ts), `infantry x=${inf.x}`);
  });

  it("opens line of sight after a Warden flattens a blocking lone tree", () => {
    const { state, a } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 80;
    const x0 = 20;
    const n = TREE_LOS_THROUGH + 1;
    const behind = x0 + n * 2;
    clearPad(state, x0 - 4, y - 2, behind + 2, y + 2);
    for (let i = 0; i < n; i++) plant(state, x0 + i * 2, y);
    makeEntity(state, "warden", a, tileCenter(x0 - 2, ts), tileCenter(y, ts));
    const blocked = visionMask(state, a);
    assert.equal(tileOnMask(blocked, state.width, behind, y), false);
    assert.equal(crushTreeAt(state, x0, y), true);
    const opened = visionMask(state, a);
    assert.notEqual(opened, blocked);
    assert.equal(tileOnMask(opened, state.width, behind, y), true);
    assert.ok(snapshotFor(state, a).clearedTrees.some((t) => t.x === x0 && t.y === y));
  });

  it("blanks crushed trees in snapshot cover without mutating the map", () => {
    const width = TREE_LOS_THROUGH + 4;
    const tiles = new Uint8Array(width);
    for (let i = 1; i <= TREE_LOS_THROUGH + 1; i++) tiles[i] = TILE_TREE;
    const occupy = new Int32Array(width);
    const elev = new Uint8Array(width);
    assert.equal(hasFullLos(elev, width, 1, 0, 0, width - 1, 0, { terrain: tiles, occupy }), false);
    const out = coverTerrainFromSnapshot(tiles, width, 1, [{ x: 1, y: 0 }]);
    assert.equal(out[1], TILE_EMPTY);
    assert.equal(tiles[1], TILE_TREE);
    assert.equal(hasFullLos(elev, width, 1, 0, 0, width - 1, 0, { terrain: out, occupy }), true);
  });

  it("lets one AP, HE, or HEAT shell that strikes a tree fell it instantly", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 46;
    const speed = catalog("warden").projectileSpeed;
    for (const shell of ["ap", "he", "heat"] as const) {
      clearPad(state, 80, y - 3, 100, y + 3);
      plant(state, 90, y);
      assert.equal(isSingleTree(state, 90, y), true);
      nudgeRngBelow(state, TREE_HIT_CHANCE);
      fireTreeShell(state, {
        x: tileCenter(84, ts),
        y: tileCenter(y, ts),
        vx: speed,
        vy: 0,
        shell,
      });
      tickProjectiles(state, TICK_DT);
      assert.equal(state.terrain[y * state.width + 90], TILE_EMPTY, `${shell} should fell a lone tree`);
      assert.ok(state.clearedTrees.some((t) => t.x === 90 && t.y === y), `${shell} clearedTrees`);
      assert.ok(state.impacts.some((i) => i.kind === "miss" && i.shell === shell), `${shell} miss impact`);
      state.projectiles = [];

      clearPad(state, 80, y - 3, 100, y + 3);
      for (let gy = y - 1; gy <= y + 1; gy++) {
        for (let gx = 88; gx <= 92; gx++) plant(state, gx, gy);
      }
      assert.equal(isSingleTree(state, 90, y), false);
      nudgeRngBelow(state, TREE_HIT_CHANCE);
      fireTreeShell(state, {
        x: tileCenter(84, ts),
        y: tileCenter(y, ts),
        vx: speed,
        vy: 0,
        shell,
      });
      tickProjectiles(state, TICK_DT);
      assert.equal(isTree(state, 88, y), false, `${shell} should fell the first grove tile on the path`);
      assert.equal(isTree(state, 90, y), true, `${shell} should not clear the whole grove`);
      state.projectiles = [];
    }
  });

  it("lets most flat-ground shells pass a tree and only some strike", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 46;
    const speed = catalog("warden").projectileSpeed;
    let hits = 0;
    const n = 80;
    for (let i = 0; i < n; i++) {
      clearPad(state, 80, y - 3, 100, y + 3);
      plant(state, 90, y);
      state.projectiles = [];
      fireTreeShell(state, {
        x: tileCenter(84, ts),
        y: tileCenter(y, ts),
        vx: speed,
        vy: 0,
        shell: "ap",
      });
      tickProjectiles(state, TICK_DT);
      if (!isTree(state, 90, y)) hits++;
    }
    assert.ok(hits >= 2, `expected some tree hits, got ${hits}/${n}`);
    assert.ok(hits <= n / 2, `15% hits should stay well under half, got ${hits}/${n}`);
  });

  it("does not let a passing shell fell a tree", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 46;
    clearPad(state, 80, y - 3, 100, y + 3);
    plant(state, 90, y);
    nudgeRngAtLeast(state, TREE_HIT_CHANCE);
    fireTreeShell(state, {
      x: tileCenter(84, ts),
      y: tileCenter(y, ts),
      vx: catalog("warden").projectileSpeed,
      vy: 0,
      shell: "ap",
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(state.terrain[y * state.width + 90], TILE_TREE);
  });

  it("does not let smoke, MG, or rifles fell a tree", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 50;
    clearPad(state, 80, y - 2, 100, y + 2);
    plant(state, 90, y);
    const cy = tileCenter(y, ts);
    const x0 = tileCenter(84, ts);
    fireTreeShell(state, {
      x: x0,
      y: cy,
      vx: catalog("warden").projectileSpeed,
      vy: 0,
      shell: "smoke",
      caliber: SHELLS.smoke.caliber,
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(state.terrain[y * state.width + 90], TILE_TREE, "smoke must not fell trees");
    state.projectiles = [];

    nudgeRngBelow(state, TREE_HIT_CHANCE);
    fireTreeShell(state, {
      x: x0,
      y: cy,
      vx: TANK_MG.projectileSpeed,
      vy: 0,
      shell: null,
      caliber: TANK_MG.caliber,
      damage: TANK_MG.damage,
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(state.terrain[y * state.width + 90], TILE_TREE, "MG must not fell trees");
    assert.equal(state.projectiles.length, 0, "MG that strikes a tree still stops");
    state.projectiles = [];
    state.impacts = [];

    nudgeRngBelow(state, TREE_HIT_CHANCE);
    fireTreeShell(state, {
      x: x0,
      y: cy,
      vx: catalog("rifleman").projectileSpeed,
      vy: 0,
      shell: null,
      caliber: catalog("rifleman").caliber,
      damage: catalog("rifleman").damage,
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(state.terrain[y * state.width + 90], TILE_TREE, "rifles must not fell trees");
    assert.equal(state.projectiles.length, 0, "rifle that strikes a tree still stops");
  });

  it("flies over a valley tree when the shot stays above the canopy", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 54;
    clearPad(state, 80, y - 3, 100, y + 3);
    plant(state, 90, y);
    const z = HEIGHT_BASE + HULL_EYE_HEIGHT;
    assert.ok(z > TREE_COVER_HEIGHT, "hilltop hull must clear a valley oak");
    nudgeRngBelow(state, TREE_HIT_CHANCE);
    fireTreeShell(state, {
      x: tileCenter(84, ts),
      y: tileCenter(y, ts),
      vx: catalog("warden").projectileSpeed,
      vy: 0,
      shell: "ap",
      z,
      vz: 0,
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(state.terrain[y * state.width + 90], TILE_TREE, "level hill shot must miss the valley tree");
  });

  it("can still strike a valley tree on a descending shot", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 56;
    clearPad(state, 80, y - 3, 100, y + 3);
    plant(state, 90, y);
    const speed = catalog("warden").projectileSpeed;
    const x0 = tileCenter(84, ts);
    const treeX = tileCenter(90, ts);
    const aimX = tileCenter(96, ts);
    const z0 = HEIGHT_BASE + HULL_EYE_HEIGHT;
    const zAim = 1;
    const vz = ((zAim - z0) / (aimX - x0)) * speed;
    nudgeRngBelow(state, TREE_HIT_CHANCE);
    fireTreeShell(state, {
      x: x0,
      y: tileCenter(y, ts),
      vx: speed,
      vy: 0,
      shell: "ap",
      z: z0,
      vz,
    });
    tickProjectiles(state, TICK_DT);
    const t = (treeX - x0) / (speed * TICK_DT);
    const shotZ = z0 + (z0 + vz * TICK_DT - z0) * t;
    assert.ok(shotZ <= TREE_COVER_HEIGHT, `descending z ${shotZ} should meet the canopy`);
    assert.equal(state.terrain[y * state.width + 90], TILE_EMPTY, "descending shell can still fell the tree");
  });

  it("is a one-hit fell even when crushTreeAt would refuse a grove", () => {
    const { state } = twoPlayerMatch();
    const y = 42;
    clearPad(state, 80, y - 2, 90, y + 2);
    for (let gx = 84; gx <= 86; gx++) plant(state, gx, y);
    assert.equal(crushTreeAt(state, 85, y), false);
    assert.equal(fellTreeAt(state, 85, y), true);
    assert.equal(state.terrain[y * state.width + 85], TILE_EMPTY);
  });

  it("lets a hilltop Warden shoot over a valley tree", () => {
    const { state, a, b } = twoPlayerMatch();
    const ts = state.tileSize;
    const y = 60;
    const x0 = 24;
    clearPad(state, x0, y - 6, x0 + 40, y + 6);
    for (const e of [...state.entities.values()]) {
      if (e.kind !== "building") continue;
      if (e.tileX + e.tileW < x0 || e.tileX > x0 + 40) continue;
      if (e.tileY + e.tileH < y - 6 || e.tileY > y + 6) continue;
      destroyEntity(state, e);
    }
    for (let x = x0; x <= x0 + 40; x++) {
      state.heights[y * state.width + x] = HEIGHT_BASE;
    }
    const valley = x0 + 10;
    state.heights[y * state.width + valley] = 0;
    plant(state, valley, y);
    const tank = makeEntity(state, "warden", a, tileCenter(x0 + 4, ts), tileCenter(y, ts));
    const dummy = makeEntity(state, "hauler", b, tileCenter(x0 + 18, ts), tileCenter(y, ts));
    dummy.autoHarvest = false;
    dummy.holdPosition = true;
    tank.facing = 0;
    tank.turretFacing = 0;
    const hp0 = dummy.hp;
    applyCommand(state, a, { type: "cmd.attack", ids: [tank.id], targetId: dummy.id });
    ticks(state, 16);
    assert.equal(isTree(state, valley, y), true, "valley tree must survive hill-to-hill fire");
    assert.ok(dummy.hp < hp0, `dummy hp ${dummy.hp} vs ${hp0}`);
  });
});

function upcomingRand(state: MatchState): number {
  const next = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  return next / 4294967296;
}

function nudgeRngBelow(state: MatchState, cap: number): void {
  for (let i = 0; i < 20000; i++) {
    if (upcomingRand(state) < cap) return;
    state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  }
  throw new Error(`could not nudge rng below ${cap}`);
}

function nudgeRngAtLeast(state: MatchState, cap: number): void {
  for (let i = 0; i < 20000; i++) {
    if (upcomingRand(state) >= cap) return;
    state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  }
  throw new Error(`could not nudge rng at least ${cap}`);
}

function fireTreeShell(
  state: MatchState,
  opts: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    shell: Projectile["shell"];
    caliber?: number;
    damage?: number;
    z?: number;
    vz?: number;
  },
): void {
  const gun = catalog("warden");
  const p: Projectile = {
    id: state.nextId++,
    ownerId: "A",
    team: 1,
    x: opts.x,
    y: opts.y,
    vx: opts.vx,
    vy: opts.vy,
    damage: opts.damage ?? gun.damage,
    penetration: gun.penetration,
    caliber: opts.caliber ?? gun.caliber,
    life: 1,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: opts.shell,
    z: opts.z,
    vz: opts.vz,
  };
  state.projectiles.push(p);
}
