/** Shared wire + domain types. If a field is not here, it does not exist. */

import type {
  AirDrop,
  BuildingType,
  Crit,
  DroneMode,
  EntityKind,
  EntityType,
  InfantryWeaponId,
  ShellType,
  FieldStructureType,
  Stance,
  TrainType,
  YardFieldType,
} from "./catalog.js";

export const PROTOCOL_VERSION = 60;
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
  | "build"
  | "repair"
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
  type: BuildingType | YardFieldType;
  progressTicks: number;
  totalTicks: number;
  ready: boolean;
  paused: boolean;
}

export interface TrainJobView {
  id: number;
  type: TrainType;
  progress: number;
  paused: boolean;
}

/** Kind of a Shift-queued order, for drawing its route. */
export type PlanKind = "move" | "attack" | "other";

export interface PlanPointView {
  kind: PlanKind;
  x: number;
  y: number;
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
  /** Own producer rally point, world pixels. Omitted when unset or not yours. */
  rally?: { x: number; y: number };
  cargo?: number;
  /** Mauler scrap-cart hit points. 0 means the cart is off. Omitted for other types. */
  cart?: number;
  /** Allied Mauler smoke grenades remaining. Omitted for enemies and other types. */
  smokeCharges?: number;
  /** 0–1 while state is deploy or undeploy. */
  deployProgress?: number;
  /** Seconds remaining before the special can fire again. Omitted when idle. */
  specialCooldown?: number;
  /** Burning hulk. Impassable until destroyed. */
  wreck?: boolean;
  /** Cyborg whose legs were just torn off. Nothing hurts him until it clears. Everyone who sees him sees it. */
  shielded?: boolean;
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
  /** Selected infantry gun. Allied infantry only. */
  weapon?: InfantryWeaponId;
  /** Allied infantry magazine, or the Walker's backpack rack. */
  clip?: number;
  /** Walker arms selected. 1 or 2. Omitted for everyone else. */
  guns?: 1 | 2;
  /** Walker arms that fired during the last step. `off` is the second arm's bearing when it took another target. */
  gatling?: { arms: 1 | 2; off?: number };
  /** Apocalypse roof mount: its world facing, and `fire` when it shot during the last step. */
  ciws?: { facing: number; fire?: true };
  /** Seconds left on a magazine change. Allied infantry. Omitted when idle. */
  reload?: number;
  /** Seconds until a planted support weapon can fire. Gunner bipod, or the mortar tube. Omitted once it is set. */
  bipod?: number;
  /** Unit is inside this building. Friendly snapshots only. */
  garrisonedIn?: number;
  /**
   * Own unit's Shift-queued route: the current order's point, then each queued
   * order's point, in run order. Omitted when nothing is queued.
   */
  plan?: PlanPointView[];
  /**
   * Soldiers inside a house, a hull, a supply truck, or a transport.
   * count/bars/ownerId are hidden from enemies while hide is set.
   * hide itself is friendly-only. A truck and a transport never hide.
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
  /** Wading walker (Titan) in a water tile: it cannot fire. Omitted when false. */
  wading?: boolean;
  /** Titan outriggers down: stationary, braced max HP. Omitted when false. */
  braced?: boolean;
  /** Seconds until the Titan's pods can fire the next rocket. Friendly snapshots; omitted when ready. */
  rocketReload?: number;
  /** Rockets left in the Titan's rack. Friendly snapshots. */
  rockets?: number;
  /** Rocketer's high-penetration missile, 0 or 1. Friendly snapshots. A supply truck refills it. */
  heavy?: number;
  /** Titan pods switched off. Friendly snapshots; omitted while on. */
  rocketsOff?: boolean;
  /** Stay put: no chase, no withdraw. Friendly snapshots. */
  holdPosition?: boolean;
  /** Overwatch heading in world radians. Friendly snapshots while guarding. */
  guardFacing?: number;
  /** Friendly unit this entity is escorting. Omitted when not guarding a unit. */
  guardTargetId?: number;
  /** Infantry this medic is bandaging. Omitted while he is only walking over. */
  tend?: number;
  /** Sandbags wrecked by a tank shell. The rubble stays. */
  ruined?: boolean;
  /**
   * Engineer field structures not built yet. The first is the piece on the job; `progress` is 0–1
   * once digging starts. Friendlies also get the queued pieces; enemies only see a piece being dug.
   */
  fieldSites?: { structure: FieldStructureType; x: number; y: number; facing: number; progress?: number }[];
  /**
   * Hatch crew on a tank. Friendlies always see hp. `out` means the head is
   * visible; enemies only receive this object while the hatch is open.
   */
  scout?: { hp: number; hpMax: number; out?: boolean };
  /**
   * Supply truck cab. `crew` is the factory driver. `open` means no one is
   * driving and any infantry can take it. `seats` counts player infantry
   * aboard, not the factory driver. Rider ids are friendly-only.
   */
  bed?: { crew?: boolean; seats: number; open?: boolean; riders?: number[] };
  /** Supply points left. Friendly supply trucks only. */
  supply?: number;
  /**
   * Aircraft flight. `alt` is elevation units above the ground (0 on the pad).
   * Everyone sees phase and height; fuel, bombs, rounds, and home are friendly-only.
   */
  air?: {
    phase: "parked" | "takeoff" | "fly" | "landing" | "crash";
    alt: number;
    fuel?: number;
    fuelMax?: number;
    bombs?: number;
    rounds?: number;
    homeId?: number;
    /** Transport: the load its bay takes. Friendly-only. */
    payload?: AirDrop;
    /** Transport: units aboard. Friendly-only. */
    troops?: number;
  };
  /** Paratrooper under his canopy: elevation units above the ground. Everyone who sees him sees it. */
  chute?: number;
  /** Planes homed on this Airfield, and its pad count. Allied Airfields only. */
  pads?: { used: number; cap: number };
  /**
   * Drone. Everyone sees the mode (it shows in the height). Battery, its
   * operator, and a recall are friendly-only. Height is on `air.alt`.
   */
  drone?: { mode: DroneMode; opId?: number; battery?: number; batteryMax?: number; recall?: boolean };
  /**
   * Drone Op's link. Friendly-only. `droneId` while it flies; otherwise
   * `charge` of the stowed drone, or `rebuild` seconds left on a new one.
   */
  droneLink?: { mode: DroneMode; droneId?: number; charge: number; chargeMax: number; rebuild?: number; launchMin: number };
  /**
   * Jump Jet's pack. Everyone sees the height (`alt`, elevation units over
   * the ground). Fuel, whether he is lit, and the refill are friendly-only.
   */
  jet?: { alt: number; up?: boolean; fuel?: number; fuelMax?: number; takeoffMin?: number; refuel?: number };
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
  placingType: BuildingType | YardFieldType | null;
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
  /** Air height in elevation units. Mortar bombs only. */
  z?: number;
  /** Arcing mortar bomb. Omitted for direct fire. */
  mortar?: boolean;
  /** Peak air height in elevation units. Mortar bombs only. */
  apex?: number;
  /** 0 at the tube, 1 at the ground. Mortar bombs and flamethrower globs. */
  arc?: number;
  /** Seconds from the tube to the ground. Mortar bombs and flamethrower globs. */
  hang?: number;
  /** Falling aircraft bomb. `z` is its height; it drops, it does not arc. */
  bomb?: boolean;
  /** Titan or Nebelwerfer rocket. `z` is its height; a Nebelwerfer rocket lobs, so it climbs and falls. */
  rocket?: boolean;
  /** Rocketer high-penetration missile. Same flight as a rocket, a longer body in the air. */
  heavy?: boolean;
  /**
   * Flamethrower glob. `z` is its height above the ground and `arc` is 0 at the
   * lance, 1 where it lands. `fromId` is the Pyro, so the jet can be drawn from his nozzle.
   */
  flame?: boolean;
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
  /** Round struck water. Client plays a splash; no dirt scar. */
  splash?: boolean;
  /** Shooter. Used to place the muzzle flash when the round never made a snapshot. */
  fromId?: number;
  /** Loaded 75mm type. Omitted for small-arms and crush. */
  shell?: ShellType;
  /** Mortar bomb. The burst is a vertical dirt or water column, not a tank cone. */
  mortar?: boolean;
  /** Aircraft bomb. A much bigger column than a mortar. */
  bomb?: boolean;
  /** Titan rocket. A mortar-style burst, smaller. */
  rocket?: boolean;
  /** Rocket air burst beside a plane: elevation units above the ground. No dirt, no crater. */
  z?: number;
  /** A CIWS or RAM met a rocket in the air. "kill": it burst, nothing hurt under it. "miss" (RAM): the interceptor went off beside it. */
  intercept?: boolean;
  /** A killed Pyro's fuel tanks went up. A big rolling fireball, then burning ground around him. */
  cookoff?: boolean;
}

/** Blood droplet around a corpse. World pixels. */
export interface BloodStainView {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
}

/**
 * Fallen infantry. Passable, blocks no sight, and cannot be destroyed.
 * Friendly corpses are always sent; enemy corpses only while the tile is seen.
 */
export interface CorpseView {
  id: number;
  type: EntityType;
  ownerId: string;
  x: number;
  y: number;
  facing: number;
  /** Sim tick the soldier fell. Drives the death pose. */
  bornTick: number;
  blood: BloodStainView[];
  /**
   * Killed by fire. No blood. The client holds a blackened sprite, then
   * collapses it. Omitted for every other death.
   */
  burned?: true;
}

/** Persistent crater from a heavy shell on dirt. */
export interface ShellHoleView {
  id: number;
  x: number;
  y: number;
  /** World-pixel radius. Scales with caliber. */
  radius: number;
  /** Incoming bearing, world radians. Unused when `round` is set. */
  ang: number;
  seed: number;
  /** Vertical hit. The scar is a circle on the ground, not a gouge. */
  round?: boolean;
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

/** Burning ground from a flamethrower or a Pyro's tanks. Burns every soldier standing in it. */
export interface GroundFireView {
  id: number;
  x: number;
  y: number;
  /** World pixels. */
  radius: number;
  life: number;
  lifeMax: number;
}

/** Butterfly mine on the ground. Your side's always; an enemy's once one of your men is close to it. */
export interface MineView {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  /** False while it is still arming. Omitted once live. */
  armed?: false;
}

/** Supply crate from a transport. */
export interface CrateView {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  /** Elevation units while it hangs under its canopy. Omitted once down. */
  alt?: number;
  /** Supply points left. Allied crates only. */
  supply?: number;
  supplyMax?: number;
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
  /** Burning ground on tiles you can see, and fires your side lit. Empty until the first flamethrower burst. */
  fires: GroundFireView[];
  /** Mines you can see. Empty until the first cluster drop. */
  mines: MineView[];
  /** Supply crates you can see. Empty until the first crate drop. */
  crates: CrateView[];
  scrap: ScrapCell[];
  /**
   * Tree tiles removed this match. Empty until the first one falls.
   * `burn` is a tree a flamethrower force-attack set alight.
   */
  clearedTrees: { x: number; y: number; burn?: true }[];
  /** Fallen infantry. Empty until the first death in the open. */
  bodies: CorpseView[];
  /** Heavy-shell craters on dirt. Empty until the first ground strike. */
  holes: ShellHoleView[];
  /**
   * The server's fog mask for `youPlayerId`, row-major, as run lengths that
   * alternate hidden / lit starting with hidden. See `decodeVisionRuns`.
   */
  vision?: number[];
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
  /** `queue`: Shift-queued. The unit runs it after its current and earlier queued orders finish. */
  /** `facing`: world radians the unit turns to after it arrives. A held move click sets it. */
  | { type: "cmd.move"; ids: number[]; x: number; y: number; facing?: number; queue?: boolean }
  | { type: "cmd.attack"; ids: number[]; targetId: number; queue?: boolean }
  | { type: "cmd.attackmove"; ids: number[]; x: number; y: number; queue?: boolean }
  | {
      type: "cmd.forceattack";
      ids: number[];
      x: number;
      y: number;
      targetId?: number;
      once?: boolean;
      queue?: boolean;
    }
  | { type: "cmd.stop"; ids: number[] }
  | { type: "cmd.harvest"; ids: number[]; tileX?: number; tileY?: number; queue?: boolean }
  | { type: "cmd.ammo"; ids: number[]; shell: ShellType }
  | { type: "cmd.weapon"; ids: number[]; weapon: InfantryWeaponId }
  | { type: "cmd.guns"; ids: number[]; guns: 1 | 2 }
  | { type: "cmd.rockets"; ids: number[]; on: boolean }
  | { type: "cmd.build"; building: BuildingType | YardFieldType }
  | { type: "cmd.place"; building: BuildingType; tx: number; ty: number }
  | { type: "cmd.train"; unit: TrainType }
  | { type: "cmd.pause"; what: "train" | "structure"; jobId?: number; unit?: TrainType; paused?: boolean }
  | { type: "cmd.cancel"; what: "structure" | "train"; buildingId?: number; jobId?: number; unit?: TrainType }
  /** Rally point for owned producers in `ids`. A point on a building's own footprint clears its rally. */
  | { type: "cmd.rally"; ids: number[]; x: number; y: number }
  | { type: "cmd.sell"; id: number }
  | { type: "cmd.deploy"; id: number }
  | { type: "cmd.garrison"; ids: number[]; buildingId: number; queue?: boolean }
  | { type: "cmd.ungarrison"; ids?: number[]; buildingId?: number; x?: number; y?: number }
  | { type: "cmd.garrisonhide"; ids: number[]; hide: boolean }
  | { type: "cmd.scout"; ids: number[]; out: boolean }
  | { type: "cmd.stance"; ids: number[]; stance: Stance }
  | { type: "cmd.hold"; ids: number[]; hold: boolean }
  | { type: "cmd.rotate"; ids: number[]; x: number; y: number; queue?: boolean }
  | {
      type: "cmd.guard";
      ids: number[];
      x?: number;
      y?: number;
      facing?: number;
      targetId?: number;
      queue?: boolean;
    }
  | {
      type: "cmd.field";
      ids: number[];
      structure: FieldStructureType;
      x: number;
      y: number;
      facing: number;
      /** Drag end. When set, pieces are laid end to end from (x, y) toward it. */
      x2?: number;
      y2?: number;
    }
  | { type: "cmd.repair"; ids: number[]; targetId: number; queue?: boolean }
  | { type: "cmd.board"; ids: number[]; truckId: number; queue?: boolean }
  | { type: "cmd.unboard"; ids?: number[]; truckId?: number }
  | { type: "cmd.supply"; ids: number[]; targetId: number; queue?: boolean }
  /** Aircraft fly home, land on their pad, and refuel and rearm there. */
  | { type: "cmd.land"; ids: number[] }
  /** Transport on its pad: what the bay takes next — a mine canister, a supply crate, or paratroops. */
  | { type: "cmd.payload"; ids: number[]; payload: AirDrop }
  /**
   * Drone Op and drone controls. `ids` may name operators or their drones.
   * launch: put the stowed drone up. recall: fly it back to be stowed.
   * mode: Surveillance (high, wide sight) or Search & Destroy (low, strikes).
   */
  | { type: "cmd.drone"; ids: number[]; action: "launch" | "recall" | "mode"; mode?: DroneMode }
  /** Jump Jets: `up` lights the pack and lifts off; `land` sets down on the nearest open ground. */
  | { type: "cmd.jet"; ids: number[]; action: "up" | "land" }
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
  | "ended"
  | "cart";

export type { AirDrop, BuildingType, EntityType, FieldStructureType, TrainType, EntityKind, ShellType, Crit, Stance, YardFieldType };
