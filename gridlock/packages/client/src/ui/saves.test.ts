import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SaveGame } from "@gridlock/shared";
import { cleanSaveName, dropSaveSlot, putSaveSlot, readSaveSlots, suggestSaveName, writeSaveSlots, type SaveSlot, type SaveStore } from "./saves.js";

function mem(): SaveStore {
  const box = new Map<string, string>();
  return {
    getItem: (key) => box.get(key) ?? null,
    setItem: (key, value) => {
      box.set(key, value);
    },
  };
}

function slot(id: string, name: string): SaveSlot {
  return {
    id,
    name,
    savedAt: 1_700_000_000_000,
    mapId: "yard-64",
    tick: 0,
    save: { v: 1 } as SaveGame,
  };
}

describe("save slots", () => {
  it("keeps a new game and replaces one with the same id", () => {
    const store = mem();
    const first = putSaveSlot([], slot("a", "Dawn"));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(writeSaveSlots(first.slots, store).ok, true);
    const again = putSaveSlot(readSaveSlots(store), slot("a", "Dawn later"));
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.slots.length, 1);
    assert.equal(again.slots[0]?.name, "Dawn later");
    assert.equal(dropSaveSlot(again.slots, "a").length, 0);
  });

  it("stops at the cap unless the id is already stored", () => {
    let slots: SaveSlot[] = [];
    for (let i = 0; i < 12; i++) {
      const put = putSaveSlot(slots, slot(String(i), `S${i}`), 12);
      assert.equal(put.ok, true);
      if (!put.ok) return;
      slots = put.slots;
    }
    const extra = putSaveSlot(slots, slot("new", "One more"), 12);
    assert.equal(extra.ok, false);
    const replaced = putSaveSlot(slots, slot("0", "Overwritten"), 12);
    assert.equal(replaced.ok, true);
    if (!replaced.ok) return;
    assert.equal(replaced.slots.length, 12);
    assert.equal(replaced.slots[0]?.name, "Overwritten");
  });

  it("names a save from the map and the match clock, and trims the field", () => {
    assert.equal(suggestSaveName("yard-64", 0), "Scrap Yard 06:00");
    assert.equal(cleanSaveName("  Night fight  ", "Scrap Yard 06:00"), "Night fight");
    assert.equal(cleanSaveName("   ", "Scrap Yard 06:00"), "Scrap Yard 06:00");
  });

  it("ignores a stored list that is not slots", () => {
    const store = mem();
    store.setItem("gridlock.saves", "{");
    assert.deepEqual(readSaveSlots(store), []);
    store.setItem("gridlock.saves", "[{}]");
    assert.deepEqual(readSaveSlots(store), []);
  });
});
