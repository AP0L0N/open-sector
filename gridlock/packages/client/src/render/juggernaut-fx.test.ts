import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JUGGERNAUT_FIST_SECONDS, JUGGERNAUT_HAMMER_SECONDS, JUGGERNAUT_REASSEMBLE_ANIM_SECONDS } from "@gridlock/shared";
import { JUGGERNAUT_RAMHIT_MS, JUGGERNAUT_THROW_MS, hammerGlowAlpha, pickJuggernautPose, reassembleFrame } from "./juggernaut-fx.js";

const base = { fists: false, stepping: false, now: 10_000, speed: 1 };

describe("Juggernaut pose", () => {
  it("walks, or walks with its fists once the hammer is gone", () => {
    assert.deepEqual(pickJuggernautPose(base), { sheet: "walk" });
    assert.deepEqual(pickJuggernautPose({ ...base, fists: true }), { sheet: "fists" });
    assert.deepEqual(pickJuggernautPose({ ...base, fists: true, stepping: true }), { sheet: "sprint" }, "without the hammer it runs flat out");
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

  it("runs on the ram sheet while it charges, over a blow still showing", () => {
    assert.deepEqual(pickJuggernautPose({ ...base, ramming: true }), { sheet: "ram" });
    assert.deepEqual(pickJuggernautPose({ ...base, ramming: true, blowAt: base.now - 100 }), { sheet: "ram" });
  });

  it("plays the slam once, then fights or walks on", () => {
    assert.deepEqual(pickJuggernautPose({ ...base, ramHitAt: base.now }), { sheet: "ramhit", frame: 0 });
    assert.equal(pickJuggernautPose({ ...base, ramHitAt: base.now - JUGGERNAUT_RAMHIT_MS * 0.6 }).frame, 2);
    assert.equal(pickJuggernautPose({ ...base, ramHitAt: base.now - JUGGERNAUT_RAMHIT_MS * 1.2 }).sheet, "walk");
  });

  it("drops the fight pose once it walks on", () => {
    assert.equal(pickJuggernautPose({ ...base, stepping: true, blowAt: base.now - 400 }).sheet, "walk");
  });
});

describe("Juggernaut reassembly", () => {
  it("lies as a wreck, then plays the reassembly to its feet", () => {
    assert.equal(reassembleFrame(10), null);
    assert.equal(reassembleFrame(JUGGERNAUT_REASSEMBLE_ANIM_SECONDS), 0);
    assert.equal(reassembleFrame(JUGGERNAUT_REASSEMBLE_ANIM_SECONDS / 2), 4);
    assert.equal(reassembleFrame(0), 7);
  });

  it("pulses the hammer softly, brighter near the end", () => {
    let farMax = 0;
    let nearMax = 0;
    for (let t = 0; t < 3000; t += 20) {
      farMax = Math.max(farMax, hammerGlowAlpha(14, t, 1));
      nearMax = Math.max(nearMax, hammerGlowAlpha(0.5, t, 1));
    }
    assert.ok(farMax < nearMax && nearMax <= 1, `${farMax} ${nearMax}`);
  });
});
