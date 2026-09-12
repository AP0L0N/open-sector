import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAPS, TILE_BLOCKED, tileAt } from "./maps.js";

describe("maps", () => {
  it("ships two maps with 8 spawns", () => {
    assert.ok(MAPS["yard-64"]);
    assert.ok(MAPS["canal-48"]);
    for (const map of Object.values(MAPS)) {
      assert.equal(map.spawns.length, 8);
      assert.equal(map.tiles.length, map.width * map.height);
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
});
