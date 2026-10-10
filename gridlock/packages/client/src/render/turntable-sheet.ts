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

const feuerwirbelHullGlob = import.meta.glob("../assets/units/feuerwirbel/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const feuerwirbelCiwsGlob = import.meta.glob("../assets/units/feuerwirbel/ciws/*.png", {
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

const jagdtigerHullGlob = import.meta.glob("../assets/units/jagdtiger/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const jagdtigerGunGlob = import.meta.glob("../assets/units/jagdtiger/gun/*.png", {
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

const artilleryHullGlob = import.meta.glob("../assets/units/artillery/hull/*.png", {
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

const he111HullGlob = import.meta.glob("../assets/units/he111/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const hortenHullGlob = import.meta.glob("../assets/units/horten/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const droneHullGlob = import.meta.glob("../assets/units/drone/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const gunboatHullGlob = import.meta.glob("../assets/units/gunboat/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const submarineHullGlob = import.meta.glob("../assets/units/submarine/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const supplyboatHullGlob = import.meta.glob("../assets/units/supplyboat/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const destroyerHullGlob = import.meta.glob("../assets/units/destroyer/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const lstHullGlob = import.meta.glob("../assets/units/lst/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const leechHullGlob = import.meta.glob("../assets/units/leech/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const lurkerHullGlob = import.meta.glob("../assets/units/lurker/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const navalHullGlobs = {
  leech: leechHullGlob,
  lurker: lurkerHullGlob,
  gunboat: gunboatHullGlob,
  submarine: submarineHullGlob,
  supplyboat: supplyboatHullGlob,
  destroyer: destroyerHullGlob,
  lst: lstHullGlob,
  // The Bloom boats (tools/sprites/render_bloom_naval.py).
  driftjelly: import.meta.glob("../assets/units/driftjelly/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  spineback: import.meta.glob("../assets/units/spineback/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  abyssray: import.meta.glob("../assets/units/abyssray/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  leviathan: import.meta.glob("../assets/units/leviathan/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  broodbarge: import.meta.glob("../assets/units/broodbarge/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
} as const;

const aswheliHullGlob = import.meta.glob("../assets/units/aswheli/hull/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const battleshipGlobs = {
  hull: import.meta.glob("../assets/units/battleship/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  super: import.meta.glob("../assets/units/battleship/super/*.png", { eager: true, import: "default" }) as Record<string, string>,
  turret: import.meta.glob("../assets/units/battleship/turret/*.png", { eager: true, import: "default" }) as Record<string, string>,
  ciws: import.meta.glob("../assets/units/battleship/ciws/*.png", { eager: true, import: "default" }) as Record<string, string>,
};

export const SS3_OPTS: TurntableSheetOpts = { ...TIGER_OPTS };
/** Plane cell. Wingspan fills it, so it keeps a little more room; wheels sit on the contact line. */
export const STUKA_OPTS: TurntableSheetOpts = { ...TIGER_OPTS, contactY: 0.8, padding: 2 };
/** Fw 190: same aircraft fit as the Stuka. */
export const FW190_OPTS: TurntableSheetOpts = { ...STUKA_OPTS };
/** BV 222: same aircraft fit as the Stuka; the wingspan fills the cell. */
export const BV222_OPTS: TurntableSheetOpts = { ...STUKA_OPTS };
/** He 111: same aircraft fit as the Stuka; the wingspan fills the cell. */
export const HE111_OPTS: TurntableSheetOpts = { ...STUKA_OPTS };
/** Horten VII: same aircraft fit as the Stuka; the wingspan fills the cell. */
export const HORTEN_OPTS: TurntableSheetOpts = { ...STUKA_OPTS };
/** Quadcopter: same aircraft fit as the Stuka; the rotor span fills the cell, the pod's belly sits on the contact line. */
export const DRONE_OPTS: TurntableSheetOpts = { ...STUKA_OPTS };
/**
 * Boats: the hull's length fills the cell like a plane's wingspan. The wake under the hull
 * is the lowest thing in every face, so the contact line sits higher than a tank's to keep
 * the hull's middle near the unit's point.
 */
export const NAVAL_OPTS: TurntableSheetOpts = { ...TIGER_OPTS, contactY: 0.74, padding: 2 };

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

let jagdtigerPrevious: ComposedTurntable | null = null;

/** Jagdtiger: casemate hull + recoiling 128mm, like the StuG. The static jagdtiger-cameo.png is the sidebar portrait. */
export function bindJagdtigerSheets(hullImage: HTMLImageElement, gunImage: HTMLImageElement): void {
  let hullUrls: string[];
  let gunUrls: string[];
  try {
    hullUrls = pickTurntableUrls(jagdtigerHullGlob);
    gunUrls = pickTurntableUrls(jagdtigerGunGlob);
  } catch (err) {
    console.error("jagdtiger turntable", err);
    return;
  }
  void Promise.all([Promise.all(hullUrls.map(loadImage)), Promise.all(gunUrls.map(loadImage))])
    .then(([hullImgs, gunImgs]) => composeAligned([hullImgs, gunImgs], TIGER_OPTS))
    .then((next) => {
      revoke(jagdtigerPrevious);
      jagdtigerPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      gunImage.src = next.sheetUrls[1] ?? "";
    })
    .catch((err) => {
      console.error("jagdtiger turntable", err);
    });
}

let feuerwirbelPrevious: ComposedTurntable | null = null;

/**
 * Feuerwirbel: hull with the bow flame projector + one CIWS mount sheet, one transform for both
 * (tools/sprites/render_feuerwirbel.py). The client draws the mount twice, on its two rings
 * (feuerwirbel-mounts.ts). The static feuerwirbel-cameo.png is the sidebar portrait.
 */
export function bindFeuerwirbelSheets(hullImage: HTMLImageElement, ciwsImage: HTMLImageElement): void {
  let hullUrls: string[];
  let ciwsUrls: string[];
  try {
    hullUrls = pickTurntableUrls(feuerwirbelHullGlob);
    ciwsUrls = pickTurntableUrls(feuerwirbelCiwsGlob);
  } catch (err) {
    console.error("feuerwirbel turntable", err);
    return;
  }
  void Promise.all([Promise.all(hullUrls.map(loadImage)), Promise.all(ciwsUrls.map(loadImage))])
    .then(([hullImgs, ciwsImgs]) => composeAligned([hullImgs, ciwsImgs], TIGER_OPTS))
    .then((next) => {
      revoke(feuerwirbelPrevious);
      feuerwirbelPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      ciwsImage.src = next.sheetUrls[1] ?? "";
    })
    .catch((err) => {
      console.error("feuerwirbel turntable", err);
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

let artilleryPrevious: ComposedTurntable | null = null;

/** Field gun: one sheet, the barrel is the facing. The static artillery-cameo.png is the sidebar art. */
export function bindArtillerySheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(artilleryHullGlob);
  } catch (err) {
    console.error("artillery turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], TIGER_OPTS))
    .then((next) => {
      revoke(artilleryPrevious);
      artilleryPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      URL.revokeObjectURL(next.cameoUrl);
    })
    .catch((err) => {
      console.error("artillery turntable", err);
    });
}

const navalPrevious = new Map<string, ComposedTurntable>();

/** Hull-only boat drop-ins (Attack Boat, Submarine, Supply Boat, Destroyer): one sheet and a cameo each. */
export function bindNavalSheets(kind: keyof typeof navalHullGlobs, hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(navalHullGlobs[kind]);
  } catch (err) {
    console.error(`${kind} turntable`, err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], NAVAL_OPTS))
    .then((next) => {
      revoke(navalPrevious.get(kind) ?? null);
      navalPrevious.set(kind, next);
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, `--${kind}-cameo`);
    })
    .catch((err) => {
      console.error(`${kind} turntable`, err);
    });
}

let battleshipPrevious: string[] = [];

/**
 * Battle Ship: hull, superstructure, turret, and CIWS (tools/sprites/render_battleship.py).
 * The faces are stacked 1:1 into rows, never refit, so the model origin stays at the same
 * cell point in every layer and render/battleship.ts can place each mount by its model position.
 */
export function bindBattleshipSheets(images: Record<keyof typeof battleshipGlobs, HTMLImageElement>): void {
  const names = Object.keys(battleshipGlobs) as (keyof typeof battleshipGlobs)[];
  let urls: string[][];
  try {
    urls = names.map((n) => pickTurntableUrls(battleshipGlobs[n]));
  } catch (err) {
    console.error("battleship turntable", err);
    return;
  }
  void Promise.all(urls.map((list) => Promise.all(list.map(loadImage))))
    .then(async (layers) => {
      const sheets = layers.map((frames) => {
        const cell = frames[0]!.naturalWidth;
        const sheet = makeSheetCanvas(cell);
        const g = sheet.getContext("2d");
        if (!g) throw new Error("2d context");
        frames.forEach((img, i) => g.drawImage(img, 0, engineRowFromFrame(i + 1) * cell));
        return sheet;
      });
      return Promise.all(sheets.map(canvasPngUrl));
    })
    .then((next) => {
      for (const url of battleshipPrevious) URL.revokeObjectURL(url);
      battleshipPrevious = next;
      names.forEach((n, i) => {
        images[n].src = next[i] ?? "";
      });
    })
    .catch((err) => {
      console.error("battleship turntable", err);
    });
}

const hivearkGlobs = {
  hull: import.meta.glob("../assets/units/hiveark/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  cannon: import.meta.glob("../assets/units/hiveark/cannon/*.png", { eager: true, import: "default" }) as Record<string, string>,
};
let hivearkPrevious: string[] = [];

/**
 * Hive Ark: hull and cannon (tools/sprites/render_hive_ark.py), stacked 1:1 into rows like the
 * Battle Ship's layers, so render/hive-ark.ts can place each cannon by its model position.
 */
export function bindHiveArkSheets(images: Record<keyof typeof hivearkGlobs, HTMLImageElement>): void {
  const names = Object.keys(hivearkGlobs) as (keyof typeof hivearkGlobs)[];
  let urls: string[][];
  try {
    urls = names.map((n) => pickTurntableUrls(hivearkGlobs[n]));
  } catch (err) {
    console.error("hiveark turntable", err);
    return;
  }
  void Promise.all(urls.map((list) => Promise.all(list.map(loadImage))))
    .then(async (layers) => {
      const sheets = layers.map((frames) => {
        const cell = frames[0]!.naturalWidth;
        const sheet = makeSheetCanvas(cell);
        const g = sheet.getContext("2d");
        if (!g) throw new Error("2d context");
        frames.forEach((img, i) => g.drawImage(img, 0, engineRowFromFrame(i + 1) * cell));
        return sheet;
      });
      return Promise.all(sheets.map(canvasPngUrl));
    })
    .then((next) => {
      for (const url of hivearkPrevious) URL.revokeObjectURL(url);
      hivearkPrevious = next;
      names.forEach((n, i) => {
        images[n].src = next[i] ?? "";
      });
    })
    .catch((err) => {
      console.error("hiveark turntable", err);
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

let he111Previous: ComposedTurntable | null = null;

/** He 111 drop-ins: one hull sheet and a cameo, same fit rules as the Stuka. */
export function bindTorpedoBomberSheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(he111HullGlob);
  } catch (err) {
    console.error("he111 turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], HE111_OPTS))
    .then((next) => {
      revoke(he111Previous);
      he111Previous = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, "--he111-cameo");
    })
    .catch((err) => {
      console.error("he111 turntable", err);
    });
}

let hortenPrevious: ComposedTurntable | null = null;

/** Horten VII drop-ins: one hull sheet and a cameo, same fit rules as the Stuka. */
export function bindReconSheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(hortenHullGlob);
  } catch (err) {
    console.error("horten turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], HORTEN_OPTS))
    .then((next) => {
      revoke(hortenPrevious);
      hortenPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, "--horten-cameo");
    })
    .catch((err) => {
      console.error("horten turntable", err);
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

let aswheliPrevious: ComposedTurntable | null = null;

/** The Destroyer's ASW helicopter: the drone's aircraft fit, its rotor disc fills the cell. */
export function bindAswHeliSheets(hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(aswheliHullGlob);
  } catch (err) {
    console.error("aswheli turntable", err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], DRONE_OPTS))
    .then((next) => {
      revoke(aswheliPrevious);
      aswheliPrevious = next;
      hullImage.src = next.sheetUrls[0] ?? "";
      applyCameo(next.cameoUrl, "--aswheli-cameo");
    })
    .catch((err) => {
      console.error("aswheli turntable", err);
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


/** The Xenite planes (tools/sprites/render_xeno_air.py): one hull sheet each, the Stuka's fit. */
const planeHullGlobs = {
  wasp: import.meta.glob("../assets/units/wasp/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  scourge: import.meta.glob("../assets/units/scourge/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  overseer: import.meta.glob("../assets/units/overseer/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  gnat: import.meta.glob("../assets/units/gnat/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  // The Bloom flyers (tools/sprites/render_bloom_air.py).
  moth: import.meta.glob("../assets/units/moth/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  razorwing: import.meta.glob("../assets/units/razorwing/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  gasbag: import.meta.glob("../assets/units/gasbag/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  drifter: import.meta.glob("../assets/units/drifter/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
  harpy: import.meta.glob("../assets/units/harpy/hull/*.png", { eager: true, import: "default" }) as Record<string, string>,
} as const;

const planePrevious = new Map<keyof typeof planeHullGlobs, ComposedTurntable>();

/** The Overseer's bell and eye on the 16 facings, over its slowly spinning base (the hull glob). */
const overseerDomeGlob = import.meta.glob("../assets/units/overseer/dome/*.png", { eager: true, import: "default" }) as Record<string, string>;

/** The Overseer: base (16 spin frames) and dome (16 facings) fitted in one box, the Stuka's fit. */
export function bindOverseerSheets(baseImage: HTMLImageElement, domeImage: HTMLImageElement): void {
  let baseUrls: string[];
  let domeUrls: string[];
  try {
    baseUrls = pickTurntableUrls(planeHullGlobs.overseer);
    domeUrls = pickTurntableUrls(overseerDomeGlob);
  } catch (err) {
    console.error("overseer turntable", err);
    return;
  }
  void Promise.all([Promise.all(baseUrls.map(loadImage)), Promise.all(domeUrls.map(loadImage))])
    .then(([baseImgs, domeImgs]) => composeAligned([baseImgs, domeImgs], STUKA_OPTS))
    .then((next) => {
      revoke(planePrevious.get("overseer") ?? null);
      planePrevious.set("overseer", next);
      baseImage.src = next.sheetUrls[0] ?? "";
      domeImage.src = next.sheetUrls[1] ?? "";
      // The static overseer-cameo.png stands in the sidebar.
      URL.revokeObjectURL(next.cameoUrl);
    })
    .catch((err) => {
      console.error("overseer turntable", err);
    });
}

/** The wing strokes of the Xenite insects (render_xeno_air.py): the hull is the mid stroke. */
const wingStrokeGlobs = {
  wasp: {
    up: import.meta.glob("../assets/units/wasp/wingup/*.png", { eager: true, import: "default" }) as Record<string, string>,
    down: import.meta.glob("../assets/units/wasp/wingdown/*.png", { eager: true, import: "default" }) as Record<string, string>,
  },
  scourge: {
    up: import.meta.glob("../assets/units/scourge/wingup/*.png", { eager: true, import: "default" }) as Record<string, string>,
    down: import.meta.glob("../assets/units/scourge/wingdown/*.png", { eager: true, import: "default" }) as Record<string, string>,
  },
  gnat: {
    up: import.meta.glob("../assets/units/gnat/wingup/*.png", { eager: true, import: "default" }) as Record<string, string>,
    down: import.meta.glob("../assets/units/gnat/wingdown/*.png", { eager: true, import: "default" }) as Record<string, string>,
  },
} as const;

/** Frames of a flutter sheet, left to right: up, mid, down, mid. The wings beat through them in a loop. */
export const FLUTTER_FRAMES = 4;

const flutterPrevious = new Map<keyof typeof wingStrokeGlobs, string>();

/**
 * A Xenite insect's flutter sheet: the hull and both wing strokes fitted in one box (the body
 * sits on the same pixels in all three), laid out as FLUTTER_FRAMES columns of 16 rows.
 */
export function bindFlutterSheets(kind: keyof typeof wingStrokeGlobs, hullImage: HTMLImageElement): void {
  let layers: string[][];
  try {
    const g = wingStrokeGlobs[kind];
    layers = [pickTurntableUrls(planeHullGlobs[kind]), pickTurntableUrls(g.up), pickTurntableUrls(g.down)];
  } catch (err) {
    console.error(`${kind} flutter`, err);
    return;
  }
  void Promise.all(layers.map((urls) => Promise.all(urls.map(loadImage))))
    .then((imgs) => composeAligned(imgs, STUKA_OPTS))
    .then(async (next) => {
      URL.revokeObjectURL(next.cameoUrl);
      const [mid, up, down] = await Promise.all(next.sheetUrls.map(loadImage));
      for (const url of next.sheetUrls) URL.revokeObjectURL(url);
      const cell = STUKA_OPTS.cell;
      const strip = document.createElement("canvas");
      strip.width = cell * FLUTTER_FRAMES;
      strip.height = TURNTABLE_DIRS * cell;
      const g = strip.getContext("2d");
      if (!g) throw new Error("2d context");
      [up!, mid!, down!, mid!].forEach((sheet, i) => g.drawImage(sheet, i * cell, 0));
      const url = await canvasPngUrl(strip);
      const old = flutterPrevious.get(kind);
      if (old) URL.revokeObjectURL(old);
      flutterPrevious.set(kind, url);
      hullImage.src = url;
    })
    .catch((err) => {
      console.error(`${kind} flutter`, err);
    });
}

export function bindPlaneSheets(kind: keyof typeof planeHullGlobs, hullImage: HTMLImageElement): void {
  let hullUrls: string[];
  try {
    hullUrls = pickTurntableUrls(planeHullGlobs[kind]);
  } catch (err) {
    console.error(`${kind} turntable`, err);
    return;
  }
  void Promise.all(hullUrls.map(loadImage))
    .then((hullImgs) => composeAligned([hullImgs], STUKA_OPTS))
    .then((next) => {
      revoke(planePrevious.get(kind) ?? null);
      planePrevious.set(kind, next);
      hullImage.src = next.sheetUrls[0] ?? "";
      // The static <kind>-cameo.png stands in the sidebar.
      URL.revokeObjectURL(next.cameoUrl);
    })
    .catch((err) => {
      console.error(`${kind} turntable`, err);
    });
}
