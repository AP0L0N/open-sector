/** All M2 pace knobs. Do not scatter magic numbers. */

export const TICK_HZ = 10;
export const TICK_DT = 1 / TICK_HZ;
export const TICK_MS = 100;
export const START_SCRAP = 2200;
export const BUILD_RADIUS = 8;
export const UNIT_CAP = 60;
export const DEPLOY_SECONDS = 3;
export const SELL_REFUND = 0.5;
export const SCRAP_TILE_YIELD = 800;
export const SCRAP_MID_YIELD = 1000;
export const HAULER_CARGO = 400;
export const HAULER_HARVEST_SECONDS = 2;
export const HAULER_UNLOAD_SECONDS = 1.2;
export const LOW_POWER_MIN_SPEED = 0.25;
export const FACE_FIRE_DEG = 8;
export const PROJECTILE_RADIUS = 3;
export const HP_BAR_SECONDS = 2;

export type EntityType =
  | "rig"
  | "trooper"
  | "hauler"
  | "warden"
  | "core"
  | "dynamo"
  | "smelter"
  | "muster"
  | "armory";
export type BuildingType = "dynamo" | "smelter" | "muster" | "armory";
export type TrainType = "trooper" | "hauler" | "warden";
export type EntityKind = "unit" | "building";
/** Optional unit/building ability. */
export type SpecialAction = "deploy";

export const BUILDING_TYPES: readonly BuildingType[] = ["dynamo", "smelter", "muster", "armory"];
export const TRAIN_TYPES: readonly TrainType[] = ["trooper", "hauler", "warden"];

export interface CatalogEntry {
  type: EntityType;
  kind: EntityKind;
  name: string;
  letter: string;
  cost: number;
  buildSeconds: number;
  hp: number;
  power: number;
  tileW: number;
  tileH: number;
  radius: number;
  moveTilesPerSec: number;
  turnDegPerSec: number;
  rangeTiles: number;
  sightTiles: number;
  cooldown: number;
  damage: number;
  projectileSpeed: number;
  special?: SpecialAction;
}

const ENTRIES: Record<EntityType, CatalogEntry> = {
  rig: {
    type: "rig",
    kind: "unit",
    name: "Rig",
    letter: "R",
    cost: 0,
    buildSeconds: 0,
    hp: 800,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 14,
    moveTilesPerSec: 1.3,
    turnDegPerSec: 120,
    rangeTiles: 0,
    sightTiles: 6,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    special: "deploy",
  },
  core: {
    type: "core",
    kind: "building",
    name: "Core",
    letter: "C",
    cost: 0,
    buildSeconds: DEPLOY_SECONDS,
    hp: 2500,
    power: 50,
    tileW: 3,
    tileH: 3,
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 8,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    special: "deploy",
  },
  dynamo: {
    type: "dynamo",
    kind: "building",
    name: "Dynamo",
    letter: "D",
    cost: 500,
    buildSeconds: 12,
    hp: 750,
    power: 100,
    tileW: 2,
    tileH: 2,
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 4,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
  },
  smelter: {
    type: "smelter",
    kind: "building",
    name: "Smelter",
    letter: "S",
    cost: 1600,
    buildSeconds: 24,
    hp: 1200,
    power: -40,
    tileW: 3,
    tileH: 3,
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 5,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
  },
  muster: {
    type: "muster",
    kind: "building",
    name: "Muster",
    letter: "M",
    cost: 500,
    buildSeconds: 16,
    hp: 900,
    power: -20,
    tileW: 2,
    tileH: 2,
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 5,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
  },
  armory: {
    type: "armory",
    kind: "building",
    name: "Armory",
    letter: "A",
    cost: 800,
    buildSeconds: 20,
    hp: 1000,
    power: -30,
    tileW: 2,
    tileH: 2,
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 5,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
  },
  trooper: {
    type: "trooper",
    kind: "unit",
    name: "Trooper",
    letter: "T",
    cost: 100,
    buildSeconds: 8,
    hp: 40,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: 2.2,
    turnDegPerSec: 240,
    rangeTiles: 6,
    sightTiles: 6,
    cooldown: 0.9,
    damage: 12,
    projectileSpeed: 420,
  },
  hauler: {
    type: "hauler",
    kind: "unit",
    name: "Hauler",
    letter: "H",
    cost: 900,
    buildSeconds: 18,
    hp: 220,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: 1.9,
    turnDegPerSec: 140,
    rangeTiles: 0,
    sightTiles: 4,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
  },
  warden: {
    type: "warden",
    kind: "unit",
    name: "Warden",
    letter: "W",
    cost: 250,
    buildSeconds: 12,
    hp: 90,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 8,
    moveTilesPerSec: 1.7,
    turnDegPerSec: 200,
    rangeTiles: 7,
    sightTiles: 7,
    cooldown: 1.1,
    damage: 20,
    projectileSpeed: 480,
  },
};

export function catalog(type: EntityType): CatalogEntry {
  return ENTRIES[type];
}

export function isBuildingType(type: string): type is BuildingType {
  return (BUILDING_TYPES as readonly string[]).includes(type);
}

export function isTrainType(type: string): type is TrainType {
  return (TRAIN_TYPES as readonly string[]).includes(type);
}

export function fires(type: EntityType): boolean {
  return catalog(type).damage > 0;
}

export function specialOf(type: EntityType): SpecialAction | undefined {
  return catalog(type).special;
}

export function specialReady(type: EntityType, state: string): boolean {
  return !!specialOf(type) && state !== "deploy" && state !== "undeploy";
}

export function specialLabel(type: EntityType): string | null {
  if (!specialOf(type)) return null;
  return type === "core" ? "Pack" : "Deploy";
}

export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_HZ));
}
