import type { AirDrop, BuildingType, Crit, DroneMode, EntityType, FieldStructureType, InfantryWeaponId, ShellType, Stance, TrainType } from "../catalog.js";
import type { AiDifficulty, ClientMessage, CorpseView, EntityState, ImpactView, ShellHoleView } from "../protocol.js";

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
    | "withdraw"
    | "build"
    | "repair"
    | "board"
    | "supply"
    | "land";
  x?: number;
  y?: number;
  /** World radians. Guard / rotate destination facing. */
  facing?: number;
  /** Attack, force-attack, garrison house, or the unit being escorted. */
  targetId?: number;
  tileX?: number;
  tileY?: number;
  /** Auto-acquired attack. Incoming fire may interrupt this; player orders are kept. */
  auto?: boolean;
  /** Fire the main gun once, then idle. Smoke force-attack uses this; other one-shots can too. */
  once?: boolean;
  /** Group-move cap in catalog tiles/sec. Slowest selected unit that can still walk. */
  pace?: number;
  /** Engineer field structure being built. */
  structure?: FieldStructureType;
  /** Panic retreat: after this order, the Mauler returns to HQ and holds. */
  returnToBase?: boolean;
}

/** Player commands that Shift can queue. */
export type QueueableCommand = Extract<
  ClientMessage,
  {
    type:
      | "cmd.move"
      | "cmd.attack"
      | "cmd.attackmove"
      | "cmd.forceattack"
      | "cmd.guard"
      | "cmd.rotate"
      | "cmd.garrison"
      | "cmd.harvest"
      | "cmd.repair"
      | "cmd.supply"
      | "cmd.board";
  }
>;

/** One unit's share of a queued command. The point is already spread into its formation slot. */
export interface QueuedOrder {
  msg: QueueableCommand;
  /** Group-move cap captured when the order was queued. */
  pace?: number;
}

/** Where a plane is in its sortie. */
export type AirPhase = "parked" | "takeoff" | "fly" | "landing";

/** Flight state. Aircraft only. */
export interface AirState {
  phase: AirPhase;
  /** Elevation units above the ground under the plane. 0 on the pad and the takeoff roll. */
  alt: number;
  /** 0–1 share of cruise speed. */
  speed: number;
  /** Seconds of flight left in the tank. */
  fuel: number;
  bombs: number;
  /** Wing-MG rounds left in both belts. For the Fw 190: barrages left (whole ones fire). */
  rounds: number;
  /** Airfield this plane parks on. Null once it is gone and no other pad is free. */
  homeId: number | null;
  /** Pad index on the home Airfield. */
  pad: number;
  /** Seconds on the pad toward hanging the next bomb. */
  rearm: number;
  /** Seconds into the takeoff roll. */
  roll: number;
  /** Flying straight out past the target before turning in again. */
  extend: boolean;
  /** Rolling on the ground between a hardstand and the strip (takeoff or landing). */
  taxi: boolean;
  /** Landing: wheels are down on the strip. */
  touched: boolean;
  /** Transport only: the load its bay takes on the pad. The canister (mines, crate) is `bombs`; troops are its garrison. */
  payload?: AirDrop;
  /** Transport only: jumpers are going out of the door. The plane holds its course until the last is gone. */
  jumping?: boolean;
  /** Transport only: seconds until the next jumper goes. */
  door?: number;
}

/** Soldier hanging under a canopy on the way down from a transport. */
export interface Chute {
  /** Elevation units above the ground. */
  alt: number;
  /** World px/s drift carried out of the door. */
  vx: number;
  vy: number;
}

/** A butterfly bomblet lying on the ground. Not an entity: nothing can shoot it. */
export interface Mine {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  /** Seconds until it is live. */
  arm: number;
  /** Seconds until the fuze gives out. */
  life: number;
}

/** A supply crate dropped by parachute. Allied units standing at it draw ammo and patch up. */
export interface SupplyCrate {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  /** Elevation units above the ground while it hangs under its canopy. 0 once down. */
  alt: number;
  /** World px/s while falling: it drifts onto the drop point. */
  vx: number;
  vy: number;
  supply: number;
  life: number;
  /** Seconds banked toward the next hand-out. */
  work: number;
  /** Rotates hand-outs among the units at the crate. */
  turn: number;
}

/** Drone Op only: the one quadcopter he flies. */
export interface DroneLink {
  /** Drone in the air. Null while it is stowed or being rebuilt. */
  droneId: number | null;
  /** Mode the next launch takes, and the flying drone's mode. */
  mode: DroneMode;
  /** Battery seconds in the stowed drone. */
  charge: number;
  /** Seconds left putting a new drone together. 0 when one is in hand or aloft. */
  rebuild: number;
}

/** Drone only. Height lives on `air.alt`. */
export interface DroneState {
  /** Drone Op flying it. */
  opId: number;
  mode: DroneMode;
  /** Seconds of flight left. */
  battery: number;
  /** Flying back to be stowed. */
  recall: boolean;
  /** Guard post it circles: a point, or a friendly unit it stays over. */
  guard?: { x: number; y: number; targetId?: number } | null;
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
  /** Rounds left in the current infantry magazine. 0 on vehicles. */
  clip: number;
  /** Seconds remaining on an infantry magazine change. */
  reload: number;
  /** Personal reload-time scale. 1 = catalog. Baked at spawn. */
  reloadMul: number;
  harvestTime: number;
  cargo: number;
  /** Scrap cart on a Mauler. 0 on every other type, and 0 when the cart is off. */
  cartHp: number;
  harvestTile: Vec | null;
  autoHarvest: boolean;
  /** Popped smoke and is fleeing / holding at HQ. Player orders clear this. */
  returnToBase: boolean;
  deployTime: number;
  /** Seconds remaining before this unit's special can fire again. */
  specialCooldown: number;
  /** Mauler smoke grenades left. 0 on other types. */
  smokeCharges: number;
  queue: TrainJob[];
  /** Producer rally point. New units walk here on spawn. Unset means stay at the door. */
  rally?: Vec;
  attackTarget: number | null;
  /** True after an armored hull dies; blocks until the wreck is destroyed. */
  wreck: boolean;
  ammo: Partial<Record<ShellType, number>>;
  shell: ShellType | null;
  /** Selected infantry gun. Null on vehicles and buildings. */
  weapon: InfantryWeaponId | null;
  /** Walker arms in use. 1 conserves the rack. 2 is both guns. Other types omit it. */
  gatlingGuns?: 1 | 2;
  /** Titan outriggers are down: stationary, hull locked, braced max HP. Missing means false. */
  braced?: boolean;
  /** Seconds until the Titan's pods can fire the next rocket. Missing means ready. */
  rocketCooldown?: number;
  /** Rockets left in the Titan's rack. Missing on types without pods. */
  rockets?: number;
  /** Rockets still to leave in the salvo under way. 0 or missing between salvos. */
  rocketSalvo?: number;
  /** Player switched the pods off. Missing means on. */
  rocketsOff?: boolean;
  /** Entity the Titan's pods are laying on, apart from the main gun's target. */
  rocketTarget?: number | null;
  /** Last Walker volley: sim tick, arms that fired, and the off-arm bearing when it took a second target. */
  gatlingFire?: { tick: number; arms: 1 | 2; offAim?: number };
  /** Apocalypse roof mount's own traverse. Missing until it first moves: it rides the turret. */
  ciwsFacing?: number;
  /** Entity the roof mount is laying on, apart from the main guns' target. */
  ciwsTarget?: number | null;
  /** Sim tick the roof mount last fired, on a unit or a rocket. */
  ciwsFireTick?: number;
  /** Seconds the MG42 bipod has been set while prone. 0 until the gunner crawls. */
  bipod: number;
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
  /** Sandbags broken by a tank shell. The entity stays as rubble. */
  ruined: boolean;
  /** Extra hit points currently granted by sandbags. Removed when the soldier leaves. */
  coverBonus: number;
  /** Seconds spent on the current build or repair. */
  work: number;
  /** Shift-queued orders, run one after another once the current order ends. Cleared by any unqueued order. */
  orderQueue?: QueuedOrder[];
  /** Engineer wall pieces still to lay after the current build order. Cleared by any new order. */
  fieldQueue?: { x: number; y: number; facing: number }[];
  /** Wounded infantry this medic is walking to or bandaging. */
  tendId?: number;
  /** Seconds of contact toward clearing one crit. */
  mendTime?: number;
  /** Medic only: seconds since he last lost HP. */
  selfQuiet?: number;
  /** Medic only: HP at the end of the last tick, to notice new hits. */
  selfHpSeen?: number;
  /** Cyborg only: sim tick until which nothing takes his HP. Set when the legs are torn off. */
  shieldUntilTick?: number;
  /**
   * Factory driver still at the wheel. Supply trucks spawn true.
   * False on every other type, and after that driver is killed.
   */
  crew: boolean;
  /** Supply points left. 0 on every type except the supply truck. */
  supply: number;
  /** Aircraft only. Drones carry it too, for their height. */
  air?: AirState;
  /** Drone Op only. */
  droneLink?: DroneLink;
  /** Drone only. */
  drone?: DroneState;
  /** Paratrooper on the way down. No orders, no fire; small arms can reach him. */
  chute?: Chute;
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
  /**
   * Infantry hit deals this share of the victim's max HP.
   * Set by the scoped rifle and the PTRD. Omitted for every other gun.
   */
  hpFraction?: number;
  /** Elevation units at the current point. Omit in tests for ground-level. */
  z?: number;
  /** Elevation units per second along the shot. Direct fire only. */
  vz?: number;
  /**
   * Arcing mortar bomb, a bomb falling from a plane, or a Titan rocket (straight
   * and fast, bursts at its fused point or on whatever it meets first).
   * Omitted for rifles, machine guns, and tank shells.
   */
  flight?: "mortar" | "bomb" | "rocket" | "flame" | "cluster";
  /** Fused landing point for a mortar bomb or a rocket. A plane's barrage round: its point on the line. */
  landX?: number;
  landY?: number;
  /** Peak air height in elevation units. */
  apex?: number;
  /** Seconds from the tube to the ground. */
  flightTime?: number;
  /** Force-attack: the blast also catches allies. */
  harmAllies?: boolean;
  /** Rocket fused on a plane: it bursts in the air and only catches aircraft. */
  airBurst?: boolean;
  /** Rocket only: the carrier type whose rack (rocketRackOf) sets its splash and armor dent. */
  launcher?: EntityType;
  /** Lobbed rocket only: height it left the tubes at. `apex` rides on top of the line from here to the ground. */
  launchZ?: number;
  /** Rocket only: CIWS mounts that already fired a burst at it. Each gets one try. */
  ciwsTried?: number[];
  /** Fired by an anti-air gun (MG42, gatlings). Only these meet a high drone. */
  antiAir?: boolean;
  /** Fired down from a plane's wing cannon: on a hull it meets the roof (resolveRoofHit), not a face. */
  fromAbove?: boolean;
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

/**
 * Burning ground left by a flamethrower glob or a Pyro's tanks going up.
 * It burns every soldier standing in it until it goes out.
 */
export interface GroundFire {
  id: number;
  /** Who lit it. Burns friend and foe alike. */
  ownerId: string;
  x: number;
  y: number;
  /** World pixels. Grows as more fuel lands on it. */
  radius: number;
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
  /** Sim tick for the CPU's next support, shell, and defense pass. */
  aiNextMicroTick?: number;
  /** Sim tick before which the CPU skips a building that found no room in its base. */
  aiNoRoomUntil?: Partial<Record<BuildingType, number>>;
  /** Where each CPU Mauler last stood still, and since which tick. Finds jams at a dock or a lane. */
  aiHaulerStill?: Record<number, { x: number; y: number; since: number }>;
}

export interface MatchState {
  roomId: string;
  mapId: string;
  tick: number;
  /** Sim steps per wall-clock tick. 1–5. */
  gameSpeed: number;
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
  /** 1 = sandbags block every unit. 2 = dragon's teeth block vehicles only. */
  fortBlock: Uint8Array;
  players: Map<string, SimPlayer>;
  entities: Map<number, Entity>;
  projectiles: Projectile[];
  smokeClouds: SmokeCloud[];
  /** Burning ground. Empty until the first flamethrower burst. */
  fires: GroundFire[];
  /** Butterfly mines from a transport's cluster canister. Empty until the first drop. */
  mines: Mine[];
  /** Supply crates from a transport. Empty until the first drop. */
  crates: SupplyCrate[];
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
  /** Infantry who died in the open. Not entities: passable and indestructible. */
  bodies: CorpseView[];
  /** Heavy-shell craters. Not entities. */
  holes: ShellHoleView[];
}
