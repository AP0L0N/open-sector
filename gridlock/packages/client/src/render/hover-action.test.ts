import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog } from "@gridlock/shared";
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
  mine?: boolean;
}): ReturnType<typeof resolveHoverAction> {
  return resolveHoverAction({
    youPlayerId: YOU,
    selected: opts.selected,
    hit: opts.hit ?? null,
    mine: opts.mine,
    allied,
  });
}

describe("bridge cursor", () => {
  const eng = unit({ id: 60, type: "engineer" });
  const tank = unit({ id: 61, type: "warden", hp: 100, hpMax: 100 });

  it("an engineer offers repair on wreckage and on a hurt deck, not on a whole one", () => {
    const wreck = building({ id: 62, type: "bridge", ownerId: "", hp: 1, hpMax: 240, ruined: true });
    const hurt = building({ id: 63, type: "bigbridge", ownerId: "", hp: 900, hpMax: 1700 });
    const whole = building({ id: 64, type: "bridge", ownerId: "", hp: 240, hpMax: 240 });
    assert.equal(act({ selected: [eng], hit: wreck }), "repair");
    assert.equal(act({ selected: [eng], hit: hurt }), "repair");
    assert.equal(act({ selected: [eng], hit: whole }), null);
  });

  it("guns never offer attack on a bridge: a right-click is a move onto it", () => {
    const whole = building({ id: 65, type: "bridge", ownerId: "", hp: 240, hpMax: 240 });
    assert.equal(act({ selected: [tank], hit: whole }), null);
  });
});

describe("engineer repair cursor", () => {
  const eng = unit({ id: 50, type: "engineer" });

  it("offers repair on a full-health tank with a dead engine or broken tracks", () => {
    const whole = unit({ id: 51, type: "warden", hp: 100, hpMax: 100 });
    assert.equal(act({ selected: [eng], hit: whole }), null);
    for (const crit of ["engine", "tracks"] as const) {
      const hurt = unit({ id: 52, type: "warden", hp: 100, hpMax: 100, crits: [crit] });
      assert.equal(act({ selected: [eng], hit: hurt }), "repair");
    }
  });

  it("offers repair on a full-health hull or tower with a smashed spotlight", () => {
    const tank = unit({ id: 59, type: "warden", hp: 100, hpMax: 100, crits: ["lamp"] });
    const tower = building({ id: 60, type: "tower", hp: 400, hpMax: 400, crits: ["lamp"] });
    const whole = building({ id: 61, type: "tower", hp: 400, hpMax: 400 });
    assert.equal(act({ selected: [eng], hit: tank }), "repair");
    assert.equal(act({ selected: [eng], hit: tower }), "repair");
    assert.notEqual(act({ selected: [eng], hit: whole }), "repair");
  });

  it("offers repair on a damaged concrete wall", () => {
    const standing = building({ id: 56, type: "wall", hp: 120, hpMax: 120 });
    const chipped = building({ id: 57, type: "wall", hp: 40, hpMax: 120 });
    const foe = building({ id: 58, type: "wall", hp: 40, hpMax: 120, ownerId: FOE });
    assert.equal(act({ selected: [eng], hit: standing }), null);
    assert.equal(act({ selected: [eng], hit: chipped }), "repair");
    assert.notEqual(act({ selected: [eng], hit: foe }), "repair");
  });

  it("offers repair on shelled sandbags only", () => {
    const standing = building({ id: 53, type: "sandbags", hp: 30, hpMax: 30 });
    const shelled = building({ id: 54, type: "sandbags", hp: 30, hpMax: 30, ruined: true });
    const foeShelled = building({ id: 55, type: "sandbags", hp: 30, hpMax: 30, ruined: true, ownerId: FOE });
    assert.equal(act({ selected: [eng], hit: standing }), null);
    assert.equal(act({ selected: [eng], hit: shelled }), "repair");
    assert.notEqual(act({ selected: [eng], hit: foeShelled }), "repair");
  });
});

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

  it("does not capture with a Cyborg or a Cyborg Commander; they attack the building", () => {
    const cyborg = unit({ id: 61, type: "cyborg" });
    const commander = unit({ id: 62, type: "cyborgcommander" });
    assert.equal(act({ selected: [cyborg], hit: foeCore }), "attack");
    assert.equal(act({ selected: [commander], hit: foeCore }), "attack");
    assert.equal(act({ selected: [cyborg, commander], hit: foeCore }), "attack");
    assert.equal(act({ selected: [cyborg, trooper], hit: foeCore }), "capture");
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

  it("ignores wrecks: only a force-attack shoots at one", () => {
    const wreck = unit({ id: 40, type: "warden", ownerId: FOE, wreck: true, hp: 30 });
    const ownWreck = unit({ id: 41, type: "warden", ownerId: YOU, wreck: true, hp: 30 });
    const corpse = unit({ id: 42, type: "rifleman", ownerId: FOE, wreck: true, hp: 1 });
    assert.equal(act({ selected: [trooper], hit: wreck }), null);
    assert.equal(act({ selected: [trooper], hit: ownWreck }), null);
    assert.equal(act({ selected: [trooper], hit: corpse }), null);
  });

  it("sends an engineer to scrap an armored wreck", () => {
    const eng = unit({ id: 7, type: "engineer", hp: 40 });
    const wreck = unit({ id: 40, type: "warden", ownerId: FOE, wreck: true, hp: 30 });
    assert.equal(act({ selected: [eng], hit: wreck }), "scrap");
    assert.equal(act({ selected: [eng], hit: unit({ id: 41, type: "warden", ownerId: YOU, wreck: true, hp: 10 }) }), "scrap");
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

  it("boards ground units onto your transport parked for paratroops", () => {
    const ready = unit({ id: 60, type: "bv222", hp: 220, air: { phase: "parked", alt: 0, payload: "troops", troops: 3 } });
    const mines = unit({ id: 61, type: "bv222", hp: 220, air: { phase: "parked", alt: 0, payload: "mines", troops: 0 } });
    const aloft = unit({ id: 62, type: "bv222", hp: 220, air: { phase: "fly", alt: 16, payload: "troops", troops: 3 } });
    const full = unit({ id: 63, type: "bv222", hp: 220, air: { phase: "parked", alt: 0, payload: "troops", troops: 10 } });
    const gunner = unit({ id: 64, type: "gunner" });
    const stuka = unit({ id: 66, type: "stuka", air: { phase: "parked", alt: 0 } });
    const up = unit({ id: 67, type: "jumpjet", jet: { alt: 8 } });
    const braced = unit({ id: 68, type: "titan", braced: true });
    const crate = unit({ id: 69, type: "bv222", hp: 220, air: { phase: "parked", alt: 0, payload: "crate", troops: 0 } });
    assert.equal(act({ selected: [trooper], hit: ready }), "board");
    assert.equal(act({ selected: [gunner], hit: ready }), "board");
    assert.equal(act({ selected: [warden], hit: ready }), "board");
    assert.equal(act({ selected: [trooper], hit: mines }), "board");
    assert.equal(act({ selected: [gunner], hit: crate }), "board");
    assert.equal(act({ selected: [trooper, warden], hit: mines }), "board");
    assert.notEqual(act({ selected: [warden], hit: mines }), "board");
    assert.notEqual(act({ selected: [warden], hit: crate }), "board");
    assert.notEqual(act({ selected: [trooper], hit: aloft }), "board");
    assert.notEqual(act({ selected: [trooper], hit: full }), "board");
    assert.notEqual(act({ selected: [stuka], hit: ready }), "board");
    assert.notEqual(act({ selected: [up], hit: ready }), "board");
    assert.notEqual(act({ selected: [braced], hit: ready }), "board");
  });

  it("offers ammo to a CIWS that has fired, and not to a full one or a plain structure", () => {
    const crewed = unit({ id: 41, type: "supply", bed: { crew: true, seats: 0 }, supply: 120 });
    const spent = building({ id: 50, type: "ciws", clip: 400 });
    const full = building({ id: 51, type: "ciws", clip: catalog("ciws").belt });
    const dynamo = building({ id: 52, type: "dynamo" });
    assert.equal(act({ selected: [crewed], hit: spent }), "supply");
    assert.notEqual(act({ selected: [crewed], hit: full }), "supply");
    assert.notEqual(act({ selected: [crewed], hit: dynamo }), "supply");
  });

  it("offers rockets to a Titan with a spent rack even when its gun is full", () => {
    const crewed = unit({ id: 41, type: "supply", bed: { crew: true, seats: 0 }, supply: 120 });
    const def = catalog("titan");
    const loaded = { ammo: { ...def.ammo }, mgAmmo: def.mgAmmo };
    const spent = unit({ id: 60, type: "titan", ...loaded, rockets: 0 });
    const full = unit({ id: 61, type: "titan", ...loaded, rockets: def.rocketAmmo });
    assert.equal(act({ selected: [crewed], hit: spent }), "supply");
    assert.notEqual(act({ selected: [crewed], hit: full }), "supply");
  });

  it("offers disable on a mine when a crewed supply truck is selected", () => {
    const crewed = unit({ id: 41, type: "supply", bed: { crew: true, seats: 0 }, supply: 120 });
    const open = unit({ id: 42, type: "supply", bed: { seats: 0, open: true } });
    const rifle = unit({ id: 43, type: "rifleman" });
    const foe = unit({ id: 44, type: "rifleman", ownerId: FOE });
    assert.equal(act({ selected: [crewed], mine: true }), "disable");
    assert.equal(act({ selected: [open], mine: true }), null);
    assert.equal(act({ selected: [rifle], mine: true }), null);
    assert.equal(act({ selected: [crewed] }), null);
    assert.equal(act({ selected: [crewed], hit: foe, mine: true }), "attack");
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

describe("resolveHoverAction bunker", () => {
  const rifle = unit({ id: 1, type: "rifleman" });
  const mortar = unit({ id: 2, type: "mortarman" });
  const yourBunker = building({ id: 40, type: "bunker", ownerId: YOU, garrison: { count: 0, cap: 5 } });
  const allyBunker = building({ id: 41, type: "bunker", ownerId: ALLY, garrison: { count: 0, cap: 5 } });
  const foeBunker = building({ id: 42, type: "bunker", ownerId: FOE, garrison: { count: 0, cap: 5 } });

  it("offers Enter on your own or an ally's empty bunker", () => {
    assert.equal(act({ selected: [rifle], hit: yourBunker }), "garrison");
    assert.equal(act({ selected: [rifle], hit: allyBunker }), "garrison");
  });

  it("does not offer Enter to a mortarman, who does not fit", () => {
    assert.notEqual(act({ selected: [mortar], hit: yourBunker }), "garrison");
    assert.equal(act({ selected: [mortar, rifle], hit: yourBunker }), "garrison");
  });

  it("treats an empty enemy bunker as a structure to shell, not to enter or capture", () => {
    assert.equal(act({ selected: [rifle], hit: foeBunker }), "attack");
    assert.equal(act({ selected: [unit({ id: 3, type: "warden" })], hit: foeBunker }), "attack");
  });
});

describe("resolveHoverAction trench", () => {
  const rifle = unit({ id: 1, type: "rifleman" });
  const mortar = unit({ id: 2, type: "mortarman" });
  const eng = unit({ id: 3, type: "engineer" });
  const empty = building({ id: 80, type: "trench", hp: 400, hpMax: 400, garrison: { count: 0, cap: 1 } });
  const full = building({ id: 81, type: "trench", hp: 400, hpMax: 400, garrison: { count: 1, cap: 1, ownerId: YOU } });

  it("offers Enter to a mortarman, unlike the bunker", () => {
    assert.equal(act({ selected: [mortar], hit: empty }), "garrison");
    assert.equal(act({ selected: [rifle], hit: empty }), "garrison");
  });

  it("offers nothing to enter once the one place is taken", () => {
    assert.notEqual(act({ selected: [rifle], hit: full }), "garrison");
  });

  it("lets an engineer repair a damaged trench", () => {
    const hurt = building({ id: 82, type: "trench", hp: 200, hpMax: 400, garrison: { count: 0, cap: 1 } });
    assert.equal(act({ selected: [eng], hit: hurt }), "repair");
  });
});

describe("plane return-to-airfield cursor", () => {
  const plane = unit({ id: 70, type: "stuka", air: { phase: "fly", alt: 6 } });
  const strip = building({ id: 71, type: "airfield" });

  it("offers land on your own airfield when a plane is selected", () => {
    assert.equal(act({ selected: [plane], hit: strip }), "land");
    assert.equal(act({ selected: [plane, unit({ id: 72, type: "rifleman" })], hit: strip }), "land");
  });

  it("does not offer land without a plane, for a drone, on a foe's strip, or on a dead one", () => {
    assert.equal(act({ selected: [unit({ id: 73, type: "rifleman" })], hit: strip }), null);
    const drone = unit({ id: 74, type: "stuka", air: { phase: "fly", alt: 4 }, drone: { mode: "surveil" } });
    assert.equal(act({ selected: [drone], hit: strip }), null);
    assert.equal(act({ selected: [plane], hit: building({ id: 75, type: "airfield", ownerId: FOE }) }), "attack");
    assert.equal(act({ selected: [plane], hit: building({ id: 76, type: "airfield", hp: 0 }) }), null);
  });
});

describe("resolveHoverAction field gun", () => {
  const gun = (partial: Partial<HoverEntity> = {}) =>
    unit({ id: 50, type: "artillery", hp: 160, gun: { crew: 1, cap: 2 }, ...partial });

  it("a supply truck hitches your gun, then resupplies it once in tow", () => {
    const truck = unit({ id: 1, type: "supply", bed: { crew: true } });
    assert.equal(act({ selected: [truck], hit: gun() }), "tow");
    const hitched = { ...truck, towing: 50 };
    const short = gun({ gun: { crew: 2, cap: 2, towedBy: 1 }, ammo: { he: 2 } });
    assert.equal(act({ selected: [hitched], hit: short }), "supply");
  });

  it("infantry man your gun one short, or take an empty enemy gun", () => {
    const rifle = unit({ id: 2, type: "rifleman" });
    assert.equal(act({ selected: [rifle], hit: gun() }), "board");
    assert.equal(act({ selected: [rifle], hit: gun({ gun: { crew: 2, cap: 2 } }) }), null);
    assert.equal(act({ selected: [rifle], hit: gun({ ownerId: FOE, gun: { crew: 0, cap: 2 } }) }), "board");
    assert.equal(act({ selected: [rifle], hit: gun({ ownerId: FOE }) }), "attack");
  });
});

describe("Transport LST boarding cursor", () => {
  const lst = unit({ id: 50, type: "lst", hp: 700, garrison: { count: 0, cap: 40 } });

  it("offers a tank or a soldier your LST's ramp", () => {
    assert.equal(act({ selected: [unit({ id: 1, type: "warden", hp: 120 })], hit: lst }), "garrison");
    assert.equal(act({ selected: [unit({ id: 2, type: "rifleman" })], hit: lst }), "garrison");
  });

  it("still keeps a tank out of a Bunker", () => {
    const bunker = building({ id: 60, type: "bunker", garrison: { count: 0, cap: 5 } });
    assert.notEqual(act({ selected: [unit({ id: 1, type: "warden", hp: 120 })], hit: bunker }), "garrison");
  });

  it("does not offer a boat or the LST itself a ride", () => {
    assert.notEqual(act({ selected: [unit({ id: 3, type: "gunboat", hp: 70 })], hit: lst }), "garrison");
    assert.notEqual(act({ selected: [lst], hit: lst }), "garrison");
  });
});
