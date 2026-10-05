import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRIDGE_ABUTMENT, BRIDGE_MAX_TILES, TICK_DT, bridgeBuildSeconds, bridgeCost, catalog, secondsToTicks } from "../catalog.js";
import { bridgeEnds, bridgeTiles, planBridge, type BridgeGround } from "../bridge-plan.js";
import { TILE_EMPTY, TILE_WATER } from "../maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { applyCommand } from "./commands.js";
import { hqOf, isWater, makeEntity, tileCenter, unitInWater, walkable } from "./geo.js";
import { createMatch, step } from "./match.js";
import { bridgeRoundDamage, guardBridges, planBridgeFor, raiseBridge, settleBridges } from "./bridge.js";
import { snapshotFor } from "./snapshot.js";
import { previewBridge } from "./preview.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "BR1", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
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
const X0 = 60;
const Y0 = 28;
const X1 = 120;
const Y1 = 64;
const RIVER_X = 84;
const RIVER_W = 12;
const ROW = 46;

function river(state: MatchState): void {
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const i = y * state.width + x;
      const wet = x >= RIVER_X && x < RIVER_X + RIVER_W;
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

/** A wooden bridge across the river on ROW, standing. */
function standBridge(state: MatchState, type: "bridge" | "bigbridge" = "bridge"): Entity {
  const ts = state.tileSize;
  const len = RIVER_W * ts + BRIDGE_ABUTMENT * 2;
  return raiseBridge(state, type, { x: (RIVER_X + RIVER_W / 2) * ts, y: w(ROW, state), facing: 0, length: len });
}

function midRiver(state: MatchState): { x: number; y: number } {
  return { x: (RIVER_X + RIVER_W / 2) * state.tileSize, y: w(ROW, state) };
}

describe("bridge plan", () => {
  const ground = (water: (x: number, y: number) => boolean): BridgeGround => ({
    width: 200,
    height: 200,
    tileSize: 8,
    water,
    footing: () => true,
  });

  it("snaps a drag to the water it crosses and rests on land at both ends", () => {
    const g = ground((x) => x >= 50 && x < 62);
    const plan = planBridge(g, "bridge", 40 * 8, 100 * 8 + 4, 70 * 8, 100 * 8 + 4);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const { ax, bx } = bridgeEnds(plan.span);
    // Shore at x=400 and x=496: the deck reaches a footing past each.
    assert.ok(ax < 400 && ax > 400 - BRIDGE_ABUTMENT * 2, `west end ${ax}`);
    assert.ok(bx > 496 && bx < 496 + BRIDGE_ABUTMENT * 2, `east end ${bx}`);
    assert.ok(Math.abs(plan.span.facing) < 1e-9);
  });

  it("finds the far shore past a drag that stops in the water", () => {
    const g = ground((x) => x >= 50 && x < 62);
    const plan = planBridge(g, "bridge", 45 * 8, 100 * 8 + 4, 55 * 8, 100 * 8 + 4);
    assert.equal(plan.ok, true);
    if (plan.ok) assert.ok(bridgeEnds(plan.span).bx > 496);
  });

  it("refuses dry ground and water too wide to span", () => {
    assert.equal(planBridge(ground(() => false), "bridge", 0, 4, 200, 4).ok, false);
    const wide = ground((x) => x >= 20 && x < 20 + BRIDGE_MAX_TILES + 4);
    const plan = planBridge(wide, "bridge", 10 * 8, 4 + 80, (30 + BRIDGE_MAX_TILES) * 8, 4 + 80);
    assert.equal(plan.ok, false);
    if (!plan.ok) assert.match(plan.reason, /long/);
  });

  it("refuses an end with no footing", () => {
    const g: BridgeGround = { ...ground((x) => x >= 50 && x < 62), footing: (x) => x < 62 };
    assert.equal(planBridge(g, "bridge", 40 * 8, 804, 70 * 8, 804).ok, false);
  });

  it("the concrete deck is about twice as wide as the wooden one", () => {
    const span = { x: 400, y: 404, facing: 0, length: 120 };
    const g = { width: 200, height: 200, tileSize: 8 };
    const rows = (t: { y: number }[]) => new Set(t.map((p) => p.y)).size;
    assert.ok(rows(bridgeTiles(g, span, 44)) >= rows(bridgeTiles(g, span, 20)) * 2 - 1);
  });
});

describe("engineer bridges", () => {
  it("builds the whole bridge at once, then tanks drive the water and men walk it", () => {
    const { state, a } = twoPlayerMatch();
    deploy(state, a);
    river(state);
    const ts = state.tileSize;
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 6, state), w(ROW, state));
    const scrap0 = state.players.get(a)!.scrap;
    const cmd = applyCommand(state, a, {
      type: "cmd.bridge",
      ids: [eng.id],
      bridge: "bridge",
      x: w(RIVER_X - 3, state),
      y: w(ROW, state),
      x2: w(RIVER_X + RIVER_W + 3, state),
      y2: w(ROW, state),
    });
    assert.equal(cmd.ok, true, cmd.ok ? "" : cmd.message);
    const o = eng.order!;
    const len = o.span!;
    assert.ok(len >= RIVER_W * ts && len <= RIVER_W * ts + BRIDGE_ABUTMENT * 2 + ts, `span ${len}`);
    const mid = { x: w(RIVER_X + 5, state), y: w(ROW, state) };
    assert.equal(walkable(state, RIVER_X + 5, ROW, "apocalypse"), false);

    let built: Entity | undefined;
    const limit = secondsToTicks(bridgeBuildSeconds("bridge", len)) + 200;
    for (let i = 0; i < limit && !built; i++) {
      step(state, TICK_DT);
      built = [...state.entities.values()].find((e) => e.type === "bridge");
      // Nothing of the deck before the work is done.
      if (!built) assert.equal(isWater(state, RIVER_X + 5, ROW), true);
    }
    assert.ok(built, "bridge never went up");
    assert.equal(state.players.get(a)!.scrap, scrap0 - bridgeCost("bridge", len));
    assert.equal(built!.ownerId, "");
    assert.equal(built!.span, len);
    assert.equal(eng.order, null);

    assert.equal(isWater(state, RIVER_X + 5, ROW), false);
    assert.equal(walkable(state, RIVER_X + 5, ROW, "apocalypse"), true);
    assert.equal(walkable(state, RIVER_X + 5, ROW, "gunboat"), false);
    // Off the deck it is still river.
    assert.equal(isWater(state, RIVER_X + 5, ROW + 8), true);
    const man = makeEntity(state, "rifleman", a, mid.x, mid.y);
    assert.equal(unitInWater(state, man), false);
  });

  it("refuses a drag over dry ground, and a plain attack on a bridge", () => {
    const { state, a } = twoPlayerMatch();
    deploy(state, a);
    river(state);
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 6, state), w(ROW, state));
    const r = applyCommand(state, a, {
      type: "cmd.bridge",
      ids: [eng.id],
      bridge: "bigbridge",
      x: w(RIVER_X - 20, state),
      y: w(ROW, state),
      x2: w(RIVER_X - 10, state),
      y2: w(ROW, state),
    });
    assert.equal(r.ok, false);
    const b = standBridge(state);
    const tank = makeEntity(state, "apocalypse", a, w(RIVER_X - 10, state), w(ROW, state));
    assert.equal(applyCommand(state, a, { type: "cmd.attack", ids: [tank.id], targetId: b.id }).ok, false);
  });
});

describe("bridge damage", () => {
  it("nothing fires on a bridge on its own", () => {
    const { state, b } = twoPlayerMatch();
    river(state);
    const br = standBridge(state);
    const tank = makeEntity(state, "apocalypse", b, w(RIVER_X - 8, state), w(ROW + 3, state));
    ticks(state, 60);
    assert.equal(br.hp, br.hpMax);
    assert.notEqual(tank.attackTarget, br.id);
  });

  it("a knock from anything but an aimed round is undone", () => {
    const { state } = twoPlayerMatch();
    river(state);
    const br = standBridge(state);
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

  it("a force-attack brings it down: a tank on it sinks, a man swims, the wreckage stays", () => {
    const { state, a, b } = twoPlayerMatch();
    river(state);
    const br = standBridge(state);
    const mid = midRiver(state);
    const victim = makeEntity(state, "jagdtiger", b, mid.x + 10, mid.y);
    victim.holdPosition = true;
    const man = makeEntity(state, "rifleman", b, mid.x - 12, mid.y);
    man.holdPosition = true;
    const gun = makeEntity(state, "apocalypse", a, w(RIVER_X - 4, state), w(ROW + 14, state));
    gun.shell = "he";
    gun.ammo = { he: 40 };
    gun.holdPosition = true;
    // The tank on the deck: guns hold fire until they are told.
    victim.ammo = {};
    const r = applyCommand(state, a, { type: "cmd.forceattack", ids: [gun.id], x: br.x, y: br.y, targetId: br.id });
    assert.equal(r.ok, true);
    for (let i = 0; i < 1200 && !br.ruined; i++) {
      step(state, TICK_DT);
      gun.ammo.he = Math.max(gun.ammo.he ?? 0, 10);
    }
    assert.equal(br.ruined, true, `bridge still at ${br.hp}`);
    assert.ok(state.entities.has(br.id), "the wreckage stays");
    assert.ok(br.hp > 0);
    assert.equal(state.entities.has(victim.id), false, "the tank went down with the deck");
    assert.equal(isWater(state, RIVER_X + 5, ROW), true);
    if (state.entities.has(man.id)) assert.equal(unitInWater(state, man), true);
    // Wreckage takes nothing more, and a force-attack on it lands on the spot.
    const hp = br.hp;
    applyCommand(state, a, { type: "cmd.forceattack", ids: [gun.id], x: br.x, y: br.y, targetId: br.id });
    assert.equal(gun.order?.targetId, undefined);
    ticks(state, 100);
    assert.equal(br.hp, hp);
    assert.ok(state.entities.has(br.id));
  });

  it("an engineer rebuilds the wreckage", () => {
    const { state, a } = twoPlayerMatch();
    river(state);
    const br = standBridge(state);
    state.bridgeHits = new Map([[br.id, br.hp + 10]]);
    settleBridges(state, guardBridges(state));
    assert.equal(br.ruined, true);
    const snap = snapshotFor(state, a).entities.find((e) => e.id === br.id);
    assert.equal(snap?.ruined, true);
    assert.equal(snap?.span, br.span);
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 8, state), w(ROW, state));
    assert.equal(applyCommand(state, a, { type: "cmd.repair", ids: [eng.id], targetId: br.id }).ok, true);
    ticks(state, secondsToTicks(bridgeBuildSeconds("bridge", br.span!)) + 200);
    assert.equal(br.ruined, false);
    assert.equal(br.hp, br.hpMax);
    assert.equal(walkable(state, RIVER_X + 5, ROW, "apocalypse"), true);
  });

  it("a damaged deck takes an engineer's repair", () => {
    const { state, a } = twoPlayerMatch();
    river(state);
    const br = standBridge(state, "bigbridge");
    state.bridgeHits = new Map([[br.id, 100]]);
    settleBridges(state, guardBridges(state));
    assert.equal(br.hp, br.hpMax - 100);
    const eng = makeEntity(state, "engineer", a, w(RIVER_X - 8, state), w(ROW, state));
    assert.equal(applyCommand(state, a, { type: "cmd.repair", ids: [eng.id], targetId: br.id }).ok, true);
    ticks(state, 200);
    assert.equal(br.hp, br.hpMax);
  });
});

describe("bridge preview", () => {
  it("plans the same deck from a snapshot as the sim does, over yard-64's pond", () => {
    const { state, a } = twoPlayerMatch();
    const snap = snapshotFor(state, a);
    const y = w(35, state);
    const drag = [w(84, state), y, w(112, state), y] as const;
    const sim = planBridgeFor(state, "bridge", ...drag);
    const shown = previewBridge(snap, "bridge", ...drag);
    assert.equal(shown.ok, sim.ok);
    assert.deepEqual(shown.span, sim.span);
    assert.equal(sim.ok, true, sim.ok ? "" : sim.reason);
    if (!sim.ok) return;
    const br = raiseBridge(state, "bridge", sim.span);
    const view = snapshotFor(state, a).entities.find((e) => e.id === br.id)!;
    assert.equal(view.span, sim.span.length);
    const again = previewBridge(snapshotFor(state, a), "bridge", ...drag);
    assert.equal(again.ok, false);
    if (!again.ok) assert.match(again.reason, /Another bridge/);
  });
});
