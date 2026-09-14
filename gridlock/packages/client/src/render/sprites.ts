import { isoDirIndex, type Crit, type EntityType, type Stance } from "@gridlock/shared";
import coreUrl from "../assets/buildings/core.png";
import dynamoUrl from "../assets/buildings/dynamo.png";
import smelterUrl from "../assets/buildings/smelter.png";
import musterUrl from "../assets/buildings/muster.png";
import armoryUrl from "../assets/buildings/armory.png";
import cottageUrl from "../assets/buildings/cottage.png";
import houseUrl from "../assets/buildings/house.png";
import manorUrl from "../assets/buildings/manor.png";
import oakUrl from "../assets/terrain/tree-oak.png";
import pineUrl from "../assets/terrain/tree-pine.png";
import scrapAUrl from "../assets/terrain/scrap-a.png";
import bushAUrl from "../assets/terrain/bush-a.png";
import bushBUrl from "../assets/terrain/bush-b.png";
import waterUrl from "../assets/terrain/water.png";
import waterBUrl from "../assets/terrain/water-b.png";
import trooperSheetUrl from "../assets/units/trooper-walk.png";
import trooperCrouchUrl from "../assets/units/trooper-crouch.png";
import trooperCrawlUrl from "../assets/units/trooper-crawl.png";
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

export const TROOPER_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperCrouchUrl),
  dirs: 8,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
};

export const TROOPER_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperCrawlUrl),
  dirs: 8,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * UNIT_VISUAL_SCALE),
  contactY: 0.72,
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

export function spriteFor(type: EntityType, stance?: Stance): UnitSpriteDef | undefined {
  if (type === "trooper") {
    if (stance === "crouch") return TROOPER_CROUCH_SPRITE;
    if (stance === "crawl") return TROOPER_CRAWL_SPRITE;
    return TROOPER_SPRITE;
  }
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
  cottage: building(cottageUrl, 957, 479, 753),
  house: building(houseUrl, 957, 479, 863),
  manor: building(manorUrl, 957, 479.5, 878),
};

/** Grounded map prop. Contact is the source pixel that sits on the tile. */
export interface PropSprite {
  image: HTMLImageElement;
  contactX: number;
  contactY: number;
}

function prop(src: string, contactX: number, contactY: number): PropSprite {
  return { image: loadSheet(src), contactX, contactY };
}

export const TREE_OAK = prop(oakUrl, 388, 768);
export const TREE_PINE = prop(pineUrl, 382, 1130);
export const SCRAP_A = prop(scrapAUrl, 406, 567);
export const BUSH_A = prop(bushAUrl, 364, 573);
export const BUSH_B = prop(bushBUrl, 346, 371);
export const WATER_TEX = loadSheet(waterUrl);
export const WATER_TEX_B = loadSheet(waterBUrl);

export const PROP_IMAGES: HTMLImageElement[] = [
  TREE_OAK.image,
  TREE_PINE.image,
  SCRAP_A.image,
  BUSH_A.image,
  BUSH_B.image,
  WATER_TEX,
  WATER_TEX_B,
  BUILDING_SPRITES.cottage!.image,
  BUILDING_SPRITES.house!.image,
  BUILDING_SPRITES.manor!.image,
];

export function whenImagesReady(images: HTMLImageElement[], cb: () => void): void {
  let left = 0;
  const done = (): void => {
    left -= 1;
    if (left <= 0) cb();
  };
  for (const img of images) {
    if (img.complete && img.naturalWidth > 0) continue;
    left += 1;
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }
  if (left === 0) cb();
}

const propBlitCache = new Map<string, HTMLCanvasElement>();

function propBlit(def: PropSprite, drawH: number, flip: boolean): HTMLCanvasElement | null {
  if (!spriteReady(def) || drawH <= 0) return null;
  const h = Math.max(1, Math.round(drawH));
  const key = `${def.image.src}@${h}${flip ? "f" : ""}`;
  const hit = propBlitCache.get(key);
  if (hit) return hit;
  const scale = h / def.image.naturalHeight;
  const dw = Math.max(1, Math.round(def.image.naturalWidth * scale));
  const dh = Math.max(1, Math.round(def.image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "low";
  if (flip) {
    g.translate(dw, 0);
    g.scale(-1, 1);
  }
  g.drawImage(def.image, 0, 0, dw, dh);
  propBlitCache.set(key, canvas);
  return canvas;
}

export function drawPropSprite(
  ctx: CanvasRenderingContext2D,
  def: PropSprite,
  x: number,
  y: number,
  drawH: number,
  flip = false,
): boolean {
  const blit = propBlit(def, drawH, flip);
  if (!blit) return false;
  const scale = blit.height / def.image.naturalHeight;
  const cx = (flip ? def.image.naturalWidth - def.contactX : def.contactX) * scale;
  const cy = def.contactY * scale;
  ctx.drawImage(blit, x - cx, y - cy);
  return true;
}

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
  ctx.imageSmoothingQuality = "low";
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
  ctx.imageSmoothingQuality = "low";
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
