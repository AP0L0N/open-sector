import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTILLERY_SHELL,
  MORTAR,
  MORTAR_SPLASH_TILES,
  TICK_DT,
  WRECK_BLAST_MUL,
  catalog,
  leavesWreck,
  wreckHpOf,
  type EntityType,
} from "../catalog.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { tickProjectiles } from "./combat.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { blastWrecks } from "./wreck.js";
import type { Entity, MatchState, Projectile } from "./types.js";

function match(): MatchState {
  const r = createRoom({ id: "WR", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  for (const e of [...state.entities.values()]) if (e.kind === "unit") destroyEntity(state, e);
  return state;
}

function hulk(state: MatchState, type: EntityType, tx: number, ty: number): Entity {
  const ts = state.tileSize;
  const e = makeEntity(state, type, "B", tileCenter(tx, ts), tileCenter(ty, ts));
  e.hp = 0;
  step(state, TICK_DT);
  assert.equal(e.wreck, true);
  return e;
}

function lob(state: MatchState, owner: string, x: number, y: number, big = false): Projectile {
  const p: Projectile = {
    id: state.nextId++,
    ownerId: owner,
    team: 1,
    x,
    y,
    vx: 40,
    vy: 0,
    damage: big ? ARTILLERY_SHELL.damage : MORTAR.damage,
    penetration: big ? ARTILLERY_SHELL.penetration : MORTAR.penetration,
    caliber: big ? ARTILLERY_SHELL.caliber : MORTAR.caliber,
    life: 0.01,
    ignoreId: -1,
    fromId: -1,
    bounced: false,
    shell: null,
    flight: "mortar",
    landX: x,
    landY: y,
    apex: 20,
    flightTime: 1,
    big: big || undefined,
    z: 4,
  };
  state.projectiles.push(p);
  return p;
}

describe("wrecks", () => {
  it("are light enough that one tank shell clears a medium hulk and two the heaviest", () => {
    const shell = catalog("warden").damage;
    for (const t of ["warden", "ss3", "walker", "supply", "nebelwerfer", "hauler", "stuka", "fw190"] as const) {
      assert.ok(wreckHpOf(t) <= shell, `${t} wreck ${wreckHpOf(t)} vs shell ${shell}`);
    }
    for (const t of ["apocalypse", "jagdtiger", "titan", "mammoth", "bv222"] as const) {
      assert.ok(leavesWreck(t) || catalog(t).aircraft, t);
      assert.ok(wreckHpOf(t) <= shell * 2, `${t} wreck ${wreckHpOf(t)} vs two shells ${shell * 2}`);
      assert.ok(wreckHpOf(t) < catalog(t).hp * 0.4, `${t} wreck is a fraction of the hull`);
    }
  });

  it("a mortar burst on a hulk tears it, even the firing side's own", () => {
    const state = match();
    const e = hulk(state, "warden", 30, 24);
    const before = e.hp;
    lob(state, "B", e.x, e.y);
    tickProjectiles(state, TICK_DT);
    assert.equal(e.hp, before - Math.round(MORTAR.damage * WRECK_BLAST_MUL));
  });

  it("a burst beyond its splash leaves the hulk alone", () => {
    const state = match();
    const e = hulk(state, "warden", 30, 24);
    const before = e.hp;
    const far = (MORTAR_SPLASH_TILES + 1) * state.tileSize + e.radius;
    lob(state, "A", e.x + far, e.y);
    tickProjectiles(state, TICK_DT);
    assert.equal(e.hp, before);
  });

  it("an artillery shell levels a hulk and clears the ground under it", () => {
    const state = match();
    const e = hulk(state, "jagdtiger", 30, 24);
    lob(state, "A", e.x, e.y, true);
    tickProjectiles(state, TICK_DT);
    assert.equal(e.hp, 0);
    step(state, TICK_DT);
    assert.equal(state.entities.has(e.id), false);
    assert.equal(state.wreckBlock.some((v) => v !== 0), false);
  });

  it("blastWrecks does not touch living hulls", () => {
    const state = match();
    const ts = state.tileSize;
    const live = makeEntity(state, "warden", "A", tileCenter(30, ts), tileCenter(24, ts));
    const hp = live.hp;
    blastWrecks(state, live.x, live.y, 3 * ts, 200);
    assert.equal(live.hp, hp);
  });
});
