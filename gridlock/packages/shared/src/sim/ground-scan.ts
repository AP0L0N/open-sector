import {
  GROUND_SCAN_BASE,
  GROUND_SCAN_FOLD_SECONDS,
  GROUND_SCAN_MAX,
  GROUND_SCAN_OPEN_SECONDS,
  GROUND_SCAN_SIDE_TILES,
  TILE_SUBDIV,
} from "../catalog.js";
import { allies, worldToTile } from "./geo.js";
import type { GroundScan, MatchState } from "./types.js";

/**
 * Xenite Ground Scans. Something in orbit sweeps a square of ground and keeps it as bright as
 * day: night does not shorten the side's sight over it (sim/vision.ts reads `scanLightRects`).
 * It shows nothing by itself; an eye still has to look. A Xenite side holds GROUND_SCAN_BASE
 * from the start and one more per Hive Core level (Orbital Relay, Orbital Array). A scan goes
 * anywhere on the map. Moved, it folds into its centre first, then opens round the new one.
 * Runs with tickSpotlights.
 */

/** A tile box, both ends inside. */
export type ScanRect = { x0: number; y0: number; x1: number; y1: number };

/** Ground Scans `playerId` may hold now: none for a side that is not Xenite. */
export function groundScanSlots(state: MatchState, playerId: string): number {
  const p = state.players.get(playerId);
  if (!p || !p.alive || p.faction !== "xeno") return 0;
  // The relays answer to a standing Hive Core: none, no scan.
  let level = -1;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== "hivecore" || e.hp <= 0 || e.ruined) continue;
    level = Math.max(level, e.level ?? 0);
  }
  return level < 0 ? 0 : Math.min(GROUND_SCAN_MAX, GROUND_SCAN_BASE + level);
}

export type ScanResult = { ok: true } | { ok: false; reason: string };

/** Send scan `slot` to the world point (x, y): a fresh one opens there, a standing one folds away first. */
export function placeGroundScan(state: MatchState, playerId: string, slot: number, x: number, y: number): ScanResult {
  const p = state.players.get(playerId);
  if (!p) return { ok: false, reason: "No such player." };
  const slots = groundScanSlots(state, playerId);
  if (slots <= 0) return { ok: false, reason: "Only the Xenite scan from orbit." };
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots) return { ok: false, reason: "That Ground Scan is not in orbit yet." };
  const ts = state.tileSize;
  const to = {
    x: Math.min(state.width * ts - 1, Math.max(0, x)),
    y: Math.min(state.height * ts - 1, Math.max(0, y)),
  };
  const scans = (p.groundScans ??= []);
  const scan = scans.find((s) => s.slot === slot);
  if (!scan) {
    scans.push({ slot, x: to.x, y: to.y, open: 0, dir: 1 });
    scans.sort((a, b) => a.slot - b.slot);
    return { ok: true };
  }
  scan.to = to;
  scan.dir = -1;
  return { ok: true };
}

/** Open, fold and move every scan one step. A scan past the side's slots (its Hive Core lost a level) is taken away. */
export function tickGroundScans(state: MatchState, dt: number): void {
  const opening = dt / GROUND_SCAN_OPEN_SECONDS;
  const folding = dt / GROUND_SCAN_FOLD_SECONDS;
  for (const p of state.players.values()) {
    const scans = p.groundScans;
    if (!scans || scans.length === 0) continue;
    const slots = groundScanSlots(state, p.playerId);
    if (scans.some((s) => s.slot >= slots)) p.groundScans = scans.filter((s) => s.slot < slots);
    for (const s of p.groundScans!) stepScan(s, opening, folding);
  }
}

function stepScan(s: GroundScan, opening: number, folding: number): void {
  if (s.dir === -1) {
    s.open = Math.max(0, s.open - folding);
    if (s.open > 0) return;
    if (s.to) {
      s.x = s.to.x;
      s.y = s.to.y;
      s.to = undefined;
    }
    s.dir = 1;
    return;
  }
  if (s.dir === 1) {
    s.open = Math.min(1, s.open + opening);
    if (s.open >= 1) s.dir = 0;
  }
}

/**
 * The ground a scan lights now, in whole tiles: its square grows and shrinks a cell at a time,
 * so sight is not swept again on every tick of the fold. Null while folded away.
 */
export function scanRect(s: { x: number; y: number; open: number }, width: number, height: number, tileSize: number): ScanRect | null {
  const cells = Math.round((GROUND_SCAN_SIDE_TILES / TILE_SUBDIV) * Math.max(0, Math.min(1, s.open)));
  if (cells <= 0) return null;
  const side = cells * TILE_SUBDIV;
  const x0 = worldToTile(s.x, tileSize) - Math.floor(side / 2);
  const y0 = worldToTile(s.y, tileSize) - Math.floor(side / 2);
  const r = { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(width - 1, x0 + side - 1), y1: Math.min(height - 1, y0 + side - 1) };
  return r.x0 > r.x1 || r.y0 > r.y1 ? null : r;
}

/** Ground lit as day for `playerId`'s side: every allied scan. */
export function scanLightRects(state: MatchState, playerId: string): ScanRect[] {
  const out: ScanRect[] = [];
  for (const p of state.players.values()) {
    if (!p.groundScans || p.groundScans.length === 0 || !allies(state, playerId, p.playerId)) continue;
    for (const s of p.groundScans) {
      const r = scanRect(s, state.width, state.height, state.tileSize);
      if (r) out.push(r);
    }
  }
  return out;
}
