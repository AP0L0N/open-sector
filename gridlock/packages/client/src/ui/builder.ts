import "../style/builder.css";
import {
  CIVILIAN_TYPES,
  CUSTOM_MAP_MAX_PLAYERS,
  CUSTOM_MAP_MIN_PLAYERS,
  CUSTOM_MAP_SIZES,
  HEIGHT_BASE,
  HEIGHT_MAX,
  SPAWN_PAD_R,
  DIAMOND_SCRAP_MUL,
  TILE_DIAMOND_SCRAP,
  TILE_EMPTY,
  TILE_FENCE,
  TILE_ROAD,
  TILE_ROCK,
  TILE_SCRAP,
  TILE_SUBDIV,
  TILE_TREE,
  TILE_WATER,
  MAP_DEFENCE_TYPES,
  MAP_SECTION_TILES,
  catalog,
  featureBox,
  getMap,
  isCivilianType,
  isMapSection,
  listMaps,
  loadCustomMap,
  newCustomMapId,
  newPlaytestMapId,
  rollHeights,
  specFromMap,
  type CivilianType,
  type MapDefenceType,
  type MapFeature,
  type MapFeatureType,
} from "@gridlock/shared";
import type { Ctx } from "../ctx.js";
import { forgetTerrain } from "../render/terrain.js";
import { buildingSpriteFor } from "../render/sprites.js";
import grassUrl from "../assets/terrain/grass-meadow.png";
import dirtUrl from "../assets/terrain/ground-dirt.png";
import scrapUrl from "../assets/terrain/scrap-heap-1.png";
import waterUrl from "../assets/terrain/water.png";
import treeUrl from "../assets/terrain/tree-oak-1.png";
import fenceUrl from "../assets/terrain/fence-x.png";
import rockUrl from "../assets/terrain/ground-rock.png";
import { el } from "./dom.js";
import { drawMapPreview } from "./map-preview.js";
import * as M from "./builder-model.js";

const KEY_STORE = "gridlock.mapKey";
const MINE_STORE = "gridlock.myMaps";
const PREVIEW_ID = "__builder__";
const UNDO_DEPTH = 40;
/** Raise / Lower apply one step this often while the button is held. */
const LIFT_EVERY_MS = 70;

type ToolId = "select" | "raise" | "lower" | "level" | "ground" | "house" | "defence" | "spawn" | "erase";

interface GroundKind {
  tile: number;
  name: string;
  img: string;
  hint: string;
}

const GROUND: readonly GroundKind[] = [
  { tile: TILE_EMPTY, name: "Grass", img: grassUrl, hint: "Open ground. Paints over anything." },
  { tile: TILE_ROAD, name: "Road", img: dirtUrl, hint: "Dirt lane. Same footing as grass." },
  { tile: TILE_SCRAP, name: "Scrap", img: scrapUrl, hint: "Scrap field. A Smelter built on it pours scrap for the whole match. Paint at least 3×3." },
  {
    tile: TILE_DIAMOND_SCRAP,
    name: "Diamond Scrap",
    img: scrapUrl,
    hint: `Scrap field with diamonds in it. A Smelter on it pours ${DIAMOND_SCRAP_MUL}× as much. Paint at least 3×3.`,
  },
  { tile: TILE_WATER, name: "Water", img: waterUrl, hint: "Pond. Sinks to the valley floor." },
  { tile: TILE_TREE, name: "Trees", img: treeUrl, hint: "Woods. Block sight and walking." },
  { tile: TILE_FENCE, name: "Fence", img: fenceUrl, hint: "Blocks walking. Shots pass over." },
  { tile: TILE_ROCK, name: "Rock", img: rockUrl, hint: "Rocky slope. Blocks walking, not sight." },
];

interface Tool {
  id: ToolId;
  tile: number;
  house: CivilianType;
  defence: MapDefenceType;
  facing: number;
  brush: number;
  level: number;
}

/** What the Select tool holds: a placed building or defence by index, or a start by number. */
type Selection = { kind: "feature"; index: number } | { kind: "spawn"; id: number };

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
}

let sheet: M.Sheet | null = null;
let dirty = false;
let newOpen = false;
let msg = { text: "", tone: "" as "" | "bad" | "good" };
let pendingSave: string | null = null;
const undo: M.SheetMark[] = [];
const redo: M.SheetMark[] = [];
const tool: Tool = { id: "raise", tile: TILE_WATER, house: "cottage", defence: "bunker", facing: 1, brush: 6, level: HEIGHT_BASE };
let selected: Selection | null = null;
const view = { zoom: 0, px: 0, py: 0 };
let hover: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
let stage: Stage | null = null;
let ground: HTMLCanvasElement | null = null;
let drawQueued = false;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
/** The cached preview bake no longer matches the sheet. */
let previewStale = true;
let keysBound = false;
let ctxRef: Ctx | null = null;

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

function pushUndo(): void {
  if (!sheet) return;
  undo.push(M.markSheet(sheet));
  if (undo.length > UNDO_DEPTH) undo.shift();
  redo.length = 0;
}

function changed(): void {
  dirty = true;
  previewStale = true;
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
    default:
      c = mix(GRASS_LO, GRASS_HI, u);
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

function repaintGround(): void {
  const s = sheet;
  if (!s) return;
  if (!ground || ground.width !== s.width || ground.height !== s.height) {
    ground = document.createElement("canvas");
    ground.width = s.width;
    ground.height = s.height;
  }
  const g = ground.getContext("2d");
  if (!g) return;
  const img = g.createImageData(s.width, s.height);
  const d = img.data;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const [r, gg, b] = tileColor(s, x, y);
      const k = (y * s.width + x) * 4;
      d[k] = r;
      d[k + 1] = gg;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// --- stage drawing -------------------------------------------------------------

/** Fill and edge on the plan: houses in brick, concrete defences in grey, sandbags in burlap. */
function featureColors(type: MapFeatureType): [string, string] {
  if (isCivilianType(type)) return ["#c9a27a", "#2a1810"];
  if (type === "sandbags") return ["#b9a06a", "#3a2c14"];
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

function houseGhost(): MapFeature | null {
  const type = placingType();
  if (!sheet || !type || !hover.inside) return null;
  return M.houseAt(type, hover.x, hover.y, tool.facing);
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
  const c = canvas.getContext("2d");
  if (!c || !ground) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = "#070605";
  c.fillRect(0, 0, w, h);
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
    const b = featureBox(f);
    const x0 = sx(b.x0);
    const y0 = sy(b.y0);
    const bw = (b.x1 - b.x0) * z;
    const bh = (b.y1 - b.y0) * z;
    c.fillStyle = fill;
    c.fillRect(x0, y0, bw, bh);
    c.strokeStyle = edge;
    c.lineWidth = 1.5;
    c.strokeRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1);
    // Door side: 0 east, 1 south, 2 west, 3 north.
    const mx = x0 + bw / 2;
    const my = y0 + bh / 2;
    const reach = Math.min(bw, bh) * 0.42;
    const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][f.facing & 3]!;
    c.fillStyle = edge;
    c.beginPath();
    c.arc(mx + dx! * reach, my + dy! * reach, Math.max(1.5, z * 0.9), 0, Math.PI * 2);
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
    } else if (tool.id !== "erase" && tool.id !== "select") {
      c.strokeStyle = "#fff4dc";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(sx(hover.x + 0.5), sy(hover.y + 0.5), Math.max(2, (tool.brush + 0.5) * z), 0, Math.PI * 2);
      c.stroke();
    }
  }
}

// --- painting --------------------------------------------------------------

type Drag =
  | { kind: "brush"; lastX: number; lastY: number; timer: ReturnType<typeof setInterval> | null }
  | { kind: "spawn"; id: number; moved: boolean }
  | { kind: "move"; index: number; from: MapFeature; startX: number; startY: number; moved: boolean }
  /** A sandbag or wall line: sections end to end along the drag, `done` holds the steps laid. */
  | { kind: "lay"; x0: number; y0: number; axis: "x" | "y" | null; first: number; done: Set<number> }
  | { kind: "pan"; x: number; y: number; px: number; py: number }
  | { kind: "erase" };

let drag: Drag | null = null;

function toTile(e: PointerEvent | WheelEvent): { x: number; y: number; inside: boolean } {
  const rect = stage!.canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left - view.px) / view.zoom);
  const y = Math.floor((e.clientY - rect.top - view.py) / view.zoom);
  const inside = !!sheet && x >= 0 && y >= 0 && x < sheet.width && y < sheet.height;
  return { x, y, inside };
}

function dab(x: number, y: number): void {
  const s = sheet;
  if (!s) return;
  if (tool.id === "ground") M.paintDisk(s, x, y, tool.brush, tool.tile);
  else if (tool.id === "raise") M.liftDisk(s, x, y, tool.brush, 1);
  else if (tool.id === "lower") M.liftDisk(s, x, y, tool.brush, -1);
  else if (tool.id === "level") M.levelDisk(s, x, y, tool.brush, tool.level);
}

function eraseAt(x: number, y: number): boolean {
  const s = sheet;
  if (!s) return false;
  const fi = M.featureIndexAt(s, x, y);
  if (fi >= 0) {
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
    s.features.splice(selected.index, 1);
    say(f ? `${catalog(f.type).name} removed.` : "");
  } else {
    const id = selected.id;
    s.spawns = s.spawns.filter((sp) => sp.id !== id);
    say(`Start ${id} removed.`);
  }
  selected = null;
  finishStroke();
  paintSelection();
}

/** Give the selected building or defence a quarter turn. */
function turnSelected(): void {
  const s = sheet;
  if (!s || selected?.kind !== "feature") return;
  pushUndo();
  const problem = M.turnFeature(s, selected.index);
  if (problem) {
    undo.pop();
    say(`Cannot turn it here: ${problem.toLowerCase()}`, "bad");
    return;
  }
  say("");
  finishStroke();
}

/** Set down one building or defence from the placing tools. False when the spot is refused. */
function placeAt(x: number, y: number, quiet: boolean, facing = tool.facing): boolean {
  const s = sheet;
  const type = placingType();
  if (!s || !type) return false;
  const f = M.houseAt(type, x, y, facing);
  const problem = M.houseProblem(s, f);
  if (problem) {
    if (!quiet) say(problem, "bad");
    return false;
  }
  s.features.push(f);
  return true;
}

/**
 * Grow a sandbag or wall line toward the cursor. The first move past two
 * tiles picks the axis; every section then runs along it, end to end from
 * the press point, looking to the side the tool faces.
 */
function layLine(s: M.Sheet, d: Extract<Drag, { kind: "lay" }>, x: number, y: number): void {
  const dx = x - d.x0;
  const dy = y - d.y0;
  if (!d.axis) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) return;
    d.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
  }
  // Running along x, a section looks north or south (odd facing); along y, east or west.
  const odd = d.axis === "x" ? 1 : 0;
  const facing = (tool.facing & 1) === odd ? tool.facing : (tool.facing + 1) & 3;
  const first = s.features[d.first];
  if (first && first.facing !== facing) {
    const turned = { ...first, facing };
    if (!M.houseProblem(s, turned, d.first)) s.features[d.first] = turned;
  }
  const k = Math.round((d.axis === "x" ? dx : dy) / MAP_SECTION_TILES);
  const dir = Math.sign(k);
  for (let j = dir; dir !== 0 && Math.abs(j) <= Math.abs(k); j += dir) {
    if (d.done.has(j)) continue;
    d.done.add(j);
    const at = j * MAP_SECTION_TILES;
    placeAt(d.axis === "x" ? d.x0 + at : d.x0, d.axis === "y" ? d.y0 + at : d.y0, true, facing);
  }
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
  if (e.button === 1 || e.button === 2) {
    drag = { kind: "pan", x: e.clientX, y: e.clientY, px: view.px, py: view.py };
    return;
  }
  if (e.button !== 0) return;
  const t = toTile(e);
  hover = t;
  if (!t.inside) return;
  if (tool.id === "level" && e.altKey) {
    tool.level = s.heights[t.y * s.width + t.x]!;
    if (ctxRef) mountOrRefresh(ctxRef);
    say(`Level set to ${tool.level}.`);
    return;
  }
  if (tool.id === "erase" || (e.shiftKey && (tool.id === "house" || tool.id === "defence" || tool.id === "spawn" || tool.id === "select"))) {
    pushUndo();
    if (eraseAt(t.x, t.y)) finishStroke();
    else undo.pop();
    drag = { kind: "erase" };
    paintSelection();
    return;
  }
  if (tool.id === "select") {
    const fi = M.featureIndexAt(s, t.x, t.y);
    const si = fi < 0 ? M.spawnIndexAt(s, t.x, t.y) : -1;
    if (fi >= 0) {
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
  if (tool.id === "house" || tool.id === "defence") {
    pushUndo();
    if (!placeAt(t.x, t.y, false)) {
      undo.pop();
      return;
    }
    say("");
    // A sandbag or wall line keeps going while the button is held.
    if (isMapSection(tool.defence) && tool.id === "defence") {
      drag = { kind: "lay", x0: t.x, y0: t.y, axis: null, first: s.features.length - 1, done: new Set([0]) };
    } else finishStroke();
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
  repaintGround();
  queueDraw();
  const lifting = tool.id === "raise" || tool.id === "lower";
  const timer = lifting
    ? setInterval(() => {
        if (!hover.inside) return;
        dab(hover.x, hover.y);
        repaintGround();
        queueDraw();
      }, LIFT_EVERY_MS)
    : null;
  drag = { kind: "brush", lastX: t.x, lastY: t.y, timer };
}

function onMove(e: PointerEvent): void {
  const s = sheet;
  if (!s || !stage) return;
  if (drag?.kind === "pan") {
    view.px = drag.px + (e.clientX - drag.x);
    view.py = drag.py + (e.clientY - drag.y);
    queueDraw();
    return;
  }
  const t = toTile(e);
  const moved = t.x !== hover.x || t.y !== hover.y || t.inside !== hover.inside;
  hover = t;
  if (t.inside) {
    const i = t.y * s.width + t.x;
    stage.status.textContent = `${t.x}, ${t.y} · height ${s.heights[i]} · ${groundName(s.tiles[i]!)}`;
  }
  if (!moved) return;
  if (drag?.kind === "brush" && t.inside && tool.id === "ground") {
    // Fill the gap a fast stroke leaves between two moves.
    const steps = Math.max(1, Math.ceil(Math.hypot(t.x - drag.lastX, t.y - drag.lastY) / Math.max(1, tool.brush / 2)));
    for (let k = 1; k <= steps; k++) {
      dab(Math.round(drag.lastX + ((t.x - drag.lastX) * k) / steps), Math.round(drag.lastY + ((t.y - drag.lastY) * k) / steps));
    }
    drag.lastX = t.x;
    drag.lastY = t.y;
    repaintGround();
  } else if (drag?.kind === "brush" && t.inside && tool.id === "level") {
    dab(t.x, t.y);
    repaintGround();
  } else if (drag?.kind === "erase" && t.inside) {
    if (eraseAt(t.x, t.y)) finishStroke();
  } else if (drag?.kind === "move" && t.inside) {
    // Holds the last spot that fit; a refused one leaves it where it was.
    if (!M.moveFeature(s, drag.index, drag.from, t.x - drag.startX, t.y - drag.startY)) {
      const f = s.features[drag.index]!;
      drag.moved = f.x !== drag.from.x || f.y !== drag.from.y;
    }
  } else if (drag?.kind === "lay" && t.inside) {
    layLine(s, drag, t.x, t.y);
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
  } else if (d.kind === "lay") {
    finishStroke();
  } else if (d.kind === "move") {
    if (!d.moved) {
      undo.pop();
      say("Drag to move it. R turns it, Delete removes it.");
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
  const rect = stage.canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const next = Math.max(0.5, Math.min(24, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  view.px = mx - ((mx - view.px) * next) / view.zoom;
  view.py = my - ((my - view.py) * next) / view.zoom;
  view.zoom = next;
  queueDraw();
}

function groundName(t: number): string {
  return GROUND.find((g) => g.tile === t)?.name.toLowerCase() ?? "blocked";
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
  add("ok", `Buildings: ${s.features.length - defences} · Neutral defences: ${defences}`);
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
  }
  const problem = M.sheetProblem(s);
  if (problem) return say(problem, "bad");
  pendingSave = s.id;
  say("Saving…");
  ctx.net.send({ type: "map.save", map: M.sheetToSpec(s), key: mapKey() });
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
  if (sheet?.id === id) dirty = false;
  say(`Saved "${getMap(id)?.name ?? id}". It is in every lobby's map list now.`, "good");
  if (ctx.screen === "builder") mountOrRefresh(ctx);
}

/** A refusal while a save or delete is in flight lands here instead of the menu banner. */
export function builderError(ctx: Ctx, message: string): boolean {
  if (!stage || ctx.screen !== "builder") return false;
  pendingSave = null;
  say(message, "bad");
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

function section(title: string, ...kids: Node[]): HTMLElement {
  const wrap = el("div", { class: "panel-sub" });
  wrap.append(el("h2", { text: title }), ...kids);
  return wrap;
}

function asset(label: string, sub: string, on: boolean, art: Node, title: string, pick: () => void): HTMLButtonElement {
  const b = el("button", { class: `bld-asset${on ? " is-on" : ""}`, attrs: { type: "button", title } });
  b.append(art, el("span", { text: label }));
  if (sub) b.append(el("small", { text: sub }));
  b.addEventListener("click", pick);
  return b;
}

function houseThumb(type: CivilianType | "bunker" | "tower", facing: number): HTMLCanvasElement {
  const cv = el("canvas");
  cv.width = 96;
  cv.height = 76;
  const def = buildingSpriteFor(type, (facing * Math.PI) / 2);
  const paint = (): void => {
    const g = cv.getContext("2d");
    if (!g || !def) return;
    const img = def.image;
    const k = Math.min(cv.width / img.naturalWidth, cv.height / img.naturalHeight);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(img, (cv.width - img.naturalWidth * k) / 2, (cv.height - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  };
  if (def?.image.complete && def.image.naturalWidth > 0) paint();
  else def?.image.addEventListener("load", paint, { once: true });
  return cv;
}

function setTool(ctx: Ctx, patch: Partial<Tool>): void {
  Object.assign(tool, patch);
  mountOrRefresh(ctx);
}

/** Fill the Select box: what is held, and the buttons that act on it. */
function paintSelection(): void {
  const box = stage?.sel;
  const s = sheet;
  if (!box) return;
  box.innerHTML = "";
  const f = selectedFeature();
  const startId = selected?.kind === "spawn" ? selected.id : 0;
  const start = startId ? s?.spawns.find((sp) => sp.id === startId) : undefined;
  if (!f && !start) {
    box.append(
      el("p", {
        class: "bld-hint",
        text: tool.id === "select" ? "Click a building, defence, or start to pick it up. Drag to move it." : "Pick Select to move or remove what you placed.",
      }),
    );
    return;
  }
  const faces = ["east", "south", "west", "north"];
  const label = f ? `${catalog(f.type).name} · faces ${faces[f.facing & 3]}` : `Start ${start!.id}`;
  box.append(el("div", { class: "bld-sel-name", text: label }));
  const row = el("div", { class: "btn-row" });
  if (f) {
    const turn = el("button", { class: "btn btn-ghost bld-mini", text: "Turn (R)", attrs: { type: "button" } });
    turn.addEventListener("click", () => {
      turnSelected();
      paintSelection();
    });
    row.append(turn);
  }
  const del = el("button", { class: "btn btn-ghost bld-mini", text: "Delete (Del)", attrs: { type: "button" } });
  del.addEventListener("click", () => deleteSelected());
  row.append(del);
  box.append(row);
}

function defenceThumb(type: MapDefenceType, facing: number): HTMLElement {
  if (!isMapSection(type)) return houseThumb(type, facing);
  // Sections are drawn by the battlefield, not from a sheet: a plain mark stands in.
  return el("span", { class: `bld-start-mark bld-${type}`, text: type === "sandbags" ? "▬" : "▮" });
}

function toolsPanel(ctx: Ctx): HTMLElement {
  const panel = el("div", { class: "bld-tools panel" });
  const edit = el("div", { class: "bld-palette" });
  edit.append(
    asset("Select", "move, turn, delete", tool.id === "select", el("span", { class: "bld-start-mark", text: "⬚" }), "Pick up a placed building, defence, or start. Drag to move it, R turns it, Delete removes it.", () =>
      setTool(ctx, { id: "select" }),
    ),
    asset("Eraser", "houses, starts", tool.id === "erase", el("span", { class: "bld-start-mark", text: "✕" }), "Remove buildings, defences, and starts.", () =>
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
  const terrainBtns = el("div", { class: "btn-row" });
  const roll = el("button", { class: "btn btn-ghost bld-mini", text: "Roll hills", attrs: { type: "button" } });
  roll.addEventListener("click", () => {
    const s = sheet;
    if (!s || !confirm("Replace all elevation with fresh rolling hills?")) return;
    pushUndo();
    s.heights = rollHeights(s.width, s.height, `${s.id}:${Date.now()}`, s.spawns);
    finishStroke();
  });
  const flat = el("button", { class: "btn btn-ghost bld-mini", text: "Flatten all", attrs: { type: "button" } });
  flat.addEventListener("click", () => {
    const s = sheet;
    if (!s || !confirm("Flatten the whole map to base height?")) return;
    pushUndo();
    s.heights = s.heights.map(() => HEIGHT_BASE);
    finishStroke();
  });
  terrainBtns.append(roll, flat);
  panel.append(section("Elevation", relief, el("label", { text: "Level height" }), levelRow, terrainBtns));

  const groundPal = el("div", { class: "bld-palette" });
  for (const g of GROUND) {
    const img = el("img", { attrs: { src: g.img, alt: "" } });
    groundPal.append(asset(g.name, "", tool.id === "ground" && tool.tile === g.tile, img, g.hint, () => setTool(ctx, { id: "ground", tile: g.tile })));
  }
  panel.append(section("Ground", groundPal));

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
  panel.append(section("Brush", brushRow, el("p", { class: "bld-hint", text: "[ and ] change the size." })));

  const houses = el("div", { class: "bld-palette" });
  for (const type of CIVILIAN_TYPES) {
    const def = catalog(type);
    const size = `${def.tileW / TILE_SUBDIV}×${def.tileH / TILE_SUBDIV} cells`;
    houses.append(
      asset(def.name, size, tool.id === "house" && tool.house === type, houseThumb(type, tool.facing), def.blurb ?? def.name, () =>
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
      el("p", { class: "bld-hint", text: "Civilian houses. Infantry garrison them; tanks shell them. R turns the door. Shift+click removes." }),
    ),
  );

  const defences = el("div", { class: "bld-palette" });
  for (const type of MAP_DEFENCE_TYPES) {
    const def = catalog(type);
    const size = isMapSection(type) ? "one section" : `${def.tileW / TILE_SUBDIV}×${def.tileH / TILE_SUBDIV} cells`;
    defences.append(
      asset(def.name, size, tool.id === "defence" && tool.defence === type, defenceThumb(type, tool.facing), def.blurb ?? def.name, () =>
        setTool(ctx, { id: "defence", defence: type }),
      ),
    );
  }
  const defFaceRow = el("div", { class: "bld-row" });
  const defTurn = el("button", { class: "btn btn-ghost bld-mini", text: `Faces: ${faces[tool.facing]}`, attrs: { type: "button" } });
  defTurn.addEventListener("click", () => setTool(ctx, { facing: (tool.facing + 1) & 3 }));
  defFaceRow.append(defTurn);
  panel.append(
    section(
      "Defences",
      defences,
      defFaceRow,
      el("p", {
        class: "bld-hint",
        text: "Neutral until taken. Infantry that walk into a bunker or tower take it; a tower's lamp stays dark until someone holds it. Men who take cover at sandbags or a wall claim the section. Drag to lay a sandbag or wall line.",
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
    const cells = s.width / TILE_SUBDIV;
    const label = CUSTOM_MAP_SIZES.find((z) => z.cells === cells)?.label ?? "";
    head.append(nameField, playersField, el("div", { class: "bld-size", text: `${label} · ${cells}×${cells} cells` }));
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

function bindKeys(): void {
  if (keysBound) return;
  keysBound = true;
  window.addEventListener("keydown", (e) => {
    const ctx = ctxRef;
    if (!stage || !sheet || newOpen || !ctx || ctx.screen !== "builder") return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) step(redo, undo);
      else step(undo, redo);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      step(redo, undo);
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === "Escape" && selected) {
      selected = null;
      say("");
      paintSelection();
      queueDraw();
    } else if (e.key === "v" || e.key === "V") {
      setTool(ctx, { id: "select" });
    } else if ((e.key === "r" || e.key === "R") && tool.id === "select") {
      turnSelected();
      paintSelection();
    } else if (e.key === "r" || e.key === "R") {
      setTool(ctx, { facing: (tool.facing + 1) & 3 });
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
  if (!sheet) newOpen = true;
  const screen = el("div", { class: "screen", attrs: { id: "builder-root" } });
  const wrap = el("div", { class: "builder" });
  const canvas = el("canvas");
  const status = el("div", { class: "bld-status", text: "Wheel zooms · right-drag pans · Ctrl+Z undoes · V selects" });
  stage = { root: screen, canvas, status, preview: null, msg: el("div"), checks: null, maps: null, sel: null };
  wrap.append(header(ctx));
  const tools = toolsPanel(ctx);
  paintSelection();
  if (!sheet || newOpen) tools.style.visibility = "hidden";
  const stageBox = el("div", { class: "bld-stage panel" });
  stageBox.append(canvas, status);
  if (!sheet || newOpen) stageBox.append(newForm(ctx));
  wrap.append(tools, stageBox, sidePanel(ctx));
  screen.append(wrap);
  root.append(screen);

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", () => {
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
