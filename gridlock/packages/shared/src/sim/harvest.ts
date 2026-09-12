import { HAULER_CARGO, HAULER_HARVEST_SECONDS, HAULER_UNLOAD_SECONDS } from "../catalog.js";
import { scrapAt, tileCenter, tileIndex, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

export function tickHarvest(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.type !== "hauler" || e.hp <= 0) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;

    if (e.order?.kind === "harvest" && e.order.tileX != null && e.order.tileY != null) {
      e.harvestTile = { x: e.order.tileX, y: e.order.tileY };
      e.autoHarvest = true;
    }

    if (e.cargo > 0 && (e.cargo >= HAULER_CARGO || e.state === "unload" || e.order?.kind === "unload" || !e.harvestTile)) {
      tickHaulerUnload(state, e, dt);
      continue;
    }

    if (!e.harvestTile && e.autoHarvest && e.cargo === 0) {
      const tile = nearestScrap(state, e);
      if (tile) {
        e.harvestTile = tile;
        e.order = { kind: "harvest", tileX: tile.x, tileY: tile.y };
      }
    }

    if (!e.harvestTile) continue;
    const tx = e.harvestTile.x;
    const ty = e.harvestTile.y;
    if (scrapAt(state, tx, ty) <= 0) {
      e.harvestTile = null;
      e.harvestTime = 0;
      if (e.order?.kind === "harvest") e.order = null;
      e.state = "idle";
      continue;
    }

    const onTile = worldToTile(e.x, state.tileSize) === tx && worldToTile(e.y, state.tileSize) === ty;
    if (!onTile) {
      e.state = "harvest";
      if (e.waypoints.length === 0) {
        setPath(state, e, tileCenter(tx, state.tileSize), tileCenter(ty, state.tileSize));
      }
      continue;
    }

    e.waypoints = [];
    e.state = "harvest";
    e.harvestTime += dt;
    if (e.harvestTime >= HAULER_HARVEST_SECONDS) {
      const yld = scrapAt(state, tx, ty);
      const take = Math.min(HAULER_CARGO - e.cargo, yld);
      state.scrapYield[tileIndex(state, tx, ty)] = yld - take;
      e.cargo += take;
      e.harvestTime = 0;
      e.harvestTile = null;
      if (e.order?.kind === "harvest") e.order = null;
      if (e.cargo >= HAULER_CARGO) {
        e.state = "unload";
        continue;
      }
      const next = nearestScrap(state, e);
      if (next) {
        e.harvestTile = next;
        e.order = { kind: "harvest", tileX: next.x, tileY: next.y };
        e.state = "harvest";
      } else {
        e.state = e.cargo > 0 ? "unload" : "idle";
      }
    }
  }
}

function tickHaulerUnload(state: MatchState, e: Entity, dt: number): void {
  const smelter = nearestOwned(state, e, "smelter");
  if (!smelter) {
    e.state = "idle";
    return;
  }
  const dock = dockPoint(state, smelter);
  if (Math.hypot(e.x - dock.x, e.y - dock.y) > state.tileSize * 0.75) {
    e.state = "unload";
    e.order = { kind: "unload", targetId: smelter.id };
    if (e.waypoints.length === 0) setPath(state, e, dock.x, dock.y);
    return;
  }
  e.waypoints = [];
  e.state = "unload";
  e.harvestTime += dt;
  if (e.harvestTime >= HAULER_UNLOAD_SECONDS) {
    const p = state.players.get(e.ownerId);
    if (p) p.scrap += e.cargo;
    e.cargo = 0;
    e.harvestTime = 0;
    e.order = null;
    e.state = "idle";
  }
}

function dockPoint(state: MatchState, smelter: Entity): { x: number; y: number } {
  const ts = state.tileSize;
  return {
    x: (smelter.tileX + smelter.tileW) * ts + ts / 2,
    y: (smelter.tileY + smelter.tileH / 2) * ts,
  };
}

function nearestOwned(state: MatchState, from: Entity, type: Entity["type"]): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.ownerId !== from.ownerId || e.type !== type || e.hp <= 0) continue;
    const cx = (e.tileX + e.tileW / 2) * state.tileSize;
    const cy = (e.tileY + e.tileH / 2) * state.tileSize;
    const d = (cx - from.x) * (cx - from.x) + (cy - from.y) * (cy - from.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function nearestScrap(state: MatchState, e: Entity): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const tx = worldToTile(e.x, state.tileSize);
  const ty = worldToTile(e.y, state.tileSize);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (scrapAt(state, x, y) <= 0) continue;
      const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}
