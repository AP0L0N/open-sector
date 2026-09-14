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
/** Full angle of a Guard overwatch cone. Units still fire 360°; this is the ready arc. */
export const GUARD_CONE_DEG = 90;
/** Displace this far when a stationary unit auto-withdraws. */
export const WITHDRAW_TILES = t(5);
export const PROJECTILE_RADIUS = 3;
export const HP_BAR_SECONDS = 2;
/**
 * Shells at or above this caliber chew the walls of an occupied house.
 * Smaller rounds (rifles, coaxial MG) wound occupants instead.
 */
export const GARRISON_STRUCTURAL_CALIBER = 40;
/** Peek through shutters. Occupied hide mode only. */
export const GARRISON_HIDE_SIGHT = t(1);
/** Extra Chebyshev tiles for a watch garrison versus standing outside. */
export const GARRISON_WATCH_SIGHT_BONUS = t(2);
/** Damaging infantry hit → broken shooting arm. */
export const CRIT_ARM_CHANCE = 0.25;
/** Damaging infantry hit → broken leg. */
export const CRIT_LEG_CHANCE = 0.25;
/** Side-plate hit on a motor vehicle → broken tracks. */
export const CRIT_TRACKS_CHANCE = 0.2;
/** Rear-plate hit on a motor vehicle → broken engine. */
export const CRIT_ENGINE_CHANCE = 0.4;
/** Infantry posture. Stand is the default; crawl is prone. */
export type Stance = "stand" | "crouch" | "crawl";
export const STANCES: readonly Stance[] = ["stand", "crouch", "crawl"];
export const STANCE_LABEL: Record<Stance, string> = {
  stand: "standing",
  crouch: "crouching",
  crawl: "crawling",
};
/** Move-speed multiplier by posture. Crawl also applies to a broken leg. */
export const STANCE_SPEED: Record<Stance, number> = {
  stand: 1,
  crouch: 0.55,
  crawl: 0.28,
};
/** Outgoing aim cone. Lower is more accurate. */
export const STANCE_AIM_SPREAD: Record<Stance, number> = {
  stand: 1,
  crouch: 0.6,
  crawl: 0.3,
};
/** Extra incoming aim cone when shooting this posture. Higher is harder to hit. */
export const STANCE_TARGET_SPREAD: Record<Stance, number> = {
  stand: 1,
  crouch: 1.45,
  crawl: 2.15,
};
/** Projectile hit-radius multiplier. */
export const STANCE_HIT_RADIUS: Record<Stance, number> = {
  stand: 1,
  crouch: 0.7,
  crawl: 0.4,
};
/** Move-speed multiplier with a broken leg (forced crawl). */
export const CRIT_LEG_SPEED = STANCE_SPEED.crawl;
/** Infantry swim speed vs standing on land. Vehicles cannot enter water. */
export const SWIM_SPEED = 0.4;
/** A* step-cost multiplier on water so troops prefer a short land detour. */
export const WATER_PATH_COST = 2.5;
/** Hull turn-rate multiplier with a dead engine. Turret is unaffected. */
export const CRIT_ENGINE_TURN = 0.2;
/** Extra world pixels between unit reserved radii on a group move. */
export const UNIT_SPACE_PAD = 2;
/** Default ground. Maps are lifted so valleys can sit below this. */
export const HEIGHT_BASE = t(2);
/** Peak discrete elevation. 0 is the valley floor. */
export const HEIGHT_MAX = t(5);
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
/** Extra Chebyshev sight tiles per elevation step above HEIGHT_BASE. */
export const HEIGHT_SIGHT_BONUS = 2;
/** Extra Chebyshev tiles infantry gain per elevation step of a tile above them. */
export const INFANTRY_UPHILL_SIGHT = 2;
/** Standing eye height. Troops peek over rises that hide a hull. */
export const INFANTRY_EYE_HEIGHT = TILE_SUBDIV;
/** Chebyshev fog radius. Troopers and player-built structures share this. */
export const INFANTRY_SIGHT_TILES = t(12);
/**
 * Armed units can fire this far past their current sight. The extra band is
 * only useful when a teammate (later: binoculars / a spotter) lights the target;
 * auto-attack still requires the enemy to be visible. Accuracy falls off there.
 */
export const WEAPON_RANGE_SIGHT_MUL = 1.2;
/** Flat-ground weapon tiles from a Chebyshev sight radius. */
export function weaponRangeTiles(sightTiles: number): number {
  return sightTiles * WEAPON_RANGE_SIGHT_MUL;
}
/** Tree tiles a sight ray may pass before the grove closes. One authoring cell. */
export const TREE_LOS_THROUGH = TILE_SUBDIV;
/** Civilian / unowned map buildings. */
export const NEUTRAL_OWNER = "";
/** One trooper vs a Dynamo (750 HP). Larger buildings take longer. */
export const CAPTURE_SECONDS = 10;
/** HP used as the 1× capture-time reference. */
export const CAPTURE_HP_REF = 750;
/** Floor so a cottage is not instant. */
export const CAPTURE_SECONDS_MIN = 6;
/** Progress lost per second after capturers leave or die. */
export const CAPTURE_DECAY_PER_SEC = 0.25;

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
  | "manor"
  | "shack"
  | "barn"
  | "inn"
  | "chapel";
export type BuildingType = "dynamo" | "smelter" | "muster" | "armory";
export type CivilianType = "cottage" | "house" | "manor" | "shack" | "barn" | "inn" | "chapel";
export const CIVILIAN_TYPES: readonly CivilianType[] = [
  "cottage",
  "house",
  "manor",
  "shack",
  "barn",
  "inn",
  "chapel",
];
export type TrainType = "trooper" | "hauler" | "warden";
export type EntityKind = "unit" | "building";
/** Optional unit/building ability. */
export type SpecialAction = "deploy";
/** Tank / gun shells. Infantry small-arms stay unlimited. */
export type ShellType = "ap" | "he" | "heat" | "smoke";
export const SHELL_TYPES: readonly ShellType[] = ["ap", "he", "heat", "smoke"];
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
  /** Flat-ground max. Armed units keep this equal to sight × WEAPON_RANGE_SIGHT_MUL. */
  rangeTiles: number;
  sightTiles: number;
  /** Extra Chebyshev sight from optics (binoculars, rangefinders). Omit until those units exist. */
  sightBonusTiles?: number;
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
  /** Starting coaxial MG belt. Omit if the type has no MG. */
  mgAmmo?: number;
  /** Armored hulls leave an impassable wreck instead of vanishing. */
  leavesWreck?: boolean;
  wreckHp?: number;
  /** Infantry slots. 0 = cannot garrison. */
  garrisonCap?: number;
  /** Occupant HP multiplier while inside. 1 = no bonus. */
  garrisonHpMul?: number;
  /** Visible-wall windows used for garrison muzzles. */
  garrisonWindows?: number;
  /** Stories used for window-flash lift. */
  garrisonFloors?: number;
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

/**
 * Rifle / coaxial MG. Fast enough to cross max range in under a tick so the
 * round itself is not a visible tracer — sparks only after an armor bounce.
 */
export const SMALL_ARMS_SPEED = 10000;
/**
 * 75mm flight. Slow enough to live across several sim ticks so the round
 * reads as a tracer instead of vanishing in the fire tick.
 */
export const TANK_SHELL_SPEED = 520;
/** Seconds a 75mm smoke screen lasts. */
export const SMOKE_SECONDS = 16;
/** Ellipse half-length along the shot, in gameplay tiles. */
export const SMOKE_HALF_ALONG = t(2);
/** Ellipse half-width across the shot, in gameplay tiles. */
export const SMOKE_HALF_ACROSS = t(1);
/** Chebyshev tiles into a cloud an observer can still see. */
export const SMOKE_PEEK_TILES = 1;

/**
 * Coaxial MG under the Warden turret. Same reach as the 75mm; the cone
 * opens hard with distance. Rapid fire, own belt, heat-stops a dump.
 */
export const TANK_MG = {
  damage: 9,
  penetration: 8,
  caliber: 8,
  spreadDeg: 18,
  /** Quadratic distance falloff for aimAngle. */
  spreadPower: 2,
  cooldown: 0.1,
  projectileSpeed: SMALL_ARMS_SPEED,
  ammo: 250,
  heatPerShot: 0.05,
  heatMax: 1,
  heatCoolPerSec: 0.22,
  overheatSeconds: 2.4,
} as const;

/** 75mm Warden load. AP is the catalog gun; HE/HEAT/smoke swap on fire. */
export const SHELLS: Record<ShellType, ShellDef> = {
  ap: { id: "ap", name: "AP", damage: 55, penetration: 100, caliber: 75, spreadDeg: 3 },
  he: { id: "he", name: "HE", damage: 90, penetration: 16, caliber: 75, spreadDeg: 5 },
  heat: { id: "heat", name: "HEAT", damage: 64, penetration: 140, caliber: 75, spreadDeg: 3.5 },
  smoke: { id: "smoke", name: "Smoke", damage: 0, penetration: 0, caliber: 75, spreadDeg: 6 },
};

const UNARMED = {
  armorFront: 0,
  armorSide: 0,
  armorRear: 0,
  penetration: 0,
  caliber: 0,
  spreadDeg: 0,
} as const;

const CIV_BUILDING = {
  kind: "building" as const,
  cost: 0,
  buildSeconds: 0,
  power: 0,
  radius: 0,
  moveTilesPerSec: 0,
  turnDegPerSec: 0,
  rangeTiles: 0,
  sightTiles: 0,
  cooldown: 0,
  damage: 0,
  projectileSpeed: 0,
  ...UNARMED,
  garrisonHpMul: 3,
};

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
    sightTiles: INFANTRY_SIGHT_TILES,
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
    sightTiles: INFANTRY_SIGHT_TILES,
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
    sightTiles: INFANTRY_SIGHT_TILES,
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
    sightTiles: INFANTRY_SIGHT_TILES,
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
    sightTiles: INFANTRY_SIGHT_TILES,
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
    rangeTiles: weaponRangeTiles(INFANTRY_SIGHT_TILES),
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0.9,
    damage: 12,
    projectileSpeed: SMALL_ARMS_SPEED,
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
    rangeTiles: weaponRangeTiles(t(8)),
    sightTiles: t(8),
    cooldown: 6.5,
    damage: 55,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    turretTurnDegPerSec: 220,
    armorFront: 80,
    armorSide: 32,
    armorRear: 16,
    penetration: 100,
    caliber: 75,
    spreadDeg: 3,
    ammo: { ap: 12, he: 6, heat: 4, smoke: 4 },
    defaultShell: "ap",
    mgAmmo: TANK_MG.ammo,
    leavesWreck: true,
    wreckHp: 70,
  },
  cottage: {
    type: "cottage",
    name: "Cottage",
    letter: "h",
    hp: 480,
    tileW: t(2),
    tileH: t(2),
    ...CIV_BUILDING,
    garrisonCap: 4,
    garrisonWindows: 2,
    garrisonFloors: 1,
  },
  shack: {
    type: "shack",
    name: "Shack",
    letter: "k",
    hp: 320,
    tileW: t(2),
    tileH: t(2),
    ...CIV_BUILDING,
    garrisonCap: 3,
    garrisonWindows: 2,
    garrisonFloors: 1,
  },
  house: {
    type: "house",
    name: "House",
    letter: "H",
    hp: 820,
    tileW: t(3),
    tileH: t(3),
    ...CIV_BUILDING,
    garrisonCap: 8,
    garrisonWindows: 3,
    garrisonFloors: 2,
  },
  barn: {
    type: "barn",
    name: "Barn",
    letter: "B",
    hp: 900,
    tileW: t(3),
    tileH: t(3),
    ...CIV_BUILDING,
    garrisonCap: 8,
    garrisonWindows: 3,
    garrisonFloors: 2,
  },
  inn: {
    type: "inn",
    name: "Inn",
    letter: "I",
    hp: 860,
    tileW: t(3),
    tileH: t(3),
    ...CIV_BUILDING,
    garrisonCap: 8,
    garrisonWindows: 3,
    garrisonFloors: 2,
  },
  chapel: {
    type: "chapel",
    name: "Chapel",
    letter: "P",
    hp: 1100,
    tileW: t(3),
    tileH: t(3),
    ...CIV_BUILDING,
    garrisonCap: 6,
    garrisonWindows: 3,
    garrisonFloors: 2,
  },
  manor: {
    type: "manor",
    name: "Manor",
    letter: "N",
    hp: 1400,
    tileW: t(4),
    tileH: t(4),
    ...CIV_BUILDING,
    garrisonCap: 12,
    garrisonWindows: 4,
    garrisonFloors: 3,
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
  return catalog(type).damage > 0 || hasMg(type);
}

/** Extra fog tiles from catalog optics. 0 on every current type. */
export function sightBonusTilesOf(type: EntityType): number {
  return catalog(type).sightBonusTiles ?? 0;
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

export function isStance(v: string): v is Stance {
  return (STANCES as readonly string[]).includes(v);
}

export function hasCrit(e: { crits: readonly Crit[] }, c: Crit): boolean {
  return e.crits.includes(c);
}

export function addCrit(e: { crits: Crit[] }, c: Crit): void {
  if (!e.crits.includes(c)) e.crits.push(c);
}

/** Effective posture. A broken leg always crawls. */
export function stanceOf(e: {
  type: EntityType;
  stance?: Stance;
  crits: readonly Crit[];
}): Stance {
  if (!isInfantryType(e.type)) return "stand";
  if (hasCrit(e, "leg")) return "crawl";
  return e.stance ?? "stand";
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

/** Occupant HP while inside. Civilian houses are 3×. */
export function garrisonHpMulOf(type: EntityType): number {
  return catalog(type).garrisonHpMul ?? 1;
}

export function garrisonWindowsOf(type: EntityType): number {
  return catalog(type).garrisonWindows ?? 2;
}

export function garrisonFloorsOf(type: EntityType): number {
  return catalog(type).garrisonFloors ?? 1;
}

/** Player-built structures can change owner. Civilian houses cannot. */
export function isCapturable(type: EntityType): boolean {
  return catalog(type).kind === "building" && !isCivilianType(type);
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

export function isSmokeShell(shell: ShellType | null | undefined): boolean {
  return shell === "smoke";
}

export function hasAmmo(type: EntityType): boolean {
  return !!catalog(type).ammo;
}

export function hasMg(type: EntityType): boolean {
  return (catalog(type).mgAmmo ?? 0) > 0;
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
    if (t === "smoke") continue;
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
