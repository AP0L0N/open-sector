import {
  ASW_CLIMB_PER_SEC,
  ASW_CRUISE_ALT,
  ASW_DROP_ALT,
  ASW_DROP_TILES,
  ASW_REARM_SECONDS,
  ASW_RECOVER_TILES,
  ASW_STANDOFF_TILES,
  ASW_REPLACE_SECONDS,
  ASW_TORPEDO_FAN_DEG,
  ASW_TORPEDOES,
  catalog,
  hasSonar,
  SONAR_RANGE_TILES,
  submergesOf,
  TORPEDO,
  TORPEDO_RANGE_TILES,
  TORPEDO_SPEED,
  WATER_MINE_ARM_SECONDS,
  WATER_MINE_GAP_SECONDS,
  WATER_MINE_LIFE_SECONDS,
  WATER_MINE_REARM_SECONDS,
  WATER_MINES,
  MINE_CAP,
} from "../catalog.js";
import type { EntityView, SonarContactView } from "../protocol.js";
import { besideMarineBase } from "./battleship.js";
import { allies, destroyEntity, isWater, makeEntity, playerTeam, worldToTile } from "./geo.js";
import { armTorpedo, diving } from "./naval.js";
import { stepTurn } from "./orders.js";
import type { Entity, MatchState, Projectile } from "./types.js";

/** A Destroyer still afloat and fighting: its sonar listens and its deck works. */
function shipLive(e: Entity | undefined): e is Entity {
  return !!e && hasSonar(e.type) && !!e.asw && e.hp > 0 && !e.wreck;
}

/** A submarine this ship's sonar hears: an enemy boat, down or up, inside SONAR_RANGE_TILES. */
export function sonarHears(state: MatchState, ship: Entity, sub: Entity): boolean {
  if (!shipLive(ship) || !submergesOf(sub.type) || sub.hp <= 0 || sub.wreck) return false;
  if (!sub.ownerId || allies(state, ship.ownerId, sub.ownerId)) return false;
  return Math.hypot(sub.x - ship.x, sub.y - ship.y) <= SONAR_RANGE_TILES * state.tileSize;
}

/** Nearest submarine this ship hears, or null. */
function nearestHeard(state: MatchState, ship: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (!sonarHears(state, ship, o)) continue;
    const d = Math.hypot(o.x - ship.x, o.y - ship.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/**
 * Every enemy submarine a Destroyer on `playerId`'s side hears, down or up, fog or not.
 * The client marks them and calls each new one. Hearing is not seeing: a gun still needs
 * the boat in sight (hiddenSubmarine).
 */
export function sonarContacts(state: MatchState, playerId: string): SonarContactView[] {
  const ships: Entity[] = [];
  for (const e of state.entities.values()) {
    if (shipLive(e) && allies(state, playerId, e.ownerId)) ships.push(e);
  }
  if (ships.length === 0) return [];
  const out: SonarContactView[] = [];
  for (const o of state.entities.values()) {
    if (!ships.some((s) => sonarHears(state, s, o))) continue;
    out.push({ id: o.id, x: Math.round(o.x), y: Math.round(o.y), down: diving(o) || undefined });
  }
  return out;
}

/** The helicopter this ship has in the air, if any. */
export function heliOf(state: MatchState, ship: Entity): Entity | null {
  const id = ship.asw?.heliId;
  if (id == null) return null;
  const h = state.entities.get(id);
  return h && h.hp > 0 && h.heli?.shipId === ship.id ? h : null;
}

/** On deck, loaded, and nothing in the way of a take-off. */
function heliReady(ship: Entity): boolean {
  const d = ship.asw!;
  return d.heliId == null && d.replace <= 0 && d.rearm <= 0 && d.torpedoes > 0;
}

/** Take off from the fantail after the heard submarine. */
function launchHeli(state: MatchState, ship: Entity, sub: Entity): Entity {
  const d = ship.asw!;
  const h = makeEntity(state, "aswheli", ship.ownerId, ship.x, ship.y, { facing: ship.facing });
  h.air!.phase = "fly";
  h.air!.alt = 0;
  h.turretFacing = h.facing;
  h.state = "move";
  h.heli = { shipId: ship.id, contactId: sub.id, x: sub.x, y: sub.y, torpedoes: d.torpedoes };
  d.torpedoes = 0;
  d.heliId = h.id;
  return h;
}

/**
 * Lay one contact mine over the stern. Null when it went, else why not.
 * One at a time: the rail needs WATER_MINE_GAP_SECONDS between two.
 */
export function layMine(state: MatchState, ship: Entity): string | null {
  if (!shipLive(ship)) return "Select a Destroyer.";
  const d = ship.asw!;
  if (d.mines <= 0) return "No mines left: refill beside a Marine Base.";
  if (d.mineGap > 0) return "The mine rail is still clearing.";
  const ts = state.tileSize;
  const back = ship.radius * 1.1;
  const x = ship.x - Math.cos(ship.facing) * back;
  const y = ship.y - Math.sin(ship.facing) * back;
  if (!isWater(state, worldToTile(x, ts), worldToTile(y, ts))) return "No water astern to lay a mine.";
  state.mines.push({ id: state.nextId++, ownerId: ship.ownerId, x, y, arm: WATER_MINE_ARM_SECONDS, life: WATER_MINE_LIFE_SECONDS, water: true, layerId: ship.id });
  if (state.mines.length > MINE_CAP) state.mines.splice(0, state.mines.length - MINE_CAP);
  d.mines -= 1;
  d.mineGap = WATER_MINE_GAP_SECONDS;
  return null;
}

/** The deck as the owner's command bar shows it. */
export function aswDeckView(ship: Entity): NonNullable<EntityView["asw"]> {
  const d = ship.asw!;
  const heli = d.heliId != null ? "up" : d.replace > 0 ? "lost" : d.rearm > 0 || d.torpedoes <= 0 ? "rearm" : "ready";
  return {
    heli,
    rearm: heli === "rearm" && d.rearm > 0 ? d.rearm : undefined,
    replace: heli === "lost" ? d.replace : undefined,
    mines: d.mines,
    minesMax: WATER_MINES,
    mineGap: d.mineGap > 0 ? d.mineGap : undefined,
  };
}

/** Sim phase: every Destroyer's deck and rail, and every ASW helicopter in the air. */
export function tickDestroyers(state: MatchState, dt: number): void {
  const stow: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.asw) tickDeck(state, e, dt);
    else if (e.heli && e.air && e.hp > 0) {
      if (tickHeli(state, e, dt)) stow.push(e);
    }
  }
  for (const h of stow) {
    const ship = state.entities.get(h.heli!.shipId);
    if (shipLive(ship)) {
      const d = ship.asw!;
      const missing = ASW_TORPEDOES - h.heli!.torpedoes;
      d.heliId = null;
      d.torpedoes = h.heli!.torpedoes;
      d.rearm = (ASW_REARM_SECONDS * missing) / ASW_TORPEDOES;
    }
    destroyEntity(state, h);
  }
}

/** Ship side: the rail, the loading on deck, a lost helicopter, and the sonar's call to launch. */
function tickDeck(state: MatchState, ship: Entity, dt: number): void {
  if (!shipLive(ship)) return;
  const d = ship.asw!;
  if (d.mineGap > 0) d.mineGap = Math.max(0, d.mineGap - dt);
  if (d.mines < WATER_MINES && besideMarineBase(state, ship)) {
    d.mineRearm += dt;
    if (d.mineRearm >= WATER_MINE_REARM_SECONDS) {
      d.mineRearm -= WATER_MINE_REARM_SECONDS;
      d.mines += 1;
    }
  } else {
    d.mineRearm = 0;
  }
  if (d.heliId != null && !heliOf(state, ship)) {
    // Shot down. A new one is flown out to the ship after a while.
    d.heliId = null;
    d.torpedoes = 0;
    d.rearm = 0;
    d.replace = ASW_REPLACE_SECONDS;
    return;
  }
  if (d.heliId != null) return;
  if (d.replace > 0) {
    d.replace = Math.max(0, d.replace - dt);
    if (d.replace <= 0) d.torpedoes = ASW_TORPEDOES;
    return;
  }
  if (d.rearm > 0) {
    d.rearm = Math.max(0, d.rearm - dt);
    if (d.rearm <= 0) d.torpedoes = ASW_TORPEDOES;
    return;
  }
  if (!heliReady(ship)) return;
  const sub = nearestHeard(state, ship);
  if (sub) launchHeli(state, ship, sub);
}

function place(state: MatchState, e: Entity, x: number, y: number): void {
  const maxX = state.width * state.tileSize - 1;
  const maxY = state.height * state.tileSize - 1;
  e.x = Math.max(1, Math.min(maxX, x));
  e.y = Math.max(1, Math.min(maxY, y));
  e.tileX = worldToTile(e.x, state.tileSize);
  e.tileY = worldToTile(e.y, state.tileSize);
}

/** Fly straight at a point and hover there. True once it is there. */
function flyTo(state: MatchState, h: Entity, x: number, y: number, dt: number): boolean {
  const speed = catalog(h.type).moveTilesPerSec * state.tileSize;
  const dx = x - h.x;
  const dy = y - h.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= Math.max(0.5, step)) {
    place(state, h, x, y);
    return true;
  }
  h.facing = stepTurn(h.facing, Math.atan2(dy, dx), catalog(h.type).turnDegPerSec, dt).angle;
  h.turretFacing = h.facing;
  place(state, h, h.x + (dx / dist) * step, h.y + (dy / dist) * step);
  return false;
}

function approachAlt(h: Entity, goal: number, dt: number): void {
  const a = h.air!;
  const rate = ASW_CLIMB_PER_SEC;
  if (a.alt < goal) a.alt = Math.min(goal, a.alt + rate * dt);
  else if (a.alt > goal) a.alt = Math.max(goal, a.alt - rate * dt);
}

/** One helicopter's tick. True once it is back on its deck and should be stowed. */
function tickHeli(state: MatchState, h: Entity, dt: number): boolean {
  const s = h.heli!;
  const ship = state.entities.get(s.shipId);
  if (!shipLive(ship) || ship.ownerId !== h.ownerId) {
    // Its deck is gone. It has nowhere to come down.
    h.hp = 0;
    return false;
  }
  const ts = state.tileSize;
  h.state = "move";
  if (s.torpedoes > 0) {
    // The sonar keeps the plot fresh while it still hears the boat; else the last heard spot stands.
    const sub = s.contactId != null ? state.entities.get(s.contactId) : undefined;
    if (sub && sonarHears(state, ship, sub)) {
      s.x = sub.x;
      s.y = sub.y;
    } else if (!sub || sub.hp <= 0 || sub.wreck) {
      const next = nearestHeard(state, ship);
      if (next) {
        s.contactId = next.id;
        s.x = next.x;
        s.y = next.y;
      } else {
        // Sunk by someone else and nothing else heard: home with the torpedoes still aboard.
        s.contactId = null;
        return flyHome(state, h, ship, dt);
      }
    }
    const dist = Math.hypot(s.x - h.x, s.y - h.y);
    const reach = ASW_DROP_TILES * ts;
    const overWater = isWater(state, worldToTile(h.x, ts), worldToTile(h.y, ts));
    flyTo(state, h, s.x, s.y, dt);
    approachAlt(h, dist < reach * 1.6 ? ASW_DROP_ALT : ASW_CRUISE_ALT, dt);
    // It flies out before it lets go: well clear of its own ship, or right over the plot
    // when the boat is close aboard. And off the deck, down at drop height.
    const clear = Math.hypot(h.x - ship.x, h.y - ship.y) >= ship.radius + ASW_STANDOFF_TILES * ts;
    const over = dist <= ASW_STANDOFF_TILES * ts * 0.25;
    if (dist <= reach && (clear || over) && overWater && Math.abs(h.air!.alt - ASW_DROP_ALT) <= 1) dropTorpedoes(state, h, ship);
    return false;
  }
  return flyHome(state, h, ship, dt);
}

/** Back to the ship, down onto the fantail. True once it is on deck. */
function flyHome(state: MatchState, h: Entity, ship: Entity, dt: number): boolean {
  const ts = state.tileSize;
  const near = Math.hypot(ship.x - h.x, ship.y - h.y) <= ASW_RECOVER_TILES * ts * 4;
  flyTo(state, h, ship.x, ship.y, dt);
  approachAlt(h, near ? 0 : ASW_CRUISE_ALT, dt);
  return Math.hypot(ship.x - h.x, ship.y - h.y) <= ASW_RECOVER_TILES * ts && h.air!.alt <= 1;
}

/**
 * All torpedoes at once, in a fan laid on the heard position. Each is the He 111's: it
 * runs the whole of a torpedo's run whatever point it was laid on, and meets whatever
 * floats across it, a submarine down or up. It runs under its own ship: let go close
 * aboard, it must not sink the deck it came from.
 */
function dropTorpedoes(state: MatchState, h: Entity, ship: Entity): void {
  const s = h.heli!;
  const run = TORPEDO_RANGE_TILES * state.tileSize;
  const bearing = Math.atan2(s.y - h.y, s.x - h.x);
  const n = s.torpedoes;
  for (let i = 0; i < n; i++) {
    const ang = bearing + ((i - (n - 1) / 2) * ASW_TORPEDO_FAN_DEG * Math.PI) / 180;
    const p: Projectile = {
      id: state.nextId++,
      ownerId: h.ownerId,
      team: playerTeam(state, h.ownerId),
      x: h.x,
      y: h.y,
      vx: Math.cos(ang) * TORPEDO_SPEED,
      vy: Math.sin(ang) * TORPEDO_SPEED,
      damage: TORPEDO.damage,
      penetration: TORPEDO.penetration,
      caliber: TORPEDO.caliber,
      life: run / TORPEDO_SPEED + 0.05,
      ignoreId: ship.id,
      fromId: h.id,
      bounced: false,
      shell: null,
      z: 0,
      vz: 0,
    };
    armTorpedo(state, p, false);
    state.projectiles.push(p);
  }
  s.torpedoes = 0;
  s.contactId = null;
}
