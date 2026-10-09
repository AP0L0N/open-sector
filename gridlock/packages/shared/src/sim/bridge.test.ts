import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TICK_DT, bridgeBrickLength, bridgeBuildSeconds, bridgeCost, bridgeWidth, catalog, secondsToTicks } from "../catalog.js";
import { bridgeBrickProblem, bridgeEndAt, bridgePath, bridgeTiles, bricksConflict, planBridgeLine, type BridgeGround, type BridgeSpan } from "../bridge-plan.js";
import { TILE_EMPTY, TILE_WATER, getMap, normalizeTerrain, registerMap, type MapFeature } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { hqOf, isWater, makeEntity, tileCenter, unitInWater, walkable } from "./geo.js";
import { createMatch, step } from "./match.js";
import { bridgeBrickProblemFor, bridgeRoundDamage, bridgeSpanOf, guardBridges, raiseBridge, settleBridges } from "./bridge.js";
import { foldScenery, snapshotFor } from "./snapshot.js";
import { previewBridge } from "./preview.js";
import { laneLift } from "./bridge-lane.js";
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

  it("the two bricks of a corner share the mitre, not a clash: every brick of a bent line goes down", () => {
    const g = ground(() => false);
    for (const type of ["bridge", "bigbridge"] as const) {
      const len = bridgeBrickLength(type);
      for (const deg of [15, 30, 45, 60, 75, 90]) {
        const a = (deg * Math.PI) / 180;
        const line = planBridgeLine(g, type, [
          { x: 400, y: 400 },
          { x: 400 + len * 4, y: 400 },
          { x: 400 + len * 4 + Math.cos(a) * len * 4, y: 400 + Math.sin(a) * len * 4 },
        ]);
        assert.ok(line.length >= 7, `${type} ${deg}°: ${line.length} bricks`);
        assert.ok(line.every((b) => b.problem === null), `${type} ${deg}°: ${line.map((b) => b.problem ?? "ok").join(",")}`);
      }
    }
    // A brick lying across another is still in the way, at any angle.
    const w = bridgeWidth("bigbridge");
    const span: BridgeSpan = { x: 400, y: 400, facing: 0, length: 32 };
    for (const deg of [20, 45, 90]) {
      const across: BridgeSpan = { x: 400, y: 400, facing: (deg * Math.PI) / 180, length: 32 };
      assert.equal(bricksConflict(span, w, across, w), true, `${deg}° crossing`);
    }
    // So is one that runs alongside, touching, and so is one over the same ground.
    assert.equal(bricksConflict(span, w, { ...span, y: 400 + w - 6 }, w), true);
    assert.equal(bricksConflict(span, w, { ...span, x: 410 }, w), true);
    assert.equal(bricksConflict(span, w, { ...span, y: 400 + w }, w), false, "side by side, just touching");
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
    const snap = foldScenery(snapshotFor(state, a, { scenery: true })).entities.find((e) => e.id === br.id);
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
    const shown = previewBridge(foldScenery(snapshotFor(state, a, { scenery: true })), "bridge", pts);
    assert.ok(shown.length > 0);
    for (const b of shown) assert.equal(b.problem, bridgeBrickProblemFor(state, "bridge", b.span));
    assert.ok(shown.every((b) => b.problem === null), shown.map((b) => b.problem).join(","));
    for (const b of shown) raiseBridge(state, "bridge", b.span);
    const again = previewBridge(foldScenery(snapshotFor(state, a, { scenery: true })), "bridge", pts);
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

describe("bridge deck level", () => {
  /** The river with its west bank raised to `west` and its east bank at `east`. */
  function banks(state: MatchState, west: number, east: number): void {
    river(state);
    for (let y = Y0; y <= Y1; y++) {
      for (let x = X0; x <= X1; x++) {
        if (x < RIVER_X) state.heights[y * state.width + x] = west;
        else if (x >= RIVER_X + RIVER_W) state.heights[y * state.width + x] = east;
      }
    }
  }

  it("keeps the level of the ground the line was started from, all the way across", () => {
    const { state, a } = twoPlayerMatch();
    deploy(state, a);
    banks(state, 3, 1);
    const eng = makeEntity(state, "engineer", a, w(RIVER_X + RIVER_W + 6, state), w(ROW, state));
    state.players.get(a)!.scrap = 99999;
    const cmd = applyCommand(state, a, {
      type: "cmd.bridge",
      ids: [eng.id],
      bridge: "bigbridge",
      x: w(RIVER_X - 3, state),
      y: w(ROW, state),
      x2: w(RIVER_X + RIVER_W + 3, state),
      y2: w(ROW, state),
    });
    assert.equal(cmd.ok, true, cmd.ok ? "" : cmd.message);
    assert.equal(eng.order?.deck, 3, "started on the west bank");
    ticks(state, secondsToTicks(bridgeBuildSeconds("bigbridge") * 8) + 1500);
    const bricks = [...state.entities.values()].filter((e) => e.type === "bigbridge");
    assert.ok(bricks.length >= 2);
    assert.ok(bricks.every((b) => b.deckLevel === 3), bricks.map((b) => b.deckLevel).join(","));
    assert.equal(snapshotFor(state, a).entities.find((e) => e.id === bricks[0]!.id)?.deck, 3);
  });

  it("a high deck lets small boats sail under it, never the LST or the Battle Ship", () => {
    const { state, a } = twoPlayerMatch();
    banks(state, 3, 3);
    const pts = [
      { x: w(RIVER_X - 3, state), y: w(ROW, state) },
      { x: w(RIVER_X + RIVER_W + 3, state), y: w(ROW, state) },
    ];
    for (const span of bridgePath("bridge", pts)) raiseBridge(state, "bridge", span, 3);
    const mid = RIVER_X + RIVER_W / 2;
    assert.equal(walkable(state, mid, ROW, "apocalypse"), true, "tanks still drive the deck");
    assert.equal(walkable(state, mid, ROW, "gunboat"), true, "a gunboat sails under");
    assert.equal(walkable(state, mid, ROW, "submarine"), true);
    assert.equal(walkable(state, mid, ROW, "lst"), false);
    assert.equal(walkable(state, mid, ROW, "battleship"), false);
    // A boat sails right under it from one side to the other, past a tank on the deck.
    const boat = makeEntity(state, "gunboat", a, w(mid, state), w(ROW - 10, state));
    const tank = makeEntity(state, "apocalypse", a, w(mid, state), w(ROW, state));
    tank.holdPosition = true;
    assert.equal(applyCommand(state, a, { type: "cmd.move", ids: [boat.id], x: w(mid, state), y: w(ROW + 10, state) }).ok, true);
    let crossed = false;
    for (let i = 0; i < 1200 && !crossed; i++) {
      step(state, TICK_DT);
      crossed = boat.y > w(ROW + 6, state);
    }
    assert.ok(crossed, `boat stuck at ${boat.x / state.tileSize}, ${boat.y / state.tileSize}`);
  });

  it("a man crossing on a slant keeps one lane up the deck, a little toward its far edge, at full pace", () => {
    const { state, a } = twoPlayerMatch();
    river(state);
    standBridge(state);
    const man = makeEntity(state, "rifleman", a, w(RIVER_X - 6, state), w(ROW + 5, state));
    const goal = { x: w(RIVER_X + RIVER_W + 6, state), y: w(ROW - 5, state) };
    assert.equal(applyCommand(state, a, { type: "cmd.move", ids: [man.id], ...goal }).ok, true);
    const lane = w(ROW, state) + laneLift({ x: 0, y: 0, facing: 0, length: 1 }, bridgeWidth("bridge"), state.tileSize).y;
    assert.ok(lane < w(ROW, state), "the lane lies toward the edge higher on screen");
    const pace = catalog("rifleman").moveTilesPerSec * state.tileSize * TICK_DT;
    let onDeck = 0;
    for (let i = 0; i < 600; i++) {
      const ox = man.x;
      const oy = man.y;
      step(state, TICK_DT);
      const tx = Math.floor(man.x / state.tileSize);
      if (tx < RIVER_X || tx >= RIVER_X + RIVER_W) continue;
      onDeck++;
      assert.equal(unitInWater(state, man), false, "walks, never swims");
      assert.ok(Math.abs(man.y - lane) < 0.5, `off the lane at y ${man.y.toFixed(1)}, lane ${lane.toFixed(1)}`);
      assert.ok(Math.abs(Math.hypot(man.x - ox, man.y - oy) - pace) < 0.05, "the deck neither slows nor hurries him");
    }
    assert.ok(onDeck > 10, "he crossed by the bridge");
    assert.ok(Math.hypot(man.x - goal.x, man.y - goal.y) < 1, "and got where he was sent");
  });

  it("men meeting on a narrow deck jostle on it, never off it into the river", () => {
    const { state, a } = twoPlayerMatch();
    river(state);
    standBridge(state);
    const west = { x: w(RIVER_X - 6, state), y: w(ROW, state) };
    const east = { x: w(RIVER_X + RIVER_W + 6, state), y: w(ROW, state) };
    const men: Entity[] = [];
    for (let i = 0; i < 3; i++) {
      const goingEast = i % 2 === 0;
      const from = goingEast ? west : east;
      const to = goingEast ? east : west;
      const man = makeEntity(state, "rifleman", a, from.x, from.y + (i - 1) * 6);
      assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [man.id], points: [from, to] }).ok, true);
      men.push(man);
    }
    let swum = 0;
    for (let i = 0; i < 1500; i++) {
      step(state, TICK_DT);
      for (const m of men) if (unitInWater(state, m)) swum++;
    }
    assert.equal(swum, 0, `${swum} man-ticks in the river`);
  });

  it("a deck running up the screen keeps its lane in the middle", () => {
    const up = laneLift({ x: 0, y: 0, facing: Math.PI / 4, length: 24 }, bridgeWidth("bigbridge"), 8);
    assert.ok(Math.hypot(up.x, up.y) < 1e-9);
    const across = laneLift({ x: 0, y: 0, facing: -Math.PI / 4, length: 24 }, bridgeWidth("bigbridge"), 8);
    assert.ok(across.x + across.y < -1, "a deck across the screen lifts its lane up it");
    const narrow = laneLift({ x: 0, y: 0, facing: -Math.PI / 4, length: 24 }, bridgeWidth("bridge"), 8);
    assert.ok(Math.hypot(narrow.x, narrow.y) <= bridgeWidth("bridge") / 2 - 4 * Math.SQRT2, "the lane never leaves the decked tiles");
  });

  it("a deck low over the water closes it to every boat", () => {
    const { state } = twoPlayerMatch();
    river(state);
    standBridge(state);
    assert.equal(walkable(state, RIVER_X + 5, ROW, "gunboat"), false);
  });

  it("a map keeps the water under its bridges when the ground is settled", () => {
    const side = 40;
    const tiles = new Array<number>(side * side).fill(TILE_EMPTY);
    const heights = new Array<number>(side * side).fill(2);
    for (let y = 0; y < side; y++) for (let x = 15; x < 25; x++) tiles[y * side + x] = TILE_WATER;
    const features: MapFeature[] = [{ type: "bigbridge", x: 19.5, y: 20, facing: 0, turn: 0, deck: 2 }];
    normalizeTerrain(tiles, heights, side, side, [], features);
    assert.equal(tiles[20 * side + 20], TILE_WATER, "water stays under the bridge");
  });
});

describe("carrying a bridge on", () => {
  it("carries on from the open end of a standing bridge, as if drawn in one go", () => {
    const L = bridgeBrickLength("bridge");
    const whole = bridgePath("bridge", [{ x: 0, y: 0 }, { x: L * 3, y: 0 }, { x: L * 3, y: L * 3 }]);
    const leg = bridgePath("bridge", [{ x: 0, y: 0 }, { x: L * 3, y: 0 }]);
    const standing = leg.map((span) => ({ type: "bridge", span }));
    const end = bridgeEndAt("bridge", standing, L * 2.6, 3);
    assert.ok(end, "the far end is open");
    assert.ok(Math.abs(end.x - L * 3) < 1e-6 && Math.abs(end.y) < 1e-6);
    assert.ok(Math.abs(end.lead.x - 1) < 1e-6);
    assert.ok(bridgeEndAt("bridge", standing, L * 3 + L * 0.6, 4), "just past the end still finds it");
    const long = bridgePath("bridge", [{ x: 0, y: 0 }, { x: L * 8, y: 0 }]).map((span) => ({ type: "bridge", span }));
    assert.equal(bridgeEndAt("bridge", long, L * 4, 0), null, "the middle of a bridge is joined at both ends");
    assert.equal(bridgeEndAt("bigbridge", standing, L * 2.6, 0), null, "only a like bridge carries on");
    const more = bridgePath("bridge", [{ x: end.x, y: end.y }, { x: L * 3, y: L * 3 }], 0, undefined, end.lead);
    assert.equal(more.length, 3);
    more.forEach((b, i) => {
      assert.ok(Math.hypot(b.x - whole[i + 3]!.x, b.y - whole[i + 3]!.y) < 1e-6, "the corner leg lies where one drawn line puts it");
      assert.ok(Math.abs(b.facing - whole[i + 3]!.facing) < 1e-6);
    });
    for (const b of more) for (const s of leg) assert.equal(bricksConflict(b, bridgeWidth("bridge"), s, bridgeWidth("bridge")), false);
    const one = bridgePath("bridge", [{ x: end.x, y: end.y }], 0, undefined, end.lead);
    assert.equal(one.length, 1, "a lone click lays one more brick straight on");
    assert.ok(Math.abs(one[0]!.x - L * 3.5) < 1e-6 && Math.abs(one[0]!.facing) < 1e-6);
  });

  it("an engineer carries a half-built bridge on at its own deck level", () => {
    const { state, a } = twoPlayerMatch();
    deploy(state, a);
    river(state);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x < RIVER_X; x++) state.heights[y * state.width + x] = 3;
    // Half a bridge from the raised west bank out over the water, at the bank's level.
    const half = bridgePath("bridge", [
      { x: w(RIVER_X - 3, state), y: w(ROW, state) },
      { x: w(RIVER_X + 4, state), y: w(ROW, state) },
    ]);
    for (const span of half) raiseBridge(state, "bridge", span, 3);
    const bricks = [...state.entities.values()].filter((e) => e.type === "bridge").map((e) => ({ type: e.type, span: bridgeSpanOf(e) }));
    const tip = half[half.length - 1]!;
    const end = bridgeEndAt("bridge", bricks, tip.x + 4, tip.y);
    assert.ok(end, "the end over the water is open");
    const eng = makeEntity(state, "engineer", a, w(RIVER_X + RIVER_W + 6, state), w(ROW, state));
    state.players.get(a)!.scrap = 99999;
    const cmd = applyCommand(state, a, {
      type: "cmd.bridge",
      ids: [eng.id],
      bridge: "bridge",
      x: end.x,
      y: end.y,
      path: [
        { x: end.x, y: end.y },
        { x: w(RIVER_X + RIVER_W + 3, state), y: w(ROW, state) },
      ],
      lead: end.lead,
    });
    assert.equal(cmd.ok, true, cmd.ok ? "" : cmd.message);
    assert.equal(eng.order?.deck, 3, "the deck runs on at the bridge's level, not the water's");
    const first = { x: end.x + (end.lead.x * bridgeBrickLength("bridge")) / 2, y: end.y + (end.lead.y * bridgeBrickLength("bridge")) / 2 };
    const all = [eng.order!, ...(eng.fieldQueue ?? [])];
    const nearest = Math.min(...all.map((o) => Math.hypot((o.x ?? 0) - first.x, (o.y ?? 0) - first.y)));
    assert.ok(nearest < 1e-6, "the first new brick starts on the old one's end");
  });
});
