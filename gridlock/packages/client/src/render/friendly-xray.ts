import { compareDrawOrder, type DrawKey } from "./corpse-depth.js";

/**
 * Your own and allied units a structure stands in front of still show through
 * it: the part of the unit the structure's painted pixels cover is drawn again
 * over the structure at this alpha. Client-only.
 */
export const FRIENDLY_XRAY_ALPHA = 0.5;

export type XrayRect = { x: number; y: number; w: number; h: number };
export type XrayItem = { key: DrawKey; rect: XrayRect };

function overlap(a: XrayRect, b: XrayRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * For each cover, the indices of units it paints over: the unit sorts before
 * the cover and their screen rects meet. Covers that hide nobody get no entry.
 */
export function xrayPairs(units: readonly XrayItem[], covers: readonly XrayItem[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  covers.forEach((c, ci) => {
    units.forEach((u, ui) => {
      if (!overlap(u.rect, c.rect) || compareDrawOrder(u.key, c.key) >= 0) return;
      const list = out.get(ci);
      if (list) list.push(ui);
      else out.set(ci, [ui]);
    });
  });
  return out;
}

/**
 * Viewport-sized scratch layer. Units are drawn into it, the cover's own
 * sprite cuts them down to its pixels, and the rest goes to the main canvas
 * at FRIENDLY_XRAY_ALPHA.
 */
export class XrayLayer {
  private layer: HTMLCanvasElement | null = null;
  private lctx: CanvasRenderingContext2D | null = null;

  /** Scratch context with the main transform, cleared under `bounds`; null when canvases are unavailable. */
  begin(main: CanvasRenderingContext2D, bounds: XrayRect): CanvasRenderingContext2D | null {
    const cw = main.canvas.width;
    const ch = main.canvas.height;
    if (!this.layer) {
      this.layer = document.createElement("canvas");
      this.lctx = this.layer.getContext("2d");
    }
    const l = this.layer;
    const lctx = this.lctx;
    if (!lctx) return null;
    if (l.width !== cw || l.height !== ch) {
      l.width = cw;
      l.height = ch;
    }
    const d = deviceRect(main, bounds, cw, ch);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    if (d) lctx.clearRect(d.x, d.y, d.w, d.h);
    lctx.setTransform(main.getTransform());
    lctx.imageSmoothingEnabled = main.imageSmoothingEnabled;
    lctx.imageSmoothingQuality = main.imageSmoothingQuality;
    lctx.globalAlpha = 1;
    lctx.globalCompositeOperation = "source-over";
    return lctx;
  }

  /** Keep only what `mask` paints over, then lay the layer on `main` under `bounds`. */
  end(main: CanvasRenderingContext2D, bounds: XrayRect, alpha: number, mask: (ctx: CanvasRenderingContext2D) => void): void {
    const lctx = this.lctx;
    const l = this.layer;
    if (!lctx || !l) return;
    const d = deviceRect(main, bounds, l.width, l.height);
    if (!d) return;
    lctx.save();
    lctx.globalAlpha = 1;
    lctx.globalCompositeOperation = "destination-in";
    mask(lctx);
    lctx.restore();
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalAlpha = alpha;
    main.globalCompositeOperation = "source-over";
    main.drawImage(l, d.x, d.y, d.w, d.h, d.x, d.y, d.w, d.h);
    main.restore();
  }
}

function deviceRect(main: CanvasRenderingContext2D, r: XrayRect, cw: number, ch: number): XrayRect | null {
  const t = main.getTransform();
  const x0 = Math.max(0, Math.floor(t.a * r.x + t.e) - 2);
  const y0 = Math.max(0, Math.floor(t.d * r.y + t.f) - 2);
  const x1 = Math.min(cw, Math.ceil(t.a * (r.x + r.w) + t.e) + 2);
  const y1 = Math.min(ch, Math.ceil(t.d * (r.y + r.h) + t.f) + 2);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
