import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIAMOND_SCRAP_MUL, SMELTER_SCRAP_PER_SEC, START_SCRAP, catalog } from "../catalog.js";
import { createRoom, hostSlot, startMatch, updateSelf } from "../lobby.js";
import {
  EASY_ARMY,
  EASY_FORTIFY_MAX_TICKS,
  EASY_WAVE_MIN,
  aiPlanOf,
  diamondCentre,
  findDiamondSmelterTile,
  rankOf,
  tickAi,
} from "./ai.js";
import { hasCore, makeEntity, scrapAt } from "./geo.js";
import { createMatch, stepMatch } from "./match.js";
import { smelterRateOn } from "./smelter.js";
import { producerType } from "./train.js";
import type { AiPlan, Entity, MatchState, Vec } from "./types.js";

function humanVsEasy(): { state: MatchState; aiId: string } {
  const made = createRoom({
    id: "AI1",
    hostId: "A",
    hostName: "Alpha",
    mapId: "yard-64",
    maxSlots: 8,
  });
  if (!made.ok) throw new Error(made.message);
  const room = made.value;
  const add = hostSlot(room, "A", 1, { status: "ai" });
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
  ];
  types.forEach((type, i) => {
    const [dx, dy] = spots[i]!;
    makeEntity(state, type, aiId, hq.x + dx * 8, hq.y + dy * 8, { tileX: hq.tileX + dx, tileY: hq.tileY + dy });
  });
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

/** Every base tower and bunker site counts as tried, so the defence lane moves past them. */
function baseSitesTried(state: MatchState, aiId: string): void {
  const plan = planOf(state, aiId);
  for (const k of ["front", "left", "right", "bunker", "rear"]) plan.siteRetry[`base:${k}`] = Number.MAX_SAFE_INTEGER;
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

describe("easy CPU", () => {
  it("spawns a Rig for the CPU seat", () => {
    const { state, aiId } = humanVsEasy();
    const cpu = state.players.get(aiId);
    assert.ok(cpu);
    assert.equal(cpu!.ai, "easy");
    assert.ok([...state.entities.values()].some((e) => e.ownerId === aiId && e.type === "rig"));
    assert.equal(state.initialHumans, 2);
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
    fighters(state, aiId, "rifleman", EASY_WAVE_MIN - 3);
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
    state.tick = EASY_FORTIFY_MAX_TICKS;
    micro(state, aiId);
    assert.equal(planOf(state, aiId).posture, "campaign");
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

  it("raises towers round the middle once the diamond Smelter stands", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    campaign(state, aiId);
    baseSitesTried(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo"]);
    troopers(state, aiId, 4);
    const spot = findDiamondSmelterTile(state)!;
    assert.ok(spot, "yard-64 has diamond scrap in the middle");
    const def = catalog("smelter");
    makeEntity(state, "smelter", aiId, (spot.tx + def.tileW / 2) * state.tileSize, (spot.ty + def.tileH / 2) * state.tileSize, {
      tileX: spot.tx,
      tileY: spot.ty,
    });
    state.players.get(aiId)!.scrap = 10000;
    micro(state, aiId);
    const cpu = state.players.get(aiId)!;
    assert.equal(cpu.defence?.type, "tower");
    const site = planOf(state, aiId).site!;
    const c = diamondCentre(state);
    assert.ok(Math.hypot(site.x - c.x, site.y - c.y) < 30 * state.tileSize, "the tower is for the middle");
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
    assert.equal(cpu.defence?.type, "ciws");
  });

  it("trains rocketmen past their usual number once enemy planes are about", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "dynamo"]);
    // Every Barracks rank is full, the rocketmen too, until planes are seen.
    for (const row of EASY_ARMY.muster) fighters(state, aiId, row.unit, row.want, 16 * EASY_ARMY.muster.indexOf(row));
    const muster = [...state.entities.values()].find((e) => e.ownerId === aiId && e.type === "muster")!;
    const cpu = state.players.get(aiId)!;
    cpu.structure = null;
    cpu.scrap = 10000;
    planOf(state, aiId).siteRetry = { "base:front": 1e9, "base:left": 1e9, "base:right": 1e9, "base:bunker": 1e9, "base:rear": 1e9 };
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
    for (const [factory, rows] of Object.entries(EASY_ARMY)) {
      for (const row of rows) assert.equal(producerType(row.unit), factory, row.unit);
    }
  });

  it("builds the Airfield once the factories and Research stand", () => {
    // The west seat's yard has room for the strip; the NE corner of yard-64 does not.
    const { state } = humanVsEasy();
    const aiId = "A";
    state.players.get(aiId)!.ai = "easy";
    waitCore(state, aiId);
    campaign(state, aiId);
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "dynamo"]);
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
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "airfield"]);
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
    withBase(state, aiId, ["dynamo", "smelter", "muster", "armory", "research", "dynamo"]);
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

  it("launches a strike drone once the op walks out with the army", () => {
    const { state, aiId } = humanVsEasy();
    waitCore(state, aiId);
    const hq = coreOf(state, aiId);
    const fighter = makeEntity(state, "rifleman", aiId, hq.x + 40, hq.y);
    const op = makeEntity(state, "droneop", aiId, hq.x + 48, hq.y);
    op.order = { kind: "guard", targetId: fighter.id };
    micro(state, aiId);
    assert.equal(op.droneLink?.mode, "strike");
    assert.notEqual(op.droneLink?.droneId, null);
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
