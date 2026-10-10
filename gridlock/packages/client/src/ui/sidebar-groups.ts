import {
  BUILDING_TYPES,
  TRAIN_TYPES,
  YARD_FIELD_TYPES,
  catalog,
  costFor,
  energyOf,
  usesHiveEnergy,
  inFaction,
  isAircraftType,
  isDefenceStructure,
  isHiddenField,
  isInfantryType,
  isNavalType,
  type BuildingType,
  type Faction,
  type TrainType,
  type YardFieldType,
} from "@gridlock/shared";

export type SidebarGroup = "structures" | "defences" | "infantry" | "tanks" | "naval" | "aircraft";

interface GroupLook {
  label: string;
  short: string;
}

/**
 * `short` fits six tabs across the sidebar; `icon` is a 16×16 SVG path. `byFaction` renames a
 * tab for one faction: the Xenite field cyborgs and heavy assimilators, not infantry and tanks.
 */
export const SIDEBAR_GROUPS: readonly { id: SidebarGroup; label: string; short: string; icon: string; byFaction?: Partial<Record<Faction, GroupLook>> }[] = [
  { id: "structures", label: "Structures", short: "Base", icon: "M1 15V8l4-3v3l4-3v3l4-3v2h2v8z" },
  { id: "defences", label: "Defences", short: "Def", icon: "M8 1l6 2.2V8c0 3.4-2.5 5.9-6 7-3.5-1.1-6-3.6-6-7V3.2z" },
  {
    id: "infantry",
    label: "Infantry",
    short: "Inf",
    icon: "M8 1a2.1 2.1 0 110 4.2A2.1 2.1 0 018 1zM4.5 6.4h7L10.3 11H9.4V15H6.6V11H5.7z",
    byFaction: { xeno: { label: "Taken", short: "Taken" }, bloom: { label: "Brood", short: "Brood" } },
  },
  {
    id: "tanks",
    label: "Tanks",
    short: "Tank",
    icon: "M4 5h6v2h5v1.2h-5V9H4zM1 10h14l-1.8 4H2.8z",
    byFaction: { xeno: { label: "Heavy assimilators", short: "Heavy" }, bloom: { label: "Beasts", short: "Beast" } },
  },
  { id: "naval", label: "Naval", short: "Sea", byFaction: { bloom: { label: "Deep brood", short: "Deep" } }, icon: "M6 3h3v3h3v3h3l-2.5 3.5h-9L1 9h5zM1 14.2c1.2 0 1.7-.8 2.3-.8s1.1.8 2.3.8 1.7-.8 2.3-.8 1.1.8 2.3.8 1.7-.8 2.3-.8 1.1.8 1.5.8V15c-.6 0-1-.8-1.5-.8s-1.1.8-2.3.8-1.7-.8-2.3-.8-1.1.8-2.3.8-1.7-.8-2.3-.8S2.2 15 1 15z" },
  { id: "aircraft", label: "Aircraft", short: "Air", byFaction: { bloom: { label: "Skybrood", short: "Sky" } }, icon: "M8 1c.7 0 1 1 1 2v3l6 3.2V11L9 9.4V12l2 1.6V15l-3-.9-3 .9v-1.4L7 12V9.4L1 11V9.2L7 6V3c0-1 .3-2 1-2z" },
];

/** The tab's heading and short label as `faction` reads them. */
export function groupLabel(g: (typeof SIDEBAR_GROUPS)[number], faction: Faction = "alliance"): GroupLook {
  return g.byFaction?.[faction] ?? { label: g.label, short: g.short };
}

/** Buildings with a gun or a garrison are defences. Trainables split by body: foot, air, boat, or hull. */
export function sidebarGroupOf(type: BuildingType | TrainType): SidebarGroup {
  if (catalog(type).kind === "building") {
    return isDefenceStructure(type) ? "defences" : "structures";
  }
  if (isInfantryType(type)) return "infantry";
  if (isAircraftType(type)) return "aircraft";
  if (isNavalType(type)) return "naval";
  return "tanks";
}

export interface GroupEntry {
  /** Cameo id: `build-<type>` or `train-<type>`. */
  id: string;
  type: BuildingType | TrainType | YardFieldType;
}

/** Groups whose cameos run cheapest first; ties keep catalog order. */
const PRICE_SORTED_GROUPS: readonly SidebarGroup[] = ["defences", "infantry", "tanks", "naval", "aircraft"];

/**
 * The Xenite base laid out as the Alliance's reads: energy, foot soldiers, hulls, air, sea,
 * then tech. The Conversion Chamber is their barracks, so it comes second.
 */
const XENO_STRUCTURE_ORDER: readonly BuildingType[] = ["fusionnode", "conversion", "forge", "aerie", "spawnpool", "nexus"];

/** The faction's cameos in each group, in catalog order (price order for `PRICE_SORTED_GROUPS`). */
export function groupEntries(faction: Faction = "alliance"): Record<SidebarGroup, GroupEntry[]> {
  const out: Record<SidebarGroup, GroupEntry[]> = { structures: [], defences: [], infantry: [], tanks: [], naval: [], aircraft: [] };
  for (const type of BUILDING_TYPES) {
    if (inFaction(type, faction)) out[sidebarGroupOf(type)].push({ id: "build-" + type, type });
  }
  for (const type of YARD_FIELD_TYPES) {
    if (!isHiddenField(type) && inFaction(type, faction)) out.defences.push({ id: "build-" + type, type });
  }
  for (const type of TRAIN_TYPES) {
    if (inFaction(type, faction)) out[sidebarGroupOf(type)].push({ id: "train-" + type, type });
  }
  // The hive pays in energy, not scrap.
  const price = (t: GroupEntry["type"]) => (usesHiveEnergy(faction) ? energyOf(t) : costFor(t, faction));
  for (const g of PRICE_SORTED_GROUPS) out[g].sort((a, b) => price(a.type) - price(b.type));
  if (faction === "xeno") {
    const rank = (t: GroupEntry["type"]) => {
      const i = XENO_STRUCTURE_ORDER.indexOf(t as BuildingType);
      return i < 0 ? XENO_STRUCTURE_ORDER.length : i;
    };
    out.structures.sort((a, b) => rank(a.type) - rank(b.type));
  }
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
