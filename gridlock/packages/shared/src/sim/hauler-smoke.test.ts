import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import {
  TICK_DT,
  catalog,
  isCivilianType,
  HAULER_SMOKE_CHARGES,
  HAULER_SMOKE_COOLDOWN,
  HAULER_SMOKE_RELOAD,
  SMOKE_SECONDS,
} from "../catalog.js";
import { snapshotFor } from "./snapshot.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { tickAi } from "./ai.js";
import { adjacentToBuilding, destroyEntity, hqOf, makeEntity, tileCenter, worldToTile } from "./geo.js";
import { inSmokeCloud } from "./smoke.js";
import { createMatch, step } from "./match.js";
import type { MatchState, Projectile } from "./types.js";

function twoPlayerMatch(): { state: MatchState; a: string; b: string } {
  const r = createRoom({
    id: "HS1",
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
  return { state: createMatch(room, started.value, { startingUnits: false }), a: "A", b: "B" };
}

function clearCivilians(state: MatchState): void {
  for (const e of [...state.entities.values()]) {
    if (isCivilianType(e.type)) destroyEntity(state, e);
  }
}

function clearCover(state: MatchState): void {
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  clearCivilians(state);
}

function fireShell(
  state: MatchState,
  opts: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage?: number;
    penetration?: number;
    caliber?: number;
  },
): Projectile {
  const gun = catalog("warden");
  const p: Projectile = {
    id: state.nextId++,
    ownerId: "B",
    team: 2,
    x: opts.x,
    y: opts.y,
    vx: opts.vx,
    vy: opts.vy,
    damage: opts.damage ?? gun.damage,
    penetration: opts.penetration ?? gun.penetration,
    caliber: opts.caliber ?? gun.caliber,
    life: 1,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: opts.caliber != null && opts.caliber < 40 ? null : "ap",
  };
  state.projectiles.push(p);
  return p;
}

function placeHauler(state: MatchState, ownerId: string): ReturnType<typeof makeEntity> {
  const hq = hqOf(state, ownerId);
  assert.ok(hq, "HQ missing");
  const ts = state.tileSize;
  const hx = worldToTile(hq.x, ts);
  const hy = worldToTile(hq.y, ts);
  const hauler = makeEntity(state, "hauler", ownerId, tileCenter(hx + 48, ts), tileCenter(hy, ts));
  hauler.autoHarvest = false;
  hauler.facing = Math.PI;
  return hauler;
}

function waitSec(state: MatchState, sec: number): void {
  const n = Math.ceil(sec / TICK_DT) + 2;
  for (let i = 0; i < n; i++) step(state, TICK_DT);
}

function freshClouds(state: MatchState): number {
  return state.smokeClouds.filter((c) => c.life > SMOKE_SECONDS - TICK_DT * 3).length;
}

function shellFromWest(state: MatchState, hauler: { x: number; y: number; id: number }): Projectile {
  const speed = catalog("warden").projectileSpeed;
  const p = fireShell(state, {
    x: hauler.x - 16,
    y: hauler.y,
    vx: speed,
    vy: 0,
    damage: 22,
    penetration: 40,
    caliber: 75,
  });
  p.fromId = -1;
  return p;
}

describe("hauler smoke screen", () => {
  it("pops smoke and withdraws away from a heavy shell", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, "A");
    const x0 = hauler.x;
    const ts = state.tileSize;
    const shooter = makeEntity(state, "warden", "B", hauler.x - ts * 6, hauler.y);
    shooter.facing = 0;
    shooter.turretFacing = 0;
    const p = shellFromWest(state, hauler);
    p.fromId = shooter.id;
    step(state, TICK_DT);
    assert.ok(hauler.hp > 0, `hauler died hp=${hauler.hp}`);
    assert.ok(state.smokeClouds.length >= 1, "smoke missing");
    assert.equal(hauler.smokeCharges, HAULER_SMOKE_CHARGES - 1);
    const cloud = state.smokeClouds[0]!;
    assert.ok(Math.hypot(cloud.x - x0, cloud.y - hauler.y) < ts * 2, "cloud should be on the Mauler");
    const tx = worldToTile(hauler.x, ts);
    const ty = worldToTile(hauler.y, ts);
    assert.equal(inSmokeCloud(cloud, ts, tx, ty), true);
    assert.equal(hauler.returnToBase, true);
    assert.equal(hauler.autoHarvest, false);
    assert.equal(hauler.order?.kind, "withdraw");
    for (let i = 0; i < 24; i++) step(state, TICK_DT);
    assert.ok(hauler.x > x0 + ts * 4, `should flee east x=${hauler.x} from ${x0}`);
  });

  it("does not pop smoke for infantry fire", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, "A");
    const ts = state.tileSize;
    const shooter = makeEntity(state, "rifleman", "B", hauler.x - ts * 8, hauler.y);
    const p = fireShell(state, {
      x: hauler.x - 16,
      y: hauler.y,
      vx: catalog("rifleman").projectileSpeed,
      vy: 0,
      damage: catalog("rifleman").damage,
      penetration: catalog("rifleman").penetration,
      caliber: catalog("rifleman").caliber,
    });
    p.fromId = shooter.id;
    p.shell = null;
    step(state, TICK_DT);
    assert.equal(state.smokeClouds.length, 0);
    assert.equal(hauler.returnToBase, false);
    assert.notEqual(hauler.order?.kind, "withdraw");
  });

  it("returns to HQ and holds after the retreat", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, "A");
    const hq = hqOf(state, "A")!;
    const x0 = hauler.x;
    shellFromWest(state, hauler);
    let withdrew = false;
    let held = false;
    for (let i = 0; i < 400; i++) {
      step(state, TICK_DT);
      if (hauler.hp <= 0) break;
      if (hauler.x > x0 + state.tileSize * 3) withdrew = true;
      if (hauler.holdPosition && hauler.order == null) {
        held = true;
        break;
      }
    }
    assert.ok(hauler.hp > 0, `hauler died hp=${hauler.hp}`);
    assert.equal(withdrew, true, "never left the impact tile");
    assert.equal(held, true, `never held at base order=${hauler.order?.kind} x=${hauler.x}`);
    assert.equal(hauler.autoHarvest, false);
    assert.equal(hauler.returnToBase, true);
    const ts = state.tileSize;
    const nearHq =
      adjacentToBuilding(state, hauler, hq) ||
      Math.hypot(hauler.x - hq.x, hauler.y - hq.y) < ts * 8;
    assert.ok(nearHq, `ended far from HQ dx=${hauler.x - hq.x} dy=${hauler.y - hq.y}`);
    const xHold = hauler.x;
    for (let i = 0; i < 20; i++) step(state, TICK_DT);
    assert.ok(Math.abs(hauler.x - xHold) < ts, `left hold x=${hauler.x}`);
    assert.equal(hauler.autoHarvest, false);
  });

  it("does not stack a second screen while recharging", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, "A");
    assert.equal(hauler.smokeCharges, HAULER_SMOKE_CHARGES);
    shellFromWest(state, hauler);
    step(state, TICK_DT);
    assert.equal(state.smokeClouds.length, 1);
    assert.equal(hauler.smokeCharges, HAULER_SMOKE_CHARGES - 1);
    shellFromWest(state, hauler);
    step(state, TICK_DT);
    assert.equal(state.smokeClouds.length, 1);
    assert.equal(hauler.smokeCharges, HAULER_SMOKE_CHARGES - 1);
    assert.ok(hauler.specialCooldown > 0);
  });

  it("burns three screens then restocks after a long reload", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, "A");
    applyCommand(state, "A", { type: "cmd.hold", ids: [hauler.id], hold: true });
    assert.equal(hauler.smokeCharges, HAULER_SMOKE_CHARGES);

    const pop = (): number => {
      const before = freshClouds(state);
      shellFromWest(state, hauler);
      step(state, TICK_DT);
      return freshClouds(state) - before;
    };

    assert.equal(pop(), 1);
    assert.equal(hauler.smokeCharges, 2);
    waitSec(state, HAULER_SMOKE_COOLDOWN);

    assert.equal(pop(), 1);
    assert.equal(hauler.smokeCharges, 1);
    waitSec(state, HAULER_SMOKE_COOLDOWN);

    assert.equal(pop(), 1);
    assert.equal(hauler.smokeCharges, 0);
    assert.ok(hauler.specialCooldown > HAULER_SMOKE_COOLDOWN);
    assert.ok(
      Math.abs(hauler.specialCooldown - HAULER_SMOKE_RELOAD) < TICK_DT * 2,
      `reload clock ${hauler.specialCooldown}`,
    );

    waitSec(state, HAULER_SMOKE_COOLDOWN);
    assert.equal(pop(), 0);
    assert.equal(hauler.smokeCharges, 0);

    waitSec(state, hauler.specialCooldown);
    assert.equal(hauler.smokeCharges, HAULER_SMOKE_CHARGES);
    assert.equal(hauler.specialCooldown, 0);
    assert.equal(pop(), 1);
    assert.equal(hauler.smokeCharges, HAULER_SMOKE_CHARGES - 1);
  });

  it("puts allied smoke charges on the snapshot and hides them from the enemy", () => {
    const { state, a, b } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, a);
    const ts = state.tileSize;
    makeEntity(state, "rifleman", b, hauler.x + ts, hauler.y);
    const mine = snapshotFor(state, a).entities.find((e) => e.id === hauler.id);
    const theirs = snapshotFor(state, b).entities.find((e) => e.id === hauler.id);
    assert.equal(mine?.smokeCharges, HAULER_SMOKE_CHARGES);
    assert.ok(theirs, "enemy should see the Mauler");
    assert.equal(theirs?.smokeCharges, undefined);
  });

  it("pops smoke while holding but does not flee", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, "A");
    applyCommand(state, "A", { type: "cmd.hold", ids: [hauler.id], hold: true });
    const x0 = hauler.x;
    shellFromWest(state, hauler);
    for (let i = 0; i < 12; i++) step(state, TICK_DT);
    assert.ok(state.smokeClouds.length >= 1, "smoke missing");
    assert.equal(hauler.holdPosition, true);
    assert.notEqual(hauler.order?.kind, "withdraw");
    assert.ok(Math.abs(hauler.x - x0) < 6, `held Mauler fled x=${hauler.x}`);
  });

  it("drops a harvest job when the shell lands", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, "A");
    const ts = state.tileSize;
    const tx = worldToTile(hauler.x, ts) + 4;
    const ty = worldToTile(hauler.y, ts);
    applyCommand(state, "A", { type: "cmd.harvest", ids: [hauler.id], tileX: tx, tileY: ty });
    assert.equal(hauler.autoHarvest, true);
    shellFromWest(state, hauler);
    step(state, TICK_DT);
    assert.equal(hauler.autoHarvest, false);
    assert.equal(hauler.returnToBase, true);
    assert.equal(hauler.order?.kind, "withdraw");
  });
});

describe("easy CPU hauler shelter", () => {
  it("does not send a panicking Mauler back to harvest", () => {
    const { state } = twoPlayerMatch();
    clearCover(state);
    const hauler = placeHauler(state, "A");
    const p = state.players.get("A")!;
    p.ai = "easy";
    shellFromWest(state, hauler);
    step(state, TICK_DT);
    assert.equal(hauler.returnToBase, true);
    tickAi(state);
    assert.equal(hauler.autoHarvest, false);
    assert.ok(hauler.order?.kind === "withdraw" || hauler.order?.kind === "move");
  });
});
