/**
 * Xenomorph sea and air close work. Client-only: the Overseer's pulse, a green beam
 * from its belly straight down to the spot it burns, and the Lurker's bite, a
 * snap of jaws and a churn of white water where they close. Nothing here
 * changes the match; the sim's impacts (`downLaser`, `bite`) start each one.
 */
import { ENERGY_BODY, ENERGY_CORE, ENERGY_GLOW } from "./energy-fx.js";

/** How long one pulse's beam shows, ms of game time. The next pulse comes about twice this later. */
export const DOWN_BEAM_MS = 150;
/** How long a bite's snap and churn show, ms of game time. */
export const BITE_FX_MS = 420;
/** Share of BITE_FX_MS the jaws take to close; the water churns on after. */
const JAW_CLOSE = 0.35;

/** Strength of the beam: full at once, gone at DOWN_BEAM_MS. */
export function downBeamAlpha(ageMs: number): number {
  if (ageMs < 0 || ageMs >= DOWN_BEAM_MS) return 0;
  return 1 - ageMs / DOWN_BEAM_MS;
}

/** How far open the jaws are: 1 wide at the first frame, 0 shut by JAW_CLOSE, and they stay shut. */
export function jawGape(ageMs: number): number {
  const u = Math.max(0, ageMs / BITE_FX_MS);
  return Math.max(0, 1 - u / JAW_CLOSE);
}

/** One pulse: glow, body, and core from the belly to the ground, a burning ring where it lands. */
export function drawDownBeam(
  ctx: CanvasRenderingContext2D,
  top: { x: number; y: number },
  ground: { x: number; y: number },
  ageMs: number,
  zoom: number,
): void {
  const a = downBeamAlpha(ageMs);
  if (a <= 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.globalAlpha = a;
  for (const [style, w] of [
    [ENERGY_GLOW, 7],
    [ENERGY_BODY, 3],
    [ENERGY_CORE, 1.2],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w * zoom;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(ground.x, ground.y);
    ctx.stroke();
  }
  const r = (4 + 6 * (1 - a)) * zoom;
  ctx.strokeStyle = ENERGY_BODY;
  ctx.lineWidth = 1.5 * zoom;
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ENERGY_CORE;
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, 2.2 * zoom, 1.1 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A bite at `at`, the beast lunging along `dir` (screen space). Two rows of fangs
 * close across the line of the lunge, then a ring of white water spreads and a
 * few drops fly. `seed` keeps the drops of one bite the same each frame.
 */
export function drawBite(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  dir: { x: number; y: number },
  ageMs: number,
  size: number,
  seed: number,
): void {
  if (ageMs < 0 || ageMs >= BITE_FX_MS) return;
  const u = ageMs / BITE_FX_MS;
  const fade = 1 - u * u;
  const len = Math.hypot(dir.x, dir.y) || 1;
  const fx = dir.x / len;
  const fy = dir.y / len;
  const px = -fy;
  const py = fx;
  const gape = jawGape(ageMs);
  const reach = size * 0.32;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Upper and lower jaw: an arc of fangs either side of the lunge, swinging shut onto the spot.
  for (const side of [1, -1]) {
    const open = side * (0.12 + gape * 0.5) * reach;
    ctx.strokeStyle = `rgba(232, 240, 222, ${0.95 * fade})`;
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const t = k / 4 - 0.5;
      const bx = at.x - fx * reach * (0.5 - Math.abs(t) * 0.6) + px * (open + t * reach * 0.15);
      const by = at.y - fy * reach * (0.5 - Math.abs(t) * 0.6) + py * (open + t * reach * 0.15);
      // Each fang points across the bite, toward the other jaw.
      const tx = bx - px * side * reach * 0.18;
      const ty = by - py * side * reach * 0.18;
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
  }
  // The green glow of its throat while the jaws are open.
  if (gape > 0) {
    ctx.fillStyle = `rgba(95, 232, 168, ${0.45 * gape})`;
    ctx.beginPath();
    ctx.ellipse(at.x - fx * reach * 0.3, at.y - fy * reach * 0.3, reach * 0.35 * gape + 1, reach * 0.18 * gape + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // White water: a spreading ring and a handful of drops once the jaws are shut.
  const ring = size * (0.12 + 0.45 * u);
  ctx.strokeStyle = `rgba(214, 236, 240, ${0.75 * fade})`;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, ring, ring * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (u > JAW_CLOSE * 0.6) {
    let s = seed >>> 0;
    const rnd = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const v = (u - JAW_CLOSE * 0.6) / (1 - JAW_CLOSE * 0.6);
    ctx.fillStyle = `rgba(226, 242, 246, ${0.85 * fade})`;
    for (let k = 0; k < 7; k++) {
      const ang = rnd() * Math.PI * 2;
      const sp = size * (0.15 + rnd() * 0.3);
      const dx = Math.cos(ang) * sp * v;
      const dy = Math.sin(ang) * sp * v * 0.5 - size * 0.5 * v * (1 - v);
      ctx.beginPath();
      ctx.arc(at.x + dx, at.y + dy, Math.max(0.8, size * 0.025), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
