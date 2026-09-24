import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILE_EMPTY } from "../maps.js";
import { catalog, fieldSpan, TICK_DT, wreckScrapOf } from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import { fieldSiteClear, restampForts, sandbagCoverBonus, toothOffsets, toothSeedAt } from "./field.js";
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

  it("gives crouched and crawling infantry extra health behind sandbags", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const bag = makeEntity(state, "sandbags", "A", x, y, { facing: 0 });
    bag.facing = 0;
    const man = makeEntity(state, "rifleman", "A", x - 21, y);
    const eng = makeEntity(state, "engineer", "A", x + 21, y);
    const base = catalog("rifleman").hp;
    const engBase = catalog("engineer").hp;
    man.stance = "stand";
    man.stanceOrder = "stand";
    step(state, TICK_DT);
    assert.equal(man.hpMax, base);
    assert.equal(sandbagCoverBonus(state, man), 0);

    man.stance = "crouch";
    man.stanceOrder = "crouch";
    eng.stance = "crawl";
    eng.stanceOrder = "crawl";
    step(state, TICK_DT);
    const bonus = Math.round(base * 0.5);
    assert.equal(man.hpMax, base + bonus);
    assert.equal(man.hp, base + bonus);
    assert.equal(eng.hpMax, engBase + Math.round(engBase * 0.5));

    man.stance = "crawl";
    man.stanceOrder = "crawl";
    step(state, TICK_DT);
    assert.equal(man.hpMax, base + bonus);

    man.x = x - 80;
    step(state, TICK_DT);
    assert.equal(man.hpMax, base);
    assert.equal(man.hp, base);
  });

  it("lets one tank shell wreck the bags and still wound the men behind them", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const bag = makeEntity(state, "sandbags", "A", x, y, { facing: 0 });
    bag.facing = 0;
    const man = makeEntity(state, "rifleman", "A", x - 21, y);
    man.stance = "crouch";
    step(state, TICK_DT);
    const before = man.hp;
    shot(state, x + 30, y, -800, 40, "ap");
    tickProjectiles(state, TICK_DT);
    assert.equal(bag.ruined, true);
    assert.ok(man.hp < catalog("rifleman").hp, `shell left ${man.hp}`);
    step(state, TICK_DT);
    assert.equal(man.hpMax, catalog("rifleman").hp);
    assert.equal(walkable(state, worldToTile(x, ts), worldToTile(y, ts), "warden"), true);
  });

  it("stops a crawling gun at the sandbags and lets a crouching gun fire over them", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 28, 28, 20, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const bag = makeEntity(state, "sandbags", "A", x, y, { facing: Math.PI / 2 });
    bag.facing = Math.PI / 2;
    const shooter = makeEntity(state, "rifleman", "A", x - 36, y);
    const foe = makeEntity(state, "rifleman", "B", x + 48, y);
    foe.holdPosition = true;
    foe.cooldown = 99;
    foe.order = { kind: "rotate", x: foe.x, y: foe.y };
    shooter.facing = 0;
    shooter.turretFacing = 0;
    shooter.cooldown = 0;
    shooter.clip = 8;
    shooter.stance = "crawl";
    shooter.stanceOrder = "crawl";
    shooter.order = { kind: "attack", targetId: foe.id };
    tickCombat(state, TICK_DT);
    assert.equal(state.projectiles.filter((p) => p.fromId === shooter.id).length, 0);

    shooter.stance = "crouch";
    shooter.stanceOrder = "crouch";
    shooter.cooldown = 0;
    state.projectiles = [];
    tickCombat(state, TICK_DT);
    assert.ok(state.projectiles.some((p) => p.fromId === shooter.id), "crouched rifle fires over the bags");
  });

  it("lets sandbags and dragon's teeth sit against each other", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 24, 24, 28, 20);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const facing = Math.PI / 2;
    const bag = makeEntity(state, "sandbags", "A", x, y, { facing });
    bag.facing = facing;
    restampForts(state);
    const bags = fieldSpan("sandbags")!;
    const teeth = fieldSpan("teeth")!;
    assert.equal(fieldSiteClear(state, "sandbags", x + bags.length, y, facing), true);
    assert.equal(fieldSiteClear(state, "sandbags", x + bags.length * 0.45, y, facing), false);
    assert.equal(fieldSiteClear(state, "teeth", x, y + bags.thick / 2 + teeth.thick / 2, facing), true);
    const next = makeEntity(state, "teeth", "A", x, y + bags.thick / 2 + teeth.thick / 2, { facing });
    next.facing = facing;
    restampForts(state);
    assert.equal(fieldSiteClear(state, "teeth", x + teeth.length, y + bags.thick / 2 + teeth.thick / 2, facing), true);
  });

  it("scatters the four pyramids off a straight line", () => {
    const a = toothOffsets(toothSeedAt(400, 240));
    const b = toothOffsets(toothSeedAt(520, 240));
    assert.equal(a.length, 4);
    assert.equal(b.length, 4);
    const span = fieldSpan("teeth")!;
    const spread = (pts: { along: number; across: number }[]) => {
      const across = pts.map((p) => p.across);
      const along = pts.map((p) => p.along);
      return Math.max(...across) - Math.min(...across) > 2 && Math.max(...along) - Math.min(...along) > span.length * 0.4;
    };
    assert.equal(spread(a), true);
    assert.equal(spread(b), true);
    assert.notDeepEqual(a, b);
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
