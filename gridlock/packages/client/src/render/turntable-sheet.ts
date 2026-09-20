/// <reference types="vite/client" />

import { engineRowFromFacing, engineRowFromFrame, pickTurntableUrls, TURNTABLE_DIRS } from "./turntable.js";

export interface TurntableSheetOpts {
  cell: number;
  contactY: number;
  padding: number;
  cameoFacing: number;
  cameoSize: number;
}

const TIGER_OPTS: TurntableSheetOpts = {
  cell: 128,
  contactY: 0.92,
  padding: 4,
  cameoFacing: 0,
  cameoSize: 128,
};

const hullGlob = import.meta.glob("../assets/units/tiger/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const turretGlob = import.meta.glob("../assets/units/tiger/turret/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const tigerGunGlob = import.meta.glob("../assets/units/tiger/gun/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const ss3HullGlob = import.meta.glob("../assets/units/ss3/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const ss3GunGlob = import.meta.glob("../assets/units/ss3/gun/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export const SS3_OPTS: TurntableSheetOpts = { ...TIGER_OPTS };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function opaqueBBox(img: HTMLImageElement, alphaMin = 8): BBox | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  let found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) < alphaMin) continue;
      found = true;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x + 1 > x1) x1 = x + 1;
      if (y + 1 > y1) y1 = y + 1;
    }
  }
  return found ? { x0, y0, x1, y1 } : null;
}

function makeSheetCanvas(cell: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = cell;
  c.height = TURNTABLE_DIRS * cell;
  return c;
}

function place(
  dest: CanvasRenderingContext2D,
  src: HTMLImageElement,
  cell: number,
  row: number,
  scale: number,
  ox: number,
  oy: number,
): void {
  dest.save();
  dest.beginPath();
  dest.rect(0, row * cell, cell, cell);
  dest.clip();
  dest.imageSmoothingEnabled = true;
  dest.imageSmoothingQuality = "high";
  dest.drawImage(src, ox, row * cell + oy, src.naturalWidth * scale, src.naturalHeight * scale);
  dest.restore();
}

export interface ComposedTurntable {
  sheetUrls: string[];
  cameoUrl: string;
}

let previous: ComposedTurntable | null = null;

function revoke(rec: ComposedTurntable | null): void {
  if (!rec) return;
  for (const url of rec.sheetUrls) URL.revokeObjectURL(url);
  URL.revokeObjectURL(rec.cameoUrl);
}

function canvasPngUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("turntable toBlob failed"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

function opaqueBBoxCanvas(c: HTMLCanvasElement, alphaMin = 8): BBox | null {
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  const w = c.width;
  const h = c.height;
  const data = g.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  let found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) < alphaMin) continue;
      found = true;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x + 1 > x1) x1 = x + 1;
      if (y + 1 > y1) y1 = y + 1;
    }
  }
  return found ? { x0, y0, x1, y1 } : null;
}

/**
 * Same camera, same transform for every layer so a recoiling gun stays
 * registered with the hull/turret hole it was authored against.
 */
async function composeAligned(
  layers: HTMLImageElement[][],
  opts: TurntableSheetOpts,
): Promise<ComposedTurntable> {
  if (layers.length === 0) throw new Error("no turntable layers");
  const hullImgs = layers[0]!;
  const boxes: BBox[] = [];
  const hullBottoms: number[] = [];
  for (let i = 0; i < TURNTABLE_DIRS; i++) {
    for (let L = 0; L < layers.length; L++) {
      const img = layers[L]![i];
      if (!img) throw new Error(`empty layer ${L} frame ${i + 1}`);
      const b = opaqueBBox(img);
      if (!b) throw new Error(`empty layer ${L} frame ${i + 1}`);
      boxes.push(b);
      if (L === 0) hullBottoms.push(b.y1);
    }
  }
  const union = {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
  const uw = union.x1 - union.x0;
  const uh = union.y1 - union.y0;
  const maxW = Math.max(1, opts.cell - 2 * opts.padding);
  const maxH = Math.max(1, opts.cell - 2 * opts.padding);
  const scale = Math.min(maxW / uw, maxH / uh, 1);
  const cx = hullImgs[0]!.naturalWidth / 2;
  const sorted = [...hullBottoms].sort((a, b) => a - b);
  const medBottom = sorted[Math.floor(sorted.length / 2)] ?? union.y1;
  const ox = opts.cell / 2 - cx * scale;
  let oy = opts.cell * opts.contactY - medBottom * scale;
  const minOy = opts.padding - union.y0 * scale;
  const maxOy = opts.cell - opts.padding - union.y1 * scale;
  if (maxOy < minOy) oy = (minOy + maxOy) / 2;
  else oy = Math.min(maxOy, Math.max(minOy, oy));

  const sheets = layers.map(() => makeSheetCanvas(opts.cell));
  const gs: CanvasRenderingContext2D[] = [];
  for (const sheet of sheets) {
    const g = sheet.getContext("2d");
    if (!g) throw new Error("2d context");
    gs.push(g);
  }

  for (let frame = 1; frame <= TURNTABLE_DIRS; frame++) {
    const row = engineRowFromFrame(frame);
    for (let L = 0; L < layers.length; L++) {
      place(gs[L]!, layers[L]![frame - 1]!, opts.cell, row, scale, ox, oy);
    }
  }

  const cameoRow = engineRowFromFacing(opts.cameoFacing);
  const combo = document.createElement("canvas");
  combo.width = opts.cell;
  combo.height = opts.cell;
  const cg = combo.getContext("2d");
  if (!cg) throw new Error("2d context");
  for (const sheet of sheets) {
    cg.drawImage(sheet, 0, cameoRow * opts.cell, opts.cell, opts.cell, 0, 0, opts.cell, opts.cell);
  }
  const box = opaqueBBoxCanvas(combo);
  const cameo = document.createElement("canvas");
  cameo.width = opts.cameoSize;
  cameo.height = opts.cameoSize;
  const cag = cameo.getContext("2d");
  if (cag && box) {
    const pad = 8;
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    const fit = Math.min((opts.cameoSize - 2 * pad) / bw, (opts.cameoSize - 2 * pad) / bh, 1);
    const nw = Math.max(1, Math.round(bw * fit));
    const nh = Math.max(1, Math.round(bh * fit));
    cag.imageSmoothingEnabled = true;
    cag.imageSmoothingQuality = "high";
    cag.drawImage(
      combo,
      box.x0,
      box.y0,
      bw,
      bh,
      Math.floor((opts.cameoSize - nw) / 2),
      Math.floor((opts.cameoSize - nh) / 2),
      nw,
      nh,
    );
  }

  const [cameoUrl, ...sheetUrls] = await Promise.all([
    canvasPngUrl(cameo),
    ...sheets.map((sheet) => canvasPngUrl(sheet)),
  ]);
  return { sheetUrls, cameoUrl };
}

function applyCameo(url: string, cssVar = "--tiger-cameo"): void {
  document.documentElement.style.setProperty(cssVar, `url("${url}")`);
}

let ss3Previous: ComposedTurntable | null = null;

export function bindCasemateSheets(hullImage: HTMLImageElement, gunImage: HTMLImageElement): void {
  let hullUrls: string[];
  let gunUrls: string[];
  try {
    hullUrls = pickTurntableUrls(ss3HullGlob);
    gunUrls = pickTurntableUrls(ss3GunGlob);
  } catch (err) {
    console.error("ss3 turntable", err);
    return;
  }
  void Promise.all([Promise.all(hullUrls.map(loadImage)), Promise.all(gunUrls.map(loadImage))])
    .then(([hullImgs, gunImgs]) => composeAligned([hullImgs, gunImgs], SS3_OPTS))
    .then((next) => {
      revoke(ss3Previous);
      ss3Previous = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      gunImage.src = next.sheetUrls[1] ?? "";
      applyCameo(next.cameoUrl, "--ss3-cameo");
    })
    .catch((err) => {
      console.error("ss3 turntable", err);
    });
}

export function bindTurntableSheets(
  hullImage: HTMLImageElement,
  turretImage: HTMLImageElement,
  gunImage: HTMLImageElement,
): void {
  let hullUrls: string[];
  let turretUrls: string[];
  let gunUrls: string[];
  try {
    hullUrls = pickTurntableUrls(hullGlob);
    turretUrls = pickTurntableUrls(turretGlob);
    gunUrls = pickTurntableUrls(tigerGunGlob);
  } catch (err) {
    console.error("tiger turntable", err);
    return;
  }
  void Promise.all([
    Promise.all(hullUrls.map(loadImage)),
    Promise.all(turretUrls.map(loadImage)),
    Promise.all(gunUrls.map(loadImage)),
  ])
    .then(([hullImgs, turretImgs, gunImgs]) =>
      composeAligned([hullImgs, turretImgs, gunImgs], TIGER_OPTS),
    )
    .then((next) => {
      revoke(previous);
      previous = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      turretImage.src = next.sheetUrls[1] ?? "";
      gunImage.src = next.sheetUrls[2] ?? "";
      applyCameo(next.cameoUrl);
    })
    .catch((err) => {
      console.error("tiger turntable", err);
    });
}

export { TIGER_OPTS };
