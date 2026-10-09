/**
 * Engineer and map bridges over water, laid brick by brick.
 *
 * A bridge is a run of bricks, each its own neutral structure one deck length
 * long (`bridgeBrickLength`). The engineer walks the line from his end, pays for
 * each brick as he starts it, and the brick appears when he finishes it; he works
 * the next one from the deck he just laid. The water under an intact brick is dry
 * ground for everyone (`bridgeDeck`, read by `isWater`): tanks drive over, infantry
 * walk instead of swimming, and boats stop at it, unless the deck stands at least
 * BRIDGE_SHIP_CLEARANCE over the water: then a boat sails under it (`bridgeClear`),
 * all but the Transport LST and the Battle Ship.
 *
 * Every brick of one line keeps one deck level (`deckLevel`), the ground's height at
 * the point the line was started from, the way a wall keeps its crest.
 *
 * A brick belongs to no side. Nothing aims at it on its own: only a round fired by
 * a force-attack at it hurts it (`bridgeId`). Every other knock is undone at the
 * end of the step. At 0 HP that brick falls into the water: what drives on it goes
 * down with it, the wreckage stays, and the bricks either side still stand. Wreckage
 * cannot be hurt any further; an engineer rebuilds it.
 */

import {
  BOMB_BUILDING_DAMAGE,
  BOMB_SPLASH_TILES,
  BRIDGE_ROUND_MUL,
  BRIDGE_SHIP_CLEARANCE,
  BRIDGE_SPLASH_PAD,
  NEUTRAL_OWNER,
  bridgeBrickLength,
  bridgeBuildSeconds,
  bridgeCost,
  bridgeWidth,
  isAircraftType,
  isBridge,
  isInfantryType,
  isNavalType,
  tooTallForBridge,
  wadesOf,
  type BridgeType,
} from "../catalog.js";
import {
  bridgeBrickProblem,
  bridgeDist,
  bridgeEnds,
  bridgePath,
  bridgeSegmentT,
  bridgeTiles,
  inBridge,
  type BridgeBrick,
  type BridgeGround,
  type BridgeSpan,
} from "../bridge-plan.js";
import { TILE_WATER } from "../maps.js";
import {
  clearOrder,
  hasCore,
  inBounds,
  isTree,
  makeEntity,
  nearestWalkable,
  tileCenter,
  tileIndex,
  worldToTile,
} from "./geo.js";
import { tileHeight as heightAt } from "./elevation.js";
import { forgetBridgeLanes } from "./bridge-lane.js";
import { repathIfBlocked } from "./orders.js";
import { setPath } from "./path.js";
import type { Entity, MatchState, Projectile } from "./types.js";

/** Engineer this close to the brick (world px) is at work. */
const BRIDGE_WORK_REACH = 18;
/** Ticks an engineer may stand with no way nearer a brick before he gives the line up. */
const BRIDGE_STUCK_TICKS = 60;

export function bridgeSpanOf(e: { type?: string; x: number; y: number; facing: number; span?: number }): BridgeSpan {
  const length = e.span ?? (e.type && isBridge(e.type) ? bridgeBrickLength(e.type) : 0);
  return { x: e.x, y: e.y, facing: e.facing, length };
}

/** Tiles under this brick's deck, water and land. */
export function bridgeTilesOf(state: MatchState, e: Entity): { x: number; y: number }[] {
  if (!isBridge(e.type)) return [];
  return bridgeTiles(state, bridgeSpanOf(e), bridgeWidth(e.type));
}

function rawWater(state: MatchState, tx: number, ty: number): boolean {
  return inBounds(state, tx, ty) && state.terrain[tileIndex(state, tx, ty)] === TILE_WATER;
}

/** Bricks standing and wreckage, as the plan reads them. */
function standingBricks(state: MatchState): BridgeBrick[] {
  const out: BridgeBrick[] = [];
  for (const e of state.entities.values()) {
    if (!isBridge(e.type) || e.hp <= 0) continue;
    out.push({ type: e.type, span: bridgeSpanOf(e) });
  }
  return out;
}

/** The live grid as the plan reads it. Water is the map's, deck or no deck. */
export function bridgeGround(state: MatchState): BridgeGround {
  return {
    width: state.width,
    height: state.height,
    tileSize: state.tileSize,
    water: (tx, ty) => rawWater(state, tx, ty),
    footing: (tx, ty) => {
      if (!inBounds(state, tx, ty)) return false;
      const i = tileIndex(state, tx, ty);
      if (state.blocked[i] === 1 && state.terrain[i] !== TILE_WATER) return false;
      if ((state.occupy[i] ?? 0) !== 0 || (state.fortBlock[i] ?? 0) !== 0) return false;
      return !isTree(state, tx, ty);
    },
    bricks: standingBricks(state),
  };
}

/** Why a brick cannot go down on `span` now, or null. */
export function bridgeBrickProblemFor(state: MatchState, type: BridgeType, span: BridgeSpan): string | null {
  return bridgeBrickProblem(bridgeGround(state), type, span);
}

/**
 * Lay the deck grid again from the standing bricks. Water under an intact brick
 * is walkable land; under wreckage, or once the brick is gone, it is water again.
 */
/** Hash of every bridge brick's standing, so the deck is re-laid only when one went up, fell, or was ruined. */
function bridgeStampKey(state: MatchState): number {
  let h = 2166136261;
  for (const e of state.entities.values()) {
    if (!isBridge(e.type)) continue;
    h = Math.imul(h ^ e.id, 16777619);
    h = Math.imul(h ^ (e.hp > 0 ? 1 : 0), 16777619);
    h = Math.imul(h ^ (e.ruined ? 1 : 0), 16777619);
    h = Math.imul(h ^ (e.deckLevel ?? 0), 16777619);
  }
  h = Math.imul(h ^ state.digRev, 16777619);
  return h;
}

const bridgeStamps = new WeakMap<MatchState, number>();

export function restampBridges(state: MatchState): void {
  const key = bridgeStampKey(state);
  if (state.bridgeClear && bridgeStamps.get(state) === key) return;
  bridgeStamps.set(state, key);
  forgetBridgeLanes(state);
  const deck = state.bridgeDeck;
  const clear = (state.bridgeClear ??= new Uint8Array(deck.length));
  for (let i = 0; i < deck.length; i++) {
    clear[i] = 0;
    if (deck[i] !== 1) continue;
    deck[i] = 0;
    if (state.terrain[i] === TILE_WATER) state.blocked[i] = 1;
  }
  for (const e of state.entities.values()) {
    if (!isBridge(e.type) || e.hp <= 0 || e.ruined) continue;
    const level = deckLevelOf(state, e);
    for (const t of bridgeTilesOf(state, e)) {
      const i = tileIndex(state, t.x, t.y);
      if (state.terrain[i] !== TILE_WATER) continue;
      deck[i] = 1;
      state.blocked[i] = 0;
      if (level - (state.heights[i] ?? 0) >= BRIDGE_SHIP_CLEARANCE) clear[i] = 1;
    }
  }
}

/** Deck level a line started at (x, y) keeps: the ground's height there. */
export function deckLevelAt(state: MatchState, x: number, y: number): number {
  const ts = state.tileSize;
  return heightAt(state, worldToTile(x, ts), worldToTile(y, ts));
}

/** A brick's deck level. One from before levels were kept rests on its higher end. */
export function deckLevelOf(state: MatchState, e: Entity): number {
  if (e.deckLevel != null) return e.deckLevel;
  const { ax, ay, bx, by } = bridgeEnds(bridgeSpanOf(e));
  return Math.max(deckLevelAt(state, ax, ay), deckLevelAt(state, bx, by));
}


/**
 * A boat in the way of the brick, or a hulk sunk under it. The engineer waits. A deck
 * at `level` high enough over the water leaves room for a small boat or a hulk under it.
 */
function deckBusy(state: MatchState, span: BridgeSpan, width: number, level = 0): boolean {
  for (const u of state.entities.values()) {
    if (u.kind !== "unit" || u.hp <= 0 || u.garrisonedIn != null) continue;
    if (!isNavalType(u.type) && !u.wreck) continue;
    const tx = worldToTile(u.x, state.tileSize);
    const ty = worldToTile(u.y, state.tileSize);
    if (!rawWater(state, tx, ty)) continue;
    if (level - heightAt(state, tx, ty) >= BRIDGE_SHIP_CLEARANCE && !tooTallForBridge(u.type)) continue;
    if (inBridge(span, width, u.x, u.y, u.radius)) return true;
  }
  return false;
}

/** Just past the brick end nearest the engineer: the shore, or the brick he laid before. */
function endSpot(eng: { x: number; y: number }, span: BridgeSpan): { x: number; y: number } {
  const { ax, ay, bx, by } = bridgeEnds(span);
  const nearA = Math.hypot(eng.x - ax, eng.y - ay) <= Math.hypot(eng.x - bx, eng.y - by);
  const ux = Math.cos(span.facing) * (nearA ? -1 : 1);
  const uy = Math.sin(span.facing) * (nearA ? -1 : 1);
  return { x: (nearA ? ax : bx) + ux * 6, y: (nearA ? ay : by) + uy * 6 };
}

/** Walkable ground at the brick end nearest the engineer. */
function standSpot(state: MatchState, eng: Entity, span: BridgeSpan): { x: number; y: number } {
  const { x: ex, y: ey } = endSpot(eng, span);
  const ts = state.tileSize;
  const t = nearestWalkable(state, worldToTile(ex, ts), worldToTile(ey, ts), eng.type);
  return t ? { x: tileCenter(t.x, ts), y: tileCenter(t.y, ts) } : { x: ex, y: ey };
}

/** Close enough to the brick to work on it: beside it, on it, or at either end. */
function atDeck(eng: Entity, span: BridgeSpan, width: number): boolean {
  return bridgeDist(span, width, eng.x, eng.y) <= BRIDGE_WORK_REACH + eng.radius;
}

function startBrick(state: MatchState, eng: Entity, type: BridgeType, span: BridgeSpan, deck: number): void {
  eng.order = { kind: "build", bridge: type, x: span.x, y: span.y, facing: span.facing, span: span.length, deck };
  eng.work = 0;
  eng.state = "move";
  eng.bridgeStuck = 0;
  const spot = standSpot(state, eng, span);
  setPath(state, eng, spot.x, spot.y);
}

/** Where a bridge line runs: one brick at (x, y) along `facing`, a drag to (x2, y2), or a polyline. */
export interface BridgeLineOpts {
  x2?: number;
  y2?: number;
  facing?: number;
  path?: readonly { x: number; y: number }[];
}

/**
 * Send the nearest selected engineer to lay a bridge along a line. He starts at
 * the end nearer him and lays every brick the ground takes, one after another,
 * each from the shore or the brick before it.
 */
export function orderBridge(
  state: MatchState,
  playerId: string,
  engineers: Entity[],
  type: BridgeType,
  x: number,
  y: number,
  opts: BridgeLineOpts = {},
): string | null {
  if (!isBridge(type)) return "An engineer cannot build that.";
  const crew = engineers.filter((e) => e.type === "engineer" && e.hp > 0 && !e.wreck && !e.garrisonedIn);
  if (crew.length === 0) return "Select an engineer.";
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  const points = opts.path?.length
    ? opts.path.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
    : [{ x, y }, ...(opts.x2 != null && opts.y2 != null ? [{ x: opts.x2, y: opts.y2 }] : [])];
  if (points.length === 0 || !points.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))) return "Cannot place there.";
  // The whole line keeps the level of the ground it was started from.
  const deck = deckLevelAt(state, points[0]!.x, points[0]!.y);
  const facing = opts.facing != null && Number.isFinite(opts.facing) ? opts.facing : 0;
  const ground = bridgeGround(state);
  const laid: BridgeBrick[] = [];
  let reason: string | null = null;
  const bricks: BridgeSpan[] = [];
  for (const span of bridgePath(type, points, facing)) {
    const problem = bridgeBrickProblem(ground, type, span, laid);
    if (problem) {
      reason ??= problem;
      continue;
    }
    laid.push({ type, span });
    bricks.push(span);
  }
  if (bricks.length === 0) return reason ?? "Cannot place there.";
  const first = bricks[0]!;
  const last = bricks[bricks.length - 1]!;
  const reach = (e: Entity): number => Math.min(bridgeDist(first, 0, e.x, e.y), bridgeDist(last, 0, e.x, e.y));
  crew.sort((a, b) => reach(a) - reach(b) || a.id - b.id);
  const eng = crew[0]!;
  if (bridgeDist(last, 0, eng.x, eng.y) < bridgeDist(first, 0, eng.x, eng.y)) bricks.reverse();
  clearOrder(eng);
  eng.fieldQueue = bricks.slice(1).map((b) => ({ x: b.x, y: b.y, facing: b.facing }));
  startBrick(state, eng, type, bricks[0]!, deck);
  return null;
}

/** The brick an engineer's bridge order is for. */
export function bridgeOrderSpan(e: Entity): { type: BridgeType; span: BridgeSpan; deck: number } | null {
  const o = e.order;
  if (!o || o.kind !== "build" || o.bridge == null || o.x == null || o.y == null || o.span == null) return null;
  return { type: o.bridge, span: { x: o.x, y: o.y, facing: o.facing ?? 0, length: o.span }, deck: o.deck ?? 0 };
}

function finishWork(e: Entity): void {
  clearOrder(e);
  e.work = 0;
  e.state = "idle";
  e.bridgeStuck = undefined;
}

/** On to the next queued brick the ground still takes, or idle when the line is done. */
function nextBrick(state: MatchState, e: Entity, type: BridgeType, deck: number): void {
  const queue = e.fieldQueue ?? [];
  finishWork(e);
  const length = bridgeBrickLength(type);
  while (queue.length > 0) {
    const q = queue.shift()!;
    const span = { x: q.x, y: q.y, facing: q.facing, length };
    if (bridgeBrickProblemFor(state, type, span)) continue;
    e.fieldQueue = queue;
    startBrick(state, e, type, span, deck);
    return;
  }
}

/** Drop the rest of the line. */
function giveUp(state: MatchState, e: Entity, why: string | null): void {
  finishWork(e);
  e.fieldQueue = undefined;
  if (why && state.players.has(e.ownerId)) state.pendingComms.push(why);
}

export function tickBridges(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.kind !== "unit" || e.wreck) continue;
    if (e.order?.kind !== "build" || e.order.bridge == null) continue;
    tickBridgeBuild(state, e, dt);
  }
}

function tickBridgeBuild(state: MatchState, e: Entity, dt: number): void {
  const job = bridgeOrderSpan(e);
  if (!job) {
    finishWork(e);
    return;
  }
  const { type, span, deck } = job;
  const width = bridgeWidth(type);
  const player = state.players.get(e.ownerId);
  if (!atDeck(e, span, width)) {
    e.state = "move";
    if (e.waypoints.length === 0) {
      // Nowhere nearer to stand: the brick is out of reach from this shore.
      e.bridgeStuck = (e.bridgeStuck ?? 0) + 1;
      if (e.bridgeStuck > BRIDGE_STUCK_TICKS) {
        giveUp(state, e, "Cannot reach the bridge there.");
        return;
      }
    } else e.bridgeStuck = 0;
    if (e.waypoints.length === 0 || (state.tick + e.id) % 8 === 0) {
      const spot = standSpot(state, e, span);
      setPath(state, e, spot.x, spot.y);
    }
    return;
  }
  e.bridgeStuck = 0;
  const cost = bridgeCost(type);
  if (e.work <= 0) {
    if (bridgeBrickProblemFor(state, type, span)) {
      nextBrick(state, e, type, deck);
      return;
    }
    if (!player || player.scrap < cost) {
      giveUp(state, e, "Not enough scrap.");
      return;
    }
    player.scrap -= cost;
  }
  e.waypoints = [];
  e.state = "build";
  e.facing = Math.atan2(span.y - e.y, span.x - e.x);
  e.turretFacing = e.facing;
  // The last moment waits on a boat in the way; the work itself does not.
  const total = bridgeBuildSeconds(type);
  if (e.work + 1e-6 < total) {
    e.work = Math.min(total, e.work + dt);
    return;
  }
  if (deckBusy(state, span, width, deck)) return;
  if (bridgeBrickProblemFor(state, type, span)) {
    if (player) player.scrap += cost;
    nextBrick(state, e, type, deck);
    return;
  }
  raiseBridge(state, type, span, deck);
  nextBrick(state, e, type, deck);
}

/** A finished brick, neutral, its deck laid at once. */
export function raiseBridge(state: MatchState, type: BridgeType, span: BridgeSpan, deck?: number): Entity {
  const b = placeBrick(state, type, span, deck);
  restampBridges(state);
  for (const u of state.entities.values()) {
    if (u.kind === "unit" && u.hp > 0 && !u.wreck) repathIfBlocked(state, u);
  }
  return b;
}

/** Stand a brick without laying the deck grid. The caller restamps once for many. */
export function placeBrick(state: MatchState, type: BridgeType, span: BridgeSpan, deck?: number): Entity {
  const ts = state.tileSize;
  const b = makeEntity(state, type, NEUTRAL_OWNER, span.x, span.y, {
    facing: span.facing,
    tileX: worldToTile(span.x, ts),
    tileY: worldToTile(span.y, ts),
  });
  b.facing = span.facing;
  b.turretFacing = span.facing;
  b.span = span.length;
  b.deckLevel = deck ?? deckLevelAt(state, span.x, span.y);
  return b;
}

/** Wreckage an engineer can put back up: no boat under it. */
export function canRebuildBridge(state: MatchState, e: Entity): boolean {
  if (!isBridge(e.type) || !e.ruined || e.hp <= 0) return false;
  return !deckBusy(state, bridgeSpanOf(e), bridgeWidth(e.type), deckLevelOf(state, e));
}

export function rebuildSecondsOf(e: Entity): number {
  return isBridge(e.type) ? bridgeBuildSeconds(e.type, bridgeSpanOf(e).length) : 0;
}

export function rebuildBridge(state: MatchState, e: Entity): void {
  e.ruined = false;
  e.hp = e.hpMax;
  e.crits = [];
  restampBridges(state);
}

/** A ground vehicle that rides the deck and goes into the water with it. */
function goesDown(state: MatchState, u: Entity, span: BridgeSpan, width: number): boolean {
  if (u.kind !== "unit" || u.hp <= 0 || u.wreck || u.garrisonedIn != null) return false;
  if (isInfantryType(u.type) || wadesOf(u.type) || isNavalType(u.type)) return false;
  if (isAircraftType(u.type) || u.air || u.drone || u.jet || u.chute) return false;
  if (!inBridge(span, width, u.x, u.y)) return false;
  const tx = worldToTile(u.x, state.tileSize);
  const ty = worldToTile(u.y, state.tileSize);
  return rawWater(state, tx, ty);
}

/** The deck gives way. Vehicles on it are lost; men on it swim. The wreckage stays. */
export function collapseBridge(state: MatchState, e: Entity): void {
  if (!isBridge(e.type) || e.ruined) return;
  const span = bridgeSpanOf(e);
  const width = bridgeWidth(e.type);
  for (const u of state.entities.values()) {
    if (!goesDown(state, u, span, width)) continue;
    // Sunk outright: no hulk is left on the riverbed.
    u.hp = 0;
    u.wreck = true;
    u.order = null;
    u.waypoints = [];
  }
  e.ruined = true;
  e.hp = 1;
  e.crits = [];
  restampBridges(state);
  const { ax, ay, bx, by } = bridgeEnds(span);
  const n = 2;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    state.impacts.push({
      id: state.nextId++,
      ownerId: NEUTRAL_OWNER,
      kind: "kill",
      x: ax + (bx - ax) * u,
      y: ay + (by - ay) * u,
      vx: 0,
      vy: 0,
      caliber: 75,
      damage: 60,
      blast: true,
      splash: true,
    });
  }
  for (const u of state.entities.values()) {
    if (u.kind === "unit" && u.hp > 0 && !u.wreck) repathIfBlocked(state, u);
  }
}

/** A bridge a force-attack is laid on: not wreckage, and still standing. */
export function aimableBridge(t: Entity | undefined): boolean {
  return !!t && isBridge(t.type) && t.hp > 0 && !t.ruined;
}

/**
 * New rounds fired by a force-attack on a bridge carry its id, so they may stop
 * on the deck and hurt it. Each round is looked at once, the step it appears.
 */
export function tagBridgeRounds(state: MatchState): void {
  for (const p of state.projectiles) {
    if (p.bridgeTagged) continue;
    p.bridgeTagged = true;
    const shooter = state.entities.get(p.fromId);
    const o = shooter?.order;
    if (!o || o.kind !== "forceattack" || o.targetId == null) continue;
    if (aimableBridge(state.entities.get(o.targetId))) p.bridgeId = o.targetId;
  }
}

/** What one aimed round takes off a bridge. Small arms and smoke do nothing. */
export function bridgeRoundDamage(p: Projectile): number {
  if (p.flight === "bomb") return BOMB_BUILDING_DAMAGE;
  if (p.flight === "rocket") return p.damage * BRIDGE_ROUND_MUL.rocket;
  if (p.flight === "mortar") return p.damage * (p.big ? BRIDGE_ROUND_MUL.artillery : BRIDGE_ROUND_MUL.mortar);
  if (p.flight) return 0;
  if (p.shell === "he") return p.damage * BRIDGE_ROUND_MUL.he;
  if (p.shell === "heat") return p.damage * BRIDGE_ROUND_MUL.heat;
  if (p.shell === "ap") return p.damage * BRIDGE_ROUND_MUL.ap;
  return 0;
}

/**
 * An aimed round that ended at (x, y) counts against its brick when it burst on or
 * just beside the deck. A bomb, mortar bomb, field-gun shell, or rocket counts
 * anywhere its blast (`blast`, world px) reaches the brick: they scatter far wider
 * than a deck is broad.
 */
export function strikeBridge(state: MatchState, p: Projectile, x: number, y: number, blast?: number): void {
  const id = p.bridgeId;
  if (id == null) return;
  p.bridgeId = undefined;
  const b = state.entities.get(id);
  if (!b || !aimableBridge(b)) return;
  const reach = blast ?? (p.flight === "bomb" ? BOMB_SPLASH_TILES * state.tileSize : BRIDGE_SPLASH_PAD);
  if (!inBridge(bridgeSpanOf(b), bridgeWidth(b.type as BridgeType), x, y, Math.max(BRIDGE_SPLASH_PAD, reach))) return;
  const dmg = bridgeRoundDamage(p);
  if (dmg <= 0) return;
  const hits = (state.bridgeHits ??= new Map());
  hits.set(id, (hits.get(id) ?? 0) + dmg);
}

/** Where a round fired at this bridge meets its deck this step, as a sweep hit. Null for any other round. */
export function bridgeSweep(
  p: Projectile,
  e: Entity,
  x0: number,
  y0: number,
): { t: number; x: number; y: number } | null {
  if (p.bridgeId !== e.id || !aimableBridge(e)) return null;
  const t = bridgeSegmentT(bridgeSpanOf(e), bridgeWidth(e.type as BridgeType), x0, y0, p.x, p.y);
  if (t == null) return null;
  return { t, x: x0 + (p.x - x0) * t, y: y0 + (p.y - y0) * t };
}

/** Bridge hit points before anything this step could knock them. */
export function guardBridges(state: MatchState): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of state.entities.values()) {
    if (isBridge(e.type) && e.hp > 0) out.set(e.id, e.hp);
  }
  return out;
}

/**
 * Undo every knock a bridge took this step, keep any repair, then take off what
 * the aimed rounds did. One at 0 falls; wreckage takes nothing.
 */
export function settleBridges(state: MatchState, before: Map<number, number>): void {
  const hits = state.bridgeHits;
  state.bridgeHits = undefined;
  for (const [id, hp] of before) {
    const e = state.entities.get(id);
    if (!e) continue;
    if (e.hp < hp) e.hp = hp;
    e.crits = [];
    if (e.ruined) continue;
    const dmg = hits?.get(id) ?? 0;
    if (dmg <= 0) continue;
    e.hp = Math.max(0, e.hp - Math.round(dmg));
    if (e.hp <= 0) collapseBridge(state, e);
  }
}

/** Engineer stand point for fixing a bridge: dry ground off the nearest deck end. */
export function bridgeRepairSpot(eng: Entity, target: Entity): { x: number; y: number } {
  return endSpot(eng, bridgeSpanOf(target));
}

/** Engineer close enough to work on this bridge or its wreckage. */
export function nearBridge(eng: Entity, target: Entity): boolean {
  if (!isBridge(target.type)) return false;
  return atDeck(eng, bridgeSpanOf(target), bridgeWidth(target.type));
}
