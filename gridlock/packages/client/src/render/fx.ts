import boomUrl from "../assets/fx/explosion.png";
import smokeUrl from "../assets/fx/smoke.png";

export interface FxSheet {
  image: HTMLImageElement;
  frames: number;
  frameSize: number;
}

function load(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

export const FX_BOOM: FxSheet = { image: load(boomUrl), frames: 8, frameSize: 96 };
export const FX_SMOKE: FxSheet = { image: load(smokeUrl), frames: 8, frameSize: 96 };

export function drawFxFrame(
  ctx: CanvasRenderingContext2D,
  sheet: FxSheet,
  frame: number,
  x: number,
  y: number,
  size: number,
  alpha = 1,
): void {
  if (!sheet.image.complete || sheet.image.naturalWidth <= 0) return;
  const i = ((frame % sheet.frames) + sheet.frames) % sheet.frames;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    sheet.image,
    i * sheet.frameSize,
    0,
    sheet.frameSize,
    sheet.frameSize,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
  ctx.restore();
}

export function fxFrameAt(ageMs: number, lifeMs: number, frames: number, loop: boolean): number {
  if (lifeMs <= 0) return 0;
  const t = Math.max(0, ageMs / lifeMs);
  if (loop) return Math.floor(t * frames) % frames;
  return Math.min(frames - 1, Math.floor(t * frames));
}
