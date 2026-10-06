import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { NEUTRAL_OWNER, TILE_SUBDIV } from "../catalog.js";
import { TILE_EMPTY, getMap, registerMap, type MapFeature, type MapUnit } from "../maps.js";
import { canGarrison, enterGarrison, livingGarrison } from "./garrison.js";
import { spotlightManned } from "./night.js";
import { makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import type { Entity, MatchState } from "./types.js";

/** Scrap Yard, flat and open, with these neutral units and buildings on it. */
function neutralMatch(units: MapUnit[], features: MapFeature[] = []): { state: MatchState; a: string } {
  const yard = getMap("yard-64")!;
  const id = `yard-units-${Math.random().toString(36).slice(2, 8)}`;
  registerMap({
    ...yard,
    id,
    tiles: yard.tiles.map(() => TILE_EMPTY),
    heights: yard.heights.map(() => 0),
    maxHeight: 0,
    features,
    units,
  });
  const r = createRoom({ id: "NU", hostId: "A", hostName: "Alpha", mapId: id, maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4 });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), a: "A" };
}

function neutrals(state: MatchState): Entity[] {
  return [...state.entities.values()].filter((e) => e.kind === "unit" && e.ownerId === NEUTRAL_OWNER);
}

/** The middle of the yard, well clear of every start. */
const MID = 32 * TILE_SUBDIV;

describe("neutral map units", () => {
  it("stand grey and no one's, guarding their heading", () => {
    const { state } = neutralMatch([{ type: "rifleman", x: MID, y: MID, facing: 90 }]);
    const [n] = neutrals(state);
    assert.ok(n);
    assert.equal(n.holdPosition, true);
    assert.equal(n.order?.kind, "guard");
    assert.ok(Math.abs(n.facing - Math.PI / 2) < 1e-6, "faces south");
    assert.ok(Math.abs((n.guardFacing ?? 0) - Math.PI / 2) < 1e-6);
  });

  it("fire on a commander's man in sight and never leave their post", () => {
    const { state, a } = neutralMatch([{ type: "rifleman", x: MID, y: MID, facing: 0 }]);
    const [n] = neutrals(state);
    const ts = state.tileSize;
    const victim = makeEntity(state, "rifleman", a, tileCenter(MID + 10, ts), tileCenter(MID, ts));
    victim.holdPosition = true;
    const start = { x: n!.x, y: n!.y };
    const hp = victim.hp;
    for (let i = 0; i < 200 && victim.hp >= hp; i++) step(state);
    assert.ok(victim.hp < hp, "the neutral shot him");
    assert.ok(Math.hypot(n!.x - start.x, n!.y - start.y) < ts, "it stayed put");
  });

  it("do not chase a man who stays out of reach", () => {
    const { state, a } = neutralMatch([{ type: "rifleman", x: MID, y: MID, facing: 0 }]);
    const [n] = neutrals(state);
    const ts = state.tileSize;
    // Far beyond rifle reach: a chaser would walk off its post toward him.
    const far = makeEntity(state, "rifleman", a, tileCenter(MID + 70, ts), tileCenter(MID, ts));
    far.holdPosition = true;
    const start = { x: n!.x, y: n!.y };
    for (let i = 0; i < 120; i++) step(state);
    assert.ok(Math.hypot(n!.x - start.x, n!.y - start.y) < ts);
  });

  it("walk the patrol the map gives them", () => {
    const { state } = neutralMatch([
      { type: "rifleman", x: MID, y: MID, facing: 0, patrol: [{ x: MID + 20, y: MID }], loop: false },
    ]);
    const [n] = neutrals(state);
    assert.equal(n!.order?.kind, "patrol");
    const route = n!.order!.route!;
    const len = route.length;
    assert.equal(len, 2, "from where it stands to the click");
    const x0 = n!.x;
    for (let i = 0; i < 60; i++) step(state);
    assert.ok(n!.x > x0 + state.tileSize, "it set off along the route");
  });

  it("garrison the bunker they were put in, and keep commanders out", () => {
    const bunker: MapFeature = { type: "bunker", x: MID, y: MID, facing: 0 };
    const { state, a } = neutralMatch(
      [
        { type: "rifleman", x: MID + 1, y: MID + 1, facing: 0, inside: true },
        { type: "gunner", x: MID + 1, y: MID + 1, facing: 0, inside: true },
      ],
      [bunker],
    );
    const house = [...state.entities.values()].find((e) => e.type === "bunker")!;
    assert.equal(livingGarrison(state, house).length, 2);
    assert.equal(house.ownerId, NEUTRAL_OWNER, "the bunker stays no one's");
    const ts = state.tileSize;
    const man = makeEntity(state, "rifleman", a, tileCenter(MID - 4, ts), tileCenter(MID, ts));
    assert.equal(canGarrison(state, man, house), "Held by the enemy.");
  });

  it("are someone else's on every commander's screen", () => {
    const { state, a } = neutralMatch([{ type: "rifleman", x: MID, y: MID, facing: 0 }]);
    const [n] = neutrals(state);
    const ts = state.tileSize;
    makeEntity(state, "rifleman", a, tileCenter(MID + 6, ts), tileCenter(MID, ts));
    step(state);
    const seen = snapshotFor(state, a).entities.find((e) => e.id === n!.id);
    assert.ok(seen, "in sight, it is drawn");
    assert.ok(!seen.ownerId, "and belongs to no one");
  });
});

describe("map spotlights", () => {
  const towerAt = (extra: Partial<MapFeature> = {}): MapFeature => ({ type: "tower", x: MID, y: MID, facing: 0, ...extra });
  const lampOf = (state: MatchState, type: string): Entity => [...state.entities.values()].find((e) => e.type === type)!;
  const near = (a: number, b: number): boolean => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.02;

  it("rest the tower's lamp where the map points it, dark until someone holds it", () => {
    const { state, a } = neutralMatch([], [towerAt({ spot: 90 })]);
    const tower = lampOf(state, "tower");
    assert.ok(near(tower.spotFacing!, Math.PI / 2), "points south");
    assert.equal(spotlightManned(tower), false);
    const climber = makeEntity(state, "rifleman", a, tower.x, tower.y + 40);
    assert.equal(enterGarrison(state, climber, tower), true);
    step(state);
    assert.ok(near(tower.spotFacing!, Math.PI / 2), "the first holder finds it where the map left it");
  });

  it("hand the map's sweep to whoever takes the tower", () => {
    const { state, a } = neutralMatch([], [towerAt({ patrol: [{ x: MID + 40, y: MID }, { x: MID, y: MID + 40 }], loop: true })]);
    const tower = lampOf(state, "tower");
    assert.equal(tower.order?.kind, "patrol");
    assert.equal(tower.order?.loop, true);
    const climber = makeEntity(state, "rifleman", a, tower.x, tower.y + 40);
    assert.equal(enterGarrison(state, climber, tower), true);
    const seen = new Set<number>();
    for (let i = 0; i < 20 * 60; i++) {
      step(state);
      seen.add(Math.round((tower.spotFacing! * 180) / Math.PI / 10));
    }
    assert.equal(tower.order?.kind, "patrol", "the sweep runs on");
    assert.ok(seen.size > 4, "the beam swings between the points");
  });

  it("light a neutral Battle Ship's searchlight where the map points it", () => {
    const { state } = neutralMatch([{ type: "battleship", x: MID, y: MID, facing: 0, spot: 180 }]);
    const ship = lampOf(state, "battleship");
    assert.equal(spotlightManned(ship), true, "a ship is always crewed");
    assert.ok(near(ship.spotFacing!, Math.PI), "points west off the bow");
    step(state);
    assert.ok(near(ship.spotFacing!, Math.PI));
  });
});
