import {
  BUILDING_FACINGS,
  buildingFaceIndex,
  buildingTurnIndex,
  isCivilianType,
  TANK_FACE_DIRS,
  TILE_SIZE,
  isInfantryType,
  type CivilianType,
  type Crit,
  type EntityType,
  type Stance,
} from "@gridlock/shared";
import { veiledCopy } from "./building-fog.js";
import {
  buildingAlphaOpaqueAt,
  buildingSpriteSrcAt,
  rectsOverlap,
  type BuildingAlphaMap,
} from "./building-hit.js";
import {
  alphaCellBox,
  cellBoxToDest,
  snapToUnitHitMask,
  unionCellBox,
  unitDestMaskFromSheets,
  unitGroundSink,
  unitSpriteDest,
  type CellBox,
  type ScreenRect,
} from "./unit-hit.js";
import coreUrl from "../assets/buildings/core.png";
import dynamoUrl from "../assets/buildings/dynamo.png";
import smelterUrl from "../assets/buildings/smelter.png";
import musterUrl from "../assets/buildings/muster.png";
import armoryUrl from "../assets/buildings/armory.png";
import airfieldUrl from "../assets/buildings/airfield.png";
import airfieldGroundUrl from "../assets/buildings/airfield-ground.png";
import ciwsUrl from "../assets/buildings/ciws.png";
import bunkerUrl from "../assets/buildings/bunker.png";
import towerUrl from "../assets/buildings/tower.png";
import ciwsTurretUrl from "../assets/buildings/ciws-turret.png";
import researchUrl from "../assets/buildings/research.png";
import radarUrl from "../assets/buildings/radar.png";
import dockUrl from "../assets/buildings/dock.png";
import ramUrl from "../assets/buildings/ram.png";
import ramTurretUrl from "../assets/buildings/ram-turret.png";
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
import oak1Url from "../assets/terrain/tree-oak-1.png";
import oak2Url from "../assets/terrain/tree-oak-2.png";
import oak3Url from "../assets/terrain/tree-oak-3.png";
import pine1Url from "../assets/terrain/tree-pine-1.png";
import pine2Url from "../assets/terrain/tree-pine-2.png";
import pine3Url from "../assets/terrain/tree-pine-3.png";
import scrapHeap1Url from "../assets/terrain/scrap-heap-1.png";
import scrapHeap2Url from "../assets/terrain/scrap-heap-2.png";
import scrapHeap3Url from "../assets/terrain/scrap-heap-3.png";
import scrapPiece1Url from "../assets/terrain/scrap-piece-1.png";
import scrapPiece2Url from "../assets/terrain/scrap-piece-2.png";
import scrapPiece3Url from "../assets/terrain/scrap-piece-3.png";
import scrapPiece4Url from "../assets/terrain/scrap-piece-4.png";
import scrapBits1Url from "../assets/terrain/scrap-bits-1.png";
import scrapBits2Url from "../assets/terrain/scrap-bits-2.png";
import scrapBits3Url from "../assets/terrain/scrap-bits-3.png";
import crater1Url from "../assets/terrain/crater-1.png";
import crater2Url from "../assets/terrain/crater-2.png";
import crater3Url from "../assets/terrain/crater-3.png";
import crater4Url from "../assets/terrain/crater-4.png";
import crater5Url from "../assets/terrain/crater-5.png";
import crater6Url from "../assets/terrain/crater-6.png";
import bush1Url from "../assets/terrain/bush-1.png";
import bush2Url from "../assets/terrain/bush-2.png";
import bush3Url from "../assets/terrain/bush-3.png";
import tuft1Url from "../assets/terrain/tuft-1.png";
import tuft2Url from "../assets/terrain/tuft-2.png";
import tuft3Url from "../assets/terrain/tuft-3.png";
import fenceXUrl from "../assets/terrain/fence-x.png";
import fenceYUrl from "../assets/terrain/fence-y.png";
import waterUrl from "../assets/terrain/water.png";
import waterBUrl from "../assets/terrain/water-b.png";
import grassMeadowUrl from "../assets/terrain/grass-meadow.png";
import grassDryUrl from "../assets/terrain/grass-dry.png";
import grassDampUrl from "../assets/terrain/grass-damp.png";
import dirtUrl from "../assets/terrain/ground-dirt.png";
import rockTexUrl from "../assets/terrain/ground-rock.png";
import boulder1Url from "../assets/terrain/boulder-1.png";
import boulder2Url from "../assets/terrain/boulder-2.png";
import boulder3Url from "../assets/terrain/boulder-3.png";
import stones1Url from "../assets/terrain/stones-1.png";
import stones2Url from "../assets/terrain/stones-2.png";
import stump1Url from "../assets/terrain/stump-1.png";
import stump2Url from "../assets/terrain/stump-2.png";
import signpost1Url from "../assets/terrain/signpost-1.png";
import signpost2Url from "../assets/terrain/signpost-2.png";
import trooperSheetUrl from "../assets/units/trooper-walk.png";
import trooperCrouchUrl from "../assets/units/trooper-crouch.png";
import trooperCrawlUrl from "../assets/units/trooper-crawl.png";
import trooperHandgunUrl from "../assets/units/trooper-handgun.png";
import trooperRifleFireUrl from "../assets/units/trooper-rifle-fire.png";
import trooperDieUrl from "../assets/units/trooper-die.png";
import gunnerWalkUrl from "../assets/units/gunner-walk.png";
import gunnerCrouchUrl from "../assets/units/gunner-crouch.png";
import gunnerCrawlUrl from "../assets/units/gunner-crawl.png";
import gunnerFireUrl from "../assets/units/gunner-fire.png";
import gunnerDieUrl from "../assets/units/gunner-die.png";
import sniperWalkUrl from "../assets/units/sniper-walk.png";
import sniperCrouchUrl from "../assets/units/sniper-crouch.png";
import sniperCrawlUrl from "../assets/units/sniper-crawl.png";
import sniperFireUrl from "../assets/units/sniper-fire.png";
import sniperDieUrl from "../assets/units/sniper-die.png";
import atInfantryWalkUrl from "../assets/units/atinfantry-walk.png";
import atInfantryCrouchUrl from "../assets/units/atinfantry-crouch.png";
import atInfantryCrawlUrl from "../assets/units/atinfantry-crawl.png";
import atInfantryFireUrl from "../assets/units/atinfantry-fire.png";
import atInfantryDieUrl from "../assets/units/atinfantry-die.png";
import rocketerWalkUrl from "../assets/units/rocketer-walk.png";
import rocketerCrouchUrl from "../assets/units/rocketer-crouch.png";
import rocketerCrawlUrl from "../assets/units/rocketer-crawl.png";
import rocketerFireUrl from "../assets/units/rocketer-fire.png";
import rocketerDieUrl from "../assets/units/rocketer-die.png";
import pyroWalkUrl from "../assets/units/pyro-walk.png";
import pyroCrouchUrl from "../assets/units/pyro-crouch.png";
import pyroCrawlUrl from "../assets/units/pyro-crawl.png";
import pyroFireUrl from "../assets/units/pyro-fire.png";
import pyroDieUrl from "../assets/units/pyro-die.png";
import mortarmanWalkUrl from "../assets/units/mortarman-walk.png";
import mortarmanCrouchUrl from "../assets/units/mortarman-crouch.png";
import mortarmanCrawlUrl from "../assets/units/mortarman-crawl.png";
import mortarmanFireUrl from "../assets/units/mortarman-fire.png";
import mortarmanDieUrl from "../assets/units/mortarman-die.png";
import medicWalkUrl from "../assets/units/medic-walk.png";
import medicCrouchUrl from "../assets/units/medic-crouch.png";
import medicCrawlUrl from "../assets/units/medic-crawl.png";
import medicDieUrl from "../assets/units/medic-die.png";
import droneopWalkUrl from "../assets/units/droneop-walk.png";
import droneopCrouchUrl from "../assets/units/droneop-crouch.png";
import droneopCrawlUrl from "../assets/units/droneop-crawl.png";
import droneopDieUrl from "../assets/units/droneop-die.png";
import jumpjetWalkUrl from "../assets/units/jumpjet-walk.png";
import jumpjetCrouchUrl from "../assets/units/jumpjet-crouch.png";
import jumpjetCrawlUrl from "../assets/units/jumpjet-crawl.png";
import jumpjetFireUrl from "../assets/units/jumpjet-fire.png";
import jumpjetFlyUrl from "../assets/units/jumpjet-fly.png";
import jumpjetDieUrl from "../assets/units/jumpjet-die.png";
import jumpjetSwimUrl from "../assets/units/jumpjet-swim.png";
import cyborgWalkUrl from "../assets/units/cyborg-walk.png";
import cyborgFireUrl from "../assets/units/cyborg-fire.png";
import cyborgCrawlUrl from "../assets/units/cyborg-crawl.png";
import cyborgCrawlFireUrl from "../assets/units/cyborg-crawl-fire.png";
import cyborgDieUrl from "../assets/units/cyborg-die.png";
import engineerWalkUrl from "../assets/units/engineer-walk.png";
import engineerCrouchUrl from "../assets/units/engineer-crouch.png";
import engineerCrawlUrl from "../assets/units/engineer-crawl.png";
import engineerBuildUrl from "../assets/units/engineer-build.png";
import engineerFixUrl from "../assets/units/engineer-fix.png";
import engineerDieUrl from "../assets/units/engineer-die.png";
import teethUrl from "../assets/units/teeth.png";
import infantrySwimUrl from "../assets/units/infantry-swim.png";
import gunnerSwimUrl from "../assets/units/gunner-swim.png";
import sniperSwimUrl from "../assets/units/sniper-swim.png";
import atinfantrySwimUrl from "../assets/units/atinfantry-swim.png";
import rocketerSwimUrl from "../assets/units/rocketer-swim.png";
import pyroSwimUrl from "../assets/units/pyro-swim.png";
import mortarmanSwimUrl from "../assets/units/mortarman-swim.png";
import medicSwimUrl from "../assets/units/medic-swim.png";
import droneopSwimUrl from "../assets/units/droneop-swim.png";
import engineerSwimUrl from "../assets/units/engineer-swim.png";
import cyborgSwimUrl from "../assets/units/cyborg-swim.png";
import haulerHullUrl from "../assets/units/hauler-hull.png";
import haulerCartUrl from "../assets/units/hauler-cart.png";
import wardenWreckUrl from "../assets/units/wrecks/warden.png";
import apocalypseWreckUrl from "../assets/units/wrecks/apocalypse.png";
import ss3WreckUrl from "../assets/units/wrecks/ss3.png";
import jagdtigerWreckUrl from "../assets/units/wrecks/jagdtiger.png";
import supplyWreckUrl from "../assets/units/wrecks/supply.png";
import nebelwerferWreckUrl from "../assets/units/wrecks/nebelwerfer.png";
import haulerWreckUrl from "../assets/units/wrecks/hauler.png";
import haulerCartWreckUrl from "../assets/units/wrecks/hauler-cart.png";
import walkerWreckUrl from "../assets/units/wrecks/walker.png";
import titanWreckUrl from "../assets/units/wrecks/titan.png";
import mammothWreckUrl from "../assets/units/wrecks/mammoth.png";
import stukaWreckUrl from "../assets/units/wrecks/stuka.png";
import fw190WreckUrl from "../assets/units/wrecks/fw190.png";
import bv222WreckUrl from "../assets/units/wrecks/bv222.png";
import gunboatWreckUrl from "../assets/units/wrecks/gunboat.png";
import submarineWreckUrl from "../assets/units/wrecks/submarine.png";
import battleshipWreckUrl from "../assets/units/wrecks/battleship.png";
import walkerLegsUrl from "../assets/units/walker-legs.png";
import walkerTorsoUrl from "../assets/units/walker-torso.png";
import mammothWalkUrl from "../assets/units/mammoth-walk.png";
import mammothWadeUrl from "../assets/units/mammoth-wade.png";
import titanLegsUrl from "../assets/units/titan-legs.png";
import titanTorsoUrl from "../assets/units/titan-torso.png";
import titanGunUrl from "../assets/units/titan-gun.png";
import titanBracedLegsUrl from "../assets/units/titan-braced-legs.png";
import titanBracedTorsoUrl from "../assets/units/titan-braced-torso.png";
import titanBracedGunUrl from "../assets/units/titan-braced-gun.png";
import titanWadeLegsUrl from "../assets/units/titan-wade-legs.png";
import titanWadeTorsoUrl from "../assets/units/titan-wade-torso.png";
import titanWadeGunUrl from "../assets/units/titan-wade-gun.png";
import {
  bindAircraftSheets,
  bindCasemateSheets,
  bindJagdtigerSheets,
  bindDroneSheets,
  bindFighterSheets,
  bindTransportSheets,
  bindSupplySheets,
  bindNavalSheets,
  bindBattleshipSheets,
  bindApocalypseSheets,
  bindNebelwerferSheets,
  bindArtillerySheets,
  bindTurntableSheets,
} from "./turntable-sheet.js";
import { engineRowFromFacing, engineRowFromScreen } from "./turntable.js";
import { BATTLESHIP_MODEL, battleshipDrawSize } from "./battleship.js";
import scoutHeadUrl from "../assets/units/scout-head.png";
import rigSheetUrl from "../assets/units/rig-move.png";
import armIconUrl from "../assets/status/arm.png";
import legIconUrl from "../assets/status/leg.png";
import tracksIconUrl from "../assets/status/tracks.png";
import engineIconUrl from "../assets/status/engine.png";
import lampIconUrl from "../assets/status/lamp.png";
import { blendPadInPlace } from "./pad-blend.js";
import { MAULER_SCALE } from "./mauler-cart.js";

/** Extra on-map scale for every unit (sprites and box fallbacks). */
export const UNIT_VISUAL_SCALE = 1.25;
/** Infantry draw smaller than vehicles so tanks read larger, then another 15%. */
export const INFANTRY_VISUAL_SCALE = UNIT_VISUAL_SCALE * 0.85 * 0.85;

/** On-map draw size for infantry sprites, screen pixels. */
export const UNIT_SPRITE_DRAW_SIZE = Math.round(22 * INFANTRY_VISUAL_SCALE);

/** Optional overlay sheet (turret or recoiling gun) drawn with the hull. */
export interface TurretSpriteDef {
  image: HTMLImageElement;
  dirs: number;
  frames: number;
  frameSize: number;
}

/** Dirs × N frames. Row = facing (0001 = south, clockwise 22.5°), column = walk/move frame. */
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
  /** Barrel drawn apart from hull/turret so it can recoil. */
  gun?: TurretSpriteDef;
  /** A small mount on the turret roof with its own facing (the Apocalypse's CIWS). Drawn last. */
  mount?: TurretSpriteDef;
  /**
   * `world` (default): project facing onto the iso view, then 0001 = screen south.
   * `screen`: engineRowFromScreen of the given vector.
   */
  facingSpace?: "screen" | "world";
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
  facingSpace: "world",
};

export const TROOPER_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const TROOPER_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Standing trooper with the pistol out. Frame 0 is the idle; later frames bob. */
export const TROOPER_HANDGUN_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperHandgunUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

/** Rifle recoil pose. Played once, then the walk sheet returns. */
export const TROOPER_RIFLE_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperRifleFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

/** Fallen rifleman. One-shot, then the last frame stays. */
export const TROOPER_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(trooperDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

export const GUNNER_SPRITE: UnitSpriteDef = {
  image: loadSheet(gunnerWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const GUNNER_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(gunnerCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const GUNNER_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(gunnerCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Prone MG42 burst. Shown while rounds are leaving the barrel. */
export const GUNNER_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(gunnerFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

export const GUNNER_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(gunnerDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

export const SNIPER_SPRITE: UnitSpriteDef = {
  image: loadSheet(sniperWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const SNIPER_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(sniperCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const SNIPER_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(sniperCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Standing scoped shot. Played once, then the walk sheet returns. */
export const SNIPER_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(sniperFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const SNIPER_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(sniperDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

export const ATINFANTRY_SPRITE: UnitSpriteDef = {
  image: loadSheet(atInfantryWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const ATINFANTRY_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(atInfantryCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const ATINFANTRY_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(atInfantryCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Standing PTRD shot. Played once, then the walk sheet returns. */
export const ATINFANTRY_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(atInfantryFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const ATINFANTRY_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(atInfantryDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

/** Rocketer: the AT Infantry soldier with a launcher tube (tools/sprites/derive_rocketer.py). */
export const ROCKETER_SPRITE: UnitSpriteDef = {
  image: loadSheet(rocketerWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const ROCKETER_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(rocketerCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const ROCKETER_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(rocketerCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Standing launch. Played once, then the walk sheet returns. */
export const ROCKETER_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(rocketerFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const ROCKETER_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(rocketerDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

/** Pyro: the AT Infantry soldier with twin fuel tanks and a flame lance (tools/sprites/derive_pyro.py). */
export const PYRO_SPRITE: UnitSpriteDef = {
  image: loadSheet(pyroWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const PYRO_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(pyroCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const PYRO_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(pyroCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Standing burst: nozzle flare and a short tongue out of the shroud. The long jet is engine particles. */
export const PYRO_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(pyroFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 14,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const PYRO_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(pyroDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

export const MORTARMAN_SPRITE: UnitSpriteDef = {
  image: loadSheet(mortarmanWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const MORTARMAN_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(mortarmanCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const MORTARMAN_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(mortarmanCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Kneeling mortar shot. Played once, then the crouch sheet returns. */
export const MORTARMAN_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(mortarmanFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const MORTARMAN_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(mortarmanDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

export const MEDIC_SPRITE: UnitSpriteDef = {
  image: loadSheet(medicWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const MEDIC_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(medicCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const MEDIC_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(medicCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

export const MEDIC_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(medicDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

/**
 * Drone Op: the Medic's soldier re-kitted (tools/sprites/derive_droneop.py) with a
 * chest controller and a pack antenna. Same cell, scale, and contact as the Medic.
 */
export const DRONEOP_SPRITE: UnitSpriteDef = {
  image: loadSheet(droneopWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const DRONEOP_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(droneopCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const DRONEOP_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(droneopCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

export const DRONEOP_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(droneopDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

/**
 * Jump Jet: the Rifleman re-kitted (tools/sprites/derive_jumpjet.py) with a
 * twin-tank jet pack and a magazine-fed rifle. Same cell, scale, and contact
 * as the trooper.
 */
export const JUMPJET_SPRITE: UnitSpriteDef = {
  image: loadSheet(jumpjetWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const JUMPJET_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(jumpjetCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const JUMPJET_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(jumpjetCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Assault-rifle burst. Played once, then the walk sheet returns. */
export const JUMPJET_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(jumpjetFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

/**
 * Hanging under the lit pack. Only the two plumes flicker; the map loops it
 * on the clock and lifts the whole sprite by altitude over its ground shadow.
 */
export const JUMPJET_FLY_SPRITE: UnitSpriteDef = {
  image: loadSheet(jumpjetFlyUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const JUMPJET_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(jumpjetDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

/** Cyborg standing / walking. Column 0 is the stand; the legs stride while moving.
 *  contactY is the point between the feet (render_cyborg.py pins it), not the lowest toe. */
export const CYBORG_SPRITE: UnitSpriteDef = {
  image: loadSheet(cyborgWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

/** Standing gatling burst. The barrels spin and the flash flickers. */
export const CYBORG_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(cyborgFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

/** Legs torn off: dragging on one arm. Prone scale, same as every crawl sheet. */
export const CYBORG_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(cyborgCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Legless burst from the dirt. Same pose and scale as the crawl sheet. */
export const CYBORG_CRAWL_FIRE_SPRITE: UnitSpriteDef = {
  image: loadSheet(cyborgCrawlFireUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 12,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

/** Corpse, face down. contactY is the footprint centre (same pivot as the crawl). */
export const CYBORG_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(cyborgDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.72,
  facingSpace: "world",
};

export const ENGINEER_SPRITE: UnitSpriteDef = {
  image: loadSheet(engineerWalkUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.9,
  facingSpace: "world",
};

export const ENGINEER_CROUCH_SPRITE: UnitSpriteDef = {
  image: loadSheet(engineerCrouchUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const ENGINEER_CRAWL_SPRITE: UnitSpriteDef = {
  image: loadSheet(engineerCrawlUrl),
  dirs: 16,
  frames: 8,
  frameSize: 96,
  fps: 10,
  drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
  contactY: 0.72,
  facingSpace: "world",
};

export const ENGINEER_BUILD_SPRITE: UnitSpriteDef = {
  image: loadSheet(engineerBuildUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const ENGINEER_FIX_SPRITE: UnitSpriteDef = {
  image: loadSheet(engineerFixUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.88,
  facingSpace: "world",
};

export const ENGINEER_DIE_SPRITE: UnitSpriteDef = {
  image: loadSheet(engineerDieUrl),
  dirs: 16,
  frames: 4,
  frameSize: 96,
  fps: 8,
  drawSize: UNIT_SPRITE_DRAW_SIZE,
  contactY: 0.82,
  facingSpace: "world",
};

/** Concrete pyramids. Sixteen facings. Sandbags are drawn in `sandbags.ts`. */
export const TEETH_SPRITE: UnitSpriteDef = {
  image: loadSheet(teethUrl),
  dirs: 16,
  frames: 1,
  frameSize: 128,
  fps: 1,
  drawSize: 64,
  contactY: 0.74,
  facingSpace: "world",
};

/** Swim sheet: chest-deep in a pool. One cell, scale, and contact for every infantry type. */
function swimSprite(url: string): UnitSpriteDef {
  return {
    image: loadSheet(url),
    dirs: 16,
    frames: 8,
    frameSize: 96,
    fps: 8,
    drawSize: Math.round(28 * INFANTRY_VISUAL_SCALE),
    contactY: 0.68,
    facingSpace: "world",
  };
}

/** The Rifleman's swim sheet; the fallback for any infantry type without its own. */
export const INFANTRY_SWIM_SPRITE: UnitSpriteDef = swimSprite(infantrySwimUrl);

/** Each type's own swimmer. Humans: render_infantry.py. Cyborg: render_cyborg.py. */
const SWIM_SPRITES: Partial<Record<EntityType, UnitSpriteDef>> = {
  gunner: swimSprite(gunnerSwimUrl),
  sniper: swimSprite(sniperSwimUrl),
  atinfantry: swimSprite(atinfantrySwimUrl),
  rocketer: swimSprite(rocketerSwimUrl),
  pyro: swimSprite(pyroSwimUrl),
  mortarman: swimSprite(mortarmanSwimUrl),
  medic: swimSprite(medicSwimUrl),
  droneop: swimSprite(droneopSwimUrl),
  engineer: swimSprite(engineerSwimUrl),
  jumpjet: swimSprite(jumpjetSwimUrl),
  cyborg: swimSprite(cyborgSwimUrl),
};

/** 16-dir hatch head (helmet + face). Row 0 = 0001 = south, one frame. */
export const SCOUT_HEAD_SPRITE: UnitSpriteDef = {
  image: loadSheet(scoutHeadUrl),
  dirs: 16,
  frames: 1,
  frameSize: 48,
  fps: 1,
  drawSize: Math.round(16 * INFANTRY_VISUAL_SCALE),
  contactY: 1,
  facingSpace: "world",
};

const tigerTurret: TurretSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
};
const tigerGun: TurretSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
};
export const TIGER_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(44 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  turret: tigerTurret,
  gun: tigerGun,
  facingSpace: "world",
};
bindTurntableSheets(TIGER_SPRITE.image, tigerTurret.image, tigerGun.image);

function tankLayer(): TurretSpriteDef {
  return { image: new Image(), dirs: TANK_FACE_DIRS, frames: 1, frameSize: 128 };
}
/**
 * Apocalypse: the Tiger's layers plus the roof CIWS, which aims on its own facing.
 * Drawn a size up from the Tiger, as its hull is.
 */
export const APOCALYPSE_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(54 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  turret: tankLayer(),
  gun: tankLayer(),
  mount: tankLayer(),
  facingSpace: "world",
};
bindApocalypseSheets(
  APOCALYPSE_SPRITE.image,
  APOCALYPSE_SPRITE.turret!.image,
  APOCALYPSE_SPRITE.gun!.image,
  APOCALYPSE_SPRITE.mount!.image,
);

const ss3Gun: TurretSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
};
/** Casemate hull + recoiling gun; the gun does not traverse on its own. */
export const SS3_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(40 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  gun: ss3Gun,
  facingSpace: "world",
};
bindCasemateSheets(SS3_SPRITE.image, ss3Gun.image);

/**
 * Jagdtiger: the StuG's casemate layout on a heavier hull. The long 128mm sets
 * the cell fit, so it draws a size up from the Tiger to keep the hull heavier.
 */
export const JAGDTIGER_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(62 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  gun: tankLayer(),
  facingSpace: "world",
};
bindJagdtigerSheets(JAGDTIGER_SPRITE.image, JAGDTIGER_SPRITE.gun!.image);

export const SUPPLY_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(42 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  facingSpace: "world",
};
bindSupplySheets(SUPPLY_SPRITE.image);

/** Attack Boat: hull-only sheet cut at the waterline over its wake. */
export const GUNBOAT_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(48 * UNIT_VISUAL_SCALE),
  contactY: 0.74,
  facingSpace: "world",
};
bindNavalSheets("gunboat", GUNBOAT_SPRITE.image);

/** Submarine running awash: the longer hull, drawn a fifth bigger than the Attack Boat's scale. */
export const SUBMARINE_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(64 * 1.2 * UNIT_VISUAL_SCALE),
  contactY: 0.74,
  facingSpace: "world",
};
bindNavalSheets("submarine", SUBMARINE_SPRITE.image);

function shipLayer(): TurretSpriteDef {
  return { image: new Image(), dirs: TANK_FACE_DIRS, frames: 1, frameSize: 256 };
}
/**
 * Battle Ship hull, cut at the waterline over its wake. The superstructure, both
 * turrets, and both CIWS mounts are drawn over it by render/battleship.ts, each on
 * its own pivot. Drawn at the sim's length, not UNIT_VISUAL_SCALE.
 */
export const BATTLESHIP_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 256,
  fps: 8,
  drawSize: Math.round(battleshipDrawSize(TILE_SIZE)),
  contactY: BATTLESHIP_MODEL.cyFrac,
  facingSpace: "world",
};
export const BATTLESHIP_LAYERS = { super: shipLayer(), turret: shipLayer(), ciws: shipLayer() };
bindBattleshipSheets({
  hull: BATTLESHIP_SPRITE.image,
  super: BATTLESHIP_LAYERS.super.image,
  turret: BATTLESHIP_LAYERS.turret.image,
  ciws: BATTLESHIP_LAYERS.ciws.image,
});

/**
 * Infantry battle platform on four legs. Columns are an 8-frame trot, rows the
 * 16 faces; the chin MG is part of the body and aims with it. Drawn at half the
 * old tracked hull's size.
 */
export const MAMMOTH_SPRITE: UnitSpriteDef = {
  image: loadSheet(mammothWalkUrl),
  dirs: TANK_FACE_DIRS,
  frames: 8,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(42 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  facingSpace: "world",
};

/**
 * Waist deep. Same cell, scale, and contact as the walk sheet (one fit in
 * render_mammoth.py), so the body stays registered and the legs are under the pool.
 */
export const MAMMOTH_WADE_SPRITE: UnitSpriteDef = {
  image: loadSheet(mammothWadeUrl),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: MAMMOTH_SPRITE.drawSize,
  contactY: MAMMOTH_SPRITE.contactY,
  facingSpace: "world",
};

const nebelwerferLauncher: TurretSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
};
/** Rocket truck. The twelve-tube frame is the turret layer and traverses on `turretFacing`. */
export const NEBELWERFER_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(44 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  turret: nebelwerferLauncher,
  facingSpace: "world",
};
bindNebelwerferSheets(NEBELWERFER_SPRITE.image, nebelwerferLauncher.image);

/** Towed field gun. One sheet; the barrel is the facing. The crew is drawn beside it by the map. */
export const ARTILLERY_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(40 * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  facingSpace: "world",
};
bindArtillerySheets(ARTILLERY_SPRITE.image);

/** Ju 87 dive bomber. Same sheet on the strip and in the air; the map lifts it by altitude. */
export const STUKA_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(63 * UNIT_VISUAL_SCALE),
  contactY: 0.8,
  facingSpace: "world",
};
bindAircraftSheets(STUKA_SPRITE.image);

/** Fw 190 fighter. Same camera and cell as the Stuka; drawn smaller, as its span is. */
export const FW190_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(56 * UNIT_VISUAL_SCALE),
  contactY: 0.8,
  facingSpace: "world",
};
bindFighterSheets(FW190_SPRITE.image);

/**
 * BV 222 transport. Same camera and cell as the Stuka; its wingspan fills the cell,
 * so it is drawn well over the Stuka's size to read as the big, slow flying boat it is —
 * but still inside its hardstand when parked.
 */
export const BV222_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(90 * UNIT_VISUAL_SCALE),
  contactY: 0.8,
  facingSpace: "world",
};
bindTransportSheets(BV222_SPRITE.image);

/**
 * Drone Op's quadcopter. Same camera and 128 cell as the Stuka; its rotor span reads about
 * twice a rifleman's width. The map lifts it by altitude over its own ground shadow.
 */
export const DRONE_SPRITE: UnitSpriteDef = {
  image: new Image(),
  dirs: TANK_FACE_DIRS,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(34 * INFANTRY_VISUAL_SCALE),
  contactY: 0.8,
  facingSpace: "world",
};
bindDroneSheets(DRONE_SPRITE.image);

/**
 * Walker: legs are the hull, the torso and both gatlings traverse on the hips.
 * Both sheets are cut from one walk cycle (tools/sprites/split_walker_torso.py),
 * same cell and origin; the torso keeps its stride frames so the bob stays in step.
 */
export const WALKER_SPRITE: UnitSpriteDef = {
  image: loadSheet(walkerLegsUrl),
  dirs: 16,
  frames: 8,
  frameSize: 128,
  fps: 10,
  drawSize: Math.round(24 * 1.2),
  contactY: 0.9,
  turret: { image: loadSheet(walkerTorsoUrl), dirs: 16, frames: 8, frameSize: 128 },
  facingSpace: "world",
};

/**
 * Titan: legs are the hull (8-frame stride), the torso is the turret, the
 * barrel recoils on its own sheet. All three share one camera and origin
 * (tools/sprites/render_titan.py), so the torso sits on the hips at any aim.
 */
const TITAN_CELL = 192;
const TITAN_DRAW = Math.round(60 * UNIT_VISUAL_SCALE);
const TITAN_CONTACT_Y = 0.84;

function titanOverlay(src: string): TurretSpriteDef {
  return { image: loadSheet(src), dirs: 16, frames: 1, frameSize: TITAN_CELL };
}

export const TITAN_SPRITE: UnitSpriteDef = {
  image: loadSheet(titanLegsUrl),
  dirs: 16,
  frames: 8,
  frameSize: TITAN_CELL,
  fps: 8,
  drawSize: TITAN_DRAW,
  contactY: TITAN_CONTACT_Y,
  turret: titanOverlay(titanTorsoUrl),
  gun: titanOverlay(titanGunUrl),
  facingSpace: "world",
};

/** Outriggers down, torso lowered onto the planted hips. Same cell, scale, and contact. */
export const TITAN_BRACED_SPRITE: UnitSpriteDef = {
  image: loadSheet(titanBracedLegsUrl),
  dirs: 16,
  frames: 1,
  frameSize: TITAN_CELL,
  fps: 1,
  drawSize: TITAN_DRAW,
  contactY: TITAN_CONTACT_Y,
  turret: titanOverlay(titanBracedTorsoUrl),
  gun: titanOverlay(titanBracedGunUrl),
  facingSpace: "world",
};

/**
 * Wading: the mech sunk to just under the pelvis, pool and ripples baked into the
 * leg sheet like the infantry swim sheet. Same cell, scale, and contact as dry land.
 */
export const TITAN_WADE_SPRITE: UnitSpriteDef = {
  image: loadSheet(titanWadeLegsUrl),
  dirs: 16,
  frames: 8,
  frameSize: TITAN_CELL,
  fps: 8,
  drawSize: TITAN_DRAW,
  contactY: TITAN_CONTACT_Y,
  turret: titanOverlay(titanWadeTorsoUrl),
  gun: titanOverlay(titanWadeGunUrl),
  facingSpace: "world",
};

/** Dozer only. The scrap cart is its own sheet so it can swing on the hitch. */
export const HAULER_SPRITE: UnitSpriteDef = {
  image: loadSheet(haulerHullUrl),
  dirs: 16,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: Math.round(38 * MAULER_SCALE * UNIT_VISUAL_SCALE),
  contactY: 0.92,
  facingSpace: "world",
};

/** Towed scrap cart. Same cell and scale as the dozer; row = the cart's own heading. */
export const HAULER_CART_SPRITE: UnitSpriteDef = {
  image: loadSheet(haulerCartUrl),
  dirs: 16,
  frames: 1,
  frameSize: 128,
  fps: 8,
  drawSize: HAULER_SPRITE.drawSize,
  contactY: 0.92,
  facingSpace: "world",
};

export const RIG_SPRITE: UnitSpriteDef = {
  image: loadSheet(rigSheetUrl),
  dirs: 16,
  frames: 1,
  frameSize: 192,
  fps: 6,
  drawSize: Math.round(64 * UNIT_VISUAL_SCALE),
  contactY: 0.9,
  facingSpace: "world",
};

/**
 * Burnt-out hulk on the live sheet's cell, scale, and contact line, so the wreck
 * sits where the hull stood (tools/sprites/render_wrecks.py). One layer: the
 * turret, gun, and launcher are baked in where the kill left them.
 */
function wreckSheet(src: string, live: UnitSpriteDef): UnitSpriteDef {
  return {
    image: loadSheet(src),
    dirs: 16,
    frames: 1,
    frameSize: live.frameSize,
    fps: 1,
    drawSize: live.drawSize,
    contactY: live.contactY,
    facingSpace: "world",
  };
}

const WRECK_SPRITES: Partial<Record<EntityType, UnitSpriteDef>> = {
  warden: wreckSheet(wardenWreckUrl, TIGER_SPRITE),
  apocalypse: wreckSheet(apocalypseWreckUrl, APOCALYPSE_SPRITE),
  ss3: wreckSheet(ss3WreckUrl, SS3_SPRITE),
  jagdtiger: wreckSheet(jagdtigerWreckUrl, JAGDTIGER_SPRITE),
  supply: wreckSheet(supplyWreckUrl, SUPPLY_SPRITE),
  nebelwerfer: wreckSheet(nebelwerferWreckUrl, NEBELWERFER_SPRITE),
  hauler: wreckSheet(haulerWreckUrl, HAULER_SPRITE),
  walker: wreckSheet(walkerWreckUrl, WALKER_SPRITE),
  titan: wreckSheet(titanWreckUrl, TITAN_SPRITE),
  mammoth: wreckSheet(mammothWreckUrl, MAMMOTH_SPRITE),
  stuka: wreckSheet(stukaWreckUrl, STUKA_SPRITE),
  fw190: wreckSheet(fw190WreckUrl, FW190_SPRITE),
  bv222: wreckSheet(bv222WreckUrl, BV222_SPRITE),
  // Ships settle on the bottom: the superstructure and turrets are baked into the hulk.
  gunboat: wreckSheet(gunboatWreckUrl, GUNBOAT_SPRITE),
  submarine: wreckSheet(submarineWreckUrl, SUBMARINE_SPRITE),
  battleship: wreckSheet(battleshipWreckUrl, BATTLESHIP_SPRITE),
};

/** The Mauler's cart burns with the dozer. */
export const HAULER_CART_WRECK_SPRITE = wreckSheet(haulerCartWreckUrl, HAULER_CART_SPRITE);

/** The hulk a destroyed hull or downed plane leaves. Undefined for anything without wreck art. */
export function wreckSpriteFor(type: EntityType): UnitSpriteDef | undefined {
  return WRECK_SPRITES[type];
}

const UNIT_SPRITES: Partial<Record<EntityType, UnitSpriteDef>> = {
  rifleman: TROOPER_SPRITE,
  hauler: HAULER_SPRITE,
  walker: WALKER_SPRITE,
  titan: TITAN_SPRITE,
  warden: TIGER_SPRITE,
  apocalypse: APOCALYPSE_SPRITE,
  ss3: SS3_SPRITE,
  jagdtiger: JAGDTIGER_SPRITE,
  supply: SUPPLY_SPRITE,
  gunboat: GUNBOAT_SPRITE,
  submarine: SUBMARINE_SPRITE,
  battleship: BATTLESHIP_SPRITE,
  mammoth: MAMMOTH_SPRITE,
  nebelwerfer: NEBELWERFER_SPRITE,
  artillery: ARTILLERY_SPRITE,
  stuka: STUKA_SPRITE,
  fw190: FW190_SPRITE,
  bv222: BV222_SPRITE,
  drone: DRONE_SPRITE,
  rig: RIG_SPRITE,
};

const INFANTRY_DIE: Partial<Record<EntityType, UnitSpriteDef>> = {
  rifleman: TROOPER_DIE_SPRITE,
  gunner: GUNNER_DIE_SPRITE,
  sniper: SNIPER_DIE_SPRITE,
  atinfantry: ATINFANTRY_DIE_SPRITE,
  rocketer: ROCKETER_DIE_SPRITE,
  pyro: PYRO_DIE_SPRITE,
  mortarman: MORTARMAN_DIE_SPRITE,
  engineer: ENGINEER_DIE_SPRITE,
  medic: MEDIC_DIE_SPRITE,
  droneop: DRONEOP_DIE_SPRITE,
  jumpjet: JUMPJET_DIE_SPRITE,
  cyborg: CYBORG_DIE_SPRITE,
};

/** The one-shot collapse sheet. Undefined for vehicles and buildings. */
export function infantryDieSprite(type: EntityType): UnitSpriteDef | undefined {
  return INFANTRY_DIE[type];
}

export function spriteFor(type: EntityType, stance?: Stance, swimming = false): UnitSpriteDef | undefined {
  if (isInfantryType(type) && swimming) return SWIM_SPRITES[type] ?? INFANTRY_SWIM_SPRITE;
  if (type === "rifleman") {
    if (stance === "crouch") return TROOPER_CROUCH_SPRITE;
    if (stance === "crawl") return TROOPER_CRAWL_SPRITE;
    return TROOPER_SPRITE;
  }
  if (type === "gunner") {
    if (stance === "crouch") return GUNNER_CROUCH_SPRITE;
    if (stance === "crawl") return GUNNER_CRAWL_SPRITE;
    return GUNNER_SPRITE;
  }
  if (type === "sniper") {
    if (stance === "crouch") return SNIPER_CROUCH_SPRITE;
    if (stance === "crawl") return SNIPER_CRAWL_SPRITE;
    return SNIPER_SPRITE;
  }
  if (type === "atinfantry") {
    if (stance === "crouch") return ATINFANTRY_CROUCH_SPRITE;
    if (stance === "crawl") return ATINFANTRY_CRAWL_SPRITE;
    return ATINFANTRY_SPRITE;
  }
  if (type === "rocketer") {
    if (stance === "crouch") return ROCKETER_CROUCH_SPRITE;
    if (stance === "crawl") return ROCKETER_CRAWL_SPRITE;
    return ROCKETER_SPRITE;
  }
  if (type === "pyro") {
    if (stance === "crouch") return PYRO_CROUCH_SPRITE;
    if (stance === "crawl") return PYRO_CRAWL_SPRITE;
    return PYRO_SPRITE;
  }
  if (type === "mortarman") {
    if (stance === "crouch") return MORTARMAN_CROUCH_SPRITE;
    if (stance === "crawl") return MORTARMAN_CRAWL_SPRITE;
    return MORTARMAN_SPRITE;
  }
  if (type === "medic") {
    if (stance === "crouch") return MEDIC_CROUCH_SPRITE;
    if (stance === "crawl") return MEDIC_CRAWL_SPRITE;
    return MEDIC_SPRITE;
  }
  if (type === "jumpjet") {
    if (stance === "crouch") return JUMPJET_CROUCH_SPRITE;
    if (stance === "crawl") return JUMPJET_CRAWL_SPRITE;
    return JUMPJET_SPRITE;
  }
  if (type === "droneop") {
    if (stance === "crouch") return DRONEOP_CROUCH_SPRITE;
    if (stance === "crawl") return DRONEOP_CRAWL_SPRITE;
    return DRONEOP_SPRITE;
  }
  if (type === "engineer") {
    if (stance === "crouch") return ENGINEER_CROUCH_SPRITE;
    if (stance === "crawl") return ENGINEER_CRAWL_SPRITE;
    return ENGINEER_SPRITE;
  }
  if (type === "cyborg") return stance === "crawl" ? CYBORG_CRAWL_SPRITE : CYBORG_SPRITE;
  return UNIT_SPRITES[type];
}

const CRIT_ICONS: Record<Crit, HTMLImageElement> = {
  arm: loadSheet(armIconUrl),
  leg: loadSheet(legIconUrl),
  tracks: loadSheet(tracksIconUrl),
  engine: loadSheet(engineIconUrl),
  lamp: loadSheet(lampIconUrl),
};

export function critIcon(c: Crit): HTMLImageElement {
  return CRIT_ICONS[c];
}

/** Building art. Pad metrics map the ground rectangle onto the tile footprint. */
export interface BuildingSpriteDef {
  image: HTMLImageElement;
  /** Source pixel width of the ground pad (west edge to east edge). */
  padWidth: number;
  /** Source pixel of the pad's south (bottom) contact. */
  padSouthX: number;
  padSouthY: number;
  /** Source pixel at the center of the HP / selection stack, next to the roof. */
  stackX: number;
  stackY: number;
  /** False keeps the pad's hard edge (a non-square footprint, like the Airfield). */
  blend?: boolean;
}

function building(
  src: string,
  padWidth: number,
  padSouthX: number,
  padSouthY: number,
  stackX: number,
  stackY: number,
  blend = true,
): BuildingSpriteDef {
  return { image: loadSheet(src), padWidth, padSouthX, padSouthY, stackX, stackY, blend };
}

const BUILDING_SPRITES: Partial<Record<EntityType, BuildingSpriteDef>> = {
  core: building(coreUrl, 383, 192.5, 390, 140, 50),
  dynamo: building(dynamoUrl, 384, 194, 291, 98, 30),
  armory: building(armoryUrl, 384, 194.5, 310, 120, 48),
  muster: building(musterUrl, 385, 194.5, 333, 278, 52),
  smelter: building(smelterUrl, 384, 194, 393, 138, 90),
  // Hangar, tower, dump, tents. Metrics from tools/sprites/render_airfield.py (airfield.json).
  airfield: building(airfieldUrl, 960, 652, 552, 604, 112, false),
  // Pad and plinth. Metrics from tools/sprites/render_ciws.py (ciws.json).
  ciws: building(ciwsUrl, 192, 126, 186, 126, 82.8),
  // Lab, dome, mast, coil annex. Metrics from tools/sprites/render_research.py (research.json).
  research: building(researchUrl, 384, 210, 324, 150, 70),
  // Ops hut, lattice mast, dish. Metrics from tools/sprites/render_radar.py (radar.json); the stack hangs over the dish.
  radar: building(radarUrl, 384, 210, 354, 216, 58),
  // The pier stands in its pond: a hard edge, no blend onto ground that is not there.
  dock: building(dockUrl, 384, 210, 354, 214, 92, false),
  // Concrete pillbox. Metrics from tools/sprites/render_bunker.py (bunker.json). Turned faces in TURNED_FACES.
  bunker: building(bunkerUrl, 384, 222, 264, 222, 99),
  // Concrete shaft and slitted cab. Metrics from tools/sprites/render_tower.py (tower.json). Turned faces in TURNED_FACES.
  tower: building(towerUrl, 384, 300, 426, 300, 133.8),
  // The CIWS pad under a rocket launcher. Metrics from tools/sprites/render_ram.py (ram.json).
  ram: building(ramUrl, 192, 126, 186, 126, 82.8),
};

/** One turned face as tools/sprites/turn_faces.py writes it: pad metrics in its own cropped pixels. */
interface TurnedFaceInfo {
  file: string;
  ground?: string;
  padWidth: number;
  padSouthX: number;
  padSouthY: number;
  stackX: number;
  stackY: number;
}

const turnedManifests = import.meta.glob("../assets/buildings/*/faces.json", {
  eager: true,
  import: "default",
}) as Record<string, { name: string; faces: TurnedFaceInfo[] }>;

const turnedUrls = import.meta.glob("../assets/buildings/*/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

/** A face whose image is fetched the first time it is drawn, so 24 facings cost nothing until used. */
function lazyBuilding(url: string, info: TurnedFaceInfo, blend: boolean): BuildingSpriteDef {
  const def: BuildingSpriteDef = {
    image: new Image(),
    padWidth: info.padWidth,
    padSouthX: info.padSouthX,
    padSouthY: info.padSouthY,
    stackX: info.stackX,
    stackY: info.stackY,
    blend,
  };
  lazySrc.set(def, url);
  return def;
}
const lazySrc = new WeakMap<BuildingSpriteDef, string>();

function wake(def: BuildingSpriteDef): BuildingSpriteDef {
  const src = lazySrc.get(def);
  if (src) {
    lazySrc.delete(def);
    def.image.src = src;
  }
  return def;
}

/**
 * Buildings the player turns before placing (Bunker, Watch Tower, Airfield): one face per
 * BUILDING_TURN_STEP, each anchored on the south corner of that facing's tile box.
 */
const TURNED_FACES: Partial<Record<EntityType, { props: BuildingSpriteDef[]; ground: BuildingSpriteDef[] }>> = {};
for (const [path, manifest] of Object.entries(turnedManifests)) {
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  const type = manifest.name as EntityType;
  const blend = type !== "airfield";
  const props: BuildingSpriteDef[] = [];
  const ground: BuildingSpriteDef[] = [];
  for (const info of manifest.faces) {
    const url = turnedUrls[dir + info.file];
    if (!url) continue;
    props.push(lazyBuilding(url, info, blend));
    const g = info.ground ? turnedUrls[dir + info.ground] : undefined;
    if (g) ground.push(lazyBuilding(g, info, false));
  }
  if (props.length === BUILDING_FACINGS) TURNED_FACES[type] = { props, ground };
}

/** CIWS gun: 16 rows, each the base image's canvas and anchor (render/ciws.ts). */
export const CIWS_TURRET_SHEET: HTMLImageElement = loadSheet(ciwsTurretUrl);
/** RAM launcher: 16 rows on the CIWS canvas and anchor (render/ram.ts). */
export const RAM_TURRET_SHEET: HTMLImageElement = loadSheet(ramTurretUrl);

/**
 * Flat part of a building that everything standing draws over: the Airfield's
 * strip, hardstands, and revetments. Same canvas and anchor as its props image.
 */
const BUILDING_GROUNDS: Partial<Record<EntityType, BuildingSpriteDef>> = {
  airfield: building(airfieldGroundUrl, 960, 652, 552, 604, 112, false),
};

export function buildingGroundFor(type: EntityType, facing = 0): BuildingSpriteDef | undefined {
  const turned = TURNED_FACES[type];
  if (turned && turned.ground.length === BUILDING_FACINGS && buildingTurnIndex(facing) !== 0) {
    return wake(turned.ground[buildingTurnIndex(facing)]!);
  }
  return BUILDING_GROUNDS[type];
}

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

/** Trunk contact, measured on the keyed sheet. Each entry is a different yaw. */
export const OAK_FACES: PropSprite[] = [
  prop(oak1Url, 433, 785),
  prop(oak2Url, 381, 728),
  prop(oak3Url, 465, 783),
];
export const PINE_FACES: PropSprite[] = [
  prop(pine1Url, 184, 758),
  prop(pine2Url, 278, 756),
  prop(pine3Url, 186, 756),
];
export const BUSH_FACES: PropSprite[] = [
  prop(bush1Url, 221, 278),
  prop(bush2Url, 235, 314),
  prop(bush3Url, 218, 280),
];
export const TUFT_FACES: PropSprite[] = [
  prop(tuft1Url, 143, 315),
  prop(tuft2Url, 140, 329),
  prop(tuft3Url, 233, 334),
];
/** Scrap field dress from `tools/sprites/render_props.py`: hull-chunk heaps, single items, loose shards. */
export const SCRAP_HEAP_FACES: PropSprite[] = [
  prop(scrapHeap1Url, 189, 138),
  prop(scrapHeap2Url, 196, 135),
  prop(scrapHeap3Url, 180, 130),
];
export const SCRAP_PIECE_FACES: PropSprite[] = [
  prop(scrapPiece1Url, 95, 58),
  prop(scrapPiece2Url, 116, 55),
  prop(scrapPiece3Url, 93, 63),
  prop(scrapPiece4Url, 88, 59),
];
export const SCRAP_BIT_FACES: PropSprite[] = [
  prop(scrapBits1Url, 105, 58),
  prop(scrapBits2Url, 71, 49),
  prop(scrapBits3Url, 53, 79),
];
/** Map dress from `tools/sprites/render_props.py`. Contact is printed by that script. */
export const BOULDER_FACES: PropSprite[] = [
  prop(boulder1Url, 149, 182),
  prop(boulder2Url, 188, 157),
  prop(boulder3Url, 130, 184),
];
export const STONE_FACES: PropSprite[] = [prop(stones1Url, 105, 95), prop(stones2Url, 126, 97)];
export const STUMP_FACES: PropSprite[] = [prop(stump1Url, 113, 125), prop(stump2Url, 100, 124)];
/** Contact is the post foot; boards overhang to either side. */
export const SIGN_FACES: PropSprite[] = [prop(signpost1Url, 171, 300), prop(signpost2Url, 25, 300)];

/** Flat shell crater. Contact is the pit; `bowl` is that pit's width in source pixels. */
export interface CraterSprite extends PropSprite {
  bowl: number;
}

function crater(src: string, contactX: number, contactY: number, bowl: number): CraterSprite {
  return { image: loadSheet(src), contactX, contactY, bowl };
}

export const CRATER_FACES: CraterSprite[] = [
  // tools/sprites/render_craters.py prints these.
  crater(crater1Url, 270, 135, 240),
  crater(crater2Url, 270, 135, 240),
  crater(crater3Url, 270, 135, 240),
  crater(crater4Url, 270, 135, 240),
  crater(crater5Url, 270, 135, 240),
  crater(crater6Url, 270, 135, 240),
];
/** Rail runs down-right (world +x). Contact is midway between the post bases. */
export const FENCE_X = prop(fenceXUrl, 300, 525);
/** Rail runs down-left (world +y). */
export const FENCE_Y = prop(fenceYUrl, 307, 480);
export const WATER_TEX = loadSheet(waterUrl);
export const WATER_TEX_B = loadSheet(waterBUrl);
export const GRASS_TEXS: HTMLImageElement[] = [
  loadSheet(grassMeadowUrl),
  loadSheet(grassDryUrl),
  loadSheet(grassDampUrl),
];
export const DIRT_TEX = loadSheet(dirtUrl);
export const ROCK_TEX = loadSheet(rockTexUrl);

export const PROP_IMAGES: HTMLImageElement[] = [
  ...OAK_FACES.map((f) => f.image),
  ...PINE_FACES.map((f) => f.image),
  ...BUSH_FACES.map((f) => f.image),
  ...TUFT_FACES.map((f) => f.image),
  ...SCRAP_HEAP_FACES.map((f) => f.image),
  ...SCRAP_PIECE_FACES.map((f) => f.image),
  ...SCRAP_BIT_FACES.map((f) => f.image),
  ...CRATER_FACES.map((f) => f.image),
  ...BOULDER_FACES.map((f) => f.image),
  ...STONE_FACES.map((f) => f.image),
  ...STUMP_FACES.map((f) => f.image),
  ...SIGN_FACES.map((f) => f.image),
  FENCE_X.image,
  FENCE_Y.image,
  WATER_TEX,
  WATER_TEX_B,
  ...GRASS_TEXS,
  DIRT_TEX,
  ROCK_TEX,
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
  /** Fog veil opacity over the prop's own pixels. */
  veil = 0,
): boolean {
  const blit = propBlit(def, drawH, flip);
  if (!blit) return false;
  const scale = blit.height / def.image.naturalHeight;
  const cx = (flip ? def.image.naturalWidth - def.contactX : def.contactX) * scale;
  const cy = def.contactY * scale;
  ctx.drawImage(veil > 0 ? veiledCopy(blit, veil) : blit, x - cx, y - cy);
  return true;
}

export function buildingSpriteFor(type: EntityType, facing = 0): BuildingSpriteDef | undefined {
  if (isCivilianType(type)) {
    const faces = CIV_FACES[type];
    return faces[buildingFaceIndex(facing) % faces.length];
  }
  const turned = TURNED_FACES[type];
  if (turned && buildingTurnIndex(facing) !== 0) return wake(turned.props[buildingTurnIndex(facing)]!);
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

function sheetDir(
  def: { dirs: number; facingSpace?: "screen" | "world" },
  isoDx: number,
  isoDy: number,
  facing?: number,
): number {
  const n = def.dirs;
  if (isoDx !== 0 || isoDy !== 0) return engineRowFromScreen(isoDx, isoDy) % n;
  if (facing != null && Number.isFinite(facing)) return engineRowFromFacing(facing) % n;
  return 0;
}

/**
 * Snap a screen-space armor spark onto painted hull/turret/gun pixels.
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
  facing?: number,
  turretFacing?: number,
): { x: number; y: number } | null {
  if (!spriteReady(def) || def.drawSize <= 0 || def.frameSize <= 0) return null;
  const hullMap = unitSheetAlpha(def.image);
  if (!hullMap) return null;
  const dir = sheetDir(def, isoDx, isoDy, facing);
  const hull = { map: hullMap, sx: 0, sy: dir * def.frameSize, cell: def.frameSize };
  let turret: { map: BuildingAlphaMap; sx: number; sy: number; cell: number } | null = null;
  const overlay = def.turret;
  if (overlay && spriteReady(overlay)) {
    const tmap = unitSheetAlpha(overlay.image);
    if (tmap) {
      const tdir = sheetDir(
        { dirs: overlay.dirs, facingSpace: def.facingSpace },
        turretDx ?? isoDx,
        turretDy ?? isoDy,
        turretFacing ?? facing,
      );
      turret = { map: tmap, sx: 0, sy: tdir * overlay.frameSize, cell: overlay.frameSize };
    }
  }
  let gun: { map: BuildingAlphaMap; sx: number; sy: number; cell: number } | null = null;
  const barrel = def.gun;
  if (barrel && spriteReady(barrel)) {
    const gmap = unitSheetAlpha(barrel.image);
    if (gmap) {
      const gdir = sheetDir(
        { dirs: barrel.dirs, facingSpace: def.facingSpace },
        turretDx ?? isoDx,
        turretDy ?? isoDy,
        turretFacing ?? facing,
      );
      gun = { map: gmap, sx: 0, sy: gdir * barrel.frameSize, cell: barrel.frameSize };
    }
  }
  const mask = unitDestMaskFromSheets(def.drawSize, hull, turret, gun);
  const dest = unitSpriteDest(groundX, groundY, def.drawSize, def.contactY);
  const snap = snapToUnitHitMask(mask, hitX - dest.x, hitY - dest.y);
  if (!snap) return null;
  return { x: dest.x + snap.x, y: dest.y + snap.y };
}

/** Per sheet, per facing row: painted bounds over every frame of the row, or null for an empty row. */
const paintBoxCache = new WeakMap<HTMLImageElement, (CellBox | null)[]>();

/**
 * Painted bounds of one facing row, unioned over its frames so a walking
 * unit's bars and click target do not bob with the stride.
 */
function sheetRowPaintBox(img: HTMLImageElement, row: number, frames: number, frameSize: number): CellBox | null | undefined {
  if (!img.complete || img.naturalWidth <= 0) return undefined;
  let rows = paintBoxCache.get(img);
  if (!rows) {
    rows = [];
    paintBoxCache.set(img, rows);
  }
  if (rows[row] !== undefined) return rows[row];
  const cols = Math.max(1, Math.min(frames, Math.floor(img.naturalWidth / frameSize)));
  const cell = frameSize;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = cell;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return undefined;
  g.drawImage(img, 0, row * frameSize, cols * frameSize, frameSize, 0, 0, cols * cell, cell);
  let pix: Uint8ClampedArray;
  try {
    pix = g.getImageData(0, 0, cols * cell, cell).data;
  } catch {
    // A tainted sheet reads as empty, so callers fall back once instead of retrying every frame.
    rows[row] = null;
    return null;
  }
  const a = new Uint8Array(cols * cell * cell);
  for (let i = 0, p = 3; i < a.length; i++, p += 4) a[i] = pix[p]!;
  let box: CellBox | null = null;
  for (let f = 0; f < cols; f++) box = unionCellBox(box, alphaCellBox(a, cols * cell, f * cell, cell));
  rows[row] = box;
  return box;
}

/**
 * Screen rect of the painted hull, turret, gun, and roof mount of a unit drawn
 * by `drawUnitSprite` at the same ground point and facings. Null until the
 * sheet has loaded, so callers keep their old cell-sized fallback.
 */
export function unitSpritePaintRect(
  def: UnitSpriteDef,
  x: number,
  y: number,
  isoDx: number,
  isoDy: number,
  opts: {
    facing?: number;
    turretDx?: number;
    turretDy?: number;
    turretFacing?: number;
    mountDx?: number;
    mountDy?: number;
    mountFacing?: number;
  } = {},
): ScreenRect | null {
  if (!spriteReady(def) || def.drawSize <= 0 || def.frameSize <= 0) return null;
  const dir = sheetDir(def, isoDx, isoDy, opts.facing);
  const hull = sheetRowPaintBox(def.image, dir, def.frames, def.frameSize);
  if (hull === undefined) return null;
  let box = hull;
  const tdx = opts.turretDx ?? isoDx;
  const tdy = opts.turretDy ?? isoDy;
  const gunFacing = opts.turretFacing ?? opts.facing;
  const layer = (o: TurretSpriteDef | undefined, dx: number, dy: number, facing: number | undefined) => {
    if (!o || !spriteReady(o)) return;
    const row = sheetDir({ dirs: o.dirs, facingSpace: def.facingSpace }, dx, dy, facing);
    box = unionCellBox(box, sheetRowPaintBox(o.image, row, o.frames, o.frameSize) ?? null);
  };
  layer(def.turret, tdx, tdy, gunFacing);
  layer(def.gun, tdx, tdy, gunFacing);
  layer(def.mount, opts.mountDx ?? tdx, opts.mountDy ?? tdy, opts.mountFacing ?? gunFacing);
  if (!box) return null;
  return cellBoxToDest(box, unitSpriteDest(x, y, def.drawSize, def.contactY));
}

const blendedPads = new WeakMap<BuildingSpriteDef, HTMLCanvasElement | null>();

/** The sprite with its baked pad frayed into the ground (`pad-blend.ts`), built once per def. */
function blendedPad(def: BuildingSpriteDef): CanvasImageSource {
  if (def.blend === false) return def.image;
  const hit = blendedPads.get(def);
  if (hit !== undefined) return hit ?? def.image;
  const w = def.image.naturalWidth;
  const h = def.image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) {
    blendedPads.set(def, null);
    return def.image;
  }
  g.drawImage(def.image, 0, 0);
  try {
    const px = g.getImageData(0, 0, w, h);
    blendPadInPlace(px.data, w, h, def);
    g.putImageData(px, 0, 0);
  } catch {
    blendedPads.set(def, null);
    return def.image;
  }
  blendedPads.set(def, canvas);
  return canvas;
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
  ctx.drawImage(blendedPad(def), southX - def.padSouthX * scale, southY - def.padSouthY * scale, dw, dh);
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

function blitOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: TurretSpriteDef,
  facingSpace: UnitSpriteDef["facingSpace"],
  isoDx: number,
  isoDy: number,
  facing: number | undefined,
  frame: number,
  dx: number,
  dy: number,
  s: number,
): void {
  const dir = sheetDir({ dirs: overlay.dirs, facingSpace }, isoDx, isoDy, facing);
  const f = overlay.frames > 1 ? frame % overlay.frames : 0;
  const cell = overlay.frameSize;
  ctx.drawImage(overlay.image, f * cell, dir * cell, cell, cell, dx, dy, s, s);
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
    facing?: number;
    turretFacing?: number;
    hullShiftX?: number;
    hullShiftY?: number;
    gunShiftX?: number;
    gunShiftY?: number;
    /** Holds this cell instead of the move loop. Clamped to the sheet. */
    frameIndex?: number;
    /** Roof mount's own facing and iso direction. Default: rides the turret. */
    mountFacing?: number;
    mountDx?: number;
    mountDy?: number;
  },
): boolean {
  if (!spriteReady(def)) return false;
  const dir = sheetDir(def, isoDx, isoDy, opts.facing);
  const frame =
    opts.frameIndex != null
      ? Math.min(def.frames - 1, Math.max(0, opts.frameIndex))
      : opts.moving
        ? Math.floor((opts.now / 1000) * def.fps + opts.id * 0.37) % def.frames
        : 0;
  const s = def.drawSize;
  const cell = def.frameSize;
  const sink = unitGroundSink(s);
  const hx = (opts.hullShiftX ?? 0) + x - s / 2;
  const hy = (opts.hullShiftY ?? 0) + y - s * def.contactY + sink;
  const gx = (opts.gunShiftX ?? opts.hullShiftX ?? 0) + x - s / 2;
  const gy = (opts.gunShiftY ?? opts.hullShiftY ?? 0) + y - s * def.contactY + sink;
  const tdx = opts.turretDx ?? isoDx;
  const tdy = opts.turretDy ?? isoDy;
  const gunFacing = opts.turretFacing ?? opts.facing;
  const gunBehind = tdy < 0;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  const gun = def.gun;
  const turret = def.turret;
  if (gunBehind && gun && spriteReady(gun)) {
    blitOverlay(ctx, gun, def.facingSpace, tdx, tdy, gunFacing, frame, gx, gy, s);
  }
  ctx.drawImage(def.image, frame * cell, dir * cell, cell, cell, hx, hy, s, s);
  if (turret && spriteReady(turret)) {
    blitOverlay(ctx, turret, def.facingSpace, tdx, tdy, gunFacing, frame, hx, hy, s);
  }
  if (!gunBehind && gun && spriteReady(gun)) {
    blitOverlay(ctx, gun, def.facingSpace, tdx, tdy, gunFacing, frame, gx, gy, s);
  }
  // The roof mount sits above everything else on the hull, and rides the turret's recoil-free spot.
  const mount = def.mount;
  if (mount && spriteReady(mount)) {
    const mdx = opts.mountDx ?? tdx;
    const mdy = opts.mountDy ?? tdy;
    blitOverlay(ctx, mount, def.facingSpace, mdx, mdy, opts.mountFacing ?? gunFacing, frame, hx, hy, s);
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
  turretFacing?: number,
): boolean {
  const def = SCOUT_HEAD_SPRITE;
  if (!spriteReady(def)) return false;
  const dir = sheetDir(def, turretDx, turretDy, turretFacing);
  const s = def.drawSize;
  const cell = def.frameSize;
  const len = Math.hypot(turretDx, turretDy) || 1;
  const ux = turretDx / len;
  const uy = turretDy / len;
  const hx = x + ux * hullSize * -0.04;
  const hy = y + uy * hullSize * -0.04 * 0.45 - hullSize * 0.48 + unitGroundSink(hullSize);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(def.image, 0, dir * cell, cell, cell, hx - s / 2, hy - s * def.contactY, s, s);
  ctx.restore();
  return true;
}
