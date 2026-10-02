import {
  BUILD_RADIUS,
  catalog,
  isCivilianType,
  isFieldStructure,
  secondsToTicks,
  SELL_REFUND,
  type BuildingType,
  type YardFieldType,
} from "../catalog.js";
import {
  buildingCenter,
  destroyEntity,
  hasCore,
  inBuildRadius,
  makeEntity,
  tileNearOwnBuildings,
  tilesBlockedOrScrap,
} from "./geo.js";
import { ejectUnits } from "./deploy.js";
import { spillGarrison } from "./garrison.js";
import { fieldLine, fieldSiteClear, fieldTiles, restampForts, type FieldPiece } from "./field.js";
import { repathIfBlocked } from "./orders.js";
import { powerOf, productionSpeed } from "./power.js";
import { advancePaidJob, jobFullyPaid, refundPaid } from "./production.js";
import { spawnUnit } from "./train.js";
import type { MatchState } from "./types.js";

export function startBuild(state: MatchState, playerId: string, type: BuildingType | YardFieldType): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  if (p.structure) return "Construction already underway.";
  const def = catalog(type);
  p.structure = {
    type,
    progressTicks: 0,
    totalTicks: secondsToTicks(def.buildSeconds),
    ready: false,
    paused: false,
    paid: 0,
  };
  p.placingType = null;
  return null;
}

export function pauseStructure(state: MatchState, playerId: string, paused?: boolean): string | null {
  const p = state.players.get(playerId);
  if (!p?.structure) return "Nothing to pause.";
  p.structure.paused = paused === undefined ? !p.structure.paused : paused;
  return null;
}

export function cancelStructure(state: MatchState, playerId: string): string | null {
  const p = state.players.get(playerId);
  if (!p?.structure) return "Nothing to cancel.";
  refundPaid(p, p.structure);
  p.structure = null;
  p.placingType = null;
  return null;
}

export function tickBuild(state: MatchState, _dt: number): void {
  for (const p of state.players.values()) {
    if (!p.alive || !p.structure || p.structure.ready || p.structure.paused) continue;
    if (!hasCore(state, p.playerId)) continue;
    const def = catalog(p.structure.type);
    const pow = powerOf(state, p.playerId);
    advancePaidJob(p, p.structure, def.cost, productionSpeed(pow.provided, pow.used));
    if (jobFullyPaid(p.structure, def.cost)) {
      p.structure.ready = true;
      p.structure.progressTicks = p.structure.totalTicks;
      p.placingType = p.structure.type;
    }
  }
}

export function placeBuilding(
  state: MatchState,
  playerId: string,
  type: BuildingType,
  tx: number,
  ty: number,
): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (!p.structure?.ready || p.structure.type !== type) return "That structure is not ready.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  const def = catalog(type);
  if (tilesBlockedOrScrap(state, tx, ty, def.tileW, def.tileH)) return "Cannot place there.";
  if (!inBuildRadius(state, playerId, tx, ty, def.tileW, def.tileH, BUILD_RADIUS)) {
    return "Too far from your base.";
  }
  const c = buildingCenter(tx, ty, def.tileW, def.tileH, state.tileSize);
  const b = makeEntity(state, type, playerId, c.x, c.y, { tileX: tx, tileY: ty });
  ejectUnits(state, b);
  for (const u of state.entities.values()) {
    if (u.kind === "unit") repathIfBlocked(state, u);
  }
  if (type === "smelter") spawnUnit(state, playerId, "hauler", b, true);
  p.structure = null;
  p.placingType = null;
  return null;
}

function pieceNearOwnBuildings(state: MatchState, ownerId: string, structure: YardFieldType, piece: FieldPiece): boolean {
  const tiles = fieldTiles(state, structure, piece.x, piece.y, piece.facing, 0);
  if (tiles.length === 0) return false;
  return tiles.some((t) => tileNearOwnBuildings(state.entities.values(), ownerId, t.x, t.y));
}

/**
 * Drop a queued sandbag or wall line. The job already paid for the first section.
 * Further sections cost the catalog price each. The line stops at the first piece
 * that is blocked, out of range, or unpaid. Nothing is spent when the first piece fails.
 */
export function placeBaseField(
  state: MatchState,
  playerId: string,
  structure: YardFieldType,
  x: number,
  y: number,
  facing: number,
  x2?: number,
  y2?: number,
): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (!p.structure?.ready || p.structure.type !== structure) return "That structure is not ready.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return "Cannot place there.";
  const line = x2 != null && y2 != null && Number.isFinite(x2) && Number.isFinite(y2);
  const pieces = line ? fieldLine(structure, x, y, x2, y2, facing) : [{ x, y, facing }];
  if (pieces.length === 0) return "Cannot place there.";
  const cost = catalog(structure).cost;
  const accepted: FieldPiece[] = [];
  let stop: string | null = null;
  for (const piece of pieces) {
    if (!fieldSiteClear(state, structure, piece.x, piece.y, piece.facing)) {
      stop = "Cannot place there.";
      break;
    }
    if (!pieceNearOwnBuildings(state, playerId, structure, piece)) {
      stop = "Too far from your base.";
      break;
    }
    if (accepted.length > 0 && p.scrap < cost * accepted.length) break;
    accepted.push(piece);
  }
  if (accepted.length === 0) return stop ?? "Cannot place there.";
  p.scrap -= cost * (accepted.length - 1);
  for (const piece of accepted) {
    const built = makeEntity(state, structure, playerId, piece.x, piece.y, { facing: piece.facing });
    built.facing = piece.facing;
    built.turretFacing = piece.facing;
  }
  restampForts(state);
  p.structure = null;
  p.placingType = null;
  return null;
}

export function sellBuilding(state: MatchState, playerId: string, id: number): string | null {
  const e = state.entities.get(id);
  if (!e || e.ownerId !== playerId) return "Not yours.";
  if (e.kind !== "building") return "Cannot sell that.";
  if (e.type === "core") return "Cannot sell the Core.";
  if (isCivilianType(e.type)) return "Cannot sell that.";
  // Sold with men inside: they walk out unhurt.
  if (e.garrison.length) spillGarrison(state, e, { damage: false });
  const refund = e.ruined ? 0 : Math.floor(catalog(e.type).cost * SELL_REFUND);
  const p = state.players.get(playerId);
  if (p) p.scrap += refund;
  destroyEntity(state, e);
  if (isFieldStructure(e.type)) restampForts(state);
  return null;
}
