import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLUTTER_HP, MORTAR, RIFLE, TICK_DT, TILE_SUBDIV } from "../catalog.js";
import { encodeRuns, validateCustomMap } from "../custom-maps.js";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { featureBox, getMap, isMapSection, SPAWN_PAD_R, TILE_EMPTY, TILE_WATER, type MapClutter } from "../maps.js";
import { blastClutter, hitClutter } from "./clutter.js";
import { tickCollision } from "./collision.js";
import { tickProjectiles } from "./combat.js";
import { destroyEntity, makeEntity } from "./geo.js";
import { createMatch } from "./match.js";
import { exportSave, restoreMatch } from "./save.js";
import { snapshotFor } from "./snapshot.js";
import type { MatchState, Projectile } from "./types.js";

function match() {
  const r = createRoom({ id: "CL", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  for (const e of [...state.entities.values()]) if (e.kind === "unit") destroyEntity(state, e);
  return { state, room };
}

function pieces(): readonly MapClutter[] {
  return getMap("yard-64")?.clutter ?? [];
}

function at(state: MatchState, c: MapClutter): { x: number; y: number } {
  return { x: (c.x + 0.5) * state.tileSize, y: (c.y + 0.5) * state.tileSize };
}

function lob(state: MatchState, x: number, y: number): Projectile {
  const p: Projectile = {
    id: state.nextId++,
    ownerId: "A",
    team: 1,
    x,
    y,
    vx: 40,
    vy: 0,
    damage: MORTAR.damage,
    penetration: MORTAR.penetration,
    caliber: MORTAR.caliber,
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
    z: 4,
  };
  state.projectiles.push(p);
  return p;
}

describe("map clutter", () => {
  it("dresses the Scrap Yard on open ground, off start pads and building lots", () => {
    const map = getMap("yard-64");
    assert.ok(map);
    const list = pieces();
    const count = list.length;
    assert.ok(count >= 30, `only ${count} pieces`);
    for (const c of list) {
      assert.equal(map.tiles[c.y * map.width + c.x], TILE_EMPTY);
      for (const s of map.spawns) assert.ok(Math.hypot(s.x - c.x, s.y - c.y) >= SPAWN_PAD_R, "on a start pad");
      for (const f of map.features) {
        if (isMapSection(f.type)) continue;
        const b = featureBox(f);
        assert.ok(!(c.x >= b.x0 && c.x < b.x1 && c.y >= b.y0 && c.y < b.y1), "inside a lot");
      }
    }
    const { state } = match();
    assert.deepEqual(
      state.clutterHp,
      list.map((c) => CLUTTER_HP[c.type]),
    );
    assert.equal(snapshotFor(state, "A").brokenClutter, undefined);
  });

  it("is rolled flat by a moving tank, not by one parked on it or by a man walking", () => {
    const { state } = match();
    const c = pieces()[0]!;
    const p = at(state, c);
    const walker = makeEntity(state, "rifleman", "A", p.x, p.y);
    walker.waypoints = [{ x: p.x + 40, y: p.y }];
    walker.state = "move";
    tickCollision(state, TICK_DT);
    assert.ok(state.clutterHp[0]! > 0, "infantry broke it");
    destroyEntity(state, walker);
    const tank = makeEntity(state, "warden", "A", p.x, p.y);
    tickCollision(state, TICK_DT);
    assert.ok(state.clutterHp[0]! > 0, "a parked tank broke it");
    tank.waypoints = [{ x: p.x + 40, y: p.y }];
    tank.state = "move";
    tickCollision(state, TICK_DT);
    assert.equal(state.clutterHp[0], 0);
    assert.deepEqual(snapshotFor(state, "B").brokenClutter, [0]);
  });

  it("breaks under a mortar round and wears down under rifle fire", () => {
    const { state } = match();
    const list = pieces();
    const p = at(state, list[1]!);
    lob(state, p.x, p.y);
    tickProjectiles(state, TICK_DT);
    assert.equal(state.clutterHp[1], 0);

    const q = at(state, list[2]!);
    const full = state.clutterHp[2]!;
    hitClutter(state, q.x, q.y, RIFLE.caliber, RIFLE.damage);
    assert.equal(state.clutterHp[2], full - RIFLE.damage);
    for (let i = 0; i < 50 && state.clutterHp[2]! > 0; i++) hitClutter(state, q.x, q.y, RIFLE.caliber, RIFLE.damage);
    assert.equal(state.clutterHp[2], 0);
    // A round that lands two tiles off leaves it be.
    const r = at(state, list[3]!);
    hitClutter(state, r.x + state.tileSize * 2, r.y, RIFLE.caliber, RIFLE.damage);
    assert.equal(state.clutterHp[3], CLUTTER_HP[list[3]!.type]);
    blastClutter(state, r.x + state.tileSize * 2, r.y, state.tileSize * 2);
    assert.equal(state.clutterHp[3], 0);
  });

  it("stays broken through a save", () => {
    const { state, room } = match();
    state.clutterHp[4] = 0;
    state.clutterHp[5] = 7;
    const back = restoreMatch(exportSave(state, room, 1_700_000_000_000), { roomId: "CL2", humanPlayerId: "A" });
    assert.equal(back.ok, true);
    if (!back.ok) return;
    assert.deepEqual(back.value.state.clutterHp, state.clutterHp);
  });

  it("is kept by a builder map, minus a piece standing in water", () => {
    const side = 48 * TILE_SUBDIV;
    const tiles = new Array<number>(side * side).fill(TILE_EMPTY);
    tiles[50 * side + 50] = TILE_WATER;
    const spec = {
      id: "c-cluttert1",
      name: "Clutter",
      author: "t",
      width: side,
      height: side,
      maxPlayers: 2,
      tiles: encodeRuns(tiles),
      heights: encodeRuns(new Array<number>(side * side).fill(0)),
      spawns: [
        { id: 1, x: 20, y: 20 },
        { id: 2, x: side - 20, y: side - 20 },
      ],
      features: [],
      clutter: [
        { type: "crates", x: 80, y: 90 },
        { type: "cart", x: 50, y: 50 },
      ],
      updatedAt: 0,
    };
    const out = validateCustomMap(spec);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.deepEqual(out.spec.clutter, [{ type: "crates", x: 80, y: 90 }]);
    assert.equal(validateCustomMap({ ...spec, clutter: [{ type: "piano", x: 1, y: 1 }] }).ok, false);
  });
});
