import {
  BUILD_RADIUS,
  catalog,
  isCivilianType,
  isConcreteLine,
  isDefenceStructure,
  isFieldStructure,
  isYardField,
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
import { fieldPiecesFor, fieldSiteClear, fieldTiles, raiseWallCrest, restampForts, type FieldPiece } from "./field.js";
import { repathIfBlocked } from "./orders.js";
import { powerOf, productionSpeed } from "./power.js";
import { advancePaidJob, jobFullyPaid, refundPaid } from "./production.js";
import { spawnUnit } from "./train.js";
import type { Entity, MatchState, SimPlayer, StructureJob } from "./types.js";

type BuildSlot = "structure" | "defence";

function slotOf(type: BuildingType | YardFieldType): BuildSlot {
  return isDefenceStructure(type) ? "defence" : "structure";
}

function jobIn(p: SimPlayer, slot: BuildSlot): StructureJob | null {
  return slot === "defence" ? p.defence : p.structure;
}

function putJob(p: SimPlayer, slot: BuildSlot, job: StructureJob | null): void {
  if (slot === "defence") p.defence = job;
  else p.structure = job;
}

/** Drop this job from whichever lane holds it. Clears a placement ghost only for this type. */
function dropJob(p: SimPlayer, job: StructureJob): void {
  if (p.structure === job) p.structure = null;
  if (p.defence === job) p.defence = null;
  if (p.placingType === job.type) p.placingType = null;
}

/**
 * The named cameo when `building` is set.
 * Otherwise the base job, or the defence job when the base lane is idle.
 */
function resolveJob(p: SimPlayer, building?: BuildingType | YardFieldType): StructureJob | null {
  if (building != null) {
    const job = jobIn(p, slotOf(building));
    return job?.type === building ? job : null;
  }
  return p.structure ?? p.defence;
}

export function startBuild(state: MatchState, playerId: string, type: BuildingType | YardFieldType): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  const slot = slotOf(type);
  if (jobIn(p, slot)) return "Construction already underway.";
  const def = catalog(type);
  putJob(p, slot, {
    type,
    progressTicks: 0,
    totalTicks: secondsToTicks(def.buildSeconds),
    ready: false,
    paused: false,
    paid: 0,
  });
  // A new base job has no ghost yet. Leave a ready defence's placement alone.
  if (slot === "structure") p.placingType = null;
  return null;
}

export function pauseStructure(
  state: MatchState,
  playerId: string,
  paused?: boolean,
  building?: BuildingType | YardFieldType,
): string | null {
  const p = state.players.get(playerId);
  const job = p ? resolveJob(p, building) : null;
  if (!job) return "Nothing to pause.";
  job.paused = paused === undefined ? !job.paused : paused;
  return null;
}

export function cancelStructure(
  state: MatchState,
  playerId: string,
  building?: BuildingType | YardFieldType,
): string | null {
  const p = state.players.get(playerId);
  const job = p ? resolveJob(p, building) : null;
  if (!p || !job) return "Nothing to cancel.";
  refundPaid(p, job);
  dropJob(p, job);
  return null;
}

export function tickBuild(state: MatchState, _dt: number): void {
  for (const p of state.players.values()) {
    if (!p.alive || !hasCore(state, p.playerId)) continue;
    // Base first, then the defence, so a short scrap pile funds the base.
    advanceStructure(state, p, p.structure, "structure");
    advanceStructure(state, p, p.defence, "defence");
  }
}

function advanceStructure(state: MatchState, p: SimPlayer, job: StructureJob | null, slot: BuildSlot): void {
  if (!job || job.ready || job.paused) return;
  if (isYardField(job.type)) {
    finishYardField(state, p, job);
    return;
  }
  const def = catalog(job.type);
  const pow = powerOf(state, p.playerId);
  advancePaidJob(p, job, def.cost, productionSpeed(pow.provided, pow.used));
  if (jobFullyPaid(job, def.cost)) {
    job.ready = true;
    job.progressTicks = job.totalTicks;
    // A ready defence is placed from its own queue, so it does not steal the base ghost.
    if (slot === "structure") p.placingType = job.type;
  }
}

/** A sited sandbag or wall line. Time and scrap scale with the number of sections. */
function finishYardField(state: MatchState, p: SimPlayer, job: StructureJob): void {
  if (!isYardField(job.type)) return;
  const sites = job.sites ?? [];
  if (sites.length === 0) {
    dropJob(p, job);
    return;
  }
  const def = catalog(job.type);
  const cost = def.cost * sites.length;
  const pow = powerOf(state, p.playerId);
  advancePaidJob(p, job, cost, productionSpeed(pow.provided, pow.used));
  if (!jobFullyPaid(job, cost)) return;
  let placed = 0;
  const raised: Entity[] = [];
  const type = job.type;
  // Check every piece before raising any: at a corner the first section would otherwise touch the second.
  const clear = sites.map((piece) => fieldSiteClear(state, type, piece.x, piece.y, piece.facing));
  for (let i = 0; i < sites.length; i++) {
    const piece = sites[i]!;
    if (!clear[i]) {
      p.scrap += def.cost;
      continue;
    }
    const built = makeEntity(state, type, p.playerId, piece.x, piece.y, { facing: piece.facing });
    built.facing = piece.facing;
    built.turretFacing = piece.facing;
    raised.push(built);
    placed++;
  }
  if (placed > 0) {
    raiseWallCrest(state, raised);
    restampForts(state);
  }
  dropJob(p, job);
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
  const job = jobIn(p, slotOf(type));
  if (!job?.ready || job.type !== type) return "That structure is not ready.";
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
  dropJob(p, job);
  return null;
}

function pieceNearOwnBuildings(state: MatchState, ownerId: string, structure: YardFieldType, piece: FieldPiece): boolean {
  const tiles = fieldTiles(state, structure, piece.x, piece.y, piece.facing, 0);
  if (tiles.length === 0) return false;
  return tiles.some((t) => tileNearOwnBuildings(state.entities.values(), ownerId, t.x, t.y));
}

/**
 * Site a sandbag or wall line from the Defences tab. The sections appear when the
 * yard finishes them. Build time and cost are the catalog numbers times the length.
 * The line stops at the first piece that is blocked or out of range.
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
  path?: readonly { x: number; y: number }[],
): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (p.defence) return "Construction already underway.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return "Cannot place there.";
  const pieces = fieldPiecesFor(structure, x, y, facing, x2, y2, path);
  if (pieces.length === 0) return "Cannot place there.";
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
    accepted.push(piece);
  }
  if (accepted.length === 0) return stop ?? "Cannot place there.";
  const def = catalog(structure);
  p.defence = {
    type: structure,
    progressTicks: 0,
    totalTicks: secondsToTicks(def.buildSeconds * accepted.length),
    ready: false,
    paused: false,
    paid: 0,
    sites: accepted.map((piece) => ({ x: piece.x, y: piece.y, facing: piece.facing })),
  };
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
