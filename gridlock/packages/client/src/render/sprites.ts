import {
  buildingFaceIndex,
  isoDirIndex,
  isCivilianType,
  isInfantryType,
  type CivilianType,
  type Crit,
  type EntityType,
  type Stance,
} from "@gridlock/shared";
import {
  buildingAlphaOpaqueAt,
  buildingSpriteSrcAt,
  rectsOverlap,
  type BuildingAlphaMap,
} from "./building-hit.js";
import { snapToUnitHitMask, unitDestMaskFromSheets, unitSpriteDest } from "./unit-hit.js";
import coreUrl from "../assets/buildings/core.png";
import dynamoUrl from "../assets/buildings/dynamo.png";
import smelterUrl from "../assets/buildings/smelter.png";
import musterUrl from "../assets/buildings/muster.png";
import armoryUrl from "../assets/buildings/armory.png";
import cottageUrl from "../assets/buildings/cottage.png";
import cottageSUrl from "../assets/buildings/cottage-s.png";
import cottageWUrl from "../assets/buildings/cottage-w.png";
import cottageNUrl from "../assets/buildings/cottage-n.png";
import houseUrl from "../assets/buildings/house.png";
import houseSUrl from "../assets/buildings/house-s.png";
import houseWUrl from "../assets/buildings/house-w.png";
import houseNUrl from "../assets/buildings/house-n.png";
import manorUrl from "../assets/buildings/manor.png";
import manorSUrl from "../assets/buildings/manor-s.png";
import manorWUrl from "../assets/buildings/manor-w.png";
import manorNUrl from "../assets/buildings/manor-n.png";
import shackUrl from "../assets/buildings/shack.png";
import shackSUrl from "../assets/buildings/shack-s.png";
import shackWUrl from "../assets/buildings/shack-w.png";
import shackNUrl from "../assets/buildings/shack-n.png";
import barnUrl from "../assets/buildings/barn.png";
import barnSUrl from "../assets/buildings/barn-s.png";
import barnWUrl from "../assets/buildings/barn-w.png";
import barnNUrl from "../assets/buildings/barn-n.png";
import innUrl from "../assets/buildings/inn.png";
import innSUrl from "../assets/buildings/inn-s.png";
import innWUrl from "../assets/buildings/inn-w.png";
import innNUrl from "../assets/buildings/inn-n.png";
import chapelUrl from "../assets/buildings/chapel.png";
import chapelSUrl from "../assets/buildings/chapel-s.png";
import chapelWUrl from "../assets/buildings/chapel-w.png";
import chapelNUrl from "../assets/buildings/chapel-n.png";
import oakUrl from "../assets/terrain/tree-oak.png";
import pineUrl from "../assets/terrain/tree-pine.png";
import scrapAUrl from "../assets/terrain/scrap-a.png";
import bushAUrl from "../assets/terrain/bush-a.png";
import bushBUrl from "../assets/terrain/bush-b.png";
import waterUrl from "../assets/terrain/water.png";
import waterBUrl from "../assets/terrain/water-b.png";
import grassUrl from "../assets/terrain/grass.png";
import trooperSheetUrl from "../assets/units/trooper-walk.png";
import trooperCrouchUrl from "../assets/units/trooper-crouch.png";
import trooperCrawlUrl from "../assets/units/trooper-crawl.png";
import infantrySwimUrl from "../assets/units/infantry-swim.png";
import haulerSheetUrl from "../assets/units/hauler-move.png";
import wardenHullUrl from "../assets/units/warden-hull.png";
import wardenTurretUrl from "../assets/units/warden-turret.png";
import scoutHeadUrl from "../assets/units/scout-head.png";
import rigSheetUrl from "../assets/units/rig-move.png";
import armIconUrl from "../assets/status/arm.png";
import legIconUrl from "../assets/status/leg.png";
import tracksIconUrl from "../assets/status/tracks.png";
import engineIconUrl from "../assets/status/engine.png";

/** Extra on-map scale for every unit (sprites and iso-box fallbacks). */
export const UNIT_VISUAL_SCALE = 1.25;
/** Infantry draw smaller than vehicles so tanks read larger. */
export const INFANTRY_VISUAL_SCALE = UNIT_VISUAL_SCALE * 0.85;

/** On-map draw size for infantry sprites, iso pixels. */
export const UNIT_SPRITE_DRAW_SIZE = Math.round(22 * INFANTRY_VISUAL_SCALE);

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
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
};

export const TROOPER_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
};

export const TROOPER_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
};

/** Shared swim sheet for every infantry type. */
export const INFANTRY_SWIM_SPRITE: UnitSpriteDef = {
  image: loadSheet(infantrySwimUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.68,
};

/** 16-dir hatch head (helmet + face). Row = isoDirIndex, one frame. */
export const SCOUT_HEAD_SPRITE: UnitSpriteDef = {
  image: loadSheet(scoutHeadUrl),
  dirs: 16,
  frames: 1,
  frameSize: 48,
  fps: 1,
  drawSize: Math.round(16 * INFANTRY_VISUAL_SCALE),
  contactY: 1,
};

export const WARDEN_SPRITE: UnitSpriteDef = {
  image: loadSheet(wardenHullUrl),
  dirs: 16,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(44 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  turret: {
    image: loadSheet(wardenTurretUrl),
    dirs: 16,
    frames: 1,
    frameSize: 128,
  },
};

export const HAULER_SPRITE: UnitSpriteDef = {
  image: loadSheet(haulerSheetUrl),
  dirs: 16,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(38 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
};

export const RIG_SPRITE: UnitSpriteDef = {
  image: loadSheet(rigSheetUrl),
  dirs: 16,
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

export function spriteFor(type: EntityType, stance?: Stance, swimming = false): UnitSpriteDef | undefined {
  if (isInfantryType(type) && swimming) return INFANTRY_SWIM_SPRITE;
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
  /** Source pixel at the center of the HP / selection stack, next to the roof. */
  stackX: number;
  stackY: number;
}

function building(
  src: string,
  padWidth: number,
  padSouthX: number,
  padSouthY: number,
  stackX: number,
  stackY: number,
): BuildingSpriteDef {
  return { image: loadSheet(src), padWidth, padSouthX, padSouthY, stackX, stackY };
}

const BUILDING_SPRITES: Partial<Record<EntityType, BuildingSpriteDef>> = {
  core: building(coreUrl, 383, 192.5, 390, 140, 50),
  dynamo: building(dynamoUrl, 384, 194, 291, 98, 30),
  armory: building(armoryUrl, 384, 194.5, 310, 120, 48),
  muster: building(musterUrl, 385, 194.5, 333, 278, 52),
  smelter: building(smelterUrl, 384, 194, 393, 138, 90),
};

/** East, south, west, north. Yards differ per face so a random facing also varies the lot. */
const CIV_FACES: Record<CivilianType, BuildingSpriteDef[]> = {
  cottage: [
    building(cottageUrl, 1145, 561, 895, 749, 10),
    building(cottageSUrl, 1151, 568, 895, 420, 10),
    building(cottageWUrl, 1151, 564, 895, 414, 10),
    building(cottageNUrl, 1151, 562, 895, 736, 10),
  ],
  shack: [
    building(shackUrl, 1148, 566, 895, 752, 19),
    building(shackSUrl, 1132, 582, 890, 437, 36),
    building(shackWUrl, 1110, 577, 885, 432, 36),
    building(shackNUrl, 1110, 572, 885, 719, 36),
  ],
  house: [
    building(houseUrl, 1071, 527, 959, 698, 10),
    building(houseSUrl, 1071, 537, 959, 378, 12),
    building(houseWUrl, 1071, 525, 959, 379, 10),
    building(houseNUrl, 1071, 515, 959, 692, 10),
  ],
  barn: [
    building(barnUrl, 1070, 522, 959, 696, 10),
    building(barnSUrl, 1071, 538, 959, 387, 12),
    building(barnWUrl, 1070, 526, 959, 697, 10),
    building(barnNUrl, 1070, 524, 959, 373, 10),
  ],
  inn: [
    building(innUrl, 1071, 534, 959, 697, 12),
    building(innSUrl, 1071, 536, 959, 373, 12),
    building(innWUrl, 1071, 536, 959, 377, 12),
    building(innNUrl, 1071, 535, 959, 694, 12),
  ],
  chapel: [
    building(chapelUrl, 1055, 526, 972, 689, 28),
    building(chapelSUrl, 1055, 522, 972, 366, 28),
    building(chapelWUrl, 1055, 527, 974, 447, 24),
    building(chapelNUrl, 1055, 527, 974, 607, 24),
  ],
  manor: [
    building(manorUrl, 1055, 524, 975, 542, 11),
    building(manorSUrl, 1055, 522, 975, 513, 11),
    building(manorWUrl, 1055, 525, 975, 520, 12),
    building(manorNUrl, 1055, 527, 975, 535, 12),
  ],
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
export const GRASS_TEX = loadSheet(grassUrl);

export const PROP_IMAGES: HTMLImageElement[] = [
  TREE_OAK.image,
  TREE_PINE.image,
  SCRAP_A.image,
  BUSH_A.image,
  BUSH_B.image,
  WATER_TEX,
  WATER_TEX_B,
  GRASS_TEX,
  ...Object.values(CIV_FACES).flatMap((faces) => faces.map((f) => f.image)),
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

export function buildingSpriteFor(type: EntityType, facing = 0): BuildingSpriteDef | undefined {
  if (isCivilianType(type)) {
    const faces = CIV_FACES[type];
    return faces[buildingFaceIndex(facing) % faces.length];
  }
  return BUILDING_SPRITES[type];
}

/** Iso-pixel height used to ghost units standing behind this sprite. */
export function buildingOccludeEz(
  def: BuildingSpriteDef | undefined,
  footprintW: number,
  fallbackEz: number,
): number {
  if (!def || !spriteReady(def) || def.padWidth <= 0 || footprintW <= 0) return fallbackEz;
  const roof = def.padSouthY * (footprintW / def.padWidth) * 0.62;
  return Math.max(fallbackEz, roof);
}

const BUILDING_ALPHA_MAX_DIM = 256;

const buildingAlphaCache = new WeakMap<HTMLImageElement, BuildingAlphaMap>();

function buildingAlphaMap(img: HTMLImageElement): BuildingAlphaMap | null {
  const hit = buildingAlphaCache.get(img);
  if (hit) return hit;
  if (!img.complete || img.naturalWidth <= 0) return null;
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const toMap = Math.min(1, BUILDING_ALPHA_MAX_DIM / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * toMap));
  const h = Math.max(1, Math.round(sh * toMap));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, w, h);
  const pix = g.getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  for (let i = 0, p = 3; i < a.length; i++, p += 4) a[i] = pix[p]!;
  const rec = { w, h, a, toMap };
  buildingAlphaCache.set(img, rec);
  return rec;
}

export function buildingSpriteDestRect(
  def: BuildingSpriteDef,
  southX: number,
  southY: number,
  footprintW: number,
): { x: number; y: number; w: number; h: number } | null {
  if (!spriteReady(def) || def.padWidth <= 0 || footprintW <= 0) return null;
  const scale = footprintW / def.padWidth;
  return {
    x: southX - def.padSouthX * scale,
    y: southY - def.padSouthY * scale,
    w: def.image.naturalWidth * scale,
    h: def.image.naturalHeight * scale,
  };
}

/**
 * True when any screen sample sits on a painted (non-transparent) building pixel.
 * Units overlapping only the empty canvas around a house stay fully opaque.
 */
export function unitHitsBuildingSprite(
  def: BuildingSpriteDef,
  southX: number,
  southY: number,
  footprintW: number,
  samples: readonly { x: number; y: number }[],
  unitRect?: { x: number; y: number; w: number; h: number },
): boolean {
  if (!spriteReady(def) || def.padWidth <= 0 || footprintW <= 0 || samples.length === 0) return false;
  const dest = buildingSpriteDestRect(def, southX, southY, footprintW);
  if (!dest) return false;
  if (unitRect && !rectsOverlap(unitRect.x, unitRect.y, unitRect.w, unitRect.h, dest.x, dest.y, dest.w, dest.h)) {
    return false;
  }
  const map = buildingAlphaMap(def.image);
  if (!map) return false;
  const scale = footprintW / def.padWidth;
  const radius = Math.min(2, Math.max(1, Math.ceil(1.25 / (scale * map.toMap))));
  for (const s of samples) {
    if (s.x < dest.x || s.y < dest.y || s.x >= dest.x + dest.w || s.y >= dest.y + dest.h) continue;
    const src = buildingSpriteSrcAt(
      def.padWidth,
      def.padSouthX,
      def.padSouthY,
      southX,
      southY,
      footprintW,
      s.x,
      s.y,
    );
    if (buildingAlphaOpaqueAt(map, src.x, src.y, radius)) return true;
  }
  return false;
}

export function spriteReady(def: { image: HTMLImageElement }): boolean {
  return def.image.complete && def.image.naturalWidth > 0;
}

function unitSheetAlpha(img: HTMLImageElement): BuildingAlphaMap | null {
  return buildingAlphaMap(img);
}

/**
 * Snap a screen-space armor spark onto painted hull/turret pixels.
 * `ground` is the unit's contact point; `hit` is the candidate spark.
 */
export function snapHitToUnitSprite(
  def: UnitSpriteDef,
  groundX: number,
  groundY: number,
  hitX: number,
  hitY: number,
  isoDx: number,
  isoDy: number,
  turretDx?: number,
  turretDy?: number,
): { x: number; y: number } | null {
  if (!spriteReady(def) || def.drawSize <= 0 || def.frameSize <= 0) return null;
  const hullMap = unitSheetAlpha(def.image);
  if (!hullMap) return null;
  const dir = isoDirIndex(isoDx, isoDy, def.dirs) % def.dirs;
  const hull = { map: hullMap, sx: 0, sy: dir * def.frameSize, cell: def.frameSize };
  let turret: { map: BuildingAlphaMap; sx: number; sy: number; cell: number } | null = null;
  const gun = def.turret;
  if (gun && spriteReady(gun)) {
    const tmap = unitSheetAlpha(gun.image);
    if (tmap) {
      const tdir = isoDirIndex(turretDx ?? isoDx, turretDy ?? isoDy, gun.dirs) % gun.dirs;
      turret = { map: tmap, sx: 0, sy: tdir * gun.frameSize, cell: gun.frameSize };
    }
  }
  const mask = unitDestMaskFromSheets(def.drawSize, hull, turret);
  const dest = unitSpriteDest(groundX, groundY, def.drawSize, def.contactY);
  const snap = snapToUnitHitMask(mask, hitX - dest.x, hitY - dest.y);
  if (!snap) return null;
  return { x: dest.x + snap.x, y: dest.y + snap.y };
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

/** Screen position of the HP / selection stack for a grounded building sprite. */
export function buildingStackAt(
  def: BuildingSpriteDef,
  southX: number,
  southY: number,
  footprintW: number,
): { x: number; y: number } {
  const scale = footprintW / def.padWidth;
  return {
    x: southX + (def.stackX - def.padSouthX) * scale,
    y: southY + (def.stackY - def.padSouthY) * scale,
  };
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

/** Draw only the hatch crew's head on the turret cupola. */
export function drawScoutHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  turretDx: number,
  turretDy: number,
  hullSize: number,
): boolean {
  const def = SCOUT_HEAD_SPRITE;
  if (!spriteReady(def)) return false;
  const dir = isoDirIndex(turretDx, turretDy, def.dirs) % def.dirs;
  const s = def.drawSize;
  const cell = def.frameSize;
  const len = Math.hypot(turretDx, turretDy) || 1;
  const ux = turretDx / len;
  const uy = turretDy / len;
  const hx = x + ux * hullSize * -0.04;
  const hy = y + uy * hullSize * -0.04 * 0.45 - hullSize * 0.48;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(def.image, 0, dir * cell, cell, cell, hx - s / 2, hy - s * def.contactY, s, s);
  ctx.restore();
  return true;
}
