import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canGuardUnit, resolveHoverAction, type HoverEntity } from "./hover-action.js";

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
  const trooper = unit({ id: 1, type: "rifleman" });
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
  const foeTrooper = unit({ id: 30, type: "rifleman", ownerId: FOE });

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
    const inside = unit({ id: 4, type: "rifleman", garrisonedIn: yourHouse.id });
    assert.equal(act({ selected: [inside], hit: yourHouse }), "ungarrison");
  });

  it("prefers garrison over ungarrison when free infantry can still enter", () => {
    const inside = unit({ id: 4, type: "rifleman", garrisonedIn: yourHouse.id });
    assert.equal(act({ selected: [inside, trooper], hit: yourHouse }), "garrison");
  });

  it("captures an enemy military building with infantry", () => {
    assert.equal(act({ selected: [trooper], hit: foeCore }), "capture");
  });

  it("does not capture with only a tank", () => {
    assert.equal(act({ selected: [warden], hit: foeCore }), "attack");
  });

  it("does not offer a walker an attack on walls, and still offers a garrison", () => {
    const walker = unit({ id: 5, type: "walker" });
    assert.equal(act({ selected: [walker], hit: foeCore }), null);
    assert.equal(act({ selected: [walker], hit: emptyHouse }), null);
    assert.equal(act({ selected: [walker], hit: foeHouse }), "attack");
    assert.equal(act({ selected: [walker, warden], hit: foeCore }), "attack");
    assert.equal(act({ selected: [walker], hit: foeTrooper }), "attack");
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

  it("sends an engineer to scrap an armored wreck", () => {
    const eng = unit({ id: 7, type: "engineer", hp: 40 });
    const wreck = unit({ id: 40, type: "warden", ownerId: FOE, wreck: true, hp: 30 });
    assert.equal(act({ selected: [eng], hit: wreck }), "scrap");
    assert.equal(act({ selected: [eng], hit: unit({ id: 41, type: "warden", ownerId: YOU, wreck: true, hp: 10 }) }), "scrap");
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
    const dead = unit({ id: 9, type: "rifleman", wreck: true });
    assert.equal(act({ selected: [dead], hit: emptyHouse }), null);
    assert.equal(act({ selected: [], hit: emptyHouse }), null);
  });

  it("boards a supply truck and offers ammo to a dry tank", () => {
    const open = unit({ id: 40, type: "supply", ownerId: FOE, bed: { seats: 0, open: true } });
    const crewed = unit({ id: 41, type: "supply", bed: { crew: true, seats: 0 }, supply: 120 });
    const full = unit({ id: 43, type: "supply", ownerId: FOE, bed: { crew: true, seats: 1 } });
    const dry = unit({
      id: 42,
      type: "warden",
      ammo: { ap: 0, he: 0, heat: 0, smoke: 0 },
      mgAmmo: 0,
    });
    assert.equal(act({ selected: [trooper], hit: open }), "board");
    assert.equal(act({ selected: [trooper], hit: crewed }), "board");
    assert.equal(act({ selected: [trooper], hit: full }), "attack");
    assert.equal(act({ selected: [crewed], hit: dry }), "supply");
    assert.equal(act({ selected: [warden], hit: open }), "attack");
  });
});

describe("canGuardUnit", () => {
  const warden = unit({ id: 3, type: "warden" });
  const hauler = unit({ id: 2, type: "hauler" });
  const allyHauler = unit({ id: 4, type: "hauler", ownerId: ALLY });
  const foeTrooper = unit({ id: 30, type: "rifleman", ownerId: FOE });
  const house = building({ id: 10, type: "cottage" });

  function ask(hit: HoverEntity | null, selectedIds: number[] = [warden.id]): boolean {
    return canGuardUnit({
      youPlayerId: YOU,
      selectedIds,
      hit,
      allied,
    });
  }

  it("escorts a friendly unit that is not the only selection", () => {
    assert.equal(ask(hauler), true);
    assert.equal(ask(allyHauler), true);
  });

  it("does not escort the selected unit itself, enemies, wrecks, or buildings", () => {
    assert.equal(ask(warden, [warden.id]), false);
    assert.equal(ask(foeTrooper), false);
    assert.equal(ask(unit({ id: 9, type: "hauler", wreck: true })), false);
    assert.equal(ask(house), false);
    assert.equal(ask(null), false);
  });
});
