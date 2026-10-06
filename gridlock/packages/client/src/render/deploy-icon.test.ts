import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEPLOY_ICON_CYCLE_MS, deployIconBob, deployIconCore, deployIconWaves } from "./deploy-icon.js";

describe("deploy icon", () => {
  it("streams the brackets outward while deploying", () => {
    const a = deployIconWaves("deploy", 100)[0]!;
    const b = deployIconWaves("deploy", 500)[0]!;
    assert.ok(b.reach > a.reach);
  });

  it("streams the brackets inward while packing", () => {
    const a = deployIconWaves("pack", 100)[0]!;
    const b = deployIconWaves("pack", 500)[0]!;
    assert.ok(b.reach < a.reach);
  });

  it("loops without a seam: a wave is invisible where its run wraps", () => {
    for (const mode of ["deploy", "pack"] as const) {
      const w = deployIconWaves(mode, 0)[0]!;
      assert.ok(w.alpha < 1e-9);
      assert.ok(deployIconWaves(mode, DEPLOY_ICON_CYCLE_MS - 1)[0]!.alpha < 0.01);
    }
  });

  it("staggers the waves so one is always showing", () => {
    for (let t = 0; t < DEPLOY_ICON_CYCLE_MS; t += 37) {
      const best = Math.max(...deployIconWaves("deploy", t).map((w) => w.alpha));
      assert.ok(best > 0.7, `t=${t}`);
    }
  });

  it("keeps the brackets outside the footprint and inside the badge", () => {
    for (let t = 0; t < DEPLOY_ICON_CYCLE_MS; t += 50) {
      for (const w of deployIconWaves("deploy", t)) {
        assert.ok(w.reach <= 1);
        assert.ok(w.reach >= deployIconCore("deploy", 1));
      }
    }
  });

  it("grows the footprint while deploying and shrinks it while packing", () => {
    assert.ok(deployIconCore("deploy", 1) > deployIconCore("deploy", 0));
    assert.ok(deployIconCore("pack", 1) < deployIconCore("pack", 0));
    assert.equal(deployIconCore("deploy", 2), deployIconCore("deploy", 1));
  });

  it("bobs only a pixel or so", () => {
    for (let t = 0; t < 5000; t += 90) assert.ok(Math.abs(deployIconBob(t)) <= 1.2);
  });
});
