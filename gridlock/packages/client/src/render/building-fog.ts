import { FOG_VEIL_ALPHA, fogCss } from "./fog-field.js";

type Pt = { x: number; y: number };

/** One footprint cell group and the veil it carries. Tile coordinates. */
export type VeilCell = { tx: number; ty: number; tw: number; th: number; cu: number; cv: number };

/**
 * Footprint split into at most `maxSide` x `maxSide` groups, back (low tx+ty)
 * to front, so a nearer column paints over the one behind it.
 */
export function veilCells(tileX: number, tileY: number, tileW: number, tileH: number, maxSide = 8): VeilCell[] {
  const sx = Math.max(1, Math.ceil(tileW / maxSide));
  const sy = Math.max(1, Math.ceil(tileH / maxSide));
  const out: VeilCell[] = [];
  for (let y = 0; y < tileH; y += sy) {
    for (let x = 0; x < tileW; x += sx) {
      const tw = Math.min(sx, tileW - x);
      const th = Math.min(sy, tileH - y);
      out.push({ tx: tileX + x, ty: tileY + y, tw, th, cu: tileX + x + tw / 2, cv: tileY + y + th / 2 });
    }
  }
  out.sort((a, b) => a.cu + a.cv - (b.cu + b.cv) || a.cu - b.cu);
  return out;
}

/** The screen hull of a ground diamond swept straight up by `rise` pixels. */
export function columnPolygon(n: Pt, e: Pt, s: Pt, w: Pt, rise: number): Pt[] {
  if (rise <= 0) return [n, e, s, w];
  return [
    { x: n.x, y: n.y - rise },
    { x: e.x, y: e.y - rise },
    e,
    s,
    w,
    { x: w.x, y: w.y - rise },
  ];
}

/** Veil spread at most this far apart between columns before we bother masking per column. */
const UNIFORM_EPS = 0.02;

export function uniformVeil(alphas: readonly number[]): number | null {
  if (alphas.length === 0) return 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of alphas) {
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
  }
  return hi - lo <= UNIFORM_EPS ? (lo + hi) / 2 : null;
}

export const VEIL_LEVELS = 12;

export function veilLevel(alpha: number): number {
  return Math.max(0, Math.min(VEIL_LEVELS, Math.round((alpha / FOG_VEIL_ALPHA) * VEIL_LEVELS)));
}

const veiledCache = new WeakMap<CanvasImageSource, (HTMLCanvasElement | null)[]>();

/** `src` with the fog veil laid over its own pixels, cached per veil level. */
export function veiledCopy(src: HTMLCanvasElement | HTMLImageElement, alpha: number): CanvasImageSource {
  const level = veilLevel(alpha);
  if (level <= 0) return src;
  let bag = veiledCache.get(src);
  if (!bag) {
    bag = new Array<HTMLCanvasElement | null>(VEIL_LEVELS + 1).fill(null);
    veiledCache.set(src, bag);
  }
  const hit = bag[level];
  if (hit) return hit;
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  if (w <= 0 || h <= 0) return src;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return src;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = fogCss((level / VEIL_LEVELS) * FOG_VEIL_ALPHA);
  g.fillRect(0, 0, w, h);
  bag[level] = c;
  return c;
}

export type VeilColumn = { poly: Pt[]; alpha: number };

/**
 * Viewport-sized scratch layers. A building is drawn into `layer`, the veil
 * mask lands on its own pixels only, and the result goes to the main canvas
 * in the building's depth slot.
 */
export class BuildingVeil {
  private layer: HTMLCanvasElement | null = null;
  private lctx: CanvasRenderingContext2D | null = null;
  private mask: HTMLCanvasElement | null = null;
  private mctx: CanvasRenderingContext2D | null = null;

  /** Scratch context with the main transform, or null when canvases are unavailable. */
  begin(main: CanvasRenderingContext2D): CanvasRenderingContext2D | null {
    const cw = main.canvas.width;
    const ch = main.canvas.height;
    if (!this.layer) {
      this.layer = document.createElement("canvas");
      this.lctx = this.layer.getContext("2d");
      this.mask = document.createElement("canvas");
      this.mctx = this.mask.getContext("2d");
    }
    const l = this.layer;
    const m = this.mask!;
    const lctx = this.lctx;
    if (!lctx || !this.mctx) return null;
    if (l.width !== cw || l.height !== ch) {
      l.width = cw;
      l.height = ch;
      m.width = cw;
      m.height = ch;
    }
    lctx.setTransform(main.getTransform());
    lctx.imageSmoothingEnabled = main.imageSmoothingEnabled;
    lctx.imageSmoothingQuality = main.imageSmoothingQuality;
    lctx.globalAlpha = 1;
    lctx.globalCompositeOperation = "source-over";
    return lctx;
  }

  /**
   * Veil the drawn building and composite it. `bounds` is in the main
   * canvas's user space; `columns` are back to front.
   */
  end(
    main: CanvasRenderingContext2D,
    bounds: { x: number; y: number; w: number; h: number },
    columns: VeilColumn[],
    base: number,
  ): void {
    const lctx = this.lctx;
    const mctx = this.mctx;
    if (!lctx || !mctx || !this.layer || !this.mask) return;
    const t = main.getTransform();
    const dx0 = Math.max(0, Math.floor(t.a * bounds.x + t.e) - 4);
    const dy0 = Math.max(0, Math.floor(t.d * bounds.y + t.f) - 4);
    const dx1 = Math.min(this.layer.width, Math.ceil(t.a * (bounds.x + bounds.w) + t.e) + 4);
    const dy1 = Math.min(this.layer.height, Math.ceil(t.d * (bounds.y + bounds.h) + t.f) + 4);
    const dw = dx1 - dx0;
    const dh = dy1 - dy0;
    if (dw > 0 && dh > 0) {
      const uni = uniformVeil(columns.map((c) => c.alpha));
      lctx.save();
      lctx.globalCompositeOperation = "source-atop";
      if (uni != null) {
        if (uni > 0.002) {
          lctx.setTransform(1, 0, 0, 1, 0, 0);
          lctx.fillStyle = fogCss(uni);
          lctx.fillRect(dx0, dy0, dw, dh);
        }
      } else {
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.clearRect(dx0, dy0, dw, dh);
        mctx.setTransform(t);
        mctx.globalCompositeOperation = "source-over";
        mctx.fillStyle = fogCss(base);
        mctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        for (const col of columns) {
          mctx.beginPath();
          const p0 = col.poly[0]!;
          mctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < col.poly.length; i++) mctx.lineTo(col.poly[i]!.x, col.poly[i]!.y);
          mctx.closePath();
          mctx.globalCompositeOperation = "destination-out";
          mctx.fillStyle = "#000";
          mctx.fill();
          mctx.globalCompositeOperation = "source-over";
          mctx.fillStyle = fogCss(col.alpha);
          mctx.fill();
        }
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.filter = "blur(2px)";
        lctx.drawImage(this.mask, dx0, dy0, dw, dh, dx0, dy0, dw, dh);
        lctx.filter = "none";
      }
      lctx.restore();
      main.save();
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.globalAlpha = 1;
      main.drawImage(this.layer, dx0, dy0, dw, dh, dx0, dy0, dw, dh);
      main.restore();
    }
    lctx.save();
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, this.layer.width, this.layer.height);
    lctx.restore();
  }
}