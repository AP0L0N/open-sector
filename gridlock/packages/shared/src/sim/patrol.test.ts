import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { NEUTRAL_OWNER, SPOTLIGHT_TURN_DEG_PER_SEC, TICK_DT, catalog, isCivilianType } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { weaponRangeWorld } from "./elevation.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { connectPatrolPoints, distToRoute, stepPatrolLeg } from "./patrol.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "PT1",
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
  return { state: createMatch(room, started.value), a: "A", b: "B" };
}

function clearCover(state: MatchState): void {
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED || t === TILE_WATER) state.terrain[i] = TILE_EMPTY;
  }
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
}

describe("patrol", () => {
  it("rejects an empty route, a non-finite point, and someone else's units", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const rifle = makeEntity(state, "rifleman", a, tileCenter(mid, ts), tileCenter(mid, ts));
    const spot = { x: rifle.x + ts * 20, y: rifle.y };
    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [rifle.id], points: [] }).ok, false);
    assert.equal(
      applyCommand(state, a, { type: "cmd.patrol", ids: [rifle.id], points: [{ x: Number.NaN, y: rifle.y }] }).ok,
      false,
    );
    assert.equal(applyCommand(state, b, { type: "cmd.patrol", ids: [rifle.id], points: [spot] }).ok, false);
    const idle = rifle.order;
    assert.equal(idle, null);

    applyCommand(state, a, { type: "cmd.move", ids: [rifle.id], x: spot.x, y: spot.y, queue: true });
    applyCommand(state, a, { type: "cmd.move", ids: [rifle.id], x: spot.x, y: rifle.y + ts * 10, queue: true });
    assert.ok(rifle.orderQueue?.length);
    const sent = applyCommand(state, a, { type: "cmd.patrol", ids: [rifle.id], points: [spot] });
    assert.equal(sent.ok, true);
    assert.equal(rifle.order?.kind, "patrol");
    assert.equal(rifle.orderQueue, undefined);
  });

  it("walks to the point and then back", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const rifle = makeEntity(state, "rifleman", a, tileCenter(mid, ts), tileCenter(mid, ts));
    const spot = { x: rifle.x + ts * 15, y: rifle.y };
    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [rifle.id], points: [spot] }).ok, true);
    const xs: number[] = [rifle.x];
    for (let i = 0; i < 160; i++) {
      step(state, TICK_DT);
      xs.push(rifle.x);
    }
    const peak = Math.max(...xs);
    const peakAt = xs.indexOf(peak);
    assert.ok(peak > xs[0]! + ts * 8, `never reached toward the point (peak ${peak}, start ${xs[0]})`);
    assert.ok(xs.slice(peakAt + 1).some((x) => x < peak - ts * 4), "did not turn back along the route");
    assert.equal(rifle.order?.kind, "patrol");
    assert.equal(rifle.attackTarget, null);
  });

  it("breaks off for an enemy on the path, then resumes", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const ax = tileCenter(mid, ts);
    const ay = tileCenter(mid, ts);
    const rifleA = makeEntity(state, "rifleman", a, ax, ay);
    const rifleB = makeEntity(state, "rifleman", a, ax, ay + ts * 2);
    const hauler = makeEntity(state, "hauler", a, ax, ay - ts * 2);
    const cx = (rifleA.x + rifleB.x + hauler.x) / 3;
    const cy = (rifleA.y + rifleB.y + hauler.y) / 3;
    const click = { x: cx + ts * 50, y: cy };
    // 40 east and 20 off the eastbound line: inside sight, outside a rifle's own reach, inside reach of the path.
    const foe = makeEntity(state, "rifleman", b, rifleA.x + ts * 40, rifleA.y + ts * 20);
    foe.hp = 500;
    foe.clip = 0;
    foe.reload = 30;
    const far = makeEntity(state, "rifleman", b, rifleA.x + ts * 10, rifleA.y + ts * 40);
    // Beside the path, off the line of sight to the rifleman, so the hull does not hide him.
    const tank = makeEntity(state, "warden", b, rifleA.x + ts * 15, rifleA.y - ts * 14);
    const friend = makeEntity(state, "rifleman", a, rifleA.x - ts * 6, rifleA.y);
    const house = makeEntity(state, "cottage", b, rifleA.x + ts * 18, rifleA.y - ts * 22);
    const sent = applyCommand(state, a, {
      type: "cmd.patrol",
      ids: [rifleA.id, rifleB.id, hauler.id],
      points: [click],
    });
    assert.equal(sent.ok, true);
    assert.equal(rifleA.order?.kind, "patrol");
    assert.equal(rifleA.order?.group, rifleB.order?.group);

    let engaged = false;
    for (let i = 0; i < 15; i++) {
      step(state, TICK_DT);
      if (rifleA.attackTarget === foe.id && rifleB.attackTarget === foe.id) {
        engaged = true;
        break;
      }
    }
    assert.equal(engaged, true);
    assert.equal(hauler.attackTarget, null);
    assert.equal(hauler.order?.kind, "patrol");
    assert.notEqual(rifleA.attackTarget, far.id);
    assert.notEqual(rifleA.attackTarget, tank.id);
    assert.notEqual(rifleA.attackTarget, friend.id);
    assert.notEqual(rifleA.attackTarget, house.id);
    const haulerX = hauler.x;
    for (let i = 0; i < 12; i++) step(state, TICK_DT);
    assert.ok(hauler.x > haulerX + ts, "the hauler keeps walking");

    foe.hp = 0;
    let dropped = false;
    for (let i = 0; i < 5; i++) {
      step(state, TICK_DT);
      if (rifleA.attackTarget == null && rifleB.attackTarget == null) {
        dropped = true;
        break;
      }
    }
    assert.equal(dropped, true);
    assert.equal(rifleA.order?.kind, "patrol");
    const before = rifleA.x;
    const leg = rifleA.order?.kind === "patrol" ? rifleA.order.route?.[rifleA.order.leg ?? 1] : undefined;
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.equal(rifleA.order?.kind, "patrol");
    if (leg && leg.x > before) assert.ok(rifleA.x > before, "resumes toward the waypoint");
  });

  it("ignores a tank a rifle cannot harm and an enemy off the path", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const rifle = makeEntity(state, "rifleman", a, tileCenter(mid, ts), tileCenter(mid, ts));
    makeEntity(state, "warden", b, rifle.x + ts * 20, rifle.y + ts * 8);
    makeEntity(state, "rifleman", b, rifle.x + ts * 6, rifle.y + ts * 40);
    applyCommand(state, a, {
      type: "cmd.patrol",
      ids: [rifle.id],
      points: [{ x: rifle.x + ts * 50, y: rifle.y }],
    });
    for (let i = 0; i < 10; i++) step(state, TICK_DT);
    assert.equal(rifle.attackTarget, null);
    assert.equal(rifle.order?.kind, "patrol");
    const n = rifle.waypoints.length;
    assert.ok(n >= 0);
  });

  it("shows the route to the owner only", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const rifle = makeEntity(state, "rifleman", a, tileCenter(mid, ts), tileCenter(mid, ts));
    const spot = { x: rifle.x + ts * 30, y: rifle.y + ts * 4 };
    applyCommand(state, a, { type: "cmd.patrol", ids: [rifle.id], points: [spot] });
    const mine = snapshotFor(state, a).entities.find((e) => e.id === rifle.id);
    const theirs = snapshotFor(state, b).entities.find((e) => e.id === rifle.id);
    assert.ok(mine?.patrol && mine.patrol.length >= 2);
    assert.equal(theirs?.patrol, undefined);
  });

  it("turns a watch tower's spotlight along the points and leaves the tower where it stands", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const tower = towerAt(state, a, mid - 16, mid - 16);
    tower.spotFacing = 0;
    const x0 = tower.x;
    const y0 = tower.y;
    const north = { x: tower.x, y: tower.y + ts * 20 };
    const west = { x: tower.x - ts * 20, y: tower.y };
    const neutral = towerAt(state, NEUTRAL_OWNER, mid + 16, mid - 16);
    assert.equal(applyCommand(state, b, { type: "cmd.patrol", ids: [tower.id], points: [north, west] }).ok, false);
    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [neutral.id], points: [north] }).ok, false);
    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [tower.id], points: [north, west] }).ok, true);
    assert.equal(tower.order?.kind, "patrol");
    assert.equal(tower.waypoints.length, 0);
    assert.equal(tower.x, x0);
    assert.equal(tower.y, y0);
    const mine = snapshotFor(state, a).entities.find((e) => e.id === tower.id);
    const theirs = snapshotFor(state, b).entities.find((e) => e.id === tower.id);
    assert.ok(mine?.patrol && mine.patrol.length >= 3);
    assert.equal(theirs?.patrol, undefined);

    step(state, TICK_DT);
    assert.equal(tower.x, x0);
    assert.equal(tower.y, y0);
    assert.ok(tower.spotFacing! > 0 && tower.spotFacing! < Math.PI / 2, "swings toward the first point");

    let bestNorth = Infinity;
    let swungWest = false;
    const sweepTicks = Math.ceil(120 / (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT)) + 2;
    for (let i = 0; i < sweepTicks; i++) {
      step(state, TICK_DT);
      const facing = tower.spotFacing!;
      bestNorth = Math.min(bestNorth, angDiff(facing, Math.PI / 2));
      if (facing > Math.PI / 2 + 0.25 && facing < Math.PI) swungWest = true;
    }
    assert.ok(bestNorth < 0.12, `came within ${bestNorth} of the first point`);
    assert.equal(swungWest, true, "turns on toward the next point");
    assert.equal(tower.order?.kind, "patrol");
    assert.equal(tower.x, x0);
    assert.equal(tower.y, y0);
    assert.equal(tower.attackTarget, null);
  });

  it("stops a tower patrol where the beam is, and rotate replaces the sweep", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const tower = towerAt(state, a, mid - 16, mid - 16);
    tower.spotFacing = 0;
    const north = { x: tower.x, y: tower.y + ts * 20 };
    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [tower.id], points: [north] }).ok, true);
    for (let i = 0; i < 5; i++) step(state, TICK_DT);
    const held = tower.spotFacing!;
    assert.ok(held > 0);
    assert.equal(applyCommand(state, a, { type: "cmd.stop", ids: [tower.id] }).ok, true);
    const stoppedOrder = tower.order;
    const stoppedAim = tower.spotAim;
    assert.equal(stoppedOrder, null);
    assert.equal(stoppedAim, undefined);
    for (let i = 0; i < 10; i++) step(state, TICK_DT);
    assert.equal(tower.spotFacing, held);

    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [tower.id], points: [north] }).ok, true);
    assert.equal(
      applyCommand(state, a, { type: "cmd.rotate", ids: [tower.id], x: tower.x, y: tower.y - 500 }).ok,
      true,
    );
    const turnedOrder = tower.order;
    const turnedAim = tower.spotAim;
    assert.equal(turnedOrder, null);
    assert.ok(turnedAim != null && turnedAim < 0);
    const settleTicks = Math.ceil(180 / (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT)) + 2;
    for (let i = 0; i < settleTicks; i++) step(state, TICK_DT);
    assert.ok(angDiff(tower.spotFacing!, -Math.PI / 2) < 0.05, "settles on the rotate heading");
    for (let i = 0; i < 10; i++) step(state, TICK_DT);
    assert.equal(tower.order, null);
    assert.ok(angDiff(tower.spotFacing!, -Math.PI / 2) < 0.05, "does not resume the patrol");
  });

  it("walks a rifle on a shared patrol while the tower only turns", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const tower = towerAt(state, a, mid - 16, mid - 16);
    tower.spotFacing = 0;
    const rifle = makeEntity(state, "rifleman", a, tower.x + ts * 8, tower.y);
    const spot = { x: tower.x, y: tower.y + ts * 30 };
    const x0 = tower.x;
    const y0 = tower.y;
    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [tower.id, rifle.id], points: [spot] }).ok, true);
    assert.equal(tower.order?.kind, "patrol");
    assert.equal(rifle.order?.kind, "patrol");
    assert.equal(tower.order?.group, rifle.order?.group);
    const rifleY = rifle.y;
    for (let i = 0; i < 40; i++) step(state, TICK_DT);
    assert.equal(tower.x, x0);
    assert.equal(tower.y, y0);
    assert.ok(rifle.y > rifleY + ts, "the rifle walks the route");
    assert.equal(tower.order?.kind, "patrol");
    assert.ok(tower.spotFacing! > 0.2, "the lamp leaves its rest heading");
  });

  it("drops the tail when a draft connects to an earlier spot", () => {
    assert.deepEqual(connectPatrolPoints(["S", "A", "B", "C", "D"], 2), ["B", "C", "D"]);
    assert.deepEqual(connectPatrolPoints(["A", "B", "C"], 0), ["A", "B", "C"]);
    assert.equal(connectPatrolPoints(["A", "B", "C"], 2), null);
    assert.equal(connectPatrolPoints(["A"], 0), null);
    assert.equal(connectPatrolPoints(["A", "B"], -1), null);
    const square = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 0, y: 30 },
    ];
    assert.deepEqual(stepPatrolLeg(square, 3, 1, true), { leg: 0, dir: 1 });
    assert.deepEqual(stepPatrolLeg(square, 3, -1, true), { leg: 0, dir: 1 });
    assert.deepEqual(stepPatrolLeg(square, 3, 1), { leg: 2, dir: -1 });
    const mid = { x: 0, y: 15 };
    assert.ok(distToRoute(square, mid.x, mid.y) > 10);
    assert.ok(distToRoute(square, mid.x, mid.y, true) < 0.01);
  });

  it("circles a closed route and does not turn back along it", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const rifle = makeEntity(state, "rifleman", a, tileCenter(mid, ts), tileCenter(mid, ts));
    const startX = rifle.x;
    const startY = rifle.y;
    const A = { x: startX + ts * 8, y: startY };
    const B = { x: A.x, y: startY + ts * 8 };
    const C = { x: startX, y: startY + ts * 8 };
    const spot = { x: startX + ts * 20, y: startY };
    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [rifle.id], points: [spot], loop: true }).ok, true);
    const openLeg = rifle.order?.kind === "patrol" ? rifle.order.leg : undefined;
    const openLoop = rifle.order?.kind === "patrol" ? rifle.order.loop : undefined;
    assert.equal(openLeg, 1);
    assert.equal(openLoop, undefined);

    assert.equal(applyCommand(state, a, { type: "cmd.patrol", ids: [rifle.id], points: [A, B, C], loop: true }).ok, true);
    const issued = state.entities.get(rifle.id);
    const order = issued?.order?.kind === "patrol" ? issued.order : undefined;
    assert.ok(order);
    assert.equal(order?.loop, true);
    assert.equal(order?.dir, 1);
    assert.equal(order?.leg, 0);
    const route = order?.route ?? [];
    assert.equal(route.length, 3);
    assert.ok(Math.hypot(route[0]!.x - A.x, route[0]!.y - A.y) < 1);
    assert.ok(Math.hypot(route[0]!.x - startX, route[0]!.y - startY) > ts * 4, "the stand point is not on the ring");
    const mine = snapshotFor(state, a).entities.find((e) => e.id === rifle.id);
    const theirs = snapshotFor(state, b).entities.find((e) => e.id === rifle.id);
    assert.equal(mine?.patrolLoop, true);
    assert.equal(mine?.patrol?.length, 3);
    assert.equal(theirs?.patrol, undefined);
    assert.equal(theirs?.patrolLoop, undefined);

    const seen: number[] = [0];
    for (let i = 0; i < 500 && seen.length < 4; i++) {
      step(state, TICK_DT);
      const now = state.entities.get(rifle.id);
      const leg = now?.order?.kind === "patrol" ? now.order.leg : undefined;
      const dir = now?.order?.kind === "patrol" ? now.order.dir : undefined;
      assert.equal(dir, 1);
      if (leg != null && leg !== seen[seen.length - 1]) seen.push(leg);
    }
    assert.deepEqual(seen, [0, 1, 2, 0]);
  });

  it("fights an enemy on the closing edge of a loop", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const x0 = tileCenter(20, ts);
    const y0 = tileCenter(12, ts);
    const side = ts * 36;
    const A = { x: x0, y: y0 };
    const B = { x: x0 + side, y: y0 };
    const C = { x: x0 + side, y: y0 + side };
    const D = { x: x0, y: y0 + side };
    const foe = makeEntity(state, "rifleman", b, x0, y0 + side / 2);
    foe.hp = 500;
    foe.clip = 0;
    foe.reload = 30;
    const rifle = makeEntity(state, "rifleman", a, x0 - ts * 10, foe.y);
    rifle.crits = ["arm"];
    const sent = applyCommand(state, a, { type: "cmd.patrol", ids: [rifle.id], points: [A, B, C, D], loop: true });
    assert.equal(sent.ok, true);
    const order = state.entities.get(rifle.id)?.order;
    const route = order?.kind === "patrol" ? order.route : undefined;
    assert.ok(route && route.length === 4);
    const range = weaponRangeWorld(state, rifle);
    const along = distToRoute(route!, foe.x, foe.y, true);
    const open = distToRoute(route!, foe.x, foe.y, false);
    assert.ok(along <= range, `closing edge ${along} outside range ${range}`);
    assert.ok(open > range, `open ring already reached the foe (${open} <= ${range})`);
    let engaged = false;
    for (let i = 0; i < 20; i++) {
      step(state, TICK_DT);
      const now = state.entities.get(rifle.id);
      if (now?.attackTarget === foe.id) {
        engaged = true;
        break;
      }
    }
    assert.equal(engaged, true);
    const still = state.entities.get(rifle.id)?.order?.kind;
    assert.equal(still, "patrol");
  });

  it("sweeps a tower spotlight around a loop and back to the first spot", () => {
    const { state, a } = twoPlayerMatch();
    clearCover(state);
    const ts = state.tileSize;
    const mid = Math.floor(state.width / 2);
    const tower = towerAt(state, a, mid - 16, mid - 16);
    tower.spotFacing = 0;
    const x0 = tower.x;
    const y0 = tower.y;
    const north = { x: tower.x, y: tower.y + ts * 16 };
    const west = { x: tower.x - ts * 16, y: tower.y };
    const south = { x: tower.x, y: tower.y - ts * 16 };
    assert.equal(
      applyCommand(state, a, { type: "cmd.patrol", ids: [tower.id], points: [north, west, south], loop: true }).ok,
      true,
    );
    const issued = state.entities.get(tower.id)?.order;
    assert.equal(issued?.kind, "patrol");
    assert.equal(issued?.kind === "patrol" ? issued.loop : undefined, true);
    assert.equal(issued?.kind === "patrol" ? issued.route?.length : 0, 3);
    const parked = tower.waypoints.length;
    assert.equal(parked, 0);
    const seen: number[] = [];
    const first = issued?.kind === "patrol" ? issued.leg : undefined;
    if (first != null) seen.push(first);
    const sweepTicks = Math.ceil(360 / (SPOTLIGHT_TURN_DEG_PER_SEC * TICK_DT)) + 4;
    for (let i = 0; i < sweepTicks && seen.length < 4; i++) {
      step(state, TICK_DT);
      const now = state.entities.get(tower.id);
      const leg = now?.order?.kind === "patrol" ? now.order.leg : undefined;
      const dir = now?.order?.kind === "patrol" ? now.order.dir : undefined;
      assert.equal(dir, 1);
      if (leg != null && leg !== seen[seen.length - 1]) seen.push(leg);
    }
    assert.deepEqual(seen, [0, 1, 2, 0]);
    assert.equal(tower.x, x0);
    assert.equal(tower.y, y0);
    const stillParked = tower.waypoints.length;
    assert.equal(stillParked, 0);
  });
});

function towerAt(state: MatchState, owner: string, tx: number, ty: number) {
  const def = catalog("tower");
  const ts = state.tileSize;
  return makeEntity(state, "tower", owner, (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, {
    tileX: tx,
    tileY: ty,
  });
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}
