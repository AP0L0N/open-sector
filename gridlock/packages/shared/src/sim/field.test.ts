import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILE_EMPTY } from "../maps.js";
import { TICK_DT, wreckScrapOf } from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { tickProjectiles } from "./combat.js";
import { restampForts } from "./field.js";
import { toWreck } from "./wreck.js";
import { makeEntity, tileCenter, tileIndex, walkable, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
import { astar } from "./path.js";
import type { MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string } {
  const r = createRoom({
    id: "ENG",
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
  return { state, a: "A" };
}

function clearPatch(state: MatchState, tx: number, ty: number, w: number, h: number): void {
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      const i = tileIndex(state, x, y);
      state.terrain[i] = TILE_EMPTY;
      state.blocked[i] = 0;
      state.scrapYield[i] = 0;
      state.occupy[i] = 0;
      state.fortBlock[i] = 0;
      state.heights[i] = 0;
    }
  }
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function shot(state: MatchState, x: number, y: number, vx: number, damage: number, shell: Projectile["shell"]): void {
  state.projectiles.push({
    id: state.nextId++,
    ownerId: "B",
    team: 1,
    x,
    y,
    vx,
    vy: 0,
    damage,
    penetration: 100,
    caliber: shell ? 75 : 8,
    life: 1,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell,
  });
}

describe("engineer field works", () => {
  it("builds sandbags on the facing the order carried", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x - 30, y);
    const facing = 0;
    const res = applyCommand(state, "A", {
      type: "cmd.field",
      ids: [eng.id],
      structure: "sandbags",
      x,
      y,
      facing,
    });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 80);
    const bag = [...state.entities.values()].find((e) => e.type === "sandbags");
    assert.ok(bag, "sandbags were built");
    assert.equal(bag!.facing, facing);
    assert.equal(bag!.ruined, false);
    assert.equal(eng.state, "idle");
  });

  it("plants gun infantry on the side they approached and faces them across the bags", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const bag = makeEntity(state, "sandbags", "A", x, y, { facing: 0 });
    bag.facing = 0;
    restampForts(state);
    const fromWest = makeEntity(state, "rifleman", "A", x - 48, y);
    const fromEast = makeEntity(state, "rifleman", "A", x + 48, y);
    assert.equal(applyCommand(state, "A", { type: "cmd.cover", ids: [fromWest.id], targetId: bag.id }).ok, true);
    assert.equal(applyCommand(state, "A", { type: "cmd.cover", ids: [fromEast.id], targetId: bag.id }).ok, true);
    ticks(state, 40);
    assert.ok(fromWest.x < bag.x, `west soldier stood at ${fromWest.x}`);
    assert.ok(fromEast.x > bag.x, `east soldier stood at ${fromEast.x}`);
    assert.equal(fromWest.stance, "crouch");
    assert.equal(fromEast.stance, "crouch");
    assert.ok(Math.abs((fromWest.guardFacing ?? 9) - 0) < 0.01);
    const eastFace = fromEast.guardFacing ?? 0;
    const wrapped = Math.atan2(Math.sin(eastFace), Math.cos(eastFace));
    assert.ok(Math.abs(Math.abs(wrapped) - Math.PI) < 0.05, `east guard ${eastFace}`);
  });

  it("halves small-arms damage from the far side and lets one tank shell wreck the bags", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const bag = makeEntity(state, "sandbags", "A", x, y, { facing: 0 });
    bag.facing = 0;
    const man = makeEntity(state, "rifleman", "A", x - 21, y);
    man.coverId = bag.id;
    man.stance = "crouch";
    const hp = man.hp;
    shot(state, x + 40, y, -900, 12, null);
    tickProjectiles(state, TICK_DT);
    const afterSmall = man.hp;
    assert.ok(afterSmall < hp && hp - afterSmall < 12, `small-arms dealt ${hp - afterSmall}`);
    assert.equal(bag.ruined, false);

    shot(state, x + 30, y, -800, 10, "ap");
    tickProjectiles(state, TICK_DT);
    assert.equal(bag.ruined, true);
    assert.ok(man.hp < afterSmall, `shell left ${man.hp}`);
    assert.equal(man.coverId, null);
    assert.equal(walkable(state, worldToTile(x, ts), worldToTile(y, ts), "warden"), true);
  });

  it("stops vehicles on dragon's teeth and lets infantry through", () => {
    const { state } = twoPlayerMatch();
    const y = 40;
    clearPatch(state, 20, y - 1, 24, 3);
    for (let x = 20; x < 44; x++) {
      state.blocked[tileIndex(state, x, y - 1)] = 1;
      state.blocked[tileIndex(state, x, y + 1)] = 1;
    }
    const ts = state.tileSize;
    const teeth = makeEntity(state, "teeth", "A", tileCenter(32, ts), tileCenter(y, ts), { facing: 0 });
    teeth.facing = 0;
    restampForts(state);
    const foot = astar(state, 22, y, 42, y, "rifleman");
    const hull = astar(state, 22, y, 42, y, "warden");
    assert.ok(foot.length > 0, "infantry cross the pyramids");
    assert.equal(hull.length, 0);
  });

  it("repairs a damaged allied tank and a damaged building", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x, y);
    const tank = makeEntity(state, "warden", "A", x + 28, y);
    tank.hp = 40;
    const res = applyCommand(state, "A", { type: "cmd.repair", ids: [eng.id], targetId: tank.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 30);
    assert.ok(tank.hp > 40, `tank hp ${tank.hp}`);
    assert.equal(eng.state === "repair" || tank.hp === tank.hpMax, true);

    const house = makeEntity(state, "dynamo", "A", x, y + 40, { tileX: 34, tileY: 36 });
    house.hp = house.hpMax - 20;
    eng.x = x;
    eng.y = y + 20;
    const fix = applyCommand(state, "A", { type: "cmd.repair", ids: [eng.id], targetId: house.id });
    assert.equal(fix.ok, true, fix.ok ? "" : fix.message);
    ticks(state, 40);
    assert.ok(house.hp > house.hpMax - 20, `building hp ${house.hp}`);
  });

  it("scraps an armored wreck for scrap and removes the hull", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x + 24, y);
    const foe = makeEntity(state, "warden", "B", x, y);
    foe.hp = 0;
    toWreck(state, foe);
    const before = state.players.get("A")!.scrap;
    const pay = wreckScrapOf("warden");
    const res = applyCommand(state, "A", { type: "cmd.repair", ids: [eng.id], targetId: foe.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 20);
    assert.equal(eng.state, "repair");
    ticks(state, 70);
    assert.equal(state.entities.has(foe.id), false);
    assert.equal(state.players.get("A")!.scrap, before + pay);
    assert.equal(eng.state, "idle");
    assert.equal(walkable(state, worldToTile(x, ts), worldToTile(y, ts), "warden"), true);
  });
});
