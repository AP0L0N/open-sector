/**
 * How a crewed gun's shot looks on the field. Client-only: none of it changes who wins.
 * The Pak 36 throws the field gun's blast cloud back round the pit and puffs smoke at the muzzle.
 * The Pak 43 and the Flak keep that back blast and the muzzle spark, and skip the front smoke.
 * The 88mm's blast is far bigger, and its shell strikes bigger too.
 */
import { mountArcDegOf, type EntityType } from "@gridlock/shared";

export interface EmplacementShotLook {
  /** Radius handed to spawnFieldGunSmoke, world px: the blast cloud thrown back round the pit. */
  smoke: number;
  /** spawnMuzzleSmoke scale at the muzzle. Zero skips that front puff; the spark still fires. */
  muzzle: number;
}

export const EMPLACEMENT_SHOT_FX: Partial<Record<EntityType, EmplacementShotLook>> = {
  pak36: { smoke: 7, muzzle: 1.1 },
  pak43: { smoke: 17, muzzle: 0 },
  flak: { smoke: 8, muzzle: 0 },
};

/**
 * The Pak 43's shell and muzzle are drawn as if this many times the caliber: its spark,
 * fireball, dirt, and flash all read much bigger than a tank's 75.
 */
export const PAK43_FX_CALIBER_MUL = 1.8;

/**
 * Degrees either side of the way the Pak 43 was set that its cone shows, as wide as the Pak 36's.
 * Only a picture of where it was turned: the gun itself still lays all the way round.
 */
export const PAK43_FACING_CONE_DEG = 30;

/** Half-width of the cone a placed or selected gun shows: its traverse, or the Pak 43's facing cone. Null for none. */
export function facingConeDegOf(type: EntityType): number | null {
  return mountArcDegOf(type) ?? (type === "pak43" ? PAK43_FACING_CONE_DEG : null);
}

/** The look of a shot from `type`, or the Pak 36's when it has none of its own. */
export function emplacementShotLook(type: EntityType): EmplacementShotLook {
  return EMPLACEMENT_SHOT_FX[type] ?? EMPLACEMENT_SHOT_FX.pak36!;
}
