import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TICK_DT, catalog } from "../catalog.js";
import { TILE_EMPTY } from "../maps.js";
import { applyCommand } from "./commands.js";
import { groupMovePace, groupMoveTargets, unitClearance } from "./formation.js";
import { makeEntity, tileCenter, walkable, worldToTile } from "./geo.js";
import { createMatch, step } from "./match.js";
import type { Entity, MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "T1",
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
  return { state, a: "A", b: "B" };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function assertSpaced(units: Entity[]): void {
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i]!;
      const b = units[j]!;
      const got = dist(a, b);
      const need = unitClearance(a.radius, b.radius);
      assert.ok(got + 1e-6 >= need, `units ${a.id},${b.id} dist=${got} need=${need}`);
    }
  }
}

describe("groupMoveTargets", () => {
  it("sends a single unit to the click", () => {
    const { state } = twoPlayerMatch();
    const t = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const dests = groupMoveTargets(state, [t], 400, 410);
    assert.deepEqual(dests.get(t.id), { x: 400, y: 410 });
  });

  it("spreads stacked units by reserved radius around the click", () => {
    const { state } = twoPlayerMatch();
    const t1 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const t2 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const t3 = makeEntity(state, "warden", "A", 20 * 32, 20 * 32);
    const click = { x: tileCenter(24, 32), y: tileCenter(20, 32) };
    const dests = groupMoveTargets(state, [t1, t2, t3], click.x, click.y);
    const pts = [t1, t2, t3].map((u) => {
      const p = dests.get(u.id);
      assert.ok(p);
      return { ...u, x: p.x, y: p.y };
    });
    assertSpaced(pts);
    const reach = unitClearance(catalog("warden").radius, catalog("trooper").radius) + 8;
    for (const p of pts) {
      assert.ok(dist(p, click) < reach, `dest drifted ${dist(p, click)} from click`);
    }
  });

  it("keeps a spaced line's relative layout", () => {
    const { state } = twoPlayerMatch();
    const a = makeEntity(state, "trooper", "A", 16 * 32, 16 * 32);
    const b = makeEntity(state, "trooper", "A", 16 * 32, 16 * 32 + 40);
    const click = { x: 28 * 32, y: 16 * 32 + 20 };
    const dests = groupMoveTargets(state, [a, b], click.x, click.y);
    const da = dests.get(a.id)!;
    const db = dests.get(b.id)!;
    assert.ok(Math.abs(dist(da, db) - 40) < 1e-6);
    assert.ok(Math.abs(db.y - da.y - 40) < 1e-6);
    assert.ok(Math.abs(da.x - db.x) < 1e-6);
  });

  it("does not collapse onto one tile when the click is blocked", () => {
    const { state } = twoPlayerMatch();
    const t1 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const t2 = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const click = { x: tileCenter(26, 32), y: tileCenter(26, 32) };
    const dests = groupMoveTargets(state, [t1, t2], click.x, click.y);
    const a = dests.get(t1.id)!;
    const b = dests.get(t2.id)!;
    assertSpaced([
      { ...t1, x: a.x, y: a.y },
      { ...t2, x: b.x, y: b.y },
    ]);
    assert.equal(walkable(state, worldToTile(a.x, 32), worldToTile(a.y, 32)), true);
    assert.equal(walkable(state, worldToTile(b.x, 32), worldToTile(b.y, 32)), true);
  });

  it("uses a larger gap when a Warden is in the group", () => {
    const { state } = twoPlayerMatch();
    const inf = makeEntity(state, "trooper", "A", 18 * 32, 18 * 32);
    const tank = makeEntity(state, "warden", "A", 18 * 32, 18 * 32);
    const dests = groupMoveTargets(state, [inf, tank], 22 * 32, 18 * 32);
    const gap = dist(dests.get(inf.id)!, dests.get(tank.id)!);
    assert.ok(gap + 1e-6 >= unitClearance(catalog("trooper").radius, catalog("warden").radius));
  });
});

describe("cmd.move group", () => {
  it("does not stack selected units on the click", () => {
    const { state } = twoPlayerMatch();
    state.heights.fill(0);
    const ts = state.tileSize;
    const t1 = makeEntity(state, "trooper", "A", tileCenter(36, ts), tileCenter(16, ts));
    const t2 = makeEntity(state, "trooper", "A", tileCenter(36, ts), tileCenter(16, ts));
    const x = tileCenter(56, ts);
    const y = tileCenter(16, ts);
    const res = applyCommand(state, "A", { type: "cmd.move", ids: [t1.id, t2.id], x, y });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.ok(t1.order?.x != null && t2.order?.x != null);
    const need = unitClearance(t1.radius, t2.radius);
    assert.ok(dist({ x: t1.order.x, y: t1.order.y! }, { x: t2.order.x, y: t2.order.y! }) + 1e-6 >= need);

    for (let i = 0; i < 200; i++) {
      step(state, TICK_DT);
      if (t1.state === "idle" && t2.state === "idle") break;
    }
    assertSpaced([t1, t2]);
    assert.ok(dist(t1, { x, y }) < 48, `t1 drifted ${dist(t1, { x, y })}`);
    assert.ok(dist(t2, { x, y }) < 48, `t2 drifted ${dist(t2, { x, y })}`);
  });

  it("marches mixed units at the slowest catalog speed", () => {
    const { state } = twoPlayerMatch();
    const ts = state.tileSize;
    clearPad(state, 10, 16, 100, 100);
    const facing = Math.PI / 4;
    const inf = makeEntity(state, "trooper", "A", tileCenter(16, ts), tileCenter(20, ts));
    const tank = makeEntity(state, "warden", "A", tileCenter(16, ts), tileCenter(28, ts));
    const solo = makeEntity(state, "trooper", "A", tileCenter(16, ts), tileCenter(36, ts));
    inf.facing = facing;
    tank.facing = facing;
    tank.turretFacing = facing;
    solo.facing = facing;
    const mixed = applyCommand(state, "A", {
      type: "cmd.move",
      ids: [inf.id, tank.id],
      x: tileCenter(72, ts),
      y: tileCenter(80, ts),
    });
    assert.equal(mixed.ok, true, !mixed.ok ? mixed.message : "");
    const alone = applyCommand(state, "A", {
      type: "cmd.move",
      ids: [solo.id],
      x: tileCenter(72, ts),
      y: tileCenter(92, ts),
    });
    assert.equal(alone.ok, true, !alone.ok ? alone.message : "");
    assert.equal(inf.order?.pace, catalog("warden").moveTilesPerSec);
    assert.equal(tank.order?.pace, catalog("warden").moveTilesPerSec);
    assert.equal(solo.order?.pace, undefined);

    const inf0 = { x: inf.x, y: inf.y };
    const tank0 = { x: tank.x, y: tank.y };
    const solo0 = { x: solo.x, y: solo.y };
    for (let i = 0; i < 24; i++) step(state, TICK_DT);
    const infDist = dist(inf, inf0);
    const tankDist = dist(tank, tank0);
    const soloDist = dist(solo, solo0);
    assert.ok(infDist > 40, `infantry should move ${infDist}`);
    assert.ok(tankDist > 40, `tank should move ${tankDist}`);
    assert.ok(
      Math.abs(infDist - tankDist) < 24,
      `mixed group split: inf ${infDist} tank ${tankDist}`,
    );
    assert.ok(soloDist > infDist + 24, `solo ${soloDist} should outrun grouped ${infDist}`);
  });

  it("stamps the same pace on attack-move", () => {
    const { state } = twoPlayerMatch();
    const inf = makeEntity(state, "trooper", "A", 20 * 32, 20 * 32);
    const tank = makeEntity(state, "warden", "A", 20 * 32, 20 * 32 + 40);
    const res = applyCommand(state, "A", {
      type: "cmd.attackmove",
      ids: [inf.id, tank.id],
      x: 28 * 32,
      y: 20 * 32,
    });
    assert.equal(res.ok, true, !res.ok ? res.message : "");
    assert.equal(inf.order?.pace, catalog("warden").moveTilesPerSec);
    assert.equal(tank.order?.pace, catalog("warden").moveTilesPerSec);
  });
});

describe("groupMovePace", () => {
  it("caps a mixed selection to the slowest walker", () => {
    const { state } = twoPlayerMatch();
    const inf = makeEntity(state, "trooper", "A", 100, 100);
    const tank = makeEntity(state, "warden", "A", 140, 100);
    const truck = makeEntity(state, "hauler", "A", 180, 100);
    assert.equal(groupMovePace([inf, tank]), catalog("warden").moveTilesPerSec);
    assert.equal(groupMovePace([inf, tank, truck]), catalog("warden").moveTilesPerSec);
    assert.equal(groupMovePace([inf, truck]), catalog("hauler").moveTilesPerSec);
  });

  it("leaves a solo unit and a same-type group uncapped", () => {
    const { state } = twoPlayerMatch();
    const a = makeEntity(state, "trooper", "A", 100, 100);
    const b = makeEntity(state, "trooper", "A", 140, 100);
    assert.equal(groupMovePace([a]), undefined);
    assert.equal(groupMovePace([a, b]), undefined);
    assert.equal(groupMovePace([]), undefined);
  });

  it("ignores a hull that cannot move", () => {
    const { state } = twoPlayerMatch();
    const inf = makeEntity(state, "trooper", "A", 100, 100);
    const tank = makeEntity(state, "warden", "A", 140, 100);
    tank.crits = ["tracks"];
    assert.equal(groupMovePace([inf, tank]), undefined);
  });
});
