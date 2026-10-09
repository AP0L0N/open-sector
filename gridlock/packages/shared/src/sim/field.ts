import { buildingRect, isTurnedBuilding, rectContains, rectNearest, rectWorld } from "../building-rect.js";
import {
  NEUTRAL_OWNER,
  catalog,
  CYBORG_REPAIR_PER_SEC,
  ENGINEER_SEEK_TILES,
  fieldSpan,
  GATE_OPEN_SECONDS,
  GATE_SENSE_TILES,
  isConcreteLine,
  MAX_UNIT_RADIUS,
  UNIT_SPACE_PAD,
  isAircraftType,
  isArmoredType,
  isBridge,
  isCyborg,
  isFieldStructure,
  isInfantryType,
  isRepairableUnit,
  stanceOf,
  TILE_SIZE,
  TILE_SUBDIV,
  WALL_RISE_MAX_SLABS,
  wallSlabHeight,
  WRECK_SCRAP_SECONDS,
  type ConcreteLineType,
  type EntityType,
  type FieldStructureType,
  type ShellType,
} from "../catalog.js";
import { ISO_ELEVATION, isoScale } from "../iso.js";
import { groveConceal } from "../maps.js";
import {
  allies,
  clearOrder,
  destroyEntity,
  inBounds,
  isTree,
  isWater,
  makeEntity,
  scrapAt,
  tileCenter,
  tileIndex,
  walkable,
  worldToTile,
} from "./geo.js";
import { takeDamage } from "./crits.js";
import { claimNeutral } from "./garrison.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";
import { isSunkWreck, salvageWreck } from "./wreck.js";
import { sightKeysHeld } from "./vision.js";
import { bridgeRepairSpot, canRebuildBridge, nearBridge, rebuildBridge, rebuildSecondsOf } from "./bridge.js";

/** Extra reach past the wall face where the engineer stands to build. */
const STAND_PAD = 14;
const WORK_REACH = 12;
const REPAIR_REACH = 16;
/** Hit points restored each second while an engineer is on the job. */
export const REPAIR_PER_SEC = 14;
/** Seconds to fix tracks or an engine on a hull that has no hit points to restore. */
export const HULL_FIX_SECONDS = 3;
/** How far past the sandbag face a crouched or crawling soldier still counts as behind them. */
export const SANDBAG_COVER_DEPTH = 22;
/** Extra hit points while crouched or crawling against intact sandbags, as a share of catalog HP. */
export const SANDBAG_COVER_BONUS = 0.5;
/**
 * A crewed gun fires over sandbags whose ground stands less than this many
 * height steps above its own. One terrace: bags on a rise above it still stop the round.
 */
export const SANDBAG_CLEAR_RISE = TILE_SUBDIV;
/** How far past the concrete face a unit still counts as beside the wall. */
export const WALL_COVER_DEPTH = 26;
/** Extra hit points while beside an intact wall, as a share of catalog HP. */
export const WALL_COVER_BONUS = 0.25;
/** Ground hits beside a wall deal this share. Overhead attacks ignore the wall. */
export const WALL_COVER_DR = 0.7;
/** Extra hit points per tree in the soldier's own tile and the eight around it, as a share of catalog HP. */
export const TREE_COVER_PER = 0.2;
/** Tree cover stops at this share of catalog HP. Five nearby trees. */
export const TREE_COVER_MAX = 1;
/** Chebyshev tiles from the soldier that still count as beside a tree. His own tile counts. */
export const TREE_COVER_RADIUS = 1;
/** Overlap below this still counts as adjacent, so two structures can touch. */
const PLACE_SLACK = 3;

export function wallAxes(facing: number): { fx: number; fy: number; tx: number; ty: number } {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  return { fx, fy, tx: -fy, ty: fx };
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
  return fieldTilesOn(state, type, x, y, facing, pad);
}

/** Tiles under a field structure on any grid, so a snapshot preview matches the sim. */
export function fieldTilesOn(
  grid: { width: number; height: number; tileSize: number },
  type: EntityType,
  x: number,
  y: number,
  facing: number,
  pad = 0,
): { x: number; y: number }[] {
  const span = fieldSpan(type);
  if (!span) return [];
  const ts = grid.tileSize;
  const reach = Math.hypot(span.length, span.thick) / 2 + pad + ts;
  const x0 = Math.max(0, worldToTile(x - reach, ts));
  const x1 = Math.min(grid.width - 1, worldToTile(x + reach, ts));
  const y0 = Math.max(0, worldToTile(y - reach, ts));
  const y1 = Math.min(grid.height - 1, worldToTile(y + reach, ts));
  // A strip at least one tile wide always holds a tile centre, so a thin wall leaves no gap at any angle.
  const thick = Math.max(span.thick, ts);
  const out: { x: number; y: number }[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const cx = tileCenter(tx, ts);
      const cy = tileCenter(ty, ts);
      if (!inFieldRect(cx, cy, x, y, facing, span.length + pad * 2, thick + pad * 2)) continue;
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

export function overlapsFieldIn(
  entities: Iterable<{ type: EntityType; x: number; y: number; facing: number; hp: number; ruined?: boolean }>,
  type: FieldStructureType,
  x: number,
  y: number,
  facing: number,
): boolean {
  const mine = fieldBox(type, x, y, facing);
  if (!mine) return true;
  for (const e of entities) {
    if (!isFieldStructure(e.type) || e.hp <= 0 || e.ruined) continue;
    const other = fieldBox(e.type, e.x, e.y, e.facing);
    if (other && boxesConflict(mine, other)) return true;
  }
  return false;
}

function overlapsField(state: MatchState, type: FieldStructureType, x: number, y: number, facing: number): boolean {
  return overlapsFieldIn(state.entities.values(), type, x, y, facing);
}

/** A yard line sited and still building. Its sections count as standing for anything else placed. */
export interface SitedLine {
  type: EntityType;
  sites?: readonly { x: number; y: number; facing: number }[];
}

/** True when this field piece would overlap a section of the sited line. Edges may meet. */
export function overlapsSitedLine(
  line: SitedLine | null | undefined,
  type: FieldStructureType,
  x: number,
  y: number,
  facing: number,
): boolean {
  if (!line?.sites?.length || !isFieldStructure(line.type)) return false;
  const lineType = line.type;
  return overlapsFieldIn(
    line.sites.map((s) => ({ type: lineType, x: s.x, y: s.y, facing: s.facing, hp: 1 })),
    type,
    x,
    y,
    facing,
  );
}

/** Tiles under the sections of a sited line, as `y * width + x`. */
export function sitedLineTiles(
  grid: { width: number; height: number; tileSize: number },
  line: SitedLine | null | undefined,
): Set<number> {
  const out = new Set<number>();
  if (!line?.sites?.length) return out;
  for (const s of line.sites) {
    for (const t of fieldTilesOn(grid, line.type, s.x, s.y, s.facing, 0)) out.add(t.y * grid.width + t.x);
  }
  return out;
}

/**
 * Sharpest turn a line can take at a corner, radians of deflection. Past this
 * the next leg folds back over the last one, so the leg is dropped.
 */
export const FIELD_TURN_MAX = (3 * Math.PI) / 4;
/** Most pieces one order can lay. Well past a line across the whole map. */
export const FIELD_PIECES_MAX = 512;

export interface FieldPiece {
  x: number;
  y: number;
  facing: number;
}

/**
 * Pieces laid end to end from the press point toward the release point, like a wall drag.
 * A short drag is one piece at the press point on `facing`. A longer drag turns every piece
 * along the line and keeps whichever side of it is closer to `facing`.
 */
export function fieldLine(
  type: FieldStructureType,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  facing: number,
): FieldPiece[] {
  return fieldPath(type, [{ x: x0, y: y0 }, { x: x1, y: y1 }], facing);
}

/** Deflection between two unit directions, 0 straight on to π folded back. */
export function fieldTurn(ax: number, ay: number, bx: number, by: number): number {
  return Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by)));
}

/**
 * Where the next leg starts when a line turns at the end `(ex, ey)` of a leg
 * running along `(ux, uy)` into one along `(vx, vy)`. Both legs are pushed past the
 * corner by half the thickness times tan(turn / 2), which is the mitre: a right angle
 * puts the new leg's first piece exactly on the flank of the old leg's last piece, so
 * the two never overlap by more than a touch and leave no gap on the outer corner.
 */
export function fieldCornerStart(
  thick: number,
  ex: number,
  ey: number,
  ux: number,
  uy: number,
  vx: number,
  vy: number,
): { x: number; y: number } {
  const turn = fieldTurn(ux, uy, vx, vy);
  const off = (thick / 2) * Math.tan(Math.min(turn, FIELD_TURN_MAX) / 2);
  return { x: ex + off * (vx - ux), y: ey + off * (vy - uy) };
}

/**
 * Pieces along a polyline. The first point is where the line starts; each later point
 * is where the player released or clicked next. Every leg is laid in whole pieces from
 * its start, so a leg ends a little short of or past the point, and the next leg starts
 * at that end, offset into the mitre of the corner. A single point is one piece on
 * `facing`. The first leg faces whichever flank is closer to `facing`, and every later
 * leg faces the same flank, so the front of the line stays the front round every corner.
 * A leg shorter than half a piece, or one folded back past FIELD_TURN_MAX, is skipped.
 *
 * With `lead`, the line carries on from a standing one whose end is the first point: `lead`
 * is the way that line runs into it and `facing` is its end piece's. The first leg turns off
 * it in a mitre like any corner and keeps its front, and a lone point is one more piece along it.
 */
export function fieldPath(
  type: FieldStructureType,
  points: readonly { x: number; y: number }[],
  facing: number,
  lead?: { x: number; y: number } | null,
): FieldPiece[] {
  const span = fieldSpan(type);
  if (!span || points.length === 0) return [];
  const first = points[0]!;
  const out: FieldPiece[] = [];
  let sx = first.x;
  let sy = first.y;
  let ux: number | null = null;
  let uy = 0;
  // Which flank the front is on: 1 right of the direction of travel, -1 left. Set by the first leg.
  let side = 0;
  const leadLen = lead ? Math.hypot(lead.x, lead.y) : 0;
  if (lead && leadLen > 1e-6) {
    ux = lead.x / leadLen;
    uy = lead.y / leadLen;
    side = Math.cos(Math.atan2(-ux, uy) - facing) < 0 ? -1 : 1;
  }
  for (let i = 1; i < points.length && out.length < FIELD_PIECES_MAX; i++) {
    const target = points[i]!;
    const dx = target.x - sx;
    const dy = target.y - sy;
    let dist = Math.hypot(dx, dy);
    if (dist < span.length * 0.5) continue;
    const vx = dx / dist;
    const vy = dy / dist;
    let x0 = sx;
    let y0 = sy;
    if (ux != null) {
      if (fieldTurn(ux, uy, vx, vy) > FIELD_TURN_MAX) continue;
      // The leg keeps the heading from the old end to the point; only its start moves into the mitre.
      const start = fieldCornerStart(span.thick, sx, sy, ux, uy, vx, vy);
      x0 = start.x;
      y0 = start.y;
      dist = (target.x - x0) * vx + (target.y - y0) * vy;
      if (dist < span.length * 0.5) continue;
    }
    const right = Math.atan2(-vx, vy);
    if (side === 0) side = Math.cos(right - facing) < 0 ? -1 : 1;
    const legFace = side > 0 ? right : right + Math.PI;
    const n = Math.min(FIELD_PIECES_MAX - out.length, Math.max(1, Math.round(dist / span.length)));
    for (let k = 0; k < n; k++) {
      const along = span.length * (k + 0.5);
      out.push({ x: x0 + vx * along, y: y0 + vy * along, facing: legFace });
    }
    sx = x0 + vx * span.length * n;
    sy = y0 + vy * span.length * n;
    ux = vx;
    uy = vy;
  }
  if (out.length === 0 && ux != null && side !== 0) {
    // Carrying on from a standing line with nowhere drawn yet: one more piece straight on.
    const right = Math.atan2(-ux, uy);
    const half = span.length / 2;
    return [{ x: first.x + ux * half, y: first.y + uy * half, facing: side > 0 ? right : right + Math.PI }];
  }
  if (out.length === 0) return [{ x: first.x, y: first.y, facing }];
  return out;
}

/** A standing piece a new line can carry on from: one of its open ends, and how its line runs into it. */
export interface FieldEnd {
  /** World point of the open end. */
  x: number;
  y: number;
  /** Unit direction from the piece's middle out through that end. */
  lead: { x: number; y: number };
  /** The piece's own facing, so the new line keeps its front. */
  facing: number;
}

/** The two ends of a field piece along its run. */
export function fieldPieceEnds(type: FieldStructureType, x: number, y: number, facing: number): [{ x: number; y: number }, { x: number; y: number }] | null {
  const span = fieldSpan(type);
  if (!span) return null;
  const { tx, ty } = wallAxes(facing);
  const half = span.length / 2;
  return [
    { x: x - tx * half, y: y - ty * half },
    { x: x + tx * half, y: y + ty * half },
  ];
}

/**
 * The open end of the `type` piece under world point (px, py) a new line can carry on from, or null.
 * An end is open when no other piece in `pieces` (any field type) touches it; a piece with both
 * ends open gives the one nearer the point. The middle of a line, joined at both ends, gives null.
 * `mine` limits which pieces a line may carry on from; every piece still closes the ends it touches.
 */
export function fieldEndAt<P extends { type: string; x: number; y: number; facing: number }>(
  type: FieldStructureType,
  pieces: Iterable<P>,
  px: number,
  py: number,
  mine?: (p: P) => boolean,
): FieldEnd | null {
  const span = fieldSpan(type);
  if (!span || type === "gate") return null;
  const all: { type: FieldStructureType; x: number; y: number; facing: number; mine: boolean }[] = [];
  for (const p of pieces) {
    const t = p.type as EntityType;
    if (isFieldStructure(t) && fieldSpan(t)) all.push({ type: t, x: p.x, y: p.y, facing: p.facing, mine: !mine || mine(p) });
  }
  let hit: (typeof all)[number] | null = null;
  let best = Infinity;
  for (const p of all) {
    if (p.type !== type || !p.mine) continue;
    const { fx, fy, tx, ty } = wallAxes(p.facing);
    const dx = px - p.x;
    const dy = py - p.y;
    const along = Math.abs(dx * tx + dy * ty);
    const across = Math.abs(dx * fx + dy * fy);
    if (along > span.length / 2 + 2 || across > span.thick / 2 + 6) continue;
    const d = Math.hypot(dx, dy);
    if (d < best) {
      best = d;
      hit = p;
    }
  }
  if (!hit) return null;
  const ends = fieldPieceEnds(type, hit.x, hit.y, hit.facing)!;
  // Something touches an end when that end lies on its centreline run, within its half-thickness.
  const touched = (e: { x: number; y: number }): boolean =>
    all.some((o) => {
      if (o === hit) return false;
      const os = fieldSpan(o.type)!;
      const { fx, fy, tx, ty } = wallAxes(o.facing);
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const along = Math.max(0, Math.abs(dx * tx + dy * ty) - os.length / 2);
      const across = Math.max(0, Math.abs(dx * fx + dy * fy) - os.thick / 2);
      return Math.hypot(along, across) <= Math.max(span.thick, os.thick) * 0.6 + 1.5;
    });
  let pick: { x: number; y: number } | null = null;
  let pickD = Infinity;
  for (const e of ends) {
    if (touched(e)) continue;
    const d = Math.hypot(px - e.x, py - e.y);
    if (d < pickD) {
      pickD = d;
      pick = e;
    }
  }
  if (!pick) return null;
  const lx = pick.x - hit.x;
  const ly = pick.y - hit.y;
  const len = Math.hypot(lx, ly) || 1;
  return { x: pick.x, y: pick.y, lead: { x: lx / len, y: ly / len }, facing: hit.facing };
}

/** The pieces an order describes: a polyline, a drag, or one piece. */
export function fieldPiecesFor(
  type: FieldStructureType,
  x: number,
  y: number,
  facing: number,
  x2?: number,
  y2?: number,
  path?: readonly { x: number; y: number }[],
  lead?: { x: number; y: number } | null,
): FieldPiece[] {
  if (path && path.length > 0) {
    const pts = path.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length === 0) return [];
    return fieldPath(type, pts, facing, lead);
  }
  const line = x2 != null && y2 != null && Number.isFinite(x2) && Number.isFinite(y2);
  return line ? fieldLine(type, x, y, x2, y2, facing) : [{ x, y, facing }];
}

export function fieldSiteClear(
  state: MatchState,
  type: FieldStructureType,
  x: number,
  y: number,
  facing: number,
  ownerId?: string,
): boolean {
  const tiles = fieldTiles(state, type, x, y, facing, 0);
  if (tiles.length === 0) return false;
  // The owner's yard line, sited and still building, already holds its ground.
  if (ownerId != null && overlapsSitedLine(state.players.get(ownerId)?.line, type, x, y, facing)) return false;
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

function pieceBuildable(state: MatchState, structure: FieldStructureType, p: FieldPiece, ownerId: string): boolean {
  if (!fieldSiteClear(state, structure, p.x, p.y, p.facing, ownerId)) return false;
  const spot = standPoint(structure, p.x, p.y, p.facing);
  return walkable(state, worldToTile(spot.x, state.tileSize), worldToTile(spot.y, state.tileSize), "engineer");
}

function startPiece(state: MatchState, eng: Entity, structure: FieldStructureType, p: FieldPiece): void {
  eng.order = { kind: "build", x: p.x, y: p.y, facing: p.facing, structure };
  eng.work = 0;
  eng.state = "move";
  const spot = standPoint(structure, p.x, p.y, p.facing);
  setPath(state, eng, spot.x, spot.y);
}

/**
 * One piece at (x, y), a line toward (x2, y2), or a polyline along `path`.
 * Several engineers split a line into runs and each starts at his own end of it.
 */
export function orderFieldBuild(
  state: MatchState,
  playerId: string,
  engineers: Entity[],
  structure: FieldStructureType,
  x: number,
  y: number,
  facing: number,
  x2?: number,
  y2?: number,
  path?: readonly { x: number; y: number }[],
  lead?: { x: number; y: number },
): string | null {
  const crew = engineers.filter((e) => e.type === "engineer" && e.hp > 0 && !e.wreck);
  if (crew.length === 0) return "Select an engineer.";
  if (structure === "gate") return "Build a gate from the Defences tab.";
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return "Cannot place there.";
  const pieces = fieldPiecesFor(structure, x, y, facing, x2, y2, path, lead).filter((p) => pieceBuildable(state, structure, p, crew[0]!.ownerId));
  if (pieces.length === 0) return "Cannot place there.";
  const workers = crew.slice(0, pieces.length);
  const ux = pieces.length > 1 ? pieces[pieces.length - 1]!.x - pieces[0]!.x : 0;
  const uy = pieces.length > 1 ? pieces[pieces.length - 1]!.y - pieces[0]!.y : 0;
  workers.sort((a, b) => a.x * ux + a.y * uy - (b.x * ux + b.y * uy) || a.id - b.id);
  const per = Math.ceil(pieces.length / workers.length);
  workers.forEach((eng, i) => {
    const run = pieces.slice(i * per, (i + 1) * per);
    if (run.length === 0) return;
    const first = run[0]!;
    const last = run[run.length - 1]!;
    if (Math.hypot(eng.x - last.x, eng.y - last.y) < Math.hypot(eng.x - first.x, eng.y - first.y)) run.reverse();
    clearOrder(eng);
    eng.fieldQueue = run.slice(1);
    startPiece(state, eng, structure, run[0]!);
  });
  return null;
}

function repairOwner(state: MatchState, playerId: string, ownerId: string): boolean {
  if (!ownerId || ownerId === NEUTRAL_OWNER) return true;
  return allies(state, playerId, ownerId);
}

/** A hulk on land an engineer can cut up. A sunken ship is out of his reach. */
export function canScrapWreck(target: Entity): boolean {
  return target.wreck && target.hp > 0 && target.kind === "unit" && isArmoredType(target.type) && !isSunkWreck(target);
}

function hullDamaged(target: Entity): boolean {
  return target.crits.includes("tracks") || target.crits.includes("engine");
}

/** Every lamp on this hull or tower is out. */
function lampsOut(target: Entity): boolean {
  return target.crits.includes("lamp");
}

/** A tank-shelled sandbag wall an engineer can stack back up, unless something new was built on its spot. */
function canRestackSandbags(state: MatchState, target: Entity): boolean {
  if (target.type !== "sandbags" || !target.ruined || target.hp <= 0) return false;
  return !overlapsField(state, "sandbags", target.x, target.y, target.facing);
}

/** Someone standing on the footprint would be walled in, so the engineer waits for them to step off. */
function fieldFootprintBusy(state: MatchState, target: Entity): boolean {
  const span = fieldSpan(target.type);
  if (!span) return false;
  for (const u of state.entities.values()) {
    if (u.kind !== "unit" || u.hp <= 0 || u.wreck || u.garrisonedIn != null) continue;
    const pad = u.radius * 2;
    if (inFieldRect(u.x, u.y, target.x, target.y, target.facing, span.length + pad, span.thick + pad)) return true;
  }
  return false;
}

export function canRepairTarget(state: MatchState, playerId: string, target: Entity): boolean {
  if (canScrapWreck(target)) return true;
  // Bridges belong to no one: any engineer rebuilds the wreckage or patches the deck.
  if (isBridge(target.type) && target.ruined) return canRebuildBridge(state, target);
  if (target.type === "sandbags" && target.ruined) {
    return repairOwner(state, playerId, target.ownerId) && canRestackSandbags(state, target);
  }
  if (target.hp <= 0 || target.wreck || target.ruined) return false;
  if (target.hp >= target.hpMax && !(target.kind === "unit" && hullDamaged(target)) && !lampsOut(target)) return false;
  if (!repairOwner(state, playerId, target.ownerId)) return false;
  if (target.kind === "unit") return isRepairableUnit(target.type);
  if (target.type === "sandbags") return false;
  return target.kind === "building";
}

/** Just outside the wreck's pathing halo, where an engineer can kneel. */
function scrapReach(target: Entity): number {
  return target.radius + MAX_UNIT_RADIUS + UNIT_SPACE_PAD + 10;
}

function repairSpot(eng: Entity, target: Entity, tileSize: number): { x: number; y: number } {
  if (isBridge(target.type)) return bridgeRepairSpot(eng, target);
  if (target.kind === "unit") {
    const dx = eng.x - target.x;
    const dy = eng.y - target.y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = target.wreck ? scrapReach(target) : target.radius + 12;
    return { x: target.x + (dx / d) * reach, y: target.y + (dy / d) * reach };
  }
  if (isFieldStructure(target.type)) {
    const span = fieldSpan(target.type)!;
    const { fx, fy } = wallAxes(target.facing);
    const side = Math.sign((eng.x - target.x) * fx + (eng.y - target.y) * fy) || -1;
    const off = span.thick / 2 + STAND_PAD;
    return { x: target.x + fx * off * side, y: target.y + fy * off * side };
  }
  if (isTurnedBuilding(target)) {
    // Stand a hand's width off the turned wall nearest the engineer.
    const r = buildingRect(target, tileSize);
    const edge = rectNearest(r, eng.x, eng.y);
    const dx = eng.x - edge.x;
    const dy = eng.y - edge.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return rectWorld(r, r.halfU + 12, 0);
    return { x: edge.x + (dx / d) * 12, y: edge.y + (dy / d) * 12 };
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
  if (isBridge(target.type)) return nearBridge(eng, target);
  if (target.kind === "unit") {
    const reach = target.wreck ? scrapReach(target) + 6 : target.radius + REPAIR_REACH;
    return Math.hypot(eng.x - target.x, eng.y - target.y) <= reach;
  }
  if (isFieldStructure(target.type)) {
    const span = fieldSpan(target.type)!;
    return inFieldRect(
      eng.x,
      eng.y,
      target.x,
      target.y,
      target.facing,
      span.length + REPAIR_REACH * 2,
      span.thick + (STAND_PAD + WORK_REACH) * 2,
    );
  }
  if (isTurnedBuilding(target)) return rectContains(buildingRect(target, tileSize), eng.x, eng.y, REPAIR_REACH);
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

/** Next queued piece that is still buildable, or idle when the line is done. */
function nextPiece(state: MatchState, e: Entity, structure: FieldStructureType): void {
  const queue = e.fieldQueue ?? [];
  finishWork(e);
  while (queue.length > 0) {
    const p = queue.shift()!;
    if (!pieceBuildable(state, structure, p, e.ownerId)) continue;
    e.fieldQueue = queue;
    startPiece(state, e, structure, p);
    return;
  }
}

function wallPiecesOf(e: Entity): FieldPiece[] {
  const order = e.order;
  if (!order || order.x == null || order.y == null) return [];
  return [{ x: order.x, y: order.y, facing: order.facing ?? 0 }, ...(e.fieldQueue ?? [])];
}

/**
 * One job for the whole line. The engineer works `buildSeconds` for each piece,
 * then every piece appears together.
 */
function tickWall(state: MatchState, e: Entity, dt: number, structure: ConcreteLineType): void {
  const pieces = wallPiecesOf(e);
  if (pieces.length === 0) {
    finishWork(e);
    return;
  }
  const first = pieces[0]!;
  const spot = standPoint(structure, first.x, first.y, first.facing);
  if (e.waypoints.length > 0) return;
  if (Math.hypot(e.x - spot.x, e.y - spot.y) > WORK_REACH) {
    e.state = "move";
    if ((state.tick + e.id) % 8 === 0) setPath(state, e, spot.x, spot.y);
    return;
  }
  if (e.work <= 0) {
    const open = pieces.filter((p) => fieldSiteClear(state, structure, p.x, p.y, p.facing, e.ownerId));
    if (open.length === 0) {
      finishWork(e);
      return;
    }
    const lead = open[0]!;
    const leadSpot = standPoint(structure, lead.x, lead.y, lead.facing);
    if (Math.hypot(e.x - leadSpot.x, e.y - leadSpot.y) > WORK_REACH) {
      e.order = { kind: "build", x: lead.x, y: lead.y, facing: lead.facing, structure };
      e.fieldQueue = open.slice(1);
      e.state = "move";
      setPath(state, e, leadSpot.x, leadSpot.y);
      return;
    }
    const def = catalog(structure);
    const player = state.players.get(e.ownerId);
    const n = player ? Math.min(open.length, Math.floor(player.scrap / def.cost)) : 0;
    if (!player || n === 0) {
      finishWork(e);
      if (player) state.pendingComms.push("Not enough scrap.");
      return;
    }
    const build = open.slice(0, n);
    player.scrap -= def.cost * n;
    const paid = build[0]!;
    e.order = { kind: "build", x: paid.x, y: paid.y, facing: paid.facing, structure };
    e.fieldQueue = build.slice(1);
  }
  const count = wallPiecesOf(e).length;
  e.waypoints = [];
  e.state = "build";
  const aim = wallPiecesOf(e)[0]!;
  e.facing = Math.atan2(aim.y - e.y, aim.x - e.x);
  e.turretFacing = e.facing;
  e.work += dt;
  // 0.1 added ten times a second undershoots the duration by a rounding error.
  if (e.work + 1e-6 < catalog(structure).buildSeconds * count) return;
  const player = state.players.get(e.ownerId);
  let placed = 0;
  const raised: Entity[] = [];
  const done = wallPiecesOf(e);
  // Check every piece before raising any: at a corner the first section would otherwise touch the second.
  const clear = done.map((p) => fieldSiteClear(state, structure, p.x, p.y, p.facing, e.ownerId));
  for (let i = 0; i < done.length; i++) {
    const p = done[i]!;
    if (!clear[i]) {
      if (player) player.scrap += catalog(structure).cost;
      continue;
    }
    const built = makeEntity(state, structure, e.ownerId, p.x, p.y, { facing: p.facing });
    built.facing = p.facing;
    built.turretFacing = p.facing;
    raised.push(built);
    placed++;
  }
  if (placed > 0) {
    raiseWallCrest(state, raised);
    restampForts(state);
  }
  finishWork(e);
}

function tickBuild(state: MatchState, e: Entity, dt: number): void {
  const order = e.order;
  // A base building in the field (the Smelter on scrap) is construct.ts's job.
  if (!order || order.kind !== "build" || order.building != null) return;
  if (order.structure == null || order.x == null || order.y == null) return;
  const structure = order.structure;
  if (isConcreteLine(structure)) {
    tickWall(state, e, dt, structure);
    return;
  }
  const facing = order.facing ?? 0;
  const spot = standPoint(structure, order.x, order.y, facing);
  if (e.waypoints.length > 0) return;
  if (Math.hypot(e.x - spot.x, e.y - spot.y) > WORK_REACH) {
    e.state = "move";
    if ((state.tick + e.id) % 8 === 0) setPath(state, e, spot.x, spot.y);
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
    if (!fieldSiteClear(state, structure, order.x, order.y, facing, e.ownerId)) {
      nextPiece(state, e, structure);
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
  if (!fieldSiteClear(state, structure, order.x, order.y, facing, e.ownerId)) {
    const player = state.players.get(e.ownerId);
    if (player) player.scrap += catalog(structure).cost;
    nextPiece(state, e, structure);
    return;
  }
  const built = makeEntity(state, structure, e.ownerId, order.x, order.y, { facing });
  built.facing = facing;
  built.turretFacing = facing;
  restampForts(state);
  nextPiece(state, e, structure);
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
    if (e.waypoints.length === 0 || (state.tick + e.id) % 8 === 0) {
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
    salvageWreck(state, e.ownerId, target);
    finishWork(e);
    return;
  }
  if (isBridge(target.type) && target.ruined) {
    e.work += dt;
    if (e.work + 1e-6 < rebuildSecondsOf(target)) return;
    rebuildBridge(state, target);
    finishWork(e);
    return;
  }
  if (target.ruined) {
    e.work += dt;
    if (e.work < catalog(target.type).buildSeconds || fieldFootprintBusy(state, target)) return;
    target.ruined = false;
    target.hp = target.hpMax;
    restampForts(state);
    finishWork(e);
    return;
  }
  if (target.hp < target.hpMax) {
    const rate = isCyborg(target.type) ? CYBORG_REPAIR_PER_SEC : REPAIR_PER_SEC;
    target.hp = Math.min(target.hpMax, target.hp + rate * dt);
    if (target.hp < target.hpMax) return;
  } else if ((target.kind === "unit" && hullDamaged(target)) || lampsOut(target)) {
    e.work += dt;
    if (e.work < HULL_FIX_SECONDS) return;
  }
  target.crits = target.crits.filter((c) => {
    if (c === "lamp") return false;
    return target.kind !== "unit" || (c !== "tracks" && c !== "engine");
  });
  finishWork(e);
}

/** Idle, or on a patch-up he picked for himself. A player order wins. */
function mayAutoRepair(e: Entity): boolean {
  if (e.garrisonedIn != null || e.state === "deploy" || e.state === "undeploy") return false;
  const o = e.order;
  return !o || (o.auto === true && o.kind === "repair");
}

/** Damaged allied armor on the ground, close enough to walk to. A held engineer only works what he can touch. */
function canPatch(state: MatchState, eng: Entity, other: Entity): boolean {
  if (other.kind !== "unit" || other.wreck || other.garrisonedIn != null) return false;
  if (!isRepairableUnit(other.type) || isAircraftType(other.type)) return false;
  if (!canRepairTarget(state, eng.ownerId, other)) return false;
  if (eng.holdPosition) return nearRepair(eng, other, state.tileSize);
  const seek = ENGINEER_SEEK_TILES * state.tileSize;
  return Math.hypot(other.x - eng.x, other.y - eng.y) <= seek;
}

function choosePatch(state: MatchState, eng: Entity): Entity | null {
  const currentId = eng.order?.kind === "repair" ? eng.order.targetId : undefined;
  const current = currentId != null ? state.entities.get(currentId) : undefined;
  if (current && canPatch(state, eng, current)) return current;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const other of state.entities.values()) {
    if (!canPatch(state, eng, other)) continue;
    const d = Math.hypot(other.x - eng.x, other.y - eng.y);
    if (!best || d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && other.id < best.id)) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

/** Like the medic: an idle engineer walks to the nearest damaged allied hull and fixes it. */
function autoRepair(state: MatchState): void {
  for (const eng of state.entities.values()) {
    if (eng.type !== "engineer" || eng.kind !== "unit" || eng.hp <= 0) continue;
    if (!mayAutoRepair(eng)) continue;
    const target = choosePatch(state, eng);
    if (!target) {
      if (eng.order) finishWork(eng);
      continue;
    }
    if (eng.order?.targetId === target.id) continue;
    clearOrder(eng);
    eng.order = { kind: "repair", targetId: target.id, auto: true };
    eng.state = "move";
    const spot = repairSpot(eng, target, state.tileSize);
    setPath(state, eng, spot.x, spot.y);
  }
}

/**
 * A field section with its axes worked out once, filed under every cell it can
 * matter to. Cover, crushing and shot sweeps ask the cell instead of the roster:
 * with every unit and every round asking every tick, the roster walk was units
 * times sections and rounds times sections.
 */
interface FieldSection {
  e: Entity;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

interface FieldIndex {
  key: number;
  /** The phase the key was last checked in: every unit and round asks in the same phase, so the roster is hashed once. */
  rev: number;
  cell: number;
  cols: number;
  rows: number;
  buckets: (FieldSection[] | undefined)[];
}

const fieldIndexes = new WeakMap<MatchState, FieldIndex>();
/** Cell side of the section index, in sim tiles. */
const FIELD_CELL_TILES = 8;
/**
 * How far from its centre a section is filed, world px: past half the longest
 * span plus the deepest reach any query adds (cover depth, a hull's crush pad,
 * a round's own width). A query then reads only the cell its point is in.
 */
const FIELD_FILE_REACH = 96;
const NO_SECTIONS: readonly FieldSection[] = [];
let sectionStamp = new Int32Array(1024);
let sectionGen = 1;

function mixKey(h: number, v: number): number {
  return Math.imul(h ^ v, 16777619) >>> 0;
}

/** The standing sections, hashed by id, so the index is laid again only when one is raised or taken down. */
function fieldIndexKey(state: MatchState): number {
  let h = 2166136261;
  let n = 0;
  for (const e of state.entities.values()) {
    if (!isFieldStructure(e.type)) continue;
    h = mixKey(h, e.id);
    n++;
  }
  return mixKey(h, n);
}

function fieldIndexOf(state: MatchState): FieldIndex {
  const old = fieldIndexes.get(state);
  // Inside a tick the roster is hashed once per phase. A test raising a wall by hand between calls hashes afresh.
  if (old && old.rev === state.phaseRev && sightKeysHeld()) return old;
  const key = fieldIndexKey(state);
  if (old && old.key === key) {
    old.rev = state.phaseRev;
    return old;
  }
  const cell = FIELD_CELL_TILES * state.tileSize;
  const cols = Math.max(1, Math.ceil((state.width * state.tileSize) / cell));
  const rows = Math.max(1, Math.ceil((state.height * state.tileSize) / cell));
  const index: FieldIndex = { key, rev: state.phaseRev, cell, cols, rows, buckets: new Array(cols * rows) };
  for (const e of state.entities.values()) {
    if (!isFieldStructure(e.type)) continue;
    const { fx, fy, tx, ty } = wallAxes(e.facing);
    const s: FieldSection = { e, fx, fy, tx, ty };
    const cx0 = fieldCell((e.x - FIELD_FILE_REACH) / cell, cols);
    const cx1 = fieldCell((e.x + FIELD_FILE_REACH) / cell, cols);
    const cy0 = fieldCell((e.y - FIELD_FILE_REACH) / cell, rows);
    const cy1 = fieldCell((e.y + FIELD_FILE_REACH) / cell, rows);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = cy * cols + cx;
        (index.buckets[i] ??= []).push(s);
      }
    }
  }
  fieldIndexes.set(state, index);
  return index;
}

function fieldCell(t: number, n: number): number {
  if (t < 0) return 0;
  const i = t | 0;
  return i >= n ? n - 1 : i;
}

/** The sections that can touch a point, in id order. */
function sectionsAt(state: MatchState, x: number, y: number): readonly FieldSection[] {
  const index = fieldIndexOf(state);
  const cx = fieldCell(x / index.cell, index.cols);
  const cy = fieldCell(y / index.cell, index.rows);
  return index.buckets[cy * index.cols + cx] ?? NO_SECTIONS;
}

/** The sections that can touch a segment, each once. The array is reused by the next call. */
const sectionsBuf: FieldSection[] = [];
function sectionsAlong(state: MatchState, x0: number, y0: number, x1: number, y1: number): readonly FieldSection[] {
  const index = fieldIndexOf(state);
  const cx0 = fieldCell(Math.min(x0, x1) / index.cell, index.cols);
  const cx1 = fieldCell(Math.max(x0, x1) / index.cell, index.cols);
  const cy0 = fieldCell(Math.min(y0, y1) / index.cell, index.rows);
  const cy1 = fieldCell(Math.max(y0, y1) / index.cell, index.rows);
  if (cx0 === cx1 && cy0 === cy1) return index.buckets[cy0 * index.cols + cx0] ?? NO_SECTIONS;
  sectionsBuf.length = 0;
  sectionGen++;
  if (sectionGen >= 0x7fffffff) {
    sectionStamp.fill(0);
    sectionGen = 1;
  }
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const bucket = index.buckets[cy * index.cols + cx];
      if (!bucket) continue;
      for (const s of bucket) {
        const id = s.e.id;
        if (id >= sectionStamp.length) {
          const next = new Int32Array(Math.max(id + 1, sectionStamp.length * 2));
          next.set(sectionStamp);
          sectionStamp = next;
        }
        if (sectionStamp[id] === sectionGen) continue;
        sectionStamp[id] = sectionGen;
        sectionsBuf.push(s);
      }
    }
  }
  return sectionsBuf;
}

/** Crouched or crawling infantry tucked against an intact sandbag wall. */
export function sandbagCoverBonus(state: MatchState, e: Entity): number {
  if (e.hp <= 0 || e.garrisonedIn != null || !isInfantryType(e.type)) return 0;
  const stance = stanceOf(e);
  if (stance !== "crouch" && stance !== "crawl") return 0;
  const span = fieldSpan("sandbags")!;
  for (const s of sectionsAt(state, e.x, e.y)) {
    const bag = s.e;
    if (bag.type !== "sandbags" || bag.ruined || bag.hp <= 0) continue;
    const dx = e.x - bag.x;
    const dy = e.y - bag.y;
    const along = dx * s.tx + dy * s.ty;
    const across = dx * s.fx + dy * s.fy;
    if (Math.abs(along) > span.length / 2 + 8) continue;
    const depth = Math.abs(across) - span.thick / 2;
    if (depth < -6 || depth > SANDBAG_COVER_DEPTH) continue;
    return Math.max(1, Math.round(catalog(e.type).hp * SANDBAG_COVER_BONUS));
  }
  return 0;
}

function aloft(e: Entity): boolean {
  if (e.jet && e.jet.alt > 0.5) return true;
  if (e.air && e.air.alt > 0.5) return true;
  return (e.chute?.alt ?? 0) > 0.5;
}

/**
 * Extra hit points for infantry among trees. Each tree in his tile and the
 * eight around it adds 20% of his catalog HP, and the fifth tree fills the bonus.
 * A palm counts as half a tree and a cactus as two. A man inside a building,
 * or a Jump Jet in the air, is not among the trunks.
 */
export function treeCoverBonus(state: MatchState, e: Entity): number {
  if (e.hp <= 0 || e.garrisonedIn != null || !isInfantryType(e.type) || aloft(e)) return 0;
  const ts = state.tileSize;
  const tx = worldToTile(e.x, ts);
  const ty = worldToTile(e.y, ts);
  let trees = 0;
  for (let dy = -TREE_COVER_RADIUS; dy <= TREE_COVER_RADIUS; dy++) {
    for (let dx = -TREE_COVER_RADIUS; dx <= TREE_COVER_RADIUS; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (!inBounds(state, x, y)) continue;
      trees += groveConceal(state.terrain[tileIndex(state, x, y)] ?? 0);
    }
  }
  if (trees <= 0) return 0;
  const share = Math.min(TREE_COVER_MAX, trees * TREE_COVER_PER);
  return Math.max(1, Math.round(catalog(e.type).hp * share));
}

/** Any ground unit pressed against an intact concrete wall, either side. */
export function wallCoverBonus(state: MatchState, e: Entity): number {
  if (e.hp <= 0 || e.wreck || e.kind !== "unit" || e.garrisonedIn != null || aloft(e)) return 0;
  const span = fieldSpan("wall");
  if (!span) return 0;
  for (const s of sectionsAt(state, e.x, e.y)) {
    const wall = s.e;
    if (wall.type !== "wall" || wall.ruined || wall.hp <= 0) continue;
    const dx = e.x - wall.x;
    const dy = e.y - wall.y;
    const along = dx * s.tx + dy * s.ty;
    const across = dx * s.fx + dy * s.fy;
    if (Math.abs(along) > span.length / 2 + 8) continue;
    const depth = Math.abs(across) - span.thick / 2;
    if (depth < -6 || depth > WALL_COVER_DEPTH) continue;
    return Math.max(1, Math.round(catalog(e.type).hp * WALL_COVER_BONUS));
  }
  return 0;
}

/**
 * Apply `damage` after wall cover. A unit with no wall bonus is unchanged.
 * Overhead damage (mortar, bomb, a shot from the air) ignores the extra health
 * and the reduction: the bonus cannot keep him alive.
 */
export function coverStrike(e: Entity, damage: number, tick: number, overhead: boolean): number {
  const bonus = e.wallCover ?? 0;
  if (bonus <= 0 || e.kind !== "unit") return takeDamage(e, damage, tick);
  if (overhead) {
    const base = Math.max(0, e.hp - bonus);
    if (damage >= base) return takeDamage(e, Math.max(damage, e.hp), tick);
  } else if (damage > 0) {
    damage = Math.max(1, Math.round(damage * WALL_COVER_DR));
  }
  return takeDamage(e, damage, tick);
}

function applyCoverHp(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "unit") continue;
    // A garrison or a truck bed replaces hit points with its own pool.
    if (e.garrisonedIn != null) {
      e.coverBonus = 0;
      e.wallCover = 0;
      continue;
    }
    const sand = e.hp <= 0 ? 0 : sandbagCoverBonus(state, e);
    const wall = e.hp <= 0 ? 0 : wallCoverBonus(state, e);
    const trees = e.hp <= 0 ? 0 : treeCoverBonus(state, e);
    const next = sand + wall + trees;
    const prev = e.coverBonus;
    e.wallCover = wall;
    if (next === prev) continue;
    const delta = next - prev;
    e.coverBonus = next;
    e.hpMax = Math.max(1, e.hpMax + delta);
    if (delta > 0) e.hp += delta;
    else if (e.hp > e.hpMax) e.hp = e.hpMax;
  }
}

export function tickField(state: MatchState, dt: number): void {
  autoRepair(state);
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.kind !== "unit") continue;
    if (e.fieldQueue && e.order?.kind !== "build") e.fieldQueue = undefined;
    if (e.order?.kind === "build") tickBuild(state, e, dt);
    else if (e.order?.kind === "repair") tickRepair(state, e, dt);
  }
  tickGates(state, dt);
  applyCoverHp(state);
  claimNeutralSections(state);
}

/**
 * A neutral sandbag or wall section from the map goes to the side whose
 * infantry stand in its cover. Two sides there at once leave it neutral.
 */
function claimNeutralSections(state: MatchState): void {
  // The infantry on their feet, once, instead of the whole roster for every section.
  let foot: Entity[] | null = null;
  for (const sec of state.entities.values()) {
    if (sec.type !== "sandbags" && sec.type !== "wall") continue;
    if ((sec.ownerId && sec.ownerId !== NEUTRAL_OWNER) || sec.ruined || sec.hp <= 0) continue;
    if (!foot) {
      foot = [];
      for (const u of state.entities.values()) {
        if (u.kind !== "unit" || u.hp <= 0 || u.garrisonedIn != null || !u.ownerId || !isInfantryType(u.type) || aloft(u)) continue;
        foot.push(u);
      }
    }
    const span = fieldSpan(sec.type)!;
    const reach = sec.type === "sandbags" ? SANDBAG_COVER_DEPTH : WALL_COVER_DEPTH;
    const { fx, fy, tx, ty } = wallAxes(sec.facing);
    let taker: Entity | null = null;
    let contested = false;
    for (const u of foot) {
      const dx = u.x - sec.x;
      const dy = u.y - sec.y;
      if (Math.abs(dx * tx + dy * ty) > span.length / 2 + 8) continue;
      const depth = Math.abs(dx * fx + dy * fy) - span.thick / 2;
      if (depth < -6 || depth > reach) continue;
      if (!taker) taker = u;
      else if (!allies(state, taker.ownerId, u.ownerId)) contested = true;
    }
    if (taker && !contested) claimNeutral(state, sec, taker.ownerId);
  }
}

export function ruinSandbags(state: MatchState, bag: Entity): void {
  if (bag.type !== "sandbags" || bag.ruined) return;
  bag.ruined = true;
  restampForts(state);
  applyCoverHp(state);
}

/** Flatten a wire section: it stops no one from then on and stays as a tangle on the ground. */
export function ruinWire(state: MatchState, wire: Entity): void {
  if (wire.type !== "barbwire" || wire.ruined) return;
  wire.ruined = true;
  restampForts(state);
}

/** How far past its own radius a rolling hull flattens wire, world px. */
const WIRE_CRUSH_PAD = 2;

/** A motor vehicle rolling onto barbwire leaves it flat. Called from the movement step for every rolling hull. */
export function crushWireUnder(state: MatchState, e: Entity): void {
  const span = fieldSpan("barbwire")!;
  const pad = e.radius + WIRE_CRUSH_PAD;
  for (const s of sectionsAt(state, e.x, e.y)) {
    const w = s.e;
    if (w.type !== "barbwire" || w.ruined || w.hp <= 0) continue;
    if (Math.abs(w.x - e.x) > span.length + pad || Math.abs(w.y - e.y) > span.length + pad) continue;
    if (inFieldRect(e.x, e.y, w.x, w.y, w.facing, span.length + pad * 2, span.thick + pad * 2)) ruinWire(state, w);
  }
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
    takeDamage(u, hit, state.tick);
  }
}

function sandbagOnSegment(
  state: MatchState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  gunH?: number,
): { e: Entity; t: number; x: number; y: number } | null {
  let best: { e: Entity; t: number; x: number; y: number } | null = null;
  const span = fieldSpan("sandbags")!;
  for (const s of sectionsAlong(state, x0, y0, x1, y1)) {
    const e = s.e;
    if (e.type !== "sandbags" || e.ruined || e.hp <= 0) continue;
    if (gunH != null && bagGround(state, e) - gunH < SANDBAG_CLEAR_RISE) continue;
    const t = segmentObbT(x0, y0, x1, y1, e.x, e.y, e.facing, span.length / 2, span.thick / 2);
    if (t == null) continue;
    // The nearest; a dead heat goes to the lower id, as the roster walk broke it.
    if (best && (t > best.t || (t === best.t && e.id > best.e.id))) continue;
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
  gunH?: number,
): { e: Entity; t: number; x: number; y: number } | null {
  // A crewed gun's round, shell or bullet, clears level bags and meets only those on a rise above it.
  if (gunH != null) return sandbagOnSegment(state, x0, y0, x1, y1, gunH);
  if (!tankShell) return null;
  return sandbagOnSegment(state, x0, y0, x1, y1);
}

function bagGround(state: MatchState, bag: Entity): number {
  return state.heights[tileIndex(state, worldToTile(bag.x, state.tileSize), worldToTile(bag.y, state.tileSize))] ?? 0;
}

function wallOnSegment(
  state: MatchState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { e: Entity; t: number; x: number; y: number } | null {
  let best: { e: Entity; t: number; x: number; y: number } | null = null;
  for (const s of sectionsAlong(state, x0, y0, x1, y1)) {
    const e = s.e;
    if (!isConcreteLine(e.type) || e.hp <= 0 || e.ruined) continue;
    // A lifted boom is open air: rounds fly through the gap.
    if (gateOpen(e)) continue;
    const span = fieldSpan(e.type)!;
    const t = segmentObbT(x0, y0, x1, y1, e.x, e.y, e.facing, span.length / 2, span.thick / 2);
    if (t == null) continue;
    // The nearest; a dead heat goes to the lower id, as the roster walk broke it.
    if (best && (t > best.t || (t === best.t && e.id > best.e.id))) continue;
    best = { e, t, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
  }
  return best;
}

/** The first intact concrete wall, ordinary or Large, that a straight shot crosses. Overhead rounds pass over. */
export function wallSweep(
  state: MatchState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { e: Entity; t: number; x: number; y: number } | null {
  return wallOnSegment(state, x0, y0, x1, y1);
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

/** Same reach as the client's `wallSectionsConnect`: ends that meet, straight on or round a corner. */
const WALL_RUN_SLACK = 4;

function wallGroundRange(state: MatchState, e: Entity): { peak: number; low: number } {
  const span = fieldSpan(e.type);
  if (!span) return { peak: 0, low: 0 };
  const alongX = -Math.sin(e.facing);
  const alongY = Math.cos(e.facing);
  const acrossX = Math.cos(e.facing);
  const acrossY = Math.sin(e.facing);
  const halfL = span.length / 2;
  const halfT = span.thick / 2;
  let peak = 0;
  let low = Number.POSITIVE_INFINITY;
  for (const along of [-halfL, 0, halfL]) {
    for (const across of [-halfT, 0, halfT]) {
      const gx = worldToTile(e.x + alongX * along + acrossX * across, state.tileSize);
      const gy = worldToTile(e.y + alongY * along + acrossY * across, state.tileSize);
      const h = inBounds(state, gx, gy) ? (state.heights[tileIndex(state, gx, gy)] ?? 0) : 0;
      if (h > peak) peak = h;
      if (h < low) low = h;
    }
  }
  return { peak, low };
}

function sectionsShareRun(a: Entity, b: Entity, length: number): boolean {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return d > 0.5 && d <= length + WALL_RUN_SLACK;
}

/**
 * Most a concrete run lifts its slab above the ground under a section, in map height
 * units: WALL_RISE_MAX_SLABS slab heights, measured as the client draws the slab.
 */
export function wallRiseLimit(type: ConcreteLineType): number {
  const { hw, hh } = isoScale(TILE_SIZE);
  return (WALL_RISE_MAX_SLABS * wallSlabHeight(type) * Math.hypot(hw, hh)) / ISO_ELEVATION;
}

/** One section of a concrete run, for `wallRunTops`. Map height units. */
export interface WallTopSample {
  /** Highest ground under the section. */
  peak: number;
  /** Lowest ground under the section. */
  low: number;
  /** Top the section already stands at. Missing on a section not built yet. */
  crest?: number | undefined;
}

/**
 * Split a run into stretches that share one top. The highest section sets a top and
 * the stretch takes in connected sections while that top stays within `maxRise` of
 * their lowest ground. A section it would lift further is cut off and starts a new
 * top at its own level. `connects(i, j)` says whether two sections butt together.
 */
export function wallRunTops(
  sections: readonly WallTopSample[],
  connects: (i: number, j: number) => boolean,
  maxRise: number,
): number[] {
  const level = sections.map((s) => Math.max(s.peak, s.crest ?? Number.NEGATIVE_INFINITY));
  const order = level.map((_, i) => i).sort((a, b) => level[b]! - level[a]!);
  const tops: (number | undefined)[] = new Array(sections.length);
  for (const seed of order) {
    if (tops[seed] != null) continue;
    const top = level[seed]!;
    tops[seed] = top;
    const stack = [seed];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (let j = 0; j < sections.length; j++) {
        if (tops[j] != null || !connects(cur, j)) continue;
        if (top - sections[j]!.low > maxRise) continue;
        tops[j] = top;
        stack.push(j);
      }
    }
  }
  return tops as number[];
}

/**
 * Remember the highest ground under a concrete run on every section of it.
 * A later section can raise that peak. Destroying the high section does not lower it,
 * so the standing wall keeps the height it was built to. A section the peak would lift
 * more than `wallRiseLimit` above its ground is cut off and starts a lower top.
 */
export function raiseWallCrest(state: MatchState, built: readonly Entity[]): void {
  const seeds = built.filter((e) => isConcreteLine(e.type) && e.hp > 0 && !e.ruined);
  const types = new Set(seeds.map((e) => e.type));
  for (const type of types) {
    const span = fieldSpan(type);
    if (!span) continue;
    const standing = [...state.entities.values()].filter((e) => e.type === type && e.hp > 0 && !e.ruined);
    const seen = new Set<number>();
    for (const seed of seeds) {
      if (seed.type !== type || seen.has(seed.id)) continue;
      const group: Entity[] = [];
      const stack = [seed];
      seen.add(seed.id);
      while (stack.length > 0) {
        const cur = stack.pop()!;
        group.push(cur);
        for (const other of standing) {
          if (seen.has(other.id) || !sectionsShareRun(cur, other, span.length)) continue;
          seen.add(other.id);
          stack.push(other);
        }
      }
      const samples = group.map((section) => ({ ...wallGroundRange(state, section), crest: section.wallCrest }));
      const tops = wallRunTops(
        samples,
        (i, j) => sectionsShareRun(group[i]!, group[j]!, span.length),
        wallRiseLimit(type as ConcreteLineType),
      );
      for (let i = 0; i < group.length; i++) group[i]!.wallCrest = tops[i]!;
    }
  }
}

/**
 * 1 = sandbags and both concrete walls (blocks everyone). 2 = dragon's teeth
 * (vehicles only; infantry walk through). 4 = barbwire (infantry only; vehicles
 * roll through). A trench blocks no one.
 */
export function restampForts(state: MatchState): void {
  state.fortBlock.fill(0);
  state.fortOwner.clear();
  for (const e of state.entities.values()) {
    if (!isFieldStructure(e.type) || e.hp <= 0 || e.ruined) continue;
    if (e.type === "trench") continue;
    // An unlocked gate is 3: open to its owner's side. Locked, it is a wall again.
    const code = e.type === "teeth" ? 2 : e.type === "barbwire" ? 4 : e.gate && !e.gate.locked ? 3 : 1;
    for (const t of fieldTiles(state, e.type, e.x, e.y, e.facing, 0)) {
      const i = tileIndex(state, t.x, t.y);
      state.fortBlock[i] = code;
      if (code === 3) state.fortOwner.set(i, e.ownerId);
    }
  }
}

/** Boom lifted enough for rounds and men to pass. */
export function gateOpen(e: { gate?: { open: number } | undefined }): boolean {
  return (e.gate?.open ?? 0) >= 0.5;
}

/** Sections whose centres sit this close to a whole section length apart are side by side. */
const GATE_PAIR_SLACK = 0.35;

export interface GateSite {
  x: number;
  y: number;
  facing: number;
  /** The two Wall sections the gate stands in place of. */
  ids: [number, number];
}

type WallLike = { id: number; type: string; ownerId: string; x: number; y: number; facing: number; hp: number; ruined?: boolean };

/**
 * Where a gate goes for a pointer at (x, y): the two own standing Wall sections, butted
 * end to end on one line, whose joint is nearest the pointer. The gate is centred on that
 * joint and faces the way the walls do. Null when no such pair is within a section's
 * length of the pointer. Works on the sim's entities and on a snapshot's.
 */
export function gateSiteAt(entities: Iterable<WallLike>, ownerId: string, x: number, y: number): GateSite | null {
  const span = fieldSpan("wall");
  if (!span) return null;
  const L = span.length;
  const walls: WallLike[] = [];
  for (const e of entities) {
    if (e.type !== "wall" || e.ownerId !== ownerId || e.hp <= 0 || e.ruined) continue;
    walls.push(e);
  }
  let best: GateSite | null = null;
  let bestD = L;
  for (const a of walls) {
    if (Math.hypot(a.x - x, a.y - y) > L * 1.5) continue;
    const { tx, ty } = wallAxes(a.facing);
    for (const b of walls) {
      if (b.id === a.id) continue;
      // Parallel either way round: a line keeps one facing, but a hand-laid one may not.
      if (Math.abs(Math.sin(b.facing - a.facing)) > 0.05) continue;
      if (Math.hypot(b.x - (a.x + tx * L), b.y - (a.y + ty * L)) > L * GATE_PAIR_SLACK) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const d = Math.hypot(mx - x, my - y);
      if (d >= bestD) continue;
      bestD = d;
      best = { x: mx, y: my, facing: a.facing, ids: [a.id, b.id] };
    }
  }
  return best;
}

/**
 * Stand a finished gate in place of the two Wall sections under `at`. The gate keeps
 * their share of health and the height the line was built to. Null when the pair is no
 * longer there, so the caller can refund.
 */
export function raiseGate(state: MatchState, ownerId: string, at: { x: number; y: number }): Entity | null {
  const site = gateSiteAt(state.entities.values(), ownerId, at.x, at.y);
  if (!site || Math.hypot(site.x - at.x, site.y - at.y) > 1) return null;
  const walls = site.ids.map((id) => state.entities.get(id)!);
  let hp = 0;
  let hpMax = 0;
  let crest = Number.NEGATIVE_INFINITY;
  for (const w of walls) {
    hp += w.hp;
    hpMax += w.hpMax;
    if (w.wallCrest != null && w.wallCrest > crest) crest = w.wallCrest;
    destroyEntity(state, w);
  }
  const gate = makeEntity(state, "gate", ownerId, site.x, site.y, { facing: site.facing });
  gate.facing = site.facing;
  gate.turretFacing = site.facing;
  gate.hp = Math.max(1, Math.round(gate.hpMax * (hpMax > 0 ? hp / hpMax : 1)));
  gate.gate = { locked: false, open: 0 };
  if (Number.isFinite(crest)) gate.wallCrest = crest;
  raiseWallCrest(state, [gate]);
  restampForts(state);
  return gate;
}

/** Lock or unlock own gates. Locked, the boom drops and nobody passes. */
export function setGatesLocked(state: MatchState, playerId: string, ids: readonly number[], locked: boolean): string | null {
  let done = 0;
  for (const id of ids) {
    const e = state.entities.get(id);
    if (!e || !e.gate || e.ownerId !== playerId || e.hp <= 0) continue;
    if (e.gate.locked === locked) {
      done++;
      continue;
    }
    e.gate.locked = locked;
    done++;
  }
  if (done === 0) return "Select a gate.";
  restampForts(state);
  return null;
}

/**
 * The boom lifts while a friendly ground unit is near an unlocked gate, and drops otherwise.
 * Near is measured from the gate's span, not its middle, so a man at either post lifts it.
 */
function tickGates(state: MatchState, dt: number): void {
  const sense = GATE_SENSE_TILES * state.tileSize;
  const step = dt / Math.max(0.05, GATE_OPEN_SECONDS);
  for (const g of state.entities.values()) {
    if (!g.gate || g.hp <= 0) continue;
    let want = 0;
    if (!g.gate.locked) {
      const half = (fieldSpan(g.type)?.length ?? 0) / 2;
      const { fx, fy, tx, ty } = wallAxes(g.facing);
      for (const u of state.entities.values()) {
        if (u.kind !== "unit" || u.hp <= 0 || u.wreck || u.garrisonedIn != null || aloft(u)) continue;
        if (isAircraftType(u.type) || !allies(state, u.ownerId, g.ownerId)) continue;
        const dx = u.x - g.x;
        const dy = u.y - g.y;
        const along = Math.max(0, Math.abs(dx * tx + dy * ty) - half);
        if (Math.hypot(along, dx * fx + dy * fy) > sense) continue;
        want = 1;
        break;
      }
    }
    // Ease toward `want` and hold there: a boom already up stays still while a friend waits.
    const open = g.gate.open;
    if (want > open) g.gate.open = Math.min(want, open + step);
    else if (want < open) g.gate.open = Math.max(want, open - step);
  }
}

/**
 * A crawling gun cannot shoot across intact sandbags. Mortar bombs arc over.
 * With `gunH`, a crewed gun at that height: only bags on a rise above it stand in the way.
 */
export function sandbagsBlockGun(state: MatchState, x0: number, y0: number, x1: number, y1: number, gunH?: number): boolean {
  return sandbagOnSegment(state, x0, y0, x1, y1, gunH) != null;
}
