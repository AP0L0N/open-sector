import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TICK_DT, bridgeBrickLength, bridgeBuildSeconds, bridgeCost, bridgeWidth, catalog, secondsToTicks } from "../catalog.js";
import { bridgeBrickProblem, bridgePath, bridgeTiles, bricksConflict, planBridgeLine, type BridgeGround, type BridgeSpan } from "../bridge-plan.js";
import { TILE_EMPTY, TILE_WATER, getMap, registerMap, type MapFeature } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { hqOf, isWater, makeEntity, tileCenter, unitInWater, walkable } from "./geo.js";
import { createMatch, step } from "./match.js";
import { bridgeBrickProblemFor, bridgeRoundDamage, guardBridges, raiseBridge, settleBridges } from "./bridge.js";
import { snapshotFor } from "./snapshot.js";
import { previewBridge } from "./preview.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(mapId = "yard-64"): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "BR1", hostId: "A", hostName: "Alpha", mapId, maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function deploy(state: MatchState, pid: string): void {
  const rig = hqOf(state, pid)!;
  applyCommand(state, pid, { type: "cmd.deploy", id: rig.id });
  for (let i = 0; i < 60; i++) {
    step(state, TICK_DT);
    if (hqOf(state, pid)?.type === "core") return;
  }
  throw new Error("Rig never unpacked");
}

/** Flat open ground with a north–south river `RIVER_W` tiles wide down the middle. */
const X0 = 40;
const Y0 = 20;
const X1 = 140;
const Y1 = 72;
const RIVER_X = 84;
const RIVER_W = 12;
const ROW = 46;

function river(state: MatchState, width = RIVER_W): void {
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const i = y * state.width + x;
      const wet = x >= RIVER_X && x < RIVER_X + width;
      state.terrain[i] = wet ? TILE_WATER : TILE_EMPTY;
      state.blocked[i] = wet ? 1 : 0;
      state.occupy[i] = 0;
      state.heights[i] = 0;
    }
  }
}

function w(t: number, state: MatchState): number {
  return tileCenter(t, state.tileSize);
}

/** A bridge of `type` along ROW from shore to shore, brick by brick, standing. */
function standBridge(state: MatchState, type: "bridge" | "bigbridge" = "bridge"): Entity[] {
  const pts = [
    { x: w(RIVER_X - 3, state), y: w(ROW, state) },
    { x: w(RIVER_X + RIVER_W + 3, state), y: w(ROW, state) },
  ];
  return bridgePath(type, pts).map((span) => raiseBridge(state, type, span));
}

/** The brick over the middle of the river. */
function midBrick(state: MatchState, bricks: Entity[]): Entity {
  const mx = (RIVER_X + RIVER_W / 2) * state.tileSize;
  return [...bricks].sort((a, b) => Math.abs(a.x - mx) - Math.abs(b.x - mx))[0]!;
}

const ground = (water: (x: number, y: number) => boolean, extra: Partial<BridgeGround> = {}): BridgeGround => ({
  width: 400,
  height: 200,
  tileSize: 8,
  water,
  footing: () => true,
  ...extra,
});

describe("bridge plan", () => {
  it("lays bricks end to end along a drag, like a wall", () => {
    const len = bridgeBrickLength("bridge");
    const bricks = bridgePath("bridge", [
      { x: 100, y: 100 },
      { x: 100 + len * 5, y: 100 },
    ]);
    assert.equal(bricks.length, 5);
    bricks.forEach((b, i) => {
      assert.ok(Math.abs(b.x - (100 + len * (i + 0.5))) < 1e-6);
      assert.equal(b.length, len);
      assert.ok(Math.abs(b.facing) < 1e-9);
    });
    // Neighbours meet without counting as an overlap.
    assert.equal(bricksConflict(bricks[0]!, 20, bricks[1]!, 20), false);
    assert.equal(bricksConflict(bricks[0]!, 20, { ...bricks[0]!, x: bricks[0]!.x + 4 }, 20), true);
  });

  it("a lone click is one brick along the wheel's facing; a corner turns the next leg", () => {
    const one = bridgePath("bigbridge", [{ x: 50, y: 50 }], Math.PI / 2);
    assert.equal(one.length, 1);
    assert.ok(Math.abs(one[0]!.facing - Math.PI / 2) < 1e-9);
    const len = bridgeBrickLength("bigbridge");
    const bent = bridgePath("bigbridge", [
      { x: 0, y: 0 },
      { x: len * 3, y: 0 },
      { x: len * 3, y: len * 3 },
    ]);
    assert.ok(bent.length >= 5);
    assert.ok(bent.some((b) => Math.abs(b.facing - Math.PI / 2) < 1e-9));
    for (let i = 1; i < bent.length; i++) assert.equal(bricksConflict(bent[i - 1]!, 44, bent[i]!, 44), false);
  });

  it("any width of water: a brick stands on water or open land, never on ground with no footing", () => {
    const g = ground((x) => x >= 20 && x < 300);
    const line = planBridgeLine(g, "bridge", [
      { x: 10 * 8, y: 100 * 8 },
      { x: 310 * 8, y: 100 * 8 },
    ]);
    assert.ok(line.length > 90);
    assert.ok(line.every((b) => b.problem === null));
    const rock = ground((x) => x >= 50 && x < 62, { footing: (x) => x < 40 });
    const span: BridgeSpan = { x: 45 * 8, y: 800, facing: 0, length: 24 };
    assert.match(bridgeBrickProblem(rock, "bridge", span) ?? "", /footing/);
    assert.equal(bridgeBrickProblem(rock, "bridge", { ...span, x: 55 * 8 }), null);
  });

  it("refuses a brick over another bridge", () => {
    const span: BridgeSpan = { x: 400, y: 404, facing: 0, length: 24 };
    const g = ground(() => true, { bricks: [{ type: "bridge", span }] });
    assert.match(bridgeBrickProblem(g, "bigbridge", { ...span, facing: Math.PI / 2 }) ?? "", /Another bridge/);
    assert.equal(bridgeBrickProblem(g, "bridge", { ...span, x: span.x + 24 }), null);
  });

  it("the concrete deck is about twice as wide as the wooden one", () => {
    const span = { x: 400, y: 404, facing: 0, length: 120 };
    const g = { width: 200, height: 200, tileSize: 8 };
    const rows = (t: { y: number }[]) => new Set(t.map((p) => p.y)).size;
    assert.ok(rows(bridgeTiles(g, span, bridgeWidth("bigbridge"))) >= rows(bridgeTiles(g, span, bridgeWidth("bridge"))) * 2 - 1);
  });
});

describe("engineer bridges", () => {
  it("lays the bridge brick by brick from his shore, then tanks drive the water and men walk it", () => {
    const { state, a } = twoPlayerMatch();
    deploy(state, a);
    river(state);
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 6, state), w(ROW, state));
    const scrap0 = state.players.get(a)!.scrap;
    const cmd = applyCommand(state, a, {
      type: "cmd.bridge",
      ids: [eng.id],
      bridge: "bridge",
      x: w(RIVER_X + RIVER_W + 3, state),
      y: w(ROW, state),
      x2: w(RIVER_X - 3, state),
      y2: w(ROW, state),
    });
    assert.equal(cmd.ok, true, cmd.ok ? "" : cmd.message);
    const total = 1 + (eng.fieldQueue?.length ?? 0);
    assert.equal(total, 6);
    // He starts at his own end, though the drag began on the far shore.
    assert.ok(eng.order!.x! < w(RIVER_X, state));
    assert.equal(walkable(state, RIVER_X + 5, ROW, "apocalypse"), false);

    const bricks = (): Entity[] => [...state.entities.values()].filter((e) => e.type === "bridge");
    let firstAt = -1;
    const limit = secondsToTicks(bridgeBuildSeconds("bridge") * total) + 1200;
    for (let i = 0; i < limit && bricks().length < total; i++) {
      step(state, TICK_DT);
      if (firstAt < 0 && bricks().length > 0) {
        firstAt = i;
        assert.equal(bricks().length, 1, "one brick at a time");
      }
    }
    assert.equal(bricks().length, total, "bridge never finished");
    assert.equal(state.players.get(a)!.scrap, scrap0 - bridgeCost("bridge") * total);
    for (const b of bricks()) {
      assert.equal(b.ownerId, "");
      assert.equal(b.span, bridgeBrickLength("bridge"));
    }
    assert.equal(eng.order, null);

    assert.equal(isWater(state, RIVER_X + 5, ROW), false);
    assert.equal(walkable(state, RIVER_X + 5, ROW, "apocalypse"), true);
    assert.equal(walkable(state, RIVER_X + 5, ROW, "gunboat"), false);
    // Off the deck it is still river.
    assert.equal(isWater(state, RIVER_X + 5, ROW + 8), true);
    const man = makeEntity(state, "rifleman", a, w(RIVER_X + 5, state), w(ROW, state));
    assert.equal(unitInWater(state, man), false);
  });

  it("bridges a river far wider than one span used to reach", () => {
    const { state, a } = twoPlayerMatch();
    deploy(state, a);
    river(state, 40);
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 4, state), w(ROW, state));
    state.players.get(a)!.scrap = 99999;
    const cmd = applyCommand(state, a, {
      type: "cmd.bridge",
      ids: [eng.id],
      bridge: "bigbridge",
      x: w(RIVER_X - 2, state),
      y: w(ROW, state),
      path: [
        { x: w(RIVER_X - 2, state), y: w(ROW, state) },
        { x: w(RIVER_X + 42, state), y: w(ROW, state) },
      ],
    });
    assert.equal(cmd.ok, true, cmd.ok ? "" : cmd.message);
    ticks(state, secondsToTicks(bridgeBuildSeconds("bigbridge") * 12) + 1500);
    assert.equal(walkable(state, RIVER_X + 39, ROW, "apocalypse"), true, "the far side of the river is decked");
  });

  it("refuses a line on ground with no footing, and a plain attack on a brick", () => {
    const { state, a } = twoPlayerMatch();
    deploy(state, a);
    river(state);
    for (let x = RIVER_X - 20; x < RIVER_X - 10; x++) {
      for (let y = ROW - 3; y <= ROW + 3; y++) state.blocked[y * state.width + x] = 1;
    }
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 6, state), w(ROW, state));
    const r = applyCommand(state, a, {
      type: "cmd.bridge",
      ids: [eng.id],
      bridge: "bigbridge",
      x: w(RIVER_X - 19, state),
      y: w(ROW, state),
      x2: w(RIVER_X - 12, state),
      y2: w(ROW, state),
    });
    assert.equal(r.ok, false);
    const [b] = standBridge(state);
    const tank = makeEntity(state, "apocalypse", a, w(RIVER_X - 10, state), w(ROW + 6, state));
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [tank.id], targetId: b!.id }).ok, false);
  });
});

describe("bridge damage", () => {
  it("nothing fires on a bridge on its own", () => {
    const { state, b } = twoPlayerMatch();
    river(state);
    const bricks = standBridge(state);
    const tank = makeEntity(state, "apocalypse", b, w(RIVER_X - 8, state), w(ROW + 3, state));
    ticks(state, 60);
    for (const br of bricks) {
      assert.equal(br.hp, br.hpMax);
      assert.notEqual(tank.attackTarget, br.id);
    }
  });

  it("a knock from anything but an aimed round is undone", () => {
    const { state } = twoPlayerMatch();
    river(state);
    const br = midBrick(state, standBridge(state));
    const before = guardBridges(state);
    br.hp -= 100;
    settleBridges(state, before);
    assert.equal(br.hp, br.hpMax);
    state.bridgeHits = new Map([[br.id, 30]]);
    settleBridges(state, guardBridges(state));
    assert.equal(br.hp, br.hpMax - 30);
  });

  it("wood falls to a few HE shells; concrete takes many", () => {
    const he = { shell: "he", damage: catalog("apocalypse").damage } as Projectile;
    const perShell = bridgeRoundDamage(he);
    const wood = Math.ceil(catalog("bridge").hp / perShell);
    const stone = Math.ceil(catalog("bigbridge").hp / perShell);
    assert.ok(wood >= 2 && wood <= 6, `wood ${wood}`);
    assert.ok(stone >= wood * 5, `concrete ${stone}`);
    assert.equal(bridgeRoundDamage({ shell: null, damage: 20 } as Projectile), 0);
  });

  it("a force-attack drops one brick: a tank on it sinks, the bricks either side stand", () => {
    const { state, a, b } = twoPlayerMatch();
    river(state);
    const bricks = standBridge(state);
    const br = midBrick(state, bricks);
    const victim = makeEntity(state, "jagdtiger", b, br.x, br.y);
    victim.holdPosition = true;
    victim.ammo = {};
    const gun = makeEntity(state, "apocalypse", a, w(RIVER_X - 4, state), w(ROW + 14, state));
    gun.shell = "he";
    gun.ammo = { he: 40 };
    gun.holdPosition = true;
    const r = applyCommand(state, a, { type: "cmd.forceattack", ids: [gun.id], x: br.x, y: br.y, targetId: br.id });
    assert.equal(r.ok, true);
    for (let i = 0; i < 1200 && !br.ruined; i++) {
      step(state, TICK_DT);
      gun.ammo.he = Math.max(gun.ammo.he ?? 0, 10);
    }
    assert.equal(br.ruined, true, `brick still at ${br.hp}`);
    assert.ok(state.entities.has(br.id), "the wreckage stays");
    assert.equal(state.entities.has(victim.id), false, "the tank went down with the brick");
    const tx = Math.floor(br.x / state.tileSize);
    assert.equal(isWater(state, tx, ROW), true);
    for (const o of bricks) {
      if (o === br) continue;
      assert.equal(o.ruined ?? false, false, "neighbours stand");
      assert.equal(o.hp, o.hpMax);
    }
    // The bricks either side still deck their own water.
    const other = bricks.find((o) => o !== br && Math.abs(o.x - br.x) < 30)!;
    assert.equal(isWater(state, Math.floor(other.x / state.tileSize), ROW), false);
    // Wreckage takes nothing more, and a force-attack on it lands on the spot.
    const hp = br.hp;
    applyCommand(state, a, { type: "cmd.forceattack", ids: [gun.id], x: br.x, y: br.y, targetId: br.id });
    assert.equal(gun.order?.targetId, undefined);
    ticks(state, 100);
    assert.equal(br.hp, hp);
  });

  it("artillery laid on a brick brings it down: its burst counts wherever it reaches the deck", () => {
    const { state, a } = twoPlayerMatch();
    river(state);
    const br = midBrick(state, standBridge(state));
    const gun = makeEntity(state, "artillery", a, w(RIVER_X - 30, state), w(ROW + 12, state));
    gun.holdPosition = true;
    const r = applyCommand(state, a, { type: "cmd.forceattack", ids: [gun.id], x: br.x, y: br.y, targetId: br.id });
    assert.equal(r.ok, true);
    for (let i = 0; i < 4000 && !br.ruined; i++) step(state, TICK_DT);
    assert.equal(br.ruined, true, `brick still at ${br.hp}/${br.hpMax}`);
  });

  it("an engineer rebuilds a fallen brick", () => {
    const { state, a } = twoPlayerMatch();
    river(state);
    const br = midBrick(state, standBridge(state));
    state.bridgeHits = new Map([[br.id, br.hp + 10]]);
    settleBridges(state, guardBridges(state));
    assert.equal(br.ruined, true);
    const snap = snapshotFor(state, a).entities.find((e) => e.id === br.id);
    assert.equal(snap?.ruined, true);
    assert.equal(snap?.span, br.span);
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 8, state), w(ROW, state));
    assert.equal(applyCommand(state, a, { type: "cmd.repair", ids: [eng.id], targetId: br.id }).ok, true);
    ticks(state, secondsToTicks(bridgeBuildSeconds("bridge")) + 600);
    assert.equal(br.ruined, false);
    assert.equal(br.hp, br.hpMax);
    assert.equal(walkable(state, Math.floor(br.x / state.tileSize), ROW, "apocalypse"), true);
  });

  it("a damaged brick takes an engineer's repair", () => {
    const { state, a } = twoPlayerMatch();
    river(state);
    const [br] = standBridge(state, "bigbridge");
    state.bridgeHits = new Map([[br!.id, 100]]);
    settleBridges(state, guardBridges(state));
    assert.equal(br!.hp, br!.hpMax - 100);
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 8, state), w(ROW, state));
    assert.equal(applyCommand(state, a, { type: "cmd.repair", ids: [eng.id], targetId: br!.id }).ok, true);
    ticks(state, 300);
    assert.equal(br!.hp, br!.hpMax);
  });
});

describe("bridge preview", () => {
  it("plans the same bricks from a snapshot as the sim does, over yard-64's pond", () => {
    const { state, a } = twoPlayerMatch();
    const y = w(35, state);
    const pts = [
      { x: w(84, state), y },
      { x: w(112, state), y },
    ];
    const shown = previewBridge(snapshotFor(state, a), "bridge", pts);
    assert.ok(shown.length > 0);
    for (const b of shown) assert.equal(b.problem, bridgeBrickProblemFor(state, "bridge", b.span));
    assert.ok(shown.every((b) => b.problem === null), shown.map((b) => b.problem).join(","));
    for (const b of shown) raiseBridge(state, "bridge", b.span);
    const again = previewBridge(snapshotFor(state, a), "bridge", pts);
    assert.ok(again.every((b) => /Another bridge/.test(b.problem ?? "")));
  });
});

describe("map bridges", () => {
  it("a map's bridge bricks stand at the start, neutral, decking their water", () => {
    const yard = getMap("yard-64")!;
    const id = `yard-bridge-${Math.random().toString(36).slice(2, 8)}`;
    const tiles = yard.tiles.map(() => TILE_EMPTY);
    for (let y = 60; y < 80; y++) for (let x = 120; x < 132; x++) tiles[y * yard.width + x] = TILE_WATER;
    const len = bridgeBrickLength("bigbridge") / yard.tileSize;
    const features: MapFeature[] = [];
    for (let k = 0; k < 6; k++) features.push({ type: "bigbridge", x: 116 + len * (k + 0.5) - 0.5, y: 70, facing: 0, turn: 0 });
    registerMap({ ...yard, id, tiles, heights: yard.heights.map(() => 0), maxHeight: 0, features });
    const { state } = twoPlayerMatch(id);
    const bricks = [...state.entities.values()].filter((e) => e.type === "bigbridge");
    assert.equal(bricks.length, 6);
    assert.ok(bricks.every((b) => b.ownerId === "" && b.span === bridgeBrickLength("bigbridge")));
    assert.equal(walkable(state, 126, 70, "apocalypse"), true);
    assert.equal(walkable(state, 126, 75, "apocalypse"), false);
  });
});
