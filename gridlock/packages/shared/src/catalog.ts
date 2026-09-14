/** All M2 pace knobs. Do not scatter magic numbers. */

export const TICK_HZ = 10;
export const TICK_DT = 1 / TICK_HZ;
export const TICK_MS = 100;
export const GAME_SPEED_MIN = 1;
export const GAME_SPEED_MAX = 5;
export const GAME_SPEED_DEFAULT = GAME_SPEED_MAX;
/** Wall-clock delay before each Rig auto-unpacks into a Core. */
export const AUTO_DEPLOY_SECONDS = 0.5;
export const START_SCRAP = 2200;
export const BUILD_RADIUS = 8;
export const UNIT_CAP = 60;
/** Max train jobs waiting or in progress on one producer. */
export const TRAIN_QUEUE_CAP = 9;
export const DEPLOY_SECONDS = 3;
export const SELL_REFUND = 0.5;
export const SCRAP_TILE_YIELD = 800;
export const SCRAP_MID_YIELD = 1000;
export const HAULER_CARGO = 400;
export const HAULER_HARVEST_SECONDS = 2;
export const HAULER_UNLOAD_SECONDS = 1.2;
export const LOW_POWER_MIN_SPEED = 0.25;
export const FACE_FIRE_DEG = 8;
/** How close a turn-in-place unit must be to its heading before it rolls. */
export const FACE_MOVE_DEG = 12;
export const PROJECTILE_RADIUS = 3;
export const HP_BAR_SECONDS = 2;
/** Extra world pixels between unit reserved radii on a group move. */
export const UNIT_SPACE_PAD = 2;
/** Peak discrete elevation. 0 is the floor. */
export const HEIGHT_MAX = 3;
/** Adjacent walkable tiles may differ by at most this many levels. */
export const HEIGHT_STEP_MAX = 1;
/** Move-speed multiplier per level climbed. */
export const HEIGHT_UPHILL_SPEED = 0.55;
/** Move-speed multiplier per level descended. */
export const HEIGHT_DOWNHILL_SPEED = 1.12;
/** A* step-cost multiplier per level climbed. */
export const HEIGHT_UPHILL_COST = 1.7;
/** A* step-cost multiplier per level descended. */
export const HEIGHT_DOWNHILL_COST = 0.9;
/** Extra Chebyshev sight tiles per elevation. */
export const HEIGHT_SIGHT_BONUS = 2;
/** Extra weapon-range tiles per elevation. */
export const HEIGHT_RANGE_BONUS = 1;

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
/** Floor for every special. Individual actions may be longer. */
export const SPECIAL_COOLDOWN_MIN = 2;
export const SPECIAL_COOLDOWN: Record<SpecialAction, number> = {
  deploy: 2,
};

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
  /** mm-equivalent. 0 = unarmored. */
  armorFront: number;
  armorSide: number;
  armorRear: number;
  /** AP of the gun vs effective armor at the impact face. */
  penetration: number;
  /** Shell diameter. Small calibers chip; large ones overmatch. */
  caliber: number;
  /** Aim cone in degrees at max range. 0 = laser. */
  spreadDeg: number;
  /** Hull must face the waypoint before translating. */
  turnInPlace?: boolean;
  special?: SpecialAction;
}

const UNARMED = {
  armorFront: 0,
  armorSide: 0,
  armorRear: 0,
  penetration: 0,
  caliber: 0,
  spreadDeg: 0,
} as const;

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
    ...UNARMED,
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
    ...UNARMED,
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
    ...UNARMED,
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
    ...UNARMED,
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
    ...UNARMED,
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
    ...UNARMED,
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
    ...UNARMED,
    penetration: 6,
    caliber: 8,
    spreadDeg: 2,
  },
  hauler: {
    type: "hauler",
    kind: "unit",
    name: "Mauler",
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
    ...UNARMED,
  },
  warden: {
    type: "warden",
    kind: "unit",
    name: "Warden",
    letter: "W",
    cost: 250,
    buildSeconds: 12,
    hp: 120,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: 1.45,
    turnDegPerSec: 85,
    rangeTiles: 9,
    sightTiles: 8,
    cooldown: 1.6,
    damage: 55,
    projectileSpeed: 5200,
    turnInPlace: true,
    armorFront: 80,
    armorSide: 32,
    armorRear: 16,
    penetration: 100,
    caliber: 75,
    spreadDeg: 3,
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

export function isArmoredType(type: EntityType): boolean {
  const d = catalog(type);
  return d.armorFront > 0 || d.armorSide > 0 || d.armorRear > 0;
}

export function armorLabel(type: EntityType): string | null {
  if (!isArmoredType(type)) return null;
  const d = catalog(type);
  return `F${d.armorFront} / S${d.armorSide} / R${d.armorRear}`;
}

export function specialOf(type: EntityType): SpecialAction | undefined {
  return catalog(type).special;
}

export function specialCooldownOf(action: SpecialAction): number {
  return Math.max(SPECIAL_COOLDOWN_MIN, SPECIAL_COOLDOWN[action]);
}

export function specialReady(type: EntityType, state: string, cooldownSec = 0): boolean {
  return !!specialOf(type) && state !== "deploy" && state !== "undeploy" && cooldownSec <= 0;
}

export function specialLabel(type: EntityType): string | null {
  if (!specialOf(type)) return null;
  return type === "core" ? "Pack" : "Deploy";
}

export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_HZ));
}

export function clampGameSpeed(n: number): number {
  if (!Number.isFinite(n)) return GAME_SPEED_MIN;
  return Math.max(GAME_SPEED_MIN, Math.min(GAME_SPEED_MAX, Math.round(n)));
}

/** + / − nudge. Integer steps, clamped to 1–5×. */
export function nudgeGameSpeed(current: number, delta: number): number {
  const dir = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  return clampGameSpeed(clampGameSpeed(current) + dir);
}
