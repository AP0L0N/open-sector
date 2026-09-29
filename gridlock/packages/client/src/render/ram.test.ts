import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ISO_ELEVATION, isoLift } from "@gridlock/shared";
import { CIWS_INTERCEPT_LIFT } from "./ciws.js";
import { RAM_FACE_REACH, RAM_LAUNCH_Z, interceptorTrail } from "./ram.js";

describe("interceptorTrail", () => {
  it("leaves the cell face laid on the burst and ends where the air burst is drawn", () => {
    const line = interceptorTrail({ x: 100, y: 100 }, { x: 200, y: 100 }, 2, 3);
    assert.ok(Math.abs(line.from.x - (100 + RAM_FACE_REACH)) < 1e-9);
    assert.ok(Math.abs(line.from.y - 100) < 1e-9);
    assert.equal(line.to.x, 200);
    assert.equal(line.to.y, 100);
    // The burst sprite is drawn CIWS_INTERCEPT_LIFT screen px above its ground.
    assert.ok(Math.abs(isoLift(line.to.z) - isoLift(3) - CIWS_INTERCEPT_LIFT) < 1e-9);
    assert.ok(Math.abs(line.from.z - (2 + RAM_LAUNCH_Z / ISO_ELEVATION)) < 1e-9);
  });

  it("turns with the bearing to the burst", () => {
    const line = interceptorTrail({ x: 0, y: 0 }, { x: 0, y: -50 }, 0, 0);
    assert.ok(Math.abs(line.from.x) < 1e-9);
    assert.ok(Math.abs(line.from.y + RAM_FACE_REACH) < 1e-9);
  });
});

describe("RAM sheet metrics", () => {
  it("match the renderer's output", () => {
    const meta = JSON.parse(readFileSync(new URL("../assets/buildings/ram.json", import.meta.url), "utf8"));
    assert.equal(meta.rows, 16);
    assert.equal(meta.faceReach, RAM_FACE_REACH);
    assert.equal(meta.launchZ, RAM_LAUNCH_Z);
    // Same pad as the CIWS, so sprites.ts can share its BuildingSpriteDef numbers.
    const ciws = JSON.parse(readFileSync(new URL("../assets/buildings/ciws.json", import.meta.url), "utf8"));
    for (const k of ["padWidth", "padSouthX", "padSouthY", "stackX", "stackY"]) assert.equal(meta[k], ciws[k], k);
    assert.deepEqual(meta.cell, ciws.cell);
  });
});
