import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CIWS_ROWS, ciwsMuzzleLift, ciwsTurretCell, ciwsTurretRow } from "./ciws.js";

const TS = 8;

describe("ciwsTurretRow", () => {
  it("draws the south row for a gun pointed at screen-down, then turns clockwise", () => {
    // World south-east projects straight down the 2:1 screen.
    assert.equal(ciwsTurretRow(Math.PI / 4, TS), 0);
    // World north-west points straight up: the back row.
    assert.equal(ciwsTurretRow((-3 * Math.PI) / 4, TS), 8);
    // World south-west is screen-left (row 4); world north-east is screen-right (row 12).
    assert.equal(ciwsTurretRow((3 * Math.PI) / 4, TS), 4);
    assert.equal(ciwsTurretRow(-Math.PI / 4, TS), 12);
  });

  it("covers all sixteen rows on a full turn", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 64; i++) seen.add(ciwsTurretRow((i / 64) * Math.PI * 2, TS));
    assert.equal(seen.size, CIWS_ROWS);
  });
});

describe("ciwsTurretCell", () => {
  it("slices the sheet into rows the size of the base image", () => {
    assert.deepEqual(ciwsTurretCell(252, 216 * 16, 3), { sx: 0, sy: 648, sw: 252, sh: 216 });
    assert.equal(ciwsTurretCell(252, 216 * 16, 17).sy, 216);
  });
});

describe("ciwsMuzzleLift", () => {
  it("scales with the drawn sprite", () => {
    assert.ok(ciwsMuzzleLift(1) > ciwsMuzzleLift(0.5));
    assert.ok(Math.abs(ciwsMuzzleLift(1) - 27.6) < 1e-9);
  });
});
