import {
  catalog,
  clampIsoCamera,
  cloudScale,
  fires,
  GUARD_CONE_DEG,
  hasNeighbor,
  isCivilianType,
  isInfantryType,
  isStance,
  colorHex,
  entityOnMask,
  facingToIso,
  getMap,
  neighborMap,
  seamInset,
  type HouseLot,
  type NeighborSides,
  TILE_EMPTY,
  TILE_TREE,
  TILE_WATER,
  garrisonWindowLift,
  hasScout,
  isGarrisonable,
  immobilized,
  heightAt,
  isoDepth,
  isoLift,
  isoToWorld,
  maxHeightOf,
  unitBehindIsoBox,
  pickElevatedTile,
  pointInIsoBox,
  previewPlace,
  rangeTilesOf,
  specialOf,
  specialReady,
  tileOnMask,
  visionMaskFromSnapshot,
  worldToIso,
  worldToIso3,
  worldToTile,
  type BuildingType,
  type ClientMessage,
  type EntityType,
  type EntityView,
  type IsoPt,
  type MapDef,
  type MatchSnapshot,
} from "@gridlock/shared";
import {
  FX_BOOM,
  FX_SMOKE,
  drawCookoffBurst,
  drawFxFrame,
  drawGroundMiss,
  drawKineticImpact,
  drawMuzzleBlast,
  drawWindowMuzzle,
  drawRicochetSparks,
  drawRicochetTrace,
  armorHitLift,
  drawMoveClick,
  drawWreckFire,
  fxFrameAt,
  fxLifeMs,
  isShellCaliber,
  MOVE_CLICK_MS,
  wreckFireAlpha,
  wreckFireCount,
} from "./fx.js";
import {
  UNIT_VISUAL_SCALE,
  TREE_OAK,
  TREE_PINE,
  buildingOccludeEz,
  buildingSpriteFor,
  buildingStackAt,
  critIcon,
  drawBuildingSprite,
  drawPropSprite,
  drawScoutHead,
  drawUnitSprite,
  snapHitToUnitSprite,
  spriteFor,
  spriteReady,
  unitHitsBuildingSprite,
  type BuildingSpriteDef,
  type UnitSpriteDef,
} from "./sprites.js";
import {
  blitAtlas,
  blitTerrain,
  bakeMini,
  bakeTerrain,
  coverTile,
  fillElevatedTile,
  restampMini,
  restampTiles,
  resetTerrainCache,
  treePropKind,
  updateMiniScrap,
  updateScrap,
  whenTerrainArtReady,
  type MiniBake,
  type TerrainBake,
} from "./terrain.js";

/** Special-action key. D pans with W and the arrow keys; A/S are orders. */
export const SPECIAL_HOTKEY = "e";
export const STOP_HOTKEY = "s";
export const ATTACK_MOVE_HOTKEY = "a";
export const ROTATE_HOTKEY = "r";
export const GUARD_HOTKEY = "g";
/** Enter / leave a garrisonable building. */
export const GARRISON_HOTKEY = "u";

const EDGE_SCROLL_KEY = "gridlock.edgeScroll";
let edgeScroll = localStorage.getItem(EDGE_SCROLL_KEY) === "1";

/** Screen-edge camera pan. Off by default; arrows, W, and D always work. */
export function getEdgeScroll(): boolean {
  return edgeScroll;
}

export function setEdgeScroll(on: boolean): void {
  edgeScroll = on;
  localStorage.setItem(EDGE_SCROLL_KEY, on ? "1" : "0");
}

const EXTRUDE: Record<EntityType, number> = {
  core: 62,
  smelter: 50,
  armory: 44,
  muster: 38,
  dynamo: 30,
  rig: 22,
  hauler: 16,
  warden: 28,
  trooper: 26,
  cottage: 28,
  shack: 24,
  house: 36,
  barn: 38,
  inn: 36,
  chapel: 42,
  manor: 48,
};

const CIV_FILL = "#b08968";
const HP_FILL_OK = "#6aaa58";
const HP_FILL_MID = "#b8923c";
const HP_FILL_LOW = "#b45448";
const HP_FILL_HOSTILE = "#d24c44";
const HP_FILL_OK_VIVID = "#8fe86a";
const HP_FILL_MID_VIVID = "#f0c44a";
const HP_FILL_LOW_VIVID = "#f25a48";
const HP_FILL_HOSTILE_VIVID = "#ff5a4a";
/** Sprite alpha when a building volume sits in front of the unit. */
const OCCLUDED_UNIT_ALPHA = 0.46;

function mixHash(h: number, v: number): number {
  return Math.imul(h ^ (v | 0), 16777619);
}

function ownerAllied(match: MatchSnapshot, ownerId: string | undefined): boolean {
  if (!ownerId) return false;
  const you = match.youPlayerId;
  if (ownerId === you) return true;
  const team = match.players.find((p) => p.playerId === you)?.team ?? 0;
  if (team === 0) return false;
  return match.players.find((p) => p.playerId === ownerId)?.team === team;
}

function hpBarFill(ratio: number, hostile: boolean, vivid = false): string {
  if (hostile) return vivid ? HP_FILL_HOSTILE_VIVID : HP_FILL_HOSTILE;
  if (ratio > 0.45) return vivid ? HP_FILL_OK_VIVID : HP_FILL_OK;
  if (ratio > 0.2) return vivid ? HP_FILL_MID_VIVID : HP_FILL_MID;
  return vivid ? HP_FILL_LOW_VIVID : HP_FILL_LOW;
}

function snapshotVisKey(match: MatchSnapshot): number {
  let h = 2166136261;
  h = mixHash(h, match.clearedTrees?.length ?? 0);
  for (const e of match.entities) {
    if (e.wreck) continue;
    if (!ownerAllied(match, e.ownerId)) continue;
    h = mixHash(h, e.id);
    h = mixHash(h, e.tileX);
    h = mixHash(h, e.tileY);
    h = mixHash(h, e.garrisonedIn ?? 0);
    h = mixHash(h, e.garrison?.hide ? 1 : 0);
    h = mixHash(h, e.scout?.out ? 1 : 0);
  }
  for (const c of match.smoke ?? []) {
    h = mixHash(h, c.id);
    h = mixHash(h, c.x | 0);
    h = mixHash(h, c.y | 0);
    h = mixHash(h, c.lifeMax > 0 ? ((c.life * 16) / c.lifeMax) | 0 : 0);
  }
  return h;
}

export class MapView {
  private readonly canvas: HTMLCanvasElement;
  private readonly mini: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly mctx: CanvasRenderingContext2D;
  private curr: MatchSnapshot;
  private prev: MatchSnapshot | null = null;
  private snapAt = 0;
  /** Top-left of the viewport in isometric space. */
  private camX = 0;
  private camY = 0;
  private keys = new Set<string>();
  private panning = false;
  private lastMX = 0;
  private lastMY = 0;
  private mouseX = -1;
  private mouseY = -1;
  private winX = -1;
  private winY = -1;
  private overControl = false;
  private raf = 0;
  private lastT = 0;
  private destroyed = false;
  private centered = false;
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private damagedUntil = new Map<number, number>();
  private lastHp = new Map<number, number>();
  private lastScoutHp = new Map<number, number>();
  private explored: Uint8Array | null = null;
  private vis: Uint8Array | null = null;
  private visKey = 0;
  private exploredMapId = "";
  private clearedApplied = 0;
  private maxElev = 0;
  private terrain: TerrainBake | null = null;
  private miniTerrain: MiniBake | null = null;
  private liveMap: MapDef | null = null;
  private treeStems: { tx: number; ty: number }[] | null = null;
  private fog: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private miniFog: HTMLCanvasElement | null = null;
  private miniFogCtx: CanvasRenderingContext2D | null = null;
  private miniFogData: ImageData | null = null;
  private ghosts = new Map<number, EntityView>();
  /** Wall-clock ms when a wreck was first drawn; drives hull-fire burnout. */
  private wreckBornAt = new Map<number, number>();
  private fx: {
    id: number;
    kind: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    at: number;
    caliber?: number;
    blast?: boolean;
    lift?: number;
    /** Screen-x offset from the world ground projection. */
    sx?: number;
    window?: boolean;
    shell?: string;
  }[] = [];
  private fxIds = new Set<number>();
  private seenShots = new Set<number>();
  /** Bounced spark origin, snapped to the same hull pixel as the ricochet FX. */
  private bounceTrace = new Map<number, { x: number; y: number; sx: number; lift: number }>();
  private moveClicks: { x: number; y: number; at: number }[] = [];
  private occBuildings: {
    x: number;
    y: number;
    w: number;
    h: number;
    ez: number;
    lift: number;
    spr?: BuildingSpriteDef;
    southX: number;
    southY: number;
    footprintW: number;
  }[] = [];
  /** Live civilian lots: which sides share a neighbor. Isolated houses are absent. */
  private houseNeighbors = new Map<number, NeighborSides>();
  selected = new Set<number>();
  placeMode = false;
  attackMoveMode = false;
  forceAttackMode = false;
  rotateMode = false;
  guardMode = false;
  private guardAnchor: { x: number; y: number } | null = null;
  private guardFacing = 0;
  private guardDragging = false;
  private ctrlHeld = false;
  onSelect: (ids: number[]) => void = () => {};
  onCommand: (msg: ClientMessage) => void = () => {};
  onPlaceMode: () => void = () => {};
  onAttackMoveMode: () => void = () => {};

  setAttackMoveMode(on: boolean): void {
    if (this.attackMoveMode === on) return;
    this.attackMoveMode = on;
    if (on) {
      this.placeMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.setGuardMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setForceAttackMode(on: boolean): void {
    if (this.forceAttackMode === on) return;
    this.forceAttackMode = on;
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.rotateMode = false;
      this.setGuardMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setRotateMode(on: boolean): void {
    if (this.rotateMode === on) return;
    this.rotateMode = on;
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.setGuardMode(false);
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  setGuardMode(on: boolean): void {
    if (this.guardMode === on) return;
    this.guardMode = on;
    if (on) {
      this.placeMode = false;
      this.attackMoveMode = false;
      this.forceAttackMode = false;
      this.rotateMode = false;
      this.guardFacing = this.meanSelectedFacing();
    } else {
      this.guardAnchor = null;
      this.guardDragging = false;
    }
    this.onAttackMoveMode();
    this.onPlaceMode();
  }

  constructor(canvas: HTMLCanvasElement, mini: HTMLCanvasElement, match: MatchSnapshot) {
    const ctx = canvas.getContext("2d");
    const mctx = mini.getContext("2d");
    if (!ctx || !mctx) throw new Error("canvas");
    this.canvas = canvas;
    this.mini = mini;
    this.ctx = ctx;
    this.mctx = mctx;
    this.curr = match;
    this.snapAt = performance.now();
    this.syncAtlases();
    this.revealFrom(match);
    this.bind();
    whenTerrainArtReady(() => {
      if (this.destroyed) return;
      resetTerrainCache();
      this.terrain = null;
      this.miniTerrain = null;
      this.syncAtlases();
    });
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  setSnapshot(match: MatchSnapshot): void {
    this.prev = this.curr;
    this.curr = match;
    this.snapAt = performance.now();
    const now = this.snapAt;
    const live = new Set<number>();
    for (const e of match.entities) {
      live.add(e.id);
      const prev = this.lastHp.get(e.id);
      if (prev !== undefined && e.hp < prev) this.damagedUntil.set(e.id, now + 2000);
      this.lastHp.set(e.id, e.hp);
      const scoutHp = e.scout?.hp;
      if (scoutHp !== undefined) {
        const prevScout = this.lastScoutHp.get(e.id);
        if (prevScout !== undefined && scoutHp < prevScout) this.damagedUntil.set(e.id, now + 2000);
        this.lastScoutHp.set(e.id, scoutHp);
      }
    }
    for (const id of this.lastHp.keys()) {
      if (!live.has(id)) this.lastHp.delete(id);
    }
    for (const id of this.lastScoutHp.keys()) {
      if (!live.has(id)) this.lastScoutHp.delete(id);
    }
    for (const [id, until] of this.damagedUntil) {
      if (!live.has(id) || until < now) this.damagedUntil.delete(id);
    }
    for (const i of match.impacts ?? []) {
      if (i.kind === "crush") continue;
      const fx: MapView["fx"][number] = { ...i, at: now };
      this.snapHullFx(fx);
      this.addFx(fx);
      if (i.kind === "kill" && i.blast) {
        this.addFx({ id: i.id + 7_000_000, kind: "smoke", x: i.x, y: i.y, vx: 0, vy: 0, at: now });
      }
    }
    this.bindBounceTraces(match);
    if (this.seenShots.size > 400) this.seenShots.clear();
    for (const i of match.impacts ?? []) {
      if (!isShellCaliber(i.caliber) || i.fromId == null) continue;
      if (i.kind === "puff" && i.shell !== "smoke") continue;
      const shooter = match.entities.find((e) => e.id === i.fromId);
      if (!shooter) continue;
      const dx = i.x - shooter.x;
      const dy = i.y - shooter.y;
      const sp = Math.hypot(dx, dy) || 1;
      const reach = catalog(shooter.type).radius * UNIT_VISUAL_SCALE + 10;
      this.addFx({
        id: i.id + 8_000_000,
        kind: "muzzle",
        x: shooter.x + (dx / sp) * reach,
        y: shooter.y + (dy / sp) * reach,
        vx: dx,
        vy: dy,
        at: now,
        caliber: i.caliber,
      });
    }
    for (const p of match.projectiles) {
      if (p.bounced || this.seenShots.has(p.id)) continue;
      const shooter = match.entities.find((e) => e.id === p.fromId);
      const fromGarrison =
        !!shooter?.garrisonedIn || (!shooter && !isShellCaliber(p.caliber) && !!this.houseAt(p.x, p.y));
      if (!fromGarrison) continue;
      this.seenShots.add(p.id);
      const house = this.houseAt(p.x, p.y) ?? (shooter?.garrisonedIn
        ? match.entities.find((e) => e.id === shooter.garrisonedIn)
        : undefined);
      this.addFx({
        id: p.id + 8_000_000,
        kind: "muzzle",
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        at: now,
        caliber: p.caliber,
        lift: house ? garrisonWindowLift(house.type, p.id) : 22,
        window: true,
      });
    }
    if (this.wreckBornAt.size > 0) {
      const liveWrecks = new Set<number>();
      for (const e of match.entities) if (e.wreck) liveWrecks.add(e.id);
      for (const id of this.wreckBornAt.keys()) {
        if (!liveWrecks.has(id)) this.wreckBornAt.delete(id);
      }
    }
    for (const id of [...this.selected]) {
      if (!match.entities.some((e) => e.id === id)) this.selected.delete(id);
    }
    if (this.attackMoveMode && this.ownSelectedIds().length === 0) this.setAttackMoveMode(false);
    if (this.forceAttackMode && this.ownSelectedIds().length === 0) this.setForceAttackMode(false);
    if (this.rotateMode && this.ownSelectedIds().length === 0) this.setRotateMode(false);
    if (this.guardMode && this.ownSelectedIds().length === 0) this.setGuardMode(false);
    const placing = this.placeMode;
    if (!this.readyBuilding()) this.placeMode = false;
    if (this.placeMode !== placing) this.onPlaceMode();
    this.syncAtlases();
    this.revealFrom(match);
  }

  private syncAtlases(): void {
    const map = this.map();
    this.maxElev = maxHeightOf(map);
    if (!this.terrain) this.terrain = bakeTerrain(map, this.curr.scrap);
    else updateScrap(this.terrain, map, this.curr.scrap);
    if (!this.miniTerrain) this.miniTerrain = bakeMini(map, this.curr.scrap);
    else updateMiniScrap(this.miniTerrain, map, this.curr.scrap);
    this.applyClearedTrees();
  }

  private addFx(f: MapView["fx"][number]): void {
    if (this.fxIds.has(f.id)) return;
    this.fxIds.add(f.id);
    this.fx.push(f);
  }

  private nearestHullEntity(wx: number, wy: number): EntityView | undefined {
    let best: EntityView | undefined;
    let bestD = 40;
    for (const e of this.curr.entities) {
      if (e.kind === "building" || e.garrisonedIn) continue;
      const d = Math.hypot(e.x - wx, e.y - wy);
      const reach = Math.max(40, catalog(e.type).radius * 3);
      if (d < bestD && d < reach) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  /** Pin armor sparks to painted sprite pixels so they don't float in empty canvas. */
  private snapHullFx(f: MapView["fx"][number]): void {
    const guess = armorHitLift(f.kind, f.caliber, f.id, f.blast);
    if (guess == null) return;
    const e = this.nearestHullEntity(f.x, f.y);
    if (!e) {
      f.lift = guess;
      return;
    }
    const spr = spriteFor(e.type, e.stance, e.swimming);
    const ground = this.toScreen(f.x, f.y);
    if (!spr || !spriteReady(spr)) {
      f.lift = guess;
      return;
    }
    const ts = this.ts();
    const ep = this.toScreen(e.x, e.y);
    const dir = facingToIso(e.facing, ts);
    const turretDir = facingToIso(e.turretFacing ?? e.facing, ts);
    const snapped = snapHitToUnitSprite(
      spr,
      ep.x,
      ep.y,
      ground.x,
      ground.y - guess,
      dir.x,
      dir.y,
      turretDir.x,
      turretDir.y,
    );
    if (!snapped) {
      f.lift = guess;
      return;
    }
    f.lift = ground.y - snapped.y;
    f.sx = snapped.x - ground.x;
  }

  private bindBounceTraces(match: MatchSnapshot): void {
    for (const p of match.projectiles) {
      if (!p.bounced || this.bounceTrace.has(p.id)) continue;
      let best: { x: number; y: number; sx: number; lift: number } | null = null;
      let bestD = 80;
      for (const f of this.fx) {
        if (f.kind !== "ricochet") continue;
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < bestD) {
          bestD = d;
          best = { x: f.x, y: f.y, sx: f.sx ?? 0, lift: f.lift ?? 0 };
        }
      }
      if (best) this.bounceTrace.set(p.id, best);
    }
    for (const id of [...this.bounceTrace.keys()]) {
      if (!match.projectiles.some((p) => p.id === id)) this.bounceTrace.delete(id);
    }
  }

  private applyClearedTrees(): void {
    const map = this.map();
    const list = this.curr.clearedTrees ?? [];
    if (list.length <= this.clearedApplied) return;
    const dirty: number[] = [];
    const w = map.width;
    for (let n = this.clearedApplied; n < list.length; n++) {
      const t = list[n]!;
      if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= map.height) continue;
      const i = t.y * w + t.x;
      if (map.tiles[i] !== TILE_TREE) continue;
      map.tiles[i] = TILE_EMPTY;
      dirty.push(i);
    }
    this.clearedApplied = list.length;
    if (dirty.length === 0) return;
    this.treeStems = null;
    if (this.terrain) restampTiles(this.terrain, map, dirty, this.curr.scrap);
    if (this.miniTerrain) restampMini(this.miniTerrain, map, dirty, this.curr.scrap);
  }

  private resetFog(map: { id: string; width: number; height: number }): void {
    const bake = this.terrain;
    if (!bake) return;
    const fog = document.createElement("canvas");
    fog.width = bake.width;
    fog.height = bake.height;
    const ctx = fog.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, bake.width, bake.height);
    this.fog = fog;
    this.fogCtx = ctx;
    const mini = document.createElement("canvas");
    mini.width = Math.max(1, map.width);
    mini.height = Math.max(1, map.height);
    const mctx = mini.getContext("2d");
    if (!mctx) return;
    this.miniFog = mini;
    this.miniFogCtx = mctx;
    this.miniFogData = mctx.createImageData(map.width, map.height);
  }

  private revealFrom(match: MatchSnapshot): void {
    const map = this.map();
    const n = map.width * map.height;
    if (!this.explored || this.explored.length !== n || this.exploredMapId !== match.mapId) {
      this.explored = new Uint8Array(n);
      this.exploredMapId = match.mapId;
      this.vis = null;
      this.visKey = 0;
      this.clearedApplied = 0;
      this.ghosts.clear();
      this.resetFog(map);
    }
    const key = snapshotVisKey(match);
    if (this.vis && this.visKey === key) {
      this.syncGhosts(match, this.vis);
      return;
    }
    const prevVis = this.vis;
    const vis = visionMaskFromSnapshot(match, map.width, map.height, map.tileSize);
    this.patchFog(map, prevVis, this.explored, vis);
    this.vis = vis;
    this.visKey = key;
    for (let i = 0; i < n; i++) {
      if (vis[i]) this.explored[i] = 1;
    }
    this.rebuildMiniFog(map, n);
    this.syncGhosts(match, vis);
  }

  private syncGhosts(match: MatchSnapshot, vis: Uint8Array): void {
    const map = this.map();
    for (const e of match.entities) {
      if (e.kind === "building" && e.ownerId !== match.youPlayerId) this.ghosts.set(e.id, e);
    }
    for (const [id, g] of this.ghosts) {
      if (match.entities.some((e) => e.id === id)) continue;
      if (entityOnMask(g, vis, map.width, map.height, map.tileSize)) this.ghosts.delete(id);
    }
  }

  private patchFog(map: MapDef, prevVis: Uint8Array | null, explored: Uint8Array, vis: Uint8Array): void {
    const ctx = this.fogCtx;
    const bake = this.terrain;
    if (!ctx || !bake) return;
    const w = map.width;
    const n = w * map.height;
    const punch: number[] = [];
    const dim: number[] = [];
    const hide: number[] = [];
    for (let i = 0; i < n; i++) {
      const wasSeen = explored[i] ?? 0;
      const wasLit = prevVis?.[i] ?? 0;
      const lit = vis[i] ?? 0;
      const seen = wasSeen || lit;
      if (seen === wasSeen && lit === wasLit) continue;
      if (!seen) hide.push(i);
      else if (!lit) {
        punch.push(i);
        dim.push(i);
      } else punch.push(i);
    }
    const ox = bake.originX;
    const oy = bake.originY;
    // destination-out punches lit diamonds so the overlay is transparent over terrain
    ctx.globalCompositeOperation = "destination-out";
    for (const i of punch) {
      coverTile(ctx, map, i % w, (i / w) | 0, bake.scrap.has(i), ox, oy, "#ffffff");
    }
    ctx.globalCompositeOperation = "source-over";
    for (const i of dim) {
      fillElevatedTile(ctx, map, i % w, (i / w) | 0, "rgba(0,0,0,0.55)", ox, oy);
    }
    for (const i of hide) {
      coverTile(ctx, map, i % w, (i / w) | 0, bake.scrap.has(i), ox, oy, "#050403");
    }
  }

  private rebuildMiniFog(map: { width: number; height: number }, n: number): void {
    const ctx = this.miniFogCtx;
    const data = this.miniFogData;
    if (!ctx || !data || data.width !== map.width || data.height !== map.height) return;
    const pix = data.data;
    const vis = this.vis;
    const exp = this.explored;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (!exp || !exp[i]) {
        pix[o] = 5;
        pix[o + 1] = 4;
        pix[o + 2] = 3;
        pix[o + 3] = 255;
      } else if (!vis || !vis[i]) {
        pix[o] = 0;
        pix[o + 1] = 0;
        pix[o + 2] = 0;
        pix[o + 3] = 140;
      } else {
        pix[o] = 0;
        pix[o + 1] = 0;
        pix[o + 2] = 0;
        pix[o + 3] = 0;
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  private lit(tx: number, ty: number): boolean {
    const map = this.map();
    if (!this.vis) return true;
    return tileOnMask(this.vis, map.width, tx, ty);
  }

  /** @deprecated */
  setMatch(match: MatchSnapshot): void {
    this.setSnapshot(match);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mouseup", this.onUp);
    window.removeEventListener("mousemove", this.onMove);
  }

  home(): void {
    this.centerOnHq();
  }

  private readyBuilding(): BuildingType | null {
    if (this.curr.you.placingType) return this.curr.you.placingType;
    const q = this.curr.you.structureQueue;
    return q?.ready ? q.type : null;
  }

  private map() {
    const m = getMap(this.curr.mapId);
    if (!m) throw new Error("missing map");
    if (!this.liveMap || this.liveMap.id !== m.id) {
      this.liveMap = { ...m, tiles: m.tiles.slice() };
      this.treeStems = null;
      this.clearedApplied = 0;
    }
    return this.liveMap;
  }

  private bind(): void {
    window.addEventListener("keydown", this.onKey, { capture: true });
    window.addEventListener("keyup", this.onKeyUp, { capture: true });
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("mousedown", (e) => {
      const mx = e.offsetX;
      const my = e.offsetY;
      if (e.button === 1) {
        this.panning = true;
        this.lastMX = e.clientX;
        this.lastMY = e.clientY;
        e.preventDefault();
        return;
      }
      if (e.button === 2) {
        e.preventDefault();
        if (this.attackMoveMode || this.forceAttackMode || this.rotateMode || this.guardMode) {
          this.setAttackMoveMode(false);
          this.setForceAttackMode(false);
          this.setRotateMode(false);
          this.setGuardMode(false);
          return;
        }
        this.onRight(mx, my);
        return;
      }
      if (e.button === 0) {
        this.ctrlHeld = e.ctrlKey;
        if (this.guardMode) {
          this.beginGuard(mx, my);
          return;
        }
        if (this.forceAttackMode) {
          this.commitForceAttack(mx, my);
          return;
        }
        if (this.rotateMode) {
          this.commitRotate(mx, my);
          return;
        }
        if (this.attackMoveMode) {
          this.commitAttackMove(mx, my);
          return;
        }
        if (e.ctrlKey && this.ownSelectedIds().length) {
          e.preventDefault();
          this.commitForceAttack(mx, my);
          return;
        }
        const toPlace = this.placeMode ? this.readyBuilding() : null;
        if (toPlace) {
          const tile = this.screenToTile(mx, my);
          this.onCommand({
            type: "cmd.place",
            building: toPlace,
            tx: tile.x,
            ty: tile.y,
          });
          return;
        }
        this.box = { x0: mx, y0: my, x1: mx, y1: my };
      }
    });
    window.addEventListener("mouseup", this.onUp);
    window.addEventListener("mousemove", this.onMove);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.mini.addEventListener("mousedown", (e) => {
      const map = this.map();
      const rect = this.mini.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const scale = Math.min(rect.width / map.width, rect.height / map.height);
      const tileX = mx / scale;
      const tileY = my / scale;
      const view = this.viewSize();
      const iso = worldToIso(tileX * map.tileSize, tileY * map.tileSize, map.tileSize);
      this.camX = iso.x - view.w / 2;
      this.camY = iso.y - view.h / 2;
      this.clamp();
    });
  }

  private onUp = (e: MouseEvent): void => {
    if (e.button === 1) this.panning = false;
    if (e.button === 0 && this.guardDragging) {
      this.commitGuard(this.mouseX, this.mouseY);
      return;
    }
    if (e.button === 0 && this.box) {
      const b = this.box;
      this.box = null;
      const dx = Math.abs(b.x1 - b.x0);
      const dy = Math.abs(b.y1 - b.y0);
      if (dx > 6 || dy > 6) this.boxSelect(b, e.shiftKey);
      else this.clickSelect(b.x0, b.y0, e.shiftKey);
    }
  };

  private onMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    this.winX = e.clientX;
    this.winY = e.clientY;
    this.overControl =
      e.target instanceof Element &&
      !!e.target.closest("button, input, select, textarea, #minimap, .modal-back");
    if (this.ctrlHeld !== e.ctrlKey) {
      this.ctrlHeld = e.ctrlKey;
      this.syncCursor();
    }
    if (this.panning) {
      this.camX -= e.clientX - this.lastMX;
      this.camY -= e.clientY - this.lastMY;
      this.lastMX = e.clientX;
      this.lastMY = e.clientY;
      this.clamp();
    }
    if (this.box) {
      this.box.x1 = this.mouseX;
      this.box.y1 = this.mouseY;
    }
    if (this.guardDragging && this.guardAnchor) this.aimGuard(this.mouseX, this.mouseY);
    this.syncCursor();
  };

  private onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key.toLowerCase();
    if (k === "control") {
      this.ctrlHeld = true;
      this.syncCursor();
      return;
    }
    if (this.isCameraKey(k)) {
      e.preventDefault();
      this.keys.add(k);
      return;
    }
    if (k === "h") {
      e.preventDefault();
      this.centerOnHq();
      return;
    }
    if (this.isSpeedUpKey(e)) {
      e.preventDefault();
      this.onCommand({ type: "cmd.speed", delta: 1 });
      return;
    }
    if (this.isSpeedDownKey(e)) {
      e.preventDefault();
      this.onCommand({ type: "cmd.speed", delta: -1 });
      return;
    }
    if (e.repeat) return;
    if (k === GUARD_HOTKEY) {
      e.preventDefault();
      const ids = this.ownSelectedIds();
      if (ids.length) this.setGuardMode(!this.guardMode);
      return;
    }
    if (k === GARRISON_HOTKEY) {
      e.preventDefault();
      this.garrisonHotkey();
      return;
    }
    if (k === SPECIAL_HOTKEY) {
      e.preventDefault();
      this.specialSelected();
      return;
    }
    if (k === STOP_HOTKEY) {
      e.preventDefault();
      this.stopSelected();
      return;
    }
    if (k === ATTACK_MOVE_HOTKEY) {
      e.preventDefault();
      const ids = this.ownSelectedIds();
      if (ids.length) this.setAttackMoveMode(!this.attackMoveMode);
      return;
    }
    if (k === ROTATE_HOTKEY) {
      e.preventDefault();
      const ids = this.ownSelectedIds();
      if (ids.length) this.setRotateMode(!this.rotateMode);
      return;
    }
    if (k === "p") {
      e.preventDefault();
      this.setAttackMoveMode(false);
      this.setForceAttackMode(false);
      this.setRotateMode(false);
      this.setGuardMode(false);
      const own = this.curr.entities.filter(
        (ent) =>
          this.selected.has(ent.id) &&
          ent.ownerId === this.curr.youPlayerId &&
          !ent.wreck &&
          ent.kind === "unit",
      );
      if (own.length === 0) return;
      const hold = !own.every((ent) => ent.holdPosition);
      this.onCommand({ type: "cmd.hold", ids: own.map((ent) => ent.id), hold });
      return;
    }
    if (k === "c") {
      e.preventDefault();
      this.stanceHotkey("crouch");
      return;
    }
    if (k === "z") {
      e.preventDefault();
      this.stanceHotkey("crawl");
      return;
    }
    if (k === "i") {
      e.preventDefault();
      this.garrisonHideHotkey();
      this.scoutHotkey();
      return;
    }
    if (k === "escape") {
      if (this.attackMoveMode || this.forceAttackMode || this.rotateMode || this.guardMode) {
        e.preventDefault();
        this.setAttackMoveMode(false);
        this.setForceAttackMode(false);
        this.setRotateMode(false);
        this.setGuardMode(false);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (k === "control") {
      this.ctrlHeld = false;
      this.syncCursor();
    }
    if (this.isCameraKey(k)) e.preventDefault();
    this.keys.delete(k);
  };

  private onBlur = (): void => {
    this.ctrlHeld = false;
    this.keys.clear();
  };

  private isCameraKey(k: string): boolean {
    return k === "w" || k === "d" || k.startsWith("arrow");
  }

  private stopSelected(): void {
    this.setAttackMoveMode(false);
    this.setForceAttackMode(false);
    this.setRotateMode(false);
    this.setGuardMode(false);
    const ids = this.ownSelectedIds();
    if (ids.length) this.onCommand({ type: "cmd.stop", ids });
  }

  private aimingForceAttack(): boolean {
    if (this.overControl || this.hoverSpecial) return false;
    if (this.guardMode || this.rotateMode || this.attackMoveMode) return false;
    if (this.forceAttackMode) return true;
    return this.ctrlHeld && this.ownSelectedIds().length > 0;
  }

  private isSpeedUpKey(e: KeyboardEvent): boolean {
    return e.key === "+" || e.key === "=" || e.code === "Equal" || e.code === "NumpadAdd";
  }

  private isSpeedDownKey(e: KeyboardEvent): boolean {
    return e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract";
  }

  private canSpecial(e: EntityView): boolean {
    return e.ownerId === this.curr.youPlayerId && specialReady(e.type, e.state, e.specialCooldown ?? 0);
  }

  private useSpecial(e: EntityView): void {
    if (!this.canSpecial(e)) return;
    if (specialOf(e.type) === "deploy") this.onCommand({ type: "cmd.deploy", id: e.id });
  }

  private stanceHotkey(want: "crouch" | "crawl"): void {
    const you = this.curr.youPlayerId;
    const inf = this.curr.entities.filter(
      (e) =>
        this.selected.has(e.id) &&
        e.ownerId === you &&
        !e.wreck &&
        e.kind === "unit" &&
        isInfantryType(e.type),
    );
    if (inf.length === 0) return;
    const stance = inf.every((e) => (e.stanceOrder ?? e.stance) === want) ? "stand" : want;
    if (!isStance(stance)) return;
    this.onCommand({ type: "cmd.stance", ids: inf.map((e) => e.id), stance });
  }

  private scoutHotkey(): void {
    const you = this.curr.youPlayerId;
    const tanks = this.curr.entities.filter(
      (e) =>
        this.selected.has(e.id) &&
        e.ownerId === you &&
        !e.wreck &&
        e.kind === "unit" &&
        hasScout(e.type) &&
        (e.scout?.hp ?? 0) > 0,
    );
    if (tanks.length === 0) return;
    const out = !tanks.every((e) => e.scout?.out);
    this.onCommand({ type: "cmd.scout", ids: tanks.map((e) => e.id), out });
  }

  private garrisonHideHotkey(): void {
    const you = this.curr.youPlayerId;
    const ids: number[] = [];
    const houses: EntityView[] = [];
    const seen = new Set<number>();
    for (const e of this.curr.entities) {
      if (!this.selected.has(e.id) || e.wreck) continue;
      if (isGarrisonable(e.type) && e.garrison?.ownerId === you && (e.garrison.count ?? 0) > 0) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          houses.push(e);
          ids.push(e.id);
        }
      }
      if (e.ownerId === you && e.garrisonedIn) {
        ids.push(e.id);
        const house = this.curr.entities.find((x) => x.id === e.garrisonedIn);
        if (house && !seen.has(house.id)) {
          seen.add(house.id);
          houses.push(house);
        }
      }
    }
    if (ids.length === 0 || houses.length === 0) return;
    const hide = !houses.every((h) => h.garrison?.hide);
    this.onCommand({ type: "cmd.garrisonhide", ids, hide });
  }

  private garrisonHotkey(): void {
    const you = this.curr.youPlayerId;
    const own = this.curr.entities.filter((e) => this.selected.has(e.id) && e.ownerId === you && !e.wreck);
    const inf = own.filter((e) => e.kind === "unit" && isInfantryType(e.type));
    const house = this.curr.entities.find((e) => this.selected.has(e.id) && isGarrisonable(e.type) && e.hp > 0);
    if (house && inf.length) {
      this.onCommand({ type: "cmd.garrison", ids: inf.map((e) => e.id), buildingId: house.id });
      return;
    }
    const holed = own.filter((e) => e.garrisonedIn);
    if (holed.length) {
      this.onCommand({ type: "cmd.ungarrison", ids: holed.map((e) => e.id) });
      return;
    }
    if (house && house.garrison?.ownerId === you) {
      this.onCommand({ type: "cmd.ungarrison", buildingId: house.id });
    }
  }

  private ownSelectedIds(): number[] {
    return [...this.selected].filter((id) => {
      const ent = this.curr.entities.find((x) => x.id === id);
      return !!ent && ent.ownerId === this.curr.youPlayerId && !ent.wreck && ent.kind === "unit";
    });
  }

  private commitAttackMove(px: number, py: number): void {
    const ids = this.ownSelectedIds();
    this.setAttackMoveMode(false);
    if (ids.length === 0) return;
    const hit = this.hit(px, py);
    if (hit && (hit.wreck || hit.ownerId !== this.curr.youPlayerId)) {
      this.onCommand({ type: "cmd.attack", ids, targetId: hit.id });
      return;
    }
    const w = this.screenToWorld(px, py);
    this.pulseMoveClick(w.x, w.y);
    this.onCommand({ type: "cmd.attackmove", ids, x: w.x, y: w.y });
  }

  private commitForceAttack(px: number, py: number): void {
    const ids = this.ownSelectedIds().filter((id) => {
      const ent = this.curr.entities.find((x) => x.id === id);
      return !!ent && fires(ent.type);
    });
    this.setForceAttackMode(false);
    if (ids.length === 0) return;
    const hit = this.hit(px, py);
    if (hit && hit.hp > 0 && ids.some((id) => id !== hit.id)) {
      this.onCommand({ type: "cmd.forceattack", ids, x: hit.x, y: hit.y, targetId: hit.id });
      return;
    }
    const w = this.screenToWorld(px, py);
    this.onCommand({ type: "cmd.forceattack", ids, x: w.x, y: w.y });
  }

  private commitRotate(px: number, py: number): void {
    const ids = this.ownSelectedIds();
    this.setRotateMode(false);
    if (ids.length === 0) return;
    const hit = this.hit(px, py);
    const w = hit ? { x: hit.x, y: hit.y } : this.screenToWorld(px, py);
    this.onCommand({ type: "cmd.rotate", ids, x: w.x, y: w.y });
  }

  private meanSelectedFacing(): number {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const id of this.ownSelectedIds()) {
      const e = this.curr.entities.find((x) => x.id === id);
      if (!e) continue;
      sx += Math.cos(e.facing);
      sy += Math.sin(e.facing);
      n++;
    }
    if (n === 0 || (sx === 0 && sy === 0)) return this.guardFacing;
    return Math.atan2(sy, sx);
  }

  private maxSelectedRange(): number {
    const ts = this.ts();
    let range = 0;
    for (const id of this.ownSelectedIds()) {
      const e = this.curr.entities.find((x) => x.id === id);
      if (!e) continue;
      range = Math.max(range, rangeTilesOf(e.type, this.elevAt(e.x, e.y)) * ts);
    }
    return range;
  }

  private beginGuard(px: number, py: number): void {
    if (this.ownSelectedIds().length === 0) {
      this.setGuardMode(false);
      return;
    }
    this.mouseX = px;
    this.mouseY = py;
    this.guardAnchor = this.screenToWorld(px, py);
    this.guardFacing = this.meanSelectedFacing();
    this.guardDragging = true;
  }

  private aimGuard(px: number, py: number): void {
    if (!this.guardAnchor) return;
    const w = this.screenToWorld(px, py);
    const dx = w.x - this.guardAnchor.x;
    const dy = w.y - this.guardAnchor.y;
    if (dx * dx + dy * dy < 64) return;
    this.guardFacing = Math.atan2(dy, dx);
  }

  private commitGuard(px: number, py: number): void {
    const ids = this.ownSelectedIds();
    const anchor = this.guardAnchor;
    this.guardDragging = false;
    if (anchor && px >= 0 && py >= 0) this.aimGuard(px, py);
    const facing = this.guardFacing;
    this.setGuardMode(false);
    if (ids.length === 0 || !anchor) return;
    this.onCommand({ type: "cmd.guard", ids, x: anchor.x, y: anchor.y, facing });
  }

  private specialSelected(): void {
    for (const id of this.selected) {
      const e = this.curr.entities.find((x) => x.id === id);
      if (e) this.useSpecial(e);
    }
  }

  private viewSize(): { w: number; h: number } {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
  }

  private clamp(): void {
    const map = this.map();
    const { w, h } = this.viewSize();
    const p = clampIsoCamera(this.camX, this.camY, w, h, map.width, map.height, map.tileSize, this.maxElev);
    this.camX = p.x;
    this.camY = p.y;
  }

  private centerOnHq(): void {
    const map = this.map();
    const { w, h } = this.viewSize();
    if (w < 10 || h < 10) return;
    const hq = this.hq();
    if (!hq) return;
    const ts = map.tileSize;
    const p = worldToIso3(hq.x, hq.y, this.elevAt(hq.x, hq.y), ts);
    const mid = worldToIso((map.width * ts) / 2, (map.height * ts) / 2, ts);
    const inwardX = mid.x - p.x;
    const inwardY = mid.y - p.y;
    this.camX = p.x - w / 2 + Math.sign(inwardX) * Math.min(w * 0.18, Math.abs(inwardX) * 0.25);
    this.camY = p.y - h / 2 + Math.sign(inwardY) * Math.min(h * 0.18, Math.abs(inwardY) * 0.25);
    this.clamp();
    this.centered = true;
  }

  private hq(): EntityView | undefined {
    return (
      this.curr.entities.find((e) => e.id === this.curr.you.hqId) ??
      this.curr.entities.find(
        (e) => e.ownerId === this.curr.youPlayerId && (e.type === "rig" || e.type === "core"),
      )
    );
  }

  private ts(): number {
    return this.map().tileSize;
  }

  private elevAt(wx: number, wy: number): number {
    const map = this.map();
    return heightAt(map, worldToTile(wx, map.tileSize), worldToTile(wy, map.tileSize));
  }

  private toScreen(wx: number, wy: number, elev?: number): IsoPt {
    const p = worldToIso(wx, wy, this.ts());
    const z = isoLift(elev ?? this.elevAt(wx, wy));
    return { x: p.x - this.camX, y: p.y - this.camY - z };
  }

  private screenToWorldFlat(px: number, py: number): { x: number; y: number } {
    return isoToWorld(px + this.camX, py + this.camY, this.ts());
  }

  private screenToWorld(px: number, py: number): { x: number; y: number } {
    const map = this.map();
    const tile = this.screenToTile(px, py);
    const h = heightAt(map, tile.x, tile.y);
    return isoToWorld(px + this.camX, py + this.camY + isoLift(h), map.tileSize);
  }

  private screenToTile(px: number, py: number): { x: number; y: number } {
    const map = this.map();
    const ts = map.tileSize;
    const picked = pickElevatedTile(
      px + this.camX,
      py + this.camY,
      map.width,
      map.height,
      ts,
      (x, y) => heightAt(map, x, y),
      this.visibleTiles(),
    );
    if (picked) return picked;
    const w = this.screenToWorldFlat(px, py);
    return { x: worldToTile(w.x, ts), y: worldToTile(w.y, ts) };
  }

  private lerpEnt(e: EntityView): { x: number; y: number; facing: number; turretFacing: number } {
    const turretNow = e.turretFacing ?? e.facing;
    const t = Math.min(1, (performance.now() - this.snapAt) / 100);
    const prev = this.prev?.entities.find((p) => p.id === e.id);
    if (!prev || t >= 1) return { x: e.x, y: e.y, facing: e.facing, turretFacing: turretNow };
    const snapFacing = isInfantryType(e.type);
    let df = e.facing - prev.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    const turretPrev = prev.turretFacing ?? prev.facing;
    let dt = turretNow - turretPrev;
    while (dt > Math.PI) dt -= Math.PI * 2;
    while (dt < -Math.PI) dt += Math.PI * 2;
    return {
      x: prev.x + (e.x - prev.x) * t,
      y: prev.y + (e.y - prev.y) * t,
      facing: snapFacing ? e.facing : prev.facing + df * t,
      turretFacing: snapFacing ? turretNow : turretPrev + dt * t,
    };
  }

  private extrude(type: EntityType): number {
    return EXTRUDE[type];
  }

  /** Structures always paint under units so tanks never slip beneath a corner. */
  private drawLayer(e: EntityView): number {
    return e.kind === "building" ? 0 : 1;
  }

  private depthOf(e: EntityView): number {
    const ts = this.ts();
    if (e.kind === "building") return isoDepth((e.tileX + e.tileW) * ts, (e.tileY + e.tileH) * ts);
    const p = this.lerpEnt(e);
    return isoDepth(p.x, p.y);
  }

  private hit(px: number, py: number): EntityView | null {
    const ts = this.ts();
    const ix = px + this.camX;
    const iy = py + this.camY;
    const list = [...this.curr.entities].sort(
      (a, b) => this.drawLayer(b) - this.drawLayer(a) || this.depthOf(b) - this.depthOf(a),
    );
    for (const e of list) {
      if (e.kind === "unit") {
        if (e.garrisonedIn) continue;
        const p = this.lerpEnt(e);
        const spr = spriteFor(e.type, e.stance, e.swimming);
        if (spr) {
          const s = this.toScreen(p.x, p.y);
          const size = spr.drawSize;
          const top = s.y - size * spr.contactY;
          if (px >= s.x - size * 0.4 && px <= s.x + size * 0.4 && py >= top && py <= top + size) {
            return e;
          }
        } else {
          const r = catalog(e.type).radius * UNIT_VISUAL_SCALE;
          if (
            pointInIsoBox(
              ix,
              iy,
              p.x - r,
              p.y - r,
              r * 2,
              r * 2,
              this.extrude(e.type) * UNIT_VISUAL_SCALE,
              ts,
              isoLift(this.elevAt(p.x, p.y)),
            )
          ) {
            return e;
          }
        }
      } else if (
        pointInIsoBox(
          ix,
          iy,
          e.tileX * ts,
          e.tileY * ts,
          e.tileW * ts,
          e.tileH * ts,
          this.extrude(e.type),
          ts,
          isoLift(heightAt(this.map(), e.tileX, e.tileY)),
        )
      ) {
        return e;
      }
    }
    return null;
  }

  private clickSelect(px: number, py: number, shift: boolean): void {
    const hit = this.hit(px, py);
    if (!hit) {
      if (!shift) this.selected.clear();
      this.onSelect([...this.selected]);
      return;
    }
    if (hit.wreck || hit.ownerId !== this.curr.youPlayerId) {
      this.selected.clear();
      this.selected.add(hit.id);
      this.onSelect([...this.selected]);
      return;
    }
    if (!shift && this.selected.size === 1 && this.selected.has(hit.id) && this.canSpecial(hit)) {
      this.useSpecial(hit);
      return;
    }
    if (shift) {
      if (this.selected.has(hit.id)) this.selected.delete(hit.id);
      else this.selected.add(hit.id);
    } else {
      this.selected.clear();
      this.selected.add(hit.id);
    }
    this.onSelect([...this.selected]);
  }

  private boxSelect(b: { x0: number; y0: number; x1: number; y1: number }, shift: boolean): void {
    const x0 = Math.min(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1);
    const x1 = Math.max(b.x0, b.x1);
    const y1 = Math.max(b.y0, b.y1);
    if (!shift) this.selected.clear();
    for (const e of this.curr.entities) {
      if (e.kind !== "unit" || e.ownerId !== this.curr.youPlayerId || e.wreck || e.garrisonedIn) continue;
      const p = this.lerpEnt(e);
      const s = this.toScreen(p.x, p.y);
      if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) this.selected.add(e.id);
    }
    this.onSelect([...this.selected]);
  }

  private onRight(px: number, py: number): void {
    if (this.placeMode) {
      this.placeMode = false;
      this.onPlaceMode();
      return;
    }
    const own = [...this.selected]
      .map((id) => this.curr.entities.find((e) => e.id === id))
      .filter((e): e is EntityView => !!e && e.ownerId === this.curr.youPlayerId && !e.wreck);
    if (own.length === 0) return;
    const hit = this.hit(px, py);
    const inf = own.filter((e) => e.kind === "unit" && isInfantryType(e.type));
    if (hit && isGarrisonable(hit.type) && inf.length) {
      const held = hit.garrison?.ownerId;
      if (!held || held === this.curr.youPlayerId) {
        this.onCommand({ type: "cmd.garrison", ids: inf.map((e) => e.id), buildingId: hit.id });
        return;
      }
    }
    if (hit && (hit.wreck || (hit.ownerId !== this.curr.youPlayerId && !isCivilianType(hit.type)) || isGarrisonable(hit.type))) {
      if (hit.ownerId !== this.curr.youPlayerId || hit.wreck || (isGarrisonable(hit.type) && hit.garrison?.ownerId && hit.garrison.ownerId !== this.curr.youPlayerId)) {
        this.onCommand({ type: "cmd.attack", ids: own.map((e) => e.id), targetId: hit.id });
        return;
      }
    }
    const tile = this.screenToTile(px, py);
    const scrap = this.curr.scrap.find((s) => s.x === tile.x && s.y === tile.y && s.yield > 0);
    const haulers = own.filter((e) => e.type === "hauler");
    if (scrap && haulers.length) {
      const dest = this.screenToWorld(px, py);
      this.pulseMoveClick(dest.x, dest.y);
      this.onCommand({ type: "cmd.harvest", ids: haulers.map((e) => e.id), tileX: tile.x, tileY: tile.y });
      return;
    }
    if (hit?.type === "smelter" && hit.ownerId === this.curr.youPlayerId && haulers.length) {
      const w = this.screenToWorld(px, py);
      this.pulseMoveClick(w.x, w.y);
      this.onCommand({ type: "cmd.move", ids: haulers.map((e) => e.id), x: w.x, y: w.y });
      return;
    }
    const movers = own.filter((e) => e.kind === "unit");
    if (movers.length === 0) return;
    const w = this.screenToWorld(px, py);
    this.pulseMoveClick(w.x, w.y);
    this.onCommand({ type: "cmd.move", ids: movers.map((e) => e.id), x: w.x, y: w.y });
  }

  private pulseMoveClick(x: number, y: number): void {
    this.moveClicks.push({ x, y, at: performance.now() });
    if (this.moveClicks.length > 8) this.moveClicks.splice(0, this.moveClicks.length - 8);
  }

  private frame(t: number): void {
    if (this.destroyed) return;
    const dt = this.lastT ? Math.min(0.05, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    this.fit();
    if (!this.centered) this.centerOnHq();
    const speed = 420;
    let vx = 0;
    let vy = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) vy -= 1;
    if (this.keys.has("arrowdown")) vy += 1;
    if (this.keys.has("arrowleft")) vx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) vx += 1;
    const edge = 24;
    if (edgeScroll && !this.panning && !this.box && this.winX >= 0 && !this.overControl) {
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      if (this.winX < edge) vx -= 1;
      if (this.winX > sw - edge) vx += 1;
      if (this.winY < edge) vy -= 1;
      if (this.winY > sh - edge) vy += 1;
    }
    if (vx || vy) {
      const len = Math.hypot(vx, vy) || 1;
      this.camX += (vx / len) * speed * dt;
      this.camY += (vy / len) * speed * dt;
      this.clamp();
    }
    this.syncCursor();
    this.draw();
    this.drawMini();
    this.raf = requestAnimationFrame((nt) => this.frame(nt));
  }

  private fit(): void {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mw = Math.max(1, this.mini.clientWidth);
    const mh = Math.max(1, this.mini.clientHeight);
    const mbw = Math.floor(mw * dpr);
    const mbh = Math.floor(mh * dpr);
    if (this.mini.width !== mbw || this.mini.height !== mbh) {
      this.mini.width = mbw;
      this.mini.height = mbh;
    }
    this.mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private visibleTiles(): { x0: number; y0: number; x1: number; y1: number } {
    const map = this.map();
    const { w, h } = this.viewSize();
    const ts = map.tileSize;
    const pad = 80;
    const liftPad = isoLift(this.maxElev) + 48;
    const pts = [
      this.screenToWorldFlat(-pad, -pad - liftPad),
      this.screenToWorldFlat(w + pad, -pad - liftPad),
      this.screenToWorldFlat(-pad, h + pad),
      this.screenToWorldFlat(w + pad, h + pad),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const extra = this.maxElev + 2;
    return {
      x0: Math.max(0, worldToTile(minX, ts) - 1),
      y0: Math.max(0, worldToTile(minY, ts) - 1),
      x1: Math.min(map.width - 1, worldToTile(maxX, ts) + extra),
      y1: Math.min(map.height - 1, worldToTile(maxY, ts) + extra),
    };
  }

  private draw(): void {
    const ctx = this.ctx;
    const { w, h } = this.viewSize();
    ctx.fillStyle = "#0c1008";
    ctx.fillRect(0, 0, w, h);

    const bake = this.terrain;
    ctx.imageSmoothingEnabled = false;
    if (bake) {
      blitTerrain(ctx, bake, this.camX, this.camY, w, h);
      this.drawWaterShimmer();
      if (this.fog) blitAtlas(ctx, this.fog, bake.originX, bake.originY, this.camX, this.camY, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    this.cacheHouseGroups();
    this.cacheOccluders();

    const liveIds = new Set(this.curr.entities.map((e) => e.id));
    const drawList: EntityView[] = [
      ...this.curr.entities,
      ...[...this.ghosts.values()].filter((g) => !liveIds.has(g.id)),
    ];
    const items: { layer: number; z: number; run: () => void }[] = [];
    for (const e of drawList) {
      const ghost = !liveIds.has(e.id);
      items.push({
        layer: this.drawLayer(e),
        z: this.depthOf(e),
        run: () => {
          if (e.kind === "building") this.drawBuilding(e, ghost);
          else if (!ghost && !e.garrisonedIn) this.drawUnit(e);
        },
      });
    }
    this.collectTrees(items);
    for (const m of this.takeMoveClicks()) {
      items.push({
        layer: 0,
        z: isoDepth(m.x, m.y),
        run: () => {
          const s = this.toScreen(m.x, m.y);
          drawMoveClick(this.ctx, s.x, s.y, m.t);
        },
      });
    }
    items.sort((a, b) => a.layer - b.layer || a.z - b.z);
    for (const it of items) it.run();

    for (const p of this.curr.projectiles) {
      if (p.bounced !== true) continue;
      const shell = isShellCaliber(p.caliber);
      const t = Math.min(1, (performance.now() - this.snapAt) / 100);
      const prevP = this.prev?.projectiles.find((q) => q.id === p.id);
      const wx = prevP ? prevP.x + (p.x - prevP.x) * t : p.x;
      const wy = prevP ? prevP.y + (p.y - prevP.y) * t : p.y;
      const a = this.toScreen(wx, wy);
      const origin = this.bounceTrace.get(p.id);
      if (origin) {
        const o = this.toScreen(origin.x, origin.y);
        const flown = Math.hypot(wx - origin.x, wy - origin.y);
        const headLift = origin.lift * (1 - Math.min(1, flown / 56));
        drawRicochetTrace(
          ctx,
          o.x + origin.sx,
          o.y - origin.lift,
          a.x,
          a.y - headLift,
          shell,
        );
      } else {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const tail = this.toScreen(wx - (p.vx / sp) * 8, wy - (p.vy / sp) * 8);
        drawRicochetTrace(ctx, tail.x, tail.y - 7, a.x, a.y - 7, shell);
      }
    }
    this.drawSmokeClouds();
    this.drawImpacts();

    const toPlace = this.placeMode ? this.readyBuilding() : null;
    if (toPlace && this.mouseX >= 0) {
      this.drawGhost(toPlace);
    }

    if (this.box) {
      const b = this.box;
      ctx.strokeStyle = "#e8b84a";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
    this.drawSpecialCursor();
    this.drawAttackCursor();
    this.drawForceCursor();
    this.drawRotateCursor();
    this.drawGuardOverlay();
  }

  private drawForceCursor(): void {
    if (!this.aimingForceAttack()) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ctx = this.ctx;
    const x = this.mouseX;
    const y = this.mouseY;
    ctx.save();
    ctx.strokeStyle = "#e8b84a";
    ctx.fillStyle = "#e8b84a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText("FIRE", x + 12, y + 8);
    ctx.fillText("FIRE", x + 12, y + 8);
    ctx.restore();
  }

  private drawRotateCursor(): void {
    if (!this.rotateMode || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ctx = this.ctx;
    const x = this.mouseX;
    const y = this.mouseY;
    ctx.save();
    ctx.strokeStyle = "#e8b84a";
    ctx.fillStyle = "#e8b84a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, -Math.PI * 0.15, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 6);
    ctx.lineTo(x + 14, y - 1);
    ctx.lineTo(x + 5, y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText("FACE", x + 14, y + 8);
    ctx.fillText("FACE", x + 14, y + 8);
    ctx.restore();
  }

  private drawGuardOverlay(): void {
    if (!this.guardMode || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ids = this.ownSelectedIds();
    if (ids.length === 0) return;
    if (!this.guardDragging) this.guardFacing = this.meanSelectedFacing();
    const origin = this.guardAnchor ?? this.screenToWorld(this.mouseX, this.mouseY);
    const elev = this.elevAt(origin.x, origin.y);
    const range = this.maxSelectedRange();
    const facing = this.guardFacing;
    const half = (GUARD_CONE_DEG * Math.PI) / 360;
    const ctx = this.ctx;
    const at = (wx: number, wy: number) => this.toScreen(wx, wy, elev);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (range > 0) {
      const ring: IsoPt[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const a = (Math.PI * 2 * i) / steps;
        ring.push(at(origin.x + Math.cos(a) * range, origin.y + Math.sin(a) * range));
      }
      ctx.beginPath();
      ctx.moveTo(ring[0]!.x, ring[0]!.y);
      for (const p of ring) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(232, 184, 74, 0.06)";
      ctx.fill();
      ctx.strokeStyle = "rgba(232, 184, 74, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      const a0 = facing - half;
      const a1 = facing + half;
      const arc: IsoPt[] = [at(origin.x, origin.y)];
      const arcSteps = 20;
      for (let i = 0; i <= arcSteps; i++) {
        const a = a0 + ((a1 - a0) * i) / arcSteps;
        arc.push(at(origin.x + Math.cos(a) * range, origin.y + Math.sin(a) * range));
      }
      ctx.beginPath();
      ctx.moveTo(arc[0]!.x, arc[0]!.y);
      for (const p of arc) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(232, 184, 74, 0.22)";
      ctx.fill();
      ctx.strokeStyle = "#e8b84a";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    const tipR = range > 0 ? range : this.ts() * 6;
    const tip = at(origin.x + Math.cos(facing) * tipR, origin.y + Math.sin(facing) * tipR);
    const apex = at(origin.x, origin.y);
    ctx.strokeStyle = "#e8b84a";
    ctx.fillStyle = "#e8b84a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    const iso = facingToIso(facing, this.ts());
    const len = Math.hypot(iso.x, iso.y) || 1;
    const ux = iso.x / len;
    const uy = iso.y / len;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - ux * 12 + uy * 6, tip.y - uy * 12 - ux * 6);
    ctx.lineTo(tip.x - ux * 12 - uy * 6, tip.y - uy * 12 + ux * 6);
    ctx.closePath();
    ctx.fill();
    const label = this.guardDragging ? "FACE" : "GUARD";
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText(label, this.mouseX + 14, this.mouseY + 8);
    ctx.fillStyle = "#e8b84a";
    ctx.fillText(label, this.mouseX + 14, this.mouseY + 8);
    ctx.restore();
  }

  private drawAttackCursor(): void {
    if (!this.attackMoveMode || this.overControl || this.hoverSpecial) return;
    if (this.mouseX < 0 || this.mouseY < 0) return;
    const ctx = this.ctx;
    const x = this.mouseX;
    const y = this.mouseY;
    ctx.save();
    ctx.strokeStyle = "#ff5a4a";
    ctx.fillStyle = "#ff5a4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140e0a";
    ctx.strokeText("ATK", x + 12, y + 8);
    ctx.fillText("ATK", x + 12, y + 8);
    ctx.restore();
  }

  private fillQuad(a: IsoPt, b: IsoPt, c: IsoPt, d: IsoPt): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  private shade(hex: string, t: number): string {
    const raw = hex.startsWith("#") ? hex.slice(1) : hex;
    if (raw.length !== 6) return hex;
    const n = parseInt(raw, 16);
    if (Number.isNaN(n)) return hex;
    const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * t)));
    const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * t)));
    const b = Math.min(255, Math.max(0, Math.round((n & 255) * t)));
    return `rgb(${r},${g},${b})`;
  }

  private drawIsoBox(
    x: number,
    y: number,
    w: number,
    h: number,
    ez: number,
    top: string,
    opts?: { alpha?: number; stroke?: string; strokeW?: number; elev?: number },
  ): { cx: number; cy: number } {
    const n = this.toScreen(x, y, opts?.elev);
    const e = this.toScreen(x + w, y, opts?.elev);
    const s = this.toScreen(x + w, y + h, opts?.elev);
    const west = this.toScreen(x, y + h, opts?.elev);
    const up = (p: IsoPt): IsoPt => ({ x: p.x, y: p.y - ez });
    const n2 = up(n);
    const e2 = up(e);
    const s2 = up(s);
    const w2 = up(west);
    const ctx = this.ctx;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = (opts?.alpha ?? 1) * prev;
    if (ez > 0) {
      ctx.fillStyle = this.shade(top, 0.42);
      this.fillQuad(west, s, s2, w2);
      ctx.fillStyle = this.shade(top, 0.68);
      this.fillQuad(e, s, s2, e2);
    }
    ctx.fillStyle = top;
    this.fillQuad(n2, e2, s2, w2);
    if (opts?.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = opts.strokeW ?? 1.5;
      ctx.beginPath();
      ctx.moveTo(n2.x, n2.y);
      ctx.lineTo(e2.x, e2.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(w2.x, w2.y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = prev;
    return { cx: (n2.x + s2.x) / 2, cy: (n2.y + s2.y) / 2 };
  }

  private houseAt(wx: number, wy: number): EntityView | undefined {
    const ts = this.ts();
    return this.curr.entities.find((e) => {
      if (!isGarrisonable(e.type) || e.hp <= 0) return false;
      const x0 = e.tileX * ts;
      const y0 = e.tileY * ts;
      const pad = ts * 2;
      return wx >= x0 - pad && wx <= x0 + e.tileW * ts + pad && wy >= y0 - pad && wy <= y0 + e.tileH * ts + pad;
    });
  }

  private stemsOf(map: MapDef): { tx: number; ty: number }[] {
    if (this.treeStems) return this.treeStems;
    const out: { tx: number; ty: number }[] = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (treePropKind(map, tx, ty)) out.push({ tx, ty });
      }
    }
    this.treeStems = out;
    return out;
  }

  private collectTrees(items: { layer: number; z: number; run: () => void }[]): void {
    const map = this.map();
    const ts = map.tileSize;
    const explored = this.explored;
    const w = map.width;
    const { w: vw, h: vh } = this.viewSize();
    for (const { tx, ty } of this.stemsOf(map)) {
      if (map.tiles[ty * w + tx] !== TILE_TREE) continue;
      if (explored && !explored[ty * w + tx]) continue;
      const kind = treePropKind(map, tx, ty);
      if (!kind) continue;
      const wx = (tx + 0.5) * ts;
      const wy = (ty + 0.55) * ts;
      const p = this.toScreen(wx, wy);
      // Iso AABB of the viewport covers most of the map; skip sprites that
      // actually sit off-screen. Source art is ~800–1200px tall.
      if (p.x < -64 || p.y < -80 || p.x > vw + 64 || p.y > vh + 40) continue;
      const h = Math.imul(tx * 374761393 + ty * 668265263 + 9, 1103515245) >>> 0;
      const pine = kind === "lone" ? h % 3 !== 1 : h % 5 === 0;
      const drawH = kind === "lone" ? (pine ? 50 : 38) : pine ? 34 : 28;
      const dim = !this.lit(tx, ty);
      const flip = (h & 2) === 0 && !pine;
      const spr = pine ? TREE_PINE : TREE_OAK;
      items.push({
        layer: 0,
        z: isoDepth(wx, wy),
        run: () => {
          const ctx = this.ctx;
          ctx.save();
          if (dim) ctx.globalAlpha = 0.48;
          drawPropSprite(ctx, spr, p.x, p.y, drawH, flip);
          ctx.restore();
        },
      });
    }
  }

  private drawWaterShimmer(): void {
    const map = this.map();
    const vis = this.visibleTiles();
    const ctx = this.ctx;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / 1100);
    ctx.save();
    ctx.globalAlpha = 0.08 + 0.07 * pulse;
    ctx.fillStyle = "#9fd0c4";
    const step = 4;
    const x0 = vis.x0 - (vis.x0 % step);
    const y0 = vis.y0 - (vis.y0 % step);
    for (let ty = y0; ty <= vis.y1; ty += step) {
      for (let tx = x0; tx <= vis.x1; tx += step) {
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
        if (map.tiles[ty * map.width + tx] !== TILE_WATER) continue;
        const d = this.toScreen(tx * map.tileSize, ty * map.tileSize);
        const e = this.toScreen((tx + step) * map.tileSize, ty * map.tileSize);
        const s = this.toScreen((tx + step) * map.tileSize, (ty + step) * map.tileSize);
        const west = this.toScreen(tx * map.tileSize, (ty + step) * map.tileSize);
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(e.x, e.y);
        ctx.lineTo(s.x, s.y);
        ctx.lineTo(west.x, west.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private buildingLit(e: EntityView): boolean {
    for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
      for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
        if (this.lit(x, y)) return true;
      }
    }
    return false;
  }

  private cacheHouseGroups(): void {
    const lots: HouseLot[] = [];
    for (const e of this.curr.entities) {
      if (e.kind !== "building" || e.hp <= 0 || !isCivilianType(e.type)) continue;
      lots.push({ id: e.id, x: e.tileX, y: e.tileY, w: e.tileW, h: e.tileH });
    }
    this.houseNeighbors = neighborMap(lots);
  }

  /** Yard grass under a grouped house, shown in the seam where fences are clipped. */
  private static readonly YARD_GRASS = "#6e8c42";

  private clipIsoRect(x: number, y: number, w: number, h: number, elev: number): void {
    const n = this.toScreen(x, y, elev);
    const e = this.toScreen(x + w, y, elev);
    const s = this.toScreen(x + w, y + h, elev);
    const west = this.toScreen(x, y + h, elev);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y);
    ctx.lineTo(e.x, e.y);
    ctx.lineTo(s.x, s.y);
    ctx.lineTo(west.x, west.y);
    ctx.closePath();
    ctx.clip();
  }

  private drawBuilding(e: EntityView, ghost = false): void {
    const ts = this.ts();
    const ctx = this.ctx;
    const x = e.tileX * ts;
    const y = e.tileY * ts;
    const bw = e.tileW * ts;
    const bh = e.tileH * ts;
    const ez = this.extrude(e.type);
    const elev = heightAt(this.map(), e.tileX, e.tileY);
    const hex = this.ownerColor(e);
    const dim = ghost || !this.buildingLit(e);
    const spr = buildingSpriteFor(e.type, e.facing);
    const north = this.toScreen(x, y, elev);
    const south = this.toScreen(x + bw, y + bh, elev);
    const east = this.toScreen(x + bw, y, elev);
    const west = this.toScreen(x, y + bh, elev);
    const bar = this.toScreen(x + bw / 2, y + bh / 2, elev);
    let stack = { x: bar.x, y: bar.y - ez - 8 };
    const sides = !ghost ? this.houseNeighbors.get(e.id) : undefined;
    if (spr && spriteReady(spr)) {
      const footprintW = east.x - west.x;
      ctx.save();
      ctx.globalAlpha = dim ? 0.5 : 1;
      if (sides && hasNeighbor(sides)) {
        ctx.fillStyle = MapView.YARD_GRASS;
        this.fillQuad(north, east, south, west);
        const inset = seamInset(
          { id: e.id, x: e.tileX, y: e.tileY, w: e.tileW, h: e.tileH },
          sides,
        );
        this.clipIsoRect(inset.x * ts, inset.y * ts, inset.w * ts, inset.h * ts, elev);
      }
      drawBuildingSprite(ctx, spr, south.x, south.y, footprintW);
      ctx.restore();
      stack = buildingStackAt(spr, south.x, south.y, footprintW);
    } else {
      const top = this.drawIsoBox(x, y, bw, bh, ez, hex, {
        alpha: dim ? 0.5 : 1,
        stroke: ghost ? "#2a2018" : "#111",
        strokeW: 1.5,
        elev,
      });
      ctx.globalAlpha = dim ? 0.7 : 1;
      ctx.fillStyle = "#e8dcc4";
      ctx.font = "bold 16px Oswald, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(catalog(e.type).letter, top.cx, top.cy);
    }
    const layoutW = bw * 0.56;
    if (e.ownerId === this.curr.youPlayerId && (e.type === "core" || e.type === "rig")) {
      const name = this.curr.players.find((p) => p.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, stack.x, stack.y - 12);
    }
    if (!ghost) {
      this.maybeHp(e, stack.x - layoutW / 2, stack.y + 3, layoutW);
      this.drawGarrisonBars(e, stack.x + layoutW * 0.28, stack.y - 2);
    }
    this.drawDeployProgress(e, bar.x - layoutW / 2, bar.y + 4, layoutW);
    if (!ghost) {
      this.drawCaptureProgress(e, stack.x - layoutW / 2, stack.y + 10, layoutW);
    }
    if (!ghost && (e.state === "undeploy" || e.state === "deploy")) {
      const p = e.deployProgress ?? 0;
      ctx.strokeStyle = "#fff6c8";
      ctx.globalAlpha = 0.35 + 0.4 * p;
      ctx.lineWidth = 2;
      const inset = (1 - p) * ts * 0.4;
      this.strokeGroundRect(x + inset, y + inset, bw - inset * 2, bh - inset * 2, elev);
    }
    ctx.globalAlpha = 1;
  }

  private strokeGroundRect(x: number, y: number, w: number, h: number, elev?: number): void {
    const n = this.toScreen(x, y, elev);
    const e = this.toScreen(x + w, y, elev);
    const s = this.toScreen(x + w, y + h, elev);
    const west = this.toScreen(x, y + h, elev);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y);
    ctx.lineTo(e.x, e.y);
    ctx.lineTo(s.x, s.y);
    ctx.lineTo(west.x, west.y);
    ctx.closePath();
    ctx.stroke();
  }

  private cacheOccluders(): void {
    const ts = this.ts();
    const out: MapView["occBuildings"] = [];
    for (const e of this.curr.entities) {
      if (e.kind !== "building") continue;
      const x = e.tileX * ts;
      const y = e.tileY * ts;
      const w = e.tileW * ts;
      const h = e.tileH * ts;
      const elev = heightAt(this.map(), e.tileX, e.tileY);
      const east = this.toScreen(x + w, y, elev);
      const west = this.toScreen(x, y + h, elev);
      const south = this.toScreen(x + w, y + h, elev);
      const spr = buildingSpriteFor(e.type, e.facing);
      const footprintW = east.x - west.x;
      out.push({
        x,
        y,
        w,
        h,
        ez: buildingOccludeEz(spr, footprintW, this.extrude(e.type)),
        lift: isoLift(elev),
        spr: spr && spriteReady(spr) ? spr : undefined,
        southX: south.x,
        southY: south.y,
        footprintW,
      });
    }
    this.occBuildings = out;
  }

  private unitOccluded(e: EntityView): boolean {
    const p = this.lerpEnt(e);
    const unitSpr = spriteFor(e.type, e.stance, e.swimming);
    const visualLift = unitSpr
      ? unitSpr.drawSize * unitSpr.contactY * 0.62
      : this.extrude(e.type) * UNIT_VISUAL_SCALE * 0.7;
    const ts = this.ts();
    const unitLift = isoLift(this.elevAt(p.x, p.y));
    const s = this.toScreen(p.x, p.y);
    const samples: { x: number; y: number }[] = unitSpr
      ? [
          { x: s.x, y: s.y - unitSpr.drawSize * unitSpr.contactY * 0.88 },
          { x: s.x, y: s.y - unitSpr.drawSize * unitSpr.contactY * 0.5 },
          { x: s.x - unitSpr.drawSize * 0.2, y: s.y - unitSpr.drawSize * unitSpr.contactY * 0.62 },
          { x: s.x + unitSpr.drawSize * 0.2, y: s.y - unitSpr.drawSize * unitSpr.contactY * 0.62 },
        ]
      : [
          { x: s.x, y: s.y - this.extrude(e.type) * UNIT_VISUAL_SCALE },
          { x: s.x, y: s.y - this.extrude(e.type) * UNIT_VISUAL_SCALE * 0.45 },
        ];
    const unitRect = unitSpr
      ? {
          x: s.x - unitSpr.drawSize / 2,
          y: s.y - unitSpr.drawSize * unitSpr.contactY,
          w: unitSpr.drawSize,
          h: unitSpr.drawSize,
        }
      : undefined;
    for (const b of this.occBuildings) {
      if (p.x >= b.x + b.w || p.y >= b.y + b.h) continue;
      if (b.spr) {
        if (unitHitsBuildingSprite(b.spr, b.southX, b.southY, b.footprintW, samples, unitRect)) {
          return true;
        }
        continue;
      }
      if (unitBehindIsoBox(p.x, p.y, visualLift, b.x, b.y, b.w, b.h, b.ez, ts, b.lift, unitLift)) {
        return true;
      }
    }
    return false;
  }

  private takeMoveClicks(): { x: number; y: number; t: number }[] {
    const now = performance.now();
    const keep: MapView["moveClicks"] = [];
    const live: { x: number; y: number; t: number }[] = [];
    for (const m of this.moveClicks) {
      const t = (now - m.at) / MOVE_CLICK_MS;
      if (t >= 1) continue;
      keep.push(m);
      live.push({ x: m.x, y: m.y, t: Math.max(0, t) });
    }
    this.moveClicks = keep;
    return live;
  }

  private drawUnit(e: EntityView): void {
    const spr = spriteFor(e.type, e.stance, e.swimming);
    if (spr) {
      this.drawSpritedUnit(e, spr);
      return;
    }
    const ctx = this.ctx;
    const p = this.lerpEnt(e);
    const r = catalog(e.type).radius * UNIT_VISUAL_SCALE;
    const ez = this.extrude(e.type) * UNIT_VISUAL_SCALE;
    const hex = e.wreck ? "#6e6c66" : this.ownerColor(e);
    const s = this.toScreen(p.x, p.y);
    const occluded = this.unitOccluded(e);
    ctx.save();
    if (occluded) ctx.globalAlpha = OCCLUDED_UNIT_ALPHA;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    const top = this.drawIsoBox(p.x - r, p.y - r, r * 2, r * 2, ez, hex, {
      stroke: "#111",
      strokeW: 1.4,
    });
    const dir = facingToIso(p.turretFacing ?? p.facing, this.ts());
    const len = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const barrel = e.type === "warden" ? 18 : 11;
    ctx.fillStyle = e.wreck ? "#8a8680" : e.type === "warden" ? "#d8c48c" : "#fff6c8";
    ctx.beginPath();
    ctx.moveTo(top.cx + ux * barrel, top.cy + uy * barrel);
    ctx.lineTo(top.cx - ux * 5 - uy * 5, top.cy - uy * 5 + ux * 5);
    ctx.lineTo(top.cx - ux * 5 + uy * 5, top.cy - uy * 5 - ux * 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (e.ownerId === this.curr.youPlayerId && e.type === "rig") {
      const name = this.curr.players.find((pl) => pl.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, s.x, s.y - ez - 12);
    }
    this.maybeHp(e, s.x - r, s.y - ez - 10, r * 2);
    this.drawCrits(e, s.x + r, s.y - ez - 26);
    this.drawDeployProgress(e, s.x - r, s.y + 6, r * 2);
    if (e.type === "rig" && (e.state === "deploy" || e.state === "undeploy")) {
      const prog = e.deployProgress ?? 0;
      const size = this.ts() * (1 + 2 * prog);
      ctx.strokeStyle = "#fff6c8";
      ctx.globalAlpha = 0.3 + 0.5 * prog;
      ctx.lineWidth = 2;
      this.strokeGroundRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  }

  private drawSpritedUnit(e: EntityView, def: UnitSpriteDef): void {
    const ctx = this.ctx;
    const p = this.lerpEnt(e);
    const size = def.drawSize;
    const s = this.toScreen(p.x, p.y);
    const hex = this.ownerColor(e);
    const dir = facingToIso(p.facing, this.ts());
    const turretDir = facingToIso(p.turretFacing ?? p.facing, this.ts());
    const occluded = this.unitOccluded(e);
    const fade = occluded ? OCCLUDED_UNIT_ALPHA : 1;
    ctx.save();
    ctx.fillStyle = e.wreck ? "#2a2824" : hex;
    ctx.globalAlpha = (e.wreck ? 0.38 : 0.5) * fade;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, size * 0.32, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.save();
    if (e.wreck) ctx.filter = "grayscale(1) brightness(0.68) contrast(1.08)";
    const drawn = drawUnitSprite(ctx, def, s.x, s.y, dir.x, dir.y, {
      moving: !e.wreck && !immobilized(e) && (e.state === "move" || !!e.swimming),
      id: e.id,
      now: performance.now() * (this.curr.gameSpeed || 1),
      turretDx: turretDir.x,
      turretDy: turretDir.y,
    });
    if (drawn && e.scout?.out && !e.wreck) {
      drawScoutHead(ctx, s.x, s.y, turretDir.x, turretDir.y, size);
    }
    ctx.restore();
    ctx.restore();
    if (e.wreck && drawn) this.drawWreckFires(e, s.x, s.y, size, dir.x, dir.y);
    if (!drawn) {
      const r = Math.max(4, size * 0.22);
      ctx.save();
      if (occluded) ctx.globalAlpha = OCCLUDED_UNIT_ALPHA;
      this.drawIsoBox(p.x - r, p.y - r, r * 2, r * 2, size * 0.45, e.wreck ? "#6e6c66" : hex);
      ctx.restore();
      if (e.wreck) this.drawWreckFires(e, s.x, s.y, size, dir.x, dir.y);
    }
    if (e.ownerId === this.curr.youPlayerId && e.type === "rig") {
      const name = this.curr.players.find((pl) => pl.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, s.x, s.y - size * def.contactY - 12);
    }
    this.maybeHp(e, s.x - size * 0.45, s.y - size * def.contactY - 2, size * 0.9);
    this.drawScoutBar(e, s.x - size * 0.22, s.y - size * def.contactY - 8);
    this.drawCrits(e, s.x + size * 0.48, s.y - size * def.contactY - 20);
    this.drawDeployProgress(e, s.x - size * 0.45, s.y + 6, size * 0.9);
    if (e.type === "rig" && (e.state === "deploy" || e.state === "undeploy")) {
      const prog = e.deployProgress ?? 0;
      const footprint = this.ts() * (1 + 2 * prog);
      ctx.strokeStyle = "#fff6c8";
      ctx.globalAlpha = 0.3 + 0.5 * prog;
      ctx.lineWidth = 2;
      this.strokeGroundRect(p.x - footprint / 2, p.y - footprint / 2, footprint, footprint);
      ctx.globalAlpha = 1;
    }
  }

  private drawWreckFires(
    e: EntityView,
    x: number,
    y: number,
    size: number,
    dirX: number,
    dirY: number,
  ): void {
    let born = this.wreckBornAt.get(e.id);
    if (born === undefined) {
      born = performance.now();
      this.wreckBornAt.set(e.id, born);
    }
    const age = (performance.now() - born) * (this.curr.gameSpeed || 1);
    const now = performance.now();
    const n = wreckFireCount(e.id);
    const len = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / len;
    const uy = dirY / len;
    for (let i = 0; i < n; i++) {
      const a = wreckFireAlpha(age, i);
      if (a <= 0) continue;
      const along = i === 0 ? -0.02 : -0.1;
      const across = i === 0 ? 0.03 : -0.05;
      const ox = ux * size * along + -uy * size * across;
      const oy = uy * size * along * 0.45 + ux * size * across * 0.45 - size * (i === 0 ? 0.47 : 0.4);
      drawWreckFire(this.ctx, x + ox, y + oy, now, e.id * 13 + i * 29, a);
    }
  }

  private drawImpacts(): void {
    const now = performance.now();
    const ctx = this.ctx;
    const keep: typeof this.fx = [];
    for (const f of this.fx) {
      const life = fxLifeMs(f.kind, f.blast);
      const age = now - f.at;
      if (age > life) {
        this.fxIds.delete(f.id);
        continue;
      }
      keep.push(f);
      const t = age / life;
      const s = this.toScreen(f.x, f.y);
      const tip = this.toScreen(f.x + f.vx * 0.08, f.y + f.vy * 0.08);
      const dirX = tip.x - s.x;
      const dirY = tip.y - s.y;
      const lift =
        f.lift ??
        (f.kind === "miss" || f.kind === "puff"
          ? 0
          : (armorHitLift(f.kind, f.caliber, f.id, f.blast) ?? 14));
      const x = s.x + (f.sx ?? 0);
      const y = s.y - lift;
      if (f.kind === "kill" && f.blast) {
        drawCookoffBurst(ctx, x, y, t, f.id);
        const frame = fxFrameAt(age, life, FX_BOOM.frames, false);
        drawFxFrame(ctx, FX_BOOM, frame, x, y, 56, 1 - t * 0.35);
      } else if (f.kind === "kill" || f.kind === "pen" || f.kind === "hit" || f.kind === "glance") {
        const k: "hit" | "pen" | "glance" =
          f.kind === "pen" ? "pen" : f.kind === "glance" ? "glance" : "hit";
        drawKineticImpact(ctx, {
          kind: k,
          x,
          y,
          dirX,
          dirY,
          t,
          seed: f.id,
          caliber: f.caliber,
        });
      } else if (f.kind === "muzzle") {
        if (f.window) drawWindowMuzzle(ctx, x, y, dirX, dirY, t, f.caliber);
        else drawMuzzleBlast(ctx, x, y, dirX, dirY, t, f.caliber);
      } else if (f.kind === "smoke") {
        const frame = fxFrameAt(age, 700, FX_SMOKE.frames, true);
        drawFxFrame(ctx, FX_SMOKE, frame, x, y - 8 - t * 10, 34 + t * 10, 0.85 - t * 0.7);
      } else if (f.kind === "puff") {
        const frame = fxFrameAt(age, life, FX_SMOKE.frames, false);
        const smokeBurst = f.shell === "smoke";
        const tiny = smokeBurst ? 42 : isShellCaliber(f.caliber) ? 16 : 11;
        drawFxFrame(
          ctx,
          FX_SMOKE,
          frame,
          s.x,
          s.y - 3 - t * (smokeBurst ? 14 : 7),
          tiny + t * (smokeBurst ? 28 : 5),
          (smokeBurst ? 0.9 : 0.8) - t * 0.7,
        );
      } else if (f.kind === "ricochet") {
        drawRicochetSparks(ctx, x, y, dirX, dirY, t, f.id, f.caliber);
      } else if (f.kind === "miss") {
        drawGroundMiss(ctx, s.x, s.y, t, f.id, f.caliber);
      }
    }
    this.fx = keep;
  }

  private drawSmokeClouds(): void {
    const clouds = this.curr.smoke ?? [];
    if (clouds.length === 0) return;
    const map = this.map();
    const ts = map.tileSize;
    const ctx = this.ctx;
    const now = performance.now();
    for (const c of clouds) {
      const fade = cloudScale(c);
      const along = c.halfAlong * fade * ts;
      const across = c.halfAcross * fade * ts;
      const cx = worldToTile(c.x, ts);
      const cy = worldToTile(c.y, ts);
      if (!(this.explored?.[cy * map.width + cx] || this.lit(cx, cy))) continue;
      const ground = this.toScreen(c.x, c.y);
      ctx.save();
      ctx.globalAlpha = 0.22 * fade;
      ctx.fillStyle = "#6a6458";
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, along * 1.15, Math.max(10, across * 0.55), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const puffs = 11;
      for (let i = 0; i < puffs; i++) {
        const u = (i / (puffs - 1)) * 2 - 1;
        const wx = c.x + c.ux * u * along * 0.92;
        const wy = c.y + c.uy * u * along * 0.92;
        const perpX = -c.uy;
        const perpY = c.ux;
        const wobble = Math.sin(c.id * 0.7 + i * 1.7) * across * 0.55;
        const px = wx + perpX * wobble;
        const py = wy + perpY * wobble;
        const tx = worldToTile(px, ts);
        const ty = worldToTile(py, ts);
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
        if (!this.explored?.[ty * map.width + tx] && !this.lit(tx, ty)) continue;
        const s = this.toScreen(px, py);
        const frame = fxFrameAt(now + c.id * 40 + i * 110, 1400, FX_SMOKE.frames, true);
        const size = 38 + fade * 22 + Math.abs(u) * 8;
        const alpha = (0.42 + fade * 0.38) * (1 - Math.abs(u) * 0.18);
        drawFxFrame(ctx, FX_SMOKE, frame, s.x, s.y - 10 - fade * 8, size, alpha);
      }
    }
  }

  private drawDeployProgress(e: EntityView, x: number, y: number, w: number): void {
    if (e.state !== "deploy" && e.state !== "undeploy") return;
    const p = Math.max(0, Math.min(1, e.deployProgress ?? 0));
    const ctx = this.ctx;
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y + 2, w, 5);
    ctx.fillStyle = "#e8b84a";
    ctx.fillRect(x, y + 2, w * p, 5);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + 2, w, 5);
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8dcc4";
    const label = e.state === "undeploy" ? "PACK" : "DEPLOY";
    ctx.fillText(`${label} ${Math.round(p * 100)}%`, x + w / 2, y + 16);
  }

  private drawCaptureProgress(e: EntityView, x: number, y: number, w: number): void {
    const cap = e.capture;
    if (!cap || cap.progress <= 0) return;
    const p = Math.max(0, Math.min(1, cap.progress));
    const holder = this.curr.players.find((pl) => pl.playerId === cap.ownerId);
    const fill = colorHex(holder?.colorId ?? 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(8, 6, 4, 0.78)";
    ctx.fillRect(x, y + 2, w, 5);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y + 2, w * p, 5);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + 2, w, 5);
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8dcc4";
    ctx.fillText(`CAPTURE ${Math.round(p * 100)}%`, x + w / 2, y + 16);
    ctx.restore();
  }

  private hoverSpecial = false;

  private syncCursor(): void {
    let special = false;
    if (!this.placeMode && !this.overControl && !this.box && this.mouseX >= 0) {
      const { w, h } = this.viewSize();
      if (this.mouseX <= w && this.mouseY <= h) {
        const hit = this.hit(this.mouseX, this.mouseY);
        special = !!hit && this.canSpecial(hit);
      }
    }
    this.hoverSpecial = special;
    const attack =
      (this.attackMoveMode ||
        this.forceAttackMode ||
        this.rotateMode ||
        this.guardMode ||
        (this.ctrlHeld && this.ownSelectedIds().length > 0)) &&
      !this.overControl;
    this.canvas.classList.toggle("cursor-special", special);
    this.canvas.classList.toggle("cursor-attack", attack && !special);
    this.canvas.style.cursor = special || attack ? "none" : "";
  }

  private drawSpecialCursor(): void {
    if (!this.hoverSpecial) return;
    const x = this.mouseX;
    const y = this.mouseY;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = "#e8b84a";
    ctx.strokeStyle = "#140e0a";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0.5, 0.5);
    ctx.lineTo(0.5, 20);
    ctx.lineTo(6.2, 14.8);
    ctx.lineTo(10.5, 24);
    ctx.lineTo(14.2, 22.2);
    ctx.lineTo(9.4, 13.2);
    ctx.lineTo(16.5, 13.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(17, 4);
    ctx.lineTo(25, 4);
    ctx.lineTo(21, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawCrits(e: EntityView, rightX: number, y: number): void {
    if (e.wreck || !e.crits || e.crits.length === 0) return;
    const size = 16;
    const gap = 2;
    const ctx = this.ctx;
    let x = rightX - e.crits.length * (size + gap) + gap;
    for (const c of e.crits) {
      const img = critIcon(c);
      if (spriteReady({ image: img })) {
        ctx.drawImage(img, Math.round(x), Math.round(y), size, size);
      }
      x += size + gap;
    }
  }

  private hostileOwner(ownerId: string | undefined): boolean {
    return !!ownerId && !ownerAllied(this.curr, ownerId);
  }

  private paintHpBar(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    alpha: number,
    hostile = false,
    vivid = false,
  ): void {
    const ctx = this.ctx;
    const fillW = w * Math.max(0, Math.min(1, ratio));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = vivid ? "rgba(6, 4, 2, 0.88)" : "rgba(8, 6, 4, 0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = vivid ? alpha : alpha * 1.15;
    ctx.fillStyle = hpBarFill(ratio, hostile, vivid);
    ctx.fillRect(x, y, fillW, h);
    if (vivid && fillW > 1 && h >= 3) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = "rgba(255, 255, 230, 0.7)";
      ctx.fillRect(x, y, fillW, 1);
    }
    if (vivid) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "rgba(8, 6, 4, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  private drawGarrisonBars(e: EntityView, x: number, y: number): void {
    const bars = e.garrison?.bars;
    if (!bars || bars.length === 0) return;
    const barW = 18;
    const barH = 3;
    const gap = 2;
    const pad = 2;
    const totalH = bars.length * (barH + gap) - gap;
    const hostile = this.hostileOwner(e.garrison?.ownerId);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(8, 6, 4, 0.62)";
    ctx.fillRect(Math.round(x) - pad, Math.round(y) - pad, barW + pad * 2, totalH + pad * 2);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]!;
      const ratio = b.hpMax > 0 ? b.hp / b.hpMax : 0;
      this.paintHpBar(Math.round(x), Math.round(y) + i * (barH + gap), barW, barH, ratio, 0.9, hostile);
    }
    ctx.restore();
  }

  private drawScoutBar(e: EntityView, x: number, y: number): void {
    const scout = e.scout;
    if (!scout || e.wreck || scout.hpMax <= 0) return;
    const selected = this.selected.has(e.id);
    if (!selected && !scout.out) return;
    const ratio = Math.max(0, Math.min(1, scout.hp / scout.hpMax));
    const barW = selected ? 18 : 14;
    const barH = 2;
    this.ctx.save();
    this.paintHpBar(Math.round(x), Math.round(y), barW, barH, ratio, selected ? 0.95 : 0.7, this.hostileOwner(e.ownerId), selected);
    this.ctx.restore();
  }

  private maybeHp(e: EntityView, x: number, y: number, w: number): void {
    if (e.wreck) return;
    const now = performance.now();
    const selected = this.selected.has(e.id);
    const damaged = (this.damagedUntil.get(e.id) ?? 0) > now;
    const unit = e.kind === "unit";
    const capturing = (e.capture?.progress ?? 0) > 0;
    if (!(unit || selected || damaged || capturing)) return;
    const ratio = Math.max(0, Math.min(1, e.hp / e.hpMax));
    const barW = Math.max(8, selected ? w * 0.48 : w * 0.4);
    const barH = selected ? 3 : 2;
    const bx = x + (w - barW) / 2;
    const by = y - (selected ? 4 : 3);
    const alpha = selected ? 1 : damaged ? 0.42 : 0.28;
    const ctx = this.ctx;
    ctx.save();
    this.paintHpBar(bx, by, barW, barH, ratio, alpha, this.hostileOwner(e.ownerId), selected);
    ctx.restore();
  }

  private ownerColor(e: EntityView): string {
    if (isCivilianType(e.type) && !e.ownerId) {
      const occ = e.garrison?.ownerId;
      if (occ) {
        const holder = this.curr.players.find((pl) => pl.playerId === occ);
        if (holder) return colorHex(holder.colorId);
      }
      return CIV_FILL;
    }
    const p = this.curr.players.find((pl) => pl.playerId === e.ownerId);
    return colorHex(p?.colorId ?? 0);
  }

  private drawGhost(type: BuildingType): void {
    const def = catalog(type);
    const tile = this.screenToTile(this.mouseX, this.mouseY);
    const ok = previewPlace(this.curr, type, tile.x, tile.y);
    const ts = this.ts();
    const top = ok ? "#7dff6a" : "#ff5a4a";
    const x = tile.x * ts;
    const y = tile.y * ts;
    const bw = def.tileW * ts;
    const bh = def.tileH * ts;
    const elev = heightAt(this.map(), tile.x, tile.y);
    const spr = buildingSpriteFor(type);
    if (spr && spriteReady(spr)) {
      const south = this.toScreen(x + bw, y + bh, elev);
      const east = this.toScreen(x + bw, y, elev);
      const west = this.toScreen(x, y + bh, elev);
      const n = this.toScreen(x, y, elev);
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = top;
      this.fillQuad(n, east, south, west);
      ctx.globalAlpha = 0.55;
      drawBuildingSprite(ctx, spr, south.x, south.y, east.x - west.x);
      ctx.restore();
      ctx.strokeStyle = top;
      ctx.lineWidth = 2;
      this.strokeGroundRect(x, y, bw, bh, elev);
      return;
    }
    this.drawIsoBox(x, y, bw, bh, this.extrude(type), top, {
      alpha: 0.4,
      stroke: top,
      strokeW: 2,
      elev,
    });
  }

  private drawMini(): void {
    const map = this.map();
    const ctx = this.mctx;
    const w = this.mini.clientWidth;
    const h = this.mini.clientHeight;
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, w, h);
    const scale = Math.min(w / map.width, h / map.height);
    const dw = map.width * scale;
    const dh = map.height * scale;
    ctx.imageSmoothingEnabled = false;
    if (this.miniTerrain) ctx.drawImage(this.miniTerrain.canvas, 0, 0, dw, dh);
    if (this.miniFog) ctx.drawImage(this.miniFog, 0, 0, dw, dh);
    const ts = map.tileSize;
    const { w: vw, h: vh } = this.viewSize();
    const corners = [
      this.screenToWorldFlat(0, 0),
      this.screenToWorldFlat(vw, 0),
      this.screenToWorldFlat(vw, vh),
      this.screenToWorldFlat(0, vh),
    ];
    ctx.strokeStyle = "#e8b84a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((c, i) => {
      const x = (c.x / ts) * scale;
      const y = (c.y / ts) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    for (const e of this.curr.entities) {
      if (e.garrisonedIn) continue;
      ctx.fillStyle = e.wreck ? "#6a6860" : this.ownerColor(e);
      const tx = e.kind === "building" ? e.tileX + e.tileW / 2 : e.x / ts;
      const ty = e.kind === "building" ? e.tileY + e.tileH / 2 : e.y / ts;
      const sz = e.kind === "building" ? 4 : 3;
      ctx.fillRect(tx * scale - sz / 2, ty * scale - sz / 2, sz, sz);
    }
  }
}
