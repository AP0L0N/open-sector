/**
 * Occupants of a selected house, hull, truck, or transport.
 * Friendly snapshots carry the soldiers; an enemy host stays anonymous.
 */
import {
  primaryInfantryGun,
  supplyDrumOf,
  type EntityType,
  type EntityView,
} from "@gridlock/shared";
import { ammoBarRatios } from "../render/ammo-bars.js";

export type RosterTone = "ok" | "mid" | "low";

export interface GarrisonSeat {
  id: number;
  type: EntityType;
  /** 0–1 of hpMax. */
  hp: number;
  tone: RosterTone;
  /** Yellow bar first, then the secondary store. At most two. */
  ammo: number[];
}

type RosterUnit = Pick<
  EntityView,
  | "id"
  | "type"
  | "hp"
  | "hpMax"
  | "garrisonedIn"
  | "wreck"
  | "ammo"
  | "mgAmmo"
  | "clip"
  | "rockets"
  | "heavy"
  | "supply"
  | "jet"
>;

/** Same bands as the map health bar. */
export function rosterHpTone(hp: number, hpMax: number): RosterTone {
  const ratio = hpMax > 0 ? hp / hpMax : 0;
  if (ratio > 0.45) return "ok";
  if (ratio > 0.2) return "mid";
  return "low";
}

/**
 * Map ammo strips, plus an infantry magazine the map leaves off while it reloads.
 * A drum the map already shows (Pyro fuel, cyborg) is not added twice.
 */
export function rosterAmmoRatios(e: Omit<RosterUnit, "id" | "hp" | "hpMax" | "garrisonedIn">): number[] {
  const bars = ammoBarRatios(e);
  const gun = primaryInfantryGun(e.type);
  if (!gun || gun.clip <= 0 || supplyDrumOf(e.type) > 0 || e.clip == null) return bars;
  const mag = Math.max(0, Math.min(1, e.clip / gun.clip));
  return [mag, ...bars].slice(0, 2);
}

/** Living friendlies whose `garrisonedIn` is one of the selected hosts, oldest id first. */
export function garrisonRoster(entities: readonly RosterUnit[], hostIds: ReadonlySet<number>): GarrisonSeat[] {
  if (hostIds.size === 0) return [];
  const out: GarrisonSeat[] = [];
  for (const e of entities) {
    if (e.garrisonedIn == null || !hostIds.has(e.garrisonedIn)) continue;
    if (e.wreck || e.hp <= 0) continue;
    const hp = e.hpMax > 0 ? Math.max(0, Math.min(1, e.hp / e.hpMax)) : 0;
    out.push({
      id: e.id,
      type: e.type,
      hp,
      tone: rosterHpTone(e.hp, e.hpMax),
      ammo: rosterAmmoRatios(e),
    });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}
