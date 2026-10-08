import { TITAN_NUKE, isArmoredType, isGarrisonable, isInfantryType } from "../catalog.js";
import type { ImpactView } from "../protocol.js";
import { takeDamage } from "./crits.js";
import { coverStrike } from "./field.js";
import { igniteAt } from "./flame.js";
import { livingGarrison, woundGarrison } from "./garrison.js";
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

/**
 * The Titan's reactor goes up where it stands: a small nuclear blast on the
 * ground. Everything in reach is hurt, friend or foe, and the walls of a
 * house are no help to the men inside. Planes high overhead are clear of it.
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
