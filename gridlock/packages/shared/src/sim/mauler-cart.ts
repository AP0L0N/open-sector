/** Mauler scrap cart. Shells strip it. Small arms do not. */

import { GARRISON_STRUCTURAL_CALIBER } from "../catalog.js";
import type { ShellType } from "../catalog.js";
import type { ArmorFace } from "./ballistics.js";
import type { Entity } from "./types.js";

export interface CartStrike {
  caliber: number;
  /** Shell damage before armor. The cart is not the hull plate. */
  damage: number;
  shell: ShellType | null;
  flight?: "mortar";
  face: ArmorFace | "none";
  kind: string;
}

/**
 * A shell that is not a front-plate ricochet tears the hitch cart.
 * Mortar bombs fall on the whole vehicle, so they always count.
 * The blade catches a frontal glance and the cart stays on.
 */
export function damageMaulerCart(e: Entity, hit: CartStrike): void {
  if (e.type !== "hauler" || e.wreck || e.cartHp <= 0) return;
  if (hit.caliber < GARRISON_STRUCTURAL_CALIBER) return;
  if (hit.shell === "smoke" || hit.damage <= 0) return;
  const frontGlance = hit.face === "front" && hit.kind === "ricochet" && hit.flight !== "mortar";
  if (frontGlance) return;
  const dmg = Math.max(1, Math.round(hit.damage));
  e.cartHp = Math.max(0, e.cartHp - dmg);
  if (e.cartHp > 0) return;
  e.cargo = 0;
  e.harvestTile = null;
  e.harvestTime = 0;
  e.order = null;
  e.waypoints = [];
  e.attackTarget = null;
  e.returnToBase = false;
}
