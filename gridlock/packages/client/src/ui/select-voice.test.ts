import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectVoice } from "./select-voice.js";

const ME = "p1";
const units = [
  { id: 1, type: "rifleman", kind: "unit", ownerId: ME, wreck: false },
  { id: 2, type: "gunner", kind: "unit", ownerId: ME, wreck: false },
  { id: 3, type: "rifleman", kind: "unit", ownerId: "p2", wreck: false },
] as Parameters<typeof selectVoice>[0];

describe("selectVoice", () => {
  it("answers when one of your riflemen is picked", () => {
    assert.equal(selectVoice(units, new Set(), [1], ME), "rifleman");
    assert.equal(selectVoice(units, new Set(), [2, 1], ME), "rifleman");
  });

  it("stays quiet for other types and enemy riflemen", () => {
    assert.equal(selectVoice(units, new Set(), [2], ME), null);
    assert.equal(selectVoice(units, new Set(), [3], ME), null);
  });

  it("stays quiet when nothing new joins", () => {
    assert.equal(selectVoice(units, new Set([1]), [1], ME), null);
    assert.equal(selectVoice(units, new Set([1, 2]), [1], ME), null);
    assert.equal(selectVoice(units, new Set([1]), [], ME), null);
  });
});
