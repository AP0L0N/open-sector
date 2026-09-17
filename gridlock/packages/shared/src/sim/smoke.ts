import {
  SMOKE_HALF_ACROSS,
  SMOKE_HALF_ALONG,
  SMOKE_SECONDS,
} from "../catalog.js";
import { worldToTile } from "./geo.js";
import { nextRand } from "./rng.js";
import type { MatchState, SmokeCloud } from "./types.js";

export type SmokePuff = {
  /** Along-shot, -1..1 of the live ellipse. */
  u: number;
  /** Across-shot, -1..1 of the live ellipse. */
  v: number;
  size: number;
};

function puffRand(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Lasting-screen puff layout. Index 0 is always the impact. */
export function smokeCloudPuffs(seed: number, count = 18): SmokePuff[] {
  const n = Math.max(1, count | 0);
  const rand = puffRand(Math.imul(seed, 0x9e3779b9) + 1);
  const out: SmokePuff[] = [{ u: 0, v: 0, size: 1.22 }];
  for (let i = 1; i < n; i++) {
    const ang = rand() * Math.PI * 2;
    let r = Math.sqrt(rand());
    if (i < 5) r *= 0.42;
    else r = 0.22 + r * 0.78;
    out.push({
      u: Math.cos(ang) * r,
      v: Math.sin(ang) * r,
      size: 0.72 + rand() * 0.7,
    });
  }
  return out;
}

export function cloudScale(c: { life: number; lifeMax: number }): number {
  const t = c.lifeMax <= 0 ? 1 : Math.max(0, Math.min(1, c.life / c.lifeMax));
  return 0.55 + 0.45 * t;
}

export function inSmokeCloud(
  c: SmokeCloud,
  tileSize: number,
  tx: number,
  ty: number,
): boolean {
  const cx = worldToTile(c.x, tileSize);
  const cy = worldToTile(c.y, tileSize);
  const dx = tx - cx;
  const dy = ty - cy;
  const along = dx * c.ux + dy * c.uy;
  const across = -dx * c.uy + dy * c.ux;
  const a = Math.max(0.75, c.halfAlong * cloudScale(c));
  const b = Math.max(0.75, c.halfAcross * cloudScale(c));
  return (along * along) / (a * a) + (across * across) / (b * b) <= 1;
}

export function tileInSmoke(state: MatchState, tx: number, ty: number): boolean {
  return cloudsCoverTile(state.smokeClouds, state.tileSize, tx, ty);
}

export function cloudsCoverTile(
  clouds: readonly SmokeCloud[],
  tileSize: number,
  tx: number,
  ty: number,
): boolean {
  for (const c of clouds) {
    if (inSmokeCloud(c, tileSize, tx, ty)) return true;
  }
  return false;
}

/** Paint every smoked tile into `out` (0/1). Cheap when the screen is small. */
export function fillSmokeMask(
  clouds: readonly SmokeCloud[],
  tileSize: number,
  width: number,
  height: number,
  out: Uint8Array,
): void {
  out.fill(0);
  for (const c of clouds) {
    const cx = worldToTile(c.x, tileSize);
    const cy = worldToTile(c.y, tileSize);
    const scale = cloudScale(c);
    const a = Math.max(0.75, c.halfAlong * scale);
    const b = Math.max(0.75, c.halfAcross * scale);
    const reach = Math.ceil(Math.max(a, b)) + 1;
    const x0 = Math.max(0, cx - reach);
    const x1 = Math.min(width - 1, cx + reach);
    const y0 = Math.max(0, cy - reach);
    const y1 = Math.min(height - 1, cy + reach);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (inSmokeCloud(c, tileSize, x, y)) out[y * width + x] = 1;
      }
    }
  }
}

export function spawnSmokeCloud(
  state: MatchState,
  x: number,
  y: number,
  vx: number,
  vy: number,
): SmokeCloud {
  const sp = Math.hypot(vx, vy);
  const baseUx = sp > 1e-6 ? vx / sp : 1;
  const baseUy = sp > 1e-6 ? vy / sp : 0;
  const spin = (nextRand(state) - 0.5) * 0.9;
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  const cloud: SmokeCloud = {
    id: state.nextId++,
    x,
    y,
    ux: baseUx * cs - baseUy * sn,
    uy: baseUx * sn + baseUy * cs,
    halfAlong: SMOKE_HALF_ALONG * (0.88 + nextRand(state) * 0.28),
    halfAcross: SMOKE_HALF_ACROSS * (0.9 + nextRand(state) * 0.35),
    life: SMOKE_SECONDS,
    lifeMax: SMOKE_SECONDS,
  };
  state.smokeClouds.push(cloud);
  state.visionTick = -1;
  return cloud;
}

export function tickSmoke(state: MatchState, dt: number): void {
  if (state.smokeClouds.length === 0) return;
  const keep: SmokeCloud[] = [];
  let gone = false;
  for (const c of state.smokeClouds) {
    c.life -= dt;
    if (c.life > 0) keep.push(c);
    else gone = true;
  }
  state.smokeClouds = keep;
  if (gone || keep.length > 0) state.visionTick = -1;
}
