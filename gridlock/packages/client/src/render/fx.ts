import boomUrl from "../assets/fx/explosion.png";
import smokeUrl from "../assets/fx/smoke.png";
import { isShellCaliber, waterSplashScale } from "./water-splash.js";

export { isShellCaliber, waterSplashScale };

export interface FxSheet {
  image: HTMLImageElement;
  frames: number;
  frameSize: number;
}

function load(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

export const FX_BOOM: FxSheet = { image: load(boomUrl), frames: 8, frameSize: 96 };
export const FX_SMOKE: FxSheet = { image: load(smokeUrl), frames: 8, frameSize: 96 };

export function drawFxFrame(
  ctx: CanvasRenderingContext2D,
  sheet: FxSheet,
  frame: number,
  x: number,
  y: number,
  size: number,
  alpha = 1,
): void {
  if (!sheet.image.complete || sheet.image.naturalWidth <= 0) return;
  const i = ((frame % sheet.frames) + sheet.frames) % sheet.frames;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(
    sheet.image,
    i * sheet.frameSize,
    0,
    sheet.frameSize,
    sheet.frameSize,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
  ctx.restore();
}

export function fxFrameAt(ageMs: number, lifeMs: number, frames: number, loop: boolean): number {
  if (lifeMs <= 0) return 0;
  const t = Math.max(0, ageMs / lifeMs);
  if (loop) return Math.floor(t * frames) % frames;
  return Math.min(frames - 1, Math.floor(t * frames));
}

/** Lifetime of a map-impact FX, ms. */
export function fxLifeMs(kind: string, blast?: boolean): number {
  if (kind === "kill") return blast ? 780 : 420;
  if (kind === "puff") return 560;
  if (kind === "smoke") return 2200;
  if (kind === "muzzle") return 150;
  if (kind === "pen") return 420;
  if (kind === "hit") return 380;
  if (kind === "glance") return 260;
  if (kind === "ricochet") return 480;
  if (kind === "miss") return 560;
  return 400;
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dirOf(x: number, y: number): { x: number; y: number } {
  const l = Math.hypot(x, y);
  if (l < 1e-6) return { x: 1, y: 0 };
  return { x: x / l, y: y / l };
}

function groundEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
  ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI * 2);
}

/** Expanding isometric pressure wave. Dark dust rim, additive inner ring. */
export function drawShockRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  radius: number,
  strength = 1,
): void {
  if (t <= 0 || t >= 1 || strength <= 0 || radius <= 0) return;
  const ease = 1 - (1 - t) * (1 - t);
  const rx = radius * (0.14 + 0.86 * ease);
  const fade = (1 - t) * (1 - t) * strength;
  ctx.save();
  ctx.beginPath();
  groundEllipse(ctx, x, y, rx + 1.4);
  ctx.strokeStyle = `rgba(32, 28, 20, ${0.4 * fade})`;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  groundEllipse(ctx, x, y, rx);
  ctx.strokeStyle = `rgba(214, 226, 242, ${0.9 * fade})`;
  ctx.lineWidth = Math.max(0.7, 2.1 * (1 - t * 0.55));
  ctx.stroke();
  ctx.globalAlpha = 0.1 * fade;
  ctx.fillStyle = "#c8d6ea";
  ctx.fill();
  ctx.restore();
}

function drawContactFlash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  size: number,
): void {
  const ft = t / 0.12;
  if (ft >= 1 || size <= 0) return;
  const a = (1 - ft) * (1 - ft);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.8, size * (0.16 + ft * 0.1)), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6d0";
  ctx.beginPath();
  ctx.arc(x, y, size * (0.32 + ft * 0.18), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff8e8";
  ctx.lineWidth = 1.15;
  ctx.globalAlpha = a * 0.95;
  const spikes = 8;
  for (let i = 0; i < spikes; i++) {
    const ang = (i / spikes) * Math.PI + ft * 0.12;
    const len = size * (1.45 + (1 - ft) * 1.7);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSparkBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  t: number,
  seed: number,
  count: number,
  travel: number,
  alongIncoming = false,
): void {
  if (count <= 0 || travel <= 0) return;
  const rnd = rng(seed);
  const incoming = dirOf(dirX, dirY);
  const baseAng = Math.atan2(incoming.y, incoming.x) + (alongIncoming ? 0 : Math.PI);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "butt";
  for (let i = 0; i < count; i++) {
    const eject = rnd() < 0.74;
    const spread = eject ? 0.62 : Math.PI;
    const ang = (eject ? baseAng : rnd() * Math.PI * 2) + (rnd() - 0.5) * 2 * spread;
    const speed = (0.42 + rnd() * 0.58) * travel;
    const delay = rnd() * 0.02;
    const span = 0.48 + rnd() * 0.4;
    const local = (t - delay) / span;
    if (local <= 0 || local >= 1) continue;
    const lift = -0.26 - rnd() * 0.24;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang) + lift;
    const dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl;
    const uy = dy / dl;
    const px = x + ux * speed * local;
    const py = y + uy * speed * local;
    const streak = (2.5 + rnd() * 6.5) * (1 - local * 0.35);
    const alpha = (1 - local) * (1 - local) * (0.55 + rnd() * 0.45);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = local < 0.32 ? "#ffffff" : local < 0.68 ? "#ffe9a8" : "#ffc56a";
    ctx.lineWidth = local < 0.32 ? 1.55 : 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - ux * streak, py - uy * streak);
    ctx.stroke();
    if (local < 0.4) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px - 0.55, py - 0.55, 1.2, 1.2);
    }
  }
  ctx.restore();
}

function drawDust(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  count: number,
  radius: number,
): void {
  if (count <= 0) return;
  const rnd = rng(seed ^ 0x9e3779b9);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = (0.18 + rnd() * 0.82) * radius * (0.28 + t);
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist * 0.5 - t * (3 + rnd() * 9);
    ctx.globalAlpha = (1 - t) * (0.22 + rnd() * 0.4);
    ctx.fillStyle = rnd() > 0.45 ? "#6a5a40" : "#8a7860";
    ctx.beginPath();
    ctx.ellipse(px, py, 1.2 + rnd() * 2.1, 0.7 + rnd() * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface KineticOpts {
  kind: "hit" | "pen" | "glance";
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  t: number;
  seed: number;
  caliber?: number;
}

/** Armor strike: white-hot flash, sparks, air-compression ring. No fireball. */
export function drawKineticImpact(ctx: CanvasRenderingContext2D, opts: KineticOpts): void {
  const shell = isShellCaliber(opts.caliber);
  const scale = shell ? 1 : 0.4;
  const power = opts.kind === "pen" ? 1 : opts.kind === "hit" ? 0.78 : 0.46;
  const { x, y, t } = opts;
  drawContactFlash(ctx, x, y, t, (shell ? 7.5 : 3.2) * power);
  if (opts.kind !== "glance" || shell) {
    drawShockRing(ctx, x, y, Math.min(1, t / 0.88), (shell ? 30 : 11) * power, power * (shell ? 1 : 0.42));
  }
  if (opts.kind === "pen" && shell) {
    drawShockRing(ctx, x, y, Math.min(1, t / 0.52), 15, 0.65);
  }
  const sparks = Math.round((opts.kind === "pen" ? 22 : opts.kind === "hit" ? 13 : 6) * (shell ? 1 : 0.38));
  const travel = (opts.kind === "pen" ? 44 : 26) * scale * power;
  drawSparkBurst(ctx, x, y, opts.dirX, opts.dirY, t, opts.seed, sparks, travel);
  if (opts.kind === "hit") {
    drawDust(ctx, x, y, t, opts.seed, shell ? 11 : 4, (shell ? 18 : 7) * power);
  }
}

/**
 * Screen-pixel lift so armor strikes sit on the hull instead of the
 * ground contact. Undefined = caller keeps the default lift.
 */
export function armorHitLift(
  kind: string,
  caliber: number | undefined,
  seed: number,
  blast?: boolean,
): number | undefined {
  if (blast || (kind === "kill" && (caliber ?? 0) < 40)) return undefined;
  const shell = isShellCaliber(caliber);
  const onHull =
    kind === "ricochet" ||
    kind === "glance" ||
    (shell && (kind === "hit" || kind === "pen" || kind === "kill"));
  if (!onHull) return undefined;
  return 6 + rng(seed ^ 0x51d11)() * 30;
}

/** Bounce flash on the hull. The leaving streak is the live bounced projectile. */
export function drawRicochetSparks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  t: number,
  seed: number,
  caliber?: number,
): void {
  const shell = isShellCaliber(caliber);
  const rnd = rng(seed ^ 0xa5a5);
  drawContactFlash(ctx, x, y, t, shell ? 6.2 : 1.9);
  drawShockRing(ctx, x, y, Math.min(1, t / 0.5), shell ? 14 : 5, shell ? 0.48 : 0.16);
  drawSparkBurst(
    ctx,
    x,
    y,
    dirX,
    dirY,
    t,
    seed,
    shell ? 18 : 4,
    (shell ? 24 : 6) + rnd() * (shell ? 40 : 16),
    true,
  );
}

/** How long a mortar burst stays up, ms. The column rises, then thins out. */
export const MORTAR_BURST_MS = 1450;

/** How long a tank shell's ground burst stays up, ms. */
export const SHELL_BURST_MS = 1250;

export interface MortarSmokePuff {
  x: number;
  y: number;
  /** 0 at the tube, 1 at the bomb. */
  u: number;
}

/**
 * Smoke left along the lob. Older puffs are wider, paler, and sit higher.
 * The head is the bomb itself.
 */
export function drawMortarSmoke(
  ctx: CanvasRenderingContext2D,
  pts: readonly MortarSmokePuff[],
  seed: number,
  fade = 1,
): void {
  if (pts.length === 0 || fade <= 0) return;
  const headU = pts[pts.length - 1]?.u ?? 1;
  ctx.save();
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const age = Math.max(0, headU - p.u);
    const alpha = fade * (0.1 + p.u * 0.38) * (1 - age * 0.25);
    if (alpha <= 0.02) continue;
    const r = 1.8 + age * 6.2;
    const wob = Math.sin(p.u * 11 + seed * 0.017) * (1.2 + age * 3.5);
    const hang = age * 11;
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = "#b7aea0";
    ctx.beginPath();
    ctx.ellipse(p.x + wob * 0.6, p.y - hang - r * 0.35, r * 1.25, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.u > 0.82 ? "#6a6458" : "#8d8578";
    ctx.beginPath();
    ctx.ellipse(p.x + wob, p.y - hang, r * 0.72, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const head = pts[pts.length - 1];
  if (head && fade > 0.2) {
    ctx.globalAlpha = Math.min(1, fade);
    ctx.fillStyle = "#2a3122";
    ctx.beginPath();
    ctx.ellipse(head.x, head.y, 2.5, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6d654c";
    ctx.beginPath();
    ctx.arc(head.x + 0.45, head.y - 0.55, 1.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

interface BurstShape {
  /** 0 = dirt and sparks, 1 = a low fireball. */
  fire: number;
  /** How high the soil and smoke climb. */
  rise: number;
  /** 0 = straight up, 1 = thrown along the incoming shot. */
  down: number;
  smoke: number;
  chunks: number;
  scale: number;
  /** Smoke width. A mortar column is narrow; a tank burst is wide. */
  girth: number;
}

/** Soft disc. `rx`/`ry` are pixels. Alpha lives in the gradient so piles can overlap. */
function softDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
): void {
  if (alpha <= 0.02 || rx < 0.4 || ry < 0.4) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const grad = ctx.createRadialGradient(0, 0, 0.12, 0, 0, 1);
  grad.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${alpha})`);
  grad.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Ground detonation. Flash, a short fireball, clods on arcs, then a dust column.
 * `t` runs 0–1. Random draws are fixed per seed so the clods do not jump.
 */
function drawGroundBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  dirX: number,
  dirY: number,
  shape: BurstShape,
): void {
  const rnd = rng(seed ^ 0x51ed);
  const along = dirOf(dirX, dirY);
  const s = shape.scale;
  const { fire, rise, down, smoke, chunks, girth } = shape;
  const clods = [];
  for (let i = 0; i < chunks; i++) {
    clods.push({
      ga: rnd() * Math.PI * 2,
      delay: rnd() * 0.045,
      flight: 0.36 + rnd() * 0.3,
      speed: (14 + rnd() * 28) * s * (0.62 + down * 0.75),
      kick: (26 + rnd() * (28 + 30 * rise)) * s * (0.48 + rise * 0.6),
      rw: (1.7 + rnd() * 2.6) * s * (rnd() > 0.76 ? 1.55 : 1),
      shade: rnd(),
    });
  }

  const ring = 1 - (1 - Math.min(1, t / 0.42)) ** 2;
  const skirt = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);
  const skirtR = (7 + ring * (22 + 14 * fire)) * s;
  softDisc(ctx, x, y + 1, skirtR, skirtR * 0.46, 78, 62, 46, 0.5 * skirt);
  softDisc(ctx, x, y + 1, skirtR * 0.6, skirtR * 0.24, 54, 42, 32, 0.38 * skirt);

  const puffs = 6;
  for (let i = 0; i < puffs; i++) {
    const born = 0.02 + (i % 3) * 0.03;
    if (t < born) continue;
    const u = (t - born) / (0.96 - born);
    if (u <= 0 || u > 1) continue;
    const riseE = 1 - (1 - Math.min(1, u / 0.5)) ** 2;
    const wob = Math.sin(seed * 0.17 + i * 2.2 + u * 5.5) * (3.5 + u * 5) * s;
    const drift = along.x * down * u * (16 + i * 3) * s;
    const spread = (i - (puffs - 1) / 2) * (3 + u * 5) * s * girth;
    const px = x + wob * 0.45 + drift + spread * 0.4;
    const height = (32 + i * 8) * s * (0.35 + rise * 0.9);
    const py = y - riseE * height + along.y * down * u * 10 * s;
    const rad = (9 + i * 2.2) * s * (0.42 + u * 1.15);
    const cr = 28 + u * 78;
    const cg = 24 + u * 70;
    const cb = 20 + u * 58;
    const a = Math.sin(u * Math.PI) ** 0.8 * (0.4 + smoke * 0.3);
    const tall = rise > 0.95 ? 1.15 : 0.92;
    softDisc(ctx, px, py, rad * girth, rad * tall, cr, cg, cb, a);
  }

  ctx.save();
  for (const c of clods) {
    const local = (t - c.delay) / c.flight;
    if (local <= 0 || local >= 1) continue;
    const gx = Math.cos(c.ga) * (1 - down) + along.x * down;
    const gy = Math.sin(c.ga) * 0.46 * (1 - down) + along.y * down * 0.4;
    const px = x + gx * c.speed * local;
    const py = y + gy * c.speed * local - Math.sin(local * Math.PI) * c.kick;
    ctx.globalAlpha = (1 - local) * 0.94;
    ctx.fillStyle = c.shade > 0.66 ? "#3a2e24" : c.shade > 0.33 ? "#705843" : "#96785c";
    ctx.beginPath();
    ctx.ellipse(px, py, c.rw, c.rw * 0.58, c.ga * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (fire > 0.2 && t < 0.32) {
    const u = t / 0.32;
    const a = (1 - u) ** 1.35 * (0.3 + fire * 0.7);
    const lift = u * (10 + 16 * rise) * s;
    softDisc(
      ctx,
      x + along.x * 2 * s,
      y - lift,
      (9 + fire * 16) * s * (1 - u * 0.2),
      (7 + fire * 11) * s,
      255,
      104,
      24,
      a,
    );
    softDisc(ctx, x, y - lift - 2 * s, (3.2 + fire * 5) * s, (3 + fire * 4.5) * s, 255, 236, 186, Math.min(1, a * 1.1));
    for (let k = 0; k < 3; k++) {
      const ang = seed * 0.01 + k * 2.1;
      const ox = Math.cos(ang) * (4 + u * 7) * s;
      const oy = Math.sin(ang) * (2.4 + u * 3) * s - lift * 0.35;
      softDisc(ctx, x + ox, y + oy, (4.5 + fire * 3) * s, (3.4 + fire * 2.2) * s, 220, 70, 16, a * 0.5);
    }
  }
  if (t < 0.1) {
    const u = t / 0.1;
    const a = (1 - u) * (1 - u);
    softDisc(ctx, x, y, (8 + fire * 18) * s, (4 + fire * 7) * s, 255, 232, 186, a * 0.95);
    softDisc(ctx, x, y - 2 * s, (2.6 + fire * 4) * s, (2.6 + fire * 4) * s, 255, 255, 255, a);
  }
  ctx.restore();
}

/**
 * Mortar impact. On dirt the bomb flashes, throws soil straight up, and leaves
 * a narrow dust column. On water it is a splash column.
 */
export function drawMortarBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  water = false,
): void {
  if (!water) {
    drawGroundBurst(ctx, x, y, t, seed, 0, -1, {
      fire: 0.94,
      rise: 1.28,
      down: 0.05,
      smoke: 1,
      chunks: 20,
      scale: 1.08,
      girth: 0.7,
    });
    return;
  }
  const rnd = rng(seed ^ 0x60a7);
  const fade = 1 - t;
  const column = 1 - (1 - Math.min(1, t / 0.42)) ** 2;
  ctx.save();
  ctx.globalAlpha = fade * 0.55;
  ctx.fillStyle = "#d7efea";
  ctx.beginPath();
  ctx.ellipse(x, y, 7 + t * 20, 3.2 + t * 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * 0.72;
  ctx.fillStyle = "#f5fffc";
  ctx.beginPath();
  ctx.ellipse(x, y - column * 34, 3.4, 8 + column * 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * 0.4;
  ctx.fillStyle = "#9fd4e0";
  ctx.beginPath();
  ctx.ellipse(x, y - column * 18, 5, 4 + column * 6, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 16; i++) {
    const delay = rnd() * 0.06;
    const flight = 0.62 + rnd() * 0.34;
    const reach = (rnd() - 0.5) * 22;
    const kick = 16 + rnd() * 26;
    const drop = rnd() > 0.5;
    const local = (t - delay) / flight;
    if (local <= 0 || local >= 1) continue;
    ctx.globalAlpha = (1 - local) * 0.9;
    ctx.fillStyle = drop ? "#f7fffc" : "#b7e0ea";
    ctx.beginPath();
    ctx.arc(x + reach * local, y - Math.sin(local * Math.PI) * kick, 1.3 + (i % 3) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Leaving spark: impact on the hull to the current ground point. */
export function drawRicochetTrace(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  shell = false,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx * dx + dy * dy < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = shell ? "rgba(255, 210, 120, 0.95)" : "rgba(255, 236, 176, 0.92)";
  ctx.lineWidth = shell ? 2.2 : 0.95;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.fillStyle = "#fff8e4";
  ctx.fillRect(x1 - 0.55, y1 - 0.55, 1.2, 1.2);
  ctx.restore();
}

/** Orange pane + rifle cone so garrison fire reads through a window. */
export function drawWindowMuzzle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  t: number,
  caliber?: number,
): void {
  const ft = t / 0.5;
  if (ft < 1) {
    const a = (1 - ft) * (1 - ft);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ff9a40";
    ctx.fillRect(x - 2.6, y - 6.5, 5.2, 11);
    ctx.fillStyle = "#ffe7a0";
    ctx.fillRect(x - 1.4, y - 4.2, 2.8, 7.5);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, 2.4 + (1 - ft) * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawMuzzleBlast(ctx, x, y, dirX, dirY, t, caliber);
}

/** Muzzle: flash cone along the barrel and a short pressure disc. */
export function drawMuzzleBlast(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  t: number,
  caliber?: number,
): void {
  const shell = isShellCaliber(caliber);
  const d = dirOf(dirX, dirY);
  const ft = t / 0.42;
  ctx.save();
  if (ft < 1) {
    ctx.globalCompositeOperation = "lighter";
    const a = (1 - ft) * (1 - ft);
    ctx.globalAlpha = a;
    const len = (shell ? 20 : 8) * (1.08 - ft * 0.35);
    const w = (shell ? 5.2 : 2.2) * (1 - ft * 0.45);
    ctx.fillStyle = "#fff4c8";
    ctx.beginPath();
    ctx.moveTo(x + d.x * len, y + d.y * len);
    ctx.lineTo(x - d.y * w - d.x * 2, y + d.x * w - d.y * 2);
    ctx.lineTo(x + d.y * w - d.x * 2, y - d.x * w - d.y * 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, shell ? 3.4 : 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  drawShockRing(ctx, x, y, Math.min(1, t / 0.72), shell ? 13 : 5.5, shell ? 0.5 : 0.22);
}

function drawDirtCone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  t: number,
  seed: number,
  count: number,
  travel: number,
  halfCone: number,
): void {
  if (count <= 0 || travel <= 0) return;
  const along = dirOf(dirX, dirY);
  const baseAng = Math.atan2(along.y, along.x);
  const rnd = rng(seed ^ 0x51ed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const ang = baseAng + (rnd() - 0.5) * 2 * halfCone;
    const delay = rnd() * 0.06;
    const span = 0.42 + rnd() * 0.5;
    const local = (t - delay) / span;
    if (local <= 0 || local >= 1) continue;
    const speed = (0.38 + rnd() * 0.72) * travel;
    const lift = -(0.22 + rnd() * 0.55);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang) + lift;
    const dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl;
    const uy = dy / dl;
    const ease = 1 - (1 - local) * (1 - local);
    const px = x + ux * speed * ease;
    const py = y + uy * speed * ease;
    const a = (1 - local) * (1 - local) * (0.55 + rnd() * 0.4);
    const rw = (1.1 + rnd() * 2.4) * (1 - local * 0.25);
    const rh = rw * (0.45 + rnd() * 0.25);
    ctx.globalAlpha = a;
    ctx.fillStyle = rnd() > 0.4 ? "#6b5340" : rnd() > 0.5 ? "#5a4634" : "#8a6e50";
    ctx.beginPath();
    ctx.ellipse(px, py, rw, rh, ang * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Column and foam where a round hits water. `t` runs 0–1. */
export function drawWaterDetonation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  caliber?: number,
): void {
  const scale = waterSplashScale(caliber);
  const fade = 1 - t;
  const rnd = rng(seed ^ 0x5a11);
  const column = 1 - (1 - Math.min(1, t / 0.45)) ** 2;
  ctx.save();
  ctx.globalAlpha = fade * 0.5;
  ctx.fillStyle = "#d7efea";
  ctx.beginPath();
  ctx.ellipse(x, y, (9 + t * 18) * scale, (4 + t * 6) * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * 0.4;
  ctx.strokeStyle = "#8ec4cc";
  ctx.lineWidth = Math.max(1, 1.6 * scale);
  ctx.beginPath();
  ctx.ellipse(x, y, (14 + t * 24) * scale, (6 + t * 8) * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = fade * 0.75;
  ctx.fillStyle = "#f5fffc";
  ctx.beginPath();
  ctx.ellipse(x, y - column * 16 * scale, 2.8 * scale, (5 + column * 12) * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * 0.4;
  ctx.fillStyle = "#9fd4e0";
  ctx.beginPath();
  ctx.ellipse(x, y - column * 8 * scale, 4.5 * scale, 3.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  const drops = Math.round((isShellCaliber(caliber) ? 14 : 5) * Math.min(1.5, scale + 0.2));
  for (let i = 0; i < drops; i++) {
    const ang = rnd() * Math.PI * 2;
    const delay = rnd() * 0.08;
    const local = (t - delay) / (0.5 + rnd() * 0.4);
    if (local <= 0 || local >= 1) continue;
    const dist = (7 + rnd() * 24) * scale * local;
    const lift = Math.sin(local * Math.PI) * (8 + rnd() * 14) * scale;
    ctx.globalAlpha = (1 - local) * 0.8;
    ctx.fillStyle = rnd() > 0.5 ? "#f7fffc" : "#b7e0ea";
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(ang) * dist,
      y + Math.sin(ang) * dist * 0.45 - lift,
      (1 + rnd() * 1.5) * scale,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/** Lasting dirt crater used until the crater decal is loaded. `rx` is the long radius. */
export function drawShellHole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  ang: number,
  seed: number,
  alpha = 1,
): void {
  if (rx < 0.5 || alpha <= 0) return;
  const rnd = rng(seed ^ 0x401e);
  const steps = 16;
  const lip: number[] = [];
  const bowl: number[] = [];
  for (let i = 0; i < steps; i++) {
    lip.push(0.9 + rnd() * 0.28);
    bowl.push(0.42 + rnd() * 0.14);
  }
  const ring = (radii: number[], scale: number): void => {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = ((i % steps) / steps) * Math.PI * 2;
      const m = radii[i % steps] ?? 1;
      const px = Math.cos(a) * rx * m * scale;
      const py = Math.sin(a) * ry * m * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = 0.92 * alpha;
  ring(lip, 1);
  ctx.fillStyle = "#7c654c";
  ctx.fill();
  ring(bowl, 1);
  ctx.fillStyle = "#3a2c22";
  ctx.fill();
  ctx.fillStyle = "#14110e";
  ctx.beginPath();
  ctx.ellipse(-rx * 0.04, ry * 0.02, rx * 0.26, ry * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const a = ang + rnd() * Math.PI * 2;
    const d = rx * (0.78 + rnd() * 0.38);
    ctx.globalAlpha = 0.75 * alpha;
    ctx.fillStyle = rnd() > 0.5 ? "#6a5340" : "#8a7058";
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.45, rx * 0.12, ry * 0.16, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Small pooled stain under a corpse. */
export function drawBloodStain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = "#6e1c18";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#3a0e0c";
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.55, ry * 0.5, rot, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function burstForShell(shell: string | undefined, caliber: number | undefined): BurstShape {
  const scale = Math.max(0.8, (caliber ?? 75) / 75);
  if (shell === "ap") {
    return { fire: 0.26, rise: 0.4, down: 0.84, smoke: 0.5, chunks: 16, scale, girth: 1.15 };
  }
  if (shell === "heat") {
    return { fire: 0.78, rise: 0.58, down: 0.34, smoke: 0.7, chunks: 14, scale: scale * 0.92, girth: 0.9 };
  }
  return { fire: 1, rise: 0.86, down: 0.24, smoke: 1, chunks: 22, scale, girth: 1.2 };
}

/**
 * Ground impact. A heavy shell detonates: flash, fire, clods, and dust.
 * Small arms keep a short puff of dirt along the shot.
 */
export function drawGroundMiss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  caliber?: number,
  dirX = 0,
  dirY = -1,
  shell?: string,
): void {
  const incoming = dirOf(dirX, dirY);
  if (isShellCaliber(caliber)) {
    const shape = burstForShell(shell, caliber);
    drawGroundBurst(ctx, x, y, t, seed, incoming.x, incoming.y, shape);
    if (shell === "ap" || shell === "heat") {
      drawSparkBurst(
        ctx,
        x,
        y,
        incoming.x,
        incoming.y,
        t,
        seed ^ 0x21,
        shell === "ap" ? 9 : 5,
        18 * shape.scale,
        true,
      );
    }
    return;
  }
  const fade = 1 - t;
  const gouge = Math.atan2(incoming.y, incoming.x);
  ctx.save();
  ctx.globalAlpha = fade * 0.52;
  ctx.fillStyle = "#4a3a28";
  ctx.beginPath();
  ctx.ellipse(
    x + incoming.x * t * 1.2,
    y + incoming.y * t * 0.6,
    4.2 + t * 3.2,
    2 + t * 1.4,
    gouge,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
  drawDust(ctx, x, y, t, seed, 3, 6);
  drawDirtCone(ctx, x, y, incoming.x, incoming.y, t, seed, 8, 12 + t * 4, 0.5);
  drawSparkBurst(ctx, x, y, incoming.x, incoming.y, t, seed, 1, 5);
}

/** Extra shock and sparks around a cook-off fireball. */
export function drawCookoffBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
): void {
  drawShockRing(ctx, x, y, Math.min(1, t / 0.7), 46, 0.95);
  if (t < 0.45) drawShockRing(ctx, x, y, Math.min(1, t / 0.4), 22, 0.7);
  drawContactFlash(ctx, x, y, t, 14);
  drawSparkBurst(ctx, x, y, 1, 0, t, seed, 18, 52);
}

/** How long a wreck's hull fires last at 1×, ms. Second fire dies sooner. */
export const WRECK_FIRE_MS = 16_000;

export function wreckFireCount(id: number): number {
  return (id & 1) === 0 ? 2 : 1;
}

export function wreckFireAlpha(ageMs: number, index: number): number {
  const life = WRECK_FIRE_MS * (index === 0 ? 1 : 0.7);
  if (ageMs >= life) return 0;
  const fadeAt = life * 0.58;
  if (ageMs <= fadeAt) return 1;
  return Math.max(0, 1 - (ageMs - fadeAt) / (life - fadeAt));
}

/** Match-head flame on a wreck deck. `alpha` is the remaining burn (0 = out). */
export function drawWreckFire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nowMs: number,
  seed: number,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  const t = nowMs * 0.001;
  const wobble =
    0.5 +
    0.5 *
      Math.sin(t * 19.7 + seed * 0.31) *
      Math.sin(t * 27.4 + seed * 0.17);
  const flick = 0.62 + 0.38 * wobble;
  const a = alpha * flick;
  const h = 3.6 + flick * 1.5;
  const w = 1.2 + flick * 0.45;
  const lean = Math.sin(t * 11.3 + seed) * 0.45;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a * 0.4;
  ctx.fillStyle = "#ff5a14";
  ctx.beginPath();
  ctx.ellipse(x + lean * 0.3, y - h * 0.2, w * 1.7, h * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = a * 0.9;
  ctx.fillStyle = "#ff8c22";
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 0.35 + lean, y - h * 0.55, x + lean * 0.6, y - h);
  ctx.quadraticCurveTo(x + w * 0.35 + lean, y - h * 0.55, x + w, y);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = a;
  ctx.fillStyle = "#ffe7a0";
  ctx.beginPath();
  ctx.ellipse(x + lean * 0.2, y - h * 0.28, w * 0.38, h * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const smokeRise = ((t * 0.42 + seed * 0.013) % 1);
  ctx.save();
  ctx.globalAlpha = a * 0.2 * (1 - smokeRise);
  ctx.fillStyle = "#5c5850";
  ctx.beginPath();
  ctx.ellipse(
    x + Math.sin(t * 2.8 + seed) * 1.4 + lean,
    y - h - 1 - smokeRise * 6,
    1.0 + smokeRise * 1.5,
    0.85 + smokeRise * 1.2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

/** Ground click-to-move ping. `t` is 0..1 through the ring's life. */
export const MOVE_CLICK_MS = 460;

export function drawMoveClick(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (t <= 0 || t >= 1) return;
  const ease = 1 - (1 - t) * (1 - t);
  const fade = (1 - t) * (1 - t);
  const rx = 3.2 + ease * 13;
  ctx.save();
  ctx.beginPath();
  groundEllipse(ctx, x, y, rx);
  ctx.strokeStyle = `rgba(232, 184, 74, ${0.55 * fade})`;
  ctx.lineWidth = 1.35;
  ctx.stroke();
  ctx.beginPath();
  groundEllipse(ctx, x, y, rx * 0.42);
  ctx.strokeStyle = `rgba(255, 236, 186, ${0.28 * fade})`;
  ctx.lineWidth = 1;
  ctx.stroke();
  const pip = 1 - Math.min(1, t / 0.28);
  if (pip > 0) {
    ctx.beginPath();
    groundEllipse(ctx, x, y, 1.6 + (1 - pip) * 2.2);
    ctx.fillStyle = `rgba(232, 184, 74, ${0.22 * pip})`;
    ctx.fill();
  }
  ctx.restore();
}
