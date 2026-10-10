import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JUGGERNAUT_FIST_SECONDS, JUGGERNAUT_HAMMER_SECONDS } from "@gridlock/shared";
import { JUGGERNAUT_THROW_MS, pickJuggernautPose } from "./juggernaut-fx.js";

const base = { fists: false, stepping: false, now: 10_000, speed: 1 };

describe("Juggernaut pose", () => {
  it("walks, or walks with its fists once the hammer is gone", () => {
    assert.deepEqual(pickJuggernautPose(base), { sheet: "walk" });
    assert.deepEqual(pickJuggernautPose({ ...base, fists: true }), { sheet: "fists" });
  });

  it("shows the hammer on the ground the moment a blow lands, then lifts it and holds it high", () => {
    assert.deepEqual(pickJuggernautPose({ ...base, blowAt: base.now }), { sheet: "swing", frame: 0 });
    const lifted = pickJuggernautPose({ ...base, blowAt: base.now - JUGGERNAUT_HAMMER_SECONDS * 1000 * 0.3 });
    assert.equal(lifted.sheet, "swing");
    assert.equal(lifted.frame, 2);
    const held = pickJuggernautPose({ ...base, blowAt: base.now - JUGGERNAUT_HAMMER_SECONDS * 1000 * 1.2 });
    assert.deepEqual(held, { sheet: "swing", frame: 5 });
    // Long after the last blow it walks again.
    assert.equal(pickJuggernautPose({ ...base, blowAt: base.now - JUGGERNAUT_HAMMER_SECONDS * 1000 * 2 }).sheet, "walk");
  });

  it("keeps the blow clock in game time at higher speeds", () => {
    const at = base.now - JUGGERNAUT_HAMMER_SECONDS * 1000 * 0.15;
    assert.equal(pickJuggernautPose({ ...base, blowAt: at, speed: 2 }).frame, 2);
  });

  it("alternates fists, the right first", () => {
    const first = pickJuggernautPose({ ...base, fists: true, blowAt: base.now, blows: 1 });
    const second = pickJuggernautPose({ ...base, fists: true, blowAt: base.now, blows: 2 });
    assert.deepEqual(first, { sheet: "punch", frame: 0 });
    assert.deepEqual(second, { sheet: "punch", frame: 4 });
    const pulled = pickJuggernautPose({ ...base, fists: true, blowAt: base.now - JUGGERNAUT_FIST_SECONDS * 1000 * 0.5, blows: 1 });
    assert.equal(pulled.frame, 2);
  });

  it("plays the throw once, ahead of any blow", () => {
    assert.deepEqual(pickJuggernautPose({ ...base, fists: true, throwAt: base.now, blowAt: base.now }), { sheet: "throw", frame: 0 });
    assert.equal(pickJuggernautPose({ ...base, fists: true, throwAt: base.now - JUGGERNAUT_THROW_MS * 0.8 }).frame, 3);
    assert.equal(pickJuggernautPose({ ...base, fists: true, throwAt: base.now - JUGGERNAUT_THROW_MS * 2 }).sheet, "fists");
  });

  it("drops the fight pose once it walks on", () => {
    assert.equal(pickJuggernautPose({ ...base, stepping: true, blowAt: base.now - 400 }).sheet, "walk");
  });
});
