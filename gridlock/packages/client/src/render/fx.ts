import boomUrl from "../assets/fx/explosion.png";
import smokeUrl from "../assets/fx/smoke.png";

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
  if (kind === "miss") return 440;
  if (kind === "tracer") return 180;
  return 400;
}

export function isShellCaliber(caliber: number | undefined): boolean {
  return (caliber ?? 0) >= 40;
}

/** In-flight 75mm streak: glow, core, hot tip. t=0 is full, t=1 is gone. */
export function drawShellTracer(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t = 0,
): void {
  const fade = Math.max(0, 1 - t);
  if (fade <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(255, 150, 48, ${0.32 * fade})`;
  ctx.lineWidth = 5.4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 224, 140, ${0.95 * fade})`;
  ctx.lineWidth = 2.15;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 252, 236, ${fade})`;
  ctx.beginPath();
  ctx.arc(x1, y1, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

/** Bounce: sparks along the leaving shot, tiny slap of compressed air. */
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
  drawContactFlash(ctx, x, y, t, shell ? 5 : 2.4);
  drawShockRing(ctx, x, y, Math.min(1, t / 0.5), shell ? 12 : 6, shell ? 0.4 : 0.2);
  drawSparkBurst(ctx, x, y, dirX, dirY, t, seed, shell ? 16 : 5, shell ? 48 : 16, true);
  const d = dirOf(dirX, dirY);
  const travel = shell ? 56 : 42;
  const head = Math.min(1, t / 0.22);
  const fade = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);
  const hx = x + d.x * travel * head;
  const hy = y + d.y * travel * head;
  const tail = travel * (shell ? 0.5 : 0.42);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.95 * fade;
  ctx.strokeStyle = "#ffe8b0";
  ctx.lineWidth = shell ? 2 : 1.2;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(hx - d.x * tail, hy - d.y * tail);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = "#fff8e4";
  ctx.fillRect(hx - 0.55, hy - 0.55, 1.2, 1.2);
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

/** Dirt and a faint pressure slap. No fire. */
export function drawGroundMiss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  caliber?: number,
): void {
  const shell = isShellCaliber(caliber);
  const fade = 1 - t;
  ctx.save();
  ctx.globalAlpha = fade * (shell ? 0.7 : 0.5);
  ctx.fillStyle = "#5a4a32";
  ctx.beginPath();
  ctx.ellipse(x, y, (shell ? 8 : 5) + t * (shell ? 8 : 5), (shell ? 4 : 2.4) + t * (shell ? 4 : 2.4), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (shell) drawShockRing(ctx, x, y, Math.min(1, t / 0.7), 22, 0.45);
  drawDust(ctx, x, y, t, seed, shell ? 16 : 6, shell ? 22 : 10);
  drawSparkBurst(ctx, x, y, 0, -1, t, seed, shell ? 4 : 1, shell ? 14 : 6);
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
