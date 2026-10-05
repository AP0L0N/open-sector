import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityView } from "@gridlock/shared";
import { AMBIENT_LEVEL, ambientKind, ambientMix, movers } from "./ambient.js";

function unit(id: number, type: string, x: number, y: number, extra: Partial<EntityView> = {}): EntityView {
  return { id, kind: "unit", type, ownerId: "p", x, y, hp: 1, hpMax: 1, ...extra } as EntityView;
}

describe("ambientKind", () => {
  it("files each machine under its bed, and soldiers under none", () => {
    assert.equal(ambientKind("stuka"), "air");
    assert.equal(ambientKind("gunboat"), "naval");
    assert.equal(ambientKind("warden"), "armor");
    assert.equal(ambientKind("supply"), "wheeled");
    assert.equal(ambientKind("walker"), "mech");
    assert.equal(ambientKind("rifleman"), null);
    assert.equal(ambientKind("drone"), null);
  });
});

describe("movers", () => {
  it("lists only units that moved since the last snapshot", () => {
    const prev = new Map([
      [1, unit(1, "warden", 0, 0)],
      [2, unit(2, "warden", 5, 5)],
      [3, unit(3, "rifleman", 0, 0)],
      [4, unit(4, "ss3", 0, 0)],
    ]);
    const now = [
      unit(1, "warden", 1, 0),
      unit(2, "warden", 5, 5),
      unit(3, "rifleman", 1, 0),
      unit(4, "ss3", 1, 0, { wreck: true }),
      unit(5, "stuka", 9, 9),
    ];
    assert.deepEqual(movers(prev, now), [{ kind: "armor", x: 1, y: 0 }]);
  });
});

describe("ambientMix", () => {
  const near = () => ({ gain: 1, pan: 0.5, lowpassHz: 20000 });

  it("is silent with nothing moving", () => {
    assert.equal(ambientMix([], near).armor.level, 0);
  });

  it("grows by power sum, capped at the bed's top level, and sits where the movers are", () => {
    const one = ambientMix([{ kind: "armor", x: 0, y: 0 }], () => ({ gain: 0.5, pan: 0.5, lowpassHz: 20000 }));
    const four = ambientMix(Array(4).fill({ kind: "armor", x: 0, y: 0 }), () => ({ gain: 0.5, pan: 0.5, lowpassHz: 20000 }));
    assert.ok(Math.abs(one.armor.level - 0.5 * AMBIENT_LEVEL.armor) < 1e-9);
    assert.ok(Math.abs(four.armor.level - AMBIENT_LEVEL.armor) < 1e-9);
    assert.equal(four.armor.pan, 0.5);
  });

  it("ignores movers too far to hear", () => {
    assert.equal(ambientMix([{ kind: "air", x: 0, y: 0 }], () => null).air.level, 0);
  });

  it("keeps every bed under the quietest one-shot effect", () => {
    for (const level of Object.values(AMBIENT_LEVEL)) assert.ok(level <= 0.2);
  });
});

describe("standing beds", () => {
  it("a helicopter in the air keeps its rotor bed while it hovers; on deck it has none", () => {
    const prev = new Map([[1, unit(1, "aswheli", 5, 5, { air: { alt: 6 } } as never)]]);
    assert.deepEqual(movers(prev, [unit(1, "aswheli", 5, 5, { air: { alt: 6 } } as never)]), [{ kind: "rotor", x: 5, y: 5 }]);
    assert.deepEqual(movers(prev, [unit(1, "aswheli", 5, 5, { air: { alt: 0 } } as never)]), []);
    assert.equal(ambientKind("aswheli"), "rotor");
  });

  it("your own Destroyer pings on its sonar standing still, and still makes way on the naval bed", () => {
    const deck = { asw: { heli: "ready", mines: 3, minesMax: 3 } } as never;
    const prev = new Map([[1, unit(1, "destroyer", 0, 0, deck)]]);
    assert.deepEqual(movers(prev, [unit(1, "destroyer", 0, 0, deck)], "p"), [{ kind: "sonar", x: 0, y: 0 }]);
    assert.deepEqual(movers(prev, [unit(1, "destroyer", 2, 0, deck)], "p"), [
      { kind: "sonar", x: 2, y: 0 },
      { kind: "naval", x: 2, y: 0 },
    ]);
    assert.deepEqual(movers(prev, [unit(1, "destroyer", 0, 0, deck)], "someone else"), []);
    assert.ok(AMBIENT_LEVEL.sonar < AMBIENT_LEVEL.naval, "the ping sits under the engines");
  });
});
