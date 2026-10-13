/**
 * Shell and missile craters paint after the baked ground, so a scar on the
 * bank covers the rounded pond. Each crater is drawn into a scratch and the
 * pond mask is punched out before the blit, which leaves the water — and the
 * fog already on it — above the hole.
 */

export type PxRect = { x: number; y: number; w: number; h: number };

/** Opaque pond mask in the same pixel space as the canvas being drawn on; `scale` canvas px per mask px (1 when left out). */
export type WaterCover = { canvas: HTMLCanvasElement; x: number; y: number; scale?: number };

function maskScale(m: WaterCover): number {
  return m.scale ?? 1;
}

export function rectsOverlap(a: PxRect, b: PxRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function unionRect(a: PxRect, b: PxRect): PxRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * Screen rect of a prop whose contact sits at (x, y). Matches `propBlit`:
 * the draw height is rounded, the contact offset is not.
 */
export function propScreenRect(
  x: number,
  y: number,
  drawH: number,
  imageW: number,
  imageH: number,
  contactX: number,
  contactY: number,
  flip = false,
): PxRect {
  const h = Math.max(1, Math.round(drawH));
  const scale = imageH > 0 ? h / imageH : 1;
  const dw = Math.max(1, Math.round(imageW * scale));
  const dh = Math.max(1, Math.round(imageH * scale));
  const cx = (flip ? imageW - contactX : contactX) * scale;
  const cy = contactY * scale;
  return { x: x - cx, y: y - cy, w: dw, h: dh };
}

/** Bound of the vector crater, including the lip and the flung clods. */
export function fallbackHoleRect(x: number, y: number, rx: number, ry: number): PxRect {
  const reach = Math.max(rx, ry) * 1.4;
  return { x: x - reach, y: y - reach, w: reach * 2, h: reach * 2 };
}

/** Atlas-space masks moved into the view. `blitTerrain` uses this same shift. */
export function screenWaterCovers(
  bodies: readonly WaterCover[],
  camX: number,
  camY: number,
  originX: number,
  originY: number,
): WaterCover[] {
  const dx = originX - camX;
  const dy = originY - camY;
  return bodies.map((b) => ({ canvas: b.canvas, x: b.x + dx, y: b.y + dy, scale: b.scale }));
}

/** Intersection of a mask with the scratch, in mask pixels and scratch pixels. */
export function maskPunchRect(
  maskX: number,
  maskY: number,
  maskW: number,
  maskH: number,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number } | null {
  const x0 = Math.max(maskX, destX);
  const y0 = Math.max(maskY, destY);
  const x1 = Math.min(maskX + maskW, destX + destW);
  const y1 = Math.min(maskY + maskH, destY + destH);
  if (x1 <= x0 || y1 <= y0) return null;
  return { sx: x0 - maskX, sy: y0 - maskY, sw: x1 - x0, sh: y1 - y0, dx: x0 - destX, dy: y0 - destY };
}

/**
 * Draw `paint` (in the same coordinates as `ctx`) and erase every opaque
 * texel of `masks` from it. No overlap paints straight to `ctx`.
 */
export function coverWithWater(
  ctx: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  dest: PxRect,
  masks: readonly WaterCover[],
  paint: (ctx: CanvasRenderingContext2D) => void,
): void {
  const hit = masks.filter((m) =>
    rectsOverlap(dest, { x: m.x, y: m.y, w: m.canvas.width * maskScale(m), h: m.canvas.height * maskScale(m) }),
  );
  if (hit.length === 0) {
    paint(ctx);
    return;
  }
  const left = Math.floor(dest.x) - 1;
  const top = Math.floor(dest.y) - 1;
  const sw = Math.max(1, Math.ceil(dest.x + dest.w) - left + 1);
  const sh = Math.max(1, Math.ceil(dest.y + dest.h) - top + 1);
  // Match the view transform so a zoomed crater is rasterized like one on open ground.
  const t = ctx.getTransform();
  const scaleX = t.a;
  const scaleY = t.d;
  if (t.b !== 0 || t.c !== 0 || !(scaleX > 0) || !(scaleY > 0)) {
    paint(ctx);
    return;
  }
  const bw = Math.max(1, Math.ceil(sw * scaleX));
  const bh = Math.max(1, Math.ceil(sh * scaleY));
  if (scratch.width < bw || scratch.height < bh) {
    scratch.width = Math.max(scratch.width, bw);
    scratch.height = Math.max(scratch.height, bh);
  }
  const sc = scratch.getContext("2d");
  if (!sc) {
    paint(ctx);
    return;
  }
  const view = new DOMMatrix([scaleX, t.b, t.c, scaleY, t.e - left * scaleX, t.f - top * scaleY]);
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = "source-over";
  sc.globalAlpha = 1;
  sc.clearRect(0, 0, bw, bh);
  sc.setTransform(view);
  sc.imageSmoothingEnabled = true;
  sc.imageSmoothingQuality = "low";
  sc.save();
  paint(sc);
  sc.restore();
  sc.setTransform(view);
  sc.globalCompositeOperation = "destination-out";
  sc.globalAlpha = 1;
  sc.imageSmoothingEnabled = false;
  for (const m of hit) {
    const k = maskScale(m);
    const punch = maskPunchRect(m.x, m.y, m.canvas.width * k, m.canvas.height * k, left, top, sw, sh);
    if (!punch) continue;
    // A mask worked out at a quarter scale is read smoothed, so the punched edge is a curve, not steps.
    sc.imageSmoothingEnabled = k !== 1;
    sc.drawImage(m.canvas, punch.sx / k, punch.sy / k, punch.sw / k, punch.sh / k, left + punch.dx, top + punch.dy, punch.sw, punch.sh);
  }
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, bw, bh, left * scaleX + t.e, top * scaleY + t.f, bw, bh);
  ctx.restore();
}
