import {
  BUILDING_TYPES,
  TRAIN_TYPES,
  YARD_FIELD_TYPES,
  catalog,
  isAircraftType,
  isGarrisonable,
  isInfantryType,
  type BuildingType,
  type TrainType,
  type YardFieldType,
} from "@gridlock/shared";

export type SidebarGroup = "structures" | "defences" | "infantry" | "tanks" | "aircraft";

/** `short` fits five tabs across the sidebar; `icon` is a 16×16 SVG path. */
export const SIDEBAR_GROUPS: readonly { id: SidebarGroup; label: string; short: string; icon: string }[] = [
  { id: "structures", label: "Structures", short: "Base", icon: "M1 15V8l4-3v3l4-3v3l4-3v2h2v8z" },
  { id: "defences", label: "Defences", short: "Def", icon: "M8 1l6 2.2V8c0 3.4-2.5 5.9-6 7-3.5-1.1-6-3.6-6-7V3.2z" },
  { id: "infantry", label: "Infantry", short: "Inf", icon: "M8 1a2.1 2.1 0 110 4.2A2.1 2.1 0 018 1zM4.5 6.4h7L10.3 11H9.4V15H6.6V11H5.7z" },
  { id: "tanks", label: "Tanks", short: "Tank", icon: "M4 5h6v2h5v1.2h-5V9H4zM1 10h14l-1.8 4H2.8z" },
  { id: "aircraft", label: "Aircraft", short: "Air", icon: "M8 1c.7 0 1 1 1 2v3l6 3.2V11L9 9.4V12l2 1.6V15l-3-.9-3 .9v-1.4L7 12V9.4L1 11V9.2L7 6V3c0-1 .3-2 1-2z" },
];

/** Buildings with a gun or a garrison are defences. Trainables split by body: foot, air, or hull. */
export function sidebarGroupOf(type: BuildingType | TrainType): SidebarGroup {
  if (catalog(type).kind === "building") {
    return catalog(type).rangeTiles > 0 || isGarrisonable(type) ? "defences" : "structures";
  }
  if (isInfantryType(type)) return "infantry";
  if (isAircraftType(type)) return "aircraft";
  return "tanks";
}

export interface GroupEntry {
  /** Cameo id: `build-<type>` or `train-<type>`. */
  id: string;
  type: BuildingType | TrainType | YardFieldType;
}

/** Cameos in each group, in catalog order. */
export function groupEntries(): Record<SidebarGroup, GroupEntry[]> {
  const out: Record<SidebarGroup, GroupEntry[]> = { structures: [], defences: [], infantry: [], tanks: [], aircraft: [] };
  for (const type of BUILDING_TYPES) out[sidebarGroupOf(type)].push({ id: "build-" + type, type });
  for (const type of YARD_FIELD_TYPES) out.defences.push({ id: "build-" + type, type });
  for (const type of TRAIN_TYPES) out[sidebarGroupOf(type)].push({ id: "train-" + type, type });
  return out;
}

export interface CameoFlags {
  disabled: boolean;
  ready: boolean;
  working: boolean;
  paused: boolean;
}

/** What a group's tab light shows. Ready beats working beats paused; locked when nothing in it can be pressed. */
export type GroupState = "ready" | "working" | "paused" | "idle" | "locked";

export function groupState(cameos: readonly CameoFlags[]): GroupState {
  if (cameos.some((c) => c.ready)) return "ready";
  if (cameos.some((c) => c.working && !c.paused)) return "working";
  if (cameos.some((c) => c.paused)) return "paused";
  if (cameos.length === 0 || cameos.every((c) => c.disabled)) return "locked";
  return "idle";
}
