import {
  colorHex,
  heightAt,
  isoLift,
  tileDiamond,
  worldToIso,
  type IsoPt,
  type MapDef,
  type Slot,
} from "@gridlock/shared";
import { scrapFromMapTiles, terrainFor } from "../render/terrain.js";

/** Readable ink on a player swatch. */
function inkOn(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 140 ? "#140e0a" : "#fff4dc";
}

/**
 * Isometric thumbnail of a map: baked ground, houses, and each start drawn as
 * a numbered marker. A start a commander holds takes their color.
 */
export function drawMapPreview(canvas: HTMLCanvasElement, map: MapDef, slots: readonly Slot[] = []): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(0, 0, w, h);
  const bake = terrainFor(map, scrapFromMapTiles(map));
  const scale = Math.min(w / bake.width, h / bake.height) * 0.94;
  const ox = (w - bake.width * scale) / 2;
  const oy = (h - bake.height * scale) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(bake.canvas, ox, oy, bake.width * scale, bake.height * scale);
  const to = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: (p.x - bake.originX) * scale + ox,
    y: (p.y - bake.originY) * scale + oy,
  });
  const lift = (p: IsoPt, z: number): IsoPt => to({ x: p.x, y: p.y - z });
  for (const f of map.features ?? []) {
    const d = tileDiamond(f.x, f.y, map.tileSize);
    const ez = 6;
    ctx.fillStyle = "#b08968";
    ctx.beginPath();
    ctx.moveTo(lift(d.n, ez).x, lift(d.n, ez).y);
    ctx.lineTo(lift(d.e, ez).x, lift(d.e, ez).y);
    ctx.lineTo(lift(d.s, 0).x, lift(d.s, 0).y);
    ctx.lineTo(lift(d.w, 0).x, lift(d.w, 0).y);
    ctx.closePath();
    ctx.fill();
  }
  const r = Math.max(7, Math.min(11, Math.round(Math.min(w, h) / 22)));
  ctx.font = `700 ${Math.round(r * 1.25)}px "Share Tech Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const spawn of map.spawns) {
    const occupant = slots.find((s) => (s.status === "human" || s.status === "ai") && s.spawnId === spawn.id);
    const iso = worldToIso((spawn.x + 0.5) * map.tileSize, (spawn.y + 0.5) * map.tileSize, map.tileSize);
    const p = to({ x: iso.x, y: iso.y - isoLift(heightAt(map, spawn.x, spawn.y)) });
    const fill = occupant ? colorHex(occupant.colorId) : "#140e0a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = occupant ? "#000" : "#e8b84a";
    ctx.stroke();
    ctx.fillStyle = occupant ? inkOn(fill) : "#e8b84a";
    ctx.fillText(String(spawn.id), p.x, p.y + 1);
  }
}
