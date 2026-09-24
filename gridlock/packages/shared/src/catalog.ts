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
/** Share of the hull's cost an engineer recovers by breaking up the wreck. */
export const WRECK_SCRAP_MUL = 0.2;
/** Seconds of the fixing pose to cut a wreck into scrap. */
export const WRECK_SCRAP_SECONDS = 5;
export const SCRAP_TILE_YIELD = 800;
export const SCRAP_MID_YIELD = 1000;
export const HAULER_CARGO = 400;
export const HAULER_HARVEST_SECONDS = 2;
export const HAULER_UNLOAD_SECONDS = 1.2;
export const LOW_POWER_MIN_SPEED = 0.25;
export const FACE_FIRE_DEG = 8;
/** Hull must finish its yaw before tracks roll. 1° ≈ aligned this tick. */
export const FACE_MOVE_DEG = 1;
/**
 * A waypoint this close to the hull axis counts as reached when the hull
 * rolls past its foot. Tracks only roll along the snapped face, so a small
 * lateral miss is normal; re-aiming for it would only make the hull fidget.
 */
export const TRACK_ARRIVE_SLOP = 8;
/**
 * Unit hull faces. Every sprite uses 16 unique files at 22.5°:
 * 0001.png = world south (screen down), then clockwise through 0016.png
 * (south + 337.5°). A 17th file would equal 0001. 8 steps is a true reverse.
 * Cardinals land on faces.
 */
export const TANK_FACE_DIRS = 16;
/** World yaw of 0001.png: world south, screen down. */
export const TANK_FACE_START_YAW = Math.PI / 2;

function angAbsRad(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function snapTankYaw(yaw: number): number {
  const step = (Math.PI * 2) / TANK_FACE_DIRS;
  const i = Math.round((yaw - TANK_FACE_START_YAW) / step);
  const face = TANK_FACE_START_YAW + i * step;
  const cardinal = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
  return angAbsRad(yaw, cardinal) < angAbsRad(yaw, face) ? cardinal : face;
}
/** Max fine tiles a tank will reverse instead of spinning the hull. */
export const REVERSE_TILES = t(2);
/** Full rear cone that counts as “behind” for a reverse hop. */
export const REVERSE_CONE_DEG = 90;
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
/**
 * Hatch-crew HP vs a standing trooper. Same 3× as a garrisoned occupant —
 * the cupola is cover, not a house.
 */
export const SCOUT_HP_MUL = 3;
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
export const HEIGHT_SIGHT_BONUS = 3;
/** Extra Chebyshev tiles infantry gain per elevation step of a tile above or below them. */
export const INFANTRY_UPHILL_SIGHT = 3;
/** Extra Chebyshev tiles a hull gains per elevation step of a tile above or below it. */
export const HULL_LEVEL_SIGHT = 1;
/**
 * Rise that must poke through the sight ray before terrain occludes.
 * One authoring terrace: rolling ground stays open; a deep valley still hides.
 */
export const LOS_TERRAIN_SLACK = TILE_SUBDIV;
/**
 * Standing eye height. Slight peek over a hull-level rise; LOS_TERRAIN_SLACK
 * does most of the work so modest hills stay open.
 */
export const INFANTRY_EYE_HEIGHT = 3;
/** Deck height used for terrain LOS. Same slack as infantry; a deep valley still hides. */
export const HULL_EYE_HEIGHT = 1;
/** World-Z per discrete elevation. Matches iso lift (half a tile height). */
export const HEIGHT_WORLD = TILE_SIZE / 2;
/**
 * Tank gun max elevation. A hull in a hole cannot crank the barrel at a
 * steep lip. No depression cap — a hilltop with LOS fires down.
 */
export const TANK_GUN_ELEV_DEG = 20;
/**
 * Uphill steps a tank always clears. One authoring terrace is not a hole;
 * a valley floor versus the plateau still has to pass the elevation angle.
 */
export const TANK_GUN_CLIMB = TILE_SUBDIV;
/** Chebyshev fog radius. Troopers and player-built structures share this. */
export const INFANTRY_SIGHT_TILES = t(12);
/**
 * After painting FOV, fill unseen 8-connected islands and hide visible ones
 * of this many tiles or fewer. Walks FOV borders only. Set to 0 to disable.
 */
export const FOV_ISLAND_LIMIT = 12;
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
/**
 * Chance a round that actually meets a tree (height included) stops on that
 * tile. Rolled once per tree along the path; later trees still get a roll.
 */
export const TREE_HIT_CHANCE = 0.15;
/**
 * How far a tree rises above its tile, in elevation units. ~2 authoring
 * terraces — a valley oak sits under a hilltop shot; a tall house does not.
 */
export const TREE_COVER_HEIGHT = t(2);
/** Elevation units per building story. Manor (3) still pokes a HEIGHT_BASE shot. */
export const STORY_COVER_HEIGHT = t(1.5);
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
  | "rifleman"
  | "gunner"
  | "sniper"
  | "atinfantry"
  | "mortarman"
  | "engineer"
  | "medic"
  | "hauler"
  | "warden"
  | "ss3"
  | "walker"
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
  | "chapel"
  | "sandbags"
  | "teeth";
export type BuildingType = "dynamo" | "smelter" | "muster" | "armory";
/** Placed by an engineer, not the construction yard. */
export type FieldStructureType = "sandbags" | "teeth";
export const FIELD_STRUCTURES: readonly FieldStructureType[] = ["sandbags", "teeth"];
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
export type TrainType = "rifleman" | "gunner" | "sniper" | "atinfantry" | "mortarman" | "engineer" | "medic" | "hauler" | "warden" | "ss3" | "walker";
export type EntityKind = "unit" | "building";
/** Optional unit/building ability. */
export type SpecialAction = "deploy";
/** Tank / gun shells. Infantry small-arms use clips; magazines never run dry. */
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
export const TRAIN_TYPES: readonly TrainType[] = ["rifleman", "gunner", "sniper", "atinfantry", "mortarman", "engineer", "medic", "hauler", "warden", "ss3", "walker"];
/** Opening army besides the Rig. Hauler omitted so it does not auto-harvest. */
export const START_UNITS: readonly TrainType[] = TRAIN_TYPES.filter((t) => t !== "hauler");

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
  /** Extra Chebyshev sight from optics. The sniper's scope. Added on top of sightTiles. */
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
  /** Rounds released together each cooldown. Infantry guns override this. */
  shotsPerTick?: number;
  /** Small-arms belt. Reloads like an infantry clip. Omit for shells or a dry gun. */
  belt?: number;
  /** Belt change, seconds. Scaled by the unit's reloadMul. */
  beltReload?: number;
  /** Hull must face the waypoint before translating. */
  turnInPlace?: boolean;
  /** Continuous tracks a mortar bomb can throw. Walkers and the Mauler are not tracked. */
  tracked?: boolean;
  /** Turn to face every move. No reverse hop, even when the dest is close behind. */
  noReverse?: boolean;
  /** Independent turret traverse. Omit for casemate guns / tank destroyers / infantry. */
  turretTurnDegPerSec?: number;
  /**
   * Half-angle off the aim facing the gun may fire, degrees.
   * Casemate traverse (StuG ±10°). Default FACE_FIRE_DEG.
   */
  gunArcDeg?: number;
  /** Per-type shell table. Defaults to SHELLS (Tiger 75mm rack). */
  shells?: Record<ShellType, ShellDef>;
  /** Player-facing one-liner for inspect / config. */
  blurb?: string;
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
  /** Hatch scout: pop the cupola for infantry sight. Tanks only. */
  hasScout?: boolean;
}

export interface ShellDef {
  id: ShellType;
  name: string;
  /** Player-facing: what this load is for. */
  blurb: string;
  damage: number;
  penetration: number;
  caliber: number;
  spreadDeg: number;
}

/** Infantry small-arm. CatalogEntry still holds the unit; this is the gun. */
export type InfantryWeaponId = "rifle" | "handgun" | "mg42" | "scoped" | "mortar" | "ptrd";
export const INFANTRY_WEAPON_IDS: readonly InfantryWeaponId[] = ["rifle", "handgun", "mg42", "scoped", "mortar", "ptrd"];
export interface InfantryGun {
  id: InfantryWeaponId;
  name: string;
  /** Player-facing: what this gun is for. */
  blurb: string;
  damage: number;
  penetration: number;
  caliber: number;
  spreadDeg: number;
  cooldown: number;
  /** Rounds in a magazine. Reload starts when this hits 0. */
  clip: number;
  /** Magazine change, seconds. Scaled by the infantry reloadMul. */
  reload: number;
  /** Omit to use the unit catalog range. */
  rangeTiles?: number;
  /** Inside this the tube will not drop. Mortar only. */
  minRangeTiles?: number;
  /** Rounds released together each time the cooldown elapses. Default 1. */
  shotsPerTick?: number;
}

/** Personal reload-time scale around 1. Baked onto each trooper at spawn. */
export const RELOAD_MUL_MIN = 0.92;
export const RELOAD_MUL_MAX = 1.08;

export function rollReloadMul(rand: () => number): number {
  return RELOAD_MUL_MIN + rand() * (RELOAD_MUL_MAX - RELOAD_MUL_MIN);
}

export function reloadSecondsOf(gun: Pick<InfantryGun, "reload">, mul: number): number {
  return gun.reload * Math.max(0.01, mul);
}

/** Trooper primary. Precise, slow, long-range semi-auto. */
export const RIFLE = {
  id: "rifle" as const,
  name: "Rifle",
  blurb: "Long-range semi-auto. Slower shots, eight-round clip. Default — keep this unless the fight is point-blank.",
  damage: 12,
  penetration: 6,
  caliber: 8,
  spreadDeg: 2,
  cooldown: 0.9,
  clip: 8,
  reload: 2.8,
} as const satisfies InfantryGun;

/**
 * Trooper sidearm. Short reach, faster follow-up — wins a point-blank 1v1.
 * A broken shooting arm also forces this gun.
 */
export const HANDGUN = {
  id: "handgun" as const,
  name: "Handgun",
  blurb: "Short reach, faster follow-up. Wins a close 1v1. Forced if the shooting arm is broken.",
  damage: 8,
  penetration: 3,
  caliber: 9,
  spreadDeg: 5,
  rangeTiles: t(3),
  cooldown: 0.4,
  clip: 7,
  reload: 1.6,
} as const satisfies InfantryGun;

/**
 * MG42, standard bolt. Cyclic rate is 1,200 rounds/minute (20 per second).
 * The sim ticks at 10 Hz, so each ready tick releases two rounds.
 * The belt is the 50-round Gurttrommel a gunner carries on the gun.
 * A lone gunner seats the next belt in about six seconds.
 * The bipod has to be down before the gun will fire.
 */
export const MG42_RPM = 1200;
export const MG42_BELT = 50;
export const MG42_BELT_RELOAD = 6;
export const MG42_BIPOD_SECONDS = 1.5;
export const MG42 = {
  id: "mg42" as const,
  name: "MG42",
  blurb: "1,200 rounds a minute from a 50-round belt. Crawl and set the bipod, then it fires.",
  damage: 8,
  penetration: 8,
  caliber: 8,
  spreadDeg: 4,
  cooldown: TICK_DT,
  shotsPerTick: MG42_RPM / 60 / (1 / TICK_DT),
  clip: MG42_BELT,
  reload: MG42_BELT_RELOAD,
} as const satisfies InfantryGun;

/**
 * Walker gatlings. Same 1,200 rpm cadence as the MG42, one gun on each arm,
 * so each tick releases four rounds. The backpack holds twice a gunner's belt,
 * which keeps the same time-on-trigger.
 */
/** Rounds one gatling releases each tick. Same cadence as the MG42. */
export const WALKER_ONE_BURST = MG42_RPM / 60 / (1 / TICK_DT);
/** Both arms. */
export const WALKER_SHOTS_PER_TICK = WALKER_ONE_BURST * 2;
/**
 * Backpack rack. It does not refill. One gatling lasts a minute;
 * both arms empty it in half that time.
 */
export const WALKER_BELT = MG42_RPM;
/** Half-angle the arms can cover while the body faces the main target. */
export const WALKER_GUN_ARC = 70;

export const WALKER_GUN_MODES = [
  {
    guns: 1 as const,
    name: "One gatling",
    blurb: "One arm. Half the rounds, so the backpack lasts. Stays on a single target.",
  },
  {
    guns: 2 as const,
    name: "Both gatlings",
    blurb: "Both arms, four rounds a tick. If another enemy is in the forward arc, the second gun takes them.",
  },
] as const;

/**
 * Share of an infantry target's max HP.
 * 100% at the muzzle, 90% at the far end of the scope.
 */
export const SCOPED_HP_NEAR = 1;
export const SCOPED_HP_FAR = 0.9;

/** Range falloff for a scoped hit. 0 distance is a full health bar. */
export function scopedHpFraction(dist: number, maxRange: number): number {
  const t = Math.min(1, Math.max(0, dist / Math.max(1e-6, maxRange)));
  return SCOPED_HP_NEAR + (SCOPED_HP_FAR - SCOPED_HP_NEAR) * t;
}

/**
 * Scoped bolt rifle. Infantry hits use scopedHpFraction of max HP.
 * damage is only the chip against buildings and armor.
 * The scope is sightBonusTiles on the sniper, not a second firing mode.
 * A broken arm leaves this rifle on the ground — there is no handgun.
 */
export const SCOPED = {
  id: "scoped" as const,
  name: "Scoped rifle",
  blurb: "Takes 90–100% of a soldier's health by range. A close shot kills. At the far end of the scope they are left barely standing.",
  damage: 28,
  penetration: 8,
  caliber: 8,
  spreadDeg: 0.45,
  cooldown: 4.8,
  clip: 5,
  reload: 3.4,
} as const satisfies InfantryGun;

/**
 * 14.5×114mm PTRD-41. Single shot, no magazine. The bolt, the pouch, and the
 * sight match the scoped rifle. The round is the difference.
 *
 * Soviet figures, 0°: about 40 mm at 100 m, 35 mm at 300 m, 25 mm at 500 m.
 * Mapped onto the plates in this catalog (Tiger side is 32, rear 16, front 80;
 * Walker is 18 / 10 / 8). Close range is inside a tank's own sight.
 */
export const PTRD_CALIBER = 14.5;
/** Gameplay tiles. Inside this, tank side and rear are in reach. */
export const PTRD_CLOSE_TILES = t(8);
/** 0° penetration at the muzzle. The 100 m figure. */
export const PTRD_PEN_MUZZLE = 40;
/** 0° penetration at the far edge of close range. A square 32 mm side still opens. */
export const PTRD_PEN_CLOSE = 35;
/** 0° penetration at the end of the sights. Light plate fails; a tank side holds. */
export const PTRD_PEN_FAR = 22;
/** Front plate at or under this is a light hull. The Walker is 18. */
export const PTRD_LIGHT_FRONT = 20;
/**
 * Share of max HP on a penetrating hit. A 14.5 mm hole, not a shell burst.
 * Light hulls lose about a third. A tank side is a wound and a component.
 * The rear bay (engine, radiators) takes a little more.
 */
export const PTRD_DMG_LIGHT = 0.32;
export const PTRD_DMG_SIDE = 0.09;
export const PTRD_DMG_REAR = 0.15;
/** Side penetration chance to throw a track. A shell's side hit is 0.2. */
export const PTRD_TRACK_CHANCE = 0.5;

/** 40 mm at the muzzle, 35 mm at the close-range edge, 22 mm at max range. */
export function ptrdPenetration(distTiles: number, maxRangeTiles: number): number {
  const d = Math.max(0, distTiles);
  if (d <= PTRD_CLOSE_TILES) {
    const u = PTRD_CLOSE_TILES <= 1e-6 ? 1 : d / PTRD_CLOSE_TILES;
    return PTRD_PEN_MUZZLE + (PTRD_PEN_CLOSE - PTRD_PEN_MUZZLE) * u;
  }
  const far = Math.max(PTRD_CLOSE_TILES + 1e-6, maxRangeTiles);
  const u = Math.min(1, (d - PTRD_CLOSE_TILES) / (far - PTRD_CLOSE_TILES));
  return PTRD_PEN_CLOSE + (PTRD_PEN_FAR - PTRD_PEN_CLOSE) * u;
}

export const PTRD = {
  id: "ptrd" as const,
  name: "PTRD-41",
  blurb: "Anti-tank rifle. A soldier takes the same hit as from the scoped rifle. Up close it punches tank side and rear, often a track, and it goes through light armor. The front plate holds.",
  damage: SCOPED.damage,
  penetration: PTRD_PEN_MUZZLE,
  caliber: PTRD_CALIBER,
  spreadDeg: 0.7,
  cooldown: SCOPED.cooldown,
  clip: SCOPED.clip,
  reload: SCOPED.reload,
} as const satisfies InfantryGun;

/**
 * 60mm infantry mortar. The bomb goes up and comes down, so smoke and hills
 * do not stop the arc. Reach is much longer than the soldier's eyes.
 * Auto-fire still needs the target on the side's fog. A teammate who can see
 * it lets the tube lob past his own sight.
 * The bomb still drifts, but it stays near the aim point.
 * The blast kills infantry in the open. An armored hull only loses a nick,
 * and a tracked tank can lose a track.
 * The tube has to be kneeling and planted, and it will not drop inside the minimum.
 */
export const MORTAR_RANGE_TILES = t(26);
export const MORTAR_MIN_RANGE_TILES = t(6);
/** Blast radius. Several soldiers standing together share one bomb. */
export const MORTAR_SPLASH_TILES = t(2.5);
export const MORTAR_SCATTER_NEAR_TILES = t(0.32);
export const MORTAR_SCATTER_FAR_TILES = t(0.9);
export const MORTAR_PLANT_SECONDS = 1.6;
export const MORTAR_FLIGHT_NEAR = 1.55;
export const MORTAR_FLIGHT_FAR = 2.85;
/** Elevation units at the top of the arc. High enough to read as a lob. */
export const MORTAR_APEX_NEAR = 36;
export const MORTAR_APEX_FAR = 64;
/**
 * Share of max HP a mortar bomb takes off an armored hull at the blast center.
 * The rim uses mortarFalloff, so the edge of the burst is a smaller nick.
 */
export const MORTAR_ARMOR_CHIP = 0.05;
/** Chance a mortar hit throws a track. Only hulls with `tracked` roll it. */
export const MORTAR_TRACK_CHANCE = 0.1;
export const MORTAR = {
  id: "mortar" as const,
  name: "Mortar",
  blurb: "Lobs a bomb over hills and out of sight. Slow, and it still drifts a little off the aim point. Devastating to infantry in the open. A hit nicks a tank and can throw a track. Kneel and plant the tube. Too close and it will not drop.",
  damage: 56,
  penetration: 14,
  caliber: 60,
  spreadDeg: 22,
  cooldown: 4.6,
  clip: 4,
  reload: 7,
  rangeTiles: MORTAR_RANGE_TILES,
  minRangeTiles: MORTAR_MIN_RANGE_TILES,
} as const satisfies InfantryGun;

/**
 * Medic. He walks to wounded infantry inside this disk, then has to stand
 * against them. Farther than this, he leaves them and goes back to his order.
 */
export const MEDIC_SEEK_TILES = t(6);
/** Extra world pixels past body clearance that still count as hands-on. */
export const MEDIC_TOUCH_SLACK = 8;
/** HP per second while in contact. No charges and no cooldown. */
export const MEDIC_HEAL_PER_SEC = 3;
/** Seconds of uninterrupted contact to clear one broken arm or leg. */
export const MEDIC_MEND_SECONDS = 8;

export const INFANTRY_GUNS: Record<InfantryWeaponId, InfantryGun> = {
  rifle: RIFLE,
  handgun: HANDGUN,
  mg42: MG42,
  scoped: SCOPED,
  mortar: MORTAR,
  ptrd: PTRD,
};

/**
 * Rifle / coaxial MG / 75mm. Fast enough to cross max range in under a tick so
 * the round itself is not a visible tracer — sparks only after an armor bounce.
 */
export const SMALL_ARMS_SPEED = 10000;
/** Same as small-arms: 75mm lands in the fire tick. */
export const TANK_SHELL_SPEED = SMALL_ARMS_SPEED;
/** Seconds a 75mm smoke screen lasts. */
export const SMOKE_SECONDS = 16;
/** Mauler smoke grenades on the hull. Empty rack starts a long reload. */
export const HAULER_SMOKE_CHARGES = 3;
/** Mauler defensive smoke. Matches the screen so it does not restack. */
export const HAULER_SMOKE_COOLDOWN = SMOKE_SECONDS;
/** Seconds to restock a spent Mauler smoke rack. */
export const HAULER_SMOKE_RELOAD = 60;
export function haulerSmokeChargesOf(type: EntityType): number {
  return type === "hauler" ? HAULER_SMOKE_CHARGES : 0;
}
/**
 * Scrap cart on the Mauler hitch. One HE shell pops it. Solid shot takes two.
 * Rifles, machine guns, and the anti-tank rifle do not touch it.
 */
export const MAULER_CART_HP = 80;
/** Seconds parked on a Smelter dock before a lost cart is fitted again. */
export const MAULER_CART_RESTORE_SECONDS = 8;
export function maulerCartHpOf(type: EntityType): number {
  return type === "hauler" ? MAULER_CART_HP : 0;
}
/** Ellipse half-length along the shot, in gameplay tiles. */
export const SMOKE_HALF_ALONG = t(2.5);
/** Ellipse half-width across the shot, in gameplay tiles. */
export const SMOKE_HALF_ACROSS = t(1.5);
/** Chebyshev tiles into a cloud an observer can still see. */
export const SMOKE_PEEK_TILES = 1;

/**
 * Coaxial MG under the Tiger turret. Same reach as the 75mm; the cone
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

/** 75mm Tiger load. AP is the catalog gun; HE/HEAT/smoke swap on fire. */
export const SHELLS: Record<ShellType, ShellDef> = {
  ap: {
    id: "ap",
    name: "AP",
    blurb: "Armor-piercing solid shot. High penetration — use against tanks. Modest blast; glancing hits ricochet.",
    damage: 55,
    penetration: 100,
    caliber: 75,
    spreadDeg: 3,
  },
  he: {
    id: "he",
    name: "HE",
    blurb: "High explosive. Heavy damage to infantry and buildings. Poor penetration; ricochets off armor.",
    damage: 90,
    penetration: 16,
    caliber: 75,
    spreadDeg: 5,
  },
  heat: {
    id: "heat",
    name: "HEAT",
    blurb: "Shaped charge. Highest penetration in the rack. Best round for punching a tank, including the front plate.",
    damage: 64,
    penetration: 140,
    caliber: 75,
    spreadDeg: 3.5,
  },
  smoke: {
    id: "smoke",
    name: "Smoke",
    blurb: "Lays a vision-blocking screen. Never auto-fires — force-attack the ground to place one round, then the gun stops.",
    damage: 0,
    penetration: 0,
    caliber: 75,
    spreadDeg: 6,
  },
};

/**
 * StuK 40 L/48 rack. Weaker AP than the Tiger 75mm table; HEAT is how it
 * fights a heavy from the front. Spec: assets/units/ss3/stug-iii-ausf-g-late-saukopf.md
 */
export const STUG_SHELLS: Record<ShellType, ShellDef> = {
  ap: {
    id: "ap",
    name: "AP",
    blurb: "Pzgr. 39 APCBC. Kills mediums from the front; glances off a Tiger glacis. Use a flank or HEAT on heavies.",
    damage: 48,
    penetration: 72,
    caliber: 75,
    spreadDeg: 3,
  },
  he: {
    id: "he",
    name: "HE",
    blurb: "Sprgr. 34. Infantry, guns, trucks, buildings. This is still an assault gun — keep HE on the rack.",
    damage: 72,
    penetration: 14,
    caliber: 75,
    spreadDeg: 5,
  },
  heat: {
    id: "heat",
    name: "HEAT",
    blurb: "Gr. 38 HL/C. About 100 mm any range. The round for a Tiger front when you cannot get a side shot.",
    damage: 56,
    penetration: 100,
    caliber: 75,
    spreadDeg: 3.5,
  },
  smoke: {
    id: "smoke",
    name: "Smoke",
    blurb: "Lays a vision-blocking screen. Never auto-fires — force-attack the ground to place one round, then the gun stops.",
    damage: 0,
    penetration: 0,
    caliber: 75,
    spreadDeg: 6,
  },
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
  sandbags: {
    type: "sandbags",
    kind: "building",
    name: "Sandbags",
    letter: "Q",
    cost: 20,
    buildSeconds: 4,
    hp: 30,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 0,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: "Two bags high. Crouched or crawling infantry behind it gain extra health. A crawling soldier cannot fire a gun over it. One tank shell wrecks it and still hits the men.",
  },
  teeth: {
    type: "teeth",
    kind: "building",
    name: "Dragon's teeth",
    letter: "Y",
    cost: 35,
    buildSeconds: 6,
    hp: 240,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: 0,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    armorFront: 80,
    armorSide: 80,
    armorRear: 80,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    blurb: "Four concrete pyramids, scattered along the line when placed. Tanks cannot cross. Infantry walk through.",
  },
  rifleman: {
    type: "rifleman",
    kind: "unit",
    name: "Rifleman",
    letter: "F",
    blurb: "Rifle and handgun. Stands, crouches, or crawls.",
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
    cooldown: RIFLE.cooldown,
    damage: RIFLE.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: RIFLE.penetration,
    caliber: RIFLE.caliber,
    spreadDeg: RIFLE.spreadDeg,
  },
  gunner: {
    type: "gunner",
    kind: "unit",
    name: "Gunner",
    letter: "U",
    cost: 175,
    buildSeconds: 11,
    hp: 45,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: t(1.65),
    turnDegPerSec: 1400,
    rangeTiles: weaponRangeTiles(INFANTRY_SIGHT_TILES),
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: MG42.cooldown,
    damage: MG42.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: MG42.penetration,
    caliber: MG42.caliber,
    spreadDeg: MG42.spreadDeg,
    blurb: "MG42. Crawl, set the bipod, then 1,200 rounds a minute from a 50-round belt.",
  },
  sniper: {
    type: "sniper",
    kind: "unit",
    name: "Sniper",
    letter: "T",
    cost: 160,
    buildSeconds: 10,
    hp: 35,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: t(1.8),
    turnDegPerSec: 1600,
    rangeTiles: weaponRangeTiles(INFANTRY_SIGHT_TILES + t(4)),
    sightTiles: INFANTRY_SIGHT_TILES,
    sightBonusTiles: t(4),
    cooldown: SCOPED.cooldown,
    damage: SCOPED.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: SCOPED.penetration,
    caliber: SCOPED.caliber,
    spreadDeg: SCOPED.spreadDeg,
    blurb: "Scoped rifle. A hit takes 90–100% of a soldier's health, closest shots killing outright. Crouch to tighten the aim.",
  },
  atinfantry: {
    type: "atinfantry",
    kind: "unit",
    name: "AT Infantry",
    letter: "P",
    cost: 210,
    buildSeconds: 12,
    hp: 36,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: t(1.65),
    turnDegPerSec: 1400,
    rangeTiles: weaponRangeTiles(INFANTRY_SIGHT_TILES + t(4)),
    sightTiles: INFANTRY_SIGHT_TILES,
    sightBonusTiles: t(4),
    cooldown: PTRD.cooldown,
    damage: PTRD.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: PTRD.penetration,
    caliber: PTRD.caliber,
    spreadDeg: PTRD.spreadDeg,
    blurb: "PTRD-41. Same reach as the scoped rifle. Up close it punches tank side and rear, often a track, and it goes through light armor. The front plate holds.",
  },
  mortarman: {
    type: "mortarman",
    kind: "unit",
    name: "Mortarman",
    letter: "O",
    cost: 190,
    buildSeconds: 12,
    hp: 38,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: t(1.5),
    turnDegPerSec: 1200,
    rangeTiles: MORTAR_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: MORTAR.cooldown,
    damage: MORTAR.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: MORTAR.penetration,
    caliber: MORTAR.caliber,
    spreadDeg: MORTAR.spreadDeg,
    blurb: "60mm mortar. Kneel, plant the tube, and lob past his own eyes at a target your side can see. Scattered bombs that wreck infantry. A hit nicks armor and can throw a track.",
  },
  engineer: {
    type: "engineer",
    kind: "unit",
    name: "Engineer",
    letter: "E",
    cost: 130,
    buildSeconds: 10,
    hp: 40,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: t(2),
    turnDegPerSec: 1600,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: "No gun. Builds sandbags and concrete tank obstacles, repairs armor and buildings, and cuts wrecks into scrap.",
  },
  medic: {
    type: "medic",
    kind: "unit",
    name: "Medic",
    letter: "M",
    cost: 120,
    buildSeconds: 9,
    hp: 34,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: t(2),
    turnDegPerSec: 1600,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: "No weapon. Walks to a wounded soldier nearby and closes the wound. A long kneel sets a broken arm or leg. The bag does not run out.",
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
    armorFront: 100,
    armorSide: 80,
    armorRear: 80,
    leavesWreck: true,
    wreckHp: 70,
    blurb: "Heavily armored bulldozer. Thick plate on every face. Shells knock the scrap cart off the hitch. Without it, the Mauler drops its load and waits at the Smelter for a new cart.",
  },
  warden: {
    type: "warden",
    kind: "unit",
    name: "Tiger",
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
    tracked: true,
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
    hasScout: true,
    blurb: "Heavy tank. Independent turret, thick front plate. Slow hull, long-range rack.",
  },
  /** Spec: gridlock/packages/client/src/assets/units/ss3/stug-iii-ausf-g-late-saukopf.md */
  ss3: {
    type: "ss3",
    kind: "unit",
    name: "StuG III",
    letter: "G",
    cost: 180,
    buildSeconds: 10,
    hp: 100,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 10,
    moveTilesPerSec: t(1.55),
    turnDegPerSec: 60,
    rangeTiles: weaponRangeTiles(t(7)),
    sightTiles: t(7),
    cooldown: 6.5,
    damage: 48,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    tracked: true,
    gunArcDeg: 10,
    armorFront: 64,
    armorSide: 18,
    armorRear: 28,
    penetration: 72,
    caliber: 75,
    spreadDeg: 3,
    ammo: { ap: 10, he: 9, heat: 3, smoke: 2 },
    defaultShell: "ap",
    shells: STUG_SHELLS,
    mgAmmo: TANK_MG.ammo,
    leavesWreck: true,
    wreckHp: 50,
    hasScout: true,
    blurb: "Casemate assault gun. No turret — hull-steer to aim. Strong front, thin sides.",
  },
  walker: {
    type: "walker",
    kind: "unit",
    name: "Walker",
    letter: "K",
    cost: 220,
    buildSeconds: 12,
    hp: 80,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 8,
    moveTilesPerSec: t(1.75),
    turnDegPerSec: 160,
    rangeTiles: weaponRangeTiles(t(8)),
    sightTiles: t(8),
    cooldown: TICK_DT,
    damage: MG42.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    turnInPlace: true,
    noReverse: true,
    armorFront: 18,
    armorSide: 10,
    armorRear: 8,
    penetration: MG42.penetration,
    caliber: MG42.caliber,
    spreadDeg: 5,
    shotsPerTick: WALKER_SHOTS_PER_TICK,
    gunArcDeg: WALKER_GUN_ARC,
    belt: WALKER_BELT,
    leavesWreck: true,
    wreckHp: 36,
    blurb: "Each arm is a gatling at the MG42's 1,200 rounds a minute, the same bullet. The backpack is a 1,200-round rack and does not refill. One arm spends it slowly. Both arms spend it twice as fast and can split across two targets.",
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

/** Largest unit collision radius. Wreck pathing inflates by this so any hull can detour. */
export const MAX_UNIT_RADIUS = Math.max(
  ...Object.values(ENTRIES).filter((d) => d.kind === "unit").map((d) => d.radius),
);

export function isBuildingType(type: string): type is BuildingType {
  return (BUILDING_TYPES as readonly string[]).includes(type);
}

export function isFieldStructure(type: EntityType): type is FieldStructureType {
  return (FIELD_STRUCTURES as readonly string[]).includes(type);
}

/** World-pixel length along the wall and thickness across it. Null for other types. */
export function fieldSpan(type: EntityType): { length: number; thick: number } | null {
  if (type === "sandbags") return { length: 48, thick: 14 };
  if (type === "teeth") return { length: 56, thick: 20 };
  return null;
}

export function isTrainType(type: string): type is TrainType {
  return (TRAIN_TYPES as readonly string[]).includes(type);
}

export function fires(type: EntityType): boolean {
  return catalog(type).damage > 0 || hasMg(type);
}

/** Extra fog tiles from catalog optics. The sniper's scope; 0 on every other type. */
export function sightBonusTilesOf(type: EntityType): number {
  return catalog(type).sightBonusTiles ?? 0;
}

export function isArmoredType(type: EntityType): boolean {
  const d = catalog(type);
  return d.armorFront > 0 || d.armorSide > 0 || d.armorRear > 0;
}

/** Tiger and StuG. The Walker has legs, and the Mauler is not a tracked hull. */
export function hasTracks(type: EntityType): boolean {
  return catalog(type).tracked === true;
}

export function armorLabel(type: EntityType): string | null {
  if (!isArmoredType(type)) return null;
  const d = catalog(type);
  return `F${d.armorFront} / S${d.armorSide} / R${d.armorRear}`;
}

const INFANTRY_TYPES: readonly EntityType[] = ["rifleman", "gunner", "sniper", "atinfantry", "mortarman", "engineer", "medic"];

export function isInfantryType(type: EntityType): boolean {
  return (INFANTRY_TYPES as readonly string[]).includes(type);
}

/** Primary gun for an infantry type. Null on vehicles and buildings. */
export function primaryInfantryGun(type: EntityType): InfantryGun | null {
  if (type === "rifleman") return RIFLE;
  if (type === "gunner") return MG42;
  if (type === "sniper") return SCOPED;
  if (type === "atinfantry") return PTRD;
  if (type === "mortarman") return MORTAR;
  return null;
}

/** Carried guns, primary first. Empty on vehicles and buildings. */
export function infantryLoadout(type: EntityType): readonly InfantryGun[] {
  if (type === "rifleman") return [RIFLE, HANDGUN];
  if (type === "gunner") return [MG42];
  if (type === "sniper") return [SCOPED];
  if (type === "atinfantry") return [PTRD];
  if (type === "mortarman") return [MORTAR];
  return [];
}

export function isInfantryWeaponId(v: string): v is InfantryWeaponId {
  return (INFANTRY_WEAPON_IDS as readonly string[]).includes(v);
}

export function infantryGunById(id: InfantryWeaponId): InfantryGun {
  return INFANTRY_GUNS[id];
}

/** Gun the unit is holding now. A broken shooting arm swaps to the handgun. */
export function infantryGunFor(e: {
  type: EntityType;
  crits?: readonly Crit[];
  weapon?: InfantryWeaponId | null;
}): InfantryGun | null {
  if (!isInfantryType(e.type)) return null;
  if (hasCrit({ crits: e.crits ?? [] }, "arm")) {
    return infantryLoadout(e.type).find((g) => g.id === "handgun") ?? null;
  }
  const loadout = infantryLoadout(e.type);
  if (e.weapon) {
    const picked = loadout.find((g) => g.id === e.weapon);
    if (picked) return picked;
  }
  return primaryInfantryGun(e.type);
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

export function addCrit(
  e: {
    crits: Crit[];
    type?: EntityType;
    clip?: number;
    reload?: number;
    weapon?: InfantryWeaponId | null;
  },
  c: Crit,
): void {
  if (e.crits.includes(c)) return;
  e.crits.push(c);
  if (c === "arm" && e.type && infantryLoadout(e.type).some((g) => g.id === "handgun")) {
    e.weapon = "handgun";
    e.clip = HANDGUN.clip;
    e.reload = 0;
  }
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

/**
 * Solid height above the pad, in elevation units. Shots whose Z clears this
 * fly over. Civilian floors win; military pads scale with footprint.
 */
export function coverHeightOf(type: EntityType): number {
  const d = catalog(type);
  if (d.kind === "building") {
    if (d.garrisonFloors != null) return d.garrisonFloors * STORY_COVER_HEIGHT;
    const stories = Math.max(d.tileW, d.tileH) / TILE_SUBDIV;
    return Math.max(STORY_COVER_HEIGHT * 2, stories * STORY_COVER_HEIGHT);
  }
  if (isInfantryType(type)) return INFANTRY_EYE_HEIGHT;
  return HULL_EYE_HEIGHT + 2;
}

export function hasScout(type: EntityType): boolean {
  return catalog(type).hasScout === true;
}

/** Max HP for a tank's hatch crew. 0 when the type has no scout. */
export function scoutHpMaxOf(type: EntityType): number {
  if (!hasScout(type)) return 0;
  return Math.max(1, Math.round(catalog("rifleman").hp * SCOUT_HP_MUL));
}

/** Head out of the hatch and still alive. */
export function entityIsScouting(e: { scoutOut?: boolean; scoutHp?: number }): boolean {
  return !!e.scoutOut && (e.scoutHp ?? 0) > 0;
}

/** Player-built structures can change owner. Civilian houses cannot. */
export function isCapturable(type: EntityType): boolean {
  return catalog(type).kind === "building" && !isCivilianType(type) && !isFieldStructure(type);
}

export function hasTurret(type: EntityType): boolean {
  return (catalog(type).turretTurnDegPerSec ?? 0) > 0;
}

/** Half-angle the gun may fire off aim facing. Casemates use gunArcDeg. */
export function gunArcDegOf(type: EntityType): number {
  return catalog(type).gunArcDeg ?? FACE_FIRE_DEG;
}

export function aimFacing(e: { type: EntityType; facing: number; turretFacing: number }): number {
  return hasTurret(e.type) ? e.turretFacing : e.facing;
}

/** Shell table for this type. Ammo tanks without a table share SHELLS. */
export function shellsFor(type: EntityType): Record<ShellType, ShellDef> {
  return catalog(type).shells ?? SHELLS;
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

/** Backpack or belt that runs dry and reloads. Null on shells and dry guns. */
export function beltOf(type: EntityType): { clip: number; reload: number } | null {
  const d = catalog(type);
  if (d.belt == null || d.belt <= 0) return null;
  return { clip: d.belt, reload: d.beltReload ?? 0 };
}

/** Walker arms in use. Missing means both guns. */
export function walkerGunsOf(e: { type: EntityType; gatlingGuns?: 1 | 2 }): 1 | 2 {
  if (e.type !== "walker") return 1;
  return e.gatlingGuns === 1 ? 1 : 2;
}

export function leavesWreck(type: EntityType): boolean {
  return catalog(type).leavesWreck === true;
}

/** Scrap paid to the engineer’s commander when a wreck is cut apart. */
export function wreckScrapOf(type: EntityType): number {
  return Math.max(10, Math.round(catalog(type).cost * WRECK_SCRAP_MUL));
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
    const s = shellsFor(type)[shell];
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
