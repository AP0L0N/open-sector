/** Shared wire + domain types. If a field is not here, it does not exist. */

import type {
  AirDrop,
  BridgeType,
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
import type { CustomMapSpec } from "./custom-maps.js";
import type { SaveGame } from "./sim/save.js";

export const PROTOCOL_VERSION = 112;
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
  /** Sandbag or wall line already sited. Omitted for ordinary structures. */
  sites?: { x: number; y: number; facing: number }[];
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
  /** Cyborg Commander's force field: points left and the full charge. Everyone who sees him sees it. */
  field?: { hp: number; max: number };
  /**
   * Cyborg Commander's laser now cutting. A sweep runs from a0 to a1 (world radians);
   * `u` is the share already cut and `dur` the whole sweep in seconds. `lens` is the
   * beam length, world px, at evenly spaced points from a0 to a1. A line holds one angle.
   */
  laser?: { a0: number; a1: number; u: number; dur: number; lens: number[]; line?: true };
  /** Allied ammo rack. Omitted for enemies and unarmed types. */
  ammo?: Partial<Record<ShellType, number>>;
  /** Loaded shell. Allied guns only. */
  shell?: ShellType;
  /** Allied coaxial MG belt. Omitted when the type has no MG. */
  mgAmmo?: number;
  /** 0–1 heat. Allied MG, or a gatling (Walker, Cyborg, CIWS, the Apocalypse roof mount). */
  mgHeat?: number;
  /** Seconds the MG or gatling is locked by an overheat. Omitted when cool. */
  mgOverheat?: number;
  /** Selected infantry gun. Allied infantry only. */
  weapon?: InfantryWeaponId;
  /** Allied infantry magazine, or the Walker's backpack rack. */
  clip?: number;
  /** Walker arms selected. 1 or 2. Omitted for everyone else. */
  guns?: 1 | 2;
  /**
   * Own living Walker. True when Self destroy is on. False when the player
   * turned it off. Omitted for everyone else.
   */
  selfDestruct?: boolean;
  /** Walker is charging to detonate. Anyone who can see him sees it. */
  charging?: true;
  /** Walker arms that fired during the last step. `off` is the second arm's bearing when it took another target. */
  gatling?: { arms: 1 | 2; off?: number };
  /** Apocalypse roof mount: its world facing, and `fire` when it shot during the last step. */
  ciws?: { facing: number; fire?: true };
  /**
   * Battle Ship: each main turret's world facing and, for its own side, the shells left in each
   * barrel; each CIWS mount's facing, `fire` when it shot during the last step, and its belt.
   */
  ship?: {
    turrets: { facing: number; ammo?: number[] }[];
    ciws: { facing: number; fire?: true; ammo?: number }[];
  };
  /** Seconds left on a magazine change. Allied infantry. Omitted when idle. */
  reload?: number;
  /** Seconds until a planted support weapon can fire. Gunner bipod, or the mortar tube. Omitted once it is set. */
  bipod?: number;
  /** Unit is inside this building. Friendly snapshots only. */
  garrisonedIn?: number;
  /** On a Transport LST deck MG tub: which one (0 bow, 1 bridge wing). Friendly snapshots only. */
  mountedGun?: number;
  /**
   * Own unit's Shift-queued route: the current order's point, then each queued
   * order's point, in run order. Omitted when nothing is queued.
   */
  plan?: PlanPointView[];
  /**
   * Soldiers inside a house, a hull, a supply truck, or a transport.
   * On a tank deck (the Transport LST) count is the deck room taken, not heads.
   * count/bars/ownerId are hidden from enemies while hide is set.
   * hide itself is friendly-only. A truck and a transport never hide.
   */
  garrison?: {
    count: number;
    cap: number;
    ownerId?: string;
    bars?: { hp: number; hpMax: number }[];
    hide?: boolean;
    /** Held by a map's neutral troops: no one's, and hostile to every commander. */
    neutral?: boolean;
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
  /** Your own submarine running submerged. Omitted when false. */
  submerged?: boolean;
  /** Your own submarine: seconds of air left below, out of `airMax`, and whether it ran out and must stay up. */
  dive?: { air: number; airMax: number; winded?: boolean };
  /** Titan outriggers down: stationary, braced max HP. Omitted when false. */
  braced?: boolean;
  /** Seconds until the Titan's pods can fire the next rocket. Friendly snapshots; omitted when ready. */
  rocketReload?: number;
  /** Rockets left in the Titan's rack. Friendly snapshots. */
  rockets?: number;
  /** Rocketer's high-penetration missile, 0 or 1. Friendly snapshots. A supply truck refills it. */
  heavy?: number;
  /** CIWS or RAM set to Max range. Friendly snapshots; omitted at normal reach. */
  longRange?: boolean;
  /** Held watch tower's spotlight heading, radians. Everyone who sees the tower sees the beam. */
  spotFacing?: number;
  /** Building whose owner is short on power: its lamps are dark and a CIWS or RAM is silent. Omitted when powered. */
  unpowered?: boolean;
  /** Titan pods switched off. Friendly snapshots; omitted while on. */
  rocketsOff?: boolean;
  /** Stay put: no chase, no withdraw. Friendly snapshots. */
  holdPosition?: boolean;
  /** Overwatch heading in world radians. Friendly snapshots while guarding. */
  guardFacing?: number;
  /** Friendly unit this entity is escorting. Omitted when not guarding a unit. */
  guardTargetId?: number;
  /**
   * Patrol polyline in world pixels. An open route starts where the unit stood
   * and is walked back. A loop is the closed spots only. Friendly snapshots.
   */
  patrol?: { x: number; y: number }[];
  /** The patrol circles. Omitted on an out-and-back route. Friendly snapshots. */
  patrolLoop?: boolean;
  /** Infantry this medic is bandaging. Omitted while he is only walking over. */
  tend?: number;
  /**
   * Sandbags wrecked by a tank shell, a fallen bridge, or a civilian house down to
   * its rubble. The rubble stays: a house heap blocks the ground but not sight.
   */
  ruined?: boolean;
  /** Bridge brick length, world px. `facing` runs along the deck. Omitted on everything else. */
  span?: number;
  /** Bridge brick deck level, map height units. Omitted on everything else. */
  deck?: number;
  /**
   * Bridge brick this engineer is on his way to lay or is laying. `progress` is 0–1 once he works.
   * `queue` holds the bricks after it, in order. Only his own side gets it.
   */
  bridgeSite?: {
    bridge: BridgeType;
    x: number;
    y: number;
    facing: number;
    span: number;
    progress?: number;
    /** Deck level the whole line keeps, map height units. */
    deck?: number;
    queue?: { x: number; y: number; facing: number }[];
  };
  /** A gate: boom lift 0–1, and whether it is locked. */
  gate?: { locked: boolean; open: number };
  /**
   * Terrain peak a concrete run was built up to, in map height units.
   * The drawn top does not fall below this when a higher section is destroyed.
   * Omitted on everything that is not a wall.
   */
  wallCrest?: number;
  /**
   * Engineer field structures not built yet. The first is the piece on the job; `progress` is 0–1
   * once digging starts. Friendlies also get the queued pieces; enemies only see a piece being dug.
   */
  fieldSites?: { structure: FieldStructureType; x: number; y: number; facing: number; progress?: number }[];
  /**
   * Base building (Smelter, Marine Base) this engineer is on his way to raise or is raising, with its
   * top-left tile. `progress` is 0–1 once he works. Only his owner gets it: the enemy sees no site.
   */
  buildSite?: { building: BuildingType; tileX: number; tileY: number; progress?: number };
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
  /** Supply points left. Friendly supply trucks and supply boats only. */
  supply?: number;
  /**
   * Field gun. Everyone sees how many men serve it (0 means any infantry can
   * take it) and the truck towing it. Crew health is friendly-only.
   */
  gun?: { crew: number; cap: number; bars?: { hp: number; hpMax: number }[]; towedBy?: number };
  /** Supply truck: the field gun hitched behind it. */
  towing?: number;
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
  /**
   * Destroyer's deck. Friendly-only. `heli`: on deck and loaded, loading (`rearm` seconds left),
   * in the air, or lost (`replace` seconds until a new one). `mines` on the rail out of `minesMax`.
   */
  asw?: {
    heli: "ready" | "rearm" | "up" | "lost";
    rearm?: number;
    replace?: number;
    mines: number;
    minesMax: number;
    /** Seconds until the rail can lay the next mine. Omitted when clear. */
    mineGap?: number;
  };
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
  /** Most scrap you can hold: SCRAP_CAP_PER_SMELTER for each standing Smelter. */
  scrapCap: number;
  provided: number;
  used: number;
  lowPower: boolean;
  structureQueue: StructureQueueView | null;
  /** Guns and garrisons build beside `structureQueue`. Null when that lane is idle. */
  defenceQueue: StructureQueueView | null;
  /** A sandbag or wall line builds beside both. Null when that lane is idle. */
  lineQueue: StructureQueueView | null;
  placingType: BuildingType | YardFieldType | null;
  alive: boolean;
  hqId: number | null;
  /** A Radar Station stands on your side. False leaves the command bar's radar panel dark. */
  radar: boolean;
  /**
   * Units you keep training. Each producer of that unit holds one job until a
   * right-click turns it off. Omitted when none.
   */
  continuous?: TrainType[];
}

/**
 * An enemy aircraft the radar hears but nobody sees: in the air, inside a
 * standing Radar Station's sweep, off the fog mask. World pixels. The panel
 * blinks it; the field shows nothing.
 */
export interface RadarContactView {
  id: number;
  x: number;
  y: number;
}

/**
 * An enemy submarine a Destroyer on your side hears on its sonar, submerged or surfaced,
 * in fog or not. World pixels. `down` while it runs submerged.
 */
export interface SonarContactView {
  id: number;
  x: number;
  y: number;
  down?: boolean;
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
  /** Field-gun shell on the mortar arc. Drawn bigger than the bomb. */
  big?: boolean;
  /** A Battle Ship's shell: the barrel it left, turret × 3 + gun. */
  shipBarrel?: number;
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
  /** A Flak 37 shell climbing to its fuse point. `z` is its height. */
  flak?: boolean;
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
  /** Center damage of a heavy round (40mm and up). With the caliber it sizes the burst. */
  damage?: number;
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
  /**
   * A radar-laid 20mm round fired at a plane: elevation units (projectile z) where
   * it ended. It met the plane, or missed and climbed away. No dirt, no crater.
   */
  airZ?: number;
  /** A CIWS or RAM met a rocket in the air. "kill": it burst, nothing hurt under it. "miss" (RAM): the interceptor went off beside it. */
  intercept?: boolean;
  /** A killed Pyro's fuel tanks went up. A big rolling fireball, then burning ground around him. */
  cookoff?: boolean;
  /** A tank's HE shell burst here: a hull-sized fireball, and the ground around it is set burning. */
  heBurst?: boolean;
  /** A submarine's torpedo went off here. On a hull: the hull-sized fireball inside the water column. Otherwise the column alone. */
  torpedo?: boolean;
  /** Rocket burst: the id of the rocket, as in its RocketLaunchView. */
  shot?: number;
  /** Cyborg Commander's laser landed here: a searing burn, not a bullet strike. */
  laser?: boolean;
  /** A Flak 37 shell burst in the air at `z`: a flash and a lingering black cloud. Nothing on the ground is touched. */
  flak?: boolean;
}

/**
 * A rocket left its pod, tube, or cell this tick. Sent even when the rocket
 * bursts before the next snapshot, so the backblast and trail still show.
 */
export interface RocketLaunchView {
  /** The rocket's projectile id. */
  id: number;
  fromId: number;
  x: number;
  y: number;
  /** Elevation units at the pod. */
  z: number;
  vx: number;
  vy: number;
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

/** Mine on the ground. Sent to the side that laid it and to its allies. The enemy is not told. */
export interface MineView {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  /** A Destroyer's contact mine in the water. Omitted for a bomblet on land. */
  water?: true;
  /** False while it is still arming. Omitted once live. */
  armed?: false;
  /** 0–1 while a supply truck is disabling it. Omitted otherwise. */
  disarm?: number;
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
  /** Skirmish is held. Omitted while the match is running. */
  paused?: boolean;
  mapId: string;
  youPlayerId: string;
  you: YouState;
  players: PlayerPublic[];
  entities: EntityView[];
  projectiles: ProjectileView[];
  impacts: ImpactView[];
  /** Rockets launched since the last snapshot that you can see. */
  launches: RocketLaunchView[];
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
  /** Indices into the map's `clutter` of pieces smashed this match. Omitted until the first one breaks. */
  brokenClutter?: number[];
  /**
   * Ground repeated heavy blasts have sunk, as flat pairs: tile index, then
   * that tile's height now. Omitted until the first dig. See BLAST_DIG_ENABLED.
   */
  dug?: number[];
  /**
   * The server's fog mask for `youPlayerId`, row-major, as run lengths that
   * alternate hidden / lit starting with hidden. See `decodeVisionRuns`.
   */
  vision?: number[];
  /** Radar contacts for `youPlayerId`. Omitted while no Radar Station stands on your side. */
  radar?: RadarContactView[];
  /** Sonar contacts for `youPlayerId`. Omitted while none of your Destroyers hears a submarine. */
  sonar?: SonarContactView[];
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
  /**
   * Map Builder save. `key` is the browser's private map key: the first save
   * of an id claims it, and only the same key may overwrite or delete it.
   */
  | { type: "map.save"; map: CustomMapSpec; key: string }
  | { type: "map.delete"; id: string; key: string }
  /**
   * Map Builder play test. The hub loads the unsaved sheet as a private map
   * (id from `newPlaytestMapId`), seats the sender alone, and starts at once.
   * One start position is enough.
   */
  | { type: "map.test"; map: CustomMapSpec }
  | { type: "chat"; text: string }
  /** `queue`: Shift-queued. The unit runs it after its current and earlier queued orders finish. */
  /** `facing`: world radians the unit turns to after it arrives. A held move click sets it. */
  | { type: "cmd.move"; ids: number[]; x: number; y: number; facing?: number; queue?: boolean }
  | { type: "cmd.attack"; ids: number[]; targetId: number; queue?: boolean }
  | { type: "cmd.attackmove"; ids: number[]; x: number; y: number; queue?: boolean }
  /**
   * Walk `points` in order. `loop` circles them (the last spot returns to the
   * first). Otherwise the unit walks back. Left-click places, right-click sends.
   * Clicking a point already placed closes the loop and drops the spots before it.
   */
  | { type: "cmd.patrol"; ids: number[]; points: { x: number; y: number }[]; loop?: boolean }
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
  | { type: "cmd.ammo"; ids: number[]; shell: ShellType }
  | { type: "cmd.weapon"; ids: number[]; weapon: InfantryWeaponId }
  | { type: "cmd.guns"; ids: number[]; guns: 1 | 2 }
  /** Walker self-destroy. On by default. `on: false` is Hold together. */
  | { type: "cmd.selfdestruct"; ids: number[]; on: boolean }
  | { type: "cmd.rockets"; ids: number[]; on: boolean }
  | { type: "cmd.reach"; ids: number[]; max: boolean }
  | { type: "cmd.build"; building: BuildingType | YardFieldType }
  /**
   * `facing`: world radians for a Bunker, Watch Tower, or Airfield, snapped to the nearest BUILDING_TURN_STEP;
   * other buildings ignore it. (tx, ty) is the top-left tile of the turned footprint's box (`turnedBox`).
   */
  | { type: "cmd.place"; building: BuildingType; tx: number; ty: number; facing?: number }
  | { type: "cmd.train"; unit: TrainType }
  /**
   * Keep training `unit` until this is sent again with `on: false`, which
   * drops the latch and cancels every queued job of that unit.
   * One-at-a-time units and aircraft are refused.
   */
  | { type: "cmd.continuous"; unit: TrainType; on: boolean }
  | {
      type: "cmd.pause";
      what: "train" | "structure";
      jobId?: number;
      unit?: TrainType;
      paused?: boolean;
      /** Which construction cameo. Omitted: the base job, or the defence when the base lane is idle. */
      building?: BuildingType | YardFieldType;
    }
  | {
      type: "cmd.cancel";
      what: "structure" | "train";
      buildingId?: number;
      jobId?: number;
      unit?: TrainType;
      /** Which construction cameo. Omitted: the base job, or the defence when the base lane is idle. */
      building?: BuildingType | YardFieldType;
    }
  /** Rally point for owned producers in `ids`. A point on a building's own footprint clears its rally. */
  | { type: "cmd.rally"; ids: number[]; x: number; y: number }
  | { type: "cmd.sell"; id: number }
  | { type: "cmd.deploy"; id: number }
  /** Lock and unlock own gates. A gate is built from the Defences tab. */
  | { type: "cmd.gate"; ids: number[]; action: "lock" | "unlock" }
  | { type: "cmd.garrison"; ids: number[]; buildingId: number; queue?: boolean }
  | { type: "cmd.ungarrison"; ids?: number[]; buildingId?: number; x?: number; y?: number }
  | { type: "cmd.garrisonhide"; ids: number[]; hide: boolean }
  | { type: "cmd.scout"; ids: number[]; out: boolean }
  | { type: "cmd.stance"; ids: number[]; stance: Stance }
  | { type: "cmd.hold"; ids: number[]; hold: boolean }
  /** `light`: Rotate light. Swings only the selection's spotlights (a Battle Ship's), not hulls or guns. */
  | { type: "cmd.rotate"; ids: number[]; x: number; y: number; queue?: boolean; light?: boolean }
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
      /**
       * Corners of a line laid in several legs, start first. When set it replaces (x, y)
       * and the drag end; pieces follow every leg and turn at each corner.
       */
      path?: { x: number; y: number }[];
    }
  /** Selected engineers walk to the tile and raise this base building there. A Smelter on distant scrap. */
  | { type: "cmd.construct"; ids: number[]; building: BuildingType; tx: number; ty: number }
  /**
   * The nearest selected engineer lays a bridge brick by brick along a line, as a wall is
   * laid (`bridgePath`): one brick at (x, y) along `facing`, a drag to (x2, y2), or `path`.
   */
  | {
      type: "cmd.bridge";
      ids: number[];
      bridge: BridgeType;
      x: number;
      y: number;
      /** Along the deck, world radians. A lone brick only. */
      facing?: number;
      x2?: number;
      y2?: number;
      /** Corners of the line, start first. When set it replaces (x, y) and the drag end. */
      path?: { x: number; y: number }[];
    }
  | { type: "cmd.repair"; ids: number[]; targetId: number; queue?: boolean }
  | { type: "cmd.board"; ids: number[]; truckId: number; queue?: boolean }
  | { type: "cmd.unboard"; ids?: number[]; truckId?: number }
  | { type: "cmd.supply"; ids: number[]; targetId: number; queue?: boolean }
  /** Supply trucks defuse mine `mineId`. It comes up as scrap when they finish. */
  | { type: "cmd.disable"; ids: number[]; mineId: number; queue?: boolean }
  /** Supply trucks hitch the field gun `targetId`. Without one, they drop whatever they tow. */
  | { type: "cmd.tow"; ids: number[]; targetId?: number }
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
  /** Submarine: take it down (`down: true`) or bring it up. */
  | { type: "cmd.dive"; ids: number[]; down: boolean }
  /** Destroyers lay one water mine each over the stern. */
  | { type: "cmd.laymine"; ids: number[] }
  | { type: "cmd.speed"; delta: number }
  /** Skirmish only. Holds the sim without changing game speed. */
  | { type: "match.pause"; paused: boolean }
  /** Skirmish only. The hub answers with `match.saved`. */
  | { type: "match.save" }
  /** Skirmish only. Replaces the current fight, or opens one from the menu. */
  | { type: "match.load"; save: SaveGame };

export type ServerMessage =
  | { type: "welcome"; playerId: string; protocol: number }
  | { type: "room.state"; room: RoomState }
  | { type: "room.error"; code: string; message: string }
  | { type: "match.start"; match: MatchSnapshot }
  | { type: "match.snapshot"; match: MatchSnapshot }
  /** A loaded skirmish. The client draws it without the deploy splash. */
  | { type: "match.resume"; room: RoomState; match: MatchSnapshot }
  /** The authoritative save of the skirmish underway. The browser stores it. */
  | { type: "match.saved"; save: SaveGame }
  | { type: "match.end"; winnerPlayerId: string | null; winnerTeam: number | null; reason: "core" | "host" }
  | { type: "room.closed"; reason: string }
  | { type: "chat"; from: string; name: string; text: string; at: number }
  /** Every stored custom map. Sent once after `welcome`. */
  | { type: "maps.custom"; maps: CustomMapSpec[] }
  /** A custom map was saved. Sent to everyone. */
  | { type: "map.upsert"; map: CustomMapSpec }
  | { type: "map.removed"; id: string }
  /** Your own save landed. */
  | { type: "map.saved"; id: string };

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
  | "too_many"
  | "map_invalid"
  | "map_locked"
  | "map_owner"
  | "map_cap"
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
  | "paused";

export type { AirDrop, BuildingType, EntityType, FieldStructureType, TrainType, EntityKind, ShellType, Crit, Stance, YardFieldType };
