import { isoDirIndex, type Crit, type EntityType } from "@gridlock/shared";
import coreUrl from "../assets/buildings/core.png";
import dynamoUrl from "../assets/buildings/dynamo.png";
import smelterUrl from "../assets/buildings/smelter.png";
import musterUrl from "../assets/buildings/muster.png";
import armoryUrl from "../assets/buildings/armory.png";
import trooperSheetUrl from "../assets/units/trooper-walk.png";
import haulerSheetUrl from "../assets/units/hauler-move.png";
import wardenHullUrl from "../assets/units/warden-hull.png";
import wardenTurretUrl from "../assets/units/warden-turret.png";
import rigSheetUrl from "../assets/units/rig-move.png";
import armIconUrl from "../assets/status/arm.png";
import legIconUrl from "../assets/status/leg.png";
import tracksIconUrl from "../assets/status/tracks.png";
import engineIconUrl from "../assets/status/engine.png";

/** Extra on-map scale for every unit (sprites and iso-box fallbacks). */
export const UNIT_VISUAL_SCALE = 1.25;

/** On-map draw size for infantry sprites, iso pixels. */
export const UNIT_SPRITE_DRAW_SIZE = Math.round(22 * UNIT_VISUAL_SCALE);

/** Optional independently-aimed gun drawn on top of the hull sheet. */
export interface TurretSpriteDef {
  image: HTMLImageElement;
  dirs: number;
  frames: number;
  frameSize: number;
}

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
  turret?: TurretSpriteDef;
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
  image: loadSheet(wardenHullUrl),
  dirs: 8,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(44 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  turret: {
    image: loadSheet(wardenTurretUrl),
    dirs: 8,
    frames: 1,
    frameSize: 128,
  },
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

const CRIT_ICONS: Record<Crit, HTMLImageElement> = {
  arm: loadSheet(armIconUrl),
  leg: loadSheet(legIconUrl),
  tracks: loadSheet(tracksIconUrl),
  engine: loadSheet(engineIconUrl),
};

export function critIcon(c: Crit): HTMLImageElement {
  return CRIT_ICONS[c];
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
  opts: {
    moving: boolean;
    id: number;
    now: number;
    turretDx?: number;
    turretDy?: number;
  },
): boolean {
  if (!spriteReady(def)) return false;
  const dir = isoDirIndex(isoDx, isoDy, def.dirs) % def.dirs;
  const frame = opts.moving
    ? Math.floor((opts.now / 1000) * def.fps + opts.id * 0.37) % def.frames
    : 0;
  const s = def.drawSize;
  const cell = def.frameSize;
  const dx = x - s / 2;
  const dy = y - s * def.contactY;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(def.image, frame * cell, dir * cell, cell, cell, dx, dy, s, s);
  const turret = def.turret;
  if (turret && spriteReady(turret)) {
    const tdx = opts.turretDx ?? isoDx;
    const tdy = opts.turretDy ?? isoDy;
    const tdir = isoDirIndex(tdx, tdy, turret.dirs) % turret.dirs;
    const tframe = turret.frames > 1 ? frame % turret.frames : 0;
    const tcell = turret.frameSize;
    ctx.drawImage(turret.image, tframe * tcell, tdir * tcell, tcell, tcell, dx, dy, s, s);
  }
  ctx.restore();
  return true;
}
