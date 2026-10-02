import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { garrisonWindowLift, ISO_ELEVATION, pickGarrisonMuzzle } from "@gridlock/shared";
import {
  backtrackPoints,
  claimsShot,
  flameLaunchPoint,
  garrisonFlameNozzle,
  garrisonHeadPoint,
  garrisonMouthLift,
  garrisonMouthPoint,
  HULL_MOUTH_LIFT,
  HULL_MOUTH_OUT,
  MOUTH_LIFT_FADE,
  type ShotHost,
} from "./garrison-shot.js";

const mammoth: ShotHost = {
  id: 2,
  kind: "unit",
  type: "mammoth",
  x: 100,
  y: 50,
  radius: 17,
  tileX: 0,
  tileY: 0,
  tileW: 1,
  tileH: 1,
};

const bunker: ShotHost = {
  id: 1,
  kind: "building",
  type: "bunker",
  x: 40,
  y: 40,
  radius: 0,
  tileX: 2,
  tileY: 2,
  tileW: 3,
  tileH: 3,
};

describe("garrison shot aperture", () => {
  it("puts a hull mouth past the drawn plate, toward the aim", () => {
    const mouth = garrisonMouthPoint(mammoth, 200, 50, 8, 1);
    assert.ok(Math.abs(mouth.x - (100 + 17 + HULL_MOUTH_OUT)) < 1e-6);
    assert.ok(Math.abs(mouth.y - 50) < 1e-6);
    assert.equal(garrisonMouthLift(mammoth, 1), HULL_MOUTH_LIFT);
  });

  it("puts a building mouth on the sim window, just outside the wall", () => {
    const ts = 8;
    const salt = 3;
    const mouth = garrisonMouthPoint(bunker, 400, 40, ts, salt);
    const w = pickGarrisonMuzzle(bunker as never, ts, 0, salt);
    assert.equal(w.face, "e");
    assert.equal(mouth.x, w.x + 4);
    assert.equal(mouth.y, w.y);
    assert.equal(garrisonMouthLift(bunker, salt), garrisonWindowLift("bunker", salt));
  });

  it("holds the rocket on the mouth until the sim point clears it, then fades the deck lift", () => {
    const mouth = { x: 100 + 17 + HULL_MOUTH_OUT, y: 50 };
    const inside = garrisonHeadPoint({
      host: mammoth,
      sim: { x: 100 + 17 + 4, y: 50, z: 3 },
      mouth,
      mouthLiftPx: HULL_MOUTH_LIFT,
      simLiftPx: 7,
    });
    assert.equal(inside.x, mouth.x);
    assert.equal(inside.y, mouth.y);
    assert.ok(Math.abs(inside.z - (3 + (HULL_MOUTH_LIFT - 7) / ISO_ELEVATION)) < 1e-6);

    const mid = garrisonHeadPoint({
      host: mammoth,
      sim: { x: mouth.x + MOUTH_LIFT_FADE / 2, y: 50, z: 3 },
      mouth,
      mouthLiftPx: HULL_MOUTH_LIFT,
      simLiftPx: 7,
    });
    assert.equal(mid.x, mouth.x + MOUTH_LIFT_FADE / 2);
    assert.ok(Math.abs(mid.z - (3 + (HULL_MOUTH_LIFT - 7) / 2 / ISO_ELEVATION)) < 1e-6);

    const far = garrisonHeadPoint({
      host: mammoth,
      sim: { x: mouth.x + MOUTH_LIFT_FADE + 10, y: 50, z: 3 },
      mouth,
      mouthLiftPx: HULL_MOUTH_LIFT,
      simLiftPx: 7,
    });
    assert.equal(far.z, 3);
  });

  it("aims a garrison flame from the aperture at window or deck height", () => {
    const land = { x: 220, y: 50 };
    const nozzle = garrisonFlameNozzle(mammoth, land, 8, 4);
    assert.equal(nozzle.h, HULL_MOUTH_LIFT);
    assert.ok(nozzle.x > mammoth.x + mammoth.radius);

    const house = garrisonFlameNozzle(bunker, { x: 400, y: 40 }, 8, 2);
    assert.equal(house.h, garrisonWindowLift("bunker", 2));
    assert.ok(house.x > bunker.tileX * 8 + bunker.tileW * 8);
  });

  it("walks a hidden shooter's launch back along the shot", () => {
    const launch = flameLaunchPoint({ x: 100, y: 40, vx: 10, vy: 0, arc: 0.5, hang: 0.4 });
    assert.equal(launch.x, 98);
    assert.equal(launch.y, 40);
    const pts = backtrackPoints(launch, 10, 0);
    assert.equal(pts[0]?.x, 98);
    assert.equal(pts[1]?.x, 82);
    assert.equal(pts[1]?.y, 40);
    assert.equal(claimsShot(mammoth, { x: mammoth.x + 21, y: mammoth.y }, 8), true);
    assert.equal(claimsShot(mammoth, { x: mammoth.x + 400, y: mammoth.y }, 8), false);
  });
});
