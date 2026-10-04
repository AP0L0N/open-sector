import {
  DAY_SECONDS,
  LAMP_HEADING_STEP_DEG,
  MAMMOTH_LAMP_PERIOD_SECONDS,
  MAMMOTH_LAMP_STEP_DEG,
  MAMMOTH_LAMP_SWING_DEG,
  catalog,
  hasCrit,
  isAircraftType,
  isArmoredType,
  isCyborg,
  isDroneType,
  type Crit,
  DUSK_SECONDS,
  NEUTRAL_OWNER,
  NIGHT_REACH_MUL,
  NIGHT_SECONDS,
  NIGHT_SIGHT_MUL,
  SPOTLIGHT_ON_DAYLIGHT,
  SPOTLIGHT_TURN_DEG_PER_SEC,
  TICK_DT,
} from "../catalog.js";
import type { EntityType } from "../protocol.js";
import { patrolLegIndex, stepPatrolLeg } from "./patrol.js";
import type { Entity, MatchState } from "./types.js";

/** One full day: day, dusk, night, dawn. Dawn is as long as dusk. */
export const DAY_CYCLE_SECONDS = DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS + DUSK_SECONDS;

/** 1 in full day, 0 in full night, sliding through dusk and dawn. The match opens at morning. */
export function daylightAt(tick: number): number {
  const s = (tick * TICK_DT) % DAY_CYCLE_SECONDS;
  if (s < DAY_SECONDS) return 1;
  if (s < DAY_SECONDS + DUSK_SECONDS) return 1 - (s - DAY_SECONDS) / DUSK_SECONDS;
  if (s < DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS) return 0;
  return Math.min(1, (s - DAY_SECONDS - DUSK_SECONDS - NIGHT_SECONDS) / DUSK_SECONDS);
}

/**
 * The match clock. The fight opens at CLOCK_OPEN_HOUR:00 in full day, and one
 * cycle is 24 hours on the face. Dusk, night, and dawn land on the evening
 * and the small hours, so the digits tell you when the dark arrives.
 */
export const CLOCK_OPEN_HOUR = 6;

export type DayPhase = "day" | "dusk" | "night" | "dawn";

export interface MatchClock {
  hour: number;
  minute: number;
  /** "HH:MM", 24-hour. */
  text: string;
  phase: DayPhase;
}

const MINUTES_PER_DAY = 24 * 60;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Seconds from morning, wrapped onto one cycle. */
function cycleSeconds(tick: number): number {
  return (tick * TICK_DT) % DAY_CYCLE_SECONDS;
}

function phaseAtSeconds(s: number): DayPhase {
  if (s < DAY_SECONDS) return "day";
  if (s < DAY_SECONDS + DUSK_SECONDS) return "dusk";
  if (s < DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS) return "night";
  return "dawn";
}

function phaseStartSeconds(phase: DayPhase): number {
  if (phase === "dusk") return DAY_SECONDS;
  if (phase === "night") return DAY_SECONDS + DUSK_SECONDS;
  if (phase === "dawn") return DAY_SECONDS + DUSK_SECONDS + NIGHT_SECONDS;
  return 0;
}

/** Hour and minute for a moment in the cycle, in seconds from morning. */
function clockFace(seconds: number): { hour: number; minute: number; text: string } {
  const span = DAY_CYCLE_SECONDS;
  let s = seconds % span;
  if (s < 0) s += span;
  const into = Math.floor((s / span) * MINUTES_PER_DAY + 1e-9);
  const total = (CLOCK_OPEN_HOUR * 60 + into) % MINUTES_PER_DAY;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return { hour, minute, text: `${pad2(hour)}:${pad2(minute)}` };
}

/** Where the clock stands at this tick. Same cycle as daylightAt. */
export function matchClock(tick: number): MatchClock {
  const s = cycleSeconds(tick);
  return { ...clockFace(s), phase: phaseAtSeconds(s) };
}

/** Clock face at the start of a phase. Night is the evening hour the dark begins. */
export function phaseStartText(phase: DayPhase): string {
  return clockFace(phaseStartSeconds(phase)).text;
}

/**
 * The line under the clock. Day and dusk both name when night starts;
 * night names the dawn; dawn names the morning.
 */
export function clockMarkLine(phase: DayPhase): string {
  const mark: DayPhase = phase === "night" ? "dawn" : phase === "dawn" ? "day" : "night";
  return `${mark} at ${phaseStartText(mark)}`;
}

/** Share of daylight weapon reach left at this tick. */
export function nightReachMul(tick: number): number {
  return NIGHT_REACH_MUL + (1 - NIGHT_REACH_MUL) * daylightAt(tick);
}

/** Share of daylight sight left at this tick. */
export function nightSightMul(tick: number): number {
  return NIGHT_SIGHT_MUL + (1 - NIGHT_SIGHT_MUL) * daylightAt(tick);
}

/** A sight or reach in tiles, cut for the dark. Never below one tile while it had any. */
export function nightTiles(tiles: number, mul: number): number {
  if (mul >= 1 || tiles <= 0) return tiles;
  return Math.max(1, Math.round(tiles * mul));
}

/** Lamps are lit: spotlights paint the ground. */
export function spotlightsOn(tick: number): boolean {
  return daylightAt(tick) < SPOTLIGHT_ON_DAYLIGHT;
}

/** The Watch Tower's cab lamp, and the Battle Ship's searchlight on the bridge. */
export function hasSpotlight(type: EntityType): boolean {
  return type === "tower" || type === "battleship";
}

/**
 * Armored ground hulls and the Cyborg carry a headlight. Planes and drones fly
 * dark, and so does a submarine.
 */
export function hasHeadlight(type: EntityType): boolean {
  if (isCyborg(type)) return true;
  if (catalog(type).submerges) return false;
  return isArmoredType(type) && !isAircraftType(type) && !isDroneType(type) && !hasSpotlight(type);
}

/** One hull lamp: where its beam points, and where the bulb is fixed on the hull. Offsets are radians from the nose. */
export interface HullLamp {
  beam: number;
  mount: number;
}

/** Every hull but the Mammoth: one lamp, fixed on the nose. */
const NOSE_LAMP: readonly HullLamp[] = [{ beam: 0, mount: 0 }];

const MAMMOTH_LAMP_STEP = (MAMMOTH_LAMP_STEP_DEG * Math.PI) / 180;
const MAMMOTH_LAMP_SWING = (MAMMOTH_LAMP_SWING_DEG * Math.PI) / 180;
const MAMMOTH_LAMP_OMEGA = (2 * Math.PI) / MAMMOTH_LAMP_PERIOD_SECONDS;

/**
 * Lamps on this hull at `seconds` into the match. A Mammoth has the nose lamp
 * plus one on each flank; the flank beams drift through a small arc and the
 * bulbs stay on the hull. Every other hull is the nose lamp only.
 */
export function hullLamps(type: EntityType, id: number, seconds: number): readonly HullLamp[] {
  if (type !== "mammoth") return NOSE_LAMP;
  const phase = (id % 4096) * 0.37;
  const swing = MAMMOTH_LAMP_SWING * Math.sin(seconds * MAMMOTH_LAMP_OMEGA + phase);
  const other = MAMMOTH_LAMP_SWING * Math.sin(seconds * MAMMOTH_LAMP_OMEGA + phase + Math.PI);
  return [
    { beam: 0, mount: 0 },
    { beam: MAMMOTH_LAMP_STEP + swing, mount: MAMMOTH_LAMP_STEP },
    { beam: -MAMMOTH_LAMP_STEP + other, mount: -MAMMOTH_LAMP_STEP },
  ];
}

/** A headlight burns on a live hull out in the open, not on a wreck or a passenger. */
export function headlightLit(e: {
  type: EntityType;
  kind: string;
  hp?: number;
  wreck?: boolean;
  garrisonedIn?: number | null;
  air?: unknown;
  crits?: readonly Crit[];
}): boolean {
  if (hasCrit({ crits: e.crits ?? [] }, "lamp")) return false;
  return e.kind === "unit" && hasHeadlight(e.type) && (e.hp ?? 1) > 0 && !e.wreck && e.garrisonedIn == null && !e.air;
}

/** A lamp's heading as sight reads it: snapped to LAMP_HEADING_STEP_DEG. */
export function lampHeading(a: number): number {
  const step = (LAMP_HEADING_STEP_DEG * Math.PI) / 180;
  return Math.round(a / step) * step;
}

/** A tower someone holds carries a working lamp. A neutral one stands dark. */
export function spotlightManned(e: {
  type: EntityType;
  ownerId: string;
  hp: number;
  ruined?: boolean;
  wreck?: boolean;
  crits?: readonly Crit[];
}): boolean {
  if (hasCrit({ crits: e.crits ?? [] }, "lamp")) return false;
  return hasSpotlight(e.type) && e.ownerId !== NEUTRAL_OWNER && e.hp > 0 && !e.ruined && !e.wreck;
}

/** Heading the lamp rests on before anyone turns it: the way the tower was placed. */
export function spotFacingOf(e: Pick<Entity, "facing" | "spotFacing">): number {
  return e.spotFacing ?? e.facing;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** A patrol spot this close to the tower is its own footprint, not a place to look. */
const LAMP_SPOT_MIN = 1;

/**
 * Point a patrolling lamp at its current leg. A spot on the tower itself is
 * skipped, so the beam sweeps the placed points and not the cab.
 */
export function aimSpotlightPatrol(e: Entity): void {
  const o = e.order;
  if (!o || o.kind !== "patrol" || !o.route || o.route.length < 2) return;
  const route = o.route;
  const loop = o.loop === true;
  let leg = patrolLegIndex(route.length, o.leg, loop);
  let dir: 1 | -1 = loop ? 1 : o.dir === -1 ? -1 : 1;
  for (let n = 0; n < route.length; n++) {
    const dest = route[leg];
    if (dest && Math.hypot(dest.x - e.x, dest.y - e.y) >= LAMP_SPOT_MIN) {
      o.leg = leg;
      o.dir = dir;
      e.spotFacing = spotFacingOf(e);
      e.spotAim = Math.atan2(dest.y - e.y, dest.x - e.x);
      return;
    }
    const next = stepPatrolLeg(route, leg, dir, loop);
    if (next.leg === leg && next.dir === dir) return;
    leg = next.leg;
    dir = next.dir;
  }
}

/**
 * Swing every held lamp toward the heading Rotate or a patrol spot gave it.
 * A lamp on a hull (the Battle Ship) is carried round as the ship turns.
 */
export function tickSpotlights(state: MatchState, dt: number): void {
  const max = ((SPOTLIGHT_TURN_DEG_PER_SEC * Math.PI) / 180) * dt;
  for (const e of state.entities.values()) {
    if (!spotlightManned(e)) continue;
    if (e.kind === "unit") {
      if (e.spotFacing != null) e.spotFacing = wrap(e.spotFacing + wrap(e.facing - (e.spotHull ?? e.facing)));
      e.spotHull = e.facing;
    }
    const at = spotFacingOf(e);
    e.spotFacing = at;
    if (e.spotAim != null) {
      const delta = wrap(e.spotAim - at);
      if (Math.abs(delta) <= max) {
        e.spotFacing = wrap(e.spotAim);
        e.spotAim = undefined;
      } else {
        e.spotFacing = wrap(at + Math.sign(delta) * max);
      }
    }
    // The beam has settled on this spot. Turn it toward the next one. A ship's patrol is its course, not the lamp's.
    const o = e.kind === "building" ? e.order : null;
    if (o?.kind !== "patrol" || !o.route || o.route.length < 2 || e.spotAim != null) continue;
    const loop = o.loop === true;
    const next = stepPatrolLeg(o.route, patrolLegIndex(o.route.length, o.leg, loop), o.dir === -1 ? -1 : 1, loop);
    o.leg = next.leg;
    o.dir = next.dir;
    aimSpotlightPatrol(e);
  }
}
