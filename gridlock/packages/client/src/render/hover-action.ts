import {
  SUPPLY_CARGO,
  TRUCK_SEATS,
  isArmoredType,
  isCapturable,
  isCivilianType,
  isFieldStructure,
  isGarrisonable,
  isInfantryType,
  supplyShortOf,
  type EntityView,
} from "@gridlock/shared";

export type HoverAction =
  | "garrison"
  | "ungarrison"
  | "attack"
  | "capture"
  | "gather"
  | "repair"
  | "scrap"
  | "board"
  | "supply";

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
  | "ammo"
  | "mgAmmo"
  | "clip"
>;

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
  scrap: boolean;
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
  if (hit && trucks.length > 0 && canSupplyHit(hit, you, args.allied, trucks)) return "supply";
  if (hit && hit.type === "supply" && canBoardHit(hit, you, args.allied, inf)) return "board";

  if (hit && isGarrisonable(hit.type) && hit.hp > 0 && !hit.wreck) {
    const occ = hit.garrison?.ownerId;
    const yours = !occ || occ === you;
    const full = (hit.garrison?.count ?? 0) >= (hit.garrison?.cap ?? 1);
    const freeInf = inf.filter((e) => e.garrisonedIn !== hit.id);
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
  if (args.scrap && ownUnits.some((e) => e.type === "hauler")) return "gather";
  return null;
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
  if (hit.kind !== "unit" || hit.type === "supply") return false;
  return supplyShortOf(hit.type, hit.ammo, hit.mgAmmo, hit.clip);
}

function isArmoredWreck(hit: HoverEntity): boolean {
  return hit.kind === "unit" && !!hit.wreck && hit.hp > 0 && isArmoredType(hit.type);
}

function canRepairHit(
  hit: HoverEntity,
  you: string,
  allied: (ownerId: string | undefined) => boolean,
): boolean {
  if (hit.wreck || hit.ruined || hit.hp <= 0) return false;
  if (hit.hpMax != null && hit.hp >= hit.hpMax) return false;
  const friendly = !hit.ownerId || hit.ownerId === you || allied(hit.ownerId);
  if (!friendly) return false;
  if (hit.kind === "unit") return isArmoredType(hit.type);
  if (hit.type === "sandbags" || isFieldStructure(hit.type) && hit.type !== "teeth") return false;
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
  if (hit.wreck) return true;
  const occ = hit.garrison?.ownerId;
  if (isGarrisonable(hit.type)) {
    return !!occ && occ !== you && !allied(occ);
  }
  if (hit.ownerId === you || allied(hit.ownerId)) return false;
  if (isCivilianType(hit.type)) return false;
  return true;
}
