import {
  BATTLESHIP_BARREL_AMMO,
  BATTLESHIP_BARRELS_PER_TURRET,
  BATTLESHIP_CIWS_AT,
  BATTLESHIP_CIWS_BELT,
  BATTLESHIP_HALF_LENGTH,
  BATTLESHIP_REARM_ROUNDS,
  BATTLESHIP_REARM_SECONDS,
  BATTLESHIP_REARM_TILES,
  BATTLESHIP_TURRET_AT,
  BATTLESHIP_TURRET_BLIND_DEG,
  isBattleship,
} from "../catalog.js";
import { allies } from "./geo.js";
import type { Entity, MatchState, ShipState } from "./types.js";

/** A fresh ship: every barrel loaded, every belt full, the turrets trained on the bow. */
export function newShipState(facing: number): ShipState {
  return {
    turrets: BATTLESHIP_TURRET_AT.map(() => ({
      facing,
      barrels: Array.from({ length: BATTLESHIP_BARRELS_PER_TURRET }, () => ({ ammo: BATTLESHIP_BARREL_AMMO, cooldown: 0 })),
      volley: [],
      nextShotTick: 0,
      firedTick: Array.from({ length: BATTLESHIP_BARRELS_PER_TURRET }, () => undefined),
    })),
    ciws: BATTLESHIP_CIWS_AT.map(() => ({
      facing,
      target: null,
      ammo: BATTLESHIP_CIWS_BELT,
      cooldown: 0,
      heat: 0,
      overheat: 0,
    })),
    rearm: 0,
  };
}

/** World point of a mount `at` half-lengths forward of amidships (negative is aft). */
export function shipMountPoint(e: Pick<Entity, "x" | "y" | "facing">, at: number): { x: number; y: number } {
  const d = at * BATTLESHIP_HALF_LENGTH;
  return { x: e.x + Math.cos(e.facing) * d, y: e.y + Math.sin(e.facing) * d };
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Where a forward turret may train for a bearing: anywhere but the blind arc
 * astern, where the superstructure stands. Inside it, the nearer edge.
 */
export function turretBearing(hullFacing: number, want: number): { facing: number; blind: boolean } {
  const rel = wrapAngle(want - hullFacing);
  const limit = Math.PI - (BATTLESHIP_TURRET_BLIND_DEG * Math.PI) / 180;
  if (Math.abs(rel) <= limit) return { facing: want, blind: false };
  return { facing: wrapAngle(hullFacing + Math.sign(rel || 1) * limit), blind: true };
}

/** Shells left across every barrel. */
export function shipShells(ship: ShipState): number {
  let n = 0;
  for (const t of ship.turrets) for (const b of t.barrels) n += b.ammo;
  return n;
}

function besideMarineBase(state: MatchState, e: Entity): boolean {
  const ts = state.tileSize;
  const reach = BATTLESHIP_REARM_TILES * ts + e.radius;
  for (const b of state.entities.values()) {
    if (b.type !== "dock" || b.hp <= 0 || b.wreck || !allies(state, e.ownerId, b.ownerId)) continue;
    const nx = Math.max(b.tileX * ts, Math.min(e.x, (b.tileX + b.tileW) * ts));
    const ny = Math.max(b.tileY * ts, Math.min(e.y, (b.tileY + b.tileH) * ts));
    if (Math.hypot(e.x - nx, e.y - ny) <= reach) return true;
  }
  return false;
}

/**
 * Beside a friendly Marine Base a Battle Ship fills again: every
 * BATTLESHIP_REARM_SECONDS one shell into each short barrel and a few rounds
 * onto each short belt. Away from one the clock waits.
 */
export function tickShipRearm(state: MatchState, dt: number): void {
  for (const e of state.entities.values()) {
    const ship = e.ship;
    if (!ship || !isBattleship(e.type) || e.hp <= 0) continue;
    const short =
      ship.turrets.some((t) => t.barrels.some((b) => b.ammo < BATTLESHIP_BARREL_AMMO)) ||
      ship.ciws.some((c) => c.ammo < BATTLESHIP_CIWS_BELT);
    if (!short || !besideMarineBase(state, e)) {
      ship.rearm = 0;
      continue;
    }
    ship.rearm += dt;
    if (ship.rearm < BATTLESHIP_REARM_SECONDS) continue;
    ship.rearm -= BATTLESHIP_REARM_SECONDS;
    for (const t of ship.turrets) {
      for (const b of t.barrels) b.ammo = Math.min(BATTLESHIP_BARREL_AMMO, b.ammo + 1);
    }
    for (const c of ship.ciws) c.ammo = Math.min(BATTLESHIP_CIWS_BELT, c.ammo + BATTLESHIP_REARM_ROUNDS);
  }
}
