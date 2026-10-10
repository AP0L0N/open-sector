import {
  BLAST_DIG_CALIBER,
  BLAST_DIG_ENABLED,
  BLAST_DIG_FLOOR,
  BLAST_DIG_PER_LEVEL,
  BOMB_CALIBER,
  BOMB_HOLE_SCALE,
  FIRE_RADIUS,
  GARRISON_STRUCTURAL_CALIBER,
  HEIGHT_STEP_MAX,
  isInfantryType,
  isSmokeShell,
  MAX_SCORCH_MARKS,
  PLASMA_FIRE_CALIBER,
  PLASMA_FIRE_SECONDS,
  PLASMA_FIRE_SHARE,
  PLASMA_SCORCH_MIN_RADIUS,
  PLASMA_SCORCH_SCALE,
  type ShellType,
} from "../catalog.js";
import { TILE_BLOCKED, TILE_MOUNTAIN, TILE_WATER } from "../maps.js";
import type { BloodStainView, ImpactKind, ImpactView } from "../protocol.js";
import { igniteAt } from "./flame.js";
import { burnTreeAt, burnTreesInDisk, fellTreesInDisk, inBounds, isWall, isWater, occupant, tileIndex, worldToTile } from "./geo.js";
import type { Entity, MatchState } from "./types.js";

/** Drop the oldest crater after this many so a long barrage stays bounded. */
export const MAX_SHELL_HOLES = 240;

/** World-pixel radius. A 75mm shell is about 14px; larger calibers scale up. */
export function shellHoleRadius(caliber: number): number {
  return (caliber / 75) * 14;
}

/** World-pixel radius of the scorch a Borg energy round of this caliber leaves. */
export function plasmaScorchRadius(caliber: number): number {
  return Math.max(PLASMA_SCORCH_MIN_RADIUS, shellHoleRadius(caliber) * PLASMA_SCORCH_SCALE);
}

/** Every Borg weapon is an energy weapon: bolts, pulses, and plasma, whatever kind of round the sim flies. */
export function energyRound(state: MatchState, ownerId: string): boolean {
  return state.players.get(ownerId)?.faction === "borg";
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

/**
 * Which charred collapse to play. Stable for a corpse id, so every client
 * shows the same one of the three, and a death does not move the match RNG.
 */
export function burnVariant(id: number): 0 | 1 | 2 {
  let s = (id >>> 0) || 1;
  s = Math.imul(s ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  return (s % 3) as 0 | 1 | 2;
}

/** Fallen soldier. Skips troops who died inside a building. Does not touch match RNG. */
export function leaveCorpse(state: MatchState, e: Entity): void {
  if (!isInfantryType(e.type) || e.garrisonedIn != null) return;
  const tx = worldToTile(e.x, state.tileSize);
  const ty = worldToTile(e.y, state.tileSize);
  const id = state.nextId++;
  const burned = e.fireDeath === true;
  state.bodies.push({
    id,
    type: e.type,
    ownerId: e.ownerId,
    x: e.x,
    y: e.y,
    facing: e.facing,
    bornTick: state.tick,
    blood: burned || isWater(state, tx, ty) ? [] : bloodAround(id, e.x, e.y),
    ...(burned ? { burned: true as const } : {}),
  });
}

function scarsGround(kind: ImpactKind): boolean {
  return kind === "miss" || kind === "puff";
}

/**
 * Water always splashes (bullets included). Dirt keeps a crater only for a
 * heavy shell that actually struck the ground — not smoke, armor sparks, or
 * a round that stopped on a building. A Borg energy round of any caliber
 * scorches the ground instead (`scorchGround`).
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
  const energy = energyRound(state, impact.ownerId);
  if (!energy && p.caliber < GARRISON_STRUCTURAL_CALIBER) return;
  if (isWall(state, tx, ty)) return;
  const occ = occupant(state, tx, ty);
  if (occ) {
    const blocker = state.entities.get(occ);
    if (blocker?.kind === "building") return;
  }
  if (energy) {
    scorchGround(state, impact, p.caliber, tx, ty);
    return;
  }
  // SC 250 scar: half the hole that caliber would dig.
  const craterScale = impact.bomb && p.caliber >= BOMB_CALIBER ? BOMB_HOLE_SCALE : 1;
  const radius = shellHoleRadius(p.caliber) * craterScale;
  state.holes.push({
    id: state.nextId++,
    x: impact.x,
    y: impact.y,
    radius,
    ang: impact.mortar ? 0 : Math.atan2(p.vy, p.vx),
    seed: impact.id,
    round: impact.mortar ? true : undefined,
  });
  fellTreesInDisk(state, impact.x, impact.y, radius);
  trimHoles(state, false, MAX_SHELL_HOLES);
  soakBlast(state, tx, ty, p.caliber);
}

/**
 * Plasma on dirt: nothing is dug and the ground does not sink. The heat chars a
 * patch sized to the round. From PLASMA_FIRE_CALIBER up it also burns the trees
 * inside the patch (and the one it landed in) and leaves a short fire at the heart.
 */
function scorchGround(state: MatchState, impact: ImpactView, caliber: number, tx: number, ty: number): void {
  const radius = plasmaScorchRadius(caliber);
  state.holes.push({
    id: state.nextId++,
    x: impact.x,
    y: impact.y,
    radius,
    ang: 0,
    seed: impact.id,
    round: true,
    scorch: true,
  });
  trimHoles(state, true, MAX_SCORCH_MARKS);
  // A rifle bolt only chars the ground: it stops in a tree at the trunk, and must not strip the woods.
  if (caliber < PLASMA_FIRE_CALIBER) return;
  burnTreesInDisk(state, impact.x, impact.y, radius);
  burnTreeAt(state, tx, ty);
  const fire = Math.min(FIRE_RADIUS, Math.max(3, radius * PLASMA_FIRE_SHARE));
  igniteAt(state, impact.x, impact.y, impact.ownerId, { radius: fire, life: PLASMA_FIRE_SECONDS });
}

/** Craters and scorches keep separate budgets, so a Borg rifle line cannot wipe out the shell holes. */
function trimHoles(state: MatchState, scorch: boolean, cap: number): void {
  let n = 0;
  for (const h of state.holes) if ((h.scorch === true) === scorch) n++;
  if (n <= cap) return;
  const i = state.holes.findIndex((h) => (h.scorch === true) === scorch);
  if (i >= 0) state.holes.splice(i, 1);
}

/** Ground a blast may sink: not water, a wall, a fortification, or under a building. */
function sinkable(state: MatchState, i: number): boolean {
  const kind = state.terrain[i];
  if (kind === TILE_WATER || kind === TILE_BLOCKED || kind === TILE_MOUNTAIN) return false;
  if ((state.fortBlock[i] ?? 0) !== 0) return false;
  const occ = state.occupy[i] ?? 0;
  return occ === 0 || state.entities.get(occ)?.kind !== "building";
}

function setDugHeight(state: MatchState, i: number, h: number): void {
  state.heights[i] = h;
  state.dug.set(i, h);
}

/**
 * Drop one tile a step, then lower every neighbour left more than
 * HEIGHT_STEP_MAX above it, outward, so the ground stays walkable and
 * repeated digs widen into a valley instead of a pit.
 */
function sinkTile(state: MatchState, start: number): void {
  const { width, height, heights } = state;
  setDugHeight(state, start, (heights[start] ?? 0) - 1);
  const queue = [start];
  while (queue.length > 0) {
    const c = queue.pop()!;
    const ch = heights[c] ?? 0;
    const cx = c % width;
    const cy = (c / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if ((heights[n] ?? 0) - ch <= HEIGHT_STEP_MAX || !sinkable(state, n)) continue;
        setDugHeight(state, n, ch + HEIGHT_STEP_MAX);
        queue.push(n);
      }
    }
  }
}

/**
 * Credit a heavy ground blast to its tile. Each BLAST_DIG_PER_LEVEL points
 * sink the tile one step, down to BLAST_DIG_FLOOR. Off with BLAST_DIG_ENABLED.
 * Returns whether the ground moved.
 */
export function soakBlast(state: MatchState, tx: number, ty: number, caliber: number): boolean {
  if (!BLAST_DIG_ENABLED || caliber < BLAST_DIG_CALIBER || !inBounds(state, tx, ty)) return false;
  const i = tileIndex(state, tx, ty);
  if (!sinkable(state, i)) return false;
  let points = (state.blast.get(i) ?? 0) + caliber;
  let sunk = false;
  while (points >= BLAST_DIG_PER_LEVEL && (state.heights[i] ?? 0) > BLAST_DIG_FLOOR) {
    sinkTile(state, i);
    points -= BLAST_DIG_PER_LEVEL;
    sunk = true;
  }
  if ((state.heights[i] ?? 0) <= BLAST_DIG_FLOOR) state.blast.delete(i);
  else state.blast.set(i, points);
  if (sunk) state.digRev++;
  return sunk;
}
