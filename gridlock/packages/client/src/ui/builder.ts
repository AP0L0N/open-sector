import "../style/builder.css";
import {
  BUILDING_TURN_STEP,
  CIVILIAN_TYPES,
  CUSTOM_MAP_MAX_PLAYERS,
  CUSTOM_MAP_MIN_PLAYERS,
  CUSTOM_MAP_SIZES,
  GROUND_DIRT,
  GROUND_GRASS,
  GROUND_SAND,
  GROUND_STONES,
  GROUND_SWAMP,
  GROUND_TALL_GRASS,
  HEIGHT_BASE,
  HEIGHT_MAX,
  MOUNTAIN_MIN_HEIGHT,
  CLUTTER_NAMES,
  CLUTTER_TYPES,
  LAMP_NAMES,
  LAMP_TYPES,
  SPAWN_PAD_R,
  DIAMOND_SCRAP_MUL,
  TILE_DIAMOND_SCRAP,
  TILE_EMPTY,
  TILE_FENCE,
  TILE_MOUNTAIN,
  TILE_ROAD,
  TILE_ROCK,
  TILE_SCRAP,
  TILE_SIZE,
  TILE_SUBDIV,
  TILE_TREE,
  TILE_WATER,
  MAP_DEFENCE_TYPES,
  MAP_UNIT_TYPES,
  PATROL_POINTS_MAX,
  catalog,
  connectPatrolPoints,
  copyMapUnit,
  garrisonCapOf,
  isInfantryType,
  featureAngle,
  featureBox,
  featureRect,
  hasSpotlight,
  fieldSpan,
  getMap,
  isCivilianType,
  isMapSection,
  isMapBridge,
  isMountainCliff,
  MAP_BRIDGE_TYPES,
  bridgeBrickLength,
  bridgePath,
  bridgeWidth,
  worldToIso,
  type BridgeType,
  listMaps,
  loadCustomMap,
  newCustomMapId,
  newPlaytestMapId,
  rollHeights,
  specFromMap,
  type CivilianType,
  type ClutterType,
  type LampType,
  type MapDefenceType,
  type MapSectionType,
  type MapFeature,
  type MapFeatureType,
  type MapUnit,
  type TrainType,
} from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import { forgetTerrain } from "../render/terrain.js";
import { heightsChanged } from "../render/height-mesh.js";
import { buildingSpriteFor, CLUTTER_SPRITES, gunLayerFor, LAMP_SPRITES } from "../render/sprites.js";
import { drawGunRow } from "../render/ciws.js";
import { fieldPointsWithCursor, pinFieldPoint, undoFieldPoint, type Pt } from "../render/field-place.js";
import { STREET_LAMPS } from "../render/night.js";
import grassUrl from "../assets/terrain/grass-meadow.png";
import tallGrassUrl from "../assets/terrain/grass-tall.png";
import dirtUrl from "../assets/terrain/ground-dirt.png";
import sandUrl from "../assets/terrain/ground-sand.png";
import stonesUrl from "../assets/terrain/ground-stones.png";
import swampUrl from "../assets/terrain/ground-swamp.png";
import scrapUrl from "../assets/terrain/scrap-heap-1.png";
import waterUrl from "../assets/terrain/water.png";
import treeUrl from "../assets/terrain/tree-oak-1.png";
import rockUrl from "../assets/terrain/ground-rock.png";
import { drawBrick, layoutBridges } from "../render/bridge.js";
import { el } from "./dom.js";
import { drawMapPreview } from "./map-preview.js";
import * as M from "./builder-model.js";
import { isoChanged, isoDraw, isoRestamp, type RouteDraw, type SpotBeam, type UnitOverlay } from "./builder-iso.js";
import { SIDEBAR_GROUPS, sidebarGroupOf, type SidebarGroup } from "./sidebar-groups.js";
import { isoFit, isoPick, isoScreenOf, isoZoomAt, type IsoCam } from "./builder-iso-cam.js";

const KEY_STORE = "gridlock.mapKey";
const MINE_STORE = "gridlock.myMaps";
const AUTO_STORE = "gridlock.builderAutoSave";
const AUTO_SAVE_MS = 30_000;
const GAME_VIEW_STORE = "gridlock.builderGameView";
const NIGHT_VIEW_STORE = "gridlock.builderNightView";
const PREVIEW_ID = "__builder__";
const UNDO_DEPTH = 40;
/** Raise / Lower apply one step this often while the button is held. */
const LIFT_EVERY_MS = 70;

type ToolId =
  | "select"
  | "raise"
  | "lower"
  | "level"
  | "mountain"
  | "ground"
  | "cover"
  | "house"
  | "defence"
  | "lamp"
  | "clutter"
  | "road"
  | "bridge"
  | "unit"
  | "spawn"
  | "erase";

interface GroundKind {
  tile: number;
  name: string;
  img: string;
  hint: string;
}

const GROUND: readonly GroundKind[] = [
  { tile: TILE_EMPTY, name: "Grass", img: grassUrl, hint: "Open ground. Paints over anything." },
  { tile: TILE_SCRAP, name: "Scrap", img: scrapUrl, hint: "Scrap field. A Smelter built on it pours scrap for the whole match. Paint at least 3×3." },
  {
    tile: TILE_DIAMOND_SCRAP,
    name: "Diamond Scrap",
    img: scrapUrl,
    hint: `Scrap field with diamonds in it. A Smelter on it pours ${DIAMOND_SCRAP_MUL}× as much. Paint at least 3×3.`,
  },
  { tile: TILE_WATER, name: "Water", img: waterUrl, hint: "Pond. Sinks to the valley floor." },
  { tile: TILE_TREE, name: "Trees", img: treeUrl, hint: "Woods. Block sight and walking." },
  { tile: TILE_ROCK, name: "Rock", img: rockUrl, hint: "Rocky slope. Blocks walking, not sight." },
];

interface CoverKind {
  cover: number;
  name: string;
  img: string;
  hint: string;
}

/** Surface the Cover brush lays over open ground. Looks only: nothing here changes how a tile plays. */
const COVER: readonly CoverKind[] = [
  { cover: GROUND_GRASS, name: "Meadow", img: grassUrl, hint: "Back to plain grass." },
  { cover: GROUND_TALL_GRASS, name: "Tall Grass", img: tallGrassUrl, hint: "Uncut meadow gone to seed, thick with tufts. Looks only." },
  { cover: GROUND_DIRT, name: "Dirt", img: dirtUrl, hint: "Bare trodden earth. Looks only." },
  { cover: GROUND_SAND, name: "Sand", img: sandUrl, hint: "Pale dry sand: a shore or a blown-out field. Looks only." },
  { cover: GROUND_STONES, name: "Stones", img: stonesUrl, hint: "Gravel and loose stones in packed earth. Looks only." },
  { cover: GROUND_SWAMP, name: "Swamp", img: swampUrl, hint: "Black mud, standing water, and reeds. Looks only." },
];

/** Ground laid by the Decorations tools rather than brushed, named for the status line. Fence waits to be remade. */
const LAID_GROUND: readonly { tile: number; name: string }[] = [
  { tile: TILE_ROAD, name: "Road" },
  { tile: TILE_FENCE, name: "Fence" },
];

interface Tool {
  id: ToolId;
  tile: number;
  /** The surface the Cover brush lays. */
  cover: number;
  house: CivilianType;
  defence: MapDefenceType;
  lamp: LampType;
  /** The piece the Clutter tool stands down. */
  clutter: ClutterType;
  /** The bridge the Bridge tool lays, brick by brick along a drawn line. */
  bridge: BridgeType;
  /** The neutral unit the Units tool stands on the map. */
  unit: TrainType;
  /** A house's door side, a quarter at a time. */
  facing: number;
  /** A defence's heading in 15° steps from east, as the wheel turns it in a match. */
  turn: number;
  brush: number;
  level: number;
  /** Flat cap height for the Mountain brush. Never below MOUNTAIN_MIN_HEIGHT. */
  mountain: number;
  /** A road's width in fine tiles. */
  roadWidth: number;
}

/** What the Select tool holds: a placed building or defence by index, or a start by number. */
type Selection = { kind: "feature"; index: number } | { kind: "spawn"; id: number } | { kind: "unit"; index: number };

/** Unit tabs, as the match's sidebar groups them. Aircraft are not map units. */
const UNIT_TABS: readonly SidebarGroup[] = ["infantry", "tanks", "naval"];
const COLLAPSE_STORE = "gridlock.builderCollapsed";

interface Stage {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  preview: HTMLCanvasElement | null;
  msg: HTMLElement;
  checks: HTMLElement | null;
  maps: HTMLElement | null;
  /** What the Select tool holds, and its Turn / Delete buttons. */
  sel: HTMLElement | null;
  /** The Defences heading readout, kept current while the wheel turns. */
  turnLabel: HTMLElement | null;
}

let sheet: M.Sheet | null = null;
let dirty = false;
let newOpen = false;
let msg = { text: "", tone: "" as "" | "bad" | "good" };
let pendingSave: string | null = null;
/** Edits made to the open sheet. A save ack clears `dirty` only if none landed while it was in flight. */
let edits = 0;
let savingEdits = 0;
/** The save in flight was the auto save's: confirm it quietly, without rebuilding the screen. */
let pendingAuto = false;
let autoSave = store()?.getItem(AUTO_STORE) !== "0";
let autoTimer: ReturnType<typeof setInterval> | null = null;
const undo: M.SheetMark[] = [];
const redo: M.SheetMark[] = [];
const tool: Tool = {
  id: "raise",
  tile: TILE_WATER,
  cover: GROUND_TALL_GRASS,
  house: "cottage",
  defence: "bunker",
  lamp: "streetlamp",
  clutter: "crates",
  bridge: "bridge",
  unit: "rifleman",
  facing: 1,
  turn: M.QUARTER_TURN,
  brush: 6,
  level: HEIGHT_BASE,
  mountain: Math.max(MOUNTAIN_MIN_HEIGHT, 16),
  roadWidth: M.ROAD_WIDTH,
};
let selected: Selection | null = null;
/** The Units tab on show. */
let unitTab: SidebarGroup = "infantry";
/**
 * An order being given to the selected unit, as in a match, in the In-game view only:
 * Rotate (R) turns it toward the next click; Patrol (Y) takes clicks, a click on an
 * earlier point closes a loop, and right-click or Enter sets the route.
 */
/** Order being given in the In-game view: a unit's Rotate or Patrol, or a spotlight's aim ("spot") or sweep. */
let unitMode: null | "rotate" | "patrol" | "spot" = null;
const patrolDraft: { points: { x: number; y: number }[]; loop: boolean } = { points: [], loop: false };
/** Tool sections folded shut, by title. Kept across visits. */
const collapsed = loadCollapsed();
/**
 * A sandbag, wall, or road line being drawn, as in a match: the press sets its start, each
 * click pins a corner, Enter lays it. World points on fine-tile centres.
 */
const line: { points: Pt[]; press: Pt | null } = { points: [], press: null };
/** Trackpad wheel travel toward the next 15° notch. */
let wheelCarry = 0;
const view = { zoom: 0, px: 0, py: 0 };
/** The stage draws the map as a match does, and picks on its raised ground. */
let gameView = store()?.getItem(GAME_VIEW_STORE) === "1";
/** In-game view drawn at full dark. Only shown, and only applied, with the In-game view. */
let nightView = store()?.getItem(NIGHT_VIEW_STORE) === "1";
/** The Night time checkbox, hidden while the plan view is up. */
let nightToggle: HTMLElement | null = null;
const isoCam: IsoCam = { zoom: 0, camX: 0, camY: 0 };
let hover: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
/** The pointer is over the stage canvas (or captured by it mid-stroke). */
let pointerOver = false;
let stage: Stage | null = null;
let ground: HTMLCanvasElement | null = null;
/** Pixels behind `ground`, kept so a stroke rewrites only the tiles it touched. */
let groundPx: ImageData | null = null;
/** Tiles brushed since the last frame. */
let pendingGround: M.Dirty = M.emptyDirty();
let drawQueued = false;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
/** The cached preview bake no longer matches the sheet. */
let previewStale = true;
let keysBound = false;
let ctxRef: Ctx | null = null;
/** Screen px/s the arrow keys pan the stage, the same on-screen speed as a match. */
const KEY_PAN_SPEED = 546;
/** Arrow keys held down. */
const panKeys = new Set<string>();
let panRaf = 0;
let panLastT = 0;

// --- storage -----------------------------------------------------------------

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** This browser's private map key. Only it can overwrite or delete the maps it saved. */
export function mapKey(): string {
  const st = store();
  const have = st?.getItem(KEY_STORE);
  if (have && have.length >= 16) return have;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const key = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  st?.setItem(KEY_STORE, key);
  return key;
}

function myMaps(): Set<string> {
  try {
    const raw = JSON.parse(store()?.getItem(MINE_STORE) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function claimMap(id: string): void {
  const mine = myMaps();
  mine.add(id);
  store()?.setItem(MINE_STORE, JSON.stringify([...mine]));
}

// --- sheet bookkeeping -------------------------------------------------------

function say(text: string, tone: "" | "bad" | "good" = ""): void {
  msg = { text, tone };
  if (stage) {
    stage.msg.textContent = text;
    stage.msg.className = `bld-msg ${tone}`;
    stage.msg.hidden = !text;
  }
}

/** Undo steps kept: the full depth up to Huge, fewer on bigger sheets so the history stays a few tens of MB. */
function undoDepth(s: M.Sheet): number {
  return Math.max(10, Math.min(UNDO_DEPTH, Math.floor((UNDO_DEPTH * 512 * 512) / (s.width * s.height))));
}

function pushUndo(): void {
  if (!sheet) return;
  undo.push(M.markSheet(sheet));
  while (undo.length > undoDepth(sheet)) undo.shift();
  redo.length = 0;
}

function changed(): void {
  dirty = true;
  edits++;
  previewStale = true;
  if (sheet) heightsChanged(sheet.heights);
  isoChanged();
  pendingGround = M.emptyDirty();
  repaintGround();
  queueDraw();
  schedulePreview();
  paintChecks();
}

function openSheet(next: M.Sheet, isDirty: boolean): void {
  sheet = next;
  dirty = isDirty;
  undo.length = 0;
  redo.length = 0;
  newOpen = false;
  selected = null;
  view.zoom = 0;
  isoCam.zoom = 0;
  isoChanged();
  ground = null;
  previewStale = true;
}

function step(from: M.SheetMark[], to: M.SheetMark[]): void {
  if (!sheet) return;
  const mark = from.pop();
  if (!mark) return;
  to.push(M.markSheet(sheet));
  M.restoreSheet(sheet, mark);
  selected = null;
  changed();
  if (ctxRef) mountOrRefresh(ctxRef);
}

// --- top-down ground image -----------------------------------------------------

function mix(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
}

const GRASS_LO = [44, 58, 32];
const GRASS_HI = [160, 166, 104];
const ROCK_LO = [70, 66, 60];
const ROCK_HI = [168, 160, 148];

/** Plan colour of open ground by its painted surface, lightened with height `u`. */
function coverColor(cover: number, u: number, x: number, y: number): [number, number, number] {
  switch (cover) {
    case GROUND_DIRT:
      return mix([84, 66, 44], [150, 124, 88], u);
    case GROUND_SAND:
      return mix([130, 116, 84], [214, 198, 150], u);
    case GROUND_TALL_GRASS:
      return (x * 5 + y * 3) % 3 === 0 ? mix([70, 84, 38], [180, 186, 110], u) : mix([52, 68, 30], [150, 160, 90], u);
    case GROUND_STONES:
      return (x * 7 + y * 11) % 4 === 0 ? mix([120, 114, 104], [200, 192, 180], u) : mix([78, 66, 50], [140, 126, 100], u);
    case GROUND_SWAMP:
      return (x + y * 3) % 5 === 0 ? [36, 56, 54] : mix([38, 50, 30], [90, 104, 62], u);
    default:
      return mix(GRASS_LO, GRASS_HI, u);
  }
}

function tileColor(s: M.Sheet, x: number, y: number): [number, number, number] {
  const i = y * s.width + x;
  const t = s.tiles[i]!;
  const h = s.heights[i]!;
  const u = h / HEIGHT_MAX;
  let c: [number, number, number];
  switch (t) {
    case TILE_WATER:
      return (x + y) % 7 === 0 ? [40, 92, 112] : [29, 74, 92];
    case TILE_ROAD:
      c = mix([110, 88, 52], [176, 150, 100], u);
      break;
    case TILE_SCRAP:
      c = (x * 7 + y * 13) % 5 === 0 ? [176, 132, 62] : mix([92, 64, 30], [150, 108, 50], u);
      break;
    case TILE_DIAMOND_SCRAP:
      c = (x * 7 + y * 13) % 5 === 0 ? [196, 236, 248] : mix([92, 64, 30], [150, 108, 50], u);
      break;
    case TILE_TREE:
      c = (x * 3 + y * 5) % 4 === 0 ? [20, 44, 24] : mix([30, 60, 32], [54, 92, 50], u);
      break;
    case TILE_FENCE:
      c = [128, 98, 58];
      break;
    case TILE_ROCK:
      c = mix(ROCK_LO, ROCK_HI, u);
      break;
    case TILE_MOUNTAIN:
      c = mix([112, 108, 86], [196, 186, 154], u);
      break;
    default:
      c = coverColor(s.ground[i] ?? GROUND_GRASS, u, x, y);
  }
  if (t !== TILE_MOUNTAIN && t !== TILE_WATER && isMountainCliff(s.tiles, s.heights, s.width, s.height, x, y)) {
    c = mix(ROCK_LO, ROCK_HI, u);
  }
  // Light from the north-west, and a contour every terrace.
  const nw = x > 0 && y > 0 ? s.heights[i - s.width - 1]! : h;
  const shade = Math.max(-2, Math.min(2, h - nw)) * 0.09;
  let f = 1 + shade;
  const east = x + 1 < s.width ? s.heights[i + 1]! : h;
  const south = y + 1 < s.height ? s.heights[i + s.width]! : h;
  if (h % TILE_SUBDIV === 0 && (east < h || south < h)) f *= 0.8;
  return [c[0] * f, c[1] * f, c[2] * f];
}

/**
 * Recolour the plan image. With `box`, only those tiles (plus the one-tile
 * rim their shading reads) are redone, so a brush stroke on a big sheet
 * costs the brush, not the map.
 */
function repaintGround(box?: M.Dirty): void {
  const s = sheet;
  if (!s) return;
  if (!ground || ground.width !== s.width || ground.height !== s.height || !groundPx) {
    ground = document.createElement("canvas");
    ground.width = s.width;
    ground.height = s.height;
    groundPx = null;
    box = undefined;
  }
  const g = ground.getContext("2d");
  if (!g) return;
  groundPx ??= g.createImageData(s.width, s.height);
  const x0 = box ? Math.max(0, box.x0 - 1) : 0;
  const y0 = box ? Math.max(0, box.y0 - 1) : 0;
  const x1 = box ? Math.min(s.width, box.x1 + 1) : s.width;
  const y1 = box ? Math.min(s.height, box.y1 + 1) : s.height;
  if (x1 <= x0 || y1 <= y0) return;
  const d = groundPx.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const [r, gg, b] = tileColor(s, x, y);
      const k = (y * s.width + x) * 4;
      d[k] = r;
      d[k + 1] = gg;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  }
  g.putImageData(groundPx, 0, 0, x0, y0, x1 - x0, y1 - y0);
}

/** Note brush damage; the next frame repaints it once, however many pointer moves fed it. */
function markGround(box: M.Dirty): void {
  if (box.x1 <= box.x0) return;
  pendingGround.x0 = Math.min(pendingGround.x0, box.x0);
  pendingGround.y0 = Math.min(pendingGround.y0, box.y0);
  pendingGround.x1 = Math.max(pendingGround.x1, box.x1);
  pendingGround.y1 = Math.max(pendingGround.y1, box.y1);
  queueDraw();
}

function flushGround(): void {
  if (pendingGround.x1 <= pendingGround.x0) return;
  const box = pendingGround;
  pendingGround = M.emptyDirty();
  repaintGround(box);
  if (sheet && gameView) {
    if (tool.id === "raise" || tool.id === "lower" || tool.id === "level" || tool.id === "mountain" || tool.id === "ground") {
      heightsChanged(sheet.heights);
    }
    isoRestamp(sheet, box);
  }
}

// --- stage drawing -------------------------------------------------------------

/** Fill and edge on the plan: houses in brick, concrete defences in grey, sandbags in burlap, wire in steel. */
function featureColors(type: MapFeatureType): [string, string] {
  if (isCivilianType(type)) return ["#c9a27a", "#2a1810"];
  if (type === "sandbags") return ["#b9a06a", "#3a2c14"];
  if (type === "barbwire") return ["#7f8a86", "#1c2220"];
  if (type === "teeth") return ["#b4b2a8", "#2a2924"];
  if (type === "bridge") return ["#8b6b45", "#2f2114"];
  if (type === "bigbridge") return ["#a8a49a", "#3a3833"];
  return ["#9c9a90", "#1d1c18"];
}

function fitView(canvas: HTMLCanvasElement, s: M.Sheet): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  view.zoom = Math.max(0.5, Math.min(w / s.width, h / s.height) * 0.94);
  view.px = (w - s.width * view.zoom) / 2;
  view.py = (h - s.height * view.zoom) / 2;
}

function queueDraw(): void {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    drawStage();
  });
}

/** The building or defence the placing tools would set down. */
function placingType(): MapFeatureType | null {
  if (tool.id === "house") return tool.house;
  if (tool.id === "defence") return tool.defence;
  return null;
}

/** A defence, the Road, or a Bridge is armed: the wheel turns it. */
function turningTool(): boolean {
  return tool.id === "defence" || tool.id === "road" || tool.id === "bridge" || tool.id === "unit";
}

/** The armed tool draws a line: sandbags, barbwire, teeth, a wall, a road, or a bridge. */
function lineTool(): boolean {
  return tool.id === "road" || tool.id === "bridge" || (tool.id === "defence" && isMapSection(tool.defence));
}

function linePending(): boolean {
  return lineTool() && (line.points.length > 0 || line.press !== null);
}

function dropLine(): void {
  line.points = [];
  line.press = null;
}

/** Degrees a 15° turn reads as: 0 east, 90 south. */
function turnDegrees(turn: number): number {
  return M.wrapTurn(turn) * Math.round((BUILDING_TURN_STEP * 180) / Math.PI);
}

function houseGhost(): MapFeature | null {
  const type = placingType();
  if (!sheet || !type || !hover.inside || lineTool()) return null;
  return M.houseAt(type, hover.x, hover.y, tool.facing, tool.turn);
}

/** The sections or bridge bricks the drawn line would lay, its live leg running to the cursor. */
function lineGhost(): MapFeature[] {
  const bridge = tool.id === "bridge";
  if (!bridge && (tool.id !== "defence" || !isMapSection(tool.defence))) return [];
  if (!hover.inside && line.points.length === 0 && !line.press) return [];
  const pts = fieldPointsWithCursor(line.points, line.press, M.tileWorld(hover.x, hover.y));
  if (bridge) return M.bridgeLine(tool.bridge, pts, tool.turn, M.deckAt(sheet!, pts[0]!));
  return M.sectionLine(tool.defence as MapSectionType, pts, tool.turn);
}

/** The centreline the drawn road would lay, its live leg running to the cursor. */
function roadGhost(): Pt[] {
  if (tool.id !== "road") return [];
  if (!hover.inside && line.points.length === 0 && !line.press) return [];
  return M.roadLegs(fieldPointsWithCursor(line.points, line.press, M.tileWorld(hover.x, hover.y)), tool.turn);
}

function selectedFeature(): MapFeature | null {
  if (!sheet || selected?.kind !== "feature") return null;
  return sheet.features[selected.index] ?? null;
}

function drawStage(): void {
  const s = sheet;
  if (!stage || !s) return;
  const canvas = stage.canvas;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  if (view.zoom === 0) fitView(canvas, s);
  if (!ground) repaintGround();
  else flushGround();
  const c = canvas.getContext("2d");
  if (!c || !ground) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = "#070605";
  c.fillRect(0, 0, w, h);
  if (gameView) return drawGameView(c, s, w, h, dpr);
  const z = view.zoom;
  const sx = (x: number): number => view.px + x * z;
  const sy = (y: number): number => view.py + y * z;
  c.imageSmoothingEnabled = false;
  c.drawImage(ground, view.px, view.py, s.width * z, s.height * z);
  c.strokeStyle = "#8b2e1f";
  c.lineWidth = 2;
  c.strokeRect(view.px - 1, view.py - 1, s.width * z + 2, s.height * z + 2);

  if (z * TILE_SUBDIV >= 10) {
    c.strokeStyle = "rgba(0,0,0,0.16)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= s.width; x += TILE_SUBDIV) {
      c.moveTo(Math.round(sx(x)) + 0.5, sy(0));
      c.lineTo(Math.round(sx(x)) + 0.5, sy(s.height));
    }
    for (let y = 0; y <= s.height; y += TILE_SUBDIV) {
      c.moveTo(sx(0), Math.round(sy(y)) + 0.5);
      c.lineTo(sx(s.width), Math.round(sy(y)) + 0.5);
    }
    c.stroke();
  }

  const drawHouse = (f: MapFeature, fill: string, edge: string): void => {
    // The real ground: a turned bunker, tower, or slanted section is drawn turned.
    const r = featureRect(f);
    const corner = (a: number, b: number): [number, number] => [
      sx(r.cx + a * r.halfU * r.ux + b * r.halfV * r.vx),
      sy(r.cy + a * r.halfU * r.uy + b * r.halfV * r.vy),
    ];
    c.beginPath();
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) c.lineTo(...corner(a, b));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = 1.5;
    c.stroke();
    const bw = r.halfU * 2 * z;
    const bh = r.halfV * 2 * z;
    if (isMapBridge(f.type)) {
      // Planks or slab joints across the deck, so the two read apart.
      c.strokeStyle = edge;
      c.lineWidth = 0.75;
      const gap = f.type === "bridge" ? 0.5 : 1;
      c.beginPath();
      for (let a = -1 + gap / r.halfU; a < 1; a += gap / r.halfU) {
        c.moveTo(...corner(a, -1));
        c.lineTo(...corner(a, 1));
      }
      c.stroke();
      return;
    }
    // Door or front side.
    const mx = sx(r.cx);
    const my = sy(r.cy);
    const reach = Math.min(bw, bh) * 0.42;
    const a = featureAngle(f);
    c.fillStyle = edge;
    c.beginPath();
    c.arc(mx + Math.cos(a) * reach, my + Math.sin(a) * reach, Math.max(1.5, z * 0.9), 0, Math.PI * 2);
    c.fill();
    if (bw > 26 && bh > 26) {
      c.font = `600 ${Math.min(13, Math.max(9, bw / 5))}px Oswald, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#1a120c";
      c.fillText(catalog(f.type).name.toUpperCase(), mx, my);
    }
  };
  const frame = (f: MapFeature, color: string): void => {
    const b = featureBox(f);
    c.setLineDash([4, 3]);
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.strokeRect(sx(b.x0) - 3, sy(b.y0) - 3, (b.x1 - b.x0) * z + 6, (b.y1 - b.y0) * z + 6);
    c.setLineDash([]);
  };
  for (const f of s.features) drawHouse(f, ...featureColors(f.type));
  const lampMark = (x: number, y: number, type: LampType, ring: string | null): void => {
    const cx = sx(x + 0.5);
    const cy = sy(y + 0.5);
    const rgb = STREET_LAMPS[type].rgb;
    const reach = STREET_LAMPS[type].reachTiles * z;
    const glow = c.createRadialGradient(cx, cy, 0, cx, cy, reach);
    glow.addColorStop(0, `rgba(${rgb}, 0.32)`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    c.fillStyle = glow;
    c.beginPath();
    c.arc(cx, cy, reach, 0, Math.PI * 2);
    c.fill();
    const r = Math.max(2.5, Math.min(6, z * 0.9));
    c.fillStyle = `rgb(${rgb})`;
    c.strokeStyle = ring ?? "#1d1c18";
    c.lineWidth = ring ? 2 : 1.25;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  };
  for (const l of M.liveLamps(s)) lampMark(l.x, l.y, l.type, null);
  const clutterMark = (x: number, y: number, ring: string | null): void => {
    const r = Math.max(1.5, Math.min(4, z * 0.6));
    c.fillStyle = "#b08850";
    c.strokeStyle = ring ?? "#2a2016";
    c.lineWidth = ring ? 2 : 1;
    c.fillRect(sx(x + 0.5) - r, sy(y + 0.5) - r, r * 2, r * 2);
    c.strokeRect(sx(x + 0.5) - r, sy(y + 0.5) - r, r * 2, r * 2);
  };
  for (const p of M.liveClutter(s)) clutterMark(p.x, p.y, null);
  if (tool.id === "clutter" && hover.inside && !drag) {
    clutterMark(hover.x, hover.y, M.clutterProblem(s, hover.x, hover.y) !== null ? "#ff5a4a" : "#7dff6a");
  }
  if (tool.id === "lamp" && hover.inside && !drag) {
    const bad = M.lampProblem(s, hover.x, hover.y) !== null;
    lampMark(hover.x, hover.y, tool.lamp, bad ? "#ff5a4a" : "#7dff6a");
  }
  drawPlanUnits(c, s, sx, sy, z);
  const picked = selectedFeature();
  if (picked) frame(picked, "#e8b84a");
  if (tool.id === "select" && hover.inside && !drag) {
    const fi = M.featureIndexAt(s, hover.x, hover.y);
    const f = fi >= 0 ? s.features[fi] : undefined;
    if (f && f !== picked) frame(f, "rgba(255,244,220,0.7)");
  }

  const r = Math.max(8, Math.min(16, z * 3));
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (const sp of s.spawns) {
    const x = sx(sp.x + 0.5);
    const y = sy(sp.y + 0.5);
    c.setLineDash([5, 4]);
    c.strokeStyle = "rgba(232,184,74,0.7)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x, y, SPAWN_PAD_R * z, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "#140e0a";
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#e8b84a";
    c.lineWidth = 2.5;
    c.stroke();
    if (selected?.kind === "spawn" && selected.id === sp.id) {
      c.setLineDash([4, 3]);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, r + 5, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    c.fillStyle = "#e8b84a";
    c.font = `700 ${Math.round(r * 1.2)}px "Share Tech Mono", monospace`;
    c.fillText(String(sp.id), x, y + 1);
  }

  if (hover.inside) {
    const ghost = houseGhost();
    if (ghost) {
      const bad = M.houseProblem(s, ghost) !== null;
      drawHouse(ghost, bad ? "rgba(255,90,74,0.45)" : "rgba(125,255,106,0.4)", bad ? "#ff5a4a" : "#7dff6a");
    } else if (tool.id === "spawn") {
      const moving = drag?.kind === "spawn";
      const next = M.nextSpawnId(s);
      if (!moving && next !== null && M.spawnIndexAt(s, hover.x, hover.y) < 0) {
        const bad = M.spawnProblem(s, hover.x, hover.y) !== null;
        c.setLineDash([5, 4]);
        c.strokeStyle = bad ? "#ff5a4a" : "#7dff6a";
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(sx(hover.x + 0.5), sy(hover.y + 0.5), SPAWN_PAD_R * z, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }
  const pieces = lineGhost();
  const road = roadGhost();
  for (const quad of M.roadQuads(road, tool.roadWidth)) {
    c.beginPath();
    for (const p of quad) c.lineTo(sx(p.x / TILE_SIZE), sy(p.y / TILE_SIZE));
    c.closePath();
    c.fillStyle = "rgba(196,160,104,0.5)";
    c.fill();
    c.strokeStyle = "#7dff6a";
    c.lineWidth = 1.5;
    c.stroke();
  }
  if (pieces.length > 0 || road.length > 0) {
    for (const f of pieces) {
      const bad = M.houseProblem(s, f) !== null;
      drawHouse(f, bad ? "rgba(255,90,74,0.45)" : "rgba(125,255,106,0.45)", bad ? "#ff5a4a" : "#7dff6a");
    }
    // The start of the line, as the match marks it.
    const start = line.points[0] ?? line.press;
    if (start) {
      const x = sx(start.x / TILE_SIZE);
      const y = sy(start.y / TILE_SIZE);
      c.strokeStyle = "#e8b84a";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x, y - 6);
      c.lineTo(x + 6, y);
      c.lineTo(x, y + 6);
      c.lineTo(x - 6, y);
      c.closePath();
      c.stroke();
    }
  }
  if (pointerOver && hover.inside && turningTool()) drawTurnHint(c, sx(hover.x + 0.5), sy(hover.y + 0.5), pieces.length, road);
  if (pointerOver && isBrush(tool.id) && brushReaches(hover.x, hover.y)) {
    c.strokeStyle = "#fff4dc";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(sx(hover.x + 0.5), sy(hover.y + 0.5), Math.max(2, (tool.brush + 0.5) * z), 0, Math.PI * 2);
    c.stroke();
  }
}

/** Units on the plan: grey discs with a heading tick, routes dashed, a count on each held building. */
function drawPlanUnits(c: CanvasRenderingContext2D, s: M.Sheet, sx: (x: number) => number, sy: (y: number) => number, z: number): void {
  const routes = unitRoutes(s);
  c.strokeStyle = "#e8b84a";
  for (const rt of routes) {
    const pts = [rt.from, ...rt.points];
    if (rt.cursor) pts.push(rt.cursor);
    else if (rt.loop && rt.points.length > 1) pts.push(rt.points[0]!);
    c.globalAlpha = rt.strong ? 1 : 0.45;
    c.lineWidth = rt.strong ? 1.8 : 1.2;
    c.setLineDash([5, 4]);
    c.beginPath();
    pts.forEach((p, i) => (i === 0 ? c.moveTo(sx(p.x + 0.5), sy(p.y + 0.5)) : c.lineTo(sx(p.x + 0.5), sy(p.y + 0.5))));
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "#e8b84a";
    for (const p of rt.points) {
      c.beginPath();
      c.arc(sx(p.x + 0.5), sy(p.y + 0.5), 2.5, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.globalAlpha = 1;
  const disc = (u: { type: TrainType; x: number; y: number; facing: number }, ring: string | null, alpha = 1): void => {
    const cx = sx(u.x + 0.5);
    const cy = sy(u.y + 0.5);
    const r = Math.max(3, Math.min(9, (catalog(u.type).radius / TILE_SIZE) * z));
    const a = (u.facing * Math.PI) / 180;
    c.globalAlpha = alpha;
    c.fillStyle = "#8c8c88";
    c.strokeStyle = ring ?? "#1d1c18";
    c.lineWidth = ring ? 2 : 1.25;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = "#1d1c18";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3));
    c.stroke();
    c.globalAlpha = 1;
  };
  const sel = selected?.kind === "unit" ? selected.index : -1;
  const hov = tool.id === "select" && hover.inside && !drag ? standingUnitAt(s, hover.x, hover.y) : -1;
  s.units.forEach((u, i) => {
    if (u.inside) return;
    disc(u, i === sel ? "#e8b84a" : i === hov ? "rgba(255,244,220,0.8)" : null);
  });
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "700 11px 'Share Tech Mono', monospace";
  for (const [fi, g] of garrisonCounts(s)) {
    const f = s.features[fi];
    if (!f) continue;
    const rc = featureRect(f);
    const label = `${g.count}/${g.cap}`;
    const w = c.measureText(label).width + 8;
    c.fillStyle = "rgba(20,14,10,0.88)";
    c.fillRect(sx(rc.cx) - w / 2, sy(rc.cy) - 8, w, 16);
    c.fillStyle = "#e8dcc4";
    c.fillText(label, sx(rc.cx), sy(rc.cy) + 0.5);
  }
  const g = unitGhost(s);
  if (g) disc(g, g.bad ? "#ff5a4a" : "#7dff6a", 0.7);
}

/** Men inside each building, by feature index. */
function garrisonCounts(s: M.Sheet): Map<number, { count: number; cap: number }> {
  const out = new Map<number, { count: number; cap: number }>();
  s.features.forEach((f, i) => {
    const n = M.unitsInside(s, i).length;
    if (n > 0) out.set(i, { count: n, cap: garrisonCapOf(f.type) });
  });
  return out;
}

/** Patrol routes to draw: every unit's own and every tower's sweep, and the one being drawn for the selection. */
function unitRoutes(s: M.Sheet): RouteDraw[] {
  const sel = selected?.kind === "unit" ? selected.index : -1;
  const selTower = selected?.kind === "feature" ? selected.index : -1;
  const out: RouteDraw[] = [];
  s.features.forEach((f, i) => {
    if (f.type !== "tower") return;
    const from = towerTile(f);
    if (i === selTower && unitMode === "patrol") {
      out.push({
        from,
        points: patrolDraft.points,
        loop: patrolDraft.loop,
        cursor: !patrolDraft.loop && hover.inside ? { x: hover.x, y: hover.y } : null,
        strong: true,
      });
      return;
    }
    if (f.patrol?.length) out.push({ from, points: f.patrol, loop: !!f.loop, strong: i === selTower });
  });
  s.units.forEach((u, i) => {
    if (u.inside) return;
    if (i === sel && unitMode === "patrol") {
      out.push({
        from: u,
        points: patrolDraft.points,
        loop: patrolDraft.loop,
        cursor: !patrolDraft.loop && hover.inside ? { x: hover.x, y: hover.y } : null,
        strong: true,
      });
      return;
    }
    if (u.patrol?.length) out.push({ from: u, points: u.patrol, loop: !!u.loop, strong: i === sel });
  });
  return out;
}

/** The unit the Units tool would set down under the cursor; inside a building it shows nothing. */
function unitGhost(s: M.Sheet): (MapUnit & { bad: boolean }) | null {
  if (tool.id !== "unit" || !hover.inside || drag) return null;
  if (isInfantryType(tool.unit) && M.garrisonHostAt(s, tool.unit, hover.x, hover.y) >= 0) return null;
  const facing = turnDegrees(tool.turn);
  return { type: tool.unit, x: hover.x, y: hover.y, facing, bad: M.unitProblem(s, tool.unit, hover.x, hover.y) !== null };
}

/** The rotate and line hint beside the cursor, at screen point (ax, ay). */
function drawTurnHint(c: CanvasRenderingContext2D, ax: number, ay: number, sections: number, road: readonly Pt[]): void {
  const lines = [`Scroll to rotate · ${turnDegrees(tool.turn)}°`];
  if (tool.id === "road") {
    let len = 0;
    for (let i = 1; i < road.length; i++) len += Math.hypot(road[i]!.x - road[i - 1]!.x, road[i]!.y - road[i - 1]!.y);
    const cells = Math.round((len / TILE_SIZE / TILE_SUBDIV) * 2) / 2;
    if (line.points.length > 0) lines.push(`${cells} cells of road · Enter lays it · click adds a leg · right-click takes one back`);
    else lines.push("Click to start a road · Enter lays one stub");
  } else if (tool.id === "bridge") {
    if (line.points.length > 0) lines.push(`${sections} brick${sections === 1 ? "" : "s"} · Enter lays the bridge · click adds a leg · right-click takes one back`);
    else lines.push("Click on one shore to start · Enter lays one brick");
  } else if (line.points.length > 0) lines.push(`${sections} section${sections === 1 ? "" : "s"} · Enter places · click adds a leg · right-click takes one back`);
  else if (lineTool()) lines.push("Click to start a line · Enter places one section");
  c.font = "11px 'Share Tech Mono', monospace";
  c.textAlign = "left";
  c.textBaseline = "middle";
  const w = Math.max(...lines.map((t) => c.measureText(t).width)) + 14;
  const h = lines.length * 16 + 6;
  let x = ax + 18;
  let y = ay + 22;
  if (x + w > c.canvas.clientWidth - 4) x -= w + 36;
  if (y + h > c.canvas.clientHeight - 4) y -= h + 44;
  c.fillStyle = "rgba(20, 14, 10, 0.86)";
  c.strokeStyle = "#e8b84a";
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(x + 0.5, y + 0.5, w, h, 4);
  c.fill();
  c.stroke();
  lines.forEach((t, i) => {
    c.fillStyle = i === 0 ? "#e8b84a" : "#e8dcc4";
    c.fillText(t, x + 7, y + 11 + i * 16);
  });
}

/** The stage as the battlefield draws it: same ground bake, props, and building art. */
function drawGameView(c: CanvasRenderingContext2D, s: M.Sheet, w: number, h: number, dpr: number): void {
  if (isoCam.zoom === 0) isoFit(isoCam, s, w, h);
  const ghost = hover.inside ? houseGhost() : null;
  const pieces = lineGhost();
  const road = roadGhost();
  const ghosts = (ghost ? [ghost] : pieces).map((f) => ({ f, bad: M.houseProblem(s, f) !== null }));
  let spawnGhost: { x: number; y: number; bad: boolean } | null = null;
  if (hover.inside && tool.id === "spawn" && drag?.kind !== "spawn" && M.nextSpawnId(s) !== null && M.spawnIndexAt(s, hover.x, hover.y) < 0) {
    spawnGhost = { x: hover.x, y: hover.y, bad: M.spawnProblem(s, hover.x, hover.y) !== null };
  }
  const loading = isoDraw(c, s, isoCam, w, h, dpr, {
    selectedFeature: selected?.kind === "feature" ? selected.index : -1,
    hoverFeature:
      tool.id === "select" && hover.inside && !drag
        ? M.featureIndexAt(s, hover.x, hover.y)
        : tool.id === "unit" && hover.inside && isInfantryType(tool.unit)
          ? M.garrisonHostAt(s, tool.unit, hover.x, hover.y)
          : -1,
    selectedSpawn: selected?.kind === "spawn" ? selected.id : 0,
    ghosts,
    lineStart: pieces.length > 0 || road.length > 0 ? (line.points[0] ?? line.press) : null,
    road: M.roadQuads(road, tool.roadWidth),
    spawnGhost,
    brush: pointerOver && isBrush(tool.id) && brushReaches(hover.x, hover.y) ? { x: hover.x, y: hover.y, r: tool.brush } : null,
    units: unitOverlay(s),
    lampGhost:
      tool.id === "lamp" && hover.inside && !drag
        ? { x: hover.x, y: hover.y, type: tool.lamp, bad: M.lampProblem(s, hover.x, hover.y) !== null }
        : null,
    clutterGhost:
      tool.id === "clutter" && hover.inside && !drag
        ? { x: hover.x, y: hover.y, type: tool.clutter, bad: M.clutterProblem(s, hover.x, hover.y) !== null }
        : null,
    night: nightView,
  }, queueDraw);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (pointerOver && hover.inside && turningTool()) {
    const p = isoScreenOf(s, isoCam, hover.x, hover.y);
    drawTurnHint(c, p.x, p.y, pieces.length, road);
  }
  // Sprites still loading: look again shortly.
  if (loading) setTimeout(queueDraw, 200);
}

function unitOverlay(s: M.Sheet): UnitOverlay {
  const g = unitGhost(s);
  return {
    list: s.units,
    selected: selected?.kind === "unit" ? selected.index : -1,
    hover: tool.id === "select" && hover.inside && !drag ? standingUnitAt(s, hover.x, hover.y) : -1,
    ghost: g,
    routes: unitRoutes(s),
    garrisons: garrisonCounts(s),
    aim: unitMode === "rotate" && hover.inside ? { x: hover.x, y: hover.y } : null,
    beams: spotBeams(),
  };
}

/** Fine tile a Watch Tower's lamp stands over: the middle of its lot. */
function towerTile(f: MapFeature): { x: number; y: number } {
  const r = featureRect(f);
  return { x: Math.floor(r.cx), y: Math.floor(r.cy) };
}

/** Heading in degrees from a tile toward another, or `fallback` when the cursor is on the lamp itself. */
function spotToward(from: { x: number; y: number }, x: number, y: number, fallback: number): number {
  return from.x === x && from.y === y ? fallback : M.degreesToward(from.x, from.y, x, y);
}

/** The lamp's heading in degrees as the match will light it: where the map points it, else the way the tower faces. */
function towerSpot(f: MapFeature): number {
  return f.spot ?? ((Math.round((featureAngle(f) * 180) / Math.PI) % 360) + 360) % 360;
}

/** Beams to outline: the selected tower's or Battle Ship's, swung toward the cursor while it is being aimed. */
function spotBeams(): SpotBeam[] {
  const out: SpotBeam[] = [];
  const aiming = unitMode === "spot" && hover.inside;
  const f = selectedTower();
  if (f) {
    const deg = aiming ? spotToward(towerTile(f), hover.x, hover.y, towerSpot(f)) : towerSpot(f);
    const r = featureRect(f);
    out.push({ x: r.cx * TILE_SIZE, y: r.cy * TILE_SIZE, facing: (deg * Math.PI) / 180, strong: true });
  }
  const u = selectedUnit();
  if (u && hasSpotlight(u.type)) {
    const deg = aiming ? spotToward(u, hover.x, hover.y, u.spot ?? u.facing) : (u.spot ?? u.facing);
    out.push({ x: (u.x + 0.5) * TILE_SIZE, y: (u.y + 0.5) * TILE_SIZE, facing: (deg * Math.PI) / 180, strong: true });
  }
  return out;
}

/** The stage's view checkboxes: In-game view, and Night time beside it while the In-game view is up. */
function viewToggles(): HTMLElement {
  const row = el("div", { class: "bld-view-toggles" });
  const night = el("label", {
    class: "bld-toggle",
    attrs: { title: "Draw the In-game view at full dark: street lamps burning, tower spotlights on." },
  });
  const box = el("input", { attrs: { type: "checkbox" } });
  box.checked = nightView;
  box.addEventListener("change", () => setNightView(box.checked));
  night.append(box, el("span", { text: "Night time" }));
  night.hidden = !gameView;
  nightToggle = night;
  row.append(night, gameViewToggle());
  return row;
}

function setNightView(on: boolean): void {
  nightView = on;
  try {
    store()?.setItem(NIGHT_VIEW_STORE, on ? "1" : "0");
  } catch {
    // Private window: the choice lasts this visit.
  }
  queueDraw();
}

/** The stage's "In-game view" checkbox. */
function gameViewToggle(): HTMLElement {
  const toggle = el("label", {
    class: "bld-toggle",
    attrs: { title: "See and edit the map as the battlefield draws it: real ground, trees, and buildings on raised terrain." },
  });
  const box = el("input", { attrs: { type: "checkbox" } });
  box.checked = gameView;
  box.addEventListener("change", () => setGameView(box.checked));
  toggle.append(box, el("span", { text: "In-game view" }));
  return toggle;
}

function setGameView(on: boolean): void {
  gameView = on;
  if (nightToggle) nightToggle.hidden = !on;
  // Unit orders and garrisons are given in the In-game view only.
  if (!on) unitMode = null;
  paintSelection();
  isoChanged();
  try {
    store()?.setItem(GAME_VIEW_STORE, on ? "1" : "0");
  } catch {
    // Private window: the choice lasts this visit.
  }
  if (stage) stage.status.textContent = statusHint();
  queueDraw();
}

function statusHint(): string {
  return gameView
    ? "In-game view · wheel zooms · arrows or right-drag pan · Ctrl+Z undoes · V or Esc selects"
    : "Wheel zooms · arrows or right-drag pan · Ctrl+Z undoes · V or Esc selects";
}

// --- painting --------------------------------------------------------------

type Drag =
  | { kind: "brush"; lastX: number; lastY: number; timer: ReturnType<typeof setInterval> | null }
  | { kind: "spawn"; id: number; moved: boolean }
  | { kind: "move"; index: number; from: MapFeature; startX: number; startY: number; moved: boolean }
  | { kind: "unit"; index: number; from: MapUnit; startX: number; startY: number; moved: boolean }
  /** A press on a sandbag or wall line: the release pins its start or its next corner. */
  | { kind: "line" }
  /** Right or middle drag. A right click that never moved takes back a line corner. */
  | { kind: "pan"; x: number; y: number; px: number; py: number; button: number; moved: boolean; camX: number; camY: number }
  | { kind: "erase" };

let drag: Drag | null = null;

function toTile(e: PointerEvent | WheelEvent): { x: number; y: number; inside: boolean } {
  const rect = stage!.canvas.getBoundingClientRect();
  if (gameView && sheet) return isoPick(sheet, isoCam, e.clientX - rect.left, e.clientY - rect.top);
  const x = Math.floor((e.clientX - rect.left - view.px) / view.zoom);
  const y = Math.floor((e.clientY - rect.top - view.py) / view.zoom);
  const inside = !!sheet && x >= 0 && y >= 0 && x < sheet.width && y < sheet.height;
  return { x, y, inside };
}

function isBrush(id: ToolId): boolean {
  return id === "ground" || id === "cover" || id === "raise" || id === "lower" || id === "level" || id === "mountain";
}

/** The brush ring at (x, y) reaches the sheet, even when its centre is past the edge. */
function brushReaches(x: number, y: number): boolean {
  return !!sheet && M.diskTouches(sheet, x, y, tool.brush);
}

function dab(x: number, y: number): void {
  const s = sheet;
  if (!s || !brushReaches(x, y)) return;
  const box = M.emptyDirty();
  if (tool.id === "ground") M.paintDisk(s, x, y, tool.brush, tool.tile, box);
  else if (tool.id === "cover") M.paintCover(s, x, y, tool.brush, tool.cover, box);
  else if (tool.id === "raise") M.liftDisk(s, x, y, tool.brush, 1, box);
  else if (tool.id === "lower") M.liftDisk(s, x, y, tool.brush, -1, box);
  else if (tool.id === "level") M.levelDisk(s, x, y, tool.brush, tool.level, box);
  else if (tool.id === "mountain") M.paintMountain(s, x, y, tool.brush, tool.mountain, box);
  markGround(box);
}

/** Dab along the straight run from (x0, y0) to (x1, y1), close enough that a fast stroke leaves no gaps. */
function dabLine(x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, tool.brush / 2)));
  for (let k = 1; k <= steps; k++) {
    dab(Math.round(x0 + ((x1 - x0) * k) / steps), Math.round(y0 + ((y1 - y0) * k) / steps));
  }
}

function eraseAt(x: number, y: number): boolean {
  const s = sheet;
  if (!s) return false;
  const ui = standingUnitAt(s, x, y);
  if (ui >= 0) {
    s.units.splice(ui, 1);
    selected = null;
    return true;
  }
  const li = M.lampIndexAt(s, x, y);
  if (li >= 0) {
    s.lamps.splice(li, 1);
    return true;
  }
  const ci = M.clutterIndexAt(s, x, y);
  if (ci >= 0) {
    s.clutter.splice(ci, 1);
    return true;
  }
  const fi = M.featureIndexAt(s, x, y);
  if (fi >= 0) {
    // The men inside go with the building.
    M.dropGarrison(s, s.features[fi]!);
    s.features.splice(fi, 1);
    selected = null;
    return true;
  }
  const si = M.spawnIndexAt(s, x, y);
  if (si >= 0) {
    s.spawns.splice(si, 1);
    selected = null;
    return true;
  }
  return false;
}

/** Remove whatever the Select tool holds. */
function deleteSelected(): void {
  const s = sheet;
  if (!s || !selected) return;
  pushUndo();
  if (selected.kind === "feature") {
    const f = s.features[selected.index];
    const men = f ? M.dropGarrison(s, f) : 0;
    s.features.splice(selected.index, 1);
    say(f ? `${catalog(f.type).name} removed${men ? ` with ${men} inside` : ""}.` : "");
  } else if (selected.kind === "unit") {
    const u = s.units[selected.index];
    s.units.splice(selected.index, 1);
    say(u ? `${catalog(u.type).name} removed.` : "");
  } else {
    const id = selected.id;
    s.spawns = s.spawns.filter((sp) => sp.id !== id);
    say(`Start ${id} removed.`);
  }
  selected = null;
  unitMode = null;
  finishStroke();
  paintSelection();
}

/** Give the selected building or defence a quarter turn; a defence `steps` 15° steps when given. */
function turnSelected(steps?: number): void {
  const s = sheet;
  if (!s || selected?.kind !== "feature") return;
  pushUndo();
  const before = { ...s.features[selected.index]! };
  const problem = M.turnFeature(s, selected.index, steps);
  if (problem) {
    undo.pop();
    say(`Cannot turn it here: ${problem.toLowerCase()}`, "bad");
    return;
  }
  M.reseatGarrison(s, before, s.features[selected.index]!);
  say("");
  finishStroke();
}

/** A unit standing on the field near the cursor (not one inside a building), or -1. */
function standingUnitAt(s: M.Sheet, x: number, y: number): number {
  const i = M.unitIndexAt(s, x, y);
  return i >= 0 && !s.units[i]!.inside ? i : -1;
}

function selectedUnit(): MapUnit | null {
  if (!sheet || selected?.kind !== "unit") return null;
  return sheet.units[selected.index] ?? null;
}

/** The selected Watch Tower, whose spotlight Rotate aims and Patrol sweeps. */
function selectedTower(): MapFeature | null {
  if (!sheet || selected?.kind !== "feature") return null;
  const f = sheet.features[selected.index];
  return f?.type === "tower" ? f : null;
}

/**
 * Stand the Units tool's unit on the tile, or, for infantry dropped on a house,
 * bunker, or tower in the In-game view, put him inside it.
 */
function placeUnitAt(x: number, y: number): void {
  const s = sheet;
  if (!s) return;
  const facing = turnDegrees(tool.turn);
  const host = isInfantryType(tool.unit) ? M.garrisonHostAt(s, tool.unit, x, y) : -1;
  pushUndo();
  let problem: string | null;
  if (host >= 0) {
    if (!gameView) {
      undo.pop();
      return say("Garrisoning is set in the In-game view: tick it, then drop the man on the building.", "bad");
    }
    problem = M.garrisonUnit(s, tool.unit, host, facing);
  } else {
    problem = M.placeUnit(s, tool.unit, x, y, facing);
  }
  if (problem) {
    undo.pop();
    return say(problem, "bad");
  }
  const f = host >= 0 ? s.features[host] : undefined;
  say(f ? `${catalog(tool.unit).name} garrisons the ${catalog(f.type).name}.` : "");
  finishStroke();
}

/**
 * Rotate (R) or Patrol (Y) for the selected unit, as the match gives those orders, or
 * for a Watch Tower's spotlight: Rotate aims it ("spot") and Patrol sets its sweep.
 * A Battle Ship's searchlight is aimed with "spot" too. In-game view only.
 */
function setUnitMode(mode: null | "rotate" | "patrol" | "spot"): void {
  const u = selectedUnit();
  const tower = selectedTower();
  if (mode && ((!u && !tower) || !gameView)) {
    if ((u || tower) && !gameView) say("Rotate and Patrol are given in the In-game view.", "bad");
    return;
  }
  if (mode === "rotate" && tower) mode = "spot";
  if (mode === "spot" && u && !hasSpotlight(u.type)) return;
  unitMode = unitMode === mode ? null : mode;
  patrolDraft.points = [];
  patrolDraft.loop = false;
  if (unitMode === "rotate") say("Click where it should face. Esc cancels.");
  else if (unitMode === "spot") say("Click where the spotlight should point. Esc cancels.");
  else if (unitMode === "patrol" && tower)
    say("Click the points the spotlight sweeps. Click an earlier point to close a loop. Right-click or Enter sets the sweep; Esc cancels.");
  else if (unitMode === "patrol")
    say("Click the patrol points. Click an earlier point to close a loop. Right-click or Enter sets the route; Esc cancels.");
  else say("");
  paintSelection();
  queueDraw();
}

/** Point the selected tower's or Battle Ship's spotlight at the clicked tile. */
function commitSpot(x: number, y: number): void {
  const tower = selectedTower();
  const u = selectedUnit();
  const ship = u && hasSpotlight(u.type) ? u : null;
  if (!sheet || (!tower && !ship)) return;
  pushUndo();
  const spot = tower ? spotToward(towerTile(tower), x, y, towerSpot(tower)) : spotToward(ship!, x, y, ship!.spot ?? ship!.facing);
  (tower ?? ship!).spot = spot;
  unitMode = null;
  say(`Spotlight points ${spot}°.`);
  finishStroke();
  paintSelection();
}

/** Turn the selected unit toward the clicked tile. */
function commitRotate(x: number, y: number): void {
  const s = sheet;
  const u = selectedUnit();
  if (!s || !u) return;
  pushUndo();
  u.facing = M.degreesToward(u.x, u.y, x, y);
  unitMode = null;
  say(`Faces ${u.facing}°.`);
  finishStroke();
  paintSelection();
}

/** A patrol click: a new point, or one on an earlier point that closes the loop. */
function addPatrolPoint(x: number, y: number): void {
  if (patrolDraft.loop) return;
  const pts = patrolDraft.points;
  // An earlier point (not the pen itself) under the click closes a ring.
  const hit = pts.findIndex((p, i) => i < pts.length - 1 && Math.hypot(p.x - x, p.y - y) <= 2);
  if (hit >= 0 && pts.length >= 2) {
    const ring = connectPatrolPoints(pts, hit);
    if (ring) {
      patrolDraft.points = ring;
      patrolDraft.loop = true;
      say("Loop closed. Right-click or Enter sets the route.");
    }
    queueDraw();
    return;
  }
  if (pts.length >= PATROL_POINTS_MAX) return say(`A patrol takes at most ${PATROL_POINTS_MAX} points.`, "bad");
  const prev = pts[pts.length - 1];
  if (prev && prev.x === x && prev.y === y) return;
  pts.push({ x, y });
  queueDraw();
}

/** Set the drawn route on the selected unit, or the sweep on the selected tower. No points clears it. */
function commitPatrol(): void {
  const s = sheet;
  const tower = selectedTower();
  const u = tower ?? selectedUnit();
  unitMode = null;
  if (!s || !u) return;
  pushUndo();
  if (patrolDraft.points.length === 0) {
    delete u.patrol;
    delete u.loop;
    say(tower ? "Sweep cleared: the spotlight holds its heading." : "Patrol cleared: it stands guard.");
  } else {
    u.patrol = patrolDraft.points.map((p) => ({ ...p }));
    if (patrolDraft.loop) u.loop = true;
    else delete u.loop;
    if (tower) say(patrolDraft.loop ? "Sweep set: the spotlight circles the points." : "Sweep set: the spotlight swings out and back.");
    else say(patrolDraft.loop ? "Patrol set: it circles the loop." : "Patrol set: it walks out and back.");
  }
  patrolDraft.points = [];
  patrolDraft.loop = false;
  finishStroke();
  paintSelection();
}

/** Walk the selected building's garrison out onto the ground beside it. */
function unloadSelected(): void {
  const s = sheet;
  if (!s || selected?.kind !== "feature") return;
  if (!gameView) return say("Unload works in the In-game view.", "bad");
  const inside = M.unitsInside(s, selected.index).length;
  if (inside === 0) return;
  pushUndo();
  const out = M.unloadGarrison(s, selected.index);
  if (out === 0) {
    undo.pop();
    return say("No room round the building to stand them.", "bad");
  }
  say(out < inside ? `${out} came out; ${inside - out} found no room and stay inside.` : `${out} came out.`);
  finishStroke();
  paintSelection();
}

/** Set down one building or defence from the placing tools. False when the spot is refused. */
function placeAt(x: number, y: number, quiet: boolean): boolean {
  const s = sheet;
  const type = placingType();
  if (!s || !type) return false;
  const f = M.houseAt(type, x, y, tool.facing, tool.turn);
  const problem = M.houseProblem(s, f);
  if (problem) {
    if (!quiet) say(problem, "bad");
    return false;
  }
  s.features.push(f);
  return true;
}

/** Lay the drawn road: every leg's lane turns to road, around houses and ponds. */
function commitRoad(): void {
  const s = sheet;
  if (!s || tool.id !== "road" || line.points.length === 0) return;
  const legs = M.roadLegs(line.points, tool.turn);
  dropLine();
  pushUndo();
  const box = M.emptyDirty();
  if (M.paintRoad(s, legs, tool.roadWidth, box) === 0) {
    undo.pop();
    say("Nothing laid: the road is already there, or only crosses houses and water.", "bad");
    queueDraw();
    return;
  }
  markGround(box);
  say("Road laid.");
  finishStroke();
}

/** Lay the drawn bridge brick by brick. Bricks on rock, woods, or another feature are left out. */
function commitBridge(): void {
  const s = sheet;
  if (!s || line.points.length === 0) return;
  const pieces = M.bridgeLine(tool.bridge, line.points, tool.turn, M.deckAt(s, line.points[0]!));
  dropLine();
  pushUndo();
  const { laid, refused } = M.laySections(s, pieces);
  if (laid === 0) {
    undo.pop();
    say(refused > 0 ? "Nothing laid: every brick is blocked." : "", refused > 0 ? "bad" : "");
    queueDraw();
    return;
  }
  const name = catalog(tool.bridge).name;
  say(refused > 0 ? `${name}: ${laid} brick(s) laid, ${refused} blocked.` : `${name}: ${laid} brick(s) laid.`);
  finishStroke();
}

/** Lay the drawn sandbag or wall line, the way Enter confirms one in a match. */
function commitLine(): void {
  const s = sheet;
  if (tool.id === "road") return commitRoad();
  if (tool.id === "bridge") return commitBridge();
  if (!s || !lineTool() || !isMapSection(tool.defence) || line.points.length === 0) return;
  const pieces = M.sectionLine(tool.defence, line.points, tool.turn);
  dropLine();
  pushUndo();
  const { laid, refused } = M.laySections(s, pieces);
  if (laid === 0) {
    undo.pop();
    say(refused > 0 ? "Nothing laid: every section is blocked." : "", refused > 0 ? "bad" : "");
    queueDraw();
    return;
  }
  const name = catalog(tool.defence).name;
  say(refused > 0 ? `${name}: ${laid} section(s) laid, ${refused} blocked.` : `${name}: ${laid} section(s) laid.`);
  finishStroke();
}

/** Right-click on a drawn line: take back the last corner (the start goes with the first leg). */
function undoLinePoint(): void {
  line.points = undoFieldPoint(line.points);
  line.press = null;
  say(line.points.length > 0 ? "" : "Line cleared.");
  queueDraw();
}

/** Turn the armed defence by wheel travel: one notch is 15°, trackpad pixels add up to a notch first. */
function wheelTurn(e: WheelEvent): void {
  wheelCarry += e.deltaMode === 1 ? e.deltaY / 3 : e.deltaMode === 2 ? e.deltaY : e.deltaY / 100;
  let steps = 0;
  while (wheelCarry >= 1) {
    steps++;
    wheelCarry -= 1;
  }
  while (wheelCarry <= -1) {
    steps--;
    wheelCarry += 1;
  }
  if (steps === 0) return;
  tool.turn = M.wrapTurn(tool.turn + steps);
  if (stage?.turnLabel) stage.turnLabel.textContent = `Faces ${turnDegrees(tool.turn)}°`;
  queueDraw();
}

function finishStroke(): void {
  if (!sheet) return;
  M.settle(sheet);
  changed();
}

function onDown(e: PointerEvent): void {
  const s = sheet;
  if (!s || !stage) return;
  stage.canvas.setPointerCapture(e.pointerId);
  // As in a match: right-click finishes a patrol (or drops a rotate).
  if (e.button === 2 && unitMode) {
    if (unitMode === "patrol" && patrolDraft.points.length > 0) commitPatrol();
    else setUnitMode(null);
    return;
  }
  if (e.button === 1 || e.button === 2) {
    drag = { kind: "pan", x: e.clientX, y: e.clientY, px: view.px, py: view.py, button: e.button, moved: false, camX: isoCam.camX, camY: isoCam.camY };
    return;
  }
  if (e.button !== 0) return;
  const t = toTile(e);
  hover = t;
  pointerOver = true;
  // A brush whose ring overlaps the sheet paints from past the edge; everything else needs a tile.
  const brushing = isBrush(tool.id) && !(tool.id === "level" && e.altKey);
  if (brushing ? !brushReaches(t.x, t.y) : !t.inside) return;
  if (unitMode === "rotate") return commitRotate(t.x, t.y);
  if (unitMode === "spot") return commitSpot(t.x, t.y);
  if (unitMode === "patrol") return addPatrolPoint(t.x, t.y);
  if (tool.id === "level" && e.altKey) {
    tool.level = s.heights[t.y * s.width + t.x]!;
    if (ctxRef) mountOrRefresh(ctxRef);
    say(`Level set to ${tool.level}.`);
    return;
  }
  if (
    tool.id === "erase" ||
    (e.shiftKey && (tool.id === "house" || tool.id === "defence" || tool.id === "lamp" || tool.id === "clutter" || tool.id === "unit" || tool.id === "spawn" || tool.id === "select"))
  ) {
    pushUndo();
    if (eraseAt(t.x, t.y)) finishStroke();
    else undo.pop();
    drag = { kind: "erase" };
    paintSelection();
    return;
  }
  if (tool.id === "select") {
    const ui = standingUnitAt(s, t.x, t.y);
    const fi = ui < 0 ? M.featureIndexAt(s, t.x, t.y) : -1;
    const si = ui < 0 && fi < 0 ? M.spawnIndexAt(s, t.x, t.y) : -1;
    if (ui >= 0) {
      selected = { kind: "unit", index: ui };
      pushUndo();
      drag = { kind: "unit", index: ui, from: copyMapUnit(s.units[ui]!), startX: t.x, startY: t.y, moved: false };
    } else if (fi >= 0) {
      selected = { kind: "feature", index: fi };
      pushUndo();
      drag = { kind: "move", index: fi, from: { ...s.features[fi]! }, startX: t.x, startY: t.y, moved: false };
    } else if (si >= 0) {
      selected = { kind: "spawn", id: s.spawns[si]!.id };
      pushUndo();
      drag = { kind: "spawn", id: s.spawns[si]!.id, moved: false };
    } else {
      selected = null;
    }
    say("");
    paintSelection();
    return;
  }
  if (lineTool()) {
    // As in a match: the press sets the start, each release pins a corner, Enter lays the line.
    line.press = M.tileWorld(t.x, t.y);
    drag = { kind: "line" };
    queueDraw();
    return;
  }
  if (tool.id === "house" || tool.id === "defence") {
    pushUndo();
    if (!placeAt(t.x, t.y, false)) {
      undo.pop();
      return;
    }
    say("");
    finishStroke();
    return;
  }
  if (tool.id === "unit") return placeUnitAt(t.x, t.y);
  if (tool.id === "lamp") {
    pushUndo();
    const problem = M.placeLamp(s, tool.lamp, t.x, t.y);
    if (problem) {
      undo.pop();
      return say(problem, "bad");
    }
    say("");
    finishStroke();
    return;
  }
  if (tool.id === "clutter") {
    pushUndo();
    const problem = M.placeClutter(s, tool.clutter, t.x, t.y);
    if (problem) {
      undo.pop();
      return say(problem, "bad");
    }
    say("");
    finishStroke();
    return;
  }
  if (tool.id === "spawn") {
    const at = M.spawnIndexAt(s, t.x, t.y);
    if (at >= 0) {
      pushUndo();
      drag = { kind: "spawn", id: s.spawns[at]!.id, moved: false };
      return;
    }
    const id = M.nextSpawnId(s);
    if (id === null) return say(`All ${s.maxPlayers} starts are placed. Drag one to move it, or raise Max players.`, "bad");
    const problem = M.spawnProblem(s, t.x, t.y);
    if (problem) return say(problem, "bad");
    pushUndo();
    s.spawns.push({ id, x: t.x, y: t.y });
    const dropped = M.clearPadHouses(s);
    say(dropped ? `Start ${id} placed. ${dropped} building(s) on its pad removed.` : `Start ${id} placed.`);
    finishStroke();
    return;
  }
  pushUndo();
  dab(t.x, t.y);
  const lifting = tool.id === "raise" || tool.id === "lower";
  // dab() skips a ring that is wholly off the sheet.
  const timer = lifting ? setInterval(() => dab(hover.x, hover.y), LIFT_EVERY_MS) : null;
  drag = { kind: "brush", lastX: t.x, lastY: t.y, timer };
}

function onMove(e: PointerEvent): void {
  const s = sheet;
  if (!s || !stage) return;
  if (drag?.kind === "pan") {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
    if (gameView) {
      isoCam.camX = drag.camX - (e.clientX - drag.x) / isoCam.zoom;
      isoCam.camY = drag.camY - (e.clientY - drag.y) / isoCam.zoom;
      queueDraw();
      return;
    }
    view.px = drag.px + (e.clientX - drag.x);
    view.py = drag.py + (e.clientY - drag.y);
    queueDraw();
    return;
  }
  const t = toTile(e);
  const moved = !pointerOver || t.x !== hover.x || t.y !== hover.y || t.inside !== hover.inside;
  hover = t;
  pointerOver = true;
  if (t.inside) {
    const i = t.y * s.width + t.x;
    const label = isMountainCliff(s.tiles, s.heights, s.width, s.height, t.x, t.y) ? "rock" : groundName(s.tiles[i]!, s.ground[i]);
    stage.status.textContent = `${t.x}, ${t.y} · height ${s.heights[i]} · ${label}`;
  } else if (moved) {
    stage.status.textContent = "Off the map";
  }
  if (!moved) return;
  if (drag?.kind === "brush") {
    // Follow the pointer's real path, off the sheet too: leaving and coming back
    // elsewhere must not draw a line across the map, and a ring that hangs over
    // the edge still paints the edge. Raise and Lower run on their timer.
    if (tool.id === "ground" || tool.id === "cover" || tool.id === "level" || tool.id === "mountain") dabLine(drag.lastX, drag.lastY, t.x, t.y);
    drag.lastX = t.x;
    drag.lastY = t.y;
  } else if (drag?.kind === "erase" && t.inside) {
    if (eraseAt(t.x, t.y)) finishStroke();
  } else if (drag?.kind === "move" && t.inside) {
    // Holds the last spot that fit; a refused one leaves it where it was. Its garrison rides along.
    const before = { ...s.features[drag.index]! };
    if (!M.moveFeature(s, drag.index, drag.from, t.x - drag.startX, t.y - drag.startY)) {
      const f = s.features[drag.index]!;
      M.reseatGarrison(s, before, f);
      drag.moved = f.x !== drag.from.x || f.y !== drag.from.y;
    }
  } else if (drag?.kind === "unit" && t.inside) {
    if (!M.moveUnit(s, drag.index, drag.from, t.x - drag.startX, t.y - drag.startY)) {
      const u = s.units[drag.index]!;
      drag.moved = u.x !== drag.from.x || u.y !== drag.from.y;
    }
  } else if (drag?.kind === "spawn" && t.inside) {
    const moving = drag;
    const sp = s.spawns.find((o) => o.id === moving.id);
    if (sp && !M.spawnProblem(s, t.x, t.y, sp.id)) {
      sp.x = t.x;
      sp.y = t.y;
      moving.moved = true;
    }
  }
  queueDraw();
}

function onUp(): void {
  const d = drag;
  drag = null;
  if (!d) return;
  if (d.kind === "brush") {
    if (d.timer) clearInterval(d.timer);
    finishStroke();
  } else if (d.kind === "line") {
    const press = line.press;
    line.press = null;
    if (!press || !lineTool()) return;
    const len =
      tool.id === "road"
        ? TILE_SIZE * 2
        : tool.id === "bridge"
          ? bridgeBrickLength(tool.bridge)
          : (isMapSection(tool.defence) && fieldSpan(tool.defence)?.length) || 24;
    line.points = pinFieldPoint(line.points, press, M.tileWorld(hover.x, hover.y), len * 0.5);
    queueDraw();
  } else if (d.kind === "pan") {
    if (d.button === 2 && !d.moved && linePending()) undoLinePoint();
  } else if (d.kind === "move") {
    if (!d.moved) {
      undo.pop();
      say(selectedTower() ? "Drag to move it. R aims its spotlight, Y sets its sweep, Delete removes it." : "Drag to move it. R turns it, Delete removes it.");
      return;
    }
    say("");
    finishStroke();
  } else if (d.kind === "unit") {
    if (!d.moved) {
      undo.pop();
      say(gameView ? "Drag to move it. R rotates it, Y gives it a patrol, Delete removes it." : "Drag to move it. Delete removes it. Rotate and Patrol are in the In-game view.");
      return;
    }
    say("");
    finishStroke();
  } else if (d.kind === "spawn") {
    if (!d.moved) {
      undo.pop();
      say(
        tool.id === "select"
          ? "Drag a start to move it. Delete removes it."
          : "Drag a start to move it. Shift+click or the Eraser removes it.",
      );
      return;
    }
    const dropped = sheet ? M.clearPadHouses(sheet) : 0;
    if (dropped) say(`${dropped} building(s) on the new pad removed.`);
    finishStroke();
  }
}

function onWheel(e: WheelEvent): void {
  if (!stage || !sheet) return;
  e.preventDefault();
  // While a defence is armed the wheel turns it, as in a match; Ctrl+wheel (or a pinch) still zooms.
  if (turningTool() && !e.ctrlKey) {
    wheelTurn(e);
    return;
  }
  const rect = stage.canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (gameView) {
    if (isoCam.zoom > 0) isoZoomAt(isoCam, mx, my, e.deltaY);
    queueDraw();
    return;
  }
  const next = Math.max(0.5, Math.min(24, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  view.px = mx - ((mx - view.px) * next) / view.zoom;
  view.py = my - ((my - view.py) * next) / view.zoom;
  view.zoom = next;
  queueDraw();
}

function groundName(t: number, cover = GROUND_GRASS): string {
  if (t === TILE_MOUNTAIN) return "mountain";
  if (t === TILE_EMPTY && cover !== GROUND_GRASS) return COVER.find((c) => c.cover === cover)?.name.toLowerCase() ?? "grass";
  return (GROUND.find((g) => g.tile === t) ?? LAID_GROUND.find((g) => g.tile === t))?.name.toLowerCase() ?? "blocked";
}

// --- preview & checks ----------------------------------------------------------

function schedulePreview(delay = 600): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    if (!stage?.preview || !sheet) return;
    if (previewStale) forgetTerrain(PREVIEW_ID);
    previewStale = false;
    drawMapPreview(stage.preview, M.sheetToMap(sheet, PREVIEW_ID));
  }, delay);
}

function paintChecks(): void {
  const s = sheet;
  if (!stage?.checks || !s) return;
  const list = stage.checks;
  list.innerHTML = "";
  const add = (tone: "ok" | "bad" | "warn", text: string): void => {
    list.append(el("li", { class: tone, text }));
  };
  add(s.spawns.length === s.maxPlayers ? "ok" : "bad", `Starts placed: ${s.spawns.length} / ${s.maxPlayers}`);
  const scrap = M.scrapCells(s);
  add(scrap > 0 ? "ok" : "warn", scrap > 0 ? `Scrap: ${scrap} tiles` : "No scrap yet: nowhere to stand a Smelter");
  const far = M.startsFarFromScrap(s);
  if (far.length > 0) add("warn", `Starts with no scrap in yard range: ${far.join(", ")} (an engineer would have to walk out)`);
  const defences = M.defenceCount(s);
  const bricks = s.features.filter((f) => isMapBridge(f.type)).length;
  const bridged = bricks > 0 ? ` · Bridge bricks: ${bricks}` : "";
  add("ok", `Buildings: ${s.features.length - defences - bricks} · Neutral defences: ${defences}${bridged} · Lamps: ${M.liveLamps(s).length} · Clutter: ${M.liveClutter(s).length}`);
  const units = M.liveUnits(s);
  const inside = units.filter((u) => u.inside).length;
  if (units.length > 0) add("ok", `Neutral units: ${units.length}${inside ? ` (${inside} garrisoned)` : ""}`);
  const lost = s.units.length - units.length;
  if (lost > 0) add("warn", `${lost} unit(s) lost their footing (water, a building, or a start pad) and will not be saved`);
  add(s.spawns.length > 0 ? "ok" : "warn", s.spawns.length > 0 ? "Play test: ready" : "Play test: place a start first");
  const problem = M.sheetProblem(s);
  if (problem && !problem.startsWith("Place all")) add("bad", problem);
  add(dirty ? "warn" : "ok", dirty ? "Unsaved changes" : "Saved");
}

// --- save / load -------------------------------------------------------------

function save(ctx: Ctx, opts: { copy?: boolean } = {}): void {
  const s = sheet;
  if (!s) return;
  if (!ctx.net.connected) return say("Not linked to the hub. Maps save on the server.", "bad");
  if (opts.copy) {
    s.id = newCustomMapId();
    if (!/ copy$/i.test(s.name)) s.name = `${s.name} copy`.slice(0, 32);
    dirty = true;
    edits++;
  }
  const problem = M.sheetProblem(s);
  if (problem) return say(problem, "bad");
  pendingSave = s.id;
  pendingAuto = false;
  savingEdits = edits;
  say("Saving…");
  ctx.net.send({ type: "map.save", map: M.sheetToSpec(s), key: mapKey() });
}

/**
 * Every AUTO_SAVE_MS, save the open map if it has changes. Stays quiet when
 * there is nothing to save, the sheet is not saveable yet, or a stroke is down.
 */
function autoTick(): void {
  const ctx = ctxRef;
  const s = sheet;
  if (!autoSave || !ctx || ctx.screen !== "builder" || !stage || !s || newOpen) return;
  if (!dirty || pendingSave || drag || !ctx.net.connected || M.sheetProblem(s)) return;
  pendingSave = s.id;
  pendingAuto = true;
  savingEdits = edits;
  ctx.net.send({ type: "map.save", map: M.sheetToSpec(s), key: mapKey() });
}

function setAutoSave(on: boolean): void {
  autoSave = on;
  try {
    store()?.setItem(AUTO_STORE, on ? "1" : "0");
  } catch {
    // Private mode: the choice lasts this visit only.
  }
}

/**
 * Drop straight into the sheet as it stands, alone, on the first start. The
 * map is not saved; Esc in the fight offers the way back here.
 */
function playtest(ctx: Ctx): void {
  const s = sheet;
  if (!s) return;
  if (!ctx.net.connected) return say("Not linked to the hub. A play test runs on the server.", "bad");
  const problem = M.playtestProblem(s);
  if (problem) return say(problem, "bad");
  const spec = M.playtestSpec(s, newPlaytestMapId());
  // Both ends build the same map from the same sheet.
  const loaded = loadCustomMap(spec, { playtest: true });
  if (!loaded.ok) return say(loaded.message, "bad");
  forgetTerrain(spec.id);
  say("Starting play test…");
  ctx.playMode = "skirmish";
  ctx.net.send({ type: "hello", name: ctx.name });
  ctx.net.send({ type: "map.test", map: spec });
}

/** The hub stored our map. */
export function builderMapSaved(ctx: Ctx, id: string): void {
  claimMap(id);
  if (pendingSave !== id) return;
  pendingSave = null;
  if (sheet?.id === id && edits === savingEdits) dirty = false;
  if (pendingAuto) {
    pendingAuto = false;
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    say(`Auto-saved at ${at}.`, "good");
    paintChecks();
    return;
  }
  say(`Saved "${getMap(id)?.name ?? id}". It is in every lobby's map list now.`, "good");
  if (ctx.screen === "builder") mountOrRefresh(ctx);
}

/** A refusal while a save or delete is in flight lands here instead of the menu banner. */
export function builderError(ctx: Ctx, message: string): boolean {
  if (!stage || ctx.screen !== "builder") return false;
  pendingSave = null;
  const auto = pendingAuto;
  pendingAuto = false;
  say(auto ? `Auto save failed: ${message}` : message, "bad");
  return true;
}

function loadFrom(ctx: Ctx, id: string, copy: boolean): void {
  if (dirty && sheet && !confirm("Discard unsaved changes to this map?")) return;
  const src = getMap(id);
  if (!src) return;
  const spec = specFromMap(id, {
    id: copy ? newCustomMapId() : id,
    name: copy ? `${src.name} copy`.slice(0, 32) : src.name,
    author: copy ? ctx.name : (src.custom?.author ?? ctx.name),
  });
  if (!spec) return;
  openSheet(M.sheetFromSpec(spec), copy);
  say(copy ? `Copied ${src.name}. Save to keep it.` : `Editing ${src.name}.`);
  mountOrRefresh(ctx);
}

function remove(ctx: Ctx, id: string): void {
  const m = getMap(id);
  if (!m || !confirm(`Delete "${m.name}" for everyone?`)) return;
  ctx.net.send({ type: "map.delete", id, key: mapKey() });
  say(`Deleting ${m.name}…`);
}

// --- DOM -----------------------------------------------------------------------

function loadCollapsed(): Set<string> {
  try {
    const raw = JSON.parse(store()?.getItem(COLLAPSE_STORE) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

/** A titled block. Clicking the title folds it shut or open; the choice outlives the screen. */
function section(title: string, ...kids: Node[]): HTMLElement {
  const shut = collapsed.has(title);
  const wrap = el("div", { class: `panel-sub bld-sec${shut ? " is-collapsed" : ""}` });
  const head = el("button", { class: "bld-sec-head", attrs: { type: "button", "aria-expanded": String(!shut), title: "Fold or unfold" } });
  head.append(el("h2", { text: title }), el("span", { class: "bld-sec-caret", attrs: { "aria-hidden": "true" } }));
  const body = el("div", { class: "bld-sec-body" });
  body.append(...kids);
  head.addEventListener("click", () => {
    const now = !collapsed.has(title);
    if (now) collapsed.add(title);
    else collapsed.delete(title);
    wrap.classList.toggle("is-collapsed", now);
    head.setAttribute("aria-expanded", String(!now));
    try {
      store()?.setItem(COLLAPSE_STORE, JSON.stringify([...collapsed]));
    } catch {
      // Private window: folds last this visit.
    }
  });
  wrap.append(head, body);
  return wrap;
}

function asset(label: string, sub: string, on: boolean, art: Node, title: string, pick: () => void): HTMLButtonElement {
  const b = el("button", { class: `bld-asset${on ? " is-on" : ""}`, attrs: { type: "button", title } });
  b.append(art, el("span", { text: label }));
  if (sub) b.append(el("small", { text: sub }));
  b.addEventListener("click", pick);
  return b;
}

/**
 * A building's art at `angle` world radians: a house's quarter, a defence's 15° step. A crewed
 * gun shows its unturned pit with the barrel laid along `angle`, its crew at it.
 */
function houseThumb(type: CivilianType | Exclude<MapDefenceType, MapSectionType>, angle: number): HTMLCanvasElement {
  const cv = el("canvas");
  cv.width = 96;
  cv.height = 76;
  const gun = gunLayerFor(type);
  const def = gun ? gun.pad : buildingSpriteFor(type, angle);
  const paint = (): void => {
    const g = cv.getContext("2d");
    if (!g || !def) return;
    const img = def.image;
    const k = Math.min(cv.width / img.naturalWidth, cv.height / img.naturalHeight);
    const x0 = (cv.width - img.naturalWidth * k) / 2;
    const y0 = (cv.height - img.naturalHeight * k) / 2;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(img, x0, y0, img.naturalWidth * k, img.naturalHeight * k);
    if (gun) drawGunRow(g, gun.sheet, def, x0 + def.padSouthX * k, y0 + def.padSouthY * k, def.padWidth * k, angle, TILE_SIZE, gun.cols - 1, gun.cols);
  };
  const ready = (im: HTMLImageElement): boolean => im.complete && im.naturalWidth > 0;
  const wait = [def?.image, gun?.sheet].filter((im): im is HTMLImageElement => !!im && !ready(im));
  if (wait.length === 0) paint();
  for (const im of wait) im.addEventListener("load", paint, { once: true });
  return cv;
}

function clutterThumb(type: ClutterType): HTMLCanvasElement {
  const cv = el("canvas");
  cv.width = 48;
  cv.height = 40;
  const spr = CLUTTER_SPRITES[type].whole;
  const paint = (): void => {
    const g = cv.getContext("2d");
    const img = spr.image;
    if (!g || !img.naturalHeight) return;
    const k = Math.min((cv.width - 4) / img.naturalWidth, (cv.height - 4) / img.naturalHeight);
    g.clearRect(0, 0, cv.width, cv.height);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    g.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  };
  if (spr.image.complete && spr.image.naturalWidth > 0) paint();
  else spr.image.addEventListener("load", paint, { once: true });
  return cv;
}

function lampThumb(type: LampType): HTMLCanvasElement {
  const cv = el("canvas");
  cv.width = 48;
  cv.height = 76;
  const spr = LAMP_SPRITES[type];
  const paint = (): void => {
    const g = cv.getContext("2d");
    const img = spr.image;
    if (!g || !img.naturalHeight) return;
    // Scale by height and stand the post at the middle; the cast shadow runs off to the right.
    const k = (cv.height - 6) / img.naturalHeight;
    g.clearRect(0, 0, cv.width, cv.height);
    const x0 = cv.width / 2 - spr.contactX * k;
    const y0 = cv.height - 3 - spr.contactY * k;
    g.drawImage(img, x0, y0, img.naturalWidth * k, img.naturalHeight * k);
    // Lit, so the dark post reads on the dark panel and the colour of its light shows.
    const bx = x0 + spr.bulbX * k;
    const by = y0 + spr.bulbY * k;
    const halo = g.createRadialGradient(bx, by, 0, bx, by, 14);
    halo.addColorStop(0, "rgba(255, 250, 230, 0.95)");
    halo.addColorStop(0.35, `rgba(${STREET_LAMPS[type].rgb}, 0.6)`);
    halo.addColorStop(1, `rgba(${STREET_LAMPS[type].rgb}, 0)`);
    g.globalCompositeOperation = "lighter";
    g.fillStyle = halo;
    g.beginPath();
    g.arc(bx, by, 14, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
  };
  if (spr.image.complete && spr.image.naturalWidth > 0) paint();
  else spr.image.addEventListener("load", paint, { once: true });
  return cv;
}

function setTool(ctx: Ctx, patch: Partial<Tool>): void {
  Object.assign(tool, patch);
  if (patch.id && patch.id !== "select") unitMode = null;
  if (!lineTool()) dropLine();
  mountOrRefresh(ctx);
}

/** Fill the Select box: what is held, and the buttons that act on it. */
function paintSelection(): void {
  const box = stage?.sel;
  const s = sheet;
  if (!box) return;
  box.innerHTML = "";
  const f = selectedFeature();
  const u = selectedUnit();
  const startId = selected?.kind === "spawn" ? selected.id : 0;
  const start = startId ? s?.spawns.find((sp) => sp.id === startId) : undefined;
  if (!f && !start && !u) {
    box.append(
      el("p", {
        class: "bld-hint",
        text:
          tool.id === "select"
            ? "Click a building, defence, unit, or start to pick it up. Drag to move it."
            : "Pick Select to move or remove what you placed.",
      }),
    );
    return;
  }
  const btn = (text: string, title: string, on: boolean, onClick: () => void, disabled = false): HTMLButtonElement => {
    const b = el("button", { class: `btn ${on ? "" : "btn-ghost "}bld-mini`, text, attrs: { type: "button", title } });
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    return b;
  };
  const row = el("div", { class: "btn-row" });
  if (u && s) {
    const route = u.patrol?.length ? ` · patrols ${u.patrol.length} point${u.patrol.length === 1 ? "" : "s"}${u.loop ? " in a loop" : ""}` : "";
    const light = hasSpotlight(u.type) ? ` · light ${u.spot ?? u.facing}°` : "";
    box.append(el("div", { class: "bld-sel-name", text: `Neutral ${catalog(u.type).name} · faces ${u.facing}°${light}${route}` }));
    const iso = gameView;
    const why = iso ? "" : "Tick In-game view to give orders.";
    row.append(
      btn("Rotate (R)", iso ? "Click where it should face." : why, unitMode === "rotate", () => setUnitMode("rotate"), !iso),
      btn("Patrol (Y)", iso ? "Click points; an earlier point closes a loop; right-click sets it." : why, unitMode === "patrol", () => setUnitMode("patrol"), !iso),
    );
    if (hasSpotlight(u.type)) {
      row.append(btn("Rotate spotlight", iso ? "Click where the searchlight should point." : why, unitMode === "spot", () => setUnitMode("spot"), !iso));
    }
    if (u.patrol?.length) {
      row.append(
        btn("Stop patrol", "It stands guard where it is.", false, () => {
          patrolDraft.points = [];
          patrolDraft.loop = false;
          commitPatrol();
        }),
      );
    }
    if (!iso) box.append(el("p", { class: "bld-hint", text: why }));
  } else if (f && s) {
    const faces = ["east", "south", "west", "north"];
    const heading = f.turn != null ? `${turnDegrees(f.turn)}°` : faces[f.facing & 3];
    if (f.type === "tower") {
      const sweep = f.patrol?.length ? ` · sweeps ${f.patrol.length} point${f.patrol.length === 1 ? "" : "s"}${f.loop ? " in a loop" : ""}` : "";
      box.append(el("div", { class: "bld-sel-name", text: `${catalog(f.type).name} · faces ${heading} · light ${towerSpot(f)}°${sweep}` }));
      const why = gameView ? "" : "Tick In-game view to aim the spotlight.";
      row.append(
        btn("Rotate (R)", gameView ? "Click where the spotlight should point." : why, unitMode === "spot", () => setUnitMode("spot"), !gameView),
        btn("Patrol (Y)", gameView ? "Click the points the spotlight sweeps; an earlier point closes a loop; right-click sets it." : why, unitMode === "patrol", () => setUnitMode("patrol"), !gameView),
      );
      if (f.patrol?.length) {
        row.append(
          btn("Stop sweep", "The spotlight holds its heading.", false, () => {
            patrolDraft.points = [];
            patrolDraft.loop = false;
            commitPatrol();
          }),
        );
      }
      if (!gameView) box.append(el("p", { class: "bld-hint", text: why }));
    } else {
      box.append(el("div", { class: "bld-sel-name", text: `${catalog(f.type).name} · faces ${heading}` }));
      row.append(
        btn("Turn (R)", "Turn it", false, () => {
          turnSelected();
          paintSelection();
        }),
      );
    }
    const cap = garrisonCapOf(f.type);
    const inside = selected?.kind === "feature" ? M.unitsInside(s, selected.index) : [];
    if (cap > 0) {
      const names = inside.map((i) => catalog(s.units[i]!.type).name).join(", ");
      box.append(el("p", { class: "bld-hint", text: `Neutral garrison: ${inside.length} / ${cap}${names ? ` (${names})` : ""}` }));
      if (inside.length > 0) {
        row.append(btn("Unload", gameView ? "Walk them out beside it." : "Tick In-game view to unload.", false, () => unloadSelected(), !gameView));
      }
    }
  } else {
    box.append(el("div", { class: "bld-sel-name", text: `Start ${start!.id}` }));
  }
  row.append(btn("Delete (Del)", "Remove it", false, () => deleteSelected()));
  box.append(row);
}

/** A short bridge over a strip of water, drawn the way the battlefield draws one. */
function bridgeThumb(type: BridgeType): HTMLCanvasElement {
  const cv = el("canvas");
  cv.width = 64;
  cv.height = 48;
  const g = cv.getContext("2d");
  if (!g) return cv;
  const ts = TILE_SIZE;
  const k = 0.5;
  const wet = (x: number): boolean => Math.abs(x) < 26;
  const ground = (x: number): number => (wet(x) ? 0 : 2);
  const project = (wx: number, wy: number, h: number): { x: number; y: number } => {
    const p = worldToIso(wx, wy, ts);
    return { x: 32 + p.x * k, y: 30 + p.y * k - h * 4 * k };
  };
  // Water, and a bank either side.
  const quad = (x0: number, x1: number, h: number, fill: string): void => {
    const pts = [project(x0, -30, h), project(x1, -30, h), project(x1, 30, h), project(x0, 30, h)];
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  quad(-26, 26, 0, "#2f5560");
  quad(-60, -26, 2, "#5b6b3a");
  quad(26, 60, 2, "#5b6b3a");
  const width = bridgeWidth(type);
  const len = bridgeBrickLength(type);
  const n = Math.max(2, Math.ceil(76 / len));
  const spans = bridgePath(type, [
    { x: (-len * n) / 2, y: 0 },
    { x: (len * n) / 2, y: 0 },
  ]);
  // Started on the bank, it keeps the bank's level over the water.
  const bricks = spans.map((span) => ({ type, span, width, deck: 2 }));
  const layout = layoutBridges(bricks, (x) => wet(x));
  g.save();
  g.translate(0, 0);
  bricks.forEach((b, i) => {
    drawBrick(g, {
      ...layout[i]!,
      type,
      span: b.span,
      width,
      project,
      ground: (x) => ground(x),
      wet: (x) => wet(x),
      seed: i + 1,
    });
  });
  g.restore();
  return cv;
}

/** Palette glyph for each line piece. */
const SECTION_MARKS: Record<MapSectionType, string> = { sandbags: "▬", barbwire: "✕", teeth: "▲", wall: "▮" };

function defenceThumb(type: MapDefenceType, turn: number): HTMLElement {
  if (!isMapSection(type)) return houseThumb(type, M.wrapTurn(turn) * BUILDING_TURN_STEP);
  // Sections are drawn by the battlefield, not from a sheet: a plain mark stands in.
  return el("span", { class: `bld-start-mark bld-${type}`, text: SECTION_MARKS[type] });
}

function toolsPanel(ctx: Ctx): HTMLElement {
  const panel = el("div", { class: "bld-tools panel" });
  const edit = el("div", { class: "bld-palette" });
  edit.append(
    asset("Select", "move, turn, delete", tool.id === "select", el("span", { class: "bld-start-mark", text: "⬚" }), "Pick up a placed building, defence, or start. Drag to move it, R turns it, Delete removes it.", () =>
      setTool(ctx, { id: "select" }),
    ),
    asset("Eraser", "buildings, lamps, clutter, starts", tool.id === "erase", el("span", { class: "bld-start-mark", text: "✕" }), "Remove buildings, defences, lamps, clutter, and starts.", () =>
      setTool(ctx, { id: "erase" }),
    ),
  );
  const sel = el("div", { class: "bld-sel" });
  if (stage) stage.sel = sel;
  panel.append(section("Edit", edit, sel));

  const relief = el("div", { class: "bld-palette three" });
  const reliefTool = (id: ToolId, label: string, glyph: string, title: string): HTMLButtonElement => {
    const art = el("span", { class: "bld-start-mark", text: glyph });
    return asset(label, "", tool.id === id, art, title, () => setTool(ctx, { id }));
  };
  relief.append(
    reliefTool("raise", "Raise", "▲", "Hold to lift the ground one step at a time."),
    reliefTool("lower", "Lower", "▼", "Hold to cut the ground down."),
    reliefTool("level", "Level", "═", "Set ground to the level below. Alt+click samples a height."),
  );
  const levelRow = el("div", { class: "bld-row" });
  const levelIn = el("input", { attrs: { type: "range", min: "0", max: String(HEIGHT_MAX), step: "1" } });
  levelIn.value = String(tool.level);
  const levelVal = el("span", { class: "bld-val", text: `${tool.level}` });
  levelIn.addEventListener("input", () => {
    tool.level = Number(levelIn.value);
    levelVal.textContent = `${tool.level}`;
    if (tool.id !== "level") setTool(ctx, { id: "level" });
  });
  levelRow.append(levelIn, levelVal);
  const mountainBtn = reliefTool(
    "mountain",
    "Mountain",
    "Λ",
    "Stamp a flat cap at the mountain height. Rock rings it, and that rock opens where the ground beside it is raised to the same height.",
  );
  const mountainRow = el("div", { class: "bld-row" });
  const mountainIn = el("input", {
    attrs: { type: "range", min: String(MOUNTAIN_MIN_HEIGHT), max: String(HEIGHT_MAX), step: "1" },
  });
  mountainIn.value = String(tool.mountain);
  const mountainVal = el("span", { class: "bld-val", text: `${tool.mountain}` });
  mountainIn.addEventListener("input", () => {
    tool.mountain = Math.max(MOUNTAIN_MIN_HEIGHT, Number(mountainIn.value));
    mountainVal.textContent = `${tool.mountain}`;
    if (tool.id !== "mountain") setTool(ctx, { id: "mountain" });
  });
  mountainRow.append(mountainIn, mountainVal);
  const terrainBtns = el("div", { class: "btn-row" });
  const roll = el("button", { class: "btn btn-ghost bld-mini", text: "Roll hills", attrs: { type: "button" } });
  roll.addEventListener("click", () => {
    const s = sheet;
    if (!s || !confirm("Replace all elevation with fresh rolling hills?")) return;
    pushUndo();
    s.tiles = s.tiles.map((t) => (t === TILE_MOUNTAIN ? TILE_EMPTY : t));
    s.heights = rollHeights(s.width, s.height, `${s.id}:${Date.now()}`, s.spawns);
    finishStroke();
  });
  const flat = el("button", { class: "btn btn-ghost bld-mini", text: "Flatten all", attrs: { type: "button" } });
  flat.addEventListener("click", () => {
    const s = sheet;
    if (!s || !confirm("Flatten the whole map to base height?")) return;
    pushUndo();
    s.tiles = s.tiles.map((t) => (t === TILE_MOUNTAIN ? TILE_EMPTY : t));
    s.heights = s.heights.map(() => HEIGHT_BASE);
    finishStroke();
  });
  terrainBtns.append(roll, flat);

  const groundPal = el("div", { class: "bld-palette" });
  for (const g of GROUND) {
    const img = el("img", { attrs: { src: g.img, alt: "" } });
    groundPal.append(asset(g.name, "", tool.id === "ground" && tool.tile === g.tile, img, g.hint, () => setTool(ctx, { id: "ground", tile: g.tile })));
  }
  const coverPal = el("div", { class: "bld-palette" });
  for (const c of COVER) {
    const img = el("img", { attrs: { src: c.img, alt: "" } });
    coverPal.append(asset(c.name, "", tool.id === "cover" && tool.cover === c.cover, img, c.hint, () => setTool(ctx, { id: "cover", cover: c.cover })));
  }

  const brushRow = el("div", { class: "bld-row" });
  const brushIn = el("input", { attrs: { type: "range", min: "0", max: "24", step: "1" } });
  brushIn.value = String(tool.brush);
  const brushVal = el("span", { class: "bld-val", text: `${tool.brush * 2 + 1} tiles` });
  brushIn.addEventListener("input", () => {
    tool.brush = Number(brushIn.value);
    brushVal.textContent = `${tool.brush * 2 + 1} tiles`;
    queueDraw();
  });
  brushRow.append(brushIn, brushVal);
  panel.append(
    section(
      "Terrain",
      el("h3", { class: "bld-sub", text: "Elevation" }),
      relief,
      el("label", { text: "Level height" }),
      levelRow,
      mountainBtn,
      el("label", { text: "Mountain height" }),
      mountainRow,
      terrainBtns,
      el("h3", { class: "bld-sub", text: "Ground" }),
      groundPal,
      el("h3", { class: "bld-sub", text: "Surface" }),
      coverPal,
      el("label", { text: "Brush" }),
      brushRow,
      el("p", {
        class: "bld-hint",
        text: "The brush paints ground, lays a surface over open ground, shapes elevation, and stamps mountains. [ and ] change the size. A surface is looks only: it never changes how a tile plays. A mountain's rock opens where the ground beside it matches its height.",
      }),
    ),
  );

  const houses = el("div", { class: "bld-palette" });
  for (const type of CIVILIAN_TYPES) {
    const def = catalog(type);
    const size = `${def.tileW / TILE_SUBDIV}×${def.tileH / TILE_SUBDIV} cells`;
    houses.append(
      asset(def.name, size, tool.id === "house" && tool.house === type, houseThumb(type, (tool.facing * Math.PI) / 2), def.blurb ?? def.name, () =>
        setTool(ctx, { id: "house", house: type }),
      ),
    );
  }
  const faceRow = el("div", { class: "bld-row" });
  const faces = ["East", "South", "West", "North"];
  const turn = el("button", { class: "btn btn-ghost bld-mini", text: `Door: ${faces[tool.facing]}`, attrs: { type: "button" } });
  turn.addEventListener("click", () => setTool(ctx, { facing: (tool.facing + 1) & 3 }));
  faceRow.append(turn);
  panel.append(
    section(
      "Buildings",
      houses,
      faceRow,
      el("p", {
        class: "bld-hint",
        text: "Houses and industry. Infantry garrison them; tanks shell them. R turns the door. Shift+click removes.",
      }),
    ),
  );

  const defences = el("div", { class: "bld-palette" });
  for (const type of MAP_DEFENCE_TYPES) {
    const def = catalog(type);
    const size = isMapSection(type) ? "one section" : `${def.tileW / TILE_SUBDIV}×${def.tileH / TILE_SUBDIV} cells`;
    defences.append(
      asset(def.name, size, tool.id === "defence" && tool.defence === type, defenceThumb(type, tool.turn), def.blurb ?? def.name, () =>
        setTool(ctx, { id: "defence", defence: type }),
      ),
    );
  }
  const defFaceRow = el("div", { class: "bld-row" });
  const turnBy = (steps: number, text: string, title: string): HTMLButtonElement => {
    const b = el("button", { class: "btn btn-ghost bld-mini", text, attrs: { type: "button", title } });
    b.addEventListener("click", () => setTool(ctx, { turn: M.wrapTurn(tool.turn + steps) }));
    return b;
  };
  const turnLabel = el("span", { class: "bld-val", text: `Faces ${turnDegrees(tool.turn)}°` });
  if (stage) stage.turnLabel = turnLabel;
  defFaceRow.append(turnBy(-1, "⟲ 15°", "Turn 15° counter-clockwise"), turnLabel, turnBy(1, "15° ⟳", "Turn 15° clockwise"));
  panel.append(
    section(
      "Defences",
      defences,
      defFaceRow,
      el("p", {
        class: "bld-hint",
        text: "Neutral until taken. Infantry that walk into a bunker or tower take it; a tower's lamp stays dark until someone holds it. The guns stand with neutral crews at them; once a crew falls, the first soldier to man the gun takes it. Men who take cover at sandbags or a wall claim the section. Barbwire stops infantry and any vehicle flattens it; teeth stop vehicles and infantry walk through. Scroll turns a defence 15° (Ctrl+scroll zooms). A sandbag, wire, teeth, or wall line goes down as in a match: click its start, click each corner, Enter lays it, right-click takes a corner back. Esc cancels and picks up Select.",
      }),
    ),
  );

  const lamps = el("div", { class: "bld-palette three" });
  for (const type of LAMP_TYPES) {
    const reach = `${(STREET_LAMPS[type].reachTiles * 2) / TILE_SUBDIV} cells lit`;
    lamps.append(
      asset(LAMP_NAMES[type], reach, tool.id === "lamp" && tool.lamp === type, lampThumb(type), `${LAMP_NAMES[type]}: lights the ground round it after dark.`, () =>
        setTool(ctx, { id: "lamp", lamp: type }),
      ),
    );
  }
  const clutter = el("div", { class: "bld-palette four" });
  for (const type of CLUTTER_TYPES) {
    clutter.append(
      asset(CLUTTER_NAMES[type], "breakable", tool.id === "clutter" && tool.clutter === type, clutterThumb(type), `${CLUTTER_NAMES[type]}: smashed flat by a tank or a shell.`, () =>
        setTool(ctx, { id: "clutter", clutter: type }),
      ),
    );
  }
  const clutterBtns = el("div", { class: "btn-row" });
  const strew = el("button", { class: "btn btn-ghost bld-mini", text: "Scatter", attrs: { type: "button", title: "Strew clutter by houses and roads. Each press adds more." } });
  strew.addEventListener("click", () => {
    const s = sheet;
    if (!s) return;
    pushUndo();
    const n = M.scatterSheetClutter(s, `${s.id}:${Date.now()}`);
    if (n === 0) {
      undo.pop();
      return say("No room for more clutter.", "bad");
    }
    say(`Scattered ${n} pieces of clutter.`, "good");
    finishStroke();
  });
  const sweep = el("button", { class: "btn btn-ghost bld-mini", text: "Clear clutter", attrs: { type: "button" } });
  sweep.addEventListener("click", () => {
    const s = sheet;
    if (!s || s.clutter.length === 0 || !confirm("Remove every piece of clutter from the map?")) return;
    pushUndo();
    s.clutter = [];
    finishStroke();
  });
  clutterBtns.append(strew, sweep);
  const decor = el("div", { class: "bld-palette" });
  decor.append(
    asset("Road", "drawn line", tool.id === "road", el("img", { attrs: { src: dirtUrl, alt: "" } }), "Dirt lane. Same footing as grass.", () =>
      setTool(ctx, { id: "road" }),
    ),
  );
  const roadRow = el("div", { class: "bld-row" });
  const roadIn = el("input", { attrs: { type: "range", min: String(M.ROAD_WIDTH_MIN), max: String(M.ROAD_WIDTH_MAX), step: "1" } });
  roadIn.value = String(tool.roadWidth);
  const roadVal = el("span", { class: "bld-val", text: `${tool.roadWidth} tiles` });
  roadIn.addEventListener("input", () => {
    tool.roadWidth = Number(roadIn.value);
    roadVal.textContent = `${tool.roadWidth} tiles`;
    if (tool.id !== "road") setTool(ctx, { id: "road" });
    else queueDraw();
  });
  roadRow.append(roadIn, roadVal);
  const roadFaceRow = el("div", { class: "bld-row" });
  const roadTurnLabel = el("span", { class: "bld-val", text: `Faces ${turnDegrees(tool.turn)}°` });
  if (stage && tool.id === "road") stage.turnLabel = roadTurnLabel;
  roadFaceRow.append(turnBy(-1, "⟲ 15°", "Turn 15° counter-clockwise"), roadTurnLabel, turnBy(1, "15° ⟳", "Turn 15° clockwise"));
  panel.append(
    section(
      "Decorations",
      el("h3", { class: "bld-sub", text: "Roads" }),
      decor,
      el("label", { text: "Road width" }),
      roadRow,
      roadFaceRow,
      el("p", {
        class: "bld-hint",
        text: "A road goes down like a wall: click its start, click each corner, Enter lays it, right-click takes a corner back. Esc cancels and picks up Select. Scroll turns a lone stub 15° (Ctrl+scroll zooms); [ and ] change the width.",
      }),
      el("h3", { class: "bld-sub", text: "Street lamps" }),
      lamps,
      el("p", {
        class: "bld-hint",
        text: "Light up after dusk. Dress only: they do not block a man or a shot, and a structure raised on one hides it. Shift+click removes.",
      }),
      el("h3", { class: "bld-sub", text: "Clutter" }),
      clutter,
      clutterBtns,
      el("p", {
        class: "bld-hint",
        text: "Odds and ends that make the ground look lived in. A tank or truck that rolls over one, a shell that lands on it, or a few bursts of fire smashes it flat for the match. They block no one and hide no one. Scatter strews them by the houses, along the roads, and here and there in the open. Shift+click removes.",
      }),
    ),
  );

  const bridges = el("div", { class: "bld-palette" });
  for (const type of MAP_BRIDGE_TYPES) {
    const def = catalog(type);
    const wide = type === "bigbridge" ? "two tanks wide" : "one tank wide";
    bridges.append(
      asset(def.name, wide, tool.id === "bridge" && tool.bridge === type, bridgeThumb(type), def.blurb ?? def.name, () =>
        setTool(ctx, { id: "bridge", bridge: type }),
      ),
    );
  }
  const bridgeFaceRow = el("div", { class: "bld-row" });
  const bridgeTurnLabel = el("span", { class: "bld-val", text: `Faces ${turnDegrees(tool.turn)}°` });
  if (stage && tool.id === "bridge") stage.turnLabel = bridgeTurnLabel;
  bridgeFaceRow.append(turnBy(-1, "⟲ 15°", "Turn 15° counter-clockwise"), bridgeTurnLabel, turnBy(1, "15° ⟳", "Turn 15° clockwise"));
  panel.append(
    section(
      "Bridges",
      bridges,
      bridgeFaceRow,
      el("p", {
        class: "bld-hint",
        text: "Laid brick by brick, like a wall: click where it starts, click each corner, Enter lays it, right-click takes a corner back. The deck keeps the level of the ground you start on; its piles or piers reach down to whatever is under it, and the water stays water. Start it high on a bank and small boats sail under it (never the LST or the Battle Ship). Bricks stand on water or open ground, not on rock or woods. They belong to no one: anyone crosses, only a force-attack hurts one, and a brick shot down drops into the water while the rest stands.",
      }),
    ),
  );

  const tabs = el("div", { class: "bld-unit-tabs", attrs: { role: "tablist" } });
  for (const g of SIDEBAR_GROUPS.filter((x) => UNIT_TABS.includes(x.id))) {
    const tab = el("button", {
      class: `group-tab${g.id === unitTab ? " is-active" : ""}`,
      attrs: { type: "button", role: "tab", title: g.label, "data-group": g.id },
      html: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${g.icon}"/></svg><span class="group-tab-label">${g.short}</span>`,
    });
    tab.addEventListener("click", () => {
      unitTab = g.id;
      mountOrRefresh(ctx);
    });
    tabs.append(tab);
  }
  const unitPal = el("div", { class: "bld-palette three" });
  for (const type of MAP_UNIT_TYPES) {
    if (sidebarGroupOf(type) !== unitTab) continue;
    const def = catalog(type);
    const art = el("span", { class: "prod-job bld-unit-art", attrs: { "data-type": type } });
    unitPal.append(
      asset(def.name, "", tool.id === "unit" && tool.unit === type, art, def.blurb ?? def.name, () => setTool(ctx, { id: "unit", unit: type })),
    );
  }
  const unitFaceRow = el("div", { class: "bld-row" });
  const unitTurnLabel = el("span", { class: "bld-val", text: `Faces ${turnDegrees(tool.turn)}°` });
  if (stage && tool.id === "unit") stage.turnLabel = unitTurnLabel;
  unitFaceRow.append(turnBy(-1, "⟲ 15°", "Turn 15° counter-clockwise"), unitTurnLabel, turnBy(1, "15° ⟳", "Turn 15° clockwise"));
  panel.append(
    section(
      "Units",
      tabs,
      unitPal,
      unitFaceRow,
      el("p", {
        class: "bld-hint",
        text:
          "Neutral: grey, no one's, and hostile to every commander. They fire on anyone who comes into sight and never leave their post. Scroll turns the next one 15°. In the In-game view, drop infantry on a house, bunker, or tower to garrison it; select a unit to Rotate (R) it or give it a Patrol (Y), and select a held building to Unload it. Shift+click removes.",
      }),
    ),
  );

  const starts = el("div", { class: "bld-palette" });
  const next = sheet ? M.nextSpawnId(sheet) : 1;
  starts.append(
    asset("Start", next === null ? "all placed" : `next: ${next}`, tool.id === "spawn", el("span", { class: "bld-start-mark", text: String(next ?? "✓") }), "Commander start position.", () =>
      setTool(ctx, { id: "spawn" }),
    ),
  );
  panel.append(
    section(
      "Start positions",
      starts,
      el("p", {
        class: "bld-hint",
        text: `Each start keeps a clear, level pad (${(SPAWN_PAD_R * 2) / TILE_SUBDIV} cells across) for the Rig. Drag a start to move it.`,
      }),
    ),
  );
  return panel;
}

function sidePanel(ctx: Ctx): HTMLElement {
  const panel = el("div", { class: "bld-side panel" });
  const preview = el("canvas", { class: "bld-preview" });
  const checks = el("ul", { class: "bld-checks" });
  panel.append(section("Preview", preview), section("Checks", checks));
  const maps = el("div", { class: "bld-maps" });
  panel.append(section("Maps", maps));
  if (stage) {
    stage.preview = preview;
    stage.checks = checks;
    stage.maps = maps;
  }
  return panel;
}

function paintMapList(ctx: Ctx): void {
  const box = stage?.maps;
  if (!box) return;
  box.innerHTML = "";
  const mine = myMaps();
  const tiny = (text: string, ghost: boolean, onClick: () => void): HTMLButtonElement => {
    const b = el("button", { class: `btn ${ghost ? "btn-ghost " : ""}bld-mini`, text, attrs: { type: "button" } });
    b.addEventListener("click", onClick);
    return b;
  };
  for (const m of listMaps()) {
    const row = el("div", { class: `bld-map${sheet?.id === m.id ? " is-open" : ""}` });
    const name = el("div", { class: "bld-map-name", text: m.name, attrs: { title: m.name } });
    const cells = m.width / TILE_SUBDIV;
    name.append(el("small", { text: `${m.spawns.length}p · ${cells}×${cells} · ${m.custom ? m.custom.author : "built-in"}` }));
    row.append(name);
    const own = Boolean(m.custom) && mine.has(m.id);
    if (own) row.append(tiny("Edit", false, () => loadFrom(ctx, m.id, false)));
    row.append(tiny("Copy", true, () => loadFrom(ctx, m.id, true)));
    if (own) row.append(tiny("✕", true, () => remove(ctx, m.id)));
    box.append(row);
  }
  box.append(el("p", { class: "bld-hint", text: "Built-in maps cannot be edited. Copy one to start from it." }));
}

function newForm(ctx: Ctx): HTMLElement {
  const wrap = el("div", { class: "bld-new" });
  const panel = el("div", { class: "panel" });
  panel.append(el("h2", { text: "New map" }));
  const name = el("input", { attrs: { type: "text", maxlength: "32", placeholder: "Map name" } });
  name.value = "Untitled Front";
  const size = el("select");
  CUSTOM_MAP_SIZES.forEach((s, i) => {
    const o = el("option", { text: `${s.label} — ${s.cells}×${s.cells} cells`, attrs: { value: String(i) } });
    if (s.cells === 64) o.selected = true;
    size.append(o);
  });
  const players = el("select");
  for (let n = CUSTOM_MAP_MIN_PLAYERS; n <= CUSTOM_MAP_MAX_PLAYERS; n++) {
    const o = el("option", { text: `${n} players`, attrs: { value: String(n) } });
    if (n === 4) o.selected = true;
    players.append(o);
  }
  const relief = el("select");
  relief.append(
    el("option", { text: "Flat plain", attrs: { value: "flat" } }),
    el("option", { text: "Rolling hills", attrs: { value: "hills" } }),
  );
  panel.append(
    el("label", { text: "Name" }),
    name,
    el("label", { text: "Map size" }),
    size,
    el("label", { text: "Max players" }),
    players,
    el("label", { text: "Ground" }),
    relief,
  );
  const row = el("div", { class: "btn-row" });
  const create = el("button", { class: "btn btn-primary", text: "Create", attrs: { type: "button" } });
  create.addEventListener("click", () => {
    const id = newCustomMapId();
    const cells = CUSTOM_MAP_SIZES[Number(size.value)]?.cells ?? 64;
    openSheet(
      M.newSheet({
        id,
        name: name.value.trim().slice(0, 32) || "Untitled Front",
        author: ctx.name,
        cells,
        maxPlayers: Number(players.value),
        hills: relief.value === "hills",
        seed: id,
      }),
      true,
    );
    say("Place a start for every player, then save.");
    mountOrRefresh(ctx);
  });
  row.append(create);
  if (sheet) {
    const cancel = el("button", { class: "btn btn-ghost", text: "Cancel", attrs: { type: "button" } });
    cancel.addEventListener("click", () => {
      newOpen = false;
      mountOrRefresh(ctx);
    });
    row.append(cancel);
  }
  panel.append(row, el("p", { class: "bld-hint", text: "Or open a map from the list on the right: edit one of yours, or copy any map." }));
  wrap.append(panel);
  return wrap;
}

function header(ctx: Ctx): HTMLElement {
  const head = el("div", { class: "bld-head" });
  head.append(el("h1", { text: "MAP BUILDER" }));
  const s = sheet;
  if (s && !newOpen) {
    const nameField = el("div", { class: "bld-field" });
    const name = el("input", { attrs: { type: "text", maxlength: "32" } });
    name.value = s.name;
    name.addEventListener("input", () => {
      s.name = name.value;
      dirty = true;
      edits++;
      paintChecks();
    });
    nameField.append(el("label", { text: "Name" }), name);
    const playersField = el("div", { class: "bld-field" });
    const players = el("select");
    for (let n = CUSTOM_MAP_MIN_PLAYERS; n <= CUSTOM_MAP_MAX_PLAYERS; n++) {
      const o = el("option", { text: `${n}`, attrs: { value: String(n) } });
      if (n === s.maxPlayers) o.selected = true;
      players.append(o);
    }
    players.addEventListener("change", () => {
      pushUndo();
      const dropped = M.setMaxPlayers(s, Number(players.value));
      if (dropped) say(`Removed ${dropped} start(s) numbered above ${s.maxPlayers}.`);
      finishStroke();
      mountOrRefresh(ctx);
    });
    playersField.append(el("label", { text: "Max players" }), players);
    const shroud = el("input", { attrs: { type: "checkbox" } });
    shroud.checked = s.shroud;
    shroud.addEventListener("change", () => {
      pushUndo();
      s.shroud = shroud.checked;
      finishStroke();
      say(s.shroud ? "Complete fog of war: unexplored ground starts black." : "Complete fog of war off: the map is known from the start.");
      mountOrRefresh(ctx);
    });
    const shroudLabel = el("label", {
      class: "check bld-auto",
      text: "Complete fog of war",
      attrs: { title: "Players see nothing of the map until their units have explored it" },
    });
    shroudLabel.prepend(shroud);
    const cells = s.width / TILE_SUBDIV;
    const label = CUSTOM_MAP_SIZES.find((z) => z.cells === cells)?.label ?? "";
    head.append(nameField, playersField, shroudLabel, el("div", { class: "bld-size", text: `${label} · ${cells}×${cells} cells` }));
  }
  const note = el("div", { class: `bld-msg ${msg.tone}`, text: msg.text });
  note.hidden = !msg.text;
  head.append(note, el("div", { class: "spacer" }));
  const btn = (text: string, cls: string, onClick: () => void, disabled = false): void => {
    const b = el("button", { class: `btn ${cls}`, text, attrs: { type: "button" } });
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    head.append(b);
  };
  const editing = Boolean(s) && !newOpen;
  btn("New", "btn-ghost", () => {
    if (dirty && sheet && !confirm("Discard unsaved changes to this map?")) return;
    newOpen = true;
    mountOrRefresh(ctx);
  }, newOpen);
  btn("Undo", "btn-ghost", () => step(undo, redo), !editing || undo.length === 0);
  const auto = el("input", { attrs: { type: "checkbox" } });
  auto.checked = autoSave;
  auto.addEventListener("change", () => setAutoSave(auto.checked));
  const autoLabel = el("label", { class: "check bld-auto", text: "Auto save", attrs: { title: "Save changes every 30 seconds" } });
  autoLabel.prepend(auto);
  if (editing) head.append(autoLabel);
  btn("Save", "btn-primary", () => save(ctx), !editing);
  btn("Save copy", "", () => save(ctx, { copy: true }), !editing);
  btn("Play test", "", () => playtest(ctx), !editing);
  btn("Back", "btn-ghost", () => {
    if (dirty && sheet && !confirm("Leave with unsaved changes? They stay here until you open another map.")) return;
    ctx.goto("menu");
  });
  if (stage) stage.msg = note;
  return head;
}

/** Slide the stage while arrow keys are held; stops itself when they are released. */
function panFrame(t: number): void {
  const dt = panLastT ? Math.min(0.05, (t - panLastT) / 1000) : 0;
  panLastT = t;
  if (!stage || !sheet || newOpen || ctxRef?.screen !== "builder") panKeys.clear();
  if (panKeys.size === 0) {
    panRaf = 0;
    panLastT = 0;
    return;
  }
  let vx = 0;
  let vy = 0;
  if (panKeys.has("ArrowUp")) vy -= 1;
  if (panKeys.has("ArrowDown")) vy += 1;
  if (panKeys.has("ArrowLeft")) vx -= 1;
  if (panKeys.has("ArrowRight")) vx += 1;
  if (vx || vy) {
    const step = (KEY_PAN_SPEED * dt) / Math.hypot(vx, vy);
    if (gameView) {
      if (isoCam.zoom > 0) {
        isoCam.camX += (vx * step) / isoCam.zoom;
        isoCam.camY += (vy * step) / isoCam.zoom;
      }
    } else {
      // The camera moves toward the arrow, so the map slides the other way.
      view.px -= vx * step;
      view.py -= vy * step;
    }
    queueDraw();
  }
  panRaf = requestAnimationFrame(panFrame);
}

function bindKeys(): void {
  if (keysBound) return;
  keysBound = true;
  window.addEventListener("keyup", (e) => panKeys.delete(e.key));
  window.addEventListener("blur", () => panKeys.clear());
  window.addEventListener("keydown", (e) => {
    const ctx = ctxRef;
    if (!stage || !sheet || newOpen || !ctx || ctx.screen !== "builder") return;
    const target = e.target as HTMLElement | null;
    // A ticked checkbox (Auto save, In-game view) keeps focus but takes no typed keys.
    const checkbox = target instanceof HTMLInputElement && target.type === "checkbox";
    if (target && !checkbox && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
    if (e.key.startsWith("Arrow") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      panKeys.add(e.key);
      if (!panRaf) panRaf = requestAnimationFrame(panFrame);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) step(redo, undo);
      else step(undo, redo);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      step(redo, undo);
    } else if (e.key === "Escape" && unitMode) {
      setUnitMode(null);
    } else if (e.key === "Enter" && unitMode === "patrol") {
      e.preventDefault();
      if (patrolDraft.points.length > 0) commitPatrol();
      else setUnitMode(null);
    } else if ((e.key === "r" || e.key === "R") && (selected?.kind === "unit" || selectedTower())) {
      setUnitMode(selectedTower() ? "spot" : "rotate");
    } else if ((e.key === "y" || e.key === "Y") && (selected?.kind === "unit" || selectedTower())) {
      setUnitMode("patrol");
    } else if (e.key === "Enter" && lineTool() && line.points.length > 0) {
      e.preventDefault();
      commitLine();
    } else if (e.key === "Escape" && tool.id !== "select") {
      // Esc puts down whatever was being placed or painted, line and all, and picks up Select.
      if (drag?.kind === "line") drag = null;
      dropLine();
      say("");
      setTool(ctx, { id: "select" });
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === "Escape" && selected) {
      selected = null;
      unitMode = null;
      say("");
      paintSelection();
      queueDraw();
    } else if (e.key === "v" || e.key === "V") {
      setTool(ctx, { id: "select" });
    } else if ((e.key === "r" || e.key === "R") && tool.id === "select") {
      turnSelected();
      paintSelection();
    } else if ((e.key === "r" || e.key === "R") && turningTool()) {
      setTool(ctx, { turn: M.wrapTurn(tool.turn + M.QUARTER_TURN) });
    } else if (e.key === "r" || e.key === "R") {
      setTool(ctx, { facing: (tool.facing + 1) & 3 });
    } else if (e.key === "[" && tool.id === "road") {
      tool.roadWidth = Math.max(M.ROAD_WIDTH_MIN, tool.roadWidth - 1);
      mountOrRefresh(ctx);
    } else if (e.key === "]" && tool.id === "road") {
      tool.roadWidth = Math.min(M.ROAD_WIDTH_MAX, tool.roadWidth + 1);
      mountOrRefresh(ctx);
    } else if (e.key === "[") {
      tool.brush = Math.max(0, tool.brush - 1);
      mountOrRefresh(ctx);
    } else if (e.key === "]") {
      tool.brush = Math.min(24, tool.brush + 1);
      mountOrRefresh(ctx);
    }
  });
}

function mountOrRefresh(ctx: Ctx): void {
  const root = stage?.root.parentElement;
  if (!root) return;
  root.innerHTML = "";
  renderBuilder(root, ctx);
}

/** Map list changed on the hub. Keeps the canvas and any half-typed name. */
export function refreshBuilder(ctx: Ctx): void {
  paintMapList(ctx);
}

export function renderBuilder(root: HTMLElement, ctx: Ctx): void {
  ctxRef = ctx;
  bindKeys();
  autoTimer ??= setInterval(autoTick, AUTO_SAVE_MS);
  if (!sheet) newOpen = true;
  const screen = el("div", { class: "screen", attrs: { id: "builder-root" } });
  const wrap = el("div", { class: "builder" });
  const canvas = el("canvas");
  const status = el("div", { class: "bld-status", text: statusHint() });
  stage = { root: screen, canvas, status, preview: null, msg: el("div"), checks: null, maps: null, sel: null, turnLabel: null };
  wrap.append(header(ctx));
  const tools = toolsPanel(ctx);
  paintSelection();
  if (!sheet || newOpen) tools.style.visibility = "hidden";
  const stageBox = el("div", { class: "bld-stage panel" });
  stageBox.append(canvas, status);
  if (!sheet || newOpen) stageBox.append(newForm(ctx));
  else stageBox.append(viewToggles());
  wrap.append(tools, stageBox, sidePanel(ctx));
  screen.append(wrap);
  root.append(screen);

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  // Losing capture (alt-tab, a dialog) ends the stroke instead of leaving a brush stuck down.
  canvas.addEventListener("lostpointercapture", onUp);
  canvas.addEventListener("pointerleave", () => {
    pointerOver = false;
    hover = { ...hover, inside: false };
    queueDraw();
  });
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  paintMapList(ctx);
  paintChecks();
  requestAnimationFrame(() => {
    drawStage();
    schedulePreview(0);
  });
}
