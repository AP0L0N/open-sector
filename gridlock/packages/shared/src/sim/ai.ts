/**
 * The CPU. Its type (ai-profile.ts) sets how long it digs in, how big its waves are, how
 * often they come, and how fast its Smelters pour; Defensive is the old Easy. It fortifies first: Watch Towers on the side facing the enemy, a Bunker,
 * an MG nest and a Pak 36 turned toward that side, a Tobruk pit, a timber lookout,
 * wall lines with a gate, and soldiers in every slit. Then it campaigns: an army gathers,
 * takes the diamond scrap in the middle, and an engineer raises a Smelter there. From
 * the middle it raises a fire-control tower and keeps raising watch towers toward the enemy,
 * while larger and larger waves swing round alternate flanks, in ranks: hulls in front,
 * rifles behind them, long guns at the back. On the approach it pours a Pak 43 and a heavy
 * casemate. Enemy planes bring up a CIWS, a Flak gun, rocketmen, and fighters. Campaigning,
 * it keeps a bigger army and more Barracks and Machine Shops, paid for by Smelters that
 * pour faster than a player's. Where open water near its base reaches the enemy Core or the middle,
 * it raises a Marine Base, keeps a small fleet, and sends the warships out together to shell
 * what stands near that water.
 */

import {
  isAirfieldType,
  isDockType,
  BATTLESHIP_BARREL_AMMO,
  BUILD_RADIUS,
  DEFENCE_BUILD_RADIUS,
  DIAMOND_SCRAP_MUL,
  DIAMOND_SCRAP_TILE_YIELD,
  GARRISON_STRUCTURAL_CALIBER,
  SMELTER_SCRAP_PER_SEC,
  STUKA_BOMBS,
  SUPPLY_CARGO,
  techNeeds,
  TICK_HZ,
  UNIT_CAP,
  anchorsBuildRange,
  beltOf,
  buildRadiusOf,
  catalog,
  energyOf,
  usesHiveEnergy,
  crewGunOf,
  fieldSpan,
  fires,
  isAircraftType,
  isArmoredType,
  isDroneType,
  isBuildingType,
  isFieldStructure,
  isInfantryType,
  isNavalType,
  isTorpedoBody,
  onWaterBuilding,
  supplyDepotOf,
  torpedoesOf,
  type BuildingType,
  type Faction,
  type TrainType,
  isHqRig,
  isSmelterType,
  smelterOf,
} from "../catalog.js";
import { droneCall, subDepthCall, tickNeutralCrews } from "./ai-crew.js";
import { aiProfile, type AiProfile } from "./ai-profile.js";
import { isAirborne } from "./air.js";
import { droneOf } from "./drone.js";
import { turnedBox } from "../building-rect.js";
import { buildingSiteError, buildTechMissing } from "./build.js";
import { applyCommand } from "./commands.js";
import { canRepairTarget, canScrapWreck, gateSiteAt } from "./field.js";
import { allies, footprintGap, hasCore, hqOf, inBuildRadius, isWater, nearestWalkable, scrapAt, tilesBlockedOrScrap, walkable } from "./geo.js";
import { smelterRateOn, smelterSiteOk } from "./smelter.js";
import { powerOf } from "./power.js";
import { hiveEnergyOf } from "./hive-energy.js";
import { needsSupply } from "./supply.js";
import { canSeeEntity } from "./vision.js";
import type { AiFleet, AiForce, AiPlan, Entity, MatchState, SimPlayer, StructureJob, Vec } from "./types.js";

/** Attack timing, wave sizes, army scale, and Smelter count come from the CPU's type: see ai-profile.ts. */
export const CPU_ATTACK_RETRY_TICKS = 8 * TICK_HZ;
/** Strategy, support, shell, and defense upkeep runs this often, not every think. */
export const CPU_MICRO_EVERY_TICKS = 2 * TICK_HZ;
/** A building with no legal spot in the base waits this long before the CPU tries it again. */
export const CPU_NO_ROOM_RETRY_TICKS = 60 * TICK_HZ;
export const CPU_MIN_FIGHTERS = 4;
/** Smelters the CPU raises while it fortifies. */
export const CPU_FORTIFY_SMELTERS = 2;
/** An engineer raises a Smelter on a scrap field this far from the Core at most, in tiles. */
export const CPU_EXPAND_TILES = 30 * 4;
/** Enemies this far from the HQ, in tiles, pull the home guard. */
export const CPU_DEFEND_TILES = DEFENCE_BUILD_RADIUS + 6 * 4;
/** Campaign towers, around the middle and then toward the enemy, start no faster than this. */
export const CPU_TOWER_EVERY_TICKS = 40 * TICK_HZ;
/** Each Smelter past the first shortens the wait between campaign towers, down to this. */
export const CPU_TOWER_MIN_TICKS = 20 * TICK_HZ;
/** Footprint gap the CPU keeps between its buildings, in tiles. 1 = touching; 5 leaves a vehicle lane. */
const CPU_BUILD_LANE_TILES = 5;
/** A wave this close to a seen enemy building, in tiles, turns on it. */
const CPU_SIEGE_TILES = 16 * 4;
/** Engineers and trucks look for work this far from themselves, in tiles. */
const CPU_WORK_TILES = 20 * 4;
const TRAIN_QUEUE_SOFT = 2;
const FIRST_WAVE_TROOPERS = 4;

/** Base towers stand this far from the Core's middle, in tiles: inside the yard, toward its edge. */
const BASE_RING_TILES = 34;
/** Where the army gathers between waves, tiles from the Core toward the enemy. */
const MUSTER_TILES = 22;
/** A tower or bunker this close to a site, in tiles, already holds it. */
const SITE_HOLD_TILES = 14;
/** How far from a site's ideal spot a footprint may land, in tiles. */
const SITE_SEARCH_TILES = 14;
/** Middle towers ring the diamond field this far from its middle, in tiles. */
const CENTRE_RING_TILES = 18;
/** A Smelter or tower this close to the diamond field's middle, in tiles, holds it. */
const CENTRE_HOLD_TILES = 26;
/** Enemies this close to a held middle, in tiles, pull the fighters near it. */
const CENTRE_DEFEND_TILES = 40;
/** Wall line: sections in front of a tower, and the gated line in front of the main one. */
const WALL_PIECES = 4;
const GATE_WALL_PIECES = 8;
/** Clear ground between a tower's face and its wall line, in tiles. */
const WALL_GAP_TILES = 4;
/** One bound of a force's advance, in tiles. It regroups before the next. */
const BOUND_TILES = 22;
/** A force within this of a route point, in tiles, has reached it. */
const ARRIVE_TILES = 10;
/** Distance between ranks, in tiles. Hulls lead; the long guns stand two ranks back. */
const RANK_GAP_TILES = 7;
/** A bound that has not settled after this long is walked anyway. */
const BOUND_TIMEOUT_TICKS = 18 * TICK_HZ;
/** A force with this share of its fighters on a target holds its bound to fight, at most this long. */
const ENGAGED_SHARE = 0.25;
const ENGAGED_MAX_TICKS = 40 * TICK_HZ;
/** No closer to the next route point for this long: the whole force moves on. Twice this: skip the point. */
const STALL_TICKS = 45 * TICK_HZ;
/**
 * Soldiers the CPU will tie up in garrisons. 14 covers the tower ring and the Bunker.
 * The Tobruk, lookout, casemate, and fire-control tower add their own caps. Past this
 * the campaign stops raising watch towers. Emplaced guns bring their own riflemen.
 */
const CREW_BUDGET =
  14 +
  (catalog("tobruk").garrisonCap ?? 0) +
  (catalog("hochstand").garrisonCap ?? 0) +
  (catalog("casemate").garrisonCap ?? 0) +
  (catalog("leitturm").garrisonCap ?? 0);
/** A force with fewer than this share of its fighters left falls back. */
const FORCE_BREAK_SHARE = 0.35;
const FORCE_MIN = 3;
/** A fighter this far from the body of his force, in tiles, is left out of it. */
const STRAGGLE_TILES = BOUND_TILES * 2.5;
const FORCES_MAX = 4;
/** Open water smaller than this, in tiles, floats no fleet: the CPU raises no Marine Base on it. */
export const CPU_SEA_MIN_TILES = 300;
/** Water this close to the enemy Core or the diamond field's middle, in tiles, is worth a fleet. */
export const CPU_SEA_REACH_TILES = 40;
/** Warships lying at home, armed, before the fleet sails. */
export const CPU_FLEET_MIN = 3;
/** Enemies this close to a Marine Base, in tiles, pull the warships at home. */
const CPU_HARBOUR_DEFEND_TILES = 30;
/** A warship this close to the fleet's water, in tiles, is on station. */
const STATION_TILES = 12;

/**
 * Army the CPU keeps, listed under the factory that trains it. Each think, each factory
 * offers its row furthest below its share, neediest first, so the ranks fill evenly.
 * Order breaks ties. Riflemen and rocketmen rise with empty slits and enemy planes.
 */
export const CPU_ARMY: Readonly<Record<"muster" | "armory" | "cyborgcentral" | "airfield" | "dock", readonly { unit: TrainType; want: number }[]>> = {
  muster: [
    { unit: "rifleman", want: 8 },
    { unit: "gunner", want: 3 },
    { unit: "rocketer", want: 2 },
    { unit: "atinfantry", want: 2 },
    { unit: "pyro", want: 1 },
    { unit: "medic", want: 2 },
    { unit: "sniper", want: 2 },
    { unit: "mortarman", want: 2 },
    { unit: "engineer", want: 3 },
    { unit: "jumpjet", want: 2 },
    { unit: "droneop", want: 1 },
  ],
  armory: [
    { unit: "ss3", want: 3 },
    { unit: "warden", want: 3 },
    { unit: "walker", want: 2 },
    { unit: "jagdtiger", want: 1 },
    { unit: "feuerwirbel", want: 1 },
    { unit: "mammoth", want: 1 },
    { unit: "apocalypse", want: 1 },
    { unit: "supply", want: 1 },
    { unit: "titan", want: 1 },
    { unit: "nebelwerfer", want: 1 },
  ],
  cyborgcentral: [
    { unit: "cyborg", want: 2 },
    { unit: "cyborgcommander", want: 1 },
  ],
  airfield: [
    { unit: "stuka", want: 2 },
    { unit: "fw190", want: 1 },
  ],
  // The fleet: boats to screen, a Destroyer to hear submarines, a Battle Ship to shell the shore.
  // No Transport LST: the CPU makes no landings.
  dock: [
    { unit: "gunboat", want: 2 },
    { unit: "destroyer", want: 1 },
    { unit: "submarine", want: 1 },
    { unit: "battleship", want: 1 },
    { unit: "supplyboat", want: 1 },
  ],
};

/**
 * Base structures, one after another, each until the side owns `n`. Smelter second so its scrap
 * funds the Barracks and the first towers, and a second Smelter right behind the Barracks to pay
 * for the army. The Machine Shop waits for a tower; the Marine Base, Research, Cyborg Central, air, and the Radar
 * Station wait until the base is fortified. With all of that standing, more Smelters up to the type's wantSmelters.
 */
const BUILD_ORDER: readonly { type: BuildingType; n: number }[] = [
  { type: "dynamo", n: 1 },
  { type: "smelter", n: 1 },
  { type: "muster", n: 1 },
  { type: "smelter", n: CPU_FORTIFY_SMELTERS },
  { type: "armory", n: 1 },
  // Only with water in the yard that reaches the enemy or the middle (wantDock).
  { type: "dock", n: 1 },
  { type: "research", n: 1 },
  { type: "cyborgcentral", n: 1 },
  { type: "airfield", n: 1 },
  { type: "radar", n: 1 },
];
/** Started as soon as scrap covers them. The rest wait for the first rifle wave. */
const CORE_BUILDINGS: readonly BuildingType[] = ["dynamo", "smelter", "muster"];
/** Troops train only once these stand, so scrap is held for them while they go up. */
const FACTORIES: readonly BuildingType[] = [...CORE_BUILDINGS, "armory"];
/** Extras that wait for a fortified base. */
const AFTER_FORTIFY: readonly BuildingType[] = ["dock", "research", "cyborgcentral", "airfield", "radar"];

/** Unarmed units that walk out with a wave beside a fighter. */
const ESCORTS: ReadonlySet<string> = new Set(["medic", "supply", "droneop"]);
/** Unarmed units that idle at home. Parked against a building they shut a base lane. */
const YARD_IDLERS: ReadonlySet<string> = new Set([...ESCORTS, "engineer"]);
/**
 * Soldiers the CPU leaves in a Bunker or casemate, in order of preference.
 * A slit takes the first kind not already inside, so the post holds an MG, a rocket tube
 * for planes, and a rifle.
 */
const BUNKER_CREW: readonly string[] = ["gunner", "rocketer", "rifleman", "atinfantry"];
/** Lookouts want a rifle that reaches: a sniper, then the same mix as a tower. */
const LOOKOUT_CREW: readonly string[] = ["sniper", "gunner", "rocketer", "rifleman"];
/** A Tobruk is open to the sky, so a mortarman takes the first place. */
const PIT_CREW: readonly string[] = ["mortarman", "gunner", "rifleman", "rocketer"];
/** An emplaced gun comes with riflemen. Replacements are riflemen, then a gunner. */
const GUN_CREW: readonly string[] = ["rifleman", "gunner"];
/** Garrisons the army has to fill. Counted against CREW_BUDGET. */
const GARRISONS: readonly BuildingType[] = ["bunker", "tower", "tobruk", "casemate", "hochstand", "leitturm"];
/** Defences the CPU mans. Guns included, so a dead crew is replaced. */
const CREWED: readonly BuildingType[] = [...GARRISONS, "mgnest", "pak36", "pak43", "flak"];
/** Turned toward the enemy when placed. A narrow arc is useless facing the yard. */
const FACES_ENEMY: ReadonlySet<string> = new Set(["mgnest", "pak36", "pak43", "flak", "tobruk", "casemate", "hochstand", "leitturm"]);
/** Long guns: they walk two ranks back and fire over the line. */
const BACK_RANK: ReadonlySet<string> = new Set(["sniper", "mortarman", "nebelwerfer", "jagdtiger", "artillery", "shade", "mawcaster", "broodmother", "longspine", "sporemaw"]);
/** Short reach and thick skin: the front rank beside the hulls. */
const FRONT_INFANTRY: ReadonlySet<string> = new Set(["cyborg", "cyborgcommander", "simunit2", "xenodrone", "thrall", "lancer", "spitter", "pyro", "spawnling", "quillback", "bloater"]);

type Rank = "front" | "mid" | "back";
interface Site {
  type: BuildingType;
  at: Vec;
  key: string;
}

export function tickAi(state: MatchState): void {
  if (state.ended) return;
  tickNeutralCrews(state);
  for (const p of state.players.values()) {
    if (!p.ai || !p.alive) continue;
    thinkCpu(state, p);
  }
}

/** The CPU's plan, made on first use. */
export function aiPlanOf(p: SimPlayer): AiPlan {
  p.aiPlan ??= {
    posture: "fortify",
    forces: [],
    nextForceId: 1,
    waves: 0,
    flank: 1,
    siteRetry: {},
    walled: [],
    nextTowerTick: 0,
  };
  return p.aiPlan;
}

function thinkCpu(state: MatchState, p: SimPlayer): void {
  const hq = hqOf(state, p.playerId);
  if (!hq) return;
  if (!hasCore(state, p.playerId)) {
    if (isHqRig(hq.type) && hq.state !== "deploy") {
      applyCommand(state, p.playerId, { type: "cmd.deploy", id: hq.id });
    }
    return;
  }
  const plan = aiPlanOf(p);
  const hive = p.faction ? HIVE_DOCTRINE[p.faction] : undefined;
  if (hive) {
    thinkHive(state, p, hq, plan, hive);
    return;
  }

  if (!placeReadyBuilding(state, p, p.structure)) {
    const next = nextBuilding(state, p);
    if (next && !p.structure && canStartBuilding(state, p, next)) {
      if (findBuildTile(state, p.playerId, next)) {
        applyCommand(state, p.playerId, { type: "cmd.build", building: next });
      } else {
        noRoom(state, p, next);
      }
    }
  }

  trainCpu(state, p);
  if (state.tick >= (p.aiNextMicroTick ?? 0)) {
    p.aiNextMicroTick = state.tick + CPU_MICRO_EVERY_TICKS;
    watchSky(state, p, plan);
    if (plan.posture === "fortify" && fortified(state, p, hq, plan)) {
      plan.posture = "campaign";
      p.aiNextAttackTick = Math.max(p.aiNextAttackTick, state.tick + CPU_ATTACK_RETRY_TICKS);
    }
    defenceLane(state, p, hq, plan);
    lineLane(state, p, hq, plan);
    defendBase(state, p, hq, plan);
    defendCentre(state, p, plan);
    scramble(state, p, hq);
    crewBunkers(state, p, plan);
    rallyFactories(state, p, hq);
    campaign(state, p, hq, plan);
    seaWork(state, p, hq, plan);
    microUnits(state, p, hq, plan);
  }
}

/**
 * Xenomorph base: Fusion Node, Conversion Chamber, a second Fusion Node, the Nanite Forge, a pair of
 * Spine Turrets, and later the Neural Nexus and its Pulse Spires. The hive pays no scrap: it raises
 * another Fusion Node whenever its energy runs low (HIVE_ENERGY_LOW).
 */
const XENO_BUILD_ORDER: readonly { type: BuildingType; n: number }[] = [
  { type: "fusionnode", n: 1 },
  { type: "conversion", n: 1 },
  { type: "fusionnode", n: 2 },
  { type: "forge", n: 1 },
  { type: "spineturret", n: 2 },
  { type: "fusionnode", n: 3 },
  { type: "nexus", n: 1 },
  { type: "pulsespire", n: 2 },
];
/** The Xenomorph foot soldiers, from the Conversion Chamber. */
export const XENO_ARMY: readonly { unit: TrainType; want: number }[] = [
  { unit: "xenodrone", want: 10 },
  { unit: "thrall", want: 4 },
  { unit: "lancer", want: 4 },
  { unit: "spitter", want: 2 },
  { unit: "weaver", want: 2 },
  { unit: "shade", want: 1 },
  { unit: "simunit2", want: 3 },
];
/** The Xenomorph heavy assimilators, from the Nanite Forge. */
export const XENO_HEAVY: readonly { unit: TrainType; want: number }[] = [
  { unit: "stalker", want: 4 },
  { unit: "ravager", want: 2 },
  { unit: "siphon", want: 2 },
  { unit: "mawcaster", want: 1 },
  { unit: "broodmother", want: 1 },
  { unit: "behemoth", want: 1 },
  { unit: "juggernaut", want: 1 },
];
/** Each Xenomorph factory and the ranks it fills. */
const XENO_FACTORIES: readonly { factory: BuildingType; army: readonly { unit: TrainType; want: number }[] }[] = [
  { factory: "conversion", army: XENO_ARMY },
  { factory: "forge", army: XENO_HEAVY },
];

/**
 * Bloom base: Lumen Bulb, Gorger, Brood Nest, a second Gorger and more light, the Gestator, a
 * pair of Thorn Spitters and a Puffcap, then the Brain Coral and its Bile Lances.
 */
const BLOOM_BUILD_ORDER: readonly { type: BuildingType; n: number }[] = [
  { type: "lumenbulb", n: 1 },
  { type: "gorger", n: 1 },
  { type: "broodnest", n: 1 },
  { type: "gorger", n: CPU_FORTIFY_SMELTERS },
  { type: "lumenbulb", n: 2 },
  { type: "gestator", n: 1 },
  { type: "thornspitter", n: 2 },
  { type: "puffcap", n: 1 },
  { type: "lumenbulb", n: 3 },
  { type: "braincoral", n: 1 },
  { type: "bilelance", n: 2 },
];
/** The Bloom brood, from the Brood Nest. */
export const BLOOM_BROOD: readonly { unit: TrainType; want: number }[] = [
  { unit: "gobber", want: 6 },
  { unit: "spawnling", want: 6 },
  { unit: "quillback", want: 3 },
  { unit: "bloater", want: 3 },
  { unit: "mender", want: 2 },
  { unit: "longspine", want: 2 },
];
/** The Bloom beasts, from the Gestator. */
export const BLOOM_BEASTS: readonly { unit: TrainType; want: number }[] = [
  { unit: "mantis", want: 3 },
  { unit: "skitter", want: 2 },
  { unit: "goretusk", want: 2 },
  { unit: "bileworm", want: 1 },
  { unit: "sporemaw", want: 1 },
  { unit: "matriarch", want: 1 },
];

/** How a hive-minded CPU (the Xenomorphs, the Bloom) raises its base and fills its ranks. */
interface HiveDoctrine {
  power: BuildingType;
  /** None for the Xenomorphs: they pay no scrap. */
  smelter?: BuildingType;
  /** Built again while campaigning, so the waves come faster. */
  surge: BuildingType;
  order: readonly { type: BuildingType; n: number }[];
  factories: readonly { factory: BuildingType; army: readonly { unit: TrainType; want: number }[] }[];
}
const HIVE_DOCTRINE: Partial<Record<Faction, HiveDoctrine>> = {
  xeno: { power: "fusionnode", surge: "conversion", order: XENO_BUILD_ORDER, factories: XENO_FACTORIES },
  bloom: {
    power: "lumenbulb",
    smelter: "gorger",
    surge: "broodnest",
    order: BLOOM_BUILD_ORDER,
    factories: [
      { factory: "broodnest", army: BLOOM_BROOD },
      { factory: "gestator", army: BLOOM_BEASTS },
    ],
  },
};

/**
 * The hive CPU (the Xenomorphs, the Bloom). No towers, walls, or fleet yet: it raises its base, fills
 * the ranks from its factories, and campaigns once the army stands or the fortify time runs out.
 */
function thinkHive(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan, hive: HiveDoctrine): void {
  if (!placeReadyBuilding(state, p, p.structure)) {
    const next = nextHiveBuilding(state, p, hive);
    if (next && !p.structure && p.scrap >= catalog(next).cost) {
      if (findBuildTile(state, p.playerId, next)) {
        applyCommand(state, p.playerId, { type: "cmd.build", building: next });
      } else {
        noRoom(state, p, next);
      }
    }
  }
  for (const { factory, army } of hive.factories) {
    if (!ownsLive(state, p.playerId, factory)) continue;
    // Pay for the next building first while the base is short of one.
    const next = nextHiveBuilding(state, p, hive);
    const reserve = next && countType(state, p.playerId, factory) === 0 ? catalog(next).cost : 0;
    if (queuedOn(state, p.playerId, factory) < TRAIN_QUEUE_SOFT * countType(state, p.playerId, factory)) {
      const pick = neediest(state, p, army);
      if (pick && countType(state, p.playerId, pick.unit) < pick.want && p.scrap >= catalog(pick.unit).cost + reserve && hiveHasRoom(state, p, energyOf(pick.unit))) {
        applyCommand(state, p.playerId, { type: "cmd.train", unit: pick.unit });
      }
    }
  }
  if (state.tick >= (p.aiNextMicroTick ?? 0)) {
    p.aiNextMicroTick = state.tick + CPU_MICRO_EVERY_TICKS;
    watchSky(state, p, plan);
    if (plan.posture === "fortify" && (state.tick >= aiProfile(p.ai).fortifyMaxTicks || fighterCount(state, p.playerId) >= CPU_MIN_FIGHTERS * 2)) {
      plan.posture = "campaign";
      p.aiNextAttackTick = Math.max(p.aiNextAttackTick, state.tick + CPU_ATTACK_RETRY_TICKS);
    }
    defendBase(state, p, hq, plan);
    defendCentre(state, p, plan);
    scramble(state, p, hq);
    rallyFactories(state, p, hq);
    campaign(state, p, hq, plan);
    microUnits(state, p, hq, plan);
  }
}

/** Hive energy free for a new unit or defence; Infinity for a side that pays scrap. */
function hiveFree(state: MatchState, p: SimPlayer): number {
  if (!usesHiveEnergy(p.faction)) return Infinity;
  const { cap, used } = hiveEnergyOf(state, p.playerId);
  return cap - used;
}

function hiveHasRoom(state: MatchState, p: SimPlayer, energy: number): boolean {
  return hiveFree(state, p) >= energy;
}

/** Below this much free energy the Xenomorph CPU raises another Fusion Node, up to HIVE_MAX_NODES. */
const HIVE_ENERGY_LOW = 150;
const HIVE_MAX_NODES = 10;

/** The hive's next building by energy: a Fusion Node when the store runs low or `t` will not fit. */
function nextEnergyBuilding(state: MatchState, p: SimPlayer, hive: HiveDoctrine): BuildingType | null {
  const roomy = (t: BuildingType): boolean => (p.aiNoRoomUntil?.[t] ?? 0) <= state.tick;
  const free = hiveFree(state, p);
  const power = (): BuildingType | null =>
    roomy(hive.power) && countType(state, p.playerId, hive.power) < HIVE_MAX_NODES ? hive.power : null;
  for (const { type: t, n } of hive.order) {
    if (countType(state, p.playerId, t) >= n || !roomy(t)) continue;
    if (t !== hive.power && energyOf(t) > free) return power();
    return t;
  }
  if (free < HIVE_ENERGY_LOW) return power();
  if (aiPlanOf(p).posture === "campaign" && countType(state, p.playerId, hive.surge) < aiProfile(p.ai).campaignFactories && roomy(hive.surge)) {
    return hive.surge;
  }
  return null;
}

function nextHiveBuilding(state: MatchState, p: SimPlayer, hive: HiveDoctrine): BuildingType | null {
  if (usesHiveEnergy(p.faction)) return nextEnergyBuilding(state, p, hive);
  const pow = powerOf(state, p.playerId);
  const roomy = (t: BuildingType): boolean => (p.aiNoRoomUntil?.[t] ?? 0) <= state.tick;
  const power = (): BuildingType | null => (roomy(hive.power) ? hive.power : null);
  for (const { type: t, n } of hive.order) {
    if (countType(state, p.playerId, t) >= n || !roomy(t)) continue;
    const draw = Math.max(0, -catalog(t).power);
    if (t !== hive.power && pow.used + draw > pow.provided) return power();
    return t;
  }
  if (pow.used >= pow.provided) return power();
  if (hive.smelter && countType(state, p.playerId, hive.smelter) < aiProfile(p.ai).wantSmelters && roomy(hive.smelter)) {
    if (pow.used + Math.max(0, -catalog(hive.smelter).power) > pow.provided) return power();
    return hive.smelter;
  }
  if (aiPlanOf(p).posture === "campaign" && countType(state, p.playerId, hive.surge) < aiProfile(p.ai).campaignFactories && roomy(hive.surge)) {
    if (pow.used + Math.max(0, -catalog(hive.surge).power) > pow.provided) return power();
    return hive.surge;
  }
  return null;
}

/** Place a finished building, or refund it when the base has no room. Returns whether this job was ready. */
function placeReadyBuilding(state: MatchState, p: SimPlayer, job: StructureJob | null): boolean {
  if (!job?.ready || !isBuildingType(job.type)) return false;
  const type = job.type;
  const spot = findBuildTile(state, p.playerId, type);
  if (spot) {
    applyCommand(state, p.playerId, { type: "cmd.place", building: type, tx: spot.tx, ty: spot.ty });
  } else {
    // Trees, scrap, and the map edge can leave no room. Take the refund rather than block the lane.
    applyCommand(state, p.playerId, { type: "cmd.cancel", what: "structure", building: type });
    noRoom(state, p, type);
  }
  return true;
}

function nextBuilding(state: MatchState, p: SimPlayer): BuildingType | null {
  const pow = powerOf(state, p.playerId);
  const roomy = (t: BuildingType): boolean => (p.aiNoRoomUntil?.[t] ?? 0) <= state.tick;
  for (const { type: t, n } of BUILD_ORDER) {
    if (t === "dock" && !wantDock(state, p)) continue;
    if (countType(state, p.playerId, t) >= n || !roomy(t)) continue;
    const draw = Math.max(0, -catalog(t).power);
    if (t !== "dynamo" && pow.used + draw > pow.provided) return roomy("dynamo") ? "dynamo" : null;
    return t;
  }
  if (pow.used >= pow.provided && roomy("dynamo")) return "dynamo";
  // The base is complete: every further Smelter adds its own pour.
  if (countType(state, p.playerId, "smelter") < aiProfile(p.ai).wantSmelters && roomy("smelter")) {
    const draw = Math.max(0, -catalog("smelter").power);
    if (pow.used + draw > pow.provided) return roomy("dynamo") ? "dynamo" : null;
    return "smelter";
  }
  // Campaigning, spare scrap goes into more factories so the waves come faster.
  if (aiPlanOf(p).posture === "campaign") {
    for (const t of ["muster", "armory"] as const) {
      if (countType(state, p.playerId, t) >= aiProfile(p.ai).campaignFactories || !roomy(t)) continue;
      const draw = Math.max(0, -catalog(t).power);
      if (pow.used + draw > pow.provided) return roomy("dynamo") ? "dynamo" : null;
      return t;
    }
  }
  return null;
}

function noRoom(state: MatchState, p: SimPlayer, type: BuildingType): void {
  p.aiNoRoomUntil = { ...p.aiNoRoomUntil, [type]: state.tick + CPU_NO_ROOM_RETRY_TICKS };
}

function canStartBuilding(state: MatchState, p: SimPlayer, next: BuildingType): boolean {
  const cost = catalog(next).cost;
  if (p.scrap < cost) return false;
  if (CORE_BUILDINGS.includes(next)) return true;
  const plan = aiPlanOf(p);
  if (plan.posture === "fortify") {
    // Walls and towers first: the Machine Shop waits for one tower, the extras for the whole ring.
    if (AFTER_FORTIFY.includes(next) || (next === "smelter" && countType(state, p.playerId, "smelter") >= CPU_FORTIFY_SMELTERS)) return false;
    if (next === "armory" && countType(state, p.playerId, "tower") === 0) return false;
  }
  const troopers = countType(state, p.playerId, "rifleman");
  const hold = Math.max(0, FIRST_WAVE_TROOPERS - troopers) * catalog("rifleman").cost;
  return p.scrap >= cost + hold;
}

function trainCpu(state: MatchState, p: SimPlayer): void {
  const reserve = trainReserve(state, p);
  const tryTrain = (unit: TrainType, want: number): boolean => {
    if (countType(state, p.playerId, unit) >= want) return false;
    if (queuedAt(state, p.playerId, unit) >= TRAIN_QUEUE_SOFT) return false;
    if (p.scrap < catalog(unit).cost + reserve) return false;
    return applyCommand(state, p.playerId, { type: "cmd.train", unit }).ok;
  };
  if (tryTrain("rifleman", FIRST_WAVE_TROOPERS)) return;
  // One job per factory, neediest rank first. Stop at the first pick scrap cannot cover and save
  // for it, so a trickle of income does not all go to cheap riflemen ahead of a Titan or a Stuka.
  const picks: { unit: TrainType; want: number; share: number }[] = [];
  for (const factory of ["armory", "muster", "cyborgcentral", "airfield", "dock"] as const) {
    if (!ownsLive(state, p.playerId, factory)) continue;
    if (queuedOn(state, p.playerId, factory) >= TRAIN_QUEUE_SOFT * countType(state, p.playerId, factory)) continue;
    const pick = neediest(state, p, CPU_ARMY[factory]);
    if (pick) picks.push(pick);
  }
  picks.sort((a, b) => a.share - b.share);
  for (const pick of picks) {
    if (p.scrap < catalog(pick.unit).cost + reserve) return;
    tryTrain(pick.unit, pick.want);
  }
}

/** Entry with the lowest have/want share, or null when every rank is full. */
function neediest(
  state: MatchState,
  p: SimPlayer,
  army: readonly { unit: TrainType; want: number }[],
): { unit: TrainType; want: number; share: number } | null {
  let best: { unit: TrainType; want: number; share: number } | null = null;
  for (const row of army) {
    // A locked rank is not needy yet: saving for it would stall the whole factory.
    if (techNeeds(row.unit).some((tech) => !ownsLive(state, p.playerId, tech))) continue;
    const want = wantOf(state, p, row.unit, row.want);
    const share = countType(state, p.playerId, row.unit) / want;
    if (share >= 1 || share >= (best?.share ?? Infinity)) continue;
    best = { unit: row.unit, want, share };
  }
  return best;
}

/**
 * Riflemen to fill every empty slit; rocketmen and fighters once enemy planes are about.
 * Campaigning, every fighting rank is the type's campaignArmyMul times larger to feed the waves.
 */
function wantOf(state: MatchState, p: SimPlayer, unit: TrainType, base: number): number {
  // The fleet stays the size it is: the waves are fed ashore.
  if (aiPlanOf(p).posture === "campaign" && fires(unit) && !isNavalType(unit)) base = Math.ceil(base * aiProfile(p.ai).campaignArmyMul);
  // Riflemen seated at an emplaced gun came with it. Train their number again for the field.
  if (unit === "rifleman") return base + Math.min(12, emptySlits(state, p.playerId)) + gunRiflemen(state, p.playerId);
  const air = aiPlanOf(p).airSeenTick != null;
  if (air && unit === "rocketer") return base + 2;
  if (air && unit === "fw190") return base + 1;
  return base;
}

/** Soldiers every standing garrison holds when full. Emplaced guns are not counted: they bring their own. */
function crewSlots(state: MatchState, playerId: string): number {
  let n = 0;
  for (const b of state.entities.values()) {
    if (b.ownerId !== playerId || b.hp <= 0 || !(GARRISONS as readonly string[]).includes(b.type)) continue;
    n += catalog(b.type).garrisonCap ?? 0;
  }
  return n;
}

/** Riflemen already at an emplaced gun. */
function gunRiflemen(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== "rifleman" || e.hp <= 0 || e.garrisonedIn == null) continue;
    const house = state.entities.get(e.garrisonedIn);
    if (house && crewGunOf(house.type)) n++;
  }
  return n;
}

function crewOrder(type: Entity["type"]): readonly string[] {
  if (type === "tobruk") return PIT_CREW;
  if (type === "hochstand" || type === "leitturm") return LOOKOUT_CREW;
  if (crewGunOf(type)) return GUN_CREW;
  return BUNKER_CREW;
}

function emptySlits(state: MatchState, playerId: string): number {
  let n = 0;
  for (const b of state.entities.values()) {
    if (b.ownerId !== playerId || b.hp <= 0 || !(CREWED as readonly string[]).includes(b.type)) continue;
    n += Math.max(0, (catalog(b.type).garrisonCap ?? 0) - b.garrison.length);
  }
  return n;
}

/** Hold scrap for the next factory, and while fortifying, for the next tower. */
function trainReserve(state: MatchState, p: SimPlayer): number {
  // A factory under way is paid for first. Extras (Research, air, defenses) share scrap with the army.
  const paying = [p.structure, p.defence].find(
    (j) => j && !j.ready && isBuildingType(j.type) && FACTORIES.includes(j.type),
  );
  if (paying && isBuildingType(paying.type)) {
    return Math.max(0, catalog(paying.type).cost - paying.paid);
  }
  if (countType(state, p.playerId, "dynamo") === 0) return catalog("dynamo").cost;
  if (countType(state, p.playerId, "muster") === 0) return catalog("muster").cost;
  if (countType(state, p.playerId, "rifleman") < FIRST_WAVE_TROOPERS) return 0;
  const plan = aiPlanOf(p);
  if (plan.posture === "fortify") {
    // Crews for the towers that stand come first, then the next tower.
    if (emptySlits(state, p.playerId) > 0) return 0;
    const hq = hqOf(state, p.playerId);
    const site = hq
      ? [...fortifySites(state, p, hq), ...batterySites(state, p, hq)].find(
          (s) => !siteHeld(state, p.playerId, s) && !siteFailed(state, plan, s),
        )
      : undefined;
    if (site && !p.defence) return catalog(site.type).cost;
  }
  if (countType(state, p.playerId, "armory") === 0) return catalog("armory").cost;
  if (fighterCount(state, p.playerId) < CPU_MIN_FIGHTERS * 2) return 0;
  // Either lane already drawing scrap is the build being saved for. Do not reserve it twice.
  if (p.structure || p.defence) return 0;
  const next = nextBuilding(state, p);
  return next && canStartBuildingLater(p, next) ? catalog(next).cost : 0;
}

function canStartBuildingLater(p: SimPlayer, next: BuildingType): boolean {
  return aiPlanOf(p).posture === "campaign" || !AFTER_FORTIFY.includes(next);
}

function fighterCount(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) if (freeFighter(e, playerId)) n++;
  return n;
}

// ---------------------------------------------------------------- the ground

/** Unit vector from the Core toward the nearest enemy Core, or toward the map's middle. */
function enemyAxis(state: MatchState, playerId: string, hq: Entity): Vec {
  const foe = enemyHq(state, playerId);
  const ts = state.tileSize;
  const to = foe ?? { x: (state.width * ts) / 2, y: (state.height * ts) / 2 };
  return unit(to.x - hq.x, to.y - hq.y);
}

/** Radians so a building's front points at the enemy Core. */
function bearingToEnemy(state: MatchState, playerId: string, at: Vec): number {
  const foe = enemyHq(state, playerId);
  const hq = hqOf(state, playerId);
  const dir = foe ? unit(foe.x - at.x, foe.y - at.y) : hq ? unit(at.x - hq.x, at.y - hq.y) : { x: 1, y: 0 };
  return Math.atan2(dir.y, dir.x);
}

function placeFacing(state: MatchState, playerId: string, type: BuildingType, at: Vec | undefined): number {
  return at && FACES_ENEMY.has(type) ? bearingToEnemy(state, playerId, at) : 0;
}

function unit(dx: number, dy: number): Vec {
  const d = Math.hypot(dx, dy);
  return d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
}

function rotate(v: Vec, deg: number): Vec {
  const a = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
}

function along(from: Vec, dir: Vec, px: number): Vec {
  return { x: from.x + dir.x * px, y: from.y + dir.y * px };
}

function clampToMap(state: MatchState, at: Vec): Vec {
  const ts = state.tileSize;
  const m = 4 * ts;
  return {
    x: Math.max(m, Math.min(state.width * ts - m, at.x)),
    y: Math.max(m, Math.min(state.height * ts - m, at.y)),
  };
}

/** Walkable ground nearest a point, world pixels. */
function groundNear(state: MatchState, at: Vec): Vec {
  const ts = state.tileSize;
  const c = clampToMap(state, at);
  const t = nearestWalkable(state, Math.floor(c.x / ts), Math.floor(c.y / ts), "warden");
  return t ? { x: (t.x + 0.5) * ts, y: (t.y + 0.5) * ts } : c;
}

const centreCache = new WeakMap<MatchState, Vec>();

/** Middle of the diamond scrap field, world pixels. The map's middle when it has none. */
export function diamondCentre(state: MatchState): Vec {
  const cached = centreCache.get(state);
  if (cached) return cached;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let ty = 0; ty < state.height; ty++) {
    for (let tx = 0; tx < state.width; tx++) {
      if (scrapAt(state, tx, ty) < DIAMOND_SCRAP_TILE_YIELD) continue;
      sx += tx + 0.5;
      sy += ty + 0.5;
      n++;
    }
  }
  const ts = state.tileSize;
  const at = n > 0 ? { x: (sx / n) * ts, y: (sy / n) * ts } : { x: (state.width * ts) / 2, y: (state.height * ts) / 2 };
  centreCache.set(state, at);
  return at;
}

/** Where the army gathers: the middle once it is held, else in front of the Core. */
function musterPoint(state: MatchState, p: SimPlayer, hq: Entity): Vec {
  if (centreHeld(state, p.playerId)) return groundNear(state, diamondCentre(state));
  return homeMuster(state, p, hq);
}

function homeMuster(state: MatchState, p: SimPlayer, hq: Entity): Vec {
  return groundNear(state, along(hq, enemyAxis(state, p.playerId, hq), MUSTER_TILES * state.tileSize));
}

/** An own Smelter or tower stands on or beside the diamond field. */
function centreHeld(state: MatchState, playerId: string): boolean {
  const c = diamondCentre(state);
  const reach = CENTRE_HOLD_TILES * state.tileSize;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.kind !== "building" || e.hp <= 0) continue;
    if (!isSmelterType(e.type) && e.type !== "tower") continue;
    if (Math.hypot(e.x - c.x, e.y - c.y) <= reach) return true;
  }
  return false;
}

function ownsDiamondSmelter(state: MatchState, playerId: string): boolean {
  const c = diamondCentre(state);
  const reach = CENTRE_HOLD_TILES * state.tileSize;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== "smelter" || e.hp <= 0) continue;
    if (Math.hypot(e.x - c.x, e.y - c.y) <= reach) return true;
  }
  return false;
}

/** Footprint on the diamond field, nearest its middle, where a Smelter pours the diamond rate. */
export function findDiamondSmelterTile(state: MatchState): { tx: number; ty: number } | null {
  const def = catalog("smelter");
  const c = diamondCentre(state);
  const ts = state.tileSize;
  const ox = c.x / ts - def.tileW / 2;
  const oy = c.y / ts - def.tileH / 2;
  const rich = SMELTER_SCRAP_PER_SEC * DIAMOND_SCRAP_MUL;
  const yieldAt = (x: number, y: number): number => scrapAt(state, x, y);
  let best: { tx: number; ty: number } | null = null;
  let bestD = Infinity;
  const reach = CENTRE_HOLD_TILES;
  for (let ty = Math.floor(oy - reach); ty <= oy + reach; ty++) {
    for (let tx = Math.floor(ox - reach); tx <= ox + reach; tx++) {
      if (tx < 0 || ty < 0 || tx + def.tileW > state.width || ty + def.tileH > state.height) continue;
      const d = Math.hypot(tx - ox, ty - oy);
      if (d >= bestD) continue;
      if (smelterRateOn(yieldAt, tx, ty) < rich || !smelterSiteOk(state, tx, ty)) continue;
      best = { tx, ty };
      bestD = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- fortify

/** Sites around the Core, degrees off the enemy axis. */
function aroundHq(
  state: MatchState,
  p: SimPlayer,
  hq: Entity,
  rows: readonly (readonly [BuildingType, string, number, number])[],
): Site[] {
  const axis = enemyAxis(state, p.playerId, hq);
  const ts = state.tileSize;
  return rows.map(([type, name, deg, tiles]) => ({
    type,
    at: along(hq, rotate(axis, deg), tiles * ts),
    key: `base:${name}`,
  }));
}

/**
 * Towers and a Bunker on the side of the base that faces the enemy, one tower behind.
 * The first one is the main tower: its wall line gets a gate.
 */
function fortifySites(state: MatchState, p: SimPlayer, hq: Entity): Site[] {
  return aroundHq(state, p, hq, [
    ["tower", "front", 0, BASE_RING_TILES],
    ["tower", "left", 60, BASE_RING_TILES],
    ["tower", "right", -60, BASE_RING_TILES],
    ["bunker", "bunker", 25, BASE_RING_TILES * 0.75],
    ["tower", "rear", 180, BASE_RING_TILES * 0.8],
  ]);
}

/**
 * Inside the tower ring, once the towers and the Bunker are under way: an MG nest and a
 * Pak 36 on the approach, a Tobruk on one flank, a timber lookout behind the Core.
 */
function batterySites(state: MatchState, p: SimPlayer, hq: Entity): Site[] {
  return aroundHq(state, p, hq, [
    ["mgnest", "mg", -30, 16],
    ["pak36", "pak", 30, 16],
    ["tobruk", "pit", 110, 22],
    ["hochstand", "look", 200, 14],
  ]);
}

/** Pak 43 and the heavy casemate on the approach, once the CPU is campaigning. */
function heavySites(state: MatchState, p: SimPlayer, hq: Entity): Site[] {
  return aroundHq(state, p, hq, [
    ["pak43", "pak43", -15, 26],
    // On the approach, just inside the front tower. A 3×2 pad will not fit in the inner yard once the ring is up.
    ["casemate", "case", 0, 30],
  ]);
}

/** Flak on the other flank, for when enemy planes are about. */
function flakSite(state: MatchState, p: SimPlayer, hq: Entity): Site {
  return aroundHq(state, p, hq, [["flak", "flak", -75, 26]])[0]!;
}

/** Fire-control tower on the near side of the diamond field. */
function leitSite(state: MatchState, p: SimPlayer): Site {
  const c = diamondCentre(state);
  const foe = enemyHq(state, p.playerId);
  const ts = state.tileSize;
  const toFoe = foe ? unit(foe.x - c.x, foe.y - c.y) : { x: 1, y: 0 };
  // Past the diamond Smelter's lane. The watch-tower ring sits on that lane and would leave the tower no pad.
  const out = CENTRE_RING_TILES + 10;
  return { type: "leitturm", at: clampToMap(state, along(c, toFoe, out * ts)), key: "mid:leit" };
}

/** Towers round the diamond field, then a line of outposts reaching toward the enemy. */
function campaignSites(state: MatchState, p: SimPlayer): Site[] {
  const c = diamondCentre(state);
  const foe = enemyHq(state, p.playerId);
  const ts = state.tileSize;
  const toFoe = foe ? unit(foe.x - c.x, foe.y - c.y) : { x: 1, y: 0 };
  const span = foe ? Math.hypot(foe.x - c.x, foe.y - c.y) : 0;
  const sites: Site[] = [
    { type: "tower", at: along(c, toFoe, CENTRE_RING_TILES * ts), key: "mid:front" },
    { type: "tower", at: along(c, rotate(toFoe, 80), CENTRE_RING_TILES * ts), key: "mid:left" },
    { type: "tower", at: along(c, rotate(toFoe, -80), CENTRE_RING_TILES * ts), key: "mid:right" },
  ];
  if (foe) {
    // Outposts step out from the middle along both flanks, stopping well short of the enemy yard.
    const side = { x: -toFoe.y, y: toFoe.x };
    for (const [i, share, lean] of [
      [1, 0.35, 0.18],
      [2, 0.35, -0.18],
      [3, 0.5, 0.25],
      [4, 0.5, -0.25],
    ] as const) {
      const mid = along(c, toFoe, span * share);
      sites.push({ type: "tower", at: along(mid, side, span * lean), key: `push:${i}` });
    }
  }
  return sites.map((s) => ({ ...s, at: clampToMap(state, s.at) }));
}

function siteHeld(state: MatchState, playerId: string, site: Site): boolean {
  const reach = SITE_HOLD_TILES * state.tileSize;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== site.type || e.hp <= 0) continue;
    if (Math.hypot(e.x - site.at.x, e.y - site.at.y) <= reach) return true;
  }
  return false;
}

function siteFailed(state: MatchState, plan: AiPlan, site: Site): boolean {
  return (plan.siteRetry[site.key] ?? 0) > state.tick;
}

/**
 * Fortified: every base site stands or has no room, every base tower has a wall line and at
 * least two soldiers, and the gate is in. A base that cannot get there in time campaigns anyway.
 * An Aggressive CPU waits only for the front tower and the Bunker, and not for the walls.
 */
function fortified(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan): boolean {
  const prof = aiProfile(p.ai);
  if (state.tick >= prof.fortifyMaxTicks) return true;
  for (const site of fortifySites(state, p, hq)) {
    // The tower behind the Core is a bonus: the front and both flanks are the defence.
    if (site.key === "base:rear") continue;
    if (!prof.fortifyFlanks && (site.key === "base:left" || site.key === "base:right")) continue;
    if (!siteHeld(state, p.playerId, site) && !siteFailed(state, plan, site)) return false;
  }
  if (!prof.fortifyWalls) return true;
  if (plan.gate || p.line) return false;
  const home = (BASE_RING_TILES + SITE_HOLD_TILES) * state.tileSize;
  for (const t of state.entities.values()) {
    if (t.ownerId !== p.playerId || t.type !== "tower" || t.hp <= 0) continue;
    if (Math.hypot(t.x - hq.x, t.y - hq.y) > home) continue;
    if (!plan.walled.includes(t.id)) return false;
    if (t.garrison.length < Math.min(2, catalog("tower").garrisonCap ?? 2)) return false;
  }
  return true;
}

/** The guns-and-garrisons lane: place a finished defence at its site, or start the next one. */
function defenceLane(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan): void {
  const job = p.defence;
  if (job?.ready) {
    placeDefence(state, p, plan, job);
    return;
  }
  if (job) return;
  // A site with no room is skipped for a while and the next one tried, a few per pass.
  let tries = 3;
  for (const next of nextDefences(state, p, hq, plan)) {
    // A locked defence waits for its Research Facility or Radar. Do not save scrap for it yet.
    if (buildTechMissing(state, p.playerId, next.type).length > 0) continue;
    if (p.scrap < catalog(next.type).cost || tries-- <= 0) return;
    if (next.site) {
      // Check the ground now, so the scrap is not sunk into a gun with nowhere to stand.
      // A turned pad is larger. When it will not fit, the fort still goes up facing east.
      let facing = placeFacing(state, p.playerId, next.type, next.site.at);
      if (!findSiteNear(state, p.playerId, next.type, next.site.at, facing)) {
        if (facing === 0 || !findSiteNear(state, p.playerId, next.type, next.site.at, 0)) {
          plan.siteRetry[next.site.key] = state.tick + CPU_NO_ROOM_RETRY_TICKS;
          continue;
        }
        facing = 0;
      }
      plan.site = next.site.at;
      plan.face = facing;
    } else {
      delete plan.site;
      delete plan.face;
      if (!findBuildTile(state, p.playerId, next.type)) {
        noRoom(state, p, next.type);
        continue;
      }
    }
    const started = applyCommand(state, p.playerId, { type: "cmd.build", building: next.type }).ok;
    if (started && next.type === "tower" && next.site && !next.site.key.startsWith("base:")) {
      plan.nextTowerTick = state.tick + towerEvery(state, p.playerId);
    }
    return;
  }
}

/** Wait between campaign towers: the more Smelters pour, the sooner the next goes up. */
function towerEvery(state: MatchState, playerId: string): number {
  const smelters = Math.max(1, countType(state, playerId, "smelter"));
  return Math.max(CPU_TOWER_MIN_TICKS, Math.round((CPU_TOWER_EVERY_TICKS * 2) / (1 + smelters)));
}

function placeDefence(state: MatchState, p: SimPlayer, plan: AiPlan, job: StructureJob): void {
  if (!isBuildingType(job.type)) return;
  const type = job.type;
  const facing = plan.face ?? placeFacing(state, p.playerId, type, plan.site);
  const spot = plan.site ? findSiteNear(state, p.playerId, type, plan.site, facing) : findBuildTile(state, p.playerId, type);
  if (spot) {
    applyCommand(state, p.playerId, { type: "cmd.place", building: type, tx: spot.tx, ty: spot.ty, facing });
  } else {
    applyCommand(state, p.playerId, { type: "cmd.cancel", what: "structure", building: type });
    noRoom(state, p, type);
  }
  delete plan.site;
  delete plan.face;
}

/**
 * Base sites first, and again whenever one falls: the tower ring, then the nest, Pak 36,
 * Tobruk, and lookout. A CIWS once enemy planes are about. Campaigning, a Flak gun for
 * those planes, a RAM for the rockets, a Pak 43 and a casemate on the approach, then a
 * fire-control tower on the middle and a watch tower every CPU_TOWER_EVERY_TICKS out
 * toward the enemy.
 */
function* nextDefences(
  state: MatchState,
  p: SimPlayer,
  hq: Entity,
  plan: AiPlan,
): Generator<{ type: BuildingType; site?: Site }> {
  const roomy = (t: BuildingType): boolean => (p.aiNoRoomUntil?.[t] ?? 0) <= state.tick;
  const air = plan.airSeenTick != null;
  // Towers need soldiers to crew them: wait for the Barracks and the first riflemen.
  const crews = ownsLive(state, p.playerId, "muster") && countType(state, p.playerId, "rifleman") >= FIRST_WAVE_TROOPERS;
  const open = (site: Site): boolean => !siteHeld(state, p.playerId, site) && !siteFailed(state, plan, site);
  if (air && countType(state, p.playerId, "ciws") === 0 && roomy("ciws") && powerFor(state, p.playerId, "ciws")) {
    yield { type: "ciws" };
  }
  if (crews) {
    for (const site of [...fortifySites(state, p, hq), ...batterySites(state, p, hq)]) {
      if (!open(site)) continue;
      yield { type: site.type, site };
    }
  }
  if (plan.posture !== "campaign") return;
  if (air && countType(state, p.playerId, "flak") === 0 && roomy("flak")) {
    const site = flakSite(state, p, hq);
    if (open(site)) yield { type: "flak", site };
  }
  if (air && plan.waves >= 2 && countType(state, p.playerId, "ram") === 0 && roomy("ram") && powerFor(state, p.playerId, "ram")) {
    yield { type: "ram" };
  }
  if (crews) {
    for (const site of heavySites(state, p, hq)) {
      if (!open(site)) continue;
      yield { type: site.type, site };
    }
  }
  if (!crews || !centreHeld(state, p.playerId)) return;
  const leit = leitSite(state, p);
  if (open(leit)) yield { type: "leitturm", site: leit };
  if (state.tick < plan.nextTowerTick) return;
  // Every slit is a soldier the waves do without.
  if (crewSlots(state, p.playerId) + (catalog("tower").garrisonCap ?? 0) > CREW_BUDGET) return;
  for (const site of campaignSites(state, p)) {
    // The middle sites come first, so an outpost only goes up once the ground behind it is held.
    if (!open(site)) continue;
    yield { type: site.type, site };
  }
}

function powerFor(state: MatchState, playerId: string, type: BuildingType): boolean {
  const pow = powerOf(state, playerId);
  return pow.used + Math.max(0, -catalog(type).power) <= pow.provided;
}

/** Legal footprint for `type` nearest `want`, within SITE_SEARCH_TILES and the build radius. */
export function findSiteNear(
  state: MatchState,
  playerId: string,
  type: BuildingType,
  want: Vec,
  facing = 0,
): { tx: number; ty: number } | null {
  const box = turnedBox(type, facing);
  const ts = state.tileSize;
  const cx = Math.floor(want.x / ts) - Math.floor(box.w / 2);
  const cy = Math.floor(want.y / ts) - Math.floor(box.h / 2);
  for (let r = 0; r <= SITE_SEARCH_TILES; r++) {
    let best: { tx: number; ty: number } | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const d = dx * dx + dy * dy;
        if (d >= bestD) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx + box.w > state.width || ty + box.h > state.height) continue;
        if (buildingSiteError(state, type, tx, ty, playerId, facing)) continue;
        if (!inBuildRadius(state, playerId, tx, ty, box.w, box.h, buildRadiusOf(type))) continue;
        if (!keepsLanes(state, tx, ty, box.w, box.h)) continue;
        best = { tx, ty };
        bestD = d;
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * The wall lane. Every tower gets a short concrete line across its front, facing the enemy;
 * the main base tower gets a long one with a gate in the middle for the army to pass.
 */
function lineLane(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan): void {
  if (p.line) return;
  if (plan.gate) {
    const g = plan.gate;
    delete plan.gate;
    if (gateSiteAt(state.entities.values(), p.playerId, g.x, g.y)) {
      applyCommand(state, p.playerId, { type: "cmd.field", ids: [], structure: "gate", x: g.x, y: g.y, facing: g.facing });
    }
    return;
  }
  const main = fortifySites(state, p, hq)[0]!;
  for (const t of state.entities.values()) {
    if (t.ownerId !== p.playerId || t.type !== "tower" || t.hp <= 0 || plan.walled.includes(t.id)) continue;
    const gated = Math.hypot(t.x - main.at.x, t.y - main.at.y) <= SITE_HOLD_TILES * state.tileSize;
    const pieces = gated ? GATE_WALL_PIECES : WALL_PIECES;
    if (p.scrap < catalog("wall").cost * pieces) return;
    plan.walled.push(t.id);
    layWall(state, p, plan, t, pieces, gated);
    return;
  }
}

/** Try a few depths in front of the tower until a line sites. False when none would. */
function layWall(state: MatchState, p: SimPlayer, plan: AiPlan, tower: Entity, pieces: number, gated: boolean): boolean {
  const ts = state.tileSize;
  const foe = enemyHq(state, p.playerId);
  const hq = hqOf(state, p.playerId);
  const dir = foe ? unit(foe.x - tower.x, foe.y - tower.y) : hq ? unit(tower.x - hq.x, tower.y - hq.y) : { x: 1, y: 0 };
  const facing = Math.atan2(dir.y, dir.x);
  const side = { x: -dir.y, y: dir.x };
  const half = ((fieldSpan("wall")?.length ?? 24) * pieces) / 2;
  for (const extra of [0, 3, -2, 6]) {
    const mid = along(tower, dir, (tower.tileW / 2 + WALL_GAP_TILES + extra) * ts);
    const a = along(mid, side, -half);
    const b = along(mid, side, half);
    const res = applyCommand(state, p.playerId, {
      type: "cmd.field",
      ids: [],
      structure: "wall",
      x: a.x,
      y: a.y,
      facing,
      x2: b.x,
      y2: b.y,
    });
    if (!res.ok) continue;
    if (gated && (p.line?.sites?.length ?? 0) >= pieces) plan.gate = { x: mid.x, y: mid.y, facing };
    return true;
  }
  return false;
}

/**
 * Fill each garrison and empty gun with soldiers who are idle, nearest first, a mix of
 * kinds per building. A Tobruk takes a mortarman first; a lookout takes a sniper.
 * A force holding the middle crews the posts there. Waves never take a garrisoned soldier.
 */
function crewBunkers(state: MatchState, p: SimPlayer, plan: AiPlan): void {
  const inForce = forceMembers(plan);
  const holding = new Set<number>();
  for (const f of plan.forces) if (f.goal === "centre" && f.route.length === 0) for (const id of f.ids) holding.add(id);
  for (const b of state.entities.values()) {
    if (b.ownerId !== p.playerId || !(CREWED as readonly string[]).includes(b.type) || b.hp <= 0) continue;
    const order = crewOrder(b.type);
    let room = (catalog(b.type).garrisonCap ?? 0) - b.garrison.length;
    if (room <= 0) continue;
    // Soldiers already walking in count toward the crew.
    for (const e of state.entities.values()) {
      if (e.ownerId === p.playerId && e.order?.kind === "garrison" && e.order.targetId === b.id) room--;
    }
    if (room <= 0) continue;
    const inside = new Set<string>();
    for (const id of b.garrison) {
      const o = state.entities.get(id);
      if (o) inside.add(o.type);
    }
    const idle: Entity[] = [];
    for (const e of state.entities.values()) {
      if (e.ownerId !== p.playerId || e.hp <= 0 || e.garrisonedIn || !order.includes(e.type)) continue;
      if (inForce.has(e.id) && !holding.has(e.id)) continue;
      if (e.order && !e.order.auto && !holding.has(e.id)) continue;
      idle.push(e);
    }
    const ids: number[] = [];
    while (ids.length < room && idle.length > 0) {
      let bestI = -1;
      let bestScore = Infinity;
      idle.forEach((e, i) => {
        // A kind already inside goes to the back of the line; then preference, then distance.
        const score =
          (inside.has(e.type) ? 100 : 0) + order.indexOf(e.type) * 10 + Math.hypot(e.x - b.x, e.y - b.y) / 1e4;
        if (score < bestScore) {
          bestScore = score;
          bestI = i;
        }
      });
      const pick = idle.splice(bestI, 1)[0]!;
      inside.add(pick.type);
      ids.push(pick.id);
    }
    for (const id of ids) {
      applyCommand(state, p.playerId, { type: "cmd.garrison", ids: [id], buildingId: b.id });
    }
  }
}

/** New troops walk out to the muster point in front of the Core, clear of the factory doors. */
function rallyFactories(state: MatchState, p: SimPlayer, hq: Entity): void {
  let at: Vec | undefined;
  for (const b of state.entities.values()) {
    if (b.ownerId !== p.playerId || b.hp <= 0 || (b.type !== "muster" && b.type !== "armory" && b.type !== "cyborgcentral" && b.type !== "conversion" && b.type !== "forge")) continue;
    at ??= homeMuster(state, p, hq);
    if (b.rally && Math.hypot(b.rally.x - at.x, b.rally.y - at.y) < 2 * state.tileSize) continue;
    applyCommand(state, p.playerId, { type: "cmd.rally", ids: [b.id], x: at.x, y: at.y });
  }
}

// ---------------------------------------------------------------- air

/** Remember the first enemy plane, drone, or Airfield the CPU sees. */
function watchSky(state: MatchState, p: SimPlayer, plan: AiPlan): void {
  if (plan.airSeenTick != null) return;
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || !e.ownerId || allies(state, p.playerId, e.ownerId)) continue;
    if (!isAircraftType(e.type) && !isDroneType(e.type) && !isAirfieldType(e.type)) continue;
    if (!canSeeEntity(state, p.playerId, e)) continue;
    plan.airSeenTick = state.tick;
    return;
  }
}

/** Parked fighters take off after an enemy plane seen in the air. */
function scramble(state: MatchState, p: SimPlayer, hq: Entity): void {
  let target: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.hp <= 0 || !e.ownerId || allies(state, p.playerId, e.ownerId)) continue;
    if (!isAircraftType(e.type) || !isAirborne(e)) continue;
    const d = Math.hypot(e.x - hq.x, e.y - hq.y);
    if (d >= bestD || !canSeeEntity(state, p.playerId, e)) continue;
    target = e;
    bestD = d;
  }
  if (!target) return;
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.hp <= 0 || e.type !== "fw190" || !e.air) continue;
    if (e.air.phase !== "parked" || e.air.rounds <= 0) continue;
    ids.push(e.id);
  }
  if (ids.length > 0) applyCommand(state, p.playerId, { type: "cmd.attackmove", ids, x: target.x, y: target.y });
}

/** Every armed dive bomber on its pad takes off and attack-moves at the point. */
function sortie(state: MatchState, p: SimPlayer, x: number, y: number): void {
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.hp <= 0 || !isAircraftType(e.type) || !e.air) continue;
    if (e.air.phase !== "parked" || e.air.bombs < STUKA_BOMBS) continue;
    ids.push(e.id);
  }
  if (ids.length === 0) return;
  applyCommand(state, p.playerId, { type: "cmd.attackmove", ids, x, y });
}

// ---------------------------------------------------------------- defense

/** Seen enemies inside the base pull every free fighter near home, and the planes. */
function defendBase(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan): void {
  const reach = CPU_DEFEND_TILES * state.tileSize;
  defendPoint(state, p, plan, hq, reach, reach * 1.5, true);
}

/** Seen enemies at a held middle pull the fighters standing near it. */
function defendCentre(state: MatchState, p: SimPlayer, plan: AiPlan): void {
  if (!centreHeld(state, p.playerId)) return;
  const reach = CENTRE_DEFEND_TILES * state.tileSize;
  defendPoint(state, p, plan, diamondCentre(state), reach, reach * 1.5, false);
}

function defendPoint(
  state: MatchState,
  p: SimPlayer,
  plan: AiPlan,
  at: Vec,
  reach: number,
  pull: number,
  planes: boolean,
): void {
  let intruder: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.wreck || !e.ownerId || e.air || e.dormant || isTorpedoBody(e.type)) continue;
    if (allies(state, p.playerId, e.ownerId)) continue;
    const d = Math.hypot(e.x - at.x, e.y - at.y);
    if (d > reach || d >= bestD) continue;
    if (!canSeeEntity(state, p.playerId, e)) continue;
    intruder = e;
    bestD = d;
  }
  if (!intruder) return;
  // A wave out in the field keeps going; a force holding the middle turns to defend it.
  const busy = new Set<number>();
  for (const f of plan.forces) if (f.goal !== "centre" || f.route.length > 0) for (const id of f.ids) busy.add(id);
  const ids: number[] = [];
  for (const e of state.entities.values()) {
    if (!freeFighter(e, p.playerId) || busy.has(e.id)) continue;
    if (e.order && !e.order.auto && e.order.kind !== "move") continue;
    if (Math.hypot(e.x - at.x, e.y - at.y) > pull) continue;
    ids.push(e.id);
  }
  if (ids.length > 0) {
    // A boat or a swimmer is met from the bank, not by swimming out to it.
    const to = onWater(state, intruder) ? groundNear(state, intruder) : intruder;
    applyCommand(state, p.playerId, { type: "cmd.attackmove", ids, x: to.x, y: to.y });
  }
  if (planes) sortie(state, p, intruder.x, intruder.y);
}

// ---------------------------------------------------------------- campaign

function forceMembers(plan: AiPlan): Set<number> {
  const out = new Set<number>();
  for (const f of plan.forces) for (const id of f.ids) out.add(id);
  return out;
}

/**
 * Run every force a bound, then send the next one out when its time comes and the army is
 * big enough. The middle first; after that, waves at the enemy round alternate flanks, split
 * into a pincer when the army is large.
 */
function campaign(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan): void {
  plan.forces = plan.forces.filter((f) => stepForce(state, p, hq, plan, f));
  if (plan.posture !== "campaign") return;
  const prof = aiProfile(p.ai);
  if (state.tick < p.aiNextAttackTick) return;
  if (plan.forces.length >= FORCES_MAX) {
    p.aiNextAttackTick = state.tick + CPU_ATTACK_RETRY_TICKS;
    return;
  }
  const free = freeArmy(state, p, plan);
  const centreForce = plan.forces.some((f) => f.goal === "centre");
  if (!centreHeld(state, p.playerId) && !centreForce) {
    if (free.length < prof.centreForce) {
      p.aiNextAttackTick = state.tick + CPU_ATTACK_RETRY_TICKS;
      return;
    }
    const c = groundNear(state, diamondCentre(state));
    launch(state, p, hq, plan, free, "centre", [homeMuster(state, p, hq), c]);
    p.aiNextAttackTick = state.tick + prof.attackEveryTicks;
    return;
  }
  const foe = enemyHq(state, p.playerId);
  // At the unit cap the army cannot grow into a bigger wave: send what stands ready.
  const capped = unitCount(state, p.playerId) >= UNIT_CAP - 2;
  const need = capped ? Math.min(waveSize(prof, plan.waves), prof.waveMin) : waveSize(prof, plan.waves);
  if (!foe || free.length < need) {
    p.aiNextAttackTick = state.tick + CPU_ATTACK_RETRY_TICKS;
    return;
  }
  const gather = musterPoint(state, p, hq);
  if (free.length >= need * prof.pincerMul && plan.forces.length + 2 <= FORCES_MAX) {
    const [a, b] = splitRanks(free);
    launch(state, p, hq, plan, a, "enemy", flankRoute(state, gather, foe, -1));
    launch(state, p, hq, plan, b, "enemy", flankRoute(state, gather, foe, 1));
  } else {
    launch(state, p, hq, plan, free, "enemy", flankRoute(state, gather, foe, plan.flank));
    plan.flank = plan.flank === 1 ? -1 : 1;
  }
  plan.waves++;
  p.aiNextAttackTick = state.tick + prof.attackEveryTicks;
}

function unitCount(state: MatchState, playerId: string): number {
  let n = 0;
  for (const e of state.entities.values()) if (e.ownerId === playerId && e.kind === "unit" && e.hp > 0 && !isTorpedoBody(e.type)) n++;
  return n;
}

export function waveSize(prof: AiProfile, waves: number): number {
  return Math.min(prof.waveMax, prof.waveMin + prof.waveGrowth * waves);
}

/** Gather, swing wide round one flank, then the enemy Core. */
function flankRoute(state: MatchState, gather: Vec, foe: Entity, flank: -1 | 1): Vec[] {
  const dir = unit(foe.x - gather.x, foe.y - gather.y);
  const span = Math.hypot(foe.x - gather.x, foe.y - gather.y);
  const side = { x: -dir.y * flank, y: dir.x * flank };
  const swing = along(along(gather, dir, span * 0.5), side, span * 0.3);
  return [gather, groundNear(state, swing), { x: foe.x, y: foe.y }];
}

/** Two halves with the same mix: deal each rank out in turn. */
function splitRanks(units: Entity[]): [Entity[], Entity[]] {
  const sorted = units.slice().sort((a, b) => rankIndex(rankOf(a.type)) - rankIndex(rankOf(b.type)) || a.id - b.id);
  const a: Entity[] = [];
  const b: Entity[] = [];
  sorted.forEach((e, i) => (i % 2 === 0 ? a : b).push(e));
  return [a, b];
}

function launch(
  state: MatchState,
  p: SimPlayer,
  hq: Entity,
  plan: AiPlan,
  units: Entity[],
  goal: AiForce["goal"],
  route: Vec[],
): void {
  if (units.length === 0) return;
  const force: AiForce = {
    id: plan.nextForceId++,
    ids: units.map((e) => e.id),
    goal,
    route,
    size0: units.length,
    boundTick: state.tick - BOUND_TIMEOUT_TICKS,
  };
  plan.forces.push(force);
  escortWave(state, p, force.ids);
  stepForce(state, p, hq, plan, force);
}

/** Fighters free for a force: not garrisoned, not in a force, not busy on an order of their own. */
function freeArmy(state: MatchState, p: SimPlayer, plan: AiPlan): Entity[] {
  const taken = forceMembers(plan);
  const out: Entity[] = [];
  for (const e of state.entities.values()) {
    if (!freeFighter(e, p.playerId) || taken.has(e.id)) continue;
    if (e.order && !e.order.auto && e.order.kind !== "move") continue;
    out.push(e);
  }
  return out;
}

/** A fighter for the land army. Warships keep to the fleet (seaWork). */
function freeFighter(e: Entity, playerId: string): boolean {
  if (e.ownerId !== playerId || e.hp <= 0 || e.wreck || e.garrisonedIn) return false;
  if (e.kind !== "unit" || !fires(e.type)) return false;
  if (isAircraftType(e.type) || isDroneType(e.type) || isNavalType(e.type) || e.braced) return false;
  return e.state !== "deploy" && e.state !== "undeploy";
}

export function rankOf(type: string): Rank {
  if (BACK_RANK.has(type)) return "back";
  if (FRONT_INFANTRY.has(type)) return "front";
  if (!isInfantryType(type as Entity["type"]) && isArmoredType(type as Entity["type"])) return "front";
  return "mid";
}

function rankIndex(r: Rank): number {
  return r === "front" ? 0 : r === "mid" ? 1 : 2;
}

/** Where the body of the force stands: the median on each axis, so a straggler does not drag it back. */
function middleOf(units: readonly Entity[]): Vec {
  const med = (xs: number[]): number => {
    xs.sort((a, b) => a - b);
    const m = xs.length >> 1;
    return xs.length % 2 ? xs[m]! : (xs[m - 1]! + xs[m]!) / 2;
  };
  return { x: med(units.map((e) => e.x)), y: med(units.map((e) => e.y)) };
}

/**
 * One pass of a force. It fights what it meets, regroups, then walks the next bound of its
 * route in ranks. Returns false once it is spent: broken, arrived for good, or out of targets.
 */
function stepForce(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan, f: AiForce): boolean {
  let units: Entity[] = [];
  for (const id of f.ids) {
    const e = state.entities.get(id);
    if (e && freeFighter(e, p.playerId)) units.push(e);
  }
  if (units.length === 0) return false;
  const ts = state.tileSize;
  // A fighter left far behind, stuck or lost, drops out; he joins a later wave from home.
  if (f.gathered) {
    const mid = middleOf(units);
    units = units.filter((e) => Math.hypot(e.x - mid.x, e.y - mid.y) <= STRAGGLE_TILES * ts);
  }
  f.ids = units.map((e) => e.id);
  if (units.length < Math.max(FORCE_MIN, Math.ceil(f.size0 * FORCE_BREAK_SHARE))) {
    // Too few left to push: fall back on the muster point and wait for the next wave.
    const back = musterPoint(state, p, hq);
    if (f.ids.length > 0) applyCommand(state, p.playerId, { type: "cmd.move", ids: f.ids, x: back.x, y: back.y });
    return false;
  }
  const c = middleOf(units);
  if (f.route.length === 0) return holdObjective(state, p, f, units, c);
  let target = f.route[0]!;
  // The enemy Core is a building: the force has arrived once it stands in the yard.
  const arrive = (): number => (f.goal === "enemy" && f.route.length === 1 ? ARRIVE_TILES * 2.5 : ARRIVE_TILES) * ts;
  while (Math.hypot(target.x - c.x, target.y - c.y) <= arrive()) {
    nextLeg(state, f);
    if (f.route.length === 0) return holdObjective(state, p, f, units, c);
    target = f.route[0]!;
  }
  // No closer for a while: everyone moves on, shooting or not. Much longer and the point is given up.
  const dist = Math.hypot(target.x - c.x, target.y - c.y);
  if (f.bestDist == null || dist < f.bestDist - 3 * ts) {
    f.bestDist = dist;
    f.progressTick = state.tick;
  }
  const stuck = state.tick - (f.progressTick ?? state.tick);
  if (stuck >= STALL_TICKS * 2) {
    nextLeg(state, f);
    if (f.route.length === 0) return holdObjective(state, p, f, units, c);
    target = f.route[0]!;
  }
  const stalled = stuck >= STALL_TICKS;
  // A real fight: hold the bound while it lasts, but not forever on one gun's target out of reach.
  const fighting = units.filter((e) => inFight(state, e));
  if (!stalled && fighting.length >= units.length * ENGAGED_SHARE && state.tick < f.boundTick + ENGAGED_MAX_TICKS) return true;
  const settled = units.filter((e) => e.waypoints.length === 0).length >= units.length * 0.7;
  if (!stalled && !settled && state.tick < f.boundTick + BOUND_TIMEOUT_TICKS) return true;
  // The ones still shooting keep at it; the rest walk the bound and they catch up.
  if (!stalled && fighting.length > 0 && fighting.length < units.length) units = units.filter((e) => !fighting.includes(e));
  const dir = unit(target.x - c.x, target.y - c.y);
  const d = Math.hypot(target.x - c.x, target.y - c.y);
  const last = f.route.length === 1;
  const step = last && d <= BOUND_TILES * ts * 1.5 ? d : Math.min(d, BOUND_TILES * ts);
  advanceInRanks(state, p, units, along(c, dir, step), dir);
  f.boundTick = state.tick;
  return true;
}

/** On a live target within reach of his gun. A target left over from far away does not count. */
function inFight(state: MatchState, e: Entity): boolean {
  const t = e.attackTarget != null ? state.entities.get(e.attackTarget) : undefined;
  if (!t || t.hp <= 0) return false;
  const reach = (catalog(e.type).rangeTiles * 1.5 + 4) * state.tileSize;
  return Math.hypot(t.x - e.x, t.y - e.y) <= reach;
}

function nextLeg(state: MatchState, f: AiForce): void {
  f.route.shift();
  f.gathered = true;
  delete f.bestDist;
  f.progressTick = state.tick;
}

/**
 * At the objective. A centre force holds the diamond field until towers there are crewed,
 * then frees its fighters for the waves. An enemy force keeps attacking the enemy Core,
 * and the dive bombers go in with it.
 */
function holdObjective(state: MatchState, p: SimPlayer, f: AiForce, units: Entity[], c: Vec): boolean {
  if (f.goal === "centre") {
    if (centreSecured(state, p.playerId)) return false;
    const mid = diamondCentre(state);
    const idle = units.filter((e) => !e.order && Math.hypot(e.x - mid.x, e.y - mid.y) > CENTRE_RING_TILES * state.tileSize);
    if (idle.length > 0) advanceInRanks(state, p, idle, groundNear(state, mid), unit(mid.x - c.x, mid.y - c.y));
    return true;
  }
  const foe = enemyHq(state, p.playerId);
  if (!foe) return false;
  // Every so often the whole force is sent in again, so no gun stays fixed on a target it cannot hurt.
  const refresh = state.tick >= f.boundTick + ENGAGED_MAX_TICKS;
  const idle = refresh ? units : units.filter((e) => !e.order || e.order.auto);
  if (idle.length > 0) {
    advanceInRanks(state, p, idle, { x: foe.x, y: foe.y }, unit(foe.x - c.x, foe.y - c.y));
    sortie(state, p, foe.x, foe.y);
    f.boundTick = state.tick;
  }
  return true;
}

/** The middle is held by a tower with men in it, or the Smelter stands and the force is not needed. */
function centreSecured(state: MatchState, playerId: string): boolean {
  const c = diamondCentre(state);
  const reach = CENTRE_HOLD_TILES * state.tileSize;
  let crewed = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== "tower" || e.hp <= 0) continue;
    if (Math.hypot(e.x - c.x, e.y - c.y) > reach) continue;
    if (e.garrison.length >= 2) crewed++;
  }
  return crewed >= 1;
}

/**
 * Attack-move each rank to its own point on the line of advance: hulls and brawlers on the
 * point, rifles and rocketmen a rank behind, long guns two ranks back where the line covers them.
 * The leading rank present stands on the point.
 */
function advanceInRanks(state: MatchState, p: SimPlayer, units: Entity[], to: Vec, dir: Vec): void {
  const ranks: Record<Rank, number[]> = { front: [], mid: [], back: [] };
  for (const e of units) ranks[rankOf(e.type)].push(e.id);
  const gap = RANK_GAP_TILES * state.tileSize;
  let k = 0;
  for (const r of ["front", "mid", "back"] as const) {
    const ids = ranks[r];
    if (ids.length === 0) continue;
    const at = groundNear(state, along(to, dir, -k * gap));
    applyCommand(state, p.playerId, { type: "cmd.attackmove", ids, x: at.x, y: at.y });
    k++;
  }
}

/** Medics, trucks, and the drone op each walk out beside a fighter of the wave. */
function escortWave(state: MatchState, p: SimPlayer, fighters: number[]): void {
  if (fighters.length === 0) return;
  let i = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== p.playerId || e.hp <= 0 || e.wreck || e.garrisonedIn || !ESCORTS.has(e.type)) continue;
    if (e.order && !e.order.auto) continue;
    const pick = escortPick(state, e, fighters, i++);
    if (pick == null) continue;
    applyCommand(state, p.playerId, { type: "cmd.guard", ids: [e.id], targetId: pick });
  }
}

/** Medics stay with soldiers, trucks with hulls. Anyone else takes the next fighter in turn. */
function escortPick(state: MatchState, e: Entity, fighters: number[], turn: number): number | null {
  const wantInfantry = e.type === "medic" ? true : e.type === "supply" ? false : null;
  const pool = fighters.filter((id) => {
    const f = state.entities.get(id);
    if (!f) return false;
    return wantInfantry == null || isInfantryType(f.type) === wantInfantry;
  });
  const from = pool.length > 0 ? pool : fighters;
  return from[turn % from.length] ?? null;
}

// ---------------------------------------------------------------- sea

/**
 * Bodies of water a boat can sail, 4-connected. Worked out again each strategy pass, so a new
 * bridge, a sunk hulk, or a Marine Base across a channel splits it the way the pathfinder sees it.
 */
interface Sea {
  tick: number;
  /** Body id per tile, from 1. 0 on land. */
  body: Int32Array;
  /** Tiles in each body, by id. */
  size: number[];
  /** Tiles from each water tile to the nearest bank or map edge (1 beside it). 0 on land. */
  depth: Int16Array;
  /** Deepest tile in each body, by id. */
  deepest: number[];
  /** Where each side's fleet strikes from on each body, or null when the body reaches nothing. */
  strike: Map<string, Map<number, Vec | null>>;
  /** Each side's Marine Base footprint in its yard, or null. */
  dock: Map<string, { tx: number; ty: number } | null>;
  /** Each side's Marine Base footprint out past the yard, for an engineer to raise, or null. */
  outDock: Map<string, { tx: number; ty: number } | null>;
  /** Tick the site answers above were last thrown away. */
  sitesAt: number;
}

const seaCache = new WeakMap<MatchState, Sea>();

/**
 * How long a side keeps its strike points and Marine Base sites while the water itself is unchanged.
 * Each answer is a walk over the whole map; a base or a harbour raised meanwhile is seen on the next pass.
 */
export const CPU_SITE_CACHE_TICKS = 10 * TICK_HZ;

function sameBody(a: Int32Array, b: Int32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function seaOf(state: MatchState): Sea {
  const old = seaCache.get(state);
  if (old && state.tick >= old.tick && state.tick - old.tick < CPU_MICRO_EVERY_TICKS) return old;
  const w = state.width;
  const h = state.height;
  const body = new Int32Array(w * h);
  const size = [0];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (body[i] || !walkable(state, i % w, Math.floor(i / w), "gunboat")) continue;
    const id = size.length;
    let n = 0;
    body[i] = id;
    stack.push(i);
    while (stack.length > 0) {
      const j = stack.pop()!;
      n++;
      const x = j % w;
      const y = Math.floor(j / w);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (body[k] || !walkable(state, nx, ny, "gunboat")) continue;
        body[k] = id;
        stack.push(k);
      }
    }
    size.push(n);
  }
  // The same water as last pass: the depths, strike points and sites still hold. Every strike point
  // and site is a walk over the whole map, so they are kept until the water changes or they go stale.
  if (old && sameBody(old.body, body)) {
    old.tick = state.tick;
    if (state.tick - old.sitesAt >= CPU_SITE_CACHE_TICKS) {
      old.strike = new Map();
      old.dock = new Map();
      old.outDock = new Map();
      old.sitesAt = state.tick;
    }
    return old;
  }
  // Depth: rings out from the banks, 8-neighbour, so a hull is kept off the shore on every side.
  const depth = new Int16Array(w * h);
  const deepest = size.map(() => 0);
  let ring: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!body[i]) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    let bank = false;
    for (let dy = -1; dy <= 1 && !bank; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !body[ny * w + nx]) bank = true;
      }
    }
    if (!bank) continue;
    depth[i] = 1;
    ring.push(i);
  }
  for (let d = 1; ring.length > 0; d++) {
    const next: number[] = [];
    for (const i of ring) {
      const id = body[i]!;
      if (d > deepest[id]!) deepest[id] = d;
      const x = i % w;
      const y = Math.floor(i / w);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (!body[k] || depth[k]) continue;
          depth[k] = d + 1;
          next.push(k);
        }
      }
    }
    ring = next;
  }
  const sea: Sea = { tick: state.tick, body, size, depth, deepest, strike: new Map(), dock: new Map(), outDock: new Map(), sitesAt: state.tick };
  seaCache.set(state, sea);
  return sea;
}

/** Body of water under a world point, or 0 ashore. */
function bodyAt(state: MatchState, at: Vec): number {
  const tx = Math.floor(at.x / state.tileSize);
  const ty = Math.floor(at.y / state.tileSize);
  if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return 0;
  return seaOf(state).body[ty * state.width + tx] ?? 0;
}

function onWater(state: MatchState, e: Vec): boolean {
  return isWater(state, Math.floor(e.x / state.tileSize), Math.floor(e.y / state.tileSize));
}

/** Open water a boat can lie on nearest a point, world pixels. */
function waterNear(state: MatchState, at: Vec): Vec | null {
  const ts = state.tileSize;
  const c = clampToMap(state, at);
  const t = nearestWalkable(state, Math.floor(c.x / ts), Math.floor(c.y / ts), "gunboat");
  return t ? { x: (t.x + 0.5) * ts, y: (t.y + 0.5) * ts } : null;
}

/**
 * Open water on this body nearest a point: as far off every bank as a Battle Ship's beam needs,
 * or the deepest the body has. A station on the bank leaves the big hulls grinding along the shore.
 */
function openWaterNear(state: MatchState, id: number, at: Vec): Vec | null {
  const sea = seaOf(state);
  const ts = state.tileSize;
  const need = Math.min(Math.ceil(catalog("battleship").radius / ts) + 1, sea.deepest[id] ?? 0);
  const gx = at.x / ts;
  const gy = at.y / ts;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < sea.body.length; i++) {
    if (sea.body[i] !== id || sea.depth[i]! < need) continue;
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy);
    if (d >= bestD || !walkable(state, x, y, "gunboat")) continue;
    best = i;
    bestD = d;
  }
  return best < 0 ? null : { x: ((best % state.width) + 0.5) * ts, y: (Math.floor(best / state.width) + 0.5) * ts };
}

/**
 * Open water on this body near the enemy Core, else near an enemy Marine Base, else near the
 * diamond field's middle: the first the body comes within CPU_SEA_REACH_TILES of. Null for a pond
 * too small or too far to matter.
 */
function strikeWater(state: MatchState, playerId: string, id: number): Vec | null {
  const sea = seaOf(state);
  let mine = sea.strike.get(playerId);
  if (!mine) sea.strike.set(playerId, (mine = new Map()));
  if (mine.has(id)) return mine.get(id) ?? null;
  let found: Vec | null = null;
  if ((sea.size[id] ?? 0) >= CPU_SEA_MIN_TILES) {
    const ts = state.tileSize;
    const foe = enemyHq(state, playerId);
    const goals: { at: Vec; slack: number }[] = [];
    if (foe) goals.push({ at: foe, slack: Math.max(foe.tileW, foe.tileH) / 2 });
    // An enemy Marine Base on the same water: its fleet's home, and a target the guns and torpedoes can reach.
    const me = hqOf(state, playerId);
    const harbours = [...state.entities.values()].filter(
      (b) => isDockType(b.type) && b.hp > 0 && !!b.ownerId && !allies(state, playerId, b.ownerId),
    );
    if (me) harbours.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    for (const b of harbours) goals.push({ at: b, slack: Math.max(b.tileW, b.tileH) / 2 });
    goals.push({ at: diamondCentre(state), slack: 0 });
    for (const g of goals) {
      const gx = g.at.x / ts;
      const gy = g.at.y / ts;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < sea.body.length; i++) {
        if (sea.body[i] !== id) continue;
        const d = Math.hypot((i % state.width) + 0.5 - gx, Math.floor(i / state.width) + 0.5 - gy);
        if (d < bestD) {
          best = i;
          bestD = d;
        }
      }
      if (best < 0 || bestD > CPU_SEA_REACH_TILES + g.slack) continue;
      found = openWaterNear(state, id, g.at);
      if (found) break;
    }
  }
  mine.set(id, found);
  return found;
}

/**
 * A Marine Base footprint on water worth a fleet, nearest the Core. `yard`: inside the build
 * range, for the yard to place. Otherwise within CPU_EXPAND_TILES of the Core and nearer it than
 * any enemy base, for an engineer to swim out and raise.
 */
export function findDockTile(state: MatchState, playerId: string, yard: boolean): { tx: number; ty: number } | null {
  const hq = hqOf(state, playerId);
  if (!hq) return null;
  const def = catalog("dock");
  const sea = seaOf(state);
  const anchors: Entity[] = [];
  const foes: Vec[] = [];
  for (const e of state.entities.values()) {
    if (yard && e.kind === "building" && e.ownerId === playerId && e.hp > 0 && anchorsBuildRange(e.type)) anchors.push(e);
  }
  if (!yard) {
    for (const q of state.players.values()) {
      if (!q.alive || allies(state, playerId, q.playerId)) continue;
      const foe = hqOf(state, q.playerId);
      if (foe) foes.push({ x: foe.x / state.tileSize, y: foe.y / state.tileSize });
    }
  }
  const ox = hq.tileX + hq.tileW / 2;
  const oy = hq.tileY + hq.tileH / 2;
  let best: { tx: number; ty: number } | null = null;
  let bestD = Infinity;
  for (let ty = 0; ty + def.tileH <= state.height; ty++) {
    for (let tx = 0; tx + def.tileW <= state.width; tx++) {
      const id = sea.body[ty * state.width + tx]!;
      if (!id) continue;
      const cx = tx + def.tileW / 2;
      const cy = ty + def.tileH / 2;
      const d = Math.hypot(cx - ox, cy - oy);
      if (d >= bestD || (!yard && d > CPU_EXPAND_TILES)) continue;
      if (!strikeWater(state, playerId, id)) continue;
      if (yard && !anchors.some((b) => footprintGap(tx, ty, def.tileW, def.tileH, b.tileX, b.tileY, b.tileW, b.tileH) <= BUILD_RADIUS)) continue;
      if (!yard && foes.some((f) => Math.hypot(cx - f.x, cy - f.y) <= d)) continue;
      if (buildingSiteError(state, "dock", tx, ty)) continue;
      best = { tx, ty };
      bestD = d;
    }
  }
  return best;
}

/** The yard's Marine Base footprint, worked out once a strategy pass. */
function dockSite(state: MatchState, playerId: string): { tx: number; ty: number } | null {
  const sea = seaOf(state);
  if (!sea.dock.has(playerId)) sea.dock.set(playerId, findDockTile(state, playerId, true));
  return sea.dock.get(playerId) ?? null;
}

/** Campaigning, with water in the yard worth a fleet and no Marine Base on its way already. */
function wantDock(state: MatchState, p: SimPlayer): boolean {
  if (aiPlanOf(p).posture !== "campaign" || countType(state, p.playerId, "dock") > 0) return false;
  return !dockUnderWay(state, p.playerId) && dockSite(state, p.playerId) != null;
}

/** A Marine Base on its way: in the yard, or an engineer out to raise one. */
function dockUnderWay(state: MatchState, playerId: string): boolean {
  if (state.players.get(playerId)?.structure?.type === "dock") return true;
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && e.type === "engineer" && e.hp > 0 && e.order?.kind === "build" && e.order.building === "dock") return true;
  }
  return false;
}

/** No water in the yard worth a fleet, but some within reach: an engineer swims out and raises the Marine Base. */
function raiseDock(state: MatchState, p: SimPlayer, hq: Entity): void {
  if (aiPlanOf(p).posture !== "campaign") return;
  if (countType(state, p.playerId, "dock") > 0 || dockUnderWay(state, p.playerId)) return;
  if (p.scrap < catalog("dock").cost || !powerFor(state, p.playerId, "dock")) return;
  if (dockSite(state, p.playerId)) return;
  const sea = seaOf(state);
  if (!sea.outDock.has(p.playerId)) sea.outDock.set(p.playerId, findDockTile(state, p.playerId, false));
  const spot = sea.outDock.get(p.playerId);
  if (!spot) return;
  const def = catalog("dock");
  const at = { x: (spot.tx + def.tileW / 2) * state.tileSize, y: (spot.ty + def.tileH / 2) * state.tileSize };
  const eng = freeEngineer(state, p.playerId, at);
  if (eng) applyCommand(state, p.playerId, { type: "cmd.construct", ids: [eng.id], building: "dock", tx: spot.tx, ty: spot.ty });
}

/** Half its shells or torpedoes still aboard, or a gun that never runs dry. */
function shipArmed(e: Entity): boolean {
  if (e.ship) {
    const barrels = e.ship.turrets.flatMap((t) => t.barrels);
    const left = barrels.reduce((s, b) => s + b.ammo, 0);
    return left * 2 >= barrels.length * BATTLESHIP_BARREL_AMMO;
  }
  const belt = beltOf(e.type);
  if (belt && !belt.reload) return e.clip * 2 >= belt.clip;
  return true;
}

function warshipsOf(state: MatchState, playerId: string): Entity[] {
  const out: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.kind !== "unit" || e.hp <= 0 || e.wreck || e.garrisonedIn) continue;
    if (!isNavalType(e.type) || isTorpedoBody(e.type) || !fires(e.type)) continue;
    out.push(e);
  }
  return out;
}

/**
 * The fleet. At home the warships guard the Marine Base. Campaigning, once CPU_FLEET_MIN of them
 * lie armed on one body of water, they sail together for the water nearest the enemy Core (or the
 * middle) and shell what they find there. A ship low on shells or torpedoes sails home to rearm.
 */
function seaWork(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan): void {
  const warships = warshipsOf(state, p.playerId);
  if (plan.fleet && !stepFleet(state, p, plan.fleet)) delete plan.fleet;
  const out = new Set(plan.fleet?.ids ?? []);
  const home = warships.filter((e) => !out.has(e.id));
  if (home.length === 0 || guardHarbour(state, p, home)) return;
  if (plan.posture !== "campaign" || plan.fleet) return;
  // The biggest group of armed, idle warships on one body of water.
  const groups = new Map<number, Entity[]>();
  for (const e of home) {
    if (!shipArmed(e) || (e.order && !e.order.auto && e.order.kind !== "move")) continue;
    const id = bodyAt(state, e);
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), e]);
  }
  let pick: { id: number; ships: Entity[] } | undefined;
  for (const [id, ships] of groups) if (ships.length > (pick?.ships.length ?? 0)) pick = { id, ships };
  if (!pick || pick.ships.length < CPU_FLEET_MIN) return;
  const to = strikeWater(state, p.playerId, pick.id);
  if (!to) return;
  const ids = pick.ships.map((e) => e.id);
  applyCommand(state, p.playerId, { type: "cmd.attackmove", ids, x: to.x, y: to.y });
  plan.fleet = { ids, to, size0: ids.length, orderTick: state.tick };
}

/** One pass of the fleet out at sea. Returns false once it is spent and the rest sail home. */
function stepFleet(state: MatchState, p: SimPlayer, f: AiFleet): boolean {
  const ships: Entity[] = [];
  for (const id of f.ids) {
    const e = state.entities.get(id);
    if (!e || e.ownerId !== p.playerId || e.hp <= 0 || e.wreck) continue;
    // Low on shells or torpedoes: home to the Marine Base to load again.
    if (!shipArmed(e)) {
      sailHome(state, p, [e]);
      continue;
    }
    ships.push(e);
  }
  f.ids = ships.map((e) => e.id);
  if (ships.length < Math.max(1, Math.ceil(f.size0 * FORCE_BREAK_SHARE))) {
    sailHome(state, p, ships);
    return false;
  }
  const sites = enemySites(state, p.playerId);
  const station = STATION_TILES * state.tileSize;
  const refresh = state.tick >= f.orderTick + ENGAGED_MAX_TICKS;
  for (const e of ships) {
    if (inFight(state, e) || shellShore(state, p, e, sites)) continue;
    const far = Math.hypot(e.x - f.to.x, e.y - f.to.y) > station;
    const idle = !e.order || e.order.auto;
    if (far && (idle || refresh)) applyCommand(state, p.playerId, { type: "cmd.attackmove", ids: [e.id], x: f.to.x, y: f.to.y });
  }
  if (refresh) f.orderTick = state.tick;
  return true;
}

/** Back to lie beside the nearest Marine Base on the same water. */
function sailHome(state: MatchState, p: SimPlayer, ships: Entity[]): void {
  for (const e of ships) {
    let dock: Entity | undefined;
    let bestD = Infinity;
    for (const b of state.entities.values()) {
      if (b.ownerId !== p.playerId || !isDockType(b.type) || b.hp <= 0) continue;
      const d = Math.hypot(b.x - e.x, b.y - e.y);
      if (d < bestD) {
        dock = b;
        bestD = d;
      }
    }
    const at = dock && openWaterNear(state, bodyAt(state, e), dock);
    if (at) applyCommand(state, p.playerId, { type: "cmd.move", ids: [e.id], x: at.x, y: at.y });
  }
}

/**
 * On station with nothing to shoot, a warship with a gun heavy enough for walls shells the
 * nearest enemy building it can reach from where it lies. Torpedoes are no use on dry land:
 * a submarine goes only for a Marine Base, which stands in the water.
 */
function shellShore(state: MatchState, p: SimPlayer, e: Entity, sites: Entity[]): boolean {
  const torpedoes = torpedoesOf(e.type);
  if (torpedoes) sites = sites.filter((b) => onWaterBuilding(b.type));
  else if (catalog(e.type).caliber < GARRISON_STRUCTURAL_CALIBER) return false;
  const held = e.order?.kind === "attack" && e.order.targetId != null ? state.entities.get(e.order.targetId) : undefined;
  if (held && held.hp > 0) return true;
  const ts = state.tileSize;
  const range = catalog(e.type).rangeTiles * ts;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const b of sites) {
    const d = Math.hypot(b.x - e.x, b.y - e.y) - (Math.max(b.tileW, b.tileH) / 2) * ts;
    if (d > range || d >= bestD) continue;
    best = b;
    bestD = d;
  }
  if (!best) return false;
  return applyCommand(state, p.playerId, { type: "cmd.attack", ids: [e.id], targetId: best.id }).ok;
}

/** A seen enemy near a Marine Base pulls the warships lying at home on the same water. */
function guardHarbour(state: MatchState, p: SimPlayer, home: Entity[]): boolean {
  const reach = CPU_HARBOUR_DEFEND_TILES * state.tileSize;
  const docks = [...state.entities.values()].filter((b) => b.ownerId === p.playerId && isDockType(b.type) && b.hp > 0);
  if (docks.length === 0) return false;
  let intruder: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.kind !== "unit" || e.hp <= 0 || e.wreck || !e.ownerId || e.air || e.dormant || isTorpedoBody(e.type)) continue;
    if (allies(state, p.playerId, e.ownerId)) continue;
    const d = Math.min(...docks.map((b) => Math.hypot(e.x - b.x, e.y - b.y)));
    if (d > reach || d >= bestD || !canSeeEntity(state, p.playerId, e)) continue;
    intruder = e;
    bestD = d;
  }
  const at = intruder && waterNear(state, intruder);
  if (!at) return false;
  const id = bodyAt(state, at);
  const ids = home.filter((e) => bodyAt(state, e) === id && (!e.order || e.order.auto || e.order.kind === "move")).map((e) => e.id);
  if (ids.length === 0) return false;
  applyCommand(state, p.playerId, { type: "cmd.attackmove", ids, x: at.x, y: at.y });
  return true;
}

/** An idle supply boat keeps beside a warship out with the fleet. */
function followFleet(state: MatchState, p: SimPlayer, e: Entity): void {
  const fleet = aiPlanOf(p).fleet;
  if (!fleet) return;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const id of fleet.ids) {
    const o = state.entities.get(id);
    if (!o || o.hp <= 0 || o.wreck) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  if (best) applyCommand(state, p.playerId, { type: "cmd.guard", ids: [e.id], targetId: best.id });
}

// ---------------------------------------------------------------- unit upkeep

function microUnits(state: MatchState, p: SimPlayer, hq: Entity, plan: AiPlan): void {
  const sites = enemySites(state, p.playerId);
  const stage = stagingFinder(state, hq);
  let smelterCrew = false;
  for (const e of [...state.entities.values()]) {
    if (e.ownerId !== p.playerId || e.hp <= 0 || e.wreck || e.garrisonedIn || e.kind !== "unit") continue;
    siege(state, p, e, sites);
    diveOnContact(state, p, e);
    switch (e.type) {
      case "warden":
      case "apocalypse":
      case "ss3":
      case "jagdtiger":
        fitShell(state, p, e);
        break;
      case "walker":
        if ((e.gatlingGuns ?? 1) === 1) applyCommand(state, p.playerId, { type: "cmd.guns", ids: [e.id], guns: 2 });
        break;
      case "nebelwerfer":
      case "mawcaster":
        settleLauncher(state, p, e);
        break;
      case "engineer":
        if (e.order?.kind === "build") smelterCrew = true;
        else engineerWork(state, p, e, hq);
        break;
      case "supply":
      case "supplyboat":
        truckWork(state, p, e, hq, stage);
        break;
      case "droneop":
        flyDrone(state, p, e, hq, stage);
        break;
    }
    if (YARD_IDLERS.has(e.type) && !e.order && nearBuilding(state, e)) moveTo(state, p, e, stage());
  }
  if (!smelterCrew && !claimDiamond(state, p, plan)) expandSmelters(state, p, hq);
  if (!smelterCrew) raiseDock(state, p, hq);
}

/**
 * Once a force stands on the middle, the nearest free engineer raises a Smelter on the
 * diamond scrap. It pours five times the plain rate and stretches the build range out there.
 */
function claimDiamond(state: MatchState, p: SimPlayer, plan: AiPlan): boolean {
  const there = plan.forces.some((f) => f.goal === "centre" && f.route.length === 0);
  if (!there || ownsDiamondSmelter(state, p.playerId)) return false;
  if (p.scrap < catalog("smelter").cost) return false;
  const eng = freeEngineer(state, p.playerId, diamondCentre(state));
  const spot = eng && findDiamondSmelterTile(state);
  if (!eng || !spot) return false;
  return applyCommand(state, p.playerId, { type: "cmd.construct", ids: [eng.id], building: "smelter", tx: spot.tx, ty: spot.ty }).ok;
}

/** The engineer nearest `at` that is idle or on work of his own choosing. */
function freeEngineer(state: MatchState, playerId: string, at: Vec): Entity | undefined {
  let eng: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== "engineer" || e.hp <= 0 || e.garrisonedIn) continue;
    if (e.order && !e.order.auto && e.order.kind !== "repair" && e.order.kind !== "move") continue;
    const d = Math.hypot(e.x - at.x, e.y - at.y);
    if (d < bestD) {
      eng = e;
      bestD = d;
    }
  }
  return eng;
}

/**
 * The base stands and the yard has no scrap left in range: the nearest free engineer walks
 * out and raises a Smelter on the nearest field on the CPU's own side of the map.
 */
function expandSmelters(state: MatchState, p: SimPlayer, hq: Entity): void {
  if (aiPlanOf(p).posture !== "campaign") return;
  if (countType(state, p.playerId, "smelter") >= aiProfile(p.ai).wantSmelters) return;
  if (p.scrap < catalog("smelter").cost || !powerFor(state, p.playerId, "smelter")) return;
  if (findSmelterTile(state, p.playerId)) return;
  const spot = findOutlyingSmelterTile(state, p.playerId, hq);
  if (!spot) return;
  const def = catalog("smelter");
  const at = { x: (spot.tx + def.tileW / 2) * state.tileSize, y: (spot.ty + def.tileH / 2) * state.tileSize };
  const eng = freeEngineer(state, p.playerId, at);
  if (eng) applyCommand(state, p.playerId, { type: "cmd.construct", ids: [eng.id], building: "smelter", tx: spot.tx, ty: spot.ty });
}

/**
 * Plain scrap within CPU_EXPAND_TILES of the Core and nearer it than any enemy base: the
 * footprint nearest the Core. The diamond field is left to the force that takes the middle.
 */
export function findOutlyingSmelterTile(state: MatchState, playerId: string, hq: Entity): { tx: number; ty: number } | null {
  return siteMemo(state, `outsmelter:${playerId}:${hq.id}`, () => findOutlyingSmelterTileNow(state, playerId, hq));
}

function findOutlyingSmelterTileNow(state: MatchState, playerId: string, hq: Entity): { tx: number; ty: number } | null {
  const def = catalog("smelter");
  const foes: Vec[] = [];
  for (const q of state.players.values()) {
    if (!q.alive || allies(state, playerId, q.playerId)) continue;
    const foe = hqOf(state, q.playerId);
    if (foe) foes.push({ x: foe.x / state.tileSize, y: foe.y / state.tileSize });
  }
  const ox = hq.x / state.tileSize;
  const oy = hq.y / state.tileSize;
  let best: { tx: number; ty: number } | null = null;
  let bestD = Infinity;
  for (let ty = 0; ty + def.tileH <= state.height; ty++) {
    for (let tx = 0; tx + def.tileW <= state.width; tx++) {
      // Cheap gate first: the middle of the footprint has to be plain scrap.
      const mid = scrapAt(state, tx + (def.tileW >> 1), ty + (def.tileH >> 1));
      if (mid <= 0 || mid >= DIAMOND_SCRAP_TILE_YIELD) continue;
      const cx = tx + def.tileW / 2;
      const cy = ty + def.tileH / 2;
      const d = Math.hypot(cx - ox, cy - oy);
      if (d > CPU_EXPAND_TILES || d >= bestD) continue;
      if (foes.some((f) => Math.hypot(cx - f.x, cy - f.y) <= d)) continue;
      if (!smelterSiteOk(state, tx, ty) || !keepsLanes(state, tx, ty, def.tileW, def.tileH)) continue;
      best = { tx, ty };
      bestD = d;
    }
  }
  return best;
}

type Staging = () => { x: number; y: number };

/** Walkable ground near the Core with no building inside a lane's width. Found once per pass, on demand. */
function stagingFinder(state: MatchState, hq: Entity): Staging {
  let spot: { x: number; y: number } | undefined;
  return () => {
    if (spot) return spot;
    const ox = hq.tileX + Math.floor(hq.tileW / 2);
    const oy = hq.tileY + Math.floor(hq.tileH / 2);
    const inwardX = Math.sign(state.width / 2 - ox) || 1;
    const inwardY = Math.sign(state.height / 2 - oy) || 1;
    const maxR = Math.max(state.width, state.height);
    for (let r = CPU_BUILD_LANE_TILES; r < maxR && !spot; r += 2) {
      for (let k = 0; k <= r && !spot; k += 2) {
        for (const [dx, dy] of [
          [r, k],
          [k, r],
        ] as const) {
          const tx = ox + dx * inwardX;
          const ty = oy + dy * inwardY;
          if (!walkable(state, tx, ty, "warden") || !keepsLanes(state, tx, ty, 1, 1)) continue;
          spot = { x: (tx + 0.5) * state.tileSize, y: (ty + 0.5) * state.tileSize };
          break;
        }
      }
    }
    spot ??= { x: hq.x, y: hq.y };
    return spot;
  };
}

/** Parked against a building: a hull cannot shove past, so the lane is shut. */
function nearBuilding(state: MatchState, e: Entity): boolean {
  return !keepsLanes(state, Math.floor(e.x / state.tileSize), Math.floor(e.y / state.tileSize), 1, 1);
}

function moveTo(state: MatchState, p: SimPlayer, e: Entity, at: { x: number; y: number }): void {
  applyCommand(state, p.playerId, { type: "cmd.move", ids: [e.id], x: at.x, y: at.y });
}

/**
 * Enemy buildings the side can see. Auto-fire leaves them alone, so the wave needs telling.
 * Wall, sandbag, and trench lines are left out: a wave that stops for every slab never reaches the Core.
 */
function enemySites(state: MatchState, playerId: string): Entity[] {
  const out: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.kind !== "building" || e.hp <= 0 || e.wreck || !e.ownerId || allies(state, playerId, e.ownerId)) continue;
    if (isFieldStructure(e.type)) continue;
    if (canSeeEntity(state, playerId, e)) out.push(e);
  }
  return out;
}

/**
 * A fighter that reached the enemy yard with nothing to shoot goes for the nearest building:
 * soldiers stand the capture, guns shell it. A halt with no target counts as nothing to shoot.
 */
function siege(state: MatchState, p: SimPlayer, e: Entity, sites: Entity[]): void {
  if (sites.length === 0 || !freeFighter(e, p.playerId)) return;
  if (!isInfantryType(e.type) && catalog(e.type).caliber < GARRISON_STRUCTURAL_CALIBER) return;
  const idle = !e.order || e.order.auto || e.order.kind === "attackmove";
  if (!idle || (e.attackTarget != null && state.entities.get(e.attackTarget)?.hp)) return;
  const reach = CPU_SIEGE_TILES * state.tileSize;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const b of sites) {
    const d = Math.hypot(b.x - e.x, b.y - e.y);
    if (d > reach || d >= bestD) continue;
    best = b;
    bestD = d;
  }
  if (best) applyCommand(state, p.playerId, { type: "cmd.attack", ids: [e.id], targetId: best.id });
}

/** HE for soldiers, soft trucks, and buildings. AP for armor. */
function fitShell(state: MatchState, p: SimPlayer, e: Entity): void {
  const t = e.attackTarget != null ? state.entities.get(e.attackTarget) : undefined;
  if (!t || t.hp <= 0) return;
  const soft = t.kind === "building" || isInfantryType(t.type) || !isArmoredType(t.type);
  const shell = soft ? "he" : "ap";
  if (e.shell === shell || (e.ammo[shell] ?? 0) <= 0) return;
  applyCommand(state, p.playerId, { type: "cmd.ammo", ids: [e.id], shell });
}

/**
 * Attack-move halts the truck in range but keeps its path, and the frame only fires
 * from a standstill. Turn that halt into a plain attack so the salvo goes.
 */
function settleLauncher(state: MatchState, p: SimPlayer, e: Entity): void {
  if (e.order?.kind !== "attackmove" || e.state !== "attack" || e.attackTarget == null) return;
  applyCommand(state, p.playerId, { type: "cmd.attack", ids: [e.id], targetId: e.attackTarget });
}

/** Patch the base and its hulls, then cut wrecks near home into scrap. */
function engineerWork(state: MatchState, p: SimPlayer, e: Entity, hq: Entity): void {
  if (e.order && !e.order.auto) return;
  const reach = CPU_WORK_TILES * state.tileSize;
  let repair: Entity | undefined;
  let wreck: Entity | undefined;
  let repairD = Infinity;
  let wreckD = Infinity;
  for (const o of state.entities.values()) {
    if (o.id === e.id || o.hp <= 0) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > reach || Math.hypot(o.x - hq.x, o.y - hq.y) > reach) continue;
    if (o.ownerId === p.playerId && !o.wreck && o.hp < o.hpMax && (o.kind === "building" || isArmoredType(o.type))) {
      if (d < repairD && canRepairTarget(state, p.playerId, o)) {
        repair = o;
        repairD = d;
      }
    } else if (canScrapWreck(o) && d < wreckD) {
      wreck = o;
      wreckD = d;
    }
  }
  const target = repair ?? wreck;
  if (target) applyCommand(state, p.playerId, { type: "cmd.repair", ids: [e.id], targetId: target.id });
}

/**
 * Top up anyone short nearby, refill at the depot (Armory, or Marine Base for the boat) when the
 * bed runs low, else rejoin the army. The truck serves what stands ashore, the boat what floats.
 */
function truckWork(state: MatchState, p: SimPlayer, e: Entity, hq: Entity, stage: Staging): void {
  if (e.order?.kind === "supply" || e.order?.kind === "disable") return;
  const afloat = isNavalType(e.type);
  if (e.supply < SUPPLY_CARGO / 3) {
    const depot = nearestOwned(state, p.playerId, supplyDepotOf(e.type), e);
    if (depot) applyCommand(state, p.playerId, { type: "cmd.supply", ids: [e.id], targetId: depot.id });
    return;
  }
  const reach = CPU_WORK_TILES * state.tileSize;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (o.ownerId !== p.playerId || o.id === e.id || isNavalType(o.type) !== afloat || !needsSupply(o)) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > reach || d >= bestD) continue;
    best = o;
    bestD = d;
  }
  if (best) {
    applyCommand(state, p.playerId, { type: "cmd.supply", ids: [e.id], targetId: best.id });
    return;
  }
  if (e.order) return;
  if (afloat) followFleet(state, p, e);
  else rejoin(state, p, e, hq, stage);
}

/**
 * An enemy in sight inside the leash: the drone goes up, or turns, in Search & Destroy and
 * dives on it. Out with the army and nothing seen, it goes up in Surveillance over the op
 * to look ahead. Idle away from home, the op rejoins a fighter.
 */
function flyDrone(state: MatchState, p: SimPlayer, e: Entity, hq: Entity, stage: Staging): void {
  if (!e.order) rejoin(state, p, e, hq, stage);
  const call = droneCall(state, e, e.order?.kind === "guard");
  if (!call) return;
  const link = e.droneLink!;
  const up = droneOf(state, e);
  const mode = up?.drone?.mode ?? link.mode;
  if (call.mode && call.mode !== mode) applyCommand(state, p.playerId, { type: "cmd.drone", ids: [e.id], action: "mode", mode: call.mode });
  if (call.launch && !applyCommand(state, p.playerId, { type: "cmd.drone", ids: [e.id], action: "launch" }).ok) return;
  const d = droneOf(state, e);
  if (!d) return;
  if (call.attackId != null) applyCommand(state, p.playerId, { type: "cmd.attack", ids: [d.id], targetId: call.attackId });
  else if (call.overOp) applyCommand(state, p.playerId, { type: "cmd.guard", ids: [d.id], targetId: e.id });
}

/** A submarine goes down when it sees the enemy, and comes up for air once it has been clear a while. */
function diveOnContact(state: MatchState, p: SimPlayer, e: Entity): void {
  const down = subDepthCall(state, e);
  if (down != null) applyCommand(state, p.playerId, { type: "cmd.dive", ids: [e.id], down });
}

/** An escort whose fighter fell walks beside the nearest one still out. Near home it waits. */
function rejoin(state: MatchState, p: SimPlayer, e: Entity, hq: Entity, stage: Staging): void {
  const home = BUILD_RADIUS * state.tileSize;
  if (Math.hypot(e.x - hq.x, e.y - hq.y) <= home) return;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of state.entities.values()) {
    if (!freeFighter(o, p.playerId)) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  if (best) {
    applyCommand(state, p.playerId, { type: "cmd.guard", ids: [e.id], targetId: best.id });
  } else {
    moveTo(state, p, e, stage());
  }
}

function enemyHq(state: MatchState, playerId: string): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  const me = hqOf(state, playerId);
  for (const o of state.players.values()) {
    if (!o.alive || o.playerId === playerId) continue;
    if (allies(state, playerId, o.playerId)) continue;
    const hq = hqOf(state, o.playerId);
    if (!hq) continue;
    const d = me ? (hq.x - me.x) ** 2 + (hq.y - me.y) ** 2 : 0;
    if (d < bestD) {
      bestD = d;
      best = hq;
    }
  }
  return best;
}

export function findBuildTile(
  state: MatchState,
  playerId: string,
  type: BuildingType,
): { tx: number; ty: number } | null {
  if (isSmelterType(type)) return findSmelterTile(state, playerId);
  if (type === "dock") return findDockTile(state, playerId, true);
  const def = catalog(type);
  const hq = hqOf(state, playerId);
  if (!hq) return null;
  const ox = hq.tileX + Math.floor(hq.tileW / 2);
  const oy = hq.tileY + Math.floor(hq.tileH / 2);
  const inwardX = Math.sign(state.width / 2 - ox) || 1;
  const inwardY = Math.sign(state.height / 2 - oy) || 1;
  const radius = buildRadiusOf(type);
  const maxR = radius + Math.max(def.tileW, def.tileH);
  const halfW = Math.floor(def.tileW / 2);
  const halfH = Math.floor(def.tileH / 2);
  // Keep the next Smelter's ground: a building packed against the scrap shuts its lane, and the
  // yard may have no other footprint on the field in range.
  const smelter = catalog("smelter");
  const owner = state.players.get(playerId);
  const keep = countType(state, playerId, smelterOf(owner?.faction ?? "alliance")) < aiProfile(owner?.ai).wantSmelters ? findSmelterTile(state, playerId) : null;
  for (let r = 1; r <= maxR; r++) {
    const ring: { tx: number; ty: number; inward: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        ring.push({
          tx: ox + dx - halfW,
          ty: oy + dy - halfH,
          inward: dx * inwardX + dy * inwardY,
        });
      }
    }
    ring.sort((a, b) => b.inward - a.inward);
    for (const spot of ring) {
      if (tilesBlockedOrScrap(state, spot.tx, spot.ty, def.tileW, def.tileH)) continue;
      if (!inBuildRadius(state, playerId, spot.tx, spot.ty, def.tileW, def.tileH, radius)) continue;
      if (!keepsLanes(state, spot.tx, spot.ty, def.tileW, def.tileH)) continue;
      if (keep && footprintGap(spot.tx, spot.ty, def.tileW, def.tileH, keep.tx, keep.ty, smelter.tileW, smelter.tileH) < CPU_BUILD_LANE_TILES) continue;
      return { tx: spot.tx, ty: spot.ty };
    }
  }
  return null;
}

/**
 * The scrap field nearest the HQ that is still in build range: the footprint with the
 * most scrap under it, nearest first. Null when no field within reach can take a Smelter.
 */
/** A site answer, good while the scrap, the roster and the clock all stand where they were. */
interface SiteMemo {
  tick: number;
  scrapRev: number;
  roster: number;
  spot: { tx: number; ty: number } | null;
}

const siteMemos = new WeakMap<MatchState, Map<string, SiteMemo>>();

/**
 * A Smelter site is a walk over every tile of the map. Asked again within a strategy pass with the
 * scrap field and the roster unchanged, the last answer stands.
 */
function siteMemo(state: MatchState, key: string, find: () => { tx: number; ty: number } | null): { tx: number; ty: number } | null {
  let memos = siteMemos.get(state);
  if (!memos) {
    memos = new Map();
    siteMemos.set(state, memos);
  }
  const old = memos.get(key);
  if (
    old &&
    old.scrapRev === state.scrapRev &&
    old.roster === state.entities.size &&
    state.tick >= old.tick &&
    state.tick - old.tick < CPU_MICRO_EVERY_TICKS
  ) {
    return old.spot;
  }
  const spot = find();
  memos.set(key, { tick: state.tick, scrapRev: state.scrapRev, roster: state.entities.size, spot });
  return spot;
}

export function findSmelterTile(state: MatchState, playerId: string): { tx: number; ty: number } | null {
  return siteMemo(state, `smelter:${playerId}`, () => findSmelterTileNow(state, playerId));
}

function findSmelterTileNow(state: MatchState, playerId: string): { tx: number; ty: number } | null {
  const def = catalog("smelter");
  const hq = hqOf(state, playerId);
  if (!hq) return null;
  const ox = hq.tileX + hq.tileW / 2;
  const oy = hq.tileY + hq.tileH / 2;
  let best: { tx: number; ty: number } | null = null;
  let bestD = Infinity;
  for (let ty = 0; ty + def.tileH <= state.height; ty++) {
    for (let tx = 0; tx + def.tileW <= state.width; tx++) {
      // Cheap gate first: the middle of the footprint has to be scrap at all.
      if (scrapAt(state, tx + (def.tileW >> 1), ty + (def.tileH >> 1)) <= 0) continue;
      const d = Math.hypot(tx + def.tileW / 2 - ox, ty + def.tileH / 2 - oy);
      if (d >= bestD) continue;
      if (!smelterSiteOk(state, tx, ty)) continue;
      if (!inBuildRadius(state, playerId, tx, ty, def.tileW, def.tileH, BUILD_RADIUS)) continue;
      if (!keepsLanes(state, tx, ty, def.tileW, def.tileH)) continue;
      best = { tx, ty };
      bestD = d;
    }
  }
  return best;
}

/**
 * Leave a vehicle-wide lane around every standing building. Packed edge to edge,
 * a big footprint like the Airfield walls off the doors and nothing gets out.
 */
function keepsLanes(state: MatchState, tx: number, ty: number, w: number, h: number): boolean {
  for (const b of state.entities.values()) {
    if (b.kind !== "building" || b.hp <= 0 || isFieldStructure(b.type)) continue;
    if (footprintGap(tx, ty, w, h, b.tileX, b.tileY, b.tileW, b.tileH) < CPU_BUILD_LANE_TILES) return false;
  }
  return true;
}

function nearestOwned(state: MatchState, playerId: string, type: string, from: Entity): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.type !== type || e.hp <= 0) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function ownsLive(state: MatchState, playerId: string, type: string): boolean {
  for (const e of state.entities.values()) {
    if (e.ownerId === playerId && e.type === type && e.hp > 0) return true;
  }
  return false;
}

/** Jobs waiting on every factory of one kind. */
function queuedOn(state: MatchState, playerId: string, factory: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0 || e.type !== factory) continue;
    n += e.queue.length;
  }
  return n;
}

function countType(state: MatchState, playerId: string, type: string): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0) continue;
    if (e.type === type) n++;
    for (const j of e.queue) {
      if (j.type === type) n++;
    }
  }
  return n;
}

function queuedAt(state: MatchState, playerId: string, type: TrainType): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (e.ownerId !== playerId || e.hp <= 0) continue;
    for (const j of e.queue) {
      if (j.type === type) n++;
    }
  }
  return n;
}
