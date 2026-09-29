import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityView } from "@gridlock/shared";
import { DOUBLE_CLICK_MS, isDoubleClick, sameTypeOnScreen } from "./same-type-select.js";

function unit(id: number, type: string, x: number, extra: Partial<EntityView> = {}): EntityView {
  return { id, kind: "unit", type, ownerId: "me", x, y: 10, hp: 10, hpMax: 10, ...extra } as EntityView;
}

const view = { w: 100, h: 100 };
const screenOf = (e: EntityView) => ({ x: e.x, y: e.y });

describe("sameTypeOnScreen", () => {
  it("picks only your live, loose units of the same type inside the view", () => {
    const picked = unit(1, "rifleman", 50);
    const ents = [
      picked,
      unit(2, "rifleman", 0),
      unit(3, "rifleman", 150),
      unit(4, "gunner", 40),
      unit(5, "rifleman", 30, { ownerId: "foe" }),
      unit(6, "rifleman", 30, { wreck: true } as Partial<EntityView>),
      unit(7, "rifleman", 30, { garrisonedIn: 99 }),
      unit(8, "rifleman", 30, { hp: 0 }),
      unit(9, "rifleman", 100),
    ];
    assert.deepEqual(sameTypeOnScreen(ents, picked, "me", view, screenOf), [1, 2, 9]);
  });
});

describe("isDoubleClick", () => {
  const a = { id: 1, x: 10, y: 10, t: 1000 };
  it("accepts a quick second click on the same unit", () => {
    assert.equal(isDoubleClick(a, { id: 1, x: 12, y: 9, t: 1000 + DOUBLE_CLICK_MS }), true);
  });
  it("rejects a slow, moved, or different-unit click", () => {
    assert.equal(isDoubleClick(null, a), false);
    assert.equal(isDoubleClick(a, { ...a, t: a.t + DOUBLE_CLICK_MS + 1 }), false);
    assert.equal(isDoubleClick(a, { ...a, x: 30, t: a.t + 100 }), false);
    assert.equal(isDoubleClick(a, { ...a, id: 2, t: a.t + 100 }), false);
  });
});
