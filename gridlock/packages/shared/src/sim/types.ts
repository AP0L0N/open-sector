import type { BuildingType, EntityType, TrainType } from "../catalog.js";
import type { EntityState } from "../protocol.js";

export interface Vec {
  x: number;
  y: number;
}

export interface TrainJob {
  type: TrainType;
  progressTicks: number;
  totalTicks: number;
}

export interface StructureJob {
  type: BuildingType;
  progressTicks: number;
  totalTicks: number;
  ready: boolean;
}

export interface Order {
  kind: "move" | "attack" | "harvest" | "unload";
  x?: number;
  y?: number;
  targetId?: number;
  tileX?: number;
  tileY?: number;
}

export interface Entity {
  id: number;
  kind: "unit" | "building";
  type: EntityType;
  ownerId: string;
  x: number;
  y: number;
  facing: number;
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
  queue: TrainJob[];
  attackTarget: number | null;
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
  life: number;
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
}

export interface MatchState {
  roomId: string;
  mapId: string;
  tick: number;
  nextId: number;
  tileSize: number;
  width: number;
  height: number;
  /** 1 = wall (permanent). */
  blocked: Uint8Array;
  /** Remaining scrap on each tile. */
  scrapYield: Uint16Array;
  /** Building id occupying a tile, or 0. */
  occupy: Int32Array;
  players: Map<string, SimPlayer>;
  entities: Map<number, Entity>;
  projectiles: Projectile[];
  winner?: { playerId: string; team: number };
  ended: boolean;
  initialHumans: number;
  pendingComms: string[];
}
