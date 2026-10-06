import {
  HEIGHT_MAX,
  ISO_ELEVATION,
  ISO_TILE_H,
  ISO_TILE_W,
  SPAWN_PAD_R,
  SPOTLIGHT_HALF_DEG,
  SPOTLIGHT_REACH_TILES,
  TOWER_EYE_HEIGHT,
  TILE_SIZE,
  isGroveTile,
  catalog,
  featureAngle,
  facingToIso,
  featureBox,
  featureLotSite,
  featureRect,
  fieldSpan,
  hasSpotlight,
  bridgeBrickLength,
  bridgeWidth,
  isMapBridge,
  isMapLine,
  isMapSection,
  TILE_WATER,
  isScrapTile,
  isoDepth,
  isoLift,
  isoToWorld,
  peakHeight,
  worldToIso,
  type IsoPt,
  type ClutterType,
  type LampType,
  type MapDef,
  type MapFeature,
  type MapUnit,
  type TrainType,
} from "@gridlock/shared";
import { buildingGroundElev } from "../render/building-ground.js";
import { decorFor } from "../render/decor.js";
import { NIGHT_SHADE_MAX, STREET_LAMPS, beamPolygon, spotBeamGround } from "../render/night.js";
import { paintNight, type NightHalo, type NightLayers, type NightLightPool } from "../render/night-paint.js";
import { drawSandbags } from "../render/sandbags.js";
import { drawBarbwire } from "../render/barbwire.js";
import { drawGunRow } from "../render/ciws.js";
import { brickDeckElev, drawBrick, layoutBridges, type BrickIn, type BrickLayout } from "../render/bridge.js";
import {
  BUSH_FACES,
  CLUTTER_SPRITES,
  LAMP_SPRITES,
  groveFaces,
  SIGN_FACES,
  STUMP_FACES,
  TEETH_SPRITE,
  buildingGroundFor,
  buildingSpriteFor,
  drawBuildingSprite,
  drawPropSprite,
  drawUnitSprite,
  gunLayerFor,
  NEUTRAL_UNIT_FILTER,
  spriteFor,
  spriteReady,
  type PropSprite,
} from "../render/sprites.js";
import {
  bakeTerrain,
  forgetTerrain,
  restampTiles,
  treePropKind,
  whenTerrainArtReady,
  type ScrapCell,
  type TerrainBake,
} from "../render/terrain.js";
import { SCRAP_SOFT_REACH } from "../render/scrap-field.js";
import { treeStamp } from "../render/tree-burn.js";
import { WALL_STYLE, drawWall, wallJoins, wallTopElev, type WallSection } from "../render/wall.js";
import type { IsoCam } from "./builder-iso-cam.js";
import { brickDeck, liveClutter, liveLamps, type Dirty, type Sheet } from "./builder-model.js";

/**
 * The Map Builder's "In-game view": the sheet drawn the way a match draws it
 * (baked 2:1 ground, trees, dress, building sprites, sandbag, wire, and wall lines, teeth),
 * with clicks picked on the raised ground the way the battlefield picks them.
 */

/** Bake id. Kept apart from the side preview's so neither evicts the other. */
const ISO_ID = "__builder_iso__";

export interface IsoOverlay {
  selectedFeature: number;
  hoverFeature: number;
  selectedSpawn: number;
  /** What the placing tools would set down: one building, or the pieces of a drawn line. */
  ghosts: { f: MapFeature; bad: boolean }[];
  /** World-space lanes of a road being drawn, one quad per leg. */
  road?: { x: number; y: number }[][];
  /** World point a drawn line starts from. */
  lineStart: { x: number; y: number } | null;
  spawnGhost: { x: number; y: number; bad: boolean } | null;
  brush: { x: number; y: number; r: number } | null;
  /** Where the Street lamps tool would stand a post. */
  lampGhost?: { x: number; y: number; type: LampType; bad: boolean } | null;
  /** Where the Clutter tool would stand a piece. */
  clutterGhost?: { x: number; y: number; type: ClutterType; bad: boolean } | null;
  /** Draw the field at full dark: lamps burning, tower spotlights on. */
  night?: boolean;
  /** The sheet's neutral units and what the Units tools show about them. */
  units?: UnitOverlay;
}

/** Fine-tile points of a patrol route, as the builder holds them. */
export interface RouteDraw {
  /** Where the walk starts: the unit's own tile. Left out of a loop's ring. */
  from: { x: number; y: number };
  points: readonly { x: number; y: number }[];
  loop: boolean;
  /** The live leg runs to this tile while a route is being drawn. */
  cursor?: { x: number; y: number } | null;
  /** Drawn bright: the selected unit's route, or the one being drawn. */
  strong: boolean;
}

export interface UnitOverlay {
  list: readonly MapUnit[];
  selected: number;
  hover: number;
  /** The unit the Units tool would stand on the cursor tile. */
  ghost: { type: TrainType; x: number; y: number; facing: number; bad: boolean } | null;
  routes: readonly RouteDraw[];
  /** Men inside a building, by feature index, for its badge. */
  garrisons: ReadonlyMap<number, { count: number; cap: number }>;
  /** A rotate order's aim: the selected unit turns toward this tile. */
  aim: { x: number; y: number } | null;
  /** Spotlight beams to outline: a Watch Tower's or a Battle Ship's, from world point (x, y), heading in radians. */
  beams: readonly SpotBeam[];
}

export interface SpotBeam {
  x: number;
  y: number;
  facing: number;
  /** The selected lamp, or the one being aimed: drawn bright. */
  strong: boolean;
}

/** A spotlight's reach on the ground, outlined as the match outlines a tower's beam while you turn it. */
function drawBeam(c: CanvasRenderingContext2D, s: Sheet, b: SpotBeam, zoom: number): void {
  const reach = SPOTLIGHT_REACH_TILES * TILE_SIZE;
  const half = (SPOTLIGHT_HALF_DEG * Math.PI) / 180;
  const pts = beamPolygon(b.x, b.y, b.facing, reach, half, 16).map((p) => at(p.x, p.y, groundAt(s, p.x, p.y)));
  c.save();
  c.globalAlpha = b.strong ? 1 : 0.5;
  quadPath(c, pts);
  c.fillStyle = "rgba(255, 226, 150, 0.16)";
  c.fill();
  c.setLineDash([5 / zoom, 6 / zoom]);
  c.lineWidth = 1.5 / zoom;
  c.strokeStyle = "rgba(255, 226, 150, 0.85)";
  c.stroke();
  c.restore();
}

/** Draw one neutral unit as the battlefield draws it, greyed. False while its art loads. */
function drawMapUnit(c: CanvasRenderingContext2D, s: Sheet, u: { type: TrainType; x: number; y: number; facing: number }, alpha = 1): boolean {
  const def = spriteFor(u.type);
  const p = at((u.x + 0.5) * TILE_SIZE, (u.y + 0.5) * TILE_SIZE, heightOf(s, u.x, u.y));
  const facing = (u.facing * Math.PI) / 180;
  if (!def) {
    c.fillStyle = "#8c8c88";
    c.beginPath();
    c.arc(p.x, p.y - 4, 4, 0, Math.PI * 2);
    c.fill();
    return true;
  }
  const dir = facingToIso(facing, TILE_SIZE);
  c.save();
  c.globalAlpha = alpha;
  c.filter = NEUTRAL_UNIT_FILTER;
  const drawn = drawUnitSprite(c, def, p.x, p.y, dir.x, dir.y, { moving: false, id: 0, now: 0, facing, turretFacing: facing });
  c.restore();
  return drawn;
}

/** A ring on the ground round a unit's tile. */
function unitRing(c: CanvasRenderingContext2D, s: Sheet, x: number, y: number, color: string, zoom: number, dashed = false): void {
  c.strokeStyle = color;
  c.lineWidth = 2 / zoom;
  if (dashed) c.setLineDash([4 / zoom, 3 / zoom]);
  quadPath(c, groundRing(s, x, y, 1.6));
  c.stroke();
  c.setLineDash([]);
}

let terrain: TerrainBake | null = null;
/** Sheet whose arrays the bake was made from; another sheet means a fresh bake. */
let bakedFor: Sheet | null = null;
/** Ground the bake shows, so a settled edit repaints only what differs. */
let seenTiles: Uint8Array | null = null;
let seenHeights: Int16Array | null = null;
let seenGround: Uint8Array | null = null;
let seenPeak = 0;
/** The sheet may differ from the bake; compare before the next frame. */
let unsynced = true;
let rebakeAll = true;
let artHooked = false;
/** A settled change over more of the sheet than this is baked whole instead of restamped. */
const RESTAMP_SHARE = 0.3;

/** Scratch canvases for the night pass. */
const nightLayers: NightLayers = {};
/** Tower beam colour and strength, as the battlefield lights a manned tower. */
const TOWER_BEAM = { rgb: "255, 236, 180", cut: 0.7, warm: 0.2 };

const DECOR_FACES: Record<string, readonly PropSprite[]> = {
  bush: BUSH_FACES,
  sign: SIGN_FACES,
  stump: STUMP_FACES,
};

/** The sheet as a map, sharing its arrays: cheap enough to make every frame. */
function liveMap(s: Sheet): MapDef {
  return {
    id: ISO_ID,
    name: s.name,
    width: s.width,
    height: s.height,
    tileSize: TILE_SIZE,
    tiles: s.tiles,
    heights: s.heights,
    maxHeight: peakHeight(s.heights),
    ground: s.ground,
    spawns: s.spawns,
    features: s.features,
  };
}

function scrapOf(s: Sheet): ScrapCell[] {
  const out: ScrapCell[] = [];
  for (let i = 0; i < s.tiles.length; i++) if (isScrapTile(s.tiles[i])) out.push({ x: i % s.width, y: (i / s.width) | 0 });
  return out;
}

/** The sheet changed (a stroke ended, undo, a placement): the next frame repaints what differs. */
export function isoChanged(): void {
  unsynced = true;
}

function restampBox(s: Sheet, x0: number, y0: number, x1: number, y1: number, spread?: number): void {
  if (!terrain) return;
  const idx: number[] = [];
  const ax = Math.max(0, x0);
  const ay = Math.max(0, y0);
  const bx = Math.min(s.width, x1);
  const by = Math.min(s.height, y1);
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) idx.push(y * s.width + x);
  restampTiles(terrain, liveMap(s), idx, scrapOf(s), spread);
}

/** Repaint just the ground a brush touched, so a stroke shows while it is drawn. */
export function isoRestamp(s: Sheet, box: Dirty): void {
  if (!terrain || bakedFor !== s || rebakeAll || box.x1 <= box.x0) return;
  restampBox(s, box.x0 - 1, box.y0 - 1, box.x1 + 1, box.y1 + 1);
}

function remember(s: Sheet): void {
  seenTiles = Uint8Array.from(s.tiles);
  seenHeights = Int16Array.from(s.heights);
  seenGround = Uint8Array.from(s.ground);
  seenPeak = peakHeight(s.heights);
}

/**
 * Bring the bake up to the sheet. Only the box that differs from the last
 * bake is restamped: a whole Vast bake takes seconds, one house's lot does not.
 */
function sync(s: Sheet): void {
  unsynced = false;
  if (!seenTiles || !seenHeights || !seenGround || seenTiles.length !== s.tiles.length) {
    rebakeAll = true;
    return;
  }
  const w = s.width;
  let x0 = w;
  let y0 = s.height;
  let x1 = -1;
  let y1 = -1;
  let scrap = false;
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i]!;
    if (t === seenTiles[i] && s.heights[i] === seenHeights[i] && s.ground[i] === seenGround[i]) continue;
    if (isScrapTile(t) || isScrapTile(seenTiles[i])) scrap = true;
    const x = i % w;
    const y = (i / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return;
  // A taller peak needs a taller atlas.
  if (peakHeight(s.heights) > seenPeak || (x1 - x0 + 1) * (y1 - y0 + 1) > s.tiles.length * RESTAMP_SHARE) {
    rebakeAll = true;
    return;
  }
  // A scrap yard's rim is blurred a few tiles past its cells.
  const rim = scrap ? SCRAP_SOFT_REACH : 1;
  restampBox(s, x0 - rim, y0 - rim, x1 + 1 + rim, y1 + 1 + rim, scrap ? 1.1 : undefined);
  remember(s);
}

function ensureBake(s: Sheet, redraw: () => void): TerrainBake | null {
  if (!artHooked) {
    artHooked = true;
    // Ground art still loading bakes plain; bake again once it is in.
    whenTerrainArtReady(() => {
      rebakeAll = true;
      redraw();
    });
  }
  if (bakedFor !== s) rebakeAll = true;
  else if (unsynced) sync(s);
  if (terrain && !rebakeAll) return terrain;
  forgetTerrain(ISO_ID);
  terrain = bakeTerrain(liveMap(s), scrapOf(s));
  bakedFor = s;
  rebakeAll = false;
  unsynced = false;
  remember(s);
  return terrain;
}

function heightOf(s: Sheet, tx: number, ty: number): number {
  const x = Math.max(0, Math.min(s.width - 1, tx));
  const y = Math.max(0, Math.min(s.height - 1, ty));
  return s.heights[y * s.width + x] ?? 0;
}

/** Iso point of a world point at an elevation. */
function at(wx: number, wy: number, elev: number): IsoPt {
  const p = worldToIso(wx, wy, TILE_SIZE);
  return { x: p.x, y: p.y - isoLift(elev) };
}

function groundAt(s: Sheet, wx: number, wy: number): number {
  return heightOf(s, Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
}

interface Item {
  z: number;
  run: () => void;
}

function quadPath(c: CanvasRenderingContext2D, pts: readonly IsoPt[]): void {
  c.beginPath();
  c.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
  c.closePath();
}

/** Height a lot stands at: its lowest visible corner, as a placed building's. */
function lotElev(s: Sheet, f: MapFeature): number {
  const site = featureLotSite(f);
  return buildingGroundElev(s.heights, s.width, s.height, site.tx, site.ty, site.w, site.h);
}

/** A map bridge brick as the layout reads it. */
function brickOf(s: Sheet, f: MapFeature): BrickIn | null {
  if (!isMapBridge(f.type)) return null;
  const span = { x: (f.x + 0.5) * TILE_SIZE, y: (f.y + 0.5) * TILE_SIZE, facing: featureAngle(f), length: bridgeBrickLength(f.type) };
  return { type: f.type, span, width: bridgeWidth(f.type), deck: brickDeck(s, f) };
}

function wetAt(s: Sheet, wx: number, wy: number): boolean {
  return s.tiles[Math.floor(wy / TILE_SIZE) * s.width + Math.floor(wx / TILE_SIZE)] === TILE_WATER;
}

/** Every bridge brick among `list`, laid out together so each meets its neighbours. */
function bridgeLayouts(s: Sheet, list: readonly MapFeature[]): Map<MapFeature, { brick: BrickIn; layout: BrickLayout }> {
  const feats: MapFeature[] = [];
  const bricks: BrickIn[] = [];
  for (const f of list) {
    const b = brickOf(s, f);
    if (!b) continue;
    feats.push(f);
    bricks.push(b);
  }
  const layout = layoutBridges(bricks, (x, y) => wetAt(s, x, y));
  const out = new Map<MapFeature, { brick: BrickIn; layout: BrickLayout }>();
  feats.forEach((f, i) => out.set(f, { brick: bricks[i]!, layout: layout[i]! }));
  return out;
}

function paintBrick(c: CanvasRenderingContext2D, s: Sheet, look: { brick: BrickIn; layout: BrickLayout }, seed: number): void {
  drawBrick(c, {
    ...look.layout,
    type: look.brick.type,
    span: look.brick.span,
    width: look.brick.width,
    project: (wx, wy, e) => at(wx, wy, e),
    ground: (wx, wy) => groundAt(s, wx, wy),
    wet: (wx, wy) => wetAt(s, wx, wy),
    seed,
  });
}

/** World units a block of teeth is drawn across, the battlefield's size for it. */
const TEETH_DRAW_WORLD = 56;

/** The feature's real ground, turned as it stands, `pad` world px out from its edge. */
function boxCorners(s: Sheet, f: MapFeature, pad = 0, bridge?: BrickLayout): { pts: IsoPt[]; elev: number } {
  const ts = TILE_SIZE;
  const r = featureRect(f);
  const elev = bridge ? brickDeckElev(bridge, 0.5) : isMapLine(f.type) ? groundAt(s, r.cx * ts, r.cy * ts) : lotElev(s, f);
  const hu = r.halfU * ts + pad;
  const hv = r.halfV * ts + pad;
  const pts = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) =>
    at(r.cx * ts + a * hu * r.ux + b * hv * r.vx, r.cy * ts + a * hu * r.uy + b * hv * r.vy, elev),
  );
  return { pts, elev };
}

/** A building or defence as the battlefield draws it. False when its art has not loaded. */
function drawFeature(c: CanvasRenderingContext2D, s: Sheet, f: MapFeature, sections: readonly WallSection[]): boolean {
  const ts = TILE_SIZE;
  const facing = featureAngle(f);
  if (isMapSection(f.type)) {
    const span = fieldSpan(f.type);
    if (!span) return true;
    const x = (f.x + 0.5) * ts;
    const y = (f.y + 0.5) * ts;
    const section: WallSection = { x, y, facing, length: span.length, thick: span.thick };
    const kin = sections.filter((o) => o.thick === span.thick);
    const elev = groundAt(s, x, y);
    const step = worldToIso(10, 0, ts);
    const worldPx = Math.hypot(step.x, step.y) / 10;
    if (f.type === "sandbags") {
      drawSandbags(c, {
        x,
        y,
        facing,
        length: span.length,
        thick: span.thick,
        ruined: false,
        seed: (f.x * 73856093) ^ (f.y * 19349663),
        alpha: 1,
        joins: wallJoins(section, kin),
        project: (wx, wy, up) => {
          const p = at(wx, wy, elev);
          return { x: p.x, y: p.y - up * worldPx };
        },
      });
      return true;
    }
    if (f.type === "barbwire") {
      drawBarbwire(c, {
        x,
        y,
        facing,
        length: span.length,
        thick: span.thick,
        ruined: false,
        seed: (f.x * 73856093) ^ (f.y * 19349663),
        alpha: 1,
        project: (wx, wy, up) => {
          const p = at(wx, wy, elev);
          return { x: p.x, y: p.y - up * worldPx };
        },
      });
      return true;
    }
    if (f.type === "teeth") {
      // One pyramid on the spot, as the battlefield draws it.
      if (!spriteReady(TEETH_SPRITE)) return false;
      const p = at(x, y, elev);
      const dir = facingToIso(facing, ts);
      drawUnitSprite(c, { ...TEETH_SPRITE, drawSize: Math.max(28, worldPx * TEETH_DRAW_WORLD) }, p.x, p.y, dir.x, dir.y, {
        moving: false,
        id: 0,
        now: 0,
        facing,
      });
      return true;
    }
    const tx = -Math.sin(facing);
    const ty = Math.cos(facing);
    const grounds = [-1, 0, 1].map((k) => groundAt(s, x + (tx * k * span.length) / 2, y + (ty * k * span.length) / 2));
    const slabLevels = (WALL_STYLE.slabH * worldPx) / ISO_ELEVATION;
    drawWall(c, {
      x,
      y,
      facing,
      length: span.length,
      thick: span.thick,
      hurt: 0,
      seed: (f.x * 73856093) ^ (f.y * 19349663),
      alpha: 1,
      ground: (wx, wy) => groundAt(s, wx, wy),
      topElev: wallTopElev(grounds, slabLevels),
      levelPx: ISO_ELEVATION,
      worldPx,
      project: (wx, wy, e) => at(wx, wy, e),
      joins: wallJoins(section, kin),
      style: WALL_STYLE,
    });
    return true;
  }
  // A turned bunker or tower stands on its turned site, as the match raises it.
  const site = featureLotSite(f);
  const elev = lotElev(s, f);
  const south = at((site.tx + site.w) * ts, (site.ty + site.h) * ts, elev);
  const east = at((site.tx + site.w) * ts, site.ty * ts, elev);
  const west = at(site.tx * ts, (site.ty + site.h) * ts, elev);
  const ground = buildingGroundFor(f.type, facing);
  if (ground && spriteReady(ground)) drawBuildingSprite(c, ground, south.x, south.y, east.x - west.x);
  const spr = buildingSpriteFor(f.type, facing);
  if (spr && drawBuildingSprite(c, spr, south.x, south.y, east.x - west.x)) {
    // A crewed gun: the barrel laid the way it is turned, its full crew at it, on the unturned pad.
    const gun = gunLayerFor(f.type);
    if (gun) {
      const def = catalog(f.type);
      const cx = (site.tx + site.w / 2) * ts;
      const cy = (site.ty + site.h / 2) * ts;
      const hw = (def.tileW * ts) / 2;
      const hh = (def.tileH * ts) / 2;
      const ps = at(cx + hw, cy + hh, elev);
      const pe = at(cx + hw, cy - hh, elev);
      const pw = at(cx - hw, cy + hh, elev);
      drawGunRow(c, gun.sheet, gun.pad, ps.x, ps.y, pe.x - pw.x, facing, ts, gun.cols - 1, gun.cols);
    }
    return true;
  }
  // Art still loading: a plain lot so the spot reads.
  const { pts } = boxCorners(s, f);
  c.fillStyle = "rgba(201,162,122,0.8)";
  quadPath(c, pts);
  c.fill();
  return false;
}

function frame(c: CanvasRenderingContext2D, s: Sheet, f: MapFeature, color: string, zoom: number, bridge?: BrickLayout): void {
  const { pts } = boxCorners(s, f, 3, bridge);
  c.setLineDash([6 / zoom, 4 / zoom]);
  c.strokeStyle = color;
  c.lineWidth = 2 / zoom;
  quadPath(c, pts);
  c.stroke();
  c.setLineDash([]);
}

/** A ground circle of `r` tiles around a tile centre, laid on that tile's height. */
function groundRing(s: Sheet, tx: number, ty: number, r: number): IsoPt[] {
  const elev = heightOf(s, tx, ty);
  const cx = (tx + 0.5) * TILE_SIZE;
  const cy = (ty + 0.5) * TILE_SIZE;
  const out: IsoPt[] = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    out.push(at(cx + Math.cos(a) * r * TILE_SIZE, cy + Math.sin(a) * r * TILE_SIZE, elev));
  }
  return out;
}

/** A patrol route on the ground: the walk out from the unit, the clicks, and a ring closed when it loops. */
function drawRoute(c: CanvasRenderingContext2D, s: Sheet, r: RouteDraw, zoom: number): void {
  const pt = (q: { x: number; y: number }): IsoPt => at((q.x + 0.5) * TILE_SIZE, (q.y + 0.5) * TILE_SIZE, heightOf(s, q.x, q.y));
  const path = [r.from, ...r.points];
  if (r.cursor) path.push(r.cursor);
  else if (r.loop && r.points.length > 1) path.push(r.points[0]!);
  if (path.length < 2) return;
  c.save();
  c.globalAlpha = r.strong ? 1 : 0.45;
  c.strokeStyle = "#e8b84a";
  c.lineWidth = (r.strong ? 1.8 : 1.2) / zoom;
  c.setLineDash([6 / zoom, 4 / zoom]);
  c.beginPath();
  path.forEach((q, i) => {
    const p = pt(q);
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  });
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = "#e8b84a";
  r.points.forEach((q, i) => {
    const p = pt(q);
    c.beginPath();
    c.arc(p.x, p.y, (i === 0 && r.loop ? 4.5 : 3) / zoom, 0, Math.PI * 2);
    c.fill();
  });
  c.restore();
}

/**
 * One frame of the in-game view. `c` is already cleared and scaled for the
 * device pixel ratio; `w` × `h` is the stage in CSS pixels. True when some art
 * was still loading and another frame should follow.
 */
/**
 * Every light burning on the sheet at full dark, in iso coordinates: each
 * street lamp's pool and bulb, each tower's spotlight thrown where the map
 * points it (else the way the tower faces), as a manned tower would light it,
 * and each Battle Ship's searchlight.
 */
export function isoNightLights(s: Sheet): { pools: NightLightPool[]; halos: NightHalo[] } {
  const ts = TILE_SIZE;
  // World px of ground to iso px across, as the battlefield sizes its pools.
  const k = (Math.SQRT2 * ISO_TILE_W) / 2 / ts;
  const pools: NightLightPool[] = [];
  const halos: NightHalo[] = [];
  for (const l of liveLamps(s)) {
    const spec = STREET_LAMPS[l.type];
    const wx = (l.x + 0.5) * ts;
    const wy = (l.y + 0.5) * ts;
    const foot = at(wx, wy, heightOf(s, l.x, l.y));
    pools.push({ x: foot.x, y: foot.y, rx: spec.reachTiles * ts * k, a: 1, rgb: spec.rgb, cut: spec.cut, warm: spec.warm });
    const spr = LAMP_SPRITES[l.type];
    const h = spr.image.naturalHeight;
    if (!h) continue;
    const q = spec.drawH / h;
    halos.push({ x: foot.x + (spr.bulbX - spr.contactX) * q, y: foot.y + (spr.bulbY - spr.contactY) * q, r: spec.halo, rgb: spec.rgb, a: 1 });
  }
  const reach = SPOTLIGHT_REACH_TILES * ts;
  const half = (SPOTLIGHT_HALF_DEG * Math.PI) / 180;
  for (const f of s.features) {
    if (!hasSpotlight(f.type)) continue;
    const r = featureRect(f);
    const cx = r.cx * ts;
    const cy = r.cy * ts;
    const heading = f.spot != null ? (f.spot * Math.PI) / 180 : featureAngle(f);
    for (const b of spotBeamGround(cx, cy, heading, reach, half)) {
      const p = at(b.x, b.y, groundAt(s, b.x, b.y));
      pools.push({ x: p.x, y: p.y, rx: b.r * k, a: b.a, rgb: TOWER_BEAM.rgb, cut: TOWER_BEAM.cut, warm: TOWER_BEAM.warm });
    }
    const lens = at(cx, cy, lotElev(s, f) + TOWER_EYE_HEIGHT);
    halos.push({ x: lens.x, y: lens.y, r: 11, rgb: TOWER_BEAM.rgb, a: 0.75 });
  }
  for (const u of s.units) {
    if (u.inside || !hasSpotlight(u.type)) continue;
    const cx = (u.x + 0.5) * ts;
    const cy = (u.y + 0.5) * ts;
    for (const b of spotBeamGround(cx, cy, ((u.spot ?? u.facing) * Math.PI) / 180, reach, half)) {
      const p = at(b.x, b.y, groundAt(s, b.x, b.y));
      pools.push({ x: p.x, y: p.y, rx: b.r * k, a: b.a, rgb: TOWER_BEAM.rgb, cut: TOWER_BEAM.cut, warm: TOWER_BEAM.warm });
    }
  }
  return { pools, halos };
}

export function isoDraw(
  c: CanvasRenderingContext2D,
  s: Sheet,
  cam: IsoCam,
  w: number,
  h: number,
  dpr: number,
  o: IsoOverlay,
  redraw: () => void,
): boolean {
  const bake = ensureBake(s, redraw);
  const z = cam.zoom;
  c.setTransform(dpr * z, 0, 0, dpr * z, -cam.camX * dpr * z, -cam.camY * dpr * z);
  c.imageSmoothingEnabled = z < 1;
  if (bake) c.drawImage(bake.canvas, bake.originX, bake.originY);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "low";

  const view = { x0: cam.camX, y0: cam.camY, x1: cam.camX + w / z, y1: cam.camY + h / z };
  const onScreen = (p: IsoPt, m: number): boolean => p.x > view.x0 - m && p.x < view.x1 + m && p.y > view.y0 - m && p.y < view.y1 + m * 2;
  const map = liveMap(s);
  const items: Item[] = [];
  let loading = false;

  // Tiles under the view, grown by the tallest lift a hill can raise into it.
  const lift = Math.ceil(isoLift(HEIGHT_MAX) / (ISO_TILE_H / 2)) + 4;
  const corners = [
    isoToWorld(view.x0, view.y0, TILE_SIZE),
    isoToWorld(view.x1, view.y0, TILE_SIZE),
    isoToWorld(view.x0, view.y1, TILE_SIZE),
    isoToWorld(view.x1, view.y1, TILE_SIZE),
  ];
  const tx0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x)) / TILE_SIZE) - 2);
  const ty0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y)) / TILE_SIZE) - 2);
  const tx1 = Math.min(s.width - 1, Math.ceil(Math.max(...corners.map((p) => p.x)) / TILE_SIZE) + lift);
  const ty1 = Math.min(s.height - 1, Math.ceil(Math.max(...corners.map((p) => p.y)) / TILE_SIZE) + lift);

  const built = new Set<number>();
  for (const f of s.features) {
    if (isMapLine(f.type)) continue;
    const b = featureBox(f);
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) built.add(y * s.width + x);
  }

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = s.tiles[ty * s.width + tx] ?? 0;
      if (!isGroveTile(tile)) continue;
      const kind = treePropKind(map, tx, ty);
      if (!kind) continue;
      const wx = (tx + 0.5) * TILE_SIZE;
      const wy = (ty + 0.55) * TILE_SIZE;
      const p = at(wx, wy, heightOf(s, tx, ty));
      if (!onScreen(p, 96)) continue;
      const stamp = treeStamp(tx, ty, kind, tile);
      const faces = groveFaces(tile, stamp.pine);
      const spr = faces[stamp.face % faces.length];
      if (!spr) continue;
      items.push({ z: isoDepth(wx, wy), run: () => void (drawPropSprite(c, spr, p.x, p.y, stamp.drawH) || (loading = true)) });
    }
  }

  for (const it of decorFor(map).standing) {
    if (it.tx < tx0 || it.tx > tx1 || it.ty < ty0 || it.ty > ty1 || built.has(it.ty * s.width + it.tx)) continue;
    const spr = DECOR_FACES[it.kind]?.[it.face % (DECOR_FACES[it.kind]?.length || 1)];
    if (!spr) continue;
    const wx = (it.tx + it.ox) * TILE_SIZE;
    const wy = (it.ty + it.oy) * TILE_SIZE;
    const p = at(wx, wy, heightOf(s, it.tx, it.ty));
    if (!onScreen(p, 64)) continue;
    // Bushes sit under everything standing.
    items.push({ z: it.kind === "bush" ? -Infinity : isoDepth(wx, wy), run: () => void drawPropSprite(c, spr, p.x, p.y, it.drawH, it.flip) });
  }

  const sectionsOf = (list: readonly MapFeature[]) =>
    list
      .filter((f) => isMapSection(f.type))
      .map((f): WallSection & { type: string } => {
        const span = fieldSpan(f.type)!;
        return {
          type: f.type,
          x: (f.x + 0.5) * TILE_SIZE,
          y: (f.y + 0.5) * TILE_SIZE,
          facing: featureAngle(f),
          length: span.length,
          thick: span.thick,
        };
      });
  const sections = sectionsOf(s.features);
  const bridges = bridgeLayouts(s, s.features);
  s.features.forEach((f, i) => {
    const look = bridges.get(f);
    if (look) {
      // A bridge lies on the water, under everything that stands.
      items.push({
        z: isoDepth(look.brick.span.x, look.brick.span.y) - 1e7,
        run: () => {
          paintBrick(c, s, look, i + 1);
          if (i === o.selectedFeature) frame(c, s, f, "#e8b84a", z, look.layout);
          else if (i === o.hoverFeature) frame(c, s, f, "rgba(255,244,220,0.7)", z, look.layout);
        },
      });
      return;
    }
    const b = featureBox(f);
    const zKey = isoDepth(((b.x0 + b.x1) / 2) * TILE_SIZE, ((b.y0 + b.y1) / 2) * TILE_SIZE);
    const same = sections.filter((o) => o.type === f.type);
    items.push({
      z: zKey,
      run: () => {
        if (!drawFeature(c, s, f, same)) loading = true;
        if (i === o.selectedFeature) frame(c, s, f, "#e8b84a", z);
        else if (i === o.hoverFeature) frame(c, s, f, "rgba(255,244,220,0.7)", z);
      },
    });
  });

  for (const l of liveLamps(s)) {
    const wx = (l.x + 0.5) * TILE_SIZE;
    const wy = (l.y + 0.5) * TILE_SIZE;
    const p = at(wx, wy, heightOf(s, l.x, l.y));
    if (!onScreen(p, 96)) continue;
    const spr = LAMP_SPRITES[l.type];
    items.push({ z: isoDepth(wx, wy), run: () => void (drawPropSprite(c, spr, p.x, p.y, STREET_LAMPS[l.type].drawH) || (loading = true)) });
  }
  for (const k of liveClutter(s)) {
    const wx = (k.x + 0.5) * TILE_SIZE;
    const wy = (k.y + 0.5) * TILE_SIZE;
    const p = at(wx, wy, heightOf(s, k.x, k.y));
    if (!onScreen(p, 48)) continue;
    const spr = CLUTTER_SPRITES[k.type].whole;
    const flip = ((k.x * 73856093) ^ (k.y * 19349663)) % 2 === 0;
    items.push({ z: isoDepth(wx, wy), run: () => void (drawPropSprite(c, spr, p.x, p.y, spr.drawH, flip) || (loading = true)) });
  }
  const uo = o.units;
  if (uo) {
    uo.list.forEach((u, i) => {
      if (u.inside) return;
      const wx = (u.x + 0.5) * TILE_SIZE;
      const wy = (u.y + 0.5) * TILE_SIZE;
      if (!onScreen(at(wx, wy, heightOf(s, u.x, u.y)), 96)) return;
      items.push({
        z: isoDepth(wx, wy),
        run: () => {
          if (i === uo.selected) unitRing(c, s, u.x, u.y, "#e8b84a", z);
          else if (i === uo.hover) unitRing(c, s, u.x, u.y, "rgba(255,244,220,0.7)", z, true);
          if (!drawMapUnit(c, s, u)) loading = true;
        },
      });
    });
  }

  items.sort((a, b) => a.z - b.z);
  for (const it of items) it.run();

  if (o.night) {
    const lights = isoNightLights(s);
    paintNight(c, nightLayers, NIGHT_SHADE_MAX, lights.pools, lights.halos);
  }

  if (uo) {
    for (const beam of uo.beams) drawBeam(c, s, beam, z);
    for (const route of uo.routes) drawRoute(c, s, route, z);
    if (uo.aim && uo.selected >= 0) {
      const u = uo.list[uo.selected];
      if (u) {
        const a = at((u.x + 0.5) * TILE_SIZE, (u.y + 0.5) * TILE_SIZE, heightOf(s, u.x, u.y));
        const b = at((uo.aim.x + 0.5) * TILE_SIZE, (uo.aim.y + 0.5) * TILE_SIZE, heightOf(s, uo.aim.x, uo.aim.y));
        c.strokeStyle = "#e8b84a";
        c.lineWidth = 1.5 / z;
        c.setLineDash([5 / z, 4 / z]);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        c.setLineDash([]);
      }
    }
    // Men inside a building: a count over its roof, as the match's garrison pips read.
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const [fi, g] of uo.garrisons) {
      const f = s.features[fi];
      if (!f) continue;
      const r = featureRect(f);
      const p = at(r.cx * TILE_SIZE, r.cy * TILE_SIZE, lotElev(s, f));
      const label = `${g.count}/${g.cap}`;
      c.font = `700 ${11 / z}px "Share Tech Mono", monospace`;
      const w = c.measureText(label).width + 10 / z;
      const y = p.y - 42 / z;
      c.fillStyle = "rgba(20,14,10,0.88)";
      c.strokeStyle = "#8c8c88";
      c.lineWidth = 1.5 / z;
      c.beginPath();
      c.roundRect(p.x - w / 2, y - 8 / z, w, 16 / z, 3 / z);
      c.fill();
      c.stroke();
      c.fillStyle = "#e8dcc4";
      c.fillText(label, p.x, y + 0.5 / z);
    }
    if (uo.ghost) {
      const g = uo.ghost;
      unitRing(c, s, g.x, g.y, g.bad ? "#ff5a4a" : "#7dff6a", z);
      if (!drawMapUnit(c, s, g, 0.6)) loading = true;
    }
  }

  if (o.clutterGhost) {
    const g = o.clutterGhost;
    const p = at((g.x + 0.5) * TILE_SIZE, (g.y + 0.5) * TILE_SIZE, heightOf(s, g.x, g.y));
    const spr = CLUTTER_SPRITES[g.type].whole;
    c.save();
    c.globalAlpha = 0.65;
    if (!drawPropSprite(c, spr, p.x, p.y, spr.drawH)) loading = true;
    c.restore();
    c.strokeStyle = g.bad ? "#ff5a4a" : "#7dff6a";
    c.lineWidth = 1.5 / z;
    quadPath(c, groundRing(s, g.x, g.y, 0.5));
    c.stroke();
  }

  if (o.lampGhost) {
    const g = o.lampGhost;
    const tint = g.bad ? "#ff5a4a" : "#7dff6a";
    const p = at((g.x + 0.5) * TILE_SIZE, (g.y + 0.5) * TILE_SIZE, heightOf(s, g.x, g.y));
    c.save();
    c.globalAlpha = 0.6;
    if (!drawPropSprite(c, LAMP_SPRITES[g.type], p.x, p.y, STREET_LAMPS[g.type].drawH)) loading = true;
    c.restore();
    // The ground it will light.
    c.setLineDash([6 / z, 4 / z]);
    c.strokeStyle = tint;
    c.lineWidth = 1.5 / z;
    quadPath(c, groundRing(s, g.x, g.y, STREET_LAMPS[g.type].reachTiles));
    c.stroke();
    c.setLineDash([]);
  }

  // Starts: the Rig's pad and a numbered marker, as the lobby preview marks them.
  const r = Math.max(8, Math.min(16, 12)) / Math.max(0.6, z);
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (const sp of s.spawns) {
    c.setLineDash([6 / z, 4 / z]);
    c.strokeStyle = "rgba(232,184,74,0.8)";
    c.lineWidth = 1.5 / z;
    quadPath(c, groundRing(s, sp.x, sp.y, SPAWN_PAD_R));
    c.stroke();
    c.setLineDash([]);
    const p = at((sp.x + 0.5) * TILE_SIZE, (sp.y + 0.5) * TILE_SIZE, heightOf(s, sp.x, sp.y));
    c.fillStyle = "#140e0a";
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#e8b84a";
    c.lineWidth = 2.5 / z;
    c.stroke();
    if (sp.id === o.selectedSpawn) {
      c.setLineDash([4 / z, 3 / z]);
      c.lineWidth = 2 / z;
      c.beginPath();
      c.arc(p.x, p.y, r + 5 / z, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    c.fillStyle = "#e8b84a";
    c.font = `700 ${Math.round(r * 1.2 * 10) / 10}px "Share Tech Mono", monospace`;
    c.fillText(String(sp.id), p.x, p.y + 1 / z);
  }

  // Ghosts as the match shows a placement: tinted ground, faded art. A drawn line's pieces join each other.
  const ghostSections = sectionsOf(o.ghosts.map((g) => g.f));
  // A ghost bridge meets the bricks already laid, so its ends arch or join as they will.
  const ghostBridges = bridgeLayouts(s, [...o.ghosts.map((g) => g.f), ...s.features]);
  const ghostOrder = [...o.ghosts].sort((a, b) => isoDepth(a.f.x, a.f.y) - isoDepth(b.f.x, b.f.y));
  for (const { f, bad } of ghostOrder) {
    const tint = bad ? "#ff5a4a" : "#7dff6a";
    const look = ghostBridges.get(f);
    const { pts } = boxCorners(s, f, 0, look?.layout);
    c.save();
    c.globalAlpha = 0.28;
    c.fillStyle = tint;
    quadPath(c, pts);
    c.fill();
    c.globalAlpha = 0.55;
    if (look) paintBrick(c, s, look, 1);
    else if (!drawFeature(c, s, f, ghostSections.filter((x) => x.type === f.type))) loading = true;
    c.restore();
    c.strokeStyle = tint;
    c.lineWidth = 2 / z;
    quadPath(c, pts);
    c.stroke();
  }
  for (const quad of o.road ?? []) {
    const pts = quad.map((p) => at(p.x, p.y, groundAt(s, p.x, p.y)));
    c.save();
    c.globalAlpha = 0.45;
    c.fillStyle = "#c4a068";
    quadPath(c, pts);
    c.fill();
    c.restore();
    c.strokeStyle = "#7dff6a";
    c.lineWidth = 2 / z;
    quadPath(c, pts);
    c.stroke();
  }
  if (o.lineStart) {
    // The start of the line, as the match marks it.
    const p = at(o.lineStart.x, o.lineStart.y, groundAt(s, o.lineStart.x, o.lineStart.y));
    const k = 6 / z;
    c.strokeStyle = "#e8b84a";
    c.lineWidth = 1.5 / z;
    quadPath(c, [
      { x: p.x, y: p.y - k },
      { x: p.x + k, y: p.y },
      { x: p.x, y: p.y + k },
      { x: p.x - k, y: p.y },
    ]);
    c.stroke();
  }
  if (o.spawnGhost) {
    c.setLineDash([6 / z, 4 / z]);
    c.strokeStyle = o.spawnGhost.bad ? "#ff5a4a" : "#7dff6a";
    c.lineWidth = 1.5 / z;
    quadPath(c, groundRing(s, o.spawnGhost.x, o.spawnGhost.y, SPAWN_PAD_R));
    c.stroke();
    c.setLineDash([]);
  }
  if (o.brush) {
    c.strokeStyle = "#fff4dc";
    c.lineWidth = 1.5 / z;
    quadPath(c, groundRing(s, o.brush.x, o.brush.y, Math.max(0.5, o.brush.r + 0.5)));
    c.stroke();
  }
  return loading;
}
