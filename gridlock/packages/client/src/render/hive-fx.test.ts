import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BITE_FX_MS, DOWN_BEAM_MS, downBeamAlpha, jawGape } from "./hive-fx.js";

describe("hive fx", () => {
  it("shows an Overseer pulse at once and has it gone before the next one", () => {
    assert.equal(downBeamAlpha(0), 1);
    assert.ok(downBeamAlpha(DOWN_BEAM_MS / 2) > 0);
    assert.equal(downBeamAlpha(DOWN_BEAM_MS), 0);
    assert.ok(DOWN_BEAM_MS < 300, "a pulse every 0.3 s: the beams do not run together");
  });

  it("opens the jaws wide, snaps them shut early, and keeps them shut", () => {
    assert.equal(jawGape(0), 1);
    assert.ok(jawGape(BITE_FX_MS * 0.2) < 1);
    assert.equal(jawGape(BITE_FX_MS * 0.5), 0);
    assert.equal(jawGape(BITE_FX_MS), 0);
  });
});
