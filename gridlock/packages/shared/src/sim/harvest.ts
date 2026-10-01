import {
  HAULER_CARGO,
  HAULER_HARVEST_SECONDS,
  HAULER_UNLOAD_SECONDS,
  MAULER_CART_HP,
  MAULER_CART_RESTORE_SECONDS,
  TRACK_ARRIVE_SLOP,
  UNIT_SPACE_PAD,
  catalog,
} from "../catalog.js";
import { scrapAt, tileCenter, tileIndex, walkable, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

/**
 * At the spot. Tracks only roll on a snapped heading and call a waypoint
 * reached within TRACK_ARRIVE_SLOP of the axis, so a tracked hull that has
 * finished its path counts as there within that slop.
 */
function reached(e: Entity, x: number, y: number, near: number): boolean {
  const d = Math.hypot(e.x - x, e.y - y);
  if (d <= near) return true;
  return !!catalog(e.type).turnInPlace && e.waypoints.length === 0 && d <= TRACK_ARRIVE_SLOP * 1.5;
}

/** A Mauler with the cart shot off drives to the Smelter and waits for a new one. */
export function tickMaulerCart(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.type !== "hauler" || e.hp <= 0 || e.wreck || e.cartHp > 0) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    e.cargo = 0;
    e.harvestTile = null;
    e.returnToBase = false;
    e.attackTarget = null;
    e.order = null;
    const smelter = nearestOwned(state, e, "smelter");
    const dock = smelter ? claimDock(state, e, smelter) : null;
    if (!smelter || !dock) {
      e.waypoints = [];
      e.harvestTime = 0;
      e.state = "idle";
      continue;
    }
    if (!driveToDock(state, e, smelter, dock)) {
      e.state = "move";
      e.harvestTime = 0;
      continue;
    }
    e.state = "idle";
    e.harvestTime += dt;
    if (e.harvestTime >= MAULER_CART_RESTORE_SECONDS) {
      e.cartHp = MAULER_CART_HP;
      e.harvestTime = 0;
      dockClaim.delete(e);
    }
  }
}

export function tickHarvest(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    if (e.type !== "hauler" || e.hp <= 0 || e.wreck || e.garrisonedIn || e.chute) continue;
    if (e.cartHp <= 0) continue;
    if (e.state === "deploy" || e.state === "undeploy") continue;
    if (e.returnToBase || e.order?.kind === "withdraw") continue;
    // A move, guard, or attack order is where the player sent it. Leave that alone.
    if (playerSteering(e)) continue;

    if (e.order?.kind === "harvest" && e.order.tileX != null && e.order.tileY != null) {
      e.harvestTile = { x: e.order.tileX, y: e.order.tileY };
      e.autoHarvest = true;
    }

    const hauling =
      e.order?.kind === "unload" ||
      e.state === "unload" ||
      (e.autoHarvest && (e.cargo >= HAULER_CARGO || !e.harvestTile));
    if (e.cargo > 0 && hauling) {
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

    const ts = state.tileSize;
    const onTile =
      (worldToTile(e.x, ts) === tx && worldToTile(e.y, ts) === ty) ||
      reached(e, tileCenter(tx, ts), tileCenter(ty, ts), 0);
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

/** Orders that mean "go there" rather than "keep harvesting". */
function playerSteering(e: Entity): boolean {
  const k = e.order?.kind;
  return (
    k === "move" ||
    k === "attackmove" ||
    k === "attack" ||
    k === "forceattack" ||
    k === "guard" ||
    k === "rotate"
  );
}

function tickHaulerUnload(state: MatchState, e: Entity, dt: number): void {
  const smelter = nearestOwned(state, e, "smelter");
  if (!smelter) {
    e.state = "idle";
    return;
  }
  e.state = "unload";
  const dock = claimDock(state, e, smelter);
  if (!dock) {
    e.state = "idle";
    return;
  }
  if (!driveToDock(state, e, smelter, dock)) {
    e.order = { kind: "unload", targetId: smelter.id };
    return;
  }
  e.harvestTime += dt;
  if (e.harvestTime >= HAULER_UNLOAD_SECONDS) {
    const p = state.players.get(e.ownerId);
    if (p) p.scrap += e.cargo;
    e.cargo = 0;
    e.harvestTime = 0;
    e.order = null;
    e.state = "idle";
    dockClaim.delete(e);
  }
}

/** Dock pad a Mauler is driving to, so two Maulers never aim for the same spot. */
const dockClaim = new WeakMap<Entity, { smelterId: number; x: number; y: number }>();

type Footprint = Pick<Entity, "tileX" | "tileY" | "tileW" | "tileH">;

/**
 * Every walkable pad on the ring of tiles just outside a Smelter: the whole
 * east, west, south, and north edges (each from its middle outward), then the
 * corners. Any of them takes a load.
 */
export function smelterDocks(state: MatchState, smelter: Footprint): { x: number; y: number }[] {
  const ts = state.tileSize;
  const { tileX: tx, tileY: ty, tileW: tw, tileH: th } = smelter;
  const out: { x: number; y: number }[] = [];
  const add = (x: number, y: number): void => {
    if (walkable(state, x, y, "hauler")) out.push({ x: tileCenter(x, ts), y: tileCenter(y, ts) });
  };
  const fromMiddle = (from: number, len: number): number[] => {
    const mid = from + len / 2 - 0.5;
    return Array.from({ length: len }, (_, i) => from + i).sort(
      (a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b,
    );
  };
  for (const y of fromMiddle(ty, th)) add(tx + tw, y);
  for (const y of fromMiddle(ty, th)) add(tx - 1, y);
  for (const x of fromMiddle(tx, tw)) add(x, ty + th);
  for (const x of fromMiddle(tx, tw)) add(x, ty - 1);
  add(tx + tw, ty + th);
  add(tx - 1, ty + th);
  add(tx + tw, ty - 1);
  add(tx - 1, ty - 1);
  return out;
}

/** First walkable pad around a Smelter: the middle of the east edge when it is open. */
export function smelterDock(state: MatchState, smelter: Footprint): { x: number; y: number } | null {
  return smelterDocks(state, smelter)[0] ?? null;
}

/** Hull against any edge of the Smelter: close enough to dump or take a new cart. */
function atSmelter(state: MatchState, e: Entity, smelter: Entity): boolean {
  const ts = state.tileSize;
  const x0 = smelter.tileX * ts;
  const y0 = smelter.tileY * ts;
  const dx = Math.max(x0 - e.x, 0, e.x - (x0 + smelter.tileW * ts));
  const dy = Math.max(y0 - e.y, 0, e.y - (y0 + smelter.tileH * ts));
  return Math.hypot(dx, dy) <= e.radius + ts / 2;
}

/** Heading to a Smelter pad: carrying a load home, or rolling in for a new cart. */
function docking(e: Entity): boolean {
  return e.type === "hauler" && (e.state === "unload" || e.cartHp <= 0);
}

/**
 * The nearest pad no other hull stands on or has claimed. A Mauler keeps its
 * pad while that stays free, so it does not re-path every tick.
 */
function claimDock(state: MatchState, e: Entity, smelter: Entity): { x: number; y: number } | null {
  const docks = smelterDocks(state, smelter);
  if (docks.length === 0) {
    dockClaim.delete(e);
    return null;
  }
  const ts = state.tileSize;
  const margin = ts * 4 + e.radius * 2;
  const x0 = smelter.tileX * ts - margin;
  const y0 = smelter.tileY * ts - margin;
  const x1 = (smelter.tileX + smelter.tileW) * ts + margin;
  const y1 = (smelter.tileY + smelter.tileH) * ts + margin;
  const near: Entity[] = [];
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.kind !== "unit" || o.hp <= 0 || o.garrisonedIn || o.air) continue;
    const inside = o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
    if (!inside && !(docking(o) && dockClaim.get(o)?.smelterId === smelter.id)) continue;
    near.push(o);
  }
  const taken = (p: { x: number; y: number }): boolean => {
    for (const o of near) {
      if (Math.hypot(o.x - p.x, o.y - p.y) < e.radius + o.radius) return true;
      const c = docking(o) ? dockClaim.get(o) : undefined;
      if (c && c.smelterId === smelter.id && Math.hypot(c.x - p.x, c.y - p.y) < e.radius + o.radius + UNIT_SPACE_PAD) {
        return true;
      }
    }
    return false;
  };
  const cur = dockClaim.get(e);
  if (cur && cur.smelterId === smelter.id && docks.some((p) => p.x === cur.x && p.y === cur.y) && !taken(cur)) {
    return cur;
  }
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  let fallback = docks[0]!;
  let fallbackD = Infinity;
  for (const p of docks) {
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < fallbackD) {
      fallbackD = d;
      fallback = p;
    }
    if (d < bestD && !taken(p)) {
      bestD = d;
      best = p;
    }
  }
  const pick = best ?? fallback;
  dockClaim.set(e, { smelterId: smelter.id, x: pick.x, y: pick.y });
  return pick;
}

/** Drive toward the claimed pad. True once the hull is against any edge of the Smelter. */
function driveToDock(state: MatchState, e: Entity, smelter: Entity, dock: { x: number; y: number }): boolean {
  if (atSmelter(state, e, smelter)) {
    e.waypoints = [];
    return true;
  }
  const last = e.waypoints[e.waypoints.length - 1];
  if (!last || Math.hypot(last.x - dock.x, last.y - dock.y) > state.tileSize) {
    setPath(state, e, dock.x, dock.y);
  }
  return false;
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
