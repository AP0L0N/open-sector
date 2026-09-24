import {
  BUILD_RADIUS,
  catalog,
  isCivilianType,
  isFieldStructure,
  secondsToTicks,
  SELL_REFUND,
  type BuildingType,
} from "../catalog.js";
import {
  buildingCenter,
  destroyEntity,
  hasCore,
  inBuildRadius,
  makeEntity,
  tilesBlockedOrScrap,
} from "./geo.js";
import { ejectUnits } from "./deploy.js";
import { repathIfBlocked } from "./orders.js";
import { powerOf, productionSpeed } from "./power.js";
import { advancePaidJob, jobFullyPaid, refundPaid } from "./production.js";
import { spawnUnit } from "./train.js";
import type { MatchState } from "./types.js";

export function startBuild(state: MatchState, playerId: string, type: BuildingType): string | null {
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

export function sellBuilding(state: MatchState, playerId: string, id: number): string | null {
  const e = state.entities.get(id);
  if (!e || e.ownerId !== playerId) return "Not yours.";
  if (e.kind !== "building") return "Cannot sell that.";
  if (isFieldStructure(e.type)) return "Cannot sell that.";
  if (e.type === "core") return "Cannot sell the Core.";
  if (isCivilianType(e.type)) return "Cannot sell that.";
  const refund = Math.floor(catalog(e.type).cost * SELL_REFUND);
  const p = state.players.get(playerId);
  if (p) p.scrap += refund;
  destroyEntity(state, e);
  return null;
}
