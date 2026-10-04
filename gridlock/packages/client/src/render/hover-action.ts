import {
  BV222_TROOPS,
  isAircraftType,
  isDroneType,
  isTransportType,
  SUPPLY_CARGO,
  TRUCK_SEATS,
  isArmoredType,
  isCapturable,
  isCivilianType,
  garrisonAdmits,
  isFieldStructure,
  isGarrisonable,
  isInfantryType,
  isRepairableUnit,
  supplyShortOf,
  type EntityView,
} from "@gridlock/shared";

export type HoverAction =
  | "garrison"
  | "ungarrison"
  | "attack"
  | "capture"
  | "repair"
  | "scrap"
  | "board"
  | "supply"
  | "disable"
  | "tow"
  | "land";

export type HoverEntity = Pick<
  EntityView,
  | "id"
  | "kind"
  | "type"
  | "ownerId"
  | "hp"
  | "hpMax"
  | "wreck"
  | "garrisonedIn"
  | "garrison"
  | "ruined"
  | "bed"
  | "supply"
  | "gun"
  | "towing"
  | "ammo"
  | "rockets"
  | "heavy"
  | "mgAmmo"
  | "clip"
  | "crits"
  | "air"
  | "drone"
  | "jet"
  | "braced"
>;

/** A ground unit that can climb into a transport and jump. Planes and drones stay out. */
export function planeBoardCandidate(e: HoverEntity): boolean {
  if (e.kind !== "unit" || e.hp <= 0 || e.wreck) return false;
  if (isAircraftType(e.type) || isDroneType(e.type)) return false;
  if (e.braced) return false;
  if ((e.jet?.alt ?? 0) > 0) return false;
  return true;
}

/** Guard mode: click this unit to escort it instead of planting an overwatch point. */
export function canGuardUnit(args: {
  youPlayerId: string;
  selectedIds: readonly number[];
  hit: HoverEntity | null;
  allied: (ownerId: string | undefined) => boolean;
}): boolean {
  const hit = args.hit;
  if (!hit || hit.kind !== "unit" || hit.wreck || hit.hp <= 0 || hit.garrisonedIn) return false;
  if (hit.ownerId !== args.youPlayerId && !args.allied(hit.ownerId)) return false;
  return args.selectedIds.some((id) => id !== hit.id);
}

export function resolveHoverAction(args: {
  youPlayerId: string;
  selected: readonly HoverEntity[];
  hit: HoverEntity | null;
  /** Cursor is on a mine. The truck lifts it; an entity under the cursor still wins. */
  mine?: boolean;
  allied: (ownerId: string | undefined) => boolean;
}): HoverAction | null {
  const you = args.youPlayerId;
  const live = args.selected.filter((e) => !e.wreck && e.hp > 0);
  const ownUnits = live.filter((e) => e.kind === "unit" && e.ownerId === you);
  if (ownUnits.length === 0 && !live.some((e) => e.garrison?.ownerId === you)) return null;

  const inf = ownUnits.filter((e) => isInfantryType(e.type));
  const hit = args.hit;
  const engineers = ownUnits.filter((e) => e.type === "engineer");
  if (hit && engineers.length > 0 && isArmoredWreck(hit)) return "scrap";
  if (hit && engineers.length > 0 && canRepairHit(hit, you, args.allied)) return "repair";

  const trucks = ownUnits.filter((e) => e.type === "supply" && !e.bed?.open);
  if (hit && trucks.length > 0 && canTowHit(hit, you, trucks)) return "tow";
  if (hit && trucks.length > 0 && canSupplyHit(hit, you, args.allied, trucks)) return "supply";
  if (hit && canCrewGunHit(hit, you, args.allied, inf)) return "board";
  if (hit && hit.type === "supply" && canBoardHit(hit, you, args.allied, inf)) return "board";
  if (hit && isTransportType(hit.type) && canBoardPlaneHit(hit, you, ownUnits)) return "board";

  if (hit && isGarrisonable(hit.type) && hit.hp > 0 && !hit.wreck) {
    const occ = hit.garrison?.ownerId;
    // A player-built garrison (the Bunker) stays its builder's side's, empty or not.
    const builder = !isCivilianType(hit.type) && hit.ownerId ? hit.ownerId : undefined;
    const yours = (!occ || occ === you) && (!builder || builder === you || args.allied(builder));
    const full = (hit.garrison?.count ?? 0) >= (hit.garrison?.cap ?? 1);
    const freeInf = inf.filter((e) => e.garrisonedIn !== hit.id && garrisonAdmits(hit.type, e.type));
    if (yours && !full && freeInf.length > 0) return "garrison";
    const occupying = occ === you && (hit.garrison?.count ?? 0) > 0;
    const selectedHere = live.some((e) => e.id === hit.id || e.garrisonedIn === hit.id);
    if (occupying && selectedHere && freeInf.length === 0) return "ungarrison";
  }

  if (hit && inf.length > 0 && canCaptureTarget(hit, you, args.allied)) return "capture";
  if (hit && ownUnits.length > 0 && isAttackTarget(hit, you, args.allied)) {
    // A walker-only selection cannot demolish walls. A hostile garrison is still a target.
    if (hit.kind === "building" && ownUnits.every((e) => e.type === "walker")) {
      const occ = hit.garrison?.ownerId;
      const hostileGarrison = !!occ && occ !== you && !args.allied(occ);
      if (!hostileGarrison) return null;
    }
    return "attack";
  }
  if (args.mine && trucks.length > 0) return "disable";
  // Your own strip: planes go home to land and rearm.
  const planes = ownUnits.some((e) => !!e.air && !e.drone);
  if (hit && planes && hit.type === "airfield" && hit.ownerId === you && hit.hp > 0 && !hit.wreck) return "land";
  return null;
}

/** Your field gun, not hitched yet. A gun already in tow falls through to a resupply. */
function canTowHit(hit: HoverEntity, you: string, trucks: readonly HoverEntity[]): boolean {
  if (hit.type !== "artillery" || hit.hp <= 0 || hit.wreck || hit.ownerId !== you || !hit.gun) return false;
  return hit.gun.towedBy == null && trucks.some((t) => t.towing == null);
}

/** A field gun one man short: your own or an ally's, or an empty one anyone can take. */
function canCrewGunHit(
  hit: HoverEntity,
  you: string,
  allied: (ownerId: string | undefined) => boolean,
  inf: readonly HoverEntity[],
): boolean {
  if (hit.type !== "artillery" || hit.hp <= 0 || hit.wreck || !hit.gun) return false;
  if (hit.gun.crew >= hit.gun.cap) return false;
  if (!inf.some((e) => !e.garrisonedIn && e.type !== "cyborg")) return false;
  return hit.gun.crew === 0 || hit.ownerId === you || allied(hit.ownerId);
}

function truckFreeSeats(hit: HoverEntity): number {
  const crew = hit.bed?.crew ? 1 : 0;
  return TRUCK_SEATS - crew - (hit.bed?.seats ?? 0);
}

function canBoardHit(
  hit: HoverEntity,
  you: string,
  allied: (ownerId: string | undefined) => boolean,
  inf: readonly HoverEntity[],
): boolean {
  if (hit.hp <= 0 || hit.wreck) return false;
  const outside = inf.filter((e) => e.garrisonedIn !== hit.id);
  if (outside.length === 0 || truckFreeSeats(hit) <= 0) return false;
  if (hit.bed?.open) return true;
  return hit.ownerId === you || allied(hit.ownerId);
}

/**
 * Your transport on its hardstand with room aboard, and a ground unit outside it selected.
 * Infantry can climb in from any load. A vehicle still needs the bay on paratroops.
 */
function canBoardPlaneHit(hit: HoverEntity, you: string, units: readonly HoverEntity[]): boolean {
  const air = hit.air;
  if (hit.hp <= 0 || hit.ownerId !== you || !air || air.phase !== "parked") return false;
  if ((air.troops ?? 0) >= BV222_TROOPS) return false;
  const outside = units.filter((e) => planeBoardCandidate(e) && e.garrisonedIn !== hit.id);
  if (outside.length === 0) return false;
  if (air.payload === "troops") return true;
  return outside.some((e) => isInfantryType(e.type));
}

function canSupplyHit(
  hit: HoverEntity,
  you: string,
  allied: (ownerId: string | undefined) => boolean,
  trucks: readonly HoverEntity[],
): boolean {
  if (hit.hp <= 0 || hit.wreck) return false;
  const friendly = hit.ownerId === you || allied(hit.ownerId);
  if (!friendly) return false;
  if (hit.type === "armory") return trucks.some((t) => (t.supply ?? 0) < SUPPLY_CARGO);
  // Units, and a structure with its own belt (the CIWS). Every other structure is never short.
  if (hit.type === "supply") return false;
  return supplyShortOf(hit.type, hit.ammo, hit.mgAmmo, hit.clip, hit.rockets, hit.heavy);
}

function isArmoredWreck(hit: HoverEntity): boolean {
  return hit.kind === "unit" && !!hit.wreck && hit.hp > 0 && isArmoredType(hit.type);
}

function canRepairHit(
  hit: HoverEntity,
  you: string,
  allied: (ownerId: string | undefined) => boolean,
): boolean {
  if (hit.type === "sandbags" && hit.ruined && hit.hp > 0) {
    return !hit.ownerId || hit.ownerId === you || allied(hit.ownerId);
  }
  if (hit.wreck || hit.ruined || hit.hp <= 0) return false;
  const hullHurt = hit.kind === "unit" && !!hit.crits?.some((c) => c === "tracks" || c === "engine");
  const lampOut = !!hit.crits?.includes("lamp");
  if (hit.hpMax != null && hit.hp >= hit.hpMax && !hullHurt && !lampOut) return false;
  const friendly = !hit.ownerId || hit.ownerId === you || allied(hit.ownerId);
  if (!friendly) return false;
  if (hit.kind === "unit") return isRepairableUnit(hit.type);
  if (hit.type === "sandbags") return false;
  if (isFieldStructure(hit.type) && hit.type !== "teeth" && hit.type !== "trench" && hit.type !== "wall" && hit.type !== "greatwall") return false;
  return hit.kind === "building";
}

function canCaptureTarget(
  hit: HoverEntity,
  you: string,
  allied: (ownerId: string | undefined) => boolean,
): boolean {
  if (hit.kind !== "building" || hit.wreck || hit.hp <= 0) return false;
  if (!isCapturable(hit.type)) return false;
  if (hit.ownerId === you || allied(hit.ownerId)) return false;
  if ((hit.garrison?.count ?? 0) > 0) return false;
  return true;
}

function isAttackTarget(
  hit: HoverEntity,
  you: string,
  allied: (ownerId: string | undefined) => boolean,
): boolean {
  // A wreck is only shot at on a force-attack order.
  if (hit.wreck) return false;
  const occ = hit.garrison?.ownerId;
  if (isGarrisonable(hit.type) && isCivilianType(hit.type)) {
    return !!occ && occ !== you && !allied(occ);
  }
  // A player-built garrison is a target whenever the enemy holds it, even empty.
  if (occ && occ !== you && !allied(occ)) return true;
  if (hit.ownerId === you || allied(hit.ownerId)) return false;
  if (isCivilianType(hit.type)) return false;
  return true;
}
