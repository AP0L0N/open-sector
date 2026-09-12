import { isoDir8 } from "@gridlock/shared";
import trooperSheetUrl from "../assets/units/trooper-walk.png";

/** On-map draw size for infantry / unit sprites, iso pixels. */
export const UNIT_SPRITE_DRAW_SIZE = 22;

/** 8 dirs × N frames. Row = isoDir8, column = walk frame. Feet sit near the cell bottom. */
export interface UnitSpriteDef {
  image: HTMLImageElement;
  dirs: number;
  frames: number;
  frameSize: number;
  fps: number;
  drawSize: number;
}

function loadSheet(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

export const TROOPER_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperSheetUrl),
  dirs: 8,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
};

export function spriteReady(def: UnitSpriteDef): boolean {
  return def.image.complete && def.image.naturalWidth > 0;
}

export function drawUnitSprite(
  ctx: CanvasRenderingContext2D,
  def: UnitSpriteDef,
  x: number,
  y: number,
  isoDx: number,
  isoDy: number,
  opts: { moving: boolean; id: number; now: number },
): boolean {
  if (!spriteReady(def)) return false;
  const dir = isoDir8(isoDx, isoDy);
  const frame = opts.moving
    ? Math.floor((opts.now / 1000) * def.fps + opts.id * 0.37) % def.frames
    : 0;
  const s = def.drawSize;
  const cell = def.frameSize;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    def.image,
    frame * cell,
    dir * cell,
    cell,
    cell,
    x - s / 2,
    y - s + s * 0.1,
    s,
    s,
  );
  ctx.restore();
  return true;
}
