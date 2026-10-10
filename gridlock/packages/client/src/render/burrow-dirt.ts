/**
 * The ground round a burrowing unit: a pit with a lit back wall, a ring of spoil heaped round the
 * rim, clods and grit thrown wide, and dirt flying while it digs or climbs out. The body is cut off
 * along the front rim of the pit, not a straight line, and the front of the ring is drawn over the
 * cut so the body sits down in the hole. Every lump is seeded on the unit's id: the same heap every
 * frame. Drawing only.
 */

/** The pit on screen: centre on the ground point, iso radii (2:1). */
export interface BurrowHole {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Seeded 0–1 from an id and an index. */
function hash(id: number, i: number): number {
  let h = (Math.imul(id + 1, 374761393) + Math.imul(i + 7, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const SOIL = ["#5a4029", "#664a30", "#4d3622", "#735638", "#3f2d1c"];
const CLODS_ON_RIM = 40;
const CLODS = 18;
const SPRAY = 16;
/** Segments round the ring: enough that the noisy edge reads as earth, not a polygon. */
const RING_STEPS = 48;

/** The pit for a unit drawn `size` px, standing at (x, y). */
export function burrowHole(x: number, y: number, size: number): BurrowHole {
  const rx = size * 0.4;
  return { x, y, rx, ry: rx * 0.5 };
}

/** Lumpy radius at angle `a`, about 1: the same lumps every frame for one id. */
function wobble(id: number, a: number, salt: number): number {
  const p1 = hash(id, salt) * 6.283;
  const p2 = hash(id, salt + 1) * 6.283;
  const p3 = hash(id, salt + 2) * 6.283;
  return 1 + 0.09 * Math.sin(3 * a + p1) + 0.06 * Math.sin(7 * a + p2) + 0.035 * Math.sin(13 * a + p3);
}

/**
 * One arc of the spoil ring, from angle a0 to a1 (screen angles, 0 east, PI/2 toward the viewer):
 * the outer skirt fading into the ground, the heaped crest lit from the top left, and its inner
 * lip falling into the pit. `grow` 0–1 scales how high and wide the heap stands.
 */
function drawBerm(ctx: CanvasRenderingContext2D, id: number, hole: BurrowHole, grow: number, a0: number, a1: number): void {
  const { x, y, rx, ry } = hole;
  const lift = rx * 0.16 * grow;
  const band = (inner: number, outer: number, up: number, salt: number): void => {
    ctx.beginPath();
    for (let i = 0; i <= RING_STEPS; i++) {
      const a = a0 + ((a1 - a0) * i) / RING_STEPS;
      const w = wobble(id, a, salt);
      const r = 1 + (outer - 1) * grow;
      const px = x + Math.cos(a) * rx * r * w;
      const py = y + Math.sin(a) * ry * r * w;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    for (let i = RING_STEPS; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / RING_STEPS;
      const w = wobble(id, a, salt + 5);
      ctx.lineTo(x + Math.cos(a) * rx * inner * w, y + Math.sin(a) * ry * inner * w - up);
    }
    ctx.closePath();
  };
  // Skirt: loose earth spilling out over the grass, soft at its edge.
  ctx.fillStyle = "rgba(58, 42, 27, 0.35)";
  band(0.95, 1.7, 0, 10);
  ctx.fill();
  ctx.fillStyle = "rgba(62, 45, 29, 0.75)";
  band(0.95, 1.45, 0, 20);
  ctx.fill();
  // Crest: the heap itself, lit from the top left, in shadow toward the bottom right.
  const lit = ctx.createLinearGradient(x - rx, y - ry - lift, x + rx, y + ry);
  lit.addColorStop(0, "#86684a");
  lit.addColorStop(0.45, "#64492f");
  lit.addColorStop(1, "#3b2a1a");
  ctx.fillStyle = lit;
  band(0.9, 1.25, lift, 30);
  ctx.fill();
  // The top of the heap catches the most light.
  ctx.fillStyle = "rgba(150, 120, 86, 0.28)";
  band(1.0, 1.12, lift * 1.3, 40);
  ctx.fill();
}

interface Clod {
  x: number;
  y: number;
  r: number;
  color: string;
  stone: boolean;
  spin: number;
}

/** Clods on the crest of the ring (`rim`) or flung out over the ground round it. */
function clods(id: number, hole: BurrowHole, grow: number, rim: boolean): Clod[] {
  const out: Clod[] = [];
  const n = rim ? CLODS_ON_RIM : CLODS;
  const salt = rim ? 2000 : 3000;
  for (let i = 0; i < n; i++) {
    const a = hash(id, salt + i) * Math.PI * 2;
    const reach = rim ? 0.95 + hash(id, salt + i + 100) * 0.35 : 1.4 + hash(id, salt + i + 100) * 0.8;
    const lift = rim ? hole.rx * 0.14 * grow : 0;
    out.push({
      x: hole.x + Math.cos(a) * hole.rx * reach,
      y: hole.y + Math.sin(a) * hole.ry * reach - lift,
      r: Math.max(0.7, hole.rx * (rim ? 0.035 + hash(id, salt + i + 200) * 0.06 : 0.02 + hash(id, salt + i + 200) * 0.04)) * Math.min(1, grow * 1.4),
      color: SOIL[Math.floor(hash(id, salt + i + 300) * SOIL.length)]!,
      stone: hash(id, salt + i + 400) < (rim ? 0.08 : 0.3),
      spin: hash(id, salt + i + 500) * Math.PI,
    });
  }
  return out.sort((p, q) => p.y - q.y);
}

/** A broken clod: an uneven five-sided chunk with its top face lit. */
function drawClod(ctx: CanvasRenderingContext2D, c: Clod): void {
  if (c.r < 0.5) return;
  ctx.fillStyle = "rgba(24, 17, 10, 0.4)";
  ctx.beginPath();
  ctx.ellipse(c.x + c.r * 0.3, c.y + c.r * 0.35, c.r, c.r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.stone ? "#77736a" : c.color;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = c.spin + (k / 5) * Math.PI * 2;
    const rr = c.r * (0.75 + 0.25 * Math.sin(k * 2.3 + c.spin * 3));
    const px = c.x + Math.cos(a) * rr;
    const py = c.y + Math.sin(a) * rr * 0.7;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.stone ? "rgba(225, 220, 205, 0.45)" : "rgba(160, 128, 92, 0.45)";
  ctx.beginPath();
  ctx.ellipse(c.x - c.r * 0.25, c.y - c.r * 0.25, c.r * 0.45, c.r * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Before the body: churned ground fading out round the hole, the pit with its back wall lit, and
 * the far half of the spoil ring. `grow` is how far the dig has come, 0–1.
 */
export function drawBurrowBack(ctx: CanvasRenderingContext2D, id: number, hole: BurrowHole, grow: number): void {
  if (grow <= 0) return;
  const { x, y, rx, ry } = hole;
  ctx.save();
  // Disturbed earth, darker and damper near the hole.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const stain = ctx.createRadialGradient(0, 0, rx * 0.6, 0, 0, rx * 2);
  stain.addColorStop(0, `rgba(66, 48, 30, ${0.6 * grow})`);
  stain.addColorStop(0.6, `rgba(84, 64, 42, ${0.3 * grow})`);
  stain.addColorStop(1, "rgba(84, 64, 42, 0)");
  ctx.fillStyle = stain;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // The pit: its back wall catches the light, the bottom falls away into shadow.
  const pr = rx * (0.55 + 0.4 * grow);
  ctx.fillStyle = "#5b4430";
  ctx.beginPath();
  ctx.ellipse(x, y, pr, pr * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const pit = ctx.createRadialGradient(x, y + ry * 0.15, 0, x, y + ry * 0.15, pr);
  pit.addColorStop(0, "rgba(12, 8, 5, 0.97)");
  pit.addColorStop(0.7, "rgba(28, 20, 12, 0.95)");
  pit.addColorStop(1, "rgba(44, 32, 20, 0.9)");
  ctx.fillStyle = pit;
  ctx.beginPath();
  ctx.ellipse(x, y + ry * 0.14, pr * 0.9, pr * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  drawBerm(ctx, id, hole, grow, Math.PI, Math.PI * 2);
  for (const c of clods(id, hole, grow, true)) if (c.y < hole.y) drawClod(ctx, c);
  ctx.restore();
}

/**
 * After the body: the near half of the spoil ring over the cut, clods and grit thrown wide, and,
 * while `flying` (0–1, how hard it is digging), dirt kicked up out of the hole.
 */
export function drawBurrowFront(ctx: CanvasRenderingContext2D, id: number, hole: BurrowHole, grow: number, flying: number, now: number): void {
  if (grow <= 0 && flying <= 0) return;
  const { x, y, rx, ry } = hole;
  ctx.save();
  drawBerm(ctx, id, hole, grow, 0, Math.PI);
  for (const c of clods(id, hole, grow, true)) if (c.y >= hole.y) drawClod(ctx, c);
  // Clods and stones flung out over the ground.
  for (const c of clods(id, hole, grow, false)) drawClod(ctx, c);
  if (flying > 0) {
    // Dirt thrown up out of the hole on short arcs, and a haze of dust over it.
    const t = now / 1000;
    for (let i = 0; i < SPRAY; i++) {
      const phase = (t * (1.4 + hash(id, i + 900) * 0.8) + hash(id, i + 1000)) % 1;
      const a = hash(id, i + 1100) * Math.PI * 2;
      const out = 0.5 + phase * (0.7 + hash(id, i + 1200) * 0.6);
      const px = x + Math.cos(a) * rx * out;
      const py = y + Math.sin(a) * ry * out - Math.sin(phase * Math.PI) * rx * (0.5 + hash(id, i + 1300) * 0.7);
      const r = Math.max(0.7, rx * 0.05 * (1 - phase * 0.5));
      ctx.fillStyle = `rgba(92, 68, 44, ${flying * (1 - phase)})`;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    ctx.save();
    ctx.translate(x, y - ry * 0.6);
    ctx.scale(1, 0.6);
    const dust = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.5);
    dust.addColorStop(0, `rgba(150, 125, 95, ${0.35 * flying})`);
    dust.addColorStop(1, "rgba(150, 125, 95, 0)");
    ctx.fillStyle = dust;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Clip to everything above the near rim of the pit: the body shows down into the hole and no further. */
export function clipAboveRim(ctx: CanvasRenderingContext2D, hole: BurrowHole, size: number): void {
  const { x, y, rx, ry } = hole;
  const far = size * 3;
  ctx.beginPath();
  ctx.moveTo(x - far, y - far * 1.5);
  ctx.lineTo(x + far, y - far * 1.5);
  ctx.lineTo(x + far, y);
  ctx.lineTo(x + rx, y);
  ctx.ellipse(x, y, rx, ry * 0.85, 0, 0, Math.PI, false);
  ctx.lineTo(x - far, y);
  ctx.closePath();
  ctx.clip();
}

/** A filled-in scar where a unit climbed out: the spoil sunk back, fading over `u` 0–1. */
export function drawBurrowScar(ctx: CanvasRenderingContext2D, id: number, hole: BurrowHole, u: number): void {
  const a = 1 - u;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.save();
  ctx.translate(hole.x, hole.y);
  ctx.scale(1, hole.ry / hole.rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, hole.rx * 1.6);
  g.addColorStop(0, "rgba(52, 38, 24, 0.75)");
  g.addColorStop(0.55, "rgba(74, 56, 36, 0.45)");
  g.addColorStop(1, "rgba(84, 64, 42, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, hole.rx * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawBerm(ctx, id, hole, 0.3, 0, Math.PI * 2);
  for (const c of clods(id, hole, 0.5, false)) drawClod(ctx, c);
  ctx.restore();
}
