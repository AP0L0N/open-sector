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

const apocalypseHullGlob = import.meta.glob("../assets/units/apocalypse/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const apocalypseTurretGlob = import.meta.glob("../assets/units/apocalypse/turret/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const apocalypseGunGlob = import.meta.glob("../assets/units/apocalypse/gun/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const apocalypseCiwsGlob = import.meta.glob("../assets/units/apocalypse/ciws/*.png", {
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

const supplyHullGlob = import.meta.glob("../assets/units/supply-truck/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const nebelwerferHullGlob = import.meta.glob("../assets/units/nebelwerfer/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const nebelwerferLauncherGlob = import.meta.glob("../assets/units/nebelwerfer/launcher/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const mammothHullGlob = import.meta.glob("../assets/units/mammoth/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const mammothWadeGlob = import.meta.glob("../assets/units/mammoth/wade/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const stukaHullGlob = import.meta.glob("../assets/units/stuka/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const bv222HullGlob = import.meta.glob("../assets/units/bv222/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const fw190HullGlob = import.meta.glob("../assets/units/fw190/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const droneHullGlob = import.meta.glob("../assets/units/drone/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export const SS3_OPTS: TurntableSheetOpts = { ...TIGER_OPTS };
/** Plane cell. Wingspan fills it, so it keeps a little more room; wheels sit on the contact line. */
export const STUKA_OPTS: TurntableSheetOpts = { ...TIGER_OPTS, contactY: 0.8, padding: 2 };
/** Fw 190: same aircraft fit as the Stuka. */
export const FW190_OPTS: TurntableSheetOpts = { ...STUKA_OPTS };
/** BV 222: same aircraft fit as the Stuka; the wingspan fills the cell. */
export const BV222_OPTS: TurntableSheetOpts = { ...STUKA_OPTS };
/** Quadcopter: same aircraft fit as the Stuka; the rotor span fills the cell, the pod's belly sits on the contact line. */
export const DRONE_OPTS: TurntableSheetOpts = { ...STUKA_OPTS };

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

let supplyPrevious: ComposedTurntable | null = null;

/** Hull-only drop-ins. Same fit as the other vehicles, one sheet, one cameo. */
export function bindSupplySheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(supplyHullGlob);
  } catch (err) {
    console.error("supply truck turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], TIGER_OPTS))
    .then((next) => {
      revoke(supplyPrevious);
      supplyPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, "--supply-cameo");
    })
    .catch((err) => {
      console.error("supply truck turntable", err);
    });
}

let mammothPrevious: ComposedTurntable | null = null;

/**
 * Paint extra poses with the fit taken from `reference` alone. The Mammoth's
 * half-sunk faces are a smaller silhouette; fitting them on their own would
 * scale the casemate up. Sharing the dry hull's scale and contact keeps it
 * registered, sunk into the same ground line.
 */
async function composeLocked(
  reference: HTMLImageElement[],
  extras: HTMLImageElement[][],
  opts: TurntableSheetOpts,
): Promise<ComposedTurntable> {
  if (reference.length !== TURNTABLE_DIRS) throw new Error("turntable reference");
  const boxes: BBox[] = [];
  const bottoms: number[] = [];
  for (let i = 0; i < TURNTABLE_DIRS; i++) {
    const img = reference[i];
    if (!img) throw new Error(`empty reference frame ${i + 1}`);
    const b = opaqueBBox(img);
    if (!b) throw new Error(`empty reference frame ${i + 1}`);
    boxes.push(b);
    bottoms.push(b.y1);
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
  const cx = reference[0]!.naturalWidth / 2;
  const sorted = [...bottoms].sort((a, b) => a - b);
  const medBottom = sorted[Math.floor(sorted.length / 2)] ?? union.y1;
  const ox = opts.cell / 2 - cx * scale;
  let oy = opts.cell * opts.contactY - medBottom * scale;
  const minOy = opts.padding - union.y0 * scale;
  const maxOy = opts.cell - opts.padding - union.y1 * scale;
  if (maxOy < minOy) oy = (minOy + maxOy) / 2;
  else oy = Math.min(maxOy, Math.max(minOy, oy));

  const groups = [reference, ...extras];
  const sheets = groups.map(() => makeSheetCanvas(opts.cell));
  const gs: CanvasRenderingContext2D[] = [];
  for (const sheet of sheets) {
    const g = sheet.getContext("2d");
    if (!g) throw new Error("2d context");
    gs.push(g);
  }
  for (let frame = 1; frame <= TURNTABLE_DIRS; frame++) {
    const row = engineRowFromFrame(frame);
    for (let L = 0; L < groups.length; L++) {
      const src = groups[L]![frame - 1];
      if (!src) throw new Error(`empty layer ${L} frame ${frame}`);
      place(gs[L]!, src, opts.cell, row, scale, ox, oy);
    }
  }

  const cameoRow = engineRowFromFacing(opts.cameoFacing);
  const combo = document.createElement("canvas");
  combo.width = opts.cell;
  combo.height = opts.cell;
  const cg = combo.getContext("2d");
  if (!cg) throw new Error("2d context");
  cg.drawImage(sheets[0]!, 0, cameoRow * opts.cell, opts.cell, opts.cell, 0, 0, opts.cell, opts.cell);
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

/** Mammoth: dry hull, plus the half-sunk faces. The static mammoth-cameo.png is the sidebar portrait. */
export function bindMammothSheets(hullImage: HTMLImageElement, wadeImage?: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(mammothHullGlob);
  } catch (err) {
    console.error("mammoth turntable", err);
    return;
  }
  let wadeUrls: string[] | null = null;
  if (wadeImage) {
    try {
      wadeUrls = pickTurntableUrls(mammothWadeGlob);
    } catch (err) {
      console.error("mammoth wade turntable", err);
    }
  }
  const jobs: Promise<HTMLImageElement[]>[] = [Promise.all(hullUrls.map(loadImage))];
  if (wadeUrls) jobs.push(Promise.all(wadeUrls.map(loadImage)));
  void Promise.all(jobs)
    .then((sets) => {
      const hullImgs = sets[0]!;
      const wadeImgs = sets[1];
      if (wadeImgs) return composeLocked(hullImgs, [wadeImgs], TIGER_OPTS);
      return composeAligned([hullImgs], TIGER_OPTS);
    })
    .then((next) => {
      revoke(mammothPrevious);
      mammothPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      if (wadeImage && next.sheetUrls[1]) wadeImage.src = next.sheetUrls[1];
      URL.revokeObjectURL(next.cameoUrl);
    })
    .catch((err) => {
      console.error("mammoth turntable", err);
    });
}

let nebelwerferPrevious: ComposedTurntable | null = null;

/** Nebelwerfer: hull plus the traversing launcher frame, one transform like the Tiger's turret. */
export function bindNebelwerferSheets(hullImage: HTMLImageElement, launcherImage: HTMLImageElement): void {
  let hullUrls: string[];
  let launcherUrls: string[];
  try {
    hullUrls = pickTurntableUrls(nebelwerferHullGlob);
    launcherUrls = pickTurntableUrls(nebelwerferLauncherGlob);
  } catch (err) {
    console.error("nebelwerfer turntable", err);
    return;
  }
  void Promise.all([Promise.all(hullUrls.map(loadImage)), Promise.all(launcherUrls.map(loadImage))])
    .then(([hullImgs, launcherImgs]) => composeAligned([hullImgs, launcherImgs], TIGER_OPTS))
    .then((next) => {
      revoke(nebelwerferPrevious);
      nebelwerferPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      launcherImage.src = next.sheetUrls[1] ?? "";
      // No runtime cameo: the static nebelwerfer-cameo.png is a brightened 3/4 view
      // that reads on the dark sidebar; the composed side view did not.
      URL.revokeObjectURL(next.cameoUrl);
    })
    .catch((err) => {
      console.error("nebelwerfer turntable", err);
    });
}

let stukaPrevious: ComposedTurntable | null = null;

/** Stuka drop-ins: one hull sheet and a cameo, same fit rules as the trucks. */
export function bindAircraftSheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(stukaHullGlob);
  } catch (err) {
    console.error("stuka turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], STUKA_OPTS))
    .then((next) => {
      revoke(stukaPrevious);
      stukaPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, "--stuka-cameo");
    })
    .catch((err) => {
      console.error("stuka turntable", err);
    });
}

let bv222Previous: ComposedTurntable | null = null;

/** BV 222 drop-ins: one hull sheet and a cameo, same fit rules as the Stuka. */
export function bindTransportSheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(bv222HullGlob);
  } catch (err) {
    console.error("bv222 turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], BV222_OPTS))
    .then((next) => {
      revoke(bv222Previous);
      bv222Previous = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, "--bv222-cameo");
    })
    .catch((err) => {
      console.error("bv222 turntable", err);
    });
}

let fw190Previous: ComposedTurntable | null = null;

/** Fw 190 drop-ins: one hull sheet and a cameo, same fit rules as the Stuka. */
export function bindFighterSheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(fw190HullGlob);
  } catch (err) {
    console.error("fw190 turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], FW190_OPTS))
    .then((next) => {
      revoke(fw190Previous);
      fw190Previous = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, "--fw190-cameo");
    })
    .catch((err) => {
      console.error("fw190 turntable", err);
    });
}

let dronePrevious: ComposedTurntable | null = null;

/** Drone Op's quadcopter drop-ins: one hull sheet and a cameo, same fit rules as the Stuka. */
export function bindDroneSheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(droneHullGlob);
  } catch (err) {
    console.error("drone turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], DRONE_OPTS))
    .then((next) => {
      revoke(dronePrevious);
      dronePrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, "--drone-cameo");
    })
    .catch((err) => {
      console.error("drone turntable", err);
    });
}

let apocalypsePrevious: ComposedTurntable | null = null;

/**
 * Apocalypse: hull, turret, twin gun, and the roof CIWS, one transform for all four
 * (tools/sprites/render_apocalypse.py). The roof mount turns on the turret's own axis.
 */
export function bindApocalypseSheets(
  hullImage: HTMLImageElement,
  turretImage: HTMLImageElement,
  gunImage: HTMLImageElement,
  ciwsImage: HTMLImageElement,
): void {
  let urls: string[][];
  try {
    urls = [apocalypseHullGlob, apocalypseTurretGlob, apocalypseGunGlob, apocalypseCiwsGlob].map((g) => pickTurntableUrls(g));
  } catch (err) {
    console.error("apocalypse turntable", err);
    return;
  }
  void Promise.all(urls.map((layer) => Promise.all(layer.map(loadImage))))
    .then((layers) => composeAligned(layers, TIGER_OPTS))
    .then((next) => {
      revoke(apocalypsePrevious);
      apocalypsePrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      turretImage.src = next.sheetUrls[1] ?? "";
      gunImage.src = next.sheetUrls[2] ?? "";
      ciwsImage.src = next.sheetUrls[3] ?? "";
      // The static apocalypse-cameo.png is a brightened 3/4 view; no runtime cameo.
      URL.revokeObjectURL(next.cameoUrl);
    })
    .catch((err) => {
      console.error("apocalypse turntable", err);
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
