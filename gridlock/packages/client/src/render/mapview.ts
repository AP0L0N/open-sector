import {
  AIRFIELD_BACK_DEPTH,
  BUILDING_TURN_STEP,
  buildingRect,
  buildingSite,
  isTurnedBuilding,
  pointInIsoPrism,
  rectCorners,
  rectWorld,
  turnedBox,
  catalog,
  isCyborg,
  FW190_WING_GUN_OFFSET,
  clampIsoCamera,
  cloudScale,
  smokeCloudPuffs,
  fires,
  radarLaidOf,
  aimsOwnGun,
  mountArcDegOf,
  hasSpotlight,
  headlightLit,
  hullLamps,
  HEADLIGHT_HALF_DEG,
  BUILDING_TYPES,
  NEUTRAL_OWNER,
  sightTilesOf,
  TILE_SUBDIV,
  daylightAt,
  SPOTLIGHT_HALF_DEG,
  SPOTLIGHT_REACH_TILES,
  SPOTLIGHT_TURN_DEG_PER_SEC,
  TOWER_EYE_HEIGHT,
  fieldSpan,
  isConcreteLine,
  wallAxes,
  GUARD_CONE_DEG,
  isCivilianType,
  isRubble,
  isFieldStructure,
  isBridge,
  bridgeAlong,
  bridgeBrickLength,
  bridgeCost,
  bridgeTiles,
  bridgeWidth,
  inBridge,
  previewBridge,
  type BridgeSpan,
  type BridgeType,
  isInfantryType,
  PTRD_CALIBER,
  isNavalType,
  BATTLESHIP_HALF_LENGTH,
  isSupplyCarrier,
  isTorpedoBody,
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
  HEIGHT_BASE,
  PATROL_POINTS_MAX,
  connectPatrolPoints,
  garrisonWindowLift,
  hasScout,
  garrisonCandidate,
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
  isRotatableBuilding,
  isDefenceStructure,
  isYardField,
  previewConstruct,
  previewField,
  previewPlace,
  previewYardField,
  fieldPath,
  gateSiteAt,
  specialLabel,
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
  type LampType,
  type MapLamp,
  type FieldStructureType,
  type ConcreteLineType,
  type EntityView,
  type IsoPt,
  type MapDef,
  type MatchSnapshot,
  type MineView,
  type ShellHoleView,
  wallRiseLimit,
  wallRunTops,
} from "@gridlock/shared";
import {
  FX_BOOM,
  FX_SMOKE,
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
  drawAirBurst,
  drawRocketHead,
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
import {
  SMOULDER_MS,
  burstLifeMs,
  burstSpec,
  deathBlastLifeMs,
  deathBlastSpec,
  heBurstSpec,
  drawDeathBlast,
  drawExplosion,
  drawSmoulder,
  drawWaterBurst,
  waterBurstLifeMs,
  type BurstSpec,
  type DeathBlastSpec,
} from "./explosion.js";
import {
  coverWithWater,
  fallbackHoleRect,
  propScreenRect,
  screenWaterCovers,
  unionRect,
} from "./water-cover.js";
import { aimMoveFace, moveFaceArmed, moveFaceCommand } from "./move-face.js";
import {
  UNIT_VISUAL_SCALE,
  INFANTRY_VISUAL_SCALE,
  OAK_FACES,
  PINE_FACES,
  BUSH_FACES,
  SIGN_FACES,
  CLUTTER_SPRITES,
  LAMP_SPRITES,
  STUMP_FACES,
  CRATER_FACES,
  CIWS_TURRET_SHEET,
  RAM_TURRET_SHEET,
  gunLayerFor,
  unturnedBuildingSprite,
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
  BATTLESHIP_LAYERS,
  BATTLESHIP_SPRITE,
  unitSpritePaintRect,
  wreckSpriteFor,
  GUNNER_DIE_SPRITE,
  GUNNER_FIRE_SPRITE,
  HAULER_CART_SPRITE,
  HAULER_CART_WRECK_SPRITE,
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
  CYBORGCOMMANDER_CRAWL_FIRE_SPRITE,
  CYBORGCOMMANDER_CRAWL_SPRITE,
  CYBORGCOMMANDER_DIE_SPRITE,
  CYBORGCOMMANDER_FIRE_SPRITE,
  CYBORGCOMMANDER_SPRITE,
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
  NEUTRAL_UNIT_FILTER,
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
import { drawSearchlightAt, drawTowerSearchlight, type SearchlightPose } from "./searchlight.js";
import { drawTorpedoBody } from "./torpedo-draw.js";
import { drawRadarContact, drawRadarOffline, radarContactLit } from "./radar-panel.js";
import { drawSonarContact, drawWaterMine } from "./sonar-fx.js";
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
import {
  drawShipWake,
  shipLeavesWake,
  shipWakeOrigins,
  shipWakePose,
  shipWakeScale,
  shipWakeSpacing,
  spawnShipWake,
  type ShipWakePatch,
} from "./ship-wake.js";
import { followCart, type CartPose } from "./mauler-cart.js";
import { AMMO_PRIMARY_FILL, AMMO_SECONDARY_FILL, ammoBarRatios, outOfAmmo } from "./ammo-bars.js";
import { OUT_OF_AMMO_SIZE, drawOutOfAmmo } from "./out-of-ammo.js";
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
  fieldGunNudgePx,
  recoilAmounts,
  recoilLayerShift,
  recoilPixels,
  tankGunRecoils,
  type GunRecoil,
} from "./gun-recoil.js";
import { drawFieldGunSmoke, fieldGunSmokePose, spawnFieldGunSmoke, type FieldGunSmokePuff } from "./field-gun-smoke.js";
import {
  BATTLESHIP_WORLD_PER_UNIT,
  battleshipLayers,
  shipBarrelMuzzle,
  shipCiwsMuzzle,
  shipLampMount,
} from "./battleship.js";
import {
  drawMuzzleSmoke,
  muzzleSmokePose,
  spawnMuzzleSmoke,
  type MuzzleSmokePuff,
} from "./muzzle-smoke.js";
import { spatialMix } from "../ui/spatial-sfx.js";
import { playSoundEvents, updateAmbient, warmBattle } from "../ui/game-audio.js";
import { SoundTracker } from "./sound-events.js";
import { drawGatlingFlash, gatlingMuzzles } from "./gatling-flash.js";
import { roofCiwsMuzzle } from "./roof-ciws.js";
import { CIWS_INTERCEPT_LIFT, CIWS_MUZZLE_REACH, ciwsMuzzleLift, ciwsTurretCell, ciwsTurretRow } from "./ciws.js";
import { ciwsBurstTracers, ciwsTracers } from "./ciws-tracer.js";
import { PTRD_MUZZLE_LIFT, ptrdTracers } from "./ptrd-tracer.js";
import { ROOF_CIWS_LIFT } from "./roof-ciws.js";

/** Gatling barrels above the ground point, as a share of the drawn cell. The Walker matches gatling-flash ARM_LIFT. */
const WALKER_ARM_LIFT = 0.45;
const CYBORG_ARM_LIFT = 0.3;
/** The Cyborg Commander's force-field bar, over his health bar. */
const FIELD_BAR_FILL = "#7cc8ff";
import { INTERCEPT_BURST_SIZE, RAM_MISS_BURST_SIZE, interceptorTrail } from "./ram.js";
import { drawCyborgDeathSparks } from "./cyborg-sparks.js";
import { drawGroundShadow, unitCastsShadow, unitShadowFootprint } from "./unit-shadow.js";
import { buildingShadowFootprint, convexHull, drawCastShadows, shadowOffset, treeShadowFootprint } from "./cast-shadow.js";
import { buildingGroundElev, drawYardWear, WALL_SHARE, wallFootprint, yardWearFootprint } from "./building-ground.js";
import { footprintPeak, radarReachTiles } from "./radar-reach.js";
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
  FIRE_SMOKE_EVERY_MS,
  FIRE_TONGUE_BUDGET,
  FIRE_TONGUES_MAX,
  drawTongue,
  FLAME_PARTICLE_CAP,
  fireTongues,
  flameParticleLook,
  jetLanding,
  jetParticles,
  patchHeat,
  rng as flameRng,
  SCORCH_CAP,
  SCORCH_MS,
  stepFlameParticle,
  tonguePose,
  type FlameParticle,
} from "./flame-fx.js";
import { AIR_DRAW_LAYER, aircraftShadowScale, airLiftPx, drawFallingBomb, inAir, lerpAirAlt } from "./aircraft.js";
import { layCrashTrail, layChargeTrail, CRASH_PUFF_CAP, CHARGE_PUFF_CAP } from "./crash-smoke.js";
import { canopySway, drawCanopy, drawCrate, drawMine, troopCanopySpan } from "./airdrop-fx.js";
import { barrageTracers, tracerLandsAt, tracerSpan, type BarrageTracer } from "./barrage-tracer.js";
import { RUBBLE_MAX_RISE, drawRubble } from "./rubble.js";
import { courseHeight, drawSandbags } from "./sandbags.js";
import { fieldPointsWithCursor, pinFieldPoint, undoFieldPoint } from "./field-place.js";
import { drawTrench } from "./trench.js";
import {
  drawWall,
  LARGE_WALL_STYLE,
  WALL_STYLE,
  wallFootprintWorld,
  wallJoins,
  wallSectionsConnect,
  wallShadowHeight,
  wallTopElev,
  type WallSection,
} from "./wall.js";
import { pyroNozzleScreen } from "./pyro-nozzle.js";
import { cyborgCommanderLens } from "./cyborgcommander-muzzle.js";
import { beamEnd, beamShare, drawForceField, drawLaserBeam } from "./laser-beam.js";
import { inScreenRect, unitGroundSink, unitPickRect, type ScreenRect } from "./unit-hit.js";
import { engineRowFromProjectedFacing, engineRowFromScreen } from "./turntable.js";
import { drawSelectFrame, fieldFrameCorners } from "./select-frame.js";
import { brickDeckElev, drawBrick, layoutBridges, type BrickIn, type BrickLayout } from "./bridge.js";

/** Bridges lie on the water: over ground decals, under shadows, corpses, and everything standing. */
const BRIDGE_DRAW_LAYER = -1.5;

/** One bridge brick as it is drawn: where it lies, and how it meets its neighbours. */
interface BridgeLook {
  type: BridgeType;
  span: BridgeSpan;
  width: number;
  layout: BrickLayout;
  ruined?: boolean;
}
import { mapZoomAfterWheel, zoomCamAt } from "./camera-zoom.js";
import { drawActionCursor, drawDeployCursor, type DeployCursorMode } from "./cursor.js";
import { strideFrame, strideHop, unitStepping, WALKER_STRIDE_WORLD } from "./stepping.js";
import { atInfantrySheet, cyborgSheet, gunnerSheet, heldFrame, jumpJetSheet, medicSheet, mortarmanSheet, pyroSheet, rocketerSheet, sniperSheet, trooperSheet } from "./infantry-visual.js";
import {
  axisFootprint,
  BUSH_DRAW_LAYER,
  compareDrawOrder,
  CORPSE_DRAW_LAYER,
  type DrawKey,
  GROUND_DECAL_DRAW_LAYER,
  HOLE_DRAW_LAYER,
  STANDING_DRAW_LAYER,
} from "./corpse-depth.js";
import { CLUTTER_BREAK_MS, drawClutterSplinters } from "./clutter-fx.js";
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
import { FOG_RGB, FOG_VEIL_ALPHA, FogField, SHROUD_ALPHA, SHROUD_RGB } from "./fog-field.js";
import { FogFlat, FogGl } from "./fog-gl.js";
import {
  NIGHT_RGB,
  LAMP_BULB_SCALE,
  LIGHT_HEADROOM,
  LIGHT_LAYER_SCALE,
  beamBlobs,
  beamPolygon,
  easeSpot,
  lampGlow,
  missileSpot,
  nightFog,
  nightShade,
  stackedLight,
  STREET_LAMPS,
  streetLampFlicker,
  workLightBearings,
  workLightCount,
  wreckNightAlpha,
} from "./night.js";

type NightPool = { x: number; y: number; rx: number; a: number; kind: "tower" | "head" | "work" | "missile" | LampType };
/** How much of the night tint each kind of pool lifts, per pool (they overlap), and how much it warms. */
const POOL_CUT: Record<NightPool["kind"], number> = {
  tower: 0.7,
  head: 0.8,
  work: 0.75,
  missile: 0.4,
  gaslamp: STREET_LAMPS.gaslamp.cut,
  streetlamp: STREET_LAMPS.streetlamp.cut,
  floodlight: STREET_LAMPS.floodlight.cut,
};
const POOL_WARM: Record<NightPool["kind"], number> = {
  tower: 0.2,
  head: 0.24,
  work: 0.2,
  missile: 0.14,
  gaslamp: STREET_LAMPS.gaslamp.warm,
  streetlamp: STREET_LAMPS.streetlamp.warm,
  floodlight: STREET_LAMPS.floodlight.warm,
};
const POOL_RGB: Record<NightPool["kind"], string> = {
  tower: "255, 236, 180",
  head: "255, 242, 205",
  work: "255, 212, 140",
  missile: "255, 214, 150",
  gaslamp: STREET_LAMPS.gaslamp.rgb,
  streetlamp: STREET_LAMPS.streetlamp.rgb,
  floodlight: STREET_LAMPS.floodlight.rgb,
};

/** Built structures that keep work lights burning round the yard. Not bunkers, guns, walls, or the towers, which have their own lamps. */
function workLit(e: EntityView): boolean {
  if (e.kind !== "building" || e.hp <= 0 || e.wreck || e.ruined) return false;
  if (!e.ownerId || e.ownerId === NEUTRAL_OWNER || e.unpowered) return false;
  if (isGarrisonable(e.type)) return false;
  return e.type === "core" || (BUILDING_TYPES as readonly string[]).includes(e.type);
}
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
import { heightsChanged } from "./height-mesh.js";

/** Special-action key. D pans with W and the arrow keys; A/S are orders. */
export const SPECIAL_HOTKEY = "e";
export const STOP_HOTKEY = "s";
export const ATTACK_MOVE_HOTKEY = "a";
export const PATROL_HOTKEY = "y";
/** Click this close to a placed spot, in view pixels, to close the loop on it. */
const PATROL_CONNECT_PX = 20;
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
  armory: 54,
  muster: 38,
  dynamo: 30,
  airfield: 14,
  dock: 12,
  ciws: 26,
  research: 40,
  radar: 44,
  bunker: 18,
  tower: 66,
  ram: 26,
  tobruk: 6,
  casemate: 24,
  hochstand: 72,
  leitturm: 86,
  mgnest: 10,
  pak36: 12,
  pak43: 14,
  flak: 18,
  stuka: 14,
  fw190: 12,
  bv222: 22,
  he111: 17,
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
  cyborgcommander: 26,
  sandbags: 12,
  wall: 18,
  greatwall: 34,
  gate: 18,
  teeth: 16,
  trench: 6,
  bridge: 4,
  bigbridge: 6,
  walker: 30,
  titan: 40,
  mammoth: 15,
  nebelwerfer: 22,
  artillery: 14,
  supply: 18,
  gunboat: 10,
  supplyboat: 9,
  submarine: 7,
  battleship: 20,
  destroyer: 14,
  lst: 16,
  aswheli: 8,
  torpedo: 2,
  cottage: 28,
  shack: 24,
  house: 36,
  barn: 38,
  inn: 36,
  chapel: 42,
  manor: 48,
  warehouse: 38,
  granary: 70,
  factory: 40,
  foundry: 46,
};

const CIV_FILL = "#b08968";
/** A map's neutral troops: no one's, against everyone. */
const NEUTRAL_UNIT_FILL = "#8c8c88";
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

/** How much of a submerged submarine its owner still sees through the water. */
const SUBMERGED_ALPHA = 0.5;
/** Hull fires on a sunk ship sit this share of the usual height: the hulk rides low in the water. */
const WRECK_FIRE_LIFT: Partial<Record<EntityType, number>> = { gunboat: 0.75, destroyer: 0.5, lst: 0.45, battleship: 0.3 };
/** Half a torpedo's drawn length, world px, and how far behind it its wake trails, in body halves. */
const TORPEDO_BODY_HALF = 7;
/** A Battle Ship shell's smoke trail is this many times a mortar bomb's. */
const SHIP_SHELL_SMOKE_THICK = 2.6;
const TORPEDO_WAKE_MUL = 6;

function isProducerView(e: EntityView): boolean {
  // The Airfield trains too, but its planes park on the strip; it has no rally point.
  return e.kind === "building" && (e.type === "muster" || e.type === "smelter" || e.type === "armory" || e.type === "dock");
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


/** The sections reachable from `all[start]` through ends that meet, straight on or round a corner. */
function connectedRun(all: readonly WallSection[], start: number): WallSection[] {
  const group: WallSection[] = [];
  const seen = new Set<number>();
  const origin = all[start];
  if (!origin) return group;
  seen.add(start);
  group.push(origin);
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
  /** Walker legs: ground walked so far and where the hull was last frame. */
  private walkerOdo = new Map<number, { x: number; y: number; d: number }>();
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
  /** Cyborg Commander beams: when each was first seen, and the share it had then, so the sweep runs smoothly between snapshots. */
  private beamSeen = new Map<number, { a0: number; at: number; u: number }>();
  /** Cyborg Commander force fields: last points seen, and when one last soaked a hit. */
  private fieldSeen = new Map<number, { hp: number; hitAt: number }>();
  private lastHp = new Map<number, number>();
  private lastScoutHp = new Map<number, number>();
  private explored: Uint8Array | null = null;
  private vis: Uint8Array | null = null;
  private visKey = 0;
  private visRuns: number[] | null = null;
  private exploredMapId = "";
  private clearedApplied = 0;
  /** Map clutter smashed so far, by index into `map.clutter`, and when each broke on screen. */
  private clutterBroken = new Set<number>();
  private clutterBreaks = new Map<number, number>();
  private clutterMapId = "";
  private maxElev = 0;
  private terrain: TerrainBake | null = null;
  private miniTerrain: MiniBake | null = null;
  private liveMap: MapDef | null = null;
  private treeStems: { tx: number; ty: number }[] | null = null;
  private fogField: FogField | null = null;
  /** Undefined until first tried; null when WebGL2 is unavailable. */
  private fogGl: FogGl | null | undefined = undefined;
  private fogFlat: FogFlat | null = null;
  /** Night tint, drawn here with the lamp beams cut out, then laid over the field. */
  private nightLayer: HTMLCanvasElement | null = null;
  /** Small layer the lamps' warm light is summed and capped on. */
  private lightLayer: HTMLCanvasElement | null = null;
  /** Lamp heading on screen per tower, eased toward the snapshot. */
  private spotShown = new Map<number, number>();
  private spotFrameAt = 0;
  /** Where each tower's searchlight lens landed this frame, for its glow at night. */
  private lensAt = new Map<number, SearchlightPose>();
  /** Every tile counts as known ground on a map without complete fog of war. */
  private knownGround: Uint8Array | null = null;
  /** Complete fog of war: explored ground softened like sight. Null on maps without it. */
  private shroudField: FogField | null = null;
  private shroudGl: FogGl | null | undefined = undefined;
  private shroudFlat: FogFlat | null = null;
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
  /** Mount id and tick of each rocket burst already given its fan of tracers. */
  private ciwsBurstSeen = new Set<string>();
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
    /** A hull or structure destroyed: its blast, sized by what went up. */
    death?: DeathBlastSpec;
    /** Submarine torpedo: a hull strike keeps its water column under the blast. */
    torpedo?: boolean;
  }[] = [];
  private fxIds = new Set<number>();
  /** When each crater was struck, for its smoulder. Holes already there on first sight never smoke. */
  private holeBorn = new Map<number, number>();
  /** Scratch a crater is drawn into so the pond can be punched out of it. */
  private holeCover: HTMLCanvasElement | null = null;
  private seenShots = new Set<number>();
  /** Shots, deaths, and base alerts read off the snapshots, for the sound. */
  private sounds = new SoundTracker();
  /** Bounced spark origin, snapped to the same hull pixel as the ricochet FX. */
  private bounceTrace = new Map<number, { x: number; y: number; sx: number; lift: number }>();
  /** Last smoke arc of a mortar bomb, kept briefly after it lands. World space. */
  private mortarSmoke = new Map<number, { pts: { x: number; y: number; z: number; u: number }[]; at: number; thick: number }>();
  /** Where each Titan rocket was first seen, so its smoke trail starts at the pod. World space. */
  private rocketFrom = new Map<number, { x: number; y: number; z: number }>();
  /** Garrison launch: the host the trail is pinned to, and the soldier id that picks the window. */
  private rocketHost = new Map<number, { hostId: number; salt: number }>();
  /** Head of each rocket as of the last frame; the next frame lays trail puffs from here. */
  private rocketLast = new Map<number, { x: number; y: number; z: number }>();
  /** Pod point of each launched rocket until it bursts: a rocket no snapshot caught still gets its trail. */
  private rocketLaunched = new Map<number, { x: number; y: number; z: number }>();
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
  private shipWakes: ShipWakePatch[] = [];
  private shipWakeLast = new Map<number, { x: number; y: number }>();
  /** Rig tread reach per snapped world face. The painted hull is longer than the collision radius. */
  private rigTread = new Map<number, { back: number; front: number }>();
  private maulerCarts = new Map<number, CartPose>();
  /** Field guns whose crew is on the trail, and when the gun last moved (ms). */
  private gunHaulAt = new Map<number, number>();
  private gunRecoil = new Map<number, GunRecoil>();
  private muzzleSmokes: MuzzleSmokePuff[] = [];
  private fieldGunSmokes: FieldGunSmokePuff[] = [];
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
  /** Ready building the player chose to put down, when a base and a defence are both finished. */
  placePick: BuildingType | null = null;
  /** Defences-tab sandbags or wall, armed before the line is sited. */
  yardArm: YardFieldType | null = null;
  attackMoveMode = false;
  /** Left click adds a point. Click an earlier point to close a loop. Right click sends, or cancels when none are down. */
  patrolMode = false;
  private patrolPoints: { x: number; y: number }[] = [];
  /** The draft was closed onto an earlier spot. The tail before that spot is already gone. */
  private patrolLoop = false;
  forceAttackMode = false;
  rotateMode = false;
  /** Rotate light: the rotate click swings only the selected Battle Ships' searchlights. */
  rotateLight = false;
  guardMode = false;
  /**
   * Structure ghost. A press sets the start, a drag or the next click sets each corner,
   * and the line goes to the sim as one order on Confirm.
   */
  fieldPlace: FieldStructureType | null = null;
  /** Base building the selected engineers will raise where the player clicks. The Smelter on scrap. */
  constructPlace: BuildingType | null = null;
  /** Bridge the selected engineers will lay, drawn brick by brick along a line like a wall (`fieldPath`). */
  bridgePlace: BridgeType | null = null;
  /**
   * Every brick's look by id, and the water tiles under an intact deck by tile index, so
   * units there stand on the deck. Laid out again when a brick goes up, falls, or is rebuilt.
   */
  private bridgeLayoutCache: { snap: unknown; key: string; looks: Map<number, BridgeLook>; tiles: Map<number, BridgeLook> } | null = null;
  /** Corners pinned so far, start first. Empty until the first release. */
  private fieldPath: { x: number; y: number }[] = [];
  /** Connected runs of same-type field structures in the current snapshot, by section key. */
  private fieldRunCache: { snap: unknown; byType: Map<string, Map<string, WallSection[]>> } | null = null;
  private fieldFacing = Math.PI / 2;
  /** Eased ghost facing so the piece swings instead of snapping. */
  private fieldShown = Math.PI / 2;
  /** BUILDING_TURN_STEPs (0 = east) a Bunker, Watch Tower, or Airfield ghost is turned to. Kept between placements. */
  private placeStep = 0;
  /** Wheel travel toward the next quarter, so a trackpad needs a full notch's worth to turn it. */
  private placeTurn = 0;
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
      this.constructPlace = null;
      this.bridgePlace = null;
      this.setGuardMode(false);
      this.setPatrolMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setPatrolMode(on: boolean): void {
    if (this.patrolMode === on) {
      if (!on) {
        this.patrolPoints = [];
        this.patrolLoop = false;
      }
      return;
    }
    this.patrolMode = on;
    this.patrolPoints = [];
    this.patrolLoop = false;
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.fieldPlace = null;
      this.constructPlace = null;
      this.bridgePlace = null;
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
      this.constructPlace = null;
      this.bridgePlace = null;
      this.setGuardMode(false);
      this.setPatrolMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setRotateMode(on: boolean, light = false): void {
    if (this.rotateMode === on && (!on || this.rotateLight === light)) return;
    this.rotateMode = on;
    this.rotateLight = on && light;
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.fieldPlace = null;
      this.constructPlace = null;
      this.bridgePlace = null;
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
      this.constructPlace = null;
      this.bridgePlace = null;
      this.setPatrolMode(false);
      this.guardFacing = this.meanSelectedFacing();
    } else {
      this.guardAnchor = null;
      this.guardDragging = false;
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  /** Arm or disarm the engineer's building ghost. Clicking the same button again puts it down. */
  setConstructPlace(building: BuildingType | null): void {
    const next = this.constructPlace === building ? null : building;
    this.constructPlace = next;
    this.fieldPlace = null;
    this.fieldDrag = null;
    this.fieldPath = [];
    if (next) {
      this.placeMode = false;
      this.placePick = null;
      this.yardArm = null;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.guardMode = false;
      this.setPatrolMode(false);
      this.guardDragging = false;
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  /** Arm or disarm the engineer's bridge tool. Clicking the same button again puts it down. */
  setBridgePlace(type: BridgeType | null): void {
    const next = this.bridgePlace === type ? null : type;
    this.setConstructPlace(null);
    this.fieldPlace = null;
    this.bridgePlace = next;
    this.fieldDrag = null;
    this.fieldPath = [];
    if (next) {
      this.fieldFacing = this.meanSelectedFacing();
      this.fieldShown = this.fieldFacing;
      this.fieldShownAt = performance.now();
      this.placeMode = false;
      this.placePick = null;
      this.yardArm = null;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.guardMode = false;
      this.setPatrolMode(false);
      this.guardDragging = false;
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setFieldPlace(structure: FieldStructureType | null): void {
    const next = this.fieldPlace === structure ? null : structure;
    this.fieldPlace = next;
    this.constructPlace = null;
    this.bridgePlace = null;
    this.fieldDrag = null;
    this.fieldPath = [];
    if (next) {
      this.placeMode = false;
      this.placePick = null;
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
    warmBattle();
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
      if (e.field) {
        const was = this.fieldSeen.get(e.id);
        const hit = was != null && e.field.hp < was.hp;
        if (hit) this.damagedUntil.set(e.id, now + 2000);
        this.fieldSeen.set(e.id, { hp: e.field.hp, hitAt: hit ? now : (was?.hitAt ?? -Infinity) });
      }
      if (e.laser) {
        const was = this.beamSeen.get(e.id);
        if (!was || was.a0 !== e.laser.a0 || e.laser.u < was.u) this.beamSeen.set(e.id, { a0: e.laser.a0, at: now, u: e.laser.u });
      } else this.beamSeen.delete(e.id);
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
    for (const id of this.walkerOdo.keys()) {
      if (!live.has(id)) this.walkerOdo.delete(id);
    }
    for (const id of this.fieldSeen.keys()) {
      if (!live.has(id)) this.fieldSeen.delete(id);
    }
    for (const id of this.lastScoutHp.keys()) {
      if (!live.has(id)) this.lastScoutHp.delete(id);
    }
    for (const [id, until] of this.damagedUntil) {
      if (!live.has(id) || until < now) this.damagedUntil.delete(id);
    }
    this.noteBarrages(match, now);
    this.noteGatlingFire(match, now);
    this.notePtrdFire(match, now);
    // A fast rocket (a RAM's, at a plane overhead) can leave and burst between two
    // snapshots. Its launch still comes through, so it gets its flash and backblast.
    if (this.rocketLaunched.size > 400) this.rocketLaunched.clear();
    for (const l of match.launches ?? []) {
      if (this.seenShots.has(l.id)) continue;
      this.seenShots.add(l.id);
      const shooter = match.entities.find((e) => e.id === l.fromId);
      this.noteRocketLaunch(shooter, l, now);
      this.rocketLaunched.set(l.id, this.rocketFrom.get(l.id) ?? { x: l.x, y: l.y, z: l.z });
    }
    for (const i of match.impacts ?? []) {
      if (i.fromId != null && (i.caliber ?? 0) > 0 && (i.caliber ?? 0) < 40 && i.kind !== "crush") {
        const shooter = match.entities.find((e) => e.id === i.fromId);
        if (shooter && isInfantryType(shooter.type) && !shooter.wreck) this.infantryShotAt.set(shooter.id, now);
      }
      if (i.kind === "crush") continue;
      // A 20mm round that missed a plane climbed away into the sky: its tracer is all there is.
      if (i.airZ != null && i.kind === "miss") continue;
      if (i.cookoff) {
        // A fuel fireball, not a shell burst: it has its own particles and smoke.
        if (!this.cookOffsSeen.has(i.id)) {
          if (this.cookOffsSeen.size > 200) this.cookOffsSeen.clear();
          this.cookOffsSeen.add(i.id);
          this.cookOffFx(i.x, i.y, i.id, now);
        }
        continue;
      }
      if (i.rocket && i.shot != null && !this.fxIds.has(i.id)) {
        // Close the trail to the burst: from the last drawn head, or from the pod
        // when the rocket flew and burst between snapshots.
        const from = this.rocketLast.get(i.shot) ?? this.rocketLaunched.get(i.shot);
        if (from) {
          const to = { x: i.x, y: i.y, z: i.z ?? this.elevAt(i.x, i.y) };
          this.rocketPuffs.push(...trailPuffs(from, to, now, (i.shot * 2654435761) >>> 0));
        }
        this.rocketLaunched.delete(i.shot);
        if (!match.projectiles.some((p) => p.id === i.shot)) {
          this.rocketFrom.delete(i.shot);
          this.rocketHost.delete(i.shot);
        }
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
      if (i.kind === "kill" && i.blast) fx.death = this.deathBlastAt(i.x, i.y, i.caliber, match.entities);
      else if (i.torpedo && torpedoStruckHull(i.kind)) fx.death = heBurstSpec();
      else if (i.heBurst && !i.splash) fx.death = heBurstSpec();
      this.addFx(fx);
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
        if (p.shipBarrel != null && shooter?.ship && !shooter.wreck) this.noteShipShot(shooter, p.shipBarrel, p, now);
        continue;
      }
      if (p.rocket) {
        this.noteRocketLaunch(shooter, p, now);
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
    if (this.patrolMode && this.ownPatrolIds().length === 0) this.setPatrolMode(false);
    if (this.forceAttackMode && this.ownForceIds().length === 0) this.setForceAttackMode(false);
    if (this.rotateMode && (this.rotateLight ? this.ownShipLampIds() : this.ownRotateIds()).length === 0) {
      this.setRotateMode(false);
    }
    if (this.guardMode && this.ownSelectedIds().length === 0) this.setGuardMode(false);
    if ((this.fieldPlace || this.constructPlace || this.bridgePlace) && !this.curr.entities.some((e) => this.selected.has(e.id) && e.type === "engineer" && e.ownerId === this.curr.youPlayerId)) {
      this.fieldPlace = null;
      this.constructPlace = null;
      this.bridgePlace = null;
      this.fieldPath = [];
      this.fieldDrag = null;
      this.onPlaceMode();
    }
    if (this.placePick && !this.typeReady(this.placePick)) this.placePick = null;
    if (!this.placeMode) this.yardArm = null;
    if (this.yardArm && this.curr.you.lineQueue) this.yardArm = null;
    const placing = this.placeMode;
    if (!this.placingKind() && !this.yardArm) this.placeMode = false;
    if (this.placeMode !== placing) this.onPlaceMode();
    this.syncAtlases();
    this.revealFrom(match);
    const mixAt = (x: number, y: number) => {
      const p = this.toScreen(x, y);
      const { w, h } = this.viewSize();
      return spatialMix(p.x, p.y, w, h);
    };
    playSoundEvents(this.sounds.step(match, now), mixAt);
    updateAmbient(this.sounds.moving, mixAt);
  }

  private syncAtlases(): void {
    const map = this.map();
    this.maxElev = maxHeightOf(map);
    if (!this.terrain) this.terrain = bakeTerrain(map, this.curr.scrap);
    else updateScrap(this.terrain, map, this.curr.scrap);
    if (!this.miniTerrain) this.miniTerrain = bakeMini(map, this.curr.scrap);
    else updateMiniScrap(this.miniTerrain, map, this.curr.scrap);
    this.applyClearedTrees();
    this.applyDug();
    this.applyClutter();
  }

  /** Note clutter the snapshot says broke since the last one, so it can fall apart on screen. */
  private applyClutter(): void {
    const mapId = this.curr.mapId;
    const boot = this.clutterMapId !== mapId;
    if (boot) {
      this.clutterMapId = mapId;
      this.clutterBroken.clear();
      this.clutterBreaks.clear();
    }
    const list = this.curr.brokenClutter;
    if (!list || list.length === this.clutterBroken.size) return;
    const now = performance.now();
    for (const i of list) {
      if (this.clutterBroken.has(i)) continue;
      this.clutterBroken.add(i);
      if (!boot) this.clutterBreaks.set(i, now);
    }
  }

  /** Lay ground that blasts sank (snapshot `dug`) onto the live map and repaint around it. */
  private applyDug(): void {
    const dug = this.curr.dug;
    if (!dug || dug.length === 0) return;
    const map = this.map();
    const w = map.width;
    const n = w * map.height;
    const changed: number[] = [];
    for (let k = 0; k + 1 < dug.length; k += 2) {
      const i = dug[k]!;
      const h = dug[k + 1]!;
      if (i < 0 || i >= n || map.heights[i] === h) continue;
      map.heights[i] = h;
      changed.push(i);
    }
    if (changed.length === 0) return;
    heightsChanged(map.heights);
    // A tile's corners average its neighbours, so the ring around a sunk tile tilts too.
    const dirty = new Set<number>();
    for (const i of changed) {
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < map.height) dirty.add(ny * w + nx);
        }
      }
    }
    const list = [...dirty];
    this.treeStems = null;
    if (this.terrain) restampTiles(this.terrain, map, list, this.curr.scrap);
    if (this.miniTerrain) restampMini(this.miniTerrain, map, list, this.curr.scrap);
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

  /**
   * Gatling rounds — the Walker's arms, the Cyborg's arm, the CIWS pad, and the
   * Apocalypse's roof mount: a tracer in every few, barrels to where the round
   * ended. A burst at a rocket leaves no rounds behind, so it gets a short fan
   * along the gun's bearing.
   */
  private noteGatlingFire(match: MatchSnapshot, now: number): void {
    const byGun = new Map<number, NonNullable<MatchSnapshot["impacts"]>>();
    for (const i of match.impacts ?? []) {
      if (i.fromId == null || i.intercept || this.fxIds.has(i.id) || this.barrageLandAt.has(i.id)) continue;
      const list = byGun.get(i.fromId);
      if (list) list.push(i);
      else byGun.set(i.fromId, [i]);
    }
    const ts = this.ts();
    const ground = (x: number, y: number) => this.elevAt(x, y);
    for (const e of match.entities) {
      if (e.wreck) continue;
      if (e.type === "walker" || e.type === "cyborg") {
        const rounds = byGun.get(e.id);
        if (!rounds?.length) continue;
        const muzzles = this.armMuzzlesWorld(e);
        // Both arms firing: the rounds take turns between the two barrels.
        muzzles.forEach((m, arm) => {
          const mine = rounds.filter((_, k) => k % muzzles.length === arm);
          for (const tr of ciwsTracers(m, mine, ground, now, ts)) {
            this.tracers.push(tr);
            this.barrageLandAt.set(tr.id, tracerLandsAt(tr));
          }
        });
        continue;
      }
      if (e.ship) {
        // Each 20mm round leaves whichever firing mount faces it best. The main guns lob; they carry no tracers.
        const rounds = byGun.get(e.id)?.filter((i) => i.caliber === 20) ?? [];
        const firing = e.ship.ciws.flatMap((m, i) => (m.fire ? [{ m, i }] : []));
        if (rounds.length === 0 || firing.length === 0) continue;
        const p = this.lerpEnt(e);
        const size = BATTLESHIP_SPRITE.drawSize;
        for (const { m, i } of firing) {
          const mine = rounds.filter((r) => {
            const a = Math.atan2(r.y - p.y, r.x - p.x);
            const best = firing.reduce((b, f) =>
              Math.abs(Math.atan2(Math.sin(a - f.m.facing), Math.cos(a - f.m.facing))) <
              Math.abs(Math.atan2(Math.sin(a - b.m.facing), Math.cos(a - b.m.facing)))
                ? f
                : b,
            );
            return best.i === i;
          });
          const at = shipCiwsMuzzle(p, i, m.facing, size);
          const muzzle = { x: at.x, y: at.y, z: this.elevAt(at.x, at.y) + at.lift / ISO_ELEVATION };
          for (const tr of ciwsTracers(muzzle, mine, ground, now, ts)) {
            this.tracers.push(tr);
            this.barrageLandAt.set(tr.id, tracerLandsAt(tr));
          }
        }
        continue;
      }
      const pad = e.type === "ciws";
      if (!pad && !e.ciws) continue;
      const facing = pad ? (e.turretFacing ?? e.facing) : e.ciws!.facing;
      const muzzle = this.ciwsMuzzleWorld(e, facing, pad);
      if (!muzzle) continue;
      // The Apocalypse's main guns land here too; only the roof mount's 20mm carries tracers.
      const rounds = byGun.get(e.id)?.filter((i) => pad || i.caliber === 20);
      if (rounds?.length) {
        for (const tr of ciwsTracers(muzzle, rounds, ground, now, ts)) {
          this.tracers.push(tr);
          this.barrageLandAt.set(tr.id, tracerLandsAt(tr));
        }
        continue;
      }
      const firing = pad ? !!e.gatling : !!e.ciws?.fire;
      const key = `${e.id}:${match.tick}`;
      if (!firing || this.ciwsBurstSeen.has(key)) continue;
      if (this.ciwsBurstSeen.size > 200) this.ciwsBurstSeen.clear();
      this.ciwsBurstSeen.add(key);
      const reach = catalog(pad ? "ciws" : "apocalypse").rangeTiles * ts * (pad ? 0.6 : 0.5);
      this.tracers.push(...ciwsBurstTracers(muzzle, facing, reach, CIWS_INTERCEPT_LIFT / ISO_ELEVATION, now, e.id * 31 + match.tick, ts));
    }
  }

  /**
   * The AT soldier's PTRD round carries a tracer: a streak from his muzzle (or
   * the window he fires from) to where each 14.5 mm round ended.
   */
  private notePtrdFire(match: MatchSnapshot, now: number): void {
    const byShooter = new Map<number, NonNullable<MatchSnapshot["impacts"]>>();
    for (const i of match.impacts ?? []) {
      if (i.fromId == null || i.caliber !== PTRD_CALIBER || i.kind === "crush") continue;
      if (this.fxIds.has(i.id) || this.barrageLandAt.has(i.id)) continue;
      const list = byShooter.get(i.fromId);
      if (list) list.push(i);
      else byShooter.set(i.fromId, [i]);
    }
    if (byShooter.size === 0) return;
    const ts = this.ts();
    const ground = (x: number, y: number) => this.elevAt(x, y);
    for (const [fromId, rounds] of byShooter) {
      const e = match.entities.find((u) => u.id === fromId);
      if (e?.type !== "atinfantry" || e.wreck) continue;
      const house = e.garrisonedIn != null ? match.entities.find((b) => b.id === e.garrisonedIn) : undefined;
      let muzzle: { x: number; y: number; z: number };
      if (house) {
        muzzle = { x: house.x, y: house.y, z: this.elevAt(house.x, house.y) + garrisonWindowLift(house.type, rounds[0]!.id) / ISO_ELEVATION };
      } else {
        const p = this.lerpEnt(e);
        const size = this.spriteOf(e)?.drawSize ?? 48;
        const r = catalog(e.type).radius;
        const a = Math.atan2(rounds[0]!.y - p.y, rounds[0]!.x - p.x);
        const lift = e.swimming ? 0.05 : PTRD_MUZZLE_LIFT[e.stance ?? "stand"];
        muzzle = {
          x: p.x + Math.cos(a) * r,
          y: p.y + Math.sin(a) * r,
          z: this.elevAt(p.x, p.y) + (lift * size) / ISO_ELEVATION,
        };
      }
      for (const tr of ptrdTracers(muzzle, rounds, ground, now, ts)) {
        this.tracers.push(tr);
        this.barrageLandAt.set(tr.id, tracerLandsAt(tr));
      }
    }
  }

  /** World point and elevation of the barrels: the pad gun, or the Apocalypse's roof mount. */
  private ciwsMuzzleWorld(e: EntityView, facing: number, pad: boolean): { x: number; y: number; z: number } | null {
    if (pad) {
      const spr = buildingSpriteFor(e.type, e.facing);
      if (!spr || !spriteReady(spr)) return null;
      const ts = this.ts();
      const elev = this.buildingElev(e);
      const x = e.tileX * ts;
      const y = e.tileY * ts;
      const footprintW = this.toScreen(x + e.tileW * ts, y, elev).x - this.toScreen(x, y + e.tileH * ts, elev).x;
      return {
        x: e.x + Math.cos(facing) * CIWS_MUZZLE_REACH,
        y: e.y + Math.sin(facing) * CIWS_MUZZLE_REACH,
        z: elev + ciwsMuzzleLift(footprintW / spr.padWidth) / ISO_ELEVATION,
      };
    }
    const p = this.lerpEnt(e);
    const size = this.spriteOf(e)?.drawSize ?? 64;
    return { x: p.x, y: p.y, z: this.elevAt(p.x, p.y) + (ROOF_CIWS_LIFT * size) / ISO_ELEVATION };
  }

  /** World points and elevation of the gatling barrels on a Walker's arms (one or both) or a Cyborg's arm. */
  private armMuzzlesWorld(e: EntityView): { x: number; y: number; z: number }[] {
    const p = this.lerpEnt(e);
    const size = this.spriteOf(e)?.drawSize ?? 48;
    const facing = p.turretFacing ?? p.facing;
    const r = catalog(e.type).radius;
    const fx = Math.cos(facing);
    const fy = Math.sin(facing);
    const walker = e.type === "walker";
    // Out ahead of the body, and on the Walker one arm to each side; at arm height on the sprite.
    const ahead = r * (walker ? 0.9 : 0.6);
    const z = this.elevAt(p.x, p.y) + ((walker ? WALKER_ARM_LIFT : CYBORG_ARM_LIFT) * size) / ISO_ELEVATION;
    const arm = (side: number) => ({ x: p.x + fx * ahead - fy * side, y: p.y + fy * ahead + fx * side, z });
    if (!walker) return [arm(r * 0.4)];
    return (e.gatling?.arms ?? 1) === 2 ? [arm(r * 0.6), arm(-r * 0.6)] : [arm(r * 0.6)];
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

  /** Field gun: flash and a big smoke puff at the muzzle, a thick blast cloud behind the shield, and the carriage jumps back. */
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
    this.gunRecoil.set(shooter.id, { at: now });
    this.fieldGunSmokes.push(
      ...spawnFieldGunSmoke({
        x: shooter.x,
        y: shooter.y,
        facing: shooter.facing,
        radius: catalog(shooter.type).radius,
        now,
        seed: (shot.id * 2246822519 + Math.floor(now)) >>> 0,
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

  /**
   * One Battle Ship barrel: the field gun's flash and muzzle puff at that barrel's
   * tip, and its thick blast cloud rolling back from behind that barrel.
   */
  private noteShipShot(shooter: EntityView, barrel: number, shot: { id: number; caliber: number }, now: number): void {
    const i = Math.floor(barrel / 3);
    const k = barrel % 3;
    const turret = shooter.ship?.turrets[i];
    if (!turret) return;
    const size = BATTLESHIP_SPRITE.drawSize;
    const m = shipBarrelMuzzle(shooter, i, k, turret.facing, size);
    const dirX = Math.cos(turret.facing);
    const dirY = Math.sin(turret.facing);
    this.muzzleSmokes.push(
      ...spawnMuzzleSmoke({
        x: m.x,
        y: m.y,
        dirX,
        dirY,
        now,
        seed: (shot.id * 2654435761 + Math.floor(now)) >>> 0,
        scale: 1.3,
      }),
    );
    // Behind the cannon: back along the barrel from its tip to the turret face, a heavy cloud
    // that rolls back over the deck, then a second one off the muzzle as the blast spreads.
    const back = 2.4 * BATTLESHIP_WORLD_PER_UNIT;
    this.fieldGunSmokes.push(
      ...spawnFieldGunSmoke({
        x: m.x - dirX * back,
        y: m.y - dirY * back,
        facing: turret.facing,
        radius: 11,
        now,
        seed: (shot.id * 2246822519 + Math.floor(now)) >>> 0,
      }),
      ...spawnFieldGunSmoke({
        x: m.x,
        y: m.y,
        facing: turret.facing,
        radius: 8,
        now: now + 60,
        seed: (shot.id * 3266489917 + Math.floor(now)) >>> 0,
      }),
    );
    this.addFx({
      id: shot.id + 8_000_000,
      kind: "muzzle",
      x: m.x,
      y: m.y,
      vx: dirX,
      vy: dirY,
      at: now,
      caliber: shot.caliber,
      lift: Math.round(m.lift),
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

  /** What went up at a kill blast: the structure's footprint or the hull's radius sizes the fireball. */
  private deathBlastAt(
    wx: number,
    wy: number,
    caliber: number | undefined,
    entities: readonly EntityView[],
  ): DeathBlastSpec {
    const ts = this.ts();
    let best: EntityView | undefined;
    let bestD = 24;
    for (const e of [...entities, ...this.curr.entities]) {
      if (e.garrisonedIn) continue;
      let d: number;
      if (e.kind === "building") {
        const x0 = e.tileX * ts;
        const y0 = e.tileY * ts;
        d = Math.hypot(Math.max(x0 - wx, 0, wx - (x0 + e.tileW * ts)), Math.max(y0 - wy, 0, wy - (y0 + e.tileH * ts)));
      } else {
        d = Math.max(0, Math.hypot(e.x - wx, e.y - wy) - catalog(e.type).radius);
      }
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (best?.kind === "building") return deathBlastSpec({ tiles: best.tileW * best.tileH });
    if (best) return deathBlastSpec({ radius: catalog(best.type).radius });
    return deathBlastSpec({ caliber });
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

  private resetFog(map: { id: string; width: number; height: number; shroud?: boolean }): void {
    this.fogField = new FogField(map.width, map.height);
    this.shroudField = map.shroud ? new FogField(map.width, map.height) : null;
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
    let grew = false;
    for (let i = 0; i < n; i++) {
      if (vis[i] && !this.explored[i]) {
        this.explored[i] = 1;
        grew = true;
      }
    }
    if (this.shroudField && grew) this.shroudField.set(this.explored, performance.now(), first);
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
    const shroud = this.shroudField ? this.explored : null;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const black = shroud != null && !shroud[i];
      pix[o] = black ? 0 : FOG_RGB[0];
      pix[o + 1] = black ? 0 : FOG_RGB[1];
      pix[o + 2] = black ? 0 : FOG_RGB[2];
      pix[o + 3] = black ? 255 : Math.round(150 * (1 - (sight?.[i] ?? 0)));
    }
    ctx.putImageData(data, 0, 0);
  }

  private lit(tx: number, ty: number): boolean {
    const map = this.map();
    if (!this.vis) return true;
    return tileOnMask(this.vis, map.width, tx, ty);
  }

  /** False only under complete fog of war, on ground you have never seen. */
  private known(tx: number, ty: number): boolean {
    if (!this.shroudField) return true;
    const w = this.map().width;
    return this.explored?.[ty * w + tx] === 1;
  }

  /** Any tile of a footprint known. Yours always is. */
  private knownRect(e: Pick<EntityView, "ownerId" | "tileX" | "tileY" | "tileW" | "tileH">): boolean {
    if (!this.shroudField || e.ownerId === this.curr.youPlayerId) return true;
    for (let y = e.tileY; y < e.tileY + Math.max(1, e.tileH); y++) {
      for (let x = e.tileX; x < e.tileX + Math.max(1, e.tileW); x++) {
        if (this.known(x, y)) return true;
      }
    }
    return false;
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

  private typeReady(type: BuildingType | YardFieldType): boolean {
    if (!isDefenceStructure(type) && this.curr.you.placingType === type) return true;
    const q = isYardField(type)
      ? this.curr.you.lineQueue
      : isDefenceStructure(type)
        ? this.curr.you.defenceQueue
        : this.curr.you.structureQueue;
    return q?.ready === true && q.type === type;
  }

  /** Only the building the player picked off its cameo. A job finishing never takes over the cursor. */
  private placingKind(): BuildingType | YardFieldType | null {
    return this.placePick && this.typeReady(this.placePick) ? this.placePick : null;
  }

  /** Place this finished building. A ready defence does not have to wait for a ready base. */
  armPlace(type: BuildingType): void {
    this.placePick = type;
    this.yardArm = null;
    this.fieldPlace = null;
    this.constructPlace = null;
    this.bridgePlace = null;
    this.fieldDrag = null;
    this.placeMode = true;
    this.attackMoveMode = false;
    this.forceAttackMode = false;
    this.rotateMode = false;
    this.guardMode = false;
    this.guardDragging = false;
    this.onAttackMoveMode();
    this.onPlaceMode();
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
    this.constructPlace = null;
    this.bridgePlace = null;
    this.fieldDrag = null;
    this.fieldPath = [];
    this.placePick = null;
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
      this.liveMap = { ...m, tiles: m.tiles.slice(), heights: m.heights.slice() };
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
      if (this.curr.paused) return;
      this.shiftHeld = e.shiftKey;
      if (e.button === 2) {
        e.preventDefault();
        if (this.patrolMode) {
          if (this.patrolPoints.length > 0) this.commitPatrol();
          else this.setPatrolMode(false);
          return;
        }
        if (this.fieldPath.length > 0 && (this.fieldPlace || this.readyYardField() || this.bridgePlace)) {
          this.fieldPath = undoFieldPoint(this.fieldPath);
          this.fieldDrag = null;
          this.onPlaceMode();
          return;
        }
        if (this.attackMoveMode || this.forceAttackMode || this.rotateMode || this.guardMode || this.fieldPlace || this.constructPlace || this.bridgePlace) {
          this.setAttackMoveMode(false);
          this.setForceAttackMode(false);
          this.setRotateMode(false);
          this.setGuardMode(false);
          this.fieldPlace = null;
          this.constructPlace = null;
          this.bridgePlace = null;
          this.fieldDrag = null;
          this.fieldPath = [];
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
        if (this.constructPlace) {
          this.commitConstruct(mx, my);
          return;
        }
        if (this.bridgePlace) {
          const w = this.screenToWorld(mx, my);
          this.fieldDrag = { x: w.x, y: w.y };
          return;
        }
        if (!this.fieldPlace && this.readyYardField() === "gate") {
          this.commitGate(mx, my);
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
          const site = this.placeSite(toPlace, mx, my);
          this.command({
            type: "cmd.place",
            building: toPlace,
            tx: site.tx,
            ty: site.ty,
            ...(isRotatableBuilding(toPlace) ? { facing: site.facing } : {}),
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
      // A dark panel is not a map: nothing to click until a Radar Station stands.
      if (!this.curr.you.radar) return;
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
    if (e.button === 0 && this.fieldDrag && (this.fieldPlace || this.readyYardField() || this.bridgePlace)) {
      const type = this.fieldPlace ?? this.readyYardField();
      const piece = this.bridgePlace ? bridgeBrickLength(this.bridgePlace) : (type && fieldSpan(type)?.length) || 24;
      const w = this.screenToWorld(this.mouseX, this.mouseY);
      this.fieldPath = pinFieldPoint(this.fieldPath, this.fieldDrag, w, piece * 0.5);
      this.fieldDrag = null;
      this.onPlaceMode();
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
    // A gate takes the walls' facing, so the wheel still zooms while one is armed.
    if (this.fieldPlace || this.bridgePlace || (this.readyYardField() && this.readyYardField() !== "gate")) {
      this.rotateField(e.deltaY, e.deltaMode);
      return;
    }
    const building = this.placeMode ? this.readyBuilding() : null;
    if (building && isRotatableBuilding(building)) {
      this.rotatePlace(e.deltaY, e.deltaMode);
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
    if (
      k === "escape" &&
      (this.attackMoveMode || this.forceAttackMode || this.rotateMode || this.guardMode || this.patrolMode)
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.setAttackMoveMode(false);
      this.setForceAttackMode(false);
      this.setRotateMode(false);
      this.setGuardMode(false);
      this.setPatrolMode(false);
      return;
    }
    if (this.curr.paused) return;
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
      const ids = this.ownPatrolIds();
      if (ids.length) this.setPatrolMode(!this.patrolMode);
      return;
    }
    if (k === ROTATE_HOTKEY) {
      e.preventDefault();
      if (this.fieldPlace || this.readyYardField()) return;
      const ids = this.ownRotateIds();
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
    const seen = new Set(ids);
    for (const id of this.ownLampIds()) {
      if (!seen.has(id)) ids.push(id);
    }
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
    const house = this.curr.entities.find((e) => this.selected.has(e.id) && isGarrisonable(e.type) && e.hp > 0);
    const inf = house ? own.filter((e) => e.kind === "unit" && e.id !== house.id && garrisonCandidate(house.type, e.type)) : [];
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

  /** Own units plus own gun structures (CIWS, RAM, crewed guns): everything that takes Stop, Rotate, and Force attack. */
  private ownAimIds(): number[] {
    return [...this.selected].filter((id) => {
      const ent = this.curr.entities.find((x) => x.id === id);
      if (!ent || ent.ownerId !== this.curr.youPlayerId || ent.wreck) return false;
      return ent.kind === "unit" || aimsOwnGun(ent.type);
    });
  }

  /** Own watch towers. Patrol turns the spotlight along the points; Stop freezes it. */
  private ownLampIds(): number[] {
    const out: number[] = [];
    for (const id of this.selected) {
      const ent = this.curr.entities.find((x) => x.id === id);
      if (ent && ent.ownerId === this.curr.youPlayerId && ent.hp > 0 && ent.kind === "building" && ent.spotFacing != null && hasSpotlight(ent.type)) {
        out.push(id);
      }
    }
    return out;
  }

  /** Own Battle Ships in the selection whose searchlight burns: what Rotate light swings. */
  private ownShipLampIds(): number[] {
    const out: number[] = [];
    for (const id of this.selected) {
      const ent = this.curr.entities.find((x) => x.id === id);
      if (ent && ent.ownerId === this.curr.youPlayerId && ent.hp > 0 && ent.kind === "unit" && ent.spotFacing != null && hasSpotlight(ent.type)) {
        out.push(id);
      }
    }
    return out;
  }

  /** Units that walk a patrol, plus watch towers that sweep a spotlight along the same points. */
  private ownPatrolIds(): number[] {
    const ids = this.ownSelectedIds();
    const seen = new Set(ids);
    for (const id of this.ownLampIds()) {
      if (!seen.has(id)) ids.push(id);
    }
    return ids;
  }

  /** What Rotate turns: the aimers, plus own watch towers, whose spotlight swings. */
  private ownRotateIds(): number[] {
    const out = this.ownAimIds();
    for (const id of this.selected) {
      const ent = this.curr.entities.find((x) => x.id === id);
      if (ent && ent.ownerId === this.curr.youPlayerId && ent.kind === "building" && ent.spotFacing != null && hasSpotlight(ent.type)) {
        out.push(id);
      }
    }
    return out;
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
    // A wall line under the click is ground to cross, not a target: the guns that can chip it take it themselves.
    if (hit && !hit.wreck && hit.ownerId !== this.curr.youPlayerId && !isFieldStructure(hit.type)) {
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
    // A building drawn from memory in the fog is still a target in reach.
    const hit = this.hit(px, py) ?? this.hitGhost(px, py);
    if (hit && hit.hp > 0 && ids.some((id) => id !== hit.id)) {
      this.command({ type: "cmd.forceattack", ids, x: hit.x, y: hit.y, targetId: hit.id });
      return;
    }
    const w = this.screenToWorld(px, py);
    this.command({ type: "cmd.forceattack", ids, x: w.x, y: w.y });
  }

  private commitRotate(px: number, py: number): void {
    const light = this.rotateLight;
    const ids = light ? this.ownShipLampIds() : this.ownRotateIds();
    if (!this.keepModeForQueue()) this.setRotateMode(false);
    if (ids.length === 0) return;
    const hit = this.hit(px, py);
    const w = hit ? { x: hit.x, y: hit.y } : this.screenToWorld(px, py);
    this.command(light ? { type: "cmd.rotate", ids, x: w.x, y: w.y, light: true } : { type: "cmd.rotate", ids, x: w.x, y: w.y });
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

  /** A line is drawn and waits for Confirm. */
  fieldPending(): boolean {
    return this.fieldPath.length > 0 && !!(this.fieldPlace || this.readyYardField() || this.bridgePlace);
  }

  /** Lay the drawn line: one order for the selected engineers, or one yard job. Clears the drawing. */
  confirmField(): void {
    if (this.bridgePlace) {
      this.confirmBridge();
      return;
    }
    const yard = this.readyYardField();
    const structure = this.fieldPlace ?? yard;
    const path = this.fieldPath;
    if (!structure || path.length === 0) return;
    const ids = this.fieldPlace
      ? this.curr.entities
          .filter((e) => this.selected.has(e.id) && e.ownerId === this.curr.youPlayerId && e.type === "engineer" && !e.wreck)
          .map((e) => e.id)
      : [];
    if (this.fieldPlace && ids.length === 0) return;
    const first = path[0]!;
    const facing = this.fieldFacing;
    if (path.length === 1) {
      this.command({ type: "cmd.field", ids, structure, x: first.x, y: first.y, facing });
    } else {
      this.command({ type: "cmd.field", ids, structure, x: first.x, y: first.y, facing, path: path.map((p) => ({ x: p.x, y: p.y })) });
    }
    // The line is placed: the tool is put down, like a building after it lands.
    this.fieldPath = [];
    this.fieldDrag = null;
    this.fieldPlace = null;
    this.constructPlace = null;
    this.bridgePlace = null;
    this.yardArm = null;
    this.placeMode = false;
    this.onPlaceMode();
  }

  /** Queue the armed gate over the pair of own wall sections nearest the pointer. Off a pair, nothing happens. */
  private commitGate(mx: number, my: number): void {
    const w = this.screenToWorld(mx, my);
    const site = gateSiteAt(this.curr.entities, this.curr.youPlayerId, w.x, w.y);
    if (!site) return;
    this.command({ type: "cmd.field", ids: [], structure: "gate", x: site.x, y: site.y, facing: site.facing });
    // The site is given: the tool is put down, like a line after Confirm.
    this.cancelFieldPlacing();
  }

  /** The selected engineers raise the armed building with its top-left tile under the cursor. */
  private commitConstruct(mx: number, my: number): void {
    const building = this.constructPlace;
    if (!building) return;
    const tile = this.screenToTile(mx, my);
    const ids = this.curr.entities
      .filter((e) => this.selected.has(e.id) && e.ownerId === this.curr.youPlayerId && e.type === "engineer" && !e.wreck && e.hp > 0)
      .map((e) => e.id);
    if (ids.length === 0) return;
    this.command({ type: "cmd.construct", ids, building, tx: tile.x, ty: tile.y });
    // The site is given: the tool is put down, like a building after it lands.
    this.constructPlace = null;
    this.bridgePlace = null;
    this.onPlaceMode();
  }

  /** The nearest selected engineer lays the drawn bridge line, brick by brick. Clears the drawing. */
  private confirmBridge(): void {
    const bridge = this.bridgePlace;
    const path = this.fieldPath;
    if (!bridge || path.length === 0) return;
    const ids = this.curr.entities
      .filter((e) => this.selected.has(e.id) && e.ownerId === this.curr.youPlayerId && e.type === "engineer" && !e.wreck && e.hp > 0)
      .map((e) => e.id);
    if (ids.length === 0) return;
    const first = path[0]!;
    const facing = this.fieldFacing;
    if (path.length === 1) this.command({ type: "cmd.bridge", ids, bridge, x: first.x, y: first.y, facing });
    else this.command({ type: "cmd.bridge", ids, bridge, x: first.x, y: first.y, facing, path: path.map((p) => ({ x: p.x, y: p.y })) });
    this.fieldPath = [];
    this.fieldDrag = null;
    this.bridgePlace = null;
    this.onPlaceMode();
  }

  /** Drop the line being drawn and the placing mode with it. True when there was one. */
  cancelFieldPlacing(): boolean {
    if (!this.fieldPlace && !this.readyYardField() && !this.constructPlace && !this.bridgePlace) return false;
    this.fieldPath = [];
    this.fieldDrag = null;
    this.fieldPlace = null;
    this.constructPlace = null;
    this.bridgePlace = null;
    this.yardArm = null;
    this.placeMode = false;
    this.onPlaceMode();
    return true;
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
    const tx = worldToTile(wx, map.tileSize);
    const ty = worldToTile(wy, map.tileSize);
    const deck = this.bridgeLayout().tiles.get(ty * map.width + tx);
    if (deck) return brickDeckElev(deck.layout, bridgeAlong(deck.span, wx, wy));
    return heightAt(map, tx, ty);
  }

  /** Terrain height alone, deck or no deck. */
  private groundAt(wx: number, wy: number): number {
    const map = this.map();
    return heightAt(map, worldToTile(wx, map.tileSize), worldToTile(wy, map.tileSize));
  }

  /** Water under a world point, by the map. */
  private wetAt(wx: number, wy: number): boolean {
    const map = this.map();
    return map.tiles[worldToTile(wy, map.tileSize) * map.width + worldToTile(wx, map.tileSize)] === TILE_WATER;
  }

  /** A brick as the layout reads it. */
  private brickIn(e: { type: string; x: number; y: number; facing: number; span?: number; ruined?: boolean }): BrickIn | null {
    if (!isBridge(e.type)) return null;
    const span: BridgeSpan = { x: e.x, y: e.y, facing: e.facing, length: e.span ?? bridgeBrickLength(e.type) };
    return { type: e.type, span, width: bridgeWidth(e.type), ruined: !!e.ruined };
  }

  /** Looks for a set of bricks laid out together, so each meets its neighbours. */
  private layoutLooks(bricks: readonly BrickIn[]): BridgeLook[] {
    const layout = layoutBridges(bricks, (x, y) => this.groundAt(x, y), (x, y) => this.wetAt(x, y));
    return bricks.map((b, i) => ({ type: b.type, span: b.span, width: b.width, layout: layout[i]!, ruined: b.ruined }));
  }

  /** Every brick in the snapshot laid out, and the water under each intact deck. */
  private bridgeLayout(): { looks: Map<number, BridgeLook>; tiles: Map<number, BridgeLook> } {
    const snap = this.curr;
    const cached = this.bridgeLayoutCache;
    if (cached?.snap === snap) return cached;
    // Bricks remembered in the fog take part too, as they were last seen.
    const live = (snap?.entities ?? []).filter((e) => isBridge(e.type) && e.hp > 0);
    const liveIds = new Set(live.map((e) => e.id));
    const ents = [...live, ...[...this.ghosts.values()].filter((g) => isBridge(g.type) && g.hp > 0 && !liveIds.has(g.id))];
    const key = ents.map((e) => `${e.id}${e.ruined ? "r" : ""}`).join(",");
    if (cached && cached.key === key) {
      cached.snap = snap;
      return cached;
    }
    const bricks: BrickIn[] = [];
    const ids: number[] = [];
    for (const e of ents) {
      const b = this.brickIn(e);
      if (!b) continue;
      bricks.push(b);
      ids.push(e.id);
    }
    const looks = new Map<number, BridgeLook>();
    const tiles = new Map<number, BridgeLook>();
    const map = this.map();
    this.layoutLooks(bricks).forEach((look, i) => {
      looks.set(ids[i]!, look);
      if (look.ruined) return;
      for (const t of bridgeTiles(map, look.span, look.width)) {
        const ti = t.y * map.width + t.x;
        if (map.tiles[ti] === TILE_WATER) tiles.set(ti, look);
      }
    });
    this.bridgeLayoutCache = { snap, key, looks, tiles };
    return this.bridgeLayoutCache;
  }

  /** A standing brick's look, laid out with its neighbours. */
  private bridgeLook(e: EntityView): BridgeLook | null {
    return this.bridgeLayout().looks.get(e.id) ?? null;
  }

  /** Mean deck height of a brick. */
  private brickMidElev(look: BridgeLook): number {
    return brickDeckElev(look.layout, 0.5);
  }

  /**
   * Looks for bricks not built yet (a ghost line or an engineer's site), laid out with
   * the bricks already standing so the new ones meet them.
   */
  private ghostLooks(type: BridgeType, spans: readonly BridgeSpan[]): BridgeLook[] {
    const width = bridgeWidth(type);
    const standing: BrickIn[] = [];
    for (const e of this.curr.entities) {
      if (!isBridge(e.type) || e.hp <= 0) continue;
      const b = this.brickIn(e);
      if (!b) continue;
      // Only bricks near the new line take part.
      if (spans.some((s) => Math.hypot(s.x - b.span.x, s.y - b.span.y) < s.length + b.span.length + 8)) standing.push(b);
    }
    const mine: BrickIn[] = spans.map((span) => ({ type, span, width }));
    return this.layoutLooks([...mine, ...standing]).slice(0, mine.length);
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
    if (isBridge(e.type)) return { layer: BRIDGE_DRAW_LAYER, z: isoDepth(e.x, e.y) };
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
      if (isTurnedBuilding(e)) {
        // The same, along the turned walls: the back band runs on the field's own back edge.
        const r = buildingRect(e, ts);
        const band = buildingGroundFor(e.type) ? r.halfV * AIRFIELD_BACK_DEPTH : r.halfV;
        const c = rectWorld(r, 0, band - r.halfV);
        const foot = { cx: c.x, cy: c.y, ax: r.ux, ay: r.uy, halfAlong: r.halfU, halfAcross: band };
        return { layer: STANDING_DRAW_LAYER, z: isoDepth(foot.cx, foot.cy), foot };
      }
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
      if (isBridge(e.type)) {
        // The deck at its own height. A fallen brick is picked where its wreck lies in the water.
        const look = this.bridgeLook(e);
        if (!look) continue;
        const h = e.ruined ? this.groundAt(e.x, e.y) : this.brickMidElev(look);
        const w = isoToWorld(ix, iy + isoLift(h), ts);
        if (inBridge(look.span, look.width, w.x, w.y, 4)) return e;
        continue;
      }
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
          // A plane or drone is picked where its art flies, never at its shadow on the ground.
          const s = this.toScreen(p.x, p.y);
          s.y -= this.airLift(e);
          const paint = this.unitPaint(e, spr, p, s);
          if (paint) {
            if (inScreenRect(unitPickRect(paint), px, py)) return e;
            continue;
          }
          const size = spr.drawSize;
          const top = s.y - size * spr.contactY + unitGroundSink(size);
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
      } else if (isTurnedBuilding(e)) {
        if (pointInIsoPrism(ix, iy, this.turnedCorners(e), this.extrude(e.type), ts, isoLift(this.buildingElev(e)))) return e;
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

  /** A building remembered in the fog under the cursor. Not in the snapshot, so `hit` never sees it. */
  private hitGhost(px: number, py: number): EntityView | null {
    const ts = this.ts();
    const ix = px + this.camX;
    const iy = py + this.camY;
    const liveIds = new Set(this.curr.entities.map((e) => e.id));
    const ghosts = [...this.ghosts.values()].filter(
      (g) => !liveIds.has(g.id) && !g.wreck && !isFieldStructure(g.type) && this.knownRect(g),
    );
    const keys = new Map(ghosts.map((e) => [e, this.drawKey(e)]));
    ghosts.sort((a, b) => compareDrawOrder(keys.get(b)!, keys.get(a)!));
    for (const e of ghosts) {
      const inside = isTurnedBuilding(e)
        ? pointInIsoPrism(ix, iy, this.turnedCorners(e), this.extrude(e.type), ts, isoLift(this.buildingElev(e)))
        : pointInIsoBox(
            ix,
            iy,
            e.tileX * ts,
            e.tileY * ts,
            e.tileW * ts,
            e.tileH * ts,
            this.extrude(e.type),
            ts,
            isoLift(this.buildingElev(e)),
          );
      if (inside) return e;
    }
    return null;
  }

  /** Nearest mine under the cursor, in screen pixels. Mines are small, so the target is a little wider than the sprite. */
  private mineAt(px: number, py: number): MineView | null {
    let best: MineView | null = null;
    let bestD = 18;
    for (const m of this.curr.mines ?? []) {
      const s = this.toScreen(m.x, m.y);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d > bestD) continue;
      best = m;
      bestD = d;
    }
    return best;
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
      // A running torpedo is nobody's to command.
      if (isTorpedoBody(e.type)) continue;
      const p = this.lerpEnt(e);
      const s = this.toScreen(p.x, p.y);
      // Aloft, the box has to take the plane itself, not the shadow under it.
      s.y -= this.airLift(e);
      if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) this.selected.add(e.id);
    }
    this.onSelect([...this.selected]);
  }

  private onRight(px: number, py: number): void {
    if (this.placeMode || this.fieldPlace || this.yardArm || this.constructPlace || this.bridgePlace) {
      if (this.fieldPath.length > 0 && (this.fieldPlace || this.readyYardField() || this.bridgePlace)) {
        this.fieldPath = undoFieldPoint(this.fieldPath);
        this.fieldDrag = null;
        this.onPlaceMode();
        return;
      }
      this.placeMode = false;
      this.yardArm = null;
      this.fieldPlace = null;
      this.constructPlace = null;
      this.bridgePlace = null;
      this.fieldDrag = null;
      this.fieldPath = [];
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
    const mine = this.mineAt(px, py);
    const action = resolveHoverAction({
      youPlayerId: you,
      selected,
      hit,
      mine: mine != null,
      allied: (id) => ownerAllied(this.curr, id),
    });
    if (action === "disable" && mine) {
      const trucks = own.filter((e) => e.type === "supply" && !e.bed?.open);
      if (trucks.length) this.command({ type: "cmd.disable", ids: trucks.map((e) => e.id), mineId: mine.id });
      return;
    }
    if ((action === "repair" || action === "scrap") && hit) {
      const engineers = own.filter((e) => e.type === "engineer");
      if (engineers.length) this.command({ type: "cmd.repair", ids: engineers.map((e) => e.id), targetId: hit.id });
      return;
    }
    if (action === "supply" && hit) {
      const trucks = own.filter((e) => isSupplyCarrier(e.type));
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
      const inf = own.filter((e) => e.kind === "unit" && garrisonCandidate(hit.type, e.type) && e.garrisonedIn !== hit.id);
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

  /** A wreck out of sight sinks into the night fog with the ground; 1 for anything else. */
  private wreckFade(e: EntityView, now: number): number {
    if (!e.wreck || !this.fogField) return 1;
    const ts = this.ts();
    const p = this.lerpEnt(e);
    return wreckNightAlpha(daylightAt(this.curr.tick), this.fogField.sample(p.x / ts, p.y / ts, now));
  }

  /** Soft veil over ground out of sight, laid on the hills. Drawn under everything standing. */
  private drawGroundFog(): void {
    const field = this.fogField;
    if (!field) return;
    const now = performance.now();
    // Out of sight at night is near black: the dark sight rings and lamps read on the ground.
    const look = nightFog(daylightAt(this.curr.tick), FOG_VEIL_ALPHA, FOG_RGB);
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
        ...look,
      });
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(gl.canvas, 0, 0);
      ctx.restore();
      return;
    }
    this.fogFlat ??= new FogFlat();
    this.fogFlat.draw(this.ctx, field, this.camX, this.camY, now, look);
  }

  /**
   * Complete fog of war: ground you have never seen is black, with a soft edge
   * where exploring has reached. Laid over the sight veil, under everything standing.
   */
  private drawShroud(): void {
    const field = this.shroudField;
    if (!field) return;
    const now = performance.now();
    // Above 1 so the veil's noise never lets the ground show through where nothing is known.
    const look = { alpha: SHROUD_ALPHA, rgb: SHROUD_RGB };
    if (this.shroudGl === undefined) this.shroudGl = FogGl.create();
    const gl = this.shroudGl;
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
        ...look,
      });
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(gl.canvas, 0, 0);
      ctx.restore();
      return;
    }
    this.shroudFlat ??= new FogFlat();
    this.shroudFlat.draw(this.ctx, field, this.camX, this.camY, now, { alpha: 1, rgb: SHROUD_RGB });
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
      this.drawShroud();
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
      // Houses and map defences on ground you have never seen stay under the black.
      if (e.kind === "building" && !this.knownRect(e)) continue;
      const ghost = !liveIds.has(e.id);
      // The Airfield is flat ground; its decal would sit in its own shadow.
      if (e.kind === "building" && !isFieldStructure(e.type) && !isBridge(e.type) && !buildingGroundFor(e.type)) {
        this.pushCastShadow(castShadows, this.buildingShadow(e), w, h);
        this.pushYardWear(yardWear, e, w, h);
      }
      if (!ghost && e.hp > 0 && !e.ruined && (e.type === "sandbags" || isConcreteLine(e.type))) {
        this.pushCastShadow(castShadows, this.fieldShadow(e), w, h);
      }
      items.push({
        ...this.drawKey(e),
        run: () => {
          if (isBridge(e.type)) this.drawBridgeEnt(e, ghost);
          else if (isFieldStructure(e.type)) this.drawField(e, ghost);
          else if (e.kind === "building") this.drawBuilding(e, ghost);
          else if (!ghost && !e.garrisonedIn && this.unitNearView(e, w, h)) {
            const fade = this.sightFade(e, now) * this.wreckFade(e, now);
            if (fade <= 0) return;
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
    this.collectBuildSites(items);
    this.collectBridgeSites(items);
    this.collectTrees(items, castShadows);
    this.collectDecor(items);
    this.collectLamps(items);
    this.collectClutter(items);
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
    this.collectShipWakes(items);
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
    // Over the ground and everything on it; shots and blasts after stay bright in the dark.
    this.drawNight();

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
    this.drawLasers();
    this.drawFallingBombs();
    this.drawTreeFalls();
    this.drawSmokeClouds();
    this.drawImpacts();
    this.drawBarrageTracers();

    const toPlace = this.placeMode ? this.readyBuilding() : null;
    if (toPlace && this.mouseX >= 0) {
      this.drawGhost(toPlace);
    } else if (this.constructPlace && this.mouseX >= 0) {
      this.drawGhost(this.constructPlace, previewConstruct);
    } else if (this.bridgePlace && this.mouseX >= 0) {
      this.drawBridgeGhost(this.bridgePlace);
    }
    this.drawYardBuild();
    if (this.fieldPlace && this.mouseX >= 0) this.drawFieldGhost(this.fieldPlace, false);
    else if (this.mouseX >= 0) {
      const yard = this.readyYardField();
      if (yard === "gate") this.drawGateGhost();
      else if (yard) this.drawFieldGhost(yard, true);
    }
    this.drawRotateHint();

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
    this.drawRadarReach();
    this.drawSonarContacts();
  }

  /** Submarines your Destroyers hear: a ping on the water over the fog, seen or not. */
  private drawSonarContacts(): void {
    const contacts = this.curr.sonar;
    if (!contacts?.length) return;
    const now = performance.now();
    const unit = this.ts() * 2;
    // Eased between snapshots like the hulls, so the ping stays on a boat under way.
    const t = Math.min(1, (now - this.snapAt) / 100);
    for (const c of contacts) {
      const prev = this.prev?.sonar?.find((q) => q.id === c.id);
      const s = this.toScreen(prev ? prev.x + (c.x - prev.x) * t : c.x, prev ? prev.y + (c.y - prev.y) * t : c.y);
      drawSonarContact(this.ctx, s.x, s.y, { nowMs: now, id: c.id, down: !!c.down, unit });
    }
  }

  /** Towers with a lit lamp, each with the heading its beam shows this frame. */
  private easedLamps(): { e: EntityView; facing: number }[] {
    const now = performance.now();
    const dt = this.spotFrameAt > 0 ? Math.min(0.25, (now - this.spotFrameAt) / 1000) : 0;
    this.spotFrameAt = now;
    const speed = Math.max(1, this.curr.gameSpeed || 1);
    const maxStep = ((SPOTLIGHT_TURN_DEG_PER_SEC * speed * 1.25 * Math.PI) / 180) * dt;
    const out: { e: EntityView; facing: number }[] = [];
    const live = new Set<number>();
    for (const e of this.curr.entities) {
      if (e.spotFacing == null || !hasSpotlight(e.type) || e.hp <= 0 || e.crits?.includes("lamp") || e.unpowered) continue;
      live.add(e.id);
      const was = this.spotShown.get(e.id);
      const facing = was == null ? e.spotFacing : easeSpot(was, e.spotFacing, maxStep);
      this.spotShown.set(e.id, facing);
      out.push({ e, facing });
    }
    for (const id of this.spotShown.keys()) if (!live.has(id)) this.spotShown.delete(id);
    return out;
  }

  /**
   * Every lamp burning this frame as soft pools on the ground, in screen
   * space: tower beams, hull headlights, and the slow work lights round a base.
   * `rx` is the pool's half-width on screen; it is half as tall (2:1 iso).
   */
  private nightPools(lamps: { e: EntityView; facing: number }[], w: number, h: number): NightPool[] {
    const ts = this.ts();
    const k = (Math.SQRT2 * ISO_TILE_W) / 2 / ts;
    const out: NightPool[] = [];
    const onView = (x: number, y: number, r: number): boolean => x > -r && y > -r && x < w + r && y < h + r;
    const lay = (wx: number, wy: number, r: number, a: number, kind: NightPool["kind"]): void => {
      const s = this.toScreen(wx, wy);
      const rx = r * k;
      if (onView(s.x, s.y, rx)) out.push({ x: s.x, y: s.y, rx, a, kind });
    };
    const towerReach = SPOTLIGHT_REACH_TILES * ts;
    const towerBlobs = beamBlobs(towerReach, (SPOTLIGHT_HALF_DEG * Math.PI) / 180, { count: 24, widen: 1.15 });
    for (const { e, facing } of lamps) {
      const c = Math.cos(facing);
      const s = Math.sin(facing);
      for (const b of towerBlobs) lay(e.x + c * b.d, e.y + s * b.d, b.r, b.a, "tower");
    }
    const headHalf = (HEADLIGHT_HALF_DEG * Math.PI) / 180;
    for (const e of this.curr.entities) {
      if (!headlightLit(e)) continue;
      const reach = sightTilesOf(e.type, HEIGHT_BASE) * ts;
      const pose = this.lerpEnt(e);
      const at = this.toScreen(pose.x, pose.y);
      if (!onView(at.x, at.y, reach * k)) continue;
      const nose = catalog(e.type).radius;
      const blobs = beamBlobs(reach, headHalf, {
        start: Math.min(0.25, nose / reach),
        count: 9,
        minR: nose * 0.9 * LAMP_BULB_SCALE,
      });
      const sec = this.curr.tick * TICK_DT;
      for (const lamp of hullLamps(e.type, e.id, sec)) {
        const beam = pose.facing + lamp.beam;
        const c = Math.cos(beam);
        const s = Math.sin(beam);
        for (const b of blobs) lay(pose.x + c * b.d, pose.y + s * b.d, b.r, b.a, "head");
      }
    }
    const blend = Math.min(1, (performance.now() - this.snapAt) / 100);
    for (const p of this.curr.projectiles) {
      if (!p.rocket) continue;
      const prev = this.prev?.projectiles.find((q) => q.id === p.id);
      const wx = prev ? prev.x + (p.x - prev.x) * blend : p.x;
      const wy = prev ? prev.y + (p.y - prev.y) * blend : p.y;
      const spot = missileSpot(wx, wy, p.vx, p.vy, ts);
      lay(spot.x, spot.y, spot.r, spot.a, "missile");
    }
    const nowSec = performance.now() / 1000;
    for (const e of this.curr.entities) {
      if (!workLit(e)) continue;
      const n = workLightCount(e.tileW, e.tileH, TILE_SUBDIV);
      const orbit = (Math.max(e.tileW, e.tileH) / 2 + TILE_SUBDIV * 1.3) * ts;
      const r = TILE_SUBDIV * 1.7 * ts;
      for (const b of workLightBearings(e.id, n, nowSec)) {
        lay(e.x + Math.cos(b) * orbit, e.y + Math.sin(b) * orbit, r, 0.8, "work");
      }
    }
    // Gate lamps: a small pool off each post, on both sides of the boom.
    const gateSpan = fieldSpan("gate");
    if (gateSpan) {
      const postAlong = gateSpan.length / 2 - 2.5;
      const off = gateSpan.thick / 2 + TILE_SUBDIV * 0.8 * ts;
      const r = TILE_SUBDIV * 1.1 * ts;
      for (const e of this.curr.entities) {
        if (!e.gate || e.hp <= 0 || e.ruined) continue;
        const { fx, fy, tx, ty } = wallAxes(e.facing);
        for (const a of [-postAlong, postAlong]) {
          for (const side of [-1, 1]) {
            lay(e.x + tx * a + fx * side * off, e.y + ty * a + fy * side * off, r, 0.7, "work");
          }
        }
      }
    }
    // The map's street lamps: a still pool round each post.
    for (const { lamp, wx, wy } of this.standingLamps()) {
      const spec = STREET_LAMPS[lamp.type];
      lay(wx, wy, spec.reachTiles * ts, streetLampFlicker(lamp.type, lamp.x, lamp.y, nowSec), lamp.type);
    }
    return out;
  }

  /** Street lamps on the map that no structure has been raised over, with their world foot. */
  private standingLamps(): { lamp: MapLamp; wx: number; wy: number }[] {
    const map = this.map();
    const lamps = map.lamps;
    if (!lamps?.length) return [];
    const ts = map.tileSize;
    const over = (lamp: MapLamp, e: EntityView): boolean =>
      e.kind === "building" && lamp.x >= e.tileX && lamp.x < e.tileX + e.tileW && lamp.y >= e.tileY && lamp.y < e.tileY + e.tileH;
    const out: { lamp: MapLamp; wx: number; wy: number }[] = [];
    for (const lamp of lamps) {
      if (this.curr.entities.some((e) => over(lamp, e)) || !this.known(lamp.x, lamp.y)) continue;
      out.push({ lamp, wx: (lamp.x + 0.5) * ts, wy: (lamp.y + 0.5) * ts });
    }
    return out;
  }

  /** Street lamp posts. They stand and sort with units like the signposts. */
  /**
   * Breakable clutter. A standing piece sorts with units; a smashed one lies
   * flat under them. For a moment after it breaks, the whole piece squashes
   * down over its wreck and throws a few splinters.
   */
  private collectClutter(items: DrawItem[]): void {
    const map = this.map();
    const list = map.clutter;
    if (!list?.length) return;
    const { w: vw, h: vh } = this.viewSize();
    const now = performance.now();
    const ts = map.tileSize;
    for (const [i, at] of this.clutterBreaks) {
      if (now - at > CLUTTER_BREAK_MS) this.clutterBreaks.delete(i);
    }
    list.forEach((c, i) => {
      if (this.curr.entities.some((e) => e.kind === "building" && c.x >= e.tileX && c.x < e.tileX + e.tileW && c.y >= e.tileY && c.y < e.tileY + e.tileH)) return;
      const wx = (c.x + 0.5) * ts;
      const wy = (c.y + 0.5) * ts;
      const p = this.toScreen(wx, wy);
      if (p.x < -48 || p.y < -48 || p.x > vw + 48 || p.y > vh + 48) return;
      const spr = CLUTTER_SPRITES[c.type];
      const flip = ((c.x * 73856093) ^ (c.y * 19349663)) % 2 === 0;
      const veil = this.fogField?.veil(c.x + 0.5, c.y + 0.5, now) ?? 0;
      const broken = this.clutterBroken.has(i);
      const brokeAt = this.clutterBreaks.get(i);
      const ctx = this.ctx;
      if (!broken) {
        items.push({
          layer: STANDING_DRAW_LAYER,
          z: isoDepth(wx, wy),
          at: { x: wx, y: wy },
          run: () => void drawPropSprite(ctx, spr.whole, p.x, p.y, spr.whole.drawH, flip, veil),
        });
        return;
      }
      items.push({
        layer: CORPSE_DRAW_LAYER,
        z: isoDepth(wx, wy),
        run: () => void drawPropSprite(ctx, spr.broken, p.x, p.y, spr.broken.drawH, flip, veil),
      });
      if (brokeAt === undefined) return;
      const k = Math.min(1, (now - brokeAt) / CLUTTER_BREAK_MS);
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(wx, wy),
        at: { x: wx, y: wy },
        run: () => {
          ctx.save();
          ctx.globalAlpha *= 1 - k;
          ctx.translate(p.x, p.y);
          ctx.scale(1 + 0.35 * k, Math.max(0.05, 1 - k));
          ctx.translate(-p.x, -p.y);
          drawPropSprite(ctx, spr.whole, p.x, p.y, spr.whole.drawH, flip, veil);
          ctx.restore();
          drawClutterSplinters(ctx, p.x, p.y, k, i);
        },
      });
    });
  }

  private collectLamps(items: DrawItem[]): void {
    const { w: vw, h: vh } = this.viewSize();
    const now = performance.now();
    const ts = this.ts();
    for (const { lamp, wx, wy } of this.standingLamps()) {
      const p = this.toScreen(wx, wy);
      if (p.x < -64 || p.y < -16 || p.x > vw + 64 || p.y > vh + 96) continue;
      const spr = LAMP_SPRITES[lamp.type];
      const veil = this.fogField?.veil(wx / ts, wy / ts, now) ?? 0;
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(wx, wy),
        at: { x: wx, y: wy },
        run: () => {
          drawPropSprite(this.ctx, spr, p.x, p.y, STREET_LAMPS[lamp.type].drawH, false, veil);
        },
      });
    }
  }

  /** The lit bulb on each street lamp: a soft halo where the glass is. */
  private drawLampBulbs(glow: number): void {
    const lamps = this.standingLamps();
    if (lamps.length === 0 || glow <= 0) return;
    const ctx = this.ctx;
    const nowSec = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const { lamp, wx, wy } of lamps) {
      const spr = LAMP_SPRITES[lamp.type];
      const spec = STREET_LAMPS[lamp.type];
      const h = spr.image.naturalHeight;
      if (!h) continue;
      const k = spec.drawH / h;
      const foot = this.toScreen(wx, wy);
      const x = foot.x + (spr.bulbX - spr.contactX) * k;
      const y = foot.y + (spr.bulbY - spr.contactY) * k;
      const a = glow * streetLampFlicker(lamp.type, lamp.x, lamp.y, nowSec);
      const g = ctx.createRadialGradient(x, y, 0, x, y, spec.halo);
      g.addColorStop(0, `rgba(255, 250, 230, ${0.85 * a})`);
      g.addColorStop(0.3, `rgba(${spec.rgb}, ${0.5 * a})`);
      g.addColorStop(1, `rgba(${spec.rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, spec.halo, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Dusk and night. Ground out of sight already sinks into the night fog
   * (drawGroundFog); this lays a lighter blue-black over everything, cuts the
   * lamps' pools out of it, and warms them. By day a selected own tower shows
   * where its lamp points, so Rotate can be set before dark.
   */
  private drawNight(): void {
    const lamps = this.easedLamps();
    const daylight = daylightAt(this.curr.tick);
    const shade = nightShade(daylight);
    const glow = lampGlow(daylight);
    const ctx = this.ctx;
    const { w: vw, h: vh } = this.viewSize();
    const pools = glow > 0 ? this.nightPools(lamps, vw, vh) : [];
    const fillPool = (c: CanvasRenderingContext2D, p: NightPool, rgb: string, a: number): void => {
      if (a <= 0.002) return;
      c.save();
      c.translate(p.x, p.y);
      c.scale(1, 0.5);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, p.rx);
      g.addColorStop(0, `rgba(${rgb}, ${a})`);
      g.addColorStop(0.5, `rgba(${rgb}, ${a * 0.55})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, p.rx, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    if (shade > 0.001) {
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.nightLayer ??= document.createElement("canvas");
      const layer = this.nightLayer;
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      }
      const n = layer.getContext("2d");
      if (n) {
        n.setTransform(1, 0, 0, 1, 0, 0);
        n.globalCompositeOperation = "source-over";
        n.clearRect(0, 0, w, h);
        n.fillStyle = `rgba(${NIGHT_RGB}, ${shade})`;
        n.fillRect(0, 0, w, h);
        if (pools.length) {
          n.setTransform(ctx.getTransform());
          n.globalCompositeOperation = "destination-out";
          for (const p of pools) fillPool(n, p, "0,0,0", POOL_CUT[p.kind] * p.a * glow);
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      }
    }
    ctx.save();
    if (pools.length) {
      this.drawLampLight(pools, glow, fillPool);
      this.drawLampBulbs(glow);
      ctx.globalCompositeOperation = "lighter";
      // The roof searchlight's lens: brightest when it looks at the viewer. Hull headlights stay a beam only.
      for (const { e } of lamps) {
        const pose = this.lensAt.get(e.id);
        const at = pose?.lens ?? this.toScreen(e.x, e.y, this.elevAt(e.x, e.y) + TOWER_EYE_HEIGHT);
        const face = pose ? pose.toViewer : 0.5;
        const r = 6 + 10 * face;
        const lamp = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
        lamp.addColorStop(0, `rgba(255, 248, 220, ${(0.45 + 0.5 * face) * glow})`);
        lamp.addColorStop(1, "rgba(255, 230, 170, 0)");
        ctx.fillStyle = lamp;
        ctx.beginPath();
        ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    if (glow <= 0) {
      const reach = SPOTLIGHT_REACH_TILES * this.ts();
      const half = (SPOTLIGHT_HALF_DEG * Math.PI) / 180;
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = "rgba(255, 226, 150, 0.55)";
      for (const { e, facing } of lamps) {
        if (e.type !== "tower" || !this.selected.has(e.id) || e.ownerId !== this.curr.youPlayerId) continue;
        const pts = beamPolygon(e.x, e.y, facing, reach, half, 16).map((p) => this.toScreen(p.x, p.y));
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
    this.lensAt.clear();
  }

  /**
   * The lamps' warm light. The pools are summed on a small layer first, then
   * each pixel's sum goes through stackedLight, so overlapping lamps brighten
   * the ground a little more but never wash it out.
   */
  private drawLampLight(
    pools: NightPool[],
    glow: number,
    fillPool: (c: CanvasRenderingContext2D, p: NightPool, rgb: string, a: number) => void,
  ): void {
    const ctx = this.ctx;
    const S = LIGHT_LAYER_SCALE;
    const lw = Math.max(1, Math.ceil(this.canvas.width / S));
    const lh = Math.max(1, Math.ceil(this.canvas.height / S));
    this.lightLayer ??= document.createElement("canvas");
    const layer = this.lightLayer;
    if (layer.width !== lw || layer.height !== lh) {
      layer.width = lw;
      layer.height = lh;
    }
    const l = layer.getContext("2d", { willReadFrequently: true });
    if (!l) return;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = "source-over";
    l.clearRect(0, 0, lw, lh);
    const m = ctx.getTransform();
    l.setTransform(m.a / S, m.b / S, m.c / S, m.d / S, m.e / S, m.f / S);
    l.globalCompositeOperation = "lighter";
    for (const p of pools) fillPool(l, p, POOL_RGB[p.kind], (POOL_WARM[p.kind] * p.a * glow) / LIGHT_HEADROOM);
    const img = l.getImageData(0, 0, lw, lh);
    const px = img.data;
    for (let i = 3; i < px.length; i += 4) {
      const a = px[i] ?? 0;
      if (a === 0) continue;
      px[i] = Math.round(stackedLight((a / 255) * LIGHT_HEADROOM) * 255);
    }
    l.putImageData(img, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer, 0, 0, lw * S, lh * S);
    ctx.restore();
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

  /**
   * Faint blue dashed ring of a selected CIWS or RAM's reach, the reach the sim
   * fires to (radar-reach.ts): Max range when it is set. The CIWS reaches
   * farther for a plane, so it shows that ring and a fainter one inside for the ground.
   */
  private drawRadarReach(): void {
    const you = this.curr.youPlayerId;
    const mounts = this.curr.entities.filter(
      (e) => this.selected.has(e.id) && e.ownerId === you && e.hp > 0 && !e.wreck && radarLaidOf(e.type),
    );
    if (mounts.length === 0) return;
    const ts = this.ts();
    const ctx = this.ctx;
    const map = this.map();
    const ring = (e: EntityView, r: number) => {
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const s = this.toScreen(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 1.25;
    for (const e of mounts) {
      const peak = footprintPeak(map.heights, map.width, map.height, e.tileX, e.tileY, e.tileW, e.tileH);
      const reach = radarReachTiles(e.type, peak, !!e.longRange);
      ctx.strokeStyle = "rgba(110, 170, 255, 0.45)";
      ring(e, reach.air * ts);
      if (reach.ground < reach.air) {
        ctx.strokeStyle = "rgba(110, 170, 255, 0.25)";
        ring(e, reach.ground * ts);
      }
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
    const word = this.rotateLight ? "LIGHT" : "FACE";
    ctx.strokeText(word, x + 14, y + 8);
    ctx.fillText(word, x + 14, y + 8);
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
    const reach = guardReach(this.map(), this.shroudField ? this.explored : this.knownGround, this.selectedGuardUnits(), origin.x, origin.y, facing, half, arcSteps);
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

  /** Earlier placed spot under the cursor. The last spot is the pen, not a place to close. */
  private patrolConnectIndex(mx: number, my: number): number {
    if (this.patrolLoop || mx < 0 || my < 0) return -1;
    const n = this.patrolPoints.length;
    if (n < 2) return -1;
    let best = -1;
    let bestD = PATROL_CONNECT_PX;
    for (let i = 0; i < n - 1; i++) {
      const p = this.patrolPoints[i]!;
      const s = this.toScreen(p.x, p.y);
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private addPatrolPoint(mx: number, my: number): void {
    if (this.patrolLoop) return;
    const hit = this.patrolConnectIndex(mx, my);
    if (hit >= 0) {
      const ring = connectPatrolPoints(this.patrolPoints, hit);
      if (ring) {
        this.patrolPoints = ring;
        this.patrolLoop = true;
      }
      return;
    }
    if (this.patrolPoints.length >= PATROL_POINTS_MAX) return;
    const w = this.screenToWorld(mx, my);
    const prev = this.patrolPoints[this.patrolPoints.length - 1];
    if (prev && Math.hypot(prev.x - w.x, prev.y - w.y) < this.ts()) return;
    this.patrolPoints.push({ x: w.x, y: w.y });
  }

  private commitPatrol(): void {
    const points = this.patrolPoints.map((p) => ({ x: p.x, y: p.y }));
    const loop = this.patrolLoop;
    const ids = this.ownPatrolIds();
    this.setPatrolMode(false);
    if (points.length === 0 || ids.length === 0) return;
    this.command(loop ? { type: "cmd.patrol", ids, points, loop: true } : { type: "cmd.patrol", ids, points });
  }

  /** Draft clicks, then the route each selected unit is already walking. */
  private drawPatrolOverlay(): void {
    const ctx = this.ctx;
    const you = this.curr.youPlayerId;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const stroke = (pts: { x: number; y: number }[], toCursor: boolean, closed = false) => {
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
      if (closed && started && pts.length >= 2) {
        const s = this.toScreen(pts[0]!.x, pts[0]!.y);
        ctx.lineTo(s.x, s.y);
      } else if (toCursor && this.mouseX >= 0) {
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
      const ids = this.ownPatrolIds();
      const from: { x: number; y: number }[] = [];
      for (const id of ids) {
        const e = this.curr.entities.find((u) => u.id === id);
        if (e) from.push({ x: e.x, y: e.y });
      }
      const connectAt = this.overControl ? -1 : this.patrolConnectIndex(this.mouseX, this.mouseY);
      const ring = this.patrolLoop
        ? this.patrolPoints
        : connectAt >= 0
          ? this.patrolPoints.slice(connectAt)
          : null;
      if (ring && ring.length >= 2) {
        stroke(ring, false, true);
        const join = ring[0]!;
        for (const origin of from) stroke([origin, join], false);
      } else if (from.length === 0) stroke(this.patrolPoints, true);
      else {
        for (const origin of from) stroke([origin, ...this.patrolPoints], true);
      }
    }
    for (const e of this.curr.entities) {
      if (!this.selected.has(e.id) || e.ownerId !== you || !e.patrol || e.patrol.length < 2) continue;
      stroke(e.patrol, false, !!e.patrolLoop);
    }
    ctx.restore();
  }

  private drawPatrolCursor(): void {
    if (!this.patrolMode || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ctx = this.ctx;
    const x = this.mouseX;
    const y = this.mouseY;
    const connectAt = this.patrolConnectIndex(x, y);
    const label = connectAt >= 0 ? "CONNECT" : this.patrolPoints.length > 0 ? "RIGHT FINISH" : "PATROL";
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
    if (connectAt >= 0) {
      const spot = this.patrolPoints[connectAt]!;
      const s = this.toScreen(spot.x, spot.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    alpha = 1,
  ): void {
    if (alpha <= 0) return;
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
      run: () => {
        const ctx = this.ctx;
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * alpha;
        drawGroundShadow(ctx, screen, contact);
        ctx.globalAlpha = prev;
      },
    });
  }

  private collectUnitShadows(items: DrawItem[]): void {
    const now = performance.now();
    for (const e of this.curr.entities) {
      // A hull afloat casts no blob on the water, any more than a swimmer does.
      const inWater = e.swimming || e.wading || isNavalType(e.type);
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
        this.wreckFade(e, now),
      );
    }
  }

  /** Mauler carts draw as their own depth-sorted object behind the hitch. */
  private collectMaulerCarts(items: DrawItem[], w: number, h: number): void {
    const now = performance.now();
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
      const fade = this.wreckFade(e, now);
      if (fade <= 0) continue;
      this.pushGroundShadow(
        items,
        unitShadowFootprint({
          x: pose.x,
          y: pose.y,
          facing: pose.facing,
          radius: catalog(e.type).radius * UNIT_VISUAL_SCALE * 0.6,
          elongated: true,
        }),
        fade,
      );
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(pose.x, pose.y),
        at: { x: pose.x, y: pose.y },
        run: () => {
          const ctx = this.ctx;
          const prev = ctx.globalAlpha;
          ctx.globalAlpha = prev * fade;
          this.drawMaulerCart(e, pose);
          ctx.globalAlpha = prev;
        },
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
    const wreck = e.wreck && spriteReady(HAULER_CART_WRECK_SPRITE);
    if (e.wreck && !wreck) ctx.filter = "grayscale(1) brightness(0.68) contrast(1.08)";
    drawUnitSprite(ctx, wreck ? HAULER_CART_WRECK_SPRITE : HAULER_CART_SPRITE, s.x, s.y, dir.x, dir.y, {
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

  /** Foam left astern by boats under way. A submarine running submerged leaves none. */
  private collectShipWakes(items: DrawItem[]): void {
    const now = performance.now();
    const live = new Set<number>();
    for (const e of this.curr.entities) {
      if (e.kind !== "unit") continue;
      live.add(e.id);
      if (
        !shipLeavesWake({
          naval: isNavalType(e.type),
          torpedo: isTorpedoBody(e.type),
          wreck: e.wreck,
          submerged: e.submerged,
          garrisonedIn: e.garrisonedIn,
        })
      ) {
        this.shipWakeLast.delete(e.id);
        continue;
      }
      const p = this.lerpEnt(e);
      const last = this.shipWakeLast.get(e.id);
      if (!last) {
        this.shipWakeLast.set(e.id, { x: p.x, y: p.y });
        continue;
      }
      const half = e.type === "battleship" ? BATTLESHIP_HALF_LENGTH : catalog(e.type).radius * UNIT_VISUAL_SCALE;
      const scale = shipWakeScale(half);
      const spacing = shipWakeSpacing(scale);
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const travel = trackKickTravel(dx, dy, p.facing);
      if (!travel || travel.dist < spacing) continue;
      const steps = Math.min(4, Math.floor(travel.dist / spacing));
      const origins = shipWakeOrigins(p.x, p.y, p.facing, travel.reverse, half);
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        for (let i = 0; i < origins.length; i++) {
          const o = origins[i]!;
          this.shipWakes.push(
            spawnShipWake(
              { ...o, x: o.x + dx * (k - 1), y: o.y + dy * (k - 1) },
              now,
              (e.id * 2654435761 + Math.floor(now) + s * 13 + i * 29) >>> 0,
              scale,
            ),
          );
        }
      }
      this.shipWakeLast.set(e.id, { x: p.x, y: p.y });
    }
    for (const id of this.shipWakeLast.keys()) {
      if (!live.has(id)) this.shipWakeLast.delete(id);
    }
    if (this.shipWakes.length > 600) this.shipWakes.splice(0, this.shipWakes.length - 600);

    const keep: ShipWakePatch[] = [];
    for (const patch of this.shipWakes) {
      const pose = shipWakePose(patch, now);
      if (!pose) continue;
      keep.push(patch);
      const screen = this.toScreen(pose.x, pose.y);
      // Flat on the water, under every hull.
      items.push({
        layer: HOLE_DRAW_LAYER,
        z: isoDepth(pose.x, pose.y),
        run: () => drawShipWake(this.ctx, screen.x, screen.y, pose.t, patch.seed, patch.scale, patch.centre),
      });
    }
    this.shipWakes = keep;
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
    this.collectFieldGunSmoke(items, now);
  }

  private collectFieldGunSmoke(items: DrawItem[], now: number): void {
    if (this.fieldGunSmokes.length > 280) this.fieldGunSmokes.splice(0, this.fieldGunSmokes.length - 280);
    const o = worldToIso(0, 0, this.ts());
    const u = worldToIso(1, 0, this.ts());
    const scale = Math.hypot(u.x - o.x, u.y - o.y);
    const keep: FieldGunSmokePuff[] = [];
    for (const puff of this.fieldGunSmokes) {
      const pose = fieldGunSmokePose(puff, now);
      if (!pose) {
        if (now < puff.at) keep.push(puff);
        continue;
      }
      keep.push(puff);
      const screen = this.toScreen(pose.x, pose.y);
      items.push({
        layer: 1,
        z: isoDepth(pose.x, pose.y) + 0.2,
        run: () => drawFieldGunSmoke(this.ctx, screen.x, screen.y - pose.lift, pose.t, pose.radius, puff.seed, scale),
      });
    }
    this.fieldGunSmokes = keep;
  }

  /** World footprint of a building's cast shadow; EXTRUDE is its screen height. */
  private buildingShadow(e: EntityView): { x: number; y: number }[] {
    const ts = this.ts();
    const base = isTurnedBuilding(e) ? this.turnedWalls(e) : undefined;
    return buildingShadowFootprint({
      ...wallFootprint(e.tileX * ts, e.tileY * ts, e.tileW * ts, e.tileH * ts),
      height: (this.extrude(e.type) * ts) / ISO_TILE_H,
      base,
    });
  }

  /** A turned building's walls, drawn in from its footprint the way wallFootprint draws in a box. */
  private turnedWalls(e: EntityView): { x: number; y: number }[] {
    const r = buildingRect(e, this.ts());
    return rectCorners({ ...r, halfU: r.halfU * WALL_SHARE, halfV: r.halfV * WALL_SHARE });
  }

  /** Trampled earth around a building, laid on the terrain under each point. */
  private pushYardWear(out: IsoPt[][], e: EntityView, w: number, h: number): void {
    const ts = this.ts();
    if (isTurnedBuilding(e)) {
      const def = catalog(e.type);
      const corners = this.turnedCorners(e);
      this.pushCastShadow(out, yardWearFootprint({ x: 0, y: 0, w: def.tileW * ts, h: def.tileH * ts, corners }), w, h);
      return;
    }
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
      if (map.tiles[ty * w + tx] !== TILE_TREE || !this.known(tx, ty)) continue;
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

  /** Bushes, signposts, boulders, and stumps from the map dress. Bushes paint under everything standing; the rest sort with units. */
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
      if (built.has(it.ty * w + it.tx) || !this.known(it.tx, it.ty)) continue;
      const wx = (it.tx + it.ox) * ts;
      const wy = (it.ty + it.oy) * ts;
      const p = this.toScreen(wx, wy);
      if (p.x < -64 || p.y < -16 || p.x > vw + 64 || p.y > vh + 64) continue;
      const faces = DECOR_FACES[it.kind];
      const spr = faces[it.face % faces.length];
      if (!spr) continue;
      const veil = this.fogField?.veil(it.tx + it.ox, it.ty + it.oy, now) ?? 0;
      items.push({
        // Bushes never cover a unit or building standing beside them.
        layer: it.kind === "bush" ? BUSH_DRAW_LAYER : STANDING_DRAW_LAYER,
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
    const spr = buildingGroundFor(e.type, e.facing);
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
      const pts = isTurnedBuilding(e) ? this.turnedCorners(e, pad).map((p) => this.toScreen(p.x, p.y, elev)) : [
        this.toScreen(x - pad, y - pad, elev),
        this.toScreen(x + bw + pad, y - pad, elev),
        this.toScreen(x + bw + pad, y + bh + pad, elev),
        this.toScreen(x - pad, y + bh + pad, elev),
      ];
      drawSelectFrame(ctx, pts, { hostile: this.hostileEntity(e), now: performance.now() });
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
    const ground = buildingGroundFor(e.type, e.facing);
    // A building with a ground decal draws its selection frame there, under everything standing.
    if (!ghost && this.selected.has(e.id) && !(ground && spriteReady(ground))) {
      const pad = 3;
      const pts = isTurnedBuilding(e) ? this.turnedCorners(e, pad).map((p) => this.toScreen(p.x, p.y, elev)) : [
        this.toScreen(x - pad, y - pad, elev),
        this.toScreen(x + bw + pad, y - pad, elev),
        this.toScreen(x + bw + pad, y + bh + pad, elev),
        this.toScreen(x - pad, y + bh + pad, elev),
      ];
      drawSelectFrame(ctx, pts, { hostile: this.hostileEntity(e), now: performance.now() });
    }
    if (isRubble(e)) {
      // A fallen house is a low heap: it keeps the lot, hides nothing, and carries no bars.
      const north = this.toScreen(x, y, elev);
      const rise = ts * RUBBLE_MAX_RISE;
      const bounds = { x: west.x - 2, y: north.y - rise - 2, w: east.x - west.x + 4, h: south.y - north.y + rise + 4 };
      const lift = this.groundSpan(x + bw / 2, y + bh / 2, 10) / 10;
      this.drawVeiled(e, elev, rise, bounds, () => {
        drawRubble(this.ctx, {
          x,
          y,
          w: bw,
          h: bh,
          tileSize: ts,
          type: e.type,
          seed: e.id >>> 0,
          alpha: 1,
          project: (wx, wy, up) => {
            const p = this.toScreen(wx, wy, elev);
            return { x: p.x, y: p.y - up * lift };
          },
        });
      });
      return;
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
        const gun = gunLayerFor(e.type);
        if (e.type === "ciws" || e.type === "ram" || gun) {
          // The gun sheet shares the unturned pad's canvas: a turned pad still lays it out on that.
          const pad = this.unturnedPad(e, elev) ?? { x: south.x, y: south.y, w: footprintW };
          const base = unturnedBuildingSprite(e.type) ?? spr;
          const aim = e.turretFacing ?? e.facing;
          if (e.type === "ciws") this.drawCiwsGun(base, pad.x, pad.y, pad.w, 1, aim, ghost ? undefined : e);
          else if (e.type === "ram") this.drawCiwsGun(base, pad.x, pad.y, pad.w, 1, aim, undefined, RAM_TURRET_SHEET);
          else if (gun) {
            // One column per man at the gun: an empty gun shows nobody behind the shield.
            const crew = ghost ? gun.cols - 1 : Math.min(gun.cols - 1, e.garrison?.count ?? 0);
            this.drawCiwsGun(base, pad.x, pad.y, pad.w, 1, aim, undefined, gun.sheet, crew, gun.cols);
          }
          if (!ghost && this.selected.has(e.id) && mountArcDegOf(e.type) != null) {
            this.drawMountArc(e.type, e.x, e.y, e.facing, elev, 0.5);
          }
        } else if (hasSpotlight(e.type)) {
          const pad = this.unturnedPad(e, elev) ?? { x: south.x, y: south.y, w: footprintW };
          this.drawTowerLamp(e, pad.x, pad.y, pad.w, ghost);
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
      this.drawCrits(e, stack.x + layoutW / 2, stack.y - 18);
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

  /**
   * The watch tower's roof searchlight, turned to the heading its beam shows
   * (eased like the beam, so lamp and light swing together). The lens burns
   * while the beam is lit and goes dark when a crit smashes it or power runs short.
   */
  private drawTowerLamp(e: EntityView, southX: number, southY: number, footprintW: number, ghost: boolean): void {
    const facing = this.spotShown.get(e.id) ?? e.spotFacing ?? Math.PI / 4;
    const broken = !!e.crits?.includes("lamp");
    const burning = !ghost && e.spotFacing != null && e.hp > 0 && !broken && !e.unpowered;
    const lit = burning ? lampGlow(daylightAt(this.curr.tick)) : 0;
    const pose = drawTowerSearchlight(this.ctx, southX, southY, footprintW, facing, { lit, broken });
    if (!ghost) this.lensAt.set(e.id, pose);
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
    /** A crewed gun's sheet has a column per man at it: draw column `col` of `cols`. */
    col = 0,
    cols = 1,
  ): void {
    if (!sheet.complete || sheet.naturalWidth <= 0) return;
    const ctx = this.ctx;
    const ts = this.ts();
    const row = ciwsTurretCell(sheet.naturalWidth, sheet.naturalHeight, ciwsTurretRow(facing, ts));
    const cw = row.sw / Math.max(1, cols);
    const cell = { sx: cw * Math.max(0, Math.min(cols - 1, col)), sy: row.sy, sw: cw, sh: row.sh };
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

  /**
   * The ground an emplacement can lay on: a fan out to its reach, either side of the way it
   * was set. Drawn on the placement ghost and on a selected gun, so the turn is chosen by eye.
   */
  private drawMountArc(type: EntityType, x: number, y: number, facing: number, elev: number, alpha: number): void {
    const arc = mountArcDegOf(type);
    if (arc == null) return;
    const ts = this.ts();
    const reach = catalog(type).rangeTiles * ts;
    const half = (arc * Math.PI) / 180;
    const steps = Math.max(8, Math.round(arc / 5));
    const ctx = this.ctx;
    const c = this.toScreen(x, y, elev);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    for (let i = 0; i <= steps; i++) {
      const a = facing - half + (2 * half * i) / steps;
      const p = this.toScreen(x + Math.cos(a) * reach, y + Math.sin(a) * reach, elev);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = "#ffd27a";
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#ffd27a";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
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
    if (e.type === "cyborgcommander") {
      // He holds the firing pose while the beam is out.
      const sheet = cyborgSheet({ swimming: e.swimming, wreck: e.wreck, stance: e.stance, shotAgeMs: e.laser ? 0 : null });
      if (sheet === "die") return CYBORGCOMMANDER_DIE_SPRITE;
      if (sheet === "fire") return CYBORGCOMMANDER_FIRE_SPRITE;
      if (sheet === "crawl-fire") return CYBORGCOMMANDER_CRAWL_FIRE_SPRITE;
      if (sheet === "crawl") return CYBORGCOMMANDER_CRAWL_SPRITE;
      if (sheet === "swim") return spriteFor("cyborgcommander", "stand", true);
      return CYBORGCOMMANDER_SPRITE;
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

  /** A running torpedo, seen under the surface, trailing bubbles and a wake. */
  private drawTorpedo(e: EntityView): void {
    const ctx = this.ctx;
    const p = this.lerpEnt(e);
    const ux = Math.cos(p.facing);
    const uy = Math.sin(p.facing);
    const half = TORPEDO_BODY_HALF;
    const nose = this.toScreen(p.x + ux * half, p.y + uy * half);
    const tail = this.toScreen(p.x - ux * half, p.y - uy * half);
    const wake = this.toScreen(p.x - ux * half * TORPEDO_WAKE_MUL, p.y - uy * half * TORPEDO_WAKE_MUL);
    drawTorpedoBody(ctx, { tail, nose, wake, color: this.ownerColor(e), now: performance.now(), seed: e.id });
  }

  private drawUnit(e: EntityView): void {
    if (isTorpedoBody(e.type)) {
      this.drawTorpedo(e);
      return;
    }
    const spr = this.spriteOf(e);
    if (spr) {
      // Your own submarine running submerged shows faint under the surface.
      const prev = this.ctx.globalAlpha;
      if (e.submerged && !e.wreck) this.ctx.globalAlpha = prev * SUBMERGED_ALPHA;
      this.drawSpritedUnit(e, spr);
      this.ctx.globalAlpha = prev;
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

  /** The sheet a unit is drawn from: a hulk's burnt-out sheet when it has one loaded. */
  private drawnSheet(e: EntityView, def: UnitSpriteDef): UnitSpriteDef {
    const corpse = isInfantryType(e.type) && !!e.wreck;
    const hulk = e.wreck && !corpse ? wreckSpriteFor(e.type) : undefined;
    return hulk && spriteReady(hulk) ? hulk : def;
  }

  /**
   * Screen rect of a sprited unit's painted art at screen point `s` (already
   * lifted for anything in the air). Null until its sheet has loaded.
   */
  private unitPaint(
    e: EntityView,
    def: UnitSpriteDef,
    p: { facing: number; turretFacing?: number },
    s: { x: number; y: number },
  ): ScreenRect | null {
    const ts = this.ts();
    const dir = facingToIso(p.facing, ts);
    const turretDir = facingToIso(p.turretFacing ?? p.facing, ts);
    const mountDir = e.ciws ? facingToIso(e.ciws.facing, ts) : undefined;
    return unitSpritePaintRect(this.drawnSheet(e, def), s.x, s.y, dir.x, dir.y, {
      facing: p.facing,
      turretDx: turretDir.x,
      turretDy: turretDir.y,
      turretFacing: p.turretFacing,
      mountDx: mountDir?.x,
      mountDy: mountDir?.y,
      mountFacing: e.ciws?.facing,
    });
  }

  /** Battle Ship superstructure, turrets, and CIWS mounts over its hull. (ox, oy) is the model origin on screen. */
  private drawShipLayers(e: EntityView, facing: number, ox: number, oy: number, size: number): void {
    const ship = e.ship;
    if (!ship) return;
    const ctx = this.ctx;
    const layers = battleshipLayers(
      facing,
      ship.turrets.map((t) => t.facing),
      ship.ciws.map((m) => m.facing),
      size,
      this.ts(),
    );
    const left = ox - size / 2;
    const top = oy - size * BATTLESHIP_SPRITE.contactY;
    for (const l of layers) {
      const sheet = BATTLESHIP_LAYERS[l.layer];
      if (!spriteReady(sheet)) continue;
      const cell = sheet.frameSize;
      ctx.drawImage(sheet.image, 0, l.row * cell, cell, cell, left + l.dx, top + l.dy, size, size);
    }
    if (!e.wreck) this.drawShipLamp(e, facing, ox, oy, size);
  }

  /** The Battle Ship's searchlight on top of the fire-control director, turned like its beam. */
  private drawShipLamp(e: EntityView, facing: number, ox: number, oy: number, size: number): void {
    const mount = shipLampMount(facing, size, this.ts());
    const broken = !!e.crits?.includes("lamp");
    const burning = e.spotFacing != null && e.hp > 0 && !broken;
    const lit = burning ? lampGlow(daylightAt(this.curr.tick)) : 0;
    const heading = this.spotShown.get(e.id) ?? e.spotFacing ?? facing;
    const pose = drawSearchlightAt(this.ctx, ox + mount.dx, oy + mount.dy, mount.u, heading, { lit, broken });
    this.lensAt.set(e.id, pose);
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
    } else if (rec && e.type === "artillery" && !e.wreck) {
      const nudge = fieldGunNudgePx(rec.at, performance.now(), size);
      if (nudge == null) this.gunRecoil.delete(e.id);
      else {
        const len = Math.hypot(dir.x, dir.y) || 1;
        hullShiftX = (-dir.x / len) * nudge;
        hullShiftY = (-dir.y / len) * nudge;
      }
    }
    const corpse = isInfantryType(e.type) && !!e.wreck;
    // A hulk has its own burnt-out sheet on the same cell and contact; without one it greys the live art.
    const sheet = this.drawnSheet(e, def);
    let frameIndex: number | undefined;
    if (def === TROOPER_DIE_SPRITE || def === GUNNER_DIE_SPRITE || def === SNIPER_DIE_SPRITE || def === ATINFANTRY_DIE_SPRITE || def === ROCKETER_DIE_SPRITE || def === PYRO_DIE_SPRITE || def === MORTARMAN_DIE_SPRITE || def === ENGINEER_DIE_SPRITE || def === MEDIC_DIE_SPRITE || def === DRONEOP_DIE_SPRITE || def === CYBORG_DIE_SPRITE || def === CYBORGCOMMANDER_DIE_SPRITE || def === JUMPJET_DIE_SPRITE) frameIndex = heldFrame(this.corpseAge(e.id), def.fps, def.frames);
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
    if (e.wreck && !corpse && sheet === def) ctx.filter = "grayscale(1) brightness(0.68) contrast(1.08)";
    // A map's neutral unit is grey: no one's colours, everyone's enemy.
    else if (!e.wreck && !e.ownerId) ctx.filter = NEUTRAL_UNIT_FILTER;
    // The ship's mounts are placed on the sim's own spots: no ground sink under the hull.
    if (e.ship || def === BATTLESHIP_SPRITE) hullShiftY -= unitGroundSink(size);
    const stepping = unitStepping({ type: e.type, state: e.state, swimming: e.swimming, prev: this.prevById.get(e.id), curr: e });
    if (e.type === "walker" && frameIndex == null) {
      const odo = this.walkerOdo.get(e.id);
      const d = (odo?.d ?? 0) + strideHop(odo, p);
      this.walkerOdo.set(e.id, { x: p.x, y: p.y, d });
      if (stepping && !e.wreck && !immobilized(e)) frameIndex = strideFrame(d, WALKER_STRIDE_WORLD, sheet.frames, e.id);
    }
    const drawn = drawUnitSprite(ctx, sheet, s.x, s.y, dir.x, dir.y, {
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
    // A sunk hulk has its superstructure and turrets baked in; the grey stand-in still needs them.
    if (drawn && e.ship && (!e.wreck || sheet === def)) this.drawShipLayers(e, p.facing, s.x + hullShiftX, s.y + hullShiftY + unitGroundSink(size), size);
    ctx.restore();
    ctx.restore();
    if (drawn && e.ship && !e.wreck) {
      const now = performance.now();
      e.ship.ciws.forEach((m, i) => {
        if (!m.fire) return;
        const at = shipCiwsMuzzle(p, i, m.facing, size);
        const pt = this.toScreen(at.x, at.y);
        const d = facingToIso(m.facing, this.ts());
        const len = Math.hypot(d.x, d.y) || 1;
        const muzzle = { x: pt.x, y: pt.y - at.lift, dirX: d.x / len, dirY: d.y / len };
        drawGatlingFlash(ctx, muzzle, size * 0.25, now, e.id + i * 7);
      });
    }
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
    if (drawn && !e.wreck && e.field && e.field.hp > 0) {
      const now = performance.now();
      const seen = this.fieldSeen.get(e.id);
      const legless = e.stance === "crawl";
      drawForceField(
        ctx,
        s.x,
        s.y + unitGroundSink(size),
        size * (legless ? 0.8 : 0.62),
        size * (legless ? 0.42 : 0.78),
        e.field.hp / Math.max(1, e.field.max),
        seen ? now - seen.hitAt : null,
        now,
        e.id,
      );
    }
    if (drawn && !e.wreck && isInfantryType(e.type) && !e.swimming) {
      const heat = this.fireHeatAt(p.x, p.y);
      if (heat > 0) drawBodyFlames(ctx, s.x, s.y, size, heat, performance.now(), e.id);
    }
    if (drawn && corpse && isCyborg(e.type)) {
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
    // Bars ride just over the painted art, not the top of the (mostly empty) sheet cell.
    const paint = drawn ? this.unitPaint(e, def, p, s) : null;
    const head = paint ? paint.y : s.y - size * def.contactY;
    const right = paint ? Math.max(paint.x + paint.w, s.x + size * 0.2) : s.x + size * 0.45;
    if (e.ownerId === this.curr.youPlayerId && e.type === "rig") {
      const name = this.curr.players.find((pl) => pl.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, s.x, head - 12);
    }
    // Leave room under the health bar for the ammo strips, so they sit on the art and not in it.
    const barBase = paint ? head - 1 - ammoBarRatios(e).length * 2 : head - 2;
    this.maybeHp(e, s.x - size * 0.45, barBase, size * 0.9);
    // A hull that carries soldiers (the Mammoth) shows who is aboard, like a Bunker.
    if (!e.wreck) this.drawGarrisonBars(e, right + 4, head - 2);
    if (e.tend != null && !e.wreck) this.drawHealMark(e);
    this.drawScoutBar(e, s.x - size * 0.22, barBase - 6);
    this.drawCrits(e, right + 2, head - 18);
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
      const lift = WRECK_FIRE_LIFT[e.type] ?? 1;
      const oy = uy * size * along * 0.45 + ux * size * across * 0.45 - size * (i === 0 ? 0.47 : 0.4) * lift;
      // The flame sets its own alpha; carry the hull's sight and night fade into it.
      drawWreckFire(this.ctx, x + ox, y + oy, now, e.id * 13 + i * 29, a * this.ctx.globalAlpha);
    }
  }

  /** Craters on the ground, under the water. Blood and the fallen pose sit under every unit. */
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
    const sprite = face && face.image.naturalWidth > 0 && face.bowl > 0 ? face : null;
    const drawH = sprite ? (sprite.image.naturalHeight * rx * 2.05) / sprite.bowl : 0;
    const fallback = fallbackHoleRect(c.x, c.y, rx, rx * 0.5);
    const dest = sprite
      ? unionRect(
          propScreenRect(
            c.x,
            c.y,
            drawH,
            sprite.image.naturalWidth,
            sprite.image.naturalHeight,
            sprite.contactX,
            sprite.contactY,
          ),
          fallback,
        )
      : fallback;
    const bake = this.terrain;
    const masks = bake?.water?.length
      ? screenWaterCovers(bake.water, this.camX, this.camY, bake.originX, bake.originY)
      : [];
    this.holeCover ??= document.createElement("canvas");
    coverWithWater(this.ctx, this.holeCover, dest, masks, (ctx) => {
      if (sprite) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const drew = drawPropSprite(ctx, sprite, c.x, c.y, drawH, false);
        ctx.restore();
        if (drew) return;
      }
      const tip = this.toScreen(hole.x + Math.cos(hole.ang), hole.y + Math.sin(hole.ang));
      const ang = hole.round ? 0 : Math.atan2(tip.y - c.y, tip.x - c.x);
      drawShellHole(ctx, c.x, c.y, rx, rx * 0.5, ang, hole.seed, alpha);
    });
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
      if (isCyborg(body.type)) {
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

  /** Pod or tube flash and backblast. Not a tank shot: the main gun does not recoil. */
  private noteRocketLaunch(
    shooter: EntityView | undefined,
    p: { id: number; x: number; y: number; vx: number; vy: number; z?: number; fromId: number },
    now: number,
  ): void {
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

  /**
   * Cyborg Commander beams: from the lens on his drawn sheet to where the beam
   * bites the ground, swinging across a sweep between snapshots.
   */
  private drawLasers(): void {
    const ctx = this.ctx;
    const now = performance.now();
    const ts = this.ts();
    for (const e of this.curr.entities) {
      const beam = e.laser;
      if (!beam || e.wreck) continue;
      const seen = this.beamSeen.get(e.id);
      const u = beamShare(beam, seen?.at ?? this.snapAt, now);
      const p = this.lerpEnt(e);
      const end = beamEnd(beam, p.x, p.y, u);
      const s = this.toScreen(p.x, p.y);
      const legless = e.stance === "crawl";
      const size = spriteFor(e.type, e.stance)?.drawSize ?? 20;
      const dir = facingToIso(p.facing, ts);
      const lens = cyborgCommanderLens(engineRowFromScreen(dir.x, dir.y), legless, size);
      const from = { x: s.x + lens.x, y: s.y + unitGroundSink(size) + lens.y };
      drawLaserBeam(ctx, from, this.toScreen(end.x, end.y), now, e.id);
    }
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
    for (const m of this.curr.mines ?? []) {
      const s = this.toScreen(m.x, m.y);
      if (s.x < -12 || s.y < -12 || s.x > w + 12 || s.y > h + 12) continue;
      if (m.water) {
        // A Destroyer's contact mine rides at the waterline: it stands, a bomblet lies.
        items.push({
          layer: STANDING_DRAW_LAYER,
          z: isoDepth(m.x, m.y),
          run: () =>
            drawWaterMine(this.ctx, s.x, s.y, { seed: m.id, arming: m.armed === false, nowMs: now, size: this.ts() * 0.55 }),
        });
        continue;
      }
      items.push({
        layer: GROUND_DECAL_DRAW_LAYER,
        z: isoDepth(m.x, m.y),
        run: () =>
          drawMine(this.ctx, s.x, s.y, {
            seed: m.id,
            arming: m.armed === false,
            nowMs: now,
            disarm: m.disarm,
          }),
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
    if (this.scorches.size > SCORCH_CAP) {
      const old = [...this.scorches.entries()].filter(([id]) => !live.has(id)).sort((a, b) => a[1].seen - b[1].seen);
      for (const [id] of old.slice(0, this.scorches.size - SCORCH_CAP)) this.scorches.delete(id);
    }
    const tongues = Math.min(FIRE_TONGUES_MAX, Math.floor(FIRE_TONGUE_BUDGET / Math.max(1, fires.length)));
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
      for (const t of fireTongues(f.id, rx, tongues)) {
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
      const every = FIRE_SMOKE_EVERY_MS / Math.max(0.2, heat);
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
      // A 16-inch shell drags a much heavier trail than a mortar bomb, and it hangs longer.
      const thick = p.shipBarrel != null ? SHIP_SHELL_SMOKE_THICK : 1;
      drawMortarSmoke(ctx, this.mortarSmokeScreen(pts), p.id, 1, thick);
      this.mortarSmoke.set(p.id, { pts, at: now, thick });
    }
    for (const [id, trail] of this.mortarSmoke) {
      if (live.has(id)) continue;
      const age = now - trail.at;
      const hang = trail.thick > 1 ? 2200 : 900;
      if (age > hang) {
        this.mortarSmoke.delete(id);
        continue;
      }
      drawMortarSmoke(ctx, this.mortarSmokeScreen(trail.pts), id, 1 - age / hang, trail.thick);
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
      // A torpedo on a hull: the fireball goes up inside the water column.
      const wet = f.death && !f.torpedo ? undefined : waterBurst(f);
      const life = f.death
        ? Math.max(deathBlastLifeMs(f.death), wet ? waterBurstLifeMs(wet) : 0)
        : burst
          ? burstLifeMs(burst)
          : wet
            ? waterBurstLifeMs(wet)
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
      } else if (wet) {
        drawWaterBurst(ctx, s.x, s.y, age, f.id, wet, dirX, dirY);
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
      } else if (f.death) {
        drawDeathBlast(ctx, s.x, s.y, age, f.id, f.death);
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
  /** What a click on the hovered unit's special does: unpack (Rig, Titan) or pack up (Core, braced Titan). */
  private hoverSpecialMode: DeployCursorMode = "deploy";
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
        // An armed order clicks through a unit with a ready special (a Titan's Deploy),
        // so keep that order's crosshair instead of the gold pointer.
        special = !aiming && !!hit && this.canSpecial(hit);
        if (special) this.hoverSpecialMode = specialLabel(hit!.type, hit!.braced) === "Pack" ? "pack" : "deploy";
        if (!special && !aiming) {
          const you = this.curr.youPlayerId;
          const selected = this.curr.entities.filter(
            (e) => this.selected.has(e.id) && !e.wreck && e.hp > 0,
          );
          action = resolveHoverAction({
            youPlayerId: you,
            selected,
            hit,
            mine: this.mineAt(this.mouseX, this.mouseY) != null,
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
    drawDeployCursor(this.ctx, this.hoverSpecialMode, this.mouseX, this.mouseY, this.lastT / 1000);
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

  /** An enemy's, or one of the map's neutral units, which fight every commander. */
  private hostileEntity(e: EntityView): boolean {
    if (e.kind === "unit" && !e.ownerId) return true;
    return this.hostileOwner(e.ownerId);
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
    const hostile = !!e.garrison?.neutral || this.hostileOwner(e.garrison ? e.garrison.ownerId : e.ownerId);
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
    this.paintHpBar(Math.round(x), Math.round(y), barW, barH, ratio, selected ? 0.95 : 0.7, this.hostileEntity(e), selected);
    this.ctx.restore();
  }

  private maybeHp(e: EntityView, x: number, y: number, w: number): void {
    if (e.wreck) return;
    const now = performance.now();
    const selected = this.selected.has(e.id);
    const damaged = (this.damagedUntil.get(e.id) ?? 0) > now;
    const unit = e.kind === "unit";
    // A CIWS or RAM always shows its bars, like a unit, wider and thicker: the belt is what it lives on.
    const mount = radarLaidOf(e.type);
    const capturing = (e.capture?.progress ?? 0) > 0;
    if (!(unit || mount || selected || damaged || capturing)) return;
    const ratio = Math.max(0, Math.min(1, e.hp / e.hpMax));
    const barW = Math.max(8, mount ? w * (selected ? 0.95 : 0.85) : selected ? w * 0.48 : w * 0.4);
    const barH = mount ? (selected ? 4 : 3) : selected ? 3 : 2;
    const bx = x + (w - barW) / 2;
    const by = y - (selected ? 4 : 3);
    const alpha = selected ? 1 : damaged ? 0.42 : mount ? 0.55 : 0.28;
    const ctx = this.ctx;
    ctx.save();
    this.paintHpBar(bx, by, barW, barH, ratio, alpha, this.hostileEntity(e), selected);
    if (e.field) {
      // The force field rides above the health bar, pale blue: it goes first.
      const fy = by - barH - 1;
      ctx.globalAlpha = Math.min(1, alpha + 0.12) * 0.85;
      ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
      ctx.fillRect(bx, fy, barW, barH);
      ctx.globalAlpha = Math.min(1, alpha + 0.12);
      ctx.fillStyle = FIELD_BAR_FILL;
      ctx.fillRect(bx, fy, barW * Math.max(0, Math.min(1, e.field.hp / Math.max(1, e.field.max))), barH);
      ctx.globalAlpha = 1;
    }
    this.paintAmmoBars(e, bx, by + barH + 1, barW, Math.min(1, alpha + 0.12), mount ? 2 : 1);
    if (outOfAmmo(e)) drawOutOfAmmo(ctx, bx - OUT_OF_AMMO_SIZE - 3, by + barH / 2 - OUT_OF_AMMO_SIZE / 2, Math.max(alpha, 0.85));
    ctx.restore();
  }

  /** Yellow (main store, or a Jump Jet's fuel) and gray (secondary) strips under the health bar. */
  private paintAmmoBars(e: EntityView, x: number, y: number, w: number, alpha: number, h = 1): void {
    const ratios = ammoBarRatios(e);
    const ctx = this.ctx;
    for (let i = 0; i < ratios.length; i++) {
      const by = y + i * (h + 1);
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
      ctx.fillRect(x, by, w, h);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i === 0 ? AMMO_PRIMARY_FILL : AMMO_SECONDARY_FILL;
      ctx.fillRect(x, by, w * ratios[i]!, h);
    }
  }

  private ownerColor(e: EntityView): string {
    if (isCivilianType(e.type) && !e.ownerId) {
      const occ = e.garrison?.ownerId;
      if (occ) {
        const holder = this.curr.players.find((pl) => pl.playerId === occ);
        if (holder) return colorHex(holder.colorId);
      }
      return e.garrison?.neutral ? NEUTRAL_UNIT_FILL : CIV_FILL;
    }
    // A map's neutral unit: grey.
    if (!e.ownerId && e.kind === "unit") return NEUTRAL_UNIT_FILL;
    // A map defence nobody has taken yet.
    if (!e.ownerId) return CIV_FILL;
    const p = this.curr.players.find((pl) => pl.playerId === e.ownerId);
    return colorHex(p?.colorId ?? 0);
  }

  private drawGhost(type: BuildingType, siteOk: typeof previewPlace = previewPlace): void {
    const placed = this.placeSite(type, this.mouseX, this.mouseY);
    const facing = placed.facing;
    const ok = siteOk(this.curr, type, placed.tx, placed.ty, facing);
    const ts = this.ts();
    const site = buildingSite(type, placed.tx, placed.ty, facing, ts);
    const turned = isTurnedBuilding(site);
    const top = ok ? "#7dff6a" : "#ff5a4a";
    const x = site.tileX * ts;
    const y = site.tileY * ts;
    const bw = site.tileW * ts;
    const bh = site.tileH * ts;
    const elev = this.buildingElev(site);
    const corners = turned ? rectCorners(buildingRect(site, ts)) : null;
    const spr = buildingSpriteFor(type, facing);
    if (spr && spriteReady(spr)) {
      const south = this.toScreen(x + bw, y + bh, elev);
      const east = this.toScreen(x + bw, y, elev);
      const west = this.toScreen(x, y + bh, elev);
      const n = this.toScreen(x, y, elev);
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = top;
      if (corners) {
        this.groundPath(corners, elev);
        ctx.fill();
      } else this.fillQuad(n, east, south, west);
      ctx.globalAlpha = 0.55;
      const ground = buildingGroundFor(type, facing);
      if (ground && spriteReady(ground)) drawBuildingSprite(ctx, ground, south.x, south.y, east.x - west.x);
      drawBuildingSprite(ctx, spr, south.x, south.y, east.x - west.x);
      if (hasSpotlight(type)) {
        // The lamp starts out along the tower's front, as the placed tower's does.
        const pad = this.unturnedPad(site, elev) ?? { x: south.x, y: south.y, w: east.x - west.x };
        drawTowerSearchlight(ctx, pad.x, pad.y, pad.w, facing, { lit: 0, broken: false });
      }
      ctx.restore();
      // The ghost lays its gun the way the site is turned, on the unturned pad its sheet shares.
      const gun = gunLayerFor(type);
      if (type === "ciws" || type === "ram" || gun) {
        const pad = this.unturnedPad(site, elev) ?? { x: south.x, y: south.y, w: east.x - west.x };
        const base = unturnedBuildingSprite(type) ?? spr;
        if (type === "ciws") this.drawCiwsGun(base, pad.x, pad.y, pad.w, 0.55, facing);
        else if (type === "ram") this.drawCiwsGun(base, pad.x, pad.y, pad.w, 0.55, facing, undefined, RAM_TURRET_SHEET);
        else if (gun) this.drawCiwsGun(base, pad.x, pad.y, pad.w, 0.55, facing, undefined, gun.sheet, gun.cols - 1, gun.cols);
        this.drawMountArc(type, site.x, site.y, facing, elev, 0.8);
      }
      ctx.strokeStyle = top;
      ctx.lineWidth = 2;
      if (corners) {
        this.groundPath(corners, elev);
        ctx.stroke();
      } else this.strokeGroundRect(x, y, bw, bh, elev);
      return;
    }
    if (corners) {
      // Art still loading: the turned ground alone.
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = top;
      this.groundPath(corners, elev);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = top;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
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

  private paintBridge(look: BridgeLook, opts: { ruined?: boolean; hurt?: number; alpha?: number; ghost?: boolean; bad?: boolean; seed: number }): void {
    drawBrick(this.ctx, {
      type: look.type,
      span: look.span,
      width: look.width,
      ...look.layout,
      project: (wx, wy, elev) => this.toScreen(wx, wy, elev),
      ground: (wx, wy) => this.groundAt(wx, wy),
      wet: (wx, wy) => this.wetAt(wx, wy),
      ...opts,
    });
  }

  private drawBridgeEnt(e: EntityView, ghost: boolean): void {
    const look = this.bridgeLook(e);
    if (!look || !isBridge(e.type)) return;
    const hurt = e.hpMax > 0 ? Math.max(0, 1 - e.hp / e.hpMax) : 0;
    this.paintBridge(look, { ruined: e.ruined, hurt, alpha: ghost ? 0.7 : 1, seed: e.id });
    if (ghost) return;
    const elev = e.ruined ? this.groundAt(e.x, e.y) : this.brickMidElev(look);
    const mid = this.toScreen(e.x, e.y, elev);
    if (this.selected.has(e.id)) {
      const pts = fieldFrameCorners(e.x, e.y, e.facing + Math.PI / 2, look.span.length, look.width, 4).map((p) =>
        this.toScreen(p.x, p.y, elev),
      );
      drawSelectFrame(this.ctx, pts, { hostile: false, now: performance.now() });
    }
    if (!e.ruined) this.maybeHp(e, mid.x - 16, mid.y - 10, 32);
  }

  /** The bricks your engineer is on his way to lay, or laying, as ghosts; the one at work shows its progress. */
  private collectBridgeSites(items: DrawItem[]): void {
    for (const e of this.curr.entities) {
      const site = e.bridgeSite;
      if (!site || e.garrisonedIn || e.ownerId !== this.curr.youPlayerId) continue;
      const spans: BridgeSpan[] = [site, ...(site.queue ?? [])].map((q) => ({ x: q.x, y: q.y, facing: q.facing, length: site.span }));
      const looks = this.ghostLooks(site.bridge, spans);
      looks.forEach((look, i) => {
        if (i === 0) return;
        items.push({
          layer: BRIDGE_DRAW_LAYER,
          z: isoDepth(look.span.x, look.span.y),
          run: () => this.paintBridge(look, { ghost: true, alpha: 0.35, seed: e.id * 31 + i }),
        });
      });
      const look = looks[0];
      if (!look) continue;
      items.push({
        layer: BRIDGE_DRAW_LAYER,
        z: isoDepth(site.x, site.y),
        run: () => {
          this.paintBridge(look, { ghost: true, alpha: 0.6, seed: e.id });
          if (site.progress == null) return;
          const c = this.toScreen(site.x, site.y, this.brickMidElev(look));
          const ctx = this.ctx;
          ctx.fillStyle = "rgba(12,16,8,0.75)";
          ctx.fillRect(c.x - 21, c.y - 15, 42, 5);
          ctx.fillStyle = "#e8b84a";
          ctx.fillRect(c.x - 20, c.y - 14, 40 * site.progress, 3);
        },
      });
    }
  }

  /**
   * The bricks the drawn line would lay, green where the ground takes them and red where
   * it does not, with the price of the good ones. Drawn like a wall line: the pinned legs
   * plus a live one to the cursor; a lone point is one brick the wheel turns.
   */
  private drawBridgeGhost(type: BridgeType): void {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.fieldShownAt) / 1000));
    this.fieldShownAt = now;
    let d = this.fieldFacing - this.fieldShown;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.fieldShown += d * Math.min(1, dt * 16);
    const w = this.screenToWorld(this.mouseX, this.mouseY);
    const pts = fieldPointsWithCursor(this.fieldPath, this.fieldDrag, w);
    const plan = previewBridge(this.curr, type, pts, this.fieldShown);
    if (plan.length === 0) return;
    const looks = this.ghostLooks(
      type,
      plan.map((b) => b.span),
    );
    const order = looks.map((_, i) => i).sort((a, b) => isoDepth(looks[a]!.span.x, looks[a]!.span.y) - isoDepth(looks[b]!.span.x, looks[b]!.span.y));
    for (const i of order) this.paintBridge(looks[i]!, { ghost: true, bad: plan[i]!.problem !== null, alpha: 0.85, seed: i + 1 });
    const good = plan.filter((b) => b.problem === null).length;
    const last = looks[looks.length - 1]!;
    const at = this.toScreen(last.span.x, last.span.y, this.brickMidElev(last));
    if (good > 0) {
      const cost = bridgeCost(type) * good;
      const afford = (this.curr.you?.scrap ?? 0) >= cost;
      const label = `${catalog(type).name} · ${good} brick${good === 1 ? "" : "s"} · ${cost}`;
      this.ghostLabel(at.x, at.y + 18, label, afford ? "#e8b84a" : "#ff5a4a");
      if (this.fieldPath.length === 0) this.ghostLabel(at.x, at.y + 31, "Click a start, then each corner · Enter lays it", "#e8dcc4");
    } else {
      this.ghostLabel(at.x, at.y + 18, plan[0]!.problem ?? "Cannot place there.", "#ff5a4a");
    }
  }

  private ghostLabel(x: number, y: number, text: string, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8,10,6,0.85)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawField(e: EntityView, ghost: boolean): void {
    const span = fieldSpan(e.type);
    if (!ghost && span && this.selected.has(e.id)) {
      const elev = this.elevAt(e.x, e.y);
      const pts = fieldFrameCorners(e.x, e.y, e.facing, span.length, span.thick, 5).map((p) => this.toScreen(p.x, p.y, elev));
      drawSelectFrame(this.ctx, pts, { hostile: this.hostileEntity(e), now: performance.now() });
    }
    const veiled = (draw: () => void): void => this.drawFieldVeiled(e, span, draw);
    if (isConcreteLine(e.type)) {
      const type = e.type;
      const hurt = e.hpMax > 0 ? Math.max(0, 1 - e.hp / e.hpMax) : 0;
      const manned = !ghost && type === "greatwall" && (e.garrison?.count ?? 0) > 0;
      const holder = manned ? this.curr.players.find((pl) => pl.playerId === e.garrison?.ownerId) : undefined;
      veiled(() =>
        this.drawConcrete(type, e.x, e.y, e.facing, {
          hurt,
          alpha: ghost ? 0.45 : 1,
          seed: e.id * 2654435761,
          manned,
          bandColor: holder ? colorHex(holder.colorId) : undefined,
          gate: ghost ? undefined : e.gate,
          crest: ghost ? undefined : e.wallCrest,
        }),
      );
      if (!ghost) {
        const s = this.toScreen(e.x, e.y, this.elevAt(e.x, e.y));
        const w = Math.max(22, this.groundSpan(e.x, e.y, span?.length ?? 24));
        const lift = type === "greatwall" ? 44 : 18;
        this.maybeHp(e, s.x - w / 2, s.y - lift, w);
        if (type === "greatwall") this.drawGarrisonBars(e, s.x - 9, s.y - lift - 8);
        if (e.gate?.locked) this.drawPadlock(s.x, s.y - lift - 14);
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
            } else if (isConcreteLine(site.structure)) {
              this.drawConcrete(site.structure, site.x, site.y, site.facing, { alpha: FIELD_SITE_ALPHA, seed: 7 }, e.fieldSites);
            } else if (site.structure === "trench") {
              this.drawTrenchPit(site.x, site.y, site.facing, { alpha: FIELD_SITE_ALPHA, seed: 7 });
            } else {
              this.drawSandbagWall(site.x, site.y, site.facing, { alpha: FIELD_SITE_ALPHA, seed: 7 }, e.fieldSites);
            }
          },
        });
      }
    }
  }

  /**
   * The Smelter or Marine Base an engineer is set to raise, drawn as a see-through building on its
   * footprint like a Wall site, until the real one stands. Only his owner's snapshot carries it.
   */
  private collectBuildSites(items: DrawItem[]): void {
    const ts = this.ts();
    for (const e of this.curr.entities) {
      const site = e.buildSite;
      if (!site || e.garrisonedIn || e.ownerId !== this.curr.youPlayerId) continue;
      const box = buildingSite(site.building, site.tileX, site.tileY, 0, ts);
      const x = box.tileX * ts;
      const y = box.tileY * ts;
      const bw = box.tileW * ts;
      const bh = box.tileH * ts;
      const foot = axisFootprint(x, y, bw, bh);
      items.push({
        layer: STANDING_DRAW_LAYER,
        z: isoDepth(foot.cx, foot.cy),
        foot,
        run: () => {
          const elev = this.buildingElev(box);
          const spr = buildingSpriteFor(site.building, box.facing);
          const ctx = this.ctx;
          ctx.save();
          ctx.globalAlpha = FIELD_SITE_ALPHA;
          if (spr && spriteReady(spr)) {
            const south = this.toScreen(x + bw, y + bh, elev);
            const east = this.toScreen(x + bw, y, elev);
            const west = this.toScreen(x, y + bh, elev);
            const ground = buildingGroundFor(site.building, box.facing);
            if (ground && spriteReady(ground)) drawBuildingSprite(ctx, ground, south.x, south.y, east.x - west.x);
            drawBuildingSprite(ctx, spr, south.x, south.y, east.x - west.x);
          } else {
            this.drawIsoBox(x, y, bw, bh, this.extrude(site.building), this.ownerColor(e), {
              alpha: FIELD_SITE_ALPHA,
              stroke: "#2a2018",
              strokeW: 1.5,
              elev,
            });
          }
          ctx.restore();
        },
      });
    }
  }

  /** A locked gate: a padlock over it, so the shut boom is never read as one about to lift. */
  private drawPadlock(sx: number, sy: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(20, 16, 12, 0.9)";
    ctx.fillStyle = "#e8b84a";
    ctx.beginPath();
    ctx.rect(sx - 5, sy - 1, 10, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy - 2, 3.4, Math.PI, 0);
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(20, 16, 12, 0.9)";
    ctx.beginPath();
    ctx.arc(sx, sy + 3, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawConcrete(
    type: ConcreteLineType,
    x: number,
    y: number,
    facing: number,
    opts: {
      hurt?: number;
      alpha: number;
      seed: number;
      bad?: boolean;
      manned?: boolean;
      bandColor?: string;
      gate?: { open: number; locked: boolean };
      /** Standing section: the crest the sim stamped when the line was raised. */
      crest?: number;
    },
    extras?: readonly { x: number; y: number; facing: number }[],
  ): void {
    const span = fieldSpan(type);
    if (!span) return;
    const style = type === "greatwall" ? LARGE_WALL_STYLE : WALL_STYLE;
    const section: WallSection = { x, y, facing, length: span.length, thick: span.thick, crest: opts.crest };
    const run = this.fieldRun(type, section, extras ?? []);
    // run[0] is this section. The run is cut where its top would tower over the ground.
    const samples = run.map((seg) => {
      const g = this.wallGrounds(seg, span.thick);
      return { peak: Math.max(...g), low: Math.min(...g), crest: seg.crest };
    });
    const tops = wallRunTops(samples, (i, j) => wallSectionsConnect(run[i]!, run[j]!), wallRiseLimit(type));
    const grounds = [tops[0] ?? 0];
    const worldPx = this.groundSpan(x, y, 10) / 10;
    const slabLevels = ISO_ELEVATION > 0 ? (style.slabH * worldPx) / ISO_ELEVATION : 0;
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
      joins: wallJoins(section, run),
      style,
      manned: opts.manned,
      bandColor: opts.bandColor,
      gate: opts.gate,
    });
  }

  /** Ground a sandbag or concrete section shades, pushed along the sun. */
  private fieldShadow(e: EntityView): { x: number; y: number }[] {
    const span = fieldSpan(e.type);
    if (!span) return [];
    const section: WallSection = { x: e.x, y: e.y, facing: e.facing, length: span.length, thick: span.thick };
    const joins = isConcreteLine(e.type) || e.type === "sandbags" ? wallJoins(section, this.fieldRun(e.type, section, [])) : undefined;
    const foot = wallFootprintWorld(section, joins);
    const height =
      e.type === "sandbags" ? courseHeight(span.thick) * 3.1 : wallShadowHeight(e.type === "greatwall" ? LARGE_WALL_STYLE : WALL_STYLE);
    const d = shadowOffset(height);
    return convexHull([...foot, ...foot.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))]);
  }

  /**
   * This section plus every same-type section whose ends meet it, straight on or round a
   * corner, including a line still being sited. Runs of standing sections are cached per
   * snapshot; a ghost or a sited line is joined in on the fly.
   */
  private fieldRun(
    type: FieldStructureType,
    origin: WallSection,
    extras: readonly { x: number; y: number; facing: number }[],
  ): WallSection[] {
    const span = fieldSpan(type);
    if (!span) return [];
    const key = (x: number, y: number) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
    if (extras.length === 0) {
      const cached = this.fieldRuns(type).get(key(origin.x, origin.y));
      if (cached) return cached;
    }
    const all: WallSection[] = [];
    const byKey = new Map<string, WallSection>();
    const add = (x: number, y: number, facing: number, crest?: number) => {
      const k = key(x, y);
      const prev = byKey.get(k);
      if (prev) {
        if (crest != null && (prev.crest == null || crest > prev.crest)) prev.crest = crest;
        return;
      }
      const section: WallSection = { x, y, facing, length: span.length, thick: span.thick, crest };
      byKey.set(k, section);
      all.push(section);
    };
    add(origin.x, origin.y, origin.facing, origin.crest);
    for (const extra of extras) add(extra.x, extra.y, extra.facing);
    for (const e of this.curr.entities) {
      if (e.type === type && e.hp > 0 && !e.ruined) add(e.x, e.y, e.facing, e.wallCrest);
    }
    return connectedRun(all, 0);
  }

  /** Every standing run of this type in the snapshot, keyed by each section's position. */
  private fieldRuns(type: FieldStructureType): Map<string, WallSection[]> {
    if (this.fieldRunCache?.snap !== this.curr) this.fieldRunCache = { snap: this.curr, byType: new Map() };
    const byType = this.fieldRunCache.byType;
    let runs = byType.get(type);
    if (runs) return runs;
    runs = new Map();
    const span = fieldSpan(type);
    if (!span) return runs;
    const key = (x: number, y: number) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
    const all: WallSection[] = [];
    for (const e of this.curr.entities) {
      if (e.type === type && e.hp > 0 && !e.ruined) {
        all.push({ x: e.x, y: e.y, facing: e.facing, length: span.length, thick: span.thick, crest: e.wallCrest });
      }
    }
    const done = new Set<number>();
    for (let i = 0; i < all.length; i++) {
      if (done.has(i)) continue;
      const group = connectedRun(all, i);
      for (const g of group) {
        runs.set(key(g.x, g.y), group);
        const idx = all.indexOf(g);
        if (idx >= 0) done.add(idx);
      }
    }
    byType.set(type, runs);
    return runs;
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
    extras?: readonly { x: number; y: number; facing: number }[],
  ): void {
    const span = fieldSpan("sandbags");
    if (!span) return;
    const elev = this.elevAt(x, y);
    const lift = this.groundSpan(x, y, 10) / 10;
    const section: WallSection = { x, y, facing, length: span.length, thick: span.thick };
    const joins = opts.ruined ? undefined : wallJoins(section, this.fieldRun("sandbags", section, extras ?? []));
    drawSandbags(this.ctx, {
      joins,
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

  /**
   * The facing of whatever ghost the wheel turns right now, or null when the wheel zooms:
   * an engineer's field piece, a Defences-tab sandbag or wall line, or a ready Bunker,
   * Watch Tower, or Airfield. The gate takes its walls' facing, so it does not turn.
   */
  private turnableGhostFacing(): number | null {
    if (this.fieldPlace || this.bridgePlace) return this.fieldFacing;
    const yard = this.readyYardField();
    if (yard && yard !== "gate") return this.fieldFacing;
    const building = this.placeMode ? this.readyBuilding() : null;
    if (building && isRotatableBuilding(building)) return this.placeFacing();
    return null;
  }

  /** A tag beside the cursor while placing something the wheel turns: the hint and the current heading. */
  private drawRotateHint(): void {
    if (this.mouseX < 0 || this.overControl || this.box) return;
    const facing = this.turnableGhostFacing();
    if (facing == null) return;
    const deg = Math.round((((facing * 180) / Math.PI) % 360) + 360) % 360;
    const label = "Scroll to rotate";
    const angle = `${deg}°`;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const icon = 14;
    const gap = 6;
    const padX = 7;
    const labelW = ctx.measureText(label).width;
    const angleW = ctx.measureText(angle).width;
    const w = padX + icon + gap + labelW + gap * 1.5 + angleW + padX;
    const h = 22;
    // Below and right of the pointer, kept on the canvas.
    const view = this.viewSize();
    let x = this.mouseX + 18;
    let y = this.mouseY + 22;
    if (x + w > view.w - 4) x = this.mouseX - 18 - w;
    if (y + h > view.h - 4) y = this.mouseY - 22 - h;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(20, 14, 10, 0.86)";
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, w, h, 4);
    ctx.fill();
    ctx.stroke();
    // A turning arrow: most of a circle and its head.
    const cx = x + padX + icon / 2;
    const cy = y + h / 2 + 0.5;
    const r = icon / 2 - 1.5;
    const a0 = -Math.PI * 0.35;
    const a1 = a0 + Math.PI * 1.55;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
    const hx = cx + Math.cos(a1) * r;
    const hy = cy + Math.sin(a1) * r;
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    ctx.fillStyle = "#e8b84a";
    ctx.beginPath();
    ctx.moveTo(hx + tx * 3.6, hy + ty * 3.6);
    ctx.lineTo(hx - ty * 3, hy + tx * 3);
    ctx.lineTo(hx + ty * 3, hy - tx * 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8dcc4";
    const tx0 = x + padX + icon + gap;
    ctx.fillText(label, tx0, cy);
    ctx.fillStyle = "#e8b84a";
    ctx.fillText(angle, tx0 + labelW + gap * 1.5, cy);
    ctx.restore();
  }

  /** One wheel notch turns a Bunker, Watch Tower, or Airfield ghost 15°, like a wall. Trackpad pixels add up to a notch first. */
  private rotatePlace(deltaY: number, deltaMode: number): void {
    const steps = Math.round((2 * Math.PI) / BUILDING_TURN_STEP);
    this.placeTurn += deltaMode === 1 ? deltaY / 3 : deltaMode === 2 ? deltaY : deltaY / 100;
    while (this.placeTurn >= 1) {
      this.placeStep = (this.placeStep + 1) % steps;
      this.placeTurn -= 1;
    }
    while (this.placeTurn <= -1) {
      this.placeStep = (this.placeStep + steps - 1) % steps;
      this.placeTurn += 1;
    }
  }

  /** World radians the turned ghost faces. */
  private placeFacing(): number {
    return this.placeStep * BUILDING_TURN_STEP;
  }

  /**
   * Where a click at (px, py) would put this building. A rotatable one is centred on the
   * tile under the cursor so it turns in place; the rest hang their top-left tile there.
   */
  private placeSite(type: BuildingType, px: number, py: number): { tx: number; ty: number; facing: number } {
    const tile = this.screenToTile(px, py);
    if (!isRotatableBuilding(type)) return { tx: tile.x, ty: tile.y, facing: 0 };
    const facing = this.placeFacing();
    const box = turnedBox(type, facing);
    return { tx: tile.x - Math.floor(box.w / 2), ty: tile.y - Math.floor(box.h / 2), facing };
  }

  /** A ground polygon of world points at `elev`, as a closed path. */
  private groundPath(pts: readonly { x: number; y: number }[], elev: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = this.toScreen(p.x, p.y, elev);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
  }

  /**
   * For a turned building, the south corner and screen width of the pad it would have
   * unturned on the same centre. Roof furniture drawn over the art (the searchlight) is
   * laid out on that pad. Null for an unturned building: its own box is that pad.
   */
  private unturnedPad(
    e: { type: EntityType; x: number; y: number; facing: number },
    elev: number,
  ): { x: number; y: number; w: number } | null {
    if (!isTurnedBuilding(e)) return null;
    const ts = this.ts();
    const def = catalog(e.type);
    const hw = (def.tileW * ts) / 2;
    const hh = (def.tileH * ts) / 2;
    const south = this.toScreen(e.x + hw, e.y + hh, elev);
    const east = this.toScreen(e.x + hw, e.y - hh, elev);
    const west = this.toScreen(e.x - hw, e.y + hh, elev);
    return { x: south.x, y: south.y, w: east.x - west.x };
  }

  /** Ground corners of a turned building, `pad` world px out from its walls. */
  private turnedCorners(e: EntityView, pad = 0): { x: number; y: number }[] {
    return rectCorners(buildingRect(e, this.ts()), pad);
  }

  /** One wheel notch turns the ghost 15°. Trackpads scroll in pixels, so they turn by fractions. */
  private rotateField(deltaY: number, deltaMode: number): void {
    const notches = deltaMode === 1 ? deltaY / 3 : deltaMode === 2 ? deltaY : deltaY / 100;
    this.fieldFacing += notches * (Math.PI / 12);
  }

  /** Every piece the drawing describes: the pinned legs plus the live one to the cursor. */
  private fieldPieces(type: FieldStructureType, shown: boolean): { x: number; y: number; facing: number }[] {
    const w = this.screenToWorld(this.mouseX, this.mouseY);
    const pts = fieldPointsWithCursor(this.fieldPath, this.fieldDrag, w);
    const pieces = fieldPath(type, pts, this.fieldFacing);
    if (shown && pts.length === 1 && pieces[0]) pieces[0].facing = this.fieldShown;
    return pieces;
  }

  /** How many of those pieces are already pinned. The rest follow the cursor. */
  private fieldPinnedCount(type: FieldStructureType): number {
    if (this.fieldPath.length < 2) return 0;
    return fieldPath(type, this.fieldPath, this.fieldFacing).length;
  }

  private drawFieldGhost(type: FieldStructureType, fromBase: boolean): void {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.fieldShownAt) / 1000));
    this.fieldShownAt = now;
    let d = this.fieldFacing - this.fieldShown;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.fieldShown += d * Math.min(1, dt * 16);
    const pieces = this.fieldPieces(type, true);
    const pinned = this.fieldPinnedCount(type);
    const each = catalog(type).cost;
    const affordAll = this.curr.you.scrap >= each * pieces.length;
    let accepted = 0;
    let open = true;
    const sorted = pieces
      .map((p, i) => ({ p, i, depth: isoDepth(p.x, p.y) }))
      .sort((a, b) => a.depth - b.depth);
    const okOf: boolean[] = [];
    for (const { p, i } of pieces.map((p, i) => ({ p, i }))) {
      const clear = previewField(this.curr, type, p.x, p.y, p.facing);
      const near = !fromBase || (isYardField(type) && previewYardField(this.curr, type, p.x, p.y, p.facing));
      const ok = fromBase ? open && clear && near : clear && affordAll;
      if (fromBase && !ok) open = false;
      if (ok) accepted++;
      okOf[i] = ok;
    }
    for (const { p, i } of sorted) {
      const ok = okOf[i] ?? false;
      // Pinned legs sit solid; the live leg to the cursor is lighter until it is pinned too.
      const alpha = i < pinned ? (ok ? 0.88 : 0.55) : ok ? 0.68 : 0.42;
      if (type === "teeth") {
        this.drawTeeth(p.x, p.y, p.facing, alpha, 0);
        if (!ok) this.strokeFieldFoot(type, p, "#ff5a4a");
      } else if (isConcreteLine(type)) {
        this.drawConcrete(type, p.x, p.y, p.facing, { alpha, seed: 7, bad: !ok }, pieces);
      } else if (type === "trench") {
        this.drawTrenchPit(p.x, p.y, p.facing, { alpha, seed: 7, bad: !ok });
      } else {
        this.drawSandbagWall(p.x, p.y, p.facing, { alpha, seed: 7, bad: !ok }, pieces);
      }
    }
    const ctx = this.ctx;
    if (pinned > 0 && pinned < pieces.length) {
      // Where the live leg starts: the end of the last pinned piece.
      const first = pieces[pinned]!;
      const next = pieces[pinned + 1] ?? this.screenToWorld(this.mouseX, this.mouseY);
      const ux = -Math.sin(first.facing);
      const uy = Math.cos(first.facing);
      const sign = (next.x - first.x) * ux + (next.y - first.y) * uy >= 0 ? 1 : -1;
      const half = (fieldSpan(type)?.length ?? 24) / 2;
      const anchor = this.toScreen(first.x - ux * sign * half, first.y - uy * sign * half);
      ctx.save();
      ctx.strokeStyle = "#e8b84a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y - 6);
      ctx.lineTo(anchor.x + 9, anchor.y);
      ctx.lineTo(anchor.x, anchor.y + 6);
      ctx.lineTo(anchor.x - 9, anchor.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    if (pieces.length < 2 && this.fieldPath.length === 0) return;
    const last = pieces[pieces.length - 1]!;
    const s = this.toScreen(last.x, last.y);
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
    if (this.fieldPath.length > 0) {
      ctx.font = "10px 'Share Tech Mono', monospace";
      ctx.fillStyle = "#e8dcc4";
      const hint = "Enter / Confirm placement to build · click adds a leg · right-click takes one back";
      ctx.strokeText(hint, s.x + 14, s.y + 2);
      ctx.fillText(hint, s.x + 14, s.y + 2);
    }
    ctx.restore();
  }

  /** The armed gate snaps over the two own wall sections nearest the pointer; off a pair it says what it wants. */
  private drawGateGhost(): void {
    const w = this.screenToWorld(this.mouseX, this.mouseY);
    const site = gateSiteAt(this.curr.entities, this.curr.youPlayerId, w.x, w.y);
    const cost = catalog("gate").cost;
    const afford = this.curr.you.scrap >= cost;
    if (site) {
      this.drawConcrete("gate", site.x, site.y, site.facing, { alpha: 0.8, seed: 7, bad: !afford, gate: { open: 0, locked: false } });
    }
    const s = this.toScreen(w.x, w.y);
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.fillStyle = site && afford ? "#e8b84a" : "#ff5a4a";
    const label = site ? `Gate ${cost}` : "Point at two of your wall sections side by side";
    ctx.strokeText(label, s.x + 14, s.y - 14);
    ctx.fillText(label, s.x + 14, s.y - 14);
    ctx.restore();
  }

  /** The line sited from the Defences tab, drawn until the yard finishes it. */
  private drawYardBuild(): void {
    const q = this.curr.you.lineQueue;
    if (!q?.sites || q.sites.length === 0 || !isYardField(q.type)) return;
    for (const s of q.sites) {
      if (q.type === "gate") {
        // Over the walls it replaces: the gate as it will stand, boom down.
        this.drawConcrete("gate", s.x, s.y, s.facing, { alpha: 0.55, seed: 3, gate: { open: 0, locked: false } });
      } else if (isConcreteLine(q.type)) {
        this.drawConcrete(q.type, s.x, s.y, s.facing, { alpha: 0.55, seed: 3 }, q.sites);
      } else {
        this.drawSandbagWall(s.x, s.y, s.facing, { alpha: 0.55, seed: 3 }, q.sites);
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
    this.mini.classList.toggle("radar-off", !this.curr.you.radar);
    if (!this.curr.you.radar) {
      drawRadarOffline(ctx, w, h, performance.now());
      return;
    }
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
      if (e.garrisonedIn || (e.kind === "building" && !this.knownRect(e))) continue;
      ctx.fillStyle = e.wreck ? "#6a6860" : this.ownerColor(e);
      const tx = e.kind === "building" ? e.tileX + e.tileW / 2 : e.x / ts;
      const ty = e.kind === "building" ? e.tileY + e.tileH / 2 : e.y / ts;
      const sz = e.kind === "building" ? 4 : 3;
      ctx.fillRect(tx * scale - sz / 2, ty * scale - sz / 2, sz, sz);
    }
    // Aircraft the dish hears and nobody sees: a blinking contact, no sprite on the field.
    const now = performance.now();
    for (const c of this.curr.radar ?? []) {
      if (!radarContactLit(now, c.id)) continue;
      drawRadarContact(ctx, (c.x / ts) * scale, (c.y / ts) * scale);
    }
    // Submarines the sonar hears: a green contact on the same blink.
    for (const c of this.curr.sonar ?? []) {
      if (!radarContactLit(now, c.id)) continue;
      ctx.fillStyle = "rgba(110, 230, 190, 0.3)";
      ctx.fillRect((c.x / ts) * scale - 4, (c.y / ts) * scale - 4, 8, 8);
      ctx.fillStyle = "#6ee6be";
      ctx.fillRect((c.x / ts) * scale - 2, (c.y / ts) * scale - 2, 4, 4);
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

/** A torpedo that went off against a hull, not in open water or ashore. */
function torpedoStruckHull(kind: string): boolean {
  return kind === "hit" || kind === "pen" || kind === "kill" || kind === "glance" || kind === "ricochet";
}

/** A heavy round in water: the spray column, sized like the ground burst of the same round. Bullets keep their small splash. */
function waterBurst(f: {
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
  if (!f.splash || f.intercept || (f.rocket && f.z != null)) return undefined;
  if (f.mortar || f.rocket || isShellCaliber(f.caliber)) return burstSpec(f);
  return undefined;
}
