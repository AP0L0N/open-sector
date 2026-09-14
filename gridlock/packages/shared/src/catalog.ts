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
/**
 * Gameplay tiles per original 32px cell. RA2 / Sudden Strike 2 maps feel
 * dense because the cell is small relative to a hill or a building; 4× turns
 * a 3-terrace rise into a 12-step slope without changing world size.
 */
export const TILE_SUBDIV = 4;
/** World pixels along one gameplay tile. A 64-cell map stays 2048 world-wide. */
export const TILE_SIZE = 32 / TILE_SUBDIV;
const t = (n: number): number => n * TILE_SUBDIV;
export const BUILD_RADIUS = t(8);
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
/** Damaging infantry hit → broken shooting arm. */
export const CRIT_ARM_CHANCE = 0.25;
/** Damaging infantry hit → broken leg. */
export const CRIT_LEG_CHANCE = 0.25;
/** Side-plate hit on a motor vehicle → broken tracks. */
export const CRIT_TRACKS_CHANCE = 0.2;
/** Rear-plate hit on a motor vehicle → broken engine. */
export const CRIT_ENGINE_CHANCE = 0.4;
/** Move-speed multiplier with a broken leg. */
export const CRIT_LEG_SPEED = 0.4;
/** Hull turn-rate multiplier with a dead engine. Turret is unaffected. */
export const CRIT_ENGINE_TURN = 0.2;
/** Extra world pixels between unit reserved radii on a group move. */
export const UNIT_SPACE_PAD = 2;
/** Peak discrete elevation. 0 is the floor. */
export const HEIGHT_MAX = t(3);
/** Adjacent walkable tiles may differ by at most this many levels. */
export const HEIGHT_STEP_MAX = 1;
/** Move-speed multiplier per adjacent-tile climb. TILE_SUBDIV steps ≈ one old terrace. */
export const HEIGHT_UPHILL_SPEED = 0.55 ** (1 / TILE_SUBDIV);
/** Move-speed multiplier per adjacent-tile descent. */
export const HEIGHT_DOWNHILL_SPEED = 1.12 ** (1 / TILE_SUBDIV);
/** A* step-cost multiplier per adjacent-tile climb. */
export const HEIGHT_UPHILL_COST = 1.7 ** (1 / TILE_SUBDIV);
/** A* step-cost multiplier per adjacent-tile descent. */
export const HEIGHT_DOWNHILL_COST = 0.9 ** (1 / TILE_SUBDIV);
/** Extra Chebyshev sight tiles per elevation. World reach matches the old 3-band hills. */
export const HEIGHT_SIGHT_BONUS = 2;
/** Extra weapon-range tiles per elevation. */
export const HEIGHT_RANGE_BONUS = 1;
/** Tree tiles a sight ray may pass before the grove closes. One authoring cell. */
export const TREE_LOS_THROUGH = TILE_SUBDIV;
/** Civilian / unowned map buildings. */
export const NEUTRAL_OWNER = "";

export type EntityType =
  | "rig"
  | "trooper"
  | "hauler"
  | "warden"
  | "core"
  | "dynamo"
  | "smelter"
  | "muster"
  | "armory"
  | "cottage"
  | "house"
  | "manor";
export type BuildingType = "dynamo" | "smelter" | "muster" | "armory";
export type CivilianType = "cottage" | "house" | "manor";
export const CIVILIAN_TYPES: readonly CivilianType[] = ["cottage", "house", "manor"];
export type TrainType = "trooper" | "hauler" | "warden";
export type EntityKind = "unit" | "building";
/** Optional unit/building ability. */
export type SpecialAction = "deploy";
/** Tank / gun shells. Infantry small-arms stay unlimited. */
export type ShellType = "ap" | "he" | "heat";
export const SHELL_TYPES: readonly ShellType[] = ["ap", "he", "heat"];
/** Lasting injuries. Infantry: arm / leg. Motor vehicles: tracks / engine. */
export type Crit = "arm" | "leg" | "tracks" | "engine";
export const CRIT_TYPES: readonly Crit[] = ["arm", "leg", "tracks", "engine"];
export const CRIT_LABEL: Record<Crit, string> = {
  arm: "broken arm",
  leg: "broken leg",
  tracks: "broken tracks",
  engine: "broken engine",
};
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
  /** Independent turret traverse. Omit for casemate guns / tank destroyers / infantry. */
  turretTurnDegPerSec?: number;
  special?: SpecialAction;
  /** Starting rack. Omit for unlimited / unarmed. */
  ammo?: Partial<Record<ShellType, number>>;
  defaultShell?: ShellType;
  /** Armored hulls leave an impassable wreck instead of vanishing. */
  leavesWreck?: boolean;
  wreckHp?: number;
  /** Infantry slots. 0 = cannot garrison. */
  garrisonCap?: number;
}

export interface ShellDef {
  id: ShellType;
  name: string;
  damage: number;
  penetration: number;
  caliber: number;
  spreadDeg: number;
}

/** Sidearm used when a trooper's shooting arm is broken. */
export const HANDGUN = {
  damage: 8,
  penetration: 3,
  caliber: 9,
  spreadDeg: 5,
  rangeTiles: t(3),
  cooldown: 0.55,
} as const;

/** 75mm Warden load. AP is the catalog gun; HE/HEAT swap on fire. */
export const SHELLS: Record<ShellType, ShellDef> = {
  ap: { id: "ap", name: "AP", damage: 55, penetration: 100, caliber: 75, spreadDeg: 3 },
  he: { id: "he", name: "HE", damage: 90, penetration: 16, caliber: 75, spreadDeg: 5 },
  heat: { id: "heat", name: "HEAT", damage: 64, penetration: 140, caliber: 75, spreadDeg: 3.5 },
};

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
    moveTilesPerSec: t(1.3),
    turnDegPerSec: 120,
    rangeTiles: 0,
    sightTiles: t(6),
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
    tileW: t(3),
    tileH: t(3),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: t(8),
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
    tileW: t(2),
    tileH: t(2),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: t(4),
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
    tileW: t(3),
    tileH: t(3),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: t(5),
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
    tileW: t(2),
    tileH: t(2),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: t(5),
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
    tileW: t(2),
    tileH: t(2),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: t(5),
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
    moveTilesPerSec: t(2.2),
    turnDegPerSec: 1800,
    rangeTiles: t(6),
    sightTiles: t(6),
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
    moveTilesPerSec: t(1.9),
    turnDegPerSec: 140,
    rangeTiles: 0,
    sightTiles: t(4),
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
    moveTilesPerSec: t(1.45),
    turnDegPerSec: 85,
    rangeTiles: t(9),
    sightTiles: t(8),
    cooldown: 1.6,
    damage: 55,
    projectileSpeed: 5200,
    turnInPlace: true,
    turretTurnDegPerSec: 220,
    armorFront: 80,
    armorSide: 32,
    armorRear: 16,
    penetration: 100,
    caliber: 75,
    spreadDeg: 3,
    ammo: { ap: 12, he: 6, heat: 4 },
    defaultShell: "ap",
    leavesWreck: true,
    wreckHp: 70,
  },
  cottage: {
    type: "cottage",
    kind: "building",
    name: "Cottage",
    letter: "h",
    cost: 0,
    buildSeconds: 0,
    hp: 480,
    power: 0,
    tileW: t(2),
    tileH: t(2),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 0,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    garrisonCap: 4,
  },
  house: {
    type: "house",
    kind: "building",
    name: "House",
    letter: "H",
    cost: 0,
    buildSeconds: 0,
    hp: 820,
    power: 0,
    tileW: t(3),
    tileH: t(3),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 0,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    garrisonCap: 8,
  },
  manor: {
    type: "manor",
    kind: "building",
    name: "Manor",
    letter: "N",
    cost: 0,
    buildSeconds: 0,
    hp: 1400,
    power: 0,
    tileW: t(4),
    tileH: t(4),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 0,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    garrisonCap: 12,
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

export function isInfantryType(type: EntityType): boolean {
  return type === "trooper";
}

export function isMotorVehicle(type: EntityType): boolean {
  return catalog(type).kind === "unit" && !isInfantryType(type);
}

export function isCrit(v: string): v is Crit {
  return (CRIT_TYPES as readonly string[]).includes(v);
}

export function hasCrit(e: { crits: readonly Crit[] }, c: Crit): boolean {
  return e.crits.includes(c);
}

export function addCrit(e: { crits: Crit[] }, c: Crit): void {
  if (!e.crits.includes(c)) e.crits.push(c);
}

export function isCivilianType(type: string): type is CivilianType {
  return (CIVILIAN_TYPES as readonly string[]).includes(type);
}

export function isGarrisonable(type: EntityType): boolean {
  return (catalog(type).garrisonCap ?? 0) > 0;
}

export function garrisonCapOf(type: EntityType): number {
  return catalog(type).garrisonCap ?? 0;
}

export function hasTurret(type: EntityType): boolean {
  return (catalog(type).turretTurnDegPerSec ?? 0) > 0;
}

export function aimFacing(e: { type: EntityType; facing: number; turretFacing: number }): number {
  return hasTurret(e.type) ? e.turretFacing : e.facing;
}

export function isShellType(v: string): v is ShellType {
  return (SHELL_TYPES as readonly string[]).includes(v);
}

export function hasAmmo(type: EntityType): boolean {
  return !!catalog(type).ammo;
}

export function leavesWreck(type: EntityType): boolean {
  return catalog(type).leavesWreck === true;
}

export function wreckHpOf(type: EntityType): number {
  const d = catalog(type);
  return d.wreckHp ?? Math.max(1, Math.round(d.hp * 0.35));
}

export function ammoOf(ammo: Partial<Record<ShellType, number>> | undefined, shell: ShellType): number {
  return Math.max(0, ammo?.[shell] ?? 0);
}

export function pickLoadedShell(
  ammo: Partial<Record<ShellType, number>> | undefined,
  preferred: ShellType | null | undefined,
): ShellType | null {
  if (preferred && ammoOf(ammo, preferred) > 0) return preferred;
  for (const t of SHELL_TYPES) {
    if (ammoOf(ammo, t) > 0) return t;
  }
  return null;
}

export function gunStatsFor(
  type: EntityType,
  shell: ShellType | null | undefined,
): Pick<CatalogEntry, "damage" | "penetration" | "caliber" | "spreadDeg"> {
  const def = catalog(type);
  if (def.ammo && shell) {
    const s = SHELLS[shell];
    if (s) {
      return { damage: s.damage, penetration: s.penetration, caliber: s.caliber, spreadDeg: s.spreadDeg };
    }
  }
  return {
    damage: def.damage,
    penetration: def.penetration,
    caliber: def.caliber,
    spreadDeg: def.spreadDeg,
  };
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
