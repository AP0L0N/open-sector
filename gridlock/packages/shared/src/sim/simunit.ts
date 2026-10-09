import {
  catalog,
  SIMUNIT_BLINK_RANGE_TILES,
  SIMUNIT_BLINK_RECHARGE_SECONDS,
  SIMUNIT_PURGE_SECONDS,
  canPowerDown,
  isInfantryType,
  isSimUnit,
  secondsToTicks,
} from "../catalog.js";
import { approachTile, livingGarrison, vacateIfEmpty } from "./garrison.js";
import { allies, buildingCenter, clearOrder, inBounds, tileCenter, walkable, worldToTile } from "./geo.js";
import { setPath } from "./path.js";
import type { Entity, MatchState } from "./types.js";

/**
 * Sim Unit II, and the power-down the Cyborg shares with him.
 *
 * Blink: one charge, back by itself SIMUNIT_BLINK_RECHARGE_SECONDS after it is spent.
 * A blink order past SIMUNIT_BLINK_RANGE_TILES walks him until the point is in reach,
 * then he goes. A purge order on a structure or hull with enemy soldiers inside blinks
 * him in among them; SIMUNIT_PURGE_SECONDS later every soldier aboard is dead and he
 * blinks back out to where he stood. Inside he is out of reach, like any passenger.
 *
 * Power-down: a Cyborg or a Sim Unit told to shut down stands dark where he is. He
 * takes no order but power-up, fires nothing, and no enemy gun picks him by itself:
 * to the other side he reads as no one's machine. A named attack still finds him.
 *
 * Runs after tickMineLaunchers, before the order queue and movement.
 */

/** Blink charge, 0–1. 1 is ready. */
export function blinkCharge(state: MatchState, e: Entity): number {
  if (e.blinkReady == null) return 1;
  const need = secondsToTicks(SIMUNIT_BLINK_RECHARGE_SECONDS);
  return Math.max(0, Math.min(1, 1 - (e.blinkReady - state.tick) / need));
}

export function blinkReady(state: MatchState, e: Entity): boolean {
  return e.blinkReady == null || e.blinkReady <= state.tick;
}

/** Hidden from every gun that picks its own target: powered down, or inside a garrison on a purge. */
export function hiddenFromAuto(e: Entity): boolean {
  return !!e.dormant || !!e.purge;
}

/** Share of the purge done, 0–1, or null when he is not on one. */
export function purgeProgress(state: MatchState, e: Entity): number | null {
  if (!e.purge) return null;
  const need = secondsToTicks(SIMUNIT_PURGE_SECONDS);
  return Math.max(0, Math.min(1, 1 - (e.purge.until - state.tick) / need));
}

/** He goes dark where he stands. Whatever he was doing ends. */
export function powerDown(e: Entity): void {
  if (!canPowerDown(e.type)) return;
  idle(e);
  e.dormant = true;
}

export function powerUp(e: Entity): void {
  e.dormant = undefined;
}

/** No order, no queue, no hold: a dark machine goes nowhere, whoever told him to. */
function idle(e: Entity): void {
  if (e.order || e.waypoints.length > 0 || e.attackTarget != null || e.orderQueue) clearOrder(e);
  e.orderQueue = undefined;
  e.holdPosition = false;
}

/** Soldiers aboard a host, and aboard anything aboard it (a truck on an LST deck). */
export function soldiersAboard(state: MatchState, host: Entity): Entity[] {
  const out: Entity[] = [];
  for (const u of livingGarrison(state, host)) {
    if (isInfantryType(u.type)) out.push(u);
    if (u.garrison.length) out.push(...soldiersAboard(state, u));
  }
  return out;
}

/** Why `unit` cannot purge `host`, or null when he can: a live host with enemy soldiers inside. */
export function purgeDenied(state: MatchState, unit: Entity, host: Entity): string | null {
  if (!isSimUnit(unit.type)) return "Only a Sim Unit blinks in.";
  if (host.id === unit.id || host.hp <= 0 || host.wreck) return "Nothing there to purge.";
  const inside = soldiersAboard(state, host);
  if (inside.length === 0) return "No soldiers inside.";
  if (inside.every((u) => allies(state, unit.ownerId, u.ownerId))) return "Those are friends.";
  return null;
}

function hostCenter(state: MatchState, host: Entity): { x: number; y: number } {
  return host.kind === "building" ? buildingCenter(host.tileX, host.tileY, host.tileW, host.tileH, state.tileSize) : { x: host.x, y: host.y };
}

/** The nearest tile he can stand on at or around (x, y), or null when there is none close. */
function landing(state: MatchState, e: Entity, x: number, y: number): { x: number; y: number } | null {
  const ts = state.tileSize;
  const tx = worldToTile(x, ts);
  const ty = worldToTile(y, ts);
  for (let r = 0; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = tx + dx;
        const cy = ty + dy;
        if (!inBounds(state, cx, cy) || !walkable(state, cx, cy, e.type)) continue;
        return r === 0 ? { x, y } : { x: tileCenter(cx, ts), y: tileCenter(cy, ts) };
      }
    }
  }
  return null;
}

/** He is at (x, y) now. The client gets the flash at both ends. */
function teleport(state: MatchState, e: Entity, x: number, y: number, inside?: true): void {
  state.blinks.push({ id: state.nextId++, unitId: e.id, ownerId: e.ownerId, x: e.x, y: e.y, tx: x, ty: y, inside });
  const dx = x - e.x;
  const dy = y - e.y;
  if (dx !== 0 || dy !== 0) e.facing = Math.atan2(dy, dx);
  e.x = x;
  e.y = y;
  e.tileX = worldToTile(x, state.tileSize);
  e.tileY = worldToTile(y, state.tileSize);
  e.waypoints = [];
  e.pathFail = undefined;
  e.pathGoal = undefined;
}

/** Strip the sandbag, wall, and tree cover baked into his pool (field.ts applyCoverHp), keeping the share he has. */
function dropCover(e: Entity): void {
  const base = catalog(e.type).hp;
  if (e.hpMax === base) return;
  const ratio = e.hpMax > 0 ? e.hp / e.hpMax : 1;
  e.hpMax = base;
  e.hp = Math.max(1, Math.min(base, Math.round(base * ratio)));
  e.coverBonus = 0;
}

function spendCharge(state: MatchState, e: Entity): void {
  e.blinkReady = state.tick + secondsToTicks(SIMUNIT_BLINK_RECHARGE_SECONDS);
}

function inBlinkReach(state: MatchState, e: Entity, x: number, y: number): boolean {
  const reach = SIMUNIT_BLINK_RANGE_TILES * state.tileSize;
  return (x - e.x) ** 2 + (y - e.y) ** 2 <= reach * reach;
}

/** Walk toward the goal until the blink reaches it. */
function closeOn(state: MatchState, e: Entity, x: number, y: number): void {
  e.state = "move";
  if (e.waypoints.length === 0 || (state.tick + e.id) % 5 === 0) setPath(state, e, x, y);
}

function tickBlinkOrder(state: MatchState, e: Entity): void {
  const o = e.order!;
  const x = o.x!;
  const y = o.y!;
  if (!inBlinkReach(state, e, x, y)) {
    closeOn(state, e, x, y);
    return;
  }
  // In reach: stand and wait for the charge, then go.
  e.waypoints = [];
  if (!blinkReady(state, e)) {
    e.state = "idle";
    return;
  }
  const at = landing(state, e, x, y);
  clearOrder(e);
  if (!at) return;
  spendCharge(state, e);
  teleport(state, e, at.x, at.y);
}

function tickPurgeOrder(state: MatchState, e: Entity): void {
  const host = e.order?.targetId != null ? state.entities.get(e.order.targetId) : undefined;
  if (!host || purgeDenied(state, e, host)) {
    clearOrder(e);
    return;
  }
  const c = hostCenter(state, host);
  if (!inBlinkReach(state, e, c.x, c.y)) {
    const door = host.kind === "building" ? approachTile(state, host, e) : null;
    const goal = door ? { x: tileCenter(door.x, state.tileSize), y: tileCenter(door.y, state.tileSize) } : c;
    closeOn(state, e, goal.x, goal.y);
    return;
  }
  e.waypoints = [];
  if (!blinkReady(state, e)) {
    e.state = "idle";
    return;
  }
  clearOrder(e);
  spendCharge(state, e);
  e.purge = { hostId: host.id, from: { x: e.x, y: e.y }, until: state.tick + secondsToTicks(SIMUNIT_PURGE_SECONDS) };
  // Inside, cover means nothing: the pool goes back to his own, and the field re-adds it when he is out.
  dropCover(e);
  teleport(state, e, c.x, c.y, true);
  // Inside: out of reach and out of sight, like a passenger, though not on the host's roll.
  e.garrisonedIn = host.id;
  e.state = "garrison";
}

/** Back out beside the host, or where he stood if that is still open. */
function blinkOut(state: MatchState, e: Entity, host: Entity | undefined): void {
  const p = e.purge!;
  e.purge = undefined;
  e.garrisonedIn = null;
  const back = inBlinkReach(state, e, p.from.x, p.from.y) ? landing(state, e, p.from.x, p.from.y) : null;
  const door = !back && host ? approachTile(state, host, e) : null;
  const at = back ?? (door ? { x: tileCenter(door.x, state.tileSize), y: tileCenter(door.y, state.tileSize) } : landing(state, e, e.x, e.y) ?? { x: e.x, y: e.y });
  teleport(state, e, at.x, at.y, true);
  e.state = "idle";
}

function tickPurge(state: MatchState, e: Entity): void {
  const p = e.purge!;
  const host = state.entities.get(p.hostId);
  // The host fell, emptied, or he was pulled out: the purge is off.
  if (!host || host.hp <= 0 || host.wreck || e.garrisonedIn !== host.id) {
    blinkOut(state, e, host);
    return;
  }
  const inside = soldiersAboard(state, host);
  if (inside.length === 0 || inside.every((u) => allies(state, e.ownerId, u.ownerId))) {
    blinkOut(state, e, host);
    return;
  }
  if (state.tick < p.until) return;
  // Every soldier aboard dies where he sits. The reaper takes them off the roll this tick.
  for (const u of inside) {
    u.hp = 0;
    u.state = "dead";
    u.order = null;
    u.waypoints = [];
    u.attackTarget = null;
  }
  vacateIfEmpty(state, host);
  blinkOut(state, e, host);
}

export function tickSimUnits(state: MatchState): void {
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.wreck) continue;
    // Still dark: whatever order reached him goes nowhere.
    if (e.dormant) {
      idle(e);
      continue;
    }
    if (!isSimUnit(e.type)) continue;
    if (e.purge) {
      tickPurge(state, e);
      continue;
    }
    if (e.garrisonedIn != null || e.shutdown) continue;
    if (e.order?.kind === "blink" && e.order.x != null && e.order.y != null) tickBlinkOrder(state, e);
    else if (e.order?.kind === "purge") tickPurgeOrder(state, e);
  }
}
