import {
  TILE_BLOCKED,
  catalog,
  clampIsoCamera,
  colorHex,
  entityOnMask,
  facingToIso,
  getMap,
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
  tileDiamond,
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
  type MatchSnapshot,
} from "@gridlock/shared";
import { FX_BOOM, FX_SMOKE, drawFxFrame, fxFrameAt } from "./fx.js";
import {
  UNIT_VISUAL_SCALE,
  buildingSpriteFor,
  drawBuildingSprite,
  drawUnitSprite,
  spriteFor,
  spriteReady,
  type UnitSpriteDef,
} from "./sprites.js";

/** Special-action key. D is camera (WASD). */
export const SPECIAL_HOTKEY = "e";

const WALL_H = 20;
const SCRAP_H = 12;

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
};

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
  private ghosts = new Map<number, EntityView>();
  private fx: { id: number; kind: string; x: number; y: number; vx: number; vy: number; at: number }[] = [];
  private seenShots = new Set<number>();
  selected = new Set<number>();
  placeMode = false;
  onSelect: (ids: number[]) => void = () => {};
  onCommand: (msg: ClientMessage) => void = () => {};
  onPlaceMode: () => void = () => {};

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
        if (i.kind === "kill") {
          this.fx.push({ id: i.id + 7_000_000, kind: "smoke", x: i.x, y: i.y, vx: 0, vy: 0, at: now });
        }
      }
    }
    if (this.seenShots.size > 400) this.seenShots.clear();
    for (const p of match.projectiles) {
      if (p.bounced || (p.caliber ?? 0) < 40 || this.seenShots.has(p.id)) continue;
      this.seenShots.add(p.id);
      const shooter = match.entities.find((e) => e.id === p.fromId);
      this.fx.push({
        id: p.id + 8_000_000,
        kind: "muzzle",
        x: shooter?.x ?? p.x,
        y: shooter?.y ?? p.y,
        vx: p.vx,
        vy: p.vy,
        at: now,
      });
    }
    for (const id of [...this.selected]) {
      if (!match.entities.some((e) => e.id === id)) this.selected.delete(id);
    }
    const placing = this.placeMode;
    if (!this.readyBuilding()) this.placeMode = false;
    if (this.placeMode !== placing) this.onPlaceMode();
    this.revealFrom(match);
  }

  private revealFrom(match: MatchSnapshot): void {
    const map = getMap(match.mapId);
    if (!map) return;
    const n = map.width * map.height;
    if (!this.explored || this.explored.length !== n || this.exploredMapId !== match.mapId) {
      this.explored = new Uint8Array(n);
      this.exploredMapId = match.mapId;
      this.ghosts.clear();
    }
    const vis = visionMaskFromSnapshot(match, map.width, map.height, map.tileSize);
    this.vis = vis;
    for (let i = 0; i < n; i++) {
      if (vis[i]) this.explored[i] = 1;
    }
    for (const e of match.entities) {
      if (e.kind === "building" && e.ownerId !== match.youPlayerId) this.ghosts.set(e.id, e);
    }
    for (const [id, g] of this.ghosts) {
      if (match.entities.some((e) => e.id === id)) continue;
      if (entityOnMask(g, vis, map.width, map.height, map.tileSize)) this.ghosts.delete(id);
    }
  }

  private lit(tx: number, ty: number): boolean {
    const map = this.map();
    if (!this.vis) return true;
    return tileOnMask(this.vis, map.width, tx, ty);
  }

  private seen(tx: number, ty: number): boolean {
    const map = this.map();
    if (!this.explored) return true;
    return tileOnMask(this.explored, map.width, tx, ty);
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
    return m;
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
        this.onRight(mx, my);
        return;
      }
      if (e.button === 0) {
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
    if (k === SPECIAL_HOTKEY) {
      e.preventDefault();
      this.specialSelected();
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
    const p = clampIsoCamera(
      this.camX,
      this.camY,
      w,
      h,
      map.width,
      map.height,
      map.tileSize,
      maxHeightOf(map),
    );
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
    );
    if (picked) return picked;
    const w = this.screenToWorldFlat(px, py);
    return { x: worldToTile(w.x, ts), y: worldToTile(w.y, ts) };
  }

  private lerpEnt(e: EntityView): { x: number; y: number; facing: number } {
    const t = Math.min(1, (performance.now() - this.snapAt) / 100);
    const prev = this.prev?.entities.find((p) => p.id === e.id);
    if (!prev || t >= 1) return { x: e.x, y: e.y, facing: e.facing };
    let df = e.facing - prev.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    return {
      x: prev.x + (e.x - prev.x) * t,
      y: prev.y + (e.y - prev.y) * t,
      facing: prev.facing + df * t,
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
    if (hit.ownerId !== this.curr.youPlayerId) {
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
      if (e.kind !== "unit" || e.ownerId !== this.curr.youPlayerId) continue;
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
      .filter((e): e is EntityView => !!e && e.ownerId === this.curr.youPlayerId);
    if (own.length === 0) return;
    const hit = this.hit(px, py);
    if (hit && hit.ownerId !== this.curr.youPlayerId) {
      this.onCommand({ type: "cmd.attack", ids: own.map((e) => e.id), targetId: hit.id });
      return;
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
    if (!this.panning && !this.box && this.winX >= 0 && !this.overControl) {
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
    const dpr = devicePixelRatio || 1;
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
    const liftPad = isoLift(maxHeightOf(map)) + 48;
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
    const extra = maxHeightOf(map) + 2;
    return {
      x0: Math.max(0, worldToTile(minX, ts) - 1),
      y0: Math.max(0, worldToTile(minY, ts) - 1),
      x1: Math.min(map.width - 1, worldToTile(maxX, ts) + extra),
      y1: Math.min(map.height - 1, worldToTile(maxY, ts) + extra),
    };
  }

  private draw(): void {
    const map = this.map();
    const ctx = this.ctx;
    const { w, h } = this.viewSize();
    ctx.fillStyle = "#0c1008";
    ctx.fillRect(0, 0, w, h);

    const vis = this.visibleTiles();
    const scrapSet = new Set(this.curr.scrap.map((s) => `${s.x},${s.y}`));
    const tiles: { x: number; y: number }[] = [];
    for (let y = vis.y0; y <= vis.y1; y++) {
      for (let x = vis.x0; x <= vis.x1; x++) tiles.push({ x, y });
    }
    tiles.sort((a, b) => a.x + a.y - (b.x + b.y));

    for (const t of tiles) {
      if (!this.seen(t.x, t.y)) {
        this.fillTile(t.x, t.y, "#050403");
        continue;
      }
      const blocked = map.tiles[t.y * map.width + t.x] === TILE_BLOCKED;
      const scrap = scrapSet.has(`${t.x},${t.y}`);
      this.fillTile(t.x, t.y, this.groundFill(t.x, t.y, blocked, scrap));
    }

    const ts = map.tileSize;
    for (const t of tiles) {
      if (!this.seen(t.x, t.y)) continue;
      if (map.tiles[t.y * map.width + t.x] === TILE_BLOCKED) {
        this.drawIsoBox(t.x * ts, t.y * ts, ts, ts, WALL_H, "#3a2a22", { elev: heightAt(map, t.x, t.y) });
      } else if (scrapSet.has(`${t.x},${t.y}`)) {
        const inset = ts * 0.18;
        this.drawIsoBox(t.x * ts + inset, t.y * ts + inset, ts - inset * 2, ts - inset * 2, SCRAP_H, "#c4a24a", {
          elev: heightAt(map, t.x, t.y),
        });
      }
    }

    for (const t of tiles) {
      if (!this.seen(t.x, t.y) || this.lit(t.x, t.y)) continue;
      this.fillTile(t.x, t.y, "rgba(0,0,0,0.55)");
    }

    const liveIds = new Set(this.curr.entities.map((e) => e.id));
    const drawList: EntityView[] = [
      ...this.curr.entities,
      ...[...this.ghosts.values()].filter((g) => !liveIds.has(g.id)),
    ];
    drawList.sort((a, b) => this.depthOf(a) - this.depthOf(b));
    for (const e of drawList) {
      const ghost = !liveIds.has(e.id);
      if (e.kind === "building") this.drawBuilding(e, ghost);
      else if (!ghost) this.drawUnit(e);
    }

    for (const p of this.curr.projectiles) {
      const t = Math.min(1, (performance.now() - this.snapAt) / 100);
      const look = t * 0.1 * (this.curr.gameSpeed || 1);
      const a = this.toScreen(p.x, p.y);
      const b = this.toScreen(p.x + p.vx * look, p.y + p.vy * look);
      const bounced = p.bounced === true;
      const shell = (p.caliber ?? 0) >= 40;
      const lift = bounced ? 12 : shell ? 10 : 6;
      if (bounced) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const tail = this.toScreen(p.x - (p.vx / sp) * 28, p.y - (p.vy / sp) * 28);
        ctx.strokeStyle = "#ffe9a0";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y - lift);
        ctx.lineTo(b.x, b.y - lift);
        ctx.stroke();
        ctx.fillStyle = "#fff6c8";
        ctx.beginPath();
        ctx.arc(b.x, b.y - lift, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffb040";
        ctx.beginPath();
        ctx.arc(b.x, b.y - lift, 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = shell ? "#f0d070" : "#e8b84a";
        ctx.lineWidth = shell ? 3 : 1.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - lift);
        ctx.lineTo(b.x, b.y - lift);
        ctx.stroke();
        ctx.fillStyle = "#fff6c8";
        const s = shell ? 5 : 3;
        ctx.fillRect(b.x - s / 2, b.y - lift - s / 2, s, s);
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
  }

  private tileScreen(tx: number, ty: number): { n: IsoPt; e: IsoPt; s: IsoPt; w: IsoPt } {
    const d = tileDiamond(tx, ty, this.ts());
    return {
      n: { x: d.n.x - this.camX, y: d.n.y - this.camY },
      e: { x: d.e.x - this.camX, y: d.e.y - this.camY },
      s: { x: d.s.x - this.camX, y: d.s.y - this.camY },
      w: { x: d.w.x - this.camX, y: d.w.y - this.camY },
    };
  }

  private groundFill(tx: number, ty: number, blocked: boolean, scrap: boolean): string {
    const chk = (tx + ty) % 2 === 0;
    const fill = blocked ? "#2a1e18" : scrap ? (chk ? "#5a4a18" : "#4a3c14") : chk ? "#2a3a24" : "#243320";
    const h = heightAt(this.map(), tx, ty);
    if (h <= 0 || blocked) return fill;
    return this.shade(fill, 1 + h * 0.16);
  }

  private fillTile(tx: number, ty: number, fill: string): void {
    const map = this.map();
    const h = heightAt(map, tx, ty);
    const ez = isoLift(h);
    const d = this.tileScreen(tx, ty);
    const up = (p: IsoPt, z: number): IsoPt => ({ x: p.x, y: p.y - z });
    const hs = ty + 1 < map.height ? heightAt(map, tx, ty + 1) : 0;
    const he = tx + 1 < map.width ? heightAt(map, tx + 1, ty) : 0;
    if (h > hs) {
      this.ctx.fillStyle = this.shade(fill, 0.42);
      this.fillQuad(up(d.w, ez), up(d.s, ez), up(d.s, isoLift(hs)), up(d.w, isoLift(hs)));
    }
    if (h > he) {
      this.ctx.fillStyle = this.shade(fill, 0.68);
      this.fillQuad(up(d.e, ez), up(d.s, ez), up(d.s, isoLift(he)), up(d.e, isoLift(he)));
    }
    this.ctx.fillStyle = fill;
    this.fillQuad(up(d.n, ez), up(d.e, ez), up(d.s, ez), up(d.w, ez));
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
    this.maybeHp(e, bar.x - bw * 0.28, spr && spriteReady(spr) ? top.cy + 6 : bar.y - ez - 8, bw * 0.56);
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
    const dir = facingToIso(p.facing, this.ts());
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
    ctx.fillStyle = hex;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, size * 0.32, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const drawn = drawUnitSprite(ctx, def, s.x, s.y, dir.x, dir.y, {
      moving: e.state === "move",
      id: e.id,
      now: performance.now() * (this.curr.gameSpeed || 1),
    });
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
    if (e.type === "warden" && e.hp > 0 && e.hp / e.hpMax < 0.62) {
      const hurt = 1 - e.hp / e.hpMax;
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
      const life =
        f.kind === "kill"
          ? 780
          : f.kind === "smoke"
            ? 2200
            : f.kind === "muzzle"
              ? 280
              : f.kind === "pen"
                ? 560
                : f.kind === "ricochet"
                  ? 520
                  : f.kind === "miss"
                    ? 300
                    : 400;
      const age = now - f.at;
      if (age > life) continue;
      keep.push(f);
      const t = age / life;
      const s = this.toScreen(f.x, f.y);
      const lift = 14;
      if (f.kind === "kill" || f.kind === "pen" || f.kind === "hit") {
        const size = f.kind === "kill" ? 56 : f.kind === "pen" ? 42 : 30;
        const frame = fxFrameAt(age, life, FX_BOOM.frames, false);
        drawFxFrame(ctx, FX_BOOM, frame, s.x, s.y - lift, size, 1 - t * 0.35);
      } else if (f.kind === "muzzle") {
        const frame = fxFrameAt(age, life, FX_SMOKE.frames, false);
        drawFxFrame(ctx, FX_SMOKE, frame, s.x, s.y - lift - 4, 26, 1 - t);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t * 2.2);
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath();
        ctx.arc(s.x, s.y - lift, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (f.kind === "smoke") {
        const frame = fxFrameAt(age, 700, FX_SMOKE.frames, true);
        drawFxFrame(ctx, FX_SMOKE, frame, s.x, s.y - lift - 8 - t * 10, 34 + t * 10, 0.85 - t * 0.7);
      } else if (f.kind === "ricochet") {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        const tip = this.toScreen(f.x + f.vx * 0.12, f.y + f.vy * 0.12);
        ctx.strokeStyle = "#fff6c8";
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const u = 0.2 + i * 0.18;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - 10);
          ctx.lineTo(s.x + (tip.x - s.x) * u + (i - 2) * 4, s.y - 10 + (tip.y - s.y) * u - 8 * t);
          ctx.stroke();
        }
        ctx.restore();
      } else if (f.kind === "miss") {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = "#6a5a40";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 7 + t * 6, 3.5 + t * 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        const frame = fxFrameAt(age, life, FX_SMOKE.frames, false);
        drawFxFrame(ctx, FX_SMOKE, frame, s.x, s.y - 10, 22, 1 - t);
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
    this.canvas.classList.toggle("cursor-special", special);
    this.canvas.style.cursor = special ? "none" : "";
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

  private maybeHp(e: EntityView, x: number, y: number, w: number): void {
    const now = performance.now();
    const show = this.selected.has(e.id) || (this.damagedUntil.get(e.id) ?? 0) > now;
    if (!show) return;
    const ctx = this.ctx;
    const ratio = Math.max(0, e.hp / e.hpMax);
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y - 6, w, 4);
    ctx.fillStyle = ratio > 0.45 ? "#7dff6a" : ratio > 0.2 ? "#e8b84a" : "#ff5a4a";
    ctx.fillRect(x, y - 6, w * ratio, 4);
  }

  private ownerColor(e: EntityView): string {
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
    const scrapSet = new Set(this.curr.scrap.map((s) => `${s.x},${s.y}`));
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!this.seen(x, y)) {
          ctx.fillStyle = "#050403";
          ctx.fillRect(x * scale, y * scale, Math.max(1, scale), Math.max(1, scale));
          continue;
        }
        const blocked = map.tiles[y * map.width + x] === TILE_BLOCKED;
        const scrap = scrapSet.has(`${x},${y}`);
        const h = heightAt(map, x, y);
        ctx.fillStyle = blocked
          ? "#3a2a22"
          : scrap
            ? "#5a4a18"
            : h >= 3
              ? "#5c6e40"
              : h === 2
                ? "#4a5a38"
                : h === 1
                  ? "#354a30"
                  : "#2a3a24";
        ctx.fillRect(x * scale, y * scale, Math.max(1, scale), Math.max(1, scale));
        if (!this.lit(x, y)) {
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(x * scale, y * scale, Math.max(1, scale), Math.max(1, scale));
        }
      }
    }
    const ts = map.tileSize;
    const { w: vw, h: vh } = this.viewSize();
    const corners = [
      this.screenToWorld(0, 0),
      this.screenToWorld(vw, 0),
      this.screenToWorld(vw, vh),
      this.screenToWorld(0, vh),
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
      ctx.fillStyle = this.ownerColor(e);
      const tx = e.kind === "building" ? e.tileX + e.tileW / 2 : e.x / ts;
      const ty = e.kind === "building" ? e.tileY + e.tileH / 2 : e.y / ts;
      const sz = e.kind === "building" ? 4 : 3;
      ctx.fillRect(tx * scale - sz / 2, ty * scale - sz / 2, sz, sz);
    }
  }
}
