import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffByKey, renderChangesEnabled } from "./builder-render.js";

describe("render changes", () => {
  it("arms only when a map is open, edits are waiting, and nothing is building", () => {
    assert.equal(renderChangesEnabled(true, true, false), true);
    assert.equal(renderChangesEnabled(true, false, false), false);
    assert.equal(renderChangesEnabled(true, true, true), false);
    assert.equal(renderChangesEnabled(false, true, false), false);
  });
});

describe("edit sketch", () => {
  const id = (item: { id: string }): string => item.id;

  it("reports nothing when every item still has a match", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const diff = diffByKey(items, [{ id: "b" }, { id: "a" }], id);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, []);
  });

  it("keeps one copy of a repeated key and reports the extra", () => {
    const diff = diffByKey([{ id: "a" }, { id: "a" }, { id: "b" }], [{ id: "a" }, { id: "c" }], id);
    assert.deepEqual(diff.added.map((item) => item.id), ["c"]);
    assert.deepEqual(diff.removed.map((item) => item.id).sort(), ["a", "b"]);
  });

  it("treats a changed field as a removal plus an addition", () => {
    const diff = diffByKey([{ id: "house@1" }], [{ id: "house@2" }], id);
    assert.deepEqual(diff.added.map((item) => item.id), ["house@2"]);
    assert.deepEqual(diff.removed.map((item) => item.id), ["house@1"]);
  });
});
