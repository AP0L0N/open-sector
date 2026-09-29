import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cookoffParticles,
  emberPose,
  fireTongues,
  JET_RATE,
  flameParticleLook,
  jetLanding,
  jetParticles,
  patchHeat,
  stepFlameParticle,
  tonguePose,
} from "./flame-fx.js";
import { pyroNozzleScreen } from "./pyro-nozzle.js";
import { PYRO_FIRE_MS, pyroSheet } from "./infantry-visual.js";

describe("flame jet", () => {
  const nozzle = { x: 100, y: 100, h: 8 };
  const land = { x: 180, y: 100 };

  it("sprays about JET_RATE particles a second from the nozzle", () => {
    let n = 0;
    for (let f = 0; f < 60; f++) {
      const ps = jetParticles({ nozzle, land, now: 1000 + f * 16, dtMs: 16, seed: 7 + f });
      n += ps.length;
      // Emitted earlier in the frame, already that far down the jet.
      for (const p of ps) assert.ok(Math.hypot(p.x - nozzle.x, p.y - nozzle.y) < 16, "born at the nozzle");
    }
    const want = (JET_RATE * 60 * 16) / 1000;
    assert.ok(n >= want * 0.8 && n <= want * 1.2, `count ${n} in ~1 s, want ${want}`);
  });

  it("arcs down onto the burst point, then billows and rises", () => {
    const [p] = jetParticles({ nozzle, land, now: 0, dtMs: 1000 / 110 + 1, seed: 3 });
    assert.ok(p);
    let t = 0;
    let peak = p.h;
    while (!p.landed && t < 2000) {
      t += 16;
      stepFlameParticle(p, t, 0.016);
      peak = Math.max(peak, p.h);
    }
    assert.ok(p.landed, "it comes down");
    assert.ok(Math.abs(p.x - land.x) < 25 && Math.abs(p.y - land.y) < 12, `landed at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    assert.ok(peak < nozzle.h + 12, "a low arc, not a lob");
    const r0 = flameParticleLook(p, t)!.r;
    const h0 = p.h;
    for (let i = 0; i < 12; i++) {
      t += 16;
      stepFlameParticle(p, t, 0.016);
    }
    const look = flameParticleLook(p, t);
    if (look) {
      assert.ok(look.r > r0, "blooms once it is down");
      assert.ok(p.h > h0, "and climbs");
    }
  });

  it("cools from white-hot to dark and burns out", () => {
    const [p] = jetParticles({ nozzle, land, now: 0, dtMs: 20, seed: 11, rate: 200 });
    assert.ok(p);
    const early = flameParticleLook(p, p.at + 10)!;
    const late = flameParticleLook(p, p.at + p.life * 0.9)!;
    assert.ok(early.heat > late.heat);
    assert.ok(early.r < late.r, "thin at the nozzle");
    assert.equal(flameParticleLook(p, p.at + p.life + 1), null);
    assert.equal(stepFlameParticle(p, p.at + p.life + 1, 0.016), false);
  });

  it("lays the burst on the newest glob's landing point", () => {
    const l = jetLanding({ x: 10, y: 0, vx: 100, vy: 0, arc: 0.5, hang: 0.4 });
    assert.ok(Math.abs(l.x - 30) < 1e-9);
  });

  it("cooks off in a big hot ball with fuel flung clear", () => {
    const ps = cookoffParticles(0, 0, 0, 5);
    assert.ok(ps.length > 50);
    assert.ok(ps.some((p) => p.hot > 0.4 && p.r1 > 12));
    assert.ok(ps.some((p) => !p.landed && Math.hypot(p.vx, p.vy) > 40));
  });
});

describe("burning ground", () => {
  it("puts more tongues in a bigger patch, the same ones every frame", () => {
    const small = fireTongues(9, 10);
    const big = fireTongues(9, 30);
    assert.ok(big.length > small.length);
    assert.deepEqual(fireTongues(9, 10), small);
    for (const t of big) assert.ok(Math.hypot(t.u, t.v) <= 1);
  });

  it("burns hot, then dies down over the end of its life", () => {
    assert.equal(patchHeat(10, 11), 1);
    assert.ok(patchHeat(1, 11) > 0 && patchHeat(1, 11) < 1);
    assert.equal(patchHeat(0, 11), 0);
  });

  it("licks: tongues swell and shed a flamelet, lower when the fire dies down", () => {
    const [t] = fireTongues(4, 12);
    assert.ok(t);
    let shed = false;
    let hi = 0;
    let lo = Infinity;
    for (let now = 0; now < 2000; now += 20) {
      const p = tonguePose(t, now, 1, 0.3);
      hi = Math.max(hi, p.h);
      lo = Math.min(lo, p.h);
      if (p.lick) shed = true;
    }
    assert.ok(shed, "the tip tears off");
    assert.ok(hi > lo * 1.3, "it flickers");
    assert.ok(tonguePose(t, 500, 0.2, 0.3).h < tonguePose(t, 500, 1, 0.3).h);
  });

  it("sends sparks up from the patch", () => {
    let up = 0;
    for (let i = 0; i < 8; i++) {
      const e = emberPose(3, i, 1234, 10);
      if (e) {
        assert.ok(e.dy < 0 && e.a >= 0 && e.a <= 1);
        up++;
      }
    }
    assert.ok(up > 0);
  });
});

describe("pyro sprite", () => {
  it("holds the burst pose while globs keep leaving the lance", () => {
    assert.equal(pyroSheet({}), "walk");
    assert.equal(pyroSheet({ shotAgeMs: 90 }), "fire");
    assert.equal(pyroSheet({ shotAgeMs: PYRO_FIRE_MS }), "walk");
    assert.equal(pyroSheet({ stance: "crawl", shotAgeMs: 40 }), "crawl");
    assert.equal(pyroSheet({ swimming: true }), "swim");
    assert.equal(pyroSheet({ wreck: true }), "die");
  });

  it("puts the nozzle ahead of him on every face, above the ground", () => {
    for (const stance of ["stand", "crouch", "crawl"] as const) {
      for (let row = 0; row < 16; row++) {
        const tip = pyroNozzleScreen(row, stance, 20, 1);
        assert.ok(tip.h >= 1, `${stance} ${row} h ${tip.h}`);
        const a = ((90 + row * 22.5) * Math.PI) / 180;
        // Facing east-ish rows put the tip right of his feet, west-ish rows left.
        if (Math.cos(a) > 0.5) assert.ok(tip.gx > 0, `${stance} row ${row} gx ${tip.gx}`);
        if (Math.cos(a) < -0.5) assert.ok(tip.gx < 0, `${stance} row ${row} gx ${tip.gx}`);
      }
    }
  });
});
