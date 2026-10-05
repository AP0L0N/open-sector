/**
 * Engineer bridges over water.
 *
 * The engineer walks to the near end, pays for the whole deck, works, and the
 * bridge appears in one piece from shore to shore. The water under an intact
 * deck is dry ground for everyone (`bridgeDeck`, read by `isWater`): tanks
 * drive over, infantry walk instead of swimming, and boats stop at it.
 *
 * A bridge belongs to no side. Nothing aims at it on its own: only a round
 * fired by a force-attack at it hurts it (`bridgeId`). Every other knock is
 * undone at the end of the step. At 0 HP it falls into the water: what drives
 * on it goes down with it, and the wreckage stays. Wreckage cannot be hurt any
 * further; an engineer rebuilds it.
 */

import {
  BOMB_BUILDING_DAMAGE,
  BRIDGE_ROUND_MUL,
  BRIDGE_SPLASH_PAD,
  NEUTRAL_OWNER,
  bridgeBuildSeconds,
  bridgeCost,
  bridgeWidth,
  isAircraftType,
  isBridge,
  isInfantryType,
  isNavalType,
  wadesOf,
  type BridgeType,
} from "../catalog.js";
import {
  bridgeDist,
  bridgeEnds,
  bridgeSegmentT,
  bridgeTiles,
  inBridge,
  planBridge,
  type BridgeGround,
  type BridgePlan,
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
import { repathIfBlocked } from "./orders.js";
import { setPath } from "./path.js";
import type { Entity, MatchState, Projectile } from "./types.js";

/** Engineer this close to the deck end (world px) is at work. */
const BRIDGE_WORK_REACH = 18;

export function bridgeSpanOf(e: { x: number; y: number; facing: number; span?: number }): BridgeSpan {
  return { x: e.x, y: e.y, facing: e.facing, length: e.span ?? 0 };
}

/** Tiles under this bridge's deck, water and land. */
export function bridgeTilesOf(state: MatchState, e: Entity): { x: number; y: number }[] {
  if (!isBridge(e.type)) return [];
  return bridgeTiles(state, bridgeSpanOf(e), bridgeWidth(e.type));
}

function rawWater(state: MatchState, tx: number, ty: number): boolean {
  return inBounds(state, tx, ty) && state.terrain[tileIndex(state, tx, ty)] === TILE_WATER;
}

/** Stand-alone bridges and their wreckage, by tile index. */
function bridgedCells(state: MatchState): Set<number> {
  const out = new Set<number>();
  for (const e of state.entities.values()) {
    if (!isBridge(e.type) || e.hp <= 0) continue;
    for (const t of bridgeTilesOf(state, e)) out.add(tileIndex(state, t.x, t.y));
  }
  return out;
}

/** The live grid as `planBridge` reads it. Water is the map's, deck or no deck. */
export function bridgeGround(state: MatchState): BridgeGround {
  const bridged = bridgedCells(state);
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
    bridged: (tx, ty) => bridged.has(tileIndex(state, tx, ty)),
  };
}

export function planBridgeFor(state: MatchState, type: BridgeType, x1: number, y1: number, x2: number, y2: number): BridgePlan {
  return planBridge(bridgeGround(state), type, x1, y1, x2, y2);
}

/**
 * Lay the deck grid again from the standing bridges. Water under an intact deck
 * is walkable land; under wreckage, or once the bridge is gone, it is water again.
 */
export function restampBridges(state: MatchState): void {
  const deck = state.bridgeDeck;
  for (let i = 0; i < deck.length; i++) {
    if (deck[i] !== 1) continue;
    deck[i] = 0;
    if (state.terrain[i] === TILE_WATER) state.blocked[i] = 1;
  }
  for (const e of state.entities.values()) {
    if (!isBridge(e.type) || e.hp <= 0 || e.ruined) continue;
    for (const t of bridgeTilesOf(state, e)) {
      const i = tileIndex(state, t.x, t.y);
      if (state.terrain[i] !== TILE_WATER) continue;
      deck[i] = 1;
      state.blocked[i] = 0;
    }
  }
}

/** A boat in the way of the deck, or a hulk sunk under it. The engineer waits. */
function deckBusy(state: MatchState, span: BridgeSpan, width: number): boolean {
  for (const u of state.entities.values()) {
    if (u.kind !== "unit" || u.hp <= 0 || u.garrisonedIn != null) continue;
    if (!isNavalType(u.type) && !u.wreck) continue;
    if (!rawWater(state, worldToTile(u.x, state.tileSize), worldToTile(u.y, state.tileSize))) continue;
    if (inBridge(span, width, u.x, u.y, u.radius)) return true;
  }
  return false;
}

/** Just past the deck end nearest the engineer. The deck rests on dry land there. */
function endSpot(eng: { x: number; y: number }, span: BridgeSpan): { x: number; y: number } {
  const { ax, ay, bx, by } = bridgeEnds(span);
  const nearA = Math.hypot(eng.x - ax, eng.y - ay) <= Math.hypot(eng.x - bx, eng.y - by);
  const ux = Math.cos(span.facing) * (nearA ? -1 : 1);
  const uy = Math.sin(span.facing) * (nearA ? -1 : 1);
  return { x: (nearA ? ax : bx) + ux * 6, y: (nearA ? ay : by) + uy * 6 };
}

/** Walkable ground at the deck end nearest the engineer. */
function standSpot(state: MatchState, eng: Entity, span: BridgeSpan): { x: number; y: number } {
  const { x: ex, y: ey } = endSpot(eng, span);
  const ts = state.tileSize;
  const t = nearestWalkable(state, worldToTile(ex, ts), worldToTile(ey, ts), eng.type);
  return t ? { x: tileCenter(t.x, ts), y: tileCenter(t.y, ts) } : { x: ex, y: ey };
}

/** Close enough to the deck to work on it: beside it, on it, or at either end. */
function atDeck(eng: Entity, span: BridgeSpan, width: number): boolean {
  return bridgeDist(span, width, eng.x, eng.y) <= BRIDGE_WORK_REACH + eng.radius;
}

/**
 * Send the nearest selected engineer to bridge the water a drag from (x1, y1)
 * to (x2, y2) crosses. Refused at once when the ground will not take it.
 */
export function orderBridge(
  state: MatchState,
  playerId: string,
  engineers: Entity[],
  type: BridgeType,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string | null {
  if (!isBridge(type)) return "An engineer cannot build that.";
  const crew = engineers.filter((e) => e.type === "engineer" && e.hp > 0 && !e.wreck && !e.garrisonedIn);
  if (crew.length === 0) return "Select an engineer.";
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  if (![x1, y1, x2, y2].every(Number.isFinite)) return "Cannot place there.";
  const plan = planBridgeFor(state, type, x1, y1, x2, y2);
  if (!plan.ok) return plan.reason;
  const span = plan.span;
  crew.sort(
    (a, b) => bridgeDist(span, 0, a.x, a.y) - bridgeDist(span, 0, b.x, b.y) || a.id - b.id,
  );
  const eng = crew[0]!;
  clearOrder(eng);
  eng.order = { kind: "build", bridge: type, x: span.x, y: span.y, facing: span.facing, span: span.length };
  eng.work = 0;
  eng.state = "move";
  const spot = standSpot(state, eng, span);
  setPath(state, eng, spot.x, spot.y);
  return null;
}

/** The deck an engineer's bridge order is for. */
export function bridgeOrderSpan(e: Entity): { type: BridgeType; span: BridgeSpan } | null {
  const o = e.order;
  if (!o || o.kind !== "build" || o.bridge == null || o.x == null || o.y == null || o.span == null) return null;
  return { type: o.bridge, span: { x: o.x, y: o.y, facing: o.facing ?? 0, length: o.span } };
}

/** Same ground test as the plan, for a deck already placed. */
function siteError(state: MatchState, type: BridgeType, span: BridgeSpan): string | null {
  const ground = bridgeGround(state);
  const { ax, ay, bx, by } = bridgeEnds(span);
  const plan = planBridge(ground, type, ax, ay, bx, by);
  return plan.ok ? null : plan.reason;
}

function finishWork(e: Entity): void {
  clearOrder(e);
  e.work = 0;
  e.state = "idle";
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
  const { type, span } = job;
  const width = bridgeWidth(type);
  if (!atDeck(e, span, width)) {
    e.state = "move";
    if (e.waypoints.length === 0 || state.tick % 8 === 0) {
      const spot = standSpot(state, e, span);
      setPath(state, e, spot.x, spot.y);
    }
    return;
  }
  const player = state.players.get(e.ownerId);
  const cost = bridgeCost(type, span.length);
  if (e.work <= 0) {
    const err = siteError(state, type, span);
    if (err) {
      finishWork(e);
      if (player) state.pendingComms.push(err);
      return;
    }
    if (!player || player.scrap < cost) {
      finishWork(e);
      if (player) state.pendingComms.push("Not enough scrap.");
      return;
    }
    player.scrap -= cost;
  }
  e.waypoints = [];
  e.state = "build";
  e.facing = Math.atan2(span.y - e.y, span.x - e.x);
  e.turretFacing = e.facing;
  // The last moment waits on a boat in the way; the work itself does not.
  const total = bridgeBuildSeconds(type, span.length);
  if (e.work + 1e-6 < total) {
    e.work = Math.min(total, e.work + dt);
    return;
  }
  if (deckBusy(state, span, width)) return;
  if (siteError(state, type, span)) {
    if (player) player.scrap += cost;
    finishWork(e);
    return;
  }
  raiseBridge(state, type, span);
  finishWork(e);
}

/** The finished bridge, neutral, its deck laid at once. */
export function raiseBridge(state: MatchState, type: BridgeType, span: BridgeSpan): Entity {
  const ts = state.tileSize;
  const b = makeEntity(state, type, NEUTRAL_OWNER, span.x, span.y, {
    facing: span.facing,
    tileX: worldToTile(span.x, ts),
    tileY: worldToTile(span.y, ts),
  });
  b.facing = span.facing;
  b.turretFacing = span.facing;
  b.span = span.length;
  restampBridges(state);
  for (const u of state.entities.values()) {
    if (u.kind === "unit" && u.hp > 0 && !u.wreck) repathIfBlocked(state, u);
  }
  return b;
}

/** Wreckage an engineer can put back up: nothing new on its ground, no boat under it. */
export function canRebuildBridge(state: MatchState, e: Entity): boolean {
  if (!isBridge(e.type) || !e.ruined || e.hp <= 0) return false;
  return !deckBusy(state, bridgeSpanOf(e), bridgeWidth(e.type));
}

export function rebuildSecondsOf(e: Entity): number {
  return isBridge(e.type) ? bridgeBuildSeconds(e.type, e.span ?? 0) : 0;
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
  const n = Math.max(2, Math.min(6, Math.round(span.length / (state.tileSize * 6))));
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

/** An aimed round that ended at (x, y), on or just beside its bridge's deck, counts against it. */
export function strikeBridge(state: MatchState, p: Projectile, x: number, y: number): void {
  const id = p.bridgeId;
  if (id == null) return;
  p.bridgeId = undefined;
  const b = state.entities.get(id);
  if (!b || !aimableBridge(b)) return;
  if (!inBridge(bridgeSpanOf(b), bridgeWidth(b.type as BridgeType), x, y, BRIDGE_SPLASH_PAD)) return;
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
