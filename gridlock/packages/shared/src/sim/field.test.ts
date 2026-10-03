import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILE_EMPTY } from "../maps.js";
import {
  catalog,
  ENGINEER_SEEK_TILES,
  fieldSpan,
  GREAT_WALL_COVER_BONUS,
  GREAT_WALL_REACH_TILES,
  GREAT_WALL_SIGHT_TILES,
  TICK_DT,
  TITAN_ROCKET,
  wreckScrapOf,
  type YardFieldType,
} from "../catalog.js";
import { sightTilesForEntity, weaponRangeWorld } from "./elevation.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { tickCombat, tickProjectiles } from "./combat.js";
import {
  HULL_FIX_SECONDS,
  WALL_COVER_BONUS,
  WALL_COVER_DR,
  coverStrike,
  fieldLine,
  fieldLineMax,
  fieldSiteClear,
  fieldTiles,
  restampForts,
  sandbagCoverBonus,
} from "./field.js";
import { toWreck } from "./wreck.js";
import { destroyEntity, makeEntity, playerTeam, tileCenter, tileIndex, walkable, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
import { previewYardField } from "./preview.js";
import { snapshotFor } from "./snapshot.js";
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
  const state = createMatch(room, started.value);
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

function shot(state: MatchState, x: number, y: number, vx: number, damage: number, shell: Projectile["shell"]): Projectile {
  const p: Projectile = {
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
  };
  state.projectiles.push(p);
  return p;
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

  it("shows the site in the snapshot until the sandbags stand, and hides the walk from the enemy", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x - 30, y);
    const res = applyCommand(state, "A", { type: "cmd.field", ids: [eng.id], structure: "sandbags", x, y, facing: 0 });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    const view = (who: string) => snapshotFor(state, who).entities.find((e) => e.id === eng.id);
    assert.deepEqual(view("A")?.fieldSites, [{ structure: "sandbags", x, y, facing: 0, progress: undefined }]);
    assert.equal(view("B")?.fieldSites, undefined);
    let dug = false;
    for (let i = 0; i < 80 && ![...state.entities.values()].some((e) => e.type === "sandbags"); i++) {
      step(state, TICK_DT);
      const p = view("A")?.fieldSites?.[0]?.progress;
      if (p != null && p > 0) dug = true;
    }
    assert.ok(dug, "progress reported while digging");
    assert.ok([...state.entities.values()].some((e) => e.type === "sandbags"));
    assert.equal(view("A")?.fieldSites, undefined);
  });

  it("lays pieces end to end along a drag, on the side nearest the hint", () => {
    const span = fieldSpan("sandbags")!;
    const one = fieldLine("sandbags", 100, 100, 110, 100, 1);
    assert.deepEqual(one, [{ x: 100, y: 100, facing: 1 }]);
    const line = fieldLine("sandbags", 100, 100, 100 + span.length * 3, 100, Math.PI / 2 + 0.3);
    assert.equal(line.length, 3);
    for (let i = 0; i < line.length; i++) {
      assert.ok(Math.abs(line[i]!.x - (100 + span.length * (i + 0.5))) < 1e-6);
      assert.ok(Math.abs(line[i]!.y - 100) < 1e-6);
      assert.ok(Math.abs(Math.sin(line[i]!.facing) - 1) < 1e-6, `facing=${line[i]!.facing}`);
    }
    const flipped = fieldLine("sandbags", 100, 100, 100 + span.length * 3, 100, -Math.PI / 2);
    assert.ok(Math.abs(Math.sin(flipped[0]!.facing) + 1) < 1e-6);
    const long = fieldLine("sandbags", 0, 0, span.length * 100, 0, 0);
    assert.equal(long.length, fieldLineMax("sandbags"));
  });

  it("builds a dragged wall piece by piece and splits it between engineers", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 30, 16);
    const ts = state.tileSize;
    const span = fieldSpan("sandbags")!;
    const x = tileCenter(30, ts);
    const y = tileCenter(34, ts);
    const x2 = x + span.length * 4;
    const a = makeEntity(state, "engineer", "A", x, y - 30);
    const b = makeEntity(state, "engineer", "A", x2, y - 30);
    const scrap0 = state.players.get("A")!.scrap;
    const res = applyCommand(state, "A", {
      type: "cmd.field",
      ids: [a.id, b.id],
      structure: "sandbags",
      x,
      y,
      facing: Math.PI / 2,
      x2,
      y2: y,
    });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    assert.equal(a.fieldQueue?.length, 1);
    assert.equal(b.fieldQueue?.length, 1);
    ticks(state, 400);
    const bags = [...state.entities.values()].filter((e) => e.type === "sandbags");
    assert.equal(bags.length, 4);
    assert.equal(state.players.get("A")!.scrap, scrap0 - catalog("sandbags").cost * 4);
    assert.equal(a.state, "idle");
    assert.equal(b.state, "idle");
  });

  it("lays a dragged line of dragon's teeth one pyramid per piece", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 30, 16);
    const ts = state.tileSize;
    const span = fieldSpan("teeth")!;
    const x = tileCenter(30, ts);
    const y = tileCenter(34, ts);
    const eng = makeEntity(state, "engineer", "A", x, y - 30);
    const res = applyCommand(state, "A", {
      type: "cmd.field",
      ids: [eng.id],
      structure: "teeth",
      x,
      y,
      facing: Math.PI / 2,
      x2: x + span.length * 5,
      y2: y,
    });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    assert.equal(eng.fieldQueue?.length, 4);
    ticks(state, 600);
    const teeth = [...state.entities.values()].filter((e) => e.type === "teeth");
    assert.equal(teeth.length, 5);
    const xs = teeth.map((t) => t.x).sort((p, q) => p - q);
    for (let i = 0; i < xs.length; i++) assert.ok(Math.abs(xs[i]! - (x + span.length * (i + 0.5))) < 1e-6);
    assert.ok(teeth.every((t) => t.y === y));
  });

  it("drops the rest of a wall when the engineer gets a new order", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 30, 16);
    const ts = state.tileSize;
    const span = fieldSpan("sandbags")!;
    const x = tileCenter(30, ts);
    const y = tileCenter(34, ts);
    const eng = makeEntity(state, "engineer", "A", x, y - 30);
    applyCommand(state, "A", {
      type: "cmd.field",
      ids: [eng.id],
      structure: "sandbags",
      x,
      y,
      facing: Math.PI / 2,
      x2: x + span.length * 3,
      y2: y,
    });
    assert.equal(eng.fieldQueue?.length, 2);
    applyCommand(state, "A", { type: "cmd.move", ids: [eng.id], x: x - 40, y: y - 40 });
    ticks(state, 200);
    assert.equal(eng.fieldQueue, undefined);
    assert.equal([...state.entities.values()].filter((e) => e.type === "sandbags").length, 0);
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

  it("lets an engineer stack shelled sandbags back up", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const bag = makeEntity(state, "sandbags", "A", x, y, { facing: 0 });
    bag.facing = 0;
    restampForts(state);
    shot(state, x + 30, y, -800, 40, "ap");
    tickProjectiles(state, TICK_DT);
    assert.equal(bag.ruined, true);
    const eng = makeEntity(state, "engineer", "A", x - 40, y);
    const res = applyCommand(state, "A", { type: "cmd.repair", ids: [eng.id], targetId: bag.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, Math.ceil((catalog("sandbags").buildSeconds + 4) / TICK_DT));
    assert.equal(bag.ruined, false);
    assert.equal(bag.hp, bag.hpMax);
    assert.equal(eng.state, "idle");
    assert.equal(walkable(state, worldToTile(x, ts), worldToTile(y, ts), "rifleman"), false);
  });

  it("sells sandbags for half their cost and clears the tiles", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const bag = makeEntity(state, "sandbags", "A", x, y, { facing: 0 });
    bag.facing = 0;
    restampForts(state);
    const before = state.players.get("A")!.scrap;
    const res = applyCommand(state, "A", { type: "cmd.sell", id: bag.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    assert.equal(state.entities.has(bag.id), false);
    assert.equal(state.players.get("A")!.scrap, before + Math.floor(catalog("sandbags").cost / 2));
    assert.equal(walkable(state, worldToTile(x, ts), worldToTile(y, ts), "rifleman"), true);
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

  it("clears broken tracks and a dead engine when the repair finishes", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x, y);
    const tank = makeEntity(state, "warden", "A", x + 28, y);
    tank.hp = tank.hpMax - 10;
    tank.crits = ["tracks", "engine"];
    applyCommand(state, "A", { type: "cmd.repair", ids: [eng.id], targetId: tank.id });
    ticks(state, 60);
    assert.equal(tank.hp, tank.hpMax);
    assert.deepEqual(tank.crits, []);
  });

  it("fixes the engine on a tank that has no hit points to restore", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x, y);
    const tank = makeEntity(state, "warden", "A", x + 28, y);
    tank.crits = ["engine"];
    const res = applyCommand(state, "A", { type: "cmd.repair", ids: [eng.id], targetId: tank.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 5);
    assert.deepEqual(tank.crits, ["engine"]);
    ticks(state, Math.ceil(HULL_FIX_SECONDS / TICK_DT) + 20);
    assert.deepEqual(tank.crits, []);
    assert.equal(eng.state, "idle");
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

  it("walks to damaged allied armor nearby on his own, like a medic", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 30, 16);
    const ts = state.tileSize;
    const x = tileCenter(30, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x, y);
    const tank = makeEntity(state, "warden", "A", x + 3 * 4 * ts, y);
    tank.hp = tank.hpMax - 30;
    tank.crits = ["tracks"];
    ticks(state, 2);
    assert.equal(eng.order?.kind, "repair");
    assert.equal(eng.order?.auto, true);
    assert.equal(eng.order?.targetId, tank.id);
    ticks(state, 200);
    assert.equal(tank.hp, tank.hpMax);
    assert.deepEqual(tank.crits, []);
    ticks(state, 2);
    assert.equal(eng.order, null);
    assert.equal(eng.state, "idle");
  });

  it("leaves armor past his seek range, wrecks, and houses to player orders", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 20, 26, 44, 16);
    const ts = state.tileSize;
    const x = tileCenter(24, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x, y);
    const far = makeEntity(state, "warden", "A", x + (ENGINEER_SEEK_TILES + 4) * ts, y);
    far.hp = far.hpMax - 30;
    const wreck = makeEntity(state, "warden", "B", x, y + 3 * 4 * ts);
    wreck.hp = 0;
    toWreck(state, wreck);
    const house = makeEntity(state, "dynamo", "A", x, y - 40, { tileX: 22, tileY: 26 });
    house.hp = house.hpMax - 20;
    ticks(state, 20);
    assert.equal(eng.order, null);
    assert.equal(far.hp, far.hpMax - 30);
    assert.equal(house.hp, house.hpMax - 20);
    assert.ok(state.entities.has(wreck.id));
  });

  it("keeps a player move order over a damaged tank nearby", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 30, 16);
    const ts = state.tileSize;
    const x = tileCenter(30, ts);
    const y = tileCenter(32, ts);
    const eng = makeEntity(state, "engineer", "A", x, y);
    const tank = makeEntity(state, "warden", "A", x + 2 * 4 * ts, y);
    tank.hp = tank.hpMax - 30;
    const res = applyCommand(state, "A", { type: "cmd.move", ids: [eng.id], x, y: y + 6 * ts });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 3);
    assert.equal(eng.order?.kind, "move");
    assert.notEqual(eng.order?.auto, true);
  });
});

/** Same offset `standPoint` uses: half the slab plus the pad the engineer stands on. */
function wallStand(x: number, y: number, facing: number): { x: number; y: number } {
  const span = fieldSpan("wall")!;
  const off = span.thick / 2 + 14;
  return { x: x - Math.cos(facing) * off, y: y - Math.sin(facing) * off };
}

/** Put the engineer on the stand of the piece he is about to build, with no walk left. */
function parkOnWall(eng: { order: { x?: number; y?: number; facing?: number } | null; x: number; y: number; waypoints: { x: number; y: number }[]; work: number }): void {
  const o = eng.order;
  if (!o || o.x == null || o.y == null) throw new Error("engineer has no build");
  const spot = wallStand(o.x, o.y, o.facing ?? 0);
  eng.x = spot.x;
  eng.y = spot.y;
  eng.waypoints = [];
  eng.work = 0;
}

describe("concrete wall", () => {
  it("keeps the facing set before the drag", () => {
    const span = fieldSpan("wall")!;
    const line = fieldLine("wall", 100, 100, 100 + span.length * 3, 100, Math.PI / 2 + 0.3);
    assert.equal(line.length, 3);
    for (const p of line) assert.ok(Math.abs(Math.sin(p.facing) - 1) < 1e-6, `facing=${p.facing}`);
    const flipped = fieldLine("wall", 100, 100, 100 + span.length * 3, 100, -Math.PI / 2);
    assert.ok(Math.abs(Math.sin(flipped[0]!.facing) + 1) < 1e-6);
  });

  it("raises every section together after one build time per piece", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 40, 16);
    const ts = state.tileSize;
    const span = fieldSpan("wall")!;
    const x = tileCenter(30, ts);
    const y = tileCenter(34, ts);
    const eng = makeEntity(state, "engineer", "A", x, y - 40);
    const scrap0 = state.players.get("A")!.scrap;
    const res = applyCommand(state, "A", {
      type: "cmd.field",
      ids: [eng.id],
      structure: "wall",
      x,
      y,
      facing: Math.PI / 2,
      x2: x + span.length * 3,
      y2: y,
    });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    const queued = eng.fieldQueue?.length ?? 0;
    assert.equal(queued, 2);
    const sitesOf = (who: string) => snapshotFor(state, who).entities.find((e) => e.id === eng.id)?.fieldSites;
    assert.equal(sitesOf("A")?.length, 3);
    assert.equal(sitesOf("A")?.[0]?.progress, undefined);
    assert.equal(sitesOf("B"), undefined);
    parkOnWall(eng);
    const spotter = makeEntity(state, "rifleman", "B", eng.x + 24, eng.y);
    const per = Math.round(catalog("wall").buildSeconds / TICK_DT);
    const built = () => [...state.entities.values()].filter((e) => e.type === "wall");
    ticks(state, 1);
    assert.equal(built().length, 0);
    assert.equal(state.players.get("A")!.scrap, scrap0 - catalog("wall").cost * 3);
    const digging = sitesOf("B");
    assert.equal(digging?.length, 3);
    const progress = digging?.[0]?.progress;
    assert.ok(progress != null && progress > 0 && progress < 0.02, `progress ${progress}`);
    assert.ok(digging!.every((s) => s.progress === progress));
    destroyEntity(state, spotter);
    state.projectiles.length = 0;
    eng.hp = eng.hpMax;
    ticks(state, per * 3 - 2);
    assert.equal(built().length, 0, "the line waits until the whole job is done");
    ticks(state, 1);
    const walls = built();
    assert.equal(walls.length, 3);
    assert.ok(walls.every((w) => Math.abs(Math.sin(w.facing) - 1) < 1e-6));
    assert.equal(eng.state, "idle");
    assert.equal(state.players.get("A")!.scrap, scrap0 - catalog("wall").cost * 3);
  });

  it("pays for as many sections as the scrap allows", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 40, 16);
    const ts = state.tileSize;
    const span = fieldSpan("wall")!;
    const x = tileCenter(30, ts);
    const y = tileCenter(34, ts);
    const eng = makeEntity(state, "engineer", "A", x, y - 40);
    const cost = catalog("wall").cost;
    state.players.get("A")!.scrap = cost * 2 + 5;
    const res = applyCommand(state, "A", {
      type: "cmd.field",
      ids: [eng.id],
      structure: "wall",
      x,
      y,
      facing: Math.PI / 2,
      x2: x + span.length * 3,
      y2: y,
    });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    parkOnWall(eng);
    const per = Math.round(catalog("wall").buildSeconds / TICK_DT);
    ticks(state, 1);
    assert.equal(eng.fieldQueue?.length, 1);
    assert.equal(state.players.get("A")!.scrap, 5);
    ticks(state, per * 2 - 1);
    const walls = [...state.entities.values()].filter((e) => e.type === "wall");
    assert.equal(walls.length, 2);
    assert.equal(state.players.get("A")!.scrap, 5);
  });

  it("refunds a section that is blocked when the line is placed", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 40, 16);
    const ts = state.tileSize;
    const span = fieldSpan("wall")!;
    const x = tileCenter(30, ts);
    const y = tileCenter(34, ts);
    const eng = makeEntity(state, "engineer", "A", x, y - 40);
    applyCommand(state, "A", {
      type: "cmd.field",
      ids: [eng.id],
      structure: "wall",
      x,
      y,
      facing: Math.PI / 2,
      x2: x + span.length * 3,
      y2: y,
    });
    parkOnWall(eng);
    ticks(state, 1);
    const queue = eng.fieldQueue ?? [];
    const last = queue[queue.length - 1];
    assert.ok(last, "the line still has a later section");
    const order = eng.order!;
    const earlier = [{ x: order.x!, y: order.y!, facing: order.facing ?? 0 }, ...queue.slice(0, -1)];
    const taken = new Set(
      earlier.flatMap((p) => fieldTiles(state, "wall", p.x, p.y, p.facing).map((t) => `${t.x},${t.y}`)),
    );
    const free = fieldTiles(state, "wall", last.x, last.y, last.facing).find((t) => !taken.has(`${t.x},${t.y}`));
    assert.ok(free, "the last section has a tile of its own");
    state.occupy[tileIndex(state, free!.x, free!.y)] = 999999;
    const scrap = state.players.get("A")!.scrap;
    const per = Math.round(catalog("wall").buildSeconds / TICK_DT);
    ticks(state, per * 3 - 1);
    const walls = [...state.entities.values()].filter((e) => e.type === "wall");
    assert.equal(walls.length, 2);
    assert.equal(state.players.get("A")!.scrap, scrap + catalog("wall").cost);
    assert.equal(eng.state, "idle");
  });

  it("splits a dragged line so each engineer raises his own run at once", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 26, 26, 40, 16);
    const ts = state.tileSize;
    const span = fieldSpan("wall")!;
    const x = tileCenter(30, ts);
    const y = tileCenter(34, ts);
    const x2 = x + span.length * 4;
    const a = makeEntity(state, "engineer", "A", x, y - 40);
    const b = makeEntity(state, "engineer", "A", x2, y - 40);
    const scrap0 = state.players.get("A")!.scrap;
    const res = applyCommand(state, "A", {
      type: "cmd.field",
      ids: [a.id, b.id],
      structure: "wall",
      x,
      y,
      facing: Math.PI / 2,
      x2,
      y2: y,
    });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    assert.equal(a.fieldQueue?.length, 1);
    assert.equal(b.fieldQueue?.length, 1);
    parkOnWall(a);
    parkOnWall(b);
    const per = Math.round(catalog("wall").buildSeconds / TICK_DT);
    const built = () => [...state.entities.values()].filter((e) => e.type === "wall");
    ticks(state, per * 2 - 1);
    assert.equal(built().length, 0);
    ticks(state, 1);
    assert.equal(built().length, 4);
    assert.equal(state.players.get("A")!.scrap, scrap0 - catalog("wall").cost * 4);
    assert.equal(a.state, "idle");
    assert.equal(b.state, "idle");
  });

  it("blocks every unit while it stands, and the tile opens once a shell brings it down", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const wall = makeEntity(state, "wall", "A", x, y, { facing: 0 });
    wall.facing = 0;
    restampForts(state);
    const tx = worldToTile(x, ts);
    const ty = worldToTile(y, ts);
    assert.equal(walkable(state, tx, ty, "rifleman"), false);
    assert.equal(walkable(state, tx, ty, "warden"), false);
    const hp = wall.hp;
    shot(state, x + 30, y, -800, 40, "ap");
    tickProjectiles(state, TICK_DT);
    assert.equal(wall.hp, hp - 40);
    const rifle = shot(state, x + 30, y, -800, 12, null);
    tickProjectiles(state, TICK_DT);
    assert.equal(wall.hp, hp - 40);
    assert.equal(state.projectiles.some((p) => p.id === rifle.id), false);
    shot(state, x + 30, y, -800, wall.hp, "he");
    tickProjectiles(state, TICK_DT);
    assert.ok(wall.hp <= 0);
    step(state, TICK_DT);
    assert.equal(state.entities.has(wall.id), false);
    assert.equal(walkable(state, tx, ty, "warden"), true);
  });

  it("takes a rocket hit and falls when the next one finishes it", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const wall = makeEntity(state, "wall", "A", x, y, { facing: 0 });
    wall.facing = 0;
    const launch = () => {
      state.projectiles.push({
        id: state.nextId++,
        ownerId: "B",
        team: playerTeam(state, "B"),
        x: x + 16,
        y,
        vx: -200,
        vy: 0,
        damage: TITAN_ROCKET.damage,
        penetration: TITAN_ROCKET.penetration,
        caliber: TITAN_ROCKET.caliber,
        life: 0.3,
        ignoreId: -1,
        fromId: -1,
        bounced: false,
        shell: null,
        flight: "rocket",
        landX: x,
        landY: y,
        z: 6,
        vz: 0,
      });
    };
    launch();
    tickProjectiles(state, TICK_DT);
    assert.ok(wall.hp < wall.hpMax && wall.hp > 0, `rocket left ${wall.hp}`);
    wall.hp = 1;
    launch();
    tickProjectiles(state, TICK_DT);
    assert.ok(wall.hp <= 0);
  });

  it("gives units on either side extra health, and less from a shot along the ground", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const wall = makeEntity(state, "wall", "A", x, y, { facing: 0 });
    wall.facing = 0;
    const man = makeEntity(state, "rifleman", "A", x + 18, y);
    const tank = makeEntity(state, "warden", "A", x - 18, y);
    const manBase = catalog("rifleman").hp;
    const tankBase = catalog("warden").hp;
    step(state, TICK_DT);
    const manBonus = Math.round(manBase * WALL_COVER_BONUS);
    const tankBonus = Math.round(tankBase * WALL_COVER_BONUS);
    assert.equal(man.hpMax, manBase + manBonus);
    assert.equal(man.hp, manBase + manBonus);
    assert.equal(man.wallCover, manBonus);
    assert.equal(tank.hpMax, tankBase + tankBonus);
    assert.equal(tank.wallCover, tankBonus);

    const before = man.hp;
    coverStrike(man, 40, state.tick, false);
    assert.equal(man.hp, before - Math.round(40 * WALL_COVER_DR));
    const tankBefore = tank.hp;
    coverStrike(tank, 10, state.tick, true);
    assert.equal(tank.hp, tankBefore - 10);

    man.hp = man.hpMax;
    state.projectiles.push({
      id: state.nextId++,
      ownerId: "B",
      team: playerTeam(state, "B"),
      x: man.x,
      y: man.y,
      vx: 0,
      vy: 0,
      damage: 45,
      penetration: 14,
      caliber: 60,
      life: 0.01,
      ignoreId: -1,
      fromId: -1,
      bounced: false,
      shell: null,
      flight: "mortar",
      landX: man.x,
      landY: man.y,
      apex: 20,
      flightTime: 1,
      z: 4,
    });
    tickProjectiles(state, TICK_DT);
    assert.ok(man.hp <= 0, `mortar left ${man.hp}`);

    tank.x = x - 80;
    step(state, TICK_DT);
    assert.equal(tank.hpMax, tankBase);
    assert.equal(tank.wallCover, 0);
  });

  it("lets an engineer repair a damaged wall", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 30, 28, 16, 12);
    const ts = state.tileSize;
    const x = tileCenter(36, ts);
    const y = tileCenter(32, ts);
    const wall = makeEntity(state, "wall", "A", x, y, { facing: 0 });
    wall.facing = 0;
    wall.hp = wall.hpMax - 40;
    const spot = wallStand(x, y, 0);
    const eng = makeEntity(state, "engineer", "A", spot.x, spot.y);
    const res = applyCommand(state, "A", { type: "cmd.repair", ids: [eng.id], targetId: wall.id });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    eng.waypoints = [];
    const hurt = wall.hp;
    ticks(state, 5);
    assert.ok(wall.hp > hurt, `repair left ${wall.hp}`);
    ticks(state, 40);
    assert.equal(wall.hp, wall.hpMax);
    assert.equal(eng.state, "idle");
  });
});

function deployCore(state: MatchState): void {
  const rig = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "rig");
  assert.ok(rig);
  const res = applyCommand(state, "A", { type: "cmd.deploy", id: rig!.id });
  assert.equal(res.ok, true, res.ok ? "" : res.message);
  ticks(state, 35);
  assert.ok([...state.entities.values()].some((e) => e.ownerId === "A" && e.type === "core"));
}

function placeYard(
  state: MatchState,
  type: YardFieldType,
  x: number,
  y: number,
  facing: number,
  x2?: number,
  y2?: number,
) {
  return applyCommand(state, "A", {
    type: "cmd.field",
    ids: [],
    structure: type,
    x,
    y,
    facing,
    ...(x2 != null && y2 != null ? { x2, y2 } : {}),
  });
}

function besideCore(state: MatchState): { x: number; y: number } {
  const core = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "core")!;
  clearPatch(state, core.tileX + core.tileW, Math.max(0, core.tileY - 4), 30, core.tileH + 10);
  const ts = state.tileSize;
  return {
    x: tileCenter(core.tileX + core.tileW + 2, ts),
    y: tileCenter(core.tileY + 1, ts),
  };
}

function farOpen(state: MatchState): { x: number; y: number } {
  clearPatch(state, 140, 140, 20, 20);
  const ts = state.tileSize;
  return { x: tileCenter(148, ts), y: tileCenter(148, ts) };
}

describe("great wall", () => {
  function greatWall(state: MatchState): { x: number; y: number; wall: ReturnType<typeof makeEntity> } {
    clearPatch(state, 26, 24, 24, 20);
    const ts = state.tileSize;
    const x = tileCenter(38, ts);
    const y = tileCenter(34, ts);
    const wall = makeEntity(state, "greatwall", "A", x, y, { facing: 0 });
    wall.facing = 0;
    restampForts(state);
    return { x, y, wall };
  }

  it("stops vehicles and lets infantry walk onto the top", () => {
    const { state } = twoPlayerMatch();
    const { x, y } = greatWall(state);
    const tx = worldToTile(x, state.tileSize);
    const ty = worldToTile(y, state.tileSize);
    assert.equal(walkable(state, tx, ty, "rifleman"), true);
    assert.equal(walkable(state, tx, ty, "warden"), false);
    const span = fieldSpan("greatwall")!;
    assert.ok(span.thick > fieldSpan("wall")!.thick * 2, "wider than the concrete wall");
    assert.ok(span.length > fieldSpan("wall")!.length, "longer than the concrete wall");
  });

  it("gives infantry on top extra health, sight, and reach, and takes them away when he steps off", () => {
    const { state } = twoPlayerMatch();
    const { x, y } = greatWall(state);
    const man = makeEntity(state, "rifleman", "A", x - 120, y);
    step(state, TICK_DT);
    const base = catalog("rifleman").hp;
    const reach0 = weaponRangeWorld(state, man);
    const sight0 = sightTilesForEntity(state, man);
    assert.equal(man.onRampart, undefined);
    assert.equal(man.hpMax, base);

    man.x = x;
    man.y = y;
    man.waypoints = [];
    step(state, TICK_DT);
    const bonus = Math.round(base * GREAT_WALL_COVER_BONUS);
    assert.equal(man.onRampart, true);
    assert.equal(man.hpMax, base + bonus);
    assert.equal(man.hp, base + bonus);
    assert.equal(weaponRangeWorld(state, man), reach0 + GREAT_WALL_REACH_TILES * state.tileSize);
    assert.equal(sightTilesForEntity(state, man), sight0 + GREAT_WALL_SIGHT_TILES);

    man.x = x - 120;
    step(state, TICK_DT);
    assert.equal(man.onRampart, undefined);
    assert.equal(man.hpMax, base);
    assert.equal(weaponRangeWorld(state, man), reach0);
  });

  it("gives vehicles nothing for standing beside it", () => {
    const { state } = twoPlayerMatch();
    const { x, y } = greatWall(state);
    const tank = makeEntity(state, "warden", "A", x - fieldSpan("greatwall")!.thick / 2 - 14, y);
    step(state, TICK_DT);
    assert.equal(tank.onRampart, undefined);
    assert.equal(tank.hpMax, catalog("warden").hp);
  });

  it("takes tank shells that run into it, lets rifle fire over, and lets a shell fired from the top fly off", () => {
    const { state } = twoPlayerMatch();
    const { x, y, wall } = greatWall(state);
    const hp = wall.hp;
    shot(state, x + 40, y, -800, 40, "ap");
    tickProjectiles(state, TICK_DT);
    assert.equal(wall.hp, hp - 40);
    const rifle = shot(state, x + 40, y, -800, 12, null);
    tickProjectiles(state, TICK_DT);
    assert.equal(wall.hp, hp - 40);
    assert.equal(state.projectiles.some((p) => p.id === rifle.id), true, "the bullet flies on over the rampart");
    state.projectiles.length = 0;
    const outbound = shot(state, x, y, 800, 40, "ap");
    tickProjectiles(state, TICK_DT);
    assert.equal(wall.hp, hp - 40);
    assert.equal(state.projectiles.some((p) => p.id === outbound.id), true);
  });

  it("is laid by an engineer as one line job", () => {
    const { state } = twoPlayerMatch();
    clearPatch(state, 20, 22, 44, 24);
    const ts = state.tileSize;
    const span = fieldSpan("greatwall")!;
    const x = tileCenter(26, ts);
    const y = tileCenter(36, ts);
    const eng = makeEntity(state, "engineer", "A", x, y - 50);
    const scrap0 = state.players.get("A")!.scrap;
    const res = applyCommand(state, "A", {
      type: "cmd.field",
      ids: [eng.id],
      structure: "greatwall",
      x,
      y,
      facing: Math.PI / 2,
      x2: x + span.length * 2,
      y2: y,
    });
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    assert.equal(eng.fieldQueue?.length, 1);
    const built = () => [...state.entities.values()].filter((e) => e.type === "greatwall");
    const per = Math.round(catalog("greatwall").buildSeconds / TICK_DT);
    for (let i = 0; i < 400 && eng.state !== "build"; i++) step(state, TICK_DT);
    assert.equal(eng.state, "build");
    assert.equal(state.players.get("A")!.scrap, scrap0 - catalog("greatwall").cost * 2);
    ticks(state, per * 2 - 3);
    assert.equal(built().length, 0, "the line waits until the whole job is done");
    ticks(state, 4);
    assert.equal(built().length, 2);
  });
});

describe("defences tab field works", () => {
  it("does not treat teeth as a yard placement, and will not site a wall before the Rig is deployed", () => {
    const { state } = twoPlayerMatch();
    const bag = applyCommand(state, "A", { type: "cmd.field", ids: [], structure: "sandbags", x: 10, y: 10, facing: 0 });
    assert.equal(bag.ok, false);
    if (!bag.ok) assert.equal(bag.code, "no_core");
    const teeth = applyCommand(state, "A", { type: "cmd.field", ids: [], structure: "teeth", x: 10, y: 10, facing: 0 });
    assert.equal(teeth.ok, false);
    if (!teeth.ok) assert.match(teeth.message, /not ready/);
    const queued = applyCommand(state, "A", { type: "cmd.build", building: "wall" });
    assert.equal(queued.ok, false);
    if (!queued.ok) assert.match(queued.message, /Place that/);
  });

  for (const type of ["sandbags", "wall", "greatwall"] as const) {
    it(`sites ${type} beside the core, then builds it`, () => {
      const { state } = twoPlayerMatch();
      deployCore(state);
      const far = farOpen(state);
      const spot = besideCore(state);
      const snap = snapshotFor(state, "A");
      assert.equal(previewYardField(snap, type, spot.x, spot.y, 0), true);
      assert.equal(previewYardField(snap, type, far.x, far.y, 0), false);
      const away = placeYard(state, type, far.x, far.y, 0);
      assert.equal(away.ok, false);
      if (!away.ok) assert.match(away.message, /Too far/);
      assert.equal(state.players.get("A")!.defence, null);
      const eng = makeEntity(state, "engineer", "A", far.x - 30, far.y);
      const crew = applyCommand(state, "A", {
        type: "cmd.field",
        ids: [eng.id],
        structure: type,
        x: far.x,
        y: far.y,
        facing: 0,
      });
      assert.equal(crew.ok, true, crew.ok ? "" : crew.message);
      assert.equal(eng.order?.kind, "build");
      const before = state.players.get("A")!.scrap;
      const placed = placeYard(state, type, spot.x, spot.y, 0);
      assert.equal(placed.ok, true, placed.ok ? "" : placed.message);
      const job = state.players.get("A")!.defence;
      assert.equal(job?.ready, false);
      assert.equal(job?.sites?.length, 1);
      assert.equal(job?.totalTicks, catalog(type).buildSeconds * 10);
      assert.equal(state.players.get("A")!.scrap, before);
      assert.equal([...state.entities.values()].some((e) => e.type === type), false);
      const view = snapshotFor(state, "A").you.defenceQueue;
      assert.equal(view?.type, type);
      assert.equal(view?.sites?.length, 1);
      assert.equal(snapshotFor(state, "A").you.structureQueue, null);
      eng.order = null;
      eng.state = "idle";
      eng.waypoints = [];
      ticks(state, catalog(type).buildSeconds * 10);
      const built = [...state.entities.values()].filter((e) => e.type === type && e.hp > 0);
      assert.equal(built.length, 1);
      assert.equal(state.players.get("A")!.scrap, before - catalog(type).cost);
      assert.equal(state.players.get("A")!.defence, null);
    });
  }

  it("builds a longer wall more slowly and charges every section", () => {
    const { state } = twoPlayerMatch();
    deployCore(state);
    const spot = besideCore(state);
    const span = fieldSpan("wall")!.length;
    const p = state.players.get("A")!;
    const before = p.scrap;
    const res = placeYard(state, "wall", spot.x, spot.y, Math.PI / 2, spot.x + span * 3, spot.y);
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    const n = p.defence?.sites?.length ?? 0;
    assert.equal(n, 3);
    assert.equal(p.defence?.totalTicks, catalog("wall").buildSeconds * n * 10);
    assert.equal([...state.entities.values()].some((e) => e.type === "wall"), false);
    ticks(state, catalog("wall").buildSeconds * 10);
    assert.equal([...state.entities.values()].some((e) => e.type === "wall"), false);
    ticks(state, catalog("wall").buildSeconds * (n - 1) * 10);
    const built = [...state.entities.values()].filter((e) => e.type === "wall");
    assert.equal(built.length, n);
    assert.equal(p.scrap, before - catalog("wall").cost * n);
    assert.equal(p.defence, null);
  });

  it("refunds a cancelled line and does not leave a section behind", () => {
    const { state } = twoPlayerMatch();
    deployCore(state);
    const spot = besideCore(state);
    const p = state.players.get("A")!;
    const before = p.scrap;
    const res = placeYard(state, "sandbags", spot.x, spot.y, 0);
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    ticks(state, 8);
    assert.ok((p.defence?.paid ?? 0) > 0);
    const cancel = applyCommand(state, "A", { type: "cmd.cancel", what: "structure", building: "sandbags" });
    assert.equal(cancel.ok, true, cancel.ok ? "" : cancel.message);
    assert.equal(p.scrap, before);
    assert.equal(p.defence, null);
    assert.equal([...state.entities.values()].some((e) => e.type === "sandbags"), false);
  });

  it("refuses a blocked first section without starting a job", () => {
    const { state } = twoPlayerMatch();
    deployCore(state);
    const core = [...state.entities.values()].find((e) => e.ownerId === "A" && e.type === "core")!;
    const ts = state.tileSize;
    const p = state.players.get("A")!;
    const scrap = p.scrap;
    const res = placeYard(
      state,
      "sandbags",
      tileCenter(core.tileX + Math.floor(core.tileW / 2), ts),
      tileCenter(core.tileY + Math.floor(core.tileH / 2), ts),
      0,
    );
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.message, /Cannot place/);
    assert.equal(p.defence, null);
    assert.equal(p.scrap, scrap);
    assert.equal([...state.entities.values()].some((e) => e.type === "sandbags"), false);
  });

  it("does not let a field wall extend the yard's build radius", () => {
    const { state } = twoPlayerMatch();
    deployCore(state);
    const far = farOpen(state);
    const wall = makeEntity(state, "wall", "A", far.x, far.y, { facing: 0 });
    wall.facing = 0;
    const beside = placeYard(state, "sandbags", far.x + 40, far.y, 0);
    assert.equal(beside.ok, false);
    if (!beside.ok) assert.match(beside.message, /Too far/);
    assert.equal(state.players.get("A")!.defence, null);
    assert.equal(previewYardField(snapshotFor(state, "A"), "sandbags", far.x + 40, far.y, 0), false);
  });

  it("sites sandbags while a base structure is building", () => {
    const { state } = twoPlayerMatch();
    deployCore(state);
    const base = applyCommand(state, "A", { type: "cmd.build", building: "dynamo" });
    assert.equal(base.ok, true, base.ok ? "" : base.message);
    const spot = besideCore(state);
    const placed = placeYard(state, "sandbags", spot.x, spot.y, 0);
    assert.equal(placed.ok, true, placed.ok ? "" : placed.message);
    const p = state.players.get("A")!;
    assert.equal(p.structure?.type, "dynamo");
    assert.equal(p.defence?.type, "sandbags");
    const blocked = placeYard(state, "wall", spot.x + 80, spot.y, 0);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.match(blocked.message, /already underway/);
    ticks(state, catalog("sandbags").buildSeconds * 10);
    assert.equal([...state.entities.values()].some((e) => e.type === "sandbags" && e.ownerId === "A"), true);
    assert.equal(p.defence, null);
    assert.equal(p.structure?.type, "dynamo");
    assert.notEqual(p.structure?.ready, true);
  });
});
