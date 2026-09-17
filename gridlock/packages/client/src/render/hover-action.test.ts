import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveHoverAction, type HoverEntity } from "./hover-action.js";

const YOU = "p1";
const FOE = "p2";
const ALLY = "p3";

function allied(id: string | undefined): boolean {
  return id === YOU || id === ALLY;
}

function unit(partial: Partial<HoverEntity> & Pick<HoverEntity, "id" | "type">): HoverEntity {
  return {
    kind: "unit",
    ownerId: YOU,
    hp: 40,
    wreck: undefined,
    garrisonedIn: undefined,
    garrison: undefined,
    ...partial,
  };
}

function building(partial: Partial<HoverEntity> & Pick<HoverEntity, "id" | "type">): HoverEntity {
  return {
    kind: "building",
    ownerId: YOU,
    hp: 200,
    wreck: undefined,
    garrisonedIn: undefined,
    garrison: undefined,
    ...partial,
  };
}

function act(opts: {
  selected: HoverEntity[];
  hit?: HoverEntity | null;
  scrap?: boolean;
}): ReturnType<typeof resolveHoverAction> {
  return resolveHoverAction({
    youPlayerId: YOU,
    selected: opts.selected,
    hit: opts.hit ?? null,
    scrap: opts.scrap ?? false,
    allied,
  });
}

describe("resolveHoverAction", () => {
  const trooper = unit({ id: 1, type: "trooper" });
  const hauler = unit({ id: 2, type: "hauler" });
  const warden = unit({ id: 3, type: "warden" });
  const emptyHouse = building({
    id: 10,
    type: "cottage",
    ownerId: "",
    garrison: { count: 0, cap: 5 },
  });
  const yourHouse = building({
    id: 11,
    type: "house",
    ownerId: "",
    garrison: { count: 2, cap: 5, ownerId: YOU },
  });
  const fullHouse = building({
    id: 12,
    type: "house",
    ownerId: "",
    garrison: { count: 5, cap: 5, ownerId: YOU },
  });
  const foeHouse = building({
    id: 13,
    type: "cottage",
    ownerId: "",
    garrison: { count: 2, cap: 5, ownerId: FOE },
  });
  const foeCore = building({ id: 20, type: "core", ownerId: FOE });
  const yourCore = building({ id: 21, type: "core", ownerId: YOU });
  const allyCore = building({ id: 22, type: "core", ownerId: ALLY });
  const foeTrooper = unit({ id: 30, type: "trooper", ownerId: FOE });

  it("garrisons an empty house with infantry", () => {
    assert.equal(act({ selected: [trooper], hit: emptyHouse }), "garrison");
  });

  it("garrisons a house you already occupy if there is room", () => {
    assert.equal(act({ selected: [trooper], hit: yourHouse }), "garrison");
  });

  it("does not garrison a full house", () => {
    assert.equal(act({ selected: [trooper], hit: fullHouse }), null);
  });

  it("ungarrisons a full house when the building is selected", () => {
    assert.equal(act({ selected: [fullHouse], hit: fullHouse }), "ungarrison");
  });

  it("does not garrison a house held by the enemy", () => {
    assert.equal(act({ selected: [trooper], hit: foeHouse }), "attack");
  });

  it("ungarrisons when the occupied building is selected", () => {
    assert.equal(act({ selected: [yourHouse], hit: yourHouse }), "ungarrison");
  });

  it("ungarrisons when infantry already inside are selected", () => {
    const inside = unit({ id: 4, type: "trooper", garrisonedIn: yourHouse.id });
    assert.equal(act({ selected: [inside], hit: yourHouse }), "ungarrison");
  });

  it("prefers garrison over ungarrison when free infantry can still enter", () => {
    const inside = unit({ id: 4, type: "trooper", garrisonedIn: yourHouse.id });
    assert.equal(act({ selected: [inside, trooper], hit: yourHouse }), "garrison");
  });

  it("captures an enemy military building with infantry", () => {
    assert.equal(act({ selected: [trooper], hit: foeCore }), "capture");
  });

  it("does not capture with only a tank", () => {
    assert.equal(act({ selected: [warden], hit: foeCore }), "attack");
  });

  it("does not capture your own or allied buildings", () => {
    assert.equal(act({ selected: [trooper], hit: yourCore }), null);
    assert.equal(act({ selected: [trooper], hit: allyCore }), null);
  });

  it("does not capture civilian houses", () => {
    assert.equal(act({ selected: [trooper], hit: emptyHouse }), "garrison");
  });

  it("attacks an enemy unit", () => {
    assert.equal(act({ selected: [warden], hit: foeTrooper }), "attack");
    assert.equal(act({ selected: [trooper], hit: foeTrooper }), "attack");
  });

  it("attacks wrecks", () => {
    const wreck = unit({ id: 40, type: "warden", ownerId: FOE, wreck: true, hp: 30 });
    assert.equal(act({ selected: [trooper], hit: wreck }), "attack");
  });

  it("gathers scrap when a hauler is selected", () => {
    assert.equal(act({ selected: [hauler], scrap: true }), "gather");
  });

  it("gathers scrap under a friendly unit", () => {
    assert.equal(act({ selected: [hauler], hit: trooper, scrap: true }), "gather");
  });

  it("does not gather without a hauler", () => {
    assert.equal(act({ selected: [trooper], scrap: true }), null);
  });

  it("prefers attack over gather when hovering an enemy on scrap", () => {
    assert.equal(act({ selected: [hauler], hit: foeTrooper, scrap: true }), "attack");
  });

  it("prefers capture over gather", () => {
    assert.equal(act({ selected: [trooper, hauler], hit: foeCore, scrap: true }), "capture");
  });

  it("ignores selection of wrecks and empty selection", () => {
    const dead = unit({ id: 9, type: "trooper", wreck: true });
    assert.equal(act({ selected: [dead], hit: emptyHouse }), null);
    assert.equal(act({ selected: [], hit: emptyHouse }), null);
  });
});
