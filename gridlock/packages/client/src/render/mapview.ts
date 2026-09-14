import {
  catalog,
  clampIsoCamera,
  isCivilianType,
  isGarrisonable,
  isInfantryType,
  colorHex,
  entityOnMask,
  facingToIso,
  getMap,
  TILE_EMPTY,
  TILE_TREE,
  immobilized,
  heightAt,
  isoDepth,
  isoLift,
  isoToWorld,
  maxHeightOf,
  pickElevatedTile,
  pointInIsoBox,
  previewPlace,
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
  drawRicochetSparks,
  fxFrameAt,
  fxLifeMs,
  isShellCaliber,
} from "./fx.js";
import {
  UNIT_VISUAL_SCALE,
  buildingSpriteFor,
  critIcon,
  drawBuildingSprite,
  drawUnitSprite,
  spriteFor,
  spriteReady,
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
  updateMiniScrap,
  updateScrap,
  type MiniBake,
  type TerrainBake,
} from "./terrain.js";

/** Special-action key. D is camera (WASD). */
export const SPECIAL_HOTKEY = "e";

const EDGE_SCROLL_KEY = "gridlock.edgeScroll";
let edgeScroll = localStorage.getItem(EDGE_SCROLL_KEY) === "1";

/** Screen-edge camera pan. Off by default; WASD / arrows always work. */
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
  house: 36,
  manor: 48,
};

const CIV_FILL = "#b08968";

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
  private explored: Uint8Array | null = null;
  private vis: Uint8Array | null = null;
  private exploredMapId = "";
  private maxElev = 0;
  private terrain: TerrainBake | null = null;
  private miniTerrain: MiniBake | null = null;
  private liveMap: MapDef | null = null;
  private fog: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private miniFog: HTMLCanvasElement | null = null;
  private miniFogCtx: CanvasRenderingContext2D | null = null;
  private miniFogData: ImageData | null = null;
  private ghosts = new Map<number, EntityView>();
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
  }[] = [];
  private seenShots = new Set<number>();
  selected = new Set<number>();
  placeMode = false;
  attackMoveMode = false;
  onSelect: (ids: number[]) => void = () => {};
  onCommand: (msg: ClientMessage) => void = () => {};
  onPlaceMode: () => void = () => {};
  onAttackMoveMode: () => void = () => {};

  setAttackMoveMode(on: boolean): void {
    if (this.attackMoveMode === on) return;
    this.attackMoveMode = on;
    if (on) this.placeMode = false;
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
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  setSnapshot(match: MatchSnapshot): void {
    this.prev = this.curr;
    this.curr = match;
    this.snapAt = performance.now();
    const now = this.snapAt;
    for (const e of match.entities) {
      const prev = this.lastHp.get(e.id);
      if (prev !== undefined && e.hp < prev) this.damagedUntil.set(e.id, now + 2000);
      this.lastHp.set(e.id, e.hp);
    }
    for (const i of match.impacts ?? []) {
      if (!this.fx.some((f) => f.id === i.id)) {
        this.fx.push({ ...i, at: now });
        if (i.kind === "kill" && i.blast) {
          this.fx.push({ id: i.id + 7_000_000, kind: "smoke", x: i.x, y: i.y, vx: 0, vy: 0, at: now });
        }
        if (i.kind === "crush") {
          this.fx.push({ id: i.id + 7_000_000, kind: "smoke", x: i.x, y: i.y, vx: 0, vy: 0, at: now });
        }
      }
    }
    if (this.seenShots.size > 400) this.seenShots.clear();
    for (const p of match.projectiles) {
      if (p.bounced || (p.caliber ?? 0) < 40 || this.seenShots.has(p.id)) continue;
      this.seenShots.add(p.id);
      const shooter = match.entities.find((e) => e.id === p.fromId);
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const reach = shooter ? catalog(shooter.type).radius * UNIT_VISUAL_SCALE + 10 : 16;
      this.fx.push({
        id: p.id + 8_000_000,
        kind: "muzzle",
        x: (shooter?.x ?? p.x) + (p.vx / sp) * reach,
        y: (shooter?.y ?? p.y) + (p.vy / sp) * reach,
        vx: p.vx,
        vy: p.vy,
        at: now,
        caliber: p.caliber,
      });
    }
    for (const id of [...this.selected]) {
      if (!match.entities.some((e) => e.id === id)) this.selected.delete(id);
    }
    if (this.attackMoveMode && this.ownSelectedIds().length === 0) this.setAttackMoveMode(false);
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

  private applyClearedTrees(): void {
    const map = this.map();
    const list = this.curr.clearedTrees ?? [];
    if (list.length === 0) return;
    const dirty: number[] = [];
    const w = map.width;
    for (const t of list) {
      if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= map.height) continue;
      const i = t.y * w + t.x;
      if (map.tiles[i] !== TILE_TREE) continue;
      map.tiles[i] = TILE_EMPTY;
      dirty.push(i);
    }
    if (dirty.length === 0) return;
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
    const map = getMap(match.mapId);
    if (!map) return;
    const n = map.width * map.height;
    if (!this.explored || this.explored.length !== n || this.exploredMapId !== match.mapId) {
      this.explored = new Uint8Array(n);
      this.exploredMapId = match.mapId;
      this.vis = null;
      this.ghosts.clear();
      this.resetFog(map);
    }
    const prevVis = this.vis;
    const vis = visionMaskFromSnapshot(match, map.width, map.height, map.tileSize);
    this.patchFog(map, prevVis, this.explored, vis);
    this.vis = vis;
    for (let i = 0; i < n; i++) {
      if (vis[i]) this.explored[i] = 1;
    }
    this.rebuildMiniFog(map, n);
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
    }
    return this.liveMap;
  }

  private bind(): void {
    window.addEventListener("keydown", this.onKey, { capture: true });
    window.addEventListener("keyup", this.onKeyUp, { capture: true });
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
        if (this.attackMoveMode) {
          this.setAttackMoveMode(false);
          return;
        }
        this.onRight(mx, my);
        return;
      }
      if (e.button === 0) {
        if (this.attackMoveMode) {
          this.commitAttackMove(mx, my);
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
    this.syncCursor();
  };

  private onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key.toLowerCase();
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
    if (k === "g") {
      e.preventDefault();
      this.garrisonHotkey();
      return;
    }
    if (k === SPECIAL_HOTKEY) {
      e.preventDefault();
      this.specialSelected();
      return;
    }
    if (k === "x") {
      e.preventDefault();
      this.setAttackMoveMode(false);
      const ids = [...this.selected].filter((id) => {
        const ent = this.curr.entities.find((x) => x.id === id);
        return !!ent && ent.ownerId === this.curr.youPlayerId && !ent.wreck && ent.kind === "unit";
      });
      if (ids.length) this.onCommand({ type: "cmd.stop", ids });
      return;
    }
    if (k === "f") {
      e.preventDefault();
      const ids = this.ownSelectedIds();
      if (ids.length) this.setAttackMoveMode(!this.attackMoveMode);
      return;
    }
    if (k === "escape") {
      if (this.attackMoveMode) {
        e.preventDefault();
        this.setAttackMoveMode(false);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (this.isCameraKey(k)) e.preventDefault();
    this.keys.delete(k);
  };

  private isCameraKey(k: string): boolean {
    return k === "w" || k === "a" || k === "s" || k === "d" || k.startsWith("arrow");
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
    this.onCommand({ type: "cmd.attackmove", ids, x: w.x, y: w.y });
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

  private depthOf(e: EntityView): number {
    const ts = this.ts();
    if (e.kind === "building") return isoDepth((e.tileX + e.tileW) * ts, (e.tileY + e.tileH) * ts);
    const p = this.lerpEnt(e);
    return isoDepth(p.x, p.y) + 1;
  }

  private hit(px: number, py: number): EntityView | null {
    const ts = this.ts();
    const ix = px + this.camX;
    const iy = py + this.camY;
    const list = [...this.curr.entities].sort((a, b) => this.depthOf(b) - this.depthOf(a));
    for (const e of list) {
      if (e.kind === "unit") {
        const p = this.lerpEnt(e);
        const spr = spriteFor(e.type);
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
      this.onCommand({ type: "cmd.harvest", ids: haulers.map((e) => e.id), tileX: tile.x, tileY: tile.y });
      return;
    }
    if (hit?.type === "smelter" && hit.ownerId === this.curr.youPlayerId && haulers.length) {
      const w = this.screenToWorld(px, py);
      this.onCommand({ type: "cmd.move", ids: haulers.map((e) => e.id), x: w.x, y: w.y });
      return;
    }
    const w = this.screenToWorld(px, py);
    this.onCommand({ type: "cmd.move", ids: own.filter((e) => e.kind === "unit").map((e) => e.id), x: w.x, y: w.y });
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
    if (this.keys.has("s") || this.keys.has("arrowdown")) vy += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) vx -= 1;
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
      if (this.fog) blitAtlas(ctx, this.fog, bake.originX, bake.originY, this.camX, this.camY, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";

    const liveIds = new Set(this.curr.entities.map((e) => e.id));
    const drawList: EntityView[] = [
      ...this.curr.entities,
      ...[...this.ghosts.values()].filter((g) => !liveIds.has(g.id)),
    ];
    drawList.sort((a, b) => this.depthOf(a) - this.depthOf(b));
    for (const e of drawList) {
      const ghost = !liveIds.has(e.id);
      if (e.kind === "building") this.drawBuilding(e, ghost);
      else if (!ghost && !e.garrisonedIn) this.drawUnit(e);
    }

    for (const p of this.curr.projectiles) {
      const bounced = p.bounced === true;
      const shell = isShellCaliber(p.caliber);
      if (!bounced && !shell) continue;
      const t = Math.min(1, (performance.now() - this.snapAt) / 100);
      const look = t * 0.1 * (this.curr.gameSpeed || 1);
      const prevP = this.prev?.projectiles.find((q) => q.id === p.id);
      const wx = prevP ? prevP.x + (p.x - prevP.x) * t : p.x;
      const wy = prevP ? prevP.y + (p.y - prevP.y) * t : p.y;
      const a = this.toScreen(wx, wy);
      const b = this.toScreen(wx + p.vx * look, wy + p.vy * look);
      const lift = bounced ? 7 : 10;
      if (bounced) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const tail = this.toScreen(wx - (p.vx / sp) * 14, wy - (p.vy / sp) * 14);
        ctx.save();
        ctx.strokeStyle = "rgba(255, 236, 176, 0.92)";
        ctx.lineWidth = 1.15;
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y - lift);
        ctx.lineTo(a.x, a.y - lift);
        ctx.stroke();
        ctx.fillStyle = "#fff8e4";
        ctx.fillRect(a.x - 0.5, a.y - lift - 0.5, 1.2, 1.2);
        ctx.restore();
      } else if (shell) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 236, 176, 0.55)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - lift);
        ctx.lineTo(b.x, b.y - lift);
        ctx.stroke();
        ctx.fillStyle = "#fff8e4";
        ctx.beginPath();
        ctx.ellipse(b.x, b.y - lift, 3.1, 2.1, Math.atan2(b.y - a.y, b.x - a.x), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
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

  private buildingLit(e: EntityView): boolean {
    for (let y = e.tileY; y < e.tileY + e.tileH; y++) {
      for (let x = e.tileX; x < e.tileX + e.tileW; x++) {
        if (this.lit(x, y)) return true;
      }
    }
    return false;
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
    const selected = this.selected.has(e.id) && !ghost;
    const spr = buildingSpriteFor(e.type);
    let top: { cx: number; cy: number };
    if (spr && spriteReady(spr)) {
      const south = this.toScreen(x + bw, y + bh, elev);
      const east = this.toScreen(x + bw, y, elev);
      const west = this.toScreen(x, y + bh, elev);
      const footprintW = east.x - west.x;
      ctx.save();
      ctx.globalAlpha = dim ? 0.5 : 1;
      drawBuildingSprite(ctx, spr, south.x, south.y, footprintW);
      ctx.restore();
      ctx.strokeStyle = selected ? "#e8b84a" : hex;
      ctx.lineWidth = selected ? 2.5 : 1.6;
      ctx.globalAlpha = dim ? 0.7 : 1;
      this.strokeGroundRect(x, y, bw, bh, elev);
      top = { cx: south.x, cy: south.y - spr.padSouthY * (footprintW / spr.padWidth) };
    } else {
      top = this.drawIsoBox(x, y, bw, bh, ez, hex, {
        alpha: dim ? 0.5 : 1,
        stroke: ghost ? "#2a2018" : selected ? "#e8b84a" : "#111",
        strokeW: selected ? 2.5 : 1.5,
        elev,
      });
      ctx.globalAlpha = dim ? 0.7 : 1;
      ctx.fillStyle = "#e8dcc4";
      ctx.font = "bold 16px Oswald, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(catalog(e.type).letter, top.cx, top.cy);
    }
    if (e.ownerId === this.curr.youPlayerId && (e.type === "core" || e.type === "rig")) {
      const name = this.curr.players.find((p) => p.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, top.cx, top.cy - ez * 0.15 - 14);
    }
    const bar = this.toScreen(x + bw / 2, y + bh / 2, elev);
    if (!ghost) {
      this.maybeHp(e, bar.x - bw * 0.28, spr && spriteReady(spr) ? top.cy + 6 : bar.y - ez - 8, bw * 0.56);
    }
    this.drawDeployProgress(e, bar.x - bw * 0.28, bar.y + 4, bw * 0.56);
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

  private drawGroundMark(wx: number, wy: number, r: number, color: string): void {
    const s = this.toScreen(wx, wy);
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 1.25, r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawUnit(e: EntityView): void {
    const spr = spriteFor(e.type);
    if (spr) {
      this.drawSpritedUnit(e, spr);
      return;
    }
    const ctx = this.ctx;
    const p = this.lerpEnt(e);
    const r = catalog(e.type).radius * UNIT_VISUAL_SCALE;
    const ez = this.extrude(e.type) * UNIT_VISUAL_SCALE;
    const hex = this.ownerColor(e);
    const s = this.toScreen(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    const top = this.drawIsoBox(p.x - r, p.y - r, r * 2, r * 2, ez, hex, {
      stroke: this.selected.has(e.id) ? "#e8b84a" : "#111",
      strokeW: this.selected.has(e.id) ? 2.8 : 1.4,
    });
    const dir = facingToIso(p.turretFacing ?? p.facing, this.ts());
    const len = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const barrel = e.type === "warden" ? 18 : 11;
    ctx.fillStyle = e.type === "warden" ? "#d8c48c" : "#fff6c8";
    ctx.beginPath();
    ctx.moveTo(top.cx + ux * barrel, top.cy + uy * barrel);
    ctx.lineTo(top.cx - ux * 5 - uy * 5, top.cy - uy * 5 + ux * 5);
    ctx.lineTo(top.cx - ux * 5 + uy * 5, top.cy - uy * 5 - ux * 5);
    ctx.closePath();
    ctx.fill();
    if (this.selected.has(e.id)) this.drawGroundMark(p.x, p.y, r + 4, "#e8b84a");
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
    ctx.fillStyle = hex;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, size * 0.32, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    if (e.wreck) ctx.globalAlpha = 0.55;
    const drawn = drawUnitSprite(ctx, def, s.x, s.y, dir.x, dir.y, {
      moving: !e.wreck && e.state === "move" && !immobilized(e),
      id: e.id,
      now: performance.now() * (this.curr.gameSpeed || 1),
      turretDx: turretDir.x,
      turretDy: turretDir.y,
    });
    if (e.wreck && drawn) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#1a120c";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y - size * 0.35, size * 0.28, size * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (!drawn) {
      const r = Math.max(4, size * 0.22);
      this.drawIsoBox(p.x - r, p.y - r, r * 2, r * 2, size * 0.45, hex);
    }
    if (this.selected.has(e.id)) this.drawGroundMark(p.x, p.y, size * 0.45, "#e8b84a");
    if (e.ownerId === this.curr.youPlayerId && e.type === "rig") {
      const name = this.curr.players.find((pl) => pl.playerId === e.ownerId)?.name ?? "";
      ctx.font = "12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8dcc4";
      ctx.fillText(name, s.x, s.y - size * def.contactY - 12);
    }
    const engineOut = e.crits?.includes("engine") === true;
    if (e.wreck || engineOut || (e.type === "warden" && e.hp > 0 && e.hp / e.hpMax < 0.62)) {
      const hurt = e.wreck ? 0.85 : engineOut ? 0.7 : 1 - e.hp / e.hpMax;
      const frame = fxFrameAt(performance.now() + e.id * 90, 900, FX_SMOKE.frames, true);
      drawFxFrame(
        ctx,
        FX_SMOKE,
        frame,
        s.x + 2,
        s.y - size * 0.52,
        size * (0.42 + hurt * 0.28),
        0.45 + hurt * 0.4,
      );
    }
    this.maybeHp(e, s.x - size * 0.45, s.y - size * def.contactY - 2, size * 0.9);
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

  private drawImpacts(): void {
    const now = performance.now();
    const ctx = this.ctx;
    const keep: typeof this.fx = [];
    for (const f of this.fx) {
      const life = fxLifeMs(f.kind, f.blast);
      const age = now - f.at;
      if (age > life) continue;
      keep.push(f);
      const t = age / life;
      const s = this.toScreen(f.x, f.y);
      const tip = this.toScreen(f.x + f.vx * 0.08, f.y + f.vy * 0.08);
      const dirX = tip.x - s.x;
      const dirY = tip.y - s.y;
      const lift = f.kind === "miss" || f.kind === "puff" ? 0 : 14;
      const x = s.x;
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
        drawMuzzleBlast(ctx, x, y, dirX, dirY, t, f.caliber);
      } else if (f.kind === "smoke") {
        const frame = fxFrameAt(age, 700, FX_SMOKE.frames, true);
        drawFxFrame(ctx, FX_SMOKE, frame, x, y - 8 - t * 10, 34 + t * 10, 0.85 - t * 0.7);
      } else if (f.kind === "puff") {
        const frame = fxFrameAt(age, life, FX_SMOKE.frames, false);
        const tiny = isShellCaliber(f.caliber) ? 16 : 11;
        drawFxFrame(ctx, FX_SMOKE, frame, s.x, s.y - 3 - t * 7, tiny + t * 5, 0.8 - t * 0.7);
      } else if (f.kind === "ricochet") {
        drawRicochetSparks(ctx, x, y, dirX, dirY, t, f.id, f.caliber);
      } else if (f.kind === "crush" || f.kind === "puff") {
        const frame = fxFrameAt(age, life, FX_SMOKE.frames, false);
        drawFxFrame(ctx, FX_SMOKE, frame, x, y - 4 - t * 8, 26 + t * 18, 0.9 - t * 0.8);
      } else if (f.kind === "miss") {
        drawGroundMiss(ctx, s.x, s.y, t, f.id, f.caliber);
      }
    }
    this.fx = keep;
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
    const attack = this.attackMoveMode && !this.overControl;
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

  private maybeHp(e: EntityView, x: number, y: number, w: number): void {
    const now = performance.now();
    const selected = this.selected.has(e.id);
    const damaged = (this.damagedUntil.get(e.id) ?? 0) > now;
    const unit = e.kind === "unit" && !e.wreck;
    if (!(unit || e.wreck || selected || damaged)) return;
    const ratio = Math.max(0, Math.min(1, e.hp / e.hpMax));
    const barW = Math.max(8, w * 0.4);
    const barH = 2;
    const bx = x + (w - barW) / 2;
    const by = y - 3;
    const alpha = selected ? 0.58 : damaged || e.wreck ? 0.42 : 0.28;
    const fill = ratio > 0.45 ? "#6aaa58" : ratio > 0.2 ? "#b8923c" : "#b45448";
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.globalAlpha = alpha * 1.15;
    ctx.fillStyle = fill;
    ctx.fillRect(bx, by, barW * ratio, barH);
    ctx.restore();
  }

  private ownerColor(e: EntityView): string {
    if (isCivilianType(e.type)) {
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
      ctx.fillStyle = this.ownerColor(e);
      const tx = e.kind === "building" ? e.tileX + e.tileW / 2 : e.x / ts;
      const ty = e.kind === "building" ? e.tileY + e.tileH / 2 : e.y / ts;
      const sz = e.kind === "building" ? 4 : 3;
      ctx.fillRect(tx * scale - sz / 2, ty * scale - sz / 2, sz, sz);
    }
  }
}
