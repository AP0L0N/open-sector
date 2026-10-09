import {
  BUILD_REQUIRES,
  buildRadiusOf,
  catalog,
  isCivilianType,
  isConcreteLine,
  isDefenceStructure,
  isFieldStructure,
  isYardField,
  onWaterBuilding,
  secondsToTicks,
  SELL_REFUND,
  type BuildingType,
  type YardFieldType,
  yardBuildSeconds,
} from "../catalog.js";
import {
  destroyEntity,
  fellTreeAt,
  hasCore,
  inBounds,
  inBuildRadius,
  footprint,
  isWater,
  makeEntity,
  occupant,
  tileNearOwnBuildings,
  scrapAt,
  tileListBlocked,
  tilesBlocked,
  tilesBlockedOrScrap,
} from "./geo.js";
import { buildingSite, buildingTilesOf, snapBuildingFacing, turnedBox } from "../building-rect.js";
import { ejectUnits } from "./deploy.js";
import { manGun, spillGarrison } from "./garrison.js";
import {
  fieldPiecesFor,
  fieldSiteClear,
  fieldTiles,
  gateSiteAt,
  raiseGate,
  raiseWallCrest,
  restampForts,
  sitedLineTiles,
  type FieldPiece,
} from "./field.js";
import { repathIfBlocked } from "./orders.js";
import { powerOf, productionSpeed } from "./power.js";
import { advancePaidJob, jobFullyPaid, refundPaid } from "./production.js";
import { smelterCrowded, smelterSiteOk } from "./smelter.js";
import type { Entity, MatchState, SimPlayer, StructureJob } from "./types.js";

type BuildSlot = "structure" | "defence" | "line";

/** Sandbag and wall lines take so long that they get a lane of their own. */
function slotOf(type: BuildingType | YardFieldType): BuildSlot {
  if (isYardField(type)) return "line";
  return isDefenceStructure(type) ? "defence" : "structure";
}

function jobIn(p: SimPlayer, slot: BuildSlot): StructureJob | null {
  return slot === "line" ? p.line : slot === "defence" ? p.defence : p.structure;
}

function putJob(p: SimPlayer, slot: BuildSlot, job: StructureJob | null): void {
  if (slot === "line") p.line = job;
  else if (slot === "defence") p.defence = job;
  else p.structure = job;
}

/** Drop this job from whichever lane holds it. Clears a placement ghost only for this type. */
function dropJob(p: SimPlayer, job: StructureJob): void {
  if (p.structure === job) p.structure = null;
  if (p.defence === job) p.defence = null;
  if (p.line === job) p.line = null;
  if (p.placingType === job.type) p.placingType = null;
}

/**
 * The named cameo when `building` is set.
 * Otherwise the base job, then the defence job, then the line.
 */
function resolveJob(p: SimPlayer, building?: BuildingType | YardFieldType): StructureJob | null {
  if (building != null) {
    const job = jobIn(p, slotOf(building));
    return job?.type === building ? job : null;
  }
  return p.structure ?? p.defence ?? p.line;
}

/** Buildings `type` still needs before the yard may queue it (BUILD_REQUIRES); empty once all stand. */
export function buildTechMissing(state: MatchState, playerId: string, type: BuildingType | YardFieldType): BuildingType[] {
  const need = BUILD_REQUIRES[type as BuildingType];
  if (!need) return [];
  return need.filter((t) => {
    for (const e of state.entities.values()) {
      if (e.ownerId === playerId && e.type === t && e.hp > 0 && !e.wreck) return false;
    }
    return true;
  });
}

export function startBuild(state: MatchState, playerId: string, type: BuildingType | YardFieldType): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  const slot = slotOf(type);
  if (jobIn(p, slot)) return "Construction already underway.";
  const def = catalog(type);
  const missing = buildTechMissing(state, playerId, type);
  if (missing.length > 0) return `Need a ${missing.map((t) => catalog(t).name).join(" and a ")}.`;
  putJob(p, slot, {
    type,
    progressTicks: 0,
    totalTicks: secondsToTicks(isYardField(type) ? def.buildSeconds : yardBuildSeconds(type)),
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
    // Base first, then the defence, then the line, so a short scrap pile funds the base.
    advanceStructure(state, p, p.structure, "structure");
    advanceStructure(state, p, p.defence, "defence");
    advanceStructure(state, p, p.line, "line");
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
  if (job.type === "gate") {
    // The walls it was sited on fell or changed hands while it built: the scrap comes back.
    for (const site of sites) if (!raiseGate(state, p.playerId, site)) p.scrap += def.cost;
    dropJob(p, job);
    return;
  }
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
  facing = 0,
): string | null {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  const job = jobIn(p, slotOf(type));
  if (!job?.ready || job.type !== type) return "That structure is not ready.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  const siteErr = buildingSiteError(state, type, tx, ty, playerId, facing);
  if (siteErr) return siteErr;
  const box = turnedBox(type, facing);
  if (!inBuildRadius(state, playerId, tx, ty, box.w, box.h, buildRadiusOf(type))) {
    return "Too far from your base.";
  }
  raiseBuilding(state, playerId, type, tx, ty, facing);
  dropJob(p, job);
  return null;
}

/**
 * Why this footprint cannot take the building, or null when the ground is right for it.
 * With `ownerId`, that player's sited wall or sandbag line counts as already standing.
 * `facing` turns a rotatable building's ground; (tx, ty) is the top-left of its turned box.
 */
export function buildingSiteError(
  state: MatchState,
  type: BuildingType,
  tx: number,
  ty: number,
  ownerId?: string,
  facing = 0,
): string | null {
  const def = catalog(type);
  const tiles = buildingTilesOf(buildingSite(type, tx, ty, facing, state.tileSize), state.tileSize);
  if (ownerId != null) {
    const sited = sitedLineTiles(state, state.players.get(ownerId)?.line);
    if (sited.size > 0 && tiles.some((t) => sited.has(t.y * state.width + t.x))) {
      return "Cannot place there.";
    }
  }
  if (onWaterBuilding(type)) return waterSiteError(state, tx, ty, def.tileW, def.tileH);
  if (type === "smelter") {
    if (!smelterSiteOk(state, tx, ty)) {
      // Trees under it are no bar: raiseBuilding fells them.
      const blocked = tilesBlocked(state, tx, ty, def.tileW, def.tileH, false);
      if (!blocked && smelterCrowded(state.entities.values(), tx, ty)) {
        return "Too close to another Smelter.";
      }
      return tilesBlockedOrScrap(state, tx, ty, def.tileW, def.tileH, false) && !blocked
        ? "Not enough scrap under the Smelter."
        : blocked
          ? "Cannot place there."
          : "A Smelter has to stand on scrap.";
    }
    return null;
  }
  // Trees under it are no bar: raiseBuilding fells them.
  if (tileListBlocked(state, tiles, false) || tiles.some((t) => scrapAt(state, t.x, t.y) > 0)) return "Cannot place there.";
  return null;
}

/** A Marine Base floats: open water under every tile, and nothing standing there already. */
function waterSiteError(state: MatchState, tx: number, ty: number, w: number, h: number): string | null {
  for (const t of footprint(tx, ty, w, h)) {
    if (!inBounds(state, t.x, t.y)) return "Cannot place there.";
    if (!isWater(state, t.x, t.y)) return "A Marine Base has to stand on water.";
    if (occupant(state, t.x, t.y) !== 0) return "Cannot place there.";
  }
  return null;
}

/** The step a building stands at. A rotatable one takes the nearest BUILDING_TURN_STEP to `facing`; the rest face east. */
export function placedFacing(type: BuildingType, facing: number): number {
  return snapBuildingFacing(type, facing);
}

/** Stand the building up: fell the trees under it, occupy its tiles, push units off them, and make blocked walkers re-path. */
export function raiseBuilding(
  state: MatchState,
  playerId: string,
  type: BuildingType,
  tx: number,
  ty: number,
  facing = 0,
): Entity {
  const site = buildingSite(type, tx, ty, facing, state.tileSize);
  for (const t of buildingTilesOf(site, state.tileSize)) fellTreeAt(state, t.x, t.y);
  const b = makeEntity(state, type, playerId, site.x, site.y, {
    tileX: tx,
    tileY: ty,
    facing: site.facing,
    tileW: site.tileW,
    tileH: site.tileH,
  });
  ejectUnits(state, b);
  for (const u of state.entities.values()) {
    if (u.kind === "unit") repathIfBlocked(state, u);
  }
  // An emplaced gun goes up with its crew already at it.
  manGun(state, b);
  return b;
}

function pieceNearOwnBuildings(state: MatchState, ownerId: string, structure: YardFieldType, piece: FieldPiece): boolean {
  const tiles = fieldTiles(state, structure, piece.x, piece.y, piece.facing, 0);
  if (tiles.length === 0) return false;
  return tiles.some((t) => tileNearOwnBuildings(state.entities.values(), ownerId, t.x, t.y));
}

/**
 * Site a sandbag or wall line, or a gate over two wall sections, from the Defences tab. The sections appear when the
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
  if (p.line) return "Construction already underway.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(facing)) return "Cannot place there.";
  const def = catalog(structure);
  if (structure === "gate") {
    // A gate goes over walls you already stand, wherever they are, so it has no yard range.
    const site = gateSiteAt(state.entities.values(), playerId, x, y);
    if (!site) return "A gate goes on two of your Wall sections side by side.";
    p.line = {
      type: structure,
      progressTicks: 0,
      totalTicks: secondsToTicks(def.buildSeconds),
      ready: false,
      paused: false,
      paid: 0,
      sites: [{ x: site.x, y: site.y, facing: site.facing }],
    };
    return null;
  }
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
  p.line = {
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

/**
 * The player scraps their own units and structures for nothing. Each goes down as if killed:
 * the end-of-tick reap leaves the corpse, wreck, or rubble. Men inside a structure walk out first.
 * The Core and the Rig cannot be scrapped, nor a captured civilian building.
 */
export function deleteOwn(state: MatchState, playerId: string, ids: readonly number[]): string | null {
  let n = 0;
  for (const id of ids) {
    const e = state.entities.get(id);
    if (!e || e.ownerId !== playerId || e.hp <= 0 || e.wreck) continue;
    if (e.type === "core" || e.type === "rig") continue;
    if (e.kind === "building" && isCivilianType(e.type)) continue;
    if (e.kind === "building" && e.garrison.length) spillGarrison(state, e, { damage: false });
    e.hp = 0;
    n++;
  }
  return n ? null : "Nothing to scrap.";
}
