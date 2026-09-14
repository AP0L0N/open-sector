/** Shared wire + domain types. If a field is not here, it does not exist. */

import type { BuildingType, EntityKind, EntityType, TrainType } from "./catalog.js";

export const PROTOCOL_VERSION = 6;
export const SLOT_COUNT = 8;
export const MIN_SLOTS = 2;
export const MAX_SLOTS = 8;
export const MAX_ROOMS = 20;
export const DISCONNECT_GRACE_MS = 10_000;
export const ROOM_CODE_LENGTH = 4;
export const MIN_HUMANS_TO_START = 1;

export type Phase = "lobby" | "countdown" | "playing" | "ended";
export type SlotStatus = "open" | "human" | "closed";
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
}

export type ImpactKind = "miss" | "ricochet" | "glance" | "hit" | "pen" | "kill";

export interface ImpactView {
  id: number;
  ownerId: string;
  kind: ImpactKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
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
  scrap: ScrapCell[];
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
  | { type: "slot.host"; slotIndex: number; status?: SlotStatus; kick?: boolean }
  | { type: "room.map"; mapId: string }
  | { type: "room.start" }
  | { type: "chat"; text: string }
  | { type: "cmd.move"; ids: number[]; x: number; y: number }
  | { type: "cmd.attack"; ids: number[]; targetId: number }
  | { type: "cmd.stop"; ids: number[] }
  | { type: "cmd.harvest"; ids: number[]; tileX: number; tileY: number }
  | { type: "cmd.build"; building: BuildingType }
  | { type: "cmd.place"; building: BuildingType; tx: number; ty: number }
  | { type: "cmd.train"; unit: TrainType }
  | { type: "cmd.pause"; what: "train"; jobId?: number; unit?: TrainType }
  | { type: "cmd.cancel"; what: "structure" | "train"; buildingId?: number; jobId?: number; unit?: TrainType }
  | { type: "cmd.sell"; id: number }
  | { type: "cmd.deploy"; id: number }
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

export type { BuildingType, EntityType, TrainType, EntityKind };
