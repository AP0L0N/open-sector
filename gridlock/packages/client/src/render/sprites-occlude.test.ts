import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildingAlphaOpaqueAt,
  buildingSpriteSrcAt,
  type BuildingAlphaMap,
} from "./building-hit.js";

describe("building sprite occlusion samples", () => {
  const pad = { padWidth: 8, padSouthX: 4, padSouthY: 7 };
  const southX = 100;
  const southY = 200;
  const footprintW = 8;

  it("maps the pad south corner onto itself at scale 1", () => {
    const p = buildingSpriteSrcAt(
      pad.padWidth,
      pad.padSouthX,
      pad.padSouthY,
      southX,
      southY,
      footprintW,
      southX,
      southY,
    );
    assert.equal(p.x, 4);
    assert.equal(p.y, 7);
  });

  it("maps a screen point left of south onto a smaller source x", () => {
    const p = buildingSpriteSrcAt(
      pad.padWidth,
      pad.padSouthX,
      pad.padSouthY,
      southX,
      southY,
      footprintW,
      southX - 3,
      southY - 2,
    );
    assert.equal(p.x, 1);
    assert.equal(p.y, 5);
  });

  it("hits opaque texels and misses empty canvas", () => {
    const map: BuildingAlphaMap = {
      w: 8,
      h: 8,
      toMap: 1,
      a: new Uint8Array(64),
    };
    map.a[3 * 8 + 4] = 255;
    assert.equal(buildingAlphaOpaqueAt(map, 4, 3), true);
    assert.equal(buildingAlphaOpaqueAt(map, 0, 0), false);
    assert.equal(buildingAlphaOpaqueAt(map, 7, 7), false);
  });

  it("does not treat a nearby empty pixel as a hit without radius", () => {
    const map: BuildingAlphaMap = {
      w: 8,
      h: 8,
      toMap: 1,
      a: new Uint8Array(64),
    };
    map.a[3 * 8 + 4] = 255;
    assert.equal(buildingAlphaOpaqueAt(map, 6, 3, 0), false);
    assert.equal(buildingAlphaOpaqueAt(map, 6, 3, 2), true);
  });
});
