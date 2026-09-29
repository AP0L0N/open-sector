/**
 * Cyborg death sparks. Client-only: a small spit of sparks from a dead
 * cyborg's torn hips that sputters out. Nothing here changes the match.
 */

/** How long a dead cyborg keeps sputtering, ms of game time. */
export const CYBORG_DEATH_SPARK_MS = 2600;
/** The first spit when he goes down, ms. */
export const CYBORG_DEATH_BURST_MS = 520;
/** One sputter window after the first spit. */
const SPUTTER_PERIOD_MS = 620;
const SPUTTER_MS = 260;

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

/** Remaining strength of the sputter: full, then a fade into the end. */
export function cyborgSparkAlpha(ageMs: number): number {
  if (ageMs < 0 || ageMs >= CYBORG_DEATH_SPARK_MS) return 0;
  const fadeAt = CYBORG_DEATH_SPARK_MS * 0.4;
  if (ageMs <= fadeAt) return 1;
  return 1 - (ageMs - fadeAt) / (CYBORG_DEATH_SPARK_MS - fadeAt);
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
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
    const speed = (0.45 + rnd() * 0.55) * reach;
    const local = Math.min(1, t * (0.8 + rnd() * 0.5));
    const px = x + Math.cos(ang) * speed * local;
    // Up and out, then gravity pulls them back onto the dirt.
    const py = y + Math.sin(ang) * speed * 0.6 * local + reach * 0.9 * local * local;
    const a = alpha * (1 - local) * (0.5 + rnd() * 0.4);
    if (a <= 0.02) continue;
    ctx.globalAlpha = a;
    ctx.strokeStyle = local < 0.35 ? "#fff6dc" : local < 0.7 ? "#ffe89a" : "#ffb44a";
    ctx.lineWidth = 0.8;
    const tail = 1 + rnd() * 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang) * tail, py - Math.sin(ang) * tail * 0.6 + tail * 0.4 * local);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Dead cyborg: a small spit of sparks from the torn hips as he goes down,
 * then a few weaker sputters until the power is gone.
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
    drawSpurt(ctx, hip.x, hip.y, ageMs / CYBORG_DEATH_BURST_MS, seed, 7, size * 0.22, 0.9);
    return;
  }
  const since = ageMs - CYBORG_DEATH_BURST_MS;
  const window = Math.floor(since / SPUTTER_PERIOD_MS);
  const phase = since % SPUTTER_PERIOD_MS;
  if (phase >= SPUTTER_MS || hash(seed, window) >= 0.65) return;
  const off = (hash(seed + 1, window) - 0.5) * size * 0.12;
  drawSpurt(ctx, hip.x + off, hip.y + off * 0.3, phase / SPUTTER_MS, seed + window * 101, 3, size * 0.14, alpha * 0.8);
}
