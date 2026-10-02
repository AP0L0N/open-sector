import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAPS, TILE_EMPTY, TILE_ROAD, TILE_ROCK, TILE_WATER, catalog, tileAt } from "@gridlock/shared";
import { decorFor, placeDecor } from "./decor.js";

describe("map dress", () => {
  const yard = MAPS["yard-64"]!;

  it("places the same layout every time", () => {
    assert.deepEqual(placeDecor(yard), placeDecor(yard));
    assert.equal(decorFor(yard), decorFor(yard));
  });

  it("dresses Scrap Yard with every kind", () => {
    const kinds = new Map<string, number>();
    for (const it of placeDecor(yard)) kinds.set(it.kind, (kinds.get(it.kind) ?? 0) + 1);
    for (const k of ["bush", "sign", "boulder", "stones", "stump", "crater"]) {
      assert.ok((kinds.get(k) ?? 0) > 0, `no ${k}`);
    }
    assert.ok((kinds.get("bush") ?? 0) > 60, `bushes ${kinds.get("bush")}`);
  });

  it("keeps off water, roads, spawn pads, and houses", () => {
    for (const map of Object.values(MAPS)) {
      for (const it of placeDecor(map)) {
        const t = tileAt(map, it.tx, it.ty);
        assert.notEqual(t, TILE_WATER, `${it.kind} in water at ${it.tx},${it.ty}`);
        assert.notEqual(t, TILE_ROAD, `${it.kind} on a road at ${it.tx},${it.ty}`);
        if (it.kind === "boulder") assert.ok(t === TILE_EMPTY || t === TILE_ROCK);
        else assert.equal(t, TILE_EMPTY, `${it.kind} on tile ${t}`);
        for (const s of map.spawns) {
          assert.ok(Math.hypot(it.tx - s.x, it.ty - s.y) > 16, `${it.kind} on spawn ${s.id}`);
        }
        for (const f of map.features) {
          const def = catalog(f.type);
          const inside = it.tx >= f.x && it.tx < f.x + def.tileW && it.ty >= f.y && it.ty < f.y + def.tileH;
          assert.ok(!inside, `${it.kind} inside a ${f.type}`);
        }
      }
    }
  });

  it("stands signposts on the verge of a road", () => {
    const signs = placeDecor(yard).filter((it) => it.kind === "sign");
    assert.ok(signs.length >= 3, `signs ${signs.length}`);
    for (const it of signs) {
      let road = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (tileAt(yard, it.tx + dx, it.ty + dy) === TILE_ROAD) road = true;
        }
      }
      assert.ok(road, `sign at ${it.tx},${it.ty} is not by a road`);
    }
  });

  it("piles boulders on the rocky slopes", () => {
    const onRock = placeDecor(yard).filter((it) => it.kind === "boulder" && tileAt(yard, it.tx, it.ty) === TILE_ROCK);
    assert.ok(onRock.length >= 3, `boulders on rock ${onRock.length}`);
  });

  it("splits standing props from flat ones baked in the ground", () => {
    const layout = decorFor(yard);
    assert.ok(layout.standing.every((it) => it.standing));
    let flat = 0;
    for (const list of layout.flatAt.values()) {
      for (const it of list) {
        assert.ok(!it.standing && (it.kind === "crater" || it.kind === "stones" || it.kind === "boulder"));
        flat++;
      }
    }
    assert.equal(flat + layout.standing.length, layout.items.length);
  });

  it("bakes boulders into the ground so units and structures always draw over them", () => {
    for (const map of Object.values(MAPS)) {
      const boulders = placeDecor(map).filter((it) => it.kind === "boulder");
      assert.ok(boulders.length > 0, `${map.id} boulders`);
      for (const it of boulders) {
        assert.equal(it.standing, false, `${map.id} boulder at ${it.tx},${it.ty} stands`);
        assert.ok(it.drawH <= 10, `${map.id} boulder drawH ${it.drawH}`);
      }
    }
  });
});
