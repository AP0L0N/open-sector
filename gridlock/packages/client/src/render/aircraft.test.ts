import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoLift, type EntityView } from "@gridlock/shared";
import { AIR_DRAW_LAYER, aircraftShadowScale, airLiftPx, inAir, lerpAirAlt } from "./aircraft.js";
import { STANDING_DRAW_LAYER } from "./corpse-depth.js";

function plane(alt: number): EntityView {
  return {
    id: 1,
    kind: "unit",
    type: "stuka",
    ownerId: "A",
    x: 0,
    y: 0,
    facing: 0,
    hp: 110,
    hpMax: 110,
    state: "move",
    tileW: 1,
    tileH: 1,
    tileX: 0,
    tileY: 0,
    air: { phase: alt > 0 ? "fly" : "parked", alt },
  };
}

describe("aircraft draw", () => {
  it("draws above everything standing", () => {
    assert.ok(AIR_DRAW_LAYER > STANDING_DRAW_LAYER);
  });

  it("lifts by the same screen step as terrain elevation", () => {
    assert.equal(airLiftPx(16), isoLift(16));
    assert.equal(airLiftPx(0), 0);
  });

  it("eases altitude between snapshots", () => {
    assert.equal(lerpAirAlt(plane(0), plane(10), 0.5), 5);
    assert.equal(lerpAirAlt(undefined, plane(10), 0.5), 10);
    assert.equal(lerpAirAlt(plane(4), plane(10), 2), 10);
  });

  it("only a plane off the ground counts as in the air", () => {
    assert.equal(inAir(plane(0)), false);
    assert.equal(inAir(plane(8)), true);
    assert.equal(inAir({ air: undefined }), false);
  });

  it("the shadow softens with height", () => {
    const low = aircraftShadowScale(0);
    const high = aircraftShadowScale(16);
    assert.ok(high.alpha < low.alpha);
    assert.ok(high.scale >= low.scale);
  });

  it("lifts a paratrooper by his canopy height and eases him onto the ground", () => {
    const base = plane(0);
    const hanging: EntityView = { ...base, type: "rifleman", air: undefined, chute: 6 };
    const landed: EntityView = { ...base, type: "rifleman", air: undefined };
    assert.ok(inAir(hanging));
    assert.equal(lerpAirAlt(undefined, hanging, 1), 6);
    assert.equal(lerpAirAlt(hanging, landed, 0.5), 3);
    assert.equal(lerpAirAlt(hanging, landed, 1), 0);
    assert.equal(inAir(landed), false);
    assert.equal(lerpAirAlt(landed, landed, 0.5), 0);
  });
});
