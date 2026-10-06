import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALLY_LINE_MARGIN, BATTLESHIP_HALF_LENGTH, PROJECTILE_RADIUS } from "../catalog.js";
import { buildSpatial, queryCircle, querySegment, relocate } from "./spatial.js";
import type { Entity, MatchState } from "./types.js";

const PAD = PROJECTILE_RADIUS + ALLY_LINE_MARGIN;

function body(partial: Pick<Entity, "id" | "x" | "y"> & Partial<Entity>): Entity {
  return {
    kind: "unit",
    type: "rifleman",
    hp: 10,
    radius: 8,
    facing: 0,
    garrisonedIn: null,
    tileX: 0,
    tileY: 0,
    tileW: 1,
    tileH: 1,
    ...partial,
  } as Entity;
}

function field(list: Entity[], tileSize = 8, width = 128, height = 128): MatchState {
  const entities = new Map<number, Entity>();
  for (const e of list) entities.set(e.id, e);
  return { width, height, tileSize, entities } as MatchState;
}

describe("spatial grid", () => {
  it("returns every center inside the circle, in entity-id order", () => {
    const origin = body({ id: 1, x: 400, y: 400, radius: 8 });
    const close = body({ id: 4, x: 460, y: 420, radius: 8 });
    const edge = body({ id: 2, x: 400, y: 500, radius: 8 });
    const far = body({ id: 3, x: 900, y: 400, radius: 8 });
    const dead = body({ id: 5, x: 410, y: 410, hp: 0 });
    const inside = body({ id: 6, x: 420, y: 390, garrisonedIn: 99 });
    const grid = buildSpatial(field([origin, close, edge, far, dead, inside]));
    const hit = queryCircle(grid, 400, 400, 100);
    assert.deepEqual(hit.map((e) => e.id), [1, 2, 4]);
    const again = queryCircle(grid, 900, 400, 30);
    assert.deepEqual(again.map((e) => e.id), [3]);
  });

  it("finds a body the segment grazes and skips one it does not", () => {
    const onLine = body({ id: 2, x: 200, y: 200, radius: 8 });
    const beside = body({ id: 1, x: 210, y: 200, radius: 8 });
    const away = body({ id: 3, x: 200 + 80, y: 200, radius: 8 });
    const grid = buildSpatial(field([away, onLine, beside]));
    const hit = querySegment(grid, 200, 80, 200, 320);
    assert.deepEqual(hit.map((e) => e.id), [1, 2]);
    assert.ok(Math.hypot(beside.x - 200, 0) <= beside.radius + PAD);
    assert.ok(Math.hypot(away.x - 200, 0) > away.radius + PAD + grid.cell);
  });

  it("visits the cells beside a corner a diagonal passes through", () => {
    // Line y = x crosses the cell corner at (64, 64). The body sits only in the east cell.
    const grazed = body({ id: 7, x: 96, y: 32, radius: 4 });
    const grid = buildSpatial(field([grazed]));
    const hit = querySegment(grid, 32, 32, 96, 96);
    assert.deepEqual(hit.map((e) => e.id), [7]);
  });

  it("finds a building by its footprint and a battleship by its bow", () => {
    const house = body({
      id: 1,
      kind: "building",
      type: "house",
      x: 2000,
      y: 2000,
      tileX: 10,
      tileY: 10,
      tileW: 6,
      tileH: 4,
      radius: 8,
    });
    const ship = body({
      id: 2,
      type: "battleship",
      x: 400,
      y: 400,
      facing: 0,
      radius: 48,
    });
    const grid = buildSpatial(field([house, ship]));
    const throughHouse = querySegment(grid, 100, 70, 100, 120);
    assert.deepEqual(throughHouse.map((e) => e.id), [1]);
    const bowX = 400 + BATTLESHIP_HALF_LENGTH;
    const throughBow = querySegment(grid, bowX, 360, bowX, 440);
    assert.deepEqual(throughBow.map((e) => e.id), [2]);
    const missCenter = Math.hypot(bowX - ship.x, 0);
    assert.ok(missCenter > ship.radius);
  });

  it("relocate follows a shove into the new cell", () => {
    const e = body({ id: 1, x: 40, y: 40, radius: 8 });
    const grid = buildSpatial(field([e]));
    assert.deepEqual(queryCircle(grid, 40, 40, 20).map((u) => u.id), [1]);
    e.x = 700;
    e.y = 680;
    relocate(grid, e);
    assert.deepEqual(queryCircle(grid, 40, 40, 20).map((u) => u.id), []);
    assert.deepEqual(queryCircle(grid, 700, 680, 20).map((u) => u.id), [1]);
    e.hp = 0;
    relocate(grid, e);
    assert.deepEqual(queryCircle(grid, 700, 680, 20).map((u) => u.id), []);
  });
});
