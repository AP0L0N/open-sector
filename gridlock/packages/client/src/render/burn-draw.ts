import { burnDeathPose, burnFallAgeMs } from "./burn-death.js";
import { drawBodyFlames, drawEmbers } from "./flame-fx.js";
import { heldFrame } from "./infantry-visual.js";
import { drawPropSprite, drawUnitSprite, groveFaces, type UnitSpriteDef } from "./sprites.js";
import { treeBurnPose, type TreeStamp } from "./tree-burn.js";

/** Blackened soldier in the flames, then one of the three collapses, then a dark body. */
export function drawBurnedCorpse(
  ctx: CanvasRenderingContext2D,
  stand: UnitSpriteDef,
  die: UnitSpriteDef,
  x: number,
  y: number,
  isoDx: number,
  isoDy: number,
  facing: number,
  ageMs: number,
  variant: 0 | 1 | 2,
  id: number,
  now: number,
): void {
  const pose = burnDeathPose(ageMs, variant);
  const sheet = pose.phase === "burn" ? stand : die;
  const frameIndex = pose.phase === "burn" ? 0 : heldFrame(burnFallAgeMs(pose.fallT, die.fps, die.frames), die.fps, die.frames);
  const wobble = pose.phase === "burn" ? Math.sin(now * 0.018 + id) * 0.04 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pose.rot + wobble);
  ctx.translate(0, pose.sink);
  ctx.filter = `brightness(${pose.brightness}) sepia(${pose.sepia}) saturate(0.4)`;
  drawUnitSprite(ctx, sheet, 0, 0, isoDx, isoDy, {
    moving: false,
    id,
    now: 0,
    frameIndex,
    facing,
  });
  ctx.restore();
  if (pose.heat > 0.04) {
    const size = stand.drawSize;
    const ox = (variant - 1) * size * 0.14;
    drawBodyFlames(ctx, x + ox, y - size * (variant === 2 ? 0.22 : 0.12), size * (variant === 2 ? 1.12 : 0.92), pose.heat, now, id);
  }
}

/** The trunk that just caught. `stamp` is null for a canopy tile that never had its own sprite. */
export function drawBurningTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stamp: TreeStamp | null,
  t: number,
  seed: number,
  now: number,
): void {
  const pose = treeBurnPose(t, seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pose.rot);
  ctx.translate(0, pose.drop);
  ctx.globalAlpha = Math.max(0, pose.alpha);
  if (stamp) {
    const faces = groveFaces(stamp.tile, stamp.pine);
    const spr = faces[stamp.face % faces.length];
    ctx.filter = `brightness(${pose.brightness}) sepia(${pose.sepia}) saturate(0.55)`;
    if (spr) drawPropSprite(ctx, spr, 0, 0, stamp.drawH, false);
  } else {
    ctx.fillStyle = `rgba(28, 18, 12, ${0.8 * pose.alpha})`;
    ctx.fillRect(-3, -18, 6, 18);
  }
  ctx.restore();
  if (pose.heat > 0.04) {
    const h = (stamp?.drawH ?? 28) * pose.flame;
    drawBodyFlames(ctx, x, y - h * 0.35, h, pose.heat, now, seed);
    drawEmbers(ctx, x, y - h * 0.5, h * 0.2, pose.heat, now, seed);
  }
}
