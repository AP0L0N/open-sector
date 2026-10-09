/**
 * A Titan's reactor going up: a small nuclear blast on the ground. Client-only.
 *
 * One timeline drives every part: a white flash over the whole view, a
 * shockwave ring racing out over the ground, a low dust surge behind it, and a
 * fireball that boils up off the ground on a stem and spreads into a mushroom
 * cap, cooling from white through orange to brown smoke. Debris is thrown
 * clear in the first second. A scorched ellipse stays on the ground long after.
 *
 * Everything is drawn in screen space around the ground point `g`, scaled by
 * `rx` / `ry`, the half-axes of the blast radius on screen.
 */

/** The cloud's clock runs this much faster than the flash and the ring: it clears 20% sooner. */
export const NUKE_CLOUD_PACE = 1.25;
/** How long the cloud stays up, ms. */
export const NUKE_FX_MS = 11000 / NUKE_CLOUD_PACE;
/** How long the scorch stays on the ground, ms (the last third fades). */
export const NUKE_SCORCH_MS = 45000;
/** The flash over the whole view, ms. */
export const NUKE_FLASH_MS = 700;
/** The shockwave ring, ms. */
export const NUKE_RING_MS = 1100;

export interface NukePhase {
  /** 0–1: white over the whole view. */
  flash: number;
  /** Shockwave ring radius as a share of the blast radius, and its strength 0–1. */
  ring: number;
  ringAlpha: number;
  /** Dust surge radius as a share of the blast radius, and its opacity. */
  surge: number;
  surgeAlpha: number;
  /** Cap radius and height above the ground, as shares of the blast radius `rx`. */
  capR: number;
  capRise: number;
  /** 1 white-hot … 0 cold smoke. */
  heat: number;
  /** Opacity of the whole cloud. */
  alpha: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

/** Where the blast stands `age` ms after it went off. */
export function nukePhase(age: number): NukePhase {
  const a = Math.max(0, age);
  const f = 1 - clamp01(a / NUKE_FLASH_MS);
  const ringT = clamp01(a / NUKE_RING_MS);
  // Cloud time: rise, cooling, surge, and fade all run on it.
  const c = a * NUKE_CLOUD_PACE;
  const surgeT = clamp01(c / 3200);
  return {
    flash: f * f,
    ring: 1.35 * easeOut(ringT),
    ringAlpha: ringT >= 1 ? 0 : 1 - ringT,
    surge: 0.25 + 0.9 * easeOut(surgeT),
    surgeAlpha: 0.75 * (1 - clamp01((c - 2500) / (11000 - 2500))),
    capR: 0.18 + 0.34 * easeOut(clamp01(c / 3000)) + 0.08 * clamp01((c - 3000) / 7000),
    capRise: 1.05 * easeOut(clamp01(c / 6500)),
    heat: 1 - clamp01(c / 4200),
    alpha: 1 - clamp01((c - 7000) / (11000 - 7000)),
  };
}

/** Scorch opacity `age` ms after the blast. */
export function nukeScorchAlpha(age: number): number {
  const fadeFrom = NUKE_SCORCH_MS * (2 / 3);
  if (age < 0 || age >= NUKE_SCORCH_MS) return 0;
  const grow = clamp01(age / 400);
  return 0.62 * grow * (1 - clamp01((age - fadeFrom) / (NUKE_SCORCH_MS - fadeFrom)));
}

/** Fire colour by heat: white, yellow, orange, red, then dark brown smoke. */
export function nukeColor(heat: number, shade: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [1, [255, 252, 236]],
    [0.82, [255, 222, 120]],
    [0.62, [255, 150, 48]],
    [0.42, [208, 72, 26]],
    [0.22, [112, 56, 36]],
    [0, [84, 74, 68]],
  ];
  let c: [number, number, number] = stops[stops.length - 1]![1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [h0, c0] = stops[i]!;
    const [h1, c1] = stops[i + 1]!;
    if (heat <= h0 && heat >= h1) {
      const u = (h0 - heat) / (h0 - h1);
      c = [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
      break;
    }
  }
  return [Math.round(c[0] * shade), Math.round(c[1] * shade), Math.round(c[2] * shade)];
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = (c: [number, number, number], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

/** One boiling puff of the cloud: lit on top, dark underneath, hotter inside while it burns. */
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, heat: number, alpha: number): void {
  if (r <= 0.5 || alpha <= 0.01) return;
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(nukeColor(Math.min(1, heat + 0.18), 1.08), alpha));
  g.addColorStop(0.55, rgba(nukeColor(heat, 0.95), alpha));
  g.addColorStop(1, rgba(nukeColor(Math.max(0, heat - 0.25), 0.7), 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A soft billow of lifted dust: tan, lit on top. */
function dustPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  if (r <= 0.5 || alpha <= 0.01) return;
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, `rgba(196,176,144,${alpha.toFixed(3)})`);
  g.addColorStop(0.6, `rgba(150,128,100,${(alpha * 0.8).toFixed(3)})`);
  g.addColorStop(1, "rgba(120,100,78,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** White over everything in view for the first instant. */
export function drawNukeFlash(ctx: CanvasRenderingContext2D, age: number): void {
  const p = nukePhase(age);
  if (p.flash <= 0.01) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(255,246,226,${(0.8 * p.flash).toFixed(3)})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** The burned ground left at ground zero. Drawn with the ground decals, under everything standing. */
export function drawNukeScorch(
  ctx: CanvasRenderingContext2D,
  g: { x: number; y: number },
  rx: number,
  ry: number,
  age: number,
  seed: number,
): void {
  const a = nukeScorchAlpha(age);
  if (a <= 0.01) return;
  const rnd = rng(seed ^ 0x51ed);
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.scale(1, ry / rx);
  const r = rx * 0.85;
  const grad = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
  grad.addColorStop(0, `rgba(14,10,8,${a.toFixed(3)})`);
  grad.addColorStop(0.45, `rgba(30,22,16,${(a * 0.85).toFixed(3)})`);
  grad.addColorStop(0.8, `rgba(52,40,30,${(a * 0.4).toFixed(3)})`);
  grad.addColorStop(1, "rgba(60,48,36,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Blast streaks thrown outward from the crater.
  ctx.strokeStyle = `rgba(20,14,10,${(a * 0.55).toFixed(3)})`;
  ctx.lineCap = "round";
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    const r0 = r * (0.35 + rnd() * 0.2);
    const r1 = r * (0.85 + rnd() * 0.35);
    ctx.lineWidth = r * (0.02 + rnd() * 0.03);
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
    ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The blast over the ground at `g` (screen point of ground zero), `age` ms in.
 * `rx` / `ry`: the blast radius on screen, `ry` about half of `rx` on the 2:1 view.
 */
export function drawNuke(
  ctx: CanvasRenderingContext2D,
  g: { x: number; y: number },
  rx: number,
  ry: number,
  age: number,
  seed: number,
): void {
  if (age < 0 || age > NUKE_FX_MS) return;
  const p = nukePhase(age);
  const flat = ry / rx;
  ctx.save();

  // Low dust surge rolling out along the ground behind the shock.
  if (p.surgeAlpha > 0.01) {
    const sr = rx * p.surge;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.scale(1, flat);
    const sg = ctx.createRadialGradient(0, 0, sr * 0.35, 0, 0, sr);
    const dust = nukeColor(Math.max(0, p.heat * 0.35), 1);
    sg.addColorStop(0, rgba([150, 126, 98], p.surgeAlpha * p.alpha * 0.25));
    sg.addColorStop(0.7, rgba([dust[0] * 0.5 + 70, dust[1] * 0.5 + 60, dust[2] * 0.5 + 46], p.surgeAlpha * p.alpha * 0.6));
    sg.addColorStop(1, "rgba(140,118,92,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // The surge's billows, a ring of low puffs at its edge.
    const rnd = rng(seed ^ 0xa1);
    const n = 28;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rnd() * 0.25;
      const d = sr * (0.8 + rnd() * 0.14);
      const r = rx * (0.13 + rnd() * 0.07) * (0.6 + p.surge * 0.4);
      dustPuff(ctx, g.x + Math.cos(ang) * d, g.y + Math.sin(ang) * d * flat - r * 0.35, r, p.surgeAlpha * p.alpha * 0.55);
    }
  }

  // Shockwave: a bright ring racing over the ground, a dust wall riding just behind it.
  if (p.ringAlpha > 0.01) {
    const rr = rx * p.ring;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.scale(1, flat);
    ctx.lineWidth = rx * (0.05 + 0.08 * p.ringAlpha);
    ctx.strokeStyle = `rgba(214,196,168,${(0.55 * p.ringAlpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, rr * 0.94, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = rx * 0.025;
    ctx.strokeStyle = `rgba(255,250,236,${(0.9 * p.ringAlpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Ground glow under the fireball while it burns.
  if (p.heat > 0.05) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.scale(1, flat);
    ctx.globalCompositeOperation = "lighter";
    const gr = rx * (0.5 + 0.4 * (1 - p.heat));
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
    gg.addColorStop(0, `rgba(255,190,90,${(0.75 * p.heat).toFixed(3)})`);
    gg.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const capR = rx * p.capR;
  const capY = g.y - rx * p.capRise;
  const cloudA = p.alpha;

  // The stem: a column of boiling smoke from the ground up into the cap, wider at the foot.
  const stemTop = capY + capR * 0.25;
  if (g.y - stemTop > capR * 0.4) {
    const steps = Math.max(6, Math.ceil((g.y - stemTop) / (rx * 0.06)));
    for (let i = steps; i >= 0; i--) {
      const u = i / steps; // 0 at the cap, 1 at the ground
      const y = stemTop + (g.y - stemTop) * u;
      const w = rx * (0.1 + 0.08 * u * u + 0.02 * Math.sin(age / 260 + i));
      const heat = p.heat * (0.55 + 0.45 * (1 - u)) * 0.9;
      const wob = (rng(seed ^ (i * 7919 + 0xb2))() - 0.5) * w * 0.5;
      puff(ctx, g.x + wob, y, w, heat, cloudA * 0.95);
    }
    // The skirt where the stem meets the dust.
    dustPuff(ctx, g.x - rx * 0.16, g.y - rx * 0.04, rx * 0.17, cloudA * 0.8);
    dustPuff(ctx, g.x + rx * 0.16, g.y - rx * 0.04, rx * 0.17, cloudA * 0.8);
    puff(ctx, g.x, g.y - rx * 0.08, rx * 0.15, p.heat * 0.5, cloudA * 0.9);
  }

  // The cap: a rolling torus of puffs, back half first, with a hotter heart inside.
  const ringN = 16;
  const torus: { x: number; y: number; r: number; depth: number; heat: number }[] = [];
  const spin = age / 2400;
  const rnd = rng(seed ^ 0xc3);
  for (let i = 0; i < ringN; i++) {
    const ang = (i / ringN) * Math.PI * 2 + spin + rnd() * 0.2;
    const r = capR * (0.42 + rnd() * 0.14);
    torus.push({
      x: g.x + Math.cos(ang) * capR * 0.62,
      y: capY + Math.sin(ang) * capR * 0.62 * 0.42 - capR * 0.05,
      r,
      depth: Math.sin(ang),
      heat: p.heat * (0.75 + 0.25 * Math.max(0, -Math.sin(ang))),
    });
  }
  torus.sort((a, b) => a.depth - b.depth);
  const back = torus.filter((t) => t.depth < 0);
  const front = torus.filter((t) => t.depth >= 0);
  for (const t of back) puff(ctx, t.x, t.y, t.r, t.heat * 0.85, cloudA);
  // Heart of the cap and its dome.
  puff(ctx, g.x, capY - capR * 0.12, capR * 0.72, Math.min(1, p.heat * 1.1), cloudA);
  puff(ctx, g.x, capY - capR * 0.45, capR * 0.5, p.heat * 0.9, cloudA);
  for (const t of front) puff(ctx, t.x, t.y, t.r, t.heat, cloudA);
  // Underside of the cap glows while it still burns.
  if (p.heat > 0.1) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const ug = ctx.createRadialGradient(g.x, capY + capR * 0.2, 0, g.x, capY + capR * 0.2, capR * 0.9);
    ug.addColorStop(0, `rgba(255,170,70,${(0.55 * p.heat * cloudA).toFixed(3)})`);
    ug.addColorStop(1, "rgba(255,90,20,0)");
    ctx.fillStyle = ug;
    ctx.beginPath();
    ctx.ellipse(g.x, capY + capR * 0.2, capR * 0.9, capR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Debris thrown clear in the first second and a half, falling back under gravity.
  if (age < 1600) {
    const rnd = rng(seed ^ 0xd4);
    const n = 34;
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const speed = rx * (0.6 + rnd() * 1.1); // px per second, outward on the ground
      const up = rx * (0.8 + rnd() * 1.4); // px per second, upward
      const t = age / 1000;
      const out = speed * t;
      const lift = up * t - rx * 1.6 * t * t;
      if (lift < -2) continue;
      const x = g.x + Math.cos(ang) * out;
      const y = g.y + Math.sin(ang) * out * flat - Math.max(0, lift);
      const hot = 1 - age / 1600;
      ctx.strokeStyle = rgba(nukeColor(0.4 + 0.55 * hot, 1), 0.9 * hot + 0.1);
      ctx.lineWidth = Math.max(1, rx * 0.012);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(ang) * rx * 0.04, y - Math.sin(ang) * rx * 0.04 * flat + rx * 0.02);
      ctx.stroke();
    }
  }

  // The first instant: a white-hot dome on the ground, brighter than anything after.
  if (age < 900) {
    const k = 1 - age / 900;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const br = rx * (0.18 + 0.3 * (1 - k));
    const bg = ctx.createRadialGradient(g.x, g.y - br * 0.4, 0, g.x, g.y - br * 0.4, br);
    bg.addColorStop(0, `rgba(255,255,250,${k.toFixed(3)})`);
    bg.addColorStop(0.5, `rgba(255,236,170,${(0.8 * k).toFixed(3)})`);
    bg.addColorStop(1, "rgba(255,180,80,0)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(g.x, g.y - br * 0.4, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
