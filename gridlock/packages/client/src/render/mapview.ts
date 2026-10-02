import {
  AIRFIELD_BACK_DEPTH,
  catalog,
  FW190_WING_GUN_OFFSET,
  clampIsoCamera,
  cloudScale,
  smokeCloudPuffs,
  fires,
  radarLaidOf,
  fieldSpan,
  GUARD_CONE_DEG,
  isCivilianType,
  isFieldStructure,
  isInfantryType,
  isTransportType,
  isStance,
  colorHex,
  entityOnMask,
  facingToIso,
  getMap,
  TILE_EMPTY,
  TILE_TREE,
  TILE_WATER,
  TICK_DT,
  burnVariant,
  DRONE_LEASH_TILES,
  PATROL_POINTS_MAX,
  garrisonWindowLift,
  hasScout,
  isGarrisonable,
  immobilized,
  heightAt,
  infantryGunFor,
  isoDepth,
  isoLift,
  ISO_ELEVATION,
  isoScale,
  TANK_FACE_DIRS,
  TANK_FACE_START_YAW,
  ISO_TILE_H,
  ISO_TILE_W,
  isoToWorld,
  maxHeightOf,
  unitBehindIsoBox,
  pickElevatedTile,
  pointInIsoBox,
  isBuildingType,
  isYardField,
  previewField,
  previewPlace,
  previewYardField,
  fieldLine,
  specialOf,
  specialReady,
  tileOnMask,
  decodeVisionRuns,
  visionMaskFromSnapshot,
  mortarArcPoints,
  worldToIso,
  worldToIso3,
  worldToTile,
  type BuildingType,
  type YardFieldType,
  type ClientMessage,
  type CorpseView,
  type EntityType,
  type FieldStructureType,
  type EntityView,
  type IsoPt,
  type MapDef,
  type MatchSnapshot,
  type ShellHoleView,
} from "@gridlock/shared";
import {
  FX_BOOM,
  FX_SMOKE,
  drawCookoffBurst,
  drawFxFrame,
  drawBloodStain,
  drawGroundMiss,
  drawKineticImpact,
  drawShellHole,
  drawWaterDetonation,
  drawMuzzleBlast,
  drawWindowMuzzle,
  drawRicochetSparks,
  drawRicochetTrace,
  armorHitLift,
  AIR_BOMB_BURST_SCALE,
  ROCKET_BURST_SCALE,
  drawAirBurst,
  drawRocketHead,
  drawMortarBurst,
  drawMortarSmoke,
  MORTAR_BURST_MS,
  drawMoveClick,
  drawWreckFire,
  fxFrameAt,
  fxLifeMs,
  isShellCaliber,
  MOVE_CLICK_MS,
  wreckFireAlpha,
  wreckFireCount,
} from "./fx.js";
import { SMOULDER_MS, burstLifeMs, burstSpec, drawExplosion, drawSmoulder, type BurstSpec } from "./explosion.js";
import { aimMoveFace, moveFaceArmed, moveFaceCommand } from "./move-face.js";
import {
  UNIT_VISUAL_SCALE,
  INFANTRY_VISUAL_SCALE,
  OAK_FACES,
  PINE_FACES,
  BUSH_FACES,
  SIGN_FACES,
  STUMP_FACES,
  CRATER_FACES,
  CIWS_TURRET_SHEET,
  RAM_TURRET_SHEET,
  buildingGroundFor,
  buildingOccludeEz,
  buildingSpriteFor,
  buildingStackAt,
  critIcon,
  drawBuildingSprite,
  drawPropSprite,
  type PropSprite,
  drawScoutHead,
  drawUnitSprite,
  infantryDieSprite,
  snapHitToUnitSprite,
  spriteFor,
  spriteReady,
  GUNNER_DIE_SPRITE,
  GUNNER_FIRE_SPRITE,
  HAULER_CART_SPRITE,
  MEDIC_CROUCH_SPRITE,
  MEDIC_CRAWL_SPRITE,
  MEDIC_DIE_SPRITE,
  DRONEOP_CRAWL_SPRITE,
  DRONEOP_CROUCH_SPRITE,
  DRONEOP_DIE_SPRITE,
  DRONEOP_SPRITE,
  JUMPJET_CRAWL_SPRITE,
  JUMPJET_CROUCH_SPRITE,
  JUMPJET_DIE_SPRITE,
  JUMPJET_FIRE_SPRITE,
  JUMPJET_FLY_SPRITE,
  JUMPJET_SPRITE,
  MEDIC_SPRITE,
  CYBORG_CRAWL_FIRE_SPRITE,
  CYBORG_CRAWL_SPRITE,
  CYBORG_DIE_SPRITE,
  CYBORG_FIRE_SPRITE,
  CYBORG_SPRITE,
  TITAN_BRACED_SPRITE,
  TITAN_SPRITE,
  TITAN_WADE_SPRITE,
  MAMMOTH_SPRITE,
  MAMMOTH_WADE_SPRITE,
  MORTARMAN_DIE_SPRITE,
  MORTARMAN_FIRE_SPRITE,
  ENGINEER_BUILD_SPRITE,
  ENGINEER_CRAWL_SPRITE,
  ENGINEER_CROUCH_SPRITE,
  ENGINEER_DIE_SPRITE,
  ENGINEER_FIX_SPRITE,
  ENGINEER_SPRITE,
  TEETH_SPRITE,
  ATINFANTRY_DIE_SPRITE,
  ATINFANTRY_FIRE_SPRITE,
  ROCKETER_DIE_SPRITE,
  ROCKETER_FIRE_SPRITE,
  PYRO_DIE_SPRITE,
  PYRO_FIRE_SPRITE,
  SNIPER_DIE_SPRITE,
  SNIPER_FIRE_SPRITE,
  TROOPER_DIE_SPRITE,
  TROOPER_HANDGUN_SPRITE,
  TROOPER_RIFLE_FIRE_SPRITE,
  unitHitsBuildingSprite,
  type BuildingSpriteDef,
  type UnitSpriteDef,
} from "./sprites.js";
import { drawBuildingAnim } from "./building-fx.js";
import {
  drawTrackKick,
  spawnTrackKickPuffs,
  tankTracksKick,
  trackKickOrigins,
  trackKickPose,
  trackKickTravel,
  treadReachWorld,
  TRACK_KICK_SPACING,
  type TrackKickPuff,
} from "./track-kick.js";
import { followCart, type CartPose } from "./mauler-cart.js";
import { AMMO_PRIMARY_FILL, AMMO_SECONDARY_FILL, ammoBarRatios } from "./ammo-bars.js";
import {
  backtrackPoints,
  claimsShot,
  flameLaunchPoint,
  garrisonFlameNozzle,
  garrisonHeadPoint,
  garrisonMouthLift,
  garrisonMouthPoint,
  shotHostFrom,
} from "./garrison-shot.js";
import { isDoubleClick, sameTypeOnScreen, type ClickMark } from "./same-type-select.js";
import {
  recoilAmounts,
  recoilLayerShift,
  recoilPixels,
  tankGunRecoils,
  type GunRecoil,
} from "./gun-recoil.js";
import {
  drawMuzzleSmoke,
  muzzleSmokePose,
  spawnMuzzleSmoke,
  type MuzzleSmokePuff,
} from "./muzzle-smoke.js";
import { drawGatlingFlash, gatlingMuzzles } from "./gatling-flash.js";
import { roofCiwsMuzzle } from "./roof-ciws.js";
import { CIWS_INTERCEPT_LIFT, CIWS_MUZZLE_REACH, ciwsMuzzleLift, ciwsTurretCell, ciwsTurretRow } from "./ciws.js";
import { INTERCEPT_BURST_SIZE, RAM_MISS_BURST_SIZE, interceptorTrail } from "./ram.js";
import { drawCyborgDeathSparks } from "./cyborg-sparks.js";
import { drawGroundShadow, unitCastsShadow, unitShadowFootprint } from "./unit-shadow.js";
import { buildingShadowFootprint, drawCastShadows, treeShadowFootprint } from "./cast-shadow.js";
import { buildingGroundElev, drawYardWear, wallFootprint, yardWearFootprint } from "./building-ground.js";
import {
  airBurstPuffs,
  backblastPuffs,
  drawRocketPuff,
  ROCKET_PUFF_CAP,
  rocketPuffPose,
  trailPuffs,
  type RocketPuff,
} from "./rocket-smoke.js";
import {
  cookoffParticles,
  drawBodyFlames,
  drawEmbers,
  drawFuelBed,
  drawFireGlow,
  drawFlameParticle,
  drawPilotLight,
  drawScorch,
  drawSoot,
  FIRE_SMOKE_CAP,
  drawTongue,
  FLAME_PARTICLE_CAP,
  fireTongues,
  flameParticleLook,
  jetLanding,
  jetParticles,
  patchHeat,
  rng as flameRng,
  SCORCH_MS,
  stepFlameParticle,
  tonguePose,
  type FlameParticle,
} from "./flame-fx.js";
import { AIR_DRAW_LAYER, aircraftShadowScale, airLiftPx, drawFallingBomb, inAir, lerpAirAlt } from "./aircraft.js";
import { layCrashTrail, layChargeTrail, CRASH_PUFF_CAP, CHARGE_PUFF_CAP } from "./crash-smoke.js";
import { canopySway, drawCanopy, drawCrate, drawMine, troopCanopySpan } from "./airdrop-fx.js";
import { barrageTracers, tracerLandsAt, tracerSpan, type BarrageTracer } from "./barrage-tracer.js";
import { drawSandbags } from "./sandbags.js";
import { drawTrench } from "./trench.js";
import { drawWall, WALL_SLAB_H, wallEndSeal, wallSectionsConnect, wallTopElev } from "./wall.js";
import { pyroNozzleScreen } from "./pyro-nozzle.js";
import { unitGroundSink } from "./unit-hit.js";
import { engineRowFromProjectedFacing, engineRowFromScreen } from "./turntable.js";
import { drawSelectFrame, fieldFrameCorners } from "./select-frame.js";
import { mapZoomAfterWheel, zoomCamAt } from "./camera-zoom.js";
import { drawActionCursor } from "./cursor.js";
import { unitStepping } from "./stepping.js";
import { atInfantrySheet, cyborgSheet, gunnerSheet, heldFrame, jumpJetSheet, medicSheet, mortarmanSheet, pyroSheet, rocketerSheet, sniperSheet, trooperSheet } from "./infantry-visual.js";
import {
  axisFootprint,
  compareDrawOrder,
  CORPSE_DRAW_LAYER,
  type DrawKey,
  GROUND_DECAL_DRAW_LAYER,
  HOLE_DRAW_LAYER,
  STANDING_DRAW_LAYER,
} from "./corpse-depth.js";
import { drawTreeFall, TREE_FALL_MS } from "./tree-fall.js";
import { drawBurnedCorpse, drawBurningTree } from "./burn-draw.js";
import { burnAnimMs, burnDeathPose } from "./burn-death.js";
import { TREE_BURN_MS, treeStamp } from "./tree-burn.js";
import { decorFor, type DecorKind } from "./decor.js";
import { lerpHullPose } from "./hull-lerp.js";
import { canGuardUnit, planeBoardCandidate, resolveHoverAction, type HoverAction } from "./hover-action.js";
import { planColor, withQueue } from "./order-queue.js";
import { guardHeightTag, guardReach, type GuardUnit } from "./guard-reach.js";
import { BuildingVeil, columnPolygon, uniformVeil, veilCells } from "./building-fog.js";
import { FOG_RGB, FogField } from "./fog-field.js";
import { FogFlat, FogGl } from "./fog-gl.js";
import {
  blitTerrain,
  bakeMini,
  bakeTerrain,
  restampMini,
  restampTiles,
  resetTerrainCache,
  treePropKind,
  updateMiniScrap,
  updateScrap,
  whenTerrainArtReady,
  type MiniBake,
  type TerrainBake,
} from "./terrain.js";

/** Special-action key. D pans with W and the arrow keys; A/S are orders. */
export const SPECIAL_HOTKEY = "e";
export const STOP_HOTKEY = "s";
export const ATTACK_MOVE_HOTKEY = "a";
export const PATROL_HOTKEY = "y";
export const ROTATE_HOTKEY = "r";
export const GUARD_HOTKEY = "g";
/** Enter / leave a garrisonable building. */
export const GARRISON_HOTKEY = "u";

const EDGE_SCROLL_KEY = "gridlock.edgeScroll";

/** World span the pyramid sprite is scaled against. Its cell holds far more than the pyramid itself. */
const TEETH_DRAW_WORLD = 56;
/** A field gun must sit still this long (ms) before its crew drops from the trail to the breech. */
const GUN_CREW_SETTLE_MS = 600;
let edgeScroll = localStorage.getItem(EDGE_SCROLL_KEY) === "1";

/** Iso-space px/s for arrow keys, W/D, and optional edge scroll. */
const CAM_PAN_SPEED = 546;

/** Screen-edge camera pan. Off by default; arrows, W, and D always work. */
export function getEdgeScroll(): boolean {
  return edgeScroll;
}

export function setEdgeScroll(on: boolean): void {
  edgeScroll = on;
  localStorage.setItem(EDGE_SCROLL_KEY, on ? "1" : "0");
}

const EXTRUDE: Record<EntityType, number> = {
  core: 62,
  smelter: 50,
  armory: 44,
  muster: 38,
  dynamo: 30,
  airfield: 14,
  ciws: 26,
  research: 40,
  bunker: 18,
  tower: 66,
  ram: 26,
  stuka: 14,
  fw190: 12,
  bv222: 22,
  drone: 8,
  droneop: 26,
  jumpjet: 26,
  rig: 22,
  hauler: 16,
  warden: 28,
  apocalypse: 32,
  ss3: 20,
  jagdtiger: 26,
  rifleman: 26,
  gunner: 26,
  sniper: 26,
  atinfantry: 26,
  rocketer: 26,
  pyro: 26,
  mortarman: 26,
  engineer: 26,
  medic: 26,
  cyborg: 26,
  sandbags: 12,
  wall: 18,
  teeth: 16,
  trench: 6,
  walker: 30,
  titan: 40,
  mammoth: 30,
  nebelwerfer: 22,
  artillery: 14,
  supply: 18,
  cottage: 28,
  shack: 24,
  house: 36,
  barn: 38,
  inn: 36,
  chapel: 42,
  manor: 48,
};

const CIV_FILL = "#b08968";
const HP_FILL_OK = "#6aaa58";
const HP_FILL_MID = "#b8923c";
const HP_FILL_LOW = "#b45448";
const HP_FILL_HOSTILE = "#d24c44";
const HP_FILL_OK_VIVID = "#8fe86a";
const HP_FILL_MID_VIVID = "#f0c44a";
const HP_FILL_LOW_VIVID = "#f25a48";
const HP_FILL_HOSTILE_VIVID = "#ff5a4a";
/** Sprite alpha when a building volume sits in front of a body. */
const OCCLUDED_UNIT_ALPHA = 0.46;
const FIELD_SITE_ALPHA = 0.8;
const UNIT_SIGHT_FADE_MS = 250;

type DrawItem = DrawKey & { run: () => void };
function mixHash(h: number, v: number): number {
  return Math.imul(h ^ (v | 0), 16777619);
}

function ownerAllied(match: MatchSnapshot, ownerId: string | undefined): boolean {
  if (!ownerId) return false;
  const you = match.youPlayerId;
  if (ownerId === you) return true;
  const team = match.players.find((p) => p.playerId === you)?.team ?? 0;
  if (team === 0) return false;
  return match.players.find((p) => p.playerId === ownerId)?.team === team;
}

function isProducerView(e: EntityView): boolean {
  // The Airfield trains too, but its planes park on the strip; it has no rally point.
  return e.kind === "building" && (e.type === "muster" || e.type === "smelter" || e.type === "armory");
}

function hpBarFill(ratio: number, hostile: boolean, vivid = false): string {
  if (hostile) return vivid ? HP_FILL_HOSTILE_VIVID : HP_FILL_HOSTILE;
  if (ratio > 0.45) return vivid ? HP_FILL_OK_VIVID : HP_FILL_OK;
  if (ratio > 0.2) return vivid ? HP_FILL_MID_VIVID : HP_FILL_MID;
  return vivid ? HP_FILL_LOW_VIVID : HP_FILL_LOW;
}

function sameMask(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function snapshotVisKey(match: MatchSnapshot): number {
  let h = 2166136261;
  h = mixHash(h, match.clearedTrees?.length ?? 0);
  for (const e of match.entities) {
    if (e.wreck) continue;
    if (!ownerAllied(match, e.ownerId)) continue;
    h = mixHash(h, e.id);
    h = mixHash(h, e.tileX);
    h = mixHash(h, e.tileY);
    h = mixHash(h, e.garrisonedIn ?? 0);
    h = mixHash(h, e.garrison?.hide ? 1 : 0);
    h = mixHash(h, e.scout?.out ? 1 : 0);
  }
  for (const c of match.smoke ?? []) {
    h = mixHash(h, c.id);
    h = mixHash(h, c.x | 0);
    h = mixHash(h, c.y | 0);
    h = mixHash(h, c.lifeMax > 0 ? ((c.life * 16) / c.lifeMax) | 0 : 0);
  }
  return h;
}

/** Alpha bytes of one sheet row. Null until the image can be read. */
function sheetCellAlpha(img: HTMLImageElement, cell: number, row: number): Uint8ClampedArray | null {
  if (cell <= 0 || !img.complete || img.naturalWidth < cell) return null;
  const y = row * cell;
  if (y + cell > img.naturalHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = cell;
  canvas.height = cell;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, y, cell, cell, 0, 0, cell, cell);
  return g.getImageData(0, 0, cell, cell).data;
}

const DECOR_FACES: Record<DecorKind, readonly PropSprite[]> = {
  bush: BUSH_FACES,
  sign: SIGN_FACES,
  boulder: [],
  stump: STUMP_FACES,
  stones: [],
  crater: [],
};

export class MapView {
  private readonly canvas: HTMLCanvasElement;
  private readonly mini: HTMLCanvasElement;
  /** Swapped for a scratch layer while a fogged building draws; see `drawVeiled`. */
  private ctx: CanvasRenderingContext2D;
  private readonly buildingVeil = new BuildingVeil();
  /** Wall-clock ms a foreign unit first appeared in a snapshot. */
  private unitSeenAt = new Map<number, number>();
  private readonly mctx: CanvasRenderingContext2D;
  private curr: MatchSnapshot;
  private prev: MatchSnapshot | null = null;
  private prevById = new Map<number, EntityView>();
  private snapAt = 0;
  /** Top-left of the viewport in isometric space. */
  private camX = 0;
  private camY = 0;
  /** CSS pixels per iso pixel. 1 is the default; the wheel zooms in and out from here. */
  private zoom = 1;
  private keys = new Set<string>();
  private panning = false;
  private lastMX = 0;
  private lastMY = 0;
  private mouseX = -1;
  private mouseY = -1;
  private winX = -1;
  private winY = -1;
  private overControl = false;
  private raf = 0;
  private lastT = 0;
  private destroyed = false;
  private centered = false;
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Last plain click on one of your units, for double-click select-by-type. */
  private lastClick: ClickMark | null = null;
  private damagedUntil = new Map<number, number>();
  private lastHp = new Map<number, number>();
  private lastScoutHp = new Map<number, number>();
  private explored: Uint8Array | null = null;
  private vis: Uint8Array | null = null;
  private visKey = 0;
  private visRuns: number[] | null = null;
  private exploredMapId = "";
  private clearedApplied = 0;
  private maxElev = 0;
  private terrain: TerrainBake | null = null;
  private miniTerrain: MiniBake | null = null;
  private liveMap: MapDef | null = null;
  private treeStems: { tx: number; ty: number }[] | null = null;
  private fogField: FogField | null = null;
  /** Undefined until first tried; null when WebGL2 is unavailable. */
  private fogGl: FogGl | null | undefined = undefined;
  private fogFlat: FogFlat | null = null;
  /** Every tile counts as known ground: the map is never shrouded. */
  private knownGround: Uint8Array | null = null;
  private miniFog: HTMLCanvasElement | null = null;
  private miniFogCtx: CanvasRenderingContext2D | null = null;
  private miniFogData: ImageData | null = null;
  private ghosts = new Map<number, EntityView>();
  /** Wall-clock ms when a wreck was first drawn; drives hull-fire burnout. */
  private wreckBornAt = new Map<number, number>();
  /** Wall-clock ms of the last small-arms shot from an infantry unit. */
  private infantryShotAt = new Map<number, number>();
  /** Fw 190 barrage streaks in flight, with the gun and impact heights (absolute elevation). */
  private tracers: (BarrageTracer & { z0: number; z1: number })[] = [];
  /** Impact id -> wall-clock ms its barrage streak lands. The impact waits for it. */
  private barrageLandAt = new Map<number, number>();
  private fx: {
    id: number;
    kind: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    at: number;
    caliber?: number;
    blast?: boolean;
    splash?: boolean;
    mortar?: boolean;
    /** Aircraft bomb: the mortar column, larger. */
    bomb?: boolean;
    /** Titan rocket: the mortar column, smaller. */
    rocket?: boolean;
    /** Rocket air burst: elevation of the burst. */
    z?: number;
    /** Rocket met in the air by a CIWS or a RAM interceptor: a small fireball, no column. */
    intercept?: boolean;
    lift?: number;
    /** Screen-x offset from the world ground projection. */
    sx?: number;
    window?: boolean;
    shell?: string;
    /** Center damage of a heavy round. Sizes its ground burst. */
    damage?: number;
  }[] = [];
  private fxIds = new Set<number>();
  /** When each crater was struck, for its smoulder. Holes already there on first sight never smoke. */
  private holeBorn = new Map<number, number>();
  private seenShots = new Set<number>();
  /** Bounced spark origin, snapped to the same hull pixel as the ricochet FX. */
  private bounceTrace = new Map<number, { x: number; y: number; sx: number; lift: number }>();
  /** Last smoke arc of a mortar bomb, kept briefly after it lands. World space. */
  private mortarSmoke = new Map<number, { pts: { x: number; y: number; z: number; u: number }[]; at: number }>();
  /** Where each Titan rocket was first seen, so its smoke trail starts at the pod. World space. */
  private rocketFrom = new Map<number, { x: number; y: number; z: number }>();
  /** Garrison launch: the host the trail is pinned to, and the soldier id that picks the window. */
  private rocketHost = new Map<number, { hostId: number; salt: number }>();
  /** Head of each rocket as of the last frame; the next frame lays trail puffs from here. */
  private rocketLast = new Map<number, { x: number; y: number; z: number }>();
  /** Where a falling plane was last frame, so the smoke column has no gaps. */
  private crashLast = new Map<number, { x: number; y: number; z: number }>();
  /** Black smoke behind planes that are going down. */
  private crashPuffs: RocketPuff[] = [];
  /** Where a charging Walker was last frame, so his exhaust has no gaps. */
  private chargeLast = new Map<number, { x: number; y: number; z: number }>();
  /** Short dark trail behind a Walker charging to detonate. */
  private chargePuffs: RocketPuff[] = [];
  /** Rocket trail, backblast, and air-burst smoke. World space, absolute elevation. */
  private rocketPuffs: RocketPuff[] = [];
  /** Burning fuel from Pyro jets and cook-offs. World ground point, screen height. */
  private flameParticles: FlameParticle[] = [];
  private flameFrameAt = 0;
  private cookOffsSeen = new Set<number>();
  /** Black smoke off burning fuel. Same drift as rocket smoke, sooty colour. `shade` 1 is black. */
  private fireSmoke: RocketPuff[] = [];
  /** Per Pyro: when his newest glob was first seen, where the burst is laid, and the host if he is inside. */
  private jets = new Map<number, { at: number; land: { x: number; y: number }; hostId?: number }>();
  /** Charred ground under each fire, kept after it goes out. `seen` is the last time it burned. */
  private scorches = new Map<number, { x: number; y: number; r: number; born: number; seen: number }>();
  /** When each fire last sent up a smoke puff. */
  private fireSmokeAt = new Map<number, number>();
  /** Leaves and husk from a tree a shell just opened. */
  private treeFalls: { x: number; y: number; at: number; seed: number }[] = [];
  /** A tree a flamethrower force-attack set alight. Wall-clock from `at`. */
  private treeBurns: { x: number; y: number; at: number; seed: number; stamp: ReturnType<typeof treeStamp> | null }[] = [];
  /** Wall-clock start of a burned corpse's char, keyed by corpse id. */
  private burnSeen = new Map<number, number>();
  /** First cleared-tree list is history. Later ones play the fall. */
  private clearedBoot = false;
  private moveClicks: { x: number; y: number; at: number }[] = [];
  private trackKicks: TrackKickPuff[] = [];
  private trackKickLast = new Map<number, { x: number; y: number }>();
  /** Rig tread reach per snapped world face. The painted hull is longer than the collision radius. */
  private rigTread = new Map<number, { back: number; front: number }>();
  private maulerCarts = new Map<number, CartPose>();
  /** Field guns whose crew is on the trail, and when the gun last moved (ms). */
  private gunHaulAt = new Map<number, number>();
  private gunRecoil = new Map<number, GunRecoil>();
  private muzzleSmokes: MuzzleSmokePuff[] = [];
  private occBuildings: {
    x: number;
    y: number;
    w: number;
    h: number;
    ez: number;
    lift: number;
    spr?: BuildingSpriteDef;
    southX: number;
    southY: number;
    footprintW: number;
  }[] = [];
  selected = new Set<number>();
  placeMode = false;
  /** Defences-tab sandbags or wall, armed before the line is sited. */
  yardArm: YardFieldType | null = null;
  attackMoveMode = false;
  /** Left click adds a point. Right click sends the patrol, or cancels when none are down. */
  patrolMode = false;
  private patrolPoints: { x: number; y: number }[] = [];
  forceAttackMode = false;
  rotateMode = false;
  guardMode = false;
  /** Structure ghost. A click places one piece facing the cursor; a drag lays a wall from press to release. */
  fieldPlace: FieldStructureType | null = null;
  private fieldFacing = Math.PI / 2;
  /** Eased ghost facing so the piece swings instead of snapping. */
  private fieldShown = Math.PI / 2;
  private fieldShownAt = 0;
  private fieldDrag: { x: number; y: number } | null = null;
  private guardAnchor: { x: number; y: number } | null = null;
  private guardFacing = 0;
  private guardDragging = false;
  /** Right-click held on open ground: walk here, then turn to `facing`. */
  private moveFace: {
    ids: number[];
    x: number;
    y: number;
    px: number;
    py: number;
    facing: number;
    armed: boolean;
    at: number;
  } | null = null;
  private ctrlHeld = false;
  /** Shift held: unit orders are queued behind the current ones. */
  private shiftHeld = false;
  /** A queued order went out from an armed click mode during this Shift hold. */
  private queuedFromMode = false;
  onSelect: (ids: number[]) => void = () => {};
  onCommand: (msg: ClientMessage) => void = () => {};

  private command(msg: ClientMessage): void {
    this.onCommand(withQueue(msg, this.shiftHeld));
  }

  /** Shift keeps attack-move, force-attack, and rotate armed so several points can be queued. */
  private keepModeForQueue(): boolean {
    if (!this.shiftHeld) return false;
    this.queuedFromMode = true;
    return true;
  }
  onPlaceMode: () => void = () => {};
  onAttackMoveMode: () => void = () => {};

  setAttackMoveMode(on: boolean): void {
    if (this.attackMoveMode === on) return;
    this.attackMoveMode = on;
    if (on) {
      this.placeMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.fieldPlace = null;
      this.setGuardMode(false);
      this.setPatrolMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setPatrolMode(on: boolean): void {
    if (this.patrolMode === on) {
      if (!on) this.patrolPoints = [];
      return;
    }
    this.patrolMode = on;
    this.patrolPoints = [];
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.fieldPlace = null;
      this.setGuardMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setForceAttackMode(on: boolean): void {
    if (this.forceAttackMode === on) return;
    this.forceAttackMode = on;
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.rotateMode = false;
      this.fieldPlace = null;
      this.setGuardMode(false);
      this.setPatrolMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setRotateMode(on: boolean): void {
    if (this.rotateMode === on) return;
    this.rotateMode = on;
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.fieldPlace = null;
      this.setGuardMode(false);
      this.setPatrolMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setGuardMode(on: boolean): void {
    if (this.guardMode === on) return;
    this.guardMode = on;
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.fieldPlace = null;
      this.setPatrolMode(false);
      this.guardFacing = this.meanSelectedFacing();
    } else {
      this.guardAnchor = null;
      this.guardDragging = false;
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setFieldPlace(structure: FieldStructureType | null): void {
    const next = this.fieldPlace === structure ? null : structure;
    this.fieldPlace = next;
    this.fieldDrag = null;
    if (next) {
      this.placeMode = false;
      this.yardArm = null;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.guardMode = false;
      this.setPatrolMode(false);
      this.guardDragging = false;
      this.fieldFacing = this.meanSelectedFacing();
      this.fieldShown = this.fieldFacing;
      this.fieldShownAt = performance.now();
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  constructor(canvas: HTMLCanvasElement, mini: HTMLCanvasElement, match: MatchSnapshot) {
    const ctx = canvas.getContext("2d");
    const mctx = mini.getContext("2d");
    if (!ctx || !mctx) throw new Error("canvas");
    this.canvas = canvas;
    this.mini = mini;
    this.ctx = ctx;
    this.mctx = mctx;
    this.curr = match;
    this.snapAt = performance.now();
    this.syncAtlases();
    this.revealFrom(match);
    this.bind();
    whenTerrainArtReady(() => {
      if (this.destroyed) return;
      resetTerrainCache();
      this.terrain = null;
      this.miniTerrain = null;
      this.syncAtlases();
    });
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  setSnapshot(match: MatchSnapshot): void {
    this.prev = this.curr;
    this.prevById = new Map(this.prev.entities.map((e) => [e.id, e]));
    this.curr = match;
    this.snapAt = performance.now();
    const now = this.snapAt;
    const live = new Set<number>();
    for (const e of match.entities) {
      live.add(e.id);
      const prev = this.lastHp.get(e.id);
      if (prev !== undefined && e.hp < prev) this.damagedUntil.set(e.id, now + 2000);
      this.lastHp.set(e.id, e.hp);
      const scoutHp = e.scout?.hp;
      if (scoutHp !== undefined) {
        const prevScout = this.lastScoutHp.get(e.id);
        if (prevScout !== undefined && scoutHp < prevScout) this.damagedUntil.set(e.id, now + 2000);
        this.lastScoutHp.set(e.id, scoutHp);
      }
    }
    for (const id of this.lastHp.keys()) {
      if (!live.has(id)) this.lastHp.delete(id);
    }
    for (const id of this.lastScoutHp.keys()) {
      if (!live.has(id)) this.lastScoutHp.delete(id);
    }
    for (const [id, until] of this.damagedUntil) {
      if (!live.has(id) || until < now) this.damagedUntil.delete(id);
    }
    this.noteBarrages(match, now);
    for (const i of match.impacts ?? []) {
      if (i.fromId != null && (i.caliber ?? 0) > 0 && (i.caliber ?? 0) < 40 && i.kind !== "crush") {
        const shooter = match.entities.find((e) => e.id === i.fromId);
        if (shooter && isInfantryType(shooter.type) && !shooter.wreck) this.infantryShotAt.set(shooter.id, now);
      }
      if (i.kind === "crush") continue;
      if (i.cookoff) {
        // A fuel fireball, not a shell burst: it has its own particles and smoke.
        if (!this.cookOffsSeen.has(i.id)) {
          if (this.cookOffsSeen.size > 200) this.cookOffsSeen.clear();
          this.cookOffsSeen.add(i.id);
          this.cookOffFx(i.x, i.y, i.id, now);
        }
        continue;
      }
      if (i.rocket && i.z != null && !this.fxIds.has(i.id)) {
        this.rocketPuffs.push(...airBurstPuffs(i.x, i.y, i.z, now, i.id));
      }
      const fx: MapView["fx"][number] = { ...i, at: this.barrageLandAt.get(i.id) ?? now };
      // A rocket burst in the air by a CIWS stays where it was: no hull to snap to, no ground smoke.
      if (i.intercept) {
        // A RAM's interceptor leaves a smoke line from the cells to the burst.
        const mount = i.fromId != null && !this.fxIds.has(i.id) ? match.entities.find((e) => e.id === i.fromId) : undefined;
        if (mount?.type === "ram") {
          const line = interceptorTrail(mount, i, this.elevAt(mount.x, mount.y), this.elevAt(i.x, i.y));
          this.rocketPuffs.push(...trailPuffs(line.from, line.to, now, (i.id * 2654435761) >>> 0));
        }
        this.addFx(fx);
        continue;
      }
      this.snapHullFx(fx);
      this.addFx(fx);
      if (i.kind === "kill" && i.blast) {
        this.addFx({ id: i.id + 7_000_000, kind: "smoke", x: i.x, y: i.y, vx: 0, vy: 0, at: now });
      }
    }
    this.bindBounceTraces(match);
    if (this.seenShots.size > 400) this.seenShots.clear();
    for (const p of match.projectiles) {
      if (p.bounced || this.seenShots.has(p.id)) continue;
      this.seenShots.add(p.id);
      const shooter = match.entities.find((e) => e.id === p.fromId);
      if (p.flame) {
        // A new glob: the trigger is still held. The jet itself is drawn per frame from his nozzle.
        if (shooter?.type === "pyro" && !shooter.wreck) this.infantryShotAt.set(shooter.id, now);
        const host = this.garrisonShotHost(shooter, p);
        this.jets.set(p.fromId, { at: now, land: jetLanding(p), hostId: host?.id });
        if (host) this.flashAperture(host, p, now, true);
        continue;
      }
      if (p.mortar) {
        if (shooter?.type === "mortarman" && !shooter.wreck) this.infantryShotAt.set(shooter.id, now);
        if (p.big && shooter?.type === "artillery" && !shooter.wreck) this.noteFieldGunShot(shooter, p, now);
        continue;
      }
      if (p.rocket) {
        // Pod or tube flash and backblast. Not a tank shot: the main gun does not recoil.
        const host = this.garrisonShotHost(shooter, p);
        if (host) this.flashAperture(host, p, now, false);
        else {
          this.rocketFrom.set(p.id, { x: p.x, y: p.y, z: p.z ?? 0 });
          if (shooter && !shooter.wreck) {
            this.rocketPuffs.push(
              ...backblastPuffs({
                x: shooter.x,
                y: shooter.y,
                z: p.z ?? 0,
                ground: this.elevAt(shooter.x, shooter.y),
                dirX: p.vx,
                dirY: p.vy,
                now,
                seed: (p.id * 2246822519) >>> 0,
              }),
            );
          }
          this.addFx({
            id: p.id + 8_000_000,
            kind: "muzzle",
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            at: now,
            caliber: 20,
            lift: isoLift(p.z ?? 0) - isoLift(this.elevAt(p.x, p.y)),
          });
        }
        if (shooter?.type === "rocketer" && !shooter.wreck) this.infantryShotAt.set(shooter.id, now);
        continue;
      }
      const fromGarrison =
        !!shooter?.garrisonedIn || (!shooter && !isShellCaliber(p.caliber) && !!this.houseAt(p.x, p.y));
      if (fromGarrison) {
        const house = this.houseAt(p.x, p.y) ?? (shooter?.garrisonedIn
          ? match.entities.find((e) => e.id === shooter.garrisonedIn)
          : undefined);
        this.addFx({
          id: p.id + 8_000_000,
          kind: "muzzle",
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          at: now,
          caliber: p.caliber,
          lift: house ? garrisonWindowLift(house.type, p.id) : 22,
          window: true,
        });
        continue;
      }
      this.noteTankShot(shooter, p, now);
    }
    for (const i of match.impacts ?? []) {
      if (!isShellCaliber(i.caliber) || i.fromId == null || i.rocket) continue;
      if (i.kind === "puff" && i.shell !== "smoke") continue;
      const rec = this.gunRecoil.get(i.fromId);
      if (rec && now - rec.at < 2000) continue;
      const shooter = match.entities.find((e) => e.id === i.fromId);
      if (!shooter || shooter.garrisonedIn) continue;
      const dx = i.x - shooter.x;
      const dy = i.y - shooter.y;
      const sp = Math.hypot(dx, dy) || 1;
      const reach = catalog(shooter.type).radius + 2;
      this.noteTankShot(
        shooter,
        {
          id: i.id,
          x: shooter.x + (dx / sp) * reach,
          y: shooter.y + (dy / sp) * reach,
          vx: dx,
          vy: dy,
          caliber: i.caliber ?? 0,
          fromId: i.fromId,
        },
        now,
      );
    }
    if (this.wreckBornAt.size > 0) {
      const liveWrecks = new Set<number>();
      for (const e of match.entities) if (e.wreck) liveWrecks.add(e.id);
      for (const id of this.wreckBornAt.keys()) {
        if (!liveWrecks.has(id)) this.wreckBornAt.delete(id);
      }
    }
    for (const id of this.infantryShotAt.keys()) {
      if (!live.has(id)) this.infantryShotAt.delete(id);
    }
    for (const id of [...this.selected]) {
      if (!match.entities.some((e) => e.id === id)) this.selected.delete(id);
    }
    if (this.attackMoveMode && this.ownSelectedIds().length === 0) this.setAttackMoveMode(false);
    if (this.patrolMode && this.ownSelectedIds().length === 0) this.setPatrolMode(false);
    if (this.forceAttackMode && this.ownForceIds().length === 0) this.setForceAttackMode(false);
    if (this.rotateMode && this.ownAimIds().length === 0) this.setRotateMode(false);
    if (this.guardMode && this.ownSelectedIds().length === 0) this.setGuardMode(false);
    if (this.fieldPlace && !this.curr.entities.some((e) => this.selected.has(e.id) && e.type === "engineer" && e.ownerId === this.curr.youPlayerId)) {
      this.fieldPlace = null;
      this.onPlaceMode();
    }
    if (!this.placeMode) this.yardArm = null;
    if (this.yardArm && this.curr.you.structureQueue) this.yardArm = null;
    const placing = this.placeMode;
    if (!this.placingKind() && !this.yardArm) this.placeMode = false;
    if (this.placeMode !== placing) this.onPlaceMode();
    this.syncAtlases();
    this.revealFrom(match);
  }

  private syncAtlases(): void {
    const map = this.map();
    this.maxElev = maxHeightOf(map);
    if (!this.terrain) this.terrain = bakeTerrain(map, this.curr.scrap);
    else updateScrap(this.terrain, map, this.curr.scrap);
    if (!this.miniTerrain) this.miniTerrain = bakeMini(map, this.curr.scrap);
    else updateMiniScrap(this.miniTerrain, map, this.curr.scrap);
    this.applyClearedTrees();
  }

  /**
   * An Fw 190 barrage lands in one tick. Turn its impacts into streaks from the
   * wing guns, near rounds first, and a flash under each wing.
   */
  private noteBarrages(match: MatchSnapshot, now: number): void {
    const byPlane = new Map<number, NonNullable<MatchSnapshot["impacts"]>>();
    for (const i of match.impacts ?? []) {
      if (i.fromId == null || this.fxIds.has(i.id) || this.barrageLandAt.has(i.id)) continue;
      const list = byPlane.get(i.fromId);
      if (list) list.push(i);
      else byPlane.set(i.fromId, [i]);
    }
    for (const [fromId, hits] of byPlane) {
      const plane = match.entities.find((e) => e.id === fromId);
      if (plane?.type !== "fw190" || !plane.air) continue;
      const gap = catalog("fw190").radius * FW190_WING_GUN_OFFSET;
      const z0 = this.elevAt(plane.x, plane.y) + plane.air.alt;
      const streaks = barrageTracers(plane, hits, gap, now);
      for (const tr of streaks) {
        // A round that met a plane ends at that plane's height; the rest come down in the dirt.
        const aloft = match.entities.find(
          (e) => e.id !== fromId && e.air && e.air.alt > 0.5 && Math.hypot(e.x - tr.x1, e.y - tr.y1) < 24,
        );
        const z1 = this.elevAt(tr.x1, tr.y1) + (aloft?.air?.alt ?? 0);
        this.tracers.push({ ...tr, z0, z1 });
        this.barrageLandAt.set(tr.id, tracerLandsAt(tr));
      }
      for (const wing of [1, -1] as const) {
        const first = streaks.find((tr) => tr.wing === wing);
        if (!first) continue;
        this.addFx({
          id: first.id + 9_000_000,
          kind: "muzzle",
          x: first.x0,
          y: first.y0,
          vx: first.x1 - first.x0,
          vy: first.y1 - first.y0,
          at: now,
          caliber: 30,
          lift: airLiftPx(plane.air.alt),
        });
      }
    }
    if (this.barrageLandAt.size > 600) {
      for (const [id, at] of this.barrageLandAt) if (at < now - 2000) this.barrageLandAt.delete(id);
    }
  }

  /** Glowing streaks of an Fw 190 barrage, gun to impact. */
  private drawBarrageTracers(): void {
    if (this.tracers.length === 0) return;
    const now = performance.now();
    const ctx = this.ctx;
    const keep: typeof this.tracers = [];
    ctx.save();
    ctx.lineCap = "round";
    for (const tr of this.tracers) {
      if (now > tracerLandsAt(tr)) continue;
      keep.push(tr);
      const span = tracerSpan(tr, now);
      if (!span) continue;
      const at = (u: number) =>
        this.toScreen(tr.x0 + (tr.x1 - tr.x0) * u, tr.y0 + (tr.y1 - tr.y0) * u, tr.z0 + (tr.z1 - tr.z0) * u);
      const head = at(span.head);
      const tail = at(span.tail);
      ctx.strokeStyle = "rgba(255, 170, 60, 0.35)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 236, 170, 0.95)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
    }
    ctx.restore();
    this.tracers = keep;
  }

  private addFx(f: MapView["fx"][number]): void {
    if (this.fxIds.has(f.id)) return;
    this.fxIds.add(f.id);
    this.fx.push(f);
  }

  private noteTankShot(
    shooter: EntityView | undefined,
    shot: { id: number; x: number; y: number; vx: number; vy: number; caliber: number; fromId: number },
    now: number,
  ): void {
    if (!shooter || !isShellCaliber(shot.caliber)) return;
    const spr = spriteFor(shooter.type, shooter.stance, shooter.swimming);
    if (
      !tankGunRecoils({
        hasGun: !!spr?.gun,
        wreck: shooter.wreck,
        garrisonedIn: shooter.garrisonedIn,
      })
    ) {
      return;
    }
    this.gunRecoil.set(shooter.id, { at: now });
    this.muzzleSmokes.push(
      ...spawnMuzzleSmoke({
        x: shot.x,
        y: shot.y,
        dirX: shot.vx,
        dirY: shot.vy,
        now,
        seed: (shot.id * 2654435761 + Math.floor(now)) >>> 0,
        scale: (spr?.drawSize ?? 48) / 48,
      }),
    );
    this.addFx({
      id: shot.id + 8_000_000,
      kind: "muzzle",
      x: shot.x,
      y: shot.y,
      vx: shot.vx,
      vy: shot.vy,
      at: now,
      caliber: shot.caliber,
      lift: Math.round((spr?.drawSize ?? 48) * 0.38),
    });
  }

  /** Field gun: flash and a big smoke puff at the muzzle, out along the barrel. */
  private noteFieldGunShot(shooter: EntityView, shot: { id: number; caliber: number }, now: number): void {
    const spr = spriteFor(shooter.type);
    // The barrel sits at 45°: the muzzle is short of the axle on the ground and high above it.
    const reach = catalog(shooter.type).radius * 1.75;
    const x = shooter.x + Math.cos(shooter.facing) * reach;
    const y = shooter.y + Math.sin(shooter.facing) * reach;
    const dirX = Math.cos(shooter.facing);
    const dirY = Math.sin(shooter.facing);
    this.muzzleSmokes.push(
      ...spawnMuzzleSmoke({
        x,
        y,
        dirX,
        dirY,
        now,
        seed: (shot.id * 2654435761 + Math.floor(now)) >>> 0,
        scale: ((spr?.drawSize ?? 48) / 48) * 1.6,
      }),
    );
    this.addFx({
      id: shot.id + 8_000_000,
      kind: "muzzle",
      x,
      y,
      vx: dirX,
      vy: dirY,
      at: now,
      caliber: shot.caliber,
      lift: Math.round((spr?.drawSize ?? 48) * 0.54),
    });
  }

  private nearestHullEntity(wx: number, wy: number): EntityView | undefined {
    let best: EntityView | undefined;
    let bestD = 40;
    for (const e of this.curr.entities) {
      if (e.kind === "building" || e.garrisonedIn) continue;
      const d = Math.hypot(e.x - wx, e.y - wy);
      const reach = Math.max(40, catalog(e.type).radius * 3);
      if (d < bestD && d < reach) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  /** Pin armor sparks to painted sprite pixels so they don't float in empty canvas. */
  private snapHullFx(f: MapView["fx"][number]): void {
    const guess = armorHitLift(f.kind, f.caliber, f.id, f.blast);
    if (guess == null) return;
    const e = this.nearestHullEntity(f.x, f.y);
    if (!e) {
      f.lift = guess;
      return;
    }
    const spr = spriteFor(e.type, e.stance, e.swimming);
    const ground = this.toScreen(f.x, f.y);
    if (!spr || !spriteReady(spr)) {
      f.lift = guess;
      return;
    }
    const ts = this.ts();
    const ep = this.toScreen(e.x, e.y);
    const dir = facingToIso(e.facing, ts);
    const turretDir = facingToIso(e.turretFacing ?? e.facing, ts);
    const snapped = snapHitToUnitSprite(
      spr,
      ep.x,
      ep.y,
      ground.x,
      ground.y - guess,
      dir.x,
      dir.y,
      turretDir.x,
      turretDir.y,
      e.facing,
      e.turretFacing ?? e.facing,
    );
    if (!snapped) {
      f.lift = guess;
      return;
    }
    f.lift = ground.y - snapped.y;
    f.sx = snapped.x - ground.x;
  }

  private bindBounceTraces(match: MatchSnapshot): void {
    for (const p of match.projectiles) {
      if (!p.bounced || this.bounceTrace.has(p.id)) continue;
      let best: { x: number; y: number; sx: number; lift: number } | null = null;
      let bestD = 80;
      for (const f of this.fx) {
        if (f.kind !== "ricochet") continue;
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < bestD) {
          bestD = d;
          best = { x: f.x, y: f.y, sx: f.sx ?? 0, lift: f.lift ?? 0 };
        }
      }
      if (best) this.bounceTrace.set(p.id, best);
    }
    for (const id of [...this.bounceTrace.keys()]) {
      if (!match.projectiles.some((p) => p.id === id)) this.bounceTrace.delete(id);
    }
  }

  private applyClearedTrees(): void {
    const map = this.map();
    const list = this.curr.clearedTrees ?? [];
    const live = this.clearedBoot;
    this.clearedBoot = true;
    if (list.length <= this.clearedApplied) return;
    const dirty: number[] = [];
    const w = map.width;
    const now = performance.now();
    for (let n = this.clearedApplied; n < list.length; n++) {
      const t = list[n]!;
      if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= map.height) continue;
      const i = t.y * w + t.x;
      if (map.tiles[i] !== TILE_TREE) continue;
      const kind = treePropKind(map, t.x, t.y);
      map.tiles[i] = TILE_EMPTY;
      dirty.push(i);
      if (live) {
        const ts = map.tileSize;
        const x = (t.x + 0.5) * ts;
        const y = (t.y + 0.55) * ts;
        const seed = (t.x * 131 + t.y * 977 + n * 17) >>> 0;
        if (t.burn) {
          this.treeBurns.push({ x, y, at: now, seed, stamp: kind ? treeStamp(t.x, t.y, kind) : null });
        } else {
          this.treeFalls.push({ x, y, at: now, seed });
        }
      }
    }
    this.clearedApplied = list.length;
    if (dirty.length === 0) return;
    this.treeStems = null;
    if (this.terrain) restampTiles(this.terrain, map, dirty, this.curr.scrap);
    if (this.miniTerrain) restampMini(this.miniTerrain, map, dirty, this.curr.scrap);
  }

  private resetFog(map: { id: string; width: number; height: number }): void {
    this.fogField = new FogField(map.width, map.height);
    this.knownGround = new Uint8Array(map.width * map.height).fill(1);
    const mini = document.createElement("canvas");
    mini.width = Math.max(1, map.width);
    mini.height = Math.max(1, map.height);
    const mctx = mini.getContext("2d");
    if (!mctx) return;
    this.miniFog = mini;
    this.miniFogCtx = mctx;
    this.miniFogData = mctx.createImageData(map.width, map.height);
  }

  private revealFrom(match: MatchSnapshot): void {
    const map = this.map();
    const n = map.width * map.height;
    if (!this.explored || this.explored.length !== n || this.exploredMapId !== match.mapId) {
      this.explored = new Uint8Array(n);
      this.exploredMapId = match.mapId;
      this.vis = null;
      this.visKey = 0;
      this.visRuns = null;
      this.clearedApplied = 0;
      this.ghosts.clear();
      this.resetFog(map);
    }
    let vis: Uint8Array;
    if (match.vision) {
      if (this.visRuns === match.vision && this.vis) {
        this.syncGhosts(match, this.vis);
        return;
      }
      this.visRuns = match.vision;
      vis = decodeVisionRuns(match.vision, n);
      if (this.vis && sameMask(this.vis, vis)) {
        this.syncGhosts(match, this.vis);
        return;
      }
    } else {
      const key = snapshotVisKey(match);
      if (this.vis && this.visKey === key) {
        this.syncGhosts(match, this.vis);
        return;
      }
      this.visKey = key;
      vis = visionMaskFromSnapshot(match, map.width, map.height, map.tileSize);
    }
    const first = this.vis == null;
    this.fogField?.set(vis, performance.now(), first);
    this.vis = vis;
    for (let i = 0; i < n; i++) {
      if (vis[i]) this.explored[i] = 1;
    }
    this.rebuildMiniFog(map, n);
    this.syncGhosts(match, vis);
  }

  private syncGhosts(match: MatchSnapshot, vis: Uint8Array): void {
    const map = this.map();
    for (const e of match.entities) {
      if (e.kind === "building" && e.ownerId !== match.youPlayerId) this.ghosts.set(e.id, e);
    }
    for (const [id, g] of this.ghosts) {
      if (match.entities.some((e) => e.id === id)) continue;
      if (entityOnMask(g, vis, map.width, map.height, map.tileSize)) this.ghosts.delete(id);
    }
  }

  private rebuildMiniFog(map: { width: number; height: number }, n: number): void {
    const ctx = this.miniFogCtx;
    const data = this.miniFogData;
    if (!ctx || !data || data.width !== map.width || data.height !== map.height) return;
    const pix = data.data;
    const sight = this.fogField?.next;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      pix[o] = FOG_RGB[0];
      pix[o + 1] = FOG_RGB[1];
      pix[o + 2] = FOG_RGB[2];
      pix[o + 3] = Math.round(150 * (1 - (sight?.[i] ?? 0)));
    }
    ctx.putImageData(data, 0, 0);
  }

  private lit(tx: number, ty: number): boolean {
    const map = this.map();
    if (!this.vis) return true;
    return tileOnMask(this.vis, map.width, tx, ty);
  }

  /** @deprecated */
  setMatch(match: MatchSnapshot): void {
    this.setSnapshot(match);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mouseup", this.onUp);
    window.removeEventListener("mousemove", this.onMove);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  home(): void {
    this.centerOnHq();
  }

  private placingKind(): BuildingType | YardFieldType | null {
    if (this.curr.you.placingType) return this.curr.you.placingType;
    const q = this.curr.you.structureQueue;
    return q?.ready ? q.type : null;
  }

  private readyBuilding(): BuildingType | null {
    const type = this.placingKind();
    return type && isBuildingType(type) ? type : null;
  }

  /** Armed Defences-tab sandbags or wall. The engineer's field button wins when both are on. */
  private readyYardField(): YardFieldType | null {
    if (!this.placeMode || this.fieldPlace) return null;
    return this.yardArm;
  }

  /** Clicking Wall or Sandbags on the Defences tab sites the line before it builds. */
  armYardField(type: YardFieldType): void {
    this.fieldPlace = null;
    this.fieldDrag = null;
    this.yardArm = type;
    this.placeMode = true;
    this.attackMoveMode = false;
    this.forceAttackMode = false;
    this.rotateMode = false;
    this.guardMode = false;
    this.guardDragging = false;
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  private map() {
    const m = getMap(this.curr.mapId);
    if (!m) throw new Error("missing map");
    if (!this.liveMap || this.liveMap.id !== m.id) {
      this.liveMap = { ...m, tiles: m.tiles.slice() };
      this.treeStems = null;
      this.clearedApplied = 0;
    }
    return this.liveMap;
  }

  private bind(): void {
    window.addEventListener("keydown", this.onKey, { capture: true });
    window.addEventListener("keyup", this.onKeyUp, { capture: true });
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("mousedown", (e) => {
      const { x: mx, y: my } = this.pointerView(e);
      if (e.button === 1) {
        this.panning = true;
        this.lastMX = e.clientX;
        this.lastMY = e.clientY;
        e.preventDefault();
        return;
      }
      this.shiftHeld = e.shiftKey;
      if (e.button === 2) {
        e.preventDefault();
        if (this.patrolMode) {
          if (this.patrolPoints.length > 0) this.commitPatrol();
          else this.setPatrolMode(false);
          return;
        }
        if (this.attackMoveMode || this.forceAttackMode || this.rotateMode || this.guardMode || this.fieldPlace) {
          this.setAttackMoveMode(false);
          this.setForceAttackMode(false);
          this.setRotateMode(false);
          this.setGuardMode(false);
          this.fieldPlace = null;
          this.fieldDrag = null;
          this.onPlaceMode();
          return;
        }
        // Some window managers deliver Ctrl+left click as button 2. That is still force-attack
        // (Drop here, when the selection is only transports).
        if (e.ctrlKey && this.ownForceIds().length) {
          this.commitForceAttack(mx, my);
          return;
        }
        this.onRight(mx, my);
        return;
      }
      if (e.button === 0) {
        this.ctrlHeld = e.ctrlKey;
        if (this.guardMode) {
          if (this.commitGuardUnit(this.hit(mx, my))) return;
          this.beginGuard(mx, my);
          return;
        }
        if (this.fieldPlace || this.readyYardField()) {
          const w = this.screenToWorld(mx, my);
          this.fieldDrag = { x: w.x, y: w.y };
          return;
        }
        if (this.forceAttackMode) {
          this.commitForceAttack(mx, my);
          return;
        }
        if (this.rotateMode) {
          this.commitRotate(mx, my);
          return;
        }
        if (this.attackMoveMode) {
          this.commitAttackMove(mx, my);
          return;
        }
        if (this.patrolMode) {
          this.addPatrolPoint(mx, my);
          return;
        }
        if (e.ctrlKey && this.ownForceIds().length) {
          e.preventDefault();
          this.commitForceAttack(mx, my);
          return;
        }
        const toPlace = this.placeMode ? this.readyBuilding() : null;
        if (toPlace) {
          const tile = this.screenToTile(mx, my);
          this.command({
            type: "cmd.place",
            building: toPlace,
            tx: tile.x,
            ty: tile.y,
          });
          return;
        }
        this.box = { x0: mx, y0: my, x1: mx, y1: my };
      }
    });
    window.addEventListener("mouseup", this.onUp);
    window.addEventListener("mousemove", this.onMove);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.mini.addEventListener("mousedown", (e) => {
      const map = this.map();
      const rect = this.mini.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const scale = Math.min(rect.width / map.width, rect.height / map.height);
      const tileX = mx / scale;
      const tileY = my / scale;
      const view = this.viewSize();
      const iso = worldToIso(tileX * map.tileSize, tileY * map.tileSize, map.tileSize);
      this.camX = iso.x - view.w / 2;
      this.camY = iso.y - view.h / 2;
      this.clamp();
    });
  }

  private onUp = (e: MouseEvent): void => {
    if (e.button === 1) this.panning = false;
    if (e.button === 2 && this.moveFace) {
      this.commitMoveFace();
      return;
    }
    if (e.button === 0 && this.guardDragging) {
      this.commitGuard(this.mouseX, this.mouseY);
      return;
    }
    if (e.button === 0 && this.fieldDrag && (this.fieldPlace || this.readyYardField())) {
      this.commitField();
      this.fieldDrag = null;
      return;
    }
    if (e.button === 0 && this.box) {
      const b = this.box;
      this.box = null;
      const dx = Math.abs(b.x1 - b.x0);
      const dy = Math.abs(b.y1 - b.y0);
      if (dx > 6 || dy > 6) this.boxSelect(b, e.shiftKey);
      else this.clickSelect(b.x0, b.y0, e.shiftKey);
    }
  };

  private pointerView(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const z = this.zoom;
    return { x: (e.clientX - rect.left) / z, y: (e.clientY - rect.top) / z };
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.box) return;
    if (this.fieldPlace || this.readyYardField()) {
      this.rotateField(e.deltaY, e.deltaMode);
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    if (cssX < 0 || cssY < 0 || cssX > rect.width || cssY > rect.height) return;
    const next = mapZoomAfterWheel(this.zoom, e.deltaY, e.deltaMode);
    if (next === this.zoom) return;
    const moved = zoomCamAt(this.camX, this.camY, this.zoom, next, cssX, cssY);
    this.zoom = moved.zoom;
    this.camX = moved.camX;
    this.camY = moved.camY;
    this.mouseX = cssX / this.zoom;
    this.mouseY = cssY / this.zoom;
    this.clamp();
    this.syncCursor();
  };

  private onMove = (e: MouseEvent): void => {
    const p = this.pointerView(e);
    this.mouseX = p.x;
    this.mouseY = p.y;
    this.winX = e.clientX;
    this.winY = e.clientY;
    this.overControl =
      e.target instanceof Element &&
      !!e.target.closest("button, input, select, textarea, #minimap, .modal-back");
    if (this.ctrlHeld !== e.ctrlKey) {
      this.ctrlHeld = e.ctrlKey;
      this.syncCursor();
    }
    if (this.panning) {
      this.camX -= (e.clientX - this.lastMX) / this.zoom;
      this.camY -= (e.clientY - this.lastMY) / this.zoom;
      this.lastMX = e.clientX;
      this.lastMY = e.clientY;
      this.clamp();
    }
    if (this.box) {
      this.box.x1 = this.mouseX;
      this.box.y1 = this.mouseY;
    }
    if (this.guardDragging && this.guardAnchor) this.aimGuard(this.mouseX, this.mouseY);
    if (this.moveFace) this.refreshMoveFace();
    this.syncCursor();
  };

  private onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key.toLowerCase();
    if (k === "control") {
      this.ctrlHeld = true;
      this.syncCursor();
      return;
    }
    if (k === "shift") {
      this.shiftHeld = true;
      return;
    }
    if (this.isCameraKey(k)) {
      e.preventDefault();
      this.keys.add(k);
      return;
    }
    if (k === "h") {
      e.preventDefault();
      this.centerOnHq();
      return;
    }
    if (this.isSpeedUpKey(e)) {
      e.preventDefault();
      this.command({ type: "cmd.speed", delta: 1 });
      return;
    }
    if (this.isSpeedDownKey(e)) {
      e.preventDefault();
      this.command({ type: "cmd.speed", delta: -1 });
      return;
    }
    if (e.repeat) return;
    if (k === GUARD_HOTKEY) {
      e.preventDefault();
      const ids = this.ownSelectedIds();
      if (ids.length) this.setGuardMode(!this.guardMode);
      return;
    }
    if (k === GARRISON_HOTKEY) {
      e.preventDefault();
      this.garrisonHotkey();
      return;
    }
    if (k === SPECIAL_HOTKEY) {
      e.preventDefault();
      this.specialSelected();
      return;
    }
    if (k === STOP_HOTKEY) {
      e.preventDefault();
      this.stopSelected();
      return;
    }
    if (k === ATTACK_MOVE_HOTKEY) {
      e.preventDefault();
      const ids = this.ownSelectedIds();
      if (ids.length) this.setAttackMoveMode(!this.attackMoveMode);
      return;
    }
    if (k === PATROL_HOTKEY) {
      e.preventDefault();
      const ids = this.ownSelectedIds();
      if (ids.length) this.setPatrolMode(!this.patrolMode);
      return;
    }
    if (k === ROTATE_HOTKEY) {
      e.preventDefault();
      if (this.fieldPlace || this.readyYardField()) return;
      const ids = this.ownAimIds();
      if (ids.length) this.setRotateMode(!this.rotateMode);
      return;
    }
    if (k === "p") {
      e.preventDefault();
      this.setAttackMoveMode(false);
      this.setForceAttackMode(false);
      this.setRotateMode(false);
      this.setGuardMode(false);
      this.setPatrolMode(false);
      const own = this.curr.entities.filter(
        (ent) =>
          this.selected.has(ent.id) &&
          ent.ownerId === this.curr.youPlayerId &&
          !ent.wreck &&
          ent.kind === "unit",
      );
      if (own.length === 0) return;
      const hold = !own.every((ent) => ent.holdPosition);
      this.command({ type: "cmd.hold", ids: own.map((ent) => ent.id), hold });
      return;
    }
    if (k === "c") {
      e.preventDefault();
      this.stanceHotkey("crouch");
      return;
    }
    if (k === "z") {
      e.preventDefault();
      this.stanceHotkey("crawl");
      return;
    }
    if (k === "j") {
      e.preventDefault();
      this.jetHotkey();
      return;
    }
    if (k === "i") {
      e.preventDefault();
      this.garrisonHideHotkey();
      this.scoutHotkey();
      return;
    }
    if (k === "escape") {
      if (this.attackMoveMode || this.forceAttackMode || this.rotateMode || this.guardMode || this.patrolMode) {
        e.preventDefault();
        this.setAttackMoveMode(false);
        this.setForceAttackMode(false);
        this.setRotateMode(false);
        this.setGuardMode(false);
        this.setPatrolMode(false);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (k === "control") {
      this.ctrlHeld = false;
      this.syncCursor();
    }
    if (k === "shift") {
      this.shiftHeld = false;
      if (this.queuedFromMode) {
        this.queuedFromMode = false;
        this.setAttackMoveMode(false);
        this.setForceAttackMode(false);
        this.setRotateMode(false);
      }
    }
    if (this.isCameraKey(k)) e.preventDefault();
    this.keys.delete(k);
  };

  private onBlur = (): void => {
    this.ctrlHeld = false;
    this.shiftHeld = false;
    this.queuedFromMode = false;
    this.keys.clear();
    this.moveFace = null;
  };

  private isCameraKey(k: string): boolean {
    return k === "w" || k === "d" || k.startsWith("arrow");
  }

  private stopSelected(): void {
    this.moveFace = null;
    this.setAttackMoveMode(false);
    this.setForceAttackMode(false);
    this.setRotateMode(false);
    this.setGuardMode(false);
    this.setPatrolMode(false);
    const ids = this.ownForceIds();
    if (ids.length) this.command({ type: "cmd.stop", ids });
  }

  private aimingForceAttack(): boolean {
    if (this.overControl || this.hoverSpecial) return false;
    if (this.guardMode || this.rotateMode || this.attackMoveMode || this.patrolMode) return false;
    if (this.forceAttackMode) return true;
    return this.ctrlHeld && this.ownForceIds().length > 0;
  }

  private isSpeedUpKey(e: KeyboardEvent): boolean {
    return e.key === "+" || e.key === "=" || e.code === "Equal" || e.code === "NumpadAdd";
  }

  private isSpeedDownKey(e: KeyboardEvent): boolean {
    return e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract";
  }

  private canSpecial(e: EntityView): boolean {
    return e.ownerId === this.curr.youPlayerId && specialReady(e.type, e.state, e.specialCooldown ?? 0);
  }

  private useSpecial(e: EntityView): void {
    if (!this.canSpecial(e)) return;
    if (specialOf(e.type) === "deploy") this.command({ type: "cmd.deploy", id: e.id });
  }

  /** J: selected Jump Jets on the ground take off; if every one is already up, they land. */
  private jetHotkey(): void {
    const you = this.curr.youPlayerId;
    const jets = this.curr.entities.filter(
      (e) => this.selected.has(e.id) && e.ownerId === you && !e.wreck && e.hp > 0 && !!e.jet,
    );
    if (jets.length === 0) return;
    const action = jets.every((e) => e.jet!.up) ? "land" : "up";
    this.command({ type: "cmd.jet", ids: jets.map((e) => e.id), action });
  }

  private stanceHotkey(want: "crouch" | "crawl"): void {
    const you = this.curr.youPlayerId;
    const inf = this.curr.entities.filter(
      (e) =>
        this.selected.has(e.id) &&
        e.ownerId === you &&
        !e.wreck &&
        e.kind === "unit" &&
        isInfantryType(e.type),
    );
    if (inf.length === 0) return;
    const stance = inf.every((e) => (e.stanceOrder ?? e.stance) === want) ? "stand" : want;
    if (!isStance(stance)) return;
    this.command({ type: "cmd.stance", ids: inf.map((e) => e.id), stance });
  }

  private scoutHotkey(): void {
    const you = this.curr.youPlayerId;
    const tanks = this.curr.entities.filter(
      (e) =>
        this.selected.has(e.id) &&
        e.ownerId === you &&
        !e.wreck &&
        e.kind === "unit" &&
        hasScout(e.type) &&
        (e.scout?.hp ?? 0) > 0,
    );
    if (tanks.length === 0) return;
    const out = !tanks.every((e) => e.scout?.out);
    this.command({ type: "cmd.scout", ids: tanks.map((e) => e.id), out });
  }

  private garrisonHideHotkey(): void {
    const you = this.curr.youPlayerId;
    const ids: number[] = [];
    const houses: EntityView[] = [];
    const seen = new Set<number>();
    for (const e of this.curr.entities) {
      if (!this.selected.has(e.id) || e.wreck) continue;
      if (isGarrisonable(e.type) && e.garrison?.ownerId === you && (e.garrison.count ?? 0) > 0) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          houses.push(e);
          ids.push(e.id);
        }
      }
      if (e.ownerId === you && e.garrisonedIn) {
        ids.push(e.id);
        const house = this.curr.entities.find((x) => x.id === e.garrisonedIn);
        if (house && !seen.has(house.id)) {
          seen.add(house.id);
          houses.push(house);
        }
      }
    }
    if (ids.length === 0 || houses.length === 0) return;
    const hide = !houses.every((h) => h.garrison?.hide);
    this.command({ type: "cmd.garrisonhide", ids, hide });
  }

  private garrisonHotkey(): void {
    const you = this.curr.youPlayerId;
    const own = this.curr.entities.filter((e) => this.selected.has(e.id) && e.ownerId === you && !e.wreck);
    const inf = own.filter((e) => e.kind === "unit" && isInfantryType(e.type));
    const house = this.curr.entities.find((e) => this.selected.has(e.id) && isGarrisonable(e.type) && e.hp > 0);
    if (house && inf.length) {
      this.command({ type: "cmd.garrison", ids: inf.map((e) => e.id), buildingId: house.id });
      return;
    }
    const holed = own.filter((e) => e.garrisonedIn);
    if (holed.length) {
      this.command({ type: "cmd.ungarrison", ids: holed.map((e) => e.id) });
      return;
    }
    if (house && house.garrison?.ownerId === you) {
      this.command({ type: "cmd.ungarrison", buildingId: house.id });
    }
  }

  private ownSelectedIds(): number[] {
    return [...this.selected].filter((id) => {
      const ent = this.curr.entities.find((x) => x.id === id);
      return !!ent && ent.ownerId === this.curr.youPlayerId && !ent.wreck && ent.kind === "unit";
    });
  }

  /** Own units plus own CIWS mounts: everything that takes Stop, Rotate, and Force attack. */
  private ownAimIds(): number[] {
    return [...this.selected].filter((id) => {
      const ent = this.curr.entities.find((x) => x.id === id);
      if (!ent || ent.ownerId !== this.curr.youPlayerId || ent.wreck) return false;
      return ent.kind === "unit" || radarLaidOf(ent.type);
    });
  }

  /**
   * Guns, plus a garrison host whose soldiers shoot from inside (a Mammoth,
   * bunker, tower, house, or trench). Rotate stays on ownAimIds.
   */
  private ownForceIds(): number[] {
    const ids = this.ownAimIds();
    const seen = new Set(ids);
    const you = this.curr.youPlayerId;
    for (const id of this.selected) {
      if (seen.has(id)) continue;
      const ent = this.curr.entities.find((e) => e.id === id);
      if (!ent || !this.forceHost(ent, you)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  /** Occupied by you, and not shuttered. A transport bay is not a firing slit. */
  private forceHost(e: EntityView, you: string): boolean {
    if (isTransportType(e.type) || e.hp <= 0 || e.wreck) return false;
    if (e.garrison?.ownerId === you && (e.garrison.count ?? 0) > 0 && !e.garrison.hide) return true;
    if (e.ownerId !== you) return false;
    return this.curr.entities.some((u) => u.garrisonedIn === e.id && u.ownerId === you && fires(u.type));
  }

  private commitAttackMove(px: number, py: number): void {
    const ids = this.ownSelectedIds();
    if (!this.keepModeForQueue()) this.setAttackMoveMode(false);
    if (ids.length === 0) return;
    const hit = this.hit(px, py);
    if (hit && (hit.wreck || hit.ownerId !== this.curr.youPlayerId)) {
      this.command({ type: "cmd.attack", ids, targetId: hit.id });
      return;
    }
    const w = this.screenToWorld(px, py);
    this.pulseMoveClick(w.x, w.y);
    this.command({ type: "cmd.attackmove", ids, x: w.x, y: w.y });
  }

  private commitForceAttack(px: number, py: number): void {
    const you = this.curr.youPlayerId;
    const ids = this.ownForceIds().filter((id) => {
      const ent = this.curr.entities.find((x) => x.id === id);
      // A transport has no gun: its force-attack is the drop.
      return !!ent && (fires(ent.type) || isTransportType(ent.type) || this.forceHost(ent, you));
    });
    if (!this.keepModeForQueue()) this.setForceAttackMode(false);
    if (ids.length === 0) return;
    const hit = this.hit(px, py);
    if (hit && hit.hp > 0 && ids.some((id) => id !== hit.id)) {
      this.command({ type: "cmd.forceattack", ids, x: hit.x, y: hit.y, targetId: hit.id });
      return;
    }
    const w = this.screenToWorld(px, py);
    this.command({ type: "cmd.forceattack", ids, x: w.x, y: w.y });
  }

  private commitRotate(px: number, py: number): void {
    const ids = this.ownAimIds();
    if (!this.keepModeForQueue()) this.setRotateMode(false);
    if (ids.length === 0) return;
    const hit = this.hit(px, py);
    const w = hit ? { x: hit.x, y: hit.y } : this.screenToWorld(px, py);
    this.command({ type: "cmd.rotate", ids, x: w.x, y: w.y });
  }

  private meanSelectedFacing(): number {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const id of this.ownSelectedIds()) {
      const e = this.curr.entities.find((x) => x.id === id);
      if (!e) continue;
      sx += Math.cos(e.facing);
      sy += Math.sin(e.facing);
      n++;
    }
    if (n === 0 || (sx === 0 && sy === 0)) return this.guardFacing;
    return Math.atan2(sy, sx);
  }

  private selectedGuardUnits(): GuardUnit[] {
    const out: GuardUnit[] = [];
    for (const id of this.ownSelectedIds()) {
      const e = this.curr.entities.find((x) => x.id === id);
      if (e) out.push({ type: e.type, gunRangeTiles: infantryGunFor(e)?.rangeTiles });
    }
    return out;
  }

  /** Ground height on the map; `fallback` off its edge. */
  private knownElevAt(wx: number, wy: number, fallback: number): number {
    const map = this.map();
    const tx = worldToTile(wx, map.tileSize);
    const ty = worldToTile(wy, map.tileSize);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return fallback;
    return heightAt(map, tx, ty);
  }

  private beginGuard(px: number, py: number): void {
    if (this.ownSelectedIds().length === 0) {
      this.setGuardMode(false);
      return;
    }
    this.mouseX = px;
    this.mouseY = py;
    this.guardAnchor = this.screenToWorld(px, py);
    this.guardFacing = this.meanSelectedFacing();
    this.guardDragging = true;
  }

  private aimGuard(px: number, py: number): void {
    if (!this.guardAnchor) return;
    const w = this.screenToWorld(px, py);
    const dx = w.x - this.guardAnchor.x;
    const dy = w.y - this.guardAnchor.y;
    if (dx * dx + dy * dy < 64) return;
    this.guardFacing = Math.atan2(dy, dx);
  }

  private commitGuard(px: number, py: number): void {
    const ids = this.ownSelectedIds();
    const anchor = this.guardAnchor;
    this.guardDragging = false;
    if (anchor && px >= 0 && py >= 0) this.aimGuard(px, py);
    const facing = this.guardFacing;
    this.setGuardMode(false);
    if (ids.length === 0 || !anchor) return;
    this.command({ type: "cmd.guard", ids, x: anchor.x, y: anchor.y, facing });
  }

  private commitField(): void {
    const drag = this.fieldDrag;
    const yard = this.readyYardField();
    const structure = this.fieldPlace ?? yard;
    if (!structure || !drag) return;
    const ids = this.fieldPlace
      ? this.curr.entities
          .filter((e) => this.selected.has(e.id) && e.ownerId === this.curr.youPlayerId && e.type === "engineer" && !e.wreck)
          .map((e) => e.id)
      : [];
    if (this.fieldPlace && ids.length === 0) return;
    const w = this.screenToWorld(this.mouseX, this.mouseY);
    const pieces = this.fieldPieces(structure, false);
    const facing = this.fieldFacing;
    const one = pieces[0];
    if (!one) return;
    if (pieces.length > 1) {
      this.command({ type: "cmd.field", ids, structure, x: drag.x, y: drag.y, facing, x2: w.x, y2: w.y });
      return;
    }
    this.command({ type: "cmd.field", ids, structure, x: one.x, y: one.y, facing: one.facing });
  }

  private commitGuardUnit(hit: EntityView | null): boolean {
    if (!hit) return false;
    const ids = this.ownSelectedIds();
    if (
      !canGuardUnit({
        youPlayerId: this.curr.youPlayerId,
        selectedIds: ids,
        hit,
        allied: (id) => ownerAllied(this.curr, id),
      })
    ) {
      return false;
    }
    const guards = ids.filter((id) => id !== hit.id);
    this.setGuardMode(false);
    if (guards.length === 0) return true;
    this.command({ type: "cmd.guard", ids: guards, targetId: hit.id });
    return true;
  }

  private guardHoverTarget(): EntityView | null {
    if (this.guardDragging || this.mouseX < 0 || this.mouseY < 0) return null;
    const hit = this.hit(this.mouseX, this.mouseY);
    if (!hit) return null;
    if (
      !canGuardUnit({
        youPlayerId: this.curr.youPlayerId,
        selectedIds: this.ownSelectedIds(),
        hit,
        allied: (id) => ownerAllied(this.curr, id),
      })
    ) {
      return null;
    }
    return hit;
  }

  private specialSelected(): void {
    for (const id of this.selected) {
      const e = this.curr.entities.find((x) => x.id === id);
      if (e) this.useSpecial(e);
    }
  }

  private viewSize(): { w: number; h: number } {
    const z = this.zoom;
    return { w: this.canvas.clientWidth / z, h: this.canvas.clientHeight / z };
  }

  private clamp(): void {
    const map = this.map();
    const { w, h } = this.viewSize();
    const p = clampIsoCamera(this.camX, this.camY, w, h, map.width, map.height, map.tileSize, this.maxElev);
    this.camX = p.x;
    this.camY = p.y;
  }

  private centerOnHq(): void {
    const map = this.map();
    const { w, h } = this.viewSize();
    if (w < 10 || h < 10) return;
    const hq = this.hq();
    if (!hq) return;
    const ts = map.tileSize;
    const p = worldToIso3(hq.x, hq.y, this.elevAt(hq.x, hq.y), ts);
    const mid = worldToIso((map.width * ts) / 2, (map.height * ts) / 2, ts);
    const inwardX = mid.x - p.x;
    const inwardY = mid.y - p.y;
    this.camX = p.x - w / 2 + Math.sign(inwardX) * Math.min(w * 0.18, Math.abs(inwardX) * 0.25);
    this.camY = p.y - h / 2 + Math.sign(inwardY) * Math.min(h * 0.18, Math.abs(inwardY) * 0.25);
    this.clamp();
    this.centered = true;
  }

  private hq(): EntityView | undefined {
    return (
      this.curr.entities.find((e) => e.id === this.curr.you.hqId) ??
      this.curr.entities.find(
        (e) => e.ownerId === this.curr.youPlayerId && (e.type === "rig" || e.type === "core"),
      )
    );
  }

  private ts(): number {
    return this.map().tileSize;
  }

  private elevAt(wx: number, wy: number): number {
    const map = this.map();
    return heightAt(map, worldToTile(wx, map.tileSize), worldToTile(wy, map.tileSize));
  }

  /** Height a building sits at: its lowest visible corner, so a slope never shows air under it. */
  private buildingElev(b: { tileX: number; tileY: number; tileW: number; tileH: number }): number {
    const map = this.map();
    return buildingGroundElev(map.heights, map.width, map.height, b.tileX, b.tileY, b.tileW, b.tileH);
  }

  private toScreen(wx: number, wy: number, elev?: number): IsoPt {
    const p = worldToIso(wx, wy, this.ts());
    const z = isoLift(elev ?? this.elevAt(wx, wy));
    return { x: p.x - this.camX, y: p.y - this.camY - z };
  }

  private screenToWorldFlat(px: number, py: number): { x: number; y: number } {
    return isoToWorld(px + this.camX, py + this.camY, this.ts());
  }

  private screenToWorld(px: number, py: number): { x: number; y: number } {
    const map = this.map();
    const tile = this.screenToTile(px, py);
    const h = heightAt(map, tile.x, tile.y);
    return isoToWorld(px + this.camX, py + this.camY + isoLift(h), map.tileSize);
  }

  private screenToTile(px: number, py: number): { x: number; y: number } {
    const map = this.map();
    const ts = map.tileSize;
    const picked = pickElevatedTile(
      px + this.camX,
      py + this.camY,
      map.width,
      map.height,
      ts,
      (x, y) => heightAt(map, x, y),
      this.visibleTiles(),
    );
    if (picked) return picked;
    const w = this.screenToWorldFlat(px, py);
    return { x: worldToTile(w.x, ts), y: worldToTile(w.y, ts) };
  }

  /** Screen pixels a plane (or a Jump Jet) sits above its ground point. 0 for everything on the ground. */
  private airLift(e: EntityView): number {
    if (!e.air && !e.jet && e.chute == null) return 0;
    const t = Math.min(1, (performance.now() - this.snapAt) / 100);
    return airLiftPx(lerpAirAlt(this.prevById.get(e.id), e, t));
  }

  private lerpEnt(e: EntityView): { x: number; y: number; facing: number; turretFacing: number } {
    const turretNow = e.turretFacing ?? e.facing;
    const t = Math.min(1, (performance.now() - this.snapAt) / 100);
    const prev = this.prevById.get(e.id);
    if (!prev || t >= 1) return { x: e.x, y: e.y, facing: e.facing, turretFacing: turretNow };
    const snapFacing = isInfantryType(e.type);
    let df = e.facing - prev.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    const turretPrev = prev.turretFacing ?? prev.facing;
    let dt = turretNow - turretPrev;
    while (dt > Math.PI) dt -= Math.PI * 2;
    while (dt < -Math.PI) dt += Math.PI * 2;
    const def = catalog(e.type);
    const hull = def.turnInPlace
      ? lerpHullPose(prev, e, t, def.turnDegPerSec, this.curr.gameSpeed || 1, TICK_DT)
      : {
          x: prev.x + (e.x - prev.x) * t,
          y: prev.y + (e.y - prev.y) * t,
          facing: snapFacing ? e.facing : prev.facing + df * t,
        };
    return {
      x: hull.x,
      y: hull.y,
      facing: hull.facing,
      turretFacing: snapFacing ? turretNow : turretPrev + dt * t,
    };
  }

  private extrude(type: EntityType): number {
    return EXTRUDE[type];
  }

  /**
   * Buildings and field walls sort by their ground footprint, so a unit on
   * the far side of a wall paints under it and a unit on the near side over it.
   */
  private drawKey(e: EntityView): DrawKey {
    const ts = this.ts();
    const span = fieldSpan(e.type);
    if (span) {
      const tx = -Math.sin(e.facing);
      const ty = Math.cos(e.facing);
      return {
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(e.x, e.y),
        foot: { cx: e.x, cy: e.y, ax: tx, ay: ty, halfAlong: span.length / 2, halfAcross: span.thick / 2 },
      };
    }
    if (e.kind === "building") {
      // The Airfield's strip is a ground decal; only its back band of hangar and tower stands.
      const depth = buildingGroundFor(e.type) ? e.tileH * AIRFIELD_BACK_DEPTH : e.tileH;
      const foot = axisFootprint(e.tileX * ts, e.tileY * ts, e.tileW * ts, depth * ts);
      return { layer: STANDING_DRAW_LAYER, z: isoDepth(foot.cx, foot.cy), foot };
    }
    const p = this.lerpEnt(e);
    if (inAir(e)) return { layer: AIR_DRAW_LAYER, z: isoDepth(p.x, p.y) };
    return { layer: STANDING_DRAW_LAYER, z: isoDepth(p.x, p.y), at: { x: p.x, y: p.y } };
  }

  private hit(px: number, py: number): EntityView | null {
    const ts = this.ts();
    const ix = px + this.camX;
    const iy = py + this.camY;
    const keys = new Map(this.curr.entities.map((e) => [e, this.drawKey(e)]));
    const list = [...this.curr.entities].sort((a, b) => compareDrawOrder(keys.get(b)!, keys.get(a)!));
    for (const e of list) {
      if (isFieldStructure(e.type)) {
        const p = this.toScreen(e.x, e.y);
        const span = fieldSpan(e.type);
        const size = span ? Math.max(28, this.groundSpan(e.x, e.y, span.length)) : 48;
        if (px >= p.x - size * 0.55 && px <= p.x + size * 0.55 && py >= p.y - size * 0.7 && py <= p.y + size * 0.25) {
          return e;
        }
        continue;
      }
      if (e.kind === "unit") {
        if (e.garrisonedIn) continue;
        const p = this.lerpEnt(e);
        const spr = this.spriteOf(e);
        if (spr) {
          const s = this.toScreen(p.x, p.y);
          s.y -= this.airLift(e);
          const size = spr.drawSize;
          const top = s.y - size * spr.contactY;
          if (px >= s.x - size * 0.4 && px <= s.x + size * 0.4 && py >= top && py <= top + size) {
            return e;
          }
        } else {
          const r = catalog(e.type).radius * UNIT_VISUAL_SCALE;
          if (
            pointInIsoBox(
              ix,
              iy,
              p.x - r,
              p.y - r,
              r * 2,
              r * 2,
              this.extrude(e.type) * UNIT_VISUAL_SCALE,
              ts,
              isoLift(this.elevAt(p.x, p.y)),
            )
          ) {
            return e;
          }
        }
      } else if (
        pointInIsoBox(
          ix,
          iy,
          e.tileX * ts,
          e.tileY * ts,
          e.tileW * ts,
          e.tileH * ts,
          this.extrude(e.type),
          ts,
          isoLift(this.buildingElev(e)),
        )
      ) {
        return e;
      }
    }
    return null;
  }

  private clickSelect(px: number, py: number, shift: boolean): void {
    const hit = this.hit(px, py);
    const prev = this.lastClick;
    this.lastClick = null;
    if (!hit) {
      if (!shift) this.selected.clear();
      this.onSelect([...this.selected]);
      return;
    }
    if (hit.wreck || hit.ownerId !== this.curr.youPlayerId) {
      this.selected.clear();
      this.selected.add(hit.id);
      this.onSelect([...this.selected]);
      return;
    }
    const mark = { id: hit.id, x: px, y: py, t: performance.now() };
    if (hit.kind === "unit") this.lastClick = mark;
    if (hit.kind === "unit" && !this.canSpecial(hit) && isDoubleClick(prev, mark)) {
      this.lastClick = null;
      const ids = sameTypeOnScreen(this.curr.entities, hit, this.curr.youPlayerId, this.viewSize(), (e) => {
        const p = this.lerpEnt(e);
        return this.toScreen(p.x, p.y);
      });
      if (!shift) this.selected.clear();
      for (const id of ids) this.selected.add(id);
      this.onSelect([...this.selected]);
      return;
    }
    if (!shift && this.selected.size === 1 && this.selected.has(hit.id) && this.canSpecial(hit)) {
      this.useSpecial(hit);
      return;
    }
    if (shift) {
      if (this.selected.has(hit.id)) this.selected.delete(hit.id);
      else this.selected.add(hit.id);
    } else {
      this.selected.clear();
      this.selected.add(hit.id);
    }
    this.onSelect([...this.selected]);
  }

  private boxSelect(b: { x0: number; y0: number; x1: number; y1: number }, shift: boolean): void {
    const x0 = Math.min(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1);
    const x1 = Math.max(b.x0, b.x1);
    const y1 = Math.max(b.y0, b.y1);
    if (!shift) this.selected.clear();
    for (const e of this.curr.entities) {
      if (e.kind !== "unit" || e.ownerId !== this.curr.youPlayerId || e.wreck || e.garrisonedIn) continue;
      const p = this.lerpEnt(e);
      const s = this.toScreen(p.x, p.y);
      if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) this.selected.add(e.id);
    }
    this.onSelect([...this.selected]);
  }

  private onRight(px: number, py: number): void {
    if (this.placeMode || this.fieldPlace || this.yardArm) {
      this.placeMode = false;
      this.yardArm = null;
      this.fieldPlace = null;
      this.fieldDrag = null;
      this.onPlaceMode();
      return;
    }
    const selected = [...this.selected]
      .map((id) => this.curr.entities.find((e) => e.id === id))
      .filter((e): e is EntityView => !!e && !e.wreck && e.hp > 0);
    const you = this.curr.youPlayerId;
    const own = selected.filter((e) => e.ownerId === you);
    if (own.length === 0 && !selected.some((e) => e.garrison?.ownerId === you)) return;
    const producers = own.filter(isProducerView);
    if (producers.length > 0 && !own.some((e) => e.kind === "unit")) {
      const w = this.screenToWorld(px, py);
      this.pulseMoveClick(w.x, w.y);
      this.command({ type: "cmd.rally", ids: producers.map((e) => e.id), x: w.x, y: w.y });
      return;
    }
    const hit = this.hit(px, py);
    const tile = this.screenToTile(px, py);
    const scrap = this.curr.scrap.some((s) => s.x === tile.x && s.y === tile.y && s.yield > 0);
    const action = resolveHoverAction({
      youPlayerId: you,
      selected,
      hit,
      scrap,
      allied: (id) => ownerAllied(this.curr, id),
    });
    if ((action === "repair" || action === "scrap") && hit) {
      const engineers = own.filter((e) => e.type === "engineer");
      if (engineers.length) this.command({ type: "cmd.repair", ids: engineers.map((e) => e.id), targetId: hit.id });
      return;
    }
    if (action === "supply" && hit) {
      const trucks = own.filter((e) => e.type === "supply");
      if (trucks.length) this.command({ type: "cmd.supply", ids: trucks.map((e) => e.id), targetId: hit.id });
      return;
    }
    if (action === "tow" && hit) {
      const trucks = own.filter((e) => e.type === "supply" && !e.bed?.open);
      if (trucks.length) this.command({ type: "cmd.tow", ids: trucks.map((e) => e.id), targetId: hit.id });
      return;
    }
    if (action === "board" && hit) {
      const riders = isTransportType(hit.type)
        ? own.filter((e) => planeBoardCandidate(e) && e.garrisonedIn !== hit.id)
        : own.filter((e) => e.kind === "unit" && isInfantryType(e.type) && e.garrisonedIn !== hit.id);
      if (riders.length) this.command({ type: "cmd.board", ids: riders.map((e) => e.id), truckId: hit.id });
      return;
    }
    if (action === "garrison" && hit) {
      const inf = own.filter((e) => e.kind === "unit" && isInfantryType(e.type) && e.garrisonedIn !== hit.id);
      if (inf.length) this.command({ type: "cmd.garrison", ids: inf.map((e) => e.id), buildingId: hit.id });
      return;
    }
    if (action === "ungarrison" && hit) {
      this.command({ type: "cmd.ungarrison", buildingId: hit.id });
      return;
    }
    if ((action === "attack" || action === "capture") && hit) {
      this.command({ type: "cmd.attack", ids: own.map((e) => e.id), targetId: hit.id });
      return;
    }
    const haulers = own.filter((e) => e.type === "hauler");
    if (action === "gather" && haulers.length) {
      const dest = this.screenToWorld(px, py);
      this.pulseMoveClick(dest.x, dest.y);
      this.command({ type: "cmd.harvest", ids: haulers.map((e) => e.id), tileX: tile.x, tileY: tile.y });
      return;
    }
    if (hit?.type === "smelter" && hit.ownerId === this.curr.youPlayerId && haulers.length) {
      this.pulseMoveClick(hit.x, hit.y);
      this.command({ type: "cmd.move", ids: haulers.map((e) => e.id), x: hit.x, y: hit.y });
      return;
    }
    const drones = own.filter((e) => e.drone && e.drone.opId === hit?.id);
    if (hit?.droneLink && hit.ownerId === you && drones.length) {
      // Right-click the operator: his drone comes home to be stowed.
      this.pulseMoveClick(hit.x, hit.y);
      this.command({ type: "cmd.drone", ids: drones.map((e) => e.id), action: "recall" });
      return;
    }
    const planes = own.filter((e) => !!e.air && !e.drone);
    if (action === "land" && hit && planes.length) {
      // Right-click your own strip: planes go home to land and rearm.
      this.pulseMoveClick(hit.x, hit.y);
      this.command({ type: "cmd.land", ids: planes.map((e) => e.id) });
      return;
    }
    const movers = own.filter((e) => e.kind === "unit");
    if (movers.length === 0) return;
    const w = this.screenToWorld(px, py);
    this.beginMoveFace(movers.map((e) => e.id), w.x, w.y, px, py);
  }

  /** Right button is down on a ground move. Release sends it; a hold aims the arrival heading. */
  private beginMoveFace(ids: number[], x: number, y: number, px: number, py: number): void {
    if (ids.length === 0) return;
    this.mouseX = px;
    this.mouseY = py;
    this.moveFace = {
      ids,
      x,
      y,
      px,
      py,
      facing: this.meanSelectedFacing(),
      armed: false,
      at: performance.now(),
    };
  }

  private refreshMoveFace(): void {
    const g = this.moveFace;
    if (!g) return;
    const drag = Math.hypot(this.mouseX - g.px, this.mouseY - g.py);
    g.armed = moveFaceArmed(g, performance.now(), drag);
    if (!g.armed || this.mouseX < 0 || this.mouseY < 0) return;
    const w = this.screenToWorld(this.mouseX, this.mouseY);
    const aim = aimMoveFace(g, w, g.facing);
    if (aim.aimed) g.facing = aim.facing;
  }

  private commitMoveFace(): void {
    if (!this.moveFace) return;
    this.refreshMoveFace();
    const g = this.moveFace;
    this.moveFace = null;
    if (!g) return;
    this.pulseMoveClick(g.x, g.y);
    this.command(moveFaceCommand(g));
  }

  private pulseMoveClick(x: number, y: number): void {
    this.moveClicks.push({ x, y, at: performance.now() });
    if (this.moveClicks.length > 8) this.moveClicks.splice(0, this.moveClicks.length - 8);
  }

  private frame(t: number): void {
    if (this.destroyed) return;
    const dt = this.lastT ? Math.min(0.05, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    this.fit();
    this.refreshMoveFace();
    if (!this.centered) this.centerOnHq();
    const speed = CAM_PAN_SPEED;
    let vx = 0;
    let vy = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) vy -= 1;
    if (this.keys.has("arrowdown")) vy += 1;
    if (this.keys.has("arrowleft")) vx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) vx += 1;
    const edge = 24;
    if (edgeScroll && !this.panning && !this.box && this.winX >= 0 && !this.overControl) {
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      if (this.winX < edge) vx -= 1;
      if (this.winX > sw - edge) vx += 1;
      if (this.winY < edge) vy -= 1;
      if (this.winY > sh - edge) vy += 1;
    }
    if (vx || vy) {
      const len = Math.hypot(vx, vy) || 1;
      const step = (speed * dt) / this.zoom;
      this.camX += (vx / len) * step;
      this.camY += (vy / len) * step;
      this.clamp();
    }
    this.syncCursor();
    this.draw();
    this.drawMini();
    this.raf = requestAnimationFrame((nt) => this.frame(nt));
  }

  private fit(): void {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.ctx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, 0, 0);
    const mw = Math.max(1, this.mini.clientWidth);
    const mh = Math.max(1, this.mini.clientHeight);
    const mbw = Math.floor(mw * dpr);
    const mbh = Math.floor(mh * dpr);
    if (this.mini.width !== mbw || this.mini.height !== mbh) {
      this.mini.width = mbw;
      this.mini.height = mbh;
    }
    this.mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private visibleTiles(): { x0: number; y0: number; x1: number; y1: number } {
    const map = this.map();
    const { w, h } = this.viewSize();
    const ts = map.tileSize;
    const pad = 80;
    const liftPad = isoLift(this.maxElev) + 48;
    const pts = [
      this.screenToWorldFlat(-pad, -pad - liftPad),
      this.screenToWorldFlat(w + pad, -pad - liftPad),
      this.screenToWorldFlat(-pad, h + pad),
      this.screenToWorldFlat(w + pad, h + pad),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const extra = this.maxElev + 2;
    return {
      x0: Math.max(0, worldToTile(minX, ts) - 1),
      y0: Math.max(0, worldToTile(minY, ts) - 1),
      x1: Math.min(map.width - 1, worldToTile(maxX, ts) + extra),
      y1: Math.min(map.height - 1, worldToTile(maxY, ts) + extra),
    };
  }

  /** Foreign units ease in over `UNIT_SIGHT_FADE_MS` when they enter sight, instead of popping at the soft fog edge. */
  private sightFade(e: EntityView, now: number): number {
    if (e.ownerId === this.curr.youPlayerId) return 1;
    let at = this.unitSeenAt.get(e.id);
    if (at == null) {
      at = this.fogField && this.fogField.version > 1 ? now : -Infinity;
      this.unitSeenAt.set(e.id, at);
    }
    return Math.min(1, Math.max(0, (now - at) / UNIT_SIGHT_FADE_MS));
  }

  /** Soft veil over ground out of sight, laid on the hills. Drawn under everything standing. */
  private drawGroundFog(): void {
    const field = this.fogField;
    if (!field) return;
    const now = performance.now();
    if (this.fogGl === undefined) this.fogGl = FogGl.create();
    const gl = this.fogGl;
    if (gl) {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      gl.setMap(this.map());
      gl.render(field, {
        camX: this.camX,
        camY: this.camY,
        scale: dpr * this.zoom,
        width: this.canvas.width,
        height: this.canvas.height,
        now,
      });
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(gl.canvas, 0, 0);
      ctx.restore();
      return;
    }
    this.fogFlat ??= new FogFlat();
    this.fogFlat.draw(this.ctx, field, this.camX, this.camY, now);
  }

  private draw(): void {
    const ctx = this.ctx;
    const { w, h } = this.viewSize();
    ctx.fillStyle = "#0c1008";
    ctx.fillRect(0, 0, w, h);

    const bake = this.terrain;
    ctx.imageSmoothingEnabled = false;
    if (bake) {
      blitTerrain(ctx, bake, this.camX, this.camY, w, h);
      this.drawGroundFog();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    this.cacheOccluders();

    const liveIds = new Set(this.curr.entities.map((e) => e.id));
    const now = performance.now();
    for (const id of this.unitSeenAt.keys()) if (!liveIds.has(id)) this.unitSeenAt.delete(id);
    const drawList: EntityView[] = [
      ...this.curr.entities,
      ...[...this.ghosts.values()].filter((g) => !liveIds.has(g.id)),
    ];
    const items: DrawItem[] = [];
    const castShadows: IsoPt[][] = [];
    const yardWear: IsoPt[][] = [];
    for (const e of drawList) {
      const ghost = !liveIds.has(e.id);
      // The Airfield is flat ground; its decal would sit in its own shadow.
      if (e.kind === "building" && !isFieldStructure(e.type) && !buildingGroundFor(e.type)) {
        this.pushCastShadow(castShadows, this.buildingShadow(e), w, h);
        this.pushYardWear(yardWear, e, w, h);
      }
      items.push({
        ...this.drawKey(e),
        run: () => {
          if (isFieldStructure(e.type)) this.drawField(e, ghost);
          else if (e.kind === "building") this.drawBuilding(e, ghost);
          else if (!ghost && !e.garrisonedIn && this.unitNearView(e, w, h)) {
            const fade = this.sightFade(e, now);
            const ctx = this.ctx;
            const prev = ctx.globalAlpha;
            ctx.globalAlpha = prev * fade;
            this.drawUnit(e);
            if (e.chute != null) this.drawTroopCanopy(e);
            ctx.globalAlpha = prev;
          }
        },
      });
      if (e.kind === "building" && buildingGroundFor(e.type)) {
        const ts = this.ts();
        items.push({
          layer: GROUND_DECAL_DRAW_LAYER,
          z: isoDepth((e.tileX + e.tileW / 2) * ts, (e.tileY + e.tileH / 2) * ts),
          run: () => this.drawBuildingGround(e, ghost),
        });
      }
    }
    this.collectFieldSites(items);
    this.collectTrees(items, castShadows);
    this.collectDecor(items);
    this.collectTreeBurns(items);
    // Worn yards merge into one patch, under the Airfield strip and every shadow.
    items.push({ layer: GROUND_DECAL_DRAW_LAYER, z: -Infinity, run: () => drawYardWear(this.ctx, yardWear) });
    // One path under craters and unit blobs, so overlapping shadows don't stack.
    items.push({ layer: HOLE_DRAW_LAYER, z: -Infinity, run: () => drawCastShadows(this.ctx, castShadows) });
    this.collectRemains(items);
    this.collectUnitShadows(items);
    this.collectMaulerCarts(items, w, h);
    this.collectGunCrews(items, w, h);
    this.collectTrackKicks(items);
    this.collectMuzzleSmoke(items);
    this.collectFires(items, w, h);
    this.collectAirdrops(items, w, h);
    for (const m of this.takeMoveClicks()) {
      items.push({
        layer: 0,
        z: isoDepth(m.x, m.y),
        run: () => {
          const s = this.toScreen(m.x, m.y);
          drawMoveClick(this.ctx, s.x, s.y, m.t);
        },
      });
    }
    items.sort(compareDrawOrder);
    for (const it of items) it.run();

    for (const p of this.curr.projectiles) {
      if (p.bounced !== true) continue;
      const shell = isShellCaliber(p.caliber);
      const t = Math.min(1, (performance.now() - this.snapAt) / 100);
      const prevP = this.prev?.projectiles.find((q) => q.id === p.id);
      const wx = prevP ? prevP.x + (p.x - prevP.x) * t : p.x;
      const wy = prevP ? prevP.y + (p.y - prevP.y) * t : p.y;
      const a = this.toScreen(wx, wy);
      const origin = this.bounceTrace.get(p.id);
      if (origin) {
        const o = this.toScreen(origin.x, origin.y);
        const flown = Math.hypot(wx - origin.x, wy - origin.y);
        const headLift = origin.lift * (1 - Math.min(1, flown / 56));
        drawRicochetTrace(
          ctx,
          o.x + origin.sx,
          o.y - origin.lift,
          a.x,
          a.y - headLift,
          shell,
        );
      } else {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const tail = this.toScreen(wx - (p.vx / sp) * 8, wy - (p.vy / sp) * 8);
        drawRicochetTrace(ctx, tail.x, tail.y - 7, a.x, a.y - 7, shell);
      }
    }
    this.drawMortarArcs();
    this.drawCrashSmoke();
    this.drawChargeSmoke();
    this.drawRockets();
    this.drawFlames();
    this.drawFallingBombs();
    this.drawTreeFalls();
    this.drawSmokeClouds();
    this.drawImpacts();
    this.drawBarrageTracers();

    const toPlace = this.placeMode ? this.readyBuilding() : null;
    if (toPlace && this.mouseX >= 0) {
      this.drawGhost(toPlace);
    }
    this.drawYardBuild();
    if (this.fieldPlace && this.mouseX >= 0) this.drawFieldGhost(this.fieldPlace, false);
    else if (this.mouseX >= 0) {
      const yard = this.readyYardField();
      if (yard) this.drawFieldGhost(yard, true);
    }

    if (this.box) {
      const b = this.box;
      ctx.strokeStyle = "#e8b84a";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
    this.drawSpecialCursor();
    this.drawHoverCursor();
    this.drawAttackCursor();
    this.drawPatrolCursor();
    this.drawPatrolOverlay();
    this.drawForceCursor();
    this.drawRotateCursor();
    this.drawMoveFaceOverlay();
    this.drawGuardOverlay();
    this.drawRallyOverlay();
    this.drawPlanOverlay();
    this.drawDroneLeash();
  }

  /** Dashed ring of the operator's reach while he or his drone is selected. */
  private drawDroneLeash(): void {
    const you = this.curr.youPlayerId;
    const ops = new Set<number>();
    for (const e of this.curr.entities) {
      if (!this.selected.has(e.id) || e.ownerId !== you) continue;
      if (e.droneLink) ops.add(e.id);
      if (e.drone?.opId != null) ops.add(e.drone.opId);
    }
    if (ops.size === 0) return;
    const r = DRONE_LEASH_TILES * this.ts();
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(120, 200, 230, 0.55)";
    for (const id of ops) {
      const op = this.curr.entities.find((e) => e.id === id);
      if (!op) continue;
      const c = this.lerpEnt(op);
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const s = this.toScreen(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private selectedProducers(): EntityView[] {
    const you = this.curr.youPlayerId;
    return this.curr.entities.filter((e) => this.selected.has(e.id) && e.ownerId === you && e.hp > 0 && isProducerView(e));
  }

  /** Dashed route through each selected unit's Shift-queued orders, one colour per leg. */
  private drawPlanOverlay(): void {
    const you = this.curr.youPlayerId;
    const units = this.curr.entities.filter(
      (e) => this.selected.has(e.id) && e.ownerId === you && e.hp > 0 && !!e.plan?.length,
    );
    if (units.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round";
    for (const u of units) {
      let from = this.toScreen(u.x, u.y);
      for (const p of u.plan!) {
        const to = this.toScreen(p.x, p.y);
        const color = planColor(p.kind);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#140e0a";
        ctx.beginPath();
        ctx.ellipse(to.x, to.y, 4.5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(to.x, to.y, 3, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        from = to;
      }
    }
    ctx.restore();
  }

  /** Line and flag from each selected producer to its rally point, plus a cursor label while only producers are selected. */
  private drawRallyOverlay(): void {
    const producers = this.selectedProducers();
    if (producers.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round";
    for (const b of producers) {
      if (!b.rally) continue;
      const from = this.toScreen(b.x, b.y);
      const to = this.toScreen(b.rally.x, b.rally.y);
      ctx.strokeStyle = "rgba(232, 184, 74, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#140e0a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x, to.y - 18);
      ctx.stroke();
      ctx.strokeStyle = "#e8b84a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#e8b84a";
      ctx.beginPath();
      ctx.moveTo(to.x, to.y - 18);
      ctx.lineTo(to.x + 11, to.y - 14);
      ctx.lineTo(to.x, to.y - 10);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(to.x, to.y, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const onlyBuildings = ![...this.selected].some((id) => {
      const e = this.curr.entities.find((x) => x.id === id);
      return !!e && e.kind === "unit" && e.ownerId === this.curr.youPlayerId;
    });
    if (
      onlyBuildings &&
      !this.aimingForceAttack() &&
      !this.overControl &&
      !this.hoverSpecial &&
      this.mouseX >= 0 &&
      this.mouseY >= 0
    ) {
      ctx.font = "11px 'Share Tech Mono', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#140e0a";
      ctx.strokeText("RALLY", this.mouseX + 14, this.mouseY + 8);
      ctx.fillStyle = "#e8b84a";
      ctx.fillText("RALLY", this.mouseX + 14, this.mouseY + 8);
    }
    ctx.restore();
  }

  private drawForceCursor(): void {
    if (!this.aimingForceAttack()) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ctx = this.ctx;
    const x = this.mouseX;
    const y = this.mouseY;
    ctx.save();
    ctx.strokeStyle = "#e8b84a";
    ctx.fillStyle = "#e8b84a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const ids = this.ownForceIds();
    const drop =
      ids.length > 0 &&
      ids.every((id) => {
        const ent = this.curr.entities.find((u) => u.id === id);
        return !!ent && isTransportType(ent.type);
      });
    const word = drop ? "DROP" : "FIRE";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText(word, x + 12, y + 8);
    ctx.fillText(word, x + 12, y + 8);
    ctx.restore();
  }

  private drawRotateCursor(): void {
    if (!this.rotateMode || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ctx = this.ctx;
    const x = this.mouseX;
    const y = this.mouseY;
    ctx.save();
    ctx.strokeStyle = "#e8b84a";
    ctx.fillStyle = "#e8b84a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, -Math.PI * 0.15, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 6);
    ctx.lineTo(x + 14, y - 1);
    ctx.lineTo(x + 5, y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText("FACE", x + 14, y + 8);
    ctx.fillText("FACE", x + 14, y + 8);
    ctx.restore();
  }

  /** Heading the unit takes after a held move. The mark sits on the destination. */
  private drawMoveFaceOverlay(): void {
    const g = this.moveFace;
    if (!g?.armed || this.mouseX < 0 || this.mouseY < 0) return;
    const ts = this.ts();
    const len = ts * 2.4;
    const facing = g.facing;
    const elev = this.knownElevAt(g.x, g.y, this.elevAt(g.x, g.y));
    const at = (wx: number, wy: number) => this.toScreen(wx, wy, this.knownElevAt(wx, wy, elev));
    const apex = at(g.x, g.y);
    const tip = at(g.x + Math.cos(facing) * len, g.y + Math.sin(facing) * len);
    const ctx = this.ctx;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const ringR = ts * 0.55;
    ctx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const p = at(g.x + Math.cos(a) * ringR, g.y + Math.sin(a) * ringR);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(232, 184, 74, 0.16)";
    ctx.fill();
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    const arcR = ts * 1.15;
    const sweep = Math.PI * 0.7;
    const a0 = facing - sweep;
    for (let i = 0; i <= 16; i++) {
      const a = a0 + (sweep * i) / 16;
      const p = at(g.x + Math.cos(a) * arcR, g.y + Math.sin(a) * arcR);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(232, 184, 74, 0.95)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineWidth = 2;
    ctx.stroke();
    const iso = facingToIso(facing, ts);
    const il = Math.hypot(iso.x, iso.y) || 1;
    const ux = iso.x / il;
    const uy = iso.y / il;
    ctx.fillStyle = "#e8b84a";
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - ux * 12 + uy * 6, tip.y - uy * 12 - ux * 6);
    ctx.lineTo(tip.x - ux * 12 - uy * 6, tip.y - uy * 12 + ux * 6);
    ctx.closePath();
    ctx.fill();
    const arcTip = at(g.x + Math.cos(facing) * arcR, g.y + Math.sin(facing) * arcR);
    ctx.beginPath();
    ctx.moveTo(arcTip.x, arcTip.y);
    ctx.lineTo(arcTip.x - ux * 8 + uy * 4, arcTip.y - uy * 8 - ux * 4);
    ctx.lineTo(arcTip.x - ux * 8 - uy * 4, arcTip.y - uy * 8 + ux * 4);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText("ROTATE", this.mouseX + 14, this.mouseY + 8);
    ctx.fillStyle = "#e8b84a";
    ctx.fillText("ROTATE", this.mouseX + 14, this.mouseY + 8);
    ctx.restore();
  }

  private drawGuardOverlay(): void {
    if (!this.guardMode || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ids = this.ownSelectedIds();
    if (ids.length === 0) return;
    const escort = this.guardHoverTarget();
    if (escort) {
      this.drawGuardUnitOverlay(escort);
      return;
    }
    if (!this.guardDragging) this.guardFacing = this.meanSelectedFacing();
    const origin = this.guardAnchor ?? this.screenToWorld(this.mouseX, this.mouseY);
    const facing = this.guardFacing;
    const half = (GUARD_CONE_DEG * Math.PI) / 360;
    const arcSteps = 24;
    const reach = guardReach(this.map(), this.knownGround, this.selectedGuardUnits(), origin.x, origin.y, facing, half, arcSteps);
    const range = reach.rangeWorld;
    const elev = reach.elev;
    const ctx = this.ctx;
    // Drape over ground the player has seen; fog stays level with the stand.
    const at = (wx: number, wy: number) => this.toScreen(wx, wy, this.knownElevAt(wx, wy, elev));
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (range > 0) {
      const ring: IsoPt[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const a = (Math.PI * 2 * i) / steps;
        ring.push(at(origin.x + Math.cos(a) * range, origin.y + Math.sin(a) * range));
      }
      ctx.beginPath();
      ctx.moveTo(ring[0]!.x, ring[0]!.y);
      for (const p of ring) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(232, 184, 74, 0.06)";
      ctx.fill();
      ctx.strokeStyle = "rgba(232, 184, 74, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      const a0 = facing - half;
      const rayAng = (i: number) => a0 + (2 * half * i) / arcSteps;
      // Full cone outline, then the part the ground leaves open.
      const full: IsoPt[] = [at(origin.x, origin.y)];
      const open: IsoPt[] = [at(origin.x, origin.y)];
      for (let i = 0; i <= arcSteps; i++) {
        const a = rayAng(i);
        const r = reach.rays[i] ?? range;
        full.push(at(origin.x + Math.cos(a) * range, origin.y + Math.sin(a) * range));
        open.push(at(origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r));
      }
      ctx.beginPath();
      ctx.moveTo(full[0]!.x, full[0]!.y);
      for (const p of full) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(20, 14, 10, 0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(232, 184, 74, 0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(open[0]!.x, open[0]!.y);
      for (const p of open) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = reach.bonusCells > 0 ? "rgba(240, 200, 90, 0.3)" : "rgba(232, 184, 74, 0.22)";
      ctx.fill();
      ctx.strokeStyle = "#e8b84a";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    const tipR = range > 0 ? range : this.ts() * 6;
    const tip = at(origin.x + Math.cos(facing) * tipR, origin.y + Math.sin(facing) * tipR);
    const apex = at(origin.x, origin.y);
    ctx.strokeStyle = "#e8b84a";
    ctx.fillStyle = "#e8b84a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    const iso = facingToIso(facing, this.ts());
    const len = Math.hypot(iso.x, iso.y) || 1;
    const ux = iso.x / len;
    const uy = iso.y / len;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - ux * 12 + uy * 6, tip.y - uy * 12 - ux * 6);
    ctx.lineTo(tip.x - ux * 12 - uy * 6, tip.y - uy * 12 + ux * 6);
    ctx.closePath();
    ctx.fill();
    const label = `${this.guardDragging ? "FACE" : "GUARD"}${guardHeightTag(reach)}`;
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText(label, this.mouseX + 14, this.mouseY + 8);
    ctx.fillStyle = "#e8b84a";
    ctx.fillText(label, this.mouseX + 14, this.mouseY + 8);
    ctx.restore();
  }

  private drawGuardUnitOverlay(hit: EntityView): void {
    const p = this.lerpEnt(hit);
    const elev = this.elevAt(p.x, p.y);
    const at = (wx: number, wy: number) => this.toScreen(wx, wy, elev);
    const r = Math.max(catalog(hit.type).radius + this.ts(), this.ts() * 3);
    const ctx = this.ctx;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const ring: IsoPt[] = [];
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      ring.push(at(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r));
    }
    ctx.beginPath();
    ctx.moveTo(ring[0]!.x, ring[0]!.y);
    for (const q of ring) ctx.lineTo(q.x, q.y);
    ctx.closePath();
    ctx.fillStyle = "rgba(232, 184, 74, 0.16)";
    ctx.fill();
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText("GUARD UNIT", this.mouseX + 14, this.mouseY + 8);
    ctx.fillStyle = "#e8b84a";
    ctx.fillText("GUARD UNIT", this.mouseX + 14, this.mouseY + 8);
    ctx.restore();
  }

  private addPatrolPoint(mx: number, my: number): void {
    if (this.patrolPoints.length >= PATROL_POINTS_MAX) return;
    const w = this.screenToWorld(mx, my);
    const prev = this.patrolPoints[this.patrolPoints.length - 1];
    if (prev && Math.hypot(prev.x - w.x, prev.y - w.y) < this.ts()) return;
    this.patrolPoints.push({ x: w.x, y: w.y });
  }

  private commitPatrol(): void {
    const points = this.patrolPoints.map((p) => ({ x: p.x, y: p.y }));
    const ids = this.ownSelectedIds();
    this.setPatrolMode(false);
    if (points.length > 0 && ids.length > 0) this.command({ type: "cmd.patrol", ids, points });
  }

  /** Draft clicks, then the route each selected unit is already walking. */
  private drawPatrolOverlay(): void {
    const ctx = this.ctx;
    const you = this.curr.youPlayerId;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const stroke = (pts: { x: number; y: number }[], toCursor: boolean) => {
      if (pts.length === 0 && !toCursor) return;
      ctx.strokeStyle = "rgba(232, 184, 74, 0.9)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        const s = this.toScreen(p.x, p.y);
        if (!started) {
          ctx.moveTo(s.x, s.y);
          started = true;
        } else ctx.lineTo(s.x, s.y);
      }
      if (toCursor && this.mouseX >= 0) {
        if (!started) ctx.moveTo(this.mouseX, this.mouseY);
        else ctx.lineTo(this.mouseX, this.mouseY);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of pts) {
        const s = this.toScreen(p.x, p.y);
        ctx.fillStyle = "#140e0a";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 5, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8b84a";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 3.2, 1.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    if (this.patrolMode) {
      const ids = this.ownSelectedIds();
      const from: { x: number; y: number }[] = [];
      for (const id of ids) {
        const e = this.curr.entities.find((u) => u.id === id);
        if (e) from.push({ x: e.x, y: e.y });
      }
      if (from.length === 0) stroke(this.patrolPoints, true);
      else {
        for (const origin of from) stroke([origin, ...this.patrolPoints], true);
      }
    }
    for (const e of this.curr.entities) {
      if (!this.selected.has(e.id) || e.ownerId !== you || !e.patrol || e.patrol.length < 2) continue;
      stroke(e.patrol, false);
    }
    ctx.restore();
  }

  private drawPatrolCursor(): void {
    if (!this.patrolMode || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ctx = this.ctx;
    const x = this.mouseX;
    const y = this.mouseY;
    const label = this.patrolPoints.length > 0 ? "RIGHT FINISH" : "PATROL";
    ctx.save();
    ctx.strokeStyle = "#e8b84a";
    ctx.fillStyle = "#e8b84a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText(label, x + 12, y + 8);
    ctx.fillStyle = "#e8b84a";
    ctx.fillText(label, x + 12, y + 8);
    ctx.restore();
  }

  private drawAttackCursor(): void {
    if (!this.attackMoveMode || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ctx = this.ctx;
    const x = this.mouseX;
    const y = this.mouseY;
    ctx.save();
    ctx.strokeStyle = "#ff5a4a";
    ctx.fillStyle = "#ff5a4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText("ATK", x + 12, y + 8);
    ctx.fillText("ATK", x + 12, y + 8);
    ctx.restore();
  }

  private fillQuad(a: IsoPt, b: IsoPt, c: IsoPt, d: IsoPt): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  private shade(hex: string, t: number): string {
    const raw = hex.startsWith("#") ? hex.slice(1) : hex;
    if (raw.length !== 6) return hex;
    const n = parseInt(raw, 16);
    if (Number.isNaN(n)) return hex;
    const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * t)));
    const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * t)));
    const b = Math.min(255, Math.max(0, Math.round((n & 255) * t)));
    return `rgb(${r},${g},${b})`;
  }

  private drawIsoBox(
    x: number,
    y: number,
    w: number,
    h: number,
    ez: number,
    top: string,
    opts?: { alpha?: number; stroke?: string; strokeW?: number; elev?: number },
  ): { cx: number; cy: number } {
    const n = this.toScreen(x, y, opts?.elev);
    const e = this.toScreen(x + w, y, opts?.elev);
    const s = this.toScreen(x + w, y + h, opts?.elev);
    const west = this.toScreen(x, y + h, opts?.elev);
    const up = (p: IsoPt): IsoPt => ({ x: p.x, y: p.y - ez });
    const n2 = up(n);
    const e2 = up(e);
    const s2 = up(s);
    const w2 = up(west);
    const ctx = this.ctx;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = (opts?.alpha ?? 1) * prev;
    if (ez > 0) {
      ctx.fillStyle = this.shade(top, 0.42);
      this.fillQuad(west, s, s2, w2);
      ctx.fillStyle = this.shade(top, 0.68);
      this.fillQuad(e, s, s2, e2);
    }
    ctx.fillStyle = top;
    this.fillQuad(n2, e2, s2, w2);
    if (opts?.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = opts.strokeW ?? 1.5;
      ctx.beginPath();
      ctx.moveTo(n2.x, n2.y);
      ctx.lineTo(e2.x, e2.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(w2.x, w2.y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = prev;
    return { cx: (n2.x + s2.x) / 2, cy: (n2.y + s2.y) / 2 };
  }

  private houseAt(wx: number, wy: number): EntityView | undefined {
    const ts = this.ts();
    return this.curr.entities.find((e) => {
      if (!isGarrisonable(e.type) || e.hp <= 0) return false;
      const x0 = e.tileX * ts;
      const y0 = e.tileY * ts;
      const pad = ts * 2;
      return wx >= x0 - pad && wx <= x0 + e.tileW * ts + pad && wy >= y0 - pad && wy <= y0 + e.tileH * ts + pad;
    });
  }

  private stemsOf(map: MapDef): { tx: number; ty: number }[] {
    if (this.treeStems) return this.treeStems;
    const out: { tx: number; ty: number }[] = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (treePropKind(map, tx, ty)) out.push({ tx, ty });
      }
    }
    this.treeStems = out;
    return out;
  }

  private pushGroundShadow(
    items: DrawItem[],
    foot: { cx: number; cy: number; points: { x: number; y: number }[]; contact?: { x: number; y: number }[] },
  ): void {
    const { w, h } = this.viewSize();
    const contact = (foot.contact ?? []).map((q) => this.toScreen(q.x, q.y));
    const screen: { x: number; y: number }[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const q of foot.points) {
      const s = this.toScreen(q.x, q.y);
      screen.push(s);
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x);
      maxY = Math.max(maxY, s.y);
    }
    if (maxX < -12 || maxY < -12 || minX > w + 12 || minY > h + 12) return;
    items.push({
      layer: HOLE_DRAW_LAYER,
      z: isoDepth(foot.cx, foot.cy),
      run: () => drawGroundShadow(this.ctx, screen, contact),
    });
  }

  private collectUnitShadows(items: DrawItem[]): void {
    for (const e of this.curr.entities) {
      const inWater = e.swimming || e.wading;
      if (!unitCastsShadow({ kind: e.kind, garrisonedIn: e.garrisonedIn, swimming: inWater })) continue;
      const def = catalog(e.type);
      let scale = isInfantryType(e.type) ? INFANTRY_VISUAL_SCALE : UNIT_VISUAL_SCALE;
      // A plane's shadow is its wingspan, and it spreads as the plane climbs.
      if (e.air) scale *= aircraftShadowScale(e.air.alt).scale;
      const p = this.lerpEnt(e);
      this.pushGroundShadow(
        items,
        unitShadowFootprint({
          x: p.x,
          y: p.y,
          facing: p.facing,
          radius: def.radius * scale,
          elongated: !isInfantryType(e.type),
          stance: e.stance,
          airborne: (e.air?.alt ?? 0) > 0 || (e.jet?.alt ?? 0) > 0,
        }),
      );
    }
  }

  /** Mauler carts draw as their own depth-sorted object behind the hitch. */
  private collectMaulerCarts(items: DrawItem[], w: number, h: number): void {
    const live = new Set<number>();
    for (const e of this.curr.entities) {
      if (e.type !== "hauler" || e.garrisonedIn) continue;
      if ((e.cart ?? 0) <= 0) continue;
      live.add(e.id);
      const prev = this.maulerCarts.get(e.id) ?? null;
      const p = this.lerpEnt(e);
      const pose = e.wreck && prev ? prev : followCart(prev, p.x, p.y, p.facing);
      this.maulerCarts.set(e.id, pose);
      if (!this.unitNearView(e, w, h)) continue;
      this.pushGroundShadow(
        items,
        unitShadowFootprint({
          x: pose.x,
          y: pose.y,
          facing: pose.facing,
          radius: catalog(e.type).radius * UNIT_VISUAL_SCALE * 0.6,
          elongated: true,
        }),
      );
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(pose.x, pose.y),
        at: { x: pose.x, y: pose.y },
        run: () => this.drawMaulerCart(e, pose),
      });
    }
    for (const id of this.maulerCarts.keys()) {
      if (!live.has(id)) this.maulerCarts.delete(id);
    }
  }

  /**
   * Field-gun crews: hauling on the trail while the gun moves, crouched at the
   * breech once it stops. A towed gun's crew rides the truck. The tow bar
   * joins a hitched gun to its truck.
   */
  private collectGunCrews(items: DrawItem[], w: number, h: number): void {
    const byId = new Map(this.curr.entities.map((e) => [e.id, e]));
    for (const e of this.curr.entities) {
      if (e.type !== "artillery" || !e.gun || e.wreck || !this.unitNearView(e, w, h)) continue;
      const p = this.lerpEnt(e);
      const truck = e.gun.towedBy != null ? byId.get(e.gun.towedBy) : undefined;
      if (truck) {
        this.gunHaulAt.delete(e.id);
        const t = this.lerpEnt(truck);
        const hook = { x: t.x - Math.cos(t.facing) * catalog(truck.type).radius, y: t.y - Math.sin(t.facing) * catalog(truck.type).radius };
        const trail = { x: p.x - Math.cos(p.facing) * catalog(e.type).radius, y: p.y - Math.sin(p.facing) * catalog(e.type).radius };
        items.push({
          layer: STANDING_DRAW_LAYER,
          z: isoDepth((hook.x + trail.x) / 2, (hook.y + trail.y) / 2) - 0.5,
          run: () => this.drawTowBar(hook, trail),
        });
        continue;
      }
      // "walker" asks for real travel only, so a gun swinging onto a target does not walk its crew.
      const moving = e.state === "move" || unitStepping({ type: "walker", state: e.state, prev: this.prevById.get(e.id), curr: e });
      // A crawling gun can sit still for a snapshot or two; the crew stays on the trail until it has really stopped.
      const now = performance.now();
      if (moving) this.gunHaulAt.set(e.id, now);
      const last = this.gunHaulAt.get(e.id);
      const hauling = last != null && now - last < GUN_CREW_SETTLE_MS;
      if (!hauling) this.gunHaulAt.delete(e.id);
      const back = p.facing + Math.PI;
      const side = p.facing + Math.PI / 2;
      const r = catalog(e.type).radius;
      for (let i = 0; i < e.gun.crew; i++) {
        const s = i === 0 ? 1 : -1;
        const along = hauling ? r * 1.9 : r * 0.55;
        const across = hauling ? r * 0.4 * s : r * 1.05 * s;
        const x = p.x + Math.cos(back) * along + Math.cos(side) * across;
        const y = p.y + Math.sin(back) * along + Math.sin(side) * across;
        const facing = hauling ? back : p.facing;
        items.push({
          layer: STANDING_DRAW_LAYER,
          z: isoDepth(x, y),
          at: { x, y },
          run: () => this.drawGunCrewman(e, x, y, facing, hauling, i),
        });
      }
    }
  }

  private drawGunCrewman(e: EntityView, x: number, y: number, facing: number, hauling: boolean, slot: number): void {
    const def = spriteFor("rifleman", hauling ? "stand" : "crouch");
    if (!def) return;
    const s = this.toScreen(x, y);
    const dir = facingToIso(facing, this.ts());
    drawUnitSprite(this.ctx, def, s.x, s.y, dir.x, dir.y, {
      moving: hauling,
      id: e.id * 3 + slot,
      now: performance.now() * (this.curr.gameSpeed || 1),
      facing,
    });
  }

  private drawTowBar(hook: { x: number; y: number }, trail: { x: number; y: number }): void {
    const ctx = this.ctx;
    const a = this.toScreen(hook.x, hook.y);
    const b = this.toScreen(trail.x, trail.y);
    ctx.save();
    ctx.strokeStyle = "rgba(24, 22, 18, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 3);
    ctx.lineTo(b.x, b.y - 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawMaulerCart(e: EntityView, pose: CartPose): void {
    const ctx = this.ctx;
    const s = this.toScreen(pose.x, pose.y);
    const dir = facingToIso(pose.facing, this.ts());
    ctx.save();
    if (e.wreck) ctx.filter = "grayscale(1) brightness(0.68) contrast(1.08)";
    drawUnitSprite(ctx, HAULER_CART_SPRITE, s.x, s.y, dir.x, dir.y, {
      moving: false,
      id: e.id,
      now: 0,
      facing: pose.facing,
    });
    ctx.restore();
  }

  /** World units from the Rig's origin to the painted tread on this facing. Undefined until the sheet can be read. */
  private rigTrackAlong(facing: number, reverse: boolean, radius: number, tileSize: number): number | undefined {
    const step = (Math.PI * 2) / TANK_FACE_DIRS;
    const i = Math.round((facing - TANK_FACE_START_YAW) / step);
    const key = ((i % TANK_FACE_DIRS) + TANK_FACE_DIRS) % TANK_FACE_DIRS;
    let reach = this.rigTread.get(key);
    if (!reach) {
      const spr = spriteFor("rig");
      if (!spr || !spriteReady(spr) || spr.frameSize <= 0) return undefined;
      const snapped = TANK_FACE_START_YAW + key * step;
      const row = engineRowFromProjectedFacing(snapped, tileSize);
      const data = sheetCellAlpha(spr.image, spr.frameSize, row);
      if (!data) return undefined;
      const { hw, hh } = isoScale(tileSize);
      const cell = spr.frameSize;
      reach = treadReachWorld({
        cell,
        contactY: spr.contactY,
        drawSize: spr.drawSize,
        facing: snapped,
        radius,
        hw,
        hh,
        opaque: (x, y) => (data[(y * cell + x) * 4 + 3] ?? 0) > 32,
      });
      this.rigTread.set(key, reach);
    }
    return reverse ? reach.front : reach.back;
  }

  private collectTrackKicks(items: DrawItem[]): void {
    const now = performance.now();
    const map = this.map();
    const ts = map.tileSize;
    const live = new Set<number>();
    for (const e of this.curr.entities) {
      if (e.kind !== "unit") continue;
      live.add(e.id);
      const def = catalog(e.type);
      if (
        !tankTracksKick({
          kind: e.kind,
          turnInPlace: def.turnInPlace,
          wreck: e.wreck,
          swimming: e.swimming,
          immobilized: immobilized(e),
          garrisonedIn: e.garrisonedIn,
        })
      ) {
        this.trackKickLast.delete(e.id);
        continue;
      }
      const p = this.lerpEnt(e);
      const last = this.trackKickLast.get(e.id);
      if (!last) {
        this.trackKickLast.set(e.id, { x: p.x, y: p.y });
        continue;
      }
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const travel = trackKickTravel(dx, dy, p.facing);
      if (!travel || travel.dist < TRACK_KICK_SPACING) continue;
      const steps = Math.min(4, Math.floor(travel.dist / TRACK_KICK_SPACING));
      const along =
        e.type === "rig" ? this.rigTrackAlong(p.facing, travel.reverse, def.radius, ts) : undefined;
      const origins = trackKickOrigins(p.x, p.y, p.facing, travel.reverse, def.radius, along);
      const spr = spriteFor(e.type, e.stance, e.swimming);
      const scale = (spr?.drawSize ?? 48) / 48;
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        const ox = last.x + dx * k;
        const oy = last.y + dy * k;
        const tx = worldToTile(ox, ts);
        const ty = worldToTile(oy, ts);
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
        if (map.tiles[ty * map.width + tx] === TILE_WATER) continue;
        for (let i = 0; i < origins.length; i++) {
          const o = origins[i]!;
          const sx = o.x + dx * (k - 1);
          const sy = o.y + dy * (k - 1);
          this.trackKicks.push(
            ...spawnTrackKickPuffs(
              { x: sx, y: sy },
              travel.tossX,
              travel.tossY,
              now,
              (e.id * 2654435761 + Math.floor(now) + s * 13 + i * 29) >>> 0,
              travel.reverse,
              scale,
            ),
          );
        }
      }
      this.trackKickLast.set(e.id, { x: p.x, y: p.y });
    }
    for (const id of this.trackKickLast.keys()) {
      if (!live.has(id)) this.trackKickLast.delete(id);
    }
    if (this.trackKicks.length > 480) this.trackKicks.splice(0, this.trackKicks.length - 480);

    const keep: TrackKickPuff[] = [];
    for (const puff of this.trackKicks) {
      const pose = trackKickPose(puff, now);
      if (!pose) continue;
      keep.push(puff);
      const screen = this.toScreen(pose.x, pose.y);
      items.push({
        layer: 1,
        z: isoDepth(pose.x, pose.y) + (puff.reverse ? 0.4 : -0.4),
        run: () =>
          drawTrackKick(this.ctx, screen.x, screen.y - pose.lift, pose.t, puff.seed, puff.scale),
      });
    }
    this.trackKicks = keep;
  }

  private collectMuzzleSmoke(items: DrawItem[]): void {
    const now = performance.now();
    const live = new Set(this.curr.entities.map((e) => e.id));
    for (const id of [...this.gunRecoil.keys()]) {
      if (!live.has(id)) this.gunRecoil.delete(id);
    }
    if (this.muzzleSmokes.length > 360) {
      this.muzzleSmokes.splice(0, this.muzzleSmokes.length - 360);
    }
    const keep: MuzzleSmokePuff[] = [];
    for (const puff of this.muzzleSmokes) {
      const pose = muzzleSmokePose(puff, now);
      if (!pose) continue;
      keep.push(puff);
      const screen = this.toScreen(pose.x, pose.y);
      const tip = this.toScreen(pose.x + puff.vx * 0.08, pose.y + puff.vy * 0.08);
      items.push({
        layer: 1,
        z: isoDepth(pose.x, pose.y) + 0.2,
        run: () =>
          drawMuzzleSmoke(
            this.ctx,
            screen.x,
            screen.y - pose.lift,
            pose.t,
            puff.kind,
            puff.seed,
            puff.scale,
            tip.x - screen.x,
            tip.y - screen.y,
          ),
      });
    }
    this.muzzleSmokes = keep;
  }

  /** World footprint of a building's cast shadow; EXTRUDE is its screen height. */
  private buildingShadow(e: EntityView): { x: number; y: number }[] {
    const ts = this.ts();
    return buildingShadowFootprint({
      ...wallFootprint(e.tileX * ts, e.tileY * ts, e.tileW * ts, e.tileH * ts),
      height: (this.extrude(e.type) * ts) / ISO_TILE_H,
    });
  }

  /** Trampled earth around a building, laid on the terrain under each point. */
  private pushYardWear(out: IsoPt[][], e: EntityView, w: number, h: number): void {
    const ts = this.ts();
    const foot = { x: e.tileX * ts, y: e.tileY * ts, w: e.tileW * ts, h: e.tileH * ts };
    this.pushCastShadow(out, yardWearFootprint(foot), w, h);
  }

  /** Projects a world shadow to screen and keeps it when it touches the view. */
  private pushCastShadow(out: IsoPt[][], world: { x: number; y: number }[], w: number, h: number): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const screen = world.map((q) => {
      const s = this.toScreen(q.x, q.y);
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x);
      maxY = Math.max(maxY, s.y);
      return s;
    });
    if (maxX < -12 || maxY < -12 || minX > w + 12 || minY > h + 12) return;
    out.push(screen);
  }

  private collectTrees(items: DrawItem[], shadows: IsoPt[][]): void {
    const map = this.map();
    const ts = map.tileSize;
    const w = map.width;
    const { w: vw, h: vh } = this.viewSize();
    const now = performance.now();
    for (const { tx, ty } of this.stemsOf(map)) {
      if (map.tiles[ty * w + tx] !== TILE_TREE) continue;
      const kind = treePropKind(map, tx, ty);
      if (!kind) continue;
      const wx = (tx + 0.5) * ts;
      const wy = (ty + 0.55) * ts;
      const p = this.toScreen(wx, wy);
      // Iso AABB of the viewport covers most of the map; skip sprites that
      // actually sit off-screen. Source art is ~800–1200px tall.
      if (p.x < -96 || p.y < -96 || p.x > vw + 96 || p.y > vh + 48) continue;
      const stamp = treeStamp(tx, ty, kind);
      const faces = stamp.pine ? PINE_FACES : OAK_FACES;
      const spr = faces[stamp.face % faces.length];
      const drawH = stamp.drawH;
      const veil = this.fogField?.veil(tx + 0.5, ty + 0.55, now) ?? 0;
      this.pushCastShadow(
        shadows,
        treeShadowFootprint({
          x: wx,
          y: wy,
          height: (drawH * 0.55 * ts) / ISO_TILE_H,
          crown: (drawH * 0.2 * 2 * ts) / (ISO_TILE_W * Math.SQRT2),
        }),
        vw,
        vh,
      );
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(wx, wy),
        at: { x: wx, y: wy },
        run: () => {
          if (spr) drawPropSprite(this.ctx, spr, p.x, p.y, drawH, false, veil);
        },
      });
    }
  }

  /** Bushes, signposts, boulders, and stumps from the map dress, sorted with units. */
  private collectDecor(items: DrawItem[]): void {
    const map = this.map();
    const ts = map.tileSize;
    const w = map.width;
    const { w: vw, h: vh } = this.viewSize();
    const now = performance.now();
    // A structure raised on dressed ground hides the prop under it.
    const built = new Set<number>();
    const cover = (e: EntityView): void => {
      if (e.kind !== "building") return;
      for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
        for (let x = e.tileX; x < e.tileX + e.tileW; x++) built.add(y * w + x);
      }
    };
    for (const e of this.curr.entities) cover(e);
    for (const e of this.ghosts.values()) cover(e);
    for (const it of decorFor(map).standing) {
      if (built.has(it.ty * w + it.tx)) continue;
      const wx = (it.tx + it.ox) * ts;
      const wy = (it.ty + it.oy) * ts;
      const p = this.toScreen(wx, wy);
      if (p.x < -64 || p.y < -16 || p.x > vw + 64 || p.y > vh + 64) continue;
      const faces = DECOR_FACES[it.kind];
      const spr = faces[it.face % faces.length];
      if (!spr) continue;
      const veil = this.fogField?.veil(it.tx + it.ox, it.ty + it.oy, now) ?? 0;
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(wx, wy),
        at: { x: wx, y: wy },
        run: () => {
          drawPropSprite(this.ctx, spr, p.x, p.y, it.drawH, it.flip, veil);
        },
      });
    }
  }

  private buildingLit(e: EntityView): boolean {
    for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
      for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
        if (this.lit(x, y)) return true;
      }
    }
    return false;
  }

  /**
   * Run `draw` so the fog veil lands only on its own pixels, per footprint
   * column: the part of a building in sight stays clear, the rest matches the
   * ground veil around it. `rise` is the wall height in screen pixels.
   */
  private drawVeiled(
    e: Pick<EntityView, "tileX" | "tileY" | "tileW" | "tileH">,
    elev: number,
    rise: number,
    bounds: { x: number; y: number; w: number; h: number },
    draw: () => void,
  ): void {
    const field = this.fogField;
    if (!field) {
      draw();
      return;
    }
    const now = performance.now();
    const cells = veilCells(e.tileX, e.tileY, e.tileW, e.tileH);
    const alphas = cells.map((c) => field.veil(c.cu, c.cv, now));
    const uni = uniformVeil(alphas);
    if (uni != null && uni < 0.002) {
      draw();
      return;
    }
    const main = this.ctx;
    const scratch = this.buildingVeil.begin(main);
    if (!scratch) {
      draw();
      return;
    }
    this.ctx = scratch;
    try {
      draw();
    } finally {
      this.ctx = main;
    }
    const ts = this.ts();
    const columns = cells.map((c, i) => {
      const x0 = c.tx * ts;
      const y0 = c.ty * ts;
      const x1 = (c.tx + c.tw) * ts;
      const y1 = (c.ty + c.th) * ts;
      return {
        poly: columnPolygon(
          this.toScreen(x0, y0, elev),
          this.toScreen(x1, y0, elev),
          this.toScreen(x1, y1, elev),
          this.toScreen(x0, y1, elev),
          rise,
        ),
        alpha: alphas[i]!,
      };
    });
    const base = alphas.reduce((s, a) => s + a, 0) / Math.max(1, alphas.length);
    this.buildingVeil.end(main, bounds, columns, base);
  }

  /** The flat part of a building (Airfield strip and hardstands), with its selection frame. */
  private drawBuildingGround(e: EntityView, ghost: boolean): void {
    const spr = buildingGroundFor(e.type);
    if (!spr || !spriteReady(spr)) return;
    const ts = this.ts();
    const ctx = this.ctx;
    const x = e.tileX * ts;
    const y = e.tileY * ts;
    const bw = e.tileW * ts;
    const bh = e.tileH * ts;
    const elev = this.buildingElev(e);
    const south = this.toScreen(x + bw, y + bh, elev);
    const east = this.toScreen(x + bw, y, elev);
    const west = this.toScreen(x, y + bh, elev);
    const footprintW = east.x - west.x;
    const scale = footprintW / spr.padWidth;
    const bounds = {
      x: south.x - spr.padSouthX * scale,
      y: south.y - spr.padSouthY * scale,
      w: spr.image.naturalWidth * scale,
      h: spr.image.naturalHeight * scale,
    };
    this.drawVeiled(e, elev, 0, bounds, () => drawBuildingSprite(this.ctx, spr, south.x, south.y, footprintW));
    if (!ghost && this.selected.has(e.id)) {
      const pad = 3;
      const pts = [
        this.toScreen(x - pad, y - pad, elev),
        this.toScreen(x + bw + pad, y - pad, elev),
        this.toScreen(x + bw + pad, y + bh + pad, elev),
        this.toScreen(x - pad, y + bh + pad, elev),
      ];
      drawSelectFrame(ctx, pts, { hostile: this.hostileOwner(e.ownerId), now: performance.now() });
    }
  }

  private drawBuilding(e: EntityView, ghost = false): void {
    const ts = this.ts();
    const ctx = this.ctx;
    const x = e.tileX * ts;
    const y = e.tileY * ts;
    const bw = e.tileW * ts;
    const bh = e.tileH * ts;
    const ez = this.extrude(e.type);
    const elev = this.buildingElev(e);
    const hex = this.ownerColor(e);
    const spr = buildingSpriteFor(e.type, e.facing);
    const south = this.toScreen(x + bw, y + bh, elev);
    const east = this.toScreen(x + bw, y, elev);
    const west = this.toScreen(x, y + bh, elev);
    const bar = this.toScreen(x + bw / 2, y + bh / 2, elev);
    let stack = { x: bar.x, y: bar.y - ez - 8 };
    const ground = buildingGroundFor(e.type);
    // A building with a ground decal draws its selection frame there, under everything standing.
    if (!ghost && this.selected.has(e.id) && !(ground && spriteReady(ground))) {
      const pad = 3;
      const pts = [
        this.toScreen(x - pad, y - pad, elev),
        this.toScreen(x + bw + pad, y - pad, elev),
        this.toScreen(x + bw + pad, y + bh + pad, elev),
        this.toScreen(x - pad, y + bh + pad, elev),
      ];
      drawSelectFrame(ctx, pts, { hostile: this.hostileOwner(e.ownerId), now: performance.now() });
    }
    if (spr && spriteReady(spr)) {
      const footprintW = east.x - west.x;
      const scale = footprintW / spr.padWidth;
      const bounds = {
        x: south.x - spr.padSouthX * scale,
        y: south.y - spr.padSouthY * scale,
        w: spr.image.naturalWidth * scale,
        h: spr.image.naturalHeight * scale,
      };
      const rise = buildingOccludeEz(spr, footprintW, ez);
      this.drawVeiled(e, elev, rise, bounds, () => {
        const c = this.ctx;
        drawBuildingSprite(c, spr, south.x, south.y, footprintW);
        if (e.type === "ciws") {
          this.drawCiwsGun(spr, south.x, south.y, footprintW, 1, e.turretFacing ?? e.facing, ghost ? undefined : e);
        } else if (e.type === "ram") {
          this.drawCiwsGun(spr, south.x, south.y, footprintW, 1, e.turretFacing ?? e.facing, undefined, RAM_TURRET_SHEET);
        }
        if (!ghost) {
          drawBuildingAnim(
            c,
            spr,
            e,
            south.x,
            south.y,
            footprintW,
            performance.now() * (this.curr.gameSpeed || 1),
          );
        }
      });
      stack = buildingStackAt(spr, south.x, south.y, footprintW);
    } else {
      const north = this.toScreen(x, y, elev);
      const bounds = { x: west.x - 2, y: north.y - ez - 2, w: east.x - west.x + 4, h: south.y - north.y + ez + 4 };
      this.drawVeiled(e, elev, ez, bounds, () => {
        const c = this.ctx;
        const top = this.drawIsoBox(x, y, bw, bh, ez, hex, {
          stroke: ghost ? "#2a2018" : "#111",
          strokeW: 1.5,
          elev,
        });
        c.fillStyle = "#e8dcc4";
        c.font = "bold 16px Oswald, sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(catalog(e.type).letter, top.cx, top.cy);
      });
    }
    const layoutW = bw * 0.56;
    if (e.ownerId === this.curr.youPlayerId && (e.type === "core" || e.type === "rig")) {
      const name = this.curr.players.find((p) => p.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, stack.x, stack.y - 12);
    }
    if (!ghost) {
      this.maybeHp(e, stack.x - layoutW / 2, stack.y + 3, layoutW);
      this.drawGarrisonBars(e, stack.x + layoutW * 0.28, stack.y - 2);
    }
    this.drawDeployProgress(e, bar.x - layoutW / 2, bar.y + 4, layoutW);
    if (!ghost) {
      this.drawCaptureProgress(e, stack.x - layoutW / 2, stack.y + 10, layoutW);
    }
    if (!ghost && (e.state === "undeploy" || e.state === "deploy")) {
      const p = e.deployProgress ?? 0;
      ctx.strokeStyle = "#fff6c8";
      ctx.globalAlpha = 0.35 + 0.4 * p;
      ctx.lineWidth = 2;
      const inset = (1 - p) * ts * 0.4;
      this.strokeGroundRect(x + inset, y + inset, bw - inset * 2, bh - inset * 2, elev);
    }
    ctx.globalAlpha = 1;
  }

  /** CIWS gun (or RAM launcher) row over its pad, laid on `turretFacing`, and the CIWS barrel flash while it fires. */
  private drawCiwsGun(
    spr: BuildingSpriteDef,
    southX: number,
    southY: number,
    footprintW: number,
    alpha: number,
    facing: number,
    /** The live mount, for its barrel flash. Omitted for the placement ghost. */
    e?: EntityView,
    /** The RAM passes its launcher sheet; its rockets carry their own flash. */
    sheet: HTMLImageElement = CIWS_TURRET_SHEET,
  ): void {
    if (!sheet.complete || sheet.naturalWidth <= 0) return;
    const ctx = this.ctx;
    const ts = this.ts();
    const cell = ciwsTurretCell(sheet.naturalWidth, sheet.naturalHeight, ciwsTurretRow(facing, ts));
    const scale = footprintW / spr.padWidth;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.drawImage(
      sheet,
      cell.sx,
      cell.sy,
      cell.sw,
      cell.sh,
      southX - spr.padSouthX * scale,
      southY - spr.padSouthY * scale,
      cell.sw * scale,
      cell.sh * scale,
    );
    ctx.restore();
    if (!e?.gatling || e.wreck) return;
    const elev = this.buildingElev(e);
    const tip = this.toScreen(
      e.x + Math.cos(facing) * CIWS_MUZZLE_REACH,
      e.y + Math.sin(facing) * CIWS_MUZZLE_REACH,
      elev,
    );
    const dir = facingToIso(facing, ts);
    const len = Math.hypot(dir.x, dir.y) || 1;
    drawGatlingFlash(
      ctx,
      { x: tip.x, y: tip.y - ciwsMuzzleLift(scale), dirX: dir.x / len, dirY: dir.y / len },
      footprintW * 0.9,
      performance.now(),
      e.id,
    );
  }

  private strokeGroundRect(x: number, y: number, w: number, h: number, elev?: number): void {
    const n = this.toScreen(x, y, elev);
    const e = this.toScreen(x + w, y, elev);
    const s = this.toScreen(x + w, y + h, elev);
    const west = this.toScreen(x, y + h, elev);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y);
    ctx.lineTo(e.x, e.y);
    ctx.lineTo(s.x, s.y);
    ctx.lineTo(west.x, west.y);
    ctx.closePath();
    ctx.stroke();
  }

  private cacheOccluders(): void {
    const ts = this.ts();
    const out: MapView["occBuildings"] = [];
    for (const e of this.curr.entities) {
      if (e.kind !== "building") continue;
      const x = e.tileX * ts;
      const y = e.tileY * ts;
      const w = e.tileW * ts;
      const h = e.tileH * ts;
      const elev = this.buildingElev(e);
      const east = this.toScreen(x + w, y, elev);
      const west = this.toScreen(x, y + h, elev);
      const south = this.toScreen(x + w, y + h, elev);
      const spr = buildingSpriteFor(e.type, e.facing);
      const footprintW = east.x - west.x;
      out.push({
        x,
        y,
        w,
        h,
        ez: buildingOccludeEz(spr, footprintW, this.extrude(e.type)),
        lift: isoLift(elev),
        spr: spr && spriteReady(spr) ? spr : undefined,
        southX: south.x,
        southY: south.y,
        footprintW,
      });
    }
    this.occBuildings = out;
  }

  private takeMoveClicks(): { x: number; y: number; t: number }[] {
    const now = performance.now();
    const keep: MapView["moveClicks"] = [];
    const live: { x: number; y: number; t: number }[] = [];
    for (const m of this.moveClicks) {
      const t = (now - m.at) / MOVE_CLICK_MS;
      if (t >= 1) continue;
      keep.push(m);
      live.push({ x: m.x, y: m.y, t: Math.max(0, t) });
    }
    this.moveClicks = keep;
    return live;
  }

  /** Stance sheet, or the pistol / rifle-recoil / corpse sheet when that pose is showing. */
  private spriteOf(e: EntityView): UnitSpriteDef | undefined {
    if (e.type === "titan") {
      // The outriggers read as down from the midpoint of the brace until the midpoint of the pack.
      const p = e.deployProgress ?? 0;
      const down = e.state === "deploy" ? p >= 0.5 : e.state === "undeploy" ? p < 0.5 : !!e.braced;
      if (down && !e.wreck) return TITAN_BRACED_SPRITE;
      // In water only the torso and pods show above the pool.
      return e.wading ? TITAN_WADE_SPRITE : TITAN_SPRITE;
    }
    if (e.type === "mammoth") {
      // In water the hull is sunk to the casemate. Same draw size as on land.
      return e.wading ? MAMMOTH_WADE_SPRITE : MAMMOTH_SPRITE;
    }
    if (e.type === "rifleman") {
      const sheet = trooperSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        weapon: e.weapon,
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "handgun") return TROOPER_HANDGUN_SPRITE;
      if (sheet === "rifle-fire") return TROOPER_RIFLE_FIRE_SPRITE;
      if (sheet === "die") return TROOPER_DIE_SPRITE;
    }
    if (e.type === "gunner") {
      const sheet = gunnerSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "mg-fire") return GUNNER_FIRE_SPRITE;
      if (sheet === "die") return GUNNER_DIE_SPRITE;
    }
    if (e.type === "sniper") {
      const sheet = sniperSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "fire") return SNIPER_FIRE_SPRITE;
      if (sheet === "die") return SNIPER_DIE_SPRITE;
    }
    if (e.type === "atinfantry") {
      const sheet = atInfantrySheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "fire") return ATINFANTRY_FIRE_SPRITE;
      if (sheet === "die") return ATINFANTRY_DIE_SPRITE;
    }
    if (e.type === "rocketer") {
      const sheet = rocketerSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "fire") return ROCKETER_FIRE_SPRITE;
      if (sheet === "die") return ROCKETER_DIE_SPRITE;
    }
    if (e.type === "pyro") {
      const sheet = pyroSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "fire") return PYRO_FIRE_SPRITE;
      if (sheet === "die") return PYRO_DIE_SPRITE;
    }
    if (e.type === "mortarman") {
      const sheet = mortarmanSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "fire") return MORTARMAN_FIRE_SPRITE;
      if (sheet === "die") return MORTARMAN_DIE_SPRITE;
    }
    if (e.type === "medic") {
      const sheet = medicSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        tending: e.tend != null,
      });
      if (sheet === "die") return MEDIC_DIE_SPRITE;
      if (sheet === "crouch") return MEDIC_CROUCH_SPRITE;
      if (sheet === "crawl") return MEDIC_CRAWL_SPRITE;
      if (sheet === "swim") return spriteFor("medic", "stand", true);
      return MEDIC_SPRITE;
    }
    if (e.type === "droneop") {
      // Same sheet set as the Medic: walk, crouch, crawl, die.
      const sheet = medicSheet({ swimming: e.swimming, wreck: e.wreck, stance: e.stance });
      if (sheet === "die") return DRONEOP_DIE_SPRITE;
      if (sheet === "crouch") return DRONEOP_CROUCH_SPRITE;
      if (sheet === "crawl") return DRONEOP_CRAWL_SPRITE;
      if (sheet === "swim") return spriteFor("droneop", "stand", true);
      return DRONEOP_SPRITE;
    }
    if (e.type === "jumpjet") {
      const sheet = jumpJetSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        aloft: inAir(e),
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "die") return JUMPJET_DIE_SPRITE;
      if (sheet === "fly") return JUMPJET_FLY_SPRITE;
      if (sheet === "fire") return JUMPJET_FIRE_SPRITE;
      if (sheet === "crouch") return JUMPJET_CROUCH_SPRITE;
      if (sheet === "crawl") return JUMPJET_CRAWL_SPRITE;
      if (sheet === "swim") return spriteFor("jumpjet", "stand", true);
      return JUMPJET_SPRITE;
    }
    if (e.type === "cyborg") {
      const sheet = cyborgSheet({
        swimming: e.swimming,
        wreck: e.wreck,
        stance: e.stance,
        shotAgeMs: this.infantryShotAge(e.id),
      });
      if (sheet === "die") return CYBORG_DIE_SPRITE;
      if (sheet === "fire") return CYBORG_FIRE_SPRITE;
      if (sheet === "crawl-fire") return CYBORG_CRAWL_FIRE_SPRITE;
      if (sheet === "crawl") return CYBORG_CRAWL_SPRITE;
      if (sheet === "swim") return spriteFor("cyborg", "stand", true);
      return CYBORG_SPRITE;
    }
    if (e.type === "engineer") {
      if (e.swimming) return spriteFor(e.type, e.stance, true);
      if (e.wreck) return ENGINEER_DIE_SPRITE;
      if (e.state === "build") return ENGINEER_BUILD_SPRITE;
      if (e.state === "repair") return ENGINEER_FIX_SPRITE;
      if (e.stance === "crouch") return ENGINEER_CROUCH_SPRITE;
      if (e.stance === "crawl") return ENGINEER_CRAWL_SPRITE;
      return ENGINEER_SPRITE;
    }
    return spriteFor(e.type, e.stance, e.swimming);
  }

  private infantryShotAge(id: number): number | null {
    const at = this.infantryShotAt.get(id);
    if (at == null) return null;
    const age = (performance.now() - at) * (this.curr.gameSpeed || 1);
    if (age > 1200) {
      this.infantryShotAt.delete(id);
      return null;
    }
    return age;
  }

  private corpseAge(id: number): number {
    let born = this.wreckBornAt.get(id);
    if (born == null) {
      born = performance.now();
      this.wreckBornAt.set(id, born);
    }
    return (performance.now() - born) * (this.curr.gameSpeed || 1);
  }

  /** Loose cull: sprite, bars, and labels all sit within a couple of sprite sizes. */
  private unitNearView(e: EntityView, w: number, h: number): boolean {
    const p = this.lerpEnt(e);
    const s = this.toScreen(p.x, p.y);
    const m = (this.spriteOf(e)?.drawSize ?? 64) * 2 + 64;
    return s.x >= -m && s.y >= -m && s.x <= w + m && s.y <= h + m;
  }

  private drawUnit(e: EntityView): void {
    const spr = this.spriteOf(e);
    if (spr) {
      this.drawSpritedUnit(e, spr);
      return;
    }
    const ctx = this.ctx;
    const p = this.lerpEnt(e);
    const scale = isInfantryType(e.type) ? INFANTRY_VISUAL_SCALE : UNIT_VISUAL_SCALE;
    const r = catalog(e.type).radius * scale;
    const ez = this.extrude(e.type) * scale;
    const hex = e.wreck ? "#6e6c66" : this.ownerColor(e);
    const s = this.toScreen(p.x, p.y);
    ctx.save();
    const top = this.drawIsoBox(p.x - r, p.y - r, r * 2, r * 2, ez, hex, {
      stroke: "#111",
      strokeW: 1.4,
    });
    const dir = facingToIso(p.turretFacing ?? p.facing, this.ts());
    const len = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const barrel = e.type === "warden" ? 18 : 11;
    ctx.fillStyle = e.wreck ? "#8a8680" : e.type === "warden" ? "#d8c48c" : "#fff6c8";
    ctx.beginPath();
    ctx.moveTo(top.cx + ux * barrel, top.cy + uy * barrel);
    ctx.lineTo(top.cx - ux * 5 - uy * 5, top.cy - uy * 5 + ux * 5);
    ctx.lineTo(top.cx - ux * 5 + uy * 5, top.cy - uy * 5 - ux * 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (e.ownerId === this.curr.youPlayerId && e.type === "rig") {
      const name = this.curr.players.find((pl) => pl.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, s.x, s.y - ez - 12);
    }
    this.maybeHp(e, s.x - r, s.y - ez - 10, r * 2);
    this.drawCrits(e, s.x + r, s.y - ez - 26);
    this.drawDeployProgress(e, s.x - r, s.y + 6, r * 2);
    if (e.type === "rig" && (e.state === "deploy" || e.state === "undeploy")) {
      const prog = e.deployProgress ?? 0;
      const size = this.ts() * (1 + 2 * prog);
      ctx.strokeStyle = "#fff6c8";
      ctx.globalAlpha = 0.3 + 0.5 * prog;
      ctx.lineWidth = 2;
      this.strokeGroundRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  }

  /** A paratrooper's canopy, over his head at his height. */
  private drawTroopCanopy(e: EntityView): void {
    const def = this.spriteOf(e);
    const size = def?.drawSize ?? 24;
    const p = this.lerpEnt(e);
    const s = this.toScreen(p.x, p.y);
    const head = s.y - this.airLift(e) - size * (def?.contactY ?? 0.9) + size * 0.2;
    drawCanopy(this.ctx, s.x, head, troopCanopySpan(size), canopySway(e.id, performance.now()));
  }

  private drawSpritedUnit(e: EntityView, def: UnitSpriteDef): void {
    const ctx = this.ctx;
    const p = this.lerpEnt(e);
    const size = def.drawSize;
    const s = this.toScreen(p.x, p.y);
    s.y -= this.airLift(e);
    const hex = this.ownerColor(e);
    const dir = facingToIso(p.facing, this.ts());
    const turretDir = facingToIso(p.turretFacing ?? p.facing, this.ts());
    const mountDir = e.ciws ? facingToIso(e.ciws.facing, this.ts()) : undefined;
    let hullShiftX = 0;
    let hullShiftY = 0;
    let gunShiftX = 0;
    let gunShiftY = 0;
    const rec = this.gunRecoil.get(e.id);
    if (
      rec &&
      tankGunRecoils({
        hasGun: !!def.gun,
        wreck: e.wreck,
        garrisonedIn: e.garrisonedIn,
      })
    ) {
      const amount = recoilAmounts(rec.at, performance.now());
      if (!amount) this.gunRecoil.delete(e.id);
      else {
        const px = recoilPixels(size, amount);
        const shift = recoilLayerShift(turretDir.x, turretDir.y, px.hullPx, px.gunPx);
        hullShiftX = shift.hullX;
        hullShiftY = shift.hullY;
        gunShiftX = shift.gunX;
        gunShiftY = shift.gunY;
      }
    }
    const corpse = isInfantryType(e.type) && !!e.wreck;
    let frameIndex: number | undefined;
    if (def === TROOPER_DIE_SPRITE || def === GUNNER_DIE_SPRITE || def === SNIPER_DIE_SPRITE || def === ATINFANTRY_DIE_SPRITE || def === ROCKETER_DIE_SPRITE || def === PYRO_DIE_SPRITE || def === MORTARMAN_DIE_SPRITE || def === ENGINEER_DIE_SPRITE || def === MEDIC_DIE_SPRITE || def === DRONEOP_DIE_SPRITE || def === CYBORG_DIE_SPRITE || def === JUMPJET_DIE_SPRITE) frameIndex = heldFrame(this.corpseAge(e.id), def.fps, def.frames);
    else if (def === TROOPER_RIFLE_FIRE_SPRITE || def === GUNNER_FIRE_SPRITE || def === SNIPER_FIRE_SPRITE || def === ATINFANTRY_FIRE_SPRITE || def === ROCKETER_FIRE_SPRITE || def === PYRO_FIRE_SPRITE || def === JUMPJET_FIRE_SPRITE) {
      frameIndex = heldFrame(this.infantryShotAge(e.id) ?? 0, def.fps, def.frames);
    } else if (def === JUMPJET_FLY_SPRITE) {
      // The plumes flicker whether he hovers or flies.
      frameIndex = Math.floor((performance.now() / 1000) * def.fps + e.id) % def.frames;
    }
    ctx.save();
    ctx.save();
    if (e.air?.phase === "crash") {
      const roll = Math.sin(performance.now() * 0.003 + e.id * 1.7) * 0.22;
      ctx.translate(s.x, s.y);
      ctx.rotate(roll);
      ctx.translate(-s.x, -s.y);
    }
    if (e.wreck && !corpse) ctx.filter = "grayscale(1) brightness(0.68) contrast(1.08)";
    const stepping = unitStepping({ type: e.type, state: e.state, swimming: e.swimming, prev: this.prevById.get(e.id), curr: e });
    const drawn = drawUnitSprite(ctx, def, s.x, s.y, dir.x, dir.y, {
      moving: !e.wreck && !immobilized(e) && stepping,
      id: e.id,
      now: performance.now() * (this.curr.gameSpeed || 1),
      frameIndex,
      turretDx: turretDir.x,
      turretDy: turretDir.y,
      facing: p.facing,
      turretFacing: p.turretFacing,
      hullShiftX,
      hullShiftY,
      gunShiftX,
      gunShiftY,
      mountFacing: e.ciws?.facing,
      mountDx: mountDir?.x,
      mountDy: mountDir?.y,
    });
    if (drawn && e.scout?.out && !e.wreck) {
      drawScoutHead(ctx, s.x + hullShiftX, s.y + hullShiftY, turretDir.x, turretDir.y, size, p.turretFacing);
    }
    ctx.restore();
    ctx.restore();
    if (drawn && e.gatling && !e.wreck) {
      const now = performance.now();
      const muzzles = gatlingMuzzles(s.x, s.y, size, p.turretFacing ?? p.facing, e.gatling.arms, e.gatling.off);
      muzzles.forEach((m, i) => drawGatlingFlash(ctx, m, size, now, e.id + i * 2));
    }
    if (drawn && e.ciws?.fire && !e.wreck) {
      const m = roofCiwsMuzzle(s.x + hullShiftX, s.y + hullShiftY + unitGroundSink(size), size, e.ciws.facing);
      drawGatlingFlash(ctx, m, size * 0.7, performance.now(), e.id);
    }
    if (drawn && e.type === "pyro" && !e.wreck && !e.swimming && e.clip !== 0) {
      // The igniter at the lance tip stays lit while there is fuel to light.
      const tip = this.pyroNozzle(e);
      const t = this.toScreen(tip.x, tip.y);
      drawPilotLight(ctx, t.x, t.y - tip.h, performance.now(), e.id);
    }
    if (drawn && !e.wreck && isInfantryType(e.type) && !e.swimming) {
      const heat = this.fireHeatAt(p.x, p.y);
      if (heat > 0) drawBodyFlames(ctx, s.x, s.y, size, heat, performance.now(), e.id);
    }
    if (drawn && corpse && e.type === "cyborg") {
      drawCyborgDeathSparks(ctx, s.x, s.y, size, dir.x, dir.y, this.corpseAge(e.id), e.id);
    }
    if (e.wreck && drawn && !corpse) this.drawWreckFires(e, s.x, s.y, size, dir.x, dir.y);
    if (!drawn) {
      const r = Math.max(4, size * 0.22);
      ctx.save();
      this.drawIsoBox(p.x - r, p.y - r, r * 2, r * 2, size * 0.45, e.wreck ? "#6e6c66" : hex);
      ctx.restore();
      if (e.wreck) this.drawWreckFires(e, s.x, s.y, size, dir.x, dir.y);
    }
    if (e.ownerId === this.curr.youPlayerId && e.type === "rig") {
      const name = this.curr.players.find((pl) => pl.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, s.x, s.y - size * def.contactY - 12);
    }
    this.maybeHp(e, s.x - size * 0.45, s.y - size * def.contactY - 2, size * 0.9);
    // A hull that carries soldiers (the Mammoth) shows who is aboard, like a Bunker.
    if (!e.wreck) this.drawGarrisonBars(e, s.x + size * 0.45 + 4, s.y - size * def.contactY - 2);
    if (e.tend != null && !e.wreck) this.drawHealMark(e);
    this.drawScoutBar(e, s.x - size * 0.22, s.y - size * def.contactY - 8);
    this.drawCrits(e, s.x + size * 0.48, s.y - size * def.contactY - 20);
    this.drawDeployProgress(e, s.x - size * 0.45, s.y + 6, size * 0.9);
    if (e.type === "rig" && (e.state === "deploy" || e.state === "undeploy")) {
      const prog = e.deployProgress ?? 0;
      const footprint = this.ts() * (1 + 2 * prog);
      ctx.strokeStyle = "#fff6c8";
      ctx.globalAlpha = 0.3 + 0.5 * prog;
      ctx.lineWidth = 2;
      this.strokeGroundRect(p.x - footprint / 2, p.y - footprint / 2, footprint, footprint);
      ctx.globalAlpha = 1;
    }
  }

  /** Small plus over the soldier being bandaged. */
  private drawHealMark(medic: EntityView): void {
    const patient = this.curr.entities.find((p) => p.id === medic.tend);
    const who = patient ?? medic;
    const p = this.lerpEnt(who);
    const s = this.toScreen(p.x, p.y);
    const y = s.y - 16;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = "#f4f1e4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x - 4, y);
    ctx.lineTo(s.x + 4, y);
    ctx.moveTo(s.x, y - 4);
    ctx.lineTo(s.x, y + 4);
    ctx.stroke();
    ctx.restore();
  }

  private drawWreckFires(
    e: EntityView,
    x: number,
    y: number,
    size: number,
    dirX: number,
    dirY: number,
  ): void {
    let born = this.wreckBornAt.get(e.id);
    if (born === undefined) {
      born = performance.now();
      this.wreckBornAt.set(e.id, born);
    }
    const age = (performance.now() - born) * (this.curr.gameSpeed || 1);
    const now = performance.now();
    const n = wreckFireCount(e.id);
    const len = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / len;
    const uy = dirY / len;
    for (let i = 0; i < n; i++) {
      const a = wreckFireAlpha(age, i);
      if (a <= 0) continue;
      const along = i === 0 ? -0.02 : -0.1;
      const across = i === 0 ? 0.03 : -0.05;
      const ox = ux * size * along + -uy * size * across;
      const oy = uy * size * along * 0.45 + ux * size * across * 0.45 - size * (i === 0 ? 0.47 : 0.4);
      drawWreckFire(this.ctx, x + ox, y + oy, now, e.id * 13 + i * 29, a);
    }
  }

  /** Craters on the ground. Blood and the fallen pose sit under every unit. */
  private collectRemains(items: DrawItem[]): void {
    const map = this.map();
    const ts = map.tileSize;
    const w = map.width;
    for (const hole of this.curr.holes ?? []) {
      const tx = worldToTile(hole.x, ts);
      const ty = worldToTile(hole.y, ts);
      if (tx < 0 || ty < 0 || tx >= w || ty >= map.height) continue;
      const seen = this.explored?.[ty * w + tx] === 1;
      const lit = this.lit(tx, ty);
      if (!seen && !lit) continue;
      const alpha = lit ? 1 : 0.5;
      items.push({
        layer: HOLE_DRAW_LAYER,
        z: isoDepth(hole.x, hole.y) - 0.6,
        run: () => this.drawHole(hole, alpha),
      });
    }
    const liveBodies = new Set((this.curr.bodies ?? []).map((b) => b.id));
    for (const id of this.burnSeen.keys()) {
      if (!liveBodies.has(id)) this.burnSeen.delete(id);
    }
    for (const body of this.curr.bodies ?? []) {
      const z = isoDepth(body.x, body.y);
      items.push({
        layer: CORPSE_DRAW_LAYER,
        z: z - 0.35,
        run: () => this.drawBodyBlood(body),
      });
      items.push({
        layer: CORPSE_DRAW_LAYER,
        z,
        run: () => this.drawBody(body),
      });
    }
  }

  private groundSpan(x: number, y: number, world: number): number {
    const c = this.toScreen(x, y);
    const e = this.toScreen(x + world, y);
    return Math.hypot(e.x - c.x, e.y - c.y);
  }

  private drawHole(hole: ShellHoleView, alpha: number): void {
    const c = this.toScreen(hole.x, hole.y);
    const rx = this.groundSpan(hole.x, hole.y, hole.radius);
    const face = CRATER_FACES[(hole.seed >>> 0) % CRATER_FACES.length];
    if (face && face.image.naturalWidth > 0 && face.bowl > 0) {
      const drawH = (face.image.naturalHeight * rx * 2.05) / face.bowl;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      const drew = drawPropSprite(this.ctx, face, c.x, c.y, drawH, false);
      this.ctx.restore();
      if (drew) return;
    }
    const tip = this.toScreen(hole.x + Math.cos(hole.ang), hole.y + Math.sin(hole.ang));
    const ang = hole.round ? 0 : Math.atan2(tip.y - c.y, tip.x - c.x);
    drawShellHole(this.ctx, c.x, c.y, rx, rx * 0.5, ang, hole.seed, alpha);
  }

  private drawBodyBlood(body: CorpseView): void {
    const ctx = this.ctx;
    for (const stain of body.blood) {
      const s = this.toScreen(stain.x, stain.y);
      const rx = this.groundSpan(stain.x, stain.y, stain.rx);
      const ry = rx * (stain.ry / Math.max(0.2, stain.rx)) * 0.55;
      drawBloodStain(ctx, s.x, s.y, rx, ry, stain.rot);
    }
  }

  /**
   * Wall-clock age of a burned corpse. A body that was already down when it
   * first came into view skips the char. A death watched from the start plays
   * the full second or two even when the match is sped up.
   */
  private burnAge(id: number, simAgeMs: number, doneMs: number): number {
    let at = this.burnSeen.get(id);
    if (at == null) {
      // A few sped-up snapshots can arrive before the first paint. Only a body
      // that has already been down for a while skips the char.
      const staleMs = doneMs + 4000;
      at = performance.now() - (simAgeMs > staleMs ? doneMs + 40 : 0);
      this.burnSeen.set(id, at);
    }
    return performance.now() - at;
  }

  private drawBody(body: CorpseView): void {
    const die = infantryDieSprite(body.type);
    if (!die) return;
    const variant = body.burned ? burnVariant(body.id) : 0;
    const simAgeMs = Math.max(0, (this.curr.tick - body.bornTick) * TICK_DT * 1000);
    const ageMs = body.burned ? this.burnAge(body.id, simAgeMs, burnAnimMs(variant)) : simAgeMs;
    const stand = body.burned ? (spriteFor(body.type) ?? die) : die;
    const fadeDef = body.burned && burnDeathPose(ageMs, variant).phase === "burn" ? stand : die;
    const s = this.toScreen(body.x, body.y);
    const dir = facingToIso(body.facing, this.ts());
    const fade = this.corpseFade(body.x, body.y, fadeDef);
    this.ctx.save();
    this.ctx.globalAlpha = fade;
    if (body.burned) {
      drawBurnedCorpse(this.ctx, stand, die, s.x, s.y, dir.x, dir.y, body.facing, ageMs, variant, body.id, performance.now());
    } else {
      drawUnitSprite(this.ctx, die, s.x, s.y, dir.x, dir.y, {
        moving: false,
        id: body.id,
        now: 0,
        frameIndex: heldFrame(ageMs, die.fps, die.frames),
        facing: body.facing,
      });
      // A dead cyborg bleeds (the stains under him) and his hips spit a few sparks.
      if (body.type === "cyborg") {
        drawCyborgDeathSparks(this.ctx, s.x, s.y, die.drawSize, dir.x, dir.y, ageMs, body.id);
      }
    }
    this.ctx.restore();
  }

  private corpseFade(x: number, y: number, def: UnitSpriteDef): number {
    const s = this.toScreen(x, y);
    const samples = [
      { x: s.x, y: s.y - def.drawSize * def.contactY * 0.45 },
      { x: s.x, y: s.y - def.drawSize * def.contactY * 0.2 },
    ];
    const unitRect = {
      x: s.x - def.drawSize / 2,
      y: s.y - def.drawSize * def.contactY,
      w: def.drawSize,
      h: def.drawSize * 0.4,
    };
    const ts = this.ts();
    const visualLift = def.drawSize * def.contactY * 0.35;
    const unitLift = isoLift(this.elevAt(x, y));
    for (const b of this.occBuildings) {
      if (x >= b.x + b.w || y >= b.y + b.h) continue;
      if (b.spr) {
        if (unitHitsBuildingSprite(b.spr, b.southX, b.southY, b.footprintW, samples, unitRect)) {
          return OCCLUDED_UNIT_ALPHA;
        }
        continue;
      }
      if (unitBehindIsoBox(x, y, visualLift, b.x, b.y, b.w, b.h, b.ez, ts, b.lift, unitLift)) {
        return OCCLUDED_UNIT_ALPHA;
      }
    }
    return 1;
  }

  /** A burning trunk, depth-sorted with the standing trees. */
  private collectTreeBurns(items: DrawItem[]): void {
    const now = performance.now();
    const keep: MapView["treeBurns"] = [];
    for (const f of this.treeBurns) {
      const t = (now - f.at) / TREE_BURN_MS;
      if (t >= 1) continue;
      keep.push(f);
      const x = f.x;
      const y = f.y;
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(x, y),
        at: { x, y },
        run: () => {
          const s = this.toScreen(x, y);
          drawBurningTree(this.ctx, s.x, s.y, f.stamp, t, f.seed, now);
        },
      });
    }
    this.treeBurns = keep;
  }

  /** Leaves and a broken trunk where a shell just took a tree down. */
  private drawTreeFalls(): void {
    const now = performance.now();
    const keep: MapView["treeFalls"] = [];
    for (const f of this.treeFalls) {
      const t = (now - f.at) / TREE_FALL_MS;
      if (t >= 1) continue;
      keep.push(f);
      const s = this.toScreen(f.x, f.y);
      drawTreeFall(this.ctx, s.x, s.y, t, f.seed);
    }
    this.treeFalls = keep;
  }

  /** Smoke along the lob, from the tube to the bomb, then a short hang after it lands. */
  /** Bombs released by planes, at their height over the ground. */
  private drawFallingBombs(): void {
    const t = Math.min(1, (performance.now() - this.snapAt) / 100);
    for (const p of this.curr.projectiles) {
      if (!p.bomb) continue;
      const prevP = this.prev?.projectiles.find((q) => q.id === p.id);
      const wx = prevP ? prevP.x + (p.x - prevP.x) * t : p.x;
      const wy = prevP ? prevP.y + (p.y - prevP.y) * t : p.y;
      const wz = prevP?.z != null && p.z != null ? prevP.z + (p.z - prevP.z) * t : (p.z ?? 0);
      const s = this.toScreen(wx, wy);
      const dir = facingToIso(Math.atan2(p.vy, p.vx), this.ts());
      drawFallingBomb(this.ctx, s.x, s.y - airLiftPx(wz), dir.x, dir.y + 0.6);
    }
  }

  /**
   * A falling plane lays a thick black column along the stretch it flew.
   * The puffs hang after the airframe has passed.
   */
  private drawCrashSmoke(): void {
    const now = performance.now();
    const blend = Math.min(1, (now - this.snapAt) / 100);
    const live = new Set<number>();
    for (const e of this.curr.entities) {
      if (e.air?.phase !== "crash") continue;
      live.add(e.id);
      const prev = this.prevById.get(e.id);
      const x = prev ? prev.x + (e.x - prev.x) * blend : e.x;
      const y = prev ? prev.y + (e.y - prev.y) * blend : e.y;
      const alt = lerpAirAlt(prev, e, blend);
      const head = { x, y, z: this.elevAt(x, y) + alt };
      const laid = layCrashTrail(
        this.crashLast.get(e.id),
        head,
        now,
        (e.id * 2654435761 + Math.floor(now)) >>> 0,
      );
      this.crashPuffs.push(...laid.puffs);
      this.crashLast.set(e.id, laid.from);
    }
    for (const id of [...this.crashLast.keys()]) {
      if (!live.has(id)) this.crashLast.delete(id);
    }
    if (this.crashPuffs.length > CRASH_PUFF_CAP) {
      this.crashPuffs.splice(0, this.crashPuffs.length - CRASH_PUFF_CAP);
    }
    const ctx = this.ctx;
    const keep: RocketPuff[] = [];
    ctx.save();
    for (const puff of this.crashPuffs) {
      const pose = rocketPuffPose(puff, now);
      if (!pose) {
        if (now < puff.at) keep.push(puff);
        continue;
      }
      keep.push(puff);
      const s = this.toScreen(pose.x, pose.y, pose.z);
      drawSoot(ctx, s.x, s.y, pose.r, pose.alpha, 1 - puff.shade);
    }
    ctx.restore();
    this.crashPuffs = keep;
  }

  /** A charging Walker leaves a short trail of dark smoke on the ground behind him. */
  private drawChargeSmoke(): void {
    const now = performance.now();
    const blend = Math.min(1, (now - this.snapAt) / 100);
    const live = new Set<number>();
    for (const e of this.curr.entities) {
      if (e.type !== "walker" || !e.charging || e.wreck) continue;
      live.add(e.id);
      const prev = this.prevById.get(e.id);
      const x = prev ? prev.x + (e.x - prev.x) * blend : e.x;
      const y = prev ? prev.y + (e.y - prev.y) * blend : e.y;
      const head = { x, y, z: this.elevAt(x, y) };
      const laid = layChargeTrail(
        this.chargeLast.get(e.id),
        head,
        now,
        (e.id * 2246822519 + Math.floor(now)) >>> 0,
      );
      this.chargePuffs.push(...laid.puffs);
      this.chargeLast.set(e.id, laid.from);
    }
    for (const id of [...this.chargeLast.keys()]) {
      if (!live.has(id)) this.chargeLast.delete(id);
    }
    if (this.chargePuffs.length > CHARGE_PUFF_CAP) {
      this.chargePuffs.splice(0, this.chargePuffs.length - CHARGE_PUFF_CAP);
    }
    const ctx = this.ctx;
    const keep: RocketPuff[] = [];
    ctx.save();
    for (const puff of this.chargePuffs) {
      const pose = rocketPuffPose(puff, now);
      if (!pose) {
        if (now < puff.at) keep.push(puff);
        continue;
      }
      keep.push(puff);
      const s = this.toScreen(pose.x, pose.y, pose.z);
      drawSoot(ctx, s.x, s.y, pose.r, pose.alpha, 1 - puff.shade);
    }
    ctx.restore();
    this.chargePuffs = keep;
  }

  /**
   * Host a garrisoned shot leaves. A friendly soldier names his house. An omitted
   * shooter is walked back along the shot onto an occupied building or hull.
   */
  private garrisonShotHost(
    shooter: EntityView | undefined,
    p: { x: number; y: number; vx: number; vy: number; arc?: number; hang?: number; flame?: boolean },
  ): EntityView | undefined {
    if (shooter && shooter.garrisonedIn == null) return undefined;
    if (shooter?.garrisonedIn != null) {
      const host = this.curr.entities.find((e) => e.id === shooter.garrisonedIn);
      return host && host.hp > 0 && !host.wreck ? host : undefined;
    }
    const origin = p.flame ? flameLaunchPoint(p) : { x: p.x, y: p.y };
    const ts = this.ts();
    for (const pt of backtrackPoints(origin, p.vx, p.vy)) {
      const house = this.houseAt(pt.x, pt.y);
      if (!house || house.wreck || house.hp <= 0 || (house.garrison?.count ?? 0) <= 0) continue;
      if (!claimsShot(shotHostFrom(house), origin, ts)) continue;
      return house;
    }
    return undefined;
  }

  /** Window or hull-slit flash. A rocket's trail and backblast start at that mouth. */
  private flashAperture(
    host: EntityView,
    p: { id: number; x: number; y: number; vx: number; vy: number; z?: number; fromId: number },
    now: number,
    flame: boolean,
  ): void {
    const shape = shotHostFrom(host);
    const salt = p.fromId;
    const mouth = garrisonMouthPoint(shape, p.x + p.vx, p.y + p.vy, this.ts(), salt);
    const ground = this.elevAt(mouth.x, mouth.y);
    const simZ = p.z ?? ground;
    const simLift = isoLift(simZ) - isoLift(ground);
    const mouthLift = garrisonMouthLift(shape, salt);
    const launch = garrisonHeadPoint({
      host: shape,
      sim: { x: mouth.x, y: mouth.y, z: simZ },
      mouth,
      mouthLiftPx: mouthLift,
      simLiftPx: Math.max(0, simLift),
    });
    if (!flame) {
      this.rocketFrom.set(p.id, { x: mouth.x, y: mouth.y, z: launch.z });
      this.rocketHost.set(p.id, { hostId: host.id, salt });
      this.rocketPuffs.push(
        ...backblastPuffs({
          x: mouth.x,
          y: mouth.y,
          z: launch.z,
          ground,
          dirX: p.vx,
          dirY: p.vy,
          now,
          seed: (p.id * 2246822519) >>> 0,
        }),
      );
    }
    this.addFx({
      id: p.id + 8_000_000,
      kind: "muzzle",
      x: mouth.x,
      y: mouth.y,
      vx: p.vx,
      vy: p.vy,
      at: now,
      caliber: flame ? 1 : 20,
      lift: mouthLift,
      window: shape.kind === "building",
    });
  }

  /** Sim head, or the mouth until the rocket clears the host sprite. */
  private garrisonRocketHead(
    id: number,
    sim: { x: number; y: number; z: number },
    vx: number,
    vy: number,
  ): { x: number; y: number; z: number } {
    const rec = this.rocketHost.get(id);
    if (!rec) return sim;
    const host = this.curr.entities.find((e) => e.id === rec.hostId);
    if (!host || host.hp <= 0 || host.wreck) return sim;
    const shape = shotHostFrom(host);
    const mouth = garrisonMouthPoint(shape, sim.x + vx, sim.y + vy, this.ts(), rec.salt);
    const ground = this.elevAt(mouth.x, mouth.y);
    return garrisonHeadPoint({
      host: shape,
      sim,
      mouth,
      mouthLiftPx: garrisonMouthLift(shape, rec.salt),
      simLiftPx: Math.max(0, isoLift(sim.z) - isoLift(ground)),
    });
  }

  /**
   * Outdoor Pyro: the lance on his sprite. Garrisoned or omitted: the host aperture,
   * recomputed from where the host is now so a moving hull does not leave the jet behind.
   */
  private flameNozzle(
    id: number,
    shooter: EntityView | undefined,
    jet: { land: { x: number; y: number }; hostId?: number },
  ): { x: number; y: number; h: number } | null {
    if (shooter && !shooter.wreck && shooter.garrisonedIn == null && !shooter.swimming) return this.pyroNozzle(shooter);
    const hostId = shooter?.garrisonedIn ?? jet.hostId;
    if (hostId == null) return null;
    const host = this.curr.entities.find((q) => q.id === hostId);
    if (!host || host.wreck || host.hp <= 0) return null;
    return garrisonFlameNozzle(shotHostFrom(host), jet.land, this.ts(), id);
  }

  /**
   * Titan rockets: every frame lays puffs along the stretch each rocket flew,
   * so the trail is a thick ribbon that hangs and spreads after the rocket is
   * gone. Backblast and air-burst puffs share the same pool.
   */
  private drawRockets(): void {
    const now = performance.now();
    const blend = Math.min(1, (now - this.snapAt) / 100);
    const live = new Set<number>();
    const heads: { x: number; y: number; dx: number; dy: number; id: number; heavy: boolean }[] = [];
    for (const p of this.curr.projectiles) {
      if (!p.rocket) continue;
      live.add(p.id);
      const prev = this.prev?.projectiles.find((q) => q.id === p.id);
      const wx = prev ? prev.x + (p.x - prev.x) * blend : p.x;
      const wy = prev ? prev.y + (p.y - prev.y) * blend : p.y;
      const wz = prev?.z != null && p.z != null ? prev.z + (p.z - prev.z) * blend : (p.z ?? 0);
      const head = this.garrisonRocketHead(p.id, { x: wx, y: wy, z: wz }, p.vx, p.vy);
      const last = this.rocketLast.get(p.id) ?? this.rocketFrom.get(p.id) ?? head;
      this.rocketPuffs.push(...trailPuffs(last, head, now, (p.id * 2654435761 + Math.floor(now)) >>> 0));
      this.rocketLast.set(p.id, head);
      const s = this.toScreen(head.x, head.y, head.z);
      const tail = this.toScreen(last.x, last.y, last.z);
      const dx = s.x - tail.x;
      const dy = s.y - tail.y;
      const fallback = this.toScreen(head.x - p.vx * 0.01, head.y - p.vy * 0.01, head.z);
      const moved = dx * dx + dy * dy > 0.25;
      heads.push({
        x: s.x,
        y: s.y,
        dx: moved ? dx : s.x - fallback.x,
        dy: moved ? dy : s.y - fallback.y,
        id: p.id,
        heavy: !!p.heavy,
      });
    }
    for (const id of [...this.rocketLast.keys()]) {
      if (!live.has(id)) {
        this.rocketLast.delete(id);
        this.rocketFrom.delete(id);
        this.rocketHost.delete(id);
      }
    }
    if (this.rocketPuffs.length > ROCKET_PUFF_CAP) {
      this.rocketPuffs.splice(0, this.rocketPuffs.length - ROCKET_PUFF_CAP);
    }
    const ctx = this.ctx;
    const keep: RocketPuff[] = [];
    ctx.save();
    for (const puff of this.rocketPuffs) {
      const pose = rocketPuffPose(puff, now);
      if (!pose) {
        // Not born yet (staggered backblast) stays; faded ones drop.
        if (now < puff.at) keep.push(puff);
        continue;
      }
      keep.push(puff);
      const s = this.toScreen(pose.x, pose.y, pose.z);
      drawRocketPuff(ctx, s.x, s.y, pose.r, pose.alpha, puff.shade);
    }
    ctx.restore();
    this.rocketPuffs = keep;
    for (const h of heads) drawRocketHead(ctx, h.x, h.y, h.dx, h.dy, h.id, h.heavy);
  }

  /**
   * Lance tip of a Pyro: world ground point under it and screen height above
   * that ground. Follows the 16-face sheet he is drawn with, so the jet leaves
   * the nozzle on screen, not the sim's exact bearing.
   */
  private pyroNozzle(e: EntityView): { x: number; y: number; h: number } {
    const p = this.lerpEnt(e);
    const ts = this.ts();
    const dir = facingToIso(p.facing, ts);
    const stance = e.stance ?? "stand";
    const size = spriteFor("pyro", stance)?.drawSize ?? 20;
    const tip = pyroNozzleScreen(engineRowFromScreen(dir.x, dir.y), stance, size, unitGroundSink(size));
    const o = isoToWorld(0, 0, ts);
    const g = isoToWorld(tip.gx, tip.gy, ts);
    return { x: p.x + g.x - o.x, y: p.y + g.y - o.y, h: tip.h };
  }

  /** Hottest burning patch under a ground point, 0–1. */
  private fireHeatAt(x: number, y: number): number {
    let heat = 0;
    for (const f of this.curr.fires ?? []) {
      if (Math.hypot(f.x - x, f.y - y) > f.radius) continue;
      heat = Math.max(heat, patchHeat(f.life, f.lifeMax));
    }
    return heat;
  }

  /** The Pyro's tanks going up: a boiling fireball, fuel thrown clear, and a tall column of black smoke. */
  private cookOffFx(x: number, y: number, id: number, now: number): void {
    this.flameParticles.push(...cookoffParticles(x, y, now, id));
    const rnd = flameRng(id * 2654435761);
    const ground = this.elevAt(x, y);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const reach = 6 + rnd() * 18;
      this.fireSmoke.push({
        x: x + Math.cos(a) * 3,
        y: y + Math.sin(a) * 3,
        z: ground + 2 + rnd() * 3,
        dx: Math.cos(a) * reach + 8,
        dy: Math.sin(a) * reach - 6,
        rise: 9 + rnd() * 9,
        at: now + 180 + i * 35,
        life: 4200 + rnd() * 2400,
        r0: 5 + rnd() * 3,
        r1: 18 + rnd() * 12,
        alpha: 0.6 + rnd() * 0.2,
        shade: 0.88 + rnd() * 0.1,
        seed: (id + i * 97) >>> 0,
      });
    }
  }

  /**
   * Burning ground: the charred scorch and the pool of firelight lie on the
   * ground; each flame tongue stands at its own ground point, so a soldier in
   * the fire has flames behind him and in front of him. Smoke rolls off into
   * the rocket-smoke pool, which drifts and spreads it.
   */
  private playerColor(ownerId: string): string {
    const pl = this.curr.players.find((p) => p.playerId === ownerId);
    return pl ? colorHex(pl.colorId) : "#b08968";
  }

  /** Mines in the grass, and supply crates on the ground or hanging under their canopies. */
  private collectAirdrops(items: DrawItem[], w: number, h: number): void {
    const now = performance.now();
    const you = this.curr.youPlayerId;
    for (const m of this.curr.mines ?? []) {
      const s = this.toScreen(m.x, m.y);
      if (s.x < -12 || s.y < -12 || s.x > w + 12 || s.y > h + 12) continue;
      const own = ownerAllied(this.curr, m.ownerId) || m.ownerId === you;
      items.push({
        layer: GROUND_DECAL_DRAW_LAYER,
        z: isoDepth(m.x, m.y),
        run: () => drawMine(this.ctx, s.x, s.y, { seed: m.id, own, arming: m.armed === false, ring: this.playerColor(m.ownerId), nowMs: now }),
      });
    }
    const t = Math.min(1, (now - this.snapAt) / 100);
    for (const c of this.curr.crates ?? []) {
      const prev = this.prev?.crates?.find((q) => q.id === c.id);
      const wx = prev ? prev.x + (c.x - prev.x) * t : c.x;
      const wy = prev ? prev.y + (c.y - prev.y) * t : c.y;
      const alt = prev?.alt != null ? prev.alt + ((c.alt ?? 0) - prev.alt) * t : (c.alt ?? 0);
      const s = this.toScreen(wx, wy);
      if (s.x < -40 || s.y < -80 || s.x > w + 40 || s.y > h + 40) continue;
      const size = Math.max(20, this.ts() * 2.4);
      const left = c.supply != null && c.supplyMax ? c.supply / c.supplyMax : 1;
      items.push({
        layer: alt > 0.5 ? AIR_DRAW_LAYER : STANDING_DRAW_LAYER,
        z: isoDepth(wx, wy),
        run: () => {
          const y = s.y - airLiftPx(alt);
          drawCrate(this.ctx, s.x, y, size, this.playerColor(c.ownerId), left);
          if (alt > 0.5) drawCanopy(this.ctx, s.x, y - size * 0.75, size * 1.6, canopySway(c.id, now));
        },
      });
    }
  }

  private collectFires(items: DrawItem[], w: number, h: number): void {
    const now = performance.now();
    const fires = this.curr.fires ?? [];
    const speed = this.curr.gameSpeed || 1;
    const since = Math.max(0, (now - this.snapAt) / 1000) * speed;
    const ts = this.ts();
    const o = isoToWorld(0, 0, ts);
    const live = new Set<number>();
    for (const f of fires) {
      live.add(f.id);
      const sc = this.scorches.get(f.id);
      if (sc) {
        sc.x = f.x;
        sc.y = f.y;
        sc.r = f.radius;
        sc.seen = now;
      } else this.scorches.set(f.id, { x: f.x, y: f.y, r: f.radius, born: now, seen: now });
    }
    for (const [id, sc] of this.scorches) {
      const gone = live.has(id) ? 0 : now - sc.seen;
      if (gone > SCORCH_MS) {
        this.scorches.delete(id);
        this.fireSmokeAt.delete(id);
        continue;
      }
      const s = this.toScreen(sc.x, sc.y);
      if (s.x < -60 || s.y < -60 || s.x > w + 60 || s.y > h + 60) continue;
      const rx = this.groundSpan(sc.x, sc.y, sc.r);
      const alpha = Math.min(1, (now - sc.born) / 1800) * (1 - gone / SCORCH_MS);
      items.push({
        layer: HOLE_DRAW_LAYER,
        z: isoDepth(sc.x, sc.y) - 0.5,
        run: () => drawScorch(this.ctx, s.x, s.y, rx, id, alpha * 0.9),
      });
    }
    if (this.scorches.size > 400) {
      const old = [...this.scorches.entries()].filter(([id]) => !live.has(id)).sort((a, b) => a[1].seen - b[1].seen);
      for (const [id] of old.slice(0, this.scorches.size - 400)) this.scorches.delete(id);
    }
    // A light draft: flames lean and smoke drifts the same way.
    const wind = 0.28 + 0.12 * Math.sin(now * 0.00037);
    for (const f of fires) {
      const s = this.toScreen(f.x, f.y);
      if (s.x < -60 || s.y < -80 || s.x > w + 60 || s.y > h + 60) continue;
      const heat = patchHeat(f.life - since, f.lifeMax);
      if (heat <= 0) continue;
      const rx = this.groundSpan(f.x, f.y, f.radius);
      items.push({
        layer: HOLE_DRAW_LAYER,
        z: isoDepth(f.x, f.y) + 0.4,
        run: () => drawFireGlow(this.ctx, s.x, s.y, rx, heat, now, f.id),
      });
      items.push({
        layer: HOLE_DRAW_LAYER,
        z: isoDepth(f.x, f.y) + 0.45,
        run: () => drawFuelBed(this.ctx, s.x, s.y, rx, heat, now, f.id),
      });
      for (const t of fireTongues(f.id, rx)) {
        const dx = t.u * rx * 0.9;
        const dy = t.v * rx * 0.45;
        const g = isoToWorld(dx, dy, ts);
        const at = { x: f.x + g.x - o.x, y: f.y + g.y - o.y };
        items.push({
          layer: STANDING_DRAW_LAYER,
          z: isoDepth(at.x, at.y),
          at,
          run: () => drawTongue(this.ctx, s.x + dx, s.y + dy, tonguePose(t, now, heat, wind), 0.95),
        });
      }
      const front = { x: f.x + f.radius * 0.5, y: f.y + f.radius * 0.5 };
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(front.x, front.y),
        at: front,
        run: () => drawEmbers(this.ctx, s.x, s.y - 3, rx, heat, now, f.id),
      });
      const last = this.fireSmokeAt.get(f.id) ?? 0;
      // Burning fuel smokes black and heavy; it thins to grey as the patch dies down.
      const every = 110 / Math.max(0.2, heat);
      if (now - last >= every) {
        this.fireSmokeAt.set(f.id, now);
        const rnd = flameRng((f.id * 2246822519 + Math.floor(now)) >>> 0);
        const size = Math.max(0.7, f.radius / 11);
        this.fireSmoke.push({
          x: f.x + (rnd() - 0.5) * f.radius,
          y: f.y + (rnd() - 0.5) * f.radius,
          z: this.elevAt(f.x, f.y) + 2.5 + rnd() * 1.5,
          dx: 12 + rnd() * 12,
          dy: -8 - rnd() * 8,
          rise: 8 + rnd() * 7,
          at: now,
          life: 3200 + rnd() * 1800,
          r0: 3 * size,
          r1: (13 + rnd() * 9) * size,
          alpha: (0.3 + rnd() * 0.15) * (0.35 + 0.65 * heat),
          shade: 0.6 + 0.35 * heat + rnd() * 0.05,
          seed: (f.id * 7 + Math.floor(now)) >>> 0,
        });
      }
    }
    for (const id of [...this.fireSmokeAt.keys()]) if (!live.has(id)) this.fireSmokeAt.delete(id);
  }

  /**
   * Pyro jets and cook-off fire. While a Pyro's trigger is held (a new glob
   * in the last snapshot or so), his nozzle sprays burning fuel at the point
   * the burst is laid on. Every particle keeps flying, landing, and billowing
   * on its own after the trigger lets go.
   */
  private drawFlames(): void {
    const now = performance.now();
    // Emission covers the whole gap since the last frame (a slow frame must not leave holes in the jet).
    const dtMs = Math.min(250, Math.max(0, now - (this.flameFrameAt || now)));
    this.flameFrameAt = now;
    const held = 150 / Math.max(1, this.curr.gameSpeed || 1);
    for (const [id, jet] of this.jets) {
      if (now - jet.at > 600) {
        this.jets.delete(id);
        continue;
      }
      if (now - jet.at > held) continue;
      const e = this.curr.entities.find((q) => q.id === id);
      const nozzle = this.flameNozzle(id, e, jet);
      if (!nozzle) continue;
      this.flameParticles.push(
        ...jetParticles({ nozzle, land: jet.land, now, dtMs, seed: (id * 2654435761 + Math.floor(now * 7)) >>> 0 }),
      );
    }
    if (this.flameParticles.length > FLAME_PARTICLE_CAP) {
      this.flameParticles.splice(0, this.flameParticles.length - FLAME_PARTICLE_CAP);
    }
    const ctx = this.ctx;
    // Soot first: the flames burn bright through the bottom of their own smoke.
    if (this.fireSmoke.length > FIRE_SMOKE_CAP) this.fireSmoke.splice(0, this.fireSmoke.length - FIRE_SMOKE_CAP);
    const soot: RocketPuff[] = [];
    ctx.save();
    for (const puff of this.fireSmoke) {
      const pose = rocketPuffPose(puff, now);
      if (!pose) {
        if (now < puff.at) soot.push(puff);
        continue;
      }
      soot.push(puff);
      const s = this.toScreen(pose.x, pose.y, pose.z);
      drawSoot(ctx, s.x, s.y, pose.r, pose.alpha, 1 - puff.shade);
    }
    ctx.restore();
    this.fireSmoke = soot;
    if (this.flameParticles.length === 0) return;
    const steps = Math.max(1, Math.ceil(dtMs / 20));
    const dt = dtMs / 1000 / steps;
    const keep: FlameParticle[] = [];
    // Deeper fuel first, so the fire nearer the camera paints over the far side.
    this.flameParticles.sort((a, b) => a.x + a.y - (b.x + b.y));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.flameParticles) {
      const wasDown = p.landed;
      let alive = true;
      for (let k = steps - 1; k >= 0 && alive; k--) alive = stepFlameParticle(p, now - k * dt * 1000, dt);
      if (alive && !wasDown && p.landed && flameRng(p.seed ^ 0x51)() < 0.12) {
        // Where the fuel splashes down it throws off a curl of black smoke.
        this.fireSmoke.push({
          x: p.x,
          y: p.y,
          z: this.elevAt(p.x, p.y) + 1.5,
          dx: 8 + (p.seed % 9),
          dy: -6,
          rise: 7 + (p.seed % 6),
          at: now,
          life: 2200 + (p.seed % 1200),
          r0: 2.5,
          r1: 10 + (p.seed % 7),
          alpha: 0.3,
          shade: 0.9,
          seed: p.seed,
        });
      }
      if (!alive) {
        if (p.landed && flameRng(p.seed)() < 0.18) {
          this.fireSmoke.push({
            x: p.x,
            y: p.y,
            z: this.elevAt(p.x, p.y) + p.h / 4,
            dx: 6 + (p.seed % 7),
            dy: -4,
            rise: 4 + (p.seed % 5),
            at: now,
            life: 1500 + (p.seed % 900),
            r0: 2,
            r1: 7 + (p.seed % 5),
            alpha: 0.22,
            shade: 0.85,
            seed: p.seed,
          });
        }
        continue;
      }
      keep.push(p);
      const look = flameParticleLook(p, now);
      if (!look) continue;
      const s = this.toScreen(p.x, p.y);
      drawFlameParticle(ctx, s.x, s.y - p.h, look.r, look.heat, look.alpha);
    }
    ctx.restore();
    this.flameParticles = keep;
  }

  private drawMortarArcs(): void {
    const now = performance.now();
    const blend = Math.min(1, (now - this.snapAt) / 100);
    const live = new Set<number>();
    const ctx = this.ctx;
    for (const p of this.curr.projectiles) {
      if (!p.mortar || p.apex == null || p.hang == null || p.arc == null) continue;
      live.add(p.id);
      const prev = this.prev?.projectiles.find((q) => q.id === p.id);
      const wx = prev ? prev.x + (p.x - prev.x) * blend : p.x;
      const wy = prev ? prev.y + (p.y - prev.y) * blend : p.y;
      const arc = prev?.arc != null ? prev.arc + (p.arc - prev.arc) * blend : p.arc;
      const apex = prev?.apex != null ? prev.apex + (p.apex - prev.apex) * blend : p.apex;
      const world = mortarArcPoints({
        x: wx,
        y: wy,
        vx: p.vx,
        vy: p.vy,
        apex,
        arc,
        hang: p.hang,
        steps: 18,
      });
      const pts = world.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z, u: pt.u }));
      drawMortarSmoke(ctx, this.mortarSmokeScreen(pts), p.id);
      this.mortarSmoke.set(p.id, { pts, at: now });
    }
    for (const [id, trail] of this.mortarSmoke) {
      if (live.has(id)) continue;
      const age = now - trail.at;
      if (age > 900) {
        this.mortarSmoke.delete(id);
        continue;
      }
      drawMortarSmoke(ctx, this.mortarSmokeScreen(trail.pts), id, 1 - age / 900);
    }
  }

  private mortarSmokeScreen(
    pts: readonly { x: number; y: number; z: number; u: number }[],
  ): { x: number; y: number; u: number }[] {
    return pts.map((pt) => {
      const s = this.toScreen(pt.x, pt.y, this.elevAt(pt.x, pt.y) + pt.z);
      return { x: s.x, y: s.y, u: pt.u };
    });
  }

  private drawImpacts(): void {
    const now = performance.now();
    const ctx = this.ctx;
    const keep: typeof this.fx = [];
    for (const f of this.fx) {
      const burst = groundBurst(f);
      const life = burst
        ? burstLifeMs(burst)
        : f.mortar || f.rocket
          ? MORTAR_BURST_MS
          : fxLifeMs(f.kind, f.blast);
      const age = now - f.at;
      if (age > life) {
        this.fxIds.delete(f.id);
        continue;
      }
      // Waiting on its barrage streak to land.
      if (age < 0) {
        keep.push(f);
        continue;
      }
      keep.push(f);
      const t = age / life;
      const s = this.toScreen(f.x, f.y);
      const tip = this.toScreen(f.x + f.vx * 0.08, f.y + f.vy * 0.08);
      const dirX = tip.x - s.x;
      const dirY = tip.y - s.y;
      if (f.rocket && f.z != null) {
        const air = this.toScreen(f.x, f.y, f.z);
        drawAirBurst(ctx, air.x, air.y, t, f.id);
      } else if (burst) {
        drawExplosion(ctx, s.x, s.y, age, f.id, burst, dirX, dirY);
      } else if (f.mortar || f.rocket) {
        // On water: the splash column, grown with the round's firepower.
        drawMortarBurst(ctx, s.x, s.y, t, f.id, waterColumnScale(f));
      } else if (f.splash) {
        drawWaterDetonation(ctx, s.x, s.y, t, f.id, f.caliber);
      }
      const lift =
        f.lift ??
        (f.kind === "miss" || f.kind === "puff"
          ? 0
          : (armorHitLift(f.kind, f.caliber, f.id, f.blast) ?? 14));
      const x = s.x + (f.sx ?? 0);
      const y = s.y - lift;
      if (f.intercept) {
        // Rocket burst in the air: a small puff of fire at flight height.
        const frame = fxFrameAt(age, life, FX_BOOM.frames, false);
        // A RAM interceptor that went off beside the rocket without bursting it: a smaller puff.
        const size = f.kind === "miss" ? RAM_MISS_BURST_SIZE : INTERCEPT_BURST_SIZE;
        drawFxFrame(ctx, FX_BOOM, frame, s.x, s.y - CIWS_INTERCEPT_LIFT, size, 1 - t * 0.5);
      } else if (f.kind === "kill" && f.blast) {
        drawCookoffBurst(ctx, x, y, t, f.id);
        const frame = fxFrameAt(age, life, FX_BOOM.frames, false);
        drawFxFrame(ctx, FX_BOOM, frame, x, y, 56, 1 - t * 0.35);
      } else if (f.kind === "kill" || f.kind === "pen" || f.kind === "hit" || f.kind === "glance") {
        const k: "hit" | "pen" | "glance" =
          f.kind === "pen" ? "pen" : f.kind === "glance" ? "glance" : "hit";
        drawKineticImpact(ctx, {
          kind: k,
          x,
          y,
          dirX,
          dirY,
          t,
          seed: f.id,
          caliber: f.caliber,
        });
      } else if (f.kind === "muzzle") {
        if (f.window) drawWindowMuzzle(ctx, x, y, dirX, dirY, t, f.caliber);
        else drawMuzzleBlast(ctx, x, y, dirX, dirY, t, f.caliber);
      } else if (f.kind === "smoke") {
        const frame = fxFrameAt(age, 700, FX_SMOKE.frames, true);
        drawFxFrame(ctx, FX_SMOKE, frame, x, y - 8 - t * 10, 34 + t * 10, 0.85 - t * 0.7);
      } else if (f.kind === "puff" && !f.splash) {
        const frame = fxFrameAt(age, life, FX_SMOKE.frames, false);
        const smokeBurst = f.shell === "smoke";
        const tiny = smokeBurst ? 52 : isShellCaliber(f.caliber) ? 16 : 11;
        drawFxFrame(
          ctx,
          FX_SMOKE,
          frame,
          s.x,
          s.y - 3 - t * (smokeBurst ? 16 : 7),
          tiny + t * (smokeBurst ? 36 : 5),
          (smokeBurst ? 0.95 : 0.8) - t * 0.7,
        );
      } else if (f.kind === "ricochet") {
        drawRicochetSparks(ctx, x, y, dirX, dirY, t, f.id, f.caliber);
      } else if (f.kind === "miss" && !burst && !f.splash && !f.mortar && !f.rocket) {
        drawGroundMiss(ctx, s.x, s.y, t, f.id, dirX, dirY);
      }
    }
    this.fx = keep;
    this.drawSmoulders(now);
  }

  /** Thin smoke off craters struck while you watched. */
  private drawSmoulders(now: number): void {
    const holes = this.curr.holes ?? [];
    if (holes.length === 0) return;
    const map = this.map();
    const ts = map.tileSize;
    for (const hole of holes) {
      let born = this.holeBorn.get(hole.id);
      if (born == null) {
        const strike = this.fx.find((f) => f.id === hole.seed);
        born = strike ? strike.at : -Infinity;
        this.holeBorn.set(hole.id, born);
      }
      const age = now - born;
      if (!(age < SMOULDER_MS)) continue;
      if (!this.lit(worldToTile(hole.x, ts), worldToTile(hole.y, ts))) continue;
      const c = this.toScreen(hole.x, hole.y);
      drawSmoulder(this.ctx, c.x, c.y, age, hole.seed, this.groundSpan(hole.x, hole.y, hole.radius));
    }
    if (this.holeBorn.size > holes.length + 64) {
      const live = new Set(holes.map((h) => h.id));
      for (const id of this.holeBorn.keys()) if (!live.has(id)) this.holeBorn.delete(id);
    }
  }

  private drawSmokeClouds(): void {
    const clouds = this.curr.smoke ?? [];
    if (clouds.length === 0) return;
    const map = this.map();
    const ts = map.tileSize;
    const ctx = this.ctx;
    const now = performance.now();
    for (const c of clouds) {
      const fade = cloudScale(c);
      const along = c.halfAlong * fade * ts;
      const across = c.halfAcross * fade * ts;
      const cx = worldToTile(c.x, ts);
      const cy = worldToTile(c.y, ts);
      if (!(this.explored?.[cy * map.width + cx] || this.lit(cx, cy))) continue;
      const ground = this.toScreen(c.x, c.y);
      ctx.save();
      ctx.globalAlpha = 0.3 * fade;
      ctx.fillStyle = "#6a6458";
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, along * 1.28, Math.max(12, across * 0.72), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const puffs = smokeCloudPuffs(c.id);
      const perpX = -c.uy;
      const perpY = c.ux;
      for (let i = 0; i < puffs.length; i++) {
        const puff = puffs[i]!;
        const px = c.x + c.ux * puff.u * along + perpX * puff.v * across;
        const py = c.y + c.uy * puff.u * along + perpY * puff.v * across;
        const tx = worldToTile(px, ts);
        const ty = worldToTile(py, ts);
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
        if (!this.explored?.[ty * map.width + tx] && !this.lit(tx, ty)) continue;
        const s = this.toScreen(px, py);
        const frame = fxFrameAt(now + c.id * 40 + i * 110, 1600, FX_SMOKE.frames, true);
        const size = (48 + fade * 28) * puff.size;
        const radial = Math.hypot(puff.u, puff.v);
        const alpha = (0.5 + fade * 0.36) * (1 - radial * 0.28);
        drawFxFrame(ctx, FX_SMOKE, frame, s.x, s.y - 8 - fade * 6, size, alpha);
      }
    }
  }

  private drawDeployProgress(e: EntityView, x: number, y: number, w: number): void {
    if (e.state !== "deploy" && e.state !== "undeploy") return;
    const p = Math.max(0, Math.min(1, e.deployProgress ?? 0));
    const ctx = this.ctx;
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y + 2, w, 5);
    ctx.fillStyle = "#e8b84a";
    ctx.fillRect(x, y + 2, w * p, 5);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + 2, w, 5);
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8dcc4";
    const label = e.state === "undeploy" ? "PACK" : "DEPLOY";
    ctx.fillText(`${label} ${Math.round(p * 100)}%`, x + w / 2, y + 16);
  }

  private drawCaptureProgress(e: EntityView, x: number, y: number, w: number): void {
    const cap = e.capture;
    if (!cap || cap.progress <= 0) return;
    const p = Math.max(0, Math.min(1, cap.progress));
    const holder = this.curr.players.find((pl) => pl.playerId === cap.ownerId);
    const fill = colorHex(holder?.colorId ?? 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(8, 6, 4, 0.78)";
    ctx.fillRect(x, y + 2, w, 5);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y + 2, w * p, 5);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + 2, w, 5);
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8dcc4";
    ctx.fillText(`CAPTURE ${Math.round(p * 100)}%`, x + w / 2, y + 16);
    ctx.restore();
  }

  private hoverSpecial = false;
  private hoverAction: HoverAction | null = null;

  private syncCursor(): void {
    if (this.moveFace) {
      this.hoverSpecial = false;
      this.hoverAction = null;
      this.canvas.classList.remove("cursor-special", "cursor-attack", "cursor-action");
      this.canvas.style.cursor = "";
      return;
    }
    let special = false;
    let action: HoverAction | null = null;
    const aiming =
      (this.attackMoveMode ||
        this.patrolMode ||
        this.forceAttackMode ||
        this.rotateMode ||
        this.guardMode ||
        (this.ctrlHeld && this.ownForceIds().length > 0)) &&
      !this.overControl;
    if (!this.placeMode && !this.overControl && !this.box && this.mouseX >= 0) {
      const { w, h } = this.viewSize();
      if (this.mouseX <= w && this.mouseY <= h) {
        const hit = this.hit(this.mouseX, this.mouseY);
        special = !!hit && this.canSpecial(hit);
        if (!special && !aiming) {
          const you = this.curr.youPlayerId;
          const selected = this.curr.entities.filter(
            (e) => this.selected.has(e.id) && !e.wreck && e.hp > 0,
          );
          const tile = this.screenToTile(this.mouseX, this.mouseY);
          const scrap = this.curr.scrap.some((s) => s.x === tile.x && s.y === tile.y && s.yield > 0);
          action = resolveHoverAction({
            youPlayerId: you,
            selected,
            hit,
            scrap,
            allied: (id) => ownerAllied(this.curr, id),
          });
        }
      }
    }
    this.hoverSpecial = special;
    this.hoverAction = action;
    this.canvas.classList.toggle("cursor-special", special);
    this.canvas.classList.toggle("cursor-attack", aiming && !special);
    this.canvas.classList.toggle("cursor-action", !!action && !special);
    this.canvas.style.cursor = special || aiming || action ? "none" : "";
  }

  private drawHoverCursor(): void {
    if (!this.hoverAction || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    drawActionCursor(this.ctx, this.hoverAction, this.mouseX, this.mouseY, this.lastT / 1000);
  }

  private drawSpecialCursor(): void {
    if (!this.hoverSpecial) return;
    const x = this.mouseX;
    const y = this.mouseY;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = "#e8b84a";
    ctx.strokeStyle = "#140e0a";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0.5, 0.5);
    ctx.lineTo(0.5, 20);
    ctx.lineTo(6.2, 14.8);
    ctx.lineTo(10.5, 24);
    ctx.lineTo(14.2, 22.2);
    ctx.lineTo(9.4, 13.2);
    ctx.lineTo(16.5, 13.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(17, 4);
    ctx.lineTo(25, 4);
    ctx.lineTo(21, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawCrits(e: EntityView, rightX: number, y: number): void {
    if (e.wreck || !e.crits || e.crits.length === 0) return;
    const size = 16;
    const gap = 2;
    const ctx = this.ctx;
    let x = rightX - e.crits.length * (size + gap) + gap;
    for (const c of e.crits) {
      const img = critIcon(c);
      if (spriteReady({ image: img })) {
        ctx.drawImage(img, Math.round(x), Math.round(y), size, size);
      }
      x += size + gap;
    }
  }

  private hostileOwner(ownerId: string | undefined): boolean {
    return !!ownerId && !ownerAllied(this.curr, ownerId);
  }

  private paintHpBar(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    alpha: number,
    hostile = false,
    vivid = false,
  ): void {
    const ctx = this.ctx;
    const fillW = w * Math.max(0, Math.min(1, ratio));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = vivid ? "rgba(6, 4, 2, 0.88)" : "rgba(8, 6, 4, 0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = vivid ? alpha : alpha * 1.15;
    ctx.fillStyle = hpBarFill(ratio, hostile, vivid);
    ctx.fillRect(x, y, fillW, h);
    if (vivid && fillW > 1 && h >= 3) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = "rgba(255, 255, 230, 0.7)";
      ctx.fillRect(x, y, fillW, 1);
    }
    if (vivid) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "rgba(8, 6, 4, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  private drawGarrisonBars(e: EntityView, x: number, y: number): void {
    const bars = e.garrison?.bars ?? e.gun?.bars;
    if (!bars || bars.length === 0) return;
    const barW = 18;
    const barH = 3;
    const gap = 2;
    const pad = 2;
    const totalH = bars.length * (barH + gap) - gap;
    const hostile = this.hostileOwner(e.garrison ? e.garrison.ownerId : e.ownerId);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(8, 6, 4, 0.62)";
    ctx.fillRect(Math.round(x) - pad, Math.round(y) - pad, barW + pad * 2, totalH + pad * 2);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]!;
      const ratio = b.hpMax > 0 ? b.hp / b.hpMax : 0;
      this.paintHpBar(Math.round(x), Math.round(y) + i * (barH + gap), barW, barH, ratio, 0.9, hostile);
    }
    ctx.restore();
  }

  private drawScoutBar(e: EntityView, x: number, y: number): void {
    const scout = e.scout;
    if (!scout || e.wreck || scout.hpMax <= 0) return;
    const selected = this.selected.has(e.id);
    if (!selected && !scout.out) return;
    const ratio = Math.max(0, Math.min(1, scout.hp / scout.hpMax));
    const barW = selected ? 18 : 14;
    const barH = 2;
    this.ctx.save();
    this.paintHpBar(Math.round(x), Math.round(y), barW, barH, ratio, selected ? 0.95 : 0.7, this.hostileOwner(e.ownerId), selected);
    this.ctx.restore();
  }

  private maybeHp(e: EntityView, x: number, y: number, w: number): void {
    if (e.wreck) return;
    const now = performance.now();
    const selected = this.selected.has(e.id);
    const damaged = (this.damagedUntil.get(e.id) ?? 0) > now;
    const unit = e.kind === "unit";
    const capturing = (e.capture?.progress ?? 0) > 0;
    if (!(unit || selected || damaged || capturing)) return;
    const ratio = Math.max(0, Math.min(1, e.hp / e.hpMax));
    const barW = Math.max(8, selected ? w * 0.48 : w * 0.4);
    const barH = selected ? 3 : 2;
    const bx = x + (w - barW) / 2;
    const by = y - (selected ? 4 : 3);
    const alpha = selected ? 1 : damaged ? 0.42 : 0.28;
    const ctx = this.ctx;
    ctx.save();
    this.paintHpBar(bx, by, barW, barH, ratio, alpha, this.hostileOwner(e.ownerId), selected);
    this.paintAmmoBars(e, bx, by + barH + 1, barW, Math.min(1, alpha + 0.12));
    ctx.restore();
  }

  /** Thin yellow (main store, or a Jump Jet's fuel) and gray (secondary) strips under the health bar. */
  private paintAmmoBars(e: EntityView, x: number, y: number, w: number, alpha: number): void {
    const ratios = ammoBarRatios(e);
    const ctx = this.ctx;
    for (let i = 0; i < ratios.length; i++) {
      const by = y + i * 2;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
      ctx.fillRect(x, by, w, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i === 0 ? AMMO_PRIMARY_FILL : AMMO_SECONDARY_FILL;
      ctx.fillRect(x, by, w * ratios[i]!, 1);
    }
  }

  private ownerColor(e: EntityView): string {
    if (isCivilianType(e.type) && !e.ownerId) {
      const occ = e.garrison?.ownerId;
      if (occ) {
        const holder = this.curr.players.find((pl) => pl.playerId === occ);
        if (holder) return colorHex(holder.colorId);
      }
      return CIV_FILL;
    }
    const p = this.curr.players.find((pl) => pl.playerId === e.ownerId);
    return colorHex(p?.colorId ?? 0);
  }

  private drawGhost(type: BuildingType): void {
    const def = catalog(type);
    const tile = this.screenToTile(this.mouseX, this.mouseY);
    const ok = previewPlace(this.curr, type, tile.x, tile.y);
    const ts = this.ts();
    const top = ok ? "#7dff6a" : "#ff5a4a";
    const x = tile.x * ts;
    const y = tile.y * ts;
    const bw = def.tileW * ts;
    const bh = def.tileH * ts;
    const elev = this.buildingElev({ tileX: tile.x, tileY: tile.y, tileW: def.tileW, tileH: def.tileH });
    const spr = buildingSpriteFor(type);
    if (spr && spriteReady(spr)) {
      const south = this.toScreen(x + bw, y + bh, elev);
      const east = this.toScreen(x + bw, y, elev);
      const west = this.toScreen(x, y + bh, elev);
      const n = this.toScreen(x, y, elev);
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = top;
      this.fillQuad(n, east, south, west);
      ctx.globalAlpha = 0.55;
      const ground = buildingGroundFor(type);
      if (ground && spriteReady(ground)) drawBuildingSprite(ctx, ground, south.x, south.y, east.x - west.x);
      drawBuildingSprite(ctx, spr, south.x, south.y, east.x - west.x);
      ctx.restore();
      // The ghost lays its gun toward the viewer.
      if (type === "ciws") this.drawCiwsGun(spr, south.x, south.y, east.x - west.x, 0.55, Math.PI / 4);
      if (type === "ram") this.drawCiwsGun(spr, south.x, south.y, east.x - west.x, 0.55, Math.PI / 4, undefined, RAM_TURRET_SHEET);
      ctx.strokeStyle = top;
      ctx.lineWidth = 2;
      this.strokeGroundRect(x, y, bw, bh, elev);
      return;
    }
    this.drawIsoBox(x, y, bw, bh, this.extrude(type), top, {
      alpha: 0.4,
      stroke: top,
      strokeW: 2,
      elev,
    });
  }

  /** Field structures carry the same fog veil as the ground under their span. */
  private drawFieldVeiled(e: EntityView, span: { length: number; thick: number } | null | undefined, draw: () => void): void {
    const ts = this.ts();
    const corners = fieldFrameCorners(e.x, e.y, e.facing, span?.length ?? 24, span?.thick ?? 8, 2);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const tx0 = Math.floor(Math.min(...xs) / ts);
    const ty0 = Math.floor(Math.min(...ys) / ts);
    const foot = {
      tileX: tx0,
      tileY: ty0,
      tileW: Math.max(1, Math.ceil(Math.max(...xs) / ts) - tx0),
      tileH: Math.max(1, Math.ceil(Math.max(...ys) / ts) - ty0),
    };
    const elev = this.elevAt(e.x, e.y);
    const screen = corners.map((p) => this.toScreen(p.x, p.y, elev));
    const sx = screen.map((p) => p.x);
    const sy = screen.map((p) => p.y);
    const x0 = Math.min(...sx) - 8;
    const y0 = Math.min(...sy) - 40;
    const bounds = { x: x0, y: y0, w: Math.max(...sx) + 8 - x0, h: Math.max(...sy) + 8 - y0 };
    this.drawVeiled(foot, elev, 24, bounds, draw);
  }

  private drawField(e: EntityView, ghost: boolean): void {
    const span = fieldSpan(e.type);
    if (!ghost && span && this.selected.has(e.id)) {
      const elev = this.elevAt(e.x, e.y);
      const pts = fieldFrameCorners(e.x, e.y, e.facing, span.length, span.thick, 5).map((p) => this.toScreen(p.x, p.y, elev));
      drawSelectFrame(this.ctx, pts, { hostile: this.hostileOwner(e.ownerId), now: performance.now() });
    }
    const veiled = (draw: () => void): void => this.drawFieldVeiled(e, span, draw);
    if (e.type === "wall") {
      const hurt = e.hpMax > 0 ? Math.max(0, 1 - e.hp / e.hpMax) : 0;
      veiled(() => this.drawConcreteWall(e.x, e.y, e.facing, { hurt, alpha: ghost ? 0.45 : 1, seed: e.id * 2654435761 }));
      if (!ghost) {
        const s = this.toScreen(e.x, e.y, this.elevAt(e.x, e.y));
        const w = Math.max(22, this.groundSpan(e.x, e.y, span?.length ?? 24));
        this.maybeHp(e, s.x - w / 2, s.y - 18, w);
      }
      return;
    }
    if (e.type === "teeth") {
      veiled(() => this.drawTeeth(e.x, e.y, e.facing, ghost ? 0.45 : 1, e.id));
      return;
    }
    if (e.type === "trench") {
      const manned = !ghost && (e.garrison?.count ?? 0) > 0;
      const holder = manned ? this.curr.players.find((pl) => pl.playerId === e.garrison?.ownerId) : undefined;
      veiled(() => this.drawTrenchPit(e.x, e.y, e.facing, {
        alpha: ghost ? 0.45 : 1,
        seed: e.id * 2654435761,
        manned,
        bandColor: holder ? colorHex(holder.colorId) : undefined,
      }));
      if (!ghost) {
        const s = this.toScreen(e.x, e.y, this.elevAt(e.x, e.y));
        const w = Math.max(20, this.groundSpan(e.x, e.y, span?.length ?? 16));
        this.maybeHp(e, s.x - w / 2, s.y - 10, w);
        this.drawGarrisonBars(e, s.x - 9, s.y - 18);
      }
      return;
    }
    veiled(() => this.drawSandbagWall(e.x, e.y, e.facing, { ruined: !!e.ruined, alpha: ghost ? 0.45 : 1, seed: e.id * 2654435761 }));
  }

  /** Structures an engineer has been ordered to lay, drawn as a ghost until the real one replaces them. */
  private collectFieldSites(items: DrawItem[]): void {
    for (const e of this.curr.entities) {
      if (!e.fieldSites || e.garrisonedIn) continue;
      for (const site of e.fieldSites) {
        const span = fieldSpan(site.structure);
        if (!span) continue;
        items.push({
          layer: STANDING_DRAW_LAYER,
          z: isoDepth(site.x, site.y),
          foot: {
            cx: site.x,
            cy: site.y,
            ax: -Math.sin(site.facing),
            ay: Math.cos(site.facing),
            halfAlong: span.length / 2,
            halfAcross: span.thick / 2,
          },
          run: () => {
            if (site.structure === "teeth") {
              this.drawTeeth(site.x, site.y, site.facing, FIELD_SITE_ALPHA, 0);
            } else if (site.structure === "wall") {
              this.drawConcreteWall(site.x, site.y, site.facing, { alpha: FIELD_SITE_ALPHA, seed: 7 });
            } else if (site.structure === "trench") {
              this.drawTrenchPit(site.x, site.y, site.facing, { alpha: FIELD_SITE_ALPHA, seed: 7 });
            } else {
              this.drawSandbagWall(site.x, site.y, site.facing, { alpha: FIELD_SITE_ALPHA, seed: 7 });
            }
          },
        });
      }
    }
  }

  private drawConcreteWall(
    x: number,
    y: number,
    facing: number,
    opts: { hurt?: number; alpha: number; seed: number; bad?: boolean },
    extras?: { x: number; y: number; facing: number }[],
  ): void {
    const span = fieldSpan("wall");
    if (!span) return;
    const run = this.wallRun({ x, y, facing }, extras ?? []);
    const grounds: number[] = [];
    for (const seg of run) grounds.push(...this.wallGrounds(seg, span.thick));
    const worldPx = this.groundSpan(x, y, 10) / 10;
    const slabLevels = ISO_ELEVATION > 0 ? (WALL_SLAB_H * worldPx) / ISO_ELEVATION : 0;
    drawWall(this.ctx, {
      x,
      y,
      facing,
      length: span.length,
      thick: span.thick,
      hurt: opts.hurt ?? 0,
      seed: opts.seed >>> 0,
      alpha: opts.alpha,
      bad: opts.bad,
      ground: (wx, wy) => this.elevAt(wx, wy),
      topElev: wallTopElev(grounds, slabLevels),
      levelPx: ISO_ELEVATION,
      worldPx,
      project: (wx, wy, elev) => this.toScreen(wx, wy, elev),
      seal: wallEndSeal({ x, y, facing, length: span.length, thick: span.thick }, run),
    });
  }

  /** This section plus every wall whose ends meet it, including a line still being sited. */
  private wallRun(
    origin: { x: number; y: number; facing: number },
    extras: { x: number; y: number; facing: number }[],
  ): { x: number; y: number; length: number; facing: number }[] {
    const span = fieldSpan("wall");
    if (!span) return [];
    const all: { x: number; y: number; length: number; facing: number }[] = [];
    const add = (x: number, y: number, facing: number) => {
      if (all.some((s) => Math.hypot(s.x - x, s.y - y) < 0.5)) return;
      all.push({ x, y, length: span.length, facing });
    };
    add(origin.x, origin.y, origin.facing);
    for (const e of extras) add(e.x, e.y, e.facing);
    for (const e of this.curr.entities) {
      if (e.type === "wall" && e.hp > 0) add(e.x, e.y, e.facing);
    }
    const group: { x: number; y: number; length: number; facing: number }[] = [];
    const seen = new Set<number>();
    const originIndex = all.findIndex((s) => Math.hypot(s.x - origin.x, s.y - origin.y) < 0.5);
    if (originIndex < 0) return [];
    seen.add(originIndex);
    group.push(all[originIndex]!);
    for (let i = 0; i < group.length; i++) {
      for (let j = 0; j < all.length; j++) {
        if (seen.has(j)) continue;
        if (!wallSectionsConnect(group[i]!, all[j]!)) continue;
        seen.add(j);
        group.push(all[j]!);
      }
    }
    return group;
  }

  private wallGrounds(seg: { x: number; y: number; length: number; facing: number }, thick: number): number[] {
    const tx = -Math.sin(seg.facing);
    const ty = Math.cos(seg.facing);
    const fx = Math.cos(seg.facing);
    const fy = Math.sin(seg.facing);
    const hl = seg.length / 2;
    const ht = thick / 2;
    const out: number[] = [];
    for (const a of [-hl, 0, hl]) {
      for (const c of [-ht, 0, ht]) {
        out.push(this.elevAt(seg.x + tx * a + fx * c, seg.y + ty * a + fy * c));
      }
    }
    return out;
  }

  private drawSandbagWall(
    x: number,
    y: number,
    facing: number,
    opts: { ruined?: boolean; alpha: number; seed: number; bad?: boolean },
  ): void {
    const span = fieldSpan("sandbags");
    if (!span) return;
    const elev = this.elevAt(x, y);
    const lift = this.groundSpan(x, y, 10) / 10;
    drawSandbags(this.ctx, {
      x,
      y,
      facing,
      length: span.length,
      thick: span.thick,
      ruined: !!opts.ruined,
      seed: opts.seed >>> 0,
      alpha: opts.alpha,
      bad: opts.bad,
      project: (wx, wy, up) => {
        const p = this.toScreen(wx, wy, elev);
        return { x: p.x, y: p.y - up * lift };
      },
    });
  }

  private drawTrenchPit(
    x: number,
    y: number,
    facing: number,
    opts: { alpha: number; seed: number; bad?: boolean; manned?: boolean; bandColor?: string },
  ): void {
    const span = fieldSpan("trench");
    if (!span) return;
    const elev = this.elevAt(x, y);
    const lift = this.groundSpan(x, y, 10) / 10;
    drawTrench(this.ctx, {
      x,
      y,
      facing,
      length: span.length,
      thick: span.thick,
      seed: opts.seed >>> 0,
      alpha: opts.alpha,
      bad: opts.bad,
      manned: opts.manned,
      bandColor: opts.bandColor,
      project: (wx, wy, up) => {
        const p = this.toScreen(wx, wy, elev);
        return { x: p.x, y: p.y - up * lift };
      },
    });
  }

  /** One pyramid on the spot, at the size four of them used to share. */
  private drawTeeth(x: number, y: number, facing: number, alpha: number, id: number): void {
    const size = Math.max(28, this.groundSpan(x, y, TEETH_DRAW_WORLD));
    const dir = facingToIso(facing, this.ts());
    const s = this.toScreen(x, y);
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    drawUnitSprite(this.ctx, { ...TEETH_SPRITE, drawSize: size }, s.x, s.y, dir.x, dir.y, {
      moving: false,
      id,
      now: 0,
      facing,
    });
    this.ctx.restore();
  }

  /** One wheel notch turns the ghost 15°. Trackpads scroll in pixels, so they turn by fractions. */
  private rotateField(deltaY: number, deltaMode: number): void {
    const notches = deltaMode === 1 ? deltaY / 3 : deltaMode === 2 ? deltaY : deltaY / 100;
    this.fieldFacing += notches * (Math.PI / 12);
  }

  private fieldPieces(type: FieldStructureType, shown: boolean): { x: number; y: number; facing: number }[] {
    const w = this.screenToWorld(this.mouseX, this.mouseY);
    const face = this.fieldFacing;
    const drag = this.fieldDrag;
    if (!drag) return [{ x: w.x, y: w.y, facing: shown ? this.fieldShown : face }];
    const pieces = fieldLine(type, drag.x, drag.y, w.x, w.y, face);
    if (shown && pieces.length === 1 && pieces[0]) pieces[0].facing = this.fieldShown;
    return pieces;
  }

  private drawFieldGhost(type: FieldStructureType, fromBase: boolean): void {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.fieldShownAt) / 1000));
    this.fieldShownAt = now;
    let d = this.fieldFacing - this.fieldShown;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.fieldShown += d * Math.min(1, dt * 16);
    const pieces = this.fieldPieces(type, true);
    const each = catalog(type).cost;
    const affordAll = this.curr.you.scrap >= each * pieces.length;
    let accepted = 0;
    let open = true;
    for (const p of pieces) {
      const clear = previewField(this.curr, type, p.x, p.y, p.facing);
      const near = !fromBase || (isYardField(type) && previewYardField(this.curr, type, p.x, p.y, p.facing));
      const ok = fromBase ? open && clear && near : clear && affordAll;
      if (fromBase && !ok) open = false;
      if (ok) accepted++;
      if (type === "teeth") {
        this.drawTeeth(p.x, p.y, p.facing, ok ? 0.72 : 0.4, 0);
        if (!ok) this.strokeFieldFoot(type, p, "#ff5a4a");
      } else if (type === "wall") {
        this.drawConcreteWall(p.x, p.y, p.facing, { alpha: ok ? 0.78 : 0.5, seed: 7, bad: !ok }, pieces);
      } else if (type === "trench") {
        this.drawTrenchPit(p.x, p.y, p.facing, { alpha: 0.78, seed: 7, bad: !ok });
      } else {
        this.drawSandbagWall(p.x, p.y, p.facing, { alpha: 0.78, seed: 7, bad: !ok });
      }
    }
    if (pieces.length < 2) return;
    const last = pieces[pieces.length - 1]!;
    const s = this.toScreen(last.x, last.y);
    const ctx = this.ctx;
    const billCount = fromBase ? accepted : pieces.length;
    const bill = each * billCount;
    const afford = fromBase ? accepted === pieces.length && this.curr.you.scrap >= bill : affordAll;
    ctx.save();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.fillStyle = afford ? "#e8b84a" : "#ff5a4a";
    const label = `${billCount} × ${each} = ${bill}`;
    ctx.strokeText(label, s.x + 14, s.y - 14);
    ctx.fillText(label, s.x + 14, s.y - 14);
    ctx.restore();
  }

  /** The line sited from the Defences tab, drawn until the yard finishes it. */
  private drawYardBuild(): void {
    const q = this.curr.you.structureQueue;
    if (!q?.sites || q.sites.length === 0 || !isYardField(q.type)) return;
    for (const s of q.sites) {
      if (q.type === "wall") {
        this.drawConcreteWall(s.x, s.y, s.facing, { alpha: 0.55, seed: 3 }, q.sites);
      } else {
        this.drawSandbagWall(s.x, s.y, s.facing, { alpha: 0.55, seed: 3 });
      }
    }
  }

  private strokeFieldFoot(type: FieldStructureType, p: { x: number; y: number; facing: number }, color: string): void {
    const span = fieldSpan(type);
    if (!span) return;
    const fx = Math.cos(p.facing);
    const fy = Math.sin(p.facing);
    const hl = span.length / 2;
    const ht = span.thick / 2;
    const elev = this.elevAt(p.x, p.y);
    const pts = [
      [-hl, -ht],
      [hl, -ht],
      [hl, ht],
      [-hl, ht],
    ].map(([a, c]) => this.toScreen(p.x - fy * a! + fx * c!, p.y + fx * a! + fy * c!, elev));
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawMini(): void {
    const map = this.map();
    const ctx = this.mctx;
    const w = this.mini.clientWidth;
    const h = this.mini.clientHeight;
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, w, h);
    const scale = Math.min(w / map.width, h / map.height);
    const dw = map.width * scale;
    const dh = map.height * scale;
    ctx.imageSmoothingEnabled = false;
    if (this.miniTerrain) ctx.drawImage(this.miniTerrain.canvas, 0, 0, dw, dh);
    if (this.miniFog) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.miniFog, 0, 0, dw, dh);
      ctx.imageSmoothingEnabled = false;
    }
    const ts = map.tileSize;
    const { w: vw, h: vh } = this.viewSize();
    const corners = [
      this.screenToWorldFlat(0, 0),
      this.screenToWorldFlat(vw, 0),
      this.screenToWorldFlat(vw, vh),
      this.screenToWorldFlat(0, vh),
    ];
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((c, i) => {
      const x = (c.x / ts) * scale;
      const y = (c.y / ts) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    for (const e of this.curr.entities) {
      if (e.garrisonedIn) continue;
      ctx.fillStyle = e.wreck ? "#6a6860" : this.ownerColor(e);
      const tx = e.kind === "building" ? e.tileX + e.tileW / 2 : e.x / ts;
      const ty = e.kind === "building" ? e.tileY + e.tileH / 2 : e.y / ts;
      const sz = e.kind === "building" ? 4 : 3;
      ctx.fillRect(tx * scale - sz / 2, ty * scale - sz / 2, sz, sz);
    }
  }
}

/**
 * A heavy round bursting on dry ground: a shell into the dirt, or a mortar
 * bomb, field-gun shell, rocket, or aircraft bomb that did not land in water
 * or go off in the air. Undefined for everything else.
 */
function groundBurst(f: {
  kind: string;
  caliber?: number;
  damage?: number;
  shell?: string;
  splash?: boolean;
  mortar?: boolean;
  bomb?: boolean;
  rocket?: boolean;
  z?: number;
  intercept?: boolean;
}): BurstSpec | undefined {
  if (f.splash || f.intercept || (f.rocket && f.z != null)) return undefined;
  if (f.mortar || f.rocket) return burstSpec(f);
  if (f.kind === "miss" && isShellCaliber(f.caliber) && f.shell !== "smoke") return burstSpec(f);
  return undefined;
}

/** A lobbed round in water: the splash column at its old scale, grown with firepower. */
function waterColumnScale(f: { caliber?: number; damage?: number; bomb?: boolean; rocket?: boolean; mortar?: boolean }): number {
  const base = f.bomb ? AIR_BOMB_BURST_SCALE : f.rocket ? ROCKET_BURST_SCALE : 1;
  const ref = burstSpec(f.bomb ? { caliber: 250, damage: 70, bomb: true, mortar: true } : f.rocket ? { caliber: 80, damage: 42, rocket: true } : { caliber: 60, damage: 56, mortar: true });
  return base * (burstSpec(f).power / ref.power);
}
