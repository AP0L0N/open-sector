import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BLAST_DIG_CALIBER,
  BLAST_DIG_FLOOR,
  BLAST_DIG_PER_LEVEL,
  HEIGHT_BASE,
  HEIGHT_STEP_MAX,
  MAX_SCORCH_MARKS,
  PLASMA_FIRE_CALIBER,
  PLASMA_FIRE_SECONDS,
  TICK_DT,
  catalog,
  isCivilianType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE, TILE_WATER } from "../maps.js";
import { tickProjectiles } from "./combat.js";
import { enterGarrison, spillGarrison } from "./garrison.js";
import { makeEntity, occupant, tileCenter, walkable, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
import { tickCollision } from "./collision.js";
import { MAX_SHELL_HOLES, burnVariant, plasmaScorchRadius, shellHoleRadius, soakBlast } from "./remains.js";
import { snapshotFor } from "./snapshot.js";
import { canSeeEntity } from "./vision.js";
import type { MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "RM1",
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
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), a: "A", b: "B" };
}

function clearCover(state: MatchState): void {
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) state.entities.delete(e.id);
  }
}

function entityCovers(state: MatchState, x: number, y: number): boolean {
  for (const e of state.entities.values()) {
    if (e.hp <= 0) continue;
    if (x >= e.tileX && y >= e.tileY && x < e.tileX + e.tileW && y < e.tileY + e.tileH) return true;
  }
  return false;
}

function landTile(state: MatchState): { x: number; y: number } {
  for (let y = 8; y < state.height - 8; y++) {
    for (let x = 8; x < state.width - 8; x++) {
      const i = y * state.width + x;
      if (state.terrain[i] !== TILE_EMPTY) continue;
      if ((state.occupy[i] ?? 0) !== 0) continue;
      if (entityCovers(state, x, y)) continue;
      return { x, y };
    }
  }
  throw new Error("no open dirt");
}

function dropRound(
  state: MatchState,
  x: number,
  y: number,
  caliber: number,
  shell: Projectile["shell"] = null,
): void {
  const p: Projectile = {
    id: state.nextId++,
    ownerId: "A",
    team: 1,
    x,
    y,
    vx: 0,
    vy: -1,
    damage: catalog("warden").damage,
    penetration: catalog("warden").penetration,
    caliber,
    life: 0,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell,
  };
  state.projectiles.push(p);
  tickProjectiles(state, TICK_DT);
}

describe("infantry bodies", () => {
  it("leaves a passable corpse with blood and removes the soldier", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const tile = landTile(state);
    const spot = { x: tileCenter(tile.x, state.tileSize), y: tileCenter(tile.y, state.tileSize) };
    const trooper = makeEntity(state, "rifleman", a, spot.x, spot.y, { facing: 1.2 });
    const id = trooper.id;
    trooper.hp = 0;
    step(state);
    assert.equal(state.entities.has(id), false);
    assert.equal(state.bodies.length, 1);
    const body = state.bodies[0]!;
    assert.equal(body.type, "rifleman");
    assert.equal(body.ownerId, a);
    assert.equal(body.x, spot.x);
    assert.equal(body.y, spot.y);
    assert.equal(body.facing, 1.2);
    assert.ok(body.blood.length >= 4 && body.blood.length <= 7);
    assert.equal(body.burned, undefined);
    assert.equal(occupant(state, tile.x, tile.y), 0);
    assert.equal(walkable(state, tile.x, tile.y, "rifleman"), true);
    const walker = makeEntity(state, "rifleman", a, spot.x, spot.y);
    tickCollision(state);
    assert.equal(walker.hp > 0, true);
    assert.equal(walker.x, spot.x);
    assert.equal(walker.y, spot.y);
    assert.equal(state.bodies.length, 1);
  });

  it("drops no blood on water and none at all for a death inside a house", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const wet = landTile(state);
    state.terrain[wet.y * state.width + wet.x] = TILE_WATER;
    const swimmer = makeEntity(state, "rifleman", a, tileCenter(wet.x, state.tileSize), tileCenter(wet.y, state.tileSize));
    swimmer.hp = 0;
    const houseTile = landTile(state);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", houseTile.x * ts, houseTile.y * ts, {
      tileX: houseTile.x,
      tileY: houseTile.y,
    });
    const inside = makeEntity(state, "gunner", a, house.x, house.y);
    assert.equal(enterGarrison(state, inside, house), true);
    inside.hp = 0;
    step(state);
    assert.equal(state.bodies.length, 1);
    assert.equal(state.bodies[0]!.type, "rifleman");
    assert.equal(state.bodies[0]!.blood.length, 0);
    assert.equal(state.entities.has(inside.id), false);
  });

  it("still leaves a body when a ruined house spills a dead soldier outside", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const houseTile = landTile(state);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", houseTile.x * ts, houseTile.y * ts, {
      tileX: houseTile.x,
      tileY: houseTile.y,
    });
    const inside = makeEntity(state, "rifleman", a, house.x, house.y);
    assert.equal(enterGarrison(state, inside, house), true);
    spillGarrison(state, house);
    inside.hp = 0;
    step(state);
    assert.equal(state.bodies.length, 1);
    assert.equal(state.bodies[0]!.type, "rifleman");
    assert.ok(state.bodies[0]!.blood.length >= 4);
    assert.equal(state.entities.has(inside.id), false);
  });

  it("does not block sight and is not a tank wreck", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const ax = 40;
    const ay = 40;
    const watcher = makeEntity(state, "rifleman", b, tileCenter(ax, ts), tileCenter(ay + 10, ts));
    const friend = makeEntity(state, "rifleman", a, tileCenter(ax, ts), tileCenter(ay, ts));
    const middle = makeEntity(state, "rifleman", a, tileCenter(ax, ts), tileCenter(ay + 5, ts));
    watcher.cooldown = 99;
    friend.cooldown = 99;
    watcher.holdPosition = true;
    friend.holdPosition = true;
    middle.hp = 0;
    const tank = makeEntity(state, "warden", a, tileCenter(ax + 8, ts), tileCenter(ay, ts));
    tank.hp = 0;
    step(state);
    assert.equal(tank.wreck, true);
    assert.equal(state.entities.has(tank.id), true);
    assert.equal(state.bodies.length, 1);
    assert.equal(state.bodies[0]!.type, "rifleman");
    assert.equal(canSeeEntity(state, b, friend), true);
  });

  it("shows your own corpse in the fog and hides an enemy corpse you cannot see", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const rig = [...state.entities.values()].find((e) => e.ownerId === a && e.type === "rig");
    assert.ok(rig);
    const farX = rig.tileX > state.width / 2 ? 6 : state.width - 7;
    const farY = rig.tileY > state.height / 2 ? 6 : state.height - 7;
    const foe = makeEntity(state, "rifleman", b, tileCenter(farX, state.tileSize), tileCenter(farY, state.tileSize));
    foe.hp = 0;
    step(state);
    const id = state.bodies[0]!.id;
    assert.equal(snapshotFor(state, b).bodies.some((body) => body.id === id), true);
    assert.equal(snapshotFor(state, a).bodies.some((body) => body.id === id), false);
  });
});

describe("burned corpses", () => {
  it("picks each of the three collapses from the corpse id", () => {
    const seen = new Set<number>();
    for (let id = 1; id <= 48; id++) {
      const v = burnVariant(id);
      assert.ok(v === 0 || v === 1 || v === 2);
      assert.equal(burnVariant(id), v);
      seen.add(v);
    }
    assert.equal(seen.size, 3);
  });
});

describe("shell holes and water splashes", () => {
  it("scars dirt only for heavy shells, and scales the crater with caliber", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const tile = landTile(state);
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    dropRound(state, x, y, 8);
    assert.equal(state.holes.length, 0);
    assert.equal(state.impacts[0]!.splash, undefined);
    state.impacts = [];
    dropRound(state, x, y, 75, "ap");
    assert.equal(state.holes.length, 1);
    assert.equal(state.holes[0]!.radius, shellHoleRadius(75));
    assert.equal(state.impacts[0]!.splash, undefined);
    state.impacts = [];
    dropRound(state, x + 4, y, 150, "he");
    assert.equal(state.holes.length, 2);
    assert.ok(state.holes[1]!.radius > state.holes[0]!.radius);
    state.impacts = [];
    dropRound(state, x, y + 4, 75, "smoke");
    assert.equal(state.holes.length, 2);
    assert.equal(state.impacts[0]!.splash, undefined);
  });

  it("sends a heavy round's damage with its impact so the burst can be sized", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const tile = landTile(state);
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    dropRound(state, x, y, 8);
    assert.equal(state.impacts[0]!.damage, undefined);
    state.impacts = [];
    dropRound(state, x, y, 75, "he");
    assert.equal(state.impacts[0]!.damage, catalog("warden").damage);
  });

  it("splashes on water for shells and bullets and never leaves a hole", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const tile = landTile(state);
    state.terrain[tile.y * state.width + tile.x] = TILE_WATER;
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    dropRound(state, x, y, 8);
    assert.equal(state.holes.length, 0);
    assert.equal(state.impacts[0]!.splash, true);
    assert.equal(state.impacts[0]!.caliber, 8);
    state.impacts = [];
    dropRound(state, x, y, 75, "ap");
    assert.equal(state.holes.length, 0);
    assert.equal(state.impacts[0]!.splash, true);
  });

  it("does not crater a wall, a building, or a direct hit on a soldier", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const wall = landTile(state);
    state.terrain[wall.y * state.width + wall.x] = TILE_BLOCKED;
    dropRound(state, tileCenter(wall.x, state.tileSize), tileCenter(wall.y, state.tileSize), 75, "ap");
    assert.equal(state.holes.length, 0);

    const pad = landTile(state);
    const ts = state.tileSize;
    const house = makeEntity(state, "cottage", "", pad.x * ts, pad.y * ts, { tileX: pad.x, tileY: pad.y });
    state.impacts = [];
    dropRound(state, house.x, house.y, 75, "he");
    assert.equal(state.holes.length, 0);

    const openX = Math.min(state.width - 4, house.tileX + house.tileW + 12);
    const openY = house.tileY;
    const trooper = makeEntity(state, "rifleman", a, tileCenter(openX, ts), tileCenter(openY, ts));
    trooper.holdPosition = true;
    state.projectiles = [];
    state.impacts = [];
    const speed = 400;
    state.projectiles.push({
      id: state.nextId++,
      ownerId: "A",
      team: 1,
      x: trooper.x - 30,
      y: trooper.y,
      vx: speed,
      vy: 0,
      damage: 400,
      penetration: 200,
      caliber: 75,
      life: 1,
      ignoreId: -1,
      fromId: -1,
      bounced: false,
      shell: "he",
    });
    tickProjectiles(state, TICK_DT);
    assert.equal(trooper.hp, 0);
    assert.equal(state.holes.length, 0);
    assert.ok(state.impacts.some((i) => i.kind === "kill"));
  });

  it("forgets the oldest crater past the cap and never removes a body", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const tile = landTile(state);
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    const trooper = makeEntity(state, "rifleman", a, x, y);
    trooper.hp = 0;
    step(state);
    const bodyId = state.bodies[0]!.id;
    for (let i = 0; i < MAX_SHELL_HOLES + 3; i++) {
      state.projectiles = [];
      dropRound(state, x + (i % 5), y, 75, "ap");
    }
    assert.equal(state.holes.length, MAX_SHELL_HOLES);
    assert.equal(state.bodies.length, 1);
    assert.equal(state.bodies[0]!.id, bodyId);
    step(state);
    assert.equal(state.bodies[0]!.id, bodyId);
  });
});

describe("blasts sink the ground", () => {
  function flatMatch(): MatchState {
    const { state } = twoPlayerMatch();
    clearCover(state);
    for (let i = 0; i < state.terrain.length; i++) if (state.terrain[i] === TILE_WATER) state.terrain[i] = TILE_EMPTY;
    state.fortBlock.fill(0);
    state.heights.fill(HEIGHT_BASE);
    return state;
  }

  function steepestStep(state: MatchState): number {
    let worst = 0;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x + 1 < state.width; x++) {
        for (const [nx, ny] of [[x + 1, y], [x, y + 1], [x + 1, y + 1]] as const) {
          if (ny >= state.height) continue;
          const d = Math.abs(state.heights[y * state.width + x]! - state.heights[ny * state.width + nx]!);
          if (d > worst) worst = d;
        }
      }
    }
    return worst;
  }

  it("drops a tile one step once enough heavy strikes land on it", () => {
    const state = flatMatch();
    const tile = landTile(state);
    const i = tile.y * state.width + tile.x;
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    const hits = Math.ceil(BLAST_DIG_PER_LEVEL / BLAST_DIG_CALIBER);
    for (let n = 0; n < hits - 1; n++) dropRound(state, x, y, BLAST_DIG_CALIBER, "he");
    assert.equal(state.heights[i], HEIGHT_BASE);
    assert.equal(state.dug.size, 0);
    dropRound(state, x, y, BLAST_DIG_CALIBER, "he");
    assert.equal(state.heights[i], HEIGHT_BASE - 1);
    assert.equal(state.dug.get(i), HEIGHT_BASE - 1);
    assert.equal(state.digRev, 1);
    assert.ok(steepestStep(state) <= HEIGHT_STEP_MAX);
    const snap = snapshotFor(state, "A");
    assert.deepEqual(snap.dug, [i, HEIGHT_BASE - 1]);
  });

  it("never digs with light shells", () => {
    const state = flatMatch();
    const tile = landTile(state);
    for (let n = 0; n < 40; n++) {
      dropRound(state, tileCenter(tile.x, state.tileSize), tileCenter(tile.y, state.tileSize), 75, "he");
    }
    assert.equal(state.dug.size, 0);
    assert.equal(snapshotFor(state, "A").dug, undefined);
  });

  it("widens a pounded spot into a walkable valley that stops at the floor", () => {
    const state = flatMatch();
    const tile = landTile(state);
    const i = tile.y * state.width + tile.x;
    for (let n = 0; n < 200; n++) soakBlast(state, tile.x, tile.y, BLAST_DIG_PER_LEVEL);
    assert.equal(state.heights[i], BLAST_DIG_FLOOR);
    assert.ok(steepestStep(state) <= HEIGHT_STEP_MAX);
    // The slope climbs one step per ring back to the old ground.
    const ring = HEIGHT_BASE - BLAST_DIG_FLOOR;
    assert.equal(state.heights[i + ring], HEIGHT_BASE);
    assert.equal(state.heights[i + ring - 1], HEIGHT_BASE - 1);
    let min = Infinity;
    for (const h of state.heights) min = Math.min(min, h);
    assert.equal(min, BLAST_DIG_FLOOR);
    assert.equal(soakBlast(state, tile.x, tile.y, BLAST_DIG_PER_LEVEL), false);
  });

  it("leaves water, walls, and building ground where they are", () => {
    const state = flatMatch();
    const tile = landTile(state);
    const w = state.width;
    const i = tile.y * w + tile.x;
    state.terrain[i + 1] = TILE_WATER;
    state.terrain[i - 1] = TILE_BLOCKED;
    for (let n = 0; n < 3; n++) soakBlast(state, tile.x, tile.y, BLAST_DIG_PER_LEVEL);
    assert.equal(state.heights[i], HEIGHT_BASE - 3);
    assert.equal(state.heights[i + 1], HEIGHT_BASE);
    assert.equal(state.heights[i - 1], HEIGHT_BASE);
    assert.equal(soakBlast(state, tile.x + 1, tile.y, BLAST_DIG_PER_LEVEL * 4), false);
    const ts = state.tileSize;
    const pad = landTile(state);
    makeEntity(state, "cottage", "", pad.x * ts, pad.y * ts, { tileX: pad.x, tileY: pad.y });
    assert.equal(soakBlast(state, pad.x, pad.y, BLAST_DIG_PER_LEVEL * 4), false);
  });
});

describe("plasma scorch", () => {
  function xenoMatch(): MatchState {
    const { state } = twoPlayerMatch();
    state.players.get("A")!.faction = "xeno";
    clearCover(state);
    return state;
  }

  it("chars the ground instead of digging, sized to the round, and does not sink it", () => {
    const state = xenoMatch();
    const tile = landTile(state);
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    const i = tile.y * state.width + tile.x;
    const before = state.heights[i];
    dropRound(state, x, y, 8);
    assert.equal(state.holes.length, 1);
    assert.equal(state.holes[0]!.scorch, true);
    assert.equal(state.holes[0]!.radius, plasmaScorchRadius(8));
    dropRound(state, x + 4, y, 150, "ap");
    assert.equal(state.holes.length, 2);
    assert.equal(state.holes[1]!.scorch, true);
    assert.ok(state.holes[1]!.radius > state.holes[0]!.radius);
    assert.ok(state.holes[1]!.radius > shellHoleRadius(150));
    assert.equal(state.heights[i], before);
  });

  it("leaves a small, short fire at the heart from cannon caliber up, none for small arms", () => {
    const state = xenoMatch();
    const tile = landTile(state);
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    dropRound(state, x, y, 8);
    assert.equal(state.fires.length, 0);
    dropRound(state, x, y, 75, "ap");
    assert.equal(state.fires.length, 1);
    const fire = state.fires[0]!;
    assert.ok(Math.hypot(fire.x - x, fire.y - y) < 0.01);
    assert.ok(fire.radius < plasmaScorchRadius(75));
    assert.ok(fire.lifeMax <= PLASMA_FIRE_SECONDS * 1.1);
  });

  it("burns the trees in reach instead of felling them", () => {
    const state = xenoMatch();
    const tile = landTile(state);
    const i = tile.y * state.width + tile.x;
    state.terrain[i] = TILE_TREE;
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    dropRound(state, x + 1, y, PLASMA_FIRE_CALIBER);
    assert.equal(state.terrain[i], TILE_EMPTY);
    assert.deepEqual(state.clearedTrees.at(-1), { x: tile.x, y: tile.y, burn: true });
  });

  it("lets a rifle bolt char the ground under a tree without burning it", () => {
    const state = xenoMatch();
    const tile = landTile(state);
    const i = tile.y * state.width + tile.x;
    state.terrain[i] = TILE_TREE;
    dropRound(state, tileCenter(tile.x, state.tileSize), tileCenter(tile.y, state.tileSize), 8);
    assert.equal(state.terrain[i], TILE_TREE);
    assert.equal(state.clearedTrees.length, 0);
    assert.equal(state.holes[0]!.scorch, true);
  });

  it("keeps Alliance shells digging craters", () => {
    const state = xenoMatch();
    state.players.get("A")!.faction = "alliance";
    const tile = landTile(state);
    dropRound(state, tileCenter(tile.x, state.tileSize), tileCenter(tile.y, state.tileSize), 75, "ap");
    assert.equal(state.holes.length, 1);
    assert.equal(state.holes[0]!.scorch, undefined);
    assert.equal(state.fires.length, 0);
  });

  it("still splashes on water with no scorch or fire", () => {
    const state = xenoMatch();
    const tile = landTile(state);
    state.terrain[tile.y * state.width + tile.x] = TILE_WATER;
    dropRound(state, tileCenter(tile.x, state.tileSize), tileCenter(tile.y, state.tileSize), 75, "ap");
    assert.equal(state.holes.length, 0);
    assert.equal(state.fires.length, 0);
    assert.equal(state.impacts[0]!.splash, true);
  });

  it("caps scorches apart from craters, so bolts never erase a shell hole", () => {
    const state = xenoMatch();
    const tile = landTile(state);
    const x = tileCenter(tile.x, state.tileSize);
    const y = tileCenter(tile.y, state.tileSize);
    state.players.get("A")!.faction = "alliance";
    dropRound(state, x, y, 75, "ap");
    const craterId = state.holes[0]!.id;
    state.players.get("A")!.faction = "xeno";
    for (let n = 0; n < MAX_SCORCH_MARKS + 5; n++) {
      state.projectiles = [];
      dropRound(state, x + (n % 5), y, 8);
    }
    assert.equal(state.holes.filter((h) => h.scorch).length, MAX_SCORCH_MARKS);
    assert.ok(state.holes.some((h) => h.id === craterId));
  });

  it("goes out flagged in the snapshot", () => {
    const state = xenoMatch();
    const tile = landTile(state);
    dropRound(state, tileCenter(tile.x, state.tileSize), tileCenter(tile.y, state.tileSize), 40);
    const snap = snapshotFor(state, "A");
    assert.equal(snap.holes[0]!.scorch, true);
  });
});
