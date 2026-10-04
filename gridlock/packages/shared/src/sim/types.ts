import type { AirDrop, BuildingType, Crit, DroneMode, EntityType, FieldStructureType, InfantryWeaponId, ShellType, Stance, TrainType, YardFieldType } from "../catalog.js";
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
  type: BuildingType | YardFieldType;
  progressTicks: number;
  totalTicks: number;
  ready: boolean;
  paused: boolean;
  /** Scrap already drained for this job. */
  paid: number;
  /** Sandbag or wall line sited before the yard builds it. */
  sites?: { x: number; y: number; facing: number }[];
}

export interface Order {
  kind:
    | "move"
    | "attack"
    | "attackmove"
    | "patrol"
    | "forceattack"
    | "garrison"
    | "rotate"
    | "guard"
    | "withdraw"
    | "build"
    | "repair"
    | "board"
    | "supply"
    | "disable"
    | "tow"
    | "land";
  x?: number;
  y?: number;
  /** World radians. Guard destination facing. */
  facing?: number;
  /** World radians a move turns to once the unit arrives. Not the travel heading. */
  arrive?: number;
  /** Attack, force-attack, garrison house, or the unit being escorted. */
  targetId?: number;
  tileX?: number;
  tileY?: number;
  /** Auto-acquired attack. Incoming fire may interrupt this; player orders are kept. */
  auto?: boolean;
  /** Fire the main gun once, then idle. Smoke force-attack uses this; other one-shots can too. */
  once?: boolean;
  /**
   * Copied from a garrison host's force-attack. Dropped when that aim ends
   * or the point leaves this soldier's range. Not a wire field.
   */
  relay?: boolean;
  /** Group-move cap in catalog tiles/sec. Slowest selected unit that can still walk. */
  pace?: number;
  /** Engineer field structure being built. */
  structure?: FieldStructureType;
  /** Base building an engineer is raising at `tileX`, `tileY`. The Smelter on distant scrap. */
  building?: BuildingType;
  /** Panic retreat: after this order, the Mauler returns to HQ and holds. */
  returnToBase?: boolean;
  /**
   * Patrol polyline in world pixels. An open route starts where the unit stood.
   * A loop is only the closed spots. Not a wire field; the command sends the
   * clicks and the snapshot sends `patrol`.
   */
  route?: Vec[];
  /** Index in `route` the unit is walking toward. A tower's lamp turns toward this spot. */
  leg?: number;
  /** 1 toward the end of the route, -1 back toward the start. A loop stays at 1. */
  dir?: 1 | -1;
  /** Circuit. The last spot leads back to the first, and the route does not reverse. */
  loop?: boolean;
  /** Units given this patrol together. One contact pulls the group. */
  group?: number;
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
      | "cmd.repair"
      | "cmd.supply"
      | "cmd.disable"
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
export type AirPhase = "parked" | "takeoff" | "fly" | "landing" | "crash";

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
  /** The bomb went this sortie. The plane turns for home. Cleared on takeoff. Not a wire field. */
  bombed?: boolean;
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
  /**
   * Area this plane was told to guard. Kept while it lands to rearm, then it
   * flies back. Any other order clears it. Not a wire field.
   */
  guard?: { x: number; y: number } | null;
  /** Crash only: signed radians per second. Rolled once when the fall starts. Zero once the glide is spent. */
  yaw?: number;
  /** Crash only: elevation units per second this airframe sinks. Rolled once. */
  sink?: number;
  /** Crash only: world point the fall started. */
  originX?: number;
  originY?: number;
  /** Crash only: how far this fall may travel from the origin, world px. Rolled once. */
  reach?: number;
  /** Crash only: entity ids this airframe has already struck. */
  struck?: number[];
}

/** Soldier hanging under a canopy on the way down from a transport. */
export interface Chute {
  /** Elevation units above the ground. */
  alt: number;
  /** World px/s drift carried out of the door. */
  vx: number;
  vy: number;
}

/** A mine lying on the ground. Not an entity: nothing can shoot it. Any ground unit sets it off. A supply truck on your side can disable it. The enemy is not shown it. */
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

/** Jump Jet only: his jet pack. */
export interface JetState {
  /** Elevation units above the ground under him. 0 while he walks. */
  alt: number;
  /** Wants to be in the air. False while he walks, and on the way down. */
  up: boolean;
  /** Seconds of flight left in the pack. */
  fuel: number;
  /** Seconds on the ground before the pack starts to refill. */
  refuel: number;
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

/** Submarine depth. It leaves the slip surfaced. */
export interface DiveState {
  /** Running submerged. */
  down: boolean;
  /** Seconds of air left below. Refills on the surface. */
  air: number;
  /** Ran out of air and came up: it stays up until the air is full again. */
  winded?: boolean;
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

/** A Wall section turned into a lifting gate. */
export interface GateState {
  /** Locked: nobody passes and the boom stays down. */
  locked: boolean;
  /** Boom lift, 0 down to 1 up. */
  open: number;
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
  /**
   * Fire is what dropped this soldier to 0. Read when the corpse is left,
   * then discarded with the entity. Not sent on a living unit.
   */
  fireDeath?: true;
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
  /** Scrap cart on a Mauler. 0 on every other type, and 0 when the cart is off. */
  cartHp: number;
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
  /**
   * Still loitering with the units that came out this door. A player order
   * clears it. The next spawn packs the cluster into a block. Not on the wire.
   */
  doorGroup?: true;
  attackTarget: number | null;
  /** True after an armored hull dies; blocks until the wreck is destroyed. */
  wreck: boolean;
  ammo: Partial<Record<ShellType, number>>;
  shell: ShellType | null;
  /** Selected infantry gun. Null on vehicles and buildings. */
  weapon: InfantryWeaponId | null;
  /** Walker arms in use. 1 conserves the rack. 2 is both guns. Other types omit it. */
  gatlingGuns?: 1 | 2;
  /** Player turned Walker self-destroy off. Missing means on. */
  selfDestructOff?: true;
  /** Charging to detonate. Cleared when the option is off or HP recovers. */
  charging?: true;
  /** The charge has multiplied hp and hpMax. Sim-only. */
  chargeBuff?: true;
  /** Titan outriggers are down: stationary, hull locked, braced max HP. Missing means false. */
  braced?: boolean;
  /** Seconds until the Titan's pods can fire the next rocket. Missing means ready. */
  rocketCooldown?: number;
  /** Rockets left in the Titan's rack. Missing on types without pods. */
  rockets?: number;
  /** High-penetration missiles carried. The Rocketer holds one. Missing means none. */
  heavy?: number;
  /** Rockets still to leave in the salvo under way. 0 or missing between salvos. */
  rocketSalvo?: number;
  /** Player switched the pods off. Missing means on. */
  rocketsOff?: boolean;
  /** CIWS or RAM set to Max range (RADAR_LONG_RANGE_MUL). Missing means normal reach. */
  longRange?: boolean;
  /** Watch tower spotlight heading, radians. Missing until the tower is first held. */
  spotFacing?: number;
  /** Heading Rotate asked the spotlight for. It swings there at SPOTLIGHT_TURN_DEG_PER_SEC. */
  spotAim?: number;
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
  /** Submarine: sim tick it last fired and showed itself. Missing until its first shot. */
  surfacedTick?: number;
  /** Battle Ship: its turrets and CIWS mounts, each on its own clock. Missing on every other type. */
  ship?: ShipState;
  /** Submarine: depth and air. Missing means surfaced with full air. */
  dive?: DiveState;
  /**
   * Sim tick through which the second main-gun barrel is still owed.
   * Missing between volleys. `cooldown` holds the gap before that barrel can fire.
   */
  twinUntil?: number;
  /**
   * A friend stands in this gun's line to its target. Sim only, never sent.
   * `since` starts the patience clock; `seen` is the last tick combat found the line still fouled;
   * `spot` is where the unit is stepping for a clear line; `look` is the next tick it searches again;
   * `walked` counts the ticks spent stepping aside.
   */
  lineBlock?: {
    targetId: number;
    since: number;
    seen: number;
    look: number;
    walked: number;
    spot: { x: number; y: number } | null;
  };
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
  /**
   * Highest terrain sample under this concrete run, in map height units.
   * Stamped when a section is placed and only ever raised. Missing on everything else.
   * The drawn top stays here after a higher section is destroyed.
   */
  wallCrest?: number;
  /** Extra hit points currently granted by sandbags and walls. Removed when the soldier leaves. */
  coverBonus: number;
  /** Part of `coverBonus` granted by a concrete wall. Overhead hits ignore it. */
  wallCover: number;
  /** Set on a Wall section converted into a lifting gate. */
  gate?: GateState;
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
  /** Artillery only: health of each living crewman. Empty means nobody serves the gun. */
  gunCrew?: number[];
  /** Supply truck only: the gun hitched behind it. */
  towing?: number;
  /** Artillery only: the truck towing it. */
  towedBy?: number;
  /** Aircraft only. Drones carry it too, for their height. */
  air?: AirState;
  /** Drone Op only. */
  droneLink?: DroneLink;
  /** Drone only. */
  drone?: DroneState;
  /** Paratrooper on the way down. No orders, no fire; small arms can reach him. */
  chute?: Chute;
  /** Jump Jet only. */
  jet?: JetState;
}

/** One gun of a Battle Ship turret. */
export interface ShipBarrel {
  /** Shells left in this barrel's own magazine. */
  ammo: number;
  /** Seconds until it is loaded again. */
  cooldown: number;
}

/** A Battle Ship main turret. Turret 0's facing is also the entity's `turretFacing`. */
export interface ShipTurret {
  facing: number;
  barrels: ShipBarrel[];
  /** Barrels still to let go in the volley under way, in order, and the tick the next one may. */
  volley: number[];
  nextShotTick: number;
  /** Sim tick each barrel last fired. Missing until it first does. */
  firedTick: (number | undefined)[];
}

/** A Battle Ship radar-laid 20mm mount: its own traverse, target, belt, heat, and clock. */
export interface ShipCiws {
  facing: number;
  target: number | null;
  ammo: number;
  cooldown: number;
  heat: number;
  overheat: number;
  /** Sim tick it last fired, on a unit or a rocket. */
  fireTick?: number;
}

export interface ShipState {
  turrets: ShipTurret[];
  ciws: ShipCiws[];
  /** Seconds banked toward the next refill beside a Marine Base. */
  rearm: number;
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
  /** A submarine's torpedo: runs at the waterline, meets only what is in the water, dies ashore. Not on the wire. */
  torpedo?: boolean;
  /** Torpedo: the body entity guns can shoot. It rides with this round; kill it and the round is gone. */
  bodyId?: number;
  /** Torpedo from a submerged boat: it runs deep and only meets another submarine that is down. */
  deep?: boolean;
  /**
   * Walker, Cyborg, pad CIWS, or Apocalypse roof round. A living light hull
   * only sometimes takes it. Not on the wire.
   */
  gatling?: boolean;
  /**
   * Infantry hit deals this share of the victim's max HP.
   * Set by the scoped rifle and the PTRD. Omitted for every other gun.
   */
  hpFraction?: number;
  /** Elevation units at the current point. Omit in tests for ground-level. */
  z?: number;
  /** Elevation units per second along the shot. Direct fire only. */
  vz?: number;
  /** A field gun's shell on the mortar arc: the bigger burst. Omitted for the mortar bomb. */
  big?: boolean;
  /** A Battle Ship's shell: `big`, on the ship's low, fast arc (BATTLESHIP_SHELL). Its barrel: turret × 3 + gun. */
  shipBarrel?: number;
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
  /** Force-attack: the blast also catches allies, and a tree on the aim burns. */
  harmAllies?: boolean;
  /** Force-attack aim, before the glob scatters. Not sent to clients. */
  aimX?: number;
  aimY?: number;
  /** Rocket fused on a plane: it bursts in the air and only catches aircraft. */
  airBurst?: boolean;
  /** A radar-laid 20mm round fired at a plane. A miss keeps climbing and ends in the sky, not the dirt. */
  aloft?: boolean;
  /** Rocket only: the carrier type whose rack (rocketRackOf) sets its splash and armor dent. */
  launcher?: EntityType;
  /** Lobbed rocket only: height it left the tubes at. `apex` rides on top of the line from here to the ground. */
  launchZ?: number;
  /** Rocket only: CIWS mounts that already fired a burst at it. An ordinary rocket gets one try. */
  ciwsTried?: number[];
  /** High-penetration warhead. Splash and armor use that rack, not the carrier's catalog rack. */
  heavy?: boolean;
  /** Interceptor hits left. Missing means one connecting burst destroys the rocket. */
  plate?: number;
  /** Fired by an anti-air gun (MG42, gatlings). Only these meet a high drone. */
  antiAir?: boolean;
  /** Fired down from a plane's wing cannon: on a hull it meets the roof (resolveRoofHit), not a face. */
  fromAbove?: boolean;
  /**
   * Fired down by a Jump Jet in the air. It comes over sandbags and through
   * the canopy, a crouch or a crawl does not shrink the man, and a trench
   * parapet soaks none of it.
   */
  plunging?: boolean;
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

/**
 * A CPU task force in the field. It walks `route` one bound at a time, in ranks,
 * and regroups between bounds. Plain data so it saves with the player.
 */
export interface AiForce {
  id: number;
  ids: number[];
  /** Centre: take and hold the diamond scrap. Enemy: assault the enemy Core. */
  goal: "centre" | "enemy";
  /** Points left to reach, world pixels. The last is the objective. */
  route: Vec[];
  /** Fighters it set out with. It falls back once too few are left. */
  size0: number;
  /** Tick of the last bound. A force that cannot settle moves on after a while. */
  boundTick: number;
  /** It has met at its first route point. From then on stragglers drop out. */
  gathered?: boolean;
  /** Closest it has come to the next route point, world pixels, and the tick it last got closer. */
  bestDist?: number;
  progressTick?: number;
}

/** Easy CPU's standing plan. Plain data so it saves with the player. */
export interface AiPlan {
  /** Fortify: raise and crew the base defences first. Campaign: take the middle, then push. */
  posture: "fortify" | "campaign";
  forces: AiForce[];
  nextForceId: number;
  /** Waves sent at the enemy. Each one waits for a bigger army than the last. */
  waves: number;
  /** Flank the next enemy wave swings round. */
  flank: -1 | 1;
  /** Ground the defence under way is meant for, world pixels. */
  site?: Vec;
  /** Tick before which a site that found no room is skipped, by site key. */
  siteRetry: Record<string, number>;
  /** Towers already given a wall line, or found no room for one. */
  walled: number[];
  /** Middle of a wall line still waiting for its gate, world pixels. */
  gate?: Vec & { facing: number };
  /** Tick the CPU first saw an enemy plane, drone, or Airfield. */
  airSeenTick?: number;
  /** Campaign towers go up no faster than this. */
  nextTowerTick: number;
}

export interface SimPlayer {
  playerId: string;
  name: string;
  colorId: number;
  team: number;
  alive: boolean;
  scrap: number;
  /** Base structures: power, factories, the airfield, research. One at a time. */
  structure: StructureJob | null;
  /** Defences: guns and garrisons. One at a time, beside `structure`. */
  defence: StructureJob | null;
  /** A sited sandbag or wall line from the Defences tab. One at a time, beside both other lanes. */
  line: StructureJob | null;
  /** Base structure waiting to be placed. A ready defence stays on `defence`. */
  placingType: BuildingType | YardFieldType | null;
  hqId: number;
  /** CPU seat. Omitted for humans. */
  ai?: AiDifficulty;
  /** Sim tick to try the next attack wave. */
  aiNextAttackTick: number;
  /** Sim tick for the CPU's next support, shell, and defense pass. */
  aiNextMicroTick?: number;
  /** Sim tick before which the CPU skips a building that found no room in its base. */
  aiNoRoomUntil?: Partial<Record<BuildingType, number>>;
  /** CPU's standing plan: fortify, then campaign. Made on the first think. */
  aiPlan?: AiPlan;
  /** Fraction of a scrap point the Smelters have earned but not yet paid. `scrap` stays whole. */
  scrapCarry: number;
}

export interface MatchState {
  roomId: string;
  mapId: string;
  tick: number;
  /** Sim steps per wall-clock tick. 1–5. */
  gameSpeed: number;
  /** Skirmish hold. The wall-clock tick keeps drawing and does not step the sim. */
  paused?: boolean;
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
  /**
   * 1 = sandbags and concrete block every unit. 2 = dragon's teeth block vehicles
   * only. 3 = an unlocked gate: its owner's side walks through, everyone else stops.
   */
  fortBlock: Uint8Array;
  /** Owner of the gate on each fortBlock 3 tile, by tile index. */
  fortOwner: Map<number, string>;
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
  /** Tree tiles removed this match. `burn` is a flamethrower force-attack. */
  clearedTrees: { x: number; y: number; burn?: true }[];
  /** Infantry who died in the open. Not entities: passable and indestructible. */
  bodies: CorpseView[];
  /** Heavy-shell craters. Not entities. */
  holes: ShellHoleView[];
}
