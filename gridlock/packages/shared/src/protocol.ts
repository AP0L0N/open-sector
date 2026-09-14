/** Shared wire + domain types. If a field is not here, it does not exist. */

import type { BuildingType, Crit, EntityKind, EntityType, ShellType, Stance, TrainType } from "./catalog.js";

export const PROTOCOL_VERSION = 16;
export const SLOT_COUNT = 8;
export const MIN_SLOTS = 2;
export const MAX_SLOTS = 8;
export const MAX_ROOMS = 20;
export const DISCONNECT_GRACE_MS = 10_000;
export const ROOM_CODE_LENGTH = 4;
export const MIN_HUMANS_TO_START = 1;

export type Phase = "lobby" | "countdown" | "playing" | "ended";
export type SlotStatus = "open" | "human" | "closed" | "ai";
/** CPU difficulty. Easy is the only mode for now. */
export type AiDifficulty = "easy";
export type RoomMode = "skirmish" | "network";
export type EntityState =
  | "idle"
  | "move"
  | "attack"
  | "harvest"
  | "unload"
  | "train"
  | "deploy"
  | "undeploy"
  | "wreck"
  | "garrison"
  | "dead";

export interface Slot {
  index: number;
  status: SlotStatus;
  playerId?: string;
  name?: string;
  colorId: number;
  team: number;
  spawnId: number;
  ready: boolean;
  /** Set when status is ai. */
  ai?: AiDifficulty;
}

export interface RoomState {
  id: string;
  hostId: string;
  mapId: string;
  phase: Phase;
  mode: RoomMode;
  maxSlots: number;
  slots: Slot[];
  createdAt: number;
}

export interface StructureQueueView {
  type: BuildingType;
  progressTicks: number;
  totalTicks: number;
  ready: boolean;
}

export interface TrainJobView {
  id: number;
  type: TrainType;
  progress: number;
  paused: boolean;
}

export interface EntityView {
  id: number;
  kind: EntityKind;
  type: EntityType;
  ownerId: string;
  x: number;
  y: number;
  facing: number;
  /** Gun angle. Omitted when the type has no independent turret. */
  turretFacing?: number;
  hp: number;
  hpMax: number;
  state: EntityState;
  tileW: number;
  tileH: number;
  tileX: number;
  tileY: number;
  trainProgress?: number;
  /** Allied production line. Omitted for enemies and empty queues. */
  trainQueue?: TrainJobView[];
  cargo?: number;
  /** 0–1 while state is deploy or undeploy. */
  deployProgress?: number;
  /** Seconds remaining before the special can fire again. Omitted when idle. */
  specialCooldown?: number;
  /** Burning hulk. Impassable until destroyed. */
  wreck?: boolean;
  /** Allied ammo rack. Omitted for enemies and unarmed types. */
  ammo?: Partial<Record<ShellType, number>>;
  /** Loaded shell. Allied guns only. */
  shell?: ShellType;
  /** Allied coaxial MG belt. Omitted when the type has no MG. */
  mgAmmo?: number;
  /** 0–1 heat. Allied MG only. */
  mgHeat?: number;
  /** Seconds the MG is jammed. Omitted when cool. */
  mgOverheat?: number;
  /** Unit is inside this building. Friendly snapshots only. */
  garrisonedIn?: number;
  /**
   * Occupied civilian house. count/bars/ownerId are hidden from enemies while
   * hide is set. hide itself is friendly-only.
   */
  garrison?: {
    count: number;
    cap: number;
    ownerId?: string;
    bars?: { hp: number; hpMax: number }[];
    hide?: boolean;
  };
  /** Infantry taking this building. Omitted when idle. */
  capture?: { ownerId: string; progress: number };
  /** Lasting injuries. Omitted when none. */
  crits?: Crit[];
  /** Live infantry posture. Omitted for vehicles and buildings. */
  stance?: Stance;
  /** Commanded infantry posture. Omitted when it matches stance. */
  stanceOrder?: Stance;
  /** Infantry in a water tile. Omitted when false. */
  swimming?: boolean;
  /** Stay put: no chase, no withdraw. Friendly snapshots. */
  holdPosition?: boolean;
  /** Overwatch heading in world radians. Friendly snapshots while guarding. */
  guardFacing?: number;
}

export interface PlayerPublic {
  playerId: string;
  name: string;
  colorId: number;
  team: number;
  alive: boolean;
}

export interface YouState {
  scrap: number;
  provided: number;
  used: number;
  lowPower: boolean;
  structureQueue: StructureQueueView | null;
  placingType: BuildingType | null;
  alive: boolean;
  hqId: number | null;
}

export interface ScrapCell {
  x: number;
  y: number;
  yield: number;
}

export interface ProjectileView {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  caliber: number;
  fromId: number;
  bounced: boolean;
  /** Loaded 75mm type. Omitted for small-arms. */
  shell?: ShellType;
}

export type ImpactKind = "miss" | "puff" | "crush" | "ricochet" | "glance" | "hit" | "pen" | "kill";

export interface ImpactView {
  id: number;
  ownerId: string;
  kind: ImpactKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** mm. Omitted for crush kills. */
  caliber?: number;
  /** Ammo cook-off / structure collapse. Fireball, not a kinetic spark. */
  blast?: boolean;
  /** Shooter. Used to draw a tracer when the round never made a snapshot. */
  fromId?: number;
  /** Loaded 75mm type. Omitted for small-arms and crush. */
  shell?: ShellType;
}

/** Lasting artillery smoke screen. Blocks vision for every player. */
export interface SmokeCloudView {
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

export interface MatchSnapshot {
  tick: number;
  /** Sim multiplier. 1–5. */
  gameSpeed: number;
  mapId: string;
  youPlayerId: string;
  you: YouState;
  players: PlayerPublic[];
  entities: EntityView[];
  projectiles: ProjectileView[];
  impacts: ImpactView[];
  smoke: SmokeCloudView[];
  scrap: ScrapCell[];
  /** Tree tiles a vehicle has crushed. Empty until the first flatten. */
  clearedTrees: { x: number; y: number }[];
  winner?: { playerId: string; team: number };
}

/** @deprecated M1 name; snapshots replaced commander tokens. */
export type MatchView = MatchSnapshot;

export type ClientMessage =
  | { type: "hello"; name: string }
  | { type: "room.create"; mapId: string; maxSlots: number; mode?: RoomMode }
  | { type: "room.join"; code: string }
  | { type: "room.leave" }
  | { type: "slot.update"; colorId?: number; team?: number; spawnId?: number; ready?: boolean }
  | {
      type: "slot.host";
      slotIndex: number;
      status?: SlotStatus;
      kick?: boolean;
      colorId?: number;
      team?: number;
      spawnId?: number;
    }
  | { type: "room.map"; mapId: string }
  | { type: "room.start" }
  | { type: "chat"; text: string }
  | { type: "cmd.move"; ids: number[]; x: number; y: number }
  | { type: "cmd.attack"; ids: number[]; targetId: number }
  | { type: "cmd.attackmove"; ids: number[]; x: number; y: number }
  | { type: "cmd.forceattack"; ids: number[]; x: number; y: number; targetId?: number }
  | { type: "cmd.stop"; ids: number[] }
  | { type: "cmd.harvest"; ids: number[]; tileX?: number; tileY?: number }
  | { type: "cmd.ammo"; ids: number[]; shell: ShellType }
  | { type: "cmd.build"; building: BuildingType }
  | { type: "cmd.place"; building: BuildingType; tx: number; ty: number }
  | { type: "cmd.train"; unit: TrainType }
  | { type: "cmd.pause"; what: "train"; jobId?: number; unit?: TrainType }
  | { type: "cmd.cancel"; what: "structure" | "train"; buildingId?: number; jobId?: number; unit?: TrainType }
  | { type: "cmd.sell"; id: number }
  | { type: "cmd.deploy"; id: number }
  | { type: "cmd.garrison"; ids: number[]; buildingId: number }
  | { type: "cmd.ungarrison"; ids?: number[]; buildingId?: number; x?: number; y?: number }
  | { type: "cmd.garrisonhide"; ids: number[]; hide: boolean }
  | { type: "cmd.stance"; ids: number[]; stance: Stance }
  | { type: "cmd.hold"; ids: number[]; hold: boolean }
  | { type: "cmd.rotate"; ids: number[]; x: number; y: number }
  | { type: "cmd.guard"; ids: number[]; x: number; y: number; facing: number }
  | { type: "cmd.speed"; delta: number };

export type ServerMessage =
  | { type: "welcome"; playerId: string; protocol: number }
  | { type: "room.state"; room: RoomState }
  | { type: "room.error"; code: string; message: string }
  | { type: "match.start"; match: MatchSnapshot }
  | { type: "match.snapshot"; match: MatchSnapshot }
  | { type: "match.end"; winnerPlayerId: string | null; winnerTeam: number | null; reason: "core" | "host" }
  | { type: "room.closed"; reason: string }
  | { type: "chat"; from: string; name: string; text: string; at: number };

export type ErrorCode =
  | "bad_payload"
  | "not_found"
  | "full"
  | "started"
  | "not_host"
  | "not_member"
  | "color_taken"
  | "spawn_taken"
  | "not_ready"
  | "no_map"
  | "too_few"
  | "room_cap"
  | "closed"
  | "bad_slot"
  | "low_scrap"
  | "invalid_place"
  | "busy"
  | "dead"
  | "no_core"
  | "not_yours"
  | "unit_cap"
  | "ended";

export type { BuildingType, EntityType, TrainType, EntityKind, ShellType, Crit, Stance };
