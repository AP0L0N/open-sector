import { MAWCASTER_AIR_BALL, MAWCASTER_AIR_RANGE_TILES, MAWCASTER_CELL, NEUTRAL_OWNER, ROOF_FLAK_TURN_DEG_PER_SEC } from "../catalog.js";
import { launchRocket } from "./combat.js";
import { muzzleHeight } from "./elevation.js";
import { resumeShots } from "./hive-ammo.js";
import { fairGame, mountValue } from "./mothership.js";
import { nextRand } from "./rng.js";
import type { Entity, MatchState, MothershipGun } from "./types.js";

/**
 * The Flak Maw (catalog ROOF_FLAK_*, research "flakmaw"): a small anti-air maw on a Fusion Core's
 * roof. It is the Mothership's flak mount on the ground: the Mawcaster's maw on Air attacks
 * (MAWCASTER_AIR_BALL), on the Mawcaster's cell. It lays itself on the best flier its side can
 * see in reach, the one it holds first, and leaves the ground alone. The balls leave from the
 * roof as the Mawcaster's own (launcher "mawcaster"), so they home on a flier and burst at its height.
 */

/** A fresh Flak Maw: its cell full, laid on `facing`. */
export function newRoofFlak(facing: number): MothershipGun {
  return { facing, cooldown: 0, energy: MAWCASTER_CELL.shots, drained: false, targetId: null, salvo: 0 };
}

function angleOff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function canDraw(gun: MothershipGun): boolean {
  return !gun.drained && gun.energy >= 1;
}

function live(e: Entity): boolean {
  return e.hp > 0 && !e.wreck && !e.ruined && !e.unpowered && e.ownerId !== NEUTRAL_OWNER;
}

/** The flier the maw lays on: the one it holds while it still may, else the nearest in reach. */
function pick(state: MatchState, e: Entity, gun: MothershipGun, reach: number): Entity | undefined {
  const ok = (o: Entity) => mountValue("flak", o, false) > 0 && fairGame(state, e, o) && Math.hypot(o.x - e.x, o.y - e.y) <= reach;
  if (gun.targetId != null) {
    const held = state.entities.get(gun.targetId);
    if (held && ok(held)) return held;
  }
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (Math.abs(o.x - e.x) > reach || Math.abs(o.y - e.y) > reach || o.hp <= 0) continue;
    if (!ok(o)) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** One launch of the salvo, the Mawcaster's ripple on Air attacks, then its reload. */
function fire(state: MatchState, e: Entity, gun: MothershipGun, t: Entity, reach: number): void {
  const rack = MAWCASTER_AIR_BALL;
  if (gun.salvo <= 0) gun.salvo = rack.salvo;
  const most = rack.volleyMax ?? 1;
  const volley = Math.max(1, Math.min(most > 1 ? 1 + Math.floor(nextRand(state) * most) : 1, gun.salvo));
  const dist = Math.hypot(t.x - e.x, t.y - e.y);
  const z = muzzleHeight(state, e);
  for (let i = 0; i < volley && canDraw(gun); i++) {
    const side = ((((gun.salvo - 1) % 4) - 1.5) / 1.5) * 3;
    launchRocket(state, e, rack, t.x, t.y, reach, dist, t, side, { x: e.x, y: e.y, z, launcher: "mawcaster", airRack: true, forced: false });
    gun.energy = Math.max(0, gun.energy - 1);
    if (gun.energy < 1) gun.drained = true;
    gun.salvo--;
    if (gun.salvo <= 0) break;
  }
  const jitter = (rack.intervalJitter ?? 0) > 0 ? nextRand(state) * (rack.intervalJitter ?? 0) : 0;
  gun.cooldown = gun.salvo > 0 && canDraw(gun) ? rack.interval + jitter : rack.reload;
  if (!canDraw(gun)) gun.salvo = 0;
  gun.firedTick = state.tick;
}

/** Sim phase: every Flak Maw's cell regrows, and each lays and fires on its own. */
export function tickRoofFlak(state: MatchState, dt: number): void {
  const reach = MAWCASTER_AIR_RANGE_TILES * state.tileSize;
  for (const e of state.entities.values()) {
    const gun = e.roofFlak;
    if (!gun || e.kind !== "building") continue;
    if (gun.cooldown > 0) gun.cooldown = Math.max(0, gun.cooldown - dt);
    gun.energy = Math.min(MAWCASTER_CELL.shots, gun.energy + dt / MAWCASTER_CELL.rechargeSeconds);
    if (gun.drained && gun.energy >= resumeShots(MAWCASTER_CELL.shots)) gun.drained = false;
    if (!live(e)) {
      gun.targetId = null;
      gun.salvo = 0;
      continue;
    }
    const t = pick(state, e, gun, reach);
    gun.targetId = t?.id ?? null;
    if (!t) {
      gun.salvo = 0;
      continue;
    }
    const want = Math.atan2(t.y - e.y, t.x - e.x);
    const off = angleOff(want, gun.facing);
    const step = ((ROOF_FLAK_TURN_DEG_PER_SEC * Math.PI) / 180) * dt;
    gun.facing = Math.abs(off) <= step ? want : gun.facing + Math.sign(off) * step;
    if (gun.cooldown > 0 || !canDraw(gun)) continue;
    if (Math.abs(angleOff(want, gun.facing)) > ((MAWCASTER_AIR_BALL.arcDeg ?? 30) * Math.PI) / 180) continue;
    fire(state, e, gun, t, reach);
  }
}
