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
  if (kind === "miss") return 560;
  return 400;
}

export function isShellCaliber(caliber: number | undefined): boolean {
  return (caliber ?? 0) >= 40;
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

/** Dirt crater plus a cone of ejecta along the incoming shot. No fire. */
export function drawGroundMiss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  caliber?: number,
  dirX = 0,
  dirY = -1,
): void {
  const shell = isShellCaliber(caliber);
  const incoming = dirOf(dirX, dirY);
  const fade = 1 - t;
  const gouge = Math.atan2(incoming.y, incoming.x);
  ctx.save();
  ctx.globalAlpha = fade * (shell ? 0.78 : 0.52);
  ctx.fillStyle = "#4a3a28";
  ctx.beginPath();
  ctx.ellipse(
    x + incoming.x * t * (shell ? 2.2 : 1.2),
    y + incoming.y * t * (shell ? 1.1 : 0.6),
    (shell ? 7 : 4.2) + t * (shell ? 6 : 3.2),
    (shell ? 3.4 : 2) + t * (shell ? 2.4 : 1.4),
    gouge,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
  if (shell) drawShockRing(ctx, x, y, Math.min(1, t / 0.7), 20, 0.4);
  drawDust(ctx, x, y, t, seed, shell ? 8 : 3, shell ? 12 : 6);
  drawDirtCone(
    ctx,
    x,
    y,
    incoming.x,
    incoming.y,
    t,
    seed,
    shell ? 22 : 8,
    (shell ? 28 : 12) + t * (shell ? 10 : 4),
    shell ? 0.62 : 0.5,
  );
  const burst = 1 - Math.min(1, t / 0.28);
  if (burst > 0) {
    const reach = (shell ? 18 : 8) * (0.55 + burst * 0.45);
    const half = (shell ? 10 : 4.5) * burst;
    ctx.save();
    ctx.globalAlpha = burst * burst * (shell ? 0.42 : 0.22);
    ctx.fillStyle = "#6b5340";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + incoming.x * reach - incoming.y * half, y + incoming.y * reach + incoming.x * half);
    ctx.lineTo(x + incoming.x * reach + incoming.y * half, y + incoming.y * reach - incoming.x * half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  drawSparkBurst(ctx, x, y, incoming.x, incoming.y, t, seed, shell ? 3 : 1, shell ? 10 : 5);
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
