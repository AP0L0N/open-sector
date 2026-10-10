import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILD_RADIUS, DIAMOND_SCRAP_MUL, SCRAP_TILE_YIELD, SMELTER_SCRAP_PER_SEC, START_SCRAP, SUPPLY_CARGO, catalog, factionOf } from "../catalog.js";
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import type { AiDifficulty } from "../protocol.js";
import { AI_PROFILES } from "./ai-profile.js";
import {
  XENO_ARMY,
  CPU_ARMY,
  CPU_EXPAND_TILES,
  CPU_FLEET_MIN,
  CPU_SEA_REACH_TILES,
  aiPlanOf,
  diamondCentre,
  findBuildTile,
  findDiamondSmelterTile,
  findDockTile,
  findSmelterTile,
  rankOf,
  tickAi,
  waveSize,
} from "./ai.js";
import { TILE_WATER } from "../maps.js";
import { hasCore, inBuildRadius, isWater, makeEntity, scrapAt } from "./geo.js";
import { createMatch, stepMatch } from "./match.js";
import { smelterRateOn } from "./smelter.js";
import { producerType } from "./train.js";
import type { AiPlan, Entity, MatchState, Vec } from "./types.js";

function humanVsEasy(difficulty: AiDifficulty = "defensive"): { state: MatchState; aiId: string } {
  const made = createRoom({
    id: "AI1",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!made.ok) throw new Error(made.message);
  const room = made.value;
  const add = hostSlot(room, "A", 1, { status: "ai", ai: difficulty });
  if (!add.ok) throw new Error(add.message);
  updateSelf(room, "A", { ready: true });
  const started = startMatch(room, "A", () => 0);
  if (!started.ok) throw new Error(started.message);
  return { state: createMatch(room, started.value), aiId: "ai:1" };
}

function waitCore(state: MatchState, playerId: string, n = 40): void {
  for (let i = 0; i < n; i++) {
    if (hasCore(state, playerId)) return;
    stepMatch(state);
  }
  assert.equal(hasCore(state, playerId), true, `no core for ${playerId}`);
}

function coreOf(state: MatchState, aiId: string): Entity {
  return [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
}

/** Stand the CPU's factories around its Core, spaced clear of one another. */
function withBase(state: MatchState, aiId: string, types: Entity["type"][]): void {
  const hq = coreOf(state, aiId);
  const spots: [number, number][] = [
    [-12, 0],
    [16, 0],
    [0, 16],
    [0, -14],
    [16, 16],
    [-12, 16],
    [-12, -14],
    [-28, -14],
  ];
  types.forEach((type, i) => {
    const [dx, dy] = spots[i]!;
    makeEntity(state, type, aiId, hq.x + dx * 8, hq.y + dy * 8, { tileX: hq.tileX + dx, tileY: hq.tileY + dy });
  });
}

/** The second Smelter a standing base has, off to one side of the Core. */
function secondSmelter(state: MatchState, aiId: string): void {
  const hq = coreOf(state, aiId);
  makeEntity(state, "smelter", aiId, hq.x + 16 * 8, hq.y - 14 * 8, { tileX: hq.tileX + 16, tileY: hq.tileY - 14 });
}

function troopers(state: MatchState, aiId: string, n: number): void {
  const hq = coreOf(state, aiId);
  for (let i = 0; i < n; i++) makeEntity(state, "rifleman", aiId, hq.x + 16 + i * 8, hq.y);
}

/** One support / shell / defense pass, with no attack wave. */
function micro(state: MatchState, aiId: string): void {
  const cpu = state.players.get(aiId)!;
  cpu.aiNextMicroTick = 0;
  cpu.aiNextAttackTick = Number.MAX_SAFE_INTEGER;
  tickAi(state);
}

/** One strategy pass where a force may leave now. */
function wavePass(state: MatchState, aiId: string): void {
  const cpu = state.players.get(aiId)!;
  cpu.aiNextMicroTick = 0;
  cpu.aiNextAttackTick = 0;
  tickAi(state);
}

function planOf(state: MatchState, aiId: string): AiPlan {
  return aiPlanOf(state.players.get(aiId)!);
}

/** Skip the fortify posture: the base counts as defended. */
function campaign(state: MatchState, aiId: string): void {
  planOf(state, aiId).posture = "campaign";
}

/** Tower ring only, so the defence lane moves on to the nest, Pak, pit, and lookout. */
function ringTried(state: MatchState, aiId: string): void {
  const plan = planOf(state, aiId);
  for (const k of ["front", "left", "right", "bunker", "rear"]) plan.siteRetry[`base:${k}`] = Number.MAX_SAFE_INTEGER;
}

/** Every yard defence site counts as tried, so the defence lane moves on to the middle. */
function baseSitesTried(state: MatchState, aiId: string): void {
  ringTried(state, aiId);
  const plan = planOf(state, aiId);
  for (const k of ["mg", "pak", "pit", "look", "flak", "pak43", "case"]) plan.siteRetry[`base:${k}`] = Number.MAX_SAFE_INTEGER;
}

/** The building's front points at the human Core, within the 15° place step. */
function facesEnemy(state: MatchState, e: Entity): boolean {
  const foe = [...state.entities.values()].find((x) => x.ownerId === "A" && (x.type === "rig" || x.type === "core"))!;
  const dir = unitVec(foe.x - e.x, foe.y - e.y);
  return Math.cos(e.facing) * dir.x + Math.sin(e.facing) * dir.y > 0.75;
}

/** A crewed CPU tower on the middle: the diamond field is held. */
function hold(state: MatchState, aiId: string): Entity {
  const c = diamondCentre(state);
  const tower = makeEntity(state, "tower", aiId, c.x, c.y + 120, {
    tileX: Math.floor(c.x / state.tileSize) - 4,
    tileY: Math.floor((c.y + 120) / state.tileSize) - 4,
  });
  tower.garrison = [9001, 9002, 9003];
  return tower;
}

function fighters(state: MatchState, aiId: string, type: Entity["type"], n: number, dy = 0): Entity[] {
  const hq = coreOf(state, aiId);
  const inward = Math.sign((state.width * state.tileSize) / 2 - hq.x) || 1;
  const out: Entity[] = [];
  for (let i = 0; i < n; i++) out.push(makeEntity(state, type, aiId, hq.x + inward * (40 + i * 12), hq.y + 48 + dy));
  return out;
}

function unitVec(dx: number, dy: number): Vec {
  const d = Math.hypot(dx, dy);
  return { x: dx / d, y: dy / d };
}

/** Distance of an order's point along `dir` from `from`. */
function ahead(e: Entity, from: Vec, dir: Vec): number {
  return (e.order!.x! - from.x) * dir.x + (e.order!.y! - from.y) * dir.y;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe("CPU types", () => {
  it("spawns a Rig for the CPU seat", () => {
    const { state, aiId } = humanVsEasy();
    const cpu = state.players.get(aiId);
    assert.ok(cpu);
    assert.equal(cpu!.ai, "defensive");
    assert.ok([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "rig"));
    assert.equal(state.initialHumans, 2);
  });

  it("leaves the home scrap field room for its Smelter when it places the Dynamo", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    assert.ok(findSmelterTile(state, aiId), "the yard starts with a Smelter site");
    const spot = findBuildTile(state, aiId, "dynamo")!;
    const def = catalog("dynamo");
    makeEntity(state, "dynamo", aiId, (spot.tx + def.tileW / 2) * state.tileSize, (spot.ty + def.tileH / 2) * state.tileSize, {
      tileX: spot.tx,
      tileY: spot.ty,
    });
    assert.ok(findSmelterTile(state, aiId), "the Dynamo did not shut the Smelter's lane");
  });

  it("starts a Dynamo after the Core unpacks", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    let dynamo = false;
    for (let i = 0; i < 8; i++) {
      stepMatch(state);
      const p = state.players.get(aiId);
      if (p?.structure?.type === "dynamo") dynamo = true;
      if ([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "dynamo")) dynamo = true;
    }
    assert.equal(dynamo, true);
  });

  it("holds its army at home while it fortifies", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const troops = fighters(state, aiId, "rifleman", 12);
    wavePass(state, aiId);
    assert.equal(planOf(state, aiId).posture, "fortify");
    assert.equal(planOf(state, aiId).forces.length, 0);
    assert.ok(troops.every((e) => e.order?.kind !== "attackmove"), "no wave leaves before the base is fortified");
  });

  it("sends its first force out for the diamond scrap once it campaigns", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    const troops = fighters(state, aiId, "rifleman", 8);
    wavePass(state, aiId);
    const force = planOf(state, aiId).forces[0];
    assert.equal(force?.goal, "centre");
    const end = force!.route[force!.route.length - 1]!;
    const c = diamondCentre(state);
    assert.ok(Math.hypot(end.x - c.x, end.y - c.y) < 8 * state.tileSize, "the route ends on the diamond field");
    const moving = troops.filter((e) => e.order?.kind === "attackmove");
    assert.ok(moving.length >= 6, `force ${moving.length}`);
  });

  it("sends Wardens with the force", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    const ids = [...fighters(state, aiId, "rifleman", 4), ...fighters(state, aiId, "warden", 2, 24)].map((e) => e.id);
    wavePass(state, aiId);
    const kinds = ids.map((id) => state.entities.get(id)).filter((e) => e?.order?.kind === "attackmove");
    assert.ok(kinds.some((e) => e?.type === "rifleman"), "force needs troopers");
    assert.ok(kinds.some((e) => e?.type === "warden"), "force needs tanks");
  });

  it("does not trickle out: too few fighters wait at home", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    fighters(state, aiId, "rifleman", 3);
    wavePass(state, aiId);
    assert.equal(planOf(state, aiId).forces.length, 0);
  });

  it("advances in ranks: hulls ahead, rifles behind them, long guns at the back", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    const tanks = fighters(state, aiId, "warden", 2);
    const rifles = fighters(state, aiId, "rifleman", 4, 24);
    const snipers = fighters(state, aiId, "sniper", 2, 48);
    const all = [...tanks, ...rifles, ...snipers];
    const from = { x: mean(all.map((e) => e.x)), y: mean(all.map((e) => e.y)) };
    wavePass(state, aiId);
    const force = planOf(state, aiId).forces[0]!;
    const dir = unitVec(force.route[0]!.x - from.x, force.route[0]!.y - from.y);
    const t = mean(tanks.map((e) => ahead(e, from, dir)));
    const r = mean(rifles.map((e) => ahead(e, from, dir)));
    const s = mean(snipers.map((e) => ahead(e, from, dir)));
    assert.ok(t > r, `tanks ${t.toFixed(0)} ahead of rifles ${r.toFixed(0)}`);
    assert.ok(r > s, `rifles ${r.toFixed(0)} ahead of snipers ${s.toFixed(0)}`);
  });

  it("puts hulls and brawlers in front and long guns at the back", () => {
    assert.equal(rankOf("warden"), "front");
    assert.equal(rankOf("walker"), "front");
    assert.equal(rankOf("cyborg"), "front");
    assert.equal(rankOf("rifleman"), "mid");
    assert.equal(rankOf("rocketer"), "mid");
    assert.equal(rankOf("sniper"), "back");
    assert.equal(rankOf("mortarman"), "back");
    assert.equal(rankOf("nebelwerfer"), "back");
    assert.equal(rankOf("jagdtiger"), "back");
  });

  it("waits for a big army before it goes for the enemy, then swings round a flank", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    hold(state, aiId);
    fighters(state, aiId, "rifleman", AI_PROFILES.defensive.waveMin - 3);
    wavePass(state, aiId);
    assert.equal(planOf(state, aiId).forces.length, 0, "a small army waits");
    fighters(state, aiId, "rifleman", 3, 24);
    wavePass(state, aiId);
    const force = planOf(state, aiId).forces[0];
    assert.equal(force?.goal, "enemy");
    const [gather, swing, foe] = force!.route;
    assert.ok(gather && swing && foe);
    // The swing point sits well off the straight line from the gathering point to the enemy.
    const dir = unitVec(foe!.x - gather!.x, foe!.y - gather!.y);
    const off = Math.abs((swing!.x - gather!.x) * -dir.y + (swing!.y - gather!.y) * dir.x);
    assert.ok(off > 20 * state.tileSize, `flank offset ${off.toFixed(0)}`);
  });

  it("comes at the enemy from both flanks with a large army", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    hold(state, aiId);
    fighters(state, aiId, "rifleman", 10);
    fighters(state, aiId, "warden", 4, 24);
    fighters(state, aiId, "gunner", 4, 48);
    wavePass(state, aiId);
    const forces = planOf(state, aiId).forces.filter((f) => f.goal === "enemy");
    assert.equal(forces.length, 2);
    const side = (f: (typeof forces)[number]): number => {
      const [g, s, e] = f.route;
      return Math.sign((e!.x - g!.x) * (s!.y - g!.y) - (e!.y - g!.y) * (s!.x - g!.x));
    };
    assert.notEqual(side(forces[0]!), side(forces[1]!), "the two forces take opposite flanks");
    for (const f of forces) {
      const types = new Set(f.ids.map((id) => state.entities.get(id)!.type));
      assert.ok(types.has("warden") && types.has("rifleman"), "each half keeps the mix");
    }
  });

  it("falls back when a force is broken", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    const left = fighters(state, aiId, "rifleman", 2);
    planOf(state, aiId).forces.push({
      id: 1,
      ids: left.map((e) => e.id),
      goal: "enemy",
      route: [{ x: 10, y: 10 }],
      size0: 12,
      boundTick: 0,
    });
    micro(state, aiId);
    assert.equal(planOf(state, aiId).forces.length, 0);
    assert.ok(left.every((e) => e.order?.kind === "move"), "survivors walk back");
  });

  it("raises a Watch Tower toward the enemy before the Machine Shop", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo"]);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 5000;
    micro(state, aiId);
    assert.equal(cpu.defence?.type, "tower");
    assert.notEqual(state.players.get(aiId)!.structure?.type, "armory", "the Machine Shop waits for a tower");
    cpu.defence!.ready = true;
    cpu.defence!.paid = catalog("tower").cost;
    micro(state, aiId);
    const tower = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "tower");
    assert.ok(tower, "the tower was placed");
    const hq = coreOf(state, aiId);
    const foe = [...state.entities.values()].find((e) => e.ownerId === "A" && (e.type === "rig" || e.type === "core"))!;
    const dir = unitVec(foe.x - hq.x, foe.y - hq.y);
    const out = (tower!.x - hq.x) * dir.x + (tower!.y - hq.y) * dir.y;
    assert.ok(out > 16 * state.tileSize, `tower ${out.toFixed(0)} px toward the enemy`);
  });

  it("turns an MG nest and a Pak 36 toward the enemy, then a Tobruk and a lookout", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo"]);
    troopers(state, aiId, 4);
    ringTried(state, aiId);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 50000;
    micro(state, aiId);
    assert.equal(cpu.defence?.type, "mgnest");
    cpu.defence!.ready = true;
    cpu.defence!.paid = catalog("mgnest").cost;
    micro(state, aiId);
    const nest = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "mgnest");
    assert.ok(nest, "the nest was placed");
    assert.ok(facesEnemy(state, nest!), "the nest faces the enemy");
    assert.equal(nest!.garrison.length, catalog("mgnest").garrisonCap, "the nest comes with its crew");
    micro(state, aiId);
    assert.equal(cpu.defence?.type, "pak36");
    cpu.defence!.ready = true;
    cpu.defence!.paid = catalog("pak36").cost;
    micro(state, aiId);
    const pak = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "pak36");
    assert.ok(pak, "the Pak was placed");
    assert.ok(facesEnemy(state, pak!), "the Pak faces the enemy");
    micro(state, aiId);
    assert.equal(cpu.defence?.type, "tobruk");
    cpu.defence = null;
    planOf(state, aiId).siteRetry["base:pit"] = Number.MAX_SAFE_INTEGER;
    micro(state, aiId);
    assert.equal(state.players.get(aiId)!.defence?.type, "hochstand");
  });

  it("puts a mortarman in a Tobruk pit ahead of a rifleman", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const pit = makeEntity(state, "tobruk", aiId, hq.x + 48, hq.y, { tileX: hq.tileX + 6, tileY: hq.tileY });
    fighters(state, aiId, "rifleman", 2);
    const mortar = fighters(state, aiId, "mortarman", 1, 24)[0]!;
    micro(state, aiId);
    const inbound = [...state.entities.values()].filter(
      (e) => e.ownerId === aiId && e.order?.kind === "garrison" && e.order.targetId === pit.id,
    );
    assert.ok(inbound.some((e) => e.id === mortar.id), "the mortarman takes the pit");
  });

  it("lays a gated wall line across the front of its main tower", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo"]);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 50000;
    micro(state, aiId);
    cpu.defence!.ready = true;
    cpu.defence!.paid = catalog("tower").cost;
    micro(state, aiId);
    const tower = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "tower")!;
    micro(state, aiId);
    assert.equal(cpu.line?.type, "wall");
    const sites = cpu.line!.sites!;
    assert.equal(sites.length, 8);
    const hq = coreOf(state, aiId);
    const dir = unitVec(tower.x - hq.x, tower.y - hq.y);
    for (const s of sites) {
      assert.ok((s.x - tower.x) * dir.x + (s.y - tower.y) * dir.y > 0, "the wall stands in front of the tower");
    }
    assert.ok(planOf(state, aiId).gate, "a gate waits on the line");
    for (let i = 0; i < 2000 && state.players.get(aiId)!.line?.type !== "gate"; i++) {
      cpu.scrap = 50000;
      stepMatch(state);
    }
    assert.equal(cpu.line?.type, "gate", "the gate goes in once the walls stand");
  });

  it("crews a tower with a mix: an MG, a rocket tube, a rifle", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["tower"]);
    const tower = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "tower")!;
    fighters(state, aiId, "rifleman", 3);
    fighters(state, aiId, "gunner", 3, 16);
    fighters(state, aiId, "rocketer", 3, 32);
    micro(state, aiId);
    const inbound = [...state.entities.values()].filter(
      (e) => e.ownerId === aiId && e.order?.kind === "garrison" && e.order.targetId === tower.id,
    );
    assert.deepEqual(new Set(inbound.map((e) => e.type)), new Set(["gunner", "rocketer", "rifleman"]));
  });

  it("campaigns once its base towers stand walled and crewed", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    baseSitesTried(state, aiId);
    withBase(state, aiId, ["tower"]);
    const tower = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "tower")!;
    const cpu = state.players.get(aiId)!;
    cpu.scrap = 0;
    micro(state, aiId);
    assert.equal(planOf(state, aiId).posture, "fortify", "an empty, open tower is not a defence");
    planOf(state, aiId).walled.push(tower.id);
    tower.garrison = [9001, 9002];
    micro(state, aiId);
    assert.equal(planOf(state, aiId).posture, "campaign");
  });

  it("campaigns anyway once fortifying has taken too long", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    state.tick = AI_PROFILES.defensive.fortifyMaxTicks;
    micro(state, aiId);
    assert.equal(planOf(state, aiId).posture, "campaign");
  });

  it("an Aggressive CPU campaigns once the front tower and the Bunker stand, walls or not", () => {
    const { state, aiId } = humanVsEasy("aggressive");
    waitCore(state, aiId);
    const cpu = state.players.get(aiId)!;
    assert.equal(cpu.ai, "aggressive");
    assert.equal(cpu.aiNextAttackTick, AI_PROFILES.aggressive.attackFirstTicks);
    const plan = planOf(state, aiId);
    // Front and Bunker tried; the flank towers are still to come, and no tower is walled or crewed.
    for (const k of ["front", "bunker"]) plan.siteRetry[`base:${k}`] = Number.MAX_SAFE_INTEGER;
    cpu.scrap = 0;
    micro(state, aiId);
    assert.equal(plan.posture, "campaign");
  });

  it("a Defensive CPU still waits for its flank towers", () => {
    const { state, aiId } = humanVsEasy("defensive");
    waitCore(state, aiId);
    const cpu = state.players.get(aiId)!;
    assert.equal(cpu.aiNextAttackTick, AI_PROFILES.defensive.attackFirstTicks);
    const plan = planOf(state, aiId);
    for (const k of ["front", "bunker"]) plan.siteRetry[`base:${k}`] = Number.MAX_SAFE_INTEGER;
    cpu.scrap = 0;
    micro(state, aiId);
    assert.equal(plan.posture, "fortify");
  });

  it("sizes and times its waves by type: Aggressive smallest first, fastest growing, most often", () => {
    assert.equal(waveSize(AI_PROFILES.defensive, 0), AI_PROFILES.defensive.waveMin);
    assert.equal(waveSize(AI_PROFILES.aggressive, 0), AI_PROFILES.aggressive.waveMin);
    assert.ok(AI_PROFILES.aggressive.waveMin < AI_PROFILES.balanced.waveMin);
    assert.ok(AI_PROFILES.balanced.waveMin < AI_PROFILES.defensive.waveMin);
    assert.equal(waveSize(AI_PROFILES.aggressive, 3), AI_PROFILES.aggressive.waveMin + 3 * AI_PROFILES.aggressive.waveGrowth);
    assert.equal(waveSize(AI_PROFILES.aggressive, 99), AI_PROFILES.aggressive.waveMax);
    assert.ok(AI_PROFILES.aggressive.attackEveryTicks < AI_PROFILES.balanced.attackEveryTicks);
    assert.ok(AI_PROFILES.balanced.attackEveryTicks < AI_PROFILES.defensive.attackEveryTicks);
    assert.ok(AI_PROFILES.aggressive.fortifyMaxTicks < AI_PROFILES.balanced.fortifyMaxTicks);
    assert.ok(AI_PROFILES.balanced.fortifyMaxTicks < AI_PROFILES.defensive.fortifyMaxTicks);
  });

  it("sends an engineer to raise a Smelter on the diamond scrap once a force holds the middle", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    const c = diamondCentre(state);
    const guards = [0, 1, 2, 3].map((i) => makeEntity(state, "rifleman", aiId, c.x + 40 + i * 12, c.y + 40));
    planOf(state, aiId).forces.push({ id: 1, ids: guards.map((e) => e.id), goal: "centre", route: [], size0: 4, boundTick: 0 });
    const eng = fighters(state, aiId, "engineer", 1)[0]!;
    state.players.get(aiId)!.scrap = 5000;
    micro(state, aiId);
    assert.equal(eng.order?.kind, "build");
    assert.equal(eng.order?.building, "smelter");
    const rate = smelterRateOn((x, y) => scrapAt(state, x, y), eng.order!.tileX!, eng.order!.tileY!);
    assert.equal(rate, SMELTER_SCRAP_PER_SEC * DIAMOND_SCRAP_MUL, "the Smelter stands on diamond scrap");
  });

  it("raises a second Smelter right behind the Barracks, before the Machine Shop", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo"]);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 5000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "smelter", "the fortifying base adds a second pour");
    cpu.structure = null;
    secondSmelter(state, aiId);
    tickAi(state);
    assert.notEqual(state.players.get(aiId)!.structure?.type, "smelter", "no third Smelter while it fortifies");
  });

  it("sends an engineer to a scrap field on its own side once the yard's scrap is taken", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "dynamo", "dynamo"]);
    secondSmelter(state, aiId);
    const hq = coreOf(state, aiId);
    // No scrap left anywhere: then one plain field out past the yard, toward the middle.
    // A Smelter fells trees, so a footprint can hang off this field onto the grove. The
    // field has to sit far enough that even that overhang stays outside the build radius.
    state.scrapYield.fill(0);
    const def = catalog("smelter");
    const toMid = unitVec(state.width / 2 - hq.tileX, state.height / 2 - hq.tileY);
    const out = BUILD_RADIUS + def.tileH + 70;
    const fx = Math.round(hq.tileX + toMid.x * out);
    const fy = Math.round(hq.tileY + toMid.y * out);
    for (let y = fy; y < fy + def.tileH * 2; y++) {
      for (let x = fx; x < fx + def.tileW * 2; x++) {
        state.scrapYield[y * state.width + x] = SCRAP_TILE_YIELD;
        state.blocked[y * state.width + x] = 0;
      }
    }
    const eng = fighters(state, aiId, "engineer", 1)[0]!;
    state.players.get(aiId)!.scrap = 5000;
    micro(state, aiId);
    assert.equal(eng.order?.kind, "build");
    assert.equal(eng.order?.building, "smelter");
    const tx = eng.order!.tileX!;
    const ty = eng.order!.tileY!;
    assert.ok(smelterRateOn((x, y) => scrapAt(state, x, y), tx, ty) > 0, "the Smelter stands on the field");
    assert.equal(inBuildRadius(state, aiId, tx, ty, def.tileW, def.tileH, BUILD_RADIUS), false, "out past the yard");
    assert.ok(Math.hypot(tx - hq.tileX, ty - hq.tileY) <= CPU_EXPAND_TILES + def.tileW);
  });

  it("raises a fire-control tower on the middle, then watch towers, once the diamond Smelter stands", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    baseSitesTried(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo", "research"]);
    troopers(state, aiId, 4);
    const spot = findDiamondSmelterTile(state)!;
    assert.ok(spot, "yard-64 has diamond scrap in the middle");
    const def = catalog("smelter");
    makeEntity(state, "smelter", aiId, (spot.tx + def.tileW / 2) * state.tileSize, (spot.ty + def.tileH / 2) * state.tileSize, {
      tileX: spot.tx,
      tileY: spot.ty,
    });
    const cpu = state.players.get(aiId)!;
    cpu.scrap = 10000;
    micro(state, aiId);
    assert.equal(cpu.defence?.type, "leitturm");
    const site = planOf(state, aiId).site!;
    const c = diamondCentre(state);
    assert.ok(Math.hypot(site.x - c.x, site.y - c.y) < 30 * state.tileSize, "the tower is for the middle");
    planOf(state, aiId).siteRetry["mid:leit"] = Number.MAX_SAFE_INTEGER;
    cpu.defence = null;
    micro(state, aiId);
    assert.equal(state.players.get(aiId)!.defence?.type, "tower");
  });

  it("raises a Flak gun, a Pak 43, and a heavy casemate once it campaigns", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    ringTried(state, aiId);
    const plan = planOf(state, aiId);
    for (const k of ["mg", "pak", "pit", "look"]) plan.siteRetry[`base:${k}`] = Number.MAX_SAFE_INTEGER;
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo", "research"]);
    troopers(state, aiId, 4);
    const hq = coreOf(state, aiId);
    makeEntity(state, "ciws", aiId, hq.x - 80, hq.y, { tileX: hq.tileX - 12, tileY: hq.tileY });
    plan.airSeenTick = state.tick;
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 50000;
    micro(state, aiId);
    assert.equal(cpu.defence?.type, "flak");
    cpu.defence = null;
    plan.siteRetry["base:flak"] = Number.MAX_SAFE_INTEGER;
    micro(state, aiId);
    assert.equal(state.players.get(aiId)!.defence?.type, "pak43");
    state.players.get(aiId)!.defence = null;
    plan.siteRetry["base:pak43"] = Number.MAX_SAFE_INTEGER;
    micro(state, aiId);
    assert.equal(state.players.get(aiId)!.defence?.type, "casemate");
  });

  it("builds a CIWS and trains more rocketmen once it sees enemy planes", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo"]);
    troopers(state, aiId, 4);
    const hq = coreOf(state, aiId);
    makeEntity(state, "stuka", "A", hq.x + 24, hq.y + 24);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 10000;
    micro(state, aiId);
    assert.ok(planOf(state, aiId).airSeenTick != null, "the plane was seen");
    assert.notEqual(cpu.defence?.type, "ciws", "no CIWS before a Research Facility and a Radar Station stand");
    cpu.defence = null;
    makeEntity(state, "research", aiId, hq.x + 16 * 8, hq.y + 16 * 8, { tileX: hq.tileX + 16, tileY: hq.tileY + 16 });
    makeEntity(state, "radar", aiId, hq.x - 12 * 8, hq.y + 16 * 8, { tileX: hq.tileX - 12, tileY: hq.tileY + 16 });
    micro(state, aiId);
    assert.equal(state.players.get(aiId)!.defence?.type, "ciws");
  });

  it("trains rocketmen past their usual number once enemy planes are about", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo"]);
    // Every Barracks rank is full, the rocketmen too, until planes are seen.
    for (const row of CPU_ARMY.muster) fighters(state, aiId, row.unit, row.want, 16 * CPU_ARMY.muster.indexOf(row));
    const muster = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "muster")!;
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 10000;
    ringTried(state, aiId);
    for (const k of ["mg", "pak", "pit", "look"]) planOf(state, aiId).siteRetry[`base:${k}`] = 1e9;
    micro(state, aiId);
    assert.ok(!muster.queue.some((j) => j.type === "rocketer"), "no extra rocketmen without planes");
    planOf(state, aiId).airSeenTick = state.tick;
    micro(state, aiId);
    assert.ok(muster.queue.some((j) => j.type === "rocketer"), `muster queue ${muster.queue.map((j) => j.type).join(",")}`);
  });

  it("scrambles parked fighters at an enemy plane in the air", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const fighter = makeEntity(state, "fw190", aiId, hq.x - 40, hq.y);
    const bomber = makeEntity(state, "stuka", "A", hq.x + 40, hq.y + 40);
    bomber.air!.phase = "fly";
    bomber.air!.alt = 20;
    micro(state, aiId);
    assert.equal(fighter.order?.kind, "attackmove");
  });

  it("trains StuGs when an Armory is standing", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    makeEntity(state, "dynamo", aiId, hq.x - 64, hq.y, { tileX: hq.tileX - 12, tileY: hq.tileY });
    makeEntity(state, "muster", aiId, hq.x + 64, hq.y, { tileX: hq.tileX + 16, tileY: hq.tileY });
    makeEntity(state, "armory", aiId, hq.x, hq.y + 64, { tileX: hq.tileX, tileY: hq.tileY + 16 });
    for (let i = 0; i < 4; i++) {
      makeEntity(state, "rifleman", aiId, hq.x + 16 + i * 8, hq.y);
    }
    const cpu = state.players.get(aiId)!;
    cpu.scrap = 1000;
    tickAi(state);
    const queued = [...state.entities.values()].some(
      (e) => e.ownerId === aiId && e.type === "armory" && e.queue.some((j) => j.type === "ss3"),
    );
    assert.equal(queued, true, "CPU did not queue a StuG");
  });

  it("starts a Research Facility after the Armory so it can train Tigers", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "core")!;
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    campaign(state, aiId);
    makeEntity(state, "dynamo", aiId, hq.x - 64, hq.y, { tileX: hq.tileX - 12, tileY: hq.tileY });
    makeEntity(state, "dynamo", aiId, hq.x - 64, hq.y + 64, { tileX: hq.tileX - 12, tileY: hq.tileY + 8 });
    makeEntity(state, "smelter", aiId, hq.x, hq.y - 64, { tileX: hq.tileX, tileY: hq.tileY - 16 });
    makeEntity(state, "muster", aiId, hq.x + 64, hq.y, { tileX: hq.tileX + 16, tileY: hq.tileY });
    makeEntity(state, "armory", aiId, hq.x, hq.y + 64, { tileX: hq.tileX, tileY: hq.tileY + 16 });
    for (let i = 0; i < 4; i++) {
      makeEntity(state, "rifleman", aiId, hq.x + 16 + i * 8, hq.y);
    }
    secondSmelter(state, aiId);
    cpu.scrap = 5000;
    tickAi(state);
    const job = state.players.get(aiId)!.structure;
    assert.equal(job?.type, "research");
  });

  it("trains Troopers from the opening scrap pile", () => {
    const { state, aiId } = humanVsEasy();
    let trained = false;
    // Dynamo, Smelter, then its pour pays for the Muster: the first Trooper takes a little over a minute.
    for (let i = 0; i < 1000; i++) {
      stepMatch(state);
      if ([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "rifleman" && e.hp > 0)) {
        trained = true;
        break;
      }
    }
    assert.equal(trained, true, "CPU never trained a Trooper");
  });

  it("CPU has its own scrap pile", () => {
    const { state, aiId } = humanVsEasy();
    assert.equal(state.players.get("A")!.scrap, START_SCRAP);
    assert.equal(state.players.get(aiId)!.scrap, START_SCRAP);
  });

  it("lists every army row under the factory that trains it", () => {
    for (const [factory, rows] of Object.entries(CPU_ARMY)) {
      for (const row of rows) assert.equal(producerType(row.unit), factory, row.unit);
    }
  });

  it("never plans a Xenomorph building or unit for Alliance", () => {
    for (const rows of Object.values(CPU_ARMY)) {
      for (const row of rows) assert.equal(factionOf(row.unit), "alliance", row.unit);
    }
  });

  it("builds the Airfield once the factories and Research stand", () => {
    // The west seat's yard has room for the strip; the NE corner of yard-64 does not.
    const { state } = humanVsEasy();
    const aiId = "A";
    state.players.get(aiId)!.ai = "defensive";
    waitCore(state, aiId);
    campaign(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "dynamo", "cyborgcentral", "dynamo"]);
    secondSmelter(state, aiId);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 5000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "airfield");
  });

  it("waits on Research, air, and radar until the base is fortified", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "dynamo", "dynamo"]);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 20000;
    tickAi(state);
    assert.notEqual(state.players.get(aiId)!.structure?.type, "research");
  });

  it("builds the Radar Station after the Airfield, once power covers it", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "cyborgcentral", "airfield"]);
    secondSmelter(state, aiId);
    const hq = coreOf(state, aiId);
    makeEntity(state, "dynamo", aiId, hq.x - 96, hq.y + 128, { tileX: hq.tileX - 12, tileY: hq.tileY + 16 });
    makeEntity(state, "dynamo", aiId, hq.x - 96, hq.y + 192, { tileX: hq.tileX - 12, tileY: hq.tileY + 24 });
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 5000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "radar");
  });

  it("builds a Dynamo before a CIWS that would overdraw power", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "airfield"]);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 5000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "dynamo");
  });

  it("refunds a finished building that has no room, then builds past it", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "dynamo", "cyborgcentral", "dynamo"]);
    secondSmelter(state, aiId);
    troopers(state, aiId, 8);
    const cpu = state.players.get(aiId)!;
    const cost = catalog("airfield").cost;
    cpu.structure = { type: "airfield", progressTicks: 1, totalTicks: 1, ready: true, paused: false, paid: cost };
    cpu.scrap = 0;
    const blocked = state.blocked.slice();
    state.blocked.fill(1);
    tickAi(state);
    assert.equal(cpu.structure, null);
    assert.equal(cpu.scrap, cost);
    assert.ok((cpu.aiNoRoomUntil?.airfield ?? 0) > state.tick);
    state.blocked.set(blocked);
    cpu.scrap = 5000;
    tickAi(state);
    // The Airfield waits for room; the base lane moves on to the Radar Station.
    assert.equal(state.players.get(aiId)!.structure?.type, "radar");
  });

  it("keeps the Armory busy with unlocked hulls before Research stands", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "muster", "armory"]);
    troopers(state, aiId, 8);
    const hq = coreOf(state, aiId);
    for (let i = 0; i < 3; i++) makeEntity(state, "ss3", aiId, hq.x + 40 + i * 24, hq.y + 40);
    state.players.get(aiId)!.scrap = 5000;
    tickAi(state);
    const armory = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "armory")!;
    const types = armory.queue.map((j) => j.type);
    assert.ok(types.length > 0, "armory stalled on a locked rank");
    assert.ok(types.every((t) => t === "walker" || t === "supply"), `armory queue ${types.join(",")}`);
  });

  it("crews its Bunker with idle soldiers, gunners first", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["bunker"]);
    const bunker = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "bunker")!;
    const hq = coreOf(state, aiId);
    const gunner = makeEntity(state, "gunner", aiId, hq.x + 40, hq.y + 40);
    troopers(state, aiId, 6);
    micro(state, aiId);
    const inbound = [...state.entities.values()].filter(
      (e) => e.ownerId === aiId && (e.order?.kind === "garrison" || e.garrisonedIn === bunker.id),
    );
    assert.equal(inbound.length, catalog("bunker").garrisonCap);
    assert.ok(inbound.includes(gunner), "the MG goes in first");
  });

  it("crews its Watch Tower with idle soldiers, up to its three", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["tower"]);
    const tower = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "tower")!;
    troopers(state, aiId, 6);
    micro(state, aiId);
    const inbound = [...state.entities.values()].filter(
      (e) => e.ownerId === aiId && (e.order?.kind === "garrison" || e.garrisonedIn === tower.id),
    );
    assert.equal(inbound.length, catalog("tower").garrisonCap);
  });

  it("fills the Armory with a mix of hulls", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "muster", "armory"]);
    troopers(state, aiId, 8);
    state.players.get(aiId)!.scrap = 5000;
    tickAi(state);
    tickAi(state);
    const armory = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "armory")!;
    const types = new Set(armory.queue.map((j) => j.type));
    assert.ok(types.size >= 2, `armory queue ${[...types].join(",")}`);
  });

  it("trains Muster specialists once the first rifle wave stands", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "muster"]);
    troopers(state, aiId, 4);
    state.players.get(aiId)!.scrap = 5000;
    tickAi(state);
    const muster = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "muster")!;
    assert.ok(
      muster.queue.some((j) => j.type !== "rifleman"),
      `muster queue ${muster.queue.map((j) => j.type).join(",")}`,
    );
  });

  it("sends a medic escort with the force", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    const hq = coreOf(state, aiId);
    fighters(state, aiId, "rifleman", 6);
    const medic = makeEntity(state, "medic", aiId, hq.x + 16, hq.y + 16);
    wavePass(state, aiId);
    assert.equal(medic.order?.kind, "guard");
    assert.equal(state.entities.get(medic.order!.targetId!)?.type, "rifleman");
  });

  it("sends the dive bombers in with the assault on the enemy Core", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    const hq = coreOf(state, aiId);
    const foe = [...state.entities.values()].find((e) => e.ownerId === "A" && (e.type === "rig" || e.type === "core"))!;
    const plane = makeEntity(state, "stuka", aiId, hq.x - 40, hq.y);
    const troops: Entity[] = [];
    for (let i = 0; i < 6; i++) troops.push(makeEntity(state, "rifleman", aiId, foe.x + 120 + i * 10, foe.y + 120));
    planOf(state, aiId).forces.push({ id: 1, ids: troops.map((e) => e.id), goal: "enemy", route: [], size0: 6, boundTick: 0 });
    micro(state, aiId);
    assert.equal(plane.order?.kind, "attackmove");
    assert.ok(troops.every((e) => e.order?.kind === "attackmove" || e.order?.kind === "attack"), "the force goes in");
  });

  it("loads HE against infantry and AP against armor", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const tiger = makeEntity(state, "warden", aiId, hq.x + 40, hq.y);
    const soldier = makeEntity(state, "rifleman", "A", hq.x + 120, hq.y);
    tiger.attackTarget = soldier.id;
    micro(state, aiId);
    assert.equal(tiger.shell, "he");
    const tank = makeEntity(state, "warden", "A", hq.x + 120, hq.y + 24);
    tiger.attackTarget = tank.id;
    micro(state, aiId);
    assert.equal(tiger.shell, "ap");
  });

  it("runs the Walker on both arms", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const walker = makeEntity(state, "walker", aiId, hq.x + 40, hq.y);
    micro(state, aiId);
    assert.equal(walker.gatlingGuns, 2);
  });

  it("sets a halted Nebelwerfer to fire at its target", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const neb = makeEntity(state, "nebelwerfer", aiId, hq.x + 40, hq.y);
    const foe = makeEntity(state, "rifleman", "A", hq.x + 40 + 12 * 32, hq.y);
    neb.order = { kind: "attackmove", x: foe.x, y: foe.y };
    neb.state = "attack";
    neb.attackTarget = foe.id;
    neb.waypoints = [{ x: foe.x, y: foe.y }];
    micro(state, aiId);
    assert.equal(neb.order?.kind, "attack");
    assert.equal(neb.order?.targetId, foe.id);
  });

  it("sends an idle engineer to repair a damaged building", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo"]);
    const dynamo = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "dynamo")!;
    dynamo.hp = Math.floor(dynamo.hpMax / 2);
    const hq = coreOf(state, aiId);
    const eng = makeEntity(state, "engineer", aiId, hq.x + 24, hq.y + 24);
    micro(state, aiId);
    assert.equal(eng.order?.kind, "repair");
    assert.equal(eng.order?.targetId, dynamo.id);
  });

  it("sends a supply truck to a hull short of shells", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const truck = makeEntity(state, "supply", aiId, hq.x + 24, hq.y + 24);
    const tiger = makeEntity(state, "warden", aiId, hq.x + 60, hq.y + 24);
    tiger.ammo = { ap: 0, he: 0 };
    micro(state, aiId);
    assert.equal(truck.order?.kind, "supply");
    assert.equal(truck.order?.targetId, tiger.id);
  });

  it("flies a surveillance drone over the op once he walks out with the army", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const fighter = makeEntity(state, "rifleman", aiId, hq.x + 40, hq.y);
    const op = makeEntity(state, "droneop", aiId, hq.x + 48, hq.y);
    op.order = { kind: "guard", targetId: fighter.id };
    micro(state, aiId);
    const d = op.droneLink?.droneId != null ? state.entities.get(op.droneLink.droneId) : undefined;
    assert.ok(d, "the drone is up");
    assert.equal(d.drone?.mode, "surveil");
    assert.equal(d.drone?.guard?.targetId, op.id);
  });

  it("sends the drone in on an enemy the op sees", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const op = makeEntity(state, "droneop", aiId, hq.x + 48, hq.y);
    const foe = makeEntity(state, "rifleman", "A", hq.x + 48 + 6 * state.tileSize, hq.y);
    foe.holdPosition = true;
    micro(state, aiId);
    const d = op.droneLink?.droneId != null ? state.entities.get(op.droneLink.droneId) : undefined;
    assert.ok(d, "the drone is up");
    assert.equal(d.drone?.mode, "strike");
    assert.equal(d.order?.kind, "attack");
    assert.equal(d.order?.targetId, foe.id);
  });

  it("takes a submarine down when it sees the enemy", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const sub = makeEntity(state, "submarine", aiId, 150 * state.tileSize, 150 * state.tileSize);
    makeEntity(state, "gunboat", "A", 160 * state.tileSize, 150 * state.tileSize);
    micro(state, aiId);
    assert.equal(sub.dive?.down, true);
  });

  it("turns a wave with nothing to shoot on the enemy buildings", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const inward = Math.sign((state.width * state.tileSize) / 2 - hq.x) || 1;
    const x = hq.x + inward * 240;
    const shed = makeEntity(state, "dynamo", "A", x, hq.y + 120, {
      tileX: Math.floor(x / state.tileSize),
      tileY: hq.tileY + 12,
    });
    const rifle = makeEntity(state, "rifleman", aiId, x, hq.y + 40);
    const tiger = makeEntity(state, "warden", aiId, x + 24, hq.y + 40);
    const walker = makeEntity(state, "walker", aiId, x - 24, hq.y + 40);
    for (const e of [rifle, tiger, walker]) e.order = { kind: "attackmove", x: shed.x, y: shed.y };
    stepMatch(state);
    for (const e of [rifle, tiger, walker]) {
      e.order = { kind: "attackmove", x: shed.x, y: shed.y };
      e.attackTarget = null;
    }
    micro(state, aiId);
    assert.equal(rifle.order?.kind, "attack");
    assert.equal(rifle.order?.targetId, shed.id);
    assert.equal(tiger.order?.targetId, shed.id);
    assert.equal(walker.order?.kind, "attackmove", "gatlings cannot bring a building down");
    tiger.attackTarget = shed.id;
    micro(state, aiId);
    assert.equal(tiger.shell, "he");
  });

  it("moves an idle truck parked against a building out of the lane", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const truck = makeEntity(state, "supply", aiId, (hq.tileX + hq.tileW + 1) * state.tileSize, hq.y);
    micro(state, aiId);
    assert.equal(truck.order?.kind, "move");
    const cell = { x: Math.floor(truck.order!.x! / state.tileSize), y: Math.floor(truck.order!.y! / state.tileSize) };
    const gapX = Math.max(0, hq.tileX - cell.x, cell.x - (hq.tileX + hq.tileW - 1));
    const gapY = Math.max(0, hq.tileY - cell.y, cell.y - (hq.tileY + hq.tileH - 1));
    assert.ok(Math.max(gapX, gapY) >= 5, "staging spot clears the Core");
  });

  it("turns home troops on an enemy that walks into the base", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const inward = Math.sign((state.width * state.tileSize) / 2 - hq.x) || 1;
    const guard = makeEntity(state, "rifleman", aiId, hq.x + inward * 24, hq.y);
    const foe = makeEntity(state, "rifleman", "A", hq.x + inward * (24 + 20 * 8), hq.y);
    stepMatch(state);
    guard.order = null;
    micro(state, aiId);
    const order = state.entities.get(guard.id)!.order;
    assert.equal(order?.kind, "attackmove");
    assert.ok(Math.hypot(order!.x! - foe.x, order!.y! - foe.y) < 64, "defends toward the intruder");
  });
});

/**
 * Open water from the edge of the CPU's yard toward the enemy Core, ending `short` tiles from it:
 * a channel `half` tiles either side of the line between the two. Ground under a building stays dry.
 */
function channel(state: MatchState, aiId: string, half = 8, short = 20): void {
  const ts = state.tileSize;
  const hq = coreOf(state, aiId);
  const foe = foeCore(state, aiId);
  const a = { x: hq.x / ts, y: hq.y / ts };
  const b = { x: foe.x / ts, y: foe.y / ts };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const from = 30;
  const to = len - short;
  const buildings = [...state.entities.values()].filter((e) => e.kind === "building");
  const dry = (x: number, y: number): boolean =>
    buildings.some((e) => x >= e.tileX - 1 && x <= e.tileX + e.tileW && y >= e.tileY - 1 && y <= e.tileY + e.tileH);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const along = (x + 0.5 - a.x) * dir.x + (y + 0.5 - a.y) * dir.y;
      const off = Math.abs((x + 0.5 - a.x) * -dir.y + (y + 0.5 - a.y) * dir.x);
      if (along < from || along > to || off > half || dry(x, y)) continue;
      const i = y * state.width + x;
      state.terrain[i] = TILE_WATER;
      state.blocked[i] = 1;
      state.heights[i] = 0;
      state.scrapYield[i] = 0;
    }
  }
  state.visionTick = -1;
}

/** Centre of the water tile nearest a point, world pixels. */
function waterBy(state: MatchState, at: Vec): Vec {
  const ts = state.tileSize;
  let best: Vec | undefined;
  let bestD = Infinity;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!isWater(state, x, y)) continue;
      const p = { x: (x + 0.5) * ts, y: (y + 0.5) * ts };
      const d = Math.hypot(p.x - at.x, p.y - at.y);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
  }
  return best!;
}

function foeCore(state: MatchState, aiId: string): Entity {
  return [...state.entities.values()].find((e) => (e.type === "core" || e.type === "rig") && e.ownerId !== aiId)!;
}

/** A CPU Marine Base standing on the channel at its yard end. */
function harbour(state: MatchState, aiId: string): Entity {
  const spot = findDockTile(state, aiId, true);
  assert.ok(spot, "the channel has a Marine Base site in the yard");
  const def = catalog("dock");
  const ts = state.tileSize;
  return makeEntity(state, "dock", aiId, (spot.tx + def.tileW / 2) * ts, (spot.ty + def.tileH / 2) * ts, { tileX: spot.tx, tileY: spot.ty });
}

/** Boats of one type on the water beside a point, strung out toward the enemy. */
function boats(state: MatchState, aiId: string, type: Entity["type"], n: number, near: Vec): Entity[] {
  const out: Entity[] = [];
  const foe = foeCore(state, aiId);
  const dir = unitVec(foe.x - near.x, foe.y - near.y);
  for (let i = 0; i < n; i++) {
    const at = waterBy(state, { x: near.x + dir.x * (60 + i * 30), y: near.y + dir.y * (60 + i * 30) });
    out.push(makeEntity(state, type, aiId, at.x, at.y));
  }
  return out;
}

/** A standing base past every BUILD_ORDER step, with the Smelters it wants put off. */
function fullBase(state: MatchState, aiId: string): void {
  withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "cyborgcentral", "airfield"]);
  secondSmelter(state, aiId);
  const hq = coreOf(state, aiId);
  for (const [dx, dy] of [
    [-12, 28],
    [-12, 36],
    [-20, 28],
    [-20, 36],
  ] as const) {
    makeEntity(state, "dynamo", aiId, hq.x + dx * 8, hq.y + dy * 8, { tileX: hq.tileX + dx, tileY: hq.tileY + dy });
  }
  makeEntity(state, "radar", aiId, hq.x - 24 * 8, hq.y, { tileX: hq.tileX - 24, tileY: hq.tileY });
  troopers(state, aiId, 4);
  const cpu = state.players.get(aiId)!;
  cpu.aiNoRoomUntil = { smelter: Number.MAX_SAFE_INTEGER };
  cpu.structure = null;
  cpu.scrap = 20000;
}

describe("easy CPU at sea", () => {
  it("finds a Marine Base site on water in its yard that reaches the enemy", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    channel(state, aiId);
    const spot = findDockTile(state, aiId, true);
    assert.ok(spot);
    const def = catalog("dock");
    for (let y = spot.ty; y < spot.ty + def.tileH; y++) {
      for (let x: number = spot.tx; x < spot.tx + def.tileW; x++) assert.equal(isWater(state, x, y), true, `water at ${x},${y}`);
    }
    assert.equal(inBuildRadius(state, aiId, spot.tx, spot.ty, def.tileW, def.tileH, BUILD_RADIUS), true);
  });

  it("raises no Marine Base on a pond too small to float a fleet", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    channel(state, aiId);
    // Dry the channel out past a few tiles: what is left by the yard is a pond.
    const hq = coreOf(state, aiId);
    const foe = foeCore(state, aiId);
    const dir = unitVec(foe.x - hq.x, foe.y - hq.y);
    const ts = state.tileSize;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const along = (x + 0.5 - hq.x / ts) * dir.x + (y + 0.5 - hq.y / ts) * dir.y;
        if (along > 52 && isWater(state, x, y)) state.terrain[y * state.width + x] = 0;
      }
    }
    assert.equal(findDockTile(state, aiId, true), null);
  });

  it("starts a Marine Base once it campaigns with water that reaches the enemy, and places it on the water", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    fullBase(state, aiId);
    campaign(state, aiId);
    channel(state, aiId);
    tickAi(state);
    const cpu = state.players.get(aiId)!;
    assert.equal(cpu.structure?.type, "dock");
    cpu.structure!.ready = true;
    tickAi(state);
    const dock = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "dock");
    assert.ok(dock, "the Marine Base stands");
    assert.equal(isWater(state, dock.tileX, dock.tileY), true);
  });

  it("raises the Marine Base right behind the Machine Shop, before Research", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "dynamo", "dynamo"]);
    secondSmelter(state, aiId);
    troopers(state, aiId, 4);
    channel(state, aiId);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 20000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "dock");
  });

  it("goes straight to Research when there is no water", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "dynamo", "dynamo"]);
    secondSmelter(state, aiId);
    troopers(state, aiId, 4);
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 20000;
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "research");
  });

  it("builds a second Barracks instead when there is no water", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    fullBase(state, aiId);
    campaign(state, aiId);
    tickAi(state);
    assert.equal(state.players.get(aiId)!.structure?.type, "muster");
  });

  it("trains the fleet at its Marine Base", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    channel(state, aiId);
    const dock = harbour(state, aiId);
    troopers(state, aiId, 4);
    state.players.get(aiId)!.scrap = 20000;
    tickAi(state);
    assert.equal(dock.queue[0]?.type, "gunboat");
  });

  it("sails the warships out together for the water by the enemy Core", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    channel(state, aiId);
    const dock = harbour(state, aiId);
    const fleet = [...boats(state, aiId, "gunboat", 2, dock), ...boats(state, aiId, "destroyer", 1, dock)];
    wavePass(state, aiId);
    const foe = foeCore(state, aiId);
    for (const e of fleet) {
      assert.equal(e.order?.kind, "attackmove", e.type);
      const d = Math.hypot(e.order!.x! - foe.x, e.order!.y! - foe.y) / state.tileSize;
      assert.ok(d <= CPU_SEA_REACH_TILES + 12, `sails to the water by the Core, ${d.toFixed(0)} tiles off`);
    }
    assert.deepEqual(planOf(state, aiId).fleet?.ids.slice().sort(), fleet.map((e) => e.id).sort());
    for (const f of planOf(state, aiId).forces) for (const e of fleet) assert.ok(!f.ids.includes(e.id), "ships stay out of the land waves");
  });

  it("sails for an enemy Marine Base on its water when the water stops short of the enemy Core", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    channel(state, aiId, 8, 90);
    const foe = foeCore(state, aiId);
    // The far end of the channel, where the enemy has its harbour.
    const end = waterBy(state, foe);
    const def = catalog("dock");
    const ts = state.tileSize;
    const tx = Math.floor(end.x / ts) - (def.tileW >> 1);
    const ty = Math.floor(end.y / ts) - (def.tileH >> 1);
    const theirs = makeEntity(state, "dock", "A", (tx + def.tileW / 2) * ts, (ty + def.tileH / 2) * ts, { tileX: tx, tileY: ty });
    const dock = harbour(state, aiId);
    const fleet = boats(state, aiId, "gunboat", CPU_FLEET_MIN, dock);
    wavePass(state, aiId);
    const to = planOf(state, aiId).fleet?.to;
    assert.ok(to, "the fleet sails");
    assert.ok(Math.hypot(to.x - theirs.x, to.y - theirs.y) / ts <= CPU_SEA_REACH_TILES, "bound for the enemy harbour");
    for (const e of fleet) assert.equal(e.order?.kind, "attackmove");
  });

  it("keeps too small a fleet at home", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    channel(state, aiId);
    const dock = harbour(state, aiId);
    const few = boats(state, aiId, "gunboat", CPU_FLEET_MIN - 1, dock);
    wavePass(state, aiId);
    for (const e of few) assert.notEqual(e.order?.kind, "attackmove");
    assert.equal(planOf(state, aiId).fleet, undefined);
  });

  it("sends a Battle Ship out of shells home to the Marine Base", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    channel(state, aiId);
    const dock = harbour(state, aiId);
    const foe = foeCore(state, aiId);
    const [ship] = boats(state, aiId, "battleship", 1, { x: (dock.x + foe.x) / 2, y: (dock.y + foe.y) / 2 });
    const to = waterBy(state, foe);
    const escorts = boats(state, aiId, "gunboat", 2, { x: (to.x + ship!.x) / 2, y: (to.y + ship!.y) / 2 });
    planOf(state, aiId).fleet = { ids: [ship!.id, ...escorts.map((e) => e.id)], to, size0: 3, orderTick: state.tick };
    for (const t of ship!.ship!.turrets) for (const b of t.barrels) b.ammo = 0;
    micro(state, aiId);
    assert.equal(ship!.order?.kind, "move");
    assert.ok(Math.hypot(ship!.order!.x! - dock.x, ship!.order!.y! - dock.y) < Math.hypot(ship!.x - dock.x, ship!.y - dock.y), "heads home");
    assert.ok(!planOf(state, aiId).fleet!.ids.includes(ship!.id));
  });

  it("turns the warships at home on an enemy boat by the Marine Base", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    channel(state, aiId);
    const dock = harbour(state, aiId);
    const [guard] = boats(state, aiId, "gunboat", 1, dock);
    const raider = boats(state, "A", "gunboat", 1, { x: guard!.x, y: guard!.y })[0]!;
    stepMatch(state);
    guard!.order = null;
    micro(state, aiId);
    const order = state.entities.get(guard!.id)!.order;
    assert.equal(order?.kind, "attackmove");
    assert.ok(Math.hypot(order!.x! - raider.x, order!.y! - raider.y) < 64);
  });

  it("refills the supply boat at the Marine Base, and it serves only ships", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    channel(state, aiId);
    const dock = harbour(state, aiId);
    const [boat] = boats(state, aiId, "supplyboat", 1, dock);
    boat!.supply = 0;
    micro(state, aiId);
    assert.equal(boat!.order?.kind, "supply");
    assert.equal(boat!.order?.targetId, dock.id);

    const [ship] = boats(state, aiId, "battleship", 1, boat!);
    ship!.ship!.turrets[0]!.barrels[0]!.ammo = 0;
    const hq = coreOf(state, aiId);
    const truck = makeEntity(state, "supply", aiId, hq.x + 24, hq.y + 24);
    boat!.supply = SUPPLY_CARGO;
    boat!.order = null;
    micro(state, aiId);
    const order = state.entities.get(boat!.id)!.order;
    assert.equal(order?.kind, "supply");
    assert.equal(order?.targetId, ship!.id);
    assert.notEqual(truck.order?.targetId, ship!.id, "the truck leaves ships to the boat");
  });

  it("meets an enemy boat by the base from the bank, not by swimming out", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    channel(state, aiId);
    const hq = coreOf(state, aiId);
    const at = waterBy(state, hq);
    const raider = makeEntity(state, "gunboat", "A", at.x, at.y);
    const guard = makeEntity(state, "rifleman", aiId, hq.x + (at.x - hq.x) * 0.4, hq.y + (at.y - hq.y) * 0.4);
    stepMatch(state);
    guard.order = null;
    micro(state, aiId);
    const order = state.entities.get(guard.id)!.order;
    assert.equal(order?.kind, "attackmove");
    assert.equal(isWater(state, Math.floor(order!.x! / state.tileSize), Math.floor(order!.y! / state.tileSize)), false);
    assert.ok(Math.hypot(order!.x! - raider.x, order!.y! - raider.y) < 20 * state.tileSize, "goes to the bank by the boat");
  });
});

describe("Xenomorph CPU", () => {
  function humanVsXeno(): { state: MatchState; aiId: string } {
    const made = createRoom({ id: "AIB", hostId: "A", hostName: "Alpha", mapId: "yard-64", maxSlots: 8 });
    if (!made.ok) throw new Error(made.message);
    const room = made.value;
    const add = hostSlot(room, "A", 1, { status: "ai", ai: "defensive", faction: "xeno" });
    if (!add.ok) throw new Error(add.message);
    updateSelf(room, "A", { ready: true });
    const started = startMatch(room, "A", () => 0);
    if (!started.ok) throw new Error(started.message);
    return { state: createMatch(room, started.value), aiId: "ai:1" };
  }

  function hiveOf(state: MatchState, aiId: string): Entity {
    return [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "hivecore")!;
  }

  function standBy(state: MatchState, aiId: string, types: Entity["type"][]): void {
    const hq = hiveOf(state, aiId);
    const spots: [number, number][] = [[-12, 0], [16, 0], [0, 16], [0, -14], [16, 16]];
    types.forEach((type, i) => {
      const [dx, dy] = spots[i]!;
      makeEntity(state, type, aiId, hq.x + dx * 8, hq.y + dy * 8, { tileX: hq.tileX + dx, tileY: hq.tileY + dy });
    });
  }

  function nextStructure(state: MatchState, aiId: string): string | undefined {
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 5000;
    tickAi(state);
    return state.players.get(aiId)!.structure?.type;
  }

  it("unpacks its Seed into a Hive Core", () => {
    const { state, aiId } = humanVsXeno();
    assert.ok([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "seed"));
    waitCore(state, aiId);
    assert.ok(hiveOf(state, aiId));
  });

  it("raises a Fusion Node, then an Assimilator", () => {
    const { state, aiId } = humanVsXeno();
    waitCore(state, aiId);
    assert.equal(nextStructure(state, aiId), "fusionnode");
    standBy(state, aiId, ["fusionnode"]);
    assert.equal(nextStructure(state, aiId), "assimilator");
  });

  it("raises the Cyborg Central once power and an Assimilator stand", () => {
    const { state, aiId } = humanVsXeno();
    waitCore(state, aiId);
    standBy(state, aiId, ["fusionnode", "assimilator"]);
    assert.equal(nextStructure(state, aiId), "cyborgcentral");
  });

  it("trains its army at the Cyborg Central", () => {
    const { state, aiId } = humanVsXeno();
    waitCore(state, aiId);
    standBy(state, aiId, ["fusionnode", "assimilator", "cyborgcentral", "fusionnode"]);
    state.players.get(aiId)!.scrap = 5000;
    tickAi(state);
    const central = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "cyborgcentral")!;
    assert.ok(central.queue.length > 0, "nothing queued at the Central");
    assert.ok(XENO_ARMY.some((r) => r.unit === central.queue[0]!.type));
  });

  it("lists only Xenomorph units, all from the Cyborg Central", () => {
    for (const row of XENO_ARMY) {
      assert.equal(factionOf(row.unit), "xeno", row.unit);
      assert.equal(producerType(row.unit), "cyborgcentral", row.unit);
    }
  });
});
