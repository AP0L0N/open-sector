/**
 * What a Xenomorph energy round leaves where it lands. On dirt the sim lays a
 * scorch (a `ShellHoleView` with `scorch` set) in place of a crater: the fused
 * core glows as it cools for a few seconds. On water nothing is thrown up in a
 * column: the bolt flashes on the surface, flash-boils a ring of bubbles, and
 * hisses off a plume of steam that drifts up and thins out.
 */

/** Size of the effect relative to a 75mm plasma shell. A rifle bolt stays small. */
export function plasmaScale(caliber: number | undefined): number {
  const c = caliber ?? 8;
  return Math.min(2.2, 0.2 + (0.8 * c) / 75);
}

/** Ms the steam from a hit on water lasts. Heavier rounds boil more water for longer. */
export function plasmaSteamMs(caliber: number | undefined): number {
  return Math.round(650 + 1050 * Math.min(1, plasmaScale(caliber)));
}

/** Ms a fresh scorch's fused core takes to cool to black. */
export const SCORCH_GLOW_MS = 2600;
/** World-pixel scorch radius from which it also smokes like a crater (about a 40mm round). */
export const SCORCH_SMOKE_RADIUS = 8;

function hash(seed: number, k: number): number {
  const r = Math.sin((seed + k * 13.37) * 12.9898) * 43758.5453;
  return r - Math.floor(r);
}

export interface SteamPuff {
  /** Screen offset from the hit, px at a 75mm scale of 1. */
  dx: number;
  dy: number;
  r: number;
  alpha: number;
}

/**
 * The steam puffs at `t` (0–1 over plasmaSteamMs), before scaling. Each puff
 * starts on the surface with a little delay, rises, swells, drifts, and fades.
 */
export function steamPuffs(seed: number, caliber: number | undefined, t: number): SteamPuff[] {
  const n = plasmaScale(caliber) >= 0.5 ? 12 : 5;
  const out: SteamPuff[] = [];
  for (let k = 0; k < n; k++) {
    const delay = hash(seed, k) * 0.25;
    const u = (t - delay) / (1 - delay);
    if (u <= 0 || u >= 1) continue;
    const a = hash(seed, k + 31) * Math.PI * 2;
    const spread = 4 + hash(seed, k + 57) * 10;
    const ease = 1 - (1 - u) * (1 - u);
    out.push({
      dx: Math.cos(a) * spread * (0.4 + ease) + (hash(seed, k + 77) - 0.5) * 8 * u,
      dy: Math.sin(a) * spread * 0.5 * (0.4 + ease) - (14 + 36 * hash(seed, k + 91)) * ease,
      r: 6 + 14 * ease + 5 * hash(seed, k + 13),
      alpha: Math.min(1, u * 6) * (1 - u) ** 1.4 * (0.55 + 0.3 * hash(seed, k + 5)),
    });
  }
  return out;
}

/** Glow of a fresh scorch's core: 1 hot green-white at the strike, cooling through orange to 0. */
export function scorchHeat(ageMs: number): number {
  if (!(ageMs >= 0) || ageMs >= SCORCH_GLOW_MS) return 0;
  return (1 - ageMs / SCORCH_GLOW_MS) ** 1.6;
}

/**
 * A Xenomorph energy round strikes water at screen (x, y). `t` runs 0–1 over
 * plasmaSteamMs. Flash and reflection, a boiling ring, hiss ripples, a few
 * spat droplets, then the steam plume.
 */
export function drawPlasmaSteam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  seed: number,
  caliber: number | undefined,
): void {
  if (t < 0 || t >= 1) return;
  const s = plasmaScale(caliber);
  ctx.save();
  // Flash on the surface and its green reflection, gone in the first fifth.
  const flash = Math.max(0, 1 - t / 0.2);
  if (flash > 0) {
    ctx.globalCompositeOperation = "lighter";
    const fr = (8 + 14 * t) * s * 1.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, fr);
    g.addColorStop(0, `rgba(240, 255, 248, ${0.95 * flash})`);
    g.addColorStop(0.35, `rgba(120, 255, 200, ${0.6 * flash})`);
    g.addColorStop(1, "rgba(60, 220, 170, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, fr * 1.4, fr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  // Hiss ripples: two thin rings out across the surface.
  for (let k = 0; k < 2; k++) {
    const u = t * 1.3 - k * 0.22;
    if (u <= 0 || u >= 1) continue;
    const rr = (5 + 30 * u) * s * 1.3;
    ctx.strokeStyle = `rgba(214, 240, 236, ${0.55 * (1 - u)})`;
    ctx.lineWidth = Math.max(0.6, 1.4 * s * (1 - u));
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Flash-boil: bubbles that swell and pop in a ring over the first half.
  const nb = s >= 0.5 ? 14 : 6;
  for (let k = 0; k < nb; k++) {
    const born = hash(seed, k + 101) * 0.4;
    const u = (t - born) / 0.18;
    if (u <= 0 || u >= 1) continue;
    const a = hash(seed, k + 131) * Math.PI * 2;
    const d = (2 + hash(seed, k + 151) * 9) * s * 1.2;
    const br = (0.8 + 1.8 * hash(seed, k + 171)) * Math.max(0.6, s) * Math.sin(u * Math.PI);
    ctx.strokeStyle = `rgba(232, 250, 246, ${0.8 * (1 - u * 0.5)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5, br, br * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // A few hot droplets spat up and back, still lit green at first.
  const nd = s >= 0.5 ? 8 : 3;
  for (let k = 0; k < nd; k++) {
    const u = t / 0.45;
    if (u >= 1) break;
    const a = hash(seed, k + 201) * Math.PI * 2;
    const reach = (4 + 10 * hash(seed, k + 221)) * s * 1.4;
    const up = (8 + 14 * hash(seed, k + 241)) * s * 1.4;
    const px = x + Math.cos(a) * reach * u;
    const py = y + Math.sin(a) * reach * 0.5 * u - up * 4 * u * (1 - u);
    const hot = Math.max(0, 1 - u * 2);
    ctx.fillStyle = `rgba(${Math.round(200 + 40 * hot)}, ${Math.round(236 + 19 * hot)}, ${Math.round(236 - 20 * hot)}, ${0.85 * (1 - u)})`;
    ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
  }
  // Steam: soft white puffs climbing out of the boil.
  for (const p of steamPuffs(seed, caliber, t)) {
    const px = x + p.dx * s * 1.3;
    const py = y + p.dy * s * 1.3;
    const r = p.r * s * 1.3;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    const tint = Math.max(0, 1 - t * 4);
    g.addColorStop(0, `rgba(${Math.round(236 - 30 * tint)}, 244, ${Math.round(242 - 14 * tint)}, ${0.6 * p.alpha})`);
    g.addColorStop(0.6, `rgba(220, 230, 230, ${0.28 * p.alpha})`);
    g.addColorStop(1, "rgba(210, 220, 222, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The fused core of a fresh scorch, still glowing. `rx` is the scorch's screen
 * half-width; the glow covers the inner part. Additive.
 */
export function drawScorchGlow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ageMs: number, seed: number): void {
  const heat = scorchHeat(ageMs);
  if (heat <= 0.01 || rx <= 0.3) return;
  const flick = 0.85 + 0.15 * Math.sin(ageMs * 0.02 + seed);
  const r = rx * (0.35 + 0.15 * heat);
  // Hot: green-white plasma glass. Cooling: orange embers, then dull red.
  const cr = Math.round(255 * Math.min(1, 0.7 + heat * 0.3));
  const cg = Math.round(110 + 145 * heat);
  const cb = Math.round(40 + 170 * heat * heat);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.85 * heat * flick})`);
  g.addColorStop(0.5, `rgba(${cr}, ${Math.round(cg * 0.6)}, ${Math.round(cb * 0.4)}, ${0.4 * heat * flick})`);
  g.addColorStop(1, "rgba(120, 30, 10, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Stand-in for a scorch while its sprite loads: a dark ragged smudge with a darker core. */
export function drawScorchFallback(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, alpha: number): void {
  if (alpha <= 0.01 || rx <= 0.3) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx * 1.4);
  g.addColorStop(0, "rgba(22, 24, 22, 0.95)");
  g.addColorStop(0.45, "rgba(30, 25, 21, 0.8)");
  g.addColorStop(1, "rgba(40, 30, 22, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.4, rx * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
