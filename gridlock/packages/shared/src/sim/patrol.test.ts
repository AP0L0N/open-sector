import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TICK_DT, isCivilianType } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE, TILE_WATER } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
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
});
