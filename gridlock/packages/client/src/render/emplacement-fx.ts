/**
 * How a crewed gun's shot looks on the field. Client-only: none of it changes who wins.
 * The Paks throw the field gun's blast cloud back round the pit and puff smoke at the muzzle.
 * The Flak keeps that back blast and the muzzle spark, and skips the front smoke.
 * The 88mm does all of it far bigger, and its shell strikes bigger too.
 */
import type { EntityType } from "@gridlock/shared";

export interface EmplacementShotLook {
  /** Radius handed to spawnFieldGunSmoke, world px: the blast cloud thrown back round the pit. */
  smoke: number;
  /** spawnMuzzleSmoke scale at the muzzle. Zero skips that front puff; the spark still fires. */
  muzzle: number;
}

export const EMPLACEMENT_SHOT_FX: Partial<Record<EntityType, EmplacementShotLook>> = {
  pak36: { smoke: 7, muzzle: 1.1 },
  pak43: { smoke: 17, muzzle: 2.4 },
  flak: { smoke: 8, muzzle: 0 },
};

/**
 * The Pak 43's shell and muzzle are drawn as if this many times the caliber: its spark,
 * fireball, dirt, and flash all read much bigger than a tank's 75.
 */
export const PAK43_FX_CALIBER_MUL = 1.8;

/** The look of a shot from `type`, or the Pak 36's when it has none of its own. */
export function emplacementShotLook(type: EntityType): EmplacementShotLook {
  return EMPLACEMENT_SHOT_FX[type] ?? EMPLACEMENT_SHOT_FX.pak36!;
}
