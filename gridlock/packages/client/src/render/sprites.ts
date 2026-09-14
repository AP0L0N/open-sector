import { isoDirIndex, type EntityType } from "@gridlock/shared";
import coreUrl from "../assets/buildings/core.png";
import dynamoUrl from "../assets/buildings/dynamo.png";
import smelterUrl from "../assets/buildings/smelter.png";
import musterUrl from "../assets/buildings/muster.png";
import armoryUrl from "../assets/buildings/armory.png";
import trooperSheetUrl from "../assets/units/trooper-walk.png";
import haulerSheetUrl from "../assets/units/hauler-move.png";
import wardenSheetUrl from "../assets/units/warden-move.png";
import rigSheetUrl from "../assets/units/rig-move.png";

/** Extra on-map scale for every unit (sprites and iso-box fallbacks). */
export const UNIT_VISUAL_SCALE = 1.25;

/** On-map draw size for infantry sprites, iso pixels. */
export const UNIT_SPRITE_DRAW_SIZE = Math.round(22 * UNIT_VISUAL_SCALE);

/** Dirs × N frames. Row = isoDirIndex, column = walk/move frame. */
export interface UnitSpriteDef {
  image: HTMLImageElement;
  dirs: number;
  frames: number;
  frameSize: number;
  fps: number;
  drawSize: number;
  /** Fraction from the top of the cell that sits on the ground point (feet/tracks/hull). */
  contactY: number;
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
  contactY: 0.9,
};

export const WARDEN_SPRITE: UnitSpriteDef = {
  image: loadSheet(wardenSheetUrl),
  dirs: 8,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(44 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
};

export const HAULER_SPRITE: UnitSpriteDef = {
  image: loadSheet(haulerSheetUrl),
  dirs: 8,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(38 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
};

export const RIG_SPRITE: UnitSpriteDef = {
  image: loadSheet(rigSheetUrl),
  dirs: 8,
  frames: 1,
  frameSize: 192,
  fps: 6,
  drawSize: Math.round(64 * UNIT_VISUAL_SCALE),
  contactY: 0.9,
};

const UNIT_SPRITES: Partial<Record<EntityType, UnitSpriteDef>> = {
  trooper: TROOPER_SPRITE,
  hauler: HAULER_SPRITE,
  warden: WARDEN_SPRITE,
  rig: RIG_SPRITE,
};

export function spriteFor(type: EntityType): UnitSpriteDef | undefined {
  return UNIT_SPRITES[type];
}

/** Iso building art. Pad metrics map the concrete diamond onto the tile footprint. */
export interface BuildingSpriteDef {
  image: HTMLImageElement;
  /** Source pixel width of the isometric pad (west corner to east corner). */
  padWidth: number;
  /** Source pixel of the pad's south (nearest) corner. */
  padSouthX: number;
  padSouthY: number;
}

function building(
  src: string,
  padWidth: number,
  padSouthX: number,
  padSouthY: number,
): BuildingSpriteDef {
  return { image: loadSheet(src), padWidth, padSouthX, padSouthY };
}

const BUILDING_SPRITES: Partial<Record<EntityType, BuildingSpriteDef>> = {
  core: building(coreUrl, 383, 192.5, 390),
  dynamo: building(dynamoUrl, 384, 194, 291),
  armory: building(armoryUrl, 384, 194.5, 310),
  muster: building(musterUrl, 385, 194.5, 333),
  smelter: building(smelterUrl, 384, 194, 393),
};

export function buildingSpriteFor(type: EntityType): BuildingSpriteDef | undefined {
  return BUILDING_SPRITES[type];
}

export function spriteReady(def: { image: HTMLImageElement }): boolean {
  return def.image.complete && def.image.naturalWidth > 0;
}

export function drawBuildingSprite(
  ctx: CanvasRenderingContext2D,
  def: BuildingSpriteDef,
  southX: number,
  southY: number,
  footprintW: number,
): boolean {
  if (!spriteReady(def)) return false;
  const scale = footprintW / def.padWidth;
  const dw = def.image.naturalWidth * scale;
  const dh = def.image.naturalHeight * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(def.image, southX - def.padSouthX * scale, southY - def.padSouthY * scale, dw, dh);
  ctx.restore();
  return true;
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
  const dir = isoDirIndex(isoDx, isoDy, def.dirs) % def.dirs;
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
    y - s * def.contactY,
    s,
    s,
  );
  ctx.restore();
  return true;
}
