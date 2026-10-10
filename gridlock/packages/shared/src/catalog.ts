/** All M2 pace knobs. Do not scatter magic numbers. */

export const TICK_HZ = 10;
export const TICK_DT = 1 / TICK_HZ;
export const TICK_MS = 100;
export const GAME_SPEED_MIN = 1;
export const GAME_SPEED_MAX = 8;
export const GAME_SPEED_DEFAULT = GAME_SPEED_MIN;
export const START_SCRAP = 2200;
/** Map Builder play tests start rich, so the tester can try anything at once. */
export const PLAYTEST_START_SCRAP = 50000;
/**
 * Gameplay tiles per original 32px cell. RA2 / Sudden Strike 2 maps feel
 * dense because the cell is small relative to a hill or a building; 4× turns
 * a 3-terrace rise into a 12-step slope without changing world size.
 */
export const TILE_SUBDIV = 4;
/** World pixels along one gameplay tile. A 64-cell map stays 2048 world-wide. */
export const TILE_SIZE = 32 / TILE_SUBDIV;
const t = (n: number): number => n * TILE_SUBDIV;
/**
 * Chebyshev gap from an owned base building's footprint within which the yard places a base building.
 * Just reaches every start's home scrap field from the Core; farther scrap takes an engineer.
 */
export const BUILD_RADIUS = t(8);
/** The same gap for the Defences tab: guns, garrisons, and lines ring the base a little past its buildings. */
export const DEFENCE_BUILD_RADIUS = t(10);
/** The same gap for sandbag, wall, and gate lines: twice the base reach, so a line can wall off ground well out from the yard. */
export const LINE_BUILD_RADIUS = 2 * BUILD_RADIUS;
export const UNIT_CAP = 60;
/** Max train jobs waiting or in progress on one producer. */
export const TRAIN_QUEUE_CAP = 39;
export const DEPLOY_SECONDS = 3;
export const SELL_REFUND = 0.5;
/** Share of the hull's cost an engineer recovers by breaking up the wreck. */
export const WRECK_SCRAP_MUL = 0.2;
/** Seconds of the fixing pose to cut a wreck into scrap. */
export const WRECK_SCRAP_SECONDS = 5;
/** Share of a ground burst's soft damage a burnt-out hulk inside it takes. */
export const WRECK_BLAST_MUL = 0.5;
/**
 * Map clutter: rounds a piece soaks before it breaks, by `ClutterType`. A shell
 * of GARRISON_STRUCTURAL_CALIBER or more, any ground burst over it, or a motor
 * vehicle rolling across it breaks it outright.
 */
export const CLUTTER_HP: Record<"crates" | "barrels" | "haybale" | "cart" | "bench" | "woodpile" | "tires" | "bins", number> = {
  crates: 40,
  barrels: 50,
  haybale: 30,
  cart: 40,
  bench: 30,
  woodpile: 60,
  tires: 70,
  bins: 25,
};
/** World px round a piece of clutter a round landing still hits. */
export const CLUTTER_HIT_REACH = TILE_SIZE * 0.7;
/** Marks a scrap tile. Scrap is never used up: a Smelter standing on it draws from it for the whole match. */
export const SCRAP_TILE_YIELD = 800;
/** Scrap a Smelter on a scrap field earns its owner each second at full power. Low power slows it like production. */
export const SMELTER_SCRAP_PER_SEC = 25;
/** Most scrap a commander can hold per standing Smelter. Earnings past it are lost; refunds still come back. */
export const SCRAP_CAP_PER_SMELTER = 40_000;
/** Share of a Smelter's footprint that must lie on scrap tiles before it can be placed. */
export const SMELTER_SCRAP_COVER = 0.5;
/** Open tiles that must lie between two Smelters, so a small scrap field holds one and a wide one only a few. */
export const SMELTER_CLEARANCE = 3;
/** A Smelter whose scrap is mostly diamond scrap pours this many times the plain rate. */
export const DIAMOND_SCRAP_MUL = 5;
/** Marks a diamond scrap tile. */
export const DIAMOND_SCRAP_TILE_YIELD = SCRAP_TILE_YIELD * DIAMOND_SCRAP_MUL;
export const LOW_POWER_MIN_SPEED = 0.25;
/** A building whose owner is short on power sees this share of its usual distance. */
export const LOW_POWER_SIGHT_MUL = 0.8;
export const FACE_FIRE_DEG = 8;
/**
 * A round that leaves along the barrel waits until the gun has finished its
 * swing: within this of the aim point. Firing mid-turn threw the first shot wide.
 */
export const FIRE_LAID_DEG = 0.5;
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
 * The Map Builder can paint up to this. Sight scans and elevated picking assume no tile is taller.
 */
export const HEIGHT_MAX = t(8);
/** Adjacent walkable tiles may differ by at most this many levels. */
export const HEIGHT_STEP_MAX = 1;
/**
 * Slopes change a unit's pace and a path's cost. Off: every tile walks like
 * level ground, and the constants below are kept for when it comes back.
 */
export const SLOPE_MOVEMENT = false;
/** Move-speed multiplier per adjacent-tile climb. TILE_SUBDIV steps ≈ one old terrace. */
export const HEIGHT_UPHILL_SPEED = 0.55 ** (1 / TILE_SUBDIV);
/** Every unit climbs this much faster than HEIGHT_UPHILL_SPEED alone, before HEIGHT_UPHILL_PACE. */
export const HEIGHT_UPHILL_BOOST = 1.3;
/** Uphill speed is this multiple of the boosted climb pace. 3 is a 200% increase. */
export const HEIGHT_UPHILL_PACE = 3;
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
/** The uphill bonus reaches at most this many tiles past catalog sight, whatever the hill. */
export const SIGHT_UPHILL_MAX_TILES = 24;
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
 * Cells: Sim Unit daggers 1.5, handgun 3, flamethrower 3.5, Feuerwirbel flame 4.5, walker 8, cyborg 8, rifle 9,
 * Feuerwirbel gatlings 10, MG42 11, StuG 12, PTRD 13,
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
/**
 * Sim Unit II's energy daggers: arm's reach, from his centre to the target's body or wall,
 * not centre to centre, and no longer from a hill. He closes to it himself, or blinks in.
 */
export const SIMUNIT_REACH_TILES = t(0.5);
/** How far a Sim Unit II looks for someone to close on by himself. Inside his own eyes. */
export const SIMUNIT_HUNT_TILES = t(7);
export const SCOPED_RANGE_TILES = t(15);
export const PTRD_RANGE_TILES = t(13);
/** Rocketer's tube. Short of the Titan's pods: one man laying it off his shoulder. */
export const LAUNCHER_RANGE_TILES = t(12);
/** Pyro's flamethrower. A jet of burning fuel carries only a few strides past a pistol. */
export const FLAMER_RANGE_TILES = t(3.5);
/** Feuerwirbel's bow projector. A pressurized hull tank throws the jet a stride or so past a Pyro. */
export const HULL_FLAMER_RANGE_TILES = t(4.5);
/** Feuerwirbel's twin gatlings. Past a rifle, short of the MG42 on its bipod. */
export const FEUERWIRBEL_RANGE_TILES = t(10);
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
/**
 * Titan's frame soaks heavy shells: it takes half a big gun's damage, and no
 * shell kills it outright. A Jagdtiger needs four or five hits, not one.
 */
export const TITAN_SHELL_RESIST = 0.5;
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
/** The pods sit fixed on the torso: they fire only on a bearing this close to where the torso, and its gun, faces. */
export const TITAN_POD_ARC_DEG = 12;
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
  /**
   * A rocket fused at a plane's height that finds no plane in its burst flies
   * on this far past, gameplay tiles, and comes down to burst on the ground.
   * Omit for a rocket that bursts in the air regardless.
   */
  missCoastTiles?: number;
  /** Reach of this rack, gameplay tiles, in place of the carrier's own rangeTiles. */
  rangeTiles?: number;
  /** Lays only on what flies (the Mawcaster's Air attacks): ground targets and ground aim points are left alone. */
  airOnly?: boolean;
  /** A laid rack fires once the frame is this close to the bearing, degrees, in place of the carrier's gunArcDeg. */
  arcDeg?: number;
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
 * fast on a high arc, below a mortar's, far past its own eyes: the longest reach
 * in the game. Force attack throws them at any point in that reach, seen or
 * not, and they pass over whatever stands in the way. A shot at a target clears
 * the units along the way and still meets a tank or a tree close to where it
 * comes down. They scatter
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
  // High enough that the rockets come down steeply: only a unit within about a
  // tile of the burst stands under the falling end of the arc.
  apexNear: 24,
  apexFar: 48,
  minRangeTiles: NEBELWERFER_MIN_RANGE_TILES,
  laid: true,
};
/**
 * After painting FOV, fill unseen 8-connected islands and hide visible ones
 * of this many tiles or fewer. Walks FOV borders only. Set to 0 to disable.
 */
export const FOV_ISLAND_LIMIT = 12;
/**
 * A unit whose path search came up empty does not search for the same goal
 * tile again for this many ticks. A failed search floods the whole reachable
 * map, and a chase with no path asks every tick.
 */
export const PATH_RETRY_TICKS = 30;
/** Tree tiles a sight ray may pass before the grove closes. One authoring cell. */
export const TREE_LOS_THROUGH = TILE_SUBDIV;
/**
 * Grove sight budget in `groveSightCost` units. A tree costs 2, so this is
 * twice TREE_LOS_THROUGH and the old tree depth is unchanged. Palms cost 1
 * and cacti cost 4.
 */
export const GROVE_SIGHT_BUDGET = TREE_LOS_THROUGH * 2;
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
export const CAPTURE_SECONDS = 20;
/** HP used as the 1× capture-time reference. */
export const CAPTURE_HP_REF = 750;
/** Floor so a cottage is not instant. */
export const CAPTURE_SECONDS_MIN = 12;
/** Progress lost per second after capturers leave or die. */
export const CAPTURE_DECAY_PER_SEC = 0.25;

export type EntityType =
  | "rig"
  | "seed"
  | "sporepod"
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
  | "feuerwirbel"
  | "walker"
  | "cyborg"
  | "cyborgcommander"
  | "simunit2"
  | "xenodrone"
  | "thrall"
  | "lancer"
  | "spitter"
  | "weaver"
  | "shade"
  | "stalker"
  | "ravager"
  | "behemoth"
  | "juggernaut"
  | "siphon"
  | "broodmother"
  | "mawcaster"
  | "leech"
  | "lurker"
  | "hiveark"
  | "wasp"
  | "scourge"
  | "overseer"
  | "gnat"
  | "spawnling"
  | "gobber"
  | "quillback"
  | "bloater"
  | "longspine"
  | "mender"
  | "skitter"
  | "goretusk"
  | "mantis"
  | "bileworm"
  | "sporemaw"
  | "matriarch"
  | "driftjelly"
  | "spineback"
  | "abyssray"
  | "leviathan"
  | "broodbarge"
  | "moth"
  | "razorwing"
  | "gasbag"
  | "drifter"
  | "harpy"
  | "titan"
  | "mammoth"
  | "nebelwerfer"
  | "artillery"
  | "supply"
  | "gunboat"
  | "supplyboat"
  | "submarine"
  | "battleship"
  | "destroyer"
  | "lst"
  | "core"
  | "hivecore"
  | "dynamo"
  | "fusionnode"
  | "smelter"
  | "assimilator"
  | "muster"
  | "armory"
  | "airfield"
  | "dock"
  | "ciws"
  | "bunker"
  | "tower"
  | "ram"
  | "tobruk"
  | "casemate"
  | "hochstand"
  | "leitturm"
  | "spotlight"
  | "mgnest"
  | "pak36"
  | "pak43"
  | "flak"
  | "research"
  | "radar"
  | "cyborgcentral"
  | "conversion"
  | "forge"
  | "nexus"
  | "spineturret"
  | "pulsespire"
  | "laserfence"
  | "spawnpool"
  | "aerie"
  | "broodheart"
  | "lumenbulb"
  | "gorger"
  | "broodnest"
  | "gestator"
  | "braincoral"
  | "tidewomb"
  | "roost"
  | "thornspitter"
  | "bilelance"
  | "puffcap"
  | "eyestalk"
  | "husk"
  | "stuka"
  | "fw190"
  | "bv222"
  | "he111"
  | "horten"
  | "droneop"
  | "drone"
  | "aswheli"
  | "torpedo"
  | "jumpjet"
  | "cottage"
  | "house"
  | "manor"
  | "shack"
  | "barn"
  | "inn"
  | "chapel"
  | "factory"
  | "warehouse"
  | "foundry"
  | "granary"
  | "hall"
  | "works"
  | "shed"
  | "boiler"
  | "sandbags"
  | "barbwire"
  | "wall"
  | "greatwall"
  | "gate"
  | "teeth"
  | "trench"
  | "bridge"
  | "bigbridge";
export type BuildingType =
  | "dynamo"
  | "smelter"
  | "muster"
  | "armory"
  | "airfield"
  | "dock"
  | "ciws"
  | "ram"
  | "bunker"
  | "tower"
  | "tobruk"
  | "casemate"
  | "hochstand"
  | "leitturm"
  | "spotlight"
  | "mgnest"
  | "pak36"
  | "pak43"
  | "flak"
  | "research"
  | "radar"
  | "cyborgcentral"
  | "conversion"
  | "fusionnode"
  | "assimilator"
  | "forge"
  | "nexus"
  | "spineturret"
  | "pulsespire"
  | "laserfence"
  | "spawnpool"
  | "aerie"
  | "lumenbulb"
  | "gorger"
  | "broodnest"
  | "gestator"
  | "braincoral"
  | "tidewomb"
  | "roost"
  | "thornspitter"
  | "bilelance"
  | "puffcap"
  | "eyestalk"
  | "husk";
/**
 * Placed by an engineer. Sandbags and walls can also be queued from the Defences tab. The gate comes
 * only from there. Barbwire is laid by maps for now: the Map Builder stands it like sandbags.
 */
export type FieldStructureType = "sandbags" | "barbwire" | "wall" | "greatwall" | "gate" | "teeth" | "trench";
export const FIELD_STRUCTURES: readonly FieldStructureType[] = ["sandbags", "barbwire", "wall", "greatwall", "gate", "teeth", "trench"];
/** Field works the construction yard can queue. An engineer can still place these anywhere, except the gate. */
export type YardFieldType = "sandbags" | "wall" | "greatwall" | "gate";
export const YARD_FIELD_TYPES: readonly YardFieldType[] = ["sandbags", "wall", "greatwall", "gate"];
/** Kept in the sim but off the Defences tab and the engineer's command bar for now. */
export const HIDDEN_FIELD_TYPES: readonly FieldStructureType[] = ["greatwall", "barbwire"];
export function isHiddenField(type: string): boolean {
  return (HIDDEN_FIELD_TYPES as readonly string[]).includes(type);
}
/**
 * Concrete lines: they block, stop direct fire, and take a crest height. An engineer lays
 * the walls as one job: every piece appears together when he finishes. The Large wall is
 * the `greatwall` id. The gate stands in place of two Wall sections.
 */
export type ConcreteLineType = "wall" | "greatwall" | "gate";
export function isConcreteLine(type: string): type is ConcreteLineType {
  return type === "wall" || type === "greatwall" || type === "gate";
}
/**
 * Field works too low for a round to find or a gunner to aim at: sandbags, dragon's teeth,
 * barbwire. Fire goes over them, bombs and strikes ignore them, and nothing targets them.
 */
export function isLowFieldWork(type: string): type is "sandbags" | "teeth" | "barbwire" {
  return type === "sandbags" || type === "teeth" || type === "barbwire";
}
/**
 * Engineer and map bridges over water, laid brick by brick along a drawn line like a wall.
 * Each brick is its own structure: one deck length (`bridgeBrickLength`) of the span.
 * `bridge` is the narrow wooden one (one tank wide), `bigbridge` the stone one (two abreast).
 * Every brick of a line keeps one deck level, the ground's height where the line was started;
 * its piles or piers reach down to whatever lies under it, as a wall's base follows the ground.
 * Only a force-attack aims at a brick. At 0 HP it falls into wreckage that cannot be destroyed;
 * an engineer rebuilds it. The bricks either side of it stand.
 */
export type BridgeType = "bridge" | "bigbridge";
export const BRIDGE_TYPES: readonly BridgeType[] = ["bridge", "bigbridge"];
/** Bridges stay in the sim but are off the engineer's command bar for now. */
export const BRIDGES_HIDDEN = true;
export function isBridge(type: string): type is BridgeType {
  return type === "bridge" || type === "bigbridge";
}
/** Deck width, world px: what a vehicle can drive on. Rails sit just outside it. */
export function bridgeWidth(type: BridgeType): number {
  return type === "bigbridge" ? 44 : 20;
}
/** One brick of deck, world px along the span: a timber bay, or a wide stone arch between piers. */
export function bridgeBrickLength(type: BridgeType): number {
  return type === "bigbridge" ? 64 : 24;
}
/** Scrap per gameplay tile of deck length. */
export function bridgeCostPerTile(type: BridgeType): number {
  return type === "bigbridge" ? 24 : 9;
}
/** Engineer seconds per gameplay tile of deck length. A wreck takes the same to rebuild. */
export function bridgeSecondsPerTile(type: BridgeType): number {
  return type === "bigbridge" ? 1.1 : 0.45;
}
/** Price of a deck `length` world px long. One brick by default. */
export function bridgeCost(type: BridgeType, length = bridgeBrickLength(type)): number {
  return Math.max(1, Math.round((length / TILE_SIZE) * bridgeCostPerTile(type)));
}
/** Engineer seconds for a deck `length` world px long. One brick by default. */
export function bridgeBuildSeconds(type: BridgeType, length = bridgeBrickLength(type)): number {
  return (length / TILE_SIZE) * bridgeSecondsPerTile(type);
}
/**
 * Damage a round aimed at a bridge does to it, as a share of the round's own damage.
 * Rifle and MG fire does nothing. Bombs use BOMB_BUILDING_DAMAGE.
 */
/**
 * Height units a deck must stand over the water for a boat to sail under it. Lower, the
 * deck closes the water to every boat.
 */
export const BRIDGE_SHIP_CLEARANCE = 2;
/** Boats too big to pass under any bridge. */
export function tooTallForBridge(type: EntityType): boolean {
  return type === "lst" || type === "battleship" || type === "hiveark";
}
export const BRIDGE_ROUND_MUL = { ap: 0.5, heat: 0.75, he: 1.5, mortar: 1, artillery: 2, rocket: 1 } as const;
/**
 * How far past the deck edge a shell's burst still counts against it, world px.
 * A mortar bomb, field-gun shell, rocket, or bomb counts anywhere its blast reaches the brick.
 */
export const BRIDGE_SPLASH_PAD = 6;
export type CivilianType =
  | "cottage"
  | "house"
  | "manor"
  | "shack"
  | "barn"
  | "inn"
  | "chapel"
  | "factory"
  | "warehouse"
  | "foundry"
  | "granary"
  | "hall"
  | "works"
  | "shed"
  | "boiler";
export const CIVILIAN_TYPES: readonly CivilianType[] = [
  "cottage",
  "house",
  "manor",
  "shack",
  "barn",
  "inn",
  "chapel",
  "factory",
  "warehouse",
  "foundry",
  "granary",
  "hall",
  "works",
  "shed",
  "boiler",
];
export type TrainType = "rifleman" | "gunner" | "sniper" | "atinfantry" | "rocketer" | "pyro" | "mortarman" | "engineer" | "medic" | "warden" | "apocalypse" | "ss3" | "jagdtiger" | "feuerwirbel" | "walker" | "cyborg" | "cyborgcommander" | "simunit2" | "xenodrone" | "thrall" | "lancer" | "spitter" | "weaver" | "shade" | "stalker" | "ravager" | "behemoth" | "juggernaut" | "siphon" | "broodmother" | "mawcaster" | "leech" | "lurker" | "hiveark" | "wasp" | "scourge" | "gnat" | "overseer" | "titan" | "mammoth" | "nebelwerfer" | "artillery" | "supply" | "gunboat" | "supplyboat" | "submarine" | "battleship" | "destroyer" | "lst" | "stuka" | "fw190" | "bv222" | "he111" | "horten" | "droneop" | "jumpjet" | "spawnling" | "gobber" | "quillback" | "bloater" | "longspine" | "mender" | "skitter" | "goretusk" | "mantis" | "bileworm" | "sporemaw" | "matriarch" | "driftjelly" | "spineback" | "abyssray" | "leviathan" | "broodbarge" | "moth" | "razorwing" | "gasbag" | "drifter" | "harpy";
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

export const BUILDING_TYPES: readonly BuildingType[] = [
  "dynamo",
  "smelter",
  "muster",
  "armory",
  "airfield",
  "dock",
  "ciws",
  "ram",
  "bunker",
  "tower",
  "tobruk",
  "casemate",
  "hochstand",
  "leitturm",
  "spotlight",
  "mgnest",
  "pak36",
  "pak43",
  "flak",
  "research",
  "radar",
  "cyborgcentral",
  "conversion",
  "fusionnode",
  "assimilator",
  "forge",
  "nexus",
  "spineturret",
  "pulsespire",
  "laserfence",
  "spawnpool",
  "aerie",
  "lumenbulb",
  "gorger",
  "broodnest",
  "gestator",
  "braincoral",
  "tidewomb",
  "roost",
  "thornspitter",
  "bilelance",
  "puffcap",
  "eyestalk",
  "husk",
];
/**
 * Emplaced guns: the building is the gun, and its garrison is the crew. It fires only while
 * someone living is at it; the crew's own weapons stay slung. Raised with its crew already in
 * place (CatalogEntry.crewGun).
 */
export const CREWED_GUNS: readonly BuildingType[] = ["mgnest", "pak36", "pak43", "flak"];
/**
 * Base buildings an engineer can raise in the field, away from the yard. The Smelter, so distant
 * scrap can be claimed; the Marine Base, so water far from the base can still float a fleet.
 */
export const ENGINEER_BUILDINGS: readonly BuildingType[] = ["smelter", "dock"];
export function isEngineerBuilding(type: string): type is BuildingType {
  return (ENGINEER_BUILDINGS as readonly string[]).includes(type);
}
/** The yard raises an engineer building this much faster than its catalog `buildSeconds`. */
export const YARD_ENGINEER_BUILDING_SPEED = 1.5;
/** An engineer in the field works at this fraction of the catalog pace. */
export const ENGINEER_BUILD_SPEED = 0.8;
/** Seconds the yard spends on a base building. */
export function yardBuildSeconds(type: BuildingType): number {
  const s = catalog(type).buildSeconds;
  return isEngineerBuilding(type) || type === "assimilator" ? s / YARD_ENGINEER_BUILDING_SPEED : s;
}
/** Seconds an engineer works to raise `type` in the field. */
export function engineerBuildSeconds(type: BuildingType): number {
  return catalog(type).buildSeconds / ENGINEER_BUILD_SPEED;
}
/**
 * Base buildings the player turns before placing them, like a wall or sandbags: one
 * BUILDING_TURN_STEP per wheel notch. The footprint turns with the building.
 */
export const ROTATABLE_BUILDINGS: readonly BuildingType[] = [
  "bunker",
  "tower",
  "airfield",
  "ciws",
  "ram",
  "tobruk",
  "casemate",
  "hochstand",
  "leitturm",
  "spotlight",
  "mgnest",
  "pak36",
  "pak43",
  "flak",
  "spineturret",
  "pulsespire",
];
/** One turn step for a rotatable building, the wall's 15°. */
export const BUILDING_TURN_STEP = Math.PI / 12;
/** Facings a rotatable building can stand at; each has its own pre-rendered face. */
export const BUILDING_FACINGS = 24;
export function isRotatableBuilding(type: string): type is BuildingType {
  return (ROTATABLE_BUILDINGS as readonly string[]).includes(type);
}
export const TRAIN_TYPES: readonly TrainType[] = ["rifleman", "gunner", "sniper", "atinfantry", "rocketer", "pyro", "mortarman", "engineer", "medic", "warden", "apocalypse", "ss3", "jagdtiger", "feuerwirbel", "walker", "cyborg", "cyborgcommander", "simunit2", "xenodrone", "thrall", "lancer", "spitter", "weaver", "shade", "stalker", "ravager", "behemoth", "juggernaut", "siphon", "broodmother", "mawcaster", "leech", "lurker", "hiveark", "wasp", "scourge", "gnat", "overseer", "titan", "mammoth", "nebelwerfer", "artillery", "supply", "gunboat", "supplyboat", "submarine", "battleship", "destroyer", "lst", "stuka", "fw190", "bv222", "he111", "horten", "droneop", "jumpjet", "spawnling", "gobber", "quillback", "bloater", "longspine", "mender", "skitter", "goretusk", "mantis", "bileworm", "sporemaw", "matriarch", "driftjelly", "spineback", "abyssray", "leviathan", "broodbarge", "moth", "razorwing", "gasbag", "drifter", "harpy"];

/**
 * A player fields only one of each of these at a time. While it lives, another
 * cannot be queued; only one can sit in the queues at once. Destroyed, it can be
 * trained again.
 */
export const ONE_AT_A_TIME: readonly TrainType[] = ["titan", "cyborgcommander"];
export function isOneAtATime(type: string): boolean {
  return (ONE_AT_A_TIME as readonly string[]).includes(type);
}

/**
 * Sidebar continuous production. A unit with a max of one, and every airplane,
 * stays a single order.
 */
export function canContinuousTrain(type: string): type is TrainType {
  return isTrainType(type) && !isOneAtATime(type) && !isAircraftType(type);
}

/** Advanced units: their producer also needs this building (or every one listed) standing before a job can be queued. */
export const TECH_REQUIRES: Partial<Record<TrainType, BuildingType | readonly BuildingType[]>> = {
  warden: "research",
  apocalypse: "research",
  jagdtiger: "research",
  cyborg: "cyborgcentral",
  cyborgcommander: "cyborgcentral",
  simunit2: "conversion",
  xenodrone: "conversion",
  thrall: "conversion",
  lancer: "conversion",
  spitter: "conversion",
  weaver: "conversion",
  shade: ["conversion", "nexus"],
  behemoth: "nexus",
  juggernaut: "nexus",
  broodmother: "nexus",
  lurker: "nexus",
  hiveark: "nexus",
  scourge: "nexus",
  overseer: "nexus",
  matriarch: "braincoral",
  abyssray: "braincoral",
  leviathan: "braincoral",
  harpy: "braincoral",
  longspine: "braincoral",
  titan: "research",
  mammoth: "research",
  nebelwerfer: "research",
  droneop: "research",
  jumpjet: "research",
  submarine: "research",
  destroyer: "research",
  battleship: ["research", "radar"],
  stuka: "research",
  he111: "research",
  horten: ["research", "radar"],
  bv222: ["research", "radar"],
};

/** Every tech building this unit needs standing, in the order a player is told about them. */
export function techNeeds(unit: TrainType): readonly BuildingType[] {
  const need = TECH_REQUIRES[unit];
  if (!need) return [];
  return typeof need === "string" ? [need] : need;
}

/**
 * Factions. Each seat picks one in the lobby. Alliance fields everything that is not
 * listed under the Xenomorphs; the Xenomorphs field only what is.
 */
export type Faction = "alliance" | "xeno" | "bloom";
export const FACTIONS: readonly Faction[] = ["alliance", "xeno", "bloom"];
export const FACTION_NAMES: Record<Faction, string> = { alliance: "Alliance", xeno: "Xenomorph", bloom: "The Bloom" };
export function isFaction(v: unknown): v is Faction {
  return v === "alliance" || v === "xeno" || v === "bloom";
}
/** The ids older saves carry ("eu" was the Alliance, "borg" the Xenomorphs), read as today's. */
export function migrateFaction(v: unknown): unknown {
  return v === "eu" ? "alliance" : v === "borg" ? "xeno" : v;
}
/** Everything the Xenomorphs build, train, or start with. */
export const XENO_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  "seed",
  "hivecore",
  "fusionnode",
  "assimilator",
  "conversion",
  "simunit2",
  "xenodrone",
  "thrall",
  "lancer",
  "spitter",
  "weaver",
  "shade",
  "stalker",
  "ravager",
  "behemoth",
  "juggernaut",
  "siphon",
  "broodmother",
  "mawcaster",
  "forge",
  "nexus",
  "spineturret",
  "pulsespire",
  "laserfence",
  "spawnpool",
  "aerie",
  "leech",
  "lurker",
  "hiveark",
  "wasp",
  "scourge",
  "overseer",
  "gnat",
]);
/**
 * Everything the Bloom grow, train, or start with: the third faction, an alien spore that
 * rewrote the marsh. Flesh, chitin, and amber glands; it regrows its wounds (sim/regrowth.ts).
 */
export const BLOOM_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  "sporepod",
  "broodheart",
  "lumenbulb",
  "gorger",
  "broodnest",
  "gestator",
  "braincoral",
  "tidewomb",
  "roost",
  "thornspitter",
  "bilelance",
  "puffcap",
  "eyestalk",
  "husk",
  "spawnling",
  "gobber",
  "quillback",
  "bloater",
  "longspine",
  "mender",
  "skitter",
  "goretusk",
  "mantis",
  "bileworm",
  "sporemaw",
  "matriarch",
  "driftjelly",
  "spineback",
  "abyssray",
  "leviathan",
  "broodbarge",
  "moth",
  "razorwing",
  "gasbag",
  "drifter",
  "harpy",
]);
/**
 * Built by the Alliance and the Xenomorphs (not the Bloom). None today: the Cyborg Central is the
 * Alliance's, and the Xenomorphs raise their infantry in the Conversion Chamber.
 */
export const SHARED_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([]);
/**
 * The faction that fields `type`. Neutral structures, civilian buildings, and shared buildings
 * read as Alliance.
 */
export function factionOf(type: string): Faction {
  if (XENO_TYPES.has(type as EntityType)) return "xeno";
  return BLOOM_TYPES.has(type as EntityType) ? "bloom" : "alliance";
}
/** A shared building's price for one faction, where it plays a different part there. */
const FACTION_COST: Partial<Record<EntityType, Partial<Record<Faction, number>>>> = {};
/**
 * Fielded by a faction but off its build menu for now: the Xenomorphs pay no scrap, so the
 * Assimilator has nothing to pour into.
 */
const SHELVED_TYPES: ReadonlySet<EntityType> = new Set<EntityType>(["assimilator"]);
/**
 * Hive energy (sim/hive-energy.ts): the Xenomorphs pay no scrap and draw no power. Their Hive Core
 * holds HIVE_CORE_ENERGY and each Fusion Node FUSION_NODE_ENERGY more; every unit and defence takes
 * its catalog `energy` while it lives. Asked for more than the hive holds, the newest go offline.
 */
export const HIVE_CORE_ENERGY = 200;
export const FUSION_NODE_ENERGY = 500;
/** Does `faction` run on hive energy instead of scrap and power? */
export function usesHiveEnergy(faction: Faction | undefined): boolean {
  return faction === "xeno";
}
/** Hive energy `type` takes while it lives: 0 for everything but Xenomorph units and defences. */
export function energyOf(type: string): number {
  return catalog(type as EntityType).energy ?? 0;
}
/** Hive energy `type` adds to the hive's store while it stands. */
export function energySupplyOf(type: string): number {
  return type === "hivecore" ? HIVE_CORE_ENERGY : type === "fusionnode" ? FUSION_NODE_ENERGY : 0;
}
/** Scrap `type` costs a player of `faction`. */
export function costFor(type: EntityType, faction: Faction): number {
  return FACTION_COST[type]?.[faction] ?? catalog(type).cost;
}
/** May a player of `faction` queue, place, or train `type`? */
export function inFaction(type: string, faction: Faction): boolean {
  if (SHELVED_TYPES.has(type as EntityType)) return false;
  if (SHARED_TYPES.has(type as EntityType)) return faction !== "bloom";
  return factionOf(type) === faction;
}
/** The headquarters packed up and on the move: the Rig, the Xenomorph Deployment (`seed`), the Bloom Spore Pod. */
export type HqRigType = "rig" | "seed" | "sporepod";
/** The headquarters building: the Core, the Xenomorph Hive Core, the Bloom Brood Heart. */
export type HqBuildingType = "core" | "hivecore" | "broodheart";
/** What each faction starts with, and what that unpacks into. */
export const HQ_OF: Record<Faction, { rig: HqRigType; core: HqBuildingType }> = {
  alliance: { rig: "rig", core: "core" },
  xeno: { rig: "seed", core: "hivecore" },
  bloom: { rig: "sporepod", core: "broodheart" },
};
/** The headquarters building: losing it eliminates the player. */
export function isHqBuilding(type: string): type is HqBuildingType {
  return type === "core" || type === "hivecore" || type === "broodheart";
}
/** The headquarters packed up and on the move. */
export function isHqRig(type: string): type is HqRigType {
  return type === "rig" || type === "seed" || type === "sporepod";
}
/** Either form of a headquarters. */
export function isHq(type: string): boolean {
  return isHqBuilding(type) || isHqRig(type);
}
/** The Core a Rig unpacks into. */
export function deployTarget(rig: HqRigType): HqBuildingType {
  return HQ_OF[factionOf(rig)].core;
}
/** The Rig a Core packs into. */
export function packTarget(core: HqBuildingType): HqRigType {
  return HQ_OF[factionOf(core)].rig;
}
/** A building that pours scrap from a scrap field: the Smelter, the Xenomorph Assimilator, the Bloom Gorger. */
export type SmelterType = "smelter" | "assimilator" | "gorger";
export function isSmelterType(type: string): type is SmelterType {
  return type === "smelter" || type === "assimilator" || type === "gorger";
}
export type PowerPlantType = "dynamo" | "fusionnode" | "lumenbulb";
/** A building that only makes power. */
export function isPowerPlantType(type: string): type is PowerPlantType {
  return type === "dynamo" || type === "fusionnode" || type === "lumenbulb";
}
const SMELTER_OF: Record<Faction, SmelterType> = { alliance: "smelter", xeno: "assimilator", bloom: "gorger" };
const POWER_PLANT_OF: Record<Faction, PowerPlantType> = { alliance: "dynamo", xeno: "fusionnode", bloom: "lumenbulb" };
/** The faction's own Smelter and Power Plant. */
export function smelterOf(faction: Faction): SmelterType {
  return SMELTER_OF[faction];
}
export function powerPlantOf(faction: Faction): PowerPlantType {
  return POWER_PLANT_OF[faction];
}
/** A shipyard on the water: the Marine Base, the Xenomorph Spawning Pool, the Bloom Tide Womb. Ships launch, rearm, and retreat here. */
export type DockType = "dock" | "spawnpool" | "tidewomb";
export function isDockType(type: string): type is DockType {
  return type === "dock" || type === "spawnpool" || type === "tidewomb";
}
/**
 * A field planes live on: the Airfield and the Bloom Roost. Same footprint, same four pads.
 * The Xenomorph Aerie is not one: its fliers never land (staysAloft), so it is a plain producer.
 */
export type AirfieldType = "airfield" | "roost";
export function isAirfieldType(type: string): type is AirfieldType {
  return type === "airfield" || type === "roost";
}
/** Where each faction's aircraft are trained: an Airfield or Roost with pads, or the Aerie. */
export type AirProducerType = AirfieldType | "aerie";
const DOCK_OF: Record<Faction, DockType> = { alliance: "dock", xeno: "spawnpool", bloom: "tidewomb" };
const AIRFIELD_OF: Record<Faction, AirProducerType> = { alliance: "airfield", xeno: "aerie", bloom: "roost" };
/** The faction's own shipyard and airfield. */
export function dockOf(faction: Faction): DockType {
  return DOCK_OF[faction];
}
export function airfieldOf(faction: Faction): AirProducerType {
  return AIRFIELD_OF[faction];
}

/** Advanced defences: the yard queues one only while every building listed here stands. */
export const BUILD_REQUIRES: Partial<Record<BuildingType, readonly BuildingType[]>> = {
  leitturm: ["research"],
  flak: ["research"],
  pak43: ["research"],
  casemate: ["research"],
  ciws: ["research", "radar"],
  ram: ["research", "radar"],
  pulsespire: ["nexus"],
  bilelance: ["braincoral"],
};

/** The Xenomorph vehicle factory: trains every Xenomorph unit that is not infantry. */
export const XENO_FACTORY = "forge";
/** The Xenomorph barracks: the Conversion Chamber turns out the hive's foot soldiers, and carries their link. */
export const XENO_BARRACKS = "conversion";
/** The Bloom brood nest (infantry) and gestator (beasts). */
export const BLOOM_NEST = "broodnest";
export const BLOOM_GESTATOR = "gestator";
/**
 * Xenomorph weapons draw on the hive, not on a rack: no Xenomorph unit or gun ever runs dry, and none
 * needs a truck, a pad, or a pool to rearm (sim/hive-ammo.ts). In return every Xenomorph weapon
 * lands XENO_DAMAGE_MUL of what the same round, beam, or blade would do from anyone else.
 */
export const XENO_DAMAGE_MUL = 0.8;
/** A plasma cannon's energy cell: how many shots it holds full, and the seconds to regrow one. */
export interface PlasmaCellDef {
  shots: number;
  rechargeSeconds: number;
}
/** The energy cell on `type`'s main gun (the Weaver's feeds its shields), or undefined when it has none. */
export function plasmaCellOf(type: string): PlasmaCellDef | undefined {
  return catalog(type as EntityType).plasmaCell;
}
/**
 * Never runs out of shells, rockets, belts, charges, bombs, or fuel for its weapons: everything
 * the Xenomorphs field (the hive feeds it), and everything the Bloom field (spines, acid, and spores
 * grow back in their glands).
 */
export function endlessAmmo(type: string): boolean {
  const f = factionOf(type);
  return f === "xeno" || f === "bloom";
}
/** Damage a weapon on `type` lands: XENO_DAMAGE_MUL of it for the Xenomorphs, whole numbers kept whole, never under 1. */
export function factionDamage(type: string, damage: number): number {
  if (damage <= 0 || factionOf(type) !== "xeno") return damage;
  return Math.max(1, Number.isInteger(damage) ? Math.round(damage * XENO_DAMAGE_MUL) : damage * XENO_DAMAGE_MUL);
}
/** Buildings that light the radar panel: the Radar Station, the Xenomorph Neural Nexus, the Bloom Brain Coral. */
export function isRadarStation(type: string): boolean {
  return type === "radar" || type === "nexus" || type === "braincoral";
}

/**
 * Regrowth: every Bloom unit and structure closes its wounds. Once it has gone
 * REGROWTH_DELAY_SECONDS without losing a hit point it regains a share of its max HP each
 * second (sim/regrowth.ts). No engineer or truck mends the Bloom; only the Mender is faster.
 */
export const REGROWTH_DELAY_SECONDS = 6;
/** Share of max HP a Bloom unit regrows each second once it is out of the fire. */
export const REGROWTH_UNIT_PER_SEC = 0.02;
/** Share of max HP a Bloom structure regrows each second once it is out of the fire. */
export const REGROWTH_BUILDING_PER_SEC = 0.006;
export function regrows(type: string): boolean {
  return factionOf(type) === "bloom";
}
/**
 * Brood infantry: the Bloom's foot soldiers are creatures, not men. No stance orders (they
 * fight on their feet) and no random limb hits (a torn limb regrows). Not on any uplink.
 */
export function isBrood(type: EntityType): boolean {
  return factionOf(type) === "bloom" && isInfantryType(type);
}
/** Never crouches or crawls: every cyborg, and the Bloom's brood. */
export function noStance(type: EntityType): boolean {
  return isCyborg(type) || isBrood(type);
}
/** Heals soldiers by hand: the Medic, and the Bloom Mender. */
export function isHealer(type: EntityType): boolean {
  return type === "medic" || type === "mender";
}

/**
 * Matriarch: as it walks she lays a Spawnling every MATRIARCH_LAY_SECONDS, up to
 * MATRIARCH_BROOD of her own alive at once (sim/brood.ts). They are free and count
 * against nothing but that limit.
 */
export const MATRIARCH_LAY_SECONDS = 18;
export const MATRIARCH_BROOD = 4;
/** Who climbs into a Husk Burrow or an Eye Stalk: the Bloom's brood. */
export const BROOD_GARRISON: readonly EntityType[] = ["spawnling", "gobber", "quillback", "bloater", "longspine", "mender"];

/**
 * Cyborg link. A Cyborg runs on the uplink from a standing, powered Cyborg Central (a
 * Xenomorph's on the synapse link from a Conversion Chamber),
 * or on a living Cyborg Commander of his own side. With neither, CYBORG_SHUTDOWN_SECONDS
 * after the link drops every Cyborg of that player on the field shuts down: still his,
 * but he stops where he stands, answers no orders, and fires at nothing. When that
 * player's link is back his dark Cyborgs wake up, unless an enemy Commander took them first.
 */
export const CYBORG_SHUTDOWN_SECONDS = 4;
/** A living Cyborg Commander takes over a shut-down Cyborg this close, friend's or foe's. */
export const CYBORG_TAKEOVER_RANGE_TILES = t(8);
/** Seconds of uplink a Commander needs to take one shut-down Cyborg. He takes them one at a time. */
export const CYBORG_TAKEOVER_SECONDS = 3;

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
  /**
   * Either end serves as the bow. Whenever the waypoint lies in the rear half the
   * hull runs stern first at full speed, at any range, so it swings the end
   * nearer the course.
   */
  doubleEnded?: boolean;
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
  /**
   * Civilian houses fall into rubble instead of vanishing: a low heap that still
   * blocks the ground but no longer blocks sight. Nothing clears it.
   */
  leavesRubble?: boolean;
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
  /** Share of a bullet hit (below GARRISON_STRUCTURAL_CALIBER, no shell, no arc) that reaches the occupants, after garrisonWoundMul. Default 1. */
  garrisonBulletMul?: number;
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
  /** Walks through water tiles like a swimmer, and like a swimmer cannot fire from one (unless fightsWading). */
  wades?: boolean;
  /** Move-speed share while wading. Omit and the hull uses TITAN_WADE_SPEED. */
  wadeSpeed?: number;
  /** A wader that keeps fighting from the water, and goes into it after what it hunts. The Juggernaut. */
  fightsWading?: boolean;
  /** Deploy braces the unit in place: stationary, hull locked, max HP × this. */
  bracedHpMul?: number;
  /**
   * Share of a big gun's damage (a tank, field, or ship gun) this hull takes.
   * Such a shell never kills it outright either: it lands as a heavy hit.
   */
  shellResist?: number;
  /** Shoulder rocket pods (TITAN_ROCKET). They fire from water, where the main gun cannot. */
  rockets?: boolean;
  /** Rockets in a full rack. Only a supply truck refills it. */
  rocketAmmo?: number;
  /** How the rockets fly and burst. Default TITAN_ROCKET_RACK. */
  rocketRack?: RocketRackDef;
  /**
   * A second rack the player switches to with Air attacks (Entity.airMode). Ground attacks
   * is rocketRack. Only the Mawcaster has one.
   */
  airRack?: RocketRackDef;
  /** Flies.Parks on an Airfield pad, ignores ground collision and paths. */
  aircraft?: boolean;
  /** A fighter like the Fw 190: barrages on each pass, and hunts planes in the air. */
  fighter?: boolean;
  /**
   * Hovers like a helicopter (the Xenomorph Overseer): lifts straight off its pad and sets straight
   * down on it, stops in the air, and burns down on what it hangs over (sim/air.ts tickHover).
   */
  hovers?: boolean;
  /**
   * Jaws, not a gun (the Xenomorph Lurker): a bite at the reach of `rangeTiles` from its body to the
   * target's, landing at once. Up or down it bites, and the bite gives it away like a shot.
   */
  bite?: boolean;
  /**
   * Radar-laid mount (the CIWS, the RAM). Fires on its own at units only, planes and paratroopers first,
   * lays on a plane with CIWS_AIR_SPREAD instead of AIR_TARGET_SPREAD, cranks
   * the gun to any height, and shoots rockets out of the air.
   */
  radarLaid?: boolean;
  /**
   * A crewless building gun (the Xenomorph Spine Turret and Pulse Spire). It lays and fires on its own
   * like a turret, needs nobody at it, and falls silent while its owner is short on power.
   */
  poweredGun?: boolean;
  /**
   * A Xenomorph plasma cannon's energy cell (sim/hive-ammo.ts): every round the main gun fires draws
   * one shot of energy, and the cell regrows one shot each `rechargeSeconds`. Empty, the gun waits.
   */
  plasmaCell?: PlasmaCellDef;
  /**
   * Hive energy this Xenomorph unit or defence holds while it lives (sim/hive-energy.ts). The
   * Xenomorphs pay no scrap: each one takes a share of the Hive Core's and Fusion Nodes' energy.
   */
  energy?: number;
  /**
   * A radar-laid 20mm mount on the turret roof (the Apocalypse). It traverses and
   * picks targets on its own, apart from the main gun. Incoming missiles come
   * first, and it bursts them more often than the pad CIWS does. It takes the
   * coaxial MG's place: its belt is mgAmmo.
   */
  roofCiws?: boolean;
  /**
   * An emplaced gun worked by its garrison (CREWED_GUNS). It fires only with a living crew
   * inside; short-handed, each shot, belt change, and swing of the gun takes garrisonCap / crew times as long.
   * Raised with garrisonCap riflemen already at it.
   */
  crewGun?: boolean;
  /**
   * A spotlight worked by its garrison (the Spotlight post). The lamp burns, turns, and sweeps
   * only with someone living at it. Raised with garrisonCap riflemen already at it, like a crewed gun.
   */
  lampCrew?: boolean;
  /**
   * Traverse each side of the way the emplacement was turned, degrees. The gun never lays
   * outside it: what stands behind the arc is left alone. Omit for all round.
   */
  mountArcDeg?: number;
  /** Rounds reach a plane, a Jump Jet aloft, and a high drone, like the MG42. */
  antiAir?: boolean;
  /** Looks for a plane before anything on the ground, and lays on it with the CIWS's tight cone. */
  airFirst?: boolean;
  /** Reach on a plane in the air, as a share of the ground reach. Default 1. */
  airReachMul?: number;
  /** Lays only on what is in the air (the Flak). A forced aim at the ground puts a barrage up over it. */
  airOnly?: boolean;
  /** Picks armored hulls before soft targets in its reach. */
  armorFirst?: boolean;
  /** Main-gun barrels. A twin mount fires them one after another. Default 1. */
  twinGuns?: boolean;
  /**
   * Two CIWS mounts on the deck instead of a gun (the Feuerwirbel). Each traverses, picks,
   * heats, and fires on its own (tickTwinCiws), and with more than one enemy in reach they
   * never share a target. Both feed from `belt`. Like every gatling they never bring a building
   * down and hold off tank plate they cannot mark unless the player names the target.
   */
  twinCiws?: boolean;
  /**
   * A flame projector fixed in the bow (the Feuerwirbel). It fires on its own clock, only
   * inside HULL_FLAMER_ARC_DEG of the nose, at what fire can hurt. Its fuel rides in the
   * coaxial MG's place (mgAmmo), so only a supply truck refills it.
   */
  hullFlamer?: boolean;
  /** Quadcopter flown by a Drone Op. Hovers, ignores ground collision and paths. */
  drone?: boolean;
  /**
   * A hull that floats: it moves on water tiles only and never comes ashore. It does not
   * wade, so it fires from the water. Shot apart, it settles on the bottom as a wreck
   * that blocks the water like a hulk ashore, until it is shot apart or a boat salvages it.
   */
  naval?: boolean;
  /** Building: every footprint tile must be water. The Marine Base. */
  onWater?: boolean;
  /**
   * The main gun is a torpedo tube. A torpedo runs at the waterline, only meets what floats or
   * stands in the water, and dies where the water ends.
   */
  torpedoes?: boolean;
  /**
   * Can dive: submerged, enemies see it only close by, or for a short while after it fires.
   * Down, it only torpedoes another boat that is down too. It must surface to strike a hull.
   */
  submerges?: boolean;
  /**
   * Lives below and never takes air (the Lurker): always submerged, no Dive or Surface. It comes
   * up only for SUB_REVEAL_SECONDS after it strikes. Its catalog sight is its sight under water.
   */
  neverSurfaces?: boolean;
  /** A torpedo running in the water. Nobody commands it; any gun can shoot it before it arrives. */
  torpedoBody?: boolean;
  /**
   * Torpedo bomber (the He 111). One torpedo slung under the belly, the submarine's own. It lets it go
   * only over water, and the torpedo always runs its full length.
   */
  airTorpedo?: boolean;
  /**
   * Unarmed reconnaissance plane (the Horten VII). No bomb, no guns, no bay: it flies over and
   * looks. Flies at HORTEN_CRUISE_ALT, carries HORTEN_FUEL_SECONDS, and sees
   * HORTEN_FLYING_SIGHT_BONUS farther in the air.
   */
  recon?: boolean;
  /**
   * Hull sonar (the Destroyer): it hears every enemy submarine within SONAR_RANGE_TILES, down or up,
   * and carries an ASW helicopter that goes out after what it hears, and lays water mines.
   */
  sonar?: boolean;
  /** The Destroyer's ASW helicopter. Nobody commands it: it flies from its ship and back. */
  aswHeli?: boolean;
  /**
   * A tank deck (the Transport LST): vehicles board as well as infantry, each taking
   * LST_BAY_LOAD room out of garrisonCap, over a bow ramp that must touch land. Only the
   * first two soldiers aboard who can shoot fire, from the deck MG tubs (DECK_MG).
   */
  tankDeck?: boolean;
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
export type InfantryWeaponId = "rifle" | "handgun" | "mg42" | "scoped" | "mortar" | "ptrd" | "gatling" | "launcher" | "flamer" | "assault" | "penetrator" | "laser" | "daggers" | "fists" | "deckmg";
export const INFANTRY_WEAPON_IDS: readonly InfantryWeaponId[] = ["rifle", "handgun", "mg42", "scoped", "mortar", "ptrd", "gatling", "launcher", "flamer", "assault", "penetrator", "laser", "daggers", "fists", "deckmg"];
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
export const CYBORG_DRUM = 300;
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
  blurb: "One Walker gatling on the arm: 1,200 rounds a minute from a 300-round drum. The drum does not reload by itself — bring a supply truck.",
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
 * Cyborg sensors in place of a headlight. A Cyborg's thermal scanner picks up
 * enemy soldiers in a cone off his facing, THERMAL_HALF_DEG either side, out to
 * THERMAL_RANGE_TILES. The Commander's thermal reads soldiers all round him out
 * to COMMANDER_SCAN_RANGE_TILES; his APS radar reads armored hulls all round
 * him out to COMMANDER_APS_RANGE_TILES, but only a hull that moved within the
 * last APS_MOVE_MEMORY_SECONDS. Neither needs a line of sight. A contact is a
 * mark on the map; a Cyborg set to engage contacts fires at it blind. A
 * shut-down Cyborg's scanner is dark.
 */
export const THERMAL_RANGE_TILES = t(10);
export const THERMAL_HALF_DEG = 35;
export const COMMANDER_SCAN_RANGE_TILES = t(13);
export const COMMANDER_APS_RANGE_TILES = t(20);
export const APS_MOVE_MEMORY_SECONDS = 1;

/**
 * Cyborg Commander. An officer-grade cyborg: the Cyborg's frame and crawl rule,
 * a force field that takes every hit before the plating does, and a cutting
 * laser in place of the gatling.
 */
export const COMMANDER_RANGE_TILES = t(11);
/** Force-field points. Every hit comes off these first; only what is left reaches his HP. */
export const FORCE_FIELD_HP = 200;
/** Seconds without a hit before a field that still holds starts to recharge. */
export const FORCE_FIELD_DELAY = 7;
/** Seconds without a hit before a field that was knocked down comes back. */
export const FORCE_FIELD_DOWN_DELAY = 12;
/** Field points a second while it recharges. Empty to full in five seconds. */
export const FORCE_FIELD_REGEN_PER_SEC = 40;
/**
 * Weapons power to the field: the laser goes dark, and the field holds this many
 * times its points and recharges this many times as fast. Back to the laser, the
 * surplus bleeds off at once.
 */
export const FORCE_FIELD_DIVERT_MUL = 5;
/** The Commander's plating mends itself, very slowly: HP a second while he lives. */
export const COMMANDER_HP_REGEN_PER_SEC = 0.5;

/**
 * Sim Unit II. A light, fast cyborg frame built for the knife: a short energy
 * dagger in each hand, and a blink drive that throws him SIMUNIT_BLINK_RANGE_TILES
 * in an instant on one charge, which comes back by itself in
 * SIMUNIT_BLINK_RECHARGE_SECONDS. One slash kills any soldier who is not a
 * cyborg; it opens a Walker or a truck at SIMUNIT_LIGHT_MUL of the hull cut, and barely
 * scratches a tank or a wall. But only at arm's reach: an enemy he is going for
 * that stands past it and inside the blink, he blinks onto while the charge is up.
 * Against a structure or a hull with enemy soldiers inside he blinks in, spends
 * SIMUNIT_PURGE_SECONDS among them, kills every soldier aboard, and blinks back out.
 */
/** A slash on a soldier: more than any man's whole pool. A Cyborg takes five. */
export const SIMUNIT_SLASH_DAMAGE = 60;
/** A slash on anything that is not a soldier, before the plate's share below. */
export const SIMUNIT_HULL_SLASH_DAMAGE = 22;
/** He walks a gap shorter than this rather than spend the blink on it. */
export const SIMUNIT_STRIKE_MIN_TILES = t(1.5);
/** Slash cooldown, seconds: two cuts a second, one hand then the other. */
export const SIMUNIT_SLASH_SECONDS = 0.45;
/** Share of a slash a light hull (a Walker, a truck) takes. */
export const SIMUNIT_LIGHT_MUL = 0.5;
/** Share of a slash a heavy plate takes: little to nothing. */
export const SIMUNIT_HEAVY_MUL = 0.05;
/** Share of a slash a wall takes. */
export const SIMUNIT_BUILDING_MUL = 0.15;
export const SIMUNIT_BLINK_RANGE_TILES = t(8.4);
export const SIMUNIT_BLINK_RECHARGE_SECONDS = 18;
/** Behemoth lunge: how far its legs throw it, cells. */
export const BEHEMOTH_LUNGE_RANGE_TILES = t(9);
/** Seconds in the air, take-off to landing. */
export const BEHEMOTH_LUNGE_SECONDS = 1.3;
/** Top of the arc, world px. */
export const BEHEMOTH_LUNGE_APEX = 16;
/** Seconds after landing before the legs can throw it again. */
export const BEHEMOTH_LUNGE_RECHARGE_SECONDS = 24;
/** Green laser sweeps it lets go where it lands, one after another on random bearings. */
export const BEHEMOTH_RING_SWEEPS = 6;
/** Reach of each landing sweep, cells. */
export const BEHEMOTH_RING_RANGE_TILES = t(5);
/** Half the arc each landing sweep cuts, degrees. */
export const BEHEMOTH_RING_HALF_DEG = 28;
/** Seconds each landing sweep takes to cut its arc. */
export const BEHEMOTH_RING_SWEEP_SECONDS = 0.3;
/** Behemoth jumps by itself at an enemy unit it is fighting no nearer than this, cells. */
export const BEHEMOTH_AUTO_LUNGE_MIN_TILES = t(4);
/** …and no farther than this: past its legs' reach by about half a landing sweep. */
export const BEHEMOTH_AUTO_LUNGE_MAX_TILES = BEHEMOTH_LUNGE_RANGE_TILES + t(2.5);
/** It comes down this short of the enemy, so the landing sweeps reach it. */
export const BEHEMOTH_AUTO_LUNGE_SHORT_TILES = t(2);
/** Behemoth plasma bolt damage at the muzzle, times the bolt's load. Falls off in a line to… */
export const BEHEMOTH_PULSE_NEAR_MUL = 1.5;
/** …this at full range. */
export const BEHEMOTH_PULSE_FAR_MUL = 0.6;

/** Behemoth pulse settings: one heavy bolt a barrel, or a stream of light ones. */
export type BehemothPulse = "high" | "light";
export const BEHEMOTH_PULSE_MODES: readonly {
  id: BehemothPulse;
  name: string;
  blurb: string;
  /** Times the bolt's damage. */
  damageMul: number;
  /** Times the gun's reload. */
  cooldownMul: number;
  /** Shots of the energy cell one bolt draws. */
  energy: number;
}[] = [
  {
    id: "high",
    name: "High Pulse",
    blurb: "Full-power bolts: one a barrel, then the long reload. Goes through a Tiger's front plate; hits hardest up close.",
    damageMul: 1,
    cooldownMul: 1,
    energy: 1,
  },
  {
    id: "light",
    name: "Light Pulse",
    blurb: "Light bolts in quick succession: about four times the rate of fire, under a third of the damage each, and a quarter of the cell a bolt.",
    damageMul: 0.3,
    cooldownMul: 0.25,
    energy: 0.25,
  },
];

/** The pulse setting on `e`, or undefined when its gun has none. */
export function behemothPulseOf(e: { type: EntityType; lightPulse?: true }): (typeof BEHEMOTH_PULSE_MODES)[number] | undefined {
  if (!hasPulseModes(e.type)) return undefined;
  return BEHEMOTH_PULSE_MODES[e.lightPulse ? 1 : 0];
}

/** Its plasma gun switches between High and Light Pulse: the Behemoth. */
export function hasPulseModes(type: EntityType): boolean {
  return type === "behemoth";
}
/** Stalker: seconds to dig in, in plain sight. */
export const STALKER_BURROW_SECONDS = 1.6;
/** Stalker: seconds to break back out; it comes up with its gun laid. */
export const STALKER_UNBURROW_SECONDS = 0.8;
/**
 * Juggernaut (sim/juggernaut.ts): a giant with a two-handed hammer. Reach is measured like the
 * Sim Unit's blades, from its centre to the target's body or wall.
 */
export const JUGGERNAUT_REACH_TILES = t(1.5);
/** How far it looks for something to run down by itself. */
export const JUGGERNAUT_HUNT_TILES = t(8);
/** Pace while it closes on what it is going for, times its walk. */
export const JUGGERNAUT_SPRINT_MUL = 2.6;
/** Seconds between hammer blows. */
export const JUGGERNAUT_HAMMER_SECONDS = 1.8;
/** Radius of a hammer blow, round the point it lands on. */
export const JUGGERNAUT_HAMMER_BLAST_TILES = t(1.4);
/** A hammer blow at its centre: on a soldier (more than any pool but a cyborg's), a hull, a building. */
export const JUGGERNAUT_HAMMER_SOLDIER = 120;
export const JUGGERNAUT_HAMMER_HULL = 60;
export const JUGGERNAUT_HAMMER_BUILDING = 150;
/** At or under this share of its pool it throws the hammer and fights on with its fists. */
export const JUGGERNAUT_RAGE_HP = 0.35;
/** How far the hammer is thrown, cells. */
export const JUGGERNAUT_THROW_RANGE_TILES = t(9);
/** The thrown hammer: flight speed, cells a second, and its landing at the centre. */
export const JUGGERNAUT_THROW_SPEED_TILES = t(14);
export const JUGGERNAUT_THROW_BLAST_TILES = t(1.8);
export const JUGGERNAUT_THROW_SOLDIER = 200;
export const JUGGERNAUT_THROW_HULL = 110;
export const JUGGERNAUT_THROW_BUILDING = 300;
/** Fists: seconds between blows, a tighter blast, and a lighter hit. */
export const JUGGERNAUT_FIST_SECONDS = 0.6;
export const JUGGERNAUT_FIST_BLAST_TILES = t(0.7);
export const JUGGERNAUT_FIST_SOLDIER = 60;
export const JUGGERNAUT_FIST_HULL = 22;
export const JUGGERNAUT_FIST_BUILDING = 55;
/** Without the hammer it moves this much faster, sprint or walk. */
export const JUGGERNAUT_FIST_PACE_MUL = 1.35;
/** The Juggernaut: hammer, sprint, and the throw at low HP. */
export function isJuggernaut(type: EntityType): boolean {
  return type === "juggernaut";
}
/** Leaps on its legs at a point (sim/lunge.ts): the Behemoth. */
export function canLunge(type: EntityType): boolean {
  return type === "behemoth";
}

/**
 * Hive energy shield (sim/energy-shield.ts). A unit that is fighting a target
 * in reach throws a curved wall of energy across its front. The wall stays where
 * it was raised. It stops every enemy round that meets it, the beams too, and no
 * enemy ground unit walks through it; its own side walks and shoots through.
 * Rounds lobbed from above (mortars, field guns, bombs) fall over it. Each hit
 * takes the round's damage off the wall's points; at zero it is gone.
 */
export interface EnergyShieldDef {
  /** Points the wall holds. */
  hp: number;
  /** Distance of the curve from where the unit stood, world px. */
  arcPx: number;
  /** Half of the curve's span either side of the aim, degrees. */
  halfDeg: number;
  /** Seconds it stands if nothing brings it down. */
  seconds: number;
  /** Seconds from the wall going down until the unit can raise another. */
  rechargeSeconds: number;
}
const BEHEMOTH_SHIELD: EnergyShieldDef = { hp: 900, arcPx: 34, halfDeg: 80, seconds: 20, rechargeSeconds: 25 };
/** The infantry wall: the same wall, small and far weaker. */
const INFANTRY_SHIELD: EnergyShieldDef = { hp: 90, arcPx: 13, halfDeg: 65, seconds: 12, rechargeSeconds: 20 };
const ENERGY_SHIELDS: Partial<Record<EntityType, EnergyShieldDef>> = {
  behemoth: BEHEMOTH_SHIELD,
  xenodrone: INFANTRY_SHIELD,
  lancer: INFANTRY_SHIELD,
};
/**
 * The wall a Weaver throws in front of a friend under fire (sim/weaver.ts): one soldier wide and
 * weaker than a Drone's own. Not in ENERGY_SHIELDS: the Weaver's cell sets the pace, not a recharge.
 */
export const WEAVER_SHIELD: EnergyShieldDef = { hp: 60, arcPx: 12, halfDeg: 60, seconds: 10, rechargeSeconds: 0 };
/** The energy wall this type raises, or undefined. */
export function energyShieldOf(type: EntityType): EnergyShieldDef | undefined {
  return ENERGY_SHIELDS[type];
}

/**
 * Hive energy dome (sim/energy-shield.ts). The unit holds a full dome of energy round itself
 * whenever it is up and running, fighting or not, and the dome walks with it. Whatever comes in
 * from outside stops on it: every round and beam, shells and bombs dropping from above, the
 * blast of a burst outside, a blow at arm's reach. Its own side inside walks and shoots out
 * freely; no enemy ground unit walks in. Each hit drains the unit's energy by the hit's damage.
 * Drained to nothing the dome is gone, and the energy must fill all the way back before it
 * is cast again.
 */
export interface EnergyDomeDef {
  /** Energy the unit holds: the dome's points. */
  energy: number;
  /** Radius of the dome, tiles. */
  radiusTiles: number;
  /** Seconds for drained energy to fill back up and the dome to be cast again. */
  rechargeSeconds: number;
  /** Energy regained each second while the dome stands. */
  regenPerSecond: number;
}
export const SIPHON_DOME: EnergyDomeDef = { energy: 800, radiusTiles: t(3), rechargeSeconds: 20, regenPerSecond: 12 };
/** The Hive Ark's dome over its whole hull (ARK_HULL_RADIUS 40 px): far stronger, slower to come back. */
export const ARK_DOME: EnergyDomeDef = { energy: 3000, radiusTiles: t(1.7), rechargeSeconds: 30, regenPerSecond: 30 };
const ENERGY_DOMES: Partial<Record<EntityType, EnergyDomeDef>> = {
  siphon: SIPHON_DOME,
  hiveark: ARK_DOME,
};
/** The energy dome this type casts, or undefined. */
export function energyDomeOf(type: EntityType): EnergyDomeDef | undefined {
  return ENERGY_DOMES[type];
}
/** Digs in under the ground and waits (sim/burrow.ts): the Stalker, and the Bloom Bile Worm. */
export function canBurrow(type: EntityType): boolean {
  return type === "stalker" || type === "bileworm";
}
/** Seconds inside a hostile garrison before every soldier in it is dead and he is out again. */
export const SIMUNIT_PURGE_SECONDS = 2;

export const DAGGERS = {
  id: "daggers" as const,
  name: "Energy daggers",
  blurb: "A short blade in each hand. Arm's reach: he runs the target down himself, or blinks onto it. One slash kills a soldier; a Walker or a truck takes a slit; a tank or a wall takes almost nothing. Never needs a truck.",
  damage: SIMUNIT_SLASH_DAMAGE,
  penetration: 0,
  caliber: 8,
  spreadDeg: 0,
  cooldown: SIMUNIT_SLASH_SECONDS,
  clip: 1,
  reload: 0,
  rangeTiles: SIMUNIT_REACH_TILES,
} as const satisfies InfantryGun;

/**
 * Thrall. The hive's cheap brawler: a taken body on a heavy frame that runs
 * everywhere and fights with its two armoured fists. A soldier it reaches is
 * pummelled, one fist then the other, THRALL_PUNCH_DAMAGE a blow. An armored
 * hull it reaches, it does not punch: it detonates against the plate
 * (THRALL_BLAST_*), and nothing is left of it. It vaults sandbags and walls.
 * A bullet now and then catches a shoulder and staggers it: the run slows to
 * THRALL_STAGGER_SPEED for THRALL_STAGGER_SECONDS.
 */
/** One blow of a fist on a soldier. A rifleman is down in four. */
export const THRALL_PUNCH_DAMAGE = 12;
/** Seconds between blows, one hand then the other. */
export const THRALL_PUNCH_SECONDS = 0.25;
/** Arm's reach, like the Sim Unit's blades: from its centre to the target's body or wall. */
export const THRALL_REACH_TILES = SIMUNIT_REACH_TILES;
/** Share of a blow a wall or a building takes. */
export const THRALL_BUILDING_MUL = 0.15;
/** Blast radius when it detonates on a hull, in gameplay tiles. */
export const THRALL_BLAST_TILES = t(1.25);
/** HP at the centre against a hull heavier than light plate. */
export const THRALL_BLAST_HEAVY = 35;
/** HP at the centre against soldiers, light hulls, buildings, and everything else. */
export const THRALL_BLAST_SOFT = 55;
/** Chance a bullet that lands staggers it. Not every round: now and then. */
export const THRALL_STAGGER_CHANCE = 0.2;
/** How long a stagger slows it, seconds. */
export const THRALL_STAGGER_SECONDS = 0.6;
/** Its speed while staggered, as a share of the sprint. */
export const THRALL_STAGGER_SPEED = 0.55;
/** After a stagger ends, this long before the next can land, seconds. A hail of fire does not pin it. */
export const THRALL_STAGGER_GUARD_SECONDS = 0.6;
/** Rounds of this caliber or under are bullets: they can stagger it. */
export const THRALL_STAGGER_MAX_CALIBER = 13;

export const FISTS = {
  id: "fists" as const,
  name: "Armoured fists",
  blurb: "Two heavy fists, fast blows one after the other at arm's reach. A soldier goes down in a few; a wall takes little. An armored hull it does not hit: it detonates against it. Never needs a truck.",
  damage: THRALL_PUNCH_DAMAGE,
  penetration: 0,
  caliber: 8,
  spreadDeg: 0,
  cooldown: THRALL_PUNCH_SECONDS,
  clip: 1,
  reload: 0,
  rangeTiles: THRALL_REACH_TILES,
} as const satisfies InfantryGun;

/** Jumps sandbags and walls (fortBlock 1) where every other unit walks round: the Thrall. */
export function vaultsWalls(type: EntityType): boolean {
  return type === "thrall";
}

export const COMMANDER_FIELD_MODES = [
  {
    id: "laser" as const,
    name: "Laser",
    blurb: "Power to the cutting laser. The field holds its normal points.",
  },
  {
    id: "field" as const,
    name: "Shield",
    blurb: `Weapons power to the force field: it holds ${FORCE_FIELD_DIVERT_MUL}× the points and recharges ${FORCE_FIELD_DIVERT_MUL}× as fast. The laser is dark and he cannot attack.`,
  },
] as const;

/** Most force-field points a Commander can hold right now. */
export function forceFieldMax(e: { fieldDivert?: true }): number {
  return e.fieldDivert ? FORCE_FIELD_HP * FORCE_FIELD_DIVERT_MUL : FORCE_FIELD_HP;
}
/**
 * The laser on a soldier: it always cuts out to full reach and sweeps across
 * the target from one side to the other, LASER_SWEEP_HALF_DEG either side of
 * him, in LASER_SWEEP_SECONDS. Every soldier the beam passes, friend or foe,
 * is burned down where he stands; a Cyborg's plating takes LASER_SWEEP_CYBORG_DAMAGE
 * instead. Where the tip cuts the ground at full reach, a thin line of small
 * fires is left burning. Every tree the beam crosses burns down; trees do not
 * stop it. Buildings and concrete do.
 */
export const LASER_SWEEP_HALF_DEG = 14;
export const LASER_SWEEP_SECONDS = 1.2;
export const LASER_SWEEP_CYBORG_DAMAGE = 90;
/** World px either side of the beam that still counts as passed through. */
export const LASER_BEAM_HALF_WIDTH = 2;
/**
 * The Xenomorph Laser Fence (sim/laser-fence.ts): a post links to its nearest post of the same owner
 * up to LASER_FENCE_REACH_TILES away, and to the nearest on its far side. Two beams hold between them.
 * A ground unit that is not the hive's burns while it touches one: LASER_FENCE_BURN_SHARE of its full
 * body a second, never under LASER_FENCE_BURN_MIN points a second. Rounds and the hive pass freely.
 */
export const LASER_FENCE_REACH_TILES = t(6);
export const LASER_FENCE_BURN_SHARE = 0.6;
export const LASER_FENCE_BURN_MIN = 60;
/**
 * The Spine Turret's cell: it fires at an MG42's pace (20 rounds a second), so 60 rounds is a
 * 3-second burst, and it regrows 10 rounds a second: held on a target, it settles at half pace.
 */
export const SPINE_TURRET_CELL = { shots: 60, rechargeSeconds: 0.1 };
/** Hive energy a fence link holds per cell of its length, on top of each post's own (sim/hive-energy.ts). */
export const LASER_FENCE_ENERGY_PER_CELL = 5;
/** World px either side of a fence beam that a body still touches. */
export const LASER_FENCE_BEAM_HALF_WIDTH = 2;
/**
 * The laser on anything else (a hull, a building, a wreck): one straight beam
 * onto the target for LASER_LINE_SECONDS. It cuts through any plate from any
 * face, for a moderate LASER_LINE_DAMAGE; an armored unit (a hull or a wreck)
 * takes LASER_ARMOR_DAMAGE instead. A small fire is left where it lands,
 * and the trees and soldiers (his own too) between him and the target burn.
 */
export const LASER_LINE_SECONDS = 0.35;
export const LASER_LINE_DAMAGE = 30;
/** The line on an armored unit: half again the line's damage. */
export const LASER_ARMOR_DAMAGE = LASER_LINE_DAMAGE * 1.5;
/** Seconds the emitter recharges between shots. */
export const LASER_RECHARGE = 4;
/** The beam's fires: smaller and shorter-lived than a flamethrower's patch. */
export const LASER_FIRE_RADIUS = t(0.2) * TILE_SIZE;
export const LASER_FIRE_SECONDS = 6;
/** World px between fires along the cut. Far enough apart that they do not merge. */
export const LASER_FIRE_SPACING = LASER_FIRE_RADIUS * 1.25;
export const LASER = {
  id: "laser" as const,
  name: "Cutting laser",
  blurb: "Always cuts out to full reach. On soldiers it sweeps across them and burns down every soldier the beam passes, his own too, leaving a line of fire on the ground. Trees in its path burn down. On a hull or a building it is one straight beam that cuts any plate: heavy damage to a hull, moderate to a building. Recharges between shots; never needs a truck.",
  damage: LASER_LINE_DAMAGE,
  penetration: 999,
  caliber: 20,
  spreadDeg: 0,
  cooldown: 0.5,
  clip: 1,
  reload: LASER_RECHARGE,
  rangeTiles: COMMANDER_RANGE_TILES,
  bulky: true,
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
export const PTRD_TRACK_CHANCE = 0.7;

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
  blurb: "Anti-tank rifle. A soldier takes the same hit as from the scoped rifle. Up close it punches tank side and rear, usually a track, and it goes through light armor. The front plate holds.",
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
 * the soldiers they land among. The jet itself burns every soldier it passes,
 * friend or foe, the way the Cyborg Commander's beam does, and every tree on
 * that line. It leaves the ground burning from a little past his body all the
 * way to the target. A glob that lands on dry ground feeds that fire, and the
 * fire keeps burning whoever stands in it. The tanks hold FLAMER_BURSTS bursts
 * (four full ones and a short squeeze — half again the old three) and never
 * refill by themselves: bring a supply truck. The jet goes over sandbags and
 * in through a house's windows. A building or a concrete line stops it.
 * Burning fuel only scorches armor plate, so he leaves tanks alone.
 */
export const FLAMER_BURST = 8;
/** Four full bursts and a half. 8 × 4.5 = 36 globs, half again the old 24. */
export const FLAMER_BURSTS = 4.5;
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
  blurb: "A short jet of burning fuel. It burns every soldier in its path, his own too, and leaves the ground alight from just in front of him out to the target. Trees in the jet burn down. Four bursts and a short one in the tanks; only a supply truck refills them.",
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
 * Feuerwirbel. A flame tank: two CIWS mounts on the deck, fore and aft, for
 * soldiers and anything in the air, and a flame projector fixed in the bow.
 *
 * Each mount is one gatling, the Walker's gun on a heavier round that sometimes
 * bites a Walker or a truck, with its own traverse, target, and heat. They feed
 * from one belt.
 */
export const FEUERWIRBEL_MOUNT_SHOTS_PER_TICK = WALKER_ONE_BURST;
/** Both mounts' belt. Like the Walker's backpack it never reloads; only a supply truck refills it. */
export const FEUERWIRBEL_BELT = 1600;
/** Each mount is light and power-traversed: faster than any turret on the field, past the Tiger's and the Walker's torso. */
export const FEUERWIRBEL_MOUNT_TURN = 300;
/** Mount pivots along the keel, meters from the hull's centre: fore, then aft (render_feuerwirbel.py MOUNT_X). */
export const FEUERWIRBEL_MOUNT_AT = [0.9, -1.0] as const;
/** The model's half length in meters, which the sim radius stands for. */
export const FEUERWIRBEL_HALF_LENGTH_M = 3.35;
/**
 * The bow projector throws the Pyro's globs, a burst at a time, from a hull tank
 * that holds HULL_FLAMER_BURSTS bursts. It never traverses: the jet leaves within this many
 * degrees either side of the nose, and the driver turns the hull onto a target inside its reach.
 */
export const HULL_FLAMER_ARC_DEG = 12;
/** Bursts in a full hull tank: a big tank of fuel, enough to keep burning through a long fight. */
export const HULL_FLAMER_BURSTS = 50;
export const HULL_FLAMER_FUEL = FLAMER_BURST * HULL_FLAMER_BURSTS;
/** The pause between bursts. A pump, not a man's grip: a little shorter than the Pyro's. */
export const HULL_FLAMER_BURST_PAUSE = 1.2;

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
/**
 * The Pyro's trail starts this far past his body, then one patch-width more,
 * so the first flames sit a little further out than he stands. Wide enough
 * that feeding the same trail across a full tank does not walk it back onto him.
 * World px.
 */
export const FLAMER_TRAIL_GAP = TILE_SIZE * 1.5;
/** Patch centers along the jet. They overlap, so the path is one burn, and they do not merge into a single blob. */
export const FLAMER_TRAIL_SPACING = FIRE_RADIUS * 1.2;
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
 * A tank's HE shell bursts where it stops and leaves the ground around it
 * burning, the same fire the Pyro lays. Patches in two rings around the burst.
 * World pixels. Kept few: every tank HE round lights them, and each patch is
 * costly to draw, so a long tank fight would otherwise drag the frame rate down.
 */
export const HE_FIRE_RADIUS = t(1.4) * TILE_SIZE;
export const HE_FIRE_PATCHES = 4;
/**
 * A Xenomorph energy round that lands in the dirt digs no crater: it scorches the
 * ground, burns the trees in reach, and leaves a small fire at the heart. The
 * scorch is PLASMA_SCORCH_SCALE times the hole the same caliber would dig, never
 * under PLASMA_SCORCH_MIN_RADIUS world pixels, so a rifle bolt leaves a dot and
 * a 75mm plasma shell a patch two cells across.
 */
export const PLASMA_SCORCH_SCALE = 1.2;
export const PLASMA_SCORCH_MIN_RADIUS = 2.5;
/**
 * From this caliber up the scorch keeps a fire burning at its heart (and a
 * bolt that meets a tree in flight sets it alight). Small arms only char the
 * ground: a fire under every missed bolt would burn half the field.
 */
export const PLASMA_FIRE_CALIBER = 20;
/** The fire's radius as a share of the scorch, held between 3 world pixels and FIRE_RADIUS. */
export const PLASMA_FIRE_SHARE = 0.45;
/** Seconds the fire burns. Short: it is the round's heat, not spilled fuel. */
export const PLASMA_FIRE_SECONDS = 4;
/** Scorch marks kept at once, apart from the shell craters. The oldest fades first. */
export const MAX_SCORCH_MARKS = 240;

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

/** Supply points a truck leaves the Armory with, or a supply boat the Marine Base. Shells cost more than bullets. */
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
/**
 * Experimental: repeated heavy blasts on one tile sink the ground there.
 * Set false to turn it off; the map then keeps its authored heights all match.
 */
export const BLAST_DIG_ENABLED = true;
/** Smallest caliber whose ground strike counts toward digging. Mortars and tank guns below this only scar. */
export const BLAST_DIG_CALIBER = 105;
/**
 * Caliber points one tile soaks up before it drops one elevation step.
 * About three 105mm strikes, two 150mm, or one Battle Ship shell.
 */
export const BLAST_DIG_PER_LEVEL = 300;
/** Lowest elevation a blast can dig to. 0 is the valley floor. */
export const BLAST_DIG_FLOOR = 0;
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

/**
 * He 111 H-6 torpedo bomber. No guns and no bomb: one torpedo under the belly,
 * the submarine's own (TORPEDO, TORPEDO_SPEED, TORPEDO_HP). It comes down low
 * on the way in, and lets go only with water under it and the target inside
 * TORPEDO_RANGE_TILES, the submarine's own reach, on the nose. The torpedo
 * always runs its full length, even on a force attack.
 */
export const HE111_TORPEDOES = 1;
/** Height of the torpedo run: down on the water. */
export const HE111_DROP_ALT = 4;
/** The run in starts this far out: it goes low here, well before the release. */
export const HE111_RUN_IN_TILES = t(20);
/** Half-angle off the nose the target must be inside for the release. */
export const HE111_DROP_ARC_DEG = 8;
/** Per second: the share of that throw still left. */
export const PARA_DRAG = 0.35;

/**
 * Horten H.VII flying wing, flown for reconnaissance. No guns, no bomb, no bay:
 * it flies over and looks. Two pusher engines and no tail drag: it cruises far
 * above every other plane, out of reach of everything but anti-air guns, and
 * it is the fastest thing in the air. It carries a
 * little more fuel than the others and sees farther than any of them. Sent
 * at a unit or a point, it overflies it and circles there.
 */
/** Cruise height. Above AIR_HIGH_ALT. */
export const HORTEN_CRUISE_ALT = 40;
/**
 * A plane at or above this height is out of reach for everything but anti-air
 * guns (the MG42, the gatlings, the CIWS, the Flak) and a fighter that climbs
 * after it, as a high drone is. The others cruise at AIR_CRUISE_ALT, well under it.
 */
export const AIR_HIGH_ALT = 32;
/** Seconds of flight in its tank, over AIR_FUEL_SECONDS for the others. */
export const HORTEN_FUEL_SECONDS = 130;
/** Sight it gains in the air, in place of AIRCRAFT_FLYING_SIGHT_BONUS. */
export const HORTEN_FLYING_SIGHT_BONUS = t(18);
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
export const BUNKER_GARRISON_HP_MUL = 5;
/** Share of each hit on the bunker that reaches the men inside. */
export const BUNKER_WOUND_MUL = 0.35;
/**
 * Share of a bullet hit that reaches the men behind a firing slit, on top
 * of the wound share. A rifle, MG, or gatling round has to find a slit; a
 * shell or a burst does not. One third: small arms need three times the
 * rounds to shoot a Bunker or Watch Tower crew out that the wall share
 * alone would ask.
 */
export const SLIT_BULLET_WOUND_MUL = 1 / 3;
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
/** Occupant HP multiplier inside. A house is 3×, a bunker 5×. */
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
/** Move-speed share while the Juggernaut wades, thigh-deep. */
export const JUGGERNAUT_WADE_SPEED = 0.7;
/**
 * Mine launcher on the rear deck. Each pack is one canister lobbed onto the
 * ground, where it bursts into the same field a BV 222 drops (CLUSTER_MINES).
 * Only a supply truck or a crate puts packs back.
 */
export const MAMMOTH_MINE_PACKS = 3;
/** Farthest point the launcher reaches, from the hull centre. */
export const MAMMOTH_MINE_RANGE_TILES = t(12);
/** Seconds between two packs, while the next is fed into the launcher. */
export const MAMMOTH_MINE_RELOAD_SECONDS = 4;
/** Canister flight from the deck to the ground, seconds and peak height. */
export const MAMMOTH_MINE_FLIGHT_SECONDS = 1.6;
export const MAMMOTH_MINE_APEX = 48;
/** Supply points a truck or crate spends on one pack. A shell is SUPPLY_SHELL_COST. */
export const MAMMOTH_MINE_SUPPLY_COST = 10;
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
 * Tobruk pit. A concrete ring-stand sunk almost flush with the ground: two men
 * stand in the open hatch. Cheap and quick to pour, hard to hit, but the hole
 * is open to the sky, so a mortar bomb that drops in finds them. The mortarman
 * fits, and works his tube from it.
 */
export const TOBRUK_GARRISON_CAP = 2;
export const TOBRUK_GARRISON_HP_MUL = 3;
/** A trench passes 0.6, a bunker 0.35. */
export const TOBRUK_WOUND_MUL = 0.45;
/** Barely proud of the ground: lower than a trench parapet's top. */
export const TOBRUK_COVER_HEIGHT = 1.5;

/**
 * Heavy casemate (Regelbau). Atlantic-wall concrete two metres thick with a steel
 * observation cupola on the roof: the strongest place on the field to hold, and
 * the cupola lets the men inside see a little farther. Slow and dear to pour.
 */
export const CASEMATE_GARRISON_CAP = 8;
/** Bunker 5×. */
export const CASEMATE_GARRISON_HP_MUL = 6;
/** Bunker 0.35. */
export const CASEMATE_WOUND_MUL = 0.22;
export const CASEMATE_SIGHT_BONUS = t(3);
export const CASEMATE_COVER_HEIGHT = 5;
export const CASEMATE_MEDIC_REGEN_FRAC = 0.006;
export const CASEMATE_ENGINEER_REPAIR_PER_SEC = 3;

/**
 * Timber lookout (Holzturm). Four splayed logs and a plank platform high over the
 * treetops: the farthest eyes a garrison can have, and the rifles carry a bit
 * farther from up there. Planks stop very little, and it burns down fast.
 */
export const HOCHSTAND_GARRISON_CAP = 2;
export const HOCHSTAND_GARRISON_HP_MUL = 2;
export const HOCHSTAND_WOUND_MUL = 0.85;
/** The concrete tower is t(8). */
export const HOCHSTAND_SIGHT_BONUS = t(11);
export const HOCHSTAND_REACH_BONUS = t(3);
export const HOCHSTAND_FLOORS = 4;
export const HOCHSTAND_EYE_HEIGHT = HOCHSTAND_FLOORS * STORY_COVER_HEIGHT * 0.6;

/**
 * Fire-control tower (Leitturm). A flak-tower block of concrete, four floors of
 * slits and a rangefinder on the roof. Six men, walls almost as good as a bunker's,
 * and from the galleries their weapons reach well past the ground. It carries the
 * watch tower's spotlight.
 */
export const LEITTURM_GARRISON_CAP = 6;
export const LEITTURM_GARRISON_HP_MUL = 4;
export const LEITTURM_WOUND_MUL = 0.4;
export const LEITTURM_SIGHT_BONUS = t(9);
export const LEITTURM_REACH_BONUS = t(4);
export const LEITTURM_FLOORS = 4;
export const LEITTURM_EYE_HEIGHT = LEITTURM_FLOORS * STORY_COVER_HEIGHT * 0.6;

/** Riflemen put at a crewed gun when it is raised. Anyone a bunker takes may replace them. */
export const GUN_CREW_TYPE: EntityType = "rifleman";

/**
 * MG nest. An MG42 on its tripod behind a ring of sandbags. The tripod lays it
 * tighter and farther than the Gunner's bipod, and the belts are long. One man.
 */
export const MGNEST_RANGE_TILES = t(13);
/** Rounds in the boxes beside the gun. They do not refill by themselves: a supply truck brings more. */
export const MGNEST_BELT = 1000;
export const MGNEST_ARC_DEG = 60;
export const MGNEST_WOUND_MUL = 0.5;
/**
 * Pak 36. Light 37mm anti-tank gun behind a low shield. Holes a Tiger's side or rear, not
 * its front. It traverses only a little either side of the way it was set. One man.
 */
export const PAK36_RANGE_TILES = t(12);
export const PAK36_ARC_DEG = 30;
export const PAK36_WOUND_MUL = 0.45;
/** Shells stacked by the gun. A supply truck refills them, as it does a tank's rack. */
export const PAK36_RACK = 30;
/**
 * Pak 43. The 88mm on its cruciform platform: the longest straight reach on the field, through
 * any front plate, all the way round, but it swings slowly. Two men; one alone loads at half pace.
 */
export const PAK43_RANGE_TILES = t(18);
export const PAK43_WOUND_MUL = 0.4;
export const PAK43_RACK = 16;
/**
 * Flak 37. A 37mm anti-aircraft gun that lays only on what is in the air. Its time-fused shells
 * burst at the target's height and leave a black cloud: anything flying inside the burst is hurt,
 * so one shell can catch two planes in formation. Laid moderately well: it leads a plane on its
 * heading, but the fuse and the aim scatter. Two men.
 */
export const FLAK_RANGE_TILES = t(14);
export const FLAK_WOUND_MUL = 0.5;
/** Flak shells in the ready racks. A supply truck refills them. */
export const FLAK_RACK = 64;
/**
 * World px from the burst at which a flying body still takes something: about four tiles, as wide
 * as the black cloud is drawn, so a plane seen inside the smoke is hurt and one shell catches a
 * whole formation. Full damage inside a third of it.
 */
export const FLAK_BURST_RADIUS = 128;
/**
 * Elevation units above or below the burst that still count: wide enough that a plane diving to
 * its release or strafing height while the shell climbs is still caught. Planes cruise at AIR_CRUISE_ALT.
 */
export const FLAK_BURST_DEPTH = 24;
/** Damage at the heart of a burst. Doubled from 10: the first lay left a plane in the cloud barely scratched. */
export const FLAK_BURST_DAMAGE = 20;
/**
 * Scatter of the burst off the predicted point, world px, at point blank and at full reach.
 * Thirty percent wider than the first lay (12 and 34).
 */
export const FLAK_SCATTER_NEAR = 15.6;
export const FLAK_SCATTER_FAR = 44.2;
/** Fuse scatter in height, elevation units. Thirty percent wider than the first lay (4). */
export const FLAK_FUSE_SCATTER_Z = 5.2;
/** Shell speed, world px a second: slow enough that the gun must lead a plane. */
export const FLAK_SHELL_SPEED = 900;

/**
 * Large wall. A tall concrete wall section with firing slits down both faces,
 * laid like the ordinary wall and joined to its neighbours. Infantry garrison
 * a section and fire from the slits; nothing walks through it. Concrete
 * between the bunker and the tower: thinner than a pillbox slab, thicker than
 * a cab wall.
 */
export const LARGE_WALL_GARRISON_CAP = 2;
/** Occupant HP multiplier inside. A tower is 3×, a bunker 5×. */
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
 * Gate. Built from the Defences tab onto two of your own Wall sections side by side;
 * when the yard finishes it the two sections become one wide gate: two concrete posts
 * and a lifting boom, like a car-park barrier, with a small lamp on each post. It lifts
 * for its owner's side and their allies and stays down for everyone else; locked, it
 * lets nobody through and shows a padlock.
 */
export const GATE_COST = 40;
/** Seconds for the boom to lift fully, or to drop. */
export const GATE_OPEN_SECONDS = 0.8;
/** Gameplay tiles from the gate at which a friendly ground unit lifts the boom. */
export const GATE_SENSE_TILES = t(3);

/**
 * Day and night. A match opens at morning and runs day, dusk, night, dawn,
 * then day again. In full dark every sight ring is NIGHT_SIGHT_MUL of its
 * daylight value; dusk and dawn slide between the two. Weapon reach never
 * changes: a gun reaches as far at night as by day.
 */
export const DAY_SECONDS = 240;
export const DUSK_SECONDS = 20;
export const NIGHT_SECONDS = 150;
/** Sight in full dark, as a share of daylight. Spotlights and headlights do not shrink with it. */
export const NIGHT_SIGHT_MUL = 0.35;
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
/**
 * The Titan carries the tower's lamp on its torso. Up on its leg jets the lamp
 * tips down: instead of a beam it lights one round pool of ground ahead of the
 * Titan, this far out along the lamp's heading, this wide.
 */
export const TITAN_LAMP_POOL_AHEAD_TILES = t(7);
export const TITAN_LAMP_POOL_RADIUS_TILES = t(4.5);
/** How fast the cab lamp turns, for Rotate and for a patrol sweep. */
export const SPOTLIGHT_TURN_DEG_PER_SEC = 18;
/**
 * The Titan's lamp, left alone, sweeps a small arc either side of the hull's nose:
 * this many degrees each way, out and back once every TITAN_LAMP_SWEEP_PERIOD_SECONDS.
 * Rotate light holds it on one heading until the Titan next moves; on the march
 * or up on its jets it only sweeps.
 */
export const TITAN_LAMP_SWEEP_DEG = 18;
export const TITAN_LAMP_SWEEP_PERIOD_SECONDS = 8;
/**
 * Spotlight post. The cab lamp on a steel pole over a sandbagged foot, worked by one
 * man who comes with it. Its beam reaches as far as the tower's, cast from the pole top.
 * Shoot the lamp and it goes dark with the man unhurt; kill the man and the lamp goes
 * dark until another soldier takes his place. Fell the pole and both are gone.
 */
export const SPOTLIGHT_POST_COST = 150;
/** Elevation units from the ground to the lamp: lower than the tower cab, over the treetops. */
export const SPOTLIGHT_POLE_HEIGHT = 9;
/** Occupant HP multiplier at the post. A tower is 3×. */
export const SPOTLIGHT_POST_HP_MUL = 1.5;
/** Share of each hit on the post that reaches the man at it: a few sandbags at its foot. */
export const SPOTLIGHT_POST_WOUND_MUL = 0.75;
/**
 * Armored ground hulls run a headlight in the dark. Down the
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
  spreadDeg: 3.3,
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
/** Chance one burst connects on one rocket: about eight in ten. Each CIWS tries an ordinary rocket once. A heavy round keeps drawing bursts until it comes apart. */
export const CIWS_INTERCEPT_CHANCE = 0.82;
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
/** CIWS pad. 30 rounds a second. 1.2x the heat per round: a little under two seconds on the trigger, then four to cool. */
export const CIWS_HEAT: GatlingHeat = { perRound: 1.2 / 54.6, coolPerSec: 0.12, overheatSeconds: 4 };
/** Walker. Both arms heat one set of barrels: one arm (20 a second) lasts under three seconds, both about one. */
export const WALKER_HEAT: GatlingHeat = { perRound: 1 / 42.2, coolPerSec: 0.1, overheatSeconds: 4 };
/** Cyborg arm. A single gun on a man's shoulder, 20 a second: under two seconds on the trigger. */
export const CYBORG_HEAT: GatlingHeat = { perRound: 1 / 28.8, coolPerSec: 0.1, overheatSeconds: 4.5 };
/** Apocalypse roof mount. 20 a second. Half again the heat per round: a little over a second on the trigger. */
export const APOCALYPSE_CIWS_HEAT: GatlingHeat = { perRound: 1.5 / 32.4, coolPerSec: 0.12, overheatSeconds: 4 };
/**
 * One Feuerwirbel mount. 20 a second on a tank's water jacket: a little under three
 * seconds on the trigger, then three to cool. Each mount heats on its own.
 */
export const FEUERWIRBEL_MOUNT_HEAT: GatlingHeat = { perRound: 1 / 40, coolPerSec: 0.14, overheatSeconds: 3 };

/**
 * The gatling's heat, or null for a unit without one. The Apocalypse's is its roof mount.
 * The Feuerwirbel's two mounts keep their own (FEUERWIRBEL_MOUNT_HEAT), not the hull's.
 */
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
 * roof then lay CIWS_LAY times tighter than these numbers. The Walker and the
 * Cyborg are laid 30% tighter than they first were.
 */
export const GATLING_SPRAY: Partial<Record<EntityType, number>> = {
  ciws: 1,
  walker: 1.6 / 1.3,
  cyborg: 1.8 / 1.3,
  /** A turret cradle holds the pair steadier than the Walker's arms. */
  feuerwirbel: 1.4 / 1.3,
  apocalypse: 1.5,
  battleship: 1.5,
};

/** The pad and the Apocalypse roof lay this many times tighter than GATLING_SPRAY. Half again as accurate. */
export const CIWS_LAY = 1.5;

export function gatlingSprayOf(type: EntityType): number {
  const spray = GATLING_SPRAY[type] ?? 1;
  return type === "ciws" || type === "apocalypse" || type === "battleship" ? spray / CIWS_LAY : spray;
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
 * first thing it shoots, and sometimes bursts it. With the sky clear it takes a plane, then infantry, and sometimes a Walker or a truck.
 */
export const APOCALYPSE_CIWS_RANGE_TILES = t(7);
/** Rounds each tick. Two a tick is 1,200 a minute. */
export const APOCALYPSE_CIWS_SHOTS_PER_TICK = 2;
/** Belt. About thirty seconds on the trigger. */
export const APOCALYPSE_CIWS_BELT = 600;
/** The small house swings much faster than the turret under it. */
export const APOCALYPSE_CIWS_TURN_DEG_PER_SEC = 360;
/**
 * Chance the roof mount bursts one missile. Most still get through.
 */
export const APOCALYPSE_CIWS_INTERCEPT_CHANCE = 0.27;
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
  missCoastTiles: t(8),
};
/** Chance one interceptor connects on one rocket: nine in ten. Each RAM tries an ordinary rocket once. A heavy round draws another interceptor until it comes apart. */
export const RAM_INTERCEPT_CHANCE = 0.9;
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

/**
 * The Xenomorph Deployment (type id `seed`): a landing grid, not a body. It
 * creeps only inside DEPLOYMENT_LEASH_TILES of where the match set it down.
 * Deployed, the Hive Core falls out of the sky onto it over
 * HIVE_DROP_SECONDS and is whole the moment it lands. A Hive Core never packs.
 */
export const DEPLOYMENT_LEASH_TILES = DRONE_LEASH_TILES;
export const HIVE_DROP_SECONDS = 1.8;
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

/** One type's jet flight: how long, how high, how fast, and how the pack refills. */
export interface JetFlightDef {
  fuelSeconds: number;
  takeoffMinSeconds: number;
  landReserve: number;
  refuelDelay: number;
  refuelPerSec: number;
  alt: number;
  climbPerSec: number;
  flyTilesPerSec: number;
  /** Shot down in the air, it falls straight to the ground before it dies (the Titan). */
  crashes?: boolean;
}

export const JUMPJET_FLIGHT: JetFlightDef = {
  fuelSeconds: JET_FUEL_SECONDS,
  takeoffMinSeconds: JET_TAKEOFF_MIN_SECONDS,
  landReserve: JET_LAND_RESERVE,
  refuelDelay: JET_REFUEL_DELAY,
  refuelPerSec: JET_REFUEL_PER_SEC,
  alt: JET_ALT,
  climbPerSec: JET_CLIMB_PER_SEC,
  flyTilesPerSec: JET_FLY_TILES_PER_SEC,
};

/**
 * Titan's leg jets. A short hop, not a flight: a dozen-odd seconds over a river, a
 * wall, or a line of men, then a long wait for the burners to cool. Aloft the
 * main gun is stowed and only the shoulder pods fire, and only anti-air
 * weapons reach it. Shot down, it drops straight down and goes up on the ground.
 */
/** 12 s, then a fifth more: 14.4 s on the burners. */
export const TITAN_JET_FUEL_SECONDS = 14.4;
export const TITAN_JET_FLIGHT: JetFlightDef = {
  fuelSeconds: TITAN_JET_FUEL_SECONDS,
  takeoffMinSeconds: 3,
  landReserve: 1,
  refuelDelay: 8,
  /** An empty burner is ready again 30 s after the delay. */
  refuelPerSec: TITAN_JET_FUEL_SECONDS / 30,
  alt: 10,
  climbPerSec: 7,
  flyTilesPerSec: paced(2.6),
  crashes: true,
};
/** Elevation units per second² a dead Titan falls with, from rest. */
export const TITAN_FALL_ACCEL = 20;

/**
 * Titan's reactor. Whenever a Titan is destroyed, on the ground or after it
 * falls out of the air, it goes up in a small nuclear blast: everything in the
 * inner ring is gone, and the damage falls off to the edge. Friend and foe alike.
 * Armor does not help: hulls lose a share of their max HP.
 */
export const TITAN_NUKE = {
  /** Outer edge of the blast. */
  radiusTiles: t(4.5),
  /** Inside this, everything takes the full blow. */
  coreTiles: t(1.5),
  /** Soldiers, the drone, soft targets: HP at full. */
  damage: 400,
  /** Hulls and walkers: share of max HP at full. */
  armorShare: 1.1,
  /** Structures: HP at full. */
  buildingDamage: 1800,
  /** Share of the full blow left at the outer edge. */
  edgeShare: 0.12,
  /** Fires the blast leaves burning around ground zero. */
  fires: 10,
} as const;

/**
 * Transport LST deck mount: a heavy machine gun in a shielded tub. Nobody carries it.
 * The first two soldiers aboard who can shoot man the two tubs and fire this instead
 * of their own weapon, from where the tub stands on the hull.
 */
export const DECK_MG: InfantryGun = {
  id: "deckmg",
  name: "Deck MG",
  blurb: "Heavy machine gun in a shielded tub on the LST's deck. Long belts, reaches past a rifle, chews through light plate, and tracks aircraft.",
  damage: 11,
  penetration: 14,
  caliber: 12,
  spreadDeg: 3.5,
  cooldown: 0.1,
  clip: 100,
  reload: 5,
  rangeTiles: t(10),
  bulky: true,
  antiAir: true,
};

/**
 * The Weaver's mend (sim/weaver.ts). Every WEAVER_PULSE_SECONDS each hive unit of its side within
 * WEAVER_REACH_TILES gets HP back: a cyborg WEAVER_MEND_CYBORG, a heavy assimilator or any other
 * Xenomorph body WEAVER_MEND_HEAVY. Weavers do not stack: a unit in reach of two mends once. A Weaver
 * does not mend itself, and nothing mends while the Weaver is shut down or powered down.
 */
export const WEAVER_REACH_TILES = t(3.5);
export const WEAVER_PULSE_SECONDS = 1;
/**
 * The Weaver's shields (sim/weaver.ts). A friend of its side under fire within WEAVER_SHIELD_REACH_TILES,
 * the Weaver too, gets a WEAVER_SHIELD across the side the fire comes from. Each wall draws one of the
 * WEAVER_CELL.shots in the Weaver's energy cell (a quarter of it), and a Weaver throws at most one
 * every WEAVER_SHIELD_GAP_SECONDS.
 */
export const WEAVER_SHIELD_REACH_TILES = t(7);
export const WEAVER_SHIELD_GAP_SECONDS = 0.5;
export const WEAVER_CELL: PlasmaCellDef = { shots: 4, rechargeSeconds: 5 };
export const WEAVER_MEND_CYBORG = 5;
export const WEAVER_MEND_HEAVY = 4;

/**
 * The Shade's skin (sim/shade.ts). While cloaked no enemy sees it or can pick it. Firing, or any
 * hit that takes HP, shows it for SHADE_REVEAL_SECONDS; an enemy unit within SHADE_SPOT_TILES
 * always sees it. It walks cloaked.
 */
export const SHADE_REVEAL_SECONDS = 3;
export const SHADE_SPOT_TILES = t(2);

/**
 * The Broodmother's brood (sim/brood.ts). A Thrall leaves the sac every BROOD_SECONDS while
 * fewer than BROOD_MAX of hers live; the first BROOD_FIRST_SECONDS after she is born. Brood
 * count against the unit cap and run on the uplink like any Thrall.
 */
export const BROOD_MAX = 3;
export const BROOD_SECONDS = 30;
export const BROOD_FIRST_SECONDS = 12;

/**
 * Mawcaster: the hive's answer to the Nebelwerfer. Six spore pods per salvo on a high arc, half
 * the Nebelwerfer's frame, from a little less reach, but it draws on the hive and never runs dry.
 * Each pod that bursts on open ground has MAWCASTER_BILE_CHANCE to leave burning bile there.
 */
export const MAWCASTER_RANGE_TILES = t(21);
export const MAWCASTER_MIN_RANGE_TILES = t(5);
export const MAWCASTER_SALVO = 6;
export const MAWCASTER_BILE_CHANCE = 0.25;
export const MAWCASTER_POD: RocketRackDef = {
  salvo: MAWCASTER_SALVO,
  interval: 0.15,
  intervalJitter: 0.2,
  volleyMax: 2,
  reload: 14,
  scatterNearTiles: t(0.5),
  scatterFarTiles: t(3),
  splashTiles: t(1.4),
  speed: t(13) * TILE_SIZE,
  podLift: 5,
  damage: 30,
  armorDamage: 6,
  airMul: 0,
  penetration: 20,
  caliber: 150,
  antiAir: false,
  apexNear: 26,
  apexFar: 52,
  minRangeTiles: MAWCASTER_MIN_RANGE_TILES,
  laid: true,
};

/**
 * The Mawcaster's Air attacks: the maw spits small plasma balls straight up at what flies,
 * quick and many, from less reach. It lays on planes, Jump Jets aloft, and low drones only;
 * ground targets are left alone. A ball is fused at the flier's height and bursts beside it.
 */
export const MAWCASTER_AIR_RANGE_TILES = t(13);
export const MAWCASTER_AIR_SALVO = 4;
export const MAWCASTER_AIR_BALL: RocketRackDef = {
  salvo: MAWCASTER_AIR_SALVO,
  interval: 0.2,
  reload: 2.5,
  scatterNearTiles: t(0.15),
  scatterFarTiles: t(0.6),
  splashTiles: t(0.9),
  speed: t(22) * TILE_SIZE,
  podLift: 5,
  damage: 14,
  armorDamage: 0,
  airMul: 2.2,
  penetration: 8,
  caliber: 20,
  antiAir: true,
  laid: true,
  rangeTiles: MAWCASTER_AIR_RANGE_TILES,
  airOnly: true,
  // Thrown up at the flier, the balls need the maw only roughly on it: a plane outruns a narrow lay.
  arcDeg: 30,
};
/** The Mawcaster's energy cell: every ball, either rack, draws one shot. */
export const MAWCASTER_CELL: PlasmaCellDef = { shots: 24, rechargeSeconds: 2 };

/**
 * Spitter: the Mawcaster on two legs. The throat sac lobs one plasma ball at a time on a high
 * arc over its own line, from long reach, and must stand and face the target to spit. It will
 * not spit inside SPITTER_MIN_RANGE_TILES. One ball, then the sac refills.
 */
export const SPITTER_RANGE_TILES = t(15);
export const SPITTER_MIN_RANGE_TILES = t(3);
export const SPITTER_BALL: RocketRackDef = {
  salvo: 1,
  interval: 0,
  reload: 4,
  scatterNearTiles: t(0.4),
  scatterFarTiles: t(2),
  splashTiles: t(1.1),
  speed: t(11) * TILE_SIZE,
  podLift: 3,
  damage: 30,
  armorDamage: 6,
  airMul: 0,
  penetration: 20,
  caliber: 60,
  antiAir: false,
  apexNear: 20,
  apexFar: 40,
  minRangeTiles: SPITTER_MIN_RANGE_TILES,
  laid: true,
};

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
  laser: LASER,
  daggers: DAGGERS,
  fists: FISTS,
  deckmg: DECK_MG,
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
    blurb: "High explosive. Heavy damage to infantry and buildings, and the ground around the burst keeps burning. Poor penetration; bursts on armor.",
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
    blurb: "Not carried. Screen a Tiger with an Apocalypse.",
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
    blurb: "Sprgr. 34. Infantry, guns, trucks, buildings; the ground around the burst keeps burning. This is still an assault gun — keep HE on the rack.",
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
    blurb: "Not carried. Screen a StuG with an Apocalypse.",
    damage: 0,
    penetration: 0,
    caliber: 75,
    spreadDeg: 6,
  },
};

/** Pak 36 rack. The 37mm Pzgr. 39 is all it carries. */
export const PAK36_SHELLS: Record<ShellType, ShellDef> = {
  ap: {
    id: "ap",
    name: "AP",
    blurb: "3.7cm Pzgr. 39. Holes light hulls anywhere and a Tiger's side or rear. Glances off any heavy front.",
    damage: 40,
    penetration: 48,
    caliber: 37,
    spreadDeg: 1.8,
  },
  he: { id: "he", name: "HE", blurb: "Not carried.", damage: 30, penetration: 6, caliber: 37, spreadDeg: 3 },
  heat: { id: "heat", name: "HEAT", blurb: "Not carried.", damage: 30, penetration: 40, caliber: 37, spreadDeg: 3 },
  smoke: { id: "smoke", name: "Smoke", blurb: "Not carried.", damage: 0, penetration: 0, caliber: 37, spreadDeg: 6 },
};

/** Pak 43 rack. The 88mm Pzgr. 39/43 goes through every front plate on the field. */
export const PAK43_SHELLS: Record<ShellType, ShellDef> = {
  ap: {
    id: "ap",
    name: "AP",
    blurb: "8.8cm Pzgr. 39/43. Goes through any front plate on the field and usually kills what it hits.",
    damage: 85,
    penetration: 190,
    caliber: 88,
    spreadDeg: 1.6,
  },
  he: { id: "he", name: "HE", blurb: "Not carried.", damage: 80, penetration: 14, caliber: 88, spreadDeg: 4 },
  heat: { id: "heat", name: "HEAT", blurb: "Not carried.", damage: 70, penetration: 110, caliber: 88, spreadDeg: 3 },
  smoke: { id: "smoke", name: "Smoke", blurb: "Not carried.", damage: 0, penetration: 0, caliber: 88, spreadDeg: 6 },
};

/** Xenomorph Pulse Spire: an armor-piercing pulse between the Pak 36's and the Pak 43's. Only AP is carried. */
export const PULSE_SPIRE_SHELLS: Record<ShellType, ShellDef> = {
  ap: {
    id: "ap",
    name: "Pulse",
    blurb: "Armor-piercing pulse. Goes through a Tiger's front plate; a Jagdtiger's front holds.",
    damage: 70,
    penetration: 130,
    caliber: 75,
    spreadDeg: 1.8,
  },
  he: { id: "he", name: "HE", blurb: "Not carried.", damage: 60, penetration: 12, caliber: 75, spreadDeg: 4 },
  heat: { id: "heat", name: "HEAT", blurb: "Not carried.", damage: 60, penetration: 100, caliber: 75, spreadDeg: 3 },
  smoke: { id: "smoke", name: "Smoke", blurb: "Not carried.", damage: 0, penetration: 0, caliber: 75, spreadDeg: 6 },
};
/** Charges in a Pulse Spire's ring. A powered Nanite Forge in reach recharges it. */
export const PULSE_SPIRE_RACK = 14;
/** Share of a shell's damage the Behemoth's carapace lets through. */
export const BEHEMOTH_SHELL_RESIST = 0.75;

/** Flak 37 rack: time-fused 37mm that bursts in the air (CatalogEntry.airOnly). */
export const FLAK_SHELLS: Record<ShellType, ShellDef> = {
  ap: { id: "ap", name: "AP", blurb: "Not carried.", damage: 20, penetration: 30, caliber: 37, spreadDeg: 2 },
  he: {
    id: "he",
    name: "Flak",
    blurb: "3.7cm Sprgr. with a time fuse. Bursts at the target's height in a black cloud and hurts everything flying inside it.",
    damage: FLAK_BURST_DAMAGE,
    penetration: 10,
    caliber: 37,
    spreadDeg: 2.4,
  },
  heat: { id: "heat", name: "HEAT", blurb: "Not carried.", damage: 20, penetration: 30, caliber: 37, spreadDeg: 2 },
  smoke: { id: "smoke", name: "Smoke", blurb: "Not carried.", damage: 0, penetration: 0, caliber: 37, spreadDeg: 6 },
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
    blurb: "128mm high explosive. A huge burst among infantry and against buildings, and the ground around it keeps burning. Bursts on armor.",
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
    blurb: "Not carried. Screen a Jagdtiger with an Apocalypse.",
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
    blurb: "High explosive. The second barrel follows a moment later. Clears infantry, knocks buildings down, and leaves the ground burning. Bursts on armor.",
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

/**
 * Behemoth twin disruptors: one plasma load, the Apocalypse's AP punch. High or Light Pulse
 * (BEHEMOTH_PULSE_MODES) sets how hard and how fast it fires, not the rack.
 */
export const BEHEMOTH_SHELLS: Record<ShellType, ShellDef> = {
  ...APOCALYPSE_SHELLS,
  ap: {
    ...APOCALYPSE_SHELLS.ap,
    name: "Plasma",
    blurb: "Plasma bolt. The second barrel follows a moment later. Hits hardest up close.",
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
  leavesRubble: true,
};

/** Attack Boat's 20mm: flat, fast, and far enough to rake the bank from the water. */
export const GUNBOAT_RANGE_TILES = t(10);
/** A torpedo's run. It stops sooner where the water ends. */
export const TORPEDO_RANGE_TILES = t(13);
/**
 * Torpedo speed, world px a second. Slow and in plain sight: a boat under way can slip one,
 * and a gun on the target has a few seconds to shoot it apart.
 */
export const TORPEDO_SPEED = t(3) * TILE_SIZE;
/** The warhead and the run, the same whether a submarine or an He 111 lets it go. */
export const TORPEDO = { damage: 140, penetration: 160, caliber: 533, spreadDeg: 1.5 } as const;
/** A running torpedo's hit points. A few 20mm rounds or one rifle clip finish it. */
export const TORPEDO_HP = 30;
/** After it fires, a submarine stays in sight this long. */
export const SUB_REVEAL_SECONDS = 4;
/** Sight of a submarine running below: the periscope only. Surfaced it has its catalog sight. */
export const SUB_SUBMERGED_SIGHT_TILES = t(3);
/** Extra sight a plane has while it flies, over its catalog sight on the pad. */
export const AIRCRAFT_FLYING_SIGHT_BONUS = t(10);
/** Seconds of air a submarine has for running submerged. */
export const SUB_DIVE_SECONDS = 150;
/** Surfaced, it takes in air this many times faster than it spends it below. */
export const SUB_AIR_RECOVER_MUL = 5;
/** Torpedoes a submarine carries. The tubes do not reload from nowhere. */
export const SUB_TORPEDOES = 8;
/** Beside a friendly Marine Base a submarine loads one torpedo this often, seconds. */
export const SUB_REARM_SECONDS = 6;

/**
 * Lurker. A Xenomorph sea beast, not a boat: it hunts under the water and comes up under what it
 * goes for with its jaws. Each bite lands at once: a soldier, swimming or on the bank, takes
 * LURKER_BITE_SOLDIER_DAMAGE, more than his whole pool; anything else the hull bite, a tank's
 * plate LURKER_HEAVY_MUL of it and a wall LURKER_BUILDING_MUL. It reaches LURKER_REACH_TILES
 * from its body to the target's, so a soldier or a truck at the water's edge is not safe.
 */
export const LURKER_REACH_TILES = t(1.25);
export const LURKER_BITE_SECONDS = 1.1;
export const LURKER_BITE_DAMAGE = 55;
export const LURKER_BITE_SOLDIER_DAMAGE = 80;
export const LURKER_HEAVY_MUL = 0.45;
export const LURKER_BUILDING_MUL = 0.3;
/** The Lurker's sight: it never surfaces, so this is what it sees through the water. */
export const LURKER_SIGHT_TILES = t(8);

/**
 * Overseer. A Xenomorph hover craft: it lifts straight off its Aerie nest, flies slowly at
 * OVERSEER_CRUISE_ALT, and sent at something on the ground stops over it at OVERSEER_HOVER_ALT
 * and burns straight down. Within OVERSEER_FIRE_TILES of overhead it fires a laser pulse every
 * OVERSEER_PULSE_SECONDS: OVERSEER_PULSE_DAMAGE to every enemy soldier in a spot of
 * OVERSEER_BEAM_TILES, a hull's roof OVERSEER_HULL_MUL of it, a building OVERSEER_BUILDING_MUL.
 */
export const OVERSEER_CRUISE_ALT = 14;
export const OVERSEER_HOVER_ALT = 9;
export const OVERSEER_FIRE_TILES = t(0.75);
export const OVERSEER_PULSE_SECONDS = 0.3;
export const OVERSEER_PULSE_DAMAGE = 12;
export const OVERSEER_BEAM_TILES = t(0.35);
export const OVERSEER_HULL_MUL = 0.6;
export const OVERSEER_BUILDING_MUL = 0.4;
/** Climb and descent rate on and off its nest, elevation units a second. */
export const OVERSEER_LIFT_PER_SEC = 5;
/**
 * The hovering Xenomorph fliers (staysAloft) on station. A Wasp hangs HIVE_WASP_STANDOFF_TILES
 * off its target, still in the air, and looses a burst of energy bolts whenever its cell has a
 * burst in it (see WASP_BURST_BOLTS); a Scourge hangs HIVE_SCOURGE_STANDOFF_TILES off and lobs a
 * bomb every HIVE_BOMB_SECONDS, its pulse guns firing a burst of one tick every
 * HIVE_GUN_BURST_SECONDS at soft targets. They lift and sink at OVERSEER_LIFT_PER_SEC.
 */
export const HIVE_WASP_STANDOFF_TILES = t(7);
export const HIVE_SCOURGE_STANDOFF_TILES = t(2);
export const HIVE_BOMB_SECONDS = 5;
export const HIVE_GUN_BURST_SECONDS = 0.5;
/**
 * Wasp energy burst: WASP_BURST_BOLTS laser bolts at once from both wing emitters, each coming down
 * on its own random spot within WASP_BURST_SCATTER_TILES of the point laid on. Long reach, poor
 * aim: a burst blankets the spot rather than threading one hull. It fires within WASP_BURST_TILES
 * and WASP_BURST_ARC_DEG of the nose, no sooner than WASP_BURST_COOLDOWN after the last, and each
 * burst draws one charge from its cell (catalog plasmaCell).
 */
export const WASP_BURST_TILES = t(9);
export const WASP_BURST_BOLTS = 14;
export const WASP_BURST_SCATTER_TILES = t(1.6);
export const WASP_BURST_ARC_DEG = 15;
export const WASP_BURST_COOLDOWN = 1.2;
export const WASP_BOLT = { damage: 26, penetration: 35, caliber: 20 } as const;
/** A Scourge's bomb draws this much from its energy cell; a gun burst draws one. */
export const HIVE_BOMB_ENERGY = 4;
/** Seconds of flight in a full tank: it hangs in the air longer than a plane flies. */
export const OVERSEER_FUEL_SECONDS = 140;

/**
 * Destroyer. A twin 40mm on the foredeck that fires fast and not far, a hull
 * sonar that hears every enemy submarine in a wide ring round the ship, down
 * or up, an ASW helicopter on the fantail, and a rail of water mines on the stern.
 */
export const DESTROYER_RANGE_TILES = t(7);
/** The sonar hears a submarine, submerged or surfaced, this far from the hull. */
export const SONAR_RANGE_TILES = t(16);
/** Torpedoes the helicopter carries on one sortie. All go at once. */
export const ASW_TORPEDOES = 3;
/** Fan between two of the helicopter's torpedoes, degrees. */
export const ASW_TORPEDO_FAN_DEG = 7;
/** It lets go once the heard position is this close and there is water under it. */
export const ASW_DROP_TILES = t(4);
/** It flies at least this far out from its own ship before the drop, unless it is already over the plot. */
export const ASW_STANDOFF_TILES = t(2);
/** Height the helicopter cruises at, elevation units. Low: rifles and machine guns reach it. */
export const ASW_CRUISE_ALT = 14;
/** Height of the drop. */
export const ASW_DROP_ALT = 5;
/** Climb and sink, elevation units a second. */
export const ASW_CLIMB_PER_SEC = 8;
/** Landed back on its ship, it takes this long to load three torpedoes and refuel, seconds. */
export const ASW_REARM_SECONDS = 25;
/** Lost, the ship gets a new helicopter after this long, seconds. */
export const ASW_REPLACE_SECONDS = 90;
/** Lands on the deck once this close to its ship. */
export const ASW_RECOVER_TILES = t(0.8);
/** Water mines on the stern rail. */
export const WATER_MINES = 3;
/** Seconds between two mines going over the stern. */
export const WATER_MINE_GAP_SECONDS = 3;
/** Beside a friendly Marine Base the rail takes on one mine this often, seconds. */
export const WATER_MINE_REARM_SECONDS = 10;
/** Seconds from going over the side until a water mine is live. Time for the ship to steam clear. */
export const WATER_MINE_ARM_SECONDS = 4;
/** A moored contact mine lies until something meets it, seconds. Far longer than a bomblet. */
export const WATER_MINE_LIFE_SECONDS = 900;
/** A hull, a swimmer, or a submarine down within this of a live water mine touches a horn. */
export const WATER_MINE_TRIGGER_TILES = t(0.5);
export const WATER_MINE_SPLASH_TILES = t(1.2);

/**
 * Transport LST, after the Royal Canadian Navy's tank landing ships. A slab-sided,
 * heavily plated hull with a tank deck: it carries infantry and vehicles over the
 * water by load, not by head count, and puts them ashore over a bow ramp.
 */
export const LST_BAY_SLOTS = 40;
/**
 * Stem to amidships of the hull as drawn, world units. The sprite is far longer than the
 * collision radius (like every ship's): the bow ramp, the MG tubs, and where the bow runs
 * up the beach all go by this.
 */
export const LST_HALF_LENGTH = 58;
/** The ramp reaches land this far past the bow. Boarding and unloading happen here. */
export const LST_RAMP_TILES = t(1.6);
/** Deck MG tubs, as a share of the half-length forward of amidships: the bow tub, then the bridge wing. */
export const LST_MG_AT: readonly number[] = [0.72, -0.45];
/** Share of each hit on the hull that also finds a manned tub. The tub shield stops most of it (BUNKER_WOUND_MUL). */
export const LST_TUB_EXPOSURE = 0.3;
/**
 * Room each body takes on the tank deck, out of LST_BAY_SLOTS. Bigger hulls take more.
 * Types not named here: infantry 1, a vehicle by its footprint (bayLoadOf).
 */
export const LST_BAY_LOAD: Partial<Record<EntityType, number>> = {
  cyborg: 2,
  cyborgcommander: 2,
  simunit2: 1,
  walker: 3,
  artillery: 4,
  supply: 4,
  hauler: 5,
  ss3: 6,
  feuerwirbel: 6,
  nebelwerfer: 6,
  warden: 8,
  jagdtiger: 10,
  titan: 10,
  apocalypse: 12,
  mammoth: 16,
};
/** Hit points the blast takes from a hull right on top of it. Enough to sink a boat or a submarine; a big ship takes it. */
export const WATER_MINE_DAMAGE = 160;
export const WATER_MINE_CALIBER = 300;

/**
 * Battle Ship. Two triple 16-inch turrets on the foredeck, each barrel loaded
 * and fired on its own. A turret that bears lets its loaded barrels go one at a
 * time in a random order, a short random gap apart, and each barrel then
 * reloads on its own clock. The shell is the field gun's, fired flat and much
 * faster: no arc, but the turrets reach as far as Artillery. Each barrel holds its own shells.
 * Two radar-laid 20mm mounts, one on the superstructure and one on the stern,
 * each lay, heat, and spend their own belt like the Apocalypse's roof mount.
 */
export const BATTLESHIP_RANGE_TILES = ARTILLERY_RANGE_TILES;
export const BATTLESHIP_MIN_RANGE_TILES = t(4);
export const BATTLESHIP_SHELL: LobShellDef = {
  damage: 160,
  penetration: 60,
  caliber: 406,
  splashTiles: t(3.2),
  scatterNearTiles: t(0.45),
  scatterFarTiles: t(1.3),
  flightNear: 0.125,
  flightFar: 0.356,
  apexNear: 0,
  apexFar: 0,
  armorChip: 0.2,
  trackChance: 0.35,
};
/** Seconds one barrel takes to load again after it fires. */
export const BATTLESHIP_BARREL_RELOAD = 10;
/** Random gap between two barrels of one turret letting go, seconds. */
export const BATTLESHIP_BARREL_GAP_MIN = 0.15;
export const BATTLESHIP_BARREL_GAP_MAX = 0.55;
/** Shells in each barrel's own magazine. Six barrels. */
export const BATTLESHIP_BARREL_AMMO = 9;
export const BATTLESHIP_BARRELS_PER_TURRET = 3;
export const BATTLESHIP_TURRET_TURN_DEG_PER_SEC = 36;
/** Half-angle astern the forward turrets cannot bear through the superstructure. */
export const BATTLESHIP_TURRET_BLIND_DEG = 35;
/**
 * Where the mounts sit, as a share of the half-length forward of amidships
 * (negative is aft). The art in tools/sprites/render_battleship.py uses the same shares.
 */
export const BATTLESHIP_TURRET_AT: readonly number[] = [0.6, 0.38];
export const BATTLESHIP_CIWS_AT: readonly number[] = [-0.04, -0.8];
/** Half the hull's length in world px, for where shells and rounds leave and how far its hitbox runs. */
export const BATTLESHIP_HALF_LENGTH = 110.4;
/**
 * Half the hull's beam in world px. A round meets the ship anywhere within this of
 * the keel line from stern to bow, not inside a circle round amidships.
 */
export const BATTLESHIP_HALF_BEAM = 14;
export const BATTLESHIP_CIWS_RANGE_TILES = t(7);
export const BATTLESHIP_CIWS_BELT = 500;
export const BATTLESHIP_CIWS_SHOTS_PER_TICK = 2;
export const BATTLESHIP_CIWS_TURN_DEG_PER_SEC = 360;
export const BATTLESHIP_CIWS_INTERCEPT_CHANCE = 0.27;
/** Beside a friendly Marine Base (within this many tiles of it) the ship fills again: */
export const BATTLESHIP_REARM_TILES = t(3);
/** every this many seconds, one shell into each short barrel and this many rounds onto each short belt. */
export const BATTLESHIP_REARM_SECONDS = 4;
export const BATTLESHIP_REARM_ROUNDS = 50;

/**
 * Hive Ark (sim/hive-ark.ts). A round chitin carrier, the Xenomorph answer to the Battle Ship.
 * Two plasma cannons, fore and aft, each lob one huge plasma ball on a high arc, farther than
 * the Battle Ship reaches. Each cannon has its own energy cell: ARK_CANNON_CELL balls full, one
 * regrown every ARK_CANNON_RECHARGE_SECONDS; emptied, that cannon holds fire until its cell is
 * full again. An energy dome over the whole hull (ARK_DOME, the Siphon's dome made big,
 * sim/energy-shield.ts) stops what comes at it from outside; drained, it rises again after its
 * recharge. Two Wasps
 * sit on its landing pods, port and starboard: they lift by themselves when an enemy unit
 * shows inside the Ark's sight, fight it, and come back to their pods once nothing is left.
 * Nobody commands them. A lost Wasp regrows on its pod after ARK_WASP_REGROW_SECONDS.
 */
export const ARK_RANGE_TILES = t(31);
export const ARK_MIN_RANGE_TILES = t(6);
export const ARK_PLASMA_BALL: LobShellDef = {
  damage: 420,
  penetration: 70,
  caliber: 420,
  splashTiles: t(4.2),
  scatterNearTiles: t(0.5),
  scatterFarTiles: t(1.7),
  flightNear: 2.8,
  flightFar: 5.4,
  apexNear: 90,
  apexFar: 160,
  armorChip: 0.3,
  trackChance: 0.4,
};
/** Seconds one cannon takes to charge its next ball after it fires. */
export const ARK_CANNON_RELOAD = 6;
/** Balls in one cannon's full cell, and the seconds it takes to regrow one. */
export const ARK_CANNON_CELL = 4;
export const ARK_CANNON_RECHARGE_SECONDS = 10;
export const ARK_CANNON_TURN_DEG_PER_SEC = 30;
/** Where the cannons and pods sit, as a share of ARK_HULL_RADIUS from the middle. Cannons on the keel line, pods abeam. */
export const ARK_CANNON_AT: readonly number[] = [0.48, -0.48];
export const ARK_POD_AT = 0.56;
/** The hull's radius in world px: its hitbox, and the scale the art and the mounts are laid on. */
export const ARK_HULL_RADIUS = 40;
/** Seconds a lost Wasp takes to regrow on its pod. */
export const ARK_WASP_REGROW_SECONDS = 40;
/** Seconds with no enemy in sight before the Wasps fly home. */
export const ARK_WASP_CALM_SECONDS = 3;
/** The Wasps never chase farther than this past the Ark's sight. */
export const ARK_WASP_LEASH_TILES = t(5);
/** A Wasp this close over its pod sets down and is stowed. */
export const ARK_WASP_DOCK_TILES = t(0.8);

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
  seed: {
    type: "seed",
    kind: "unit",
    name: "Deployment",
    letter: "E",
    cost: 0,
    buildSeconds: 0,
    hp: 800,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 14,
    moveTilesPerSec: paced(0.8),
    turnDegPerSec: 120,
    turnInPlace: true,
    rangeTiles: 0,
    sightTiles: t(6),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    special: "deploy",
    blurb: "The hive's landing grid. Creep it to level ground near the drop zone and deploy: the Hive Core strikes down from orbit like a comet. It never packs again.",
  },
  hivecore: {
    type: "hivecore",
    kind: "building",
    name: "Hive Core",
    letter: "H",
    cost: 0,
    buildSeconds: DEPLOY_SECONDS,
    hp: 2500,
    power: 0,
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
    blurb: "The Xenomorph hive, dropped from orbit onto the Deployment. It raises every Xenomorph structure and never packs up. Lose it and the collective falls.",
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
    name: "Power Plant",
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
    blurb: `Stands on a scrap field: at least half its footprint must cover scrap, and it needs ${SMELTER_CLEARANCE} open tiles between it and any other Smelter. It melts the field down for ${SMELTER_SCRAP_PER_SEC} scrap a second for as long as it stands, and the field never runs out. Each Smelter adds its own share. On diamond scrap, where stones glint through the salvage, it pours ${DIAMOND_SCRAP_MUL}× as much. Low power slows it. The yard places one near the base; an engineer can raise one on any scrap field he can walk to, which also pushes your build range out to it. Each standing Smelter lets you hold up to ${SCRAP_CAP_PER_SMELTER} scrap; past that, the pour and any salvage go to waste.`,
  },
  fusionnode: {
    type: "fusionnode",
    kind: "building",
    name: "Fusion Node",
    letter: "F",
    cost: 0,
    buildSeconds: 12,
    hp: 650,
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
    blurb: `Twin coils around a caged plasma core. Feeds the hive: each Fusion Node adds ${FUSION_NODE_ENERGY} energy to the store your Hive Core starts with. Every Xenomorph unit and defence takes a share while it lives; asked for more than the hive holds, the newest go offline until there is room again. Costs nothing to grow.`,
  },
  assimilator: {
    type: "assimilator",
    kind: "building",
    name: "Assimilator",
    letter: "A",
    cost: 0,
    buildSeconds: 24,
    hp: 1200,
    power: 0,
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
    blurb: `Claws over a glowing intake pit that break a scrap field down to feedstock. Stands on scrap like a Smelter: half its footprint on the field, ${SMELTER_CLEARANCE} open tiles from any other. It pours ${SMELTER_SCRAP_PER_SEC} scrap a second, ${DIAMOND_SCRAP_MUL}× on diamond scrap, slower on low power, and each one lets you hold up to ${SCRAP_CAP_PER_SMELTER} scrap.`,
  },
  muster: {
    type: "muster",
    kind: "building",
    name: "Barracks",
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
    name: "Machine Shop",
    letter: "A",
    cost: 800,
    buildSeconds: 20,
    hp: 1000,
    power: -30,
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
  airfield: {
    type: "airfield",
    kind: "building",
    name: "Airfield",
    letter: "L",
    cost: 3000,
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
  dock: {
    type: "dock",
    kind: "building",
    name: "Marine Base",
    letter: "N",
    cost: 1200,
    buildSeconds: 20,
    hp: 1000,
    power: -30,
    tileW: t(2.5),
    tileH: t(2.5),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    onWater: true,
    blurb: "Floating pier and slipway. It can only be built on water: every tile under it must be open water. The yard places one in its build range; an engineer can raise one on any water he can swim to, which also pushes your build range out to it. Trains the Attack Boat and the Submarine, which launch into the water beside it and never come ashore.",
  },
  research: {
    type: "research",
    kind: "building",
    name: "Research Facility",
    letter: "F",
    cost: 5000,
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
    blurb: "Lab block with an observatory dome and a coil annex. Unlocks the Tiger, Apocalypse, Jagdtiger, Titan, Nebelwerfer, Drone Op, Submarine, and Destroyer, and with a Radar Station the Battle Ship.",
  },
  cyborgcentral: {
    type: "cyborgcentral",
    kind: "building",
    name: "Cyborg Central",
    letter: "Y",
    cost: 2000,
    buildSeconds: 20,
    hp: 900,
    power: -60,
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
    blurb: `Assembly hall and uplink mast that run your cyborgs. Trains the Cyborg and the Cyborg Commander. Your cyborgs live on its uplink: if it falls or your power runs short while no Cyborg Commander of yours lives, ${CYBORG_SHUTDOWN_SECONDS} seconds later every Cyborg of yours on the field shuts down: still yours, but dead still and silent. Get the link back (a new Central, or the power) and they wake up, unless an enemy Cyborg Commander took them first. A living Cyborg Commander keeps yours running without it, and takes over any enemy's shut-down Cyborg near him.`,
  },
  radar: {
    type: "radar",
    kind: "building",
    name: "Radar Station",
    letter: "R",
    cost: 1500,
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
    blurb: "Ops hut and a dish on a lattice mast. Lights the radar panel in the command bar: without a standing Radar Station the panel is dark. The dish sweeps far past anyone's eyes for aircraft. An enemy plane or drone in the air that nobody can see shows as a blinking contact on the panel only; nothing changes on the field until someone sees it. With a Research Facility it unlocks the Battle Ship.",
  },
  ciws: {
    type: "ciws",
    kind: "building",
    name: "CIWS",
    letter: "W",
    cost: 2500,
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
    blurb: `Radar-laid 20mm gatling on a concrete pad. Fires on its own at any enemy unit it can hurt, planes and paratroopers under canopies first, and reaches farther for a plane than for anything on the ground. Its radar picks up anything inside that reach, in fog or in the dark, day or night. Against a plane it lays one stream of rounds, a tracer in every few, that walks on and off the airframe: often enough to bring one down on a pass. A little under two seconds on the trigger overheats the barrels, and it falls silent while they cool. Max range reaches half as far again, but out there the fire scatters wide. It bursts about eight in ten incoming rockets in the air. Leaves tanks and buildings alone. A Walker or a truck sometimes takes a round. The ${CIWS_BELT}-round belt does not refill by itself — bring a supply truck.`,
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
    garrisonBulletMul: SLIT_BULLET_WOUND_MUL,
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
    cost: 1000,
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
    garrisonBulletMul: SLIT_BULLET_WOUND_MUL,
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
    cost: 3000,
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
    blurb: `Radar-laid rocket launcher on a concrete pad. Fires on its own at any enemy unit it can hurt, planes and paratroopers under canopies first, in barrages of ${RAM_SALVO} short, accurate rockets, out to its full reach in fog or in the dark, and sends an interceptor at incoming rockets that bursts nine in ten of them in the air. Shorter reach than a Nebelwerfer, longer than a CIWS. Max range reaches half as far again, but out there the rockets scatter wide. Leaves tanks and buildings alone. The ${RAM_ROCKET_AMMO}-rocket rack does not refill by itself — bring a supply truck.`,
  },
  tobruk: {
    type: "tobruk",
    kind: "building",
    name: "Tobruk Pit",
    letter: "k",
    cost: 300,
    buildSeconds: 8,
    hp: 1400,
    power: 0,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    garrisonCap: TOBRUK_GARRISON_CAP,
    garrisonHpMul: TOBRUK_GARRISON_HP_MUL,
    garrisonWoundMul: TOBRUK_WOUND_MUL,
    garrisonWindows: 1,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonFullArms: true,
    garrisonOpenTop: true,
    garrisonTypes: TRENCH_TYPES,
    capturable: false,
    coverHeight: TOBRUK_COVER_HEIGHT,
    blurb: `Concrete ring-stand sunk almost flush with the ground, for ${TOBRUK_GARRISON_CAP} infantry — the bunker's troops or a mortarman, who works his tube from the open hatch. Cheap, quick, and hard to hit, but open to the sky: a mortar bomb that drops in finds the men. Adds no sight or reach. Enemy infantry cannot capture it.`,
  },
  casemate: {
    type: "casemate",
    kind: "building",
    name: "Heavy Casemate",
    letter: "H",
    cost: 1600,
    buildSeconds: 28,
    hp: 6000,
    power: 0,
    tileW: t(3),
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
    garrisonCap: CASEMATE_GARRISON_CAP,
    garrisonHpMul: CASEMATE_GARRISON_HP_MUL,
    garrisonWoundMul: CASEMATE_WOUND_MUL,
    garrisonWindows: 3,
    garrisonFloors: 1,
    garrisonSightBonus: CASEMATE_SIGHT_BONUS,
    garrisonReachBonus: 0,
    garrisonFullArms: true,
    garrisonTypes: BUNKER_TYPES,
    capturable: false,
    garrisonMedicRegen: CASEMATE_MEDIC_REGEN_FRAC,
    garrisonEngineerRepair: CASEMATE_ENGINEER_REPAIR_PER_SEC,
    coverHeight: CASEMATE_COVER_HEIGHT,
    blurb: `Atlantic-wall casemate for ${CASEMATE_GARRISON_CAP} infantry, the troops a bunker takes. Two metres of concrete: twice the bunker's hit points, and even less of each hit reaches the men. A steel cupola on the roof lets them see a little farther; their weapons reach no farther. A medic inside patches everyone faster than in a bunker, and an engineer patches the concrete faster. Dear and slow to pour. Enemy infantry cannot capture it.`,
  },
  hochstand: {
    type: "hochstand",
    kind: "building",
    name: "Timber Lookout",
    letter: "j",
    cost: 450,
    buildSeconds: 7,
    hp: 650,
    power: 0,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    garrisonCap: HOCHSTAND_GARRISON_CAP,
    garrisonHpMul: HOCHSTAND_GARRISON_HP_MUL,
    garrisonWoundMul: HOCHSTAND_WOUND_MUL,
    garrisonWindows: 1,
    garrisonFloors: HOCHSTAND_FLOORS,
    garrisonSightBonus: HOCHSTAND_SIGHT_BONUS,
    garrisonReachBonus: HOCHSTAND_REACH_BONUS,
    garrisonEye: HOCHSTAND_EYE_HEIGHT,
    garrisonFullArms: true,
    garrisonTypes: BUNKER_TYPES,
    blurb: `Log legs and a plank platform high over the trees, for ${HOCHSTAND_GARRISON_CAP} infantry. The farthest eyes on the field, farther than the concrete Watch Tower, and rifles carry a bit farther from up there. The planks stop very little, and it comes down fast under fire. Cheap and quick to put up.`,
  },
  leitturm: {
    type: "leitturm",
    kind: "building",
    name: "Fire-Control Tower",
    letter: "L",
    cost: 2200,
    buildSeconds: 24,
    hp: 4200,
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
    garrisonCap: LEITTURM_GARRISON_CAP,
    garrisonHpMul: LEITTURM_GARRISON_HP_MUL,
    garrisonWoundMul: LEITTURM_WOUND_MUL,
    garrisonWindows: 4,
    garrisonFloors: LEITTURM_FLOORS,
    garrisonSightBonus: LEITTURM_SIGHT_BONUS,
    garrisonReachBonus: LEITTURM_REACH_BONUS,
    garrisonEye: LEITTURM_EYE_HEIGHT,
    garrisonFullArms: true,
    garrisonTypes: BUNKER_TYPES,
    capturable: false,
    blurb: `Flak-tower block of concrete for ${LEITTURM_GARRISON_CAP} infantry, the troops a bunker takes. From the galleries they see far across the field, and their weapons reach farther than from any other post. Walls almost as good as a bunker's. A spotlight on the roof lights the ground at night. Dear and slow to pour. Enemy infantry cannot capture it.`,
  },
  spotlight: {
    type: "spotlight",
    kind: "building",
    name: "Spotlight",
    letter: "l",
    cost: SPOTLIGHT_POST_COST,
    buildSeconds: 6,
    hp: 260,
    power: 0,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    lampCrew: true,
    garrisonCap: 1,
    garrisonHpMul: SPOTLIGHT_POST_HP_MUL,
    garrisonWoundMul: SPOTLIGHT_POST_WOUND_MUL,
    garrisonWindows: 1,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonFullArms: true,
    garrisonTypes: BUNKER_TYPES,
    capturable: false,
    blurb: `The Watch Tower's searchlight on a steel pole, worked by one man, who comes with it. At night its beam lights a long cone of ground; Rotate swings it, and Patrol sweeps it between spots. Turn it before you place it to set where it first looks. The lamp burns only with someone at it: kill the man and it goes dark until another soldier takes his place. A bullet can smash the lamp and leave the man standing; an engineer fits a new one. He fires his own weapon from the foot of the pole, behind a few sandbags.`,
  },
  mgnest: {
    type: "mgnest",
    kind: "building",
    name: "MG Nest",
    letter: "n",
    cost: 400,
    buildSeconds: 8,
    hp: 350,
    power: 0,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 90,
    rangeTiles: MGNEST_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: TICK_DT,
    damage: MG42.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: MG42.penetration,
    caliber: MG42.caliber,
    spreadDeg: 3,
    shotsPerTick: MG42.shotsPerTick,
    belt: MGNEST_BELT,
    crewGun: true,
    mountArcDeg: MGNEST_ARC_DEG,
    antiAir: true,
    garrisonCap: 1,
    garrisonHpMul: 2,
    garrisonWoundMul: MGNEST_WOUND_MUL,
    garrisonWindows: 1,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonTypes: BUNKER_TYPES,
    capturable: false,
    blurb: `An MG42 on its tripod behind a ring of sandbags, worked by one man, who comes with it. Laid tighter and farther than the Gunner's bipod. ${MGNEST_BELT} rounds in the boxes; they do not refill by themselves — bring a supply truck. Sweeps ${MGNEST_ARC_DEG}° either side of the way it was turned, and nothing behind that. Reaches a plane or a drone. Rifle fire on it finds the gunner, not the gun: with nobody at it, it falls silent until another soldier takes his place. Cannot move.`,
  },
  pak36: {
    type: "pak36",
    kind: "building",
    name: "Pak 36",
    letter: "p",
    cost: 700,
    buildSeconds: 10,
    hp: 450,
    power: 0,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 40,
    rangeTiles: PAK36_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 2.4,
    damage: PAK36_SHELLS.ap.damage,
    projectileSpeed: TANK_SHELL_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: PAK36_SHELLS.ap.penetration,
    caliber: PAK36_SHELLS.ap.caliber,
    spreadDeg: PAK36_SHELLS.ap.spreadDeg,
    ammo: { ap: PAK36_RACK },
    defaultShell: "ap",
    shells: PAK36_SHELLS,
    crewGun: true,
    mountArcDeg: PAK36_ARC_DEG,
    armorFirst: true,
    garrisonCap: 1,
    garrisonHpMul: 2,
    garrisonWoundMul: PAK36_WOUND_MUL,
    garrisonWindows: 1,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonTypes: BUNKER_TYPES,
    capturable: false,
    blurb: `Light 37mm anti-tank gun behind a low shield, worked by one man, who comes with it. Fires armor-piercing shells like a StuG's: holes a light hull anywhere and a Tiger in the side or rear, never its front. Tanks first. Traverses only ${PAK36_ARC_DEG}° either side of the way it was turned — set it facing the road. ${PAK36_RACK} shells by the gun; a supply truck brings more. Rifle fire on it finds the gunner: with nobody at it, it falls silent until another soldier takes his place. Cannot move.`,
  },
  pak43: {
    type: "pak43",
    kind: "building",
    name: "Pak 43",
    letter: "P",
    cost: 2000,
    buildSeconds: 20,
    hp: 900,
    power: 0,
    tileW: t(2),
    tileH: t(2),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 20,
    rangeTiles: PAK43_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 7,
    damage: PAK43_SHELLS.ap.damage,
    projectileSpeed: TANK_SHELL_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: PAK43_SHELLS.ap.penetration,
    caliber: PAK43_SHELLS.ap.caliber,
    spreadDeg: PAK43_SHELLS.ap.spreadDeg,
    ammo: { ap: PAK43_RACK },
    defaultShell: "ap",
    shells: PAK43_SHELLS,
    crewGun: true,
    armorFirst: true,
    garrisonCap: 2,
    garrisonHpMul: 2,
    garrisonWoundMul: PAK43_WOUND_MUL,
    garrisonWindows: 2,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonTypes: BUNKER_TYPES,
    capturable: false,
    blurb: `The 88mm on its cross platform, worked by two men, who come with it. The longest straight reach on the field, and its armor-piercing shell goes through any front plate. It turns all the way round, but slowly — a tank that gets on its flank has time. Tanks first. ${PAK43_RACK} shells by the gun; a supply truck brings more. With one man left it loads at half pace; with none it is silent until soldiers take their places. Rifle fire on it finds the crew. Cannot move.`,
  },
  flak: {
    type: "flak",
    kind: "building",
    name: "Flak 37",
    letter: "f",
    cost: 1600,
    buildSeconds: 16,
    hp: 700,
    power: 0,
    tileW: t(2),
    tileH: t(2),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 120,
    rangeTiles: FLAK_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0.4,
    damage: FLAK_BURST_DAMAGE,
    projectileSpeed: FLAK_SHELL_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: FLAK_SHELLS.he.penetration,
    caliber: FLAK_SHELLS.he.caliber,
    spreadDeg: FLAK_SHELLS.he.spreadDeg,
    ammo: { he: FLAK_RACK },
    defaultShell: "he",
    shells: FLAK_SHELLS,
    crewGun: true,
    antiAir: true,
    airFirst: true,
    airOnly: true,
    garrisonCap: 2,
    garrisonHpMul: 2,
    garrisonWoundMul: FLAK_WOUND_MUL,
    garrisonWindows: 2,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonTypes: BUNKER_TYPES,
    capturable: false,
    blurb: `A 37mm anti-aircraft gun in a sandbagged ring, worked by two men, who come with it. It lays only on what is in the air: planes, Jump Jets, drones, and men under canopies. Its time-fused shells burst at the target's height in a wide black cloud, and everything flying inside it takes a little damage, so planes that fly close together are all hit at once. It leads a plane on its heading, but the fuse scatters: moderately accurate. Force attack on the ground puts a barrage up over that point. ${FLAK_RACK} shells in the racks; a supply truck brings more. Turns all the way round. With one man left it fires at half pace; with none it is silent until soldiers take their places. Rifle fire on it finds the crew. Cannot move.`,
  },
  sandbags: {
    type: "sandbags",
    kind: "building",
    name: "Sandbags",
    letter: "Q",
    cost: 20,
    buildSeconds: 2.8,
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
  barbwire: {
    type: "barbwire",
    kind: "building",
    name: "Barbwire",
    letter: "x",
    cost: 10,
    buildSeconds: 2,
    hp: 20,
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
    blurb: "Coils of barbed wire strung between posts. No soldier gets through it. It gives no cover and stops no round. Any vehicle rolls over it and leaves it flat, and the gap is open from then on.",
  },
  wall: {
    type: "wall",
    kind: "building",
    name: "Wall",
    letter: "w",
    cost: 50,
    buildSeconds: 5.25,
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
    blurb: "Concrete section with barbed wire. Scroll to turn it, then drag from the start to the end. The whole line is one job — longer for each piece — and it appears when the engineer finishes. Nothing walks through it while it stands. Shells and rockets break it; an engineer can repair it. Units beside it have extra health and take less from ground fire. Mortars, bombs, and shots from the air ignore that.",
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
  gate: {
    type: "gate",
    kind: "building",
    name: "Gate",
    letter: "b",
    cost: GATE_COST,
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
    ...UNARMED,
    blurb: "Point at two of your Wall sections side by side. When it is finished they become one wide gate: two posts with lamps and a boom that lifts for your side and stays down for everyone else. Lock it to keep everyone out. Shells and rockets break it; an engineer can repair it.",
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
  bridge: {
    type: "bridge",
    kind: "building",
    name: "Wooden bridge",
    letter: "u",
    // Per tile of deck: a brick's price is bridgeCost().
    cost: 9,
    buildSeconds: 0.45,
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
    ...UNARMED,
    capturable: false,
    blurb: "Timber trestle bridge, one tank wide. Draw it like a wall, from where it should start: the deck keeps that ground's level all the way across, over water or dry ground, and the engineer lays it bay by bay. Built high off a bank, small boats sail under it; the Transport LST and the Battle Ship never do. Anyone can cross. Only a force-attack aims at it; a few shells drop one bay into the water while the rest stands. The wreckage stays and an engineer can rebuild it.",
  },
  bigbridge: {
    type: "bigbridge",
    kind: "building",
    name: "Stone bridge",
    letter: "x",
    cost: 24,
    buildSeconds: 1.1,
    hp: 1700,
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
    capturable: false,
    blurb: "Masonry arch bridge on stone piers, two tanks wide. Draw it like a wall, from where it should start: the deck keeps that ground's level all the way across, over water or dry ground, and the engineer raises it span by span. Built high off a bank, small boats sail under it; the Transport LST and the Battle Ship never do. Anyone can cross. Only a force-attack aims at it, and it takes a long shelling to drop one span into the water while the rest stands. The wreckage stays and an engineer can rebuild it.",
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
    cost: 500,
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
    cost: 800,
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
    blurb: "PTRD-41. Reaches nearly as far as the scoped rifle. Up close it punches tank side and rear, usually a track, and it goes through light armor. The front plate holds.",
  },
  rocketer: {
    type: "rocketer",
    kind: "unit",
    name: "Rocketer",
    letter: "r",
    cost: 700,
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
    cost: 300,
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
    blurb: "Flamethrower with two fuel tanks on his back. Very short reach, and half again as much fuel: four bursts and a short one, refilled only by a supply truck. The jet burns every soldier it passes, his own too, and the ground from just in front of him out to the target stays alight. Trees in the way burn down. Over sandbags and in through windows. When he is killed there is a small chance the tanks go up.",
  },
  mortarman: {
    type: "mortarman",
    kind: "unit",
    name: "Mortarman",
    letter: "O",
    cost: 800,
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
    cost: 300,
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
    cost: 500,
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
    wreckHp: 35,
    blurb: "Heavily armored bulldozer. Thick plate on every face. Shells knock the scrap cart off the hitch. Out of the roster for now: Smelters stand on the scrap fields and pour on their own.",
  },
  warden: {
    type: "warden",
    kind: "unit",
    name: "Tiger",
    letter: "W",
    cost: 500,
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
    ammo: { ap: 12, he: 6 },
    defaultShell: "ap",
    mgAmmo: TANK_MG.ammo,
    leavesWreck: true,
    wreckHp: 35,
    hasScout: true,
    blurb: "Heavy tank. Independent turret, thick front plate. Slow hull, long-range rack.",
  },
  apocalypse: {
    type: "apocalypse",
    kind: "unit",
    name: "Apocalypse",
    letter: "A",
    cost: 5000,
    buildSeconds: 20,
    hp: 220,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 22.4,
    moveTilesPerSec: paced(0.935),
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
    wreckHp: 55,
    blurb: `Super-heavy tank. Two 105mm guns on one turret fire one after the other, a short gap and then a long reload, through a Tiger's front plate. Thick plate on every face, a slow hull and a slow turret. It rolls flat an enemy StuG, Walker, supply truck, Nebelwerfer, or field gun in its path, and leaves no wreck. It drives straight through woods, felling every tree it brushes; it runs down a Cyborg, but the Cyborg Commander is too big to go under. A small radar-laid 20mm CIWS on the turret roof lays itself, apart from the main guns: incoming missiles first, and it bursts some of them, then planes, infantry, and sometimes a Walker or a truck. A secondary mount, it sprays wider than a pad CIWS and overheats after a little over a second on the trigger. The ${APOCALYPSE_CIWS_BELT}-round belt refills only from a supply truck.`,
  },
  /** Spec: gridlock/packages/client/src/assets/units/ss3/stug-iii-ausf-g-late-saukopf.md */
  ss3: {
    type: "ss3",
    kind: "unit",
    name: "StuG III",
    letter: "G",
    cost: 300,
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
    ammo: { ap: 10 },
    defaultShell: "ap",
    shells: STUG_SHELLS,
    mgAmmo: TANK_MG.ammo,
    leavesWreck: true,
    wreckHp: 25,
    hasScout: true,
    blurb: "Casemate assault gun. No turret — hull-steer to aim. Strong front, thin sides.",
  },
  /** Casemate tank destroyer: a fixed 128mm on a far heavier hull than the StuG's. */
  jagdtiger: {
    type: "jagdtiger",
    kind: "unit",
    name: "Jagdtiger",
    letter: "d",
    cost: 3000,
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
    wreckHp: 50,
    hasScout: true,
    blurb: "Heavy tank destroyer. No turret: the 128mm sits in a fixed casemate and swings only a little either side of the nose, so the slow hull must turn to aim. The thickest front plate on the field, heavy sides, a thin rear. Its armor-piercing shell goes through any front plate and usually kills a Tiger in one hit, from the longest reach of any tank gun. A long reload between shots, and no HEAT or smoke on the rack.",
  },
  /** Flame tank: two CIWS mounts on the deck, a flame projector fixed in the bow. */
  feuerwirbel: {
    type: "feuerwirbel",
    kind: "unit",
    name: "Feuerwirbel",
    letter: "F",
    cost: 450,
    buildSeconds: 12,
    hp: 110,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(1.5),
    turnDegPerSec: 80,
    rangeTiles: FEUERWIRBEL_RANGE_TILES,
    sightTiles: t(9),
    cooldown: TICK_DT,
    damage: 8,
    projectileSpeed: SMALL_ARMS_SPEED,
    turnInPlace: true,
    tracked: true,
    // The mounts' traverse. No turret on the hull: this keeps the aim off the hull, which never turns to shoot.
    turretTurnDegPerSec: FEUERWIRBEL_MOUNT_TURN,
    armorFront: 60,
    armorSide: 28,
    armorRear: 14,
    penetration: 12,
    caliber: 13,
    spreadDeg: 4,
    belt: FEUERWIRBEL_BELT,
    twinCiws: true,
    antiAir: true,
    airFirst: true,
    hullFlamer: true,
    mgAmmo: HULL_FLAMER_FUEL,
    leavesWreck: true,
    wreckHp: 30,
    hasScout: true,
    blurb: `Flame tank. Two CIWS mounts on the deck, fore and aft, each a gatling of ${FEUERWIRBEL_MOUNT_SHOTS_PER_TICK * 10} rounds a second on the fastest traverse on the field. Each picks its own target: with two or more enemies in reach they never share one. They look for anything in the air first, then cut down soldiers, and sometimes bite a Walker or a truck. Tank plate turns them, and they do not bring a building down. Each overheats after a little under three seconds on the trigger. A flame projector fixed in the bow fires on its own at soldiers and soft vehicles inside a short reach, but only where the nose points; the driver turns the hull onto a target close enough to burn. The jet burns every soldier in its path, friends too, so it holds while one stands in the line. The ${FEUERWIRBEL_BELT}-round belt and ${HULL_FLAMER_BURSTS} bursts of fuel refill only from a supply truck. Lighter plate than a Tiger.`,
  },
  walker: {
    type: "walker",
    kind: "unit",
    name: "Walker",
    letter: "K",
    cost: 500,
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
    wreckHp: 18,
    blurb: "Each arm is a gatling at the MG42's 1,200 rounds a minute, the same bullet. A round sometimes bites a Walker or a truck; tank plate turns it. The torso turns on the hips, so he fires while he walks. The backpack is a 1,200-round rack and does not reload by itself. The gatlings fire with tracers and overheat fast: under three seconds on one arm, about one on both, then they fall silent to cool. One arm spends it slowly. Both arms spend it twice as fast and can split across two targets. The guns do not bring a building down. At a fifth of his health he charges the nearest enemy he can see and detonates, unless Self destroy is off in Config. That remainder swells to five times the hit points, still a fifth of his bar, and he runs faster with a short trail of dark smoke. The blast nicks a tank and hits everything else harder, and he leaves no wreck.",
  },
  cyborg: {
    type: "cyborg",
    kind: "unit",
    name: "Cyborg",
    letter: "Z",
    cost: 800,
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
    blurb: "Half soldier, half machine. A gatling arm fed from a 300-round drum that only a supply truck refills. It fires with tracers and overheats after under two seconds on the trigger. He carries no lamp: a thermal scanner marks enemy soldiers in a cone ahead of him, through fog, cover and dark. Set to Engage, he fires on whatever his side's scanners read inside his reach, seen or not. A round sometimes bites a Walker or a truck. Near death his legs are torn off and he crawls on, still firing. Medics heal him, engineers repair him, and either brings the legs back. He runs on the uplink from your Cyborg Central or a living Cyborg Commander of yours: without either he shuts down a few seconds later: still yours, but still and silent. He wakes up once your link is back, unless an enemy Cyborg Commander takes him over first.",
  },
  cyborgcommander: {
    type: "cyborgcommander",
    kind: "unit",
    name: "Cyborg Commander",
    letter: "Q",
    cost: 5000,
    buildSeconds: 18,
    hp: 300,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.5 * INFANTRY_PACE),
    turnDegPerSec: 900,
    rangeTiles: COMMANDER_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: LASER.cooldown,
    damage: LASER.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: LASER.penetration,
    caliber: LASER.caliber,
    spreadDeg: LASER.spreadDeg,
    blurb: "An officer of machines. A force field takes every hit before his plating does, and comes back on after a while out of the fire. He can put the laser's power into it: the field then holds five times the points and recharges five times as fast, but he cannot attack. His plating mends itself, very slowly. His cutting laser always reaches full range: on soldiers it sweeps across them in a short arc and burns down every soldier the red beam passes, friend or foe, and every tree in its path, leaving a line of fire on the ground. On a hull or a building it is one straight beam that cuts any plate: heavy damage to a hull, moderate to a building. Near death his legs are torn off and he crawls on, still firing. Medics heal him, engineers repair him. His thermal scanner and APS radar read all round him: enemy soldiers glow as heat, and armored hulls on the move show under a scan grid farther out, through fog, cover and dark. Set to Engage, he cuts at whatever the scanners read inside his reach, seen or not. While he lives your Cyborgs keep running without a Cyborg Central, and any enemy shut-down Cyborg near him is taken over by his uplink in a few seconds, one at a time. Only one at a time: while yours stands, or one is in a queue, another cannot be ordered.",
  },
  simunit2: {
    type: "simunit2",
    kind: "unit",
    name: "Sim Unit II",
    letter: "I",
    cost: 0,
    energy: 60,
    buildSeconds: 14,
    hp: 220,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(2.6 * INFANTRY_PACE),
    turnDegPerSec: 1200,
    rangeTiles: SIMUNIT_REACH_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: DAGGERS.cooldown,
    damage: DAGGERS.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: DAGGERS.penetration,
    caliber: DAGGERS.caliber,
    spreadDeg: DAGGERS.spreadDeg,
    blurb: `A light, fast cyborg built for the knife. An energy dagger in each hand: one slash kills a soldier, but only at arm's reach. He opens a Walker or a truck slowly and barely scratches a tank or a wall. A blink drive throws him up to ${SIMUNIT_BLINK_RANGE_TILES / TILE_SUBDIV} cells in an instant on one charge, back by itself in ${SIMUNIT_BLINK_RECHARGE_SECONDS} seconds: an enemy he goes for inside that reach, he blinks straight onto while the charge is up. Right-click an enemy structure or hull with soldiers inside and he blinks in among them, kills every soldier aboard in ${SIMUNIT_PURGE_SECONDS} seconds, and blinks back out; only a hostile garrison offers it. Like the Cyborg he can shut down where he stands: dark and still, he reads as no one's machine and enemy guns pass him by until he powers up. Near death his legs are torn off and he crawls on, still cutting. Medics heal him, engineers repair him. He hears the hive through your Conversion Chamber's spire, and goes dark without it.`,
  },
  xenodrone: {
    type: "xenodrone",
    kind: "unit",
    name: "Drone",
    letter: "o",
    cost: 0,
    energy: 25,
    buildSeconds: 10,
    hp: 150,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.9 * INFANTRY_PACE),
    turnDegPerSec: 1200,
    rangeTiles: RIFLE_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: RIFLE.cooldown,
    damage: RIFLE.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: RIFLE.penetration,
    caliber: RIFLE.caliber,
    spreadDeg: RIFLE.spreadDeg,
    blurb: `The hive's line soldier: a body taken and fitted with a pulse carbine in place of a forearm. It shoots like a rifle, a clip and then a short recharge. Several times a soldier's hit points for a few riflemen's price, but slower on its feet. No stance orders; it fights standing. In a fight it raises a small energy wall in front of it, like the Behemoth's but far weaker (${INFANTRY_SHIELD.hp} points): enemy rounds stop on it and enemies cannot walk through, while it and its side shoot and walk through. Near death its legs are torn off and it crawls on, still firing. Medics heal it, engineers repair it. It hears the hive through your Conversion Chamber's spire, and goes dark without it.`,
  },
  thrall: {
    type: "thrall",
    kind: "unit",
    name: "Thrall",
    letter: "a",
    cost: 0,
    energy: 20,
    buildSeconds: 6,
    hp: 200,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(2.8 * INFANTRY_PACE),
    turnDegPerSec: 1200,
    rangeTiles: THRALL_REACH_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: FISTS.cooldown,
    damage: FISTS.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: FISTS.penetration,
    caliber: FISTS.caliber,
    spreadDeg: FISTS.spreadDeg,
    blurb: "The hive's cheap brawler, quick off the line: a taken body on a heavy frame. It always runs, and it fights with two armoured fists: a soldier it reaches is pummelled down in a few fast blows. An armored hull it reaches, it does not punch: it detonates against the plate and is gone. Sandbags and walls do not stop it; it vaults them. Bullets do little to its plating, but now and then one catches a shoulder and staggers it for a moment. No stance orders. Near death its legs are torn off and it crawls on, still swinging. Medics heal it, engineers repair it. It hears the hive through your Conversion Chamber's spire, and goes dark without it.",
  },
  lancer: {
    type: "lancer",
    kind: "unit",
    name: "Lancer",
    letter: "j",
    cost: 0,
    energy: 50,
    buildSeconds: 14,
    hp: 240,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.45 * INFANTRY_PACE),
    turnDegPerSec: 1000,
    rangeTiles: LAUNCHER_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: LAUNCHER.cooldown,
    damage: LAUNCHER.damage,
    projectileSpeed: TITAN_ROCKET_SPEED,
    ...UNARMED,
    penetration: LAUNCHER.penetration,
    caliber: LAUNCHER.caliber,
    spreadDeg: LAUNCHER.spreadDeg,
    blurb: `Anti-armor cyborg. A plasma lance rides its shoulder and throws a burning bolt like a rocket: loose at full reach, tighter up close, a burst among soldiers that dents a tank. The capacitor on its back recharges the lance between shots. Heavy plating keeps it standing where a Rocketer would fall. In a fight it raises the Drone's small energy wall in front of it (${INFANTRY_SHIELD.hp} points). No stance orders. Near death its legs are torn off and it crawls on, still firing. Medics heal it, engineers repair it. It hears the hive through your Conversion Chamber's spire, and goes dark without it.`,
  },
  /** Xenomorph cyborg: the Mawcaster on two legs, lobbing one plasma ball at a time. */
  spitter: {
    type: "spitter",
    kind: "unit",
    name: "Spitter",
    letter: "i",
    cost: 0,
    energy: 35,
    buildSeconds: 11,
    hp: 170,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.7 * INFANTRY_PACE),
    turnDegPerSec: 1100,
    rangeTiles: SPITTER_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    rockets: true,
    rocketAmmo: 5,
    rocketRack: SPITTER_BALL,
    blurb: `A taken body with a swollen throat sac: the Mawcaster on two legs. It stands, rears back, and lobs one plasma ball at a time on a high arc over your own line, from long reach, then waits ${SPITTER_BALL.reload} seconds while the sac refills. Force attack sends the ball anywhere in that reach, seen or not. It will not spit inside ${SPITTER_MIN_RANGE_TILES / TILE_SUBDIV} cells, and must stop and face the target first. The ball scatters at full reach and bursts among soldiers; armor only dents. No stance orders. Near death its legs are torn off and it crawls on, still spitting. It hears the hive through your Conversion Chamber's spire, and goes dark without it.`,
  },
  /** Xenomorph cyborg: unarmed support, shields friends under fire and mends hive units. */
  weaver: {
    type: "weaver",
    kind: "unit",
    name: "Weaver",
    letter: "w",
    cost: 0,
    energy: 35,
    buildSeconds: 11,
    hp: 160,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(2 * INFANTRY_PACE),
    turnDegPerSec: 1200,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    plasmaCell: WEAVER_CELL,
    blurb: `Support. No weapon. Four needle arms and a spindle of nanites on its back. When a unit of your side is under fire within ${WEAVER_SHIELD_REACH_TILES / TILE_SUBDIV} cells, the Weaver itself too, it throws a small energy wall in front of it, facing the fire: one soldier wide and ${WEAVER_SHIELD.hp} points strong, standing ${WEAVER_SHIELD.seconds} seconds unless shot down. Enemy rounds stop on it and enemies cannot walk through; your side shoots and walks through. Each wall takes a quarter of its energy cell, which regrows a quarter every ${WEAVER_CELL.rechargeSeconds} seconds. It does not stop shells lobbed from above. It also sends a mend every second into each hive unit of yours within ${WEAVER_REACH_TILES / TILE_SUBDIV} cells: ${WEAVER_MEND_CYBORG} HP to a cyborg, ${WEAVER_MEND_HEAVY} to a heavy assimilator or anything else the hive fields. Two Weavers on one unit mend it once. It cannot mend itself; another Weaver can. Torn legs grow back once the body is whole enough. No stance orders. It hears the hive through your Conversion Chamber's spire, and shields and mends nothing while dark.`,
  },
  /** Xenomorph cyborg: cloaked spine sniper. */
  shade: {
    type: "shade",
    kind: "unit",
    name: "Shade",
    letter: "h",
    cost: 0,
    energy: 40,
    buildSeconds: 12,
    hp: 110,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.8 * INFANTRY_PACE),
    turnDegPerSec: 1400,
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
    blurb: `A lean hunter with a spine rifle grown along its forearm and a skin that drinks the light. The spine reaches as far as a sniper's scope; a hit takes most of a soldier's health, and the hive's spine never needs a truck. While its skin is settled no enemy sees it or can pick it, even on the move. Each shot, and any hit that hurts it, shows it for ${SHADE_REVEAL_SECONDS} seconds, and an enemy within ${SHADE_SPOT_TILES / TILE_SUBDIV} cells always sees it. Thin plating for a cyborg. No stance orders. Near death its legs are torn off and it crawls on, still firing. It hears the hive through your Conversion Chamber's spire, and goes dark without it. Needs a Neural Nexus.`,
  },
  /** Xenomorph heavy assimilator: four legs and a turreted disruptor, the hive's answer to the Tiger. */
  stalker: {
    type: "stalker",
    kind: "unit",
    name: "Stalker",
    letter: "y",
    cost: 0,
    energy: 60,
    buildSeconds: 15,
    hp: 135,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(1.5),
    turnDegPerSec: 110,
    rangeTiles: t(13),
    sightTiles: t(8),
    cooldown: 6.5,
    plasmaCell: { shots: 4, rechargeSeconds: 12 },
    damage: 55,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    turretTurnDegPerSec: 200,
    armorFront: 70,
    armorSide: 30,
    armorRear: 18,
    penetration: 95,
    caliber: 75,
    spreadDeg: 3,
    ammo: { ap: 12, he: 6 },
    defaultShell: "ap",
    leavesWreck: true,
    wreckHp: 35,
    blurb: "Heavy assimilator on four long legs, a domed turret on its back. The disruptor throws a piercing plasma bolt about as hard as a Tiger's shell, or a scattering burst for soldiers, from a little less reach. Thinner in front than a Tiger, but its legs turn it quicker. No tracks to lose. Burrow digs it in where it stands: under the ground no enemy sees it or can pick it, but it neither moves nor fires; it rises with its gun laid and fires at once. Each bolt draws on an energy cell that holds 4 and regrows one every 12 seconds: a short burst, then it waits on the cell.",
  },
  /** Xenomorph heavy assimilator: fast raptor hull, spine gatling turret, nanite flamer in the jaw. */
  ravager: {
    type: "ravager",
    kind: "unit",
    name: "Ravager",
    letter: "v",
    cost: 0,
    energy: 50,
    buildSeconds: 13,
    hp: 115,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(1.8),
    turnDegPerSec: 120,
    rangeTiles: t(10),
    sightTiles: t(9),
    cooldown: TICK_DT,
    plasmaCell: { shots: 60, rechargeSeconds: 0.2 },
    damage: 8,
    projectileSpeed: SMALL_ARMS_SPEED,
    turnInPlace: true,
    turretTurnDegPerSec: 260,
    armorFront: 50,
    armorSide: 24,
    armorRear: 14,
    penetration: 12,
    caliber: 13,
    spreadDeg: 4,
    shotsPerTick: 2,
    hullFlamer: true,
    mgAmmo: HULL_FLAMER_FUEL,
    leavesWreck: true,
    wreckHp: 28,
    blurb: `Fast heavy assimilator built to hunt soldiers. A pulse repeater on a quick turret; tank plate turns the bolts, and they do not bring a building down. Each bolt draws on an energy cell that holds 60 and regrows five a second: three seconds of full fire, then a quarter of that while the cell refills. A plasma jet in the jaw fires on its own at soldiers and soft vehicles inside a short reach, but only where the nose points, and burns every soldier in its path, friends too. The jet never runs dry. Lighter plate than a Stalker.`,
  },
  /** Xenomorph heavy assimilator: six legs, twin disruptors, a carapace that sheds shells. */
  behemoth: {
    type: "behemoth",
    kind: "unit",
    name: "Behemoth",
    letter: "b",
    cost: 0,
    energy: 200,
    buildSeconds: 26,
    hp: 240,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 20,
    moveTilesPerSec: paced(0.9),
    turnDegPerSec: 55,
    rangeTiles: t(15),
    sightTiles: t(9),
    cooldown: 8.5,
    plasmaCell: { shots: 6, rechargeSeconds: 9 },
    damage: APOCALYPSE_SHELLS.ap.damage,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    turretTurnDegPerSec: 120,
    armorFront: 125,
    armorSide: 70,
    armorRear: 40,
    penetration: APOCALYPSE_SHELLS.ap.penetration,
    caliber: APOCALYPSE_SHELLS.ap.caliber,
    spreadDeg: APOCALYPSE_SHELLS.ap.spreadDeg,
    shells: BEHEMOTH_SHELLS,
    twinGuns: true,
    ammo: { ap: 24 },
    defaultShell: "ap",
    shellResist: BEHEMOTH_SHELL_RESIST,
    leavesWreck: true,
    wreckHp: 60,
    blurb: `The largest of the heavy assimilators: a carapace on six legs with twin plasma disruptors on one turret. They fire one after the other, a short gap and then a long reload, through a Tiger's front plate, from farther than any tank but the Jagdtiger. A bolt hits hardest up close: ${BEHEMOTH_PULSE_NEAR_MUL}× at the muzzle, falling to ${BEHEMOTH_PULSE_FAR_MUL}× at full range. High Pulse fires full bolts; Light Pulse fires about four times as fast for under a third of the damage a bolt. The layered carapace sheds part of every shell that hits it (it takes ${Math.round(BEHEMOTH_SHELL_RESIST * 100)}% of the damage). Slow on its legs and slow on the turret, it walks straight through woods, felling every tree it brushes. Lunge throws it up and forward up to ${BEHEMOTH_LUNGE_RANGE_TILES / TILE_SUBDIV} cells; where it lands, ${BEHEMOTH_RING_SWEEPS} green laser sweeps lash out round it, burning enemy soldiers and setting the ground alight. The legs need ${BEHEMOTH_LUNGE_RECHARGE_SECONDS} seconds before the next. With the legs charged it lunges by itself at an enemy unit it is fighting ${BEHEMOTH_AUTO_LUNGE_MIN_TILES / TILE_SUBDIV} cells off or more, unless told to hold position. In a fight it throws a curved energy wall across its front, ${BEHEMOTH_SHIELD.hp} points strong: the wall stays where it went up, stops every enemy round and beam that meets it, and no enemy walks through it, while the Behemoth walks and fires through as if it were not there. It stands ${BEHEMOTH_SHIELD.seconds} seconds unless shot down; ${BEHEMOTH_SHIELD.rechargeSeconds} seconds after it falls, the next. Each barrel's bolt draws on an energy cell that holds 6 and regrows one every 9 seconds. Needs a Neural Nexus.`,
  },
  /** Xenomorph heavy assimilator: a giant on two legs with a two-handed hammer. Melee only. */
  juggernaut: {
    type: "juggernaut",
    kind: "unit",
    name: "Juggernaut",
    letter: "z",
    cost: 0,
    energy: 150,
    buildSeconds: 24,
    hp: 4200,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 13,
    moveTilesPerSec: paced(1.15),
    turnDegPerSec: 480,
    rangeTiles: JUGGERNAUT_REACH_TILES,
    sightTiles: t(8),
    cooldown: JUGGERNAUT_HAMMER_SECONDS,
    damage: JUGGERNAUT_HAMMER_HULL,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    noReverse: true,
    armorFront: 60,
    armorSide: 45,
    armorRear: 30,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    leavesWreck: true,
    wreckHp: 50,
    wades: true,
    wadeSpeed: JUGGERNAUT_WADE_SPEED,
    fightsWading: true,
    blurb: `A giant of the hive on two legs, swinging a two-handed hammer. It fights only at arm's reach, and runs at what it goes for at ${JUGGERNAUT_SPRINT_MUL} times its walk. It strides straight through woods, felling every tree it brushes, and wades through water thigh-deep, slower, still swinging: from there it hammers a boat on the surface, but not a submarine running below. Every blow lands in an area: it kills a soldier outright, staves in a tank's plate whatever its armor, and knocks whole walls out of a building. Only its own side is spared. Plated like a light tank and slow to fall. Brought down to ${Math.round(JUGGERNAUT_RAGE_HP * 100)}% it hurls the hammer at the strongest enemy within ${JUGGERNAUT_THROW_RANGE_TILES / TILE_SUBDIV} cells, a heavy blast where it lands, then fights on with its fists: lighter blows, three for every swing of the hammer, and it moves faster. Needs a Neural Nexus.`,
  },
  /** Xenomorph heavy assimilator: four legs and a dome of energy over everything round it. Unarmed. */
  siphon: {
    type: "siphon",
    kind: "unit",
    name: "Siphon",
    letter: "s",
    cost: 0,
    energy: 70,
    buildSeconds: 16,
    hp: 140,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(1.6),
    turnDegPerSec: 110,
    rangeTiles: 0,
    sightTiles: t(8),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    turnInPlace: true,
    turretTurnDegPerSec: 220,
    armorFront: 55,
    armorSide: 28,
    armorRear: 16,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    leavesWreck: true,
    wreckHp: 32,
    blurb: `Heavy assimilator on four legs with a forked emitter on its back. It carries no weapon. Instead it holds a dome of energy ${SIPHON_DOME.radiusTiles / TILE_SUBDIV} cells wide round itself, and the dome walks with it. Everything that comes in from outside stops on the dome: rounds, rockets, beams and flame, shells and bombs falling from above, the blast of a burst outside it, a blow at arm's reach. Your own units under it shoot and walk out freely; no enemy walks in. Every hit drains the Siphon's energy (${SIPHON_DOME.energy}) by its damage, and a standing dome slowly regains it. Drained to nothing, the dome is gone until the energy fills all the way back, ${SIPHON_DOME.rechargeSeconds} seconds, and then it is cast again.`,
  },
  /** Xenomorph heavy assimilator: a brood sac on six legs that births Thralls. Unarmed. */
  broodmother: {
    type: "broodmother",
    kind: "unit",
    name: "Broodmother",
    letter: "m",
    cost: 0,
    energy: 120,
    buildSeconds: 22,
    hp: 300,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 16,
    moveTilesPerSec: paced(0.85),
    turnDegPerSec: 50,
    rangeTiles: 0,
    sightTiles: t(8),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    turnInPlace: true,
    armorFront: 50,
    armorSide: 40,
    armorRear: 30,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    leavesWreck: true,
    wreckHp: 45,
    blurb: `A living hatchery: a great brood sac on six short legs. It carries no weapon. Every ${BROOD_SECONDS} seconds a Thrall tears out of the sac beside it, while fewer than ${BROOD_MAX} of its brood live; the first comes ${BROOD_FIRST_SECONDS} seconds after it leaves the Forge. Its brood are Thralls like any other: they count against your units and run on the uplink. Thick hide on every face and slow on its legs. Keep it behind the line. Needs a Neural Nexus.`,
  },
  /** Xenomorph heavy assimilator: spore-pod rocket artillery. */
  mawcaster: {
    type: "mawcaster",
    kind: "unit",
    name: "Mawcaster",
    letter: "c",
    cost: 0,
    energy: 80,
    buildSeconds: 18,
    hp: 100,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(1.6),
    turnDegPerSec: 110,
    rangeTiles: MAWCASTER_RANGE_TILES,
    sightTiles: t(6),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    turnInPlace: true,
    turretTurnDegPerSec: 50,
    gunArcDeg: 4,
    armorFront: 24,
    armorSide: 14,
    armorRear: 10,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    leavesWreck: true,
    wreckHp: 20,
    rockets: true,
    rocketAmmo: MAWCASTER_SALVO * 5,
    rocketRack: MAWCASTER_POD,
    airRack: MAWCASTER_AIR_BALL,
    plasmaCell: MAWCASTER_CELL,
    blurb: `Plasma artillery on four legs. Ground attacks: the maw throws ${MAWCASTER_SALVO} plasma balls a salvo on a high arc over your own troops, from nearly the Nebelwerfer's reach. Force attack sends them anywhere in that reach, seen or not. It will not fire inside ${MAWCASTER_MIN_RANGE_TILES / TILE_SUBDIV} cells, and must stop and swing the maw onto the target first. The balls scatter wide at full reach: a salvo blankets an area and shreds soldiers in the open; armor only dents. Now and then one leaves burning bile on the ground. Air attacks: it leaves the ground alone and spits smaller balls, ${MAWCASTER_AIR_SALVO} at a time and quick, straight at planes, Jump Jets, and low drones within ${MAWCASTER_AIR_RANGE_TILES / TILE_SUBDIV} cells; each bursts at the flier's height. Every ball draws on an energy cell that holds ${MAWCASTER_CELL.shots} and regrows one every ${MAWCASTER_CELL.rechargeSeconds} seconds. Thin hide and short eyes — keep it behind the line.`,
  },
  /** Xenomorph infantry: the hive's barracks, and the synapse link its foot soldiers run on. */
  conversion: {
    type: "conversion",
    kind: "building",
    name: "Conversion Chamber",
    letter: "C",
    cost: 0,
    buildSeconds: 16,
    hp: 900,
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
    blurb: `A low chitin dome ringed with glowing conversion pods, under a synapse spire. Taken bodies go into the pods and walk out as the hive's foot soldiers: the Drone, the Thrall, the Lancer, the Spitter, the Weaver, the Sim Unit II, and, with a Neural Nexus standing, the Shade. They hear the hive through its spire: if it falls, ${CYBORG_SHUTDOWN_SECONDS} seconds later every one of them on the field goes dark: still yours, but dead still and silent. Raise a new Chamber and they wake up, unless an enemy Cyborg Commander took them first.`,
  },
  /** Xenomorph vehicle factory. */
  forge: {
    type: "forge",
    kind: "building",
    name: "Nanite Forge",
    letter: "N",
    cost: 0,
    buildSeconds: 20,
    hp: 1000,
    power: 0,
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
    blurb: `A ribbed hangar over vats of nanite gel. It grows the heavy assimilators: the Stalker, the Ravager, and, with a Neural Nexus standing, the Behemoth and the Juggernaut. The Xenomorphs need no supply trucks: every Xenomorph weapon draws on the hive and never runs dry.`,
  },
  /** Xenomorph tech and sensor building. */
  nexus: {
    type: "nexus",
    kind: "building",
    name: "Neural Nexus",
    letter: "X",
    cost: 0,
    buildSeconds: 26,
    hp: 900,
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
    blurb: "A neural core in a cage of ribs under a crown of sensor spines: the hive thinks here. It unlocks the Behemoth and the Pulse Spire, and it lights the radar panel like a Radar Station: an enemy plane or drone nobody can see shows as a blinking contact on the panel. Costs nothing to grow.",
  },
  /** Xenomorph anti-infantry gun: crewless, runs on base power. */
  spineturret: {
    type: "spineturret",
    kind: "building",
    name: "Spine Turret",
    letter: "s",
    cost: 0,
    energy: 40,
    buildSeconds: 9,
    hp: 500,
    power: 0,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 140,
    rangeTiles: t(12),
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: TICK_DT,
    damage: MG42.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: MG42.penetration,
    caliber: MG42.caliber,
    spreadDeg: 3,
    shotsPerTick: MG42.shotsPerTick,
    plasmaCell: SPINE_TURRET_CELL,
    poweredGun: true,
    capturable: false,
    blurb: "A chitin bulb rooted in the ground with a twin pulse repeater for a head. Nobody works it: it lays itself all the way round and cuts down soldiers at an MG42's pace from a little short of an MG Nest's reach, and draws its charge from the hive: a cell that holds 3 seconds of fire and regrows at half the pace it fires, so a long burst slows to a stutter. Tank plate turns them, and they do not bring a building down. Takes hive energy while it stands; offline, it falls silent. Cannot move.",
  },
  /** Xenomorph fence post: links to the posts beside it with two laser beams (sim/laser-fence.ts). */
  laserfence: {
    type: "laserfence",
    kind: "building",
    name: "Laser Fence",
    letter: "f",
    cost: 0,
    energy: 10,
    buildSeconds: 6,
    hp: 300,
    power: 0,
    tileW: 2,
    tileH: 2,
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    capturable: false,
    blurb: `A chitin post with two emitters. Set posts in a row: each links to the nearest post of yours up to ${LASER_FENCE_REACH_TILES / TILE_SUBDIV} cells away, and to the next one on its far side, with two laser beams between them. The beams stop nothing: soldiers and hulls walk through, and rounds fly through. Any ground unit that is not the hive's burns while it touches a beam: soldiers fall almost at once, a tank loses most of its hull crossing. Your own units pass unharmed. Each post takes a little hive energy, and each link more the longer it reaches; offline, a post's beams go dark. Shoot a post down to open the fence. Cannot move.`,
  },
  /** Xenomorph anti-armor gun: crewless, runs on base power. */
  pulsespire: {
    type: "pulsespire",
    kind: "building",
    name: "Pulse Spire",
    letter: "q",
    cost: 0,
    energy: 100,
    buildSeconds: 14,
    hp: 800,
    power: 0,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 45,
    rangeTiles: t(15),
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 3,
    plasmaCell: { shots: 8, rechargeSeconds: 6 },
    damage: PULSE_SPIRE_SHELLS.ap.damage,
    projectileSpeed: TANK_SHELL_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: PULSE_SPIRE_SHELLS.ap.penetration,
    caliber: PULSE_SPIRE_SHELLS.ap.caliber,
    spreadDeg: PULSE_SPIRE_SHELLS.ap.spreadDeg,
    ammo: { ap: PULSE_SPIRE_RACK },
    defaultShell: "ap",
    shells: PULSE_SPIRE_SHELLS,
    armorFirst: true,
    poweredGun: true,
    capturable: false,
    blurb: `A tall spire with a long emitter and a ring of green fire. Nobody works it: it turns all the way round, slowly, and throws a piercing energy pulse through a Tiger's front plate from farther than a Pak 36 reaches. Tanks first. Each pulse draws on an energy cell that holds 8 and regrows one every 6 seconds. Takes hive energy while it stands; offline, it falls silent. Needs a Neural Nexus. Cannot move.`,
  },
  /** Xenomorph shipyard: grows the Leech and the Lurker. Stands on open water like a Marine Base. */
  spawnpool: {
    type: "spawnpool",
    kind: "building",
    name: "Spawning Pool",
    letter: "W",
    cost: 0,
    buildSeconds: 20,
    hp: 1000,
    power: 0,
    tileW: t(2.5),
    tileH: t(2.5),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    onWater: true,
    blurb: "A ring of ribbed chitin around a glowing birthing pool. It can only grow on water: every tile under it must be open water. Grows the Leech and, with a Neural Nexus standing, the Lurker and the Hive Ark, which slip into the water beside it and never come ashore.",
  },
  /** Xenomorph flier hive: grows the fliers, which lift straight out of it. No strip, no pads; the Nanite Forge's footprint. */
  aerie: {
    type: "aerie",
    kind: "building",
    name: "Aerie",
    letter: "E",
    cost: 0,
    buildSeconds: 26,
    hp: 1100,
    power: 0,
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
    blurb: "A ribbed chitin hive where the fliers are grown. Grows the Wasp, the Gnat, and, with a Neural Nexus standing, the Scourge and the Overseer. They lift straight up out of it and never come down: no runway and no fuel. Their weapons run on energy cells that drain as they fire and charge again by themselves. A Weaver mends them in the air.",
  },
  /** Xenomorph fast attack boat: a skimming chitin hull with a plasma cannon. */
  leech: {
    type: "leech",
    kind: "unit",
    name: "Leech",
    letter: "h",
    cost: 0,
    energy: 45,
    buildSeconds: 10,
    hp: 75,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(2.8),
    turnDegPerSec: 120,
    noReverse: true,
    turnInPlace: true,
    turretTurnDegPerSec: 260,
    rangeTiles: GUNBOAT_RANGE_TILES,
    sightTiles: t(18),
    cooldown: 0.45,
    plasmaCell: { shots: 20, rechargeSeconds: 1 },
    damage: 13,
    projectileSpeed: SMALL_ARMS_SPEED,
    armorFront: 14,
    armorSide: 9,
    armorRear: 6,
    penetration: 30,
    caliber: 20,
    spreadDeg: 2.5,
    naval: true,
    leavesWreck: true,
    wreckHp: 14,
    blurb: "A low chitin hull that skims the water on a glowing belly, a small plasma cannon on its back. Water only: it never comes ashore. It fires on boats and on anything within reach of the bank, a little faster and harder than the Attack Boat, until its energy cell (20 bolts, one regrown every second) runs low. Thin shell: an anti-tank rifle or a tank shell goes straight through. Sunk, it leaves a hulk on the bottom that blocks the water until it is shot apart.",
  },
  /** Xenomorph sea beast: hunts under the water and bites. No gun. */
  lurker: {
    type: "lurker",
    kind: "unit",
    name: "Lurker",
    letter: "k",
    cost: 0,
    energy: 80,
    buildSeconds: 16,
    hp: 160,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 14.4,
    moveTilesPerSec: paced(2.2),
    turnDegPerSec: 110,
    noReverse: true,
    turnInPlace: true,
    rangeTiles: LURKER_REACH_TILES,
    sightTiles: LURKER_SIGHT_TILES,
    cooldown: LURKER_BITE_SECONDS,
    damage: LURKER_BITE_DAMAGE,
    projectileSpeed: 0,
    armorFront: 18,
    armorSide: 16,
    armorRear: 12,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    naval: true,
    submerges: true,
    neverSurfaces: true,
    bite: true,
    leavesWreck: true,
    wreckHp: 40,
    blurb: `A sea beast the hive grew in its pool: a long plated body that swims like an eel, a crest of spines, glowing eyes, and a split jaw of hooked fangs. No gun: it hunts with its jaws. It lives under the water and never needs air: it cannot be ordered up, and down there it sees only ${LURKER_SIGHT_TILES / TILE_SUBDIV} cells. The enemy sees it only while one of their Destroyers hears it on sonar. It surfaces by itself when it bites and stays in sight for ${SUB_REVEAL_SECONDS} seconds before it sinks again. It bites whatever it reaches, ${LURKER_REACH_TILES / TILE_SUBDIV} cells from its body: one bite kills a soldier, swimming or standing at the water's edge, and tears into a boat's hull; a tank's plate gives slowly, a wall slower. It never comes ashore. Dead, its carcass sinks and blocks the water until it is shot apart. Needs a Neural Nexus.`,
  },
  /** Xenomorph carrier: a round chitin hull, two plasma cannons, two Wasp pods, an energy dome. */
  hiveark: {
    type: "hiveark",
    kind: "unit",
    name: "Hive Ark",
    letter: "a",
    cost: 0,
    energy: 400,
    buildSeconds: 34,
    hp: 7500,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: ARK_HULL_RADIUS,
    moveTilesPerSec: paced(1.3),
    turnDegPerSec: 22,
    noReverse: true,
    turnInPlace: true,
    turretTurnDegPerSec: ARK_CANNON_TURN_DEG_PER_SEC,
    rangeTiles: ARK_RANGE_TILES,
    sightTiles: t(20),
    cooldown: ARK_CANNON_RELOAD,
    damage: ARK_PLASMA_BALL.damage,
    projectileSpeed: 0,
    armorFront: 115,
    armorSide: 115,
    armorRear: 115,
    penetration: ARK_PLASMA_BALL.penetration,
    caliber: ARK_PLASMA_BALL.caliber,
    spreadDeg: 0,
    naval: true,
    leavesWreck: true,
    wreckHp: 100,
    blurb: `A round chitin carrier the hive grows in its pool, the Xenomorph answer to the Battle Ship. Water only. Two plasma cannons, fore and aft, each throw one huge plasma ball on a high arc, out to ${ARK_RANGE_TILES / TILE_SUBDIV} tiles, farther than the Battle Ship reaches, but never inside ${ARK_MIN_RANGE_TILES / TILE_SUBDIV} tiles; the burst is wide and burns through soldiers, boats, and buildings alike. Each cannon draws on its own energy cell: ${ARK_CANNON_CELL} balls full, one regrown every ${ARK_CANNON_RECHARGE_SECONDS} seconds. Empty, that cannon falls silent until its cell is full again. An energy dome stands over the whole hull, the Siphon's dome made huge: everything that comes in from outside stops on it, rounds, rockets, beams and flame, shells and bombs falling from above, the blast of a burst outside it, and no enemy boat sails in under it. Every hit drains its ${ARK_DOME.energy} points; a standing dome slowly regains them, and drained, it is gone for ${ARK_DOME.rechargeSeconds} seconds before it rises again. Torpedoes run under it. Two Wasps sit on its landing pods: when an enemy unit shows inside its sight they lift by themselves, hunt it, and come home to their pods when nothing is left. Nobody commands them, and a lost Wasp regrows on its pod after ${ARK_WASP_REGROW_SECONDS} seconds. Needs a Neural Nexus. Sunk, it leaves a hulk on the bottom that blocks the water until it is shot apart.`,
  },
  /** Xenomorph fighter: insect wings, twin pulse cannons. Lives in an Aerie nest. */
  wasp: {
    type: "wasp",
    kind: "unit",
    name: "Wasp",
    letter: "w",
    cost: 0,
    energy: 60,
    buildSeconds: 22,
    hp: 90,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(6.8),
    turnDegPerSec: 160,
    rangeTiles: WASP_BURST_TILES,
    sightTiles: t(11),
    cooldown: WASP_BURST_COOLDOWN,
    damage: WASP_BOLT.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: WASP_BOLT.penetration,
    caliber: WASP_BOLT.caliber,
    spreadDeg: 0,
    aircraft: true,
    fighter: true,
    wreckHp: 20,
    plasmaCell: { shots: 4, rechargeSeconds: 8 },
    blurb: `Insect gunship on buzzing green-veined wings, a laser emitter under each. It never lands. Sent at something it flies straight at it, stops ${HIVE_WASP_STANDOFF_TILES / TILE_SUBDIV} tiles short, hangs still in the air, and looses a storm of ${WASP_BURST_BOLTS} energy bolts at the spot: long reach, poor aim, a burst blankets a patch of ground ${(2 * WASP_BURST_SCATTER_TILES) / TILE_SUBDIV} tiles across and comes down through a tank's thin roof. Its cell holds four bursts and grows one back every eight seconds; drained, it hangs there waiting for the charge. It fires on enemy planes the same way. A hit that tears a wing brings it down at once.`,
  },
  /** Xenomorph dive bomber: beetle carapace and a plasma bomb pod. Lives in an Aerie nest. */
  scourge: {
    type: "scourge",
    kind: "unit",
    name: "Scourge",
    letter: "g",
    cost: 0,
    energy: 100,
    buildSeconds: 20,
    hp: 115,
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
    wreckHp: 23,
    plasmaCell: { shots: 16, rechargeSeconds: 1 },
    blurb: `Hovering bomber with a beetle's carapace and buzzing wings. A plasma bomb in a glowing pod that grows the next one ${HIVE_BOMB_SECONDS} seconds after the last falls, and two pulse guns for soft targets. It never lands: sent at something it hangs just off it, lobbing bomb after bomb and raking it in bursts. Bombs and guns draw on one energy cell that regrows by itself; a bomb takes ${HIVE_BOMB_ENERGY} times a gun burst, and a drained cell holds both back until it charges. Flies over everything; only rifles, machine guns, the Walker, and the Titan's rockets can reach it in the air. A hit that tears a wing brings it down at once. Needs a Neural Nexus.`,
  },
  /** Xenomorph hover craft: hangs over its target and burns straight down. Lives in an Aerie nest. */
  overseer: {
    type: "overseer",
    kind: "unit",
    name: "Overseer",
    letter: "z",
    cost: 0,
    energy: 90,
    buildSeconds: 22,
    hp: 130,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(3.2),
    turnDegPerSec: 150,
    rangeTiles: OVERSEER_FIRE_TILES,
    sightTiles: t(10),
    cooldown: OVERSEER_PULSE_SECONDS,
    damage: OVERSEER_PULSE_DAMAGE,
    projectileSpeed: 0,
    ...UNARMED,
    caliber: 10,
    aircraft: true,
    hovers: true,
    wreckHp: 20,
    plasmaCell: { shots: 15, rechargeSeconds: 0.6 },
    blurb: `A floating hive eye: a spinning bell of chitin on a ring of humming vanes, glowing membrane round its rim and a cluster of emitters under its belly. It lifts straight out of the Aerie, never lands, and flies slowly. Sent at something on the ground it stops right over it and hangs there, burning straight down with a green laser pulse every ${OVERSEER_PULSE_SECONDS} seconds, and follows it as it moves. Every enemy soldier in the beam's spot burns; a tank's thin roof gives under it slowly, a building slower still. Each pulse draws on its energy cell: a full cell burns for about nine seconds, then the beam slows to the pace the cell regrows. It cannot touch a plane, and it hovers low: rifles, machine guns, and anti-air reach it. Needs a Neural Nexus.`,
  },
  /** Xenomorph spy drone: a tiny fly with one big sensor eye. Lives in an Aerie nest. */
  gnat: {
    type: "gnat",
    kind: "unit",
    name: "Gnat",
    letter: "q",
    cost: 0,
    energy: 15,
    buildSeconds: 6,
    hp: 22,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 6,
    moveTilesPerSec: paced(8),
    turnDegPerSec: 200,
    rangeTiles: 0,
    sightTiles: t(11),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    aircraft: true,
    recon: true,
    wreckHp: 6,
    blurb: `A spy fly the size of a man on buzzing wings, grown in the Aerie in a few seconds for a sliver of hive energy. No weapon: one great sensor eye. It flies as high as the Horten VII and sees almost as far from up there, ${(t(11) + HORTEN_FLYING_SIGHT_BONUS) / TILE_SUBDIV} tiles around it. Only anti-air guns and a fighter that climbs after it can reach it, but its shell is paper: one burst brings it down. It never lands and never tires. Send it at a point or a unit and it flies straight over and hangs there, following a unit it can see; on guard or patrol it keeps watching the area.`,
  },
  // ── The Bloom ───────────────────────────────────────────────────────────────────────────
  /** Bloom HQ on the move: a fat seed-pod on root legs. */
  sporepod: {
    type: "sporepod",
    kind: "unit",
    name: "Spore Pod",
    letter: "E",
    cost: 0,
    buildSeconds: 0,
    hp: 760,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 14,
    moveTilesPerSec: paced(1.35),
    turnDegPerSec: 120,
    turnInPlace: true,
    rangeTiles: 0,
    sightTiles: t(6),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    special: "deploy",
    blurb: "A fat, ribbed spore-pod walking on six root legs. Root it where the ground is level and it bursts open into a Brood Heart. Its wounds close by themselves, like every Bloom body's.",
  },
  broodheart: {
    type: "broodheart",
    kind: "building",
    name: "Brood Heart",
    letter: "H",
    cost: 0,
    buildSeconds: DEPLOY_SECONDS,
    hp: 2400,
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
    blurb: "A great heart half sunk in the marsh, beating under arched ribs. Every Bloom structure grows from its veins. Like all Bloom flesh it closes its wounds once the fire stops. Lose it and the Bloom withers.",
  },
  /** Bloom power: glowing bulbs on stalks. */
  lumenbulb: {
    type: "lumenbulb",
    kind: "building",
    name: "Lumen Bulb",
    letter: "L",
    cost: 450,
    buildSeconds: 11,
    hp: 600,
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
    blurb: "Three translucent bulbs on stalks, glowing amber with the marsh's rot. They power the Bloom as much as a Power Plant, a little cheaper, on a softer skin that regrows.",
  },
  /** Bloom scrap smelter: a maw that digests a scrap field. */
  gorger: {
    type: "gorger",
    kind: "building",
    name: "Gorger",
    letter: "G",
    cost: 1500,
    buildSeconds: 24,
    hp: 1100,
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
    blurb: `A toothed maw that chews a scrap field and swallows it into a swelling gullet. Stands on scrap like a Smelter: half its footprint on the field, ${SMELTER_CLEARANCE} open tiles from any other. It digests ${SMELTER_SCRAP_PER_SEC} scrap a second, ${DIAMOND_SCRAP_MUL}× on diamond scrap, slower on low power, and each one lets you hold up to ${SCRAP_CAP_PER_SMELTER} scrap.`,
  },
  /** Bloom infantry producer. */
  broodnest: {
    type: "broodnest",
    kind: "building",
    name: "Brood Nest",
    letter: "B",
    cost: 700,
    buildSeconds: 16,
    hp: 900,
    power: -25,
    tileW: t(2.5),
    tileH: t(2.5),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: "A mound of leathery egg-sacs under a chitin awning. It hatches the brood: the Spawnling, the Gobber, the Quillback, the Bloater, the Mender, and, with a Brain Coral standing, the Longspine. Brood take no stance orders and lose no limbs: a torn limb grows back.",
  },
  /** Bloom beast producer. */
  gestator: {
    type: "gestator",
    kind: "building",
    name: "Gestator",
    letter: "V",
    cost: 1000,
    buildSeconds: 20,
    hp: 1000,
    power: -35,
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
    blurb: "A long ribbed womb-hall around one huge translucent sac. It grows the beasts: the Skitter, the Goretusk, the Bile Mantis, the Bile Worm, the Sporemaw, and, with a Brain Coral standing, the Matriarch. The Bloom need no supply trucks: their spines, acid, and spores grow back in the gland.",
  },
  /** Bloom tech and radar. */
  braincoral: {
    type: "braincoral",
    kind: "building",
    name: "Brain Coral",
    letter: "X",
    cost: 4000,
    buildSeconds: 26,
    hp: 850,
    power: -70,
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
    blurb: "A folded dome of brain coral under a crown of glowing feelers: where the Bloom dreams. It unlocks the Longspine, the Matriarch, the Abyss Ray, the Leviathan, the Harpy, and the Bile Lance, and its feelers light the radar panel like a Radar Station.",
  },
  /** Bloom shipyard: stands on open water. */
  tidewomb: {
    type: "tidewomb",
    kind: "building",
    name: "Tide Womb",
    letter: "W",
    cost: 1100,
    buildSeconds: 20,
    hp: 950,
    power: -35,
    tileW: t(2.5),
    tileH: t(2.5),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    onWater: true,
    blurb: "A ring of fleshy lily-pads around an amber pool, tendrils trailing in the current. It only grows on open water. It spawns the deep brood: the Drift Jelly, the Spineback, the Brood Barge, and, with a Brain Coral standing, the Abyss Ray and the Leviathan.",
  },
  /** Bloom airfield: a bone spine and four sinew nests. Same footprint and pads as the Airfield. */
  roost: {
    type: "roost",
    kind: "building",
    name: "Roost",
    letter: "R",
    cost: 2600,
    buildSeconds: 26,
    hp: 1050,
    power: -45,
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
    blurb: `A long arching bone spine with four cup nests of woven sinew. It grows the skybrood: the Watcher Moth, the Razorwing, the Gasbag, the Drifter, and, with a Brain Coral standing, the Harpy, and keeps up to ${AIRFIELD_PADS} of them. They come home to their nests to feed and heal.`,
  },
  /** Bloom anti-infantry gun: crewless, runs on base power. */
  thornspitter: {
    type: "thornspitter",
    kind: "building",
    name: "Thorn Spitter",
    letter: "s",
    cost: 450,
    buildSeconds: 9,
    hp: 450,
    power: -15,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 160,
    rangeTiles: t(11),
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: TICK_DT,
    damage: MG42.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: MG42.penetration,
    caliber: MG42.caliber,
    spreadDeg: 4,
    shotsPerTick: MG42.shotsPerTick,
    poweredGun: true,
    capturable: false,
    blurb: "A bulb on a knotted root with a fan of quills round a puckered mouth. Nobody works it: it turns all the way round and spits quills at soldiers at an MG42's pace, a little short of a Spine Turret's reach. Tank plate turns the quills, and they do not bring a building down. The quills grow back, so it never runs dry. Short on power, it falls silent. Cannot move.",
  },
  /** Bloom anti-armour gun: crewless, runs on base power. */
  bilelance: {
    type: "bilelance",
    kind: "building",
    name: "Bile Lance",
    letter: "q",
    cost: 1500,
    buildSeconds: 14,
    hp: 750,
    power: -30,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 55,
    rangeTiles: t(14),
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 3.2,
    damage: PULSE_SPIRE_SHELLS.ap.damage,
    projectileSpeed: TANK_SHELL_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: PULSE_SPIRE_SHELLS.ap.penetration,
    caliber: PULSE_SPIRE_SHELLS.ap.caliber,
    spreadDeg: PULSE_SPIRE_SHELLS.ap.spreadDeg,
    ammo: { ap: PULSE_SPIRE_RACK },
    defaultShell: "ap",
    shells: PULSE_SPIRE_SHELLS,
    armorFirst: true,
    poweredGun: true,
    capturable: false,
    blurb: "A tall curled stalk planted like a scorpion's tail, an acid gland at its tip. Nobody works it: it swings round and spits a bolt of acid that eats through a Tiger's front plate. Tanks first. The gland refills by itself. Short on power, it falls silent. Needs a Brain Coral. Cannot move.",
  },
  /** Bloom anti-air: a mushroom that bursts spore clouds among planes. */
  puffcap: {
    type: "puffcap",
    kind: "building",
    name: "Puffcap",
    letter: "p",
    cost: 1200,
    buildSeconds: 14,
    hp: 600,
    power: -20,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    turretTurnDegPerSec: 140,
    rangeTiles: FLAK_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0.5,
    damage: FLAK_BURST_DAMAGE,
    projectileSpeed: FLAK_SHELL_SPEED,
    armorFront: 0,
    armorSide: 0,
    armorRear: 0,
    penetration: FLAK_SHELLS.he.penetration,
    caliber: FLAK_SHELLS.he.caliber,
    spreadDeg: FLAK_SHELLS.he.spreadDeg,
    ammo: { he: FLAK_RACK },
    defaultShell: "he",
    shells: FLAK_SHELLS,
    antiAir: true,
    airFirst: true,
    airOnly: true,
    poweredGun: true,
    capturable: false,
    blurb: "A squat mushroom with a tilting cap. Nobody works it: it turns to a plane and bursts caustic spore clouds round it, like a Flak 37's shells. It fires only at what flies. The spores grow back, so it never runs dry. Short on power, it falls silent. Cannot move.",
  },
  /** Bloom watch post: a stalk with one huge eye and a pouch for two brood. */
  eyestalk: {
    type: "eyestalk",
    kind: "building",
    name: "Eye Stalk",
    letter: "e",
    cost: 700,
    buildSeconds: 12,
    hp: 1100,
    power: 0,
    tileW: t(1),
    tileH: t(1),
    radius: 0,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    garrisonCap: 2,
    garrisonHpMul: TOWER_GARRISON_HP_MUL,
    garrisonWoundMul: TOWER_WOUND_MUL,
    garrisonBulletMul: SLIT_BULLET_WOUND_MUL,
    garrisonWindows: 2,
    garrisonFloors: HOCHSTAND_FLOORS,
    garrisonSightBonus: TOWER_SIGHT_BONUS,
    garrisonReachBonus: TOWER_REACH_BONUS,
    garrisonEye: HOCHSTAND_EYE_HEIGHT,
    garrisonFullArms: true,
    garrisonTypes: BROOD_GARRISON,
    blurb: "A tall fleshy stalk with one great amber eye and a hollow pouch under it. Two brood in the pouch see as far as a Watch Tower's cab and fire from it, their reach a little longer. The pouch takes part of every hit.",
  },
  /** Bloom bunker: the hollowed carapace of a giant beetle. */
  husk: {
    type: "husk",
    kind: "building",
    name: "Husk Burrow",
    letter: "u",
    cost: 550,
    buildSeconds: 15,
    hp: 2600,
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
    garrisonBulletMul: SLIT_BULLET_WOUND_MUL,
    garrisonWindows: 2,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonFullArms: true,
    garrisonTypes: BROOD_GARRISON,
    capturable: false,
    coverHeight: BUNKER_COVER_HEIGHT,
    blurb: `The hollowed carapace of a giant beetle, half buried, with firing slits between its plates. Holds ${BUNKER_GARRISON_CAP} brood. The shell takes most of every hit and every brood weapon fires from the slits. Low, so it adds no sight or reach. It cannot be captured, only broken, and it regrows between fights.`,
  },
  /** Bloom swarm melee: cheap, fast, two hooked claws. */
  spawnling: {
    type: "spawnling",
    kind: "unit",
    name: "Spawnling",
    letter: "n",
    cost: 150,
    buildSeconds: 4,
    hp: 45,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 6,
    moveTilesPerSec: paced(3.2 * INFANTRY_PACE),
    turnDegPerSec: 1400,
    rangeTiles: SIMUNIT_REACH_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: DAGGERS.cooldown,
    damage: DAGGERS.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: DAGGERS.penetration,
    caliber: DAGGERS.caliber,
    spreadDeg: DAGGERS.spreadDeg,
    blurb: "A dog-sized horror that is mostly mouth and two hooked claws. Very fast and very cheap: it runs down a soldier and opens him in a slash or two, but a few rifle rounds put it down. It barely scratches plate. Hatched in a few seconds; the Matriarch lays them as she walks.",
  },
  /** Bloom rifleman: spits acid from a throat sac. */
  gobber: {
    type: "gobber",
    kind: "unit",
    name: "Gobber",
    letter: "i",
    cost: 300,
    buildSeconds: 7,
    hp: 60,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(2.1 * INFANTRY_PACE),
    turnDegPerSec: 1200,
    rangeTiles: RIFLE_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: RIFLE.cooldown,
    damage: RIFLE.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: RIFLE.penetration,
    caliber: RIFLE.caliber,
    spreadDeg: RIFLE.spreadDeg,
    blurb: "The Bloom's line soldier: a lanky thing with a throat sac that swells and spits a glob of acid at a rifle's reach and pace, a few globs and then a pause while the sac refills. A little tougher than a rifleman, and its wounds close by themselves.",
  },
  /** Bloom gunner: a stream of quills from a shoulder hump. */
  quillback: {
    type: "quillback",
    kind: "unit",
    name: "Quillback",
    letter: "k",
    cost: 650,
    buildSeconds: 11,
    hp: 110,
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
    blurb: "Squat and broad, its back a bed of quills. A hump on its shoulder flexes and throws them in a stream that mows soldiers down, then it has to rest while the muscle cools. A round sometimes bites a Walker or a truck; tank plate turns it. The quills grow back, so it never runs dry. Slow on its feet.",
  },
  /** Bloom anti-armour: hurls acid sacs. */
  bloater: {
    type: "bloater",
    kind: "unit",
    name: "Bloater",
    letter: "b",
    cost: 750,
    buildSeconds: 12,
    hp: 120,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.35 * INFANTRY_PACE),
    turnDegPerSec: 900,
    rangeTiles: LAUNCHER_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: LAUNCHER.cooldown,
    damage: LAUNCHER.damage,
    projectileSpeed: TITAN_ROCKET_SPEED,
    ...UNARMED,
    penetration: LAUNCHER.penetration,
    caliber: LAUNCHER.caliber,
    spreadDeg: LAUNCHER.spreadDeg,
    blurb: "Bloated and waddling, it carries glowing acid sacs on its back and hurls them overhand like a Rocketer's rocket: loose at full reach, tighter close in, a burst of acid that eats into a tank's plate and spatters soldiers round it. It grows the next sac on its back. Slow and fat: a good target.",
  },
  /** Bloom sniper: one long bone spine at great reach. */
  longspine: {
    type: "longspine",
    kind: "unit",
    name: "Longspine",
    letter: "l",
    cost: 900,
    buildSeconds: 12,
    hp: 50,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(1.9 * INFANTRY_PACE),
    turnDegPerSec: 1000,
    rangeTiles: SCOPED_RANGE_TILES,
    sightTiles: INFANTRY_SIGHT_TILES,
    sightBonusTiles: t(3),
    cooldown: SCOPED.cooldown,
    damage: SCOPED.damage,
    projectileSpeed: SMALL_ARMS_SPEED,
    ...UNARMED,
    penetration: SCOPED.penetration,
    caliber: SCOPED.caliber,
    spreadDeg: SCOPED.spreadDeg,
    blurb: "Gaunt and very tall, with a ring of small eyes and one long arm that is a bone launcher. It drives a single spine through a soldier from as far as a sniper reaches, and sees nearly as far. Paper-thin: keep it behind the line. Needs a Brain Coral.",
  },
  /** Bloom healer: knits flesh with amber threads. */
  mender: {
    type: "mender",
    kind: "unit",
    name: "Mender",
    letter: "m",
    cost: 450,
    buildSeconds: 8,
    hp: 45,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(2.1 * INFANTRY_PACE),
    turnDegPerSec: 1600,
    rangeTiles: 0,
    sightTiles: INFANTRY_SIGHT_TILES,
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    blurb: "Delicate and translucent, trailing long feelers spun with amber thread. No weapon. It goes to wounded brood nearby and knits them closed far faster than they regrow alone. Its own wounds close by themselves.",
  },
  /** Bloom fast raider: a six-legged tick with a quill pod. */
  skitter: {
    type: "skitter",
    kind: "unit",
    name: "Skitter",
    letter: "t",
    cost: 400,
    buildSeconds: 10,
    hp: 75,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 10,
    moveTilesPerSec: paced(2.4),
    turnDegPerSec: 200,
    rangeTiles: t(9),
    sightTiles: t(10),
    cooldown: TICK_DT,
    damage: 7,
    projectileSpeed: SMALL_ARMS_SPEED,
    turnInPlace: true,
    gunArcDeg: 25,
    armorFront: 22,
    armorSide: 14,
    armorRear: 10,
    penetration: 10,
    caliber: 10,
    spreadDeg: 4,
    shotsPerTick: 2,
    blurb: "A low six-legged tick that runs faster than any hull. The quill pod on its back is fixed: it turns its whole body to fire, a stream of quills that cuts down soldiers and nicks soft vehicles. Tank plate turns them, and they do not bring a building down. Thin shell. Dead, it melts into the mud and leaves no wreck.",
  },
  /** Bloom melee charger: a rhino-beetle that gores. */
  goretusk: {
    type: "goretusk",
    kind: "unit",
    name: "Goretusk",
    letter: "r",
    cost: 900,
    buildSeconds: 15,
    hp: 210,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 13,
    moveTilesPerSec: paced(1.75),
    turnDegPerSec: 140,
    rangeTiles: LURKER_REACH_TILES,
    sightTiles: t(8),
    cooldown: LURKER_BITE_SECONDS,
    damage: LURKER_BITE_DAMAGE,
    projectileSpeed: 0,
    turnInPlace: true,
    armorFront: 85,
    armorSide: 40,
    armorRear: 24,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    bite: true,
    blurb: "A rhino-beetle the size of a tank, with a plated head shield and two great tusks. No gun: it charges and gores what it reaches. One thrust kills a soldier; a hull's plate gives under the tusks, a wall more slowly. Its head shield is as thick as a Tiger's front, its flanks are not. Dead, it melts into the mud and leaves no wreck.",
  },
  /** Bloom main battle beast: a mantis torso on a six-legged abdomen. */
  mantis: {
    type: "mantis",
    kind: "unit",
    name: "Bile Mantis",
    letter: "y",
    cost: 700,
    buildSeconds: 15,
    hp: 140,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(1.55),
    turnDegPerSec: 110,
    rangeTiles: t(12),
    sightTiles: t(8),
    cooldown: 6,
    damage: 52,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    turretTurnDegPerSec: 220,
    armorFront: 60,
    armorSide: 28,
    armorRear: 16,
    penetration: 90,
    caliber: 75,
    spreadDeg: 3,
    ammo: { ap: 12, he: 6 },
    defaultShell: "ap",
    blurb: "An upright mantis torso on a six-legged abdomen, an acid gland cannon between its raptor arms. The torso turns on its own like a turret. It spits a piercing bolt about as hard as a Tiger's shell, or a splash of acid for soldiers. Thinner than a Tiger, quicker on its legs, and it heals between fights. Dead, it melts into the mud and leaves no wreck.",
  },
  /** Bloom acid worm: sprays acid from its ring mouth and burrows. */
  bileworm: {
    type: "bileworm",
    kind: "unit",
    name: "Bile Worm",
    letter: "w",
    cost: 650,
    buildSeconds: 13,
    hp: 130,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(1.6),
    turnDegPerSec: 130,
    rangeTiles: t(7),
    sightTiles: t(8),
    cooldown: 1.2,
    damage: 14,
    projectileSpeed: SMALL_ARMS_SPEED,
    turnInPlace: true,
    gunArcDeg: 30,
    armorFront: 40,
    armorSide: 26,
    armorRear: 16,
    penetration: 22,
    caliber: 15,
    spreadDeg: 3,
    hullFlamer: true,
    mgAmmo: HULL_FLAMER_FUEL,
    blurb: "A segmented worm with a ring of teeth for a mouth. It spits acid at what it faces, and up close its mouth sprays a jet of burning acid that eats every soldier in its path, friend too. Burrow digs it in where it stands: under the mud no enemy sees it or can pick it, but it neither moves nor fires; it rises ready to spray. Dead, it melts into the mud and leaves no wreck.",
  },
  /** Bloom artillery: lobs volleys of spore bombs. */
  sporemaw: {
    type: "sporemaw",
    kind: "unit",
    name: "Sporemaw",
    letter: "o",
    cost: 1800,
    buildSeconds: 20,
    hp: 120,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(1.4),
    turnDegPerSec: 100,
    rangeTiles: NEBELWERFER_RANGE_TILES,
    sightTiles: t(6),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    turnInPlace: true,
    gunArcDeg: 6,
    armorFront: 26,
    armorSide: 16,
    armorRear: 10,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    rockets: true,
    rocketAmmo: NEBELWERFER_ROCKET_AMMO,
    rocketRack: NEBELWERFER_ROCKET,
    blurb: "A toad-like beast with a vast sac on its back. It squats, turns to face the target, and vents a volley of spore bombs high over the line: the longest reach on the field, as far as the Nebelwerfer. They scatter wide at full reach and shred soldiers in the open; plate only dents. It will not fire close in. The sac refills by itself. Thin skin, short eyes: keep it behind the line.",
  },
  /** Bloom heavy: eight legs, a sac cannon, and a brood of Spawnlings. */
  matriarch: {
    type: "matriarch",
    kind: "unit",
    name: "Matriarch",
    letter: "M",
    cost: 3800,
    buildSeconds: 26,
    hp: 320,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 20,
    moveTilesPerSec: paced(0.85),
    turnDegPerSec: 55,
    rangeTiles: t(14),
    sightTiles: t(9),
    cooldown: 7,
    damage: APOCALYPSE_SHELLS.ap.damage,
    projectileSpeed: TANK_SHELL_SPEED,
    turnInPlace: true,
    turretTurnDegPerSec: 110,
    armorFront: 100,
    armorSide: 60,
    armorRear: 35,
    penetration: APOCALYPSE_SHELLS.ap.penetration,
    caliber: APOCALYPSE_SHELLS.ap.caliber,
    spreadDeg: APOCALYPSE_SHELLS.ap.spreadDeg,
    shells: APOCALYPSE_SHELLS,
    ammo: { ap: 14, he: 8 },
    defaultShell: "ap",
    blurb: `The Bloom's queen of the field: eight legs, a sagging abdomen heavy with eggs, and a sac cannon on her back that throws acid through a Tiger's front plate. As she walks she lays a Spawnling every ${MATRIARCH_LAY_SECONDS} seconds, up to ${MATRIARCH_BROOD} of her own alive at once. Slow, huge, and she heals between fights. Needs a Brain Coral.`,
  },
  /** Bloom cheap naval stinger: a floating jellyfish. */
  driftjelly: {
    type: "driftjelly",
    kind: "unit",
    name: "Drift Jelly",
    letter: "j",
    cost: 350,
    buildSeconds: 8,
    hp: 60,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 10,
    moveTilesPerSec: paced(2.1),
    turnDegPerSec: 200,
    turnInPlace: true,
    rangeTiles: LURKER_REACH_TILES,
    sightTiles: t(12),
    cooldown: LURKER_BITE_SECONDS,
    damage: LURKER_BITE_DAMAGE,
    projectileSpeed: 0,
    armorFront: 6,
    armorSide: 6,
    armorRear: 6,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    naval: true,
    bite: true,
    blurb: "A jellyfish bell drifting on the surface, tentacles trailing. No gun: it stings what it reaches, a swimmer or a soldier at the water's edge dead at once, a boat's hull torn. Cheap and soft. Water only. Dead, it dissolves and leaves no hulk.",
  },
  /** Bloom attack boat: a finned fish with a dorsal quill battery. */
  spineback: {
    type: "spineback",
    kind: "unit",
    name: "Spineback",
    letter: "h",
    cost: 500,
    buildSeconds: 10,
    hp: 80,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(2.9),
    turnDegPerSec: 130,
    noReverse: true,
    turnInPlace: true,
    turretTurnDegPerSec: 260,
    rangeTiles: GUNBOAT_RANGE_TILES,
    sightTiles: t(18),
    cooldown: 0.45,
    damage: 12,
    projectileSpeed: SMALL_ARMS_SPEED,
    armorFront: 12,
    armorSide: 8,
    armorRear: 6,
    penetration: 28,
    caliber: 20,
    spreadDeg: 2.5,
    naval: true,
    blurb: "A finned fish skimming the surface, a battery of quills along its dorsal ridge. It fires on boats and on anything within reach of the bank, as hard as the Attack Boat and a touch faster on the water. Thin skin: an anti-tank rifle or a tank shell goes straight through. Water only. Dead, it dissolves and leaves no hulk.",
  },
  /** Bloom submarine: a manta that dives and looses acid eels. */
  abyssray: {
    type: "abyssray",
    kind: "unit",
    name: "Abyss Ray",
    letter: "a",
    cost: 1000,
    buildSeconds: 16,
    hp: 120,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 14.4,
    moveTilesPerSec: paced(1.8),
    turnDegPerSec: 90,
    noReverse: true,
    turnInPlace: true,
    gunArcDeg: 20,
    rangeTiles: TORPEDO_RANGE_TILES,
    sightTiles: t(16),
    cooldown: 7,
    damage: TORPEDO.damage,
    projectileSpeed: TORPEDO_SPEED,
    armorFront: 18,
    armorSide: 18,
    armorRear: 14,
    penetration: TORPEDO.penetration,
    caliber: TORPEDO.caliber,
    spreadDeg: TORPEDO.spreadDeg,
    naval: true,
    torpedoes: true,
    submerges: true,
    belt: SUB_TORPEDOES,
    blurb: `A wide manta with glowing spots along its wings. It dives and surfaces like a Submarine and looses living acid eels that swim at the waterline like torpedoes. Submerged, the enemy sees it only on a Destroyer's sonar, or for ${SUB_REVEAL_SECONDS} seconds after it fires. It grows new eels in its belly and never runs out. Needs a Brain Coral. Dead, it sinks and leaves no hulk.`,
  },
  /** Bloom capital ship: a turtle-whale with a gland cannon. */
  leviathan: {
    type: "leviathan",
    kind: "unit",
    name: "Leviathan",
    letter: "v",
    cost: 4200,
    buildSeconds: 30,
    hp: 1400,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 30,
    moveTilesPerSec: paced(1.3),
    turnDegPerSec: 30,
    noReverse: true,
    turnInPlace: true,
    turretTurnDegPerSec: 60,
    rangeTiles: t(17),
    sightTiles: t(18),
    cooldown: 4.5,
    damage: 75,
    projectileSpeed: TANK_SHELL_SPEED,
    armorFront: 70,
    armorSide: 60,
    armorRear: 45,
    penetration: 130,
    caliber: 128,
    spreadDeg: 2.5,
    naval: true,
    blurb: "A turtle-whale as long as a destroyer, its mossy shell plated like a bunker. A gland cannon rises from the shell and throws a bolt of acid far out over the water and onto the shore, through a Tiger's front plate. Slow to turn. It heals between fights like every Bloom body. Needs a Brain Coral. Water only. Dead, it sinks and leaves no hulk.",
  },
  /** Bloom transport: a floating raft of flesh with a pouch hold. */
  broodbarge: {
    type: "broodbarge",
    kind: "unit",
    name: "Brood Barge",
    letter: "g",
    cost: 1500,
    buildSeconds: 20,
    hp: 520,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 26,
    moveTilesPerSec: paced(1.6),
    turnDegPerSec: 30,
    noReverse: true,
    turnInPlace: true,
    rangeTiles: 0,
    sightTiles: t(16),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    armorFront: 60,
    armorSide: 50,
    armorRear: 40,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    naval: true,
    tankDeck: true,
    garrisonCap: 28,
    garrisonHpMul: BUNKER_GARRISON_HP_MUL,
    garrisonWoundMul: BUNKER_WOUND_MUL,
    garrisonWindows: 2,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonFullArms: true,
    garrisonDiesWithHost: true,
    blurb: "A broad raft of floating flesh with a deep pouch hold. Brood and beasts board over its lip with its edge on the shore, and Unload spills them onto the beach. The first two brood aboard who can fight do so from the rim. If it dies, everything in the pouch drowns with it. Water only. Dead, it sinks and leaves no hulk.",
  },
  /** Bloom recon flyer: a great moth with eyes on its wings. */
  moth: {
    type: "moth",
    kind: "unit",
    name: "Watcher Moth",
    letter: "q",
    cost: 400,
    buildSeconds: 7,
    hp: 26,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 7,
    moveTilesPerSec: paced(7.5),
    turnDegPerSec: 200,
    rangeTiles: 0,
    sightTiles: t(11),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    aircraft: true,
    recon: true,
    wreckHp: 6,
    blurb: `A huge pale moth whose wing eye-spots really are eyes. No weapon. It flies as high as the Horten VII and watches ${(t(11) + HORTEN_FLYING_SIGHT_BONUS) / TILE_SUBDIV} tiles around it. Only anti-air and a climbing fighter reach it, and one burst brings it down. It holds ${HORTEN_FUEL_SECONDS} seconds of flight, then comes home to its nest to feed.`,
  },
  /** Bloom fighter: bladed membrane wings and quill guns. */
  razorwing: {
    type: "razorwing",
    kind: "unit",
    name: "Razorwing",
    letter: "z",
    cost: 850,
    buildSeconds: 21,
    hp: 88,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(7),
    turnDegPerSec: 170,
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
    fighter: true,
    wreckHp: 20,
    blurb: "A swift-like flyer on bladed membrane wings, a quill gun under each. On every pass it lays two lines of quills through the target, down through a tank's thin roof, and it hunts enemy planes the same way. The fastest and tightest-turning fighter in the sky, and the lightest. Its quills grow back; it comes home to its nest to feed and heal.",
  },
  /** Bloom bomber: a floating bladder with an acid bomb sac. */
  gasbag: {
    type: "gasbag",
    kind: "unit",
    name: "Gasbag",
    letter: "x",
    cost: 1700,
    buildSeconds: 20,
    hp: 150,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 13,
    moveTilesPerSec: paced(4.2),
    turnDegPerSec: 100,
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
    wreckHp: 26,
    blurb: "A floating gas bladder on small flapping fins, a glowing acid bomb sac dangling under it and quill pores for soft targets. It drops the sac on every pass and grows another, so it never goes home to rearm. Slower than a Stuka and thicker-skinned. Only rifles, machine guns, and anti-air reach it in the air. It comes home to its nest to feed and heal.",
  },
  /** Bloom hover: a sky-jelly that drips acid on what it hangs over. */
  drifter: {
    type: "drifter",
    kind: "unit",
    name: "Drifter",
    letter: "d",
    cost: 1600,
    buildSeconds: 20,
    hp: 140,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(3),
    turnDegPerSec: 150,
    rangeTiles: OVERSEER_FIRE_TILES,
    sightTiles: t(10),
    cooldown: OVERSEER_PULSE_SECONDS,
    damage: OVERSEER_PULSE_DAMAGE,
    projectileSpeed: 0,
    ...UNARMED,
    caliber: 10,
    aircraft: true,
    hovers: true,
    wreckHp: 20,
    blurb: "A sky-jelly: a glowing bell trailing long stinging tendrils. It lifts straight off its nest, drifts slowly to what it is sent at, and hangs over it, dripping burning acid straight down. Every enemy soldier under it burns; a tank's thin roof gives slowly, a building slower. It follows its prey. It cannot touch a plane, and it hangs low: rifles, machine guns, and anti-air reach it. It sets down on its nest to feed and heal.",
  },
  /** Bloom torpedo bomber: a sea-wyrm that drops a living eel. */
  harpy: {
    type: "harpy",
    kind: "unit",
    name: "Harpy",
    letter: "y",
    cost: 2200,
    buildSeconds: 24,
    hp: 170,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 14,
    moveTilesPerSec: paced(4.8),
    turnDegPerSec: 80,
    rangeTiles: TORPEDO_RANGE_TILES,
    sightTiles: t(14),
    cooldown: 0,
    damage: TORPEDO.damage,
    projectileSpeed: TORPEDO_SPEED,
    ...UNARMED,
    penetration: TORPEDO.penetration,
    caliber: TORPEDO.caliber,
    spreadDeg: TORPEDO.spreadDeg,
    aircraft: true,
    airTorpedo: true,
    wreckHp: 34,
    blurb: `A long-necked sea-wyrm on leathery wings, a living acid eel clutched in its talons. It attacks only what is in the water, and only over water: it swoops low and lets the eel go ${TORPEDO_RANGE_TILES / TILE_SUBDIV} tiles off its beak, where it swims its full length like a torpedo and strikes the first thing in its path. It grows a new eel on the wing and never goes home to rearm. Low on the run in, rifles and anti-air reach it easily. Needs a Brain Coral.`,
  },
  titan: {
    type: "titan",
    kind: "unit",
    name: "Titan",
    letter: "X",
    cost: 8000,
    buildSeconds: 18,
    hp: 400,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 15,
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
    wreckHp: 45,
    special: "deploy",
    wades: true,
    wadeSpeed: TITAN_WADE_SPEED,
    rockets: true,
    rocketAmmo: TITAN_ROCKET_AMMO,
    bracedHpMul: TITAN_BRACED_HP_MUL,
    shellResist: TITAN_SHELL_RESIST,
    blurb: "Heavy assault walker, built to take a beating: tank shells do it half harm, and no single shell kills it outright. The Tiger's gun on a traversing torso, loaded with armor-piercing shot only, and a four-rocket pod on the shoulders that ripples its salvo one rocket after another. The pods are fixed to the torso: they fire only the way the torso faces, so the Titan turns to bring them to bear as it turns for its gun, and they take any target on that bearing. Sixteen rockets in the rack; a supply truck refills them. Rockets scatter wide at full reach and draw in as the target closes. They shred infantry, dent tanks, usually break a track from the side or rear, and can burst beside a plane in the air. Switch the pods off to save them. Wades through water with only its torso showing: the main gun stays silent there, the rockets still fire. Deploy plants the outriggers: it cannot move, and its hit points grow by three-quarters until it packs up. It strides straight through woods, felling every tree it brushes. A big lamp on the torso lights the ground far ahead at night; Rotate light swings only the lamp. Leg jets lift it for a short hop over anything, and the lamp tips down to light one wide pool of ground ahead of it: aloft the gun is stowed and only the pods fire, and only anti-air weapons reach it; the burners take a long while to recover. Its reactor makes it a bomb: destroyed, it goes up in a small nuclear blast that wrecks everything close by, friend or foe. Shot down in the air, it drops straight down and goes up on the ground. Only one at a time: while yours stands, or one is in a queue, another cannot be ordered.",
  },
  mammoth: {
    type: "mammoth",
    kind: "unit",
    name: "Mammoth",
    letter: "m",
    cost: 1500,
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
    wreckHp: 60,
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
    blurb: `Armored battle platform on four legs. Very slow, very thick plate on every face, and in water it is thirty percent slower, sunk to the waist so only the body shows. Its own weapon is a twin machine gun under the cab that swings only a little either side of the nose, and falls silent in water. It carries ${MAMMOTH_GARRISON_CAP} of the infantry a Bunker takes, and every one of them fires out of the slits along its flanks, even while it wades. Force attack on the hull aims every soldier inside who can reach that point; they stay aboard. Nothing reaches them while the hull holds — but if it is destroyed, everyone inside dies with it. Nothing throws a track. A hit in the rear can still wreck the engine and stop it. At night a lamp on the nose and one on each flank light the ground out to its daylight sight. The flank lamps drift slowly through a small arc. A launcher on the rear deck holds ${MAMMOTH_MINE_PACKS} packs of mines: Deploy mines, then click the ground inside the ring it shows, and it lobs a canister that bursts into a field of ${CLUSTER_MINES} mines — the same field a BV 222 drops, live under friend and foe alike. Click farther out and it walks until the point is in reach. A supply truck or a crate refills the packs.`,
  },
  nebelwerfer: {
    type: "nebelwerfer",
    kind: "unit",
    name: "Nebelwerfer",
    letter: "n",
    cost: 2000,
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
    wreckHp: 18,
    rockets: true,
    rocketAmmo: NEBELWERFER_ROCKET_AMMO,
    rocketRack: NEBELWERFER_ROCKET,
    blurb: "Rocket artillery on an armored truck. Twelve tubes on a traversing frame, emptied in about a second, one to three rockets at a time. The rockets fly fast on a high arc, over your own troops — the longest reach on the field. Force attack sends them anywhere in that reach, even into ground the side cannot see, and they fly over tanks and trees on the way. It will not fire inside four tiles. Its own eyes are short. Aimed at a target, a tank or tree in the path still takes the rocket. It must stop and swing the frame onto the target before it fires. Rockets scatter wide at full reach and draw in as the target closes: a salvo blankets an area and shreds infantry in the open. Armor only dents, but a side or rear hit usually breaks a tank's tracks. Five salvos in the rack; a supply truck refills it. Switch the tubes off to hold fire. Thin plate — keep it behind the line.",
  },
  artillery: {
    type: "artillery",
    kind: "unit",
    name: "Artillery",
    letter: "g",
    cost: 2000,
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
    cost: 400,
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
    wreckHp: 14,
    blurb: "Light truck. Tops up tank racks, coaxial belts, and the Walker's backpack, and slowly scrounges its cargo back on its own — a Machine Shop refills it fast. Right-click a mine, yours or an ally's, and it spends a few seconds disabling it; the mine comes up as scrap and does not go off under the truck while it works. Two seats. The factory driver stays at the wheel. A bullet in the front plate can kill the driver and leave the truck for anyone. A replacement driver can get out. The passenger fires from the bed: rifle, handgun, machine gun, scoped rifle, anti-tank rifle, rocket launcher, flamethrower, or a Jump Jet's assault rifle. A mortar and a cyborg gatling stay slung. Hit-point bars for the soldiers aboard sit beside the truck. Soldiers inside are a little harder to wound, and more so from the side or rear.",
  },
  /** Motor gunboat. Water only. */
  gunboat: {
    type: "gunboat",
    kind: "unit",
    name: "Attack Boat",
    letter: "B",
    cost: 450,
    buildSeconds: 10,
    hp: 70,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 11,
    moveTilesPerSec: paced(2.6),
    turnDegPerSec: 110,
    noReverse: true,
    turnInPlace: true,
    turretTurnDegPerSec: 240,
    rangeTiles: GUNBOAT_RANGE_TILES,
    sightTiles: t(18),
    cooldown: 0.45,
    damage: 12,
    projectileSpeed: SMALL_ARMS_SPEED,
    armorFront: 12,
    armorSide: 8,
    armorRear: 6,
    penetration: 28,
    caliber: 20,
    spreadDeg: 2.5,
    naval: true,
    leavesWreck: true,
    wreckHp: 14,
    blurb: "Fast motor gunboat with a 20mm cannon on the foredeck. Water only: it never comes ashore. It fires on boats and on anything within reach of the bank, and its gun lays up a raised shore. Thin plating — an anti-tank rifle or a tank shell goes straight through. Torpedoes are the danger out on the water. Sunk, it leaves a hulk on the bottom that blocks the water until it is shot apart.",
  },
  /** The supply truck's work on the water: it refills ships. Water only. */
  supplyboat: {
    type: "supplyboat",
    kind: "unit",
    name: "Supply Boat",
    letter: "c",
    cost: 450,
    buildSeconds: 10,
    hp: 64,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 12,
    moveTilesPerSec: paced(2.15),
    turnDegPerSec: 100,
    noReverse: true,
    turnInPlace: true,
    rangeTiles: 0,
    sightTiles: t(12),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    armorFront: 10,
    armorSide: 8,
    armorRear: 6,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    naval: true,
    blurb: "Unarmed cargo launch, the supply truck's work on the water. It tops up a Battle Ship's barrels and CIWS belts, and slowly scrounges its cargo back on its own — a Marine Base refills it fast. An idle boat goes to ships nearby that are short of ammo. Water only: it never comes ashore, and it serves only what floats. Thin plating.",
  },
  /** Coastal submarine. Water only, runs submerged. */
  submarine: {
    type: "submarine",
    kind: "unit",
    name: "Submarine",
    letter: "U",
    cost: 900,
    buildSeconds: 16,
    hp: 110,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 14.4,
    moveTilesPerSec: paced(1.6),
    turnDegPerSec: 80,
    noReverse: true,
    turnInPlace: true,
    gunArcDeg: 20,
    rangeTiles: TORPEDO_RANGE_TILES,
    sightTiles: t(16),
    cooldown: 7,
    damage: TORPEDO.damage,
    projectileSpeed: TORPEDO_SPEED,
    armorFront: 20,
    armorSide: 20,
    armorRear: 16,
    penetration: TORPEDO.penetration,
    caliber: TORPEDO.caliber,
    spreadDeg: TORPEDO.spreadDeg,
    naval: true,
    torpedoes: true,
    submerges: true,
    leavesWreck: true,
    wreckHp: 40,
    belt: SUB_TORPEDOES,
    blurb: `Coastal submarine. Water only. It leaves the slip surfaced; Dive and Surface set its depth. Submerged, the enemy sees it only while one of their Destroyers hears it on sonar, or for ${SUB_REVEAL_SECONDS} seconds after it fires. Below, it runs under boats on the surface; neither gives way. Below, it sees only ${SUB_SUBMERGED_SIGHT_TILES / TILE_SUBDIV} tiles through its periscope, and its torpedoes find only another submarine that is down too — it must surface to strike a boat, a swimmer, or a Marine Base. Ordered to attack or force-attack one, it closes in below and surfaces once in range. It holds ${SUB_DIVE_SECONDS} seconds of air below; when that runs out it surfaces and stays up until its air is back. Its bow tubes fire slow torpedoes that run in plain sight at the waterline — any gun can shoot one apart before it arrives. A torpedo dies where the water ends. Turn the bow to aim. It carries ${SUB_TORPEDOES} torpedoes; beside a Marine Base it loads one every ${SUB_REARM_SECONDS} seconds. Sunk, it leaves a hulk on the bottom, in plain sight, that blocks the water until it is shot apart.`,
  },
  /** A running torpedo: the body guns can shoot. It rides with its warhead round. */
  torpedo: {
    type: "torpedo",
    kind: "unit",
    name: "Torpedo",
    letter: "t",
    cost: 0,
    buildSeconds: 0,
    hp: TORPEDO_HP,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 5,
    moveTilesPerSec: 0,
    turnDegPerSec: 0,
    rangeTiles: 0,
    sightTiles: t(1),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    naval: true,
    torpedoBody: true,
    blurb: "A submarine's torpedo running at the waterline. It strikes the first thing in the water across its path. Slow and in plain sight: shoot it apart before it arrives.",
  },
  /** Fast battleship, after the Iowa class (USS Wisconsin, BB-64). Water only. */
  battleship: {
    type: "battleship",
    kind: "unit",
    name: "Battle Ship",
    letter: "s",
    cost: 8000,
    buildSeconds: 32,
    hp: 9000,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 48,
    moveTilesPerSec: paced(1.4375),
    turnDegPerSec: 16,
    doubleEnded: true,
    turnInPlace: true,
    turretTurnDegPerSec: BATTLESHIP_TURRET_TURN_DEG_PER_SEC,
    rangeTiles: BATTLESHIP_RANGE_TILES,
    sightTiles: t(20),
    cooldown: BATTLESHIP_BARREL_RELOAD,
    damage: BATTLESHIP_SHELL.damage,
    projectileSpeed: 0,
    armorFront: 130,
    armorSide: 120,
    armorRear: 100,
    penetration: BATTLESHIP_SHELL.penetration,
    caliber: BATTLESHIP_SHELL.caliber,
    spreadDeg: 0,
    naval: true,
    leavesWreck: true,
    wreckHp: 100,
    blurb: `Fast battleship, after the Iowa class. Water only. Two triple 16-inch turrets on the foredeck; every barrel loads and fires on its own, so a turret lets its guns go one by one in no set order. The shell is the field gun's, fired flat and fast: it lands almost as soon as it leaves and reaches as far as Artillery, but it will not fire inside ${BATTLESHIP_MIN_RANGE_TILES / TILE_SUBDIV} tiles. The turrets cannot fire astern through the superstructure. Two radar-laid 20mm CIWS mounts, one on the superstructure and one on the stern, lay themselves apart from the main guns: incoming missiles first, then planes, infantry, and light vehicles. Order an attack or force-attack on an aircraft and the CIWS take it while the main guns hold; they reach farther for a plane than for anything on the water or ashore. Each barrel holds ${BATTLESHIP_BARREL_AMMO} shells and each CIWS a ${BATTLESHIP_CIWS_BELT}-round belt; they fill again slowly beside a Marine Base. Either end serves as the bow: it swings whichever end is nearer the course onto it and makes way ahead or astern at the same speed. A big searchlight on the bridge lights the water far out at night; Rotate light swings it, and it turns with the ship. Torpedoes and heavy shells are the danger. Sunk, it leaves a hulk on the bottom that blocks the water until it is shot apart.`,
  },
  /** Destroyer: twin 40mm, hull sonar, an ASW helicopter, and a mine rail. Water only. */
  destroyer: {
    type: "destroyer",
    kind: "unit",
    name: "Destroyer",
    letter: "D",
    cost: 1800,
    buildSeconds: 22,
    hp: 720,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 22,
    moveTilesPerSec: paced(2.3),
    turnDegPerSec: 55,
    noReverse: true,
    turnInPlace: true,
    turretTurnDegPerSec: 200,
    rangeTiles: DESTROYER_RANGE_TILES,
    sightTiles: t(20),
    cooldown: 0.28,
    damage: 15,
    projectileSpeed: SMALL_ARMS_SPEED,
    armorFront: 26,
    armorSide: 20,
    armorRear: 16,
    penetration: 40,
    caliber: 40,
    spreadDeg: 2.5,
    naval: true,
    sonar: true,
    leavesWreck: true,
    wreckHp: 40,
    blurb: `Destroyer. Water only. A twin 40mm on the foredeck fires fast but reaches only ${DESTROYER_RANGE_TILES / TILE_SUBDIV} tiles. Its hull sonar hears every enemy submarine within ${SONAR_RANGE_TILES / TILE_SUBDIV} tiles, submerged or surfaced, and calls each new contact. It is the only thing that finds a submarine below: a boat it hears is in your sight, fog or not, and any gun that reaches it can lay on it. On a contact its ASW helicopter takes off by itself, flies at the heard position, and drops ${ASW_TORPEDOES} torpedoes in a fan toward it from up to ${ASW_DROP_TILES / TILE_SUBDIV} tiles out; each runs its full length, like the He 111's, and finds a submarine down or up. The helicopter then flies home, lands on the fantail, and takes ${ASW_REARM_SECONDS} seconds to load again. Rifles, machine guns, and anti-air reach it in the air; lost, the ship gets a new one after ${ASW_REPLACE_SECONDS} seconds. Lay Mine puts one of its ${WATER_MINES} contact mines over the stern: it lives after ${WATER_MINE_ARM_SECONDS} seconds and goes off under any hull, swimmer, or submarine that meets it, yours too. You and your allies see your mines; the enemy does not. Beside a Marine Base the rail fills again, one mine every ${WATER_MINE_REARM_SECONDS} seconds. Sunk, it leaves a hulk on the bottom that blocks the water until it is shot apart.`,
  },
  /** Tank landing ship after the RCN's LST(2)s: a bow ramp and a tank deck for 40 slots. Water only. */
  lst: {
    type: "lst",
    kind: "unit",
    name: "Transport LST",
    letter: "L",
    cost: 2200,
    buildSeconds: 26,
    hp: 700,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 30,
    moveTilesPerSec: paced(1.5),
    turnDegPerSec: 26,
    noReverse: true,
    turnInPlace: true,
    rangeTiles: 0,
    sightTiles: t(18),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    armorFront: 90,
    armorSide: 80,
    armorRear: 70,
    penetration: 0,
    caliber: 0,
    spreadDeg: 0,
    naval: true,
    leavesWreck: true,
    wreckHp: 80,
    tankDeck: true,
    garrisonCap: LST_BAY_SLOTS,
    garrisonHpMul: BUNKER_GARRISON_HP_MUL,
    garrisonWoundMul: BUNKER_WOUND_MUL,
    garrisonWindows: 2,
    garrisonFloors: 1,
    garrisonSightBonus: 0,
    garrisonFullArms: true,
    garrisonDiesWithHost: true,
    blurb: `Tank landing ship, after the Royal Canadian Navy's LSTs. Water only, slow, and plated like a fortress. Its tank deck holds ${LST_BAY_SLOTS} slots of infantry and vehicles: a soldier takes one, a Cyborg two, a Walker three, a field gun or a supply truck four, a StuG six, a Tiger eight, a Jagdtiger or a Titan ten, an Apocalypse twelve, and a Mammoth sixteen. Put the bow on the shore: units board up the bow ramp, and Unload sends them all down it onto the beach. Two deck machine guns in shielded tubs, one on the forecastle and one on the bridge wing, are manned by the first two soldiers aboard who can shoot; nobody else aboard fires. The tubs guard their gunners like a Bunker's slits — they are far harder to kill there — and when one falls the next soldier aboard takes the gun. Everything else aboard is out of reach while the hull holds; if it is sunk, everyone aboard goes down with it. Sunk, it leaves a hulk on the bottom that blocks the water until it is shot apart.`,
  },
  /** Ju 87 B dive bomber. Lives on an Airfield pad. */
  stuka: {
    type: "stuka",
    kind: "unit",
    name: "Stuka",
    letter: "J",
    cost: 2000,
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
    wreckHp: 23,
    blurb: "Dive bomber. One SC 250 per sortie, two wing MGs for soft targets. Flies over everything; only rifles, machine guns, the Walker, and the Titan's rockets can reach it in the air. Lands at its Airfield to refuel and rearm. On guard it comes back to the same area once the bomb, the belts, and the tank are full. It has no tracks to lose. A hit that wrecks the engine brings it down at once: it falls trailing smoke and crashes as a wreck.",
  },
  /** Fw 190 fighter. Lives on an Airfield pad. */
  fw190: {
    type: "fw190",
    kind: "unit",
    name: "Fw 190",
    letter: "f",
    cost: 800,
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
    wreckHp: 20,
    blurb: `Fighter. Two 30 mm cannon, one under each wing, and no bomb. ${FW190_BARRAGES} barrages a sortie: on each pass it lines up on the target and lays two straight lines of rounds through it, one from each wing, then comes round for the next. Fired from above, the rounds come down through a tank's thin roof, so even the heaviest hull bleeds. It chases enemy planes out of the sky the same way. Flies faster and turns tighter than the Stuka. Lands at its Airfield to refuel and rearm. On guard it comes back to the same area once all ${FW190_BARRAGES} barrages and the tank are full. It has no tracks to lose. A hit that wrecks the engine brings it down at once: it falls trailing smoke and crashes as a wreck.`,
  },
  /** BV 222 transport flying boat. Lives on an Airfield pad. */
  bv222: {
    type: "bv222",
    kind: "unit",
    name: "BV 222",
    letter: "v",
    cost: 3500,
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
    wreckHp: 40,
    blurb: `Six-engined transport flying boat. No guns. Its bay takes one load, chosen on the pad: a canister of ${CLUSTER_MINES} mines that scatter over the ground and wait for anyone, friend or foe (the enemy never sees them), a supply crate on a parachute that refills ammo and patches up whoever stands at it, or up to ${BV222_TROOPS} ground units. Infantry board on the hardstand from any load; that selects paratroops, and the bay stays on paratroops while anyone is aboard. They jump over the point and hang under canopies — where rifles, machine guns, and anti-aircraft guns can reach them — until they touch down. Hold Ctrl and click, or Force attack, to drop whatever is loaded. Slow and big. It has no tracks to lose. Shot down in the air, or with its engine wrecked there, everyone still aboard bails out under canopies and then it falls trailing smoke and crashes as a wreck. On the pad the same hit puts them on the grass and the plane is gone. Lands at its Airfield to refuel and reload.`,
  },
  /** He 111 H-6 torpedo bomber. Lives on an Airfield pad. */
  he111: {
    type: "he111",
    kind: "unit",
    name: "He 111",
    letter: "e",
    cost: 2400,
    buildSeconds: 26,
    hp: 180,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 15,
    moveTilesPerSec: paced(4.6),
    turnDegPerSec: 75,
    rangeTiles: TORPEDO_RANGE_TILES,
    sightTiles: t(14),
    cooldown: 0,
    damage: TORPEDO.damage,
    projectileSpeed: TORPEDO_SPEED,
    ...UNARMED,
    penetration: TORPEDO.penetration,
    caliber: TORPEDO.caliber,
    spreadDeg: TORPEDO.spreadDeg,
    aircraft: true,
    airTorpedo: true,
    wreckHp: 36,
    blurb: `Twin-engined torpedo bomber. No guns and no bomb: one torpedo under the belly, the same one a submarine fires. It attacks only what is in the water — a boat, a submarine surfaced or down, a swimmer, a Marine Base — and only with water under it. It comes down low over the water on the way in and lets the torpedo go when the target is ${TORPEDO_RANGE_TILES / TILE_SUBDIV} tiles off the nose, the submarine's own reach. The torpedo always runs its full length, even on a force attack, and strikes the first thing in the water across its path, friend or foe, surfaced or submerged. It runs slow and in plain sight; any gun can shoot it apart before it arrives. One torpedo a sortie: then it flies home to land, refuel, and load another. Low on the run in, rifles and anti-aircraft guns reach it easily. It has no tracks to lose. A hit that wrecks the engine brings it down at once: it falls trailing smoke and crashes as a wreck.`,
  },
  /** Horten H.VII reconnaissance flying wing. Lives on an Airfield pad. */
  horten: {
    type: "horten",
    kind: "unit",
    name: "Horten VII",
    letter: "y",
    cost: 2200,
    buildSeconds: 24,
    hp: 90,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 14,
    moveTilesPerSec: paced(9),
    turnDegPerSec: 70,
    rangeTiles: 0,
    sightTiles: t(12),
    cooldown: 0,
    damage: 0,
    projectileSpeed: 0,
    ...UNARMED,
    aircraft: true,
    recon: true,
    wreckHp: 22,
    blurb: `Twin-engined flying wing on reconnaissance. No guns and no bomb: it only looks. It flies higher and faster than any other plane and reveals the widest circle of ground in the air, ${(t(12) + HORTEN_FLYING_SIGHT_BONUS) / TILE_SUBDIV} tiles around it. Up there only anti-air guns — the MG42, gatlings, the CIWS, the Flak — and a fighter that climbs after it can reach it; rifles and rockets cannot. Its tank holds ${HORTEN_FUEL_SECONDS} seconds of flight, more than the others. Send it at a point or a unit and it flies over and circles there; on guard or patrol it keeps watching the area. It comes home to land and refuel when the tank runs low. It has no tracks to lose. A hit that wrecks the engine brings it down at once: it falls trailing smoke and crashes as a wreck.`,
  },
  droneop: {
    type: "droneop",
    kind: "unit",
    name: "Drone Op",
    letter: "o",
    cost: 1000,
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
    cost: 900,
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
  /** The Destroyer's ASW helicopter. Flies from its ship on a sonar contact and back. */
  aswheli: {
    type: "aswheli",
    kind: "unit",
    name: "ASW Helicopter",
    letter: "h",
    cost: 0,
    buildSeconds: 0,
    hp: 60,
    power: 0,
    tileW: 1,
    tileH: 1,
    radius: 10,
    moveTilesPerSec: paced(4),
    turnDegPerSec: 200,
    rangeTiles: TORPEDO_RANGE_TILES,
    sightTiles: t(8),
    cooldown: 0,
    damage: TORPEDO.damage,
    projectileSpeed: TORPEDO_SPEED,
    ...UNARMED,
    aircraft: true,
    aswHeli: true,
    wreckHp: 12,
    blurb: `Anti-submarine helicopter off a Destroyer. Nobody flies it: on a sonar contact it goes out by itself, drops ${ASW_TORPEDOES} torpedoes toward the heard position, and comes home to load again. Rifles, machine guns, and anti-air reach it in the air.`,
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
  warehouse: {
    type: "warehouse",
    name: "Warehouse",
    letter: "E",
    hp: 1600,
    tileW: t(4),
    tileH: t(4),
    ...CIV_BUILDING,
    garrisonCap: 12,
    garrisonWindows: 4,
    garrisonFloors: 2,
    blurb: "Long brick store on a concrete yard, with a loading dock and a rail spur. Thick walls, few windows.",
  },
  granary: {
    type: "granary",
    name: "Granary",
    letter: "Y",
    hp: 1700,
    tileW: t(4),
    tileH: t(4),
    ...CIV_BUILDING,
    garrisonCap: 10,
    garrisonWindows: 3,
    garrisonFloors: 4,
    blurb: "Three concrete silos and a head house that looks over the whole field, beside a brick grain shed.",
  },
  factory: {
    type: "factory",
    name: "Factory",
    letter: "Q",
    hp: 2000,
    tileW: t(5),
    tileH: t(5),
    ...CIV_BUILDING,
    garrisonCap: 16,
    garrisonWindows: 5,
    garrisonFloors: 2,
    blurb: "Brick works hall under a sawtooth roof, an office wing, and a tall stack. Room for a platoon.",
  },
  foundry: {
    type: "foundry",
    name: "Foundry",
    letter: "U",
    hp: 2200,
    tileW: t(5),
    tileH: t(5),
    ...CIV_BUILDING,
    garrisonCap: 14,
    garrisonWindows: 4,
    garrisonFloors: 2,
    blurb: "Casting shed on a brick plinth, a cupola furnace, two stacks, and ore heaps on the yard.",
  },
  hall: {
    type: "hall",
    name: "Assembly Hall",
    letter: "A",
    hp: 2400,
    tileW: t(8),
    tileH: t(3),
    ...CIV_BUILDING,
    garrisonCap: 18,
    garrisonWindows: 6,
    garrisonFloors: 2,
    blurb: "One long brick bay under a clerestory roof, with rail doors on the gable and a drawing office along the south wall. Eight cells long, three deep: it turns end for end, never a quarter.",
  },
  works: {
    type: "works",
    name: "Machine Works",
    letter: "O",
    hp: 2600,
    tileW: t(6),
    tileH: t(5),
    ...CIV_BUILDING,
    garrisonCap: 16,
    garrisonWindows: 5,
    garrisonFloors: 2,
    blurb: "Two brick wings round a cobbled apron: a long machine shop along the north and a wing down the west, with a water tower in the angle. The whole lot is blocked, apron and all.",
  },
  shed: {
    type: "shed",
    name: "Engine Shed",
    letter: "G",
    hp: 1500,
    tileW: t(7),
    tileH: t(2),
    ...CIV_BUILDING,
    garrisonCap: 10,
    garrisonWindows: 4,
    garrisonFloors: 1,
    blurb: "A narrow brick running shed with two roads through it and smoke louvres along the ridge. Seven cells long and only two deep: a wall of a building.",
  },
  boiler: {
    type: "boiler",
    name: "Boiler House",
    letter: "J",
    hp: 2200,
    tileW: t(3),
    tileH: t(6),
    ...CIV_BUILDING,
    garrisonCap: 12,
    garrisonWindows: 4,
    garrisonFloors: 2,
    blurb: "A coal bunker feeds a long boiler hall by conveyor; one tall stack over it all. Three cells wide and six long, it runs north to south.",
  },
};

export function catalog(type: EntityType): CatalogEntry {
  return ENTRIES[type];
}

/**
 * Largest collision radius of a unit that goes ashore. Wreck pathing inflates by this so any
 * hull can detour. Boats are left out: they never meet a wreck on land.
 */
export const MAX_UNIT_RADIUS = Math.max(
  ...Object.values(ENTRIES).filter((d) => d.kind === "unit" && !d.naval).map((d) => d.radius),
);

/** Largest boat. A sunken hulk's pathing inflates by this too, so the Battle Ship can steer round it. */
export const MAX_BOAT_RADIUS = Math.max(
  ...Object.values(ENTRIES).filter((d) => d.kind === "unit" && d.naval).map((d) => d.radius),
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

/** Builds in the yard's line lane, beside sandbags and walls, apart from the other defences: the lines, the Laser Fence, and the Spotlight post. */
export function onLineLane(type: string): boolean {
  return isYardField(type) || type === "spotlight" || isFenceLine(type);
}

/**
 * Sited like a wall from the Defences tab, before it builds: a post at every corner clicked, then
 * Confirm. The yard pays for every post and they all go up together.
 */
export function isFenceLine(type: string): type is "laserfence" {
  return type === "laserfence";
}
/** Most posts one fence order can site. */
export const FENCE_POSTS_MAX = 64;

/**
 * Guns, garrisons, and the sandbag and wall lines: the Defences tab.
 * Guns and garrisons build on their own lane, beside a base structure;
 * the lines (`isYardField`) build on a third lane, beside both.
 */
export function isDefenceStructure(type: string): boolean {
  if (isYardField(type)) return true;
  // The Laser Fence has no gun: its beams are its weapon.
  if (type === "laserfence") return true;
  return isBuildingType(type) && (catalog(type).rangeTiles > 0 || isGarrisonable(type));
}

/** How far from the base the yard may place this type. */
export function buildRadiusOf(type: string): number {
  if (isYardField(type)) return LINE_BUILD_RADIUS;
  return isDefenceStructure(type) ? DEFENCE_BUILD_RADIUS : BUILD_RADIUS;
}

/**
 * Whether an owned structure extends build range. Only base buildings do,
 * so a chain of towers or a wall run cannot carry the yard across the map.
 */
export function anchorsBuildRange(type: EntityType): boolean {
  return !isFieldStructure(type) && !isDefenceStructure(type);
}

/** World-pixel length along the wall and thickness across it. Null for other types. */
export function fieldSpan(type: EntityType): { length: number; thick: number } | null {
  if (type === "sandbags") return { length: 24, thick: 7 };
  if (type === "barbwire") return { length: 24, thick: 6 };
  if (type === "wall") return { length: 24, thick: 8 };
  if (type === "greatwall") return { length: 24, thick: 12 };
  if (type === "gate") return { length: 48, thick: 8 };
  if (type === "teeth") return { length: 14, thick: 14 };
  if (type === "trench") return { length: 16, thick: 10 };
  return null;
}

/** Wall slab height, world units. About chest-high on a standing soldier. */
export const WALL_SLAB_HEIGHT = 15;
/** Large wall slab, world units. Well over a standing man; the slits sit at his shoulder. */
export const LARGE_WALL_SLAB_HEIGHT = 24;
/**
 * Most a concrete run lifts its slab above the ground under a section, in slab heights.
 * Past that the run is cut and the low part starts its own top.
 */
export const WALL_RISE_MAX_SLABS = 2;

export function wallSlabHeight(type: ConcreteLineType): number {
  return type === "greatwall" ? LARGE_WALL_SLAB_HEIGHT : WALL_SLAB_HEIGHT;
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
  return type !== "mammoth" && !isAircraftType(type) && !isNavalType(type);
}

/** Floats: the Attack Boat and the Submarine. Water tiles only. */
export function isNavalType(type: EntityType): boolean {
  return catalog(type).naval === true;
}

/** A building that must stand wholly on water: the Marine Base. */
export function onWaterBuilding(type: EntityType): boolean {
  return catalog(type).onWater === true;
}

/** The main gun is a torpedo tube. */
export function torpedoesOf(type: EntityType): boolean {
  return catalog(type).torpedoes === true;
}

/** Can dive, and down it stays out of enemy sight unless spotted close or just fired. */
export function submergesOf(type: EntityType): boolean {
  return catalog(type).submerges === true;
}

/** Always below: no Dive or Surface, no air. It comes up only to strike. */
export function neverSurfacesOf(type: EntityType): boolean {
  return catalog(type).neverSurfaces === true;
}

/** Hull sonar, an ASW helicopter on the fantail, and a mine rail: the Destroyer. */
export function hasSonar(type: EntityType): boolean {
  return catalog(type).sonar === true;
}

/** The Destroyer's helicopter, which flies only on its ship's sonar. */
export function isAswHeli(type: EntityType): boolean {
  return catalog(type).aswHeli === true;
}

/** A running torpedo's body. Not a unit anyone commands. */
export function isTorpedoBody(type: EntityType): boolean {
  return catalog(type).torpedoBody === true;
}

export function armorLabel(type: EntityType): string | null {
  if (!isArmoredType(type)) return null;
  const d = catalog(type);
  return `F${d.armorFront} / S${d.armorSide} / R${d.armorRear}`;
}

const INFANTRY_TYPES: readonly EntityType[] = ["rifleman", "gunner", "sniper", "atinfantry", "rocketer", "pyro", "mortarman", "engineer", "medic", "cyborg", "cyborgcommander", "simunit2", "xenodrone", "thrall", "lancer", "spitter", "weaver", "shade", "droneop", "jumpjet", "spawnling", "gobber", "quillback", "bloater", "longspine", "mender"];

/** Soldier with a jet pack: the Jump Jet. */
export function isJumpJetType(type: EntityType): boolean {
  return type === "jumpjet";
}

/** The jet flight a type carries: the Jump Jet's pack, the Titan's leg jets, or none. */
export function jetFlightOf(type: EntityType): JetFlightDef | null {
  if (type === "jumpjet") return JUMPJET_FLIGHT;
  if (type === "titan") return TITAN_JET_FLIGHT;
  return null;
}

/** Goes up in a small nuclear blast when destroyed: the Titan. */
export function nukesOnDeath(type: EntityType): boolean {
  return type === "titan";
}

/** Flies: the Stuka, the Fw 190, the BV 222, the He 111, and the Horten VII. */
export function isAircraftType(type: EntityType): boolean {
  return catalog(type).aircraft === true;
}

/** Bombs and gun rounds a plane carries on a full sortie. */
export function airLoadoutOf(type: EntityType): { bombs: number; rounds: number } {
  if (isFighterType(type)) return { bombs: 0, rounds: FW190_BARRAGES };
  // The BV 222's one canister (mines or crate) rides in the bomb slot.
  if (type === "bv222") return { bombs: 1, rounds: 0 };
  // The He 111's torpedo rides in the bomb slot: hung on the pad, spent on the run.
  if (dropsTorpedo(type)) return { bombs: HE111_TORPEDOES, rounds: 0 };
  // The Horten VII carries cameras only. The Overseer's emitters draw on the hive.
  if (isReconType(type) || isHoverType(type)) return { bombs: 0, rounds: 0 };
  return { bombs: STUKA_BOMBS, rounds: STUKA_MG_ROUNDS };
}

/** Torpedo bomber: drops the submarine's torpedo over water instead of a bomb. */
export function dropsTorpedo(type: EntityType): boolean {
  return catalog(type).airTorpedo === true;
}

/** Reconnaissance plane: no weapons, flies over and looks. */
export function isReconType(type: EntityType): boolean {
  return catalog(type).recon === true;
}

/** Height a plane cruises at between runs. */
export function airCruiseAltOf(type: EntityType): number {
  if (isHoverType(type)) return OVERSEER_CRUISE_ALT;
  return isReconType(type) ? HORTEN_CRUISE_ALT : AIR_CRUISE_ALT;
}

/** Seconds of flight in a full tank. */
export function airFuelOf(type: EntityType): number {
  if (isHoverType(type)) return OVERSEER_FUEL_SECONDS;
  return isReconType(type) ? HORTEN_FUEL_SECONDS : AIR_FUEL_SECONDS;
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
  return type === "fw190" || catalog(type).fighter === true;
}

/** Hovers like a helicopter: the Xenomorph Overseer, the Bloom Drifter. */
export function isHoverType(type: EntityType): boolean {
  return catalog(type).hovers === true;
}

/**
 * A Xenomorph flier: the Wasp, the Scourge, the Gnat, the Overseer. It lifts straight out of
 * the Aerie and never comes down: no runway, no nest, no fuel. It flies straight at where it
 * is sent and hangs there (sim/air.ts tickHover); it never circles like a plane.
 */
export function staysAloft(type: EntityType): boolean {
  return isAircraftType(type) && XENO_TYPES.has(type);
}

/** Fights with its jaws: the Xenomorph Lurker. */
export function biteOf(type: EntityType): boolean {
  return catalog(type).bite === true;
}

/** Operator's quadcopter. */
export function isDroneType(type: EntityType): boolean {
  return catalog(type).drone === true;
}

export function isInfantryType(type: EntityType): boolean {
  return (INFANTRY_TYPES as readonly string[]).includes(type);
}

/**
 * Infantry with a machine half: the Cyborg and the Cyborg Commander. No stance orders,
 * no random limb hits, legs tied to HP.
 */
export function isCyborg(type: EntityType): boolean {
  return type === "cyborg" || type === "cyborgcommander" || isSimUnit(type) || type === "xenodrone" || type === "thrall" || type === "lancer" || type === "spitter" || type === "weaver" || type === "shade";
}

/**
 * Runs on a link and shuts down without it: every cyborg but the Commander himself. The
 * Alliance's run on a Cyborg Central or a living Cyborg Commander, the Xenomorphs' on a
 * Conversion Chamber.
 */
export function onUplink(type: EntityType): boolean {
  return isCyborg(type) && type !== "cyborgcommander";
}

/** The Sim Unit line: light cyborg frames. Sim Unit II is the first of them. */
export function isSimUnit(type: EntityType): boolean {
  return type === "simunit2";
}

/**
 * Can shut down on an order and stand dark: the Cyborg and the Sim Units, not the
 * Commander. Powered down he takes no orders, fires nothing, and enemy guns do not
 * pick him on their own; the enemy sees no one's machine. Power up resumes at once.
 */
export function canPowerDown(type: EntityType): boolean {
  return onUplink(type);
}

/** Fights at arm's reach, no round in the air: the Sim Unit II's daggers, the Thrall's fists, the Juggernaut's hammer and fists, the Lurker's jaws. */
export function meleeOf(type: EntityType): boolean {
  return isSimUnit(type) || type === "thrall" || type === "spawnling" || isJuggernaut(type) || biteOf(type);
}

/** The lighter hulls, guns, and trucks the Apocalypse rolls flat. */
const APOCALYPSE_CRUSHES: readonly EntityType[] = ["ss3", "walker", "supply", "nebelwerfer", "artillery"];

/**
 * Whether a rolling armored hull of type `mover` runs over a `victim`. Every hull
 * runs down infantry, all but the Cyborg Commander, who is too big to go under.
 * The Apocalypse also flattens the lighter hulls in APOCALYPSE_CRUSHES.
 */
export function crushes(mover: EntityType, victim: EntityType): boolean {
  if (victim === "cyborgcommander") return false;
  if (isInfantryType(victim)) return true;
  return mover === "apocalypse" && APOCALYPSE_CRUSHES.includes(victim);
}

/**
 * A hull heavy enough to go straight through woods, not only over a lone tree: the Apocalypse,
 * the Titan on its legs, and the hive's Behemoth and Juggernaut.
 */
export function rollsThroughWoods(type: EntityType): boolean {
  return type === "apocalypse" || type === "titan" || type === "behemoth" || type === "juggernaut";
}

/**
 * Infantry that can take a player structure by standing the capture at point-blank.
 * The Engineer keeps to repairs and scrap; the Cyborg and the Cyborg Commander are
 * gun platforms, not occupying troops — they shell a building instead.
 */
export function canCaptureType(type: EntityType): boolean {
  return isInfantryType(type) && type !== "engineer" && !isCyborg(type);
}

/** Carries a force field that takes hits before his HP does. The Cyborg Commander. */
export function hasForceField(type: EntityType): boolean {
  return type === "cyborgcommander";
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
  if (type === "cyborgcommander") return LASER;
  if (type === "simunit2") return DAGGERS;
  if (type === "xenodrone") return RIFLE;
  if (type === "thrall") return FISTS;
  if (type === "lancer") return LAUNCHER;
  if (type === "shade") return SCOPED;
  if (type === "spawnling") return DAGGERS;
  if (type === "gobber") return RIFLE;
  if (type === "quillback") return GATLING;
  if (type === "bloater") return LAUNCHER;
  if (type === "longspine") return SCOPED;
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
  if (type === "cyborgcommander") return [LASER];
  if (type === "simunit2") return [DAGGERS];
  if (type === "xenodrone") return [RIFLE];
  if (type === "thrall") return [FISTS];
  if (type === "lancer") return [LAUNCHER];
  if (type === "shade") return [SCOPED];
  if (type === "spawnling") return [DAGGERS];
  if (type === "gobber") return [RIFLE];
  if (type === "quillback") return [GATLING];
  if (type === "bloater") return [LAUNCHER];
  if (type === "longspine") return [SCOPED];
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
  mountedGun?: number | null;
}): InfantryGun | null {
  if (!isInfantryType(e.type)) return null;
  // Manning an LST deck tub: the mount's gun, whatever he carries and however he is hurt.
  if (e.mountedGun != null) return DECK_MG;
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
  if (noStance(e.type)) return "stand";
  return e.stance ?? "stand";
}

export function isCivilianType(type: string): type is CivilianType {
  return (CIVILIAN_TYPES as readonly string[]).includes(type);
}

export function isGarrisonable(type: EntityType): boolean {
  return (catalog(type).garrisonCap ?? 0) > 0;
}

/** A tank deck: vehicles board by load (the Transport LST). */
export function tankDeckOf(type: EntityType): boolean {
  return catalog(type).tankDeck === true;
}

/**
 * Room a body takes aboard this host. On a tank deck: LST_BAY_LOAD, else infantry 1
 * and a vehicle by its footprint. Every other host counts heads.
 */
export function bayLoadOf(host: EntityType, unit: EntityType): number {
  if (!tankDeckOf(host)) return 1;
  const named = LST_BAY_LOAD[unit];
  if (named != null) return named;
  if (isInfantryType(unit)) return 1;
  const r = catalog(unit).radius;
  return Math.max(2, Math.round((r / 4.5) ** 2 / 1.1));
}

/** A ground vehicle a tank deck takes. Boats, aircraft, drones, and torpedoes stay off. */
export function deckVehicle(type: EntityType): boolean {
  const def = catalog(type);
  return (
    def.kind === "unit" &&
    !isInfantryType(type) &&
    !def.naval &&
    !def.aircraft &&
    !def.drone &&
    !def.aswHeli &&
    !def.torpedoBody
  );
}

/** This unit type may ride in this host: infantry by garrisonAdmits, a vehicle only on a tank deck. */
export function garrisonCandidate(host: EntityType, unit: EntityType): boolean {
  if (!isGarrisonable(host)) return false;
  if (isInfantryType(unit)) return garrisonAdmits(host, unit);
  return tankDeckOf(host) && deckVehicle(unit);
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

/** Share of a bullet hit that reaches a garrison, after garrisonWoundMul. A firing slit stops most of it. */
export function garrisonBulletMulOf(type: EntityType): number {
  return catalog(type).garrisonBulletMul ?? 1;
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

/** Carries supply points and hands them out: the Supply Truck ashore, the Supply Boat afloat. */
export function isSupplyCarrier(type: EntityType): boolean {
  return type === "supply" || type === "supplyboat";
}

/** Where a carrier fills its cargo fast: the Machine Shop for a truck, the Marine Base for a boat. */
export function supplyDepotOf(type: EntityType): BuildingType {
  return type === "supplyboat" ? "dock" : "armory";
}

/** A Battle Ship below a full barrel or CIWS belt: shells per barrel, rounds per belt. */
export function shipShortOf(barrels: readonly number[], belts: readonly number[]): boolean {
  return barrels.some((n) => n < BATTLESHIP_BARREL_AMMO) || belts.some((n) => n < BATTLESHIP_CIWS_BELT);
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
  minePacks?: number,
): boolean {
  const def = catalog(type);
  if ((heavy ?? 0) < heavyAmmoOf(type)) return true;
  if ((minePacks ?? 0) < minePacksOf(type)) return true;
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

/** A building that falls into rubble at 0 HP instead of vanishing. */
export function leavesRubble(type: EntityType): boolean {
  return catalog(type).leavesRubble === true;
}

/**
 * A fallen house. The heap keeps its footprint off limits to every unit, but it is
 * too low to hide anything: sight and fire pass over it. It cannot be hurt or entered.
 */
export function isRubble(e: { kind: EntityKind; type: EntityType; ruined?: boolean }): boolean {
  return e.kind === "building" && e.ruined === true && leavesRubble(e.type);
}

/** Scrap paid to the engineer’s commander when a wreck is cut apart. */
export function wreckScrapOf(type: EntityType): number {
  return Math.max(10, Math.round(catalog(type).cost * WRECK_SCRAP_MUL));
}

export function wreckHpOf(type: EntityType): number {
  const d = catalog(type);
  return d.wreckHp ?? Math.max(1, Math.round(d.hp * 0.18));
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
  return isHqBuilding(type) || braced ? "Pack" : "Deploy";
}

/** Walks through water. Infantry swim; this is the vehicle flag. */
export function wadesOf(type: EntityType): boolean {
  return catalog(type).wades === true;
}

/** A wader that fights from the water. See CatalogEntry.fightsWading. */
export function fightsWadingOf(type: EntityType): boolean {
  return catalog(type).fightsWading === true;
}

/** Share of dry-ground speed while wading. A wader that omits wadeSpeed keeps the Titan's pace. */
export function wadeSpeedOf(type: EntityType): number {
  return catalog(type).wadeSpeed ?? TITAN_WADE_SPEED;
}

/** An emplaced gun worked by its garrison: the MG Nest, the Paks, the Flak. See CatalogEntry.crewGun. */
export function crewGunOf(type: EntityType): boolean {
  return catalog(type).crewGun === true;
}

/** A lamp worked by its garrison: the Spotlight post. See CatalogEntry.lampCrew. */
export function lampCrewOf(type: EntityType): boolean {
  return catalog(type).lampCrew === true;
}

/**
 * A structure that lays its own gun: the CIWS, the RAM, and the crewed guns. Like a unit it
 * takes Stop, Rotate (where the gun rests between targets), and Force attack.
 */
export function aimsOwnGun(type: EntityType): boolean {
  return radarLaidOf(type) || crewGunOf(type) || poweredGunOf(type);
}

/** Traverse each side of an emplacement's set facing, degrees, or null when it turns all round. */
export function mountArcDegOf(type: EntityType): number | null {
  return catalog(type).mountArcDeg ?? null;
}

/** A building gun whose rounds reach aircraft, a Jump Jet, and a high drone: the MG Nest, the Flak. */
export function antiAirGunOf(type: EntityType): boolean {
  return catalog(type).antiAir === true;
}

/** Looks for a plane first and lays on it with the CIWS's cone: the Flak. */
export function airFirstOf(type: EntityType): boolean {
  return catalog(type).airFirst === true;
}

/** Lays only on what flies: the Flak. See CatalogEntry.airOnly. */
export function airOnlyOf(type: EntityType): boolean {
  return catalog(type).airOnly === true;
}

/** Picks armored hulls first: the Paks. */
export function armorFirstOf(type: EntityType): boolean {
  return catalog(type).armorFirst === true;
}

/** A crewless Xenomorph gun that runs on base power: the Spine Turret, the Pulse Spire. See CatalogEntry.poweredGun. */
export function poweredGunOf(type: EntityType): boolean {
  return catalog(type).poweredGun === true;
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

/** Two CIWS mounts on the deck instead of a gun. See CatalogEntry.twinCiws. */
export function twinCiwsOf(type: EntityType): boolean {
  return catalog(type).twinCiws === true;
}

/** A flame projector fixed in the bow. See CatalogEntry.hullFlamer. */
export function hullFlamerOf(type: EntityType): boolean {
  return catalog(type).hullFlamer === true;
}

/** The Battle Ship: two triple turrets and two CIWS mounts, each on its own clock (sim/battleship.ts). */
export function isBattleship(type: EntityType): boolean {
  return type === "battleship";
}

/** The Hive Ark: two plasma cannons on their own cells, two Wasp pods, and a dome (sim/hive-ark.ts). */
export function isHiveArk(type: EntityType): boolean {
  return type === "hiveark";
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

/** The rack Air attacks switches this type to, or undefined when it has only the one. */
export function airRackOf(type: EntityType): RocketRackDef | undefined {
  return catalog(type).airRack;
}

/** The rack `e` fires now: its air rack while set to Air attacks, else its own. */
export function rocketRackFor(e: { type: EntityType; airMode?: boolean }): RocketRackDef {
  return (e.airMode && airRackOf(e.type)) || rocketRackOf(e.type);
}

/** Rockets are this type's only weapon, on a frame that must bear (the Nebelwerfer). */
export function launcherOnlyOf(type: EntityType): boolean {
  return rocketsOf(type) && rocketRackOf(type).laid === true;
}

/** Rockets in a full rack. 0 on every type without pods. */
export function rocketAmmoOf(type: EntityType): number {
  return rocketsOf(type) ? (catalog(type).rocketAmmo ?? 0) : 0;
}

/** Mine packs the launcher holds when full. Only the Mammoth has one. */
export function minePacksOf(type: EntityType): number {
  return type === "mammoth" ? MAMMOTH_MINE_PACKS : 0;
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
  if (type === "seed") return HIVE_DROP_SECONDS;
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

/** + / − nudge. Integer steps, clamped to 1–8×. */
export function nudgeGameSpeed(current: number, delta: number): number {
  const dir = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  return clampGameSpeed(clampGameSpeed(current) + dir);
}
