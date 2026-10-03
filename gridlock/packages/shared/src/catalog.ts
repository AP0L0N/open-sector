/** All M2 pace knobs. Do not scatter magic numbers. */

export const TICK_HZ = 10;
export const TICK_DT = 1 / TICK_HZ;
export const TICK_MS = 100;
export const GAME_SPEED_MIN = 1;
export const GAME_SPEED_MAX = 5;
export const GAME_SPEED_DEFAULT = GAME_SPEED_MIN;
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
/** Chebyshev gap from any owned building's footprint; wide enough to fit an Airfield past the base clutter. */
export const BUILD_RADIUS = t(14);
export const UNIT_CAP = 60;
/** Max train jobs waiting or in progress on one producer. */
export const TRAIN_QUEUE_CAP = 9;
export const DEPLOY_SECONDS = 3;
export const SELL_REFUND = 0.5;
/** Share of the hull's cost an engineer recovers by breaking up the wreck. */
export const WRECK_SCRAP_MUL = 0.2;
/** Seconds of the fixing pose to cut a wreck into scrap. */
export const WRECK_SCRAP_SECONDS = 5;
/** Marks a scrap tile. Scrap is never used up: a Smelter standing on it draws from it for the whole match. */
export const SCRAP_TILE_YIELD = 800;
/** Scrap a Smelter on a scrap field earns its owner each second at full power. Low power slows it like production. */
export const SMELTER_SCRAP_PER_SEC = 25;
/** Share of a Smelter's footprint that must lie on scrap tiles before it can be placed. */
export const SMELTER_SCRAP_COVER = 0.5;
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
/** Shift-queued orders one unit may hold. Later ones are dropped. */
export const ORDER_QUEUE_MAX = 16;
/** Full rear cone that counts as “behind” for a reverse hop. */
export const REVERSE_CONE_DEG = 90;
/** Full angle of a Guard overwatch cone. Units still fire 360°; this is the ready arc. */
export const GUARD_CONE_DEG = 90;
/** Displace this far when a stationary unit auto-withdraws. */
export const WITHDRAW_TILES = t(5);
export const PROJECTILE_RADIUS = 3;
/**
 * A friendly unit or building in the line of fire. The gun holds, looks for
 * another target with a clear line, and steps aside. After this long on the
 * same target it fires anyway, and a friend still in the way takes the round.
 */
export const ALLY_LINE_PATIENCE_SECONDS = 3;
/** World px added around a friend in the line, for the spread of the round. */
export const ALLY_LINE_MARGIN = 2;
/** How often a held gun looks again for another target or a spot with a clear line. */
export const ALLY_LINE_RETRY_SECONDS = 0.5;
/** Farthest a gun steps aside for a clear line, in its own diameters. */
export const ALLY_SIDESTEP_STEPS = 6;
/** The patience clock stops while the gun walks aside, for at most this long. */
export const ALLY_SIDESTEP_MAX_SECONDS = 4;
export const HP_BAR_SECONDS = 2;
/**
 * Shells at or above this caliber chew the walls of an occupied house.
 * Smaller rounds (rifles, coaxial MG) wound occupants instead.
 */
export const GARRISON_STRUCTURAL_CALIBER = 40;
/** Peek through shutters. Occupied hide mode only. */
export const GARRISON_HIDE_SIGHT = t(1);
/** Extra sight tiles for a watch garrison versus standing outside. */
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
/** A bullet that meets a hull or a watch tower may smash every lamp on it. */
export const CRIT_LAMP_CHANCE = 0.06;
/** The scoped rifle breaks those lamps much more often than other bullets. */
export const CRIT_LAMP_SNIPER_CHANCE = 0.35;
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
/** Share of each soldier's authored walk. 0.7 is about 30% slower on foot. */
export const INFANTRY_PACE = 0.7;
/**
 * Share of every unit's current move pace. Infantry stack this on INFANTRY_PACE.
 * Hulls, walkers, aircraft, the drone, and the jump jet's flight use it once.
 * 0.7 is another 30% slower.
 */
export const UNIT_PACE = 0.7;
/** Authoring tiles per second after UNIT_PACE. Buildings stay at 0. */
const paced = (tiles: number): number => t(tiles * UNIT_PACE);
/** A* step-cost multiplier on water so troops prefer a short land detour. */
export const WATER_PATH_COST = 2.5;
/** Extra world pixels between unit reserved radii on a group move. */
export const UNIT_SPACE_PAD = 2;
/** Default ground. Maps are lifted so valleys can sit below this. */
export const HEIGHT_BASE = t(2);
/**
 * Peak discrete elevation. 0 is the valley floor.
 * Scrap Yard hills reach this. Sight scans and elevated picking assume no tile is taller.
 */
export const HEIGHT_MAX = t(8);
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
/** Extra sight tiles per elevation step above HEIGHT_BASE. One terrace ≈ +4 cells of fog reach. */
export const HEIGHT_SIGHT_BONUS = 4;
/** Extra sight tiles infantry gain per elevation step of a tile above or below them. */
export const INFANTRY_UPHILL_SIGHT = 3;
/** Extra sight tiles a hull gains per elevation step of a tile above or below it. */
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
/** Round fog radius. Troopers and player-built structures share this. */
export const INFANTRY_SIGHT_TILES = t(12);
/**
 * Extra gameplay tiles of weapon reach per elevation step above HEIGHT_BASE.
 * Sight still grows faster (HEIGHT_SIGHT_BONUS). One terrace ≈ +2 cells of
 * reach: a hill is worth climbing, but it does not turn the fog disk into a
 * firing range.
 */
export const HEIGHT_RANGE_BONUS = 2;
/**
 * Flat-ground reach, in gameplay tiles. `t(n)` is n cells on the 64-cell map.
 * Direct fire stops inside the shooter's own eyes, except the tank guns,
 * which reach past the optics so a spotter still matters.
 * The mortar is the long arm: past every direct-fire gun, not across the map.
 * A rifle carries well past a pistol, and the scope is the longest direct-fire
 * reach on the field: it sits just inside the sniper's scoped sight.
 *
 * Cells: handgun 3, flamethrower 3.5, walker 8, cyborg 8, rifle 9, MG42 11, StuG 12, PTRD 13,
 * Rocketer 12, Tiger and Titan 14, scoped rifle 15, Jagdtiger 16, mortar 23 (it will not drop inside 3),
 * Nebelwerfer 24 (it will not fire inside 4).
 */
export const HANDGUN_RANGE_TILES = t(3);
export const RIFLE_RANGE_TILES = t(9);
/** Jump Jet's assault rifle. Short of the rifle. */
export const ASSAULT_RANGE_TILES = t(7.5);
export const MG42_RANGE_TILES = t(11);
export const WALKER_RANGE_TILES = t(8);
export const CYBORG_RANGE_TILES = WALKER_RANGE_TILES;
export const SCOPED_RANGE_TILES = t(15);
export const PTRD_RANGE_TILES = t(13);
/** Rocketer's tube. Short of the Titan's pods: one man laying it off his shoulder. */
export const LAUNCHER_RANGE_TILES = t(12);
/** Pyro's flamethrower. A jet of burning fuel carries only a few strides past a pistol. */
export const FLAMER_RANGE_TILES = t(3.5);
export const STUG_RANGE_TILES = t(12);
export const TIGER_RANGE_TILES = t(14);
/** Jagdtiger's 128mm. The longest tank gun: past the scope, well past its own eyes, short of the mortar. */
export const JAGDTIGER_RANGE_TILES = t(16);
/** Titan carries the Tiger's gun, so it keeps the Tiger's reach. Its rockets share that reach. */
export const TITAN_RANGE_TILES = TIGER_RANGE_TILES;
/** Titan wading pace, as a share of its dry-ground walk. */
export const TITAN_WADE_SPEED = 0.6;
/** Seconds to plant the outriggers, and again to pull them up. */
export const TITAN_BRACE_SECONDS = 2.5;
/** Hit-point multiplier while braced. HP keeps its share of max across the change. */
export const TITAN_BRACED_HP_MUL = 1.75;
/**
 * Titan shoulder rockets. The pods ripple a salvo, one rocket after another
 * from alternating sides, then reload. Each rocket flies straight and fast to a
 * scattered point — wide at full reach, tighter as the target closes — and
 * bursts like a small mortar bomb: it tears infantry apart and dents a hull.
 * On a tracked hull, a side or rear hit usually throws a track. Aimed at a
 * plane, it flies at the plane's height and bursts
 * beside it. The rack is finite; a supply truck refills it like shells.
 * The pods ride above the waterline, so they fire while the Titan wades.
 */
export const TITAN_ROCKET_SALVO = 4;
/** Seconds between rockets inside one salvo. */
export const TITAN_ROCKET_INTERVAL = 0.3;
/** Seconds from the last rocket of a salvo to the first of the next. */
export const TITAN_ROCKET_RELOAD = 11;
/** Rockets in a full rack: four salvos. */
export const TITAN_ROCKET_AMMO = 16;
/**
 * Ground miss radius at point blank and at full reach.
 * Full reach keeps the wide disk. Inside that reach the rocket draws in
 * (see rocketScatterRadius). Point blank is tight enough to land on a hull.
 */
export const TITAN_ROCKET_SCATTER_NEAR_TILES = t(0.2);
export const TITAN_ROCKET_SCATTER_FAR_TILES = t(1.6);
/**
 * Chance a rocket that lands on a tracked hull throws a track, from the side
 * or the rear. The front plate does not. Shared by the Titan, the Rocketer,
 * the Nebelwerfer, and the RAM. Higher than a shell's side crit.
 */
export const ROCKET_TRACK_CHANCE = 0.75;
/** Blast radius of one rocket. Smaller than a mortar bomb. */
export const TITAN_ROCKET_SPLASH_TILES = t(1.3);
/** World pixels per second. A mortar bomb takes ~2 s to cross this range; a rocket about two-thirds of a second. */
export const TITAN_ROCKET_SPEED = t(16.64) * TILE_SIZE;
/** Elevation units above the Titan's eye where the pods sit. */
export const TITAN_ROCKET_POD_LIFT = 6;
export const TITAN_ROCKET = {
  /** Infantry and soft targets at the blast center. */
  damage: 42,
  /** Hit points off an armored hull at the blast center, before falloff. */
  armorDamage: 11,
  /** A plane caught in an air burst takes the soft-target damage × this. */
  airMul: 0.9,
  penetration: 30,
  caliber: 80,
} as const;

/**
 * One rocket launcher: how it ripples, how far the rockets scatter, and what
 * one burst does. The Titan's pods and the Nebelwerfer's tubes both use it.
 */
export interface RocketRackDef {
  /** Rockets in one salvo. */
  salvo: number;
  /** Seconds between launches inside one salvo. */
  interval: number;
  /** Extra seconds added to `interval` at random after each launch. Default 0. */
  intervalJitter?: number;
  /** Most rockets leaving together in one launch; each launch rolls 1..volleyMax. Default 1. */
  volleyMax?: number;
  /** Seconds from the last rocket of a salvo to the first of the next. */
  reload: number;
  /** Ground miss radius at point blank and at full reach, gameplay tiles. */
  scatterNearTiles: number;
  scatterFarTiles: number;
  /** Blast radius of one rocket, gameplay tiles. */
  splashTiles: number;
  /** World pixels per second along the ground. */
  speed: number;
  /** Elevation units above the carrier's eye where the rockets leave. */
  podLift: number;
  /** Infantry and soft targets at the blast center. */
  damage: number;
  /** Hit points off an armored hull at the blast center, before falloff. */
  armorDamage: number;
  /** A plane caught in an air burst takes the soft-target damage × this. */
  airMul: number;
  penetration: number;
  caliber: number;
  /** Lays on planes in the air and on low drones. */
  antiAir: boolean;
  /**
   * Peak of an arcing rocket over its straight line, elevation units, at point
   * blank and at full reach. Omit for a rocket that flies straight. Either way
   * it bursts on a hull, wall, or tree it meets on the way.
   */
  apexNear?: number;
  apexFar?: number;
  /** Inside this the tubes will not fire. Gameplay tiles. */
  minRangeTiles?: number;
  /**
   * The rockets are the carrier's only weapon, on a traversing frame. The frame
   * must bear on the target and the carrier must be halted before a rocket leaves.
   */
  laid?: boolean;
  /**
   * Connecting interceptor bursts this rocket takes before it comes apart.
   * Omit for a rocket one burst destroys. A mount keeps shooting until then.
   */
  plate?: number;
}

export const TITAN_ROCKET_RACK: RocketRackDef = {
  salvo: TITAN_ROCKET_SALVO,
  interval: TITAN_ROCKET_INTERVAL,
  reload: TITAN_ROCKET_RELOAD,
  scatterNearTiles: TITAN_ROCKET_SCATTER_NEAR_TILES,
  scatterFarTiles: TITAN_ROCKET_SCATTER_FAR_TILES,
  splashTiles: TITAN_ROCKET_SPLASH_TILES,
  speed: TITAN_ROCKET_SPEED,
  podLift: TITAN_ROCKET_POD_LIFT,
  ...TITAN_ROCKET,
  antiAir: true,
};

/**
 * Nebelwerfer: twelve tubes on an armored truck. It rolls into place, stops,
 * swings the frame onto the target, and empties the frame in about a second:
 * one to three rockets at a time, never all twelve at once. The rockets fly
 * fast on a flat arc like a Titan's, far past its own eyes: the longest reach
 * in the game. Force attack throws them at any point in that reach, seen or
 * not, and they pass over whatever stands in the way. A shot at a target still
 * meets a tank or a tree in the path. They scatter
 * wide at full reach and draw in as the target closes, and each burst is lighter than a
 * Titan rocket — a salvo blankets an area rather than finding one soldier.
 * Five full salvos in the rack.
 */
export const NEBELWERFER_RANGE_TILES = t(24);
export const NEBELWERFER_MIN_RANGE_TILES = t(4);
export const NEBELWERFER_SALVO = 12;
export const NEBELWERFER_ROCKET_AMMO = NEBELWERFER_SALVO * 5;
export const NEBELWERFER_ROCKET: RocketRackDef = {
  salvo: NEBELWERFER_SALVO,
  interval: 0.1,
  intervalJitter: 0.2,
  volleyMax: 3,
  reload: 16,
  scatterNearTiles: t(0.4),
  scatterFarTiles: t(3.4),
  splashTiles: t(1.5),
  speed: t(15) * TILE_SIZE,
  podLift: 5,
  damage: 30,
  armorDamage: 6,
  airMul: 0,
  penetration: 22,
  caliber: 150,
  antiAir: false,
  apexNear: 6,
  apexFar: 16,
  minRangeTiles: NEBELWERFER_MIN_RANGE_TILES,
  laid: true,
};
/**
 * After painting FOV, fill unseen 8-connected islands and hide visible ones
 * of this many tiles or fewer. Walks FOV borders only. Set to 0 to disable.
 */
export const FOV_ISLAND_LIMIT = 12;
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
  | "rocketer"
  | "pyro"
  | "mortarman"
  | "engineer"
  | "medic"
  | "hauler"
  | "warden"
  | "apocalypse"
  | "ss3"
  | "jagdtiger"
  | "walker"
  | "cyborg"
  | "titan"
  | "mammoth"
  | "nebelwerfer"
  | "artillery"
  | "supply"
  | "core"
  | "dynamo"
  | "smelter"
  | "muster"
  | "armory"
  | "airfield"
  | "ciws"
  | "bunker"
  | "tower"
  | "ram"
  | "research"
  | "radar"
  | "stuka"
  | "fw190"
  | "bv222"
  | "droneop"
  | "drone"
  | "jumpjet"
  | "cottage"
  | "house"
  | "manor"
  | "shack"
  | "barn"
  | "inn"
  | "chapel"
  | "sandbags"
  | "wall"
  | "greatwall"
  | "teeth"
  | "trench";
export type BuildingType = "dynamo" | "smelter" | "muster" | "armory" | "airfield" | "ciws" | "ram" | "bunker" | "tower" | "research" | "radar";
/** Placed by an engineer. Sandbags and walls can also be queued from the Defences tab. */
export type FieldStructureType = "sandbags" | "wall" | "greatwall" | "teeth" | "trench";
export const FIELD_STRUCTURES: readonly FieldStructureType[] = ["sandbags", "wall", "greatwall", "teeth", "trench"];
/** Field works the construction yard can queue. An engineer can still place these anywhere. */
export type YardFieldType = "sandbags" | "wall" | "greatwall";
export const YARD_FIELD_TYPES: readonly YardFieldType[] = ["sandbags", "wall", "greatwall"];
/** Concrete lines an engineer lays as one job: every piece appears together when he finishes. The Large wall is the `greatwall` id. */
export type ConcreteLineType = "wall" | "greatwall";
export function isConcreteLine(type: string): type is ConcreteLineType {
  return type === "wall" || type === "greatwall";
}
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
export type TrainType = "rifleman" | "gunner" | "sniper" | "atinfantry" | "rocketer" | "pyro" | "mortarman" | "engineer" | "medic" | "warden" | "apocalypse" | "ss3" | "jagdtiger" | "walker" | "cyborg" | "titan" | "mammoth" | "nebelwerfer" | "artillery" | "supply" | "stuka" | "fw190" | "bv222" | "droneop" | "jumpjet";
export type EntityKind = "unit" | "building";
/** Optional unit/building ability. */
export type SpecialAction = "deploy";
/** Tank / gun shells. Infantry small-arms use clips; magazines never run dry. */
export type ShellType = "ap" | "he" | "heat" | "smoke";
export const SHELL_TYPES: readonly ShellType[] = ["ap", "he", "heat", "smoke"];
/** Lasting injuries. Infantry: arm / leg. Motor vehicles: tracks / engine. A lamp crit darkens every spotlight on that hull or tower. */
export type Crit = "arm" | "leg" | "tracks" | "engine" | "lamp";
export const CRIT_TYPES: readonly Crit[] = ["arm", "leg", "tracks", "engine", "lamp"];
export const CRIT_LABEL: Record<Crit, string> = {
  arm: "broken arm",
  leg: "broken leg",
  tracks: "broken tracks",
  engine: "broken engine",
  lamp: "broken spotlight",
};
/** Floor for every special. Individual actions may be longer. */
export const SPECIAL_COOLDOWN_MIN = 2;
export const SPECIAL_COOLDOWN: Record<SpecialAction, number> = {
  deploy: 2,
};

export const BUILDING_TYPES: readonly BuildingType[] = ["dynamo", "smelter", "muster", "armory", "airfield", "ciws", "ram", "bunker", "tower", "research", "radar"];
/** Base buildings an engineer can raise in the field, away from the yard. The Smelter, so distant scrap can be claimed. */
export const ENGINEER_BUILDINGS: readonly BuildingType[] = ["smelter"];
export function isEngineerBuilding(type: string): type is BuildingType {
  return (ENGINEER_BUILDINGS as readonly string[]).includes(type);
}
export const TRAIN_TYPES: readonly TrainType[] = ["rifleman", "gunner", "sniper", "atinfantry", "rocketer", "pyro", "mortarman", "engineer", "medic", "warden", "apocalypse", "ss3", "jagdtiger", "walker", "cyborg", "titan", "mammoth", "nebelwerfer", "artillery", "supply", "stuka", "fw190", "bv222", "droneop", "jumpjet"];

/** Advanced units: their producer also needs this building standing before a job can be queued. */
export const TECH_REQUIRES: Partial<Record<TrainType, BuildingType>> = {
  warden: "research",
  apocalypse: "research",
  jagdtiger: "research",
  cyborg: "research",
  titan: "research",
  mammoth: "research",
  nebelwerfer: "research",
  droneop: "research",
  jumpjet: "research",
};

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
  /** Flat-ground max. Live reach adds HEIGHT_RANGE_BONUS per step above the plain. */
  rangeTiles: number;
  sightTiles: number;
  /** Extra sight from optics. The sniper's scope. Added on top of sightTiles. */
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
  /** False: infantry cannot take this structure by standing the capture. Default true for player buildings. */
  capturable?: boolean;
  /** Infantry slots. 0 = cannot garrison. */
  garrisonCap?: number;
  /** Occupant HP multiplier while inside. 1 = no bonus. */
  garrisonHpMul?: number;
  /** Visible-wall windows used for garrison muzzles. */
  garrisonWindows?: number;
  /** Stories used for window-flash lift. */
  garrisonFloors?: number;
  /** Only these infantry may enter. Omit for any infantry. */
  garrisonTypes?: readonly EntityType[];
  /** Share of incoming fire that reaches the occupants. Default 1. */
  garrisonWoundMul?: number;
  /** Sight and weapon reach added while inside, watch mode. Default GARRISON_WATCH_SIGHT_BONUS. */
  garrisonSightBonus?: number;
  /** Weapon reach added while inside, watch mode. Default garrisonSightBonus. */
  garrisonReachBonus?: number;
  /** Eye height above the ground for watchers inside, elevation units. Omit: they look from the street. */
  garrisonEye?: number;
  /** Every weapon works from inside: the Gunner lays his MG on the embrasure ledge. */
  garrisonFullArms?: boolean;
  /** Open to the sky: a mortarman inside can still set his tube and fire. */
  garrisonOpenTop?: boolean;
  /**
   * A medic inside: every occupant regains this share of max HP a second, and
   * the medic tends by this alone, not hands-on. Does not stack.
   */
  garrisonMedicRegen?: number;
  /** An engineer inside: the building regains this much HP a second. Does not stack. */
  garrisonEngineerRepair?: number;
  /**
   * A hull, not a building: armor takes every hit and nothing reaches the
   * soldiers inside, but when it is destroyed they die with it.
   */
  garrisonDiesWithHost?: boolean;
  /** Solid height above the pad in elevation units, when not set by garrisonFloors. */
  coverHeight?: number;
  /** Hatch scout: pop the cupola for infantry sight. Tanks only. */
  hasScout?: boolean;
  /** Walks through water tiles like a swimmer, and like a swimmer cannot fire from one. */
  wades?: boolean;
  /** Move-speed share while wading. Omit and the hull uses TITAN_WADE_SPEED. */
  wadeSpeed?: number;
  /** Deploy braces the unit in place: stationary, hull locked, max HP × this. */
  bracedHpMul?: number;
  /** Shoulder rocket pods (TITAN_ROCKET). They fire from water, where the main gun cannot. */
  rockets?: boolean;
  /** Rockets in a full rack. Only a supply truck refills it. */
  rocketAmmo?: number;
  /** How the rockets fly and burst. Default TITAN_ROCKET_RACK. */
  rocketRack?: RocketRackDef;
  /** Flies. Parks on an Airfield pad, ignores ground collision and paths. */
  aircraft?: boolean;
  /**
   * Radar-laid mount (the CIWS, the RAM). Fires on its own at units only, planes and paratroopers first,
   * lays on a plane with CIWS_AIR_SPREAD instead of AIR_TARGET_SPREAD, cranks
   * the gun to any height, and shoots rockets out of the air.
   */
  radarLaid?: boolean;
  /**
   * A radar-laid 20mm mount on the turret roof (the Apocalypse). It traverses and
   * picks targets on its own, apart from the main gun. Incoming missiles come
   * first, and it bursts them more often than the pad CIWS does. It takes the
   * coaxial MG's place: its belt is mgAmmo.
   */
  roofCiws?: boolean;
  /** Main-gun barrels. A twin mount fires them one after another. Default 1. */
  twinGuns?: boolean;
  /** Quadcopter flown by a Drone Op. Hovers, ignores ground collision and paths. */
  drone?: boolean;
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
export type InfantryWeaponId = "rifle" | "handgun" | "mg42" | "scoped" | "mortar" | "ptrd" | "gatling" | "launcher" | "flamer" | "assault" | "penetrator";
export const INFANTRY_WEAPON_IDS: readonly InfantryWeaponId[] = ["rifle", "handgun", "mg42", "scoped", "mortar", "ptrd", "gatling", "launcher", "flamer", "assault", "penetrator"];
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
  /**
   * Magazine change, seconds. Scaled by the infantry reloadMul.
   * 0 = the clip never reloads by itself; a supply truck tops it up.
   */
  reload: number;
  /** Omit to use the unit catalog range. */
  rangeTiles?: number;
  /** Large weapon. The supply-truck bed still fires the ones weaponFitsTruck allows. */
  bulky?: boolean;
  /** Inside this the tube will not drop. Mortar only. */
  minRangeTiles?: number;
  /** Rounds released together each time the cooldown elapses. Default 1. */
  shotsPerTick?: number;
  /** Rate of fire enough to track a high drone. Only these guns reach a Surveillance drone. */
  antiAir?: boolean;
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

/** Trooper primary. Precise, slow. Stops well inside what he can see. */
export const RIFLE = {
  id: "rifle" as const,
  name: "Rifle",
  blurb: "Aimed rifle. Shorter than the machine gun. Slower shots, eight-round clip. Default — keep this unless the fight is point-blank.",
  damage: 12,
  penetration: 6,
  caliber: 8,
  spreadDeg: 2,
  cooldown: 0.9,
  clip: 8,
  reload: 2.8,
  rangeTiles: RIFLE_RANGE_TILES,
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
  rangeTiles: HANDGUN_RANGE_TILES,
  cooldown: 0.4,
  clip: 7,
  reload: 1.6,
} as const satisfies InfantryGun;

/**
 * Jump Jet's assault rifle. A short burst from a thirty-round magazine: more
 * rounds in the air than a rifle, a little less reach, a little less aim.
 * Two rounds leave each time the cooldown elapses.
 */
export const ASSAULT = {
  id: "assault" as const,
  name: "Assault rifle",
  blurb: "Two-round bursts from a thirty-round magazine. A little shorter and looser than the rifle, much more lead. Fired from the air it comes down past sandbags, trees, a crouch, and a trench parapet.",
  damage: 9,
  penetration: 5,
  caliber: 8,
  spreadDeg: 3,
  cooldown: 0.5,
  shotsPerTick: 2,
  clip: 30,
  reload: 2.6,
  rangeTiles: ASSAULT_RANGE_TILES,
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
  blurb: "1,200 rounds a minute from a 50-round belt. Reaches past a rifle. Crawl and set the bipod, then it fires.",
  damage: 8,
  penetration: 8,
  caliber: 8,
  spreadDeg: 4,
  cooldown: TICK_DT,
  shotsPerTick: MG42_RPM / 60 / (1 / TICK_DT),
  clip: MG42_BELT,
  reload: MG42_BELT_RELOAD,
  rangeTiles: MG42_RANGE_TILES,
  bulky: true,
  antiAir: true,
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
/** Half-angle the arms can cover off the torso's facing. */
export const WALKER_GUN_ARC = 70;
/**
 * The torso traverses on the hips like a turret, so the legs keep walking
 * while the gatlings stay on a target.
 */
export const WALKER_TORSO_TURN = 200;

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
 * Self destroy. On by default. At a fifth of his health he charges the nearest
 * enemy he can see and detonates. Config is the off switch.
 */
export const WALKER_SELF_DESTRUCT_HP = 0.2;
/** How much faster he runs once the charge is on. */
export const WALKER_CHARGE_SPEED = 1.4;
/** Hit points and max hit points, multiplied once when the charge starts. The fraction stays put. */
export const WALKER_CHARGE_HP = 5;
/** Blast radius of that detonation, in gameplay tiles. */
export const WALKER_BLAST_TILES = t(1.5);
/** HP at the center against a hull heavier than light plate. The rim still nicks. */
export const WALKER_BLAST_HEAVY = 14;
/** HP at the center against infantry, light hulls, buildings, and everything else. */
export const WALKER_BLAST_SOFT = 48;

export const WALKER_SELF_DESTRUCT_MODES = [
  {
    id: "on" as const,
    name: "Self destroy",
    blurb: "At a fifth of his health he charges the nearest enemy and detonates. That remainder swells to five times the hit points, he runs faster, and dark smoke trails him. The blast nicks a tank and hits everything else harder. Nothing is left of him.",
  },
  {
    id: "off" as const,
    name: "Hold together",
    blurb: "He does not charge. Shot apart, he leaves a wreck.",
  },
] as const;

/**
 * Cyborg. Half soldier, half machine: one gatling in place of the right arm,
 * the same bullet and cadence as one Walker gun, fed from a drum on his back.
 * The drum does not reload by itself — a supply truck tops it up.
 * He does not crouch or go prone. Shot down near the end, the legs are torn
 * away and he drags himself on one arm, still firing. A medic closes the
 * flesh and an engineer patches the plating; either brings the legs back.
 */
export const CYBORG_DRUM = 600;
/** Legs are torn off at or under this share of max HP. */
export const CYBORG_LEGS_LOST_HP = 0.3;
/** Healed or repaired back to this share of max HP, the legs work again. */
export const CYBORG_LEGS_BACK_HP = 0.6;
/**
 * Seconds the cyborg cannot be hurt once the legs are torn off. A hit that
 * would have killed him with his legs on leaves him at 1 HP, crawling, instead.
 */
export const CYBORG_CRAWL_SHIELD_SECONDS = 5;
/** Move-speed multiplier on the arm alone. Slower than a soldier crawling. */
export const CYBORG_DRAG_SPEED = 0.18;
/** HP per second an engineer welds back onto the plating. Slower than a hull. */
export const CYBORG_REPAIR_PER_SEC = 5;
export const GATLING = {
  id: "gatling" as const,
  name: "Gatling arm",
  blurb: "One Walker gatling on the arm: 1,200 rounds a minute from a 600-round drum. The drum does not reload by itself — bring a supply truck.",
  damage: MG42.damage,
  penetration: MG42.penetration,
  caliber: MG42.caliber,
  spreadDeg: 5,
  cooldown: TICK_DT,
  shotsPerTick: WALKER_ONE_BURST,
  clip: CYBORG_DRUM,
  reload: 0,
  rangeTiles: CYBORG_RANGE_TILES,
  bulky: true,
  antiAir: true,
} as const satisfies InfantryGun;

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
  rangeTiles: SCOPED_RANGE_TILES,
  bulky: true,
} as const satisfies InfantryGun;

/**
 * 14.5×114mm PTRD-41. Single shot, no magazine. The bolt, the pouch, and the
 * sight match the scoped rifle. The round is the difference.
 *
 * Soviet figures, 0°: about 40 mm at 100 m, 35 mm at 300 m, 25 mm at 500 m.
 * Mapped onto the plates in this catalog (Tiger side is 32, rear 16, front 80;
 * Walker is 18 / 10 / 8). Close range sits inside a tank's own sight.
 */
export const PTRD_CALIBER = 14.5;
/** Gameplay tiles. Inside this, tank side and rear are in reach. Four map cells. */
export const PTRD_CLOSE_TILES = t(4);
/** 0° penetration at the muzzle. The 100 m figure. */
export const PTRD_PEN_MUZZLE = 40;
/** 0° penetration at the far edge of close range. A square 32 mm side still opens. */
export const PTRD_PEN_CLOSE = 35;
/** 0° penetration at the end of the sights. Light plate fails; a tank side holds. */
export const PTRD_PEN_FAR = 22;
/** Front plate at or under this is a light hull. The Walker is 18. */
export const PTRD_LIGHT_FRONT = 20;
/**
 * Chance a gatling round punches a living light hull. Walker gatlings, the
 * Cyborg's arm, the pad CIWS, and the Apocalypse roof. The Gunner's MG42 is
 * the same bullet and is not included. Heavier plate stays on the normal hit.
 */
export const GATLING_LIGHT_CHANCE = 0.08;

/** A vehicle whose front plate is thin enough for a PTRD, and for a gatling nick. */
export function isLightHull(def: { kind: string; armorFront: number }): boolean {
  return def.kind === "unit" && def.armorFront > 0 && def.armorFront <= PTRD_LIGHT_FRONT;
}
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
  rangeTiles: PTRD_RANGE_TILES,
  bulky: true,
} as const satisfies InfantryGun;

/**
 * 60mm infantry mortar. The bomb goes up and comes down, so smoke and hills
 * do not stop the arc. Reach is past his eyes and past the tank guns.
 * Auto-fire still needs the target on the side's fog. A teammate who can see
 * it lets the tube lob past his own sight.
 * The bomb still drifts, but it stays near the aim point.
 * The blast kills infantry in the open. An armored hull only loses a nick,
 * and a tracked tank can lose a track.
 * The tube has to be kneeling and planted, and it will not drop inside the minimum.
 */
export const MORTAR_RANGE_TILES = t(23);
export const MORTAR_MIN_RANGE_TILES = t(3);
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
  bulky: true,
} as const satisfies InfantryGun;

/** A lobbed round: the mortar bomb or the field gun's shell. Tiles are sim tiles, seconds are flight time. */
export interface LobShellDef {
  damage: number;
  penetration: number;
  caliber: number;
  splashTiles: number;
  scatterNearTiles: number;
  scatterFarTiles: number;
  flightNear: number;
  flightFar: number;
  apexNear: number;
  apexFar: number;
  /** Share of an armored hull's max HP taken at the blast center. */
  armorChip: number;
  trackChance: number;
}

export const MORTAR_LOB: LobShellDef = {
  damage: MORTAR.damage,
  penetration: MORTAR.penetration,
  caliber: MORTAR.caliber,
  splashTiles: MORTAR_SPLASH_TILES,
  scatterNearTiles: MORTAR_SCATTER_NEAR_TILES,
  scatterFarTiles: MORTAR_SCATTER_FAR_TILES,
  flightNear: MORTAR_FLIGHT_NEAR,
  flightFar: MORTAR_FLIGHT_FAR,
  apexNear: MORTAR_APEX_NEAR,
  apexFar: MORTAR_APEX_FAR,
  armorChip: MORTAR_ARMOR_CHIP,
  trackChance: MORTAR_TRACK_CHANCE,
};

/**
 * Towed field gun. Two crewmen haul it by the trail, barrel last, at a crawl.
 * A supply truck can hitch it and tow it far faster. It fires only once it has
 * stopped and the crew has set the trail. The shell is lobbed like a mortar
 * bomb but far bigger: a wide burst that kills infantry, smashes buildings,
 * and takes a real bite out of a tank. The longest reach on the field, a very
 * slow reload, and it will not fire at anything close.
 * Small arms cannot hurt the gun. They hit the crew, less often through the
 * shield. Any infantry can take a dead man's place, and an empty gun goes to
 * whoever crews it. Shells, bombs, rockets, and blasts wreck it.
 */
export const ARTILLERY_RANGE_TILES = t(27);
export const ARTILLERY_MIN_RANGE_TILES = t(8);
/** Crewmen it leaves the Armory with, and the most it holds. */
export const ARTILLERY_CREW = 2;
/** One crewman's health. A soldier who joins keeps his share of it. */
export const ARTILLERY_CREW_HP = 40;
/** Seconds the crew needs to set the trail after the gun stops. */
export const ARTILLERY_SETUP_SECONDS = 4;
/** Seconds between shots with a full crew. One man alone takes twice as long. */
export const ARTILLERY_RELOAD = 14;
/** Chance a bullet on the gun finds a crewman, by the face it strikes. The shield covers the front. */
export const ARTILLERY_CREW_HIT_FRONT = 0.3;
export const ARTILLERY_CREW_HIT_SIDE = 0.65;
export const ARTILLERY_CREW_HIT_REAR = 0.85;
/** Share of a shell or blast on the gun that also lands on each crewman. */
export const ARTILLERY_CREW_BLAST_SHARE = 0.6;
/** Towing truck's speed as a share of its own. */
export const ARTILLERY_TOW_SPEED = 0.8;
/** Gap between the truck's tail and the gun's trail while hitched. */
export const ARTILLERY_TOW_GAP = 2;
/** A truck within this gap of the gun hitches it, and the gun swings round behind. */
export const ARTILLERY_HITCH_SLACK = 10;
/** Field-gun shells hit buildings this many times harder. */
export const ARTILLERY_BUILDING_MUL = 2;
/** Rockets and missiles (Rocketer, Titan pods, Nebelwerfer) hit buildings this much harder. */
export const ROCKET_BUILDING_MUL = 1.3;
export const ARTILLERY_SHELL: LobShellDef = {
  damage: 150,
  penetration: 40,
  caliber: 105,
  splashTiles: t(3.6),
  scatterNearTiles: t(0.6),
  scatterFarTiles: t(1.8),
  flightNear: 2.6,
  flightFar: 4.6,
  apexNear: 70,
  apexFar: 120,
  armorChip: 0.2,
  trackChance: 0.35,
};

/**
 * Rocketer's launcher: one tube on the shoulder, one Titan rocket in it. The
 * rocket is the pods' own (TITAN_ROCKET): straight and fast, a scattered burst
 * that shreds infantry and dents a hull, fused beside a plane when he aims at
 * one. He lays it by eye, so it scatters like the pods. Each shot he pulls the
 * next rocket off his back and loads the tube, a slow reload; like every
 * infantry clip, the pack never runs dry.
 */
export const LAUNCHER_RELOAD = 7.5;
/** Elevation units above his eye where the tube rides on the shoulder. */
export const LAUNCHER_LIFT = 1;
export const LAUNCHER = {
  id: "launcher" as const,
  name: "Rocket Launcher",
  blurb: "One rocket at a time, straight and fast. Loose at full reach, tighter as the target closes. Bursts among infantry, dents a tank, and a side or rear hit usually breaks a tank's tracks. Bursts beside a plane or a low drone. Slow to reload.",
  damage: TITAN_ROCKET.damage,
  penetration: TITAN_ROCKET.penetration,
  caliber: TITAN_ROCKET.caliber,
  spreadDeg: 0,
  cooldown: 1,
  clip: 1,
  reload: LAUNCHER_RELOAD,
  rangeTiles: LAUNCHER_RANGE_TILES,
  bulky: true,
} as const satisfies InfantryGun;
/** The launcher's rocket flies and bursts like a Titan pod's, off the shoulder. */
export const LAUNCHER_ROCKET_RACK: RocketRackDef = { ...TITAN_ROCKET_RACK, salvo: 1, podLift: LAUNCHER_LIFT };

/**
 * Rocketer's second round. One missile, not a pack: a supply truck brings
 * another. Half again as fast as the tube's rocket, still on the hull at full
 * reach, and the blast is built to wreck armor. Fitting it on the tube takes
 * PENETRATOR_ARM_SECONDS when it was not already loaded. He spends it only on
 * a shot you order. Interceptors have to connect several times to bring it down.
 */
export const PENETRATOR_ARM_SECONDS = 3.5;
/** Supply points a truck spends to hand him another. A shell is SUPPLY_SHELL_COST. */
export const PENETRATOR_SUPPLY_COST = 6;
/** Connecting CIWS or RAM bursts before the missile comes apart. */
export const PENETRATOR_PLATE = 4;
export const PENETRATOR_SPEED = TITAN_ROCKET_SPEED * 1.5;
export const PENETRATOR_RACK: RocketRackDef = {
  salvo: 1,
  interval: 0,
  reload: 0,
  scatterNearTiles: t(0.05),
  scatterFarTiles: t(0.22),
  splashTiles: t(0.6),
  speed: PENETRATOR_SPEED,
  podLift: LAUNCHER_LIFT,
  damage: 36,
  /** Flat hit points off an armored hull at the blast center. The tube's rocket is 11. */
  armorDamage: 100,
  airMul: 0.8,
  penetration: 140,
  caliber: 120,
  antiAir: true,
  plate: PENETRATOR_PLATE,
};
export const PENETRATOR = {
  id: "penetrator" as const,
  name: "High penetration",
  blurb: "One missile. Half again as fast as the tube's rocket, accurate out to full reach, and it wrecks armor. Fitting it takes a few seconds unless it is already on the tube. He fires it only when you order the shot. A supply truck brings another. Hard for a CIWS or a RAM to bring down.",
  damage: PENETRATOR_RACK.damage,
  penetration: PENETRATOR_RACK.penetration,
  caliber: PENETRATOR_RACK.caliber,
  spreadDeg: 0,
  cooldown: 1,
  clip: 1,
  reload: 0,
  rangeTiles: LAUNCHER_RANGE_TILES,
  bulky: true,
} as const satisfies InfantryGun;

/**
 * Pyro's flamethrower. Two fuel tanks on his back and a lance with a pilot
 * flame. A trigger pull throws a short burst: FLAMER_BURST globs of burning
 * fuel, one a tick, that arc onto the ground around the aim point and splash
 * the soldiers they land among. Every glob that lands on dry ground leaves it
 * burning (GroundFire), and the fire keeps burning whoever stands in it. The
 * tanks hold only FLAMER_BURSTS bursts and never refill by themselves: bring a
 * supply truck. The jet goes over sandbags and in through a house's windows.
 * Burning fuel only scorches armor plate, so he leaves tanks alone.
 */
export const FLAMER_BURST = 8;
export const FLAMER_BURSTS = 3;
/** Seconds between the globs of one burst. */
export const FLAMER_GLOB_INTERVAL = TICK_DT;
/** Seconds from the end of one burst to the next trigger pull. */
export const FLAMER_BURST_PAUSE = 1.6;
/** Seconds a glob takes to reach the end of the jet. It arcs a little. */
export const FLAMER_GLOB_SECONDS = 0.35;
/** Air height the jet reaches mid-way, elevation units. */
export const FLAMER_APEX = 1.2;
/** Glob scatter around the aim point: along the jet, then across it. World pixels. */
export const FLAMER_SCATTER_ALONG = t(0.45) * TILE_SIZE;
export const FLAMER_SCATTER_ACROSS = t(0.22) * TILE_SIZE;
/** A glob splashes burning fuel on everyone inside this disk. World pixels. */
export const FLAMER_SPLASH = t(0.3) * TILE_SIZE;
export const FLAMER = {
  id: "flamer" as const,
  name: "Flamethrower",
  blurb: "A short jet of burning fuel. It splashes the soldiers it lands among and sets the ground alight. Force-attack burns a tree down. Three bursts in the tanks; only a supply truck refills them.",
  damage: 6,
  penetration: 0,
  caliber: 1,
  spreadDeg: 0,
  cooldown: FLAMER_GLOB_INTERVAL,
  clip: FLAMER_BURST * FLAMER_BURSTS,
  reload: 0,
  rangeTiles: FLAMER_RANGE_TILES,
  bulky: true,
} as const satisfies InfantryGun;

/**
 * Burning ground. Each glob that lands on dry ground leaves a patch of fire,
 * or feeds a patch already burning next to it. A patch burns for FIRE_SECONDS,
 * dying down over its last FIRE_DIE_SHARE, and burns every soldier standing in
 * it, friend or foe. The Cyborg's plating and the Pyro's own suit keep most of
 * it off; soft vehicles scorch; armor plate does not care. Water puts it out.
 */
export const FIRE_SECONDS = 11;
/** Share of the life at the end where the flames sink and burn less. */
export const FIRE_DIE_SHARE = 0.3;
/** World-pixel radius of a fresh patch. Feeding it grows it to FIRE_RADIUS_MAX. */
export const FIRE_RADIUS = t(0.35) * TILE_SIZE;
export const FIRE_RADIUS_MAX = t(0.6) * TILE_SIZE;
/** A glob this close to a burning patch feeds it instead of starting a new one. Share of its radius. */
export const FIRE_MERGE_SHARE = 0.7;
/** HP per second to an unarmored soldier standing in the flames. */
export const FIRE_BURN_DPS = 22;
/** Burn share for the Cyborg's plating and the Pyro's fireproof suit. */
export const FIRE_CYBORG_MUL = 0.15;
export const FIRE_PYRO_MUL = 0.2;
/** Burn share for a vehicle with no armor plate (Mauler, supply truck). */
export const FIRE_SOFT_VEHICLE_MUL = 0.3;
/** Most patches burning at once. The oldest go out first. */
export const FIRE_CAP = 160;
/**
 * The Pyro's tanks. When he is killed there is a small chance they go up: a
 * fireball that throws burning fuel around him. The fuller the tanks, the
 * bigger the chance.
 */
export const PYRO_COOKOFF_CHANCE_FULL = 0.22;
export const PYRO_COOKOFF_CHANCE_DRY = 0.06;
/** World pixels. */
export const PYRO_COOKOFF_RADIUS = t(1.1) * TILE_SIZE;
/** Blast damage at the heart of the fireball. Falls off to a quarter at the edge. */
export const PYRO_COOKOFF_DAMAGE = 70;
/** Fire patches the cook-off leaves in a ring around the body. */
export const PYRO_COOKOFF_FIRES = 7;

/**
 * Medic. He walks to wounded infantry inside this disk, then has to stand
 * against them. Farther than this, he leaves them and goes back to his order.
 */
export const MEDIC_SEEK_TILES = t(6);
/**
 * An idle supply truck drives to allies short of ammo inside this disk and tops them up.
 * Farther than this, it lets them go. A player order wins.
 */
export const SUPPLY_SEEK_TILES = t(6);
/**
 * An idle engineer walks to damaged allied armor inside this disk and patches it.
 * Farther than this, he lets it go. A player order wins.
 */
export const ENGINEER_SEEK_TILES = t(6);
/** Extra world pixels past body clearance that still count as hands-on. */
export const MEDIC_TOUCH_SLACK = 8;
/** HP per second while in contact. No charges and no cooldown. */
export const MEDIC_HEAL_PER_SEC = 3;
/** Seconds of uninterrupted contact to clear every broken arm and leg. Topping up HP clears them sooner. */
export const MEDIC_MEND_SECONDS = 8;
/** Seconds without losing HP before a medic starts patching himself up. */
export const MEDIC_SELF_HEAL_DELAY = 6;
/** HP per second a medic restores on himself once the delay has passed. */
export const MEDIC_SELF_HEAL_PER_SEC = 1;
/** Seconds without losing HP before a medic sets his own broken arm or leg. */
export const MEDIC_SELF_MEND_DELAY = 20;
/** Share of max HP a medic needs before he can set his own limbs. */
export const MEDIC_SELF_MEND_HP = 0.5;

/** Supply points a truck leaves the Armory with. Shells cost more than bullets. */
export const SUPPLY_CARGO = 120;
/** Cargo spent to restore one tank shell. */
export const SUPPLY_SHELL_COST = 2;
/** Coaxial or Walker rounds restored per cargo point. */
export const SUPPLY_ROUNDS_PER_POINT = 10;
/** Cargo spent per second while handing ammo across. */
export const SUPPLY_PER_SEC = 8;
/** Cargo restored per second while parked on an owned Armory. */
export const SUPPLY_REARM_PER_SEC = 30;
/** Cargo a truck scrounges back per second on its own, anywhere. Empty to full in four minutes. */
export const SUPPLY_REGEN_PER_SEC = 0.5;
/** Bodies in the cab and bed, factory driver included. */
export const TRUCK_SEATS = 2;
/**
 * Occupant HP while inside the truck, versus standing in the open.
 * Side and rear hits then deal a smaller share, so those angles last longer.
 */
export const TRUCK_RIDER_HP_MUL = 1.35;
/** Share of a hull hit that reaches each soldier. The cab is the weak face. */
export const TRUCK_RIDER_SHARE_FRONT = 0.62;
export const TRUCK_RIDER_SHARE_SIDE = 0.28;
export const TRUCK_RIDER_SHARE_REAR = 0.22;
/** Chance a bullet on the front plate kills whoever is driving. */
export const DRIVER_KILL_CHANCE = 0.18;

/**
 * Ju 87 Stuka and the Airfield that keeps it. A plane lives on one pad of
 * one Airfield. It takes off on an order, flies straight over hills and
 * houses, and comes home to land when the bomb and belts are spent or the
 * tank runs low. On the pad it refuels, rearms, and patches up. Ordered to
 * guard an area, it takes off again for that area once the load and the tank
 * are full, and it keeps doing that until given another order. With no
 * pad to come home to it glides until the fuel runs out, then goes down.
 *
 * Heights are elevation units above the ground under the plane
 * (HEIGHT_WORLD world pixels each), the same scale as a mortar arc.
 */
/** Planes one Airfield parks, trains, and rearms. */
export const AIRFIELD_PADS = 4;
/**
 * Airfield layout, as shares of its footprint (x east along the strip, y
 * south). Hangar, tower, and fuel stand in the back band; the strip runs the
 * whole length; the hardstands sit in a row on the near side of it, each in
 * its own sandbag revetment. tools/sprites/render_procedural.py paints the
 * same fractions.
 */
export const AIRFIELD_BACK_DEPTH = 0.27;
export const AIRFIELD_RUNWAY_Y = 0.44;
export const AIRFIELD_RUNWAY_HALF = 0.1;
/** Each end of the strip, from the footprint edge. Touchdown aims here. */
export const AIRFIELD_THRESHOLD = 0.06;
export const AIRFIELD_PAD_Y = 0.78;
export const AIRFIELD_PAD_X: readonly number[] = [0.16, 0.39, 0.61, 0.84];
/** Speed share taxiing between a hardstand and the strip. */
export const AIR_TAXI_SPEED = 0.25;
/** Turn-rate multiple for a plane pivoting on the ground. */
export const AIR_GROUND_TURN_MUL = 1.5;
/** Cruise height. Above every tree, house, and hill lip. */
export const AIR_CRUISE_ALT = 24;
/** Height the dive pulls out at and lets the bomb go. */
export const AIR_RELEASE_ALT = 5;
/** Height a strafing pass (belts only, no bomb) settles at. */
export const AIR_STRAFE_ALT = 7;
/** Elevation units per second the plane climbs or dives. */
export const AIR_CLIMB_PER_SEC = 6;
export const AIR_DIVE_PER_SEC = 14;
/**
 * A plane that dies in the air does not pop. It falls, nose wandering, trailing
 * smoke, and nothing else can hurt it until it meets the ground.
 * Each fall rolls its own glide. A low roll drops nearby. A high roll runs out
 * much farther, still banking, and meets the ground around the end of that run.
 */
/** Nearest a wreck comes down, counted the same way as other tile ranges. */
export const AIR_CRASH_RANGE_MIN = t(0.55);
/** Farthest a wreck may glide from where the plane was hit. */
export const AIR_CRASH_RANGE_MAX = t(8);
/** Cruise-speed share on a short fall. */
export const AIR_CRASH_SPEED_MIN = 0.28;
/** Cruise-speed share on a long glide. */
export const AIR_CRASH_SPEED_MAX = 0.92;
/** Slowest sink, elevation units per second. A plane that is already low still comes down. */
export const AIR_CRASH_SINK_MIN = 3.5;
/** Fastest sink. A short fall from cruise is pulled down at this rate. */
export const AIR_CRASH_SINK_MAX = 11;
/** Heading change along a long glide, degrees. A bend, so the track is not a ruler line. */
export const AIR_CRASH_TURN_MIN = 28;
/** Heading change along a short fall, degrees. A hook, not a loop back onto the hit. */
export const AIR_CRASH_TURN_MAX = 100;
/** Shortest a fall lasts, seconds, so a tiny glide is still a fall. */
export const AIR_CRASH_TIME_MIN = 0.65;
/** Longest a fall lasts, seconds. Past this the airframe is pulled down. */
export const AIR_CRASH_TIME_MAX = 5.5;
/**
 * How much of a straight run the sink is timed for. Short falls are timed under
 * their reach so they drop. Long glides are timed to arrive as they touch.
 */
export const AIR_CRASH_COVER_MIN = 0.62;
export const AIR_CRASH_COVER_MAX = 1;
/** Degrees per second of shiver on the chosen bank. */
export const AIR_CRASH_SHIVER_DEG = 8;
/** Infantry, a drone, or a Jump Jet the airframe strikes. */
export const AIR_CRASH_SOFT_DAMAGE = 500;
/** Share of a hull's max HP when the airframe strikes it. */
export const AIR_CRASH_HULL_SHARE = 0.85;
/** At least this much, so a light hull does not shrug the impact. */
export const AIR_CRASH_HULL_MIN = 90;
/** A structure the airframe hits, at the contact. */
export const AIR_CRASH_BUILDING_DAMAGE = 720;
/** The ground impact also hurts this far out, gameplay tiles. */
export const AIR_CRASH_SPLASH_TILES = t(1.15);
/** Distance from the target the dive starts, gameplay tiles. */
export const AIR_DIVE_START_TILES = t(8);
/** Past the target, fly straight this far before turning in again. */
export const AIR_EXTEND_TILES = t(7);
/** Half-angle off the nose the target must be inside to start a dive. */
export const AIR_DIVE_CONE_DEG = 30;
/** Radius a plane circles a point it was sent to. */
export const AIR_ORBIT_TILES = t(3);
/** Seconds of the takeoff roll before the wheels leave the strip. */
export const AIR_TAKEOFF_SECONDS = 2.5;
/** Speed share on the ground roll and on the landing flare. */
export const AIR_ROLL_SPEED = 0.45;
/** Straight final before the pad, gameplay tiles. */
export const AIR_FINAL_TILES = t(8);
/** Seconds of flight in a full tank. */
export const AIR_FUEL_SECONDS = 100;
/** Head home once the tank holds this many seconds past the flight back. */
export const AIR_FUEL_RESERVE = 10;
/** Pad service. Fuel and HP per second; the bomb is hung after BOMB_REARM_SECONDS. */
export const AIR_REFUEL_PER_SEC = 12;
export const AIR_REPAIR_PER_SEC = 4;
export const AIR_BELT_REARM_PER_SEC = 150;
export const BOMB_REARM_SECONDS = 8;
/**
 * Shots at a plane in the air open this much wider. It is fast and it is
 * above the shooter. Small arms still bring one down if it lingers.
 */
export const AIR_TARGET_SPREAD = 2.2;
/** A round within this many elevation units of the plane's height can hit it. */
export const AIR_HIT_BAND = 4;
/**
 * SC 250 under the belly. One per sortie.
 * A soldier under the blast dies; the rim of the burst only wounds.
 * A direct hit (inside BOMB_DIRECT_TILES) goes through a tank's roof and
 * takes half the hull. A near miss throws a track and dents it.
 */
export const BOMB_SPLASH_TILES = t(2);
export const BOMB_DIRECT_TILES = t(0.5);
export const BOMB_DAMAGE = 70;
/** Share of a hull's max HP on a direct hit, and at the center of a near miss. */
export const BOMB_ARMOR_DIRECT = 0.5;
export const BOMB_ARMOR_NEAR = 0.1;
export const BOMB_TRACK_CHANCE = 0.5;
/** Buildings take this at the center, with the same falloff. */
export const BOMB_BUILDING_DAMAGE = 240;
export const BOMB_CALIBER = 250;
/** Dirt scar relative to a shell of this caliber. The SC 250 leaves half that hole. */
export const BOMB_HOLE_SCALE = 0.5;
/** Seconds from release to the ground. */
export const BOMB_FALL_SECONDS = 0.7;
/** Release this far short of the target so the bomb carries onto it. */
export const BOMB_RELEASE_TILES = t(3.5);
export const BOMB_SCATTER_TILES = t(0.35);
export const STUKA_BOMBS = 1;
/**
 * Two MG 17 in the wings. 1,200 rounds a minute each, so four rounds a
 * tick. The belts together hold 1,000 rounds — about twelve seconds on the
 * trigger. They fire only at soft targets; plate shrugs them off.
 */
export const STUKA_MG_PER_TICK = (MG42_RPM / 60 / (1 / TICK_DT)) * 2;
export const STUKA_MG_ROUNDS = 1000;
/**
 * Fw 190 fighter. No bomb: two 30 mm cannon, one in a gondola under each
 * wing. It hunts planes in the air and strafes the ground in barrages: each
 * pass empties one burst from both wings at once, two straight parallel lines
 * of rounds laid along the bearing to the target and walking through it.
 * Fired down from the dive, a round meets a hull's roof — about
 * ROOF_ARMOR_SHARE of its side plate — so even the heaviest tank is hurt. Each
 * round that bites takes FW190_ROOF_HP_SHARE of the hull's max HP, whatever
 * its size. Plunging fire comes down through tree cover; a house in the line
 * still takes the rounds.
 */
export const FW190_BARRAGES = 3;
/** Rounds in one wing's line. A barrage fires two lines. */
export const FW190_BARRAGE_ROUNDS = 6;
/** Release distance: the barrage goes when the target is this close and on the nose. */
export const FW190_BARRAGE_TILES = t(4.5);
/** Half-angle off the nose the target must be inside for a release. */
export const FW190_BARRAGE_ARC_DEG = 12;
/** Length of each line on the ground, centered on the target. */
export const FW190_BARRAGE_LINE_TILES = t(1.25);
/** Wing guns sit this share of the plane's radius either side of the centerline: the gap between the lines. */
export const FW190_WING_GUN_OFFSET = 0.6;
/** Seconds between barrages. A strafing run is longer than this; a dogfight is not. */
export const FW190_BARRAGE_COOLDOWN = 2.5;
/** Roof plate, as a share of the side plate. */
export const ROOF_ARMOR_SHARE = 0.3;
export const FW190_ROOF_HP_SHARE = 0.03;
/** Chance a round through the roof wrecks the engine under the deck. */
export const FW190_ROOF_ENGINE_CHANCE = 0.12;
/**
 * A 30 mm round that lands in the dirt bursts: soldiers inside this radius
 * take up to FW190_SPLASH_DAMAGE, less toward the edge. Plate shrugs it off.
 */
export const FW190_SPLASH_TILES = t(0.25);
export const FW190_SPLASH_DAMAGE = 34;

/**
 * BV 222 transport flying boat. No guns and no bomb. Its bay holds one load,
 * chosen on the pad: a canister of cluster mines, a supply crate, or a stick
 * of up to BV222_TROOPS ground units. Infantry can board on the hardstand from
 * any load; that selects paratroops, and the bay stays on paratroops while
 * anyone is aboard. Force-attack the ground (Drop, or hold Ctrl and click)
 * and it runs in low and level over the point and lets go, whatever the load.
 */
export type AirDrop = "mines" | "crate" | "troops";
export const AIR_DROPS: readonly AirDrop[] = ["mines", "crate", "troops"];
export const BV222_TROOPS = 10;
/** Player-facing name and one line for each load. */
export const AIR_DROP_INFO: Record<AirDrop, { name: string; blurb: string }> = {
  mines: { name: "Mines", blurb: "A canister of mines. It bursts over the point and scatters them; they wait for any feet or tracks, friend or foe. You and your allies see each one. The enemy does not — it only goes off when something runs over it. A supply truck can disable one of yours for scrap." },
  crate: { name: "Crate", blurb: "A supply crate on a parachute. Your units standing at it take ammo and patch up." },
  troops: { name: "Paratroops", blurb: "Infantry board on the hardstand from any load (right-click the plane); that selects paratroops, and no other load can be chosen while anyone is aboard. Other ground units board once paratroops is selected. They jump over the point and hang under canopies until they land. Rifles, machine guns, and anti-aircraft guns can reach them in the air. If the plane is destroyed, everyone still aboard bails out first." },
};
/** Height of the drop run: low and level, so a crate lands where it was meant to and the jumpers are not long in the air. */
export const BV222_DROP_ALT = 9;
/** Lets go once the drop point is this close under the nose. */
export const BV222_DROP_TILES = t(1.2);
/** Seconds between two jumpers leaving the door. The stick strings out along the plane's track. */
export const PARA_DOOR_SECONDS = 0.12;
/** Elevation units a parachute sinks each second. From the drop run that is about four seconds of hanging. */
export const PARA_SINK_PER_SEC = 2.2;
/** Share of the plane's speed a jumper carries out of the door. It bleeds off under the canopy. */
export const PARA_THROW = 0.25;
/** Per second: the share of that throw still left. */
export const PARA_DRAG = 0.35;
/** Bomblets scattered by one canister. Each lies where it falls as a mine. */
export const CLUSTER_MINES = 14;
export const CLUSTER_RADIUS_TILES = t(2.5);
export const CLUSTER_FALL_SECONDS = 1.1;
/** Seconds from landing until a bomblet is live. */
export const MINE_ARM_SECONDS = 2;
/** Seconds a mine lies before its fuze gives out and it pops by itself. */
export const MINE_LIFE_SECONDS = 300;
/** Any ground unit within this of a live mine sets it off. A supply truck defusing that mine does not. */
export const MINE_TRIGGER_TILES = t(0.3);
export const MINE_SPLASH_TILES = t(0.8);
/** Soldier on top of it. A rifleman does not get up. */
export const MINE_INFANTRY_DAMAGE = 55;
/** Unarmored vehicle: share of max HP. */
export const MINE_SOFT_SHARE = 0.3;
/** Armored hull: share of max HP through the belly. */
export const MINE_ARMOR_SHARE = 0.08;
export const MINE_TRACK_CHANCE = 0.7;
export const MINE_CALIBER = 20;
export const MINE_CAP = 240;
/** Seconds a supply truck spends disabling one mine. */
export const MINE_DISABLE_SECONDS = 2;
/** Scrap paid to the truck's owner when the mine comes up. */
export const MINE_SCRAP = 40;
/** Supply points in a dropped crate. The supply truck carries SUPPLY_CARGO. */
export const CRATE_SUPPLY = 80;
export const CRATE_SINK_PER_SEC = 2.5;
/** Allied units this close to a crate on the ground draw from it. */
export const CRATE_REACH_TILES = t(1.5);
/** Hand-outs a second, shared among everyone at the crate. */
export const CRATE_PER_SEC = 8;
/** HP one supply point patches: a field dressing, or a crate of spares for a hull. */
export const CRATE_HP_PER_POINT = 4;
/** Seconds a crate lies before it is looted or rots, whatever is left. */
export const CRATE_LIFE_SECONDS = 240;

/**
 * Bunker. Poured concrete, low to the ground, firing slits on every face.
 * The walls take most of what hits them, so the men inside are the safest
 * infantry on the map. It sits low, so it adds no sight or reach.
 */
export const BUNKER_GARRISON_CAP = 5;
/** Occupant HP multiplier inside. A civilian house is 3×. */
export const BUNKER_GARRISON_HP_MUL = 4;
/** Share of each hit on the bunker that reaches the men inside. */
export const BUNKER_WOUND_MUL = 0.35;
/** Solid height of the roof slab, elevation units. A one-story house is STORY_COVER_HEIGHT. */
export const BUNKER_COVER_HEIGHT = 4;
/** Infantry that fit through the door and the firing slits. */
export const BUNKER_TYPES: readonly EntityType[] = ["rifleman", "gunner", "sniper", "atinfantry", "rocketer", "pyro", "medic", "engineer"];
/**
 * Trench. A one-man fighting slit an engineer digs in the field, with the
 * spoil thrown up as a parapet. Moderate cover: better than the open, less
 * than a house, far less than a bunker. Open-topped, so a mortar works from it.
 */
export const TRENCH_GARRISON_CAP = 1;
/** Occupant HP multiplier inside. A house is 3×, a bunker 4×. */
export const TRENCH_GARRISON_HP_MUL = 2;
/** Share of each hit on the trench that reaches the man in it. A bunker passes 35%. */
export const TRENCH_WOUND_MUL = 0.6;
/** Parapet height above the ground, elevation units. Below a crouched man's eye. */
export const TRENCH_COVER_HEIGHT = 2;
/** The bunker's roster plus the mortarman, who needs the open sky. */
export const TRENCH_TYPES: readonly EntityType[] = [...BUNKER_TYPES, "mortarman"];
/**
 * Mammoth. A slow armored battle platform on four legs, with firing slits
 * down both flanks. It carries a Bunker's worth of
 * infantry and they fire out of it. The hull takes every hit and nothing
 * reaches them, but they go down with it.
 */
export const MAMMOTH_GARRISON_CAP = BUNKER_GARRISON_CAP;
/** Bow machine gun: a short belt that reloads itself, a small traverse. */
export const MAMMOTH_MG_BELT = 60;
export const MAMMOTH_MG_BELT_RELOAD = 4;
export const MAMMOTH_MG_ARC = 25;
export const MAMMOTH_MG_RANGE_TILES = t(8);
/** Move-speed share while the Mammoth is wading. Thirty percent slower than dry ground. */
export const MAMMOTH_WADE_SPEED = 0.7;
/** A medic inside: every occupant regains this share of max HP each second. Does not stack. */
export const BUNKER_MEDIC_REGEN_FRAC = 0.004;
/** An engineer inside: the bunker regains this much HP each second. Does not stack. */
export const BUNKER_ENGINEER_REPAIR_PER_SEC = 1.5;

/**
 * Watch tower. A concrete shaft with a sandbagged, slitted cab on top. From up
 * there the crew sees far past anyone on the ground, but a rifle does not
 * carry much farther for being high, and the thin cab walls stop less than a
 * bunker's slab. The same infantry that fit a bunker fit the tower.
 */
export const TOWER_GARRISON_CAP = 3;
/** Occupant HP multiplier inside. Same as a civilian house, below the bunker. */
export const TOWER_GARRISON_HP_MUL = 3;
/** Share of each hit on the tower that reaches the men inside. Bunker is 0.35. */
export const TOWER_WOUND_MUL = 0.6;
/** Extra sight from the cab, watch mode. A house window is GARRISON_WATCH_SIGHT_BONUS. */
export const TOWER_SIGHT_BONUS = t(8);
/** Extra weapon reach from the cab. Same as a house window: height helps the eye more than the rifle. */
export const TOWER_REACH_BONUS = t(2);
/** Stories to the cab. Sets its solid height and the muzzle lift of the men inside. */
export const TOWER_FLOORS = 3;
/** Eye in the cab, elevation units: the muzzle lift of a garrison, well over the treetops. */
export const TOWER_EYE_HEIGHT = TOWER_FLOORS * STORY_COVER_HEIGHT * 0.6;

/**
 * Large wall. A tall concrete wall section with firing slits down both faces,
 * laid like the ordinary wall and joined to its neighbours. Infantry garrison
 * a section and fire from the slits; nothing walks through it. Concrete
 * between the bunker and the tower: thinner than a pillbox slab, thicker than
 * a cab wall.
 */
export const LARGE_WALL_GARRISON_CAP = 2;
/** Occupant HP multiplier inside. A tower is 3×, a bunker 4×. */
export const LARGE_WALL_GARRISON_HP_MUL = 3;
/** Share of each hit on the section that reaches the men behind the slits. Bunker 0.35, tower 0.6. */
export const LARGE_WALL_WOUND_MUL = 0.5;
/** Extra sight from the slits, watch mode. A house window is GARRISON_WATCH_SIGHT_BONUS. */
export const LARGE_WALL_SIGHT_BONUS = t(2);
/** Extra weapon reach from the slits. About one terrace. */
export const LARGE_WALL_REACH_BONUS = t(2);
/** Solid height of the section, elevation units. A bunker slab is 4, a trench parapet 2. */
export const LARGE_WALL_COVER_HEIGHT = 3;
/** Eye at the slit, elevation units: the muzzle lift of the men inside. */
export const LARGE_WALL_EYE_HEIGHT = LARGE_WALL_COVER_HEIGHT * 0.6;

/**
 * Gate. A Wall section with a wall on both ends can be turned into a gate: two
 * concrete posts and a lifting boom, like a car-park barrier, with a small lamp
 * on each post. It lifts for its owner's side and their allies and stays down
 * for everyone else; locked, it lets nobody through and shows a padlock.
 */
export const GATE_COST = 40;
/** Seconds for the boom to lift fully, or to drop. */
export const GATE_OPEN_SECONDS = 0.8;
/** Gameplay tiles from the gate at which a friendly ground unit lifts the boom. */
export const GATE_SENSE_TILES = t(3);

/**
 * Day and night. A match opens at morning and runs day, dusk, night, dawn,
 * then day again. In full dark every sight ring and every weapon reach is
 * NIGHT_REACH_MUL of its daylight value; dusk and dawn slide between the two.
 */
export const DAY_SECONDS = 240;
export const DUSK_SECONDS = 20;
export const NIGHT_SECONDS = 150;
/** Sight and weapon reach in full dark, as a share of daylight. */
export const NIGHT_REACH_MUL = 0.5;
/** Lamps come on, and spotlights light the ground, once daylight drops below this. */
export const SPOTLIGHT_ON_DAYLIGHT = 0.5;
/**
 * A held watch tower carries a spotlight on the cab. In the dark its beam
 * lights a cone of ground out to the cab's full daylight watch, seen from the
 * cab's height. Rotate swings it; it does not need a crew. A bullet can smash
 * it, and a scoped rifle does that more often. An engineer fits a new one.
 */
export const SPOTLIGHT_REACH_TILES = INFANTRY_SIGHT_TILES + TOWER_SIGHT_BONUS;
/** Half the beam's width. */
export const SPOTLIGHT_HALF_DEG = 14;
/** How fast the cab lamp turns, for Rotate and for a patrol sweep. */
export const SPOTLIGHT_TURN_DEG_PER_SEC = 18;
/**
 * Armored ground hulls and the Cyborg run a headlight in the dark. Down the
 * hull's nose it gives back the unit's own daylight sight; everywhere else
 * the night ring stands. The Mammoth adds two more, one to each side, and
 * those two drift through a small arc. One smashed fitting darkens every
 * lamp on that hull.
 */
export const HEADLIGHT_HALF_DEG = 20;
/** Lamp headings snap to this step for sight, so a turning hull does not repaint every degree. */
export const LAMP_HEADING_STEP_DEG = 3;
/** Mammoth lamps, counting the nose light. The other two sit on the flanks. */
export const MAMMOTH_LAMPS = 3;
/** Degrees off the nose where each flank lamp is mounted. */
export const MAMMOTH_LAMP_STEP_DEG = 90;
/** Degrees a flank lamp swings either side of its mount. A small arc. */
export const MAMMOTH_LAMP_SWING_DEG = 18;
/** Seconds for one full swing of a flank lamp, out and back. */
export const MAMMOTH_LAMP_PERIOD_SECONDS = 12;

/**
 * Radar Station. A dish on a lattice mast beside an ops hut. While one stands
 * on your side, the command bar's radar panel paints the map; without it the
 * panel is dark and the map has to be read from the field. The dish also
 * sweeps far past anyone's eyes for aircraft: an enemy plane or drone in the
 * air within RADAR_RANGE_TILES that nobody can see shows as a blinking
 * contact on the panel, and nowhere else. The ground stays as dark as before.
 */
export const RADAR_RANGE_TILES = t(56);

/**
 * CIWS. A stationary radar-laid 20mm gatling on a small concrete pad. It needs
 * no crew and no orders: it swings onto the nearest enemy unit it can hurt,
 * planes and paratroopers first, and fires 1,800 rounds a minute. Most of them miss: on a
 * plane the stream sprays wide and high, and only a long pass tends to bring
 * one down. Tank plate shrugs the rounds off, so it leaves tanks alone. A Titan
 * rocket that flies into its reach draws a short burst that seldom bursts it. The belt does not refill by itself —
 * a supply truck tops it up, one full truck for one empty belt.
 */
export const CIWS_RANGE_TILES = t(8);
/** Rounds each tick. Three a tick is 1,800 a minute. */
export const CIWS_SHOTS_PER_TICK = 3;
/** Belt. About forty seconds on the trigger. */
export const CIWS_BELT = 1200;
export const CIWS_GUN = {
  damage: 9,
  /** A light tank's thin side. A Walker or a truck only sometimes takes a round. Not a tank's front. */
  penetration: 22,
  caliber: 20,
  spreadDeg: 3,
} as const;
/**
 * A gatling on a plane fires one stream, not a spray. The rounds of a burst
 * leave close together (CIWS_AIR_SPREAD, CIWS_AIR_Z_SCATTER); the stream as a
 * whole wanders on and off the airframe (GATLING_STREAM_*) because the gun
 * cannot hold a crossing plane. Every round goes the same general way, and
 * the stream connects in stretches.
 *
 * Spread multiple between rounds on a plane in the air, for every gatling.
 */
export const CIWS_AIR_SPREAD = 1.1;
/** Elevation units one round strays above or below the stream (times gatlingSprayOf). */
export const CIWS_AIR_Z_SCATTER = 4;
/** Degrees the stream's bearing wanders off the plane at most (times gatlingSprayOf). */
export const GATLING_STREAM_WANDER_DEG = 10;
/** Elevation units the stream's height wanders above or below the plane at most (times gatlingSprayOf). */
export const GATLING_STREAM_WANDER_Z = 18;
/** How fast the stream wanders, in swings a second. */
export const GATLING_STREAM_WANDER_HZ = 0.8;
/** Gatling cone on anything on the ground, against the gun's catalog spread. About 30% tighter. */
export const GATLING_GROUND_SPREAD_MUL = 1 / 1.3;
/** The pad reaches this much farther for a plane in the air: the radar sees it coming. */
export const CIWS_AIR_REACH_MUL = 1.4;
/** Chance one burst connects on one rocket: a long shot. Each CIWS tries an ordinary rocket once. A heavy round keeps drawing bursts until it comes apart. */
export const CIWS_INTERCEPT_CHANCE = 0.15;
/** Rounds one intercept burst spends. A short belt still tries, at a share of the chance. */
export const CIWS_INTERCEPT_ROUNDS = 12;
/** Rockets one CIWS can engage in one tick. A full Titan salvo takes two ticks. */
export const CIWS_INTERCEPTS_PER_TICK = 2;

/**
 * Gatling heat. Every gatling — the Walker's arms, the Cyborg's arm, the CIWS
 * pad, and the Apocalypse's roof mount — heats with each round and sheds heat
 * all the time. Heat runs 0 to 1. At 1 the barrels are too hot to fire: the
 * gun sits out overheatSeconds and comes back cold. A short burst never
 * overheats; holding the trigger always does.
 */
export interface GatlingHeat {
  /** Heat each round adds. */
  perRound: number;
  /** Heat shed each second, firing or not. */
  coolPerSec: number;
  /** Seconds the gun cannot fire once it reaches 1. */
  overheatSeconds: number;
}
/** CIWS pad. 30 rounds a second. Half again the heat per round: about a second and a half on the trigger, then four to cool. */
export const CIWS_HEAT: GatlingHeat = { perRound: 1.5 / 54.6, coolPerSec: 0.12, overheatSeconds: 4 };
/** Walker. Both arms heat one set of barrels: one arm (20 a second) lasts under three seconds, both about one. */
export const WALKER_HEAT: GatlingHeat = { perRound: 1 / 42.2, coolPerSec: 0.1, overheatSeconds: 4 };
/** Cyborg arm. A single gun on a man's shoulder, 20 a second: under two seconds on the trigger. */
export const CYBORG_HEAT: GatlingHeat = { perRound: 1 / 28.8, coolPerSec: 0.1, overheatSeconds: 4.5 };
/** Apocalypse roof mount. 20 a second. Half again the heat per round: a little over a second on the trigger. */
export const APOCALYPSE_CIWS_HEAT: GatlingHeat = { perRound: 1.5 / 32.4, coolPerSec: 0.12, overheatSeconds: 4 };

/** The gatling's heat, or null for a unit without one. The Apocalypse's is its roof mount. */
export function gatlingHeatOf(type: EntityType): GatlingHeat | null {
  if (type === "ciws") return CIWS_HEAT;
  if (type === "walker") return WALKER_HEAT;
  if (type === "cyborg") return CYBORG_HEAT;
  if (type === "apocalypse") return APOCALYPSE_CIWS_HEAT;
  return null;
}

/**
 * How loosely a gatling throws its rounds, against a CIWS pad of 1 before
 * CIWS_LAY. It widens the cone on every target and the height scatter on a
 * plane. A cheap gun (the Walker, the Cyborg) and a secondary mount (the
 * Apocalypse roof) are laid worse than the dedicated pad. The pad and the
 * roof then lay CIWS_LAY times tighter than these numbers.
 */
export const GATLING_SPRAY: Partial<Record<EntityType, number>> = {
  ciws: 1,
  walker: 1.6,
  cyborg: 1.8,
  apocalypse: 1.5,
};

/** The pad and the Apocalypse roof lay this many times tighter than GATLING_SPRAY. Half again as accurate. */
export const CIWS_LAY = 1.5;

export function gatlingSprayOf(type: EntityType): number {
  const spray = GATLING_SPRAY[type] ?? 1;
  return type === "ciws" || type === "apocalypse" ? spray / CIWS_LAY : spray;
}

/**
 * Max range. A CIWS or a RAM told to reach out lays on targets out to this
 * many times its normal reach. Past the normal reach its fire scatters wider
 * the farther it goes, up to RADAR_LONG_RANGE_SPREAD at the edge. Rockets are
 * still only met inside the normal reach.
 */
export const RADAR_LONG_RANGE_MUL = 1.5;
/** Cone (and rocket scatter) multiple at the far edge of max range. */
export const RADAR_LONG_RANGE_SPREAD = 4;

export const RADAR_RANGE_MODES = [
  {
    id: "normal" as const,
    name: "Normal reach",
    blurb: "Engage inside the mount's own reach, where it is laid best.",
  },
  {
    id: "max" as const,
    name: "Max range",
    blurb: "Reach half as far again. Past the normal reach the fire scatters wide — at the edge it rarely hits. Rockets are still only met up close.",
  },
] as const;

/**
 * Apocalypse roof mount. The CIWS gun on a smaller house over the turret: the
 * same 20mm rounds, fewer barrels, a shorter reach, and a belt the size of a
 * tank's stowage. It lays itself. A hostile missile inside its reach is the
 * first thing it shoots, and it bursts that missile more often than a pad CIWS
 * does. With the sky clear it takes a plane, then infantry, and sometimes a Walker or a truck.
 */
export const APOCALYPSE_CIWS_RANGE_TILES = t(7);
/** Rounds each tick. Two a tick is 1,200 a minute. */
export const APOCALYPSE_CIWS_SHOTS_PER_TICK = 2;
/** Belt. About thirty seconds on the trigger. */
export const APOCALYPSE_CIWS_BELT = 600;
/** The small house swings much faster than the turret under it. */
export const APOCALYPSE_CIWS_TURN_DEG_PER_SEC = 360;
/**
 * Chance the roof mount bursts one missile. Better than the pad, because the
 * missile is coming straight at the gun, but most still get through.
 */
export const APOCALYPSE_CIWS_INTERCEPT_CHANCE = 0.3;
/** Seconds between the two main-gun barrels. Six ticks. The long reload starts after the second. */
export const APOCALYPSE_TWIN_GAP = 6 * TICK_DT;
/**
 * Seconds the second barrel stays owed, counting from the first shot. The gap
 * sits inside this. If the gun cannot lay before it ends, that round is lost
 * and the long reload starts.
 */
export const APOCALYPSE_TWIN_WINDOW = 12 * TICK_DT;

/**
 * RAM. A radar-laid launcher of short rockets on the same pad as the CIWS. Like
 * the CIWS it needs no orders: it swings onto the nearest enemy unit it can
 * hurt, planes and paratroopers first, and leaves tanks and buildings alone. It fires a barrage
 * like the Nebelwerfer's — one or two rockets at a time, a salvo of eight —
 * but short and tight: the rockets fly straight and fast and scatter a
 * fraction as wide. Aimed at a plane they burst at its height. An incoming
 * rocket in reach draws one interceptor, which may burst it in the air. The
 * rack does not refill by itself — a supply truck tops it up.
 */
export const RAM_RANGE_TILES = t(11);
export const RAM_SALVO = 8;
/** Four salvos. */
export const RAM_ROCKET_AMMO = RAM_SALVO * 4;
export const RAM_ROCKET: RocketRackDef = {
  salvo: RAM_SALVO,
  interval: 0.12,
  intervalJitter: 0.1,
  volleyMax: 2,
  reload: 7,
  scatterNearTiles: t(0.1),
  scatterFarTiles: t(0.6),
  splashTiles: t(1.1),
  speed: t(22) * TILE_SIZE,
  podLift: 3,
  damage: 30,
  armorDamage: 5,
  airMul: 1.5,
  penetration: 18,
  caliber: 127,
  antiAir: true,
  laid: true,
};
/** Chance one interceptor connects on one rocket. The RAM, not the CIWS, is the missile screen. Each RAM tries an ordinary rocket once. A heavy round draws another interceptor until it comes apart. */
export const RAM_INTERCEPT_CHANCE = 0.6;
/** Seconds from one interceptor to the next. Between them the rack is not free to fire. */
export const RAM_INTERCEPT_INTERVAL = 0.3;

/**
 * Drone Op and his one quadcopter. The drone launches from his hands and
 * becomes its own unit. It flies only inside DRONE_LEASH_TILES of him, and
 * only while the battery lasts; low on charge it flies back and he stows it
 * to recharge. Lost in the air, it is gone: he builds another over
 * DRONE_REBUILD_SECONDS.
 *
 * Surveillance holds it high: wide sight, and only anti-air guns (the MG42
 * and the gatlings) can reach it. Search & Destroy brings it low to hunt: it
 * dives on a target and bursts. Down there rifles, machine guns, and rockets
 * reach it. Tank shells, mortars, and bombs never do.
 */
export type DroneMode = "surveil" | "strike";
export const DRONE_MODES: readonly DroneMode[] = ["surveil", "strike"];
export const DRONE_MODE_LABEL: Record<DroneMode, string> = {
  surveil: "Surveillance",
  strike: "Search & Destroy",
};
/** Radius around the Drone Op the drone may fly, gameplay tiles. */
export const DRONE_LEASH_TILES = t(14);
/** Seconds aloft on a full battery. */
export const DRONE_BATTERY_SECONDS = 70;
/** Turn back once the charge holds only this many seconds past the flight home. */
export const DRONE_BATTERY_RESERVE = 5;
/** Battery seconds regained per second stowed. A flat pack fills in 20 s. */
export const DRONE_RECHARGE_PER_SEC = DRONE_BATTERY_SECONDS / 20;
/** Charge needed to launch. */
export const DRONE_LAUNCH_MIN_SECONDS = 15;
/** Seconds to put a new drone together after one is lost. */
export const DRONE_REBUILD_SECONDS = 75;
/** Surveillance height. Above DRONE_HIGH_ALT, so only anti-air guns reach it. */
export const DRONE_SURVEIL_ALT = 22;
/** Search & Destroy height. Low enough for rifles and rocket bursts. */
export const DRONE_STRIKE_ALT = 5;
/** At or above this height only anti-air guns reach the drone. */
export const DRONE_HIGH_ALT = 13;
/** Elevation units per second the drone climbs or drops. */
export const DRONE_CLIMB_PER_SEC = 5;
/** Extra sight at Surveillance height over the catalog (Search & Destroy) sight. */
export const DRONE_SURVEIL_SIGHT_BONUS = t(8);
/** Burst when it closes on its target. */
export const DRONE_STRIKE_TILES = t(0.35);
/** Stowed once it is this close above the operator. */
export const DRONE_RECOVER_TILES = t(0.5);
/**
 * Guard: the drone circles its post. Surveillance flies a wide, slow ring;
 * Search & Destroy a tighter one, and dives on the first enemy it sees.
 */
export const DRONE_GUARD_ORBIT_TILES: Record<DroneMode, number> = { surveil: t(3), strike: t(1.75) };
/** Share of the drone's top speed it keeps while circling. */
export const DRONE_GUARD_ORBIT_PACE: Record<DroneMode, number> = { surveil: 0.25, strike: 0.4 };
/**
 * Shaped charge under the frame. Kills a soldier it lands on and wounds
 * those beside him. On a hull it comes down through the roof: a share of max
 * HP, and a chance at the engine.
 */
export const DRONE_WARHEAD = {
  damage: 70,
  splashTiles: t(0.9),
  /** Share of a hull's max HP at the center. */
  armorShare: 0.3,
  engineChance: 0.35,
  buildingDamage: 90,
  caliber: 30,
} as const;

/**
 * Jump Jet. A soldier with a jet pack: he walks like any trooper, and on
 * command lifts to JET_ALT and flies straight over hills, water, walls, and
 * men while the fuel lasts. Up there only anti-air weapons reach him (the
 * MG42, the gatlings, the CIWS and RAM, and the Titan's pods), and his own
 * rounds come down past sandbags, trees, a crouch, and a trench parapet.
 * Low on fuel he lands by himself. The pack refills on the ground after a
 * pause.
 */
/** Seconds of flight on a full pack. */
export const JET_FUEL_SECONDS = 14;
/** Fuel needed to take off. */
export const JET_TAKEOFF_MIN_SECONDS = 4;
/** He starts down with this much left, so there is fuel to find open ground. */
export const JET_LAND_RESERVE = 1.5;
/** Seconds on the ground after landing before the pack starts to refill. */
export const JET_REFUEL_DELAY = 6;
/** Fuel seconds regained per second once refilling. An empty pack fills in 16 s. */
export const JET_REFUEL_PER_SEC = JET_FUEL_SECONDS / 16;
/** Flying height, elevation units. Above a house roof, well under a plane. */
export const JET_ALT = 7;
/** Elevation units per second up or down. */
export const JET_CLIMB_PER_SEC = 9;
/** Air speed. Faster than he runs. Same UNIT_PACE cut as the walk. */
export const JET_FLY_TILES_PER_SEC = paced(4);

export const INFANTRY_GUNS: Record<InfantryWeaponId, InfantryGun> = {
  rifle: RIFLE,
  assault: ASSAULT,
  handgun: HANDGUN,
  mg42: MG42,
  scoped: SCOPED,
  mortar: MORTAR,
  ptrd: PTRD,
  gatling: GATLING,
  launcher: LAUNCHER,
  penetrator: PENETRATOR,
  flamer: FLAMER,
};

/**
 * Rifle / coaxial MG / 75mm. Fast enough to cross max range in under a tick so
 * the round itself is not a visible tracer — sparks only after an armor bounce.
 */
export const SMALL_ARMS_SPEED = 10000;
export const STUKA_MG = {
  damage: 8,
  penetration: 8,
  caliber: 7.92,
  spreadDeg: 3,
  projectileSpeed: SMALL_ARMS_SPEED,
  rangeTiles: t(10),
  /** Half-angle off the nose the wing guns bear. */
  arcDeg: 10,
} as const;
/** Fw 190 wing cannon, 30 mm. See FW190_BARRAGES. */
export const FW190_CANNON = {
  damage: 30,
  penetration: 40,
  caliber: 30,
  spreadDeg: 1.2,
  projectileSpeed: SMALL_ARMS_SPEED,
  rangeTiles: t(7),
  /** Half-angle off the nose the wing cannon bear. */
  arcDeg: 8,
} as const;
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
export function maulerCartHpOf(type: EntityType): number {
  return type === "hauler" ? MAULER_CART_HP : 0;
}
/** Ellipse half-length along the shot, in gameplay tiles. */
export const SMOKE_HALF_ALONG = t(2.5);
/** Ellipse half-width across the shot, in gameplay tiles. */
export const SMOKE_HALF_ACROSS = t(1.5);
/** Tiles into a cloud an observer can still see. */
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

/**
 * Jagdtiger 128mm rack. AP goes through every front plate on the field and
 * usually kills a Tiger outright. No HEAT or smoke on the rack; the table
 * still fills every shell slot because ShellDef is keyed by ShellType.
 */
export const JAGDTIGER_SHELLS: Record<ShellType, ShellDef> = {
  ap: {
    id: "ap",
    name: "AP",
    blurb: "128mm armor-piercing. Goes through any front plate on the field. One hit usually kills a Tiger from any side.",
    damage: 90,
    penetration: 200,
    caliber: 128,
    spreadDeg: 2.5,
  },
  he: {
    id: "he",
    name: "HE",
    blurb: "128mm high explosive. A huge burst among infantry and against buildings. Ricochets off armor.",
    damage: 120,
    penetration: 24,
    caliber: 128,
    spreadDeg: 4.5,
  },
  heat: {
    id: "heat",
    name: "HEAT",
    blurb: "Not carried. The 128mm armor-piercing round already goes through every front plate.",
    damage: 0,
    penetration: 0,
    caliber: 128,
    spreadDeg: 3.5,
  },
  smoke: {
    id: "smoke",
    name: "Smoke",
    blurb: "Not carried. Screen a Jagdtiger with a Tiger or a StuG.",
    damage: 0,
    penetration: 0,
    caliber: 128,
    spreadDeg: 6,
  },
};

/**
 * Apocalypse twin 105mm rack. The two barrels fire the loaded shell one after
 * the other, then the long reload. Heavier and slower than the Tiger's 75mm.
 */
export const APOCALYPSE_SHELLS: Record<ShellType, ShellDef> = {
  ap: {
    id: "ap",
    name: "AP",
    blurb: "Armor-piercing. The second barrel follows a moment later. Goes through a Tiger's front plate.",
    damage: 60,
    penetration: 125,
    caliber: 105,
    spreadDeg: 3,
  },
  he: {
    id: "he",
    name: "HE",
    blurb: "High explosive. The second barrel follows a moment later. Clears infantry and knocks buildings down. Ricochets off armor.",
    damage: 95,
    penetration: 20,
    caliber: 105,
    spreadDeg: 5,
  },
  heat: {
    id: "heat",
    name: "HEAT",
    blurb: "Shaped charge. The deepest punch in the rack. The second barrel follows a moment later.",
    damage: 68,
    penetration: 160,
    caliber: 105,
    spreadDeg: 3.5,
  },
  smoke: {
    id: "smoke",
    name: "Smoke",
    blurb: "Lays a vision-blocking screen. Never auto-fires — force-attack the ground to place one round, then the gun stops.",
    damage: 0,
    penetration: 0,
    caliber: 105,
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
    moveTilesPerSec: paced(1.3),
    turnDegPerSec: 120,
    turnInPlace: true,
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
    blurb: `Stands on a scrap field: at least half its footprint must cover scrap. It melts the field down for ${SMELTER_SCRAP_PER_SEC} scrap a second for as long as it stands, and the field never runs out. Each Smelter adds its own share. Low power slows it. The yard places one near the base; an engineer can raise one on any scrap field he can walk to, which also pushes your build range out to it.`,
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
  airfield: {
    type: "airfield",
    kind: "building",
    name: "Airfield",
    letter: "L",
    cost: 1000,
    buildSeconds: 26,
    hp: 1100,
    power: -40,
    tileW: t(7.5),
    tileH: t(3.75),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: `Concrete strip with four revetted hardstands beside it. Trains dive bombers, fighters, and the BV 222 transport and keeps up to ${AIRFIELD_PADS}. Planes land here to refuel, rearm, and patch up.`,
  },
  research: {
    type: "research",
    kind: "building",
    name: "Research Facility",
    letter: "F",
    cost: 1200,
    buildSeconds: 22,
    hp: 900,
    power: -50,
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
    blurb: "Lab block with an observatory dome and a coil annex. Unlocks the Tiger, Apocalypse, Jagdtiger, Cyborg, Titan, Nebelwerfer, and Drone Op.",
  },
  radar: {
    type: "radar",
    kind: "building",
    name: "Radar Station",
    letter: "R",
    cost: 1000,
    buildSeconds: 20,
    hp: 800,
    power: -40,
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
    blurb: "Ops hut and a dish on a lattice mast. Lights the radar panel in the command bar: without a standing Radar Station the panel is dark. The dish sweeps far past anyone's eyes for aircraft. An enemy plane or drone in the air that nobody can see shows as a blinking contact on the panel only; nothing changes on the field until someone sees it.",
  },
  ciws: {
    type: "ciws",
    kind: "building",
    name: "CIWS",
    letter: "W",
    cost: 700,
    buildSeconds: 18,
    hp: 500,
    power: -25,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 300,
    rangeTiles: CIWS_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: TICK_DT,
    damage: CIWS_GUN.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: CIWS_GUN.penetration,
    caliber: CIWS_GUN.caliber,
    spreadDeg: CIWS_GUN.spreadDeg,
    shotsPerTick: CIWS_SHOTS_PER_TICK,
    belt: CIWS_BELT,
    radarLaid: true,
    blurb: `Radar-laid 20mm gatling on a concrete pad. Fires on its own at any enemy unit it can hurt, planes and paratroopers under canopies first, and reaches farther for a plane than for anything on the ground. Against a plane it lays one stream of rounds, a tracer in every few, that walks on and off the airframe: often enough to bring one down on a pass. About a second and a half on the trigger overheats the barrels, and it falls silent while they cool. Max range reaches half as far again, but out there the fire scatters wide. It tries to burst incoming rockets, and rarely does — a RAM is the missile screen. Leaves tanks and buildings alone. A Walker or a truck sometimes takes a round. The ${CIWS_BELT}-round belt does not refill by itself — bring a supply truck.`,
  },
  bunker: {
    type: "bunker",
    kind: "building",
    name: "Bunker",
    letter: "U",
    cost: 600,
    buildSeconds: 16,
    hp: 3000,
    power: 0,
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
    garrisonCap: BUNKER_GARRISON_CAP,
    garrisonHpMul: BUNKER_GARRISON_HP_MUL,
    garrisonWoundMul: BUNKER_WOUND_MUL,
    garrisonWindows: 2,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonFullArms: true,
    garrisonTypes: BUNKER_TYPES,
    capturable: false,
    garrisonMedicRegen: BUNKER_MEDIC_REGEN_FRAC,
    garrisonEngineerRepair: BUNKER_ENGINEER_REPAIR_PER_SEC,
    coverHeight: BUNKER_COVER_HEIGHT,
    blurb: `Reinforced concrete pillbox for ${BUNKER_GARRISON_CAP} infantry: riflemen, gunners, snipers, AT troops, rocketmen, medics, and engineers. The best cover on the field — the walls take most of every hit, and every weapon fires from the slits, the Gunner's MG included. Low, so it adds no sight or reach. A medic inside slowly patches everyone; an engineer inside slowly patches the concrete. Enemy infantry cannot capture it — it has to be shot apart.`,
  },
  tower: {
    type: "tower",
    kind: "building",
    name: "Watch Tower",
    letter: "t",
    cost: 500,
    buildSeconds: 14,
    hp: 1600,
    power: 0,
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
    garrisonCap: TOWER_GARRISON_CAP,
    garrisonHpMul: TOWER_GARRISON_HP_MUL,
    garrisonWoundMul: TOWER_WOUND_MUL,
    garrisonWindows: 4,
    garrisonFloors: TOWER_FLOORS,
    garrisonSightBonus: TOWER_SIGHT_BONUS,
    garrisonReachBonus: TOWER_REACH_BONUS,
    garrisonEye: TOWER_EYE_HEIGHT,
    garrisonFullArms: true,
    garrisonTypes: BUNKER_TYPES,
    blurb: `Fortified watch tower for ${TOWER_GARRISON_CAP} infantry, the same troops a bunker takes. From the cab they see far across the field, well past anyone on the ground, and every weapon fires from the slits. Their reach grows only a little. The walls stop part of each hit: better than a house, not a bunker.`,
  },
  ram: {
    type: "ram",
    kind: "building",
    name: "RAM",
    letter: "B",
    cost: 900,
    buildSeconds: 22,
    hp: 500,
    power: -30,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 240,
    rangeTiles: RAM_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: TICK_DT,
    damage: RAM_ROCKET.damage,
    projectileSpeed: RAM_ROCKET.speed,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: RAM_ROCKET.penetration,
    caliber: RAM_ROCKET.caliber,
    spreadDeg: 0,
    radarLaid: true,
    rockets: true,
    rocketAmmo: RAM_ROCKET_AMMO,
    rocketRack: RAM_ROCKET,
    blurb: `Radar-laid rocket launcher on a concrete pad. Fires on its own at any enemy unit it can hurt, planes and paratroopers under canopies first, in barrages of ${RAM_SALVO} short, accurate rockets, and sends an interceptor at incoming rockets that bursts most of them in the air. Shorter reach than a Nebelwerfer, longer than a CIWS. Max range reaches half as far again, but out there the rockets scatter wide. Leaves tanks and buildings alone. The ${RAM_ROCKET_AMMO}-rocket rack does not refill by itself — bring a supply truck.`,
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
  wall: {
    type: "wall",
    kind: "building",
    name: "Wall",
    letter: "w",
    cost: 30,
    buildSeconds: 7.5,
    hp: 120,
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
    blurb: "Concrete section with barbed wire. Scroll to turn it, then drag from the start to the end. The whole line is one job — longer for each piece — and it appears when the engineer finishes. Nothing walks through it while it stands. Shells and rockets break it; an engineer can repair it. Units beside it have extra health and take less from ground fire. Mortars, bombs, and shots from the air ignore that. A section with wall on both ends can be converted into a gate that lifts for your side.",
  },
  greatwall: {
    type: "greatwall",
    kind: "building",
    name: "Large wall",
    letter: "L",
    cost: 60,
    buildSeconds: 12,
    hp: 400,
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
    garrisonCap: LARGE_WALL_GARRISON_CAP,
    garrisonHpMul: LARGE_WALL_GARRISON_HP_MUL,
    garrisonWoundMul: LARGE_WALL_WOUND_MUL,
    garrisonWindows: 2,
    garrisonFloors: 1,
    garrisonSightBonus: LARGE_WALL_SIGHT_BONUS,
    garrisonReachBonus: LARGE_WALL_REACH_BONUS,
    garrisonEye: LARGE_WALL_EYE_HEIGHT,
    garrisonFullArms: true,
    garrisonTypes: BUNKER_TYPES,
    coverHeight: LARGE_WALL_COVER_HEIGHT,
    blurb: `Tall concrete wall with firing slits down both faces. Laid like the ordinary wall: scroll to turn, click and drag a line, keep going round corners, then Confirm. Each section holds ${LARGE_WALL_GARRISON_CAP} of the infantry a bunker takes, and every weapon fires from the slits. Men inside have triple health, the concrete stops half of every hit, and they see and reach a little farther. Nothing walks through it and no direct fire crosses it; shells and rockets break it, and an engineer repairs it.`,
  },
  teeth: {
    type: "teeth",
    kind: "building",
    name: "Dragon's teeth",
    letter: "Y",
    cost: 10,
    buildSeconds: 2,
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
  trench: {
    type: "trench",
    kind: "building",
    name: "Trench",
    letter: "H",
    cost: 30,
    buildSeconds: 8,
    hp: 400,
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
    garrisonCap: TRENCH_GARRISON_CAP,
    garrisonHpMul: TRENCH_GARRISON_HP_MUL,
    garrisonWoundMul: TRENCH_WOUND_MUL,
    garrisonWindows: 1,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonFullArms: true,
    garrisonOpenTop: true,
    garrisonTypes: TRENCH_TYPES,
    coverHeight: TRENCH_COVER_HEIGHT,
    blurb: "A one-man fighting trench with an earth parapet. Holds one rifleman, gunner, sniper, AT soldier, rocketman, pyro, mortarman, medic, or engineer. Moderate cover: he has double health and the earth soaks up part of every hit. Every weapon works from it, the Gunner's MG and the mortar included. Infantry and vehicles cross it freely.",
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
    moveTilesPerSec: paced(2.2 * INFANTRY_PACE),
    turnDegPerSec: 1800,
    rangeTiles: RIFLE_RANGE_TILES,
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
    moveTilesPerSec: paced(1.65 * INFANTRY_PACE),
    turnDegPerSec: 1400,
    rangeTiles: MG42_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: MG42.cooldown,
    damage: MG42.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: MG42.penetration,
    caliber: MG42.caliber,
    spreadDeg: MG42.spreadDeg,
    blurb: "MG42. Reaches past a rifle. Crawl, set the bipod, then 1,200 rounds a minute from a 50-round belt.",
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
    moveTilesPerSec: paced(1.8 * INFANTRY_PACE),
    turnDegPerSec: 1600,
    rangeTiles: SCOPED_RANGE_TILES,
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
    moveTilesPerSec: paced(1.65 * INFANTRY_PACE),
    turnDegPerSec: 1400,
    rangeTiles: PTRD_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    sightBonusTiles: t(4),
    cooldown: PTRD.cooldown,
    damage: PTRD.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: PTRD.penetration,
    caliber: PTRD.caliber,
    spreadDeg: PTRD.spreadDeg,
    blurb: "PTRD-41. Reaches nearly as far as the scoped rifle. Up close it punches tank side and rear, often a track, and it goes through light armor. The front plate holds.",
  },
  rocketer: {
    type: "rocketer",
    kind: "unit",
    name: "Rocketer",
    letter: "r",
    cost: 200,
    buildSeconds: 12,
    hp: 36,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.6 * INFANTRY_PACE),
    turnDegPerSec: 1400,
    rangeTiles: LAUNCHER_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: LAUNCHER.cooldown,
    damage: LAUNCHER.damage,
    projectileSpeed: TITAN_ROCKET_SPEED,
    ...UNARMED,
    penetration: LAUNCHER.penetration,
    caliber: LAUNCHER.caliber,
    spreadDeg: LAUNCHER.spreadDeg,
    blurb: "One rocket launcher. The tube reloads off his back: loose at full reach, tighter up close, a burst among soldiers that dents a tank. Config also loads one high-penetration missile — faster, accurate at long range, and heavy on armor. That round does not come back until a supply truck brings another, and fitting it takes a moment. He spends it only on a shot you order. A broken arm puts the tube down.",
  },
  pyro: {
    type: "pyro",
    kind: "unit",
    name: "Pyro",
    letter: "p",
    cost: 180,
    buildSeconds: 11,
    hp: 38,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.7 * INFANTRY_PACE),
    turnDegPerSec: 1500,
    rangeTiles: FLAMER_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: FLAMER.cooldown,
    damage: FLAMER.damage,
    projectileSpeed: 1,
    ...UNARMED,
    penetration: FLAMER.penetration,
    caliber: FLAMER.caliber,
    spreadDeg: FLAMER.spreadDeg,
    blurb: "Flamethrower with two fuel tanks on his back. Very short reach and only three bursts until a supply truck refills him, but the jet goes over sandbags and in through windows, and the ground it hits keeps burning, deadly to any soldier in it. Force-attack sets a tree alight. When he is killed there is a small chance the tanks go up.",
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
    moveTilesPerSec: paced(1.5 * INFANTRY_PACE),
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
    moveTilesPerSec: paced(2 * INFANTRY_PACE),
    turnDegPerSec: 1600,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: "No gun. Builds sandbags, concrete walls, tank obstacles, and one-man trenches, repairs armor, buildings, and spotlights, and cuts wrecks into scrap.",
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
    moveTilesPerSec: paced(2 * INFANTRY_PACE),
    turnDegPerSec: 1600,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: "No weapon. Walks to a wounded soldier nearby and closes the wound. A long kneel sets a broken arm or leg. The bag does not run out. Left alone a while, he patches himself up, and sets his own limbs once he is half whole.",
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
    moveTilesPerSec: paced(1.9),
    turnDegPerSec: 140,
    rangeTiles: 0,
    sightTiles: t(4),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    turnInPlace: true,
    ...UNARMED,
    armorFront: 100,
    armorSide: 80,
    armorRear: 80,
    leavesWreck: true,
    wreckHp: 70,
    blurb: "Heavily armored bulldozer. Thick plate on every face. Shells knock the scrap cart off the hitch. Out of the roster for now: Smelters stand on the scrap fields and pour on their own.",
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
    moveTilesPerSec: paced(1.45),
    turnDegPerSec: 85,
    rangeTiles: TIGER_RANGE_TILES,
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
    ammo: { ap: 12, he: 6, smoke: 4 },
    defaultShell: "ap",
    mgAmmo: TANK_MG.ammo,
    leavesWreck: true,
    wreckHp: 70,
    hasScout: true,
    blurb: "Heavy tank. Independent turret, thick front plate. Slow hull, long-range rack.",
  },
  apocalypse: {
    type: "apocalypse",
    kind: "unit",
    name: "Apocalypse",
    letter: "A",
    cost: 450,
    buildSeconds: 20,
    hp: 220,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 15,
    moveTilesPerSec: paced(1.1),
    turnDegPerSec: 60,
    rangeTiles: TIGER_RANGE_TILES,
    sightTiles: t(8),
    cooldown: 8,
    damage: APOCALYPSE_SHELLS.ap.damage,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    tracked: true,
    turretTurnDegPerSec: 140,
    armorFront: 120,
    armorSide: 60,
    armorRear: 30,
    penetration: APOCALYPSE_SHELLS.ap.penetration,
    caliber: APOCALYPSE_SHELLS.ap.caliber,
    spreadDeg: APOCALYPSE_SHELLS.ap.spreadDeg,
    shells: APOCALYPSE_SHELLS,
    twinGuns: true,
    ammo: { ap: 16, he: 8, smoke: 2 },
    defaultShell: "ap",
    roofCiws: true,
    mgAmmo: APOCALYPSE_CIWS_BELT,
    leavesWreck: true,
    wreckHp: 110,
    blurb: `Super-heavy tank. Two 105mm guns on one turret fire one after the other, a short gap and then a long reload, through a Tiger's front plate. Thick plate on every face, a slow hull and a slow turret. A small radar-laid 20mm CIWS on the turret roof lays itself, apart from the main guns: incoming missiles first, and it bursts some of them, then planes, infantry, and sometimes a Walker or a truck. A secondary mount, it sprays wider than a pad CIWS and overheats after a little over a second on the trigger. The ${APOCALYPSE_CIWS_BELT}-round belt refills only from a supply truck.`,
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
    moveTilesPerSec: paced(1.55),
    turnDegPerSec: 60,
    rangeTiles: STUG_RANGE_TILES,
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
    ammo: { ap: 10, smoke: 2 },
    defaultShell: "ap",
    shells: STUG_SHELLS,
    mgAmmo: TANK_MG.ammo,
    leavesWreck: true,
    wreckHp: 50,
    hasScout: true,
    blurb: "Casemate assault gun. No turret — hull-steer to aim. Strong front, thin sides.",
  },
  /** Casemate tank destroyer: a fixed 128mm on a far heavier hull than the StuG's. */
  jagdtiger: {
    type: "jagdtiger",
    kind: "unit",
    name: "Jagdtiger",
    letter: "d",
    cost: 420,
    buildSeconds: 18,
    hp: 160,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 13,
    moveTilesPerSec: paced(1.0),
    turnDegPerSec: 38,
    rangeTiles: JAGDTIGER_RANGE_TILES,
    sightTiles: t(7),
    cooldown: 10,
    damage: JAGDTIGER_SHELLS.ap.damage,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    tracked: true,
    gunArcDeg: 10,
    armorFront: 150,
    armorSide: 50,
    armorRear: 30,
    penetration: JAGDTIGER_SHELLS.ap.penetration,
    caliber: JAGDTIGER_SHELLS.ap.caliber,
    spreadDeg: JAGDTIGER_SHELLS.ap.spreadDeg,
    shells: JAGDTIGER_SHELLS,
    ammo: { ap: 10, he: 4 },
    defaultShell: "ap",
    mgAmmo: TANK_MG.ammo,
    leavesWreck: true,
    wreckHp: 100,
    hasScout: true,
    blurb: "Heavy tank destroyer. No turret: the 128mm sits in a fixed casemate and swings only a little either side of the nose, so the slow hull must turn to aim. The thickest front plate on the field, heavy sides, a thin rear. Its armor-piercing shell goes through any front plate and usually kills a Tiger in one hit, from the longest reach of any tank gun. A long reload between shots, and no HEAT or smoke on the rack.",
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
    moveTilesPerSec: paced(1.3),
    turnDegPerSec: 160,
    rangeTiles: WALKER_RANGE_TILES,
    sightTiles: t(9),
    cooldown: TICK_DT,
    damage: MG42.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    turnInPlace: true,
    noReverse: true,
    turretTurnDegPerSec: WALKER_TORSO_TURN,
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
    blurb: "Each arm is a gatling at the MG42's 1,200 rounds a minute, the same bullet. A round sometimes bites a Walker or a truck; tank plate turns it. The torso turns on the hips, so he fires while he walks. The backpack is a 1,200-round rack and does not reload by itself. The gatlings fire with tracers and overheat fast: under three seconds on one arm, about one on both, then they fall silent to cool. One arm spends it slowly. Both arms spend it twice as fast and can split across two targets. The guns do not bring a building down. At a fifth of his health he charges the nearest enemy he can see and detonates, unless Self destroy is off in Config. That remainder swells to five times the hit points, still a fifth of his bar, and he runs faster with a short trail of dark smoke. The blast nicks a tank and hits everything else harder, and he leaves no wreck.",
  },
  cyborg: {
    type: "cyborg",
    kind: "unit",
    name: "Cyborg",
    letter: "Z",
    cost: 260,
    buildSeconds: 13,
    hp: 300,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.6 * INFANTRY_PACE),
    turnDegPerSec: 900,
    rangeTiles: CYBORG_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: GATLING.cooldown,
    damage: GATLING.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: GATLING.penetration,
    caliber: GATLING.caliber,
    spreadDeg: GATLING.spreadDeg,
    blurb: "Half soldier, half machine. A gatling arm fed from a 600-round drum that only a supply truck refills. It fires with tracers and overheats after under two seconds on the trigger. A round sometimes bites a Walker or a truck. Near death his legs are torn off and he crawls on, still firing. Medics heal him, engineers repair him, and either brings the legs back.",
  },
  titan: {
    type: "titan",
    kind: "unit",
    name: "Titan",
    letter: "X",
    cost: 400,
    buildSeconds: 18,
    hp: 200,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 13,
    moveTilesPerSec: paced(1.15),
    turnDegPerSec: 70,
    rangeTiles: TITAN_RANGE_TILES,
    sightTiles: t(8),
    cooldown: 6.5,
    damage: 55,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    noReverse: true,
    turretTurnDegPerSec: 120,
    armorFront: 90,
    armorSide: 48,
    armorRear: 30,
    penetration: 100,
    caliber: 75,
    spreadDeg: 3,
    ammo: { ap: 16 },
    defaultShell: "ap",
    leavesWreck: true,
    wreckHp: 90,
    special: "deploy",
    wades: true,
    wadeSpeed: TITAN_WADE_SPEED,
    rockets: true,
    rocketAmmo: TITAN_ROCKET_AMMO,
    bracedHpMul: TITAN_BRACED_HP_MUL,
    blurb: "Heavy assault walker. The Tiger's gun on a traversing torso, loaded with armor-piercing shot only, and a four-rocket pod on the shoulders that picks its own target, apart from the gun, and ripples its salvo one rocket after another. Sixteen rockets in the rack; a supply truck refills them. Rockets scatter wide at full reach and draw in as the target closes. They shred infantry, dent tanks, usually break a track from the side or rear, and can burst beside a plane in the air. Switch the pods off to save them. Wades through water with only its torso showing: the main gun stays silent there, the rockets still fire. Deploy plants the outriggers: it cannot move, and its hit points grow by three-quarters until it packs up.",
  },
  mammoth: {
    type: "mammoth",
    kind: "unit",
    name: "Mammoth",
    letter: "m",
    cost: 700,
    buildSeconds: 24,
    hp: 480,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 17,
    moveTilesPerSec: paced(0.75),
    turnDegPerSec: 45,
    rangeTiles: MAMMOTH_MG_RANGE_TILES,
    sightTiles: t(7),
    cooldown: 0.12,
    damage: TANK_MG.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    turnInPlace: true,
    tracked: true,
    gunArcDeg: MAMMOTH_MG_ARC,
    belt: MAMMOTH_MG_BELT,
    beltReload: MAMMOTH_MG_BELT_RELOAD,
    armorFront: 110,
    armorSide: 80,
    armorRear: 60,
    penetration: TANK_MG.penetration,
    caliber: TANK_MG.caliber,
    spreadDeg: 6,
    leavesWreck: true,
    wreckHp: 120,
    wades: true,
    wadeSpeed: MAMMOTH_WADE_SPEED,
    garrisonCap: MAMMOTH_GARRISON_CAP,
    garrisonHpMul: 1,
    garrisonWindows: 3,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonFullArms: true,
    garrisonTypes: BUNKER_TYPES,
    garrisonDiesWithHost: true,
    blurb: `Armored battle platform on four legs. Very slow, very thick plate on every face, and in water it is thirty percent slower, sunk to the waist so only the body shows. Its own weapon is a twin machine gun under the cab that swings only a little either side of the nose, and falls silent in water. It carries ${MAMMOTH_GARRISON_CAP} of the infantry a Bunker takes, and every one of them fires out of the slits along its flanks, even while it wades. Force attack on the hull aims every soldier inside who can reach that point; they stay aboard. Nothing reaches them while the hull holds — but if it is destroyed, everyone inside dies with it. Nothing throws a track. A hit in the rear can still wreck the engine and stop it. At night a lamp on the nose and one on each flank light the ground out to its daylight sight. The flank lamps drift slowly through a small arc.`,
  },
  nebelwerfer: {
    type: "nebelwerfer",
    kind: "unit",
    name: "Nebelwerfer",
    letter: "n",
    cost: 500,
    buildSeconds: 20,
    hp: 95,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(1.9),
    turnDegPerSec: 120,
    rangeTiles: NEBELWERFER_RANGE_TILES,
    sightTiles: t(6),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    turnInPlace: true,
    turretTurnDegPerSec: 50,
    gunArcDeg: 4,
    armorFront: 22,
    armorSide: 12,
    armorRear: 8,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    leavesWreck: true,
    wreckHp: 36,
    rockets: true,
    rocketAmmo: NEBELWERFER_ROCKET_AMMO,
    rocketRack: NEBELWERFER_ROCKET,
    blurb: "Rocket artillery on an armored truck. Twelve tubes on a traversing frame, emptied in about a second, one to three rockets at a time. The rockets fly fast on a flat arc — the longest reach on the field. Force attack sends them anywhere in that reach, even into ground the side cannot see, and they fly over tanks and trees on the way. It will not fire inside four tiles. Its own eyes are short. Aimed at a target, a tank or tree in the path still takes the rocket. It must stop and swing the frame onto the target before it fires. Rockets scatter wide at full reach and draw in as the target closes: a salvo blankets an area and shreds infantry in the open. Armor only dents, but a side or rear hit usually breaks a tank's tracks. Five salvos in the rack; a supply truck refills it. Switch the tubes off to hold fire. Thin plate — keep it behind the line.",
  },
  artillery: {
    type: "artillery",
    kind: "unit",
    name: "Artillery",
    letter: "g",
    cost: 550,
    buildSeconds: 22,
    hp: 160,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 10,
    moveTilesPerSec: paced(0.55),
    turnDegPerSec: 30,
    rangeTiles: ARTILLERY_RANGE_TILES,
    sightTiles: t(5),
    cooldown: ARTILLERY_RELOAD,
    damage: ARTILLERY_SHELL.damage,
    projectileSpeed: 0,
    turnInPlace: true,
    gunArcDeg: 6,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: ARTILLERY_SHELL.penetration,
    caliber: ARTILLERY_SHELL.caliber,
    spreadDeg: 0,
    ammo: { he: 10 },
    defaultShell: "he",
    blurb: `Towed field gun. Two crewmen haul it by the trail at a crawl; a supply truck can hitch it and tow it much faster. It must stop and set the trail before it fires. The shell is lobbed like a mortar bomb but far bigger: a wide burst that kills infantry, smashes buildings, and takes a real bite out of a tank. The longest reach on the field and a very slow reload, and it will not fire inside ${ARTILLERY_MIN_RANGE_TILES / TILE_SUBDIV} tiles. Bullets cannot hurt the gun, but they kill the crew; any infantry can take a dead man's place, and an empty gun goes to whoever crews it. Shells, bombs, and blasts wreck it. Ten shells; a supply truck refills them.`,
  },
  supply: {
    type: "supply",
    kind: "unit",
    name: "Supply Truck",
    letter: "V",
    cost: 150,
    buildSeconds: 9,
    hp: 58,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(2.15),
    turnDegPerSec: 150,
    rangeTiles: 0,
    sightTiles: t(6),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    turnInPlace: true,
    armorFront: 14,
    armorSide: 8,
    armorRear: 6,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    leavesWreck: true,
    wreckHp: 28,
    blurb: "Light truck. Tops up tank racks, coaxial belts, and the Walker's backpack, and slowly scrounges its cargo back on its own — an Armory refills it fast. Right-click a mine, yours or an ally's, and it spends a few seconds disabling it; the mine comes up as scrap and does not go off under the truck while it works. Two seats. The factory driver stays at the wheel. A bullet in the front plate can kill the driver and leave the truck for anyone. A replacement driver can get out. The passenger fires from the bed: rifle, handgun, machine gun, scoped rifle, anti-tank rifle, rocket launcher, flamethrower, or a Jump Jet's assault rifle. A mortar and a cyborg gatling stay slung. Hit-point bars for the soldiers aboard sit beside the truck. Soldiers inside are a little harder to wound, and more so from the side or rear.",
  },
  /** Ju 87 B dive bomber. Lives on an Airfield pad. */
  stuka: {
    type: "stuka",
    kind: "unit",
    name: "Stuka",
    letter: "J",
    cost: 450,
    buildSeconds: 20,
    hp: 110,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(5),
    turnDegPerSec: 120,
    rangeTiles: STUKA_MG.rangeTiles,
    sightTiles: t(10),
    cooldown: TICK_DT,
    damage: STUKA_MG.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: STUKA_MG.penetration,
    caliber: STUKA_MG.caliber,
    spreadDeg: STUKA_MG.spreadDeg,
    aircraft: true,
    wreckHp: 46,
    blurb: "Dive bomber. One SC 250 per sortie, two wing MGs for soft targets. Flies over everything; only rifles, machine guns, the Walker, and the Titan's rockets can reach it in the air. Lands at its Airfield to refuel and rearm. On guard it comes back to the same area once the bomb, the belts, and the tank are full. It has no tracks to lose. A hit that wrecks the engine brings it down at once: it falls trailing smoke and crashes as a wreck.",
  },
  /** Fw 190 fighter. Lives on an Airfield pad. */
  fw190: {
    type: "fw190",
    kind: "unit",
    name: "Fw 190",
    letter: "f",
    cost: 500,
    buildSeconds: 22,
    hp: 95,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(6.5),
    turnDegPerSec: 150,
    rangeTiles: FW190_BARRAGE_TILES,
    sightTiles: t(10),
    cooldown: FW190_BARRAGE_COOLDOWN,
    damage: FW190_CANNON.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: FW190_CANNON.penetration,
    caliber: FW190_CANNON.caliber,
    spreadDeg: FW190_CANNON.spreadDeg,
    aircraft: true,
    wreckHp: 40,
    blurb: `Fighter. Two 30 mm cannon, one under each wing, and no bomb. ${FW190_BARRAGES} barrages a sortie: on each pass it lines up on the target and lays two straight lines of rounds through it, one from each wing, then comes round for the next. Fired from above, the rounds come down through a tank's thin roof, so even the heaviest hull bleeds. It chases enemy planes out of the sky the same way. Flies faster and turns tighter than the Stuka. Lands at its Airfield to refuel and rearm. On guard it comes back to the same area once all ${FW190_BARRAGES} barrages and the tank are full. It has no tracks to lose. A hit that wrecks the engine brings it down at once: it falls trailing smoke and crashes as a wreck.`,
  },
  /** BV 222 transport flying boat. Lives on an Airfield pad. */
  bv222: {
    type: "bv222",
    kind: "unit",
    name: "BV 222",
    letter: "v",
    cost: 650,
    buildSeconds: 30,
    hp: 220,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 16,
    moveTilesPerSec: paced(4.2),
    turnDegPerSec: 60,
    rangeTiles: 0,
    sightTiles: t(9),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    aircraft: true,
    wreckHp: 80,
    blurb: `Six-engined transport flying boat. No guns. Its bay takes one load, chosen on the pad: a canister of ${CLUSTER_MINES} mines that scatter over the ground and wait for anyone, friend or foe (the enemy never sees them), a supply crate on a parachute that refills ammo and patches up whoever stands at it, or up to ${BV222_TROOPS} ground units. Infantry board on the hardstand from any load; that selects paratroops, and the bay stays on paratroops while anyone is aboard. They jump over the point and hang under canopies — where rifles, machine guns, and anti-aircraft guns can reach them — until they touch down. Hold Ctrl and click, or Force attack, to drop whatever is loaded. Slow and big. It has no tracks to lose. Shot down in the air, or with its engine wrecked there, everyone still aboard bails out under canopies and then it falls trailing smoke and crashes as a wreck. On the pad the same hit puts them on the grass and the plane is gone. Lands at its Airfield to refuel and reload.`,
  },
  droneop: {
    type: "droneop",
    kind: "unit",
    name: "Drone Op",
    letter: "o",
    cost: 220,
    buildSeconds: 12,
    hp: 34,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.6 * INFANTRY_PACE),
    turnDegPerSec: 1600,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: "No gun of his own. Launches one quadcopter that flies as its own unit, only within his reach and only while its battery lasts. Surveillance holds it high with wide sight, where only machine guns and gatlings reach it. Search & Destroy brings it low to dive on a target and burst; down there rifles and rockets reach it too. Recall stows it to recharge. A lost drone takes him a long time to replace.",
  },
  jumpjet: {
    type: "jumpjet",
    kind: "unit",
    name: "Jump Jet",
    letter: "j",
    cost: 260,
    buildSeconds: 13,
    hp: 40,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(2.1 * INFANTRY_PACE),
    turnDegPerSec: 1800,
    rangeTiles: ASSAULT_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: ASSAULT.cooldown,
    damage: ASSAULT.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: ASSAULT.penetration,
    caliber: ASSAULT.caliber,
    spreadDeg: ASSAULT.spreadDeg,
    blurb: "Assault rifle, handgun, and a jet pack. Take off to fly straight over anything while the fuel lasts: up there only machine guns, gatlings, the CIWS and RAM, and Titan rockets reach him, and his bursts come down on men behind sandbags, in trees, crouched, or in a trench. Lands by himself when the pack runs low; it refills on the ground after a pause.",
  },
  drone: {
    type: "drone",
    kind: "unit",
    name: "Drone",
    letter: "q",
    cost: 0,
    buildSeconds: 0,
    hp: 24,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 6,
    moveTilesPerSec: paced(3.5),
    turnDegPerSec: 360,
    rangeTiles: 0,
    sightTiles: t(9),
    cooldown: 0,
    damage: DRONE_WARHEAD.damage,
    projectileSpeed: 0,
    ...UNARMED,
    drone: true,
    blurb: "Quadcopter on its operator's link. Surveillance: high, wide sight, only anti-air guns reach it. Search & Destroy: low, dives on a target and bursts; rifles, machine guns, and rockets reach it. Tank shells and mortars never do. Guard sets it circling a spot or a friendly unit; in Search & Destroy it dives on the first enemy it sees.",
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

export function isYardField(type: string): type is YardFieldType {
  return (YARD_FIELD_TYPES as readonly string[]).includes(type);
}

/**
 * Guns, garrisons, and the sandbag and wall lines.
 * They build on their own lane, beside a base structure.
 */
export function isDefenceStructure(type: string): boolean {
  if (isYardField(type)) return true;
  return isBuildingType(type) && (catalog(type).rangeTiles > 0 || isGarrisonable(type));
}

/** World-pixel length along the wall and thickness across it. Null for other types. */
export function fieldSpan(type: EntityType): { length: number; thick: number } | null {
  if (type === "sandbags") return { length: 24, thick: 7 };
  if (type === "wall") return { length: 24, thick: 8 };
  if (type === "greatwall") return { length: 24, thick: 12 };
  if (type === "teeth") return { length: 14, thick: 14 };
  if (type === "trench") return { length: 16, thick: 10 };
  return null;
}

export function isTrainType(type: string): type is TrainType {
  return (TRAIN_TYPES as readonly string[]).includes(type);
}

export function fires(type: EntityType): boolean {
  return catalog(type).damage > 0 || hasMg(type) || rocketsOf(type);
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

/**
 * A side hit, blast, or mine can throw tracks. The Mammoth and aircraft have
 * none to lose. A rear hit can still wreck their engines.
 */
export function trackCritAllowed(type: EntityType): boolean {
  return type !== "mammoth" && !isAircraftType(type);
}

export function armorLabel(type: EntityType): string | null {
  if (!isArmoredType(type)) return null;
  const d = catalog(type);
  return `F${d.armorFront} / S${d.armorSide} / R${d.armorRear}`;
}

const INFANTRY_TYPES: readonly EntityType[] = ["rifleman", "gunner", "sniper", "atinfantry", "rocketer", "pyro", "mortarman", "engineer", "medic", "cyborg", "droneop", "jumpjet"];

/** Soldier with a jet pack: the Jump Jet. */
export function isJumpJetType(type: EntityType): boolean {
  return type === "jumpjet";
}

/** Flies: the Stuka, the Fw 190, and the BV 222. */
export function isAircraftType(type: EntityType): boolean {
  return catalog(type).aircraft === true;
}

/** Bombs and gun rounds a plane carries on a full sortie. */
export function airLoadoutOf(type: EntityType): { bombs: number; rounds: number } {
  if (type === "fw190") return { bombs: 0, rounds: FW190_BARRAGES };
  // The BV 222's one canister (mines or crate) rides in the bomb slot.
  if (type === "bv222") return { bombs: 1, rounds: 0 };
  return { bombs: STUKA_BOMBS, rounds: STUKA_MG_ROUNDS };
}

/** Transport: drops a load (AirDrop) instead of attacking. */
export function isTransportType(type: EntityType): boolean {
  return type === "bv222";
}

export function isAirDrop(s: unknown): s is AirDrop {
  return typeof s === "string" && (AIR_DROPS as readonly string[]).includes(s);
}

/** Fighter: hunts planes in the air as well as targets on the ground. */
export function isFighterType(type: EntityType): boolean {
  return type === "fw190";
}

/** Operator's quadcopter. */
export function isDroneType(type: EntityType): boolean {
  return catalog(type).drone === true;
}

export function isInfantryType(type: EntityType): boolean {
  return (INFANTRY_TYPES as readonly string[]).includes(type);
}

/** Infantry with a machine half. No stance orders, no random limb hits, legs tied to HP. */
export function isCyborg(type: EntityType): boolean {
  return type === "cyborg";
}

/** An engineer can patch this unit: armored hulls and the cyborg's plating. */
export function isRepairableUnit(type: EntityType): boolean {
  return isArmoredType(type) || isCyborg(type) || type === "artillery";
}

/**
 * Legs lost at or under CYBORG_LEGS_LOST_HP, back at or above CYBORG_LEGS_BACK_HP.
 * In between, they stay as they were. Null for every other type.
 */
export function cyborgLegsLost(e: { type: EntityType; hp: number; hpMax: number; crits: readonly Crit[] }): boolean | null {
  if (!isCyborg(e.type)) return null;
  const share = e.hp / Math.max(1, e.hpMax);
  if (share <= CYBORG_LEGS_LOST_HP) return true;
  if (share >= CYBORG_LEGS_BACK_HP) return false;
  return e.crits.includes("leg");
}

/** Primary gun for an infantry type. Null on vehicles and buildings. */
export function primaryInfantryGun(type: EntityType): InfantryGun | null {
  if (type === "rifleman") return RIFLE;
  if (type === "gunner") return MG42;
  if (type === "sniper") return SCOPED;
  if (type === "atinfantry") return PTRD;
  if (type === "rocketer") return LAUNCHER;
  if (type === "pyro") return FLAMER;
  if (type === "mortarman") return MORTAR;
  if (type === "cyborg") return GATLING;
  if (type === "jumpjet") return ASSAULT;
  return null;
}

/** Carried guns, primary first. Empty on vehicles and buildings. */
export function infantryLoadout(type: EntityType): readonly InfantryGun[] {
  if (type === "rifleman") return [RIFLE, HANDGUN];
  if (type === "gunner") return [MG42];
  if (type === "sniper") return [SCOPED];
  if (type === "atinfantry") return [PTRD];
  if (type === "rocketer") return [LAUNCHER, PENETRATOR];
  if (type === "pyro") return [FLAMER];
  if (type === "mortarman") return [MORTAR];
  if (type === "cyborg") return [GATLING];
  if (type === "jumpjet") return [ASSAULT, HANDGUN];
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

export function isDroneMode(v: unknown): v is DroneMode {
  return typeof v === "string" && (DRONE_MODES as readonly string[]).includes(v);
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

/** Effective posture. A broken leg always crawls. A cyborg only stands or drags himself. */
export function stanceOf(e: {
  type: EntityType;
  stance?: Stance;
  crits: readonly Crit[];
}): Stance {
  if (!isInfantryType(e.type)) return "stand";
  if (hasCrit(e, "leg")) return "crawl";
  if (isCyborg(e.type)) return "stand";
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

/** This infantry type may enter this building. Only the whitelist, when there is one. */
export function garrisonAdmits(house: EntityType, unit: EntityType): boolean {
  const only = catalog(house).garrisonTypes;
  return !only || only.includes(unit);
}

export function garrisonWoundMulOf(type: EntityType): number {
  return catalog(type).garrisonWoundMul ?? 1;
}

/** Sight and reach a watch garrison gains inside. Tall houses see farther; a bunker does not. */
export function garrisonSightBonusOf(type: EntityType): number {
  return catalog(type).garrisonSightBonus ?? GARRISON_WATCH_SIGHT_BONUS;
}

/** Weapon reach a watch garrison gains inside. A tower sees much farther than it shoots. */
export function garrisonReachBonusOf(type: EntityType): number {
  return catalog(type).garrisonReachBonus ?? garrisonSightBonusOf(type);
}

export function garrisonFullArmsOf(type: EntityType): boolean {
  return catalog(type).garrisonFullArms === true;
}

/** A hull that carries soldiers: safe inside while it holds, dead with it when it goes. */
export function garrisonDiesWithHostOf(type: EntityType): boolean {
  return catalog(type).garrisonDiesWithHost === true;
}

export function garrisonOpenTopOf(type: EntityType): boolean {
  return catalog(type).garrisonOpenTop === true;
}

/**
 * Solid height above the pad, in elevation units. Shots whose Z clears this
 * fly over. Civilian floors win; military pads scale with footprint.
 */
export function coverHeightOf(type: EntityType): number {
  const d = catalog(type);
  if (d.kind === "building") {
    if (d.coverHeight != null) return d.coverHeight;
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

/** Player-built structures can change owner. Civilian houses and the Bunker cannot. */
export function isCapturable(type: EntityType): boolean {
  const def = catalog(type);
  return def.kind === "building" && def.capturable !== false && !isCivilianType(type) && !isFieldStructure(type);
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

/** The shell is in this type's rack at all. A gun can still be empty of it. */
export function carriesShell(type: EntityType, shell: ShellType): boolean {
  return (catalog(type).ammo?.[shell] ?? 0) > 0;
}

export function hasMg(type: EntityType): boolean {
  return (catalog(type).mgAmmo ?? 0) > 0;
}

/** Backpack or belt that runs dry and reloads. Null on shells and dry guns. */
/**
 * Guns a supply-truck passenger may fire from the bed.
 * A mortar and a cyborg gatling stay slung. The bulky flag alone is not the rule.
 */
const TRUCK_BED_GUNS = new Set<string>([
  "rifle",
  "handgun",
  "assault",
  "mg42",
  "scoped",
  "ptrd",
  "launcher",
  "penetrator",
  "flamer",
]);

export function weaponFitsTruck(gun: { id?: string } | null | undefined): boolean {
  return !!gun?.id && TRUCK_BED_GUNS.has(gun.id);
}

export function isSupplyTruck(type: EntityType): boolean {
  return type === "supply";
}

export function beltOf(type: EntityType): { clip: number; reload: number } | null {
  const d = catalog(type);
  if (d.belt == null || d.belt <= 0) return null;
  return { clip: d.belt, reload: d.beltReload ?? 0 };
}

/**
 * Finite ammo still below the catalog rack. Reloading magazines are not short —
 * the truck only fills shells, coaxial belts, a Walker backpack, and a cyborg drum.
 */
export function supplyShortOf(
  type: EntityType,
  ammo: Partial<Record<ShellType, number>> | undefined,
  mgAmmo: number | undefined,
  clip: number | undefined,
  rockets?: number,
  heavy?: number,
): boolean {
  const def = catalog(type);
  if ((heavy ?? 0) < heavyAmmoOf(type)) return true;
  if ((rockets ?? 0) < rocketAmmoOf(type)) return true;
  if (def.ammo) {
    for (const shell of SHELL_TYPES) {
      if ((ammo?.[shell] ?? 0) < (def.ammo[shell] ?? 0)) return true;
    }
  }
  if ((def.mgAmmo ?? 0) > 0 && (mgAmmo ?? 0) < (def.mgAmmo ?? 0)) return true;
  const belt = beltOf(type);
  if (belt && belt.reload <= 0 && (clip ?? 0) < belt.clip) return true;
  const drum = supplyDrumOf(type);
  if (drum > 0 && (clip ?? 0) < drum) return true;
  return false;
}

/** Infantry magazine that never reloads by itself, so only a truck fills it. The cyborg's drum. */
export function supplyDrumOf(type: EntityType): number {
  const gun = primaryInfantryGun(type);
  return gun && gun.reload <= 0 ? gun.clip : 0;
}

/** Walker arms in use. Missing means one gun. */
export function walkerGunsOf(e: { type: EntityType; gatlingGuns?: 1 | 2 }): 1 | 2 {
  if (e.type !== "walker") return 1;
  return e.gatlingGuns === 2 ? 2 : 1;
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

export function specialLabel(type: EntityType, braced = false): string | null {
  if (!specialOf(type)) return null;
  return type === "core" || braced ? "Pack" : "Deploy";
}

/** Walks through water. Infantry swim; this is the vehicle flag. */
export function wadesOf(type: EntityType): boolean {
  return catalog(type).wades === true;
}

/** Share of dry-ground speed while wading. A wader that omits wadeSpeed keeps the Titan's pace. */
export function wadeSpeedOf(type: EntityType): number {
  return catalog(type).wadeSpeed ?? TITAN_WADE_SPEED;
}

/** A radar-laid mount: the CIWS or the RAM. See CatalogEntry.radarLaid. */
export function radarLaidOf(type: EntityType): boolean {
  return catalog(type).radarLaid === true;
}

/** Carries a rocket rack: Titan pods, Nebelwerfer tubes, the RAM launcher. */
/** Radar-laid 20mm on the turret roof. See CatalogEntry.roofCiws. */
export function roofCiwsOf(type: EntityType): boolean {
  return catalog(type).roofCiws === true;
}

/** Main-gun barrels on the mount. A twin fires them in succession, one reload for the pair. */
export function mainGunBarrels(type: EntityType): number {
  return catalog(type).twinGuns ? 2 : 1;
}

export function rocketsOf(type: EntityType): boolean {
  return catalog(type).rockets === true;
}

/** How this type's rockets fly and burst. The Titan's pods unless the catalog says otherwise. */
export function rocketRackOf(type: EntityType): RocketRackDef {
  return catalog(type).rocketRack ?? TITAN_ROCKET_RACK;
}

/** Rockets are this type's only weapon, on a frame that must bear (the Nebelwerfer). */
export function launcherOnlyOf(type: EntityType): boolean {
  return rocketsOf(type) && rocketRackOf(type).laid === true;
}

/** Rockets in a full rack. 0 on every type without pods. */
export function rocketAmmoOf(type: EntityType): number {
  return rocketsOf(type) ? (catalog(type).rocketAmmo ?? 0) : 0;
}

/** High-penetration missiles this type carries when full. The Rocketer holds one. */
export function heavyAmmoOf(type: EntityType): number {
  return type === "rocketer" ? 1 : 0;
}

/** Braces on deploy instead of turning into another type. */
export function bracesOf(type: EntityType): boolean {
  return (catalog(type).bracedHpMul ?? 0) > 0;
}

/** Seconds a deploy or undeploy takes for this type. */
export function deploySecondsOf(type: EntityType): number {
  return bracesOf(type) ? TITAN_BRACE_SECONDS : DEPLOY_SECONDS;
}

/** Max HP for a unit type in its current posture. */
export function hpMaxOf(type: EntityType, braced: boolean): number {
  const def = catalog(type);
  return braced && def.bracedHpMul ? Math.round(def.hp * def.bracedHpMul) : def.hp;
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
