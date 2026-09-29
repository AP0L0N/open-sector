/**
 * Cyborg electrics. Client-only: the shield crackle while his plating cannot
 * be hurt, and the short-circuit that keeps spitting from a dead cyborg's torn
 * hips. Nothing here changes the match.
 */

/** How long a dead cyborg keeps shorting out, ms of game time. */
export const CYBORG_DEATH_SPARK_MS = 7000;
/** The first shower when he goes down, ms. */
export const CYBORG_DEATH_BURST_MS = 900;
/** One flicker slot. An arc is either up or down for the whole slot. */
const ARC_SLOT_MS = 70;

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Remaining strength of the corpse short-circuit: full, then a fade into the last second. */
export function cyborgSparkAlpha(ageMs: number): number {
  if (ageMs < 0 || ageMs >= CYBORG_DEATH_SPARK_MS) return 0;
  const fadeAt = CYBORG_DEATH_SPARK_MS * 0.55;
  if (ageMs <= fadeAt) return 1;
  return 1 - (ageMs - fadeAt) / (CYBORG_DEATH_SPARK_MS - fadeAt);
}

/**
 * Whether arc `index` is lit in the flicker slot at `ms`. Deterministic per
 * seed, so every client and every redraw in one slot agrees. `chance` is 0..1.
 */
export function arcLit(ms: number, seed: number, index: number, chance: number): boolean {
  if (chance <= 0) return false;
  const slot = Math.floor(ms / ARC_SLOT_MS);
  return hash(seed * 31 + index, slot) < chance;
}

/** Where the torn hips sit on screen: behind the torso along the body axis. */
export function cyborgHipPoint(
  contactX: number,
  contactY: number,
  size: number,
  dirX: number,
  dirY: number,
): { x: number; y: number } {
  const l = Math.hypot(dirX, dirY) || 1;
  return {
    x: contactX - (dirX / l) * size * 0.2,
    y: contactY - (dirY / l) * size * 0.2 - size * 0.05,
  };
}

/** A jagged blue-white bolt between two points. */
function drawArc(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  alpha: number,
): void {
  const rnd = rng(seed);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: [number, number][] = [[x0, y0]];
  const segs = 5;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jog = (rnd() - 0.5) * len * 0.55;
    pts.push([x0 + dx * t + nx * jog, y0 + dy * t + ny * jog]);
  }
  pts.push([x1, y1]);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "miter";
  ctx.lineCap = "round";
  for (const [w, color, a] of [
    [2.6, "#5fb8ff", 0.35],
    [1.1, "#e8f6ff", 0.95],
  ] as const) {
    ctx.globalAlpha = alpha * a;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Hot yellow-white pinpricks thrown up and falling back. `t` is 0..1 through the spurt. */
function drawSpurt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  count: number,
  reach: number,
  alpha: number,
): void {
  if (t <= 0 || t >= 1) return;
  const rnd = rng(seed ^ 0x5bd1e995);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
    const speed = (0.45 + rnd() * 0.55) * reach;
    const local = Math.min(1, t * (0.8 + rnd() * 0.5));
    const px = x + Math.cos(ang) * speed * local;
    // Up and out, then gravity pulls them back onto the dirt.
    const py = y + Math.sin(ang) * speed * 0.6 * local + reach * 0.9 * local * local;
    const a = alpha * (1 - local) * (0.6 + rnd() * 0.4);
    if (a <= 0.02) continue;
    ctx.globalAlpha = a;
    ctx.strokeStyle = local < 0.35 ? "#ffffff" : local < 0.7 ? "#ffe89a" : "#ffb44a";
    ctx.lineWidth = local < 0.35 ? 1.3 : 0.9;
    const tail = 1.5 + rnd() * 2.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang) * tail, py - Math.sin(ang) * tail * 0.6 + tail * 0.4 * local);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Dead cyborg: a shower of sparks and a blue flash as he goes down, then the
 * torn hips keep shorting out — small arcs and spurts — until the power dies.
 */
export function drawCyborgDeathSparks(
  ctx: CanvasRenderingContext2D,
  contactX: number,
  contactY: number,
  size: number,
  dirX: number,
  dirY: number,
  ageMs: number,
  seed: number,
): void {
  const alpha = cyborgSparkAlpha(ageMs);
  if (alpha <= 0) return;
  const hip = cyborgHipPoint(contactX, contactY, size, dirX, dirY);
  if (ageMs < CYBORG_DEATH_BURST_MS) {
    const t = ageMs / CYBORG_DEATH_BURST_MS;
    if (t < 0.18) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (1 - t / 0.18) * 0.85;
      ctx.fillStyle = "#bfe4ff";
      ctx.beginPath();
      ctx.ellipse(hip.x, hip.y, size * 0.22, size * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawSpurt(ctx, hip.x, hip.y, t, seed, 16, size * 0.5, 1);
    for (let i = 0; i < 3; i++) {
      if (!arcLit(ageMs, seed, i, 0.8)) continue;
      const r = rng(seed + i * 977 + Math.floor(ageMs / ARC_SLOT_MS));
      drawArc(ctx, hip.x, hip.y, hip.x + (r() - 0.5) * size * 0.55, hip.y + (r() - 0.7) * size * 0.35, seed + i, 1);
    }
    return;
  }
  // After the shower: every so often a stump shorts — an arc, and sometimes a spurt.
  for (let side = 0; side < 2; side++) {
    const off = (side === 0 ? -1 : 1) * size * 0.06;
    const hx = hip.x + off;
    const hy = hip.y + off * 0.3;
    if (arcLit(ageMs, seed, 10 + side, 0.32 * alpha + 0.05)) {
      const r = rng(seed * 7 + side + Math.floor(ageMs / ARC_SLOT_MS));
      drawArc(ctx, hx, hy, hx + (r() - 0.5) * size * 0.3, hy - r() * size * 0.18, seed + side * 13, alpha);
    }
    const period = 1100 + side * 370;
    const phase = (ageMs + hash(seed, side) * period) % period;
    const spurtMs = 380;
    if (phase < spurtMs && hash(seed + side, Math.floor((ageMs + hash(seed, side) * period) / period)) < 0.7) {
      drawSpurt(ctx, hx, hy, phase / spurtMs, seed + side * 101 + Math.floor(ageMs / period), 6, size * 0.25, alpha);
    }
  }
}

/**
 * Shielded cyborg: arcs crawl over the plating and a faint blue sheen pulses,
 * so both sides can see that shooting him is wasted for now.
 */
export function drawCyborgShield(
  ctx: CanvasRenderingContext2D,
  contactX: number,
  contactY: number,
  size: number,
  nowMs: number,
  seed: number,
): void {
  const cx = contactX;
  const cy = contactY - size * 0.12;
  const rx = size * 0.34;
  const ry = size * 0.2;
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.012 + seed);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.14 + pulse * 0.12;
  ctx.fillStyle = "#6cc4ff";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 3; i++) {
    if (!arcLit(nowMs, seed, i, 0.55)) continue;
    const r = rng(seed * 13 + i * 71 + Math.floor(nowMs / ARC_SLOT_MS));
    const a0 = r() * Math.PI * 2;
    const a1 = a0 + 0.9 + r() * 1.6;
    drawArc(
      ctx,
      cx + Math.cos(a0) * rx,
      cy + Math.sin(a0) * ry,
      cx + Math.cos(a1) * rx,
      cy + Math.sin(a1) * ry,
      seed + i * 5,
      0.9,
    );
  }
}
