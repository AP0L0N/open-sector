/**
 * Flamethrower and burning-ground effects. Client-only; the sim decides who burns.
 *
 * The jet is a stream of burning-fuel particles. Each leaves the nozzle thin and
 * white-hot, arcs and droops under its own weight, and blooms into a rolling
 * orange-red billow where it hits the ground, then rises and cools to smoke.
 *
 * A burning patch is a ring of flame tongues that swell and lick upward, each
 * shedding a flamelet off its tip that rises and dies, over a pool of orange
 * light on the ground, with sparks lifting off and smoke rolling away. When it
 * goes out it leaves a charred scorch that fades slowly.
 */

/** A burning-fuel particle. World ground point, `h` screen pixels above the ground. */
export interface FlameParticle {
  /** Thrown by a Xenomorph plasma jet: drawn green, and it leaves no soot. */
  energy?: boolean;
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  /** ms, performance clock. */
  at: number;
  /** ms from birth until it reaches the ground (jet) or 0 (billow, already down). */
  fall: number;
  /** ms of the whole life. */
  life: number;
  /** Screen radius at the nozzle and at full bloom. */
  r0: number;
  r1: number;
  /** Downward pull, screen px/s². */
  g: number;
  /** Rising pull once it has hit the ground or cooled, px/s². */
  lift: number;
  /** 0–1 extra heat: 1 stays white-yellow longer (the cook-off core). */
  hot: number;
  landed: boolean;
  seed: number;
}

/** Most flame particles kept at once. The oldest go first. */
export const FLAME_PARTICLE_CAP = 1600;
/** Jet particles per second from one nozzle while the trigger is held. */
export const JET_RATE = 280;
/** ms a scorch stays after its fire goes out, fading. */
export const SCORCH_MS = 15_000;
/** Most scorches kept at once; the longest-cold go first. */
export const SCORCH_CAP = 120;
/** Most fire-smoke puffs kept at once. */
export const FIRE_SMOKE_CAP = 400;
/** ms between smoke puffs off one patch burning hot; slower as it dies down. */
export const FIRE_SMOKE_EVERY_MS = 220;
/** Flame tongues shared by every burning patch; a big fire field draws fewer per patch. */
export const FIRE_TONGUE_BUDGET = 360;
/** Fewest and most tongues in one patch. */
export const FIRE_TONGUES_MIN = 4;
export const FIRE_TONGUES_MAX = 18;

export function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Jet particles for one frame. `nozzle` is the lance tip (world ground point +
 * screen height), `land` the ground point the burst is laid on.
 */
export function jetParticles(opts: {
  nozzle: { x: number; y: number; h: number };
  land: { x: number; y: number };
  now: number;
  dtMs: number;
  seed: number;
  rate?: number;
}): FlameParticle[] {
  const { nozzle, land } = opts;
  const rnd = rng(opts.seed);
  const n = Math.floor(((opts.rate ?? JET_RATE) * Math.max(0, opts.dtMs)) / 1000 + rnd());
  const dx = land.x - nozzle.x;
  const dy = land.y - nozzle.y;
  const dist = Math.hypot(dx, dy);
  const out: FlameParticle[] = [];
  for (let i = 0; i < n; i++) {
    // Seconds the fuel is in the air. Longer throws hang a little longer.
    const T = (0.2 + 0.16 * Math.min(1, dist / 110)) * (0.88 + rnd() * 0.24);
    const yaw = (rnd() - 0.5) * 0.12;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const reach = 0.9 + rnd() * 0.22;
    const vx = ((dx * cs - dy * sn) / T) * reach;
    const vy = ((dx * sn + dy * cs) / T) * reach;
    const g = 150 + rnd() * 70;
    // Launch speed up that lands it at T: h0 + vh T - g T²/2 = 0.
    const vh = (0.5 * g * T * T - nozzle.h) / T;
    const burn = 260 + rnd() * 380;
    const back = rnd() * opts.dtMs;
    out.push({
      x: nozzle.x + vx * (back / 1000),
      y: nozzle.y + vy * (back / 1000),
      h: nozzle.h,
      vx,
      vy,
      vh,
      at: opts.now - back,
      fall: T * 1000,
      life: T * 1000 + burn,
      r0: 1.1 + rnd() * 0.6,
      r1: 5 + rnd() * 4,
      g,
      lift: 40 + rnd() * 50,
      hot: 0,
      landed: false,
      seed: (opts.seed + i * 977) >>> 0,
    });
  }
  return out;
}

/** The cook-off: a white core that rolls up and out into a boiling orange ball, and burning fuel thrown clear. */
export function cookoffParticles(x: number, y: number, now: number, seed: number): FlameParticle[] {
  const rnd = rng(seed ^ 0x5eed);
  const out: FlameParticle[] = [];
  for (let i = 0; i < 56; i++) {
    const a = rnd() * Math.PI * 2;
    const sp = 12 + rnd() * 46;
    out.push({
      x: x + Math.cos(a) * 2,
      y: y + Math.sin(a) * 2,
      h: 2 + rnd() * 6,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      vh: 10 + rnd() * 40,
      at: now + rnd() * 90,
      fall: 0,
      life: 650 + rnd() * 750,
      r0: 3 + rnd() * 3,
      r1: 9 + rnd() * 9,
      g: 0,
      lift: 30 + rnd() * 50,
      hot: 0.25 + rnd() * 0.5,
      landed: true,
      seed: (seed + i * 131) >>> 0,
    });
  }
  // Burning fuel flung out in arcs; it lands and keeps burning a moment.
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const sp = 40 + rnd() * 60;
    const T = 0.35 + rnd() * 0.35;
    const g = 180;
    out.push({
      x,
      y,
      h: 6,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      vh: (0.5 * g * T * T - 6) / T,
      at: now + rnd() * 60,
      fall: T * 1000,
      life: T * 1000 + 400 + rnd() * 500,
      r0: 1.2,
      r1: 4 + rnd() * 3,
      g,
      lift: 30,
      hot: 0.2,
      landed: false,
      seed: (seed + 5000 + i * 71) >>> 0,
    });
  }
  return out;
}

/** Advance one particle by `dt` seconds. It keeps its own state; false once it has burned out. */
export function stepFlameParticle(p: FlameParticle, now: number, dt: number): boolean {
  const age = now - p.at;
  if (age < 0) return true;
  if (age >= p.life) return false;
  if (!p.landed) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vh -= p.g * dt;
    p.h += p.vh * dt;
    if (p.h <= 0 || age >= p.fall) {
      // It splashes: the fuel spreads out along the ground and slows, then climbs as a billow.
      p.h = Math.max(0, p.h);
      p.landed = true;
      p.vx *= 0.22;
      p.vy *= 0.22;
      p.vh = 4;
    }
    return true;
  }
  const drag = Math.exp(-3.2 * dt);
  p.vx *= drag;
  p.vy *= drag;
  p.vh += p.lift * dt;
  p.vh *= Math.exp(-0.8 * dt);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.h = Math.max(0, p.h + p.vh * dt);
  return true;
}

/**
 * How a particle looks now: screen radius, heat 0–1 (1 white-hot, 0 smoke-dark),
 * and opacity. Null before birth and after it burns out.
 */
export function flameParticleLook(p: FlameParticle, now: number): { r: number; heat: number; alpha: number } | null {
  const age = now - p.at;
  if (age < 0 || age >= p.life) return null;
  const t = age / p.life;
  const inAir = !p.landed && p.fall > 0 ? Math.min(1, age / p.fall) : 1;
  // Thin at the nozzle; blooms once it is down.
  const bloom = p.landed ? Math.min(1, (age - Math.min(age, p.fall)) / Math.max(1, p.life - p.fall) + 0.45) : 0.04 + inAir ** 1.3 * 0.5;
  const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(Math.max(0, bloom));
  const heat = Math.max(0, Math.min(1, 1 - t * (1.05 - 0.45 * p.hot)));
  const alpha = t < 0.06 ? t / 0.06 : Math.pow(1 - t, 0.85);
  return { r, heat, alpha };
}

/** Where on the ground a burst is laid: the newest glob's landing point. */
export function jetLanding(p: { x: number; y: number; vx: number; vy: number; arc?: number; hang?: number }): { x: number; y: number } {
  const left = Math.max(0, 1 - (p.arc ?? 0)) * (p.hang ?? 0.3);
  return { x: p.x + p.vx * left, y: p.y + p.vy * left };
}

// ---------------------------------------------------------------- burning ground

export interface FireTongue {
  /** Offset inside the patch: unit-disk coords (u across the screen, v into it). */
  u: number;
  v: number;
  /** Base half-width and height, screen px at full heat. */
  w: number;
  h: number;
  /** Lick period, ms, and phase 0–1. */
  period: number;
  phase: number;
  seed: number;
}

/** Tongue layout for one patch. Stable per fire id; more tongues in a bigger patch. */
export function fireTongues(seed: number, radius: number, most = FIRE_TONGUES_MAX): FireTongue[] {
  const rnd = rng(Math.imul(seed, 0x9e3779b9) + 7);
  const n = Math.max(FIRE_TONGUES_MIN, Math.min(most, Math.round(radius / 1.4)));
  const out: FireTongue[] = [];
  for (let i = 0; i < n; i++) {
    // Sunflower spread so the tongues cover the patch without clumping.
    const a = i * 2.39996 + rnd() * 0.5;
    const d = Math.sqrt((i + 0.5) / n) * 0.82;
    const core = 1 - d * 0.45;
    out.push({
      u: Math.cos(a) * d,
      v: Math.sin(a) * d,
      w: (2.1 + rnd() * 1.7) * (0.8 + core * 0.35),
      h: (4.5 + rnd() * 10) * core * (rnd() < 0.25 ? 1.45 : 1),
      period: 260 + rnd() * 300,
      phase: rnd(),
      seed: (seed * 31 + i * 17) >>> 0,
    });
  }
  return out;
}

/** 1 while the patch burns hot, sinking to 0 over the last `dieShare` of its life. */
export function patchHeat(life: number, lifeMax: number, dieShare = 0.3): number {
  if (lifeMax <= 0 || life <= 0) return 0;
  const s = life / lifeMax;
  return s >= dieShare ? 1 : s / dieShare;
}

/** A tongue's shape now: height, half-width, lean (screen px of tip offset), and its shed flamelet. */
export function tonguePose(
  t: FireTongue,
  now: number,
  heat: number,
  wind: number,
): { h: number; w: number; lean: number; lick: { rise: number; r: number } | null } {
  const c = (now / t.period + t.phase) % 1;
  const s = now * 0.001;
  const n1 = Math.sin(s * 9.1 + t.seed * 0.7) * Math.sin(s * 13.7 + t.seed * 0.3);
  const n2 = Math.sin(s * 23.3 + t.seed * 1.3);
  const grow = 0.55 + 0.5 * Math.sin(c * Math.PI);
  const h = t.h * (0.35 + 0.65 * heat) * (grow + 0.18 * n1 + 0.06 * n2);
  const w = t.w * (0.55 + 0.45 * heat) * (1 + 0.12 * n2);
  const lean = (wind + 0.25 * n1) * h * 0.45;
  // Past the peak the tip tears off and rises on its own, shrinking.
  const lick = c > 0.5 ? { rise: (c - 0.5) * 2, r: w * 0.85 * (1 - (c - 0.5) * 2) } : null;
  return { h: Math.max(0.5, h), w: Math.max(0.4, w), lean, lick };
}

/** A spark lifting off a patch: screen offset from the patch centre, and brightness. Null while it waits. */
export function emberPose(seed: number, i: number, now: number, rx: number): { dx: number; dy: number; a: number } | null {
  const rnd = rng((seed * 131 + i * 7919) >>> 0);
  const period = 900 + rnd() * 1300;
  const c = ((now + rnd() * period) % period) / period;
  if (c > 0.85) return null;
  const k = c / 0.85;
  const x0 = (rnd() - 0.5) * rx * 1.4;
  const drift = (rnd() - 0.3) * 10;
  return {
    dx: x0 + drift * k + Math.sin(now * 0.004 + i) * 1.5 * k,
    dy: -(4 + k * (16 + rnd() * 18)),
    a: (1 - k) * (0.6 + rnd() * 0.4),
  };
}

// ---------------------------------------------------------------- drawing

type Sprites = { blobs: HTMLCanvasElement[]; outer: HTMLCanvasElement; inner: HTMLCanvasElement; scorch: HTMLCanvasElement[] };
let cache: Sprites | null = null;

/** Flame colour ramp by heat: smoke-dark red, deep red, orange, yellow, white-yellow. */
const RAMP: [number, number, number][] = [
  [70, 22, 8],
  [178, 42, 10],
  [240, 102, 22],
  [255, 176, 52],
  [255, 238, 170],
];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function teardrop(g: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number): void {
  g.beginPath();
  g.moveTo(cx, base - h);
  g.bezierCurveTo(cx + w * 0.35, base - h * 0.62, cx + w, base - h * 0.36, cx + w * 0.92, base - h * 0.12);
  g.bezierCurveTo(cx + w * 0.8, base + h * 0.04, cx - w * 0.8, base + h * 0.04, cx - w * 0.92, base - h * 0.12);
  g.bezierCurveTo(cx - w, base - h * 0.36, cx - w * 0.35, base - h * 0.62, cx, base - h);
  g.closePath();
}

function sprites(): Sprites {
  if (cache) return cache;
  const blobs = RAMP.map(([r, g, b]) => {
    const [c, x] = canvas(32, 32);
    const grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.6)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 32, 32);
    return c;
  });
  // Tongue sprites are drawn 1 wide x 1 tall around a base at the bottom centre.
  const [outer, og] = canvas(64, 128);
  og.filter = "blur(3px)";
  let grad = og.createLinearGradient(0, 124, 0, 8);
  grad.addColorStop(0, "rgba(255,150,40,0.95)");
  grad.addColorStop(0.35, "rgba(245,96,20,0.9)");
  grad.addColorStop(0.7, "rgba(190,40,10,0.55)");
  grad.addColorStop(1, "rgba(120,20,6,0)");
  og.fillStyle = grad;
  teardrop(og, 32, 120, 26, 112);
  og.fill();
  const [inner, ig] = canvas(64, 128);
  ig.filter = "blur(2px)";
  grad = ig.createLinearGradient(0, 124, 0, 30);
  grad.addColorStop(0, "rgba(255,250,220,1)");
  grad.addColorStop(0.3, "rgba(255,226,120,0.95)");
  grad.addColorStop(0.75, "rgba(255,160,40,0.5)");
  grad.addColorStop(1, "rgba(255,120,30,0)");
  ig.fillStyle = grad;
  teardrop(ig, 32, 118, 15, 84);
  ig.fill();
  // Charred ground: ragged, darkest in the middle, soot fingers at the edge.
  const scorch = [0, 1, 2].map((k) => {
    const [c, x] = canvas(96, 96);
    const rnd = rng(0x5c0 + k * 77);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * 26;
      const r = 8 + rnd() * 16;
      const px = 48 + Math.cos(a) * d;
      const py = 48 + Math.sin(a) * d;
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, "rgba(22,16,12,0.34)");
      gr.addColorStop(0.6, "rgba(34,24,16,0.16)");
      gr.addColorStop(1, "rgba(40,28,18,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 96, 96);
    }
    // A few grey ash flecks.
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * 30;
      x.fillStyle = `rgba(${120 + rnd() * 40},${112 + rnd() * 30},${100 + rnd() * 30},${0.25 + rnd() * 0.3})`;
      x.fillRect(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, 1, 1);
    }
    return c;
  });
  cache = { blobs, outer, inner, scorch };
  return cache;
}

let sootSprites: HTMLCanvasElement[] | null = null;

/**
 * One puff of burning-fuel smoke: sooty black at the heart, brown-grey at the
 * edge. `grey` 0–1 lightens it as a dying patch smoulders.
 */
export function drawSoot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, grey: number): void {
  if (alpha <= 0.01 || r <= 0.3) return;
  if (!sootSprites) {
    sootSprites = [
      [28, 24, 22],
      [92, 86, 78],
    ].map(([cr, cg, cb]) => {
      const [c, x2] = canvas(64, 64);
      const g = x2.createRadialGradient(30, 30, 2, 32, 32, 32);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
      g.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.6)`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      x2.fillStyle = g;
      x2.fillRect(0, 0, 64, 64);
      return c;
    });
  }
  const [black, ash] = sootSprites;
  ctx.globalAlpha = alpha * (1 - grey);
  ctx.drawImage(black!, x - r, y - r * 0.85, r * 2, r * 1.7);
  if (grey > 0.02) {
    ctx.globalAlpha = alpha * grey;
    ctx.drawImage(ash!, x - r, y - r * 0.85, r * 2, r * 1.7);
  }
}

/** One burning-fuel particle at a screen point. Additive: overlapping fuel glows brighter. */
export function drawFlameParticle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, heat: number, alpha: number): void {
  if (alpha <= 0.01 || r <= 0.2) return;
  const { blobs } = sprites();
  const f = heat * (blobs.length - 1);
  const i = Math.min(blobs.length - 2, Math.floor(f));
  const k = f - i;
  // Cooling fuel darkens and loses its light before it turns to smoke.
  const glow = alpha * (0.35 + 0.65 * heat);
  const rr = r * 2;
  ctx.globalAlpha = glow * (1 - k);
  ctx.drawImage(blobs[i]!, x - r, y - r * 0.9, rr, rr * 0.9);
  if (k > 0.02) {
    ctx.globalAlpha = glow * k;
    ctx.drawImage(blobs[i + 1]!, x - r, y - r * 0.9, rr, rr * 0.9);
  }
}

/** Pool of firelight on the ground around a patch. Additive. */
export function drawFireGlow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, heat: number, now: number, seed: number): void {
  if (heat <= 0.01) return;
  const flick = 0.82 + 0.18 * Math.sin(now * 0.017 + seed) * Math.sin(now * 0.029 + seed * 0.3);
  const R = rx * 1.9;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, `rgba(255,140,40,${0.42 * heat * flick})`);
  g.addColorStop(0.45, `rgba(230,80,20,${0.2 * heat * flick})`);
  g.addColorStop(1, "rgba(160,40,10,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The burning fuel itself: a low, rolling bed of flame across the patch that the
 * tongues stand out of. Blobs drift and swell on their own clocks, so the bed
 * seethes instead of pulsing as one. Additive.
 */
export function drawFuelBed(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, heat: number, now: number, seed: number): void {
  if (heat <= 0.01) return;
  const { blobs } = sprites();
  const rnd = rng(Math.imul(seed, 0x2c1b3c6d) + 3);
  const n = Math.max(4, Math.min(14, Math.round(rx / 2)));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 0.8;
    const period = 380 + rnd() * 420;
    const c = (now / period + rnd()) % 1;
    const swell = 0.6 + 0.4 * Math.sin(c * Math.PI * 2);
    const r = rx * (0.28 + rnd() * 0.2) * (0.7 + 0.3 * swell) * (0.5 + 0.5 * heat);
    const bx = x + Math.cos(a) * d * rx * 0.9 + Math.sin(now * 0.002 + i) * 0.6;
    const by = y + Math.sin(a) * d * rx * 0.45 - r * 0.15;
    ctx.globalAlpha = (0.35 + 0.25 * swell) * heat;
    ctx.drawImage(blobs[2]!, bx - r, by - r * 0.55, r * 2, r * 1.1);
    ctx.globalAlpha = (0.25 + 0.3 * swell) * heat;
    ctx.drawImage(blobs[3]!, bx - r * 0.55, by - r * 0.35, r * 1.1, r * 0.6);
  }
  ctx.restore();
}

/**
 * Flames licking up a soldier caught in the fire: a few tongues around his
 * legs and body, climbing to his shoulders. `size` is his sprite height.
 */
export function drawBodyFlames(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, heat: number, now: number, seed: number): void {
  if (heat <= 0.01) return;
  const rnd = rng(seed * 977 + 13);
  for (let i = 0; i < 4; i++) {
    const t: FireTongue = {
      u: 0,
      v: 0,
      w: size * (0.08 + rnd() * 0.05),
      h: size * (0.35 + rnd() * 0.35),
      period: 240 + rnd() * 220,
      phase: rnd(),
      seed: seed * 7 + i,
    };
    const dx = (rnd() - 0.5) * size * 0.4;
    const dy = -size * (0.02 + rnd() * 0.2);
    drawTongue(ctx, x + dx, y + dy, tonguePose(t, now, heat, 0.3), 0.85);
  }
}

/** Charred ground under a patch; `alpha` fades it out after the fire is gone. */
export function drawScorch(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, seed: number, alpha: number): void {
  if (alpha <= 0.01) return;
  const { scorch } = sprites();
  const s = scorch[(seed >>> 0) % scorch.length]!;
  const w = rx * 3.1;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(s, x - w / 2, y - w / 4, w, w / 2);
  ctx.restore();
}

/** One flame tongue standing on a screen point, with the flamelet it is shedding. Additive. */
export function drawTongue(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: ReturnType<typeof tonguePose>,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  const { outer, inner, blobs } = sprites();
  const { h, w, lean } = pose;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  // Skew the sprite so the tip leans with the draft while the base stays put.
  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([1, 0, lean / Math.max(1, h), 1, x, y])));
  ctx.drawImage(outer, -w * 1.25, -h * 1.08, w * 2.5, h * 1.12);
  ctx.globalAlpha = alpha * 0.9;
  ctx.drawImage(inner, -w * 0.72, -h * 0.72, w * 1.44, h * 0.76);
  ctx.restore();
  if (pose.lick && pose.lick.r > 0.25) {
    const k = pose.lick.rise;
    const ly = y - h * (0.85 + k * 0.9);
    const lx = x + lean * (1 + k * 0.6);
    const r = pose.lick.r;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * (1 - k) * 0.8;
    ctx.drawImage(blobs[k < 0.4 ? 3 : 2]!, lx - r, ly - r * 1.3, r * 2, r * 2.6);
    ctx.restore();
  }
}

/** Sparks lifting off a patch. Additive single pixels. */
export function drawEmbers(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, heat: number, now: number, seed: number): void {
  const n = Math.round((2 + rx / 3) * heat);
  if (n <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const e = emberPose(seed, i, now, rx);
    if (!e) continue;
    ctx.globalAlpha = e.a * heat;
    ctx.fillStyle = i % 3 === 0 ? "#ffe9a0" : "#ff9a30";
    ctx.fillRect(x + e.dx, y + e.dy, 1, 1);
  }
  ctx.restore();
}

/** The pilot flame at a live lance tip: a small blue-cored flicker. */
export function drawPilotLight(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number): void {
  const f = 0.7 + 0.3 * Math.sin(now * 0.041 + seed) * Math.sin(now * 0.067 + seed * 0.7);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.55 * f;
  ctx.fillStyle = "#ff9c30";
  ctx.beginPath();
  ctx.ellipse(x, y - 1.1 * f, 0.9, 1.6 * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.8 * f;
  ctx.fillStyle = "#8ab8ff";
  ctx.fillRect(x - 0.5, y - 0.6, 1, 1);
  ctx.restore();
}
