import type { BuildingType, Crit, EntityType, ShellType, Stance, TrainType } from "../catalog.js";
import type { AiDifficulty, EntityState, ImpactView } from "../protocol.js";

export interface Vec {
  x: number;
  y: number;
}

export interface TrainJob {
  id: number;
  type: TrainType;
  progressTicks: number;
  totalTicks: number;
  paused: boolean;
  /** Scrap already drained for this job. */
  paid: number;
}

export interface StructureJob {
  type: BuildingType;
  progressTicks: number;
  totalTicks: number;
  ready: boolean;
  paused: boolean;
  /** Scrap already drained for this job. */
  paid: number;
}

export interface Order {
  kind:
    | "move"
    | "attack"
    | "attackmove"
    | "forceattack"
    | "harvest"
    | "unload"
    | "garrison"
    | "rotate"
    | "guard"
    | "withdraw";
  x?: number;
  y?: number;
  /** World radians. Guard / rotate destination facing, or hull heading while reversing. */
  facing?: number;
  targetId?: number;
  tileX?: number;
  tileY?: number;
  /** Auto-acquired attack. Incoming fire may interrupt this; player orders are kept. */
  auto?: boolean;
  /** Withdraw by backing up with the hull toward the fire. Tanks only. */
  reverse?: boolean;
  /** Fire the main gun once, then idle. Smoke force-attack uses this; other one-shots can too. */
  once?: boolean;
}

export interface Entity {
  id: number;
  kind: "unit" | "building";
  type: EntityType;
  ownerId: string;
  x: number;
  y: number;
  facing: number;
  /** Independent gun angle. Matches hull facing when the type has no turret. */
  turretFacing: number;
  hp: number;
  hpMax: number;
  state: EntityState;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  radius: number;
  order: Order | null;
  waypoints: Vec[];
  cooldown: number;
  harvestTime: number;
  cargo: number;
  harvestTile: Vec | null;
  autoHarvest: boolean;
  deployTime: number;
  /** Seconds remaining before this unit's special can fire again. */
  specialCooldown: number;
  queue: TrainJob[];
  attackTarget: number | null;
  /** True after an armored hull dies; blocks until the wreck is destroyed. */
  wreck: boolean;
  ammo: Partial<Record<ShellType, number>>;
  shell: ShellType | null;
  /** Coaxial MG rounds remaining. 0 if the type has no MG. */
  mgAmmo: number;
  /** 0–heatMax. Dumps climb this; it drains while the MG is silent. */
  mgHeat: number;
  /** Seconds the MG stays jammed after a heat dump. */
  mgOverheat: number;
  mgCooldown: number;
  /** Unit is inside this building id. */
  garrisonedIn: number | null;
  /** Unit ids occupying a garrisonable building. */
  garrison: number[];
  /** Occupants shuttered: tiny sight, no fire, occupancy hidden from enemies. */
  garrisonHide: boolean;
  /** Hatch-crew HP. 0 = dead or this type has no scout. */
  scoutHp: number;
  scoutHpMax: number;
  /** Head out of the cupola: infantry sight, vulnerable to small arms. */
  scoutOut: boolean;
  /** Player currently taking this building. Empty when idle. */
  captureOwnerId: string;
  /** 0–1. Decays when capturers leave. */
  captureProgress: number;
  /** Lasting injuries. Empty until a crit lands. */
  crits: Crit[];
  /** Live infantry posture. Vehicles stay "stand". */
  stance: Stance;
  /** Player-commanded posture. Targeted infantry may drop to crawl anyway. */
  stanceOrder: Stance;
  /** Stay put: fire in range, do not chase or withdraw. */
  holdPosition: boolean;
  /** Commanded overwatch heading. Null when not guarding. */
  guardFacing: number | null;
}

export interface Projectile {
  id: number;
  ownerId: string;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  penetration: number;
  caliber: number;
  life: number;
  /** Shooter, then last ricochet victim — skip re-collision. */
  ignoreId: number;
  /** Original firing unit. */
  fromId: number;
  bounced: boolean;
  /** Loaded 75mm type. Null for rifles / MG. */
  shell: ShellType | null;
}

/** Lasting smoke screen from a 75mm smoke shell. */
export interface SmokeCloud {
  id: number;
  x: number;
  y: number;
  ux: number;
  uy: number;
  halfAlong: number;
  halfAcross: number;
  life: number;
  lifeMax: number;
}

export interface SimPlayer {
  playerId: string;
  name: string;
  colorId: number;
  team: number;
  alive: boolean;
  scrap: number;
  structure: StructureJob | null;
  placingType: BuildingType | null;
  hqId: number;
  /** CPU seat. Omitted for humans. */
  ai?: AiDifficulty;
  /** Sim tick to try the next attack wave. */
  aiNextAttackTick: number;
}

export interface MatchState {
  roomId: string;
  mapId: string;
  tick: number;
  /** Sim steps per wall-clock tick. 1–5. */
  gameSpeed: number;
  /** Remaining wall-clock ticks until Rigs auto-unpack. -1 = already fired. */
  autoDeployTicks: number;
  nextId: number;
  tileSize: number;
  width: number;
  height: number;
  /** 1 = not walkable (wall, water). Trees are handled per-unit. */
  blocked: Uint8Array;
  /** Original tile kinds (empty / wall / scrap / water / tree). */
  terrain: Uint8Array;
  /** Discrete elevation. 0 = valley floor. */
  heights: Uint8Array;
  /** Remaining scrap on each tile. */
  scrapYield: Uint16Array;
  /** Building or wreck id occupying a tile, or 0. */
  occupy: Int32Array;
  /** 1 = too close to a wreck for a unit to path through. */
  wreckBlock: Uint8Array;
  players: Map<string, SimPlayer>;
  entities: Map<number, Entity>;
  projectiles: Projectile[];
  smokeClouds: SmokeCloud[];
  impacts: ImpactView[];
  rngState: number;
  winner?: { playerId: string; team: number };
  ended: boolean;
  initialHumans: number;
  pendingComms: string[];
  /** Tick whose per-player vision masks are in `visionByPlayer`. */
  visionTick: number;
  visionByPlayer: Map<string, Uint8Array>;
  /** Fingerprint of inputs used to build each cached vision mask. */
  visionKeyByPlayer: Map<string, number>;
  /** Packed smoke occupancy for `smokeMaskTick`. */
  smokeMask: Uint8Array;
  smokeMaskTick: number;
  /** Armored hull ids for LOS. Scratch buffer; rebuilt each cover query. */
  hullMask: Int32Array;
  /** Tick whose per-player entity-visibility cache is in `seeByPlayer`. */
  seeTick: number;
  seeByPlayer: Map<string, Map<number, boolean>>;
  /** Tree tiles crushed by vehicles this match. */
  clearedTrees: { x: number; y: number }[];
}
