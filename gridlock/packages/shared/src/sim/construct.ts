/**
 * An engineer raises a base building in the field. Today that is the Smelter,
 * so a scrap field far from the yard can be claimed. He walks to the site,
 * pays the catalog cost when he starts, works `buildSeconds`, and the building
 * appears. A site that is taken while he works refunds the cost.
 */

import { catalog, isEngineerBuilding, type BuildingType } from "../catalog.js";
import { buildingSiteError, raiseBuilding } from "./build.js";
import { clearOrder, hasCore, nearestWalkable, tileCenter } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

/** Hull this far past the footprint edge, in tiles, is close enough to work. */
const CONSTRUCT_REACH_TILES = 1.5;

type Site = { tileX: number; tileY: number; tileW: number; tileH: number };

function siteOf(building: BuildingType, tx: number, ty: number): Site {
  const def = catalog(building);
  return { tileX: tx, tileY: ty, tileW: def.tileW, tileH: def.tileH };
}

/** Walkable spot nearest the footprint's middle. The footprint itself is open ground before the building rises. */
function standSpot(state: MatchState, site: Site): { x: number; y: number } {
  const cx = site.tileX + Math.floor(site.tileW / 2);
  const cy = site.tileY + Math.floor(site.tileH / 2);
  const t = nearestWalkable(state, cx, cy, "engineer") ?? { x: cx, y: cy };
  return { x: tileCenter(t.x, state.tileSize), y: tileCenter(t.y, state.tileSize) };
}

/** Hull against or inside the footprint. */
function atSite(state: MatchState, e: Entity, site: Site): boolean {
  const ts = state.tileSize;
  const x0 = site.tileX * ts;
  const y0 = site.tileY * ts;
  const dx = Math.max(x0 - e.x, 0, e.x - (x0 + site.tileW * ts));
  const dy = Math.max(y0 - e.y, 0, e.y - (y0 + site.tileH * ts));
  return Math.hypot(dx, dy) <= e.radius + CONSTRUCT_REACH_TILES * ts;
}

function finishWork(e: Entity): void {
  clearOrder(e);
  e.work = 0;
  e.state = "idle";
}

/**
 * Send the nearest selected engineer to raise `building` with its top-left tile at (tx, ty).
 * The site is checked now so a bad click is refused at once; it is checked again when he arrives.
 */
export function orderConstruct(
  state: MatchState,
  playerId: string,
  engineers: Entity[],
  building: BuildingType,
  tx: number,
  ty: number,
): string | null {
  if (!isEngineerBuilding(building)) return "An engineer cannot build that.";
  const crew = engineers.filter((e) => e.type === "engineer" && e.hp > 0 && !e.wreck && !e.garrisonedIn);
  if (crew.length === 0) return "Select an engineer.";
  const p = state.players.get(playerId);
  if (!p || !p.alive) return "You are out of the fight.";
  if (!hasCore(state, playerId)) return "Deploy the Rig.";
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return "Cannot place there.";
  const err = buildingSiteError(state, building, tx, ty, playerId);
  if (err) return err;
  const site = siteOf(building, tx, ty);
  const spot = standSpot(state, site);
  crew.sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y) || a.id - b.id);
  const eng = crew[0]!;
  clearOrder(eng);
  eng.order = { kind: "build", building, tileX: tx, tileY: ty };
  eng.work = 0;
  eng.state = "move";
  setPath(state, eng, spot.x, spot.y);
  return null;
}

/** Every engineer on a construction order walks, pays, works, and raises the building. */
export function tickConstructs(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || e.kind !== "unit" || e.wreck) continue;
    const o = e.order;
    if (!o || o.kind !== "build" || o.building == null) continue;
    tickConstruct(state, e, dt);
  }
}

function tickConstruct(state: MatchState, e: Entity, dt: number): void {
  const o = e.order;
  if (!o || o.kind !== "build" || o.building == null || o.tileX == null || o.tileY == null) return;
  const building = o.building;
  const def = catalog(building);
  const site = siteOf(building, o.tileX, o.tileY);
  if (!atSite(state, e, site)) {
    e.state = "move";
    if (e.waypoints.length === 0 || state.tick % 8 === 0) {
      const spot = standSpot(state, site);
      setPath(state, e, spot.x, spot.y);
    }
    return;
  }
  const player = state.players.get(e.ownerId);
  if (e.work <= 0) {
    const err = buildingSiteError(state, building, o.tileX, o.tileY, e.ownerId);
    if (err) {
      finishWork(e);
      if (player) state.pendingComms.push(err);
      return;
    }
    if (!player || player.scrap < def.cost) {
      finishWork(e);
      if (player) state.pendingComms.push("Not enough scrap.");
      return;
    }
    player.scrap -= def.cost;
  }
  e.waypoints = [];
  e.state = "build";
  const ts = state.tileSize;
  const cx = (site.tileX + site.tileW / 2) * ts;
  const cy = (site.tileY + site.tileH / 2) * ts;
  if (Math.hypot(cx - e.x, cy - e.y) > 1) {
    e.facing = Math.atan2(cy - e.y, cx - e.x);
    e.turretFacing = e.facing;
  }
  e.work += dt;
  // 0.1 added ten times a second undershoots the duration by a rounding error.
  if (e.work + 1e-6 < def.buildSeconds) return;
  if (buildingSiteError(state, building, o.tileX, o.tileY, e.ownerId)) {
    if (player) player.scrap += def.cost;
    finishWork(e);
    return;
  }
  raiseBuilding(state, e.ownerId, building, o.tileX, o.tileY);
  finishWork(e);
}
