import {
  GARRISON_STRUCTURAL_CALIBER,
  isInfantryType,
  isSmokeShell,
  type ShellType,
} from "../catalog.js";
import type { BloodStainView, ImpactKind, ImpactView } from "../protocol.js";
import { inBounds, isWall, isWater, occupant, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/** Drop the oldest crater after this many so a long barrage stays bounded. */
export const MAX_SHELL_HOLES = 240;

/** World-pixel radius. A 75mm shell is about 14px; larger calibers scale up. */
export function shellHoleRadius(caliber: number): number {
  return (caliber / 75) * 14;
}

function stainRand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function bloodAround(id: number, x: number, y: number): BloodStainView[] {
  const rnd = stainRand(id * 17 + 0x5eed);
  const n = 4 + Math.floor(rnd() * 4);
  const stains = [];
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = 3 + rnd() * 9;
    const rx = 1.15 + rnd() * 1.7;
    stains.push({
      x: x + Math.cos(ang) * dist,
      y: y + Math.sin(ang) * dist,
      rx,
      ry: rx * (0.42 + rnd() * 0.28),
      rot: rnd() * Math.PI,
    });
  }
  return stains;
}

/** Fallen soldier. Skips troops who died inside a building. Does not touch match RNG. */
export function leaveCorpse(state: MatchState, e: Entity): void {
  if (!isInfantryType(e.type) || e.garrisonedIn != null) return;
  const tx = worldToTile(e.x, state.tileSize);
  const ty = worldToTile(e.y, state.tileSize);
  const id = state.nextId++;
  state.bodies.push({
    id,
    type: e.type,
    ownerId: e.ownerId,
    x: e.x,
    y: e.y,
    facing: e.facing,
    bornTick: state.tick,
    blood: isWater(state, tx, ty) ? [] : bloodAround(id, e.x, e.y),
  });
}

function scarsGround(kind: ImpactKind): boolean {
  return kind === "miss" || kind === "puff";
}

/**
 * Water always splashes (bullets included). Dirt keeps a crater only for a
 * heavy shell that actually struck the ground — not smoke, armor sparks, or
 * a round that stopped on a building.
 */
export function noteImpactSurface(
  state: MatchState,
  impact: ImpactView,
  p: { caliber: number; shell: ShellType | null; vx: number; vy: number },
  kind: ImpactKind,
): void {
  if (kind === "ricochet" || kind === "crush") return;
  if (isSmokeShell(p.shell)) return;
  const tx = worldToTile(impact.x, state.tileSize);
  const ty = worldToTile(impact.y, state.tileSize);
  if (!inBounds(state, tx, ty)) return;
  if (isWater(state, tx, ty)) {
    impact.splash = true;
    return;
  }
  if (!scarsGround(kind)) return;
  if (p.caliber < GARRISON_STRUCTURAL_CALIBER) return;
  if (isWall(state, tx, ty)) return;
  const occ = occupant(state, tx, ty);
  if (occ) {
    const blocker = state.entities.get(occ);
    if (blocker?.kind === "building") return;
  }
  state.holes.push({
    id: state.nextId++,
    x: impact.x,
    y: impact.y,
    radius: shellHoleRadius(p.caliber),
    ang: Math.atan2(p.vy, p.vx),
    seed: impact.id,
  });
  if (state.holes.length > MAX_SHELL_HOLES) state.holes.shift();
}
