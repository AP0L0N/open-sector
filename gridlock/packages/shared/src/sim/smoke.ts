import {
  SMOKE_HALF_ACROSS,
  SMOKE_HALF_ALONG,
  SMOKE_SECONDS,
} from "../catalog.js";
import { worldToTile } from "./geo.js";
import type { MatchState, SmokeCloud } from "./types.js";

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

export function spawnSmokeCloud(
  state: MatchState,
  x: number,
  y: number,
  vx: number,
  vy: number,
): SmokeCloud {
  const sp = Math.hypot(vx, vy);
  const cloud: SmokeCloud = {
    id: state.nextId++,
    x,
    y,
    ux: sp > 1e-6 ? vx / sp : 1,
    uy: sp > 1e-6 ? vy / sp : 0,
    halfAlong: SMOKE_HALF_ALONG,
    halfAcross: SMOKE_HALF_ACROSS,
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
