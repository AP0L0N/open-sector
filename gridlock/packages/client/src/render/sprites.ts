import sheetUrl from "../assets/units/trooper-walk.png";

/** Horizontal walk sheet: 8 square cells, subject facing right. */
export const TROOPER_WALK = {
  frames: 8,
  frameSize: 128,
  fps: 12,
  drawSize: 44,
} as const;

const sheet = new Image();
sheet.src = sheetUrl;

export function trooperSheetReady(): boolean {
  return sheet.complete && sheet.naturalWidth > 0;
}

export function drawTrooperSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  opts: { moving: boolean; id: number; now: number; size: number; flip?: boolean; feet?: boolean },
): boolean {
  if (!trooperSheetReady()) return false;
  const { frames, frameSize, fps } = TROOPER_WALK;
  const frame = opts.moving
    ? Math.floor((opts.now / 1000) * fps + opts.id * 0.37) % frames
    : 0;
  const flip = opts.flip ?? Math.cos(facing) < 0;
  const s = opts.size;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const oy = opts.feet ? -s + s * 0.08 : -s / 2;
  ctx.drawImage(sheet, frame * frameSize, 0, frameSize, frameSize, -s / 2, oy, s, s);
  ctx.restore();
  return true;
}
