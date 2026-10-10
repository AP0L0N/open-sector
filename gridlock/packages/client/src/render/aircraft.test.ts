import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIR_CRUISE_ALT, isoLift, type EntityView } from "@gridlock/shared";
import { AIR_DRAW_LAYER, HOVER_BOB_PX, SAUCER_SPIN_PER_SEC, aircraftShadowScale, airLiftPx, hoverBobPx, inAir, lerpAirAlt, saucerSpin, wingBeatFrame } from "./aircraft.js";
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
    const high = aircraftShadowScale(AIR_CRUISE_ALT);
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

describe("Xenomorph flier animation", () => {
  const flier = (type: EntityView["type"], alt: number): EntityView => ({ ...plane(alt), type });

  it("bobs a hovering Xenomorph flier gently, and nothing else", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 4000; t += 50) {
      const b = hoverBobPx(flier("wasp", 20), t);
      lo = Math.min(lo, b);
      hi = Math.max(hi, b);
    }
    assert.ok(hi > HOVER_BOB_PX * 0.9 && lo < -HOVER_BOB_PX * 0.9, "it rises and falls");
    assert.equal(hoverBobPx(plane(20), 500), 0, "a Stuka does not bob");
    assert.equal(hoverBobPx(flier("wasp", 0), 500), 0, "nor a flier on the ground");
    const down = flier("wasp", 20);
    down.air = { phase: "crash", alt: 20 };
    assert.equal(hoverBobPx(down, 500), 0, "nor one going down");
  });

  it("beats the wings through every stroke, out of step between fliers", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 1000; t += 10) seen.add(wingBeatFrame(3, 24, 4, t));
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
    assert.notEqual(wingBeatFrame(1, 24, 4, 0), wingBeatFrame(2, 24, 4, 0));
  });

  it("spins the Overseer's hull all the way round", () => {
    const turn = saucerSpin(5, 1000 / SAUCER_SPIN_PER_SEC) - saucerSpin(5, 0);
    assert.ok(Math.abs(turn - Math.PI * 2) < 1e-9, "one turn in 1 / SAUCER_SPIN_PER_SEC seconds");
  });
});
