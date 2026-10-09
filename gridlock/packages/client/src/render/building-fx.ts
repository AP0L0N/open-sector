import type { EntityType, EntityView } from "@gridlock/shared";
import type { BuildingSpriteDef } from "./sprites.js";

/** Buildings that train units. Full-strength overlay only while a job is running. */
const PRODUCERS = new Set<EntityType>(["muster", "smelter", "armory", "assimilator", "cyborgcentral", "forge", "spawnpool"]);
/** Keep a quiet always-on overlay: blinks, the Smelter's chimneys, the lab's coil. */
const IDLE_ALWAYS = new Set<EntityType>(["core", "dynamo", "smelter", "research", "radar", "cyborgcentral", "hivecore", "fusionnode", "assimilator", "forge", "nexus", "spawnpool", "aerie"]);
/** Chimney smoke never fades below this, so an idle Smelter still reads as lit. */
const IDLE_SMOKE_GAIN = 0.75;

export type BuildingAnimView = Pick<
  EntityView,
  "id" | "type" | "hp" | "wreck" | "trainProgress" | "trainQueue"
>;

export function buildingProducesUnits(type: EntityType): boolean {
  return PRODUCERS.has(type);
}

/** True while a trainer has an unpaused job running. */
export function buildingWorking(e: BuildingAnimView): boolean {
  if (e.wreck || e.hp <= 0 || !PRODUCERS.has(e.type)) return false;
  if (e.trainProgress == null) return false;
  return !e.trainQueue?.[0]?.paused;
}

/** True when this building should play its overlay this frame. */
export function buildingAnimActive(e: BuildingAnimView): boolean {
  if (e.wreck || e.hp <= 0) return false;
  return buildingWorking(e) || IDLE_ALWAYS.has(e.type);
}

type LightMode = "pulse" | "blink";

interface LightSpot {
  x: number;
  y: number;
  r: number;
  color: string;
  period: number;
  phase: number;
  mode: LightMode;
}

interface SmokeSpot {
  x: number;
  y: number;
  /** Rise height, source px at pad scale. Default 26 × the def scale. */
  rise?: number;
  /** Lighter, thinner puffs that drift downwind: the long tail of a plume. */
  thin?: boolean;
}

interface SparkSpot {
  x: number;
  y: number;
}

interface ArcSpot {
  x: number;
  y: number;
}

interface BuildingAnimDef {
  lights: LightSpot[];
  smoke?: SmokeSpot[];
  sparks?: SparkSpot[];
  arcs?: ArcSpot[];
}

const DEFS: Partial<Record<EntityType, BuildingAnimDef>> = {
  dynamo: {
    lights: [
      { x: 105, y: 131, r: 11, color: "#ffc44a", period: 2200, phase: 0.05, mode: "pulse" },
      { x: 186, y: 84, r: 7, color: "#ffe08a", period: 1900, phase: 0.28, mode: "pulse" },
      { x: 226, y: 108, r: 8, color: "#ffe08a", period: 1800, phase: 0.4, mode: "pulse" },
      { x: 280, y: 154, r: 10, color: "#ffc44a", period: 2400, phase: 0.62, mode: "pulse" },
      { x: 186, y: 176, r: 8, color: "#ffb84a", period: 2000, phase: 0.22, mode: "pulse" },
      { x: 248, y: 174, r: 8, color: "#ffb84a", period: 2100, phase: 0.78, mode: "pulse" },
    ],
  },
  core: {
    lights: [
      { x: 184, y: 106, r: 8, color: "#ffb84a", period: 2600, phase: 0.1, mode: "pulse" },
      { x: 250, y: 104, r: 8, color: "#ffb84a", period: 2600, phase: 0.18, mode: "pulse" },
      { x: 201, y: 309, r: 10, color: "#ffc44a", period: 2200, phase: 0.45, mode: "pulse" },
      { x: 261, y: 229, r: 8, color: "#ffb84a", period: 2400, phase: 0.7, mode: "pulse" },
      { x: 71, y: 236, r: 6, color: "#ffe08a", period: 3200, phase: 0.0, mode: "blink" },
      { x: 241, y: 240, r: 5, color: "#ffe08a", period: 3400, phase: 0.55, mode: "blink" },
    ],
  },
  smelter: {
    lights: [
      { x: 156, y: 188, r: 9, color: "#ff9a32", period: 720, phase: 0.05, mode: "pulse" },
      { x: 249, y: 185, r: 9, color: "#ff9a32", period: 720, phase: 0.12, mode: "pulse" },
      { x: 160, y: 232, r: 9, color: "#ff8a22", period: 640, phase: 0.4, mode: "pulse" },
      { x: 248, y: 231, r: 9, color: "#ff8a22", period: 640, phase: 0.48, mode: "pulse" },
      { x: 161, y: 274, r: 8, color: "#ff7a18", period: 580, phase: 0.22, mode: "pulse" },
      { x: 265, y: 290, r: 16, color: "#ff6a14", period: 520, phase: 0.0, mode: "pulse" },
    ],
    // All smoke is animated: smelter.png carries no painted plume. Each mouth has
    // dense puffs plus a taller, thinner trail leaning downwind.
    smoke: [
      { x: 226, y: 44 },
      { x: 275, y: 74 },
      { x: 226, y: 42, rise: 58, thin: true },
      { x: 275, y: 72, rise: 58, thin: true },
    ],
  },
  muster: {
    lights: [
      { x: 122, y: 192, r: 12, color: "#ffc44a", period: 900, phase: 0.1, mode: "pulse" },
      { x: 196, y: 10, r: 5, color: "#ffe08a", period: 1400, phase: 0.0, mode: "blink" },
    ],
  },
  // Spots from tools/sprites/render_research.py (research.json).
  research: {
    lights: [
      { x: 237, y: 213, r: 8, color: "#7fe8dc", period: 3000, phase: 0.0, mode: "pulse" },
      { x: 216, y: 223, r: 8, color: "#7fe8dc", period: 3000, phase: 0.15, mode: "pulse" },
      { x: 113, y: 190, r: 8, color: "#7fe8dc", period: 3400, phase: 0.4, mode: "pulse" },
      { x: 146, y: 206, r: 8, color: "#7fe8dc", period: 3400, phase: 0.55, mode: "pulse" },
      { x: 325, y: 167, r: 9, color: "#8fd0ff", period: 1600, phase: 0.2, mode: "pulse" },
      { x: 210, y: 42, r: 5, color: "#ff5a4a", period: 2000, phase: 0.0, mode: "blink" },
    ],
    arcs: [{ x: 325, y: 167 }],
  },
  // Borg spots from tools/sprites/render_borg_base.py (hivecore.json, fusionnode.json, assimilator.json).
  // Hive Core: the iris breathes, the crown rings chase round the spines, the apex beacon blinks.
  hivecore: {
    lights: [
      { x: 204, y: 164, r: 16, color: "#6dffc8", period: 3200, phase: 0.0, mode: "pulse" },
      { x: 182, y: 92, r: 6, color: "#7fe3ff", period: 2400, phase: 0.0, mode: "pulse" },
      { x: 150, y: 88, r: 6, color: "#7fe3ff", period: 2400, phase: 0.125, mode: "pulse" },
      { x: 150, y: 53, r: 6, color: "#7fe3ff", period: 2400, phase: 0.25, mode: "pulse" },
      { x: 182, y: 49, r: 6, color: "#7fe3ff", period: 2400, phase: 0.375, mode: "pulse" },
      { x: 226, y: 38, r: 6, color: "#7fe3ff", period: 2400, phase: 0.5, mode: "pulse" },
      { x: 258, y: 65, r: 6, color: "#7fe3ff", period: 2400, phase: 0.625, mode: "pulse" },
      { x: 258, y: 76, r: 6, color: "#7fe3ff", period: 2400, phase: 0.75, mode: "pulse" },
      { x: 226, y: 104, r: 6, color: "#7fe3ff", period: 2400, phase: 0.875, mode: "pulse" },
      { x: 240, y: 187, r: 6, color: "#6dffc8", period: 2800, phase: 0.2, mode: "pulse" },
      { x: 204, y: 191, r: 6, color: "#6dffc8", period: 2800, phase: 0.4, mode: "pulse" },
      { x: 168, y: 187, r: 6, color: "#6dffc8", period: 2800, phase: 0.6, mode: "pulse" },
      { x: 204, y: 71, r: 5, color: "#b6fff0", period: 1600, phase: 0.0, mode: "blink" },
    ],
  },
  // Fusion Node: the caged plasma orb throbs fast, the well glows under it, and arcs jump between the coils.
  fusionnode: {
    lights: [
      { x: 210, y: 59, r: 14, color: "#8ff7ff", period: 900, phase: 0.0, mode: "pulse" },
      { x: 210, y: 143, r: 10, color: "#6dffc8", period: 1400, phase: 0.3, mode: "pulse" },
      { x: 285, y: 19, r: 5, color: "#b6fff0", period: 1100, phase: 0.0, mode: "blink" },
      { x: 135, y: 19, r: 5, color: "#b6fff0", period: 1100, phase: 0.5, mode: "blink" },
    ],
    arcs: [
      { x: 236, y: 57 },
      { x: 184, y: 57 },
    ],
  },
  // Assimilator: the melt in the pit churns, the rim and silo bands chase, and thin vapour lifts off the melt.
  assimilator: {
    lights: [
      { x: 204, y: 170, r: 16, color: "#7dff9a", period: 700, phase: 0.0, mode: "pulse" },
      { x: 232, y: 192, r: 6, color: "#6dffc8", period: 1200, phase: 0.1, mode: "pulse" },
      { x: 203, y: 196, r: 6, color: "#6dffc8", period: 1200, phase: 0.43, mode: "pulse" },
      { x: 174, y: 192, r: 6, color: "#6dffc8", period: 1200, phase: 0.76, mode: "pulse" },
      { x: 204, y: 63, r: 8, color: "#7fe3ff", period: 2200, phase: 0.2, mode: "pulse" },
      { x: 324, y: 150, r: 5, color: "#7fe3ff", period: 1500, phase: 0.0, mode: "pulse" },
      { x: 324, y: 134, r: 5, color: "#7fe3ff", period: 1500, phase: 0.33, mode: "pulse" },
      { x: 324, y: 118, r: 5, color: "#7fe3ff", period: 1500, phase: 0.66, mode: "pulse" },
    ],
    smoke: [{ x: 204, y: 164, rise: 40, thin: true }],
  },
  // Spawning Pool and Aerie (render_borg_harbour.py; spots from spawnpool.json, aerie.json).
  spawnpool: {
    lights: [
      { x: 210, y: 141, r: 22, color: "#6dffc8", period: 2600, phase: 0, mode: "pulse" },
      { x: 167, y: 93, r: 6, color: "#b6fff0", period: 1800, phase: 0, mode: "pulse" },
      { x: 158, y: 74, r: 6, color: "#b6fff0", period: 1800, phase: 0.25, mode: "pulse" },
      { x: 228, y: 53, r: 6, color: "#b6fff0", period: 1800, phase: 0.5, mode: "pulse" },
      { x: 261, y: 70, r: 6, color: "#b6fff0", period: 1800, phase: 0.75, mode: "pulse" },
      { x: 134, y: 161, r: 5, color: "#6dffc8", period: 2200, phase: 0, mode: "pulse" },
      { x: 145, y: 102, r: 5, color: "#6dffc8", period: 2200, phase: 0.333, mode: "pulse" },
      { x: 263, y: 97, r: 5, color: "#6dffc8", period: 2200, phase: 0.667, mode: "pulse" },
      { x: 178, y: 91, r: 7, color: "#7dffd0", period: 1400, phase: 0.3, mode: "pulse" },
    ],
    smoke: [{ x: 210, y: 141, rise: 34, thin: true }],
  },
  aerie: {
    lights: [
      { x: 185, y: 246, r: 14, color: "#6dffc8", period: 2400, phase: 0, mode: "pulse" },
      { x: 332, y: 320, r: 14, color: "#6dffc8", period: 2400, phase: 0.25, mode: "pulse" },
      { x: 473, y: 390, r: 14, color: "#6dffc8", period: 2400, phase: 0.5, mode: "pulse" },
      { x: 620, y: 464, r: 14, color: "#6dffc8", period: 2400, phase: 0.75, mode: "pulse" },
      { x: 253, y: 131, r: 4, color: "#8cffb8", period: 1600, phase: 0, mode: "pulse" },
      { x: 179, y: 168, r: 4, color: "#8cffb8", period: 1600, phase: 0, mode: "pulse" },
      { x: 301, y: 155, r: 4, color: "#8cffb8", period: 1600, phase: 0.077, mode: "pulse" },
      { x: 227, y: 192, r: 4, color: "#8cffb8", period: 1600, phase: 0.077, mode: "pulse" },
      { x: 349, y: 179, r: 4, color: "#8cffb8", period: 1600, phase: 0.154, mode: "pulse" },
      { x: 275, y: 216, r: 4, color: "#8cffb8", period: 1600, phase: 0.154, mode: "pulse" },
      { x: 397, y: 203, r: 4, color: "#8cffb8", period: 1600, phase: 0.231, mode: "pulse" },
      { x: 323, y: 240, r: 4, color: "#8cffb8", period: 1600, phase: 0.231, mode: "pulse" },
      { x: 445, y: 227, r: 4, color: "#8cffb8", period: 1600, phase: 0.308, mode: "pulse" },
      { x: 371, y: 264, r: 4, color: "#8cffb8", period: 1600, phase: 0.308, mode: "pulse" },
      { x: 493, y: 251, r: 4, color: "#8cffb8", period: 1600, phase: 0.385, mode: "pulse" },
      { x: 419, y: 288, r: 4, color: "#8cffb8", period: 1600, phase: 0.385, mode: "pulse" },
      { x: 541, y: 275, r: 4, color: "#8cffb8", period: 1600, phase: 0.462, mode: "pulse" },
      { x: 467, y: 312, r: 4, color: "#8cffb8", period: 1600, phase: 0.462, mode: "pulse" },
      { x: 589, y: 299, r: 4, color: "#8cffb8", period: 1600, phase: 0.538, mode: "pulse" },
      { x: 515, y: 336, r: 4, color: "#8cffb8", period: 1600, phase: 0.538, mode: "pulse" },
      { x: 637, y: 323, r: 4, color: "#8cffb8", period: 1600, phase: 0.615, mode: "pulse" },
      { x: 563, y: 360, r: 4, color: "#8cffb8", period: 1600, phase: 0.615, mode: "pulse" },
      { x: 685, y: 347, r: 4, color: "#8cffb8", period: 1600, phase: 0.692, mode: "pulse" },
      { x: 611, y: 384, r: 4, color: "#8cffb8", period: 1600, phase: 0.692, mode: "pulse" },
      { x: 733, y: 371, r: 4, color: "#8cffb8", period: 1600, phase: 0.769, mode: "pulse" },
      { x: 659, y: 408, r: 4, color: "#8cffb8", period: 1600, phase: 0.769, mode: "pulse" },
      { x: 781, y: 395, r: 4, color: "#8cffb8", period: 1600, phase: 0.846, mode: "pulse" },
      { x: 707, y: 432, r: 4, color: "#8cffb8", period: 1600, phase: 0.846, mode: "pulse" },
      { x: 829, y: 419, r: 4, color: "#8cffb8", period: 1600, phase: 0.923, mode: "pulse" },
      { x: 755, y: 456, r: 4, color: "#8cffb8", period: 1600, phase: 0.923, mode: "pulse" },
      { x: 348, y: 144, r: 16, color: "#6dffc8", period: 3000, phase: 0, mode: "pulse" },
      { x: 677, y: 272, r: 8, color: "#7dffd0", period: 1800, phase: 0, mode: "pulse" },
      { x: 695, y: 297, r: 8, color: "#7dffd0", period: 1800, phase: 0.333, mode: "pulse" },
      { x: 749, y: 304, r: 8, color: "#7dffd0", period: 1800, phase: 0.667, mode: "pulse" },
      { x: 822, y: 319, r: 5, color: "#b6fff0", period: 1500, phase: 0, mode: "pulse" },
      { x: 838, y: 351, r: 5, color: "#b6fff0", period: 1500, phase: 0.5, mode: "pulse" },
      { x: 578, y: 137, r: 6, color: "#8ff7ff", period: 1200, phase: 0, mode: "pulse" },
      { x: 878, y: 333, r: 5, color: "#b6fff0", period: 1100, phase: 0, mode: "blink" },
      { x: 588, y: 112, r: 6, color: "#b6fff0", period: 1600, phase: 0, mode: "blink" },
    ],
  },
  // Nanite Forge (render_borg_base.py, forge.json): the maw breathes, the apron chevrons chase out, the vats pulse, a pod blinks in the claw.
  forge: {
    lights: [
      { x: 127, y: 125, r: 18, color: "#6dffc8", period: 2600, phase: 0.0, mode: "pulse" },
      { x: 115, y: 152, r: 5, color: "#6dffc8", period: 1200, phase: 0.0, mode: "pulse" },
      { x: 105, y: 157, r: 5, color: "#6dffc8", period: 1200, phase: 0.33, mode: "pulse" },
      { x: 95, y: 162, r: 5, color: "#6dffc8", period: 1200, phase: 0.66, mode: "pulse" },
      { x: 286, y: 128, r: 9, color: "#7dffd0", period: 1800, phase: 0.0, mode: "pulse" },
      { x: 246, y: 148, r: 9, color: "#7dffd0", period: 1800, phase: 0.33, mode: "pulse" },
      { x: 206, y: 168, r: 9, color: "#7dffd0", period: 1800, phase: 0.66, mode: "pulse" },
      { x: 155, y: 65, r: 5, color: "#7fe3ff", period: 2400, phase: 0.0, mode: "pulse" },
      { x: 129, y: 74, r: 5, color: "#7fe3ff", period: 2400, phase: 0.33, mode: "pulse" },
      { x: 102, y: 84, r: 5, color: "#7fe3ff", period: 2400, phase: 0.66, mode: "pulse" },
      { x: 224, y: 35, r: 6, color: "#b6fff0", period: 1100, phase: 0.0, mode: "blink" },
    ],
    smoke: [{ x: 264, y: 129, rise: 30, thin: true }],
  },
  // Neural Nexus (nexus.json): the brain pulses, the rib collars chase, the crown tips sweep round, the mast beacon flickers.
  nexus: {
    lights: [
      { x: 210, y: 149, r: 16, color: "#6dffc8", period: 2000, phase: 0.0, mode: "pulse" },
      { x: 233, y: 184, r: 5, color: "#7fe3ff", period: 1600, phase: 0.0, mode: "pulse" },
      { x: 187, y: 184, r: 5, color: "#7fe3ff", period: 1600, phase: 0.2, mode: "pulse" },
      { x: 154, y: 167, r: 5, color: "#7fe3ff", period: 1600, phase: 0.4, mode: "pulse" },
      { x: 266, y: 167, r: 5, color: "#7fe3ff", period: 1600, phase: 0.6, mode: "pulse" },
      { x: 266, y: 144, r: 5, color: "#7fe3ff", period: 1600, phase: 0.8, mode: "pulse" },
      { x: 210, y: 72, r: 4, color: "#b6fff0", period: 1500, phase: 0.0, mode: "blink" },
      { x: 162, y: 58, r: 4, color: "#b6fff0", period: 1500, phase: 0.167, mode: "blink" },
      { x: 162, y: 30, r: 4, color: "#b6fff0", period: 1500, phase: 0.333, mode: "blink" },
      { x: 210, y: 16, r: 4, color: "#b6fff0", period: 1500, phase: 0.5, mode: "blink" },
      { x: 258, y: 30, r: 4, color: "#b6fff0", period: 1500, phase: 0.667, mode: "blink" },
      { x: 258, y: 58, r: 4, color: "#b6fff0", period: 1500, phase: 0.833, mode: "blink" },
      { x: 210, y: 30, r: 5, color: "#8ff7ff", period: 900, phase: 0.0, mode: "pulse" },
      { x: 174, y: 236, r: 5, color: "#6dffc8", period: 2400, phase: 0.0, mode: "pulse" },
      { x: 246, y: 236, r: 5, color: "#6dffc8", period: 2400, phase: 0.5, mode: "pulse" },
    ],
  },
  // Spots from tools/sprites/render_cyborgcentral.py (cyborgcentral.json): red sensor band, reactor core, emitter rings climbing the mast, mast lamp.
  cyborgcentral: {
    lights: [
      { x: 202, y: 241, r: 7, color: "#ff5a48", period: 2200, phase: 0.0, mode: "pulse" },
      { x: 189, y: 248, r: 7, color: "#ff5a48", period: 2200, phase: 0.15, mode: "pulse" },
      { x: 175, y: 254, r: 7, color: "#ff5a48", period: 2200, phase: 0.3, mode: "pulse" },
      { x: 143, y: 257, r: 7, color: "#ff5a48", period: 2600, phase: 0.5, mode: "pulse" },
      { x: 285, y: 232, r: 13, color: "#7fe3ff", period: 1800, phase: 0.0, mode: "pulse" },
      { x: 204, y: 122, r: 9, color: "#7fe3ff", period: 1500, phase: 0.0, mode: "pulse" },
      { x: 204, y: 104, r: 9, color: "#7fe3ff", period: 1500, phase: 0.33, mode: "pulse" },
      { x: 204, y: 86, r: 9, color: "#7fe3ff", period: 1500, phase: 0.66, mode: "pulse" },
      { x: 204, y: 67, r: 5, color: "#ff5a4a", period: 1400, phase: 0.0, mode: "blink" },
    ],
    arcs: [{ x: 285, y: 222 }],
  },
  // Spots from tools/sprites/render_radar.py (radar.json): the scope-green window band, the mast lamp, the whip lamp.
  radar: {
    lights: [
      { x: 298, y: 270, r: 8, color: "#8fe8a8", period: 2600, phase: 0.0, mode: "pulse" },
      { x: 271, y: 283, r: 8, color: "#8fe8a8", period: 2600, phase: 0.12, mode: "pulse" },
      { x: 244, y: 297, r: 8, color: "#8fe8a8", period: 2600, phase: 0.24, mode: "pulse" },
      { x: 149, y: 271, r: 8, color: "#8fe8a8", period: 3000, phase: 0.4, mode: "pulse" },
      { x: 176, y: 285, r: 8, color: "#8fe8a8", period: 3000, phase: 0.55, mode: "pulse" },
      { x: 216, y: 100, r: 6, color: "#ff5a4a", period: 1400, phase: 0.0, mode: "blink" },
      { x: 294, y: 200, r: 4, color: "#ffe08a", period: 2200, phase: 0.5, mode: "blink" },
    ],
  },
  // Spots from tools/sprites/render_armory.py (armory.json): the window bands, the open door, the stack lamp.
  armory: {
    lights: [
      { x: 442, y: 203, r: 9, color: "#ffc44a", period: 2200, phase: 0.0, mode: "pulse" },
      { x: 409, y: 220, r: 9, color: "#ffc44a", period: 2200, phase: 0.12, mode: "pulse" },
      { x: 376, y: 236, r: 9, color: "#ffc44a", period: 2200, phase: 0.24, mode: "pulse" },
      { x: 188, y: 194, r: 9, color: "#ffc44a", period: 2600, phase: 0.4, mode: "pulse" },
      { x: 290, y: 245, r: 9, color: "#ffc44a", period: 2600, phase: 0.55, mode: "pulse" },
      { x: 231, y: 227, r: 18, color: "#ffb04a", period: 800, phase: 0.15, mode: "pulse" },
      { x: 323, y: 19, r: 5, color: "#ff5a4a", period: 1400, phase: 0.0, mode: "blink" },
    ],
    sparks: [{ x: 225, y: 227 }],
  },
};

function srcToScreen(
  def: BuildingSpriteDef,
  southX: number,
  southY: number,
  footprintW: number,
  sx: number,
  sy: number,
): { x: number; y: number; scale: number } {
  const scale = footprintW / def.padWidth;
  return {
    x: southX + (sx - def.padSouthX) * scale,
    y: southY + (sy - def.padSouthY) * scale,
    scale,
  };
}

function sinePulse(nowMs: number, period: number, phase: number): number {
  return 0.5 + 0.5 * Math.sin((nowMs / period + phase) * Math.PI * 2);
}

function blinkPulse(nowMs: number, period: number, phase: number, duty = 0.28): number {
  const t = ((nowMs / period + phase) % 1 + 1) % 1;
  const fade = Math.max(0.04, duty * 0.18);
  if (t < fade) return t / fade;
  if (t < duty) return 1;
  if (t < duty + fade) return 1 - (t - duty) / fade;
  return 0;
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.02 || r <= 0.4) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 2.15, r * 1.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.85;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = "#fff6d0";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.32, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawChimneySmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nowMs: number,
  seed: number,
  scale: number,
  intensity: number,
  rise = 26,
  thin = false,
): void {
  const puffs = 5;
  for (let i = 0; i < puffs; i++) {
    const t = ((nowMs * 0.00018 + seed * 0.13 + i / puffs) % 1 + 1) % 1;
    const drift = Math.sin(nowMs * 0.0014 + seed + i * 1.7) * 4.5 * scale;
    // Thin plume ends lean downwind (screen right).
    const px = x + drift + (thin ? t * 14 * scale : 0);
    const py = y - t * rise * scale;
    const grow = 0.45 + t * 1.35;
    const a = intensity * (1 - t) * Math.min(1, t * 3.2) * 0.62;
    if (a <= 0.02) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = thin ? (i % 2 === 0 ? "#8e8a82" : "#9c978e") : i % 2 === 0 ? "#6a645c" : "#7a746c";
    ctx.beginPath();
    ctx.ellipse(px, py, (3.2 + grow * 3.4) * scale, (2.4 + grow * 2.6) * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawWorkSparks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nowMs: number,
  seed: number,
  scale: number,
  intensity: number,
): void {
  const cycle = 560;
  const local = (((nowMs + seed * 37) % cycle) + cycle) % cycle / cycle;
  if (local > 0.42) return;
  const t = local / 0.42;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "butt";
  const n = 5;
  for (let i = 0; i < n; i++) {
    const ang = -0.9 + i * 0.42 + Math.sin(seed + i) * 0.2;
    const dist = (6 + (i % 3) * 3.2) * scale * t;
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist * 0.55 + t * 2 * scale;
    const fade = (1 - t) * (1 - t) * intensity;
    ctx.globalAlpha = fade * (0.55 + (i % 2) * 0.35);
    ctx.strokeStyle = t < 0.35 ? "#ffffff" : "#ffc56a";
    ctx.lineWidth = Math.max(0.7, 1.15 * scale);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang) * 3.2 * scale, py - Math.sin(ang) * 2.2 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

/** Brief blue crackle off the coil cap: a jagged 3-segment bolt every so often. */
function drawCoilArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nowMs: number,
  seed: number,
  scale: number,
  intensity: number,
): void {
  const cycle = 1700;
  const n = Math.floor((nowMs + seed * 131) / cycle);
  const local = (((nowMs + seed * 131) % cycle) + cycle) % cycle;
  if (local > 140) return;
  const rnd = (k: number): number => {
    const v = Math.sin((n * 12.9898 + k * 78.233 + seed) * 43758.5453);
    return v - Math.floor(v);
  };
  const ang = Math.PI * (0.15 + rnd(1) * 0.7) * (rnd(2) < 0.5 ? 1 : -1) - Math.PI / 2;
  const len = (12 + rnd(3) * 8) * scale;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, intensity * (1 - local / 140) * 2.6);
  ctx.strokeStyle = "#bfe9ff";
  ctx.lineWidth = Math.max(0.6, 0.9 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i <= 3; i++) {
    const t = i / 3;
    const jit = (rnd(4 + i) - 0.5) * 5 * scale;
    ctx.lineTo(
      x + Math.cos(ang) * len * t - Math.sin(ang) * jit,
      y + Math.sin(ang) * len * t * 0.8 + Math.cos(ang) * jit,
    );
  }
  ctx.stroke();
  ctx.restore();
}

export function drawBuildingAnim(
  ctx: CanvasRenderingContext2D,
  def: BuildingSpriteDef,
  e: BuildingAnimView,
  southX: number,
  southY: number,
  footprintW: number,
  nowMs: number,
): void {
  if (!buildingAnimActive(e) || footprintW <= 0 || def.padWidth <= 0) return;
  const spots = DEFS[e.type];
  if (!spots) return;
  const gain = buildingWorking(e) ? 0.88 : 0.32;
  const drift = ((e.id * 0.6180339887) % 1 + 1) % 1;

  for (const light of spots.lights) {
    const p = srcToScreen(def, southX, southY, footprintW, light.x, light.y);
    const wave =
      light.mode === "blink"
        ? blinkPulse(nowMs, light.period, light.phase + drift)
        : 0.4 + 0.6 * sinePulse(nowMs, light.period, light.phase + drift);
    const r = Math.max(1.2, light.r * p.scale);
    drawGlow(ctx, p.x, p.y, r, light.color, gain * wave);
  }

  if (spots.smoke) {
    for (let i = 0; i < spots.smoke.length; i++) {
      const s = spots.smoke[i]!;
      const p = srcToScreen(def, southX, southY, footprintW, s.x, s.y);
      drawChimneySmoke(ctx, p.x, p.y, nowMs, e.id * 17 + i * 9, p.scale, Math.max(gain, IDLE_SMOKE_GAIN), s.rise, s.thin);
    }
  }

  if (spots.sparks) {
    for (let i = 0; i < spots.sparks.length; i++) {
      const s = spots.sparks[i]!;
      const p = srcToScreen(def, southX, southY, footprintW, s.x, s.y);
      drawWorkSparks(ctx, p.x, p.y, nowMs, e.id * 23 + i * 11, p.scale, gain);
    }
  }

  if (spots.arcs) {
    for (let i = 0; i < spots.arcs.length; i++) {
      const s = spots.arcs[i]!;
      const p = srcToScreen(def, southX, southY, footprintW, s.x, s.y);
      drawCoilArc(ctx, p.x, p.y, nowMs, e.id * 29 + i * 13, p.scale, gain);
    }
  }
}
