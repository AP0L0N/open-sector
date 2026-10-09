import { TITAN_NUKE, catalog, isArmoredType, isBridge, isGarrisonable, isHq, isInfantryType } from "../catalog.js";
import type { ImpactView } from "../protocol.js";
import { takeDamage } from "./crits.js";
import { coverStrike } from "./field.js";
import { igniteAt } from "./flame.js";
import { blastClutter } from "./clutter.js";
import { burnTreeAt, worldToTile } from "./geo.js";
import { killGarrison, livingGarrison, woundGarrison } from "./garrison.js";
import { nextRand } from "./rng.js";
import { hideScout } from "./scout.js";
import type { Entity, MatchState } from "./types.js";

/** Caliber the blast counts as, for garrison wounds and the impact the clients draw. */
export const NUKE_CALIBER = 400;

/**
 * Share of the full blow at `dist` from ground zero: all of it inside the
 * core, falling off in a straight line to `edgeShare` at the outer edge, none past it.
 */
export function nukeFalloff(dist: number, core: number, radius: number): number {
  if (dist > radius) return 0;
  if (dist <= core) return 1;
  const u = (dist - core) / Math.max(1e-6, radius - core);
  return 1 - (1 - TITAN_NUKE.edgeShare) * u;
}

/** Largest footprint, in sub-tiles, the blast levels outright: two cells by two. */
export const NUKE_FLATTEN_FOOTPRINT = 8 * 8;
/** A hull with less front plate than this is light: a truck, a boat, a Walker, a gun. Tanks have far more. */
export const NUKE_LIGHT_ARMOR = 40;
/** A body wider than this is a ship, not a small unit. */
export const NUKE_SMALL_RADIUS = 16;

/**
 * Levelled outright anywhere inside the blast: soldiers, the drone, light
 * vehicles and small boats, and structures no bigger than two cells by two.
 * Tanks, big ships, and bigger buildings take the falloff damage instead.
 * Never the HQ, nor a bridge.
 */
export function nukeFlattens(o: Entity): boolean {
  if (isHq(o.type)) return false;
  if (o.kind === "building") return !isBridge(o.type) && o.tileW * o.tileH <= NUKE_FLATTEN_FOOTPRINT;
  if (isInfantryType(o.type) || !isArmoredType(o.type)) return true;
  const def = catalog(o.type);
  return def.armorFront < NUKE_LIGHT_ARMOR && def.radius <= NUKE_SMALL_RADIUS;
}

/** Every tree inside the blast burns down. */
function burnTreesInBlast(state: MatchState, x: number, y: number, radius: number): void {
  const ts = state.tileSize;
  const x0 = worldToTile(x - radius, ts);
  const y0 = worldToTile(y - radius, ts);
  const x1 = worldToTile(x + radius, ts);
  const y1 = worldToTile(y + radius, ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const cx = (tx + 0.5) * ts;
      const cy = (ty + 0.5) * ts;
      if (Math.hypot(cx - x, cy - y) <= radius) burnTreeAt(state, tx, ty);
    }
  }
}

/**
 * The Titan's reactor goes up where it stands: a small nuclear blast on the
 * ground. Everything in reach is hurt, friend or foe; trees, small buildings,
 * and small units are levelled outright. Planes high overhead are clear of it.
 */
export function detonateNuke(state: MatchState, src: Entity): void {
  const ts = state.tileSize;
  const radius = TITAN_NUKE.radiusTiles * ts;
  const core = TITAN_NUKE.coreTiles * ts;
  for (const o of [...state.entities.values()]) {
    if (o.id === src.id || o.hp <= 0 || o.garrisonedIn != null) continue;
    if (o.air && o.air.alt > 0.5) continue;
    const reach = o.kind === "building" ? radius + Math.min(o.tileW, o.tileH) * ts * 0.35 : radius + o.radius * 0.5;
    const d = Math.hypot(o.x - src.x, o.y - src.y);
    const fall = nukeFalloff(d, core, reach);
    if (fall <= 0) continue;
    if (nukeFlattens(o)) {
      // Nothing small is left standing: the men inside go with the walls.
      killGarrison(state, o);
      o.hp = 0;
      continue;
    }
    let dmg: number;
    if (o.kind === "building") {
      dmg = Math.round(TITAN_NUKE.buildingDamage * fall);
      if (isGarrisonable(o.type) && livingGarrison(state, o).length > 0) {
        woundGarrison(state, o, Math.round(TITAN_NUKE.damage * fall), NUKE_CALIBER);
      }
    } else if (isArmoredType(o.type) && !isInfantryType(o.type)) {
      dmg = Math.round(o.hpMax * TITAN_NUKE.armorShare * fall);
      if (o.garrison.length) woundGarrison(state, o, Math.round(TITAN_NUKE.damage * fall * 0.5), NUKE_CALIBER);
      hideScout(state, o);
    } else {
      dmg = Math.round(TITAN_NUKE.damage * fall);
    }
    if (o.kind === "unit") coverStrike(o, dmg, state.tick, true);
    else takeDamage(o, dmg, state.tick);
  }
  burnTreesInBlast(state, src.x, src.y, radius);
  blastClutter(state, src.x, src.y, radius);
  // The ground round ground zero is left burning.
  const spin = nextRand(state) * Math.PI * 2;
  igniteAt(state, src.x, src.y, src.ownerId);
  for (let i = 0; i < TITAN_NUKE.fires; i++) {
    const a = spin + (i / TITAN_NUKE.fires) * Math.PI * 2 + (nextRand(state) - 0.5) * 0.4;
    const r = core * (0.6 + nextRand(state) * 1.1);
    igniteAt(state, src.x + Math.cos(a) * r, src.y + Math.sin(a) * r, src.ownerId);
  }
  const impact: ImpactView = {
    id: state.nextId++,
    ownerId: src.ownerId,
    kind: "kill",
    fromId: src.id,
    x: src.x,
    y: src.y,
    vx: 0,
    vy: 0,
    caliber: NUKE_CALIBER,
    blast: true,
    nuke: true,
  };
  state.impacts.push(impact);
}
