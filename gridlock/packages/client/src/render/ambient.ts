/**
 * The ambient layer: a quiet bed of engines, rotors, tracks, and footsteps for
 * whatever is moving near the view, selected or not. Pure: which units move, which
 * bed each belongs to, and how loud and where each bed sits. `game-audio.ts` plays it.
 */
import { isAircraftType, isInfantryType, isNavalType, type EntityView } from "@gridlock/shared";
import type { SpatialMix } from "../ui/spatial-sfx.js";

export type AmbientKind = "air" | "naval" | "armor" | "wheeled" | "mech";
export const AMBIENT_KINDS: readonly AmbientKind[] = ["air", "naval", "armor", "wheeled", "mech"];

const MECH = new Set(["walker", "titan", "mammoth"]);
const WHEELED = new Set(["supply", "nebelwerfer", "artillery", "rig", "hauler"]);
/** Bodies that fly or swim but have their own sound, or none. */
const NO_BED = new Set(["drone", "torpedo"]);

export function ambientKind(type: string): AmbientKind | null {
  if (NO_BED.has(type) || isInfantryType(type as EntityView["type"])) return null;
  if (isAircraftType(type as EntityView["type"])) return "air";
  if (isNavalType(type as EntityView["type"])) return "naval";
  if (MECH.has(type)) return "mech";
  if (WHEELED.has(type)) return "wheeled";
  return "armor";
}

export interface Mover {
  kind: AmbientKind;
  x: number;
  y: number;
}

/** A unit counts as moving when it shifted at all since the last snapshot. */
const MOVE_EPS = 1e-3;

export function movers(prevById: ReadonlyMap<number, EntityView>, entities: readonly EntityView[]): Mover[] {
  const out: Mover[] = [];
  for (const e of entities) {
    if (e.kind !== "unit" || e.wreck || e.garrisonedIn) continue;
    const kind = ambientKind(e.type);
    if (!kind) continue;
    const p = prevById.get(e.id);
    if (!p || Math.hypot(e.x - p.x, e.y - p.y) < MOVE_EPS) continue;
    out.push({ kind, x: e.x, y: e.y });
  }
  return out;
}

/** Each bed's top level, before the SFX volume. The layer sits under every other sound. */
export const AMBIENT_LEVEL: Record<AmbientKind, number> = {
  air: 0.16,
  naval: 0.13,
  armor: 0.14,
  wheeled: 0.1,
  mech: 0.14,
};

export interface BedMix {
  level: number;
  pan: number;
}

/**
 * Loudness and stereo place of each bed. Many movers grow a bed by power sum
 * (two tanks are not twice as loud as one), capped at the bed's top level.
 */
export function ambientMix(list: readonly Mover[], mixAt: (x: number, y: number) => SpatialMix | null): Record<AmbientKind, BedMix> {
  const acc = Object.fromEntries(AMBIENT_KINDS.map((k) => [k, { power: 0, pan: 0, weight: 0 }])) as Record<
    AmbientKind,
    { power: number; pan: number; weight: number }
  >;
  for (const m of list) {
    const mix = mixAt(m.x, m.y);
    if (!mix) continue;
    const a = acc[m.kind];
    a.power += mix.gain * mix.gain;
    a.pan += mix.pan * mix.gain;
    a.weight += mix.gain;
  }
  const out = {} as Record<AmbientKind, BedMix>;
  for (const k of AMBIENT_KINDS) {
    const a = acc[k];
    out[k] = {
      level: Math.min(1, Math.sqrt(a.power)) * AMBIENT_LEVEL[k],
      pan: a.weight > 0 ? a.pan / a.weight : 0,
    };
  }
  return out;
}
