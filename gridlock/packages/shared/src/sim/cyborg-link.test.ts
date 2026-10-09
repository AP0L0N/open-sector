import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CYBORG_SHUTDOWN_SECONDS,
  CYBORG_TAKEOVER_RANGE_TILES,
  CYBORG_TAKEOVER_SECONDS,
  TICK_DT,
  isCivilianType,
  secondsToTicks,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { cyborgLinked, cyborgShutdownIn } from "./cyborg-link.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { thermalContacts } from "./thermal.js";
import type { Entity, MatchState } from "./types.js";

function match(): { state: MatchState; a: string; b: string } {
  const r = createRoom({ id: "CL", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
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
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
  return { state, a: "A", b: "B" };
}

function ticks(state: MatchState, n: number): void {
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

/** A Cyborg Central with a Dynamo beside it, so its power holds. */
function central(state: MatchState, playerId: string, tx: number, ty: number): { hub: Entity; dynamo: Entity } {
  const ts = state.tileSize;
  const hub = makeEntity(state, "cyborgcentral", playerId, tileCenter(tx, ts), tileCenter(ty, ts), { tileX: tx, tileY: ty });
  const dynamo = makeEntity(state, "dynamo", playerId, tileCenter(tx, ts), tileCenter(ty + 6, ts), { tileX: tx, tileY: ty + 6 });
  return { hub, dynamo };
}

function cyborg(state: MatchState, playerId: string, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, "cyborg", playerId, tileCenter(tx, ts), tileCenter(ty, ts));
}

const GRACE = secondsToTicks(CYBORG_SHUTDOWN_SECONDS);
const TAKEOVER = secondsToTicks(CYBORG_TAKEOVER_SECONDS);

describe("cyborg link", () => {
  it("keeps Cyborgs running while a powered Cyborg Central stands", () => {
    const { state, a } = match();
    central(state, a, 6, 6);
    const cy = cyborg(state, a, 60, 40);
    ticks(state, GRACE * 2);
    assert.equal(cyborgLinked(state, a), true);
    assert.equal(cy.ownerId, a);
    assert.equal(cy.shutdown, undefined);
  });

  it("shuts every field Cyborg down once the Central falls and the grace runs out", () => {
    const { state, a } = match();
    const { hub } = central(state, a, 6, 6);
    const cy = cyborg(state, a, 60, 40);
    const cy2 = cyborg(state, a, 64, 40);
    ticks(state, 2);
    hub.hp = 0;
    ticks(state, 2);
    assert.equal(cyborgLinked(state, a), false);
    const left = cyborgShutdownIn(state, a);
    assert.ok(left != null && left > 0 && left <= CYBORG_SHUTDOWN_SECONDS, `countdown ${left}`);
    assert.ok((snapshotFor(state, a).you.cyborgShutdownIn ?? 0) > 0, "you see the countdown");
    assert.equal(cy.ownerId, a, "still yours during the grace");
    ticks(state, GRACE);
    for (const c of [cy, cy2]) {
      assert.equal(c.shutdown, true);
      assert.equal(c.ownerId, a, "still yours");
      assert.equal(c.order, null);
      assert.deepEqual(c.waypoints, []);
    }
    assert.equal(snapshotFor(state, a).you.cyborgShutdownIn, undefined, "nothing left to lose");
  });

  it("shuts a Drone and a Lancer down too, and counts them toward the warning", () => {
    const { state, a } = match();
    const { hub } = central(state, a, 6, 6);
    const ts = state.tileSize;
    const drone = makeEntity(state, "borgdrone", a, tileCenter(60, ts), tileCenter(40, ts));
    const lancer = makeEntity(state, "lancer", a, tileCenter(64, ts), tileCenter(40, ts));
    ticks(state, 2);
    hub.hp = 0;
    ticks(state, 2);
    assert.ok((snapshotFor(state, a).you.cyborgShutdownIn ?? 0) > 0, "the countdown shows with only a Drone and a Lancer to lose");
    ticks(state, GRACE);
    for (const c of [drone, lancer]) assert.equal(c.shutdown, true, c.type);
  });

  it("shuts them down when power runs short, even with the Central standing", () => {
    const { state, a } = match();
    const { dynamo } = central(state, a, 6, 6);
    const cy = cyborg(state, a, 60, 40);
    ticks(state, 2);
    destroyEntity(state, dynamo);
    ticks(state, GRACE + 2);
    assert.equal(cy.shutdown, true);
    assert.equal(cy.ownerId, a);
  });

  it("does not shut down if the link comes back within the grace", () => {
    const { state, a } = match();
    const { hub } = central(state, a, 6, 6);
    const cy = cyborg(state, a, 60, 40);
    hub.hp = 0;
    ticks(state, Math.floor(GRACE / 2));
    central(state, a, 20, 6);
    ticks(state, GRACE * 2);
    assert.equal(cy.ownerId, a);
    assert.equal(cy.shutdown, undefined);
    assert.equal(state.players.get(a)!.cyborgLinkLostTick, undefined);
  });

  it("keeps Cyborgs running without a Central while their Cyborg Commander lives", () => {
    const { state, a } = match();
    const ts = state.tileSize;
    const boss = makeEntity(state, "cyborgcommander", a, tileCenter(20, ts), tileCenter(70, ts));
    const cy = cyborg(state, a, 60, 40);
    ticks(state, GRACE * 2);
    assert.equal(cy.ownerId, a);
    assert.equal(cy.shutdown, undefined);
    // He falls: the grace starts, then they go dark.
    boss.hp = 0;
    boss.wreck = true;
    ticks(state, GRACE + 2);
    assert.equal(cy.shutdown, true);
  });

  it("goes silent: takes no orders and fires at nothing", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const cy = cyborg(state, a, 60, 40);
    ticks(state, GRACE + 2);
    assert.equal(cy.shutdown, true);
    const x0 = cy.x;
    applyCommand(state, a, { type: "cmd.move", ids: [cy.id], x: cy.x + 80, y: cy.y });
    ticks(state, 30);
    assert.equal(cy.x, x0, "an order goes nowhere");
    assert.deepEqual(cy.waypoints, []);
    // An enemy rifleman right beside him draws no fire.
    const rifle = makeEntity(state, "rifleman", b, cy.x + ts * 3, cy.y);
    rifle.holdPosition = true;
    const rifleHp = rifle.hp;
    ticks(state, 40);
    assert.equal(rifle.hp, rifleHp);
    const seen = snapshotFor(state, b).entities.find((e) => e.id === cy.id);
    assert.equal(seen?.shutdown, true);
    assert.equal(seen?.ownerId, a, "the enemy sees him as yours");
  });

  it("is never picked by his own side, though the enemy may shoot him", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const cy = cyborg(state, a, 60, 40);
    ticks(state, GRACE + 2);
    assert.equal(cy.shutdown, true);
    const friend = makeEntity(state, "gunner", a, cy.x + ts * 3, cy.y);
    friend.holdPosition = true;
    const hp = cy.hp;
    ticks(state, 60);
    assert.equal(cy.hp, hp, "his own side holds fire");
    assert.notEqual(friend.attackTarget, cy.id);
    const foe = makeEntity(state, "gunner", b, cy.x - ts * 3, cy.y);
    foe.holdPosition = true;
    ticks(state, 100);
    assert.ok(cy.hp < hp, `the enemy fires on him (hp ${cy.hp})`);
  });

  it("darkens his thermal scanner, and lights it again once he is taken over", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const cy = cyborg(state, a, 60, 40);
    const blind = new Uint8Array(state.width * state.height);
    /** A fresh foe 6 tiles off his nose, read once and taken away again. */
    const heard = (): boolean => {
      cy.facing = 0;
      const foe = makeEntity(state, "rifleman", b, cy.x + 6 * ts, cy.y);
      const hit = thermalContacts(state, a, blind).some((c) => c.id === foe.id);
      destroyEntity(state, foe);
      return hit;
    };
    assert.equal(heard(), true);
    ticks(state, GRACE + 2);
    assert.equal(heard(), false, "a shut-down Cyborg reads nothing");
    const cmd = makeEntity(state, "cyborgcommander", a, cy.x - 2 * ts, cy.y);
    ticks(state, TAKEOVER + 2);
    assert.equal(cy.ownerId, a);
    destroyEntity(state, cmd);
    assert.equal(heard(), true, "his own scanner, not the Commander's");
  });

  it("lets a Cyborg Commander take over a shut-down Cyborg in reach, the enemy's too", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const theirs = cyborg(state, b, 60, 40);
    ticks(state, GRACE + 2);
    assert.equal(theirs.shutdown, true);
    const boss = makeEntity(state, "cyborgcommander", a, theirs.x - (CYBORG_TAKEOVER_RANGE_TILES - 2) * ts, theirs.y);
    ticks(state, 2);
    assert.equal(theirs.takeover?.by, boss.id);
    const view = snapshotFor(state, a).entities.find((e) => e.id === theirs.id);
    assert.ok(view?.takeover && view.takeover.by === boss.id && view.takeover.u > 0 && view.takeover.u < 1);
    ticks(state, TAKEOVER);
    assert.equal(theirs.ownerId, a);
    assert.equal(theirs.shutdown, undefined);
    assert.equal(theirs.takeover, undefined);
    // His Commander keeps him running.
    ticks(state, GRACE * 2);
    assert.equal(theirs.ownerId, a);
    assert.equal(theirs.shutdown, undefined);
  });

  it("takes them one at a time, and not from out of reach", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const near = cyborg(state, b, 60, 40);
    const next = cyborg(state, b, 60, 44);
    const far = cyborg(state, b, 60, 40 + CYBORG_TAKEOVER_RANGE_TILES + 30);
    ticks(state, GRACE + 2);
    const boss = makeEntity(state, "cyborgcommander", a, near.x - 2 * ts, near.y);
    ticks(state, 2);
    assert.equal(near.takeover?.by, boss.id);
    assert.equal(next.takeover, undefined, "one uplink at a time");
    ticks(state, TAKEOVER);
    assert.equal(near.ownerId, a);
    ticks(state, TAKEOVER + 2);
    assert.equal(next.ownerId, a);
    ticks(state, TAKEOVER * 3);
    assert.equal(far.shutdown, true, "out of reach stays dark");
    assert.equal(far.ownerId, b);
  });

  it("starts over when the Commander walks out of reach", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const cy = cyborg(state, b, 60, 40);
    ticks(state, GRACE + 2);
    const boss = makeEntity(state, "cyborgcommander", a, cy.x - 2 * ts, cy.y);
    ticks(state, Math.floor(TAKEOVER / 2));
    assert.ok((cy.takeover?.ticks ?? 0) > 0);
    boss.x = cy.x - (CYBORG_TAKEOVER_RANGE_TILES + 10) * ts;
    ticks(state, 1);
    assert.equal(cy.takeover, undefined);
    assert.equal(cy.ownerId, b);
  });

  it("wakes your dark Cyborgs up yours again once a new Central stands", () => {
    const { state, a } = match();
    const { hub } = central(state, a, 6, 6);
    const cy = cyborg(state, a, 60, 40);
    hub.hp = 0;
    ticks(state, GRACE + 2);
    assert.equal(cy.shutdown, true);
    assert.equal(cy.ownerId, a);
    ticks(state, GRACE * 3);
    assert.equal(cy.shutdown, true, "still dark while the link stays down");
    central(state, a, 20, 6);
    ticks(state, 1);
    assert.equal(cy.ownerId, a);
    assert.equal(cy.shutdown, undefined);
    // Linked again, he stays up.
    ticks(state, GRACE * 2);
    assert.equal(cy.ownerId, a);
  });

  it("wakes them once the power is back", () => {
    const { state, a } = match();
    const { dynamo } = central(state, a, 6, 6);
    const cy = cyborg(state, a, 60, 40);
    destroyEntity(state, dynamo);
    ticks(state, GRACE + 2);
    assert.equal(cy.shutdown, true);
    const ts = state.tileSize;
    makeEntity(state, "dynamo", a, tileCenter(20, ts), tileCenter(12, ts), { tileX: 20, tileY: 12 });
    ticks(state, 1);
    assert.equal(cy.ownerId, a);
    assert.equal(cy.shutdown, undefined);
  });

  it("does not take back a Cyborg an enemy Commander already took over", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const { hub } = central(state, a, 6, 6);
    const cy = cyborg(state, a, 60, 40);
    hub.hp = 0;
    ticks(state, GRACE + 2);
    makeEntity(state, "cyborgcommander", b, cy.x + 2 * ts, cy.y);
    ticks(state, TAKEOVER + 2);
    assert.equal(cy.ownerId, b);
    central(state, a, 20, 6);
    ticks(state, GRACE);
    assert.equal(cy.ownerId, b, "he is the enemy's for good");
  });

  it("wins him back mid-takeover when the link returns first", () => {
    const { state, a, b } = match();
    const ts = state.tileSize;
    const { hub } = central(state, a, 6, 6);
    const cy = cyborg(state, a, 60, 40);
    hub.hp = 0;
    ticks(state, GRACE + 2);
    makeEntity(state, "cyborgcommander", b, cy.x + 2 * ts, cy.y);
    ticks(state, Math.floor(TAKEOVER / 2));
    assert.ok(cy.takeover, "the enemy uplink is running");
    central(state, a, 20, 6);
    ticks(state, 1);
    assert.equal(cy.ownerId, a);
    assert.equal(cy.takeover, undefined);
    ticks(state, TAKEOVER * 2);
    assert.equal(cy.ownerId, a, "a linked Cyborg is not up for takeover");
  });
});
