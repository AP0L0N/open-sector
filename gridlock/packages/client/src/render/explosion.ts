/**
 * Ground detonations for heavy rounds: tank shells, mortar bombs, field-gun
 * shells, rockets, and aircraft bombs. One burst, sized by the round's
 * firepower (caliber and center damage), with the shape picked by how the
 * round arrived.
 *
 * The look is a short flash and fire inside a fountain of thrown earth,
 * clods on arcs, a dust ring along the ground, and a cloud that hangs and
 * drifts off before it thins. Smoke and dust are textured puffs baked once
 * from noise, lit from the upper left like the props. Nothing here reaches
 * the sim.
 */

export type BurstFamily = "shell" | "ap" | "heat" | "lob" | "rocket" | "bomb";

export interface BurstSource {
  caliber?: number;
  damage?: number;
  shell?: string;
  mortar?: boolean;
  bomb?: boolean;
  rocket?: boolean;
}

export interface BurstSpec {
  family: BurstFamily;
  /** Linear size. A Tiger's 75mm HE in the dirt is 1. */
  power: number;
}

/** Firepower reference: a Tiger's 75mm HE. */
const REF_CALIBER = 75;
const REF_DAMAGE = 90;

/**
 * Linear burst size from the round's firepower. Caliber carries the charge;
 * center damage separates rounds of one caliber (a StuG's HE from a Tiger's,
 * a field gun's 105 from the Apocalypse's). A round sent without its damage
 * is sized by caliber alone.
 */
export function burstPower(src: BurstSource): number {
  const cal = Math.max(20, src.caliber ?? REF_CALIBER);
  const dmg = src.damage != null && src.damage > 0 ? src.damage : REF_DAMAGE;
  const p = (cal / REF_CALIBER) ** 0.85 * (dmg / REF_DAMAGE) ** 0.3;
  return Math.min(3.2, Math.max(0.45, p));
}

export function burstFamily(src: BurstSource): BurstFamily {
  if (src.rocket) return "rocket";
  // A field gun's shell rides the mortar arc with the bomb flag; only a plane's bomb is this heavy.
  if (src.bomb && (src.caliber ?? 0) >= 200) return "bomb";
  if (src.mortar) return "lob";
  if (src.shell === "ap") return "ap";
  if (src.shell === "heat") return "heat";
  return "shell";
}

export function burstSpec(src: BurstSource): BurstSpec {
  return { family: burstFamily(src), power: burstPower(src) };
}

/** Bigger bursts play slower: time stretches with the cube root of the size. */
function timeScale(power: number): number {
  return Math.cbrt(power);
}

const LIFE_MS: Record<BurstFamily, number> = {
  ap: 1500,
  heat: 2000,
  shell: 2600,
  lob: 2700,
  rocket: 2600,
  bomb: 3400,
};

/** How long the burst stays up, ms, smoke included. */
export function burstLifeMs(spec: BurstSpec): number {
  return Math.round(LIFE_MS[spec.family] * timeScale(spec.power));
}

interface Shape {
  /** Fire weight. 0 = solid shot, no charge. */
  fire: number;
  /** Fountain height multiplier. */
  rise: number;
  /** 0 = straight up, 1 = thrown along the incoming shot. */
  down: number;
  /** Fan half-width of the earth jets, radians. */
  fan: number;
  /** Jets in the fountain at power 1. */
  jets: number;
  /** Clods at power 1. */
  clods: number;
  /** Hanging cloud weight. */
  smoke: number;
  /** 0 = brown dust, 1 = black HE smoke. */
  soot: number;
  /** Ground dust ring weight. */
  surge: number;
}

const SHAPES: Record<BurstFamily, Shape> = {
  ap: { fire: 0, rise: 0.55, down: 0.8, fan: 0.55, jets: 6, clods: 12, smoke: 0.45, soot: 0, surge: 0.5 },
  heat: { fire: 0.7, rise: 0.75, down: 0.45, fan: 0.75, jets: 8, clods: 14, smoke: 0.7, soot: 0.65, surge: 0.7 },
  shell: { fire: 1, rise: 1, down: 0.35, fan: 0.95, jets: 11, clods: 20, smoke: 1, soot: 0.75, surge: 1 },
  lob: { fire: 0.85, rise: 1.3, down: 0, fan: 0.5, jets: 12, clods: 22, smoke: 1, soot: 0.6, surge: 1.1 },
  rocket: { fire: 1.15, rise: 1.05, down: 0.15, fan: 0.75, jets: 10, clods: 18, smoke: 1.15, soot: 0.9, surge: 1 },
  bomb: { fire: 1.2, rise: 1.25, down: 0, fan: 0.6, jets: 16, clods: 30, smoke: 1.2, soot: 0.85, surge: 1.3 },
};

/** Screen drift of hanging smoke, px per second at zoom 1. One wind for the whole field. */
export const SMOKE_WIND = { x: 7, y: -2.5 };

// --------------------------------------------------------------------------- puff textures

type Tint = "smoke" | "dust" | "dirt" | "fire" | "spray" | "murk";
const PUFF_SIZE = 64;
const PUFF_VARIANTS = 6;
/** Shadow and lit color of each tint. Fire is drawn additively. */
const TINTS: Record<Tint, [number[], number[]]> = {
  smoke: [
    [26, 23, 20],
    [118, 106, 92],
  ],
  dust: [
    [84, 68, 52],
    [176, 156, 128],
  ],
  dirt: [
    [34, 26, 20],
    [102, 80, 60],
  ],
  fire: [
    [160, 38, 4],
    [255, 196, 92],
  ],
  /** Thrown water: white spray, blue-grey in its own shadow. */
  spray: [
    [112, 134, 140],
    [246, 250, 250],
  ],
  /** Water dragged up with silt from the bottom of the column. */
  murk: [
    [48, 60, 58],
    [146, 160, 150],
  ],
};

let puffs: Record<Tint, HTMLCanvasElement[]> | null = null;

function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, s: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s);
  const b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s);
  const d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, s: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(x * f, y * f, s + o * 31);
    amp *= 0.5;
    f *= 2;
  }
  return sum / 0.9375;
}

/**
 * Grayscale lit puff: a lumpy ball, lit from the upper left, edge broken by
 * noise. Returns luminance and alpha, 0–1, row-major.
 */
export function puffField(size: number, seed: number): { lum: Float32Array; alpha: Float32Array } {
  const lum = new Float32Array(size * size);
  const alpha = new Float32Array(size * size);
  const half = size / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px + 0.5 - half) / half;
      const dy = (py + 0.5 - half) / half;
      const n = fbm(px / 9, py / 9, seed);
      const lumps = fbm(px / 18 + 7, py / 18 + 3, seed + 5);
      const d = Math.hypot(dx, dy) + (n - 0.5) * 0.55 + (lumps - 0.5) * 0.3;
      const a = Math.max(0, Math.min(1, (0.95 - d) / 0.4));
      // Sphere normal from the ball, roughened by the noise.
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, dx * dx + dy * dy)));
      const lit = Math.max(0, -0.55 * dx - 0.62 * dy + 0.56 * nz);
      const l = 0.25 + 0.6 * lit + (n - 0.5) * 0.55;
      const i = py * size + px;
      lum[i] = Math.max(0, Math.min(1, l));
      alpha[i] = a * a * (3 - 2 * a);
    }
  }
  return { lum, alpha };
}

function bakePuffs(): Record<Tint, HTMLCanvasElement[]> | null {
  if (typeof document === "undefined") return null;
  const out = { smoke: [], dust: [], dirt: [], fire: [], spray: [], murk: [] } as Record<Tint, HTMLCanvasElement[]>;
  for (let v = 0; v < PUFF_VARIANTS; v++) {
    const field = puffField(PUFF_SIZE, 0x51ed + v * 977);
    for (const tint of Object.keys(TINTS) as Tint[]) {
      const [lo, hi] = TINTS[tint];
      const cv = document.createElement("canvas");
      cv.width = PUFF_SIZE;
      cv.height = PUFF_SIZE;
      const c = cv.getContext("2d");
      if (!c) return null;
      const img = c.createImageData(PUFF_SIZE, PUFF_SIZE);
      for (let i = 0; i < field.lum.length; i++) {
        // Fire is hottest in the middle, not on the lit side.
        const l = tint === "fire" ? Math.min(1, field.alpha[i]! ** 2 * 0.7 + field.lum[i]! * 0.4) : field.lum[i]!;
        img.data[i * 4] = lo[0]! + (hi[0]! - lo[0]!) * l;
        img.data[i * 4 + 1] = lo[1]! + (hi[1]! - lo[1]!) * l;
        img.data[i * 4 + 2] = lo[2]! + (hi[2]! - lo[2]!) * l;
        img.data[i * 4 + 3] = field.alpha[i]! * 255;
      }
      c.putImageData(img, 0, 0);
      out[tint].push(cv);
    }
  }
  return out;
}

function puff(
  ctx: CanvasRenderingContext2D,
  tint: Tint,
  variant: number,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha: number,
): void {
  if (alpha <= 0.01 || rx < 0.3 || ry < 0.3) return;
  puffs ??= bakePuffs();
  const tex = puffs?.[tint][((variant % PUFF_VARIANTS) + PUFF_VARIANTS) % PUFF_VARIANTS];
  if (!tex) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(tex, x - rx, y - ry, rx * 2, ry * 2);
}

// --------------------------------------------------------------------------- burst

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOut(u: number): number {
  const c = clamp01(u);
  return 1 - (1 - c) * (1 - c);
}

/** 0 → 1 over [a, b]. */
function ramp(v: number, a: number, b: number): number {
  return clamp01((v - a) / (b - a));
}

function radialGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rgb: string,
  alpha: number,
): void {
  if (alpha <= 0.01 || rx < 0.5) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.45, `rgba(${rgb},${alpha * 0.45})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw one ground burst. `ageMs` runs from the strike to `burstLifeMs(spec)`.
 * `dirX, dirY` is the incoming shot on screen; a lobbed round ignores it.
 * Every random draw is fixed per seed, so the burst does not jump between frames.
 */
export function drawExplosion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ageMs: number,
  seed: number,
  spec: BurstSpec,
  dirX = 0,
  dirY = -1,
): void {
  const life = burstLifeMs(spec);
  if (ageMs < 0 || ageMs >= life) return;
  const sh = SHAPES[spec.family];
  const s = spec.power;
  const k = timeScale(s);
  const ms = ageMs / k;
  const dl = Math.hypot(dirX, dirY) || 1;
  // Earth is thrown on along the shot's ground track.
  const ax = sh.down > 0 ? dirX / dl : 0;
  const ay = sh.down > 0 ? dirY / dl : 0;
  const lifeU = ageMs / life;
  const tailFade = 1 - ramp(lifeU, 0.55, 1);

  ctx.save();

  // Ground glow: the flash lights the dirt around the strike.
  if (sh.fire > 0 && ms < 260) {
    const u = ms / 260;
    ctx.globalCompositeOperation = "lighter";
    radialGlow(ctx, x, y, 34 * s, 15 * s, "255,150,60", 0.5 * sh.fire * (1 - u) ** 2);
    ctx.globalCompositeOperation = "source-over";
  }

  // Dust ring rolling out along the ground.
  {
    const rnd = rng(seed ^ 0x1b873593);
    const u = ms / 1300;
    if (u < 1) {
      const n = 9 + Math.round(3 * s);
      const reach = (10 + 26 * easeOut(u * 1.4)) * s * sh.surge;
      const a = 0.55 * sh.surge * Math.sin(Math.min(1, u * 3) * Math.PI * 0.5) * (1 - u) ** 1.3;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rnd() * 0.5;
        const bias = 1 + sh.down * 0.6 * (Math.cos(ang) * ax + Math.sin(ang) * ay);
        const r = reach * (0.75 + rnd() * 0.4) * bias;
        const pr = (6 + rnd() * 5) * s * (0.6 + u);
        puff(ctx, "dust", i, x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.5 - pr * 0.25, pr * 1.3, pr * 0.62, a);
      }
    }
  }

  // Earth fountain: jets of soil thrown up, each a curtain of dirt puffs.
  const jets = Math.round(sh.jets * (0.7 + 0.3 * s));
  const jetMs = 700;
  let rnd = rng(seed ^ 0x6a09e667);
  for (let j = 0; j < jets; j++) {
    const lean = (rnd() - 0.5) * 2 * sh.fan;
    const delay = rnd() * 45;
    const reachH = (38 + rnd() * 44) * s * sh.rise * (1 - Math.abs(lean) * 0.3);
    const var0 = (rnd() * 6) | 0;
    const thick = 0.7 + rnd() * 0.6;
    const u = (ms - delay) / jetMs;
    if (u <= 0) continue;
    const fade = 1 - ramp(u, 0.5, 1.6);
    if (fade <= 0) continue;
    const head = easeOut(Math.min(1, u * 1.15)) * reachH;
    // Lean sideways on screen; a shell's fan tips along the incoming shot.
    const sideX = Math.sin(lean) + ax * sh.down * 0.9;
    const sideY = ay * sh.down * 0.45;
    // Dirt falls back as it thins: the curtain sags after the head tops out.
    const sag = Math.max(0, u - 0.75) * reachH * 0.4;
    for (let q = 0; q < 7; q++) {
      const f = 1 - q * 0.14;
      const h = head * f;
      const px = x + sideX * h * (0.5 + 0.15 * u);
      const py = y - h + sideY * h + sag * f;
      // Wide at the head where the soil spreads, a thin stalk at the root.
      const r = (2 + 8 * f * f) * s * thick * (0.75 + 0.5 * Math.min(1, u));
      const a = fade * (0.95 - q * 0.06);
      puff(ctx, "dirt", var0 + q, px, py, r * 0.85, r, a);
      // The soil dries out pale in the air as it spreads.
      puff(ctx, "dust", var0 + q + 1, px + r * 0.2, py - r * 0.15, r * 0.95, r, a * ramp(u, 0.3, 1.2) * 0.65);
    }
  }

  // Fire at the root of the fountain: a ragged orange ball that darkens and
  // sinks into the dirt, with a white-hot core for the first instant.
  if (sh.fire > 0) {
    const rnd = rng(seed ^ 0x85ebca6b);
    const fireMs = 340 * (0.8 + 0.3 * sh.fire);
    const tongues = 4 + Math.round(3 * s);
    for (let i = 0; i < tongues; i++) {
      const ang = rnd() * Math.PI * 2;
      const off = rnd() * 6 * s;
      const born = rnd() * 35;
      const up = (4 + rnd() * 10) * s * sh.rise;
      const shrink = 0.7 + rnd() * 0.5;
      const u = (ms - born) / fireMs;
      if (u <= 0 || u >= 1) continue;
      const g = easeOut(u * 1.7);
      const r = (5 + 8 * g) * s * (0.8 + 0.3 * sh.fire) * shrink;
      const px = x + Math.cos(ang) * off * (0.6 + g);
      const py = y - 3 * s - up * g + Math.sin(ang) * off * 0.4;
      puff(ctx, "fire", i, px, py, r, r * 0.9, Math.min(1, sh.fire) * 0.9 * (1 - u) ** 1.1);
      // Burning out: the tongue goes to black smoke from the edge in.
      puff(ctx, "smoke", i + 2, px, py - r * 0.1, r * 1.05, r * 0.95, 0.75 * ramp(u, 0.35, 1) * (1 - u * 0.5));
    }
    ctx.globalCompositeOperation = "lighter";
    if (ms < 140) {
      const u = ms / 140;
      radialGlow(ctx, x, y - 4 * s, 7 * s, 5 * s, "255,240,200", (1 - u) ** 1.5 * 0.85 * Math.min(1, sh.fire));
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // Hanging cloud: dark HE smoke and dust that climb, spread, and drift off.
  const cloud = Math.round((8 + 5 * s) * sh.smoke);
  const windT = ageMs / 1000;
  rnd = rng(seed ^ 0xc2b2ae35);
  for (let i = 0; i < cloud; i++) {
    const born = 60 + rnd() * 380;
    const ang = rnd() * Math.PI * 2;
    const spread = (3 + rnd() * 10) * s;
    const climb = (34 + rnd() * 34) * s * sh.rise * (0.6 + 0.5 * sh.smoke);
    const size = (7 + rnd() * 6) * s;
    const dark = rnd() < sh.soot;
    const v = (rnd() * 6) | 0;
    const u = (ms - born) / (life / k - born);
    if (u <= 0) continue;
    const g = easeOut(Math.min(1, u * 1.8));
    const tier = 0.3 + 0.7 * ((i * 7) % cloud) / cloud;
    // Higher puffs are bigger and spread wider: a mushrooming head, not a stack.
    const r = size * (0.6 + 0.6 * tier) * (0.7 + 1.5 * Math.sqrt(clamp01(u)));
    const wx = SMOKE_WIND.x * windT * (0.4 + u);
    const wy = SMOKE_WIND.y * windT * (0.4 + u);
    const wide = spread * (0.6 + g) * (0.6 + tier);
    const px = x + Math.cos(ang) * wide + ax * sh.down * 10 * s * g + wx;
    const py = y - climb * g * tier + Math.sin(ang) * wide * 0.4 + wy;
    const a = ramp(u, 0, 0.08) * tailFade * (0.7 + 0.2 * sh.smoke);
    puff(ctx, dark ? "smoke" : "dust", v + i, px, py, r * 1.08, r * 0.92, a * (dark ? 0.78 : 0.68));
  }

  // Clods on ballistic arcs, with a shadow under each on the dirt.
  const clods = Math.round(sh.clods * (0.6 + 0.4 * s));
  const clodS = Math.sqrt(s);
  rnd = rng(seed ^ 0x27d4eb2f);
  for (let i = 0; i < clods; i++) {
    const ga = rnd() * Math.PI * 2;
    const delay = rnd() * 40;
    const flight = 480 + rnd() * 520;
    const outR = (10 + rnd() * 34) * s;
    const kick = (22 + rnd() * 50) * s * sh.rise;
    const rw = (1.1 + rnd() * 1.9) * clodS;
    const spin = rnd() * Math.PI;
    const shade = rnd();
    const u = (ms - delay) / flight;
    if (u <= 0) continue;
    const linger = 1 - ramp(u, 1, 1.9);
    if (linger <= 0) continue;
    const fu = Math.min(1, u);
    const gx = Math.cos(ga) * (1 - sh.down) + ax * sh.down;
    const gy = Math.sin(ga) * 0.5 * (1 - sh.down) + ay * sh.down * 0.5;
    const bx = x + gx * outR * fu;
    const by = y + gy * outR * fu;
    const lift = Math.sin(fu * Math.PI) * kick;
    if (u < 1) {
      ctx.globalAlpha = 0.25 * (1 - fu * 0.4);
      ctx.fillStyle = "#1c150f";
      ctx.beginPath();
      ctx.ellipse(bx, by, rw * 1.1, rw * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.95 * linger;
    ctx.fillStyle = shade > 0.6 ? "#2e241b" : shade > 0.25 ? "#4a3a2b" : "#6e5843";
    const cx = bx;
    const cy = by - lift;
    const rot = spin + u * 7;
    ctx.beginPath();
    for (let p = 0; p < 5; p++) {
      const a = rot + (p / 5) * Math.PI * 2;
      const rr = rw * (0.7 + ((p * 37 + i * 11) % 7) / 14);
      if (p === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75);
      else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Embers: a few hot sparks out of the fire.
  if (sh.fire > 0) {
    const rnd = rng(seed ^ 0x165667b1);
    const embers = Math.round(2 + 2 * s * sh.fire);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (let i = 0; i < embers; i++) {
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
      const speed = (40 + rnd() * 50) * s;
      const flight = 380 + rnd() * 380;
      const u = ms / flight;
      if (u >= 1) continue;
      const ex = x + Math.cos(ang) * speed * u;
      const ey = y - 3 * s + Math.sin(ang) * speed * u * 0.9 + 30 * s * u * u;
      const tail = 1.5 + 1.5 * (1 - u);
      ctx.globalAlpha = (1 - u) * 0.75;
      ctx.strokeStyle = u < 0.4 ? "#fff1c4" : "#ff9a3c";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang) * tail, ey - Math.sin(ang) * tail * 0.9);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Thin smoke still rising off a fresh crater, ms. */
export const SMOULDER_MS = 7000;

/**
 * Wisps off a fresh crater. `ageMs` from the strike; `radius` is the crater's
 * screen half-width. Fades out by SMOULDER_MS.
 */
export function drawSmoulder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ageMs: number,
  seed: number,
  radius: number,
): void {
  if (ageMs <= 0 || ageMs >= SMOULDER_MS) return;
  const life = ageMs / SMOULDER_MS;
  const strength = ramp(life, 0, 0.12) * (1 - life) ** 1.5;
  if (strength <= 0.02) return;
  const rnd = rng(seed ^ 0x3c6ef372);
  const n = Math.max(2, Math.min(6, Math.round(radius / 7)));
  ctx.save();
  for (let i = 0; i < n; i++) {
    const ox = (rnd() - 0.5) * radius * 1.1;
    const oy = (rnd() - 0.5) * radius * 0.45;
    const period = 1700 + rnd() * 1300;
    const phase = rnd();
    for (let w = 0; w < 3; w++) {
      const u = ((ageMs / period + phase + w / 3) % 1 + 1) % 1;
      const r = (2 + u * 7) * Math.max(0.7, Math.sqrt(radius / 14));
      const px = x + ox + SMOKE_WIND.x * u * 1.6 + Math.sin(u * 5 + i) * 1.5;
      const py = y + oy - u * (14 + radius * 0.6);
      puff(ctx, "smoke", i + w, px, py, r, r * 0.9, strength * 0.4 * Math.sin(u * Math.PI));
    }
  }
  ctx.restore();
}

// --------------------------------------------------------------------------- death blast

export interface DeathBlastSpec {
  /** Linear size. A medium tank's hull going up is 1. */
  power: number;
  /** A structure coming down: a wider fire, a rubble cloud, and late secondary pops. */
  building: boolean;
}

/** Hull radius of a medium tank, world px. */
const REF_HULL_RADIUS = 12;

/**
 * Size of the blast when something is destroyed: a structure by its footprint
 * in tiles, a hull by its radius, and anything not found by the caliber that
 * set it off.
 */
export function deathBlastSpec(src: { tiles?: number; radius?: number; caliber?: number }): DeathBlastSpec {
  if (src.tiles != null && src.tiles > 0) {
    return { power: Math.min(2.6, Math.max(1.2, 0.95 + 0.3 * Math.sqrt(src.tiles))), building: true };
  }
  if (src.radius != null && src.radius > 0) {
    return { power: Math.min(1.6, Math.max(0.55, src.radius / REF_HULL_RADIUS)), building: false };
  }
  return { power: Math.min(1.4, Math.max(0.4, ((src.caliber ?? 60) / 60) ** 0.7)), building: false };
}

/** How long the blast stays up, ms, smoke column included. */
export function deathBlastLifeMs(spec: DeathBlastSpec): number {
  return Math.round((spec.building ? 5600 : 4600) * timeScale(spec.power));
}

/**
 * A ball of fire that boils up from `cy`, burns out from the edge in, and
 * leaves its own black smoke rising. `ms` is time since it went off, already
 * slowed by the blast's size.
 */
function fireball(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  ms: number,
  windT: number,
  seed: number,
  s: number,
  wide: number,
  tongues: number,
): void {
  const fireMs = 1100;
  const rnd = rng(seed);
  for (let i = 0; i < tongues; i++) {
    const ang = rnd() * Math.PI * 2;
    const off = (4 + rnd() * 12) * s;
    const born = rnd() * 90;
    const up = (12 + rnd() * 30) * s;
    const shrink = 0.65 + rnd() * 0.55;
    const v = (rnd() * 6) | 0;
    const u = (ms - born) / fireMs;
    if (u <= 0 || u >= 1.8) continue;
    const g = easeOut(Math.min(1, u * 2.4));
    // Hot gas is buoyant: a quick shove out, then a steady climb that keeps going as smoke.
    const lift = up * (0.3 * g + 0.7 * Math.min(1, u) ** 1.2) + Math.max(0, u - 1) * up * 0.6;
    const r = (6 + 15 * g) * s * shrink * (1 + 0.35 * Math.max(0, u - 0.5));
    const px = x + Math.cos(ang) * off * g * wide + SMOKE_WIND.x * windT * 0.4 * clamp01(u - 0.4);
    const py = cy - lift + Math.sin(ang) * off * g * 0.45;
    const heat = 1 - ramp(u, 0.25, 0.85);
    if (heat > 0) puff(ctx, "fire", v + i, px, py, r, r * 0.92, heat ** 0.8);
    // Burning out: the tongue goes to black smoke from the edge in.
    const soot = ramp(u, 0.3, 0.8) * (1 - ramp(u, 1.1, 1.8));
    puff(ctx, "smoke", v + i + 3, px, py - r * 0.08, r * 1.06, r * 0.96, 0.85 * soot);
  }
}

/**
 * A hull or a structure going up. `x, y` is the ground under the blast;
 * `ageMs` runs from the kill to `deathBlastLifeMs(spec)`. A white flash and a
 * shock ring along the dirt, a fireball boiling up out of the hull and burning
 * out into black smoke, burning fragments and sparks thrown clear, and a tall
 * column of smoke that leans off with the wind. Fixed per seed.
 */
export function drawDeathBlast(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ageMs: number,
  seed: number,
  spec: DeathBlastSpec,
): void {
  const life = deathBlastLifeMs(spec);
  if (ageMs < 0 || ageMs >= life) return;
  const s = spec.power;
  const k = timeScale(s);
  const ms = ageMs / k;
  const windT = ageMs / 1000;
  const lifeU = ageMs / life;
  const tailFade = 1 - ramp(lifeU, 0.5, 1);
  // The charge sits inside the hull, or low in the structure.
  const core = y - (spec.building ? 10 : 7) * s;
  const wide = spec.building ? 1.35 : 1;

  ctx.save();

  // Flash: the dirt and the hull lit white, then orange.
  if (ms < 600) {
    const u = ms / 600;
    ctx.globalCompositeOperation = "lighter";
    radialGlow(ctx, x, y, 70 * s * wide, 30 * s * wide, "255,140,50", 0.65 * (1 - u) ** 2);
    if (ms < 120) radialGlow(ctx, x, core, 26 * s * wide, 20 * s, "255,246,220", (1 - ms / 120) ** 1.4);
    ctx.globalCompositeOperation = "source-over";
  }

  // Shock front racing out along the ground, and the dust it raises behind it.
  if (ms < 260) {
    const u = ms / 260;
    const r = (14 + 70 * easeOut(u)) * s * wide;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.12 * (1 - u) ** 2;
    ctx.strokeStyle = "#ffe2b0";
    ctx.lineWidth = Math.max(2, 5 * s * (1 - u));
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }
  {
    const rnd = rng(seed ^ 0x2545f491);
    const u = ms / 1800;
    if (u < 1) {
      const n = 12 + Math.round(5 * s);
      const reach = (14 + 46 * easeOut(u * 1.3)) * s * wide;
      const a = 0.6 * Math.sin(Math.min(1, u * 4) * Math.PI * 0.5) * (1 - u) ** 1.2;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rnd() * 0.4;
        const r = reach * (0.8 + rnd() * 0.35);
        const pr = (7 + rnd() * 6) * s * (0.6 + u);
        puff(ctx, "dust", i, x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.5 - pr * 0.25, pr * 1.4, pr * 0.6, a);
      }
    }
  }

  // A structure comes down in a rolling cloud of brick and plaster dust.
  if (spec.building) {
    const rnd = rng(seed ^ 0x9e3779b9);
    const n = 10 + Math.round(4 * s);
    for (let i = 0; i < n; i++) {
      const born = 80 + rnd() * 500;
      const ang = rnd() * Math.PI * 2;
      const reach = (12 + rnd() * 34) * s;
      const size = (10 + rnd() * 8) * s;
      const climb = (6 + rnd() * 16) * s;
      const u = (ms - born) / (life / k - born);
      if (u <= 0) continue;
      const g = easeOut(Math.min(1, u * 2.2));
      const r = size * (0.7 + 0.8 * Math.sqrt(clamp01(u)));
      const px = x + Math.cos(ang) * reach * g + SMOKE_WIND.x * windT * 0.5 * u;
      const py = y + Math.sin(ang) * reach * g * 0.5 - climb * g - r * 0.3 + SMOKE_WIND.y * windT * 0.3 * u;
      const a = ramp(u, 0, 0.05) * tailFade * 0.7;
      puff(ctx, "dust", i + 1, px, py, r * 1.3, r * 0.85, a);
    }
  }

  // Smoke column: black smoke off the burning fuel and ammunition, climbing and
  // mushrooming out, then leaning off downwind as it thins.
  {
    const rnd = rng(seed ^ 0x7f4a7c15);
    const n = Math.round((12 + 8 * s) * (spec.building ? 1.2 : 1));
    for (let i = 0; i < n; i++) {
      const born = 220 + rnd() * 900;
      const ang = rnd() * Math.PI * 2;
      const spread = (3 + rnd() * 9) * s * wide;
      const climb = (70 + rnd() * 60) * s;
      const size = (9 + rnd() * 7) * s * wide;
      const black = rnd() < 0.8;
      const v = (rnd() * 6) | 0;
      const u = (ms - born) / (life / k - born);
      if (u <= 0) continue;
      const g = easeOut(Math.min(1, u * 1.5));
      const tier = 0.25 + (0.75 * ((i * 7) % n)) / n;
      const r = size * (0.55 + 0.6 * tier) * (0.6 + 1.6 * Math.sqrt(clamp01(u)));
      const wx = SMOKE_WIND.x * windT * (0.3 + u * tier * 1.4);
      const wy = SMOKE_WIND.y * windT * (0.3 + u * tier);
      const px = x + Math.cos(ang) * spread * (0.6 + g) * (0.5 + tier) + wx;
      const py = core - climb * g * tier + Math.sin(ang) * spread * 0.4 + wy;
      const a = ramp(u, 0, 0.06) * tailFade * 0.82;
      puff(ctx, black ? "smoke" : "dust", v + i, px, py, r * 1.08, r * 0.92, a * (black ? 0.85 : 0.6));
    }
  }

  // The fireball, and the hot core lighting it from inside for the first instant.
  fireball(ctx, x, core, ms, windT, seed ^ 0x85ebca6b, s, wide, Math.round((10 + 6 * s) * (spec.building ? 1.3 : 1)));
  if (ms < 380) {
    const u = ms / 380;
    ctx.globalCompositeOperation = "lighter";
    radialGlow(ctx, x, core - 6 * s, 30 * s * wide, 22 * s, "255,190,90", 0.55 * (1 - u) ** 1.5);
    ctx.globalCompositeOperation = "source-over";
  }

  // Secondary pops: fuel and ammunition going up a beat after the first blast.
  {
    const rnd = rng(seed ^ 0xa54ff53a);
    const pops = spec.building ? 2 + (s > 1.8 ? 1 : 0) : s >= 0.9 ? 1 : 0;
    for (let p = 0; p < pops; p++) {
      const born = 350 + rnd() * 750;
      const ox = (rnd() - 0.5) * 30 * s * wide;
      const oy = (rnd() - 0.5) * 10 * s;
      const big = 0.4 + rnd() * 0.2;
      const pm = ms - born;
      if (pm <= 0) continue;
      if (pm < 160) {
        ctx.globalCompositeOperation = "lighter";
        radialGlow(ctx, x + ox, core + oy, 44 * s * big, 24 * s * big, "255,200,120", 0.6 * (1 - pm / 160) ** 1.5);
        ctx.globalCompositeOperation = "source-over";
      }
      fireball(ctx, x + ox, core + oy, pm, windT, seed ^ (0x3f84d5b5 + p * 7919), s * big, 1, 6);
    }
  }

  // A low fire left burning in the wreckage while the column climbs.
  {
    const rnd = rng(seed ^ 0x510e527f);
    const burn = ramp(ms, 500, 900) * (1 - ramp(lifeU, 0.35, 0.7));
    if (burn > 0.02) {
      const n = spec.building ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const ox = (rnd() - 0.5) * 20 * s * wide;
        const oy = (rnd() - 0.5) * 6 * s;
        const rate = 7 + rnd() * 6;
        const phase = rnd() * 6;
        const flick = 0.7 + 0.3 * Math.sin(ageMs * 0.001 * rate + phase) * Math.sin(ageMs * 0.0017 * rate + phase * 2);
        const r = (2.5 + 2 * flick) * s;
        puff(ctx, "fire", i, x + ox, core + oy + 2 * s - r * 0.7, r * 0.55, r * 1.1, 0.75 * burn * flick);
      }
    }
  }

  // Fragments: hull plates, track links, or masonry thrown out on arcs. Some
  // are still burning and trail smoke; each throws a shadow on the dirt.
  {
    const rnd = rng(seed ^ 0x1f83d9ab);
    const n = Math.round(spec.building ? 14 + 10 * s : 10 + 8 * s);
    const fs = Math.sqrt(s);
    const colors = spec.building ? ["#6e6a60", "#8a8478", "#4d473f"] : ["#2b2a27", "#3f3c37", "#55463a"];
    for (let i = 0; i < n; i++) {
      const ga = rnd() * Math.PI * 2;
      const delay = rnd() * 50;
      const flight = 600 + rnd() * 700;
      const outR = (20 + rnd() * 60) * s * wide;
      const kick = (40 + rnd() * 70) * s;
      const rw = (1.2 + rnd() * 1.8) * fs * (spec.building ? 1.2 : 1);
      const spin = rnd() * Math.PI;
      const shade = (rnd() * 3) | 0;
      const hot = rnd() < 0.35;
      const smoking = rnd() < 0.3;
      const u = (ms - delay) / flight;
      if (u <= 0) continue;
      const linger = 1 - ramp(u, 1, 2.4);
      if (linger <= 0) continue;
      const fu = Math.min(1, u);
      const gx = Math.cos(ga);
      const gy = Math.sin(ga) * 0.5;
      // Out of the hull and down to the dirt, on an arc.
      const at = (w: number) => ({
        x: x + gx * outR * w,
        y: core + (y - core) * w + gy * outR * w - 4 * w * (1 - w) * kick,
      });
      const pos = at(fu);
      if (u < 1) {
        ctx.globalAlpha = 0.25 * (1 - fu * 0.4);
        ctx.fillStyle = "#1c150f";
        ctx.beginPath();
        ctx.ellipse(x + gx * outR * fu, y + gy * outR * fu, rw * 1.2, rw * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        if (smoking) {
          for (let j = 1; j <= 4; j++) {
            const w = fu - j * 0.07;
            if (w <= 0) break;
            const tp = at(w);
            const tr = (1.6 + j * 1.3) * fs;
            puff(ctx, "smoke", i + j, tp.x, tp.y, tr, tr * 0.9, 0.45 * (1 - j / 5));
          }
        }
      }
      const rot = spin + fu * 9;
      ctx.globalAlpha = 0.95 * linger;
      ctx.fillStyle = colors[shade]!;
      ctx.beginPath();
      for (let p = 0; p < 4; p++) {
        const a = rot + (p / 4) * Math.PI * 2;
        const rr = rw * (p % 2 === 0 ? 1.25 : 0.6);
        if (p === 0) ctx.moveTo(pos.x + Math.cos(a) * rr, pos.y + Math.sin(a) * rr * 0.75);
        else ctx.lineTo(pos.x + Math.cos(a) * rr, pos.y + Math.sin(a) * rr * 0.75);
      }
      ctx.closePath();
      ctx.fill();
      if (hot) {
        // Glowing metal: bright in flight, cooling to a dull ember where it lands.
        const glow = u < 1 ? 1 - fu * 0.5 : 0.5 * (1 - ramp(u, 1, 2.2));
        if (glow > 0.02) {
          ctx.globalCompositeOperation = "lighter";
          radialGlow(ctx, pos.x, pos.y, rw * 1.6, rw * 1.4, "255,150,60", 0.5 * glow);
          ctx.globalAlpha = glow;
          ctx.fillStyle = "#ffcf7a";
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, rw * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        }
      }
    }
  }

  // Sparks: white-hot streaks that arc out and fall.
  {
    const rnd = rng(seed ^ 0x9b05688c);
    const n = Math.round(10 + 12 * s);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 3;
      const speed = (60 + rnd() * 90) * s;
      const flight = 450 + rnd() * 500;
      const u = ms / flight;
      if (u >= 1) continue;
      const ex = x + Math.cos(ang) * speed * u;
      const ey = core + Math.sin(ang) * speed * u * 0.85 + 50 * s * u * u;
      const vx = Math.cos(ang) * speed;
      const vy = Math.sin(ang) * speed * 0.85 + 100 * s * u;
      const vl = Math.hypot(vx, vy) || 1;
      const tail = (3 + 4 * (1 - u)) * Math.sqrt(s);
      ctx.globalAlpha = (1 - u) * 0.85;
      ctx.strokeStyle = u < 0.35 ? "#fff4d0" : "#ff9a3c";
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - (vx / vl) * tail, ey - (vy / vl) * tail);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// --------------------------------------------------------------------------- water burst

const WATER_LIFE_MS: Record<BurstFamily, number> = {
  ap: 1700,
  heat: 2000,
  shell: 2300,
  lob: 2600,
  rocket: 2300,
  bomb: 3200,
};

/** How long a heavy round's water burst stays up, ms, mist included. */
export function waterBurstLifeMs(spec: BurstSpec): number {
  return Math.round(WATER_LIFE_MS[spec.family] * timeScale(spec.power));
}

interface WaterShape {
  /** Column height multiplier. */
  rise: number;
  /** Fan half-width of the water jets, radians. */
  fan: number;
  /** Jets in the column at power 1. */
  jets: number;
  /** 0 = straight up, 1 = thrown along the incoming shot. */
  down: number;
  /** Glow of the charge through the water. 0 = solid shot. */
  flash: number;
}

const WATER_SHAPES: Record<BurstFamily, WaterShape> = {
  ap: { rise: 0.75, fan: 0.3, jets: 6, down: 0.6, flash: 0 },
  heat: { rise: 0.85, fan: 0.45, jets: 8, down: 0.4, flash: 0.4 },
  shell: { rise: 1, fan: 0.5, jets: 10, down: 0.3, flash: 0.5 },
  lob: { rise: 1.35, fan: 0.32, jets: 12, down: 0, flash: 0.35 },
  rocket: { rise: 1.1, fan: 0.42, jets: 10, down: 0.1, flash: 0.6 },
  bomb: { rise: 1.5, fan: 0.4, jets: 16, down: 0, flash: 0.5 },
};

/**
 * A heavy round bursting in water. `ageMs` runs from the strike to
 * `waterBurstLifeMs(spec)`. The surface darkens in a shock slick with a white
 * rim; a column of spray jets climbs, tops out, and collapses; the fallback
 * rolls out as a low mist; droplets rain back and ring the surface; churned
 * foam lingers. Sized and shaped like the ground burst of the same round.
 */
export function drawWaterBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ageMs: number,
  seed: number,
  spec: BurstSpec,
  dirX = 0,
  dirY = -1,
): void {
  const life = waterBurstLifeMs(spec);
  if (ageMs < 0 || ageMs >= life) return;
  const sh = WATER_SHAPES[spec.family];
  const s = spec.power;
  const k = timeScale(s);
  const ms = ageMs / k;
  const windT = ageMs / 1000;
  const dl = Math.hypot(dirX, dirY) || 1;
  const ax = sh.down > 0 ? dirX / dl : 0;
  const ay = sh.down > 0 ? dirY / dl : 0;
  const tailFade = 1 - ramp(ageMs / life, 0.45, 1);

  ctx.save();

  // Shock slick: the surface flattens and darkens in a disk with a white rim.
  {
    const u = ms / 900;
    if (u < 1) {
      const r = (8 + 44 * easeOut(u)) * s;
      ctx.globalAlpha = 0.35 * (1 - u) ** 1.4;
      ctx.fillStyle = "#14272c";
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.22 * (1 - u) ** 1.5;
      ctx.strokeStyle = "#e9f6f4";
      ctx.lineWidth = Math.max(1.5, 3.5 * s * (1 - u));
      ctx.stroke();
    }
  }

  // Ripples rolling out across the surface, slower than the shock.
  ctx.strokeStyle = "#cfe7e6";
  ctx.lineWidth = 1;
  for (let w = 0; w < 3; w++) {
    const u = (ms - 250 - w * 260) / 1600;
    if (u <= 0 || u >= 1) continue;
    const r = (18 + 70 * easeOut(u)) * s;
    ctx.globalAlpha = 0.28 * (1 - u) ** 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Foam: churned white water where the column stood.
  {
    const rnd = rng(seed ^ 0x1f83d9ab);
    const n = 6 + Math.round(3 * s);
    const a = ramp(ms, 150, 500) * tailFade * 0.75;
    const grow = 0.7 + 0.5 * easeOut(ms / 1500);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const rr = rnd() * 14 * s * grow;
      const pr = (7 + rnd() * 6) * s * grow;
      const w = 0.6 + 0.4 * rnd();
      puff(ctx, "spray", i, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.5, pr * 1.4, pr * 0.5, a * w);
    }
  }

  // The charge glows dull orange through the water for an instant.
  if (sh.flash > 0 && ms < 160) {
    ctx.globalCompositeOperation = "lighter";
    radialGlow(ctx, x, y - 2 * s, 16 * s, 8 * s, "255,170,90", sh.flash * 0.7 * (1 - ms / 160) ** 2);
    ctx.globalCompositeOperation = "source-over";
  }

  // Column: jets of water, each a curtain of spray that climbs, hangs, and falls back.
  const jets = Math.round(sh.jets * (0.7 + 0.3 * s));
  const jetMs = 1150;
  let rnd = rng(seed ^ 0x5be0cd19);
  for (let j = 0; j < jets; j++) {
    const lean = (rnd() - 0.5) * 2 * sh.fan;
    const delay = rnd() * 50;
    const reachH = (46 + rnd() * 50) * s * sh.rise * (1 - Math.abs(lean) * 0.35);
    const v0 = (rnd() * 6) | 0;
    const thick = 0.65 + rnd() * 0.55;
    const u = (ms - delay) / jetMs;
    if (u <= 0) continue;
    const fade = 1 - ramp(u, 0.55, 1.25);
    if (fade <= 0) continue;
    const up = u < 0.42 ? easeOut(u / 0.42) : 1 - ((Math.min(1, u) - 0.42) / 0.58) ** 2 * 0.85;
    const head = up * reachH;
    const sideX = Math.sin(lean) + ax * sh.down * 0.8;
    const sideY = ay * sh.down * 0.4;
    // The curtain opens out as it falls.
    const open = 0.45 + 0.35 * Math.min(1, u) + 0.25 * Math.max(0, u - 0.42);
    for (let q = 0; q < 11; q++) {
      const f = 1 - q * 0.09;
      const h = head * f;
      const px = x + sideX * h * open;
      const py = y - h + sideY * h;
      const r = (2.4 + 8 * f * f) * s * thick * (0.7 + 0.6 * Math.min(1, u * 1.4));
      const a = fade * (0.8 - q * 0.045);
      // Silt dragged up from the bottom darkens the root of the column at first.
      if (q >= 6 && u < 0.6) puff(ctx, "murk", v0 + q, px, py, r * 0.8, r, a * 0.7 * (1 - u / 0.6));
      puff(ctx, "spray", v0 + q, px, py, r * 0.85, r, a);
    }
  }

  // Base surge: the fallback rolls out across the water as a low white mist.
  {
    rnd = rng(seed ^ 0x6c8e9cf5);
    const u = (ms - 300) / 1900;
    if (u > 0 && u < 1) {
      const n = 10 + Math.round(4 * s);
      const reach = (12 + 40 * easeOut(u)) * s * (0.8 + 0.25 * sh.rise);
      const a = 0.55 * ramp(u, 0, 0.15) * (1 - u) ** 1.4;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rnd() * 0.5;
        const r = reach * (0.7 + rnd() * 0.45);
        const pr = (8 + rnd() * 6) * s * (0.6 + u);
        const px = x + Math.cos(ang) * r + SMOKE_WIND.x * windT * 0.4;
        puff(ctx, "spray", i, px, y + Math.sin(ang) * r * 0.5 - pr * 0.3, pr * 1.4, pr * 0.6, a);
      }
    }
  }

  // Mist left hanging over the spot, drifting off with the wind.
  {
    rnd = rng(seed ^ 0x2f1a6c3d);
    const n = Math.round(5 + 3 * s);
    for (let i = 0; i < n; i++) {
      const born = 300 + rnd() * 400;
      const ang = rnd() * Math.PI * 2;
      const climb = (20 + rnd() * 24) * s * sh.rise;
      const size = (8 + rnd() * 6) * s;
      const u = (ms - born) / (life / k - born);
      if (u <= 0) continue;
      const g = easeOut(Math.min(1, u * 1.6));
      const r = size * (0.7 + 1.1 * Math.sqrt(clamp01(u)));
      const px = x + Math.cos(ang) * 8 * s * g + SMOKE_WIND.x * windT * (0.4 + u);
      const py = y - climb * g + Math.sin(ang) * 4 * s * g + SMOKE_WIND.y * windT * (0.4 + u);
      puff(ctx, "spray", i + 2, px, py, r * 1.1, r * 0.9, 0.35 * ramp(u, 0, 0.1) * tailFade);
    }
  }

  // Droplets: streaks thrown out on arcs that ring the surface where they land.
  {
    rnd = rng(seed ^ 0x27d4eb2f);
    const n = Math.round(18 + 14 * s);
    const ds = Math.sqrt(s);
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const ga = rnd() * Math.PI * 2;
      const delay = rnd() * 60;
      const flight = 500 + rnd() * 600;
      const outR = (8 + rnd() * 38) * s;
      const kick = (30 + rnd() * 60) * s * sh.rise;
      const rw = (0.7 + rnd() * 0.7) * Math.min(1.3, ds);
      const u = (ms - delay) / flight;
      if (u <= 0 || u >= 1.35) continue;
      const gx = Math.cos(ga) * (1 - sh.down * 0.5) + ax * sh.down * 0.5;
      const gy = Math.sin(ga) * 0.5 * (1 - sh.down * 0.5) + ay * sh.down * 0.25;
      if (u >= 1) {
        const rr = (1 + 5 * ((u - 1) / 0.35)) * ds;
        ctx.globalAlpha = 0.4 * (1 - (u - 1) / 0.35);
        ctx.strokeStyle = "#e4f3f2";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(x + gx * outR, y + gy * outR, rr, rr * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const at = (w: number) => ({ x: x + gx * outR * w, y: y + gy * outR * w - 4 * w * (1 - w) * kick });
      const head = at(u);
      const tail = at(Math.max(0, u - 0.02));
      ctx.globalAlpha = 0.75 * (1 - u * 0.4);
      ctx.strokeStyle = i % 3 === 0 ? "#b9dbe2" : "#f7fffd";
      ctx.lineWidth = rw;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}
