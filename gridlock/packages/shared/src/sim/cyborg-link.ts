import { CYBORG_SHUTDOWN_SECONDS, CYBORG_TAKEOVER_RANGE_TILES, CYBORG_TAKEOVER_SECONDS, NEUTRAL_OWNER, secondsToTicks } from "../catalog.js";
import { clearOrder } from "./geo.js";
import { powerOf } from "./power.js";
import type { Entity, MatchState } from "./types.js";

/**
 * Cyborg link. A side's Cyborgs run on the uplink from its own standing Cyborg Central
 * while its power holds, or on its own living Cyborg Commander. With neither, after
 * CYBORG_SHUTDOWN_SECONDS every Cyborg of that side on the field shuts down: he belongs
 * to no one, stops, and fires at nothing. Once that side's link is back (a new Central,
 * power restored, a Commander of its own), its dark Cyborgs wake up on it again. Before
 * that, a living Commander takes over any shut-down Cyborg within
 * CYBORG_TAKEOVER_RANGE_TILES, one at a time, CYBORG_TAKEOVER_SECONDS each; one taken
 * over is his side's for good.
 * Runs right after tickPower, before anything moves or fires.
 */

function live(e: Entity): boolean {
  return e.hp > 0 && !e.wreck;
}

/** A Commander whose uplink counts: alive, on the field (not aboard), and his side still in the fight. */
function commanderUp(state: MatchState, e: Entity): boolean {
  return e.type === "cyborgcommander" && live(e) && e.garrisonedIn == null && !!state.players.get(e.ownerId)?.alive;
}

/** A Cyborg the link rule reaches: a plain Cyborg on the field. One aboard waits until he steps off. */
function fieldCyborg(e: Entity): boolean {
  return e.type === "cyborg" && e.kind === "unit" && live(e) && e.garrisonedIn == null;
}

/** This side's Cyborg Central stands and its power is not short. */
export function cyborgCentralOnline(state: MatchState, playerId: string): boolean {
  let stands = false;
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && e.type === "cyborgcentral" && e.kind === "building" && live(e)) {
      stands = true;
      break;
    }
  }
  return stands && !powerOf(state, playerId).lowPower;
}

/** A living Cyborg Commander of this side. One aboard a transport still holds the link. */
export function cyborgCommanderAlive(state: MatchState, playerId: string): boolean {
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && e.type === "cyborgcommander" && live(e)) return true;
  }
  return false;
}

/** This side's Cyborgs keep running. */
export function cyborgLinked(state: MatchState, playerId: string): boolean {
  return cyborgCommanderAlive(state, playerId) || cyborgCentralOnline(state, playerId);
}

/** Seconds before this side's Cyborgs shut down, or null while they are linked. 0 once they have. */
export function cyborgShutdownIn(state: MatchState, playerId: string): number | null {
  const lost = state.players.get(playerId)?.cyborgLinkLostTick;
  if (lost == null) return null;
  return Math.max(0, secondsToTicks(CYBORG_SHUTDOWN_SECONDS) - (state.tick - lost)) / secondsToTicks(1);
}

/** The Cyborg powers down where he stands and is no one's. He remembers his side. */
export function shutDownCyborg(e: Entity): void {
  clearOrder(e);
  e.orderQueue = undefined;
  e.holdPosition = false;
  if (e.ownerId) e.shutdownFrom = e.ownerId;
  e.ownerId = NEUTRAL_OWNER;
  e.shutdown = true;
  e.takeover = undefined;
}

/** He wakes on `ownerId`'s side with no order: a Commander's uplink, or his own side's link come back. */
function takeOver(e: Entity, ownerId: string): void {
  e.ownerId = ownerId;
  e.shutdown = undefined;
  e.shutdownFrom = undefined;
  e.takeover = undefined;
  clearOrder(e);
}

export function tickCyborgLink(state: MatchState): void {
  const grace = secondsToTicks(CYBORG_SHUTDOWN_SECONDS);
  const linked = new Set<string>();
  for (const p of state.players.values()) {
    if (!p.alive || cyborgLinked(state, p.playerId)) {
      if (p.alive) linked.add(p.playerId);
      p.cyborgLinkLostTick = undefined;
      continue;
    }
    p.cyborgLinkLostTick ??= state.tick;
    if (state.tick - p.cyborgLinkLostTick < grace) continue;
    for (const e of state.entities.values()) {
      if (e.ownerId === p.playerId && fieldCyborg(e) && !e.shutdown) shutDownCyborg(e);
    }
  }
  // The link is back: his own side's dark Cyborgs wake up, even mid-takeover by someone else.
  if (linked.size > 0) {
    for (const e of state.entities.values()) {
      if (e.shutdown && e.shutdownFrom && linked.has(e.shutdownFrom) && fieldCyborg(e)) takeOver(e, e.shutdownFrom);
    }
  }
  tickTakeovers(state);
}

function tickTakeovers(state: MatchState): void {
  const reach = CYBORG_TAKEOVER_RANGE_TILES * state.tileSize;
  const inReach = (c: Entity, o: Entity): boolean => (o.x - c.x) ** 2 + (o.y - c.y) ** 2 <= reach * reach;
  const commanders: Entity[] = [];
  const dark: Entity[] = [];
  for (const e of state.entities.values()) {
    if (commanderUp(state, e)) commanders.push(e);
    else if (e.shutdown && fieldCyborg(e)) dark.push(e);
  }
  // An uplink breaks when its Commander falls, boards, or walks out of reach: the count starts over.
  const busy = new Set<number>();
  for (const d of dark) {
    if (!d.takeover) continue;
    const c = state.entities.get(d.takeover.by);
    if (!c || !commanderUp(state, c) || !inReach(c, d) || busy.has(c.id)) d.takeover = undefined;
    else busy.add(c.id);
  }
  if (commanders.length === 0) return;
  const need = secondsToTicks(CYBORG_TAKEOVER_SECONDS);
  for (const c of commanders) {
    let target = dark.find((d) => d.takeover?.by === c.id);
    if (!target) {
      let bestD = Infinity;
      for (const d of dark) {
        if (d.takeover || !inReach(c, d)) continue;
        const dd = (d.x - c.x) ** 2 + (d.y - c.y) ** 2;
        if (dd < bestD) {
          bestD = dd;
          target = d;
        }
      }
      if (!target) continue;
      target.takeover = { by: c.id, ticks: 0 };
    }
    target.takeover!.ticks += 1;
    if (target.takeover!.ticks >= need) takeOver(target, c.ownerId);
  }
}
