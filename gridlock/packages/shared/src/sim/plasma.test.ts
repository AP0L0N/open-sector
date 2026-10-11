import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startMatch, updateSelf } from "../lobby.js";
import { TICK_DT, TILE_SUBDIV, catalog, isCivilianType, plasmaCellOf, secondsToTicks, type EntityType } from "../catalog.js";
import { TILE_BLOCKED, TILE_EMPTY, TILE_TREE } from "../maps.js";
import { applyCommand } from "./commands.js";
import { destroyEntity, makeEntity, tileCenter } from "./geo.js";
import { createMatch, step } from "./match.js";
import { snapshotFor } from "./snapshot.js";
import { fireLaser } from "./laser.js";
import { drawPlasma, plasmaShots, resumeShots } from "./hive-ammo.js";
import type { EnergyShield, Entity, MatchState } from "./types.js";

/** A is Alliance, B the Xenite, on bare flat ground, nothing but what a test places. */
function field(): MatchState {
  const r = createRoom({ id: "PLS", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
  if (!r.ok) throw new Error(r.message);
  const room = r.value;
  assert.equal(joinRoom(room, "B", "Bravo").ok, true);
  updateSelf(room, "A", { ready: true, spawnId: 1 });
  updateSelf(room, "B", { ready: true, spawnId: 4, faction: "xeno" });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  const state = createMatch(room, started.value);
  state.heights.fill(0);
  state.occupy.fill(0);
  for (let i = 0; i < state.terrain.length; i++) {
    const t = state.terrain[i];
    if (t === TILE_TREE || t === TILE_BLOCKED) state.terrain[i] = TILE_EMPTY;
  }
  state.blocked.fill(0);
  for (const e of [...state.entities.values()]) if (isCivilianType(e.type)) destroyEntity(state, e);
  return state;
}

function ticks(state: MatchState, n: number, each?: () => void): void {
  for (let i = 0; i < n; i++) {
    step(state, TICK_DT);
    each?.();
  }
}

function at(state: MatchState, type: EntityType, owner: string, cx: number, cy: number): Entity {
  const ts = state.tileSize;
  return makeEntity(state, type, owner, tileCenter(Math.round(cx * TILE_SUBDIV), ts), tileCenter(Math.round(cy * TILE_SUBDIV), ts));
}

function still(e: Entity): Entity {
  e.holdPosition = true;
  e.cooldown = 1e9;
  return e;
}

describe("plasma cannon energy cell", () => {
  it("every Xenite plasma cannon carries a cell", () => {
    for (const t of ["stalker", "ravager", "behemoth", "pulsespire", "leech"] as const) {
      const cell = plasmaCellOf(t);
      assert.ok(cell && cell.shots >= 1 && cell.rechargeSeconds > 0, t);
    }
    assert.equal(plasmaCellOf("warden"), undefined);
  });

  /** A Leech laying fire on bare ground six cells off. Counts the shots the cell gives up. */
  function firing(): { state: MatchState; s: Entity; shots: () => number } {
    const state = field();
    const s = at(state, "leech", "B", 20, 30);
    const aim = at(state, "rifleman", "B", 26, 30);
    const x = aim.x;
    const y = aim.y;
    destroyEntity(state, aim);
    assert.equal(applyCommand(state, "B", { type: "cmd.forceattack", ids: [s.id], x, y }).ok, true);
    const full = plasmaCellOf("leech")!.shots;
    let n = 0;
    const shots = () => {
      const before = s.energy ?? full;
      step(state, TICK_DT);
      if ((s.energy ?? full) < before) n++;
      return n;
    };
    return { state, s, shots };
  }

  it("waits on an empty cell, and fires again once a shot regrows", () => {
    const { s, shots } = firing();
    const cell = plasmaCellOf("leech")!;
    s.energy = 0;
    for (let i = 0; i < secondsToTicks(cell.rechargeSeconds * 0.8); i++) shots();
    assert.equal(shots(), 0, "no bolt on an empty cell");
    for (let i = 0; i < secondsToTicks(cell.rechargeSeconds * 0.4); i++) shots();
    assert.equal(shots(), 1, "one bolt on the regrown shot");
    assert.ok((s.energy ?? cell.shots) < 1, `the bolt drew it (${s.energy})`);
  });

  it("a full cell fires at the gun's cadence until it runs low, then at the cell's pace", () => {
    const { s, shots } = firing();
    const cell = plasmaCellOf("leech")!;
    const cd = catalog("leech").cooldown;
    const span = 60;
    for (let i = 0; i < secondsToTicks(span); i++) shots();
    const n = shots();
    // Endless at the gun's pace would be span/cd; the cell holds it to its stock plus what regrows.
    assert.ok(n < span / cd - 2, `${n} bolts in ${span}s`);
    assert.ok(n >= Math.floor(span / cell.rechargeSeconds), `${n} bolts in ${span}s`);
    assert.ok((s.energy ?? cell.shots) < 2, `cell drawn down (${s.energy})`);
  });

  it("the Ravager's repeater empties its cell, then fires only as fast as it regrows", () => {
    const state = field();
    const r = at(state, "ravager", "B", 20, 30);
    const aim = at(state, "rifleman", "B", 26, 30);
    const x = aim.x;
    const y = aim.y;
    destroyEntity(state, aim);
    assert.equal(applyCommand(state, "B", { type: "cmd.forceattack", ids: [r.id], x, y }).ok, true);
    const cell = plasmaCellOf("ravager")!;
    const span = 20;
    let bolts = 0;
    for (let i = 0; i < secondsToTicks(span); i++) {
      step(state, TICK_DT);
      // Its bolts are small-arms rounds: they land the tick they fly.
      for (const imp of state.impacts) if (imp.fromId === r.id) bolts++;
    }
    const free = (span / TICK_DT) * (catalog("ravager").shotsPerTick ?? 1);
    // Endless it would pour out `free` bolts; the cell holds it to its stock plus what regrows.
    assert.ok(bolts > cell.shots, `${bolts} bolts in ${span}s`);
    assert.ok(bolts < free / 2, `${bolts} bolts in ${span}s`);
    assert.ok(bolts <= cell.shots + span / cell.rechargeSeconds + 2, `${bolts} bolts in ${span}s`);
    // Run dry, it waits for a tenth of the cell, so it swings between empty and that mark.
    assert.ok((r.energy ?? cell.shots) < resumeShots(cell.shots) + 1, `cell drawn down (${r.energy})`);
  });

  it("run dry, it holds fire until a tenth of the cell regrows", () => {
    const state = field();
    const r = at(state, "ravager", "B", 20, 30);
    const aim = at(state, "rifleman", "B", 26, 30);
    const x = aim.x;
    const y = aim.y;
    destroyEntity(state, aim);
    const cell = plasmaCellOf("ravager")!;
    r.energy = 1;
    drawPlasma(r);
    assert.equal(r.energyDrained, true);
    assert.equal(plasmaShots(r), 0);
    assert.equal(applyCommand(state, "B", { type: "cmd.forceattack", ids: [r.id], x, y }).ok, true);
    const resume = resumeShots(cell.shots);
    assert.ok(resume > 1, "a tenth of the Ravager's cell is more than one bolt");
    const bolts = (n: number) => {
      let b = 0;
      for (let i = 0; i < n; i++) {
        step(state, TICK_DT);
        for (const imp of state.impacts) if (imp.fromId === r.id) b++;
      }
      return b;
    };
    assert.equal(bolts(secondsToTicks(cell.rechargeSeconds * resume * 0.9)), 0, "no bolt while the cell climbs back");
    assert.ok((r.energy ?? 0) >= 1, `a bolt's worth regrew meanwhile (${r.energy})`);
    assert.ok(bolts(secondsToTicks(cell.rechargeSeconds * resume * 0.3)) > 0, "fires again past a tenth");
  });

  it("the Spine Turret holds 30 rounds and, run dry, waits until 30% of the cell regrows", () => {
    const state = field();
    const t = at(state, "spineturret", "B", 20, 30);
    const cell = plasmaCellOf("spineturret")!;
    assert.equal(cell.shots, 30);
    t.energy = 1;
    drawPlasma(t);
    assert.equal(t.energyDrained, true);
    const resume = resumeShots(cell.shots, cell.resumeShare);
    assert.equal(resume, 9);
    ticks(state, secondsToTicks(cell.rechargeSeconds * (resume - 2)));
    assert.equal(t.energyDrained, true, "still climbing back to 30%");
    ticks(state, secondsToTicks(cell.rechargeSeconds * 3));
    assert.equal(t.energyDrained, undefined, "fires again once 30% has regrown");
  });

  it("every cell needs at least one shot back before it fires again", () => {
    for (const t of ["stalker", "ravager", "siphon", "behemoth", "pulsespire", "leech", "wasp", "scourge", "overseer", "weaver"] as const) {
      const cell = plasmaCellOf(t);
      if (cell) assert.equal(resumeShots(cell.shots), Math.max(1, cell.shots / 10), t);
    }
  });

  it("regrows to full and no further", () => {
    const state = field();
    const s = still(at(state, "stalker", "B", 20, 30));
    s.energy = 0;
    const cell = plasmaCellOf("stalker")!;
    ticks(state, secondsToTicks(cell.rechargeSeconds * (cell.shots + 2)));
    assert.equal(s.energy, cell.shots);
  });

  it("shows the charge to its owner only", () => {
    const state = field();
    const s = at(state, "stalker", "B", 20, 30);
    s.energy = 2;
    const own = snapshotFor(state, "B").entities.find((e) => e.id === s.id);
    assert.equal(own?.energy, 0.5);
    const foe = snapshotFor(state, "A").entities.find((e) => e.id === s.id);
    assert.equal(foe?.energy, undefined);
  });
});

describe("plasma and lasers do not ricochet", () => {
  it("a Xenite bolt the plate turns spends itself on it", () => {
    const state = field();
    const r = at(state, "ravager", "B", 20, 30);
    const tank = still(at(state, "jagdtiger", "A", 25, 30));
    tank.facing = Math.PI;
    assert.equal(applyCommand(state, "B", { type: "cmd.attack", ids: [r.id], targetId: tank.id }).ok, true);
    let ricochets = 0;
    let hits = 0;
    for (let i = 0; i < secondsToTicks(6); i++) {
      step(state, TICK_DT);
      assert.ok(!state.projectiles.some((p) => p.bounced), "no bolt flies on after the plate");
      for (const imp of state.impacts) {
        if (imp.fromId !== r.id) continue;
        if (imp.kind === "ricochet") ricochets++;
        else hits++;
      }
      state.impacts.length = 0;
    }
    assert.equal(ricochets, 0);
    assert.ok(hits > 0, "the bolts did reach the plate");
  });

  it("a straight laser beam glances off an enemy energy wall and spares the hull behind it", () => {
    const state = field();
    const cmdr = at(state, "cyborgcommander", "A", 20, 30);
    const tank = still(at(state, "stalker", "B", 28, 30));
    const hp = tank.hp;
    const wall: EnergyShield = { id: state.nextId++, ownerId: "B", fromId: tank.id, x: tank.x, y: tank.y, angle: Math.PI, half: 0.8, r: state.tileSize * 4, hp: 400, hpMax: 400, life: 10 };
    state.energyShields = [wall];
    fireLaser(state, cmdr, tank.x, tank.y, state.tileSize * 40, tank);
    assert.equal(tank.hp, hp, "the hull behind the wall is untouched");
    assert.ok(wall.hp < 400, "the wall took the beam");
    assert.ok(state.impacts.some((i) => i.laser && i.kind === "ricochet"), "it glances off");
    assert.ok((cmdr.laser?.lens[0] ?? 0) < Math.hypot(tank.x - cmdr.x, tank.y - cmdr.y), "the beam stops at the wall");
  });
});
