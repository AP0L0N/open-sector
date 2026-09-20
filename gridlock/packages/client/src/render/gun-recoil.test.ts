import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUN_KICK_MS,
  GUN_RECOVER_MS,
  HULL_DELAY_MS,
  HULL_KICK_MS,
  HULL_RECOVER_MS,
  recoilAmounts,
  recoilEnvelope,
  recoilLayerShift,
  recoilPixels,
  tankGunRecoils,
} from "./gun-recoil.js";

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

describe("tankGunRecoils", () => {
  it("runs only on a live hull with a separate gun layer", () => {
    assert.equal(tankGunRecoils({ hasGun: true }), true);
    assert.equal(tankGunRecoils({ hasGun: true, wreck: true }), false);
    assert.equal(tankGunRecoils({ hasGun: true, garrisonedIn: 3 }), false);
    assert.equal(tankGunRecoils({ hasGun: false }), false);
  });
});

describe("recoilEnvelope", () => {
  it("is zero before the delay and after the cycle", () => {
    assert.equal(recoilEnvelope(0, 50, 200, 10), 0);
    assert.equal(recoilEnvelope(9, 50, 200, 10), 0);
    assert.equal(recoilEnvelope(10 + 50 + 200, 50, 200, 10), 0);
  });

  it("peaks at the end of the kick", () => {
    const peak = recoilEnvelope(GUN_KICK_MS, GUN_KICK_MS, GUN_RECOVER_MS);
    assert.ok(near(peak, 1, 1e-6));
    const midKick = recoilEnvelope(GUN_KICK_MS * 0.4, GUN_KICK_MS, GUN_RECOVER_MS);
    assert.ok(midKick > 0.5 && midKick < 1);
    const midRecover = recoilEnvelope(
      GUN_KICK_MS + GUN_RECOVER_MS * 0.5,
      GUN_KICK_MS,
      GUN_RECOVER_MS,
    );
    assert.ok(midRecover > 0 && midRecover < 0.4);
  });
});

describe("recoilAmounts", () => {
  it("kicks the gun before the hull", () => {
    const early = recoilAmounts(0, GUN_KICK_MS * 0.5);
    assert.ok(early);
    assert.ok(early.gun > 0.4);
    const hullStill = recoilAmounts(0, HULL_DELAY_MS * 0.4);
    assert.ok(hullStill);
    assert.equal(hullStill.hull, 0);
  });

  it("stays live on the fire frame so the first blit is not dropped", () => {
    const zero = recoilAmounts(100, 100);
    assert.ok(zero);
    assert.equal(zero.gun, 0);
    assert.equal(zero.hull, 0);
  });

  it("dies after the slower hull recover", () => {
    const done = HULL_DELAY_MS + HULL_KICK_MS + HULL_RECOVER_MS;
    assert.equal(recoilAmounts(0, done), null);
    assert.ok(recoilAmounts(0, done - 20));
  });
});

describe("recoilLayerShift", () => {
  it("slides both layers opposite the barrel", () => {
    const s = recoilLayerShift(10, 0, 2, 8);
    assert.ok(near(s.hullX, -2));
    assert.ok(near(s.hullY, 0));
    assert.ok(near(s.gunX, -10));
    assert.ok(near(s.gunY, 0));
  });

  it("follows a diagonal iso facing", () => {
    const s = recoilLayerShift(4, 2, 0, 5);
    const len = Math.hypot(4, 2);
    assert.ok(near(s.gunX, -(4 / len) * 5));
    assert.ok(near(s.gunY, -(2 / len) * 5));
    assert.ok(near(s.hullX, 0));
  });
});

describe("recoilPixels", () => {
  it("scales travel with draw size", () => {
    const a = recoilPixels(50, { gun: 1, hull: 1 });
    const b = recoilPixels(100, { gun: 1, hull: 1 });
    assert.ok(near(b.gunPx, a.gunPx * 2));
    assert.ok(near(b.hullPx, a.hullPx * 2));
    assert.ok(a.gunPx > a.hullPx * 2);
  });
});
