import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEIGHT_BASE, TILE_SUBDIV, catalog, type MapDef } from "@gridlock/shared";
import { guardReach } from "./guard-reach.js";

const W = 80;
const TS = 16;

function flatMap(): MapDef {
  return {
    id: "t",
    name: "t",
    width: W,
    height: W,
    tileSize: TS,
    spawns: [],
    tiles: new Array(W * W).fill(0),
    heights: new Array(W * W).fill(HEIGHT_BASE),
    maxHeight: HEIGHT_BASE + TILE_SUBDIV * 2,
    features: [],
  };
}

function raise(map: MapDef, x0: number, y0: number, x1: number, y1: number, h: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) map.heights[y * W + x] = h;
}

const at = (t: number) => t * TS + TS / 2;
const seen = () => new Uint8Array(W * W).fill(1);
const rifle = [{ type: "rifleman" as const }];

describe("guard reach at the pointer", () => {
  it("uses flat reach on the plain", () => {
    const r = guardReach(flatMap(), seen(), rifle, at(10), at(40), 0, 0.3, 4);
    assert.equal(r.known, true);
    assert.equal(r.rangeWorld, catalog("rifleman").rangeTiles * TS);
    assert.equal(r.bonusCells, 0);
    for (const ray of r.rays) assert.equal(ray, r.rangeWorld);
  });

  it("reaches further when the pointer is on a hill", () => {
    const map = flatMap();
    raise(map, 5, 35, 15, 45, HEIGHT_BASE + TILE_SUBDIV);
    const flat = guardReach(map, seen(), rifle, at(30), at(40), 0, 0.3, 4);
    const hill = guardReach(map, seen(), rifle, at(10), at(40), 0, 0.3, 4);
    assert.ok(hill.rangeWorld > flat.rangeWorld, `${hill.rangeWorld} vs ${flat.rangeWorld}`);
    assert.ok(hill.bonusCells > 0);
  });

  it("ignores the height of unexplored ground", () => {
    const map = flatMap();
    raise(map, 5, 35, 15, 45, HEIGHT_BASE + TILE_SUBDIV);
    const fog = new Uint8Array(W * W);
    const r = guardReach(map, fog, rifle, at(10), at(40), 0, 0.3, 4);
    assert.equal(r.known, false);
    assert.equal(r.elev, HEIGHT_BASE);
    assert.equal(r.bonusCells, 0);
  });

  it("cuts the cone behind an explored ridge but not a fogged one", () => {
    const map = flatMap();
    raise(map, 16, 30, 17, 50, HEIGHT_BASE + TILE_SUBDIV * 2);
    const open = seen();
    const cut = guardReach(map, open, rifle, at(10), at(40), 0, 0.2, 4);
    for (const ray of cut.rays) assert.ok(ray < cut.rangeWorld, `ray ${ray}`);

    const fog = seen();
    for (let y = 30; y <= 50; y++) for (let x = 16; x <= 17; x++) fog[y * W + x] = 0;
    const hidden = guardReach(map, fog, rifle, at(10), at(40), 0, 0.2, 4);
    for (const ray of hidden.rays) assert.equal(ray, hidden.rangeWorld);
  });

  it("gives an unarmed selection no reach", () => {
    const r = guardReach(flatMap(), seen(), [{ type: "hauler" }], at(10), at(40), 0, 0.3, 4);
    assert.equal(r.rangeWorld, 0);
    assert.equal(r.rays.length, 0);
  });
});
