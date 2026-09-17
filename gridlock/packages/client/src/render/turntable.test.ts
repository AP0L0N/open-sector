import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dirFromFrame,
  engineRowFromFrame,
  parseFrameIndex,
  pickTurntableUrls,
  TURNTABLE_DIRS_FROM_SOUTH,
} from "./turntable.js";

describe("turntable frame names", () => {
  it("reads 0001.png through messy blender stems", () => {
    assert.equal(parseFrameIndex("0001.png"), 1);
    assert.equal(parseFrameIndex("/x/hull/0016.png"), 16);
    assert.equal(parseFrameIndex("test20013.png"), 20013);
    assert.equal(parseFrameIndex("readme.txt"), null);
  });

  it("maps 0001 to camera-south and walks clockwise onto engine rows", () => {
    assert.deepEqual(TURNTABLE_DIRS_FROM_SOUTH, [
      "S",
      "SSW",
      "SW",
      "WSW",
      "W",
      "WNW",
      "NW",
      "NNW",
      "N",
      "NNE",
      "NE",
      "ENE",
      "E",
      "ESE",
      "SE",
      "SSE",
    ]);
    assert.equal(dirFromFrame(1), "S");
    assert.equal(engineRowFromFrame(1), 4);
    assert.equal(dirFromFrame(5), "W");
    assert.equal(engineRowFromFrame(5), 8);
    assert.equal(dirFromFrame(9), "N");
    assert.equal(engineRowFromFrame(9), 12);
    assert.equal(dirFromFrame(13), "E");
    assert.equal(engineRowFromFrame(13), 0);
    assert.equal(dirFromFrame(15), "SE");
    assert.equal(engineRowFromFrame(17), engineRowFromFrame(1));
  });

  it("keeps 0001–0016 and ignores a 0017 loop frame", () => {
    const glob: Record<string, string> = {};
    for (let n = 1; n <= 17; n++) {
      glob[`hull/${String(n).padStart(4, "0")}.png`] = `url-${n}`;
    }
    const urls = pickTurntableUrls(glob);
    assert.equal(urls.length, 16);
    assert.equal(urls[0], "url-1");
    assert.equal(urls[15], "url-16");
  });

  it("fails when a facing file is missing", () => {
    assert.throws(() => pickTurntableUrls({ "0001.png": "a" }), /0002/);
  });
});
