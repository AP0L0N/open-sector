import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityView, MatchSnapshot } from "@gridlock/shared";
import { impactSound, SoundTracker, type SoundEvent } from "./sound-events.js";

const ME = "p1";

function unit(id: number, type: string, ownerId = ME, extra: Partial<EntityView> = {}): EntityView {
  return { id, kind: "unit", type, ownerId, x: id * 10, y: 5, hp: 100, hpMax: 100, ...extra } as EntityView;
}

function building(id: number, type: string, ownerId = ME, extra: Partial<EntityView> = {}): EntityView {
  return { id, kind: "building", type, ownerId, x: id, y: id, hp: 1000, hpMax: 1000, ...extra } as EntityView;
}

function snap(over: Partial<MatchSnapshot> = {}, you: Partial<MatchSnapshot["you"]> = {}): MatchSnapshot {
  return {
    youPlayerId: ME,
    you: { lowPower: false, structureQueue: null, defenceQueue: null, lineQueue: null, ...you },
    players: [
      { playerId: ME, name: "a", colorId: 0, team: 1, alive: true },
      { playerId: "p2", name: "b", colorId: 1, team: 2, alive: true },
    ],
    entities: [],
    projectiles: [],
    impacts: [],
    launches: [],
    bodies: [],
    ...over,
  } as unknown as MatchSnapshot;
}

function kinds(evs: SoundEvent[], kind: SoundEvent["kind"]): SoundEvent[] {
  return evs.filter((e) => e.kind === kind);
}

describe("SoundTracker", () => {
  it("announces the start once and stays quiet about what was already there", () => {
    const t = new SoundTracker();
    const first = t.step(snap({ entities: [unit(1, "rifleman")], bodies: [{ id: 9, type: "rifleman", ownerId: ME, x: 0, y: 0 }] as never }), 0);
    assert.deepEqual(first, [{ kind: "announce", event: "start" }]);
    assert.deepEqual(t.step(snap({ entities: [unit(1, "rifleman")] }), 100), []);
  });

  it("hears a new projectile as its shooter firing, once per shot", () => {
    const t = new SoundTracker();
    const ents = [unit(1, "ss3"), unit(2, "rifleman", "p2")];
    t.step(snap({ entities: ents }), 0);
    const shot = { id: 50, fromId: 1, x: 0, y: 0, vx: 1, vy: 0, caliber: 75, bounced: false };
    const evs = t.step(snap({ entities: ents, projectiles: [shot] as never }), 100);
    assert.deepEqual(kinds(evs, "fire"), [{ kind: "fire", id: 1, type: "ss3", weapon: "shell", x: 10, y: 5 }]);
    assert.equal(kinds(t.step(snap({ entities: ents, projectiles: [shot] as never }), 200), "fire").length, 0);
  });

  it("hears one salvo for a ripple of rockets, and never mutes the Titan's gun with it", () => {
    const t = new SoundTracker();
    const ents = [unit(1, "titan")];
    t.step(snap({ entities: ents }), 0);
    const launch = (id: number) => ({ id, fromId: 1, x: 0, y: 0, z: 0, vx: 1, vy: 0 });
    const shell = { id: 90, fromId: 1, x: 0, y: 0, vx: 1, vy: 0, caliber: 75, bounced: false };
    const evs = t.step(snap({ entities: ents, launches: [launch(10), launch(11), launch(12), launch(13)] as never, projectiles: [shell] as never }), 100);
    assert.deepEqual(
      kinds(evs, "fire").map((e) => (e as { weapon: string }).weapon).sort(),
      ["rocket", "shell"],
    );
    assert.equal(kinds(t.step(snap({ entities: ents, launches: [launch(14)] as never }), 1000), "fire").length, 0);
    assert.equal(kinds(t.step(snap({ entities: ents, launches: [launch(15)] as never }), 3000), "fire").length, 1);
  });

  it("hears one broadside for a battleship's barrels", () => {
    const t = new SoundTracker();
    const ents = [unit(1, "battleship")];
    t.step(snap({ entities: ents }), 0);
    const barrel = (id: number) => ({ id, fromId: 1, x: 0, y: 0, vx: 1, vy: 0, caliber: 406, bounced: false, mortar: true });
    const evs = t.step(snap({ entities: ents, projectiles: [barrel(1), barrel(2), barrel(3)] as never }), 100);
    assert.equal(kinds(evs, "fire").length, 1);
  });

  it("tags a tank's machine gun as small arms, apart from its cannon", () => {
    const t = new SoundTracker();
    const ents = [unit(1, "warden")];
    t.step(snap({ entities: ents }), 0);
    const mg = { id: 7, kind: "miss", fromId: 1, caliber: 8, x: 0, y: 0, vx: 0, vy: 0, ownerId: ME };
    assert.deepEqual(kinds(t.step(snap({ entities: ents, impacts: [mg] as never }), 100), "fire"), [
      { kind: "fire", id: 1, type: "warden", weapon: "small", x: 10, y: 5 },
    ]);
  });

  it("throttles a machine gun's hitscan rounds into bursts", () => {
    const t = new SoundTracker();
    const ents = [unit(1, "gunner")];
    t.step(snap({ entities: ents }), 0);
    const hit = (id: number) => ({ id, kind: "miss", fromId: 1, caliber: 8, x: 0, y: 0, vx: 0, vy: 0, ownerId: ME });
    assert.equal(kinds(t.step(snap({ entities: ents, impacts: [hit(1), hit(2), hit(3)] as never }), 100), "fire").length, 1);
    assert.equal(kinds(t.step(snap({ entities: ents, impacts: [hit(4)] as never }), 200), "fire").length, 0);
    assert.equal(kinds(t.step(snap({ entities: ents, impacts: [hit(5)] as never }), 700), "fire").length, 1);
  });

  it("greets a new unit of yours with its ready line and the announcer", () => {
    const t = new SoundTracker();
    t.step(snap(), 0);
    const evs = t.step(snap({ entities: [unit(7, "sniper"), unit(8, "pyro", "p2")] }), 100);
    assert.deepEqual(kinds(evs, "voice"), [{ kind: "voice", type: "sniper", event: "ready" }]);
    assert.deepEqual(kinds(evs, "announce"), [{ kind: "announce", event: "ready" }]);
  });

  it("hears a new body as a death cry, and your own as a unit lost", () => {
    const t = new SoundTracker();
    t.step(snap(), 0);
    const evs = t.step(snap({ bodies: [{ id: 3, type: "medic", ownerId: ME, x: 1, y: 2 }] as never }), 100);
    assert.deepEqual(kinds(evs, "death"), [{ kind: "death", type: "medic", infantry: true, x: 1, y: 2 }]);
    assert.deepEqual(kinds(evs, "announce"), [{ kind: "announce", event: "unitlost" }]);
  });

  it("hears a hull turning into a wreck as the vehicle dying", () => {
    const t = new SoundTracker();
    t.step(snap({ entities: [unit(1, "ss3", "p2")] }), 0);
    const evs = t.step(snap({ entities: [unit(1, "ss3", "p2", { wreck: true })] }), 100);
    assert.deepEqual(kinds(evs, "death"), [{ kind: "death", type: "ss3", infantry: false, x: 10, y: 5 }]);
    assert.equal(kinds(evs, "announce").length, 0);
  });

  it("warns once about the base under attack, then waits", () => {
    const t = new SoundTracker();
    t.step(snap({ entities: [building(1, "dynamo")] }), 0);
    const hurt = (hp: number) => snap({ entities: [building(1, "dynamo", ME, { hp })] });
    assert.deepEqual(kinds(t.step(hurt(900), 100), "announce"), [{ kind: "announce", event: "underattack" }]);
    assert.equal(kinds(t.step(hurt(800), 5000), "announce").length, 0);
    assert.equal(kinds(t.step(hurt(700), 40_000), "announce").length, 1);
  });

  it("does not hear a brace or pack-up, which rescales hp, as damage", () => {
    const t = new SoundTracker();
    t.step(snap({ entities: [unit(1, "titan", ME, { hp: 700, hpMax: 700 })] }), 0);
    assert.equal(kinds(t.step(snap({ entities: [unit(1, "titan", ME, { hp: 400, hpMax: 400 })] }), 100), "announce").length, 0);
    assert.equal(kinds(t.step(snap({ entities: [unit(1, "titan", ME, { hp: 300, hpMax: 400 })] }), 200), "announce").length, 1);
  });

  it("calls a destroyed building lost, but not a sold one at full health", () => {
    const t = new SoundTracker();
    t.step(snap({ entities: [building(1, "dynamo", ME, { hp: 100 }), building(2, "smelter")] }), 0);
    const evs = t.step(snap(), 100);
    assert.deepEqual(kinds(evs, "announce"), [{ kind: "announce", event: "buildinglost" }]);
    assert.deepEqual(kinds(evs, "impact"), [{ kind: "impact", sound: "explosion_building", x: 1, y: 1 }]);
  });

  it("follows power and the construction lane", () => {
    const t = new SoundTracker();
    t.step(snap(), 0);
    const q = (ready: boolean) => ({ type: "dynamo", progressTicks: 0, totalTicks: 10, ready, paused: false });
    const ann = (s: MatchSnapshot, now: number) => kinds(t.step(s, now), "announce").map((e) => (e as { event: string }).event);
    assert.deepEqual(ann(snap({}, { structureQueue: q(false) as never }), 100), ["building"]);
    assert.deepEqual(ann(snap({}, { structureQueue: q(true) as never }), 200), ["complete"]);
    assert.deepEqual(ann(snap({}, { lowPower: true }), 300), ["lowpower"]);
    assert.deepEqual(ann(snap({}, { lowPower: false }), 400), ["powerrestored"]);
  });

  it("tells a winner's team victory and the rest defeat", () => {
    const won = new SoundTracker();
    won.step(snap(), 0);
    assert.deepEqual(kinds(won.step(snap({ winner: { playerId: "x", team: 1 } }), 1), "announce"), [{ kind: "announce", event: "victory" }]);
    const lost = new SoundTracker();
    lost.step(snap(), 0);
    assert.deepEqual(kinds(lost.step(snap({ winner: { playerId: "p2", team: 2 } }), 1), "announce"), [{ kind: "announce", event: "defeat" }]);
  });
});

describe("impactSound", () => {
  const base = { id: 1, ownerId: ME, x: 0, y: 0, vx: 0, vy: 0 };
  it("keeps bullets quiet and gives shells a voice by what they did", () => {
    assert.equal(impactSound({ ...base, kind: "miss", caliber: 8 }), null);
    assert.equal(impactSound({ ...base, kind: "ricochet", caliber: 75 }), "ricochet");
    assert.equal(impactSound({ ...base, kind: "pen", caliber: 75 }), "penetrate");
    assert.equal(impactSound({ ...base, kind: "kill", caliber: 128 }), "explosion_large");
    assert.equal(impactSound({ ...base, kind: "miss", caliber: 60, mortar: true }), "explosion_small");
    assert.equal(impactSound({ ...base, kind: "miss", caliber: 75, splash: true }), "splash");
    assert.equal(impactSound({ ...base, kind: "miss", caliber: 20, intercept: true }), "intercept");
  });
});
