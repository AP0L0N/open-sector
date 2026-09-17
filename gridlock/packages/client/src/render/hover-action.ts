import {
  isCapturable,
  isCivilianType,
  isGarrisonable,
  isInfantryType,
  type EntityView,
} from "@gridlock/shared";

export type HoverAction = "garrison" | "ungarrison" | "attack" | "capture" | "gather";

export type HoverEntity = Pick<
  EntityView,
  "id" | "kind" | "type" | "ownerId" | "hp" | "wreck" | "garrisonedIn" | "garrison"
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
  if (hit && ownUnits.length > 0 && isAttackTarget(hit, you, args.allied)) return "attack";
  if (args.scrap && ownUnits.some((e) => e.type === "hauler")) return "gather";
  return null;
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
