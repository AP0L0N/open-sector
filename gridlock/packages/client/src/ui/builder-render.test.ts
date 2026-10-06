import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderChangesEnabled } from "./builder-render.js";

describe("render changes", () => {
  it("arms only when a map is open, edits are waiting, and nothing is building", () => {
    assert.equal(renderChangesEnabled(true, true, false), true);
    assert.equal(renderChangesEnabled(true, false, false), false);
    assert.equal(renderChangesEnabled(true, true, true), false);
    assert.equal(renderChangesEnabled(false, true, false), false);
  });
});
