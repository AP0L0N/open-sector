import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEIGHT_MAX, HEIGHT_STEP_MAX } from "./catalog.js";
import { MAPS, TILE_BLOCKED, heightAt, maxHeightOf, tileAt } from "./maps.js";

describe("maps", () => {
  it("ships two maps with 8 spawns", () => {
    assert.ok(MAPS["yard-64"]);
    assert.ok(MAPS["canal-48"]);
    for (const map of Object.values(MAPS)) {
      assert.equal(map.spawns.length, 8);
      assert.equal(map.tiles.length, map.width * map.height);
      assert.equal(map.heights.length, map.width * map.height);
      for (const s of map.spawns) {
        assert.equal(tileAt(map, s.x, s.y), 0, `${map.id} spawn ${s.id} blocked`);
      }
    }
  });

  it("canal has a blocked strip with bridge gaps", () => {
    const canal = MAPS["canal-48"]!;
    assert.equal(tileAt(canal, 0, 23), TILE_BLOCKED);
    assert.equal(tileAt(canal, 11, 23), 0);
  });

  it("keeps the canal flat", () => {
    const canal = MAPS["canal-48"]!;
    assert.equal(maxHeightOf(canal), 0);
  });

  it("scatters walkable hills on the yard without cliffing spawns", () => {
    const yard = MAPS["yard-64"]!;
    assert.ok(maxHeightOf(yard) >= 2);
    assert.ok(maxHeightOf(yard) <= HEIGHT_MAX);
    let raised = 0;
    for (let y = 0; y < yard.height; y++) {
      for (let x = 0; x < yard.width; x++) {
        const h = heightAt(yard, x, y);
        if (h > 0) raised++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= yard.width || ny >= yard.height) continue;
            const n = heightAt(yard, nx, ny);
            assert.ok(Math.abs(h - n) <= HEIGHT_STEP_MAX, `cliff ${x},${y} vs ${nx},${ny}`);
          }
        }
      }
    }
    assert.ok(raised > yard.width * yard.height * 0.08);
    for (const s of yard.spawns) {
      assert.equal(heightAt(yard, s.x, s.y), 0, `spawn ${s.id} on a slope`);
    }
  });
});
