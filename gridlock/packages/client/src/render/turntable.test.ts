import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TANK_FACE_DIRS } from "@gridlock/shared";
import { facingToIso } from "@gridlock/shared";
import {
  engineRowFromFacing,
  engineRowFromFrame,
  engineRowFromProjectedFacing,
  engineRowFromScreen,
  parseFrameIndex,
  pickTurntableUrls,
  TURNTABLE_DIRS,
  TURNTABLE_UNIQUE,
} from "./turntable.js";

describe("turntable frame names", () => {
  it("reads 0001.png through messy blender stems", () => {
    assert.equal(parseFrameIndex("0001.png"), 1);
    assert.equal(parseFrameIndex("/x/hull/0015.png"), 15);
    assert.equal(parseFrameIndex("test20013.png"), 20013);
    assert.equal(parseFrameIndex("readme.txt"), null);
  });

  it("places 0001 on world south and walks 22.5° clockwise onto 16 rows", () => {
    assert.equal(TURNTABLE_DIRS, TANK_FACE_DIRS);
    assert.equal(TURNTABLE_UNIQUE, 16);
    assert.equal(engineRowFromFrame(1), 0);
    assert.equal(engineRowFromFacing(Math.PI / 2), 0);
    assert.equal(engineRowFromFacing(-Math.PI / 2), 8);
    assert.equal(engineRowFromFacing(0), 12);
    assert.equal(engineRowFromFacing(Math.PI), 4);
    assert.equal(engineRowFromFrame(16), 15);
    const rows = new Set<number>();
    for (let f = 1; f <= TURNTABLE_DIRS; f++) rows.add(engineRowFromFrame(f));
    assert.equal(rows.size, TURNTABLE_DIRS);
  });

  it("keeps 0001–0016 unique and ignores a 0017 loop frame", () => {
    const glob: Record<string, string> = {};
    for (let n = 1; n <= 18; n++) {
      glob[`hull/${String(n).padStart(4, "0")}.png`] = `url-${n}`;
    }
    const urls = pickTurntableUrls(glob);
    assert.equal(urls.length, 16);
    assert.equal(urls[0], "url-1");
    assert.equal(urls[8], "url-9");
    assert.equal(urls[15], "url-16");
  });

  it("fails when a unique facing file is missing", () => {
    assert.throws(() => pickTurntableUrls({ "0001.png": "a" }), /0002/);
    const fifteen: Record<string, string> = {};
    for (let n = 1; n <= 15; n++) {
      fifteen[`hull/${String(n).padStart(4, "0")}.png`] = `url-${n}`;
    }
    assert.throws(() => pickTurntableUrls(fifteen), /0016/);
  });

  it("maps screen south to 0001 and screen east to 0013", () => {
    assert.equal(engineRowFromScreen(0, 1), 0);
    assert.equal(engineRowFromScreen(-1, 0), 4);
    assert.equal(engineRowFromScreen(0, -1), 8);
    assert.equal(engineRowFromScreen(1, 0), 12);
  });

  it("projects world east onto a down-right drop-in, not the right-facing file", () => {
    const east = facingToIso(0, 32);
    const row = engineRowFromProjectedFacing(0, 32);
    assert.equal(row, engineRowFromScreen(east.x, east.y));
    assert.notEqual(row, engineRowFromFacing(0));
    assert.ok(east.x > 0 && east.y > 0);
  });
});
