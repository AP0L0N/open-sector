import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEPLOY_CURSOR_CYCLE, deployCursorWaves } from "./cursor.js";

describe("deployCursorWaves", () => {
  it("streams the brackets outward to deploy", () => {
    const a = deployCursorWaves("deploy", 0.1)[0]!;
    const b = deployCursorWaves("deploy", 0.4)[0]!;
    assert.ok(b.reach > a.reach);
  });

  it("streams the brackets inward to pack", () => {
    const a = deployCursorWaves("pack", 0.1)[0]!;
    const b = deployCursorWaves("pack", 0.4)[0]!;
    assert.ok(b.reach < a.reach);
  });

  it("hides a wave where its run wraps, so the loop has no seam", () => {
    for (const mode of ["deploy", "pack"] as const) {
      assert.ok(deployCursorWaves(mode, 0)[0]!.alpha < 1e-9);
      assert.ok(deployCursorWaves(mode, DEPLOY_CURSOR_CYCLE - 0.001)[0]!.alpha < 0.01);
    }
  });

  it("always has one wave showing", () => {
    for (let t = 0; t < DEPLOY_CURSOR_CYCLE; t += 0.037) {
      const best = Math.max(...deployCursorWaves("pack", t).map((w) => w.alpha));
      assert.ok(best > 0.7, `t=${t}`);
    }
  });

  it("keeps every wave between the hull and the footprint's edge", () => {
    for (let t = 0; t < 3; t += 0.05) {
      for (const w of deployCursorWaves("deploy", t)) assert.ok(w.reach >= 8 && w.reach <= 20);
    }
  });
});
