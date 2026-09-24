import {
  NEUTRAL_OWNER,
  catalog,
  fieldSpan,
  MAX_UNIT_RADIUS,
  UNIT_SPACE_PAD,
  isArmoredType,
  isFieldStructure,
  isInfantryType,
  stanceOf,
  WRECK_SCRAP_SECONDS,
  wreckScrapOf,
  type EntityType,
  type FieldStructureType,
  type ShellType,
} from "../catalog.js";
import { allies, clearOrder, inBounds, isTree, isWater, makeEntity, scrapAt, tileCenter, tileIndex, walkable, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

/** Extra reach past the wall face where the engineer stands to build. */
const STAND_PAD = 14;
const WORK_REACH = 12;
const REPAIR_REACH = 16;
/** Hit points restored each second while an engineer is on the job. */
export const REPAIR_PER_SEC = 14;
/** How far past the sandbag face a crouched or crawling soldier still counts as behind them. */
export const SANDBAG_COVER_DEPTH = 22;
/** Extra hit points while crouched or crawling against intact sandbags, as a share of catalog HP. */
export const SANDBAG_COVER_BONUS = 0.5;
/** Pyramids in one dragon's-teeth placement. */
export const TOOTH_COUNT = 4;
/** Overlap below this still counts as adjacent, so two structures can touch. */
const PLACE_SLACK = 3;

export function wallAxes(facing: number): { fx: number; fy: number; tx: number; ty: number } {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  return { fx, fy, tx: -fy, ty: fx };
}

/** Same scatter for a given spot, so the ghost and the built pyramids match. */
export function toothSeedAt(x: number, y: number): number {
  const qx = Math.round(x);
  const qy = Math.round(y);
  const s = (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663)) >>> 0;
  return s === 0 ? 1 : s;
}

/** Offsets along the wall and across it. Four pyramids, jittered off a straight line. */
export function toothOffsets(seed: number): { along: number; across: number }[] {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const span = fieldSpan("teeth")!;
  const halfL = span.length / 2 - 8;
  const halfA = span.thick / 2 - 2;
  const out: { along: number; across: number }[] = [];
  for (let i = 0; i < TOOTH_COUNT; i++) {
    const slot = (i + 0.5) / TOOTH_COUNT - 0.5;
    const along = Math.max(-halfL, Math.min(halfL, (slot + (next() - 0.5) * 0.1) * span.length));
    const across = (next() * 2 - 1) * halfA;
    out.push({ along, across });
  }
  return out;
}

export function toothWorld(x: number, y: number, facing: number, seed: number): { x: number; y: number }[] {
  const { fx, fy, tx, ty } = wallAxes(facing);
  return toothOffsets(seed).map((o) => ({
    x: x + tx * o.along + fx * o.across,
    y: y + ty * o.along + fy * o.across,
  }));
}

export function isTankShell(p: { shell?: ShellType | null; flight?: string }): boolean {
  if (p.flight === "mortar") return false;
  return p.shell === "ap" || p.shell === "he" || p.shell === "heat";
}

/** Oriented rectangle of a field structure. `across` is the look direction. */
export function inFieldRect(
  px: number,
  py: number,
  cx: number,
  cy: number,
  facing: number,
  length: number,
  thick: number,
): boolean {
  const { fx, fy, tx, ty } = wallAxes(facing);
  const dx = px - cx;
  const dy = py - cy;
  const along = dx * tx + dy * ty;
  const across = dx * fx + dy * fy;
  return Math.abs(along) <= length / 2 && Math.abs(across) <= thick / 2;
}

export function fieldTiles(
  state: MatchState,
  type: EntityType,
  x: number,
  y: number,
  facing: number,
  pad = 0,
): { x: number; y: number }[] {
  const span = fieldSpan(type);
  if (!span) return [];
  const ts = state.tileSize;
  const reach = Math.hypot(span.length, span.thick) / 2 + pad + ts;
  const x0 = Math.max(0, worldToTile(x - reach, ts));
  const x1 = Math.min(state.width - 1, worldToTile(x + reach, ts));
  const y0 = Math.max(0, worldToTile(y - reach, ts));
  const y1 = Math.min(state.height - 1, worldToTile(y + reach, ts));
  const out: { x: number; y: number }[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const cx = tileCenter(tx, ts);
      const cy = tileCenter(ty, ts);
      if (!inFieldRect(cx, cy, x, y, facing, span.length + pad * 2, span.thick + pad * 2)) continue;
      out.push({ x: tx, y: ty });
    }
  }
  return out;
}

type FieldBox = { x: number; y: number; facing: number; length: number; thick: number };

function fieldBox(type: EntityType, x: number, y: number, facing: number): FieldBox | null {
  const span = fieldSpan(type);
  if (!span) return null;
  return { x, y, facing, length: span.length, thick: span.thick };
}

function boxHalfOn(box: FieldBox, axisX: number, axisY: number): number {
  const { tx, ty, fx, fy } = wallAxes(box.facing);
  const along = Math.abs(tx * axisX + ty * axisY) * (box.length / 2);
  const across = Math.abs(fx * axisX + fy * axisY) * (box.thick / 2);
  return along + across;
}

/** True when the rectangles overlap by more than a touch. Edges may meet. */
function boxesConflict(a: FieldBox, b: FieldBox): boolean {
  const aa = wallAxes(a.facing);
  const bb = wallAxes(b.facing);
  const axes = [
    { x: aa.tx, y: aa.ty },
    { x: aa.fx, y: aa.fy },
    { x: bb.tx, y: bb.ty },
    { x: bb.fx, y: bb.fy },
  ];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const axis of axes) {
    const dist = Math.abs(dx * axis.x + dy * axis.y);
    const overlap = boxHalfOn(a, axis.x, axis.y) + boxHalfOn(b, axis.x, axis.y) - dist;
    if (overlap <= PLACE_SLACK) return false;
  }
  return true;
}

function overlapsField(state: MatchState, type: FieldStructureType, x: number, y: number, facing: number): boolean {
  const mine = fieldBox(type, x, y, facing);
  if (!mine) return true;
  for (const e of state.entities.values()) {
    if (!isFieldStructure(e.type) || e.hp <= 0 || e.ruined) continue;
    const other = fieldBox(e.type, e.x, e.y, e.facing);
    if (other && boxesConflict(mine, other)) return true;
  }
  return false;
}

export function fieldSiteClear(
  state: MatchState,
  type: FieldStructureType,
  x: number,
  y: number,
  facing: number,
): boolean {
  const tiles = fieldTiles(state, type, x, y, facing, 0);
  if (tiles.length === 0) return false;
  for (const t of tiles) {
    if (!inBounds(state, t.x, t.y)) return false;
    const i = tileIndex(state, t.x, t.y);
    if (state.blocked[i] === 1) return false;
    if (isWater(state, t.x, t.y) || isTree(state, t.x, t.y)) return false;
    if (scrapAt(state, t.x, t.y) > 0) return false;
    if ((state.occupy[i] ?? 0) !== 0) return false;
  }
  return !overlapsField(state, type, x, y, facing);
}

function standPoint(type: FieldStructureType, x: number, y: number, facing: number): { x: number; y: number } {
  const span = fieldSpan(type)!;
  const { fx, fy } = wallAxes(facing);
  const off = span.thick / 2 + STAND_PAD;
  return { x: x - fx * off, y: y - fy * off };
}

export function orderFieldBuild(
  state: MatchState,
  playerId: string,
  engineers: Entity[],
  structure: FieldStructureType,
  x: number,
  y: number,
  facing: number,
): string | null {
  const eng = engineers.find((e) => e.type === "engineer" && e.hp > 0 && !e.wreck);
  if (!eng) return "Select an engineer.";
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return "Cannot place there.";
  if (!fieldSiteClear(state, structure, x, y, facing)) return "Cannot place there.";
  const spot = standPoint(structure, x, y, facing);
  if (!walkable(state, worldToTile(spot.x, state.tileSize), worldToTile(spot.y, state.tileSize), "engineer")) {
    return "Cannot place there.";
  }
  clearOrder(eng);
  eng.order = { kind: "build", x, y, facing, structure };
  eng.work = 0;
  eng.state = "move";
  setPath(state, eng, spot.x, spot.y);
  return null;
}

function repairOwner(state: MatchState, playerId: string, ownerId: string): boolean {
  if (!ownerId || ownerId === NEUTRAL_OWNER) return true;
  return allies(state, playerId, ownerId);
}

export function canScrapWreck(target: Entity): boolean {
  return target.wreck && target.hp > 0 && target.kind === "unit" && isArmoredType(target.type);
}

export function canRepairTarget(state: MatchState, playerId: string, target: Entity): boolean {
  if (canScrapWreck(target)) return true;
  if (target.hp <= 0 || target.wreck || target.ruined || target.hp >= target.hpMax) return false;
  if (!repairOwner(state, playerId, target.ownerId)) return false;
  if (target.kind === "unit") return isArmoredType(target.type);
  if (target.type === "sandbags") return false;
  return target.kind === "building";
}

/** Just outside the wreck's pathing halo, where an engineer can kneel. */
function scrapReach(target: Entity): number {
  return target.radius + MAX_UNIT_RADIUS + UNIT_SPACE_PAD + 10;
}

function repairSpot(eng: Entity, target: Entity, tileSize: number): { x: number; y: number } {
  if (target.kind === "unit") {
    const dx = eng.x - target.x;
    const dy = eng.y - target.y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = target.wreck ? scrapReach(target) : target.radius + 12;
    return { x: target.x + (dx / d) * reach, y: target.y + (dy / d) * reach };
  }
  const x0 = target.tileX * tileSize;
  const y0 = target.tileY * tileSize;
  const x1 = x0 + target.tileW * tileSize;
  const y1 = y0 + target.tileH * tileSize;
  const cx = Math.min(x1, Math.max(x0, eng.x));
  const cy = Math.min(y1, Math.max(y0, eng.y));
  const dx = eng.x - cx;
  const dy = eng.y - cy;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    return { x: x1 + 12, y: (y0 + y1) / 2 };
  }
  return { x: cx + (dx / d) * 12, y: cy + (dy / d) * 12 };
}

function nearRepair(eng: Entity, target: Entity, tileSize: number): boolean {
  if (target.kind === "unit") {
    const reach = target.wreck ? scrapReach(target) + 6 : target.radius + REPAIR_REACH;
    return Math.hypot(eng.x - target.x, eng.y - target.y) <= reach;
  }
  const x0 = target.tileX * tileSize - REPAIR_REACH;
  const y0 = target.tileY * tileSize - REPAIR_REACH;
  const x1 = (target.tileX + target.tileW) * tileSize + REPAIR_REACH;
  const y1 = (target.tileY + target.tileH) * tileSize + REPAIR_REACH;
  return eng.x >= x0 && eng.x <= x1 && eng.y >= y0 && eng.y <= y1;
}

export function orderRepair(state: MatchState, playerId: string, engineers: Entity[], targetId: number): string | null {
  const target = state.entities.get(targetId);
  if (!target || !canRepairTarget(state, playerId, target)) return "Nothing to fix.";
  const crew = engineers.filter((e) => e.type === "engineer");
  if (crew.length === 0) return "Select an engineer.";
  for (const eng of crew) {
    clearOrder(eng);
    eng.order = { kind: "repair", targetId };
    eng.work = 0;
    eng.state = "move";
    const spot = repairSpot(eng, target, state.tileSize);
    setPath(state, eng, spot.x, spot.y);
  }
  return null;
}

function finishWork(e: Entity): void {
  clearOrder(e);
  e.work = 0;
  e.state = "idle";
}

function tickBuild(state: MatchState, e: Entity, dt: number): void {
  const order = e.order;
  if (!order || order.kind !== "build" || order.structure == null || order.x == null || order.y == null) return;
  const structure = order.structure;
  const facing = order.facing ?? 0;
  const spot = standPoint(structure, order.x, order.y, facing);
  if (e.waypoints.length > 0) return;
  if (Math.hypot(e.x - spot.x, e.y - spot.y) > WORK_REACH) {
    e.state = "move";
    if (state.tick % 8 === 0) setPath(state, e, spot.x, spot.y);
    return;
  }
  if (e.work <= 0) {
    const def = catalog(structure);
    const player = state.players.get(e.ownerId);
    if (!player || player.scrap < def.cost) {
      finishWork(e);
      if (player) state.pendingComms.push("Not enough scrap.");
      return;
    }
    if (!fieldSiteClear(state, structure, order.x, order.y, facing)) {
      finishWork(e);
      return;
    }
    player.scrap -= def.cost;
  }
  e.waypoints = [];
  e.state = "build";
  e.facing = Math.atan2(order.y - e.y, order.x - e.x);
  e.turretFacing = e.facing;
  e.work += dt;
  if (e.work < catalog(structure).buildSeconds) return;
  if (!fieldSiteClear(state, structure, order.x, order.y, facing)) {
    const player = state.players.get(e.ownerId);
    if (player) player.scrap += catalog(structure).cost;
    finishWork(e);
    return;
  }
  const built = makeEntity(state, structure, e.ownerId, order.x, order.y, { facing });
  built.facing = facing;
  built.turretFacing = facing;
  restampForts(state);
  finishWork(e);
}

function tickRepair(state: MatchState, e: Entity, dt: number): void {
  const id = e.order?.kind === "repair" ? e.order.targetId : undefined;
  const target = id != null ? state.entities.get(id) : undefined;
  if (!target || !canRepairTarget(state, e.ownerId, target)) {
    finishWork(e);
    return;
  }
  if (!nearRepair(e, target, state.tileSize)) {
    e.state = "move";
    if (e.waypoints.length === 0 || state.tick % 8 === 0) {
      const spot = repairSpot(e, target, state.tileSize);
      setPath(state, e, spot.x, spot.y);
    }
    return;
  }
  e.waypoints = [];
  e.state = "repair";
  e.facing = Math.atan2(target.y - e.y, target.x - e.x);
  e.turretFacing = e.facing;
  if (target.wreck) {
    e.work += dt;
    if (e.work < WRECK_SCRAP_SECONDS) return;
    if (target.hp > 0) {
      const player = state.players.get(e.ownerId);
      if (player) player.scrap += wreckScrapOf(target.type);
      target.hp = 0;
    }
    finishWork(e);
    return;
  }
  target.hp = Math.min(target.hpMax, target.hp + REPAIR_PER_SEC * dt);
  if (target.hp < target.hpMax) return;
  if (target.kind === "unit") {
    target.crits = target.crits.filter((c) => c !== "tracks" && c !== "engine");
  }
  finishWork(e);
}

/** Crouched or crawling infantry tucked against an intact sandbag wall. */
export function sandbagCoverBonus(state: MatchState, e: Entity): number {
  if (e.hp <= 0 || e.garrisonedIn != null || !isInfantryType(e.type)) return 0;
  const stance = stanceOf(e);
  if (stance !== "crouch" && stance !== "crawl") return 0;
  const span = fieldSpan("sandbags")!;
  for (const bag of state.entities.values()) {
    if (bag.type !== "sandbags" || bag.ruined || bag.hp <= 0) continue;
    const { fx, fy, tx, ty } = wallAxes(bag.facing);
    const dx = e.x - bag.x;
    const dy = e.y - bag.y;
    const along = dx * tx + dy * ty;
    const across = dx * fx + dy * fy;
    if (Math.abs(along) > span.length / 2 + 8) continue;
    const depth = Math.abs(across) - span.thick / 2;
    if (depth < -6 || depth > SANDBAG_COVER_DEPTH) continue;
    return Math.max(1, Math.round(catalog(e.type).hp * SANDBAG_COVER_BONUS));
  }
  return 0;
}

function applyCoverHp(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (!isInfantryType(e.type)) continue;
    const next = e.hp <= 0 ? 0 : sandbagCoverBonus(state, e);
    const prev = e.coverBonus;
    if (next === prev) continue;
    const delta = next - prev;
    e.coverBonus = next;
    e.hpMax = Math.max(1, e.hpMax + delta);
    if (delta > 0) e.hp += delta;
    else if (e.hp > e.hpMax) e.hp = e.hpMax;
  }
}

export function tickField(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.kind !== "unit") continue;
    if (e.order?.kind === "build") tickBuild(state, e, dt);
    else if (e.order?.kind === "repair") tickRepair(state, e, dt);
  }
  applyCoverHp(state);
}

export function ruinSandbags(state: MatchState, bag: Entity): void {
  if (bag.type !== "sandbags" || bag.ruined) return;
  bag.ruined = true;
  restampForts(state);
  applyCoverHp(state);
}

/** Men on the far side of the wall take the shell. The near side is in front of it. */
export function woundBehindSandbags(state: MatchState, bag: Entity, fromX: number, fromY: number, damage: number): void {
  const span = fieldSpan("sandbags")!;
  const { fx, fy, tx, ty } = wallAxes(bag.facing);
  const originSide = Math.sign((fromX - bag.x) * fx + (fromY - bag.y) * fy) || 1;
  const hit = Math.max(1, Math.round(damage));
  for (const u of state.entities.values()) {
    if (u.hp <= 0 || u.kind !== "unit" || u.garrisonedIn != null) continue;
    const dx = u.x - bag.x;
    const dy = u.y - bag.y;
    const along = dx * tx + dy * ty;
    const across = dx * fx + dy * fy;
    if (Math.abs(along) > span.length / 2 + 8) continue;
    const depth = Math.abs(across) - span.thick / 2;
    if (depth < -6 || depth > SANDBAG_COVER_DEPTH) continue;
    const side = Math.sign(across) || -originSide;
    if (side === originSide) continue;
    u.hp = Math.max(0, u.hp - hit);
  }
}

function sandbagOnSegment(
  state: MatchState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { e: Entity; t: number; x: number; y: number } | null {
  let best: { e: Entity; t: number; x: number; y: number } | null = null;
  for (const e of state.entities.values()) {
    if (e.type !== "sandbags" || e.ruined || e.hp <= 0) continue;
    const span = fieldSpan("sandbags")!;
    const t = segmentObbT(x0, y0, x1, y1, e.x, e.y, e.facing, span.length / 2, span.thick / 2);
    if (t == null) continue;
    if (best && t >= best.t) continue;
    best = { e, t, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
  }
  return best;
}

export function sandbagSweep(
  state: MatchState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tankShell: boolean,
): { e: Entity; t: number; x: number; y: number } | null {
  if (!tankShell) return null;
  return sandbagOnSegment(state, x0, y0, x1, y1);
}

function segmentObbT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  facing: number,
  halfAlong: number,
  halfAcross: number,
): number | null {
  const { fx, fy, tx, ty } = wallAxes(facing);
  const lx0 = (x0 - cx) * tx + (y0 - cy) * ty;
  const ly0 = (x0 - cx) * fx + (y0 - cy) * fy;
  const lx1 = (x1 - cx) * tx + (y1 - cy) * ty;
  const ly1 = (x1 - cx) * fx + (y1 - cy) * fy;
  const box = { x0: -halfAlong, y0: -halfAcross, x1: halfAlong, y1: halfAcross };
  const dx = lx1 - lx0;
  const dy = ly1 - ly0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (lx0 >= box.x0 && lx0 <= box.x1 && ly0 >= box.y0 && ly0 <= box.y1) return 0;
  if (!clip(-dx, lx0 - box.x0)) return null;
  if (!clip(dx, box.x1 - lx0)) return null;
  if (!clip(-dy, ly0 - box.y0)) return null;
  if (!clip(dy, box.y1 - ly0)) return null;
  if (t0 > t1 || t0 > 1 || t1 < 0) return null;
  return t0 < 0 ? 0 : t0;
}

/** 1 = sandbags (blocks everyone). 2 = dragon's teeth (vehicles only). */
export function restampForts(state: MatchState): void {
  state.fortBlock.fill(0);
  for (const e of state.entities.values()) {
    if (!isFieldStructure(e.type) || e.hp <= 0 || e.ruined) continue;
    const code = e.type === "teeth" ? 2 : 1;
    for (const t of fieldTiles(state, e.type, e.x, e.y, e.facing, 0)) {
      state.fortBlock[tileIndex(state, t.x, t.y)] = code;
    }
  }
}

/** A crawling gun cannot shoot across intact sandbags. Mortar bombs arc over. */
export function sandbagsBlockGun(state: MatchState, x0: number, y0: number, x1: number, y1: number): boolean {
  return sandbagOnSegment(state, x0, y0, x1, y1) != null;
}
