/**
 * Layout of the command bar under the map: which group an order sits in,
 * its icon, and the key that fires it. The HUD decides which orders apply.
 */

export type CommandGroup = "place" | "orders" | "stance" | "special" | "cargo" | "build" | "structure";

/** Left to right across the bar. `label` is the small caption over each group. */
export const COMMAND_GROUPS: readonly { id: CommandGroup; label: string }[] = [
  { id: "place", label: "Placement" },
  { id: "orders", label: "Orders" },
  { id: "stance", label: "Stance" },
  { id: "special", label: "Special" },
  { id: "cargo", label: "Garrison" },
  { id: "build", label: "Engineer" },
  { id: "structure", label: "Structure" },
];

const ORDERS = new Set(["stop", "attackmove", "forceattack", "patrol", "guard", "hold", "rotate", "rotate-light", "delete"]);
const CARGO = new Set(["garrison", "ungarrison", "garrison-watch", "garrison-hide", "unboard", "unhitch"]);
const STRUCTURE = new Set(["sell", "gate-lock"]);

/** Group by slot (a slot is stable while its act may flip, e.g. scout-in / scout-out). */
export function commandGroupOf(slot: string): CommandGroup {
  if (slot === "confirm-field") return "place";
  if (ORDERS.has(slot)) return "orders";
  if (slot.startsWith("stance-")) return "stance";
  if (CARGO.has(slot)) return "cargo";
  if (slot.startsWith("field-") || slot.startsWith("construct-") || slot.startsWith("bridge-")) return "build";
  if (STRUCTURE.has(slot)) return "structure";
  return "special";
}

/** Split an ordered list into bar groups, in `COMMAND_GROUPS` order; empty groups are dropped. */
export function groupCommands<T extends { slot: string }>(items: readonly T[]): { id: CommandGroup; label: string; items: T[] }[] {
  const by = new Map<CommandGroup, T[]>();
  for (const item of items) {
    const g = commandGroupOf(item.slot);
    let list = by.get(g);
    if (!list) by.set(g, (list = []));
    list.push(item);
  }
  return COMMAND_GROUPS.filter((g) => by.has(g.id)).map((g) => ({ ...g, items: by.get(g.id)! }));
}

/** Single keys that already fire these orders from the map (see mapview's key handler). */
const HOTKEYS: Record<string, string> = {
  stop: "S",
  attackmove: "A",
  patrol: "Y",
  guard: "G",
  hold: "P",
  rotate: "R",
  "stance-crouch": "C",
  "stance-crawl": "Z",
  deploy: "E",
  "jet-up": "J",
  "jet-land": "J",
  "scout-out": "I",
  "scout-in": "I",
  "garrison-watch": "I",
  "garrison-hide": "I",
  garrison: "U",
  ungarrison: "U",
  "confirm-field": "Enter",
  // S sells only when no own unit is selected; with units it is Stop.
  sell: "S",
  delete: "Del",
};

export function commandHotkey(act: string): string | undefined {
  return HOTKEYS[act];
}

const DOOR_IN = '<path d="M9 2h5v12H9"/><path d="M1.5 8H9M6 5l3 3-3 3"/>';
const DOOR_OUT = '<path d="M7 2H2v12h5"/><path d="M6.5 8h8M11.5 5l3 3-3 3"/>';
const EYE = '<path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>';
const EYE_SHUT = '<path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z"/><path d="M2 14L14 2"/>';
const CROSSHAIR = '<circle cx="8" cy="8" r="5"/><path d="M8 1v4M8 11v4M1 8h4M11 8h4"/>';
const DRONE =
  '<circle cx="3.5" cy="3.5" r="2"/><circle cx="12.5" cy="3.5" r="2"/><path d="M5 5l2 2.2M11 5L9 7.2"/><rect x="6" y="7" width="4" height="3" rx=".5"/>';
const BRIDGE = '<path d="M1 6.5h14M1 6.5V13M15 6.5V13M3.5 13a4.5 4 0 019 0"/>';

/** Inner SVG for a 16×16 stroked icon, keyed by act. */
const ICONS: Record<string, string> = {
  stop: '<rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor" stroke="none"/>',
  attackmove: '<path d="M2 14L9.5 6.5M9.5 6.5H5M9.5 6.5V11"/><circle cx="12" cy="4" r="2.4"/><path d="M12 .8v1.2M15.2 4H14"/>',
  forceattack: CROSSHAIR + '<circle cx="8" cy="8" r="1" fill="currentColor"/>',
  drop: '<path d="M1.5 7.5a6.5 5.5 0 0113 0z"/><path d="M1.5 7.5L8 13l6.5-5.5M8 7.5V13"/><rect x="6.5" y="13" width="3" height="2" fill="currentColor"/>',
  patrol: '<path d="M3 6.5a5 3.2 0 0110 0M13 9.5a5 3.2 0 01-10 0"/><path d="M13 3.5v3h-3M3 12.5v-3h3"/>',
  guard: '<path d="M8 1.5l5.5 2v4.2c0 3.2-2.3 5.5-5.5 6.8-3.2-1.3-5.5-3.6-5.5-6.8V3.5z"/>',
  hold: '<circle cx="8" cy="5" r="3"/><path d="M8 8v6.5M4 14.5h8"/>',
  rotate: '<path d="M13 8a5 5 0 11-1.5-3.6"/><path d="M12 1.5V5H8.5"/>',
  "rotate-light": '<path d="M1.5 6.5h3v3h-3zM4.5 6.2l3-2v7.6l-3-2"/><path d="M10 5.5l4.5-2M10 8h5M10 10.5l4.5 2"/>',
  "stance-stand":
    '<circle cx="8" cy="2.5" r="1.6" fill="currentColor"/><path d="M8 4.6v5.2M8 9.8l-2.2 4.7M8 9.8l2.2 4.7M4.8 6.8h6.4"/>',
  "stance-crouch":
    '<circle cx="7" cy="5" r="1.6" fill="currentColor"/><path d="M7 7l1.2 4H11.5M8.2 11l-2.4 3.5M11.5 11v3.5M4.8 8.6h4.6"/>',
  "stance-crawl": '<circle cx="13" cy="9.6" r="1.6" fill="currentColor"/><path d="M1.5 12.5h9.5M4 12.5l1.6-2M8 12.5l1.2-2M11 12.5l1.4-1.6"/>',
  deploy: '<path d="M8 1.5v8M4.5 6L8 9.5 11.5 6"/><path d="M2 12h12v2.5H2z"/>',
  pack: '<path d="M8 10V2M4.5 5.5L8 2l3.5 3.5"/><path d="M2 12h12v2.5H2z"/>',
  "jet-up": '<path d="M8 1.5l3 4v5H5v-5z"/><path d="M6 10.5l-1.2 3.5M10 10.5l1.2 3.5M8 11v3.5"/>',
  "jet-land": '<path d="M8 1.5v8.5M4.5 6.5L8 10l3.5-3.5"/><path d="M1.5 13.5h13"/>',
  "scout-out": EYE,
  "scout-in": EYE_SHUT,
  "drone-launch": DRONE + '<path d="M8 15.5v-4M6 13.5l2-2 2 2"/>',
  "drone-recall": DRONE + '<path d="M8 11v4.2M6 13.2l2 2 2-2"/>',
  "drone-surveil": EYE,
  "drone-strike": CROSSHAIR,
  "sub-surface": '<path d="M1 12c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 2-1"/><path d="M8 9V1.5M5 4.5l3-3 3 3"/>',
  "sub-dive": '<path d="M1 4c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 2-1"/><path d="M8 6.5V14.5M5 11.5l3 3 3-3"/>',
  "lay-mine": '<circle cx="8" cy="9.5" r="4"/><path d="M8 2.5v3M3.2 4.7l2 2M12.8 4.7l-2 2M1.5 9.5h2.5M12 9.5h2.5"/>',
  land: '<path d="M1.5 8.5L8 2.5l6.5 6"/><path d="M3.5 7v7h9V7"/><path d="M6.5 14v-4h3v4"/>',
  "gate-lock": '<rect x="3" y="7" width="10" height="7.5" rx="1"/><path d="M5 7V5a3 3 0 016 0v2"/>',
  "gate-unlock": '<rect x="3" y="7" width="10" height="7.5" rx="1"/><path d="M5 7V5a3 3 0 015.8-1"/>',
  garrison: DOOR_IN,
  ungarrison: DOOR_OUT,
  unboard: DOOR_OUT,
  "garrison-watch": EYE,
  "garrison-hide": '<rect x="2.5" y="2.5" width="11" height="11"/><path d="M2.5 5.5h11M2.5 8h11M2.5 10.5h11"/>',
  unhitch: '<path d="M6.2 9.8l-2 2a2 2 0 01-2.9-2.9l2-2M9.8 6.2l2-2a2 2 0 012.9 2.9l-2 2"/><path d="M5.5 4.5L4.5 2M10.5 11.5l1 2.5M4 6.5H1.8M12 9.5h2.2"/>',
  sell: '<circle cx="8" cy="8" r="6.2"/><path d="M10.2 5.6H7.1a1.3 1.3 0 000 2.6h1.8a1.3 1.3 0 010 2.6H5.8M8 3.8v1.8M8 10.8v1.6"/>',
  delete: '<path d="M2 4h12M6 4V2.2h4V4M3.6 4l.9 10h7l.9-10M6.5 6.5v5M9.5 6.5v5"/>',
  "field-sandbags":
    '<rect x="1.5" y="9.5" width="6.2" height="4" rx="2"/><rect x="8.3" y="9.5" width="6.2" height="4" rx="2"/><rect x="4.9" y="5" width="6.2" height="4" rx="2"/>',
  "field-teeth": '<path d="M1 14l3.5-7.5L8 14zM8 14l3.5-7.5L15 14z"/>',
  "field-greatwall": '<path d="M1.5 4h13v10h-13zM1.5 9h13M5.5 4v5M10.5 4v5M8 9v5"/><path d="M3 6.5h1M12 6.5h1" stroke-width="2"/>',
  bridge: BRIDGE,
  confirm: '<path d="M2.5 8.5l3.5 3.5 7.5-8"/>',
};

/** SVG markup for an icon key, or "" when the order has none. */
export function commandIconSvg(icon: string): string {
  const inner = ICONS[icon];
  if (!inner) return "";
  return `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export function hasCommandIcon(icon: string): boolean {
  return icon in ICONS;
}
