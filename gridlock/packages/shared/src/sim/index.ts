export { createMatch, step, stepMatch } from "./match.js";
export { SAVE_VERSION, applySaveSeats, exportSave, restoreMatch } from "./save.js";
export type { RestoredMatch, SaveGame, SaveResult, SaveSeat } from "./save.js";
export { tickAi, findBuildTile, findSmelterTile } from "./ai.js";
export { tickCollision, moveWithCollision } from "./collision.js";
export { toWreck } from "./wreck.js";
export { toRubble } from "./rubble.js";
export { shipMountPoint } from "./battleship.js";
export { fireStats, hullTurnMul, immobilized, moveSpeedMul, rollCrits, rollLamp } from "./crits.js";
export { commandedStance, effectiveStance, tickStance } from "./stance.js";
export { applyCommand } from "./commands.js";
export { snapshotFor } from "./snapshot.js";
export { burnVariant } from "./remains.js";
export { previewBridge, previewConstruct, previewField, previewPlace, previewSite, previewYardField } from "./preview.js";
export { earnScrap, scrapCap, smelterCount, smelterIncome, smelterOnScrap, smelterRateOn, smelterCrowded, smelterScrapNeeded, smelterSiteOk } from "./smelter.js";
export { pathToWorld, astar } from "./path.js";
export { PATROL_POINTS_MAX, connectPatrolPoints } from "./patrol.js";
export type { MatchState } from "./types.js";
export {
  hasCore,
  hqOf,
  walkable,
  worldToTile,
  tileCenter,
  buildingBounds,
  buildingContains,
  adjacentToBuilding,
  unitContains,
  isWater,
  isTree,
  isSingleTree,
  fellTreeAt,
  burnTreeAt,
  crushTreeAt,
  unitInWater,
} from "./geo.js";
export {
  canGarrison,
  livingGarrison,
  garrisonOwner,
  garrisonIsHostile,
  garrisonLooksOccupied,
  garrisonIsHiding,
  occupantSightTiles,
  garrisonBars,
  woundGarrison,
  pickGarrisonMuzzle,
  garrisonWindowLift,
  garrisonWindows,
  largeWallSlit,
  LARGE_WALL_SLIT_LIFT_PX,
} from "./garrison.js";
export { wantsCapture, captureDurationSec } from "./capture.js";
export { powerOf, productionSpeed, tickPower } from "./power.js";
export { radarContacts, radarOnline, radarStations } from "./radar.js";
export { producerType } from "./train.js";
export {
  airfieldFrame,
  airfieldPadWorld,
  airfieldRunway,
  isAirborne,
  PARK_HEADING,
  parkHeading,
  reachesAircraft,
  RUNWAY_HEADING,
  runwayLocal,
  runwayPoint,
  type AirfieldRunway,
} from "./air.js";
export { droneIsHigh, droneModeAlt } from "./drone.js";
export { jetAloft, reachesJet, takeoffBlocked } from "./jet.js";
export { mortarAirZ, mortarArcPoints } from "./mortar.js";
export type { MortarArcPoint } from "./mortar.js";
export {
  visionMask,
  visionMaskFromSnapshot,
  encodeVisionRuns,
  decodeVisionRuns,
  coverTerrainFromSnapshot,
  tileOnMask,
  entityOnMask,
  canSeeEntity,
  sightLightAt,
} from "./vision.js";
export type { SightLight } from "./vision.js";
export {
  inSmokeCloud,
  tileInSmoke,
  cloudsCoverTile,
  fillSmokeMask,
  spawnSmokeCloud,
  cloudScale,
  smokeCloudPuffs,
} from "./smoke.js";
export type { SmokePuff } from "./smoke.js";
export {
  tileHeight,
  entityHeight,
  muzzleHeight,
  aimHeight,
  shotClearsCover,
  sightTilesOf,
  sightTilesForEntity,
  observerEyeForEntity,
  uphillSightForEntity,
  observerEyeOf,
  rangeTilesOf,
  weaponRangeWorld,
  gunCanElevate,
  canAimWeapon,
  hasTerrainLos,
  slopeSpeedMul,
  vertexElev,
  hasFullLos,
  coverSmokeAt,
} from "./elevation.js";
export { canScout, setScoutOut, hideScout, woundScout } from "./scout.js";
export {
  DAY_CYCLE_SECONDS,
  CLOCK_OPEN_HOUR,
  daylightAt,
  matchClock,
  phaseStartText,
  clockMarkLine,
  nightSightMul,
  nightTiles,
  spotlightsOn,
  hasSpotlight,
  hasHeadlight,
  headlightLit,
  hullLamps,
  spotlightManned,
  spotlightLit,
  spotFacingOf,
} from "./night.js";
export type { DayPhase, HullLamp, MatchClock } from "./night.js";
export {
  FIELD_TURN_MAX,
  fieldCornerStart,
  fieldLine,
  fieldPath,
  fieldSiteClear,
  fieldTurn,
  gateOpen,
  gateSiteAt,
  sandbagCoverBonus,
  wallAxes,
  wallRiseLimit,
  wallRunTops,
} from "./field.js";
export { bridgeBrickProblemFor, bridgeSpanOf, bridgeTilesOf, restampBridges } from "./bridge.js";
export type { GateSite, WallTopSample } from "./field.js";
