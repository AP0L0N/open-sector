import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  BUILDING_TYPES,
  TICK_DT,
  TILE_SUBDIV,
  catalog,
  factionOf,
  isCivilianType,
  isDefenceStructure,
  secondsToTicks,
  type EntityType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { raiseBuilding } from "./build.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { laserFenceLinks, liveFenceLinks } from "./laser-fence.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenomorphs, on bare flat ground, nothing but what a test places. */
function field(): MatchState {
  const r = createRoom({ id: "LFN", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  state.blocked.fill(0);
  for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
  return state;
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function at(state: MatchState, type: EntityType, owner: string, cx: number, cy: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(Math.round(cx * TILE_SUBDIV), ts), tileCenter(Math.round(cy * TILE_SUBDIV), ts));
}

function still(e: Entity): Entity {
  e.holdPosition = true;
  e.cooldown = 1e9;
  return e;
}

/** Two of B's posts four cells apart on row 30, with power to light them. */
function fence(state: MatchState): [Entity, Entity] {
  at(state, "fusionnode", "B", 40, 50);
  return [at(state, "laserfence", "B", 20, 30), at(state, "laserfence", "B", 24, 30)];
}

/** B's Hive Core with its top-left tile at (tx, ty). */
function hiveCore(state: MatchState, tx: number, ty: number): Entity {
  const def = catalog("hivecore");
  const ts = state.tileSize;
  return makeEntity(state, "hivecore", "B", (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, { tileX: tx, tileY: ty, tileW: def.tileW, tileH: def.tileH });
}

describe("Laser Fence", () => {
  it("is a Xenomorph defence on the build list", () => {
    assert.ok(BUILDING_TYPES.includes("laserfence"));
    assert.equal(factionOf("laserfence"), "xeno");
    assert.ok(isDefenceStructure("laserfence"));
    assert.equal(catalog("laserfence").rangeTiles, 0, "no gun of its own");
  });

  it("links a row of posts into one fence, end to end, and never across owners or past its reach", () => {
    const p = (id: number, x: number, ownerId = "B") => ({ id, ownerId, x, y: 0 });
    assert.deepEqual(laserFenceLinks([p(1, 0), p(2, 50), p(3, 100)], 80), [
      { a: 1, b: 2 },
      { a: 2, b: 3 },
    ]);
    assert.deepEqual(laserFenceLinks([p(1, 0), p(2, 90)], 80), []);
    assert.deepEqual(laserFenceLinks([p(1, 0), p(2, 50, "A")], 80), []);
  });

  it("burns an enemy soldier standing in the beam", () => {
    const state = field();
    fence(state);
    const man = still(at(state, "rifleman", "A", 22, 30));
    ticks(state, secondsToTicks(1.5));
    assert.ok(man.hp <= 0 || !state.entities.has(man.id), `hp ${man.hp}`);
  });

  it("takes most of a tank's hull while it stands in the beam", () => {
    const state = field();
    fence(state);
    const tank = still(at(state, "jagdtiger", "A", 22, 30));
    const hp = tank.hpMax;
    ticks(state, secondsToTicks(1));
    assert.ok(tank.hp <= hp * 0.5, `${tank.hp} of ${hp}`);
  });

  it("marks a unit while a beam burns it, so the client can crackle arcs over it", () => {
    const state = field();
    fence(state);
    const man = still(at(state, "jagdtiger", "A", 22, 30));
    const own = still(at(state, "stalker", "B", 22, 31));
    ticks(state, 2);
    assert.ok(man.fenceZapTick != null && state.tick - man.fenceZapTick <= 1, `zap at ${man.fenceZapTick}, tick ${state.tick}`);
    assert.equal(own.fenceZapTick, undefined);
  });

  it("lets the hive's own units through unharmed", () => {
    const state = field();
    fence(state);
    const s = still(at(state, "stalker", "B", 22, 30));
    ticks(state, secondsToTicks(2));
    assert.equal(s.hp, s.hpMax);
  });

  it("goes dark when the hive has no energy for it", () => {
    const state = field();
    at(state, "fusionnode", "B", 40, 50);
    // 25 Thralls (20 each) take all 500: the posts, the hungriest, go dark first.
    for (let i = 0; i < 25; i++) still(at(state, "thrall", "B", 44 + i, 52));
    at(state, "laserfence", "B", 20, 30);
    at(state, "laserfence", "B", 24, 30);
    const man = still(at(state, "rifleman", "A", 22, 30));
    ticks(state, secondsToTicks(1.5));
    assert.equal(liveFenceLinks(state).links.length, 0);
    assert.equal(man.hp, man.hpMax);
  });

  it("is sited like a wall: no bare build order, every clicked post goes up together once the yard pays for them", () => {
    const state = field();
    const S = TILE_SUBDIV;
    hiveCore(state, 40 * S, 40 * S);
    raiseBuilding(state, "B", "fusionnode", 46 * S, 40 * S);
    const b = state.players.get("B")!;
    b.scrap = 10_000;
    assert.equal(applyCommand(state, "B", { type: "cmd.build", building: "laserfence" }).ok, false);
    const posts = [
      { tx: 36 * S, ty: 38 * S },
      { tx: 40 * S, ty: 38 * S },
      { tx: 44 * S, ty: 38 * S },
    ];
    assert.equal(applyCommand(state, "B", { type: "cmd.fence", posts }).ok, true);
    assert.equal(b.line?.type, "laserfence");
    assert.equal(b.line?.sites?.length, 3);
    const standing = () => [...state.entities.values()].filter((e) => e.type === "laserfence" && e.ownerId === "B");
    ticks(state, secondsToTicks(1));
    assert.equal(standing().length, 0, "nothing stands while the yard builds");
    // The line lane holds one fence at a time.
    assert.notEqual(applyCommand(state, "B", { type: "cmd.fence", posts: [{ tx: 50 * S, ty: 38 * S }] }).ok, true, "one fence at a time");
    ticks(state, secondsToTicks(120));
    assert.equal(b.line, null);
    const up = standing();
    assert.equal(up.length, 3);
    assert.deepEqual(up.map((e) => e.tileX).sort((u, v) => u! - v!), posts.map((p) => p.tx));
    assert.equal(b.scrap <= 10_000 - 3 * catalog("laserfence").cost, true);
    assert.equal(liveFenceLinks(state).links.length, 2, "a row of three is one fence");
  });

  it("stops the fence at a post set on top of another, and is the hive's alone", () => {
    const state = field();
    const S = TILE_SUBDIV;
    hiveCore(state, 40 * S, 40 * S);
    state.players.get("B")!.scrap = 10_000;
    const posts = [
      { tx: 36 * S, ty: 38 * S },
      { tx: 36 * S + 1, ty: 38 * S },
      { tx: 44 * S, ty: 38 * S },
    ];
    assert.equal(applyCommand(state, "B", { type: "cmd.fence", posts }).ok, true);
    assert.equal(state.players.get("B")!.line?.sites?.length, 1);
    assert.equal(applyCommand(state, "A", { type: "cmd.fence", posts: [{ tx: 10 * S, ty: 10 * S }] }).ok, false);
  });

  it("does not block the way: a unit walks straight through the line", () => {
    const state = field();
    fence(state);
    const s = at(state, "stalker", "B", 22, 27);
    const ts = state.tileSize;
    const goal = { x: s.x, y: tileCenter(Math.round(33 * TILE_SUBDIV), ts) };
    assert.equal(applyCommand(state, "B", { type: "cmd.move", ids: [s.id], x: goal.x, y: goal.y }).ok, true);
    ticks(state, secondsToTicks(20));
    assert.ok(Math.hypot(s.x - goal.x, s.y - goal.y) < ts * 2, `stopped at ${s.x},${s.y}`);
  });
});
